import { describe, expect, it } from 'vitest';
import { COMBAT_PLAN, createPlanRunner, GameSimulation, tickPlan } from '../src';

describe('performance (measurement, lenient gate)', () => {
  it('8 survivors and the full horde stay within the tick budget', () => {
    const sim = GameSimulation.create();
    const runner = createPlanRunner();
    const times: number[] = [];
    let maxAlive = 0;
    while (!sim.ended && sim.tick < 4000) {
      tickPlan(sim, COMBAT_PLAN, runner);
      const t0 = performance.now();
      sim.step();
      times.push(performance.now() - t0);
      maxAlive = Math.max(maxAlive, sim.state.zombies.filter((z) => z.alive).length);
    }
    times.sort((a, b) => a - b);
    const p = (q: number) => times[Math.floor(times.length * q)] ?? 0;
    console.log(
      `ticks=${times.length} p50=${p(0.5).toFixed(2)}ms p95=${p(0.95).toFixed(2)}ms max=${p(0.999).toFixed(2)}ms maxAliveZombies=${maxAlive}`,
    );
    // spec target is p95 < 10 ms on a reference CI machine; keep a lenient guard against regressions
    expect(p(0.95)).toBeLessThan(25);
  });
});
