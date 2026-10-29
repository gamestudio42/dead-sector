import type { GameState, Vec2 } from '@dead-sector/sim';

/** Picks the squad of the survivor under the cursor (left click). */
export function squadAt(state: GameState, p: Vec2, radius = 0.9): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const s of state.survivors) {
    if (!s.alive || s.squadId === null || s.extracted) continue;
    const d = Math.hypot(s.position.x - p.x, s.position.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = s.squadId;
    }
  }
  return best;
}

/** Squads with at least one living member inside the world-space rectangle (drag-box selection). */
export function squadsInRect(state: GameState, a: Vec2, b: Vec2): string[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const ids: string[] = [];
  for (const sq of state.squads) {
    const inside = state.survivors.some(
      (s) =>
        s.squadId === sq.id &&
        s.alive &&
        !s.extracted &&
        s.position.x >= x0 &&
        s.position.x <= x1 &&
        s.position.y >= y0 &&
        s.position.y <= y1,
    );
    if (inside) ids.push(sq.id);
  }
  return ids;
}
