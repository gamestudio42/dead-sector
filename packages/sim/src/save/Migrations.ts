import type { GameState } from '../model/types';
import { SCHEMA_VERSION } from '../mission/createMission';

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** Ordered migrations keyed by the version they upgrade FROM. */
const MIGRATIONS: Record<number, Migration> = {
  // v2: squads gained a queue of Shift-click waypoints
  1: (state) => {
    for (const sq of (state['squads'] as Record<string, unknown>[] | undefined) ?? [])
      if (!Array.isArray(sq['waypoints'])) sq['waypoints'] = [];
    return state;
  },
  // v3: doors carry kind + barricade, squads carry plank kits, hordes and alarm state exist.
  // Windows of v2 saves stay static (no window entities), which the grid still treats as solid.
  2: (state) => {
    for (const d of (state['doors'] as Record<string, unknown>[] | undefined) ?? []) {
      d['kind'] ??= 'door';
      d['barricade'] ??= 0;
    }
    for (const sq of (state['squads'] as Record<string, unknown>[] | undefined) ?? [])
      sq['barricadeKits'] ??= 0;
    for (const z of (state['zombies'] as Record<string, unknown>[] | undefined) ?? []) {
      z['screamReadyTick'] ??= 0;
      z['hordeId'] ??= null;
    }
    state['hordes'] ??= [];
    const m = state['mission'] as Record<string, unknown>;
    m['alarm'] ??= 0;
    m['alarmLevel'] ??= 0;
    m['hordesSpawned'] ??= 0;
    m['nextHordeTick'] ??= -1;
    m['pendingHorde'] ??= null;
    m['lastHordeTick'] ??= -100000;
    return state;
  },
};

export class SaveVersionError extends Error {}

export function migrate(raw: Record<string, unknown>): GameState {
  let version = raw['schemaVersion'];
  if (typeof version !== 'number') throw new SaveVersionError('Save has no schemaVersion');
  if (version > SCHEMA_VERSION)
    throw new SaveVersionError(`Save version ${version} is newer than supported ${SCHEMA_VERSION}`);
  let state = raw;
  while (version < SCHEMA_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new SaveVersionError(`No migration from save version ${version}`);
    state = m(state);
    version += 1;
    state['schemaVersion'] = version;
  }
  return state as unknown as GameState;
}
