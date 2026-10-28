import { z } from 'zod';
import type { GameState } from '../model/types';
import { migrate } from './Migrations';

export const SAVE_FORMAT = 'dead-sector-save';

const vec = z.object({ x: z.number(), y: z.number() });
const saveEnvelopeSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  savedAtTick: z.number().int().nonnegative(),
  missionId: z.string(),
  seed: z.number(),
  state: z
    .object({
      schemaVersion: z.number().int().positive(),
      tick: z.number().int().nonnegative(),
      seed: z.number(),
      rngState: z.number().int(),
      missionId: z.string(),
      mapId: z.string(),
      survivors: z.array(
        z
          .object({ id: z.string(), position: vec, health: z.number(), alive: z.boolean() })
          .passthrough(),
      ),
      zombies: z.array(
        z
          .object({ id: z.string(), position: vec, health: z.number(), alive: z.boolean() })
          .passthrough(),
      ),
      squads: z.array(z.object({ id: z.string(), memberIds: z.array(z.string()) }).passthrough()),
      doors: z.array(
        z.object({ id: z.string(), open: z.boolean(), locked: z.boolean() }).passthrough(),
      ),
      fog: z.object({ cells: z.array(z.number().int().min(0).max(2)) }),
      mission: z
        .object({ status: z.enum(['running', 'success', 'partial', 'failed']) })
        .passthrough(),
    })
    .passthrough(),
});

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  savedAtTick: number;
  missionId: string;
  seed: number;
  state: GameState;
}

export class SaveFormatError extends Error {}

/** Full snapshot: schemaVersion, seed, tick, map, RNG and every cooldown/timer in GameState. */
export function serializeState(state: GameState): string {
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    savedAtTick: state.tick,
    missionId: state.missionId,
    seed: state.seed,
    state: { ...state, events: [] },
  };
  return JSON.stringify(envelope);
}

/** Parses and validates an untrusted save string; throws SaveFormatError/SaveVersionError. */
export function deserializeState(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveFormatError('Save is not valid JSON');
  }
  const res = saveEnvelopeSchema.safeParse(raw);
  if (!res.success) {
    throw new SaveFormatError(
      `Invalid save: ${res.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  // validated above; migrate the raw object so key order (and thus state hashes) is preserved
  return migrate((raw as { state: Record<string, unknown> }).state);
}
