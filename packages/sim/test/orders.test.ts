import { describe, expect, it } from 'vitest';
import { addZombie, field, setCell, survivor, testSim } from './helpers';

describe('orders', () => {
  it('a new order replaces the current one', () => {
    const sim = testSim({ rows: field(40, 12), alfaSpawn: { x: 3.5, y: 5.5 } });
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'move', targetPosition: { x: 35.5, y: 5.5 } },
    });
    sim.step();
    const first = sim.state.squads[0]!.order!;
    expect(first.status).toBe('executing');
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'sneak', targetPosition: { x: 10.5, y: 8.5 } },
    });
    sim.step();
    expect(first.status).toBe('cancelled');
    expect(sim.state.squads[0]!.order!.type).toBe('sneak');
    expect(sim.state.squads[0]!.order!.status).toBe('executing');
    sim.run(200);
    expect(sim.state.squads[0]!.order!.status).toBe('completed');
    expect(Math.abs(survivor(sim, 'alfa-leader').position.x - 10.5)).toBeLessThan(1.5);
  });

  it('unreachable destination emits ORDER_BLOCKED', () => {
    const rows = field(30, 12);
    for (let y = 1; y <= 10; y++) setCell(rows, 15, y, '#');
    const sim = testSim({ rows, alfaSpawn: { x: 3.5, y: 5.5 } });
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'move', targetPosition: { x: 25.5, y: 5.5 } },
    });
    const events = sim.step();
    const blocked = events.find((e) => e.type === 'ORDER_BLOCKED');
    expect(blocked?.payload['reason']).toBe('noPath');
    expect(sim.state.squads[0]!.order!.status).toBe('blocked');
  });

  it('movement modes trade speed for noise', () => {
    const dist = (type: 'sneak' | 'move' | 'sprint') => {
      const sim = testSim({ rows: field(80, 12), alfaSpawn: { x: 3.5, y: 5.5 } });
      sim.enqueue({
        type: 'issueOrder',
        squadId: 'alfa',
        payload: { type, targetPosition: { x: 75.5, y: 5.5 } },
      });
      let noise = 0;
      for (let i = 0; i < 100; i++)
        for (const e of sim.step())
          if (e.type === 'NOISE_EMITTED' && e.payload['category'] === 'footstep')
            noise = Math.max(noise, e.payload['intensity'] as number);
      return {
        x: survivor(sim, 'alfa-leader').position.x,
        noise,
        stamina: survivor(sim, 'alfa-leader').stamina,
      };
    };
    const sneak = dist('sneak');
    const move = dist('move');
    const sprint = dist('sprint');
    expect(sneak.x).toBeLessThan(move.x);
    expect(move.x).toBeLessThan(sprint.x);
    expect(sneak.noise).toBeLessThan(move.noise);
    expect(move.noise).toBeLessThan(sprint.noise);
    expect(sprint.stamina).toBeLessThan(move.stamina);
  });

  it('leader death transfers leadership by leadership score', () => {
    const sim = testSim({ rows: field(20, 12), alfaSpawn: { x: 5.5, y: 5.5 } });
    const leader = survivor(sim, 'alfa-leader');
    leader.health = 1;
    sim.state.zombies.length = 0;
    // inflict damage through the normal pipeline: a zombie adjacent to the leader
    const z = addZombie(sim, leader.position.x + 0.9, leader.position.y, { facing: Math.PI });
    z.health = 10000;
    let changed: Record<string, unknown> | null = null;
    for (let i = 0; i < 300 && !changed; i++) {
      const e = sim.step().find((ev) => ev.type === 'LEADER_CHANGED');
      if (e) changed = e.payload;
    }
    expect(changed).not.toBeNull();
    expect(sim.state.squads[0]!.leaderId).toBe('alfa-medic'); // highest leadership among survivors (35)
    expect(survivor(sim, 'alfa-medic').isLeader).toBe(true);
  });
});
