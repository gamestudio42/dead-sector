import type { GameState, Vec2 } from '../model/types';
import type { World } from '../model/World';
import {
  blocksMovement,
  doorAt,
  inBounds,
  isDoorClosed,
  isDoorTile,
  tileAt,
  moveCost,
} from '../spatial/Grid';
import { MinHeap } from '../spatial/Heap';
import { traverseSupercover } from '../spatial/Raycast';
import { cellCenter } from '../spatial/vec';

/** `zombieCalm`: a wandering infected walks around barriers instead of breaking them. */
export type PathAgent = 'survivor' | 'zombie' | 'zombieCalm';

export interface PathOptions {
  agent: PathAgent;
  maxExpansions?: number;
  smooth?: boolean;
}

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Cost multiplier for entering a cell, Infinity when impassable for this agent. */
export function enterCost(
  world: World,
  state: GameState,
  cx: number,
  cy: number,
  agent: PathAgent,
): number {
  if (!inBounds(world, cx, cy)) return Infinity;
  const base = moveCost(world, cx, cy);
  if (!Number.isFinite(base)) return Infinity;
  if (isDoorTile(world, cx, cy)) {
    const door = doorAt(world, state, cx, cy);
    if (!door) return tileAt(world, cx, cy) === 'window' ? Infinity : base;
    if (isDoorClosed(door)) {
      // survivors only path through doors they can open themselves
      if (agent === 'survivor')
        return door.locked || door.kind === 'window' || door.barricade > 0 ? Infinity : base + 1.5;
      if (agent === 'zombieCalm') return Infinity;
      // infected path through anything they can break; barricades make the detour more attractive
      const extra = door.kind === 'window' ? 4 : door.locked ? 10 : 6;
      return base + extra + Math.min(12, door.barricade / 20);
    }
  }
  return base;
}

/** Nearest cell (ring search) an actor can stand in, preferring the cell containing `target`. */
export function nearestStandableCell(
  world: World,
  state: GameState,
  target: Vec2,
  maxRadius = 6,
): { x: number; y: number } | null {
  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = tx + dx;
        const cy = ty + dy;
        if (!inBounds(world, cx, cy) || blocksMovement(world, state, cx, cy)) continue;
        const d = (cx + 0.5 - target.x) ** 2 + (cy + 0.5 - target.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

interface Scratch {
  size: number;
  g: Float64Array;
  parent: Int32Array;
  seen: Uint32Array;
  closed: Uint32Array;
  gen: number;
  heap: MinHeap;
}
let scratch: Scratch | null = null;
function getScratch(size: number): Scratch {
  if (!scratch || scratch.size !== size || scratch.gen > 4_000_000_000) {
    scratch = {
      size,
      g: new Float64Array(size),
      parent: new Int32Array(size),
      seen: new Uint32Array(size),
      closed: new Uint32Array(size),
      gen: 0,
      heap: new MinHeap(),
    };
  }
  scratch.gen += 1;
  scratch.heap.clear();
  return scratch;
}

/**
 * A* over the 8-connected grid with terrain costs. Diagonals never cut wall corners.
 * Returns waypoints (excluding the start) ending at `goal` (or the nearest standable cell),
 * or null when no route exists within the expansion budget.
 */
export function findPath(
  world: World,
  state: GameState,
  start: Vec2,
  goal: Vec2,
  opts: PathOptions,
): Vec2[] | null {
  const W = world.width;
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const goalCell = nearestStandableCell(world, state, goal);
  if (!goalCell || !inBounds(world, sx, sy)) return null;
  const exactGoal = goalCell.x === Math.floor(goal.x) && goalCell.y === Math.floor(goal.y);
  const goalPoint = exactGoal ? { x: goal.x, y: goal.y } : cellCenter(goalCell.x, goalCell.y);
  if (sx === goalCell.x && sy === goalCell.y) return [goalPoint];

  const s = getScratch(world.width * world.height);
  const { g, parent, seen, closed, heap, gen } = s;
  const startIdx = sy * W + sx;
  const goalIdx = goalCell.y * W + goalCell.x;
  const h = (cx: number, cy: number): number => {
    const dx = Math.abs(cx - goalCell.x);
    const dy = Math.abs(cy - goalCell.y);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  g[startIdx] = 0;
  parent[startIdx] = -1;
  seen[startIdx] = gen;
  heap.push(h(sx, sy), startIdx);
  const maxExp = opts.maxExpansions ?? world.width * world.height;
  let expansions = 0;
  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    if (++expansions > maxExp) break;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const cost = enterCost(world, state, nx, ny, opts.agent);
      if (!Number.isFinite(cost)) continue;
      if (dx !== 0 && dy !== 0) {
        // no corner cutting, and doors are only crossed orthogonally
        if (!Number.isFinite(enterCost(world, state, cx + dx, cy, opts.agent))) continue;
        if (!Number.isFinite(enterCost(world, state, cx, cy + dy, opts.agent))) continue;
        if (isDoorTile(world, nx, ny) || isDoorTile(world, cx, cy)) continue;
        if (isDoorTile(world, cx + dx, cy) || isDoorTile(world, cx, cy + dy)) continue;
      }
      const ni = ny * W + nx;
      if (closed[ni] === gen) continue;
      const ng = (g[cur] as number) + (dx !== 0 && dy !== 0 ? SQRT2 : 1) * cost;
      if (seen[ni] !== gen || ng < (g[ni] as number)) {
        seen[ni] = gen;
        g[ni] = ng;
        parent[ni] = cur;
        heap.push(ng + h(nx, ny), ni);
      }
    }
  }
  if (!found) return null;
  const cells: Vec2[] = [];
  for (let i = goalIdx; i !== startIdx && i >= 0; i = parent[i] as number) {
    const cx = i % W;
    cells.push(cellCenter(cx, (i - cx) / W));
  }
  cells.reverse();
  cells[cells.length - 1] = goalPoint;
  return opts.smooth === false ? cells : smoothPath(world, state, start, cells, opts.agent);
}

function segmentClear(world: World, state: GameState, a: Vec2, b: Vec2, agent: PathAgent): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return true;
  const nx = (-(b.y - a.y) / len) * 0.3;
  const ny = ((b.x - a.x) / len) * 0.3;
  for (const off of [0, 1, -1]) {
    let ok = true;
    const a2 = { x: a.x + nx * off, y: a.y + ny * off };
    const b2 = { x: b.x + nx * off, y: b.y + ny * off };
    traverseSupercover(a2, b2, (cx, cy) => {
      if (!Number.isFinite(enterCost(world, state, cx, cy, agent)) || isDoorTile(world, cx, cy)) {
        ok = false;
        return false;
      }
      // keep slow terrain explicit so the route does not shortcut through rubble/fences
      if (moveCost(world, cx, cy) > 1.25) {
        ok = false;
        return false;
      }
      return true;
    });
    if (!ok) return false;
  }
  return true;
}

/** Greedy string pulling; door cells always stay as explicit waypoints. */
export function smoothPath(
  world: World,
  state: GameState,
  start: Vec2,
  pts: Vec2[],
  agent: PathAgent,
): Vec2[] {
  if (pts.length <= 2) return pts;
  const out: Vec2[] = [];
  let anchor = start;
  let i = 0;
  while (i < pts.length) {
    let j = i;
    const limit = Math.min(pts.length - 1, i + 14);
    for (let k = limit; k > i; k--) {
      if (segmentClear(world, state, anchor, pts[k] as Vec2, agent)) {
        j = k;
        break;
      }
    }
    out.push(pts[j] as Vec2);
    anchor = pts[j] as Vec2;
    i = j + 1;
  }
  return out;
}

/** Length of a path from `start` through the given waypoints. */
export function pathLength(start: Vec2, pts: Vec2[]): number {
  let len = 0;
  let prev = start;
  for (const p of pts) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}
