import type { GameState } from '../model/types';
import type { World } from '../model/World';
import { acousticTile, isDoorClosed, isOpaque } from './Grid';

/**
 * Pure memoisation for per-cell lookups that only change when a barrier (door, window,
 * barricade) opens or closes. The fingerprint captures every input of opacity and sound
 * absorption, so cached results are identical to recomputing them.
 */
export function barrierFingerprint(state: GameState): string {
  let s = '';
  for (const d of state.doors) s += isDoorClosed(d) ? '1' : '0';
  return s;
}

interface WorldCache {
  key: string;
  absorb: Float32Array;
  opaque: Uint8Array;
  /** Noise fields by "cell|intensity" for the current fingerprint (small LRU via insertion order). */
  fields: Map<string, Float32Array>;
}

const caches = new WeakMap<World, WorldCache>();
const MAX_FIELDS = 64;

/** Grids for the current barrier state, rebuilt only when the fingerprint changes. */
export function barrierGrids(
  world: World,
  state: GameState,
  key = barrierFingerprint(state),
): WorldCache {
  let c = caches.get(world);
  if (c && c.key === key) return c;
  const n = world.width * world.height;
  const absorb = new Float32Array(n);
  const opaque = new Uint8Array(n);
  const table = world.rules.noise.absorption;
  for (let y = 0; y < world.height; y++)
    for (let x = 0; x < world.width; x++) {
      const i = y * world.width + x;
      absorb[i] = table[acousticTile(world, state, x, y)] ?? 0;
      opaque[i] = isOpaque(world, state, x, y) ? 1 : 0;
    }
  c = { key, absorb, opaque, fields: new Map() };
  caches.set(world, c);
  return c;
}

export function cachedField(
  c: WorldCache,
  cell: number,
  intensity: number,
): Float32Array | undefined {
  const k = `${cell}|${intensity}`;
  const f = c.fields.get(k);
  if (f) {
    // refresh recency
    c.fields.delete(k);
    c.fields.set(k, f);
  }
  return f;
}

export function storeField(
  c: WorldCache,
  cell: number,
  intensity: number,
  field: Float32Array,
): void {
  c.fields.set(`${cell}|${intensity}`, field);
  if (c.fields.size > MAX_FIELDS) c.fields.delete(c.fields.keys().next().value as string);
}
