import { describe, expect, it } from 'vitest';
import {
  deserializeState,
  GameSimulation,
  hashState,
  SaveFormatError,
  SaveVersionError,
  serializeState,
} from '../src';
import { loadContent } from '@dead-sector/content';

describe('save/load', () => {
  it('save/load preserves RNG and simulation continuation', () => {
    const a = GameSimulation.create('a-ultima-farmacia', 7);
    a.enqueue({ type: 'setFirePolicy', squadId: 'alfa', payload: { policy: 'weaponsFree' } });
    a.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'move', targetPosition: { x: 47, y: 25 } },
    });
    a.run(250);
    const saved = serializeState(a.state);
    const b = new GameSimulation(loadContent(), deserializeState(saved));
    expect(b.state.rngState).toBe(a.state.rngState);
    expect(hashState(b.state)).toBe(hashState(a.state));
    for (const sim of [a, b]) {
      sim.enqueue({
        type: 'issueOrder',
        squadId: 'bravo',
        payload: { type: 'sprint', targetPosition: { x: 40, y: 3 } },
      });
      sim.run(300);
    }
    expect(a.state.stats.shotsFired).toBeGreaterThan(0);
    expect(hashState(b.state)).toBe(hashState(a.state));
    expect(b.state.rngState).toBe(a.state.rngState);
  });

  it('rejects malformed saves and unsupported versions', () => {
    expect(() => deserializeState('{not json')).toThrow(SaveFormatError);
    expect(() => deserializeState(JSON.stringify({ format: 'other' }))).toThrow(SaveFormatError);
    const env = JSON.parse(serializeState(GameSimulation.create().state));
    env.state.schemaVersion = 999;
    expect(() => deserializeState(JSON.stringify(env))).toThrow(SaveVersionError);
  });
});
