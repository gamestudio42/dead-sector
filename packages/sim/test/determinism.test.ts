import { describe, expect, it } from 'vitest';
import { FixedStepClock, GameSimulation, hashState, runReplay, SeededRng } from '../src';
import { loadContent } from '@dead-sector/content';

function scripted(seed: number): GameSimulation {
  const sim = GameSimulation.create('a-ultima-farmacia', seed);
  sim.enqueue({
    type: 'issueOrder',
    squadId: 'alfa',
    payload: { type: 'move', targetPosition: { x: 46, y: 22 } },
  });
  sim.enqueue({
    type: 'issueOrder',
    squadId: 'bravo',
    payload: { type: 'sneak', targetPosition: { x: 21.5, y: 30.5 } },
  });
  sim.enqueue({ type: 'setFirePolicy', squadId: 'alfa', payload: { policy: 'weaponsFree' } });
  sim.run(400);
  return sim;
}

describe('determinism', () => {
  it('simulation is deterministic for same seed and commands', () => {
    const a = scripted(1337);
    const b = scripted(1337);
    expect(a.state.stats.shotsFired).toBeGreaterThan(0);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('different seeds produce different worlds', () => {
    expect(hashState(GameSimulation.create('a-ultima-farmacia', 1).state)).not.toBe(
      hashState(GameSimulation.create('a-ultima-farmacia', 2).state),
    );
  });

  it('replay of the command log reproduces the same final state', () => {
    const a = scripted(99);
    const replay = runReplay(loadContent(), {
      missionId: 'a-ultima-farmacia',
      seed: 99,
      commands: a.commandLog,
      ticks: a.tick,
    });
    expect(hashState(replay.state)).toBe(hashState(a.state));
  });

  it('seeded RNG sequence is reproducible and in [0,1)', () => {
    const h1 = { rngState: 42 };
    const h2 = { rngState: 42 };
    const r1 = new SeededRng(h1);
    const r2 = new SeededRng(h2);
    for (let i = 0; i < 1000; i++) {
      const v = r1.next();
      expect(v).toBe(r2.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('clock', () => {
  it('pause never advances the simulation tick', () => {
    const sim = GameSimulation.create();
    const clock = new FixedStepClock();
    const runFrames = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        const n = clock.advance(16.7);
        for (let k = 0; k < n; k++) sim.step();
      }
    };
    runFrames(60);
    const before = sim.tick;
    expect(before).toBeGreaterThan(0);
    clock.paused = true;
    // commands accepted while paused are only executed on resume
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'move', targetPosition: { x: 10.5, y: 8.5 } },
    });
    runFrames(600);
    expect(sim.tick).toBe(before);
    expect(sim.state.squads[0]?.order).toBeNull();
    clock.paused = false;
    runFrames(10);
    expect(sim.tick).toBeGreaterThan(before);
    expect(sim.state.squads[0]?.order?.type).toBe('move');
  });

  it('2x speed runs twice the ticks without changing per-tick rules', () => {
    const c1 = new FixedStepClock();
    const c2 = new FixedStepClock();
    c2.speed = 2;
    let t1 = 0;
    let t2 = 0;
    for (let i = 0; i < 100; i++) {
      t1 += c1.advance(50);
      t2 += c2.advance(50);
    }
    expect(t1).toBe(50);
    expect(t2).toBe(100);
  });
});
