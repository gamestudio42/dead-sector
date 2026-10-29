import type { ActorCore, GameState, Survivor, Vec2, Zombie } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import { rebuildHashes, type TickContext } from '../engine/TickContext';
import { blocksMovement, doorAt, isDoorClosed, isDoorTile, moveCost } from '../spatial/Grid';
import { SpatialHash } from '../spatial/SpatialHash';
import { copy, dist, q } from '../spatial/vec';
import { emitFootstepPulses, emitNoise } from './Noise';
import { zombieReach, zombieType } from './ZombieAI';

const DT = 0.1;

export function survivorSpeed(world: World, s: Survivor): number {
  const m = world.rules.movement;
  let speed: number;
  if (s.isObjectiveCivilian)
    speed = s.moveMode === 'sprint' ? m.civilianSpeed * 1.45 : m.civilianSpeed;
  else if (s.moveMode === 'sprint' && s.stamina > m.minSprintStamina) speed = m.sprintSpeed;
  else if (s.moveMode === 'sneak') speed = m.sneakSpeed;
  else speed = m.moveSpeed;
  if (s.health < m.woundedHealthThreshold) speed *= m.woundedSpeedFactor;
  return speed;
}

type Agent = (Survivor | Zombie) & { path: Vec2[]; pathIndex: number };

/** Moves along waypoints at most speed*dt, handling doors. Returns true if the actor wants to keep moving. */
function followPath(world: World, state: GameState, a: Agent, speed: number): void {
  const cell = moveCost(world, Math.floor(a.position.x), Math.floor(a.position.y));
  let budget = (speed * DT) / (Number.isFinite(cell) ? cell : 1);
  while (budget > 1e-6 && a.pathIndex < a.path.length) {
    const wp = a.path[a.pathIndex] as Vec2;
    const wx = Math.floor(wp.x);
    const wy = Math.floor(wp.y);
    if (isDoorTile(world, wx, wy)) {
      const door = doorAt(world, state, wx, wy);
      if (door && isDoorClosed(door) && dist(a.position, wp) < 1.35) {
        if (a.kind === 'survivor') {
          if (door.locked || door.kind === 'window' || door.barricade > 0) {
            a.path = [];
            a.pathIndex = 0;
            return;
          }
          door.open = true;
          emit(state, 'DOOR_CHANGED', { doorId: door.id, open: true, byId: a.id });
          emitNoise(state, wp, world.rules.noise.doorOpen, 'door', a.id);
        } else {
          a.ai.doorTargetId = door.id;
          return;
        }
      }
    }
    const dx = wp.x - a.position.x;
    const dy = wp.y - a.position.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      a.position.x = wp.x;
      a.position.y = wp.y;
      budget -= d;
      a.pathIndex += 1;
    } else {
      a.position.x += (dx / d) * budget;
      a.position.y += (dy / d) * budget;
      budget = 0;
    }
  }
}

/** Pushes a circle out of blocked tiles; reverts to the previous position if still inside one. */
export function resolveWalls(world: World, state: GameState, a: ActorCore, prev: Vec2): void {
  const r = a.collisionRadius;
  for (let iter = 0; iter < 2; iter++) {
    const x0 = Math.floor(a.position.x - r);
    const x1 = Math.floor(a.position.x + r);
    const y0 = Math.floor(a.position.y - r);
    const y1 = Math.floor(a.position.y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!blocksMovement(world, state, cx, cy)) continue;
        const qx = Math.max(cx, Math.min(a.position.x, cx + 1));
        const qy = Math.max(cy, Math.min(a.position.y, cy + 1));
        const dx = a.position.x - qx;
        const dy = a.position.y - qy;
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d > 1e-6) {
          a.position.x = qx + (dx / d) * r;
          a.position.y = qy + (dy / d) * r;
        } else {
          a.position.x = prev.x;
          a.position.y = prev.y;
        }
      }
    }
  }
  if (blocksMovement(world, state, Math.floor(a.position.x), Math.floor(a.position.y))) {
    a.position.x = prev.x;
    a.position.y = prev.y;
  }
}

function separate(world: World, state: GameState, actors: ActorCore[]): void {
  const hash = new SpatialHash<ActorCore>(2, Math.ceil(world.width / 2));
  const index = new Map<ActorCore, number>();
  actors.forEach((a, i) => {
    hash.insert(a);
    index.set(a, i);
  });
  const near: ActorCore[] = [];
  actors.forEach((a, i) => {
    hash.query(a.position, 0.7, near);
    for (const b of near) {
      const j = index.get(b) as number;
      if (j <= i) continue;
      const minD = a.collisionRadius + b.collisionRadius;
      let dx = b.position.x - a.position.x;
      let dy = b.position.y - a.position.y;
      let d = Math.hypot(dx, dy);
      if (d >= minD) continue;
      if (d < 1e-6) {
        // deterministic tie-break direction
        const ang = ((i * 7 + j * 13) % 16) * (Math.PI / 8);
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        d = 1;
      } else {
        dx /= d;
        dy /= d;
      }
      const push = Math.min(0.08, (minD - Math.min(d, minD)) / 2);
      a.position.x -= dx * push;
      a.position.y -= dy * push;
      b.position.x += dx * push;
      b.position.y += dy * push;
    }
  });
  void state;
}

export function moveActors(world: World, state: GameState, ctx: TickContext): void {
  const prev = new Map<ActorCore, Vec2>();
  const m = world.rules.movement;

  for (const s of state.survivors) {
    if (!s.alive || s.extracted) {
      s.moving = false;
      continue;
    }
    prev.set(s, copy(s.position));
    if (!s.pauseMove && s.pathIndex < s.path.length)
      followPath(world, state, s, survivorSpeed(world, s));
  }

  for (const z of state.zombies) {
    if (!z.alive) continue;
    prev.set(z, copy(z.position));
    if (state.tick < z.staggerUntil) continue;
    const type = zombieType(world, z);
    if (z.ai.state === 'pursue' || z.ai.state === 'attack') {
      const target = z.ai.targetId ? ctx.survivorsById.get(z.ai.targetId) : undefined;
      // physical contact: stop when already touching the perceived target
      if (
        target &&
        target.alive &&
        dist(z.position, target.position) <= zombieReach(world, z, target) - 0.05
      )
        continue;
    }
    if (z.ai.state === 'idle' || z.pathIndex >= z.path.length) continue;
    const calm = z.ai.state === 'wander' || z.ai.state === 'search';
    followPath(
      world,
      state,
      z,
      type.moveSpeedMetersPerSecond * (calm ? type.wanderSpeedFactor : 1),
    );
  }

  const actors: ActorCore[] = [];
  for (const s of state.survivors) if (s.alive && !s.extracted) actors.push(s);
  for (const z of state.zombies) if (z.alive) actors.push(z);
  separate(world, state, actors);

  for (const a of actors) {
    const p = prev.get(a) as Vec2;
    resolveWalls(world, state, a, p);
    a.position.x = q(a.position.x);
    a.position.y = q(a.position.y);
    const vx = (a.position.x - p.x) / DT;
    const vy = (a.position.y - p.y) / DT;
    a.velocity = { x: q(vx), y: q(vy) };
    const moved = Math.hypot(a.position.x - p.x, a.position.y - p.y);
    if (moved > 0.02) a.facing = q(Math.atan2(vy, vx));
    if ('stamina' in a) {
      const s = a as Survivor;
      s.moving = moved > 0.02 && !s.pauseMove;
      if (s.moving && s.moveMode === 'sprint')
        s.stamina = Math.max(0, s.stamina - m.sprintStaminaPerSecond * DT);
      else s.stamina = Math.min(100, s.stamina + m.staminaRegenPerSecond * DT);
      s.stamina = q(s.stamina);
    }
  }
  rebuildHashes(state, ctx);
  emitFootstepPulses(world, state, ctx);
}
