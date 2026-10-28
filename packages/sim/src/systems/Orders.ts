import type { GameState, InteractKind, Squad, SquadOrder, Survivor, Vec2 } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { blocksMovement, inBounds, isDoorClosed } from '../spatial/Grid';
import { cellCenter, copy, dist } from '../spatial/vec';
import { findPath, nearestStandableCell } from './Pathfinding';

export interface Interactable {
  id: string;
  kind: InteractKind;
  position: Vec2;
  available: boolean;
}

export const CABINET_ID = 'cabinet';
export const BEACON_ID = 'beacon';

export function aliveMembers(state: GameState, ctx: TickContext, squad: Squad): Survivor[] {
  const out: Survivor[] = [];
  for (const id of squad.memberIds) {
    const s = ctx.survivorsById.get(id);
    if (s && s.alive && !s.extracted) out.push(s);
  }
  void state;
  return out;
}

export function centroid(points: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, points.length), y: y / Math.max(1, points.length) };
}

/** Everything a squad can interact with right now (doors, cabinet, civilian, extraction beacon). */
export function listInteractables(world: World, state: GameState): Interactable[] {
  const out: Interactable[] = [];
  for (const d of state.doors) {
    out.push({
      id: d.id,
      kind: 'door',
      position: cellCenter(d.cell.x, d.cell.y),
      available: !d.broken,
    });
  }
  const cab = world.mission.objectives.cabinet.cell;
  out.push({
    id: CABINET_ID,
    kind: 'cabinet',
    position: { x: cab.x + 1, y: cab.y + 0.5 },
    available: !state.mission.medicineCollected,
  });
  const civ = state.survivors.find((s) => s.isObjectiveCivilian);
  if (civ)
    out.push({
      id: civ.id,
      kind: 'civilian',
      position: copy(civ.position),
      available: civ.alive && !civ.rescued,
    });
  out.push({
    id: BEACON_ID,
    kind: 'beacon',
    position: copy(world.mission.objectives.extraction.beacon),
    available: !state.mission.extractionActive,
  });
  return out;
}

/** Cells connected (4-way) to `start` within `maxSteps`, so formation slots never land behind a wall. */
function reachableCells(
  world: World,
  state: GameState,
  start: { x: number; y: number },
  maxSteps: number,
): { x: number; y: number }[] {
  const seen = new Set<number>([start.y * world.width + start.x]);
  let frontier = [start];
  const out = [start];
  for (let step = 0; step < maxSteps; step++) {
    const next: { x: number; y: number }[] = [];
    for (const c of frontier) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = c.x + dx;
        const y = c.y + dy;
        const k = y * world.width + x;
        if (!inBounds(world, x, y) || seen.has(k) || blocksMovement(world, state, x, y)) continue;
        seen.add(k);
        next.push({ x, y });
        out.push({ x, y });
      }
    }
    frontier = next;
  }
  return out;
}

const FORMATION: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1, -0.8],
  [1, -0.8],
  [0, -1.6],
  [-1, -2.4],
  [1, -2.4],
];

/** Assigns each member a free cell around `dest`, oriented along the travel direction. */
export function formationSlots(
  world: World,
  state: GameState,
  members: Survivor[],
  dest: Vec2,
  from: Vec2,
): Vec2[] {
  const destCell = nearestStandableCell(world, state, dest);
  if (!destCell) return members.map(() => copy(dest));
  const candidates = reachableCells(world, state, destCell, 5);
  const spacing = world.rules.movement.formationSpacing;
  let fx = dest.x - from.x;
  let fy = dest.y - from.y;
  const len = Math.hypot(fx, fy);
  if (len < 1e-6) {
    fx = 0;
    fy = 1;
  } else {
    fx /= len;
    fy /= len;
  }
  const rx = -fy;
  const ry = fx;
  const used = new Set<number>();
  const exactDest = destCell.x === Math.floor(dest.x) && destCell.y === Math.floor(dest.y);
  return members.map((_, i) => {
    const [ox, oy] = FORMATION[i % FORMATION.length] as readonly [number, number];
    const want = {
      x: dest.x + (rx * ox + fx * oy) * spacing,
      y: dest.y + (ry * ox + fy * oy) * spacing,
    };
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const k = c.y * world.width + c.x;
      if (used.has(k)) continue;
      const d = (c.x + 0.5 - want.x) ** 2 + (c.y + 0.5 - want.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return copy(dest);
    used.add(best.y * world.width + best.x);
    if (i === 0 && exactDest && best.x === destCell.x && best.y === destCell.y) return copy(dest);
    return cellCenter(best.x, best.y);
  });
}

export function pathMemberTo(
  world: World,
  state: GameState,
  s: Survivor,
  slot: Vec2,
  fallback?: Vec2,
): boolean {
  s.slot = copy(slot);
  let path = findPath(world, state, s.position, slot, { agent: 'survivor' });
  if (!path && fallback) {
    path = findPath(world, state, s.position, fallback, { agent: 'survivor' });
    if (path) s.slot = copy(path[path.length - 1] as Vec2);
  }
  s.path = path ?? [];
  s.pathIndex = 0;
  s.stuckCheckTick = state.tick;
  s.stuckCheckPos = copy(s.position);
  return path !== null;
}

function block(
  state: GameState,
  squad: Squad,
  order: SquadOrder,
  reason: SquadOrder['blockedReason'],
): void {
  order.status = 'blocked';
  if (reason) order.blockedReason = reason;
  state.stats.ordersBlocked += 1;
  emit(state, 'ORDER_BLOCKED', {
    squadId: squad.id,
    orderId: order.id,
    orderType: order.type,
    reason: reason ?? 'noPath',
  });
  for (const id of squad.memberIds) {
    const s = state.survivors.find((m) => m.id === id);
    if (s && s.alive) {
      s.path = [];
      s.pathIndex = 0;
      s.slot = null;
    }
  }
}

function retreatDestination(
  world: World,
  state: GameState,
  squad: Squad,
  members: Survivor[],
): Vec2 {
  const c = centroid(members.map((m) => m.position));
  const threats = state.contacts.filter((k) => dist(k.position, c) < 25);
  if (threats.length > 0) {
    const t = centroid(threats.map((k) => k.position));
    let dx = c.x - t.x;
    let dy = c.y - t.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    for (const distance of [14, 10, 6]) {
      const p = { x: c.x + dx * distance, y: c.y + dy * distance };
      const cell = nearestStandableCell(world, state, p, 4);
      if (
        cell &&
        findPath(world, state, c, cellCenter(cell.x, cell.y), {
          agent: 'survivor',
          maxExpansions: 3000,
        })
      ) {
        return cellCenter(cell.x, cell.y);
      }
    }
  }
  return copy(squad.spawn);
}

/** Stand cell next to an interactable, chosen by the shortest route from the interactor. */
export function interactionStandPoint(
  world: World,
  state: GameState,
  s: Survivor,
  target: Interactable,
): Vec2 | null {
  const cells: { x: number; y: number }[] = [];
  const tx = Math.floor(target.position.x);
  const ty = Math.floor(target.position.y);
  if (target.kind === 'door') {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      cells.push({ x: tx + dx, y: ty + dy });
  } else if (target.kind === 'cabinet') {
    for (let x = tx - 2; x <= tx + 1; x++)
      for (let y = ty - 1; y <= ty + 1; y++) cells.push({ x, y });
  } else {
    for (let x = tx - 1; x <= tx + 1; x++)
      for (let y = ty - 1; y <= ty + 1; y++) cells.push({ x, y });
  }
  let best: Vec2 | null = null;
  let bestLen = Infinity;
  for (const c of cells) {
    if (!inBounds(world, c.x, c.y) || blocksMovement(world, state, c.x, c.y)) continue;
    const p = cellCenter(c.x, c.y);
    if (dist(p, target.position) > 1.6) continue;
    const path = findPath(world, state, s.position, p, { agent: 'survivor', smooth: false });
    if (!path) continue;
    let len = 0;
    let prev = s.position;
    for (const q of path) {
      len += dist(prev, q);
      prev = q;
    }
    if (len < bestLen) {
      bestLen = len;
      best = p;
    }
  }
  return best;
}

/** Turns a queued order into member routes. Emits ORDER_BLOCKED when it cannot be executed. */
export function planOrder(
  world: World,
  state: GameState,
  ctx: TickContext,
  squad: Squad,
  order: SquadOrder,
): void {
  order.status = 'planning';
  const members = aliveMembers(state, ctx, squad).filter((m) => !m.panicked);
  const all = aliveMembers(state, ctx, squad);
  if (all.length === 0) return block(state, squad, order, 'noMembers');
  for (const m of all) {
    m.moveMode = order.mode;
    m.interaction = null;
    m.replans = 0;
  }
  const leader = members.find((m) => m.id === squad.leaderId) ?? members[0] ?? all[0];
  if (!leader) return block(state, squad, order, 'noMembers');

  if (order.type === 'hold' || order.type === 'hide') {
    for (const m of all) {
      m.path = [];
      m.pathIndex = 0;
      m.slot = copy(m.position);
    }
    order.routePreview = [];
    order.status = 'executing';
    return;
  }

  let dest: Vec2 | null = null;
  if (order.type === 'retreat') dest = retreatDestination(world, state, squad, all);
  else if (order.type === 'regroup') dest = copy(leader.position);
  else if (order.type === 'attack') {
    const contact = state.contacts.find((c) => c.zombieId === order.targetEntityId);
    if (!contact) return block(state, squad, order, 'invalidTarget');
    dest = copy(contact.position);
  } else if (order.type === 'interact') {
    const target = listInteractables(world, state).find((i) => i.id === order.targetEntityId);
    if (!target || !target.available) return block(state, squad, order, 'invalidTarget');
    if (target.kind === 'beacon' && !state.mission.medicineCollected)
      return block(state, squad, order, 'requiresMedicine');
    const candidates = [...members].sort(
      (a, b) =>
        dist(a.position, target.position) - dist(b.position, target.position) ||
        (a.id < b.id ? -1 : 1),
    );
    let interactor: Survivor | null = null;
    let stand: Vec2 | null = null;
    for (const c of candidates) {
      stand = interactionStandPoint(world, state, c, target);
      if (stand) {
        interactor = c;
        break;
      }
    }
    if (!interactor || !stand) {
      const door = state.doors.find((d) => d.id === target.id);
      return block(
        state,
        squad,
        order,
        door && door.locked && isDoorClosed(door) ? 'locked' : 'noPath',
      );
    }
    order.interactorId = interactor.id;
    pathMemberTo(world, state, interactor, stand);
    order.routePreview = [...interactor.path];
    const escorts = all.filter((m) => m.id !== interactor.id);
    const slots = formationSlots(
      world,
      state,
      [interactor, ...escorts],
      stand,
      centroid(all.map((m) => m.position)),
    );
    escorts.forEach((m, i) => pathMemberTo(world, state, m, slots[i + 1] as Vec2, stand));
    order.status = 'executing';
    return;
  } else if (order.targetPosition) dest = copy(order.targetPosition);
  if (!dest) return block(state, squad, order, 'invalidTarget');

  const leadPath = findPath(world, state, leader.position, dest, { agent: 'survivor' });
  if (!leadPath) return block(state, squad, order, 'noPath');
  order.routePreview = leadPath;
  const ordered = [leader, ...all.filter((m) => m !== leader)];
  const slots = formationSlots(
    world,
    state,
    ordered,
    leadPath[leadPath.length - 1] as Vec2,
    centroid(all.map((m) => m.position)),
  );
  ordered.forEach((m, i) => {
    if (order.type === 'regroup' && m === leader) {
      m.path = [];
      m.slot = copy(m.position);
      return;
    }
    pathMemberTo(world, state, m, slots[i] as Vec2, dest ?? undefined);
  });
  order.status = 'executing';
}
