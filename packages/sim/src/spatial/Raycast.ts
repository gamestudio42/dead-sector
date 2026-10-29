import type { GameState, Vec2 } from '../model/types';
import type { World } from '../model/World';
import { isOpaque } from './Grid';

/**
 * Supercover grid traversal: visits every cell touched by segment a→b, including both
 * neighbours when the segment passes exactly through a cell corner. `visit` returns false to stop.
 */
export function traverseSupercover(
  a: Vec2,
  b: Vec2,
  visit: (cx: number, cy: number) => boolean,
): void {
  let cx = Math.floor(a.x);
  let cy = Math.floor(a.y);
  const ex = Math.floor(b.x);
  const ey = Math.floor(b.y);
  if (!visit(cx, cy)) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx > 0 ? (cx + 1 - a.x) / dx : dx < 0 ? (a.x - cx) / -dx : Infinity;
  let tMaxY = dy > 0 ? (cy + 1 - a.y) / dy : dy < 0 ? (a.y - cy) / -dy : Infinity;
  let guard = Math.abs(ex - cx) + Math.abs(ey - cy) + 4;
  while ((cx !== ex || cy !== ey) && guard-- > 0) {
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      if (!visit(cx + stepX, cy)) return;
      if (!visit(cx, cy + stepY)) return;
      cx += stepX;
      cy += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (!visit(cx, cy)) return;
  }
}

/**
 * Line of sight between two world positions; the endpoint cells themselves never occlude.
 * `opaque` is an optional precomputed opacity grid for the current barrier state (same result).
 */
export function hasLineOfSight(
  world: World,
  state: GameState,
  a: Vec2,
  b: Vec2,
  opaque?: Uint8Array,
): boolean {
  const sx = Math.floor(a.x);
  const sy = Math.floor(a.y);
  const ex = Math.floor(b.x);
  const ey = Math.floor(b.y);
  let clear = true;
  traverseSupercover(a, b, (cx, cy) => {
    if ((cx === sx && cy === sy) || (cx === ex && cy === ey)) return true;
    if (opaque ? opaque[cy * world.width + cx] === 1 : isOpaque(world, state, cx, cy)) {
      clear = false;
      return false;
    }
    return true;
  });
  return clear;
}

/** Casts one vision ray, marking visited cells up to the first opaque cell (inclusive). */
export function castVisionRay(
  world: World,
  state: GameState,
  origin: Vec2,
  angle: number,
  range: number,
  mark: (cx: number, cy: number) => void,
  opaque?: Uint8Array,
): void {
  const end = { x: origin.x + Math.cos(angle) * range, y: origin.y + Math.sin(angle) * range };
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  const r2 = (range + 0.5) ** 2;
  traverseSupercover(origin, end, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= world.width || cy >= world.height) return false;
    if ((cx + 0.5 - origin.x) ** 2 + (cy + 0.5 - origin.y) ** 2 > r2) return false;
    mark(cx, cy);
    if (
      (cx !== ox || cy !== oy) &&
      (opaque ? opaque[cy * world.width + cx] === 1 : isOpaque(world, state, cx, cy))
    )
      return false;
    return true;
  });
}
