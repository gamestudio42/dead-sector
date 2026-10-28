import type { Vec2 } from '../model/types';

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const copy = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });
export const cellCenter = (cx: number, cy: number): Vec2 => ({ x: cx + 0.5, y: cy + 0.5 });

/** Smallest absolute difference between two angles, in radians. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Rounds positions to a fixed grid so serialized state stays compact and platform-stable. */
export const q = (n: number): number => Math.round(n * 10000) / 10000;
