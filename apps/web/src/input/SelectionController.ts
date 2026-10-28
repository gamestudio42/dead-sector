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
