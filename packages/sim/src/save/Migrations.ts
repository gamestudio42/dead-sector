import type { GameState } from '../model/types';
import { SCHEMA_VERSION } from '../mission/createMission';

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** Ordered migrations keyed by the version they upgrade FROM. None needed yet (v1 is the first). */
const MIGRATIONS: Record<number, Migration> = {};

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
