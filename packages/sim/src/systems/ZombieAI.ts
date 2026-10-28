import type { ZombieTypeDef } from '@dead-sector/content';
import type { GameState, Survivor, Vec2, Zombie, ZombieStateName } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { hasLineOfSight } from '../spatial/Raycast';
import { angleDiff, copy, dist } from '../spatial/vec';
import { findPath, nearestStandableCell } from './Pathfinding';
import { emitNoise } from './Noise';

const THINK_INTERVAL: Record<ZombieStateName, number> = {
  idle: 10,
  wander: 8,
  investigate: 5,
  search: 5,
  pursue: 3,
  attack: 3,
};

export function zombieType(world: World, z: Zombie): ZombieTypeDef {
  const t = world.content.zombieTypes[z.typeId];
  if (!t) throw new Error(`Unknown zombie type ${z.typeId}`);
  return t;
}

export function zombieReach(world: World, z: Zombie, target: { collisionRadius: number }): number {
  return zombieType(world, z).attackRangeMeters + z.collisionRadius + target.collisionRadius;
}

/** Concealment multiplier applied to a zombie's detection range for this survivor. */
export function detectionFactor(world: World, state: GameState, s: Survivor): number {
  const v = world.rules.vision;
  let f = 1;
  const squad = s.squadId ? state.squads.find((q) => q.id === s.squadId) : undefined;
  const hiding =
    (squad?.order?.type === 'hide' && squad.order.status === 'executing' && !s.moving) ||
    (s.isObjectiveCivilian && !s.rescued);
  if (hiding) f *= v.hideDetectionFactor;
  else if (s.moving && s.moveMode === 'sneak') f *= v.sneakDetectionFactor;
  else if (s.moving && s.moveMode === 'sprint') f *= v.sprintDetectionFactor;
  f *= 1 - (s.stealth - 50) / 250;
  return f;
}

/** Local sensing only: a zombie sees a survivor if within (concealed) range, FOV and LOS. */
export function zombieCanSee(world: World, state: GameState, z: Zombie, s: Survivor): boolean {
  if (!s.alive || s.extracted) return false;
  const type = zombieType(world, z);
  const night = world.mission.isNight ? 0.6 : 1;
  const factor = detectionFactor(world, state, s);
  const range = type.visionRangeMeters * world.difficulty.zombieVisionMultiplier * night * factor;
  const close = type.closeAwarenessMeters * Math.min(1, factor + 0.3);
  const d = dist(z.position, s.position);
  if (d > Math.max(range, close)) return false;
  if (d > close) {
    const half = ((type.visionFovDegrees / 2) * Math.PI) / 180;
    const ang = Math.atan2(s.position.y - z.position.y, s.position.x - z.position.x);
    if (angleDiff(ang, z.facing) > half) return false;
  }
  return hasLineOfSight(world, state, z.position, s.position);
}

function randomGoalNear(
  world: World,
  state: GameState,
  ctx: TickContext,
  center: Vec2,
  radius: number,
): Vec2 | null {
  for (let i = 0; i < 6; i++) {
    const p = {
      x: center.x + ctx.rng.range(-radius, radius),
      y: center.y + ctx.rng.range(-radius, radius),
    };
    const c = nearestStandableCell(world, state, p, 2);
    if (c) return { x: c.x + 0.5, y: c.y + 0.5 };
  }
  return null;
}

function setState(z: Zombie, s: ZombieStateName): void {
  z.ai.state = s;
}

function think(world: World, state: GameState, ctx: TickContext, z: Zombie): void {
  const type = zombieType(world, z);
  const ai = z.ai;
  const tick = state.tick;
  let target: Survivor | null = null;
  let best = Infinity;
  for (const s of ctx.survivorHash.query(
    z.position,
    Math.max(type.visionRangeMeters * 1.3, type.closeAwarenessMeters),
  )) {
    if (!zombieCanSee(world, state, z, s)) continue;
    const d = dist(z.position, s.position);
    if (d < best - 1e-9 || (Math.abs(d - best) < 1e-9 && target && s.id < target.id)) {
      best = d;
      target = s;
    }
  }

  if (target) {
    const wasHunting = ai.state === 'pursue' || ai.state === 'attack';
    if (!wasHunting) {
      emit(state, 'ZOMBIE_ALERTED', { zombieId: z.id, cause: 'sight', targetId: target.id });
      emitNoise(state, z.position, world.rules.noise.zombieGroan, 'shout', z.id);
    }
    ai.targetId = target.id;
    ai.lastKnownPos = copy(target.position);
    ai.lastSeenTick = tick;
    ai.goal = copy(target.position);
    setState(z, best <= zombieReach(world, z, target) ? 'attack' : 'pursue');
    ai.heard = null;
    return;
  }

  if (ai.state === 'pursue' || ai.state === 'attack') {
    // Lost every perception of the target: go to the last place it was perceived, never its live position.
    ai.targetId = null;
    setState(z, 'search');
    ai.goal = ai.lastKnownPos ? copy(ai.lastKnownPos) : null;
    ai.stateUntil = tick + Math.round(type.searchSeconds * 10);
    return;
  }

  const heard = ai.heard;
  if (heard && tick - heard.tick <= 20) {
    const calm = ai.state === 'idle' || ai.state === 'wander';
    if (calm)
      emit(state, 'ZOMBIE_ALERTED', {
        zombieId: z.id,
        cause: 'sound',
        x: heard.position.x,
        y: heard.position.y,
      });
    setState(z, 'investigate');
    ai.goal = copy(heard.position);
    ai.lastKnownPos = copy(heard.position);
    ai.stateUntil = tick + 300;
    ai.heard = null;
    return;
  }
  ai.heard = null;

  const arrived =
    !ai.goal ||
    dist(z.position, ai.goal) < 1.2 ||
    (z.path.length > 0 && z.pathIndex >= z.path.length);
  switch (ai.state) {
    case 'investigate':
      if (arrived || tick > ai.stateUntil) {
        setState(z, 'search');
        ai.stateUntil = tick + Math.round(type.searchSeconds * 10);
        ai.goal = null;
      }
      break;
    case 'search':
      if (tick > ai.stateUntil) {
        setState(z, 'wander');
        ai.goal = null;
      } else if (arrived) {
        const center = ai.lastKnownPos ?? z.position;
        ai.goal = randomGoalNear(world, state, ctx, center, 4);
      }
      break;
    case 'wander':
      if (arrived) {
        if (ctx.rng.chance(0.45)) {
          setState(z, 'idle');
          ai.goal = null;
          ai.stateUntil = tick + ctx.rng.int(20, 50);
        } else {
          ai.goal = randomGoalNear(world, state, ctx, z.position, 6);
        }
      }
      break;
    case 'idle':
      if (tick >= ai.stateUntil) {
        setState(z, 'wander');
        ai.goal = randomGoalNear(world, state, ctx, z.position, 6);
      }
      break;
  }
}

function updatePath(world: World, state: GameState, z: Zombie): void {
  const goal = z.ai.goal;
  if (!goal || z.ai.state === 'idle') {
    z.path = [];
    z.pathIndex = 0;
    z.pathGoalCell = -1;
    return;
  }
  const goalCell = Math.floor(goal.y) * world.width + Math.floor(goal.x);
  const exhausted = z.pathIndex >= z.path.length;
  if (goalCell === z.pathGoalCell && !(exhausted && dist(z.position, goal) > 1.2)) return;
  const path = findPath(world, state, z.position, goal, { agent: 'zombie', maxExpansions: 1800 });
  z.pathGoalCell = goalCell;
  if (!path) {
    z.path = [];
    z.pathIndex = 0;
    if (z.ai.state === 'wander' || z.ai.state === 'search') z.ai.goal = null;
    return;
  }
  z.path = path;
  z.pathIndex = 0;
}

/** Staggered FSM evaluation (0.3–1 s per zombie) followed by path maintenance. */
export function decideZombies(world: World, state: GameState, ctx: TickContext): void {
  for (const z of state.zombies) {
    if (!z.alive) continue;
    if (state.tick >= z.ai.nextThinkTick) {
      think(world, state, ctx, z);
      z.ai.nextThinkTick = state.tick + THINK_INTERVAL[z.ai.state];
      updatePath(world, state, z);
    }
  }
}
