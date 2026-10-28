import { describe, expect, it } from 'vitest';
import { blocksMovement, findPath, hasLineOfSight } from '../src';
import { field, setCell, testSim } from './helpers';

function walled(): string[] {
  const rows = field(20, 12);
  for (let y = 1; y <= 9; y++) setCell(rows, 10, y, '#'); // wall with a gap at y=10
  return rows;
}

describe('grid, pathfinding and LOS', () => {
  it('wall blocks path and line of sight', () => {
    const sim = testSim({ rows: walled() });
    const a = { x: 5.5, y: 5.5 };
    const b = { x: 15.5, y: 5.5 };
    expect(hasLineOfSight(sim.world, sim.state, a, b)).toBe(false);
    const path = findPath(sim.world, sim.state, a, b, { agent: 'survivor', smooth: false });
    expect(path).not.toBeNull();
    // the only route goes around the wall through the gap at y=10
    expect(path!.some((p) => Math.floor(p.y) === 10)).toBe(true);
    for (const p of path!)
      expect(blocksMovement(sim.world, sim.state, Math.floor(p.x), Math.floor(p.y))).toBe(false);
  });

  it('unreachable destination returns null without hanging', () => {
    const rows = field(20, 12);
    for (let y = 1; y <= 10; y++) setCell(rows, 10, y, '#');
    const sim = testSim({ rows });
    const t0 = Date.now();
    expect(
      findPath(
        sim.world,
        sim.state,
        { x: 5.5, y: 5.5 },
        { x: 15.5, y: 5.5 },
        { agent: 'survivor' },
      ),
    ).toBeNull();
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('window allows sight but not passage', () => {
    const rows = field(20, 12);
    for (let y = 1; y <= 10; y++) setCell(rows, 10, y, '#');
    setCell(rows, 10, 5, 'W');
    const sim = testSim({ rows });
    expect(hasLineOfSight(sim.world, sim.state, { x: 5.5, y: 5.5 }, { x: 15.5, y: 5.5 })).toBe(
      true,
    );
    expect(
      findPath(
        sim.world,
        sim.state,
        { x: 5.5, y: 5.5 },
        { x: 15.5, y: 5.5 },
        { agent: 'survivor' },
      ),
    ).toBeNull();
  });

  it('door toggles visibility and passability with its state', () => {
    const rows = field(20, 12);
    for (let y = 1; y <= 10; y++) setCell(rows, 10, y, '#');
    setCell(rows, 10, 5, 'D');
    const sim = testSim({ rows });
    const door = sim.state.doors.find((d) => d.id === 'door-10-5')!;
    const a = { x: 5.5, y: 5.5 };
    const b = { x: 15.5, y: 5.5 };
    expect(hasLineOfSight(sim.world, sim.state, a, b)).toBe(false);
    expect(blocksMovement(sim.world, sim.state, 10, 5)).toBe(true);
    door.open = true;
    expect(hasLineOfSight(sim.world, sim.state, a, b)).toBe(true);
    expect(blocksMovement(sim.world, sim.state, 10, 5)).toBe(false);
    door.open = false;
    door.locked = true;
    expect(findPath(sim.world, sim.state, a, b, { agent: 'survivor' })).toBeNull();
    expect(findPath(sim.world, sim.state, a, b, { agent: 'zombie' })).not.toBeNull(); // zombies route to bash it
  });

  it('units following orders never stand inside blocked tiles', () => {
    const sim = testSim({ rows: walled(), alfaSpawn: { x: 4.5, y: 4.5 } });
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'sprint', targetPosition: { x: 16.5, y: 4.5 } },
    });
    for (let i = 0; i < 300; i++) {
      sim.step();
      for (const s of sim.state.survivors) {
        if (!s.alive) continue;
        expect(
          blocksMovement(sim.world, sim.state, Math.floor(s.position.x), Math.floor(s.position.y)),
        ).toBe(false);
      }
    }
    const leader = sim.state.survivors.find((s) => s.id === 'alfa-leader')!;
    expect(leader.position.x).toBeGreaterThan(13);
  });
});
