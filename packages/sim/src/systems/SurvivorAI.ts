import type { WeaponDef } from '@dead-sector/content';
import type { FirePolicy, GameState, Squad, Survivor, Vec2, Zombie } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { copy, dist } from '../spatial/vec';
import { aliveMembers, centroid, pathMemberTo } from './Orders';
import { findPath, nearestStandableCell } from './Pathfinding';

const MOVEMENT_ORDERS = new Set(['move', 'sneak', 'sprint', 'retreat', 'regroup']);

export function weaponDef(world: World, s: Survivor): WeaponDef {
  const w = world.content.weapons[s.weapon.weaponId];
  if (!w) throw new Error(`Unknown weapon ${s.weapon.weaponId}`);
  return w;
}

export const pathDone = (s: { path: Vec2[]; pathIndex: number }): boolean =>
  s.pathIndex >= s.path.length;

function seenZombies(ctx: TickContext, s: Survivor): Zombie[] {
  const out: Zombie[] = [];
  for (const id of s.seenZombieIds) {
    const z = ctx.zombiesById.get(id);
    if (z && z.alive) out.push(z);
  }
  return out;
}

function nearestOf(s: Survivor, zs: Zombie[]): { z: Zombie; d: number } | null {
  let best: { z: Zombie; d: number } | null = null;
  for (const z of zs) {
    const d = dist(s.position, z.position);
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && z.id < best.z.id))
      best = { z, d };
  }
  return best;
}

function interruptInteraction(state: GameState, s: Survivor, reason: string): void {
  if (s.interaction && s.interaction.progressTicks > 0) {
    emit(state, 'INTERACTION_INTERRUPTED', {
      survivorId: s.id,
      kind: s.interaction.kind,
      targetId: s.interaction.targetId,
      reason,
    });
  }
  s.interaction = null;
}

function handlePanic(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  squad: Squad | null,
  seen: Zombie[],
): void {
  interruptInteraction(state, s, 'panic');
  const flee = !s.isObjectiveCivilian && (s.band === 'breakdown' || s.courage >= 40);
  if (!flee) {
    s.path = [];
    s.pathIndex = 0;
    s.activity = 'frozen';
    s.reason = 'panicFreeze';
    return;
  }
  s.activity = 'fleeing';
  s.reason = s.band === 'breakdown' ? 'breakdownFlee' : 'panicFlee';
  s.moveMode = 'sprint';
  if (state.tick < s.fleeReplanTick && !pathDone(s)) return;
  s.fleeReplanTick = state.tick + 20;
  const threats =
    seen.length > 0
      ? seen.map((z) => z.position)
      : state.contacts.filter((c) => dist(c.position, s.position) < 12).map((c) => c.position);
  let dest: Vec2 | null = null;
  if (threats.length > 0) {
    const t = centroid(threats);
    const dx = s.position.x - t.x;
    const dy = s.position.y - t.y;
    const len = Math.hypot(dx, dy) || 1;
    for (const d of [8, 5, 3]) {
      const cell = nearestStandableCell(
        world,
        state,
        { x: s.position.x + (dx / len) * d, y: s.position.y + (dy / len) * d },
        3,
      );
      if (cell) {
        dest = { x: cell.x + 0.5, y: cell.y + 0.5 };
        break;
      }
    }
  } else if (squad?.leaderId && squad.leaderId !== s.id) {
    const leader = ctx.survivorsById.get(squad.leaderId);
    if (leader && leader.alive && dist(leader.position, s.position) > 3)
      dest = copy(leader.position);
  }
  const path = dest
    ? findPath(world, state, s.position, dest, { agent: 'survivor', maxExpansions: 2500 })
    : null;
  s.path = path ?? [];
  s.pathIndex = 0;
}

function effectivePolicy(squad: Squad): FirePolicy {
  if (
    squad.order?.type === 'hide' &&
    squad.order.status === 'executing' &&
    squad.firePolicy === 'weaponsFree'
  )
    return 'returnFire';
  return squad.firePolicy;
}

function threatensSquad(
  world: World,
  state: GameState,
  ctx: TickContext,
  z: Zombie,
  squad: Squad,
  d: number,
): boolean {
  if (d <= world.rules.combat.returnFireRadius) return true;
  if (!z.ai.targetId) return false;
  const t = ctx.survivorsById.get(z.ai.targetId);
  return (
    !!t &&
    (t.squadId === squad.id ||
      t.isObjectiveCivilian ||
      (z.ai.state === 'attack' && t.squadId !== null))
  );
}

function chooseFireTarget(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  squad: Squad,
  seen: Zombie[],
  w: WeaponDef,
): Zombie | null {
  const policy = effectivePolicy(squad);
  if (policy === 'holdFire') return null;
  let best: Zombie | null = null;
  let bestD = Infinity;
  for (const z of seen) {
    const d = dist(s.position, z.position);
    if (d > w.rangeMeters) continue;
    if (policy === 'returnFire' && !threatensSquad(world, state, ctx, z, squad, d)) continue;
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && best && z.id < best.id)) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

function startReloadIfNeeded(world: World, s: Survivor, w: WeaponDef, seen: Zombie[]): void {
  const ws = s.weapon;
  if (
    w.kind !== 'firearm' ||
    ws.reloadRemaining > 0 ||
    ws.reserveRounds <= 0 ||
    ws.magazineRounds >= ws.magazineCapacity
  )
    return;
  const empty = ws.magazineRounds === 0;
  const calm = !seen.some((z) => dist(z.position, s.position) < 15);
  if (
    empty ||
    (calm && ws.magazineRounds < ws.magazineCapacity * world.rules.combat.autoReloadFraction)
  ) {
    ws.reloadRemaining = ws.reloadTicks;
  }
}

function checkStuck(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  squad: Squad,
): void {
  const order = squad.order;
  if (!order || order.status !== 'executing' || pathDone(s) || s.pauseMove || !s.slot) {
    s.stuckCheckTick = state.tick;
    s.stuckCheckPos = copy(s.position);
    return;
  }
  const window = Math.round(world.rules.movement.stuckWindowSeconds * 10);
  if (state.tick - s.stuckCheckTick < window) return;
  const moved = dist(s.position, s.stuckCheckPos);
  s.stuckCheckTick = state.tick;
  s.stuckCheckPos = copy(s.position);
  if (moved >= world.rules.movement.stuckMinDistance) {
    s.replans = 0;
    return;
  }
  s.replans += 1;
  if (s.replans > world.rules.movement.maxReplans) {
    order.status = 'blocked';
    order.blockedReason = 'stuck';
    state.stats.ordersBlocked += 1;
    emit(state, 'ORDER_BLOCKED', {
      squadId: squad.id,
      orderId: order.id,
      orderType: order.type,
      reason: 'stuck',
      survivorId: s.id,
    });
    for (const m of aliveMembers(state, ctx, squad)) {
      m.path = [];
      m.pathIndex = 0;
    }
    return;
  }
  pathMemberTo(world, state, s, s.slot);
}

function isRiskyForShaken(world: World, state: GameState, s: Survivor, squad: Squad): boolean {
  const o = squad.order;
  if (!o || o.status !== 'executing') return false;
  if (!(o.type === 'move' || o.type === 'sprint' || o.type === 'attack')) return false;
  if (s.stress < world.rules.stress.shakenThreshold) return false;
  const dest = s.slot ?? o.targetPosition;
  if (!dest) return false;
  const near = state.contacts.filter((c) => dist(c.position, dest) < 6).length;
  return near >= world.rules.stress.shakenRiskZombies && !pathDone(s);
}

function decideMember(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  squad: Squad,
): void {
  const seen = seenZombies(ctx, s);
  const w = weaponDef(world, s);
  const order = squad.order && squad.order.status === 'executing' ? squad.order : null;

  if (s.panicked) {
    handlePanic(world, state, ctx, s, squad, seen);
    return;
  }
  const wasPanicking = s.activity === 'fleeing' || s.activity === 'frozen';
  s.activity = 'idle';
  if (wasPanicking) {
    // rallied: rejoin the current order
    s.reason = 'rallied';
    s.moveMode = order?.mode ?? squad.moveMode;
    if (order && s.slot && MOVEMENT_ORDERS.has(order.type)) pathMemberTo(world, state, s, s.slot);
    else if (order && (order.type === 'hold' || order.type === 'hide')) {
      s.path = [];
      s.slot = copy(s.position);
    } else s.path = [];
    s.pathIndex = 0;
  } else s.reason = null;

  const near = nearestOf(s, seen);
  const reach = world.rules.combat.meleeTriggerDistance + s.collisionRadius + 0.28;
  if (near && near.d <= world.rules.interaction.interruptRadius)
    interruptInteraction(state, s, 'threat');

  startReloadIfNeeded(world, s, w, seen);
  const canFire =
    w.kind === 'firearm' && s.weapon.magazineRounds > 0 && s.weapon.reloadRemaining === 0;

  // 1) avoid immediate death: fight what is in contact range
  if (near && near.d <= reach) {
    s.targetId = near.z.id;
    s.attackIntent = canFire && effectivePolicy(squad) === 'weaponsFree' ? 'fire' : 'melee';
    s.pauseMove = true;
    s.activity = 'melee';
    s.reason = 'selfDefense';
    return;
  }

  if (s.weapon.reloadRemaining > 0) {
    s.activity = 'reloading';
  }

  // 2) explicit order
  if (order) {
    if (isRiskyForShaken(world, state, s, squad)) {
      s.pauseMove = true;
      s.activity = 'refusing';
      s.reason = 'shakenRiskyOrder';
    } else if (order.type === 'attack') {
      const target = order.targetEntityId ? ctx.zombiesById.get(order.targetEntityId) : undefined;
      const visible = target && seen.includes(target);
      if (
        target &&
        visible &&
        dist(s.position, target.position) <= w.rangeMeters * 0.9 &&
        canFire
      ) {
        s.pauseMove = true;
        s.targetId = target.id;
        s.attackIntent = 'fire';
        s.activity = 'firing';
        return;
      }
      const contact = state.contacts.find((c) => c.zombieId === order.targetEntityId);
      if (
        contact &&
        (pathDone(s) || state.tick % 20 === 0) &&
        dist(s.position, contact.position) > 1.5
      ) {
        pathMemberTo(world, state, s, contact.position);
      }
    } else if (order.type === 'interact' && order.interactorId === s.id && s.interaction) {
      s.activity = 'interacting';
      s.pauseMove = true;
      return;
    }
  }
  if (s.activity === 'idle') {
    if (!pathDone(s)) s.activity = 'moving';
    else if (order?.type === 'hold') s.activity = 'holding';
    else if (order?.type === 'hide') s.activity = 'hiding';
    else s.activity = 'idle';
  }
  checkStuck(world, state, ctx, s, squad);

  // 3) fire discipline
  const sprinting = s.moveMode === 'sprint' && !pathDone(s) && !s.pauseMove;
  if (canFire && !sprinting) {
    const target = chooseFireTarget(world, state, ctx, s, squad, seen, w);
    if (target) {
      s.targetId = target.id;
      s.attackIntent = 'fire';
      if (pathDone(s) || s.pauseMove) s.activity = 'firing';
    }
  }
  if (!s.targetId && near) {
    // track the nearest threat even when not allowed to shoot
    s.facing = Math.atan2(near.z.position.y - s.position.y, near.z.position.x - s.position.x);
  }
}

function decideCivilian(world: World, state: GameState, ctx: TickContext, s: Survivor): void {
  s.attackIntent = null;
  s.targetId = null;
  s.pauseMove = false;
  if (!s.rescued) {
    s.activity = 'waiting';
    s.path = [];
    return;
  }
  if (s.panicked) {
    handlePanic(world, state, ctx, s, null, seenZombies(ctx, s));
    return;
  }
  let leader = s.followTargetId ? ctx.survivorsById.get(s.followTargetId) : undefined;
  if (!leader || !leader.alive || leader.extracted) {
    let best: Survivor | null = null;
    let bestScore = Infinity;
    for (const m of state.survivors) {
      if (!m.alive || m.extracted || m.squadId === null) continue;
      const score = dist(m.position, s.position) - (m.isLeader ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    leader = best ?? undefined;
    s.followTargetId = leader?.id ?? null;
  }
  s.activity = 'following';
  s.reason = null;
  if (!leader) {
    s.path = [];
    s.activity = 'waiting';
    return;
  }
  const d = dist(s.position, leader.position);
  const follow = world.rules.movement.civilianFollowDistance;
  if (d <= follow) {
    s.path = [];
    s.pathIndex = 0;
    return;
  }
  s.moveMode = d > 6 ? 'sprint' : 'move';
  if (pathDone(s) || state.tick % 5 === 0) {
    const path = findPath(world, state, s.position, leader.position, {
      agent: 'survivor',
      maxExpansions: 4000,
    });
    s.path = path ?? [];
    s.pathIndex = 0;
  }
}

function updateOrderCompletion(state: GameState, ctx: TickContext, squad: Squad): void {
  const order = squad.order;
  if (!order || order.status !== 'executing') return;
  const members = aliveMembers(state, ctx, squad);
  if (members.length === 0) {
    order.status = 'interrupted';
    return;
  }
  let done = false;
  if (MOVEMENT_ORDERS.has(order.type)) {
    done = members.filter((m) => !m.panicked).every((m) => pathDone(m));
  } else if (order.type === 'attack') {
    const target = order.targetEntityId ? ctx.zombiesById.get(order.targetEntityId) : undefined;
    done = !target || !target.alive || !state.contacts.some((c) => c.zombieId === target.id);
  }
  if (done) {
    order.status = 'completed';
    emit(state, 'ORDER_COMPLETED', { squadId: squad.id, orderId: order.id, orderType: order.type });
  }
}

/** Per-survivor priority stack: avoidImmediateDeath > panic > reload/seekSafety > explicit order > idle. */
export function decideSurvivors(world: World, state: GameState, ctx: TickContext): void {
  for (const squad of state.squads) {
    for (const s of aliveMembers(state, ctx, squad)) {
      s.attackIntent = null;
      s.targetId = null;
      s.pauseMove = false;
      decideMember(world, state, ctx, s, squad);
    }
    updateOrderCompletion(state, ctx, squad);
  }
  for (const s of state.survivors) {
    if (s.isObjectiveCivilian && s.alive && !s.extracted) decideCivilian(world, state, ctx, s);
  }
}
