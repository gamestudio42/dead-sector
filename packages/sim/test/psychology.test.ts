import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import { stressRatePerSecond, updatePanicState } from '../src';
import { field, keepOnly, survivor, testSim } from './helpers';

const rules = loadContent().rules.stress;
const base = {
  zombiesWithin6m: 0,
  surrounded: false,
  isolated: false,
  inSafeArea: false,
  leaderLeadership: null,
  courage: 50,
};

describe('psychology', () => {
  it('multiple zombies raise stress and a nearby leader reduces it', () => {
    const one = stressRatePerSecond(rules, { ...base, zombiesWithin6m: 1 });
    const five = stressRatePerSecond(rules, { ...base, zombiesWithin6m: 5 });
    expect(five).toBeGreaterThan(one);
    const led = stressRatePerSecond(rules, { ...base, zombiesWithin6m: 5, leaderLeadership: 80 });
    expect(led).toBeLessThan(five);
    expect(stressRatePerSecond(rules, { ...base, zombiesWithin6m: 30 })).toBe(
      stressRatePerSecond(rules, { ...base, zombiesWithin6m: 8 }),
    );
  });

  it('panic state enters/exits with hysteresis', () => {
    const sim = testSim({ rows: field(10, 10) });
    const s = survivor(sim, 'alfa-leader');
    const st = sim.state;
    s.stress = 74.9;
    updatePanicState(st, s, rules);
    expect(s.panicked).toBe(false);
    s.stress = 75;
    updatePanicState(st, s, rules);
    expect(s.panicked).toBe(true);
    const entered = st.tick;
    // below the entry threshold but above the exit threshold: still panicking
    s.stress = 60;
    st.tick = entered + 100;
    updatePanicState(st, s, rules);
    expect(s.panicked).toBe(true);
    // below exit threshold but too soon after entering: still panicking
    st.tick = entered;
    s.panicSinceTick = entered;
    s.stress = 40;
    st.tick = entered + 39;
    updatePanicState(st, s, rules);
    expect(s.panicked).toBe(true);
    st.tick = entered + 40;
    updatePanicState(st, s, rules);
    expect(s.panicked).toBe(false);
    expect(st.events.filter((e) => e.type === 'SURVIVOR_PANICKED')).toHaveLength(1);
    expect(st.events.filter((e) => e.type === 'SURVIVOR_RALLIED')).toHaveLength(1);
  });

  it('stress is clamped to 0..100 and impulses apply exactly once', () => {
    const sim = testSim({ rows: field(10, 10) });
    keepOnly(sim, ['alfa-leader']);
    const s = survivor(sim, 'alfa-leader');
    s.pendingImpulses.push({ id: 'big', amount: 500 });
    sim.step();
    expect(s.stress).toBe(100);
    s.stress = 10;
    s.pendingImpulses.push({ id: 'neg', amount: -500 });
    sim.step();
    expect(s.stress).toBe(0);
    s.stress = 20;
    s.pendingImpulses.push({ id: 'once', amount: 10 });
    sim.step();
    const after = s.stress;
    sim.step();
    expect(after).toBeGreaterThan(28);
    expect(s.stress).toBeLessThanOrEqual(after);
  });

  it('panic interrupts the current order and the survivor rejoins after rallying', () => {
    const sim = testSim({ rows: field(40, 12), alfaSpawn: { x: 3.5, y: 5.5 } });
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'move', targetPosition: { x: 35.5, y: 5.5 } },
    });
    sim.run(5);
    const s = survivor(sim, 'alfa-medic');
    s.pendingImpulses.push({ id: 'shock', amount: 90 });
    const events = sim.run(3);
    expect(
      events.some((e) => e.type === 'SURVIVOR_PANICKED' && e.payload['survivorId'] === s.id),
    ).toBe(true);
    expect(s.activity === 'frozen' || s.activity === 'fleeing').toBe(true);
    let rallied = false;
    for (let i = 0; i < 600 && !rallied; i++)
      rallied = sim.step().some((e) => e.type === 'SURVIVOR_RALLIED');
    expect(rallied).toBe(true);
    sim.run(400);
    expect(s.position.x).toBeGreaterThan(30);
  });
});
