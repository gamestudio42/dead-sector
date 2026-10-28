import { describe, expect, it } from 'vitest';
import { emitNoise, propagateNoise } from '../src';
import { addZombie, field, keepOnly, setCell, testSim } from './helpers';

function room(doorOpen: boolean) {
  const rows = field(30, 15);
  // closed room x 3..11, y 3..11 with a door on the east wall
  for (let x = 3; x <= 11; x++) {
    setCell(rows, x, 3, '#');
    setCell(rows, x, 11, '#');
  }
  for (let y = 3; y <= 11; y++) {
    setCell(rows, 3, y, '#');
    setCell(rows, 11, y, '#');
  }
  setCell(rows, 11, 7, doorOpen ? 'O' : 'D');
  return testSim({ rows, alfaSpawn: { x: 25.5, y: 2.5 } });
}

describe('noise propagation', () => {
  it('closed door attenuates sound more than open door', () => {
    const open = room(true);
    const closed = room(false);
    const src = { x: 7.5, y: 7.5 };
    const fOpen = propagateNoise(open.world, open.state, src, 70);
    const fClosed = propagateNoise(closed.world, closed.state, src, 70);
    const outside = 7 * 30 + 16; // (16,7)
    expect(fOpen[outside]).toBeGreaterThan(fClosed[outside] as number);
    expect(fOpen[outside]! - fClosed[outside]!).toBeGreaterThan(10);
  });

  it('wall reduces intensity versus open field', () => {
    const rows = field(30, 15);
    for (let y = 1; y <= 13; y++) setCell(rows, 15, y, '#');
    const walled = testSim({ rows });
    const openSim = testSim({ rows: field(30, 15) });
    const a = propagateNoise(walled.world, walled.state, { x: 10.5, y: 7.5 }, 60);
    const b = propagateNoise(openSim.world, openSim.state, { x: 10.5, y: 7.5 }, 60);
    expect(a[7 * 30 + 20]).toBeLessThan(b[7 * 30 + 20] as number);
  });

  it('same inputs generate the same acoustic grid', () => {
    const s1 = room(false);
    const s2 = room(false);
    expect(Array.from(propagateNoise(s1.world, s1.state, { x: 7.5, y: 7.5 }, 85))).toEqual(
      Array.from(propagateNoise(s2.world, s2.state, { x: 7.5, y: 7.5 }, 85)),
    );
  });

  it('zombie out of sound radius does not investigate; zombie inside does', () => {
    const sim = testSim({ rows: field(90, 12), alfaSpawn: { x: 2.5, y: 2.5 } });
    keepOnly(sim, ['alfa-leader']);
    const near = addZombie(sim, 30.5, 6.5, { facing: 0 });
    const far = addZombie(sim, 80.5, 6.5, { facing: 0 });
    emitNoise(sim.state, { x: 10.5, y: 6.5 }, 70, 'shot');
    sim.run(12);
    expect(near.ai.state).toBe('investigate');
    expect(far.ai.state === 'idle' || far.ai.state === 'wander').toBe(true);
    expect(far.ai.goal === null || Math.abs(far.ai.goal.x - 10.5) > 1).toBe(true);
  });

  it('sneaking attracts fewer infected than sprinting', () => {
    const run = (type: 'sneak' | 'sprint') => {
      const sim = testSim({ rows: field(60, 20), alfaSpawn: { x: 5.5, y: 10.5 } });
      sim.state.squads[0]!.firePolicy = 'holdFire';
      // a line of zombies facing away, 4 m from the route
      for (let x = 10; x <= 50; x += 4) addZombie(sim, x + 0.5, 15.5, { facing: Math.PI / 2 });
      sim.enqueue({
        type: 'issueOrder',
        squadId: 'alfa',
        payload: { type, targetPosition: { x: 54.5, y: 10.5 } },
      });
      const alerted = new Set<string>();
      for (let i = 0; i < 700; i++) {
        for (const e of sim.step())
          if (e.type === 'ZOMBIE_ALERTED' && e.payload['cause'] === 'sound')
            alerted.add(e.payload['zombieId'] as string);
      }
      return alerted.size;
    };
    const sneak = run('sneak');
    const sprint = run('sprint');
    expect(sprint).toBeGreaterThan(sneak);
  });
});
