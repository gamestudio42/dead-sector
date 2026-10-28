import type { GameState, Survivor, Zombie } from '../model/types';
import { SpatialHash } from '../spatial/SpatialHash';
import type { World } from '../model/World';
import type { SeededRng } from './SeededRng';

/** Per-tick derived indices; never serialized, always rebuildable from GameState. */
export interface TickContext {
  rng: SeededRng;
  survivorsById: Map<string, Survivor>;
  zombiesById: Map<string, Zombie>;
  zombieHash: SpatialHash<Zombie>;
  survivorHash: SpatialHash<Survivor>;
}

export function buildContext(world: World, state: GameState, rng: SeededRng): TickContext {
  const ctx: TickContext = {
    rng,
    survivorsById: new Map(),
    zombiesById: new Map(),
    zombieHash: new SpatialHash<Zombie>(4, Math.ceil(world.width / 4)),
    survivorHash: new SpatialHash<Survivor>(4, Math.ceil(world.width / 4)),
  };
  for (const s of state.survivors) ctx.survivorsById.set(s.id, s);
  for (const z of state.zombies) ctx.zombiesById.set(z.id, z);
  rebuildHashes(state, ctx);
  return ctx;
}

export function rebuildHashes(state: GameState, ctx: TickContext): void {
  ctx.zombieHash.clear();
  ctx.survivorHash.clear();
  for (const z of state.zombies) if (z.alive) ctx.zombieHash.insert(z);
  for (const s of state.survivors) if (s.alive && !s.extracted) ctx.survivorHash.insert(s);
}

/** Survivors that belong to a player squad (excludes the objective civilian). */
export const isSquadMember = (s: Survivor): boolean => s.squadId !== null;
