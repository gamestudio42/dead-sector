import { describe, expect, it } from 'vitest';
import { dist } from '../src';
import { addZombie, field, keepOnly, setCell, survivor, testSim } from './helpers';

describe('zombie perception (anti-telepathy)', () => {
  it('zombie behind an opaque wall does not detect a nearby still survivor', () => {
    const rows = field(30, 20);
    for (let y = 1; y <= 18; y++) setCell(rows, 12, y, '#');
    const sim = testSim({ rows, alfaSpawn: { x: 10.5, y: 10.5 } });
    keepOnly(sim, ['alfa-leader']);
    const s = survivor(sim, 'alfa-leader');
    s.position = { x: 10.5, y: 10.5 };
    const z = addZombie(sim, 13.5, 10.5, { facing: Math.PI });
    sim.run(40);
    expect(z.ai.state === 'idle' || z.ai.state === 'wander').toBe(true);
    expect(z.ai.targetId).toBeNull();
  });

  it('zombie never chases live target position after losing all perception', () => {
    const rows = field(40, 22);
    for (let y = 1; y <= 16; y++) setCell(rows, 20, y, '#'); // wall with a gap at the bottom
    const sim = testSim({ rows, alfaSpawn: { x: 10.5, y: 8.5 } });
    keepOnly(sim, ['alfa-leader']);
    sim.state.squads[0]!.firePolicy = 'holdFire';
    const s = survivor(sim, 'alfa-leader');
    s.position = { x: 10.5, y: 8.5 };
    const z = addZombie(sim, 15.5, 8.5, { facing: Math.PI });
    sim.run(6);
    expect(z.ai.state === 'pursue' || z.ai.state === 'attack').toBe(true);
    const lastSeen = { ...z.ai.lastKnownPos! };
    // the survivor vanishes behind the wall (silently): no sight, no sound
    s.position = { x: 32.5, y: 6.5 };
    s.path = [];
    for (let i = 0; i < 200; i++) {
      sim.step();
      if (z.ai.goal) expect(dist(z.ai.goal, s.position)).toBeGreaterThan(8);
      expect(z.ai.targetId).toBeNull();
    }
    expect(['search', 'wander', 'idle']).toContain(z.ai.state);
    expect(dist(z.position, lastSeen)).toBeLessThan(6);
    expect(dist(z.position, s.position)).toBeGreaterThan(12);
  });

  it('zombie that sees a survivor pursues and attacks within reach', () => {
    const sim = testSim({ rows: field(30, 20), alfaSpawn: { x: 10.5, y: 10.5 } });
    keepOnly(sim, ['alfa-leader']);
    sim.state.squads[0]!.firePolicy = 'holdFire';
    const z = addZombie(sim, 16.5, 10.5, { facing: Math.PI });
    z.health = 100000;
    const s = survivor(sim, 'alfa-leader');
    s.position = { x: 10.5, y: 10.5 };
    let injured = false;
    for (let i = 0; i < 200 && !injured; i++)
      for (const e of sim.step())
        if (e.type === 'ACTOR_INJURED' && e.payload['actorId'] === s.id) injured = true;
    expect(['pursue', 'attack']).toContain(z.ai.state);
    expect(injured).toBe(true);
  });
});
