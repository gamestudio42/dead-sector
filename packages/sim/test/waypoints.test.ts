import { describe, expect, it } from 'vitest';
import {
  deserializeState,
  GameSimulation,
  MAX_WAYPOINTS,
  SCHEMA_VERSION,
  serializeState,
  type SimEvent,
} from '../src';
import { field, setCell, survivor, testSim } from './helpers';

const move = (x: number, y: number, queue = false) => ({
  type: 'issueOrder' as const,
  squadId: 'alfa',
  payload: { type: 'move' as const, targetPosition: { x, y }, queue },
});

describe('queued waypoints (Shift-click)', () => {
  it('runs queued moves in order after the current one completes', () => {
    const sim = testSim({ rows: field(40, 20), alfaSpawn: { x: 3.5, y: 3.5 } });
    sim.enqueue(move(15.5, 3.5));
    sim.step();
    sim.enqueue(move(15.5, 15.5, true));
    sim.enqueue(move(30.5, 15.5, true));
    const events: SimEvent[] = sim.step();
    expect(events.filter((e) => e.type === 'ORDER_QUEUED')).toHaveLength(2);
    expect(sim.state.squads[0]!.waypoints).toHaveLength(2);
    // still heading to the first point
    expect(sim.state.squads[0]!.order!.targetPosition).toEqual({ x: 15.5, y: 3.5 });

    const issued: { x: number; y: number; fromQueue: boolean }[] = [];
    for (let i = 0; i < 1500; i++)
      for (const e of sim.step())
        if (e.type === 'ORDER_ISSUED')
          issued.push({
            x: e.payload['x'] as number,
            y: e.payload['y'] as number,
            fromQueue: !!e.payload['fromQueue'],
          });
    expect(issued.map((i) => [i.x, i.y])).toEqual([
      [15.5, 15.5],
      [30.5, 15.5],
    ]);
    expect(issued.every((i) => i.fromQueue)).toBe(true);
    expect(sim.state.squads[0]!.order!.status).toBe('completed');
    expect(Math.abs(survivor(sim, 'alfa-leader').position.x - 30.5)).toBeLessThan(2);
  });

  it('a normal order clears the queue', () => {
    const sim = testSim({ rows: field(40, 20), alfaSpawn: { x: 3.5, y: 3.5 } });
    sim.enqueue(move(30.5, 3.5));
    sim.step();
    sim.enqueue(move(30.5, 15.5, true));
    sim.step();
    expect(sim.state.squads[0]!.waypoints).toHaveLength(1);
    sim.enqueue(move(5.5, 15.5));
    sim.step();
    expect(sim.state.squads[0]!.waypoints).toHaveLength(0);
  });

  it('Shift with no active order just issues it', () => {
    const sim = testSim({ rows: field(40, 20), alfaSpawn: { x: 3.5, y: 3.5 } });
    sim.enqueue(move(10.5, 3.5, true));
    const events = sim.step();
    expect(events.some((e) => e.type === 'ORDER_ISSUED')).toBe(true);
    expect(sim.state.squads[0]!.order!.status).toBe('executing');
  });

  it('a blocked order drops the rest of the plan', () => {
    const rows = field(40, 20);
    for (let y = 1; y <= 18; y++) setCell(rows, 25, y, '#');
    const sim = testSim({ rows, alfaSpawn: { x: 3.5, y: 3.5 } });
    sim.enqueue(move(10.5, 3.5));
    sim.step();
    sim.enqueue(move(35.5, 10.5, true)); // behind the wall: blocked when it starts
    sim.enqueue(move(10.5, 15.5, true));
    sim.step();
    sim.run(400);
    expect(sim.state.squads[0]!.order!.status).toBe('blocked');
    expect(sim.state.squads[0]!.waypoints).toHaveLength(0);
  });

  it('queue is capped', () => {
    const sim = testSim({ rows: field(40, 20), alfaSpawn: { x: 3.5, y: 3.5 } });
    sim.enqueue(move(35.5, 3.5));
    sim.step();
    for (let i = 0; i < MAX_WAYPOINTS + 2; i++) sim.enqueue(move(5.5 + i, 15.5, true));
    const events = sim.step();
    expect(sim.state.squads[0]!.waypoints).toHaveLength(MAX_WAYPOINTS);
    expect(
      events.filter((e) => e.type === 'ORDER_REJECTED' && e.payload['reason'] === 'queueFull'),
    ).toHaveLength(2);
  });

  it('waypoints survive save/load and continue identically', () => {
    const a = testSim({ rows: field(40, 20), alfaSpawn: { x: 3.5, y: 3.5 } });
    a.enqueue(move(15.5, 3.5));
    a.step();
    a.enqueue(move(15.5, 15.5, true));
    a.run(5);
    const saved = serializeState(a.state);
    const b = new GameSimulation(a.content, deserializeState(saved));
    a.run(400);
    b.run(400);
    expect(serializeState(b.state)).toBe(serializeState(a.state));
  });

  it('v1 saves migrate with an empty queue', () => {
    const a = testSim({ rows: field(20, 10) });
    const raw = JSON.parse(serializeState(a.state));
    raw.state.schemaVersion = 1;
    for (const sq of raw.state.squads) delete sq.waypoints;
    const restored = deserializeState(JSON.stringify(raw));
    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(
      restored.squads.every((s) => Array.isArray(s.waypoints) && s.waypoints.length === 0),
    ).toBe(true);
  });
});
