import { describe, expect, it } from 'vitest';
import {
  buildDebrief,
  COMBAT_PLAN,
  createPlanRunner,
  GameSimulation,
  runPlan,
  STEALTH_PLAN,
  tickPlan,
} from '../src';
import { field, keepOnly, survivor, testSim } from './helpers';

function extractionScenario() {
  const sim = testSim({
    rows: field(30, 20),
    alfaSpawn: { x: 5.5, y: 15.5 },
    civilian: { x: 25.5, y: 4.5 },
    beacon: { x: 4.5, y: 16.5 },
    extractionZone: { x0: 1, y0: 12, x1: 10, y1: 18 },
  });
  sim.state.mission.medicineCollected = true;
  sim.state.objectives.find((o) => o.id === 'collectMedicine')!.status = 'completed';
  return sim;
}

describe('mission flow', () => {
  it('mission success requires rescuing and extracting civilian', () => {
    const sim = extractionScenario();
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'beacon' },
    });
    const started = sim.run(60).some((e) => e.type === 'EXTRACTION_STARTED');
    expect(started).toBe(true);
    sim.run(260);
    // hold timer complete but the civilian was never rescued: no victory
    expect(sim.state.mission.extractionReady).toBe(true);
    expect(sim.state.mission.status).toBe('running');
    sim.enqueue({ type: 'confirmExtraction', payload: {} });
    sim.step();
    expect(sim.state.mission.status).toBe('partial');
    expect(buildDebrief(sim.state).civilianExtracted).toBe(false);

    const ok = extractionScenario();
    const civ = survivor(ok, 'civilian-marta');
    civ.rescued = true;
    ok.state.mission.civilianRescued = true;
    civ.position = { x: 6.5, y: 15.5 };
    ok.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'beacon' },
    });
    ok.run(400);
    expect(ok.state.mission.status).toBe('success');
    expect(civ.extracted).toBe(true);
  });

  it('extraction requires holding the zone for the full timer', () => {
    const sim = extractionScenario();
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'beacon' },
    });
    sim.run(60);
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'sprint', targetPosition: { x: 25.5, y: 15.5 } },
    });
    sim.run(150);
    expect(sim.state.mission.extractionHoldTicks).toBe(0);
    expect(sim.state.mission.extractionReady).toBe(false);
  });

  it('beacon cannot be activated before the medicine is recovered', () => {
    const sim = extractionScenario();
    sim.state.mission.medicineCollected = false;
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'beacon' },
    });
    const blocked = sim.step().find((e) => e.type === 'ORDER_BLOCKED');
    expect(blocked?.payload['reason']).toBe('requiresMedicine');
  });

  it('defeat ends exactly once and blocks later orders', () => {
    const sim = testSim({ rows: field(20, 12) });
    keepOnly(sim, []);
    let ended = 0;
    for (let i = 0; i < 5; i++) for (const e of sim.step()) if (e.type === 'MISSION_ENDED') ended++;
    expect(ended).toBe(1);
    expect(sim.state.mission.status).toBe('failed');
    expect(sim.state.mission.endReason).toBe('allDead');
    const tick = sim.tick;
    sim.enqueue({ type: 'issueOrder', squadId: 'alfa', payload: { type: 'hold' } });
    const events = sim.step();
    expect(
      events.some((e) => e.type === 'ORDER_REJECTED' && e.payload['reason'] === 'missionEnded'),
    ).toBe(true);
    expect(sim.tick).toBe(tick);
  });

  it('civilian death fails the mission', () => {
    const sim = testSim({ rows: field(20, 12) });
    const civ = survivor(sim, 'civilian-marta');
    civ.alive = false;
    sim.step();
    expect(sim.state.mission.status).toBe('failed');
    expect(sim.state.mission.endReason).toBe('civilianDied');
  });

  it('time limit fails the mission', () => {
    const sim = testSim({ rows: field(20, 12) });
    sim.state.mission.timeLimitTicks = 30;
    sim.run(100);
    expect(sim.state.mission.endReason).toBe('timeLimit');
  });
});

describe('A Última Farmácia acceptance (canonical seed)', () => {
  it('is completable by the stealth plan: no shot until the radio is on, then hold the zone', () => {
    const sim = GameSimulation.create();
    const runner = createPlanRunner();
    let shotsBeforeRadio = 0;
    while (!sim.ended && sim.tick < 9000) {
      tickPlan(sim, STEALTH_PLAN, runner);
      for (const e of sim.step())
        if (e.type === 'SHOT_FIRED' && !sim.state.mission.extractionActive) shotsBeforeRadio += 1;
    }
    const d = buildDebrief(sim.state);
    expect(d.outcome).toBe('success');
    expect(d.civilianExtracted).toBe(true);
    expect(d.medicineRecovered).toBe(true);
    // every objective is reached undetected; the radio is meant to draw infected to the hold
    expect(shotsBeforeRadio).toBe(0);
    expect(d.shotsFired).toBeLessThan(25);
    expect(d.reinforcements).toBeLessThan(4);
  });

  it('is completable by the combat plan down the avenue, spending ammo and drawing reinforcements', () => {
    const sim = GameSimulation.create();
    runPlan(sim, COMBAT_PLAN);
    const d = buildDebrief(sim.state);
    expect(d.outcome).toBe('success');
    expect(d.ammoUsed).toBeGreaterThan(50);
    expect(d.reinforcements).toBeGreaterThan(0);
  });
});
