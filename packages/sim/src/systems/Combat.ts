import type { Door, GameState, Squad, Survivor, Zombie } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { doorAt, isDoorClosed } from '../spatial/Grid';
import { hasLineOfSight } from '../spatial/Raycast';
import { dist, q } from '../spatial/vec';
import { emitNoise } from './Noise';
import { weaponDef } from './SurvivorAI';
import { zombieReach, zombieType } from './ZombieAI';

export interface DamageEntry {
  targetId: string;
  sourceId: string;
  amount: number;
  bite: boolean;
  cause: 'shot' | 'melee' | 'zombie';
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Probability of a hit for one shot, following the spec formula; exported for UI/tests. */
export function shotHitChance(
  world: World,
  state: GameState,
  s: Survivor,
  squad: Squad | undefined,
  targetDistance: number,
): number {
  const w = weaponDef(world, s);
  const c = world.rules.combat;
  const skill = (s.marksmanship - 50) * c.skillBonusPerPoint;
  const range = (targetDistance / w.rangeMeters) * c.rangePenalty;
  const movement = s.moving ? (s.moveMode === 'sneak' ? c.movePenalty * 0.5 : c.movePenalty) : 0;
  const stress = (s.stress / 100) * c.stressPenalty;
  const dark = world.mission.isNight ? c.darknessPenalty : 0;
  const stance =
    squad?.order &&
    (squad.order.type === 'hold' || squad.order.type === 'hide') &&
    squad.order.status === 'executing'
      ? c.holdStanceBonus
      : 0;
  void state;
  return clamp(w.baseAccuracy + skill - range - movement - stress - dark + stance, 0.05, 0.95);
}

function tickWeapon(world: World, state: GameState, s: Survivor): void {
  const ws = s.weapon;
  if (ws.cooldown > 0) ws.cooldown -= 1;
  if (s.meleeCooldown > 0) s.meleeCooldown -= 1;
  if (ws.reloadRemaining > 0 && !s.panicked) {
    ws.reloadRemaining -= 1;
    if (ws.reloadRemaining === 0) {
      const take = Math.min(ws.magazineCapacity - ws.magazineRounds, ws.reserveRounds);
      ws.magazineRounds += take;
      ws.reserveRounds -= take;
      emit(state, 'WEAPON_RELOADED', {
        survivorId: s.id,
        magazineRounds: ws.magazineRounds,
        reserveRounds: ws.reserveRounds,
      });
    }
  }
  const w = weaponDef(world, s);
  if (
    w.kind === 'firearm' &&
    ws.magazineRounds === 0 &&
    ws.reserveRounds === 0 &&
    !s.outOfAmmoReported
  ) {
    s.outOfAmmoReported = true;
    emit(state, 'OUT_OF_AMMO', { survivorId: s.id });
  }
}

function fire(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  target: Zombie,
  queue: DamageEntry[],
): void {
  const w = weaponDef(world, s);
  const ws = s.weapon;
  // 1) validate
  if (w.kind !== 'firearm' || ws.magazineRounds <= 0 || ws.cooldown > 0 || ws.reloadRemaining > 0)
    return;
  if (!target.alive) return;
  const d = dist(s.position, target.position);
  if (d > w.rangeMeters) return;
  if (!hasLineOfSight(world, state, s.position, target.position)) return;
  // 2) chance, 3) consume exactly one round and make noise, 4) single RNG draw
  const squad = state.squads.find((sq) => sq.id === s.squadId);
  const chance = shotHitChance(world, state, s, squad, d);
  ws.magazineRounds -= 1;
  ws.cooldown = Math.max(1, Math.round(10 / w.shotsPerSecond));
  s.shotsFired += 1;
  s.facing = q(Math.atan2(target.position.y - s.position.y, target.position.x - s.position.x));
  state.stats.shotsFired += 1;
  state.stats.ammoUsed += 1;
  emitNoise(state, s.position, w.noise, 'shot', s.id);
  const roll = ctx.rng.next();
  const hit = roll < chance;
  const falloff = w.damage - (w.damage - w.minDamageAtMaxRange) * Math.min(1, d / w.rangeMeters);
  const damage = hit ? Math.round(falloff) : 0;
  if (hit) {
    state.stats.hits += 1;
    queue.push({ targetId: target.id, sourceId: s.id, amount: damage, bite: false, cause: 'shot' });
  }
  emit(state, 'SHOT_FIRED', {
    shooterId: s.id,
    targetId: target.id,
    weaponId: w.id,
    chance: q(chance),
    roll: q(roll),
    hit,
    damage,
    fromX: s.position.x,
    fromY: s.position.y,
    toX: target.position.x,
    toY: target.position.y,
  });
}

function melee(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  target: Zombie,
  queue: DamageEntry[],
): void {
  if (s.meleeCooldown > 0 || !target.alive) return;
  const w = world.content.weapons['melee'];
  if (!w) return;
  const d = dist(s.position, target.position);
  if (d > w.rangeMeters + s.collisionRadius + target.collisionRadius) return;
  if (!hasLineOfSight(world, state, s.position, target.position)) return;
  const chance = clamp(
    w.baseAccuracy +
      (s.marksmanship - 50) * 0.003 -
      (s.stress / 100) * 0.15 -
      (s.stamina < 15 ? 0.2 : 0),
    0.2,
    0.95,
  );
  const roll = ctx.rng.next();
  const hit = roll < chance;
  s.meleeCooldown = Math.max(1, Math.round(10 / w.shotsPerSecond));
  s.stamina = Math.max(0, s.stamina - world.rules.combat.meleeStaminaCost);
  s.facing = q(Math.atan2(target.position.y - s.position.y, target.position.x - s.position.x));
  state.stats.meleeAttacks += 1;
  emitNoise(state, s.position, w.noise, 'footstep', s.id);
  if (hit)
    queue.push({
      targetId: target.id,
      sourceId: s.id,
      amount: w.damage,
      bite: false,
      cause: 'melee',
    });
  emit(state, 'MELEE_ATTACK', {
    attackerId: s.id,
    targetId: target.id,
    hit,
    chance: q(chance),
    roll: q(roll),
  });
}

/** Damage to a barrier: planks absorb first, then the door or glass itself. */
function bashBarrier(
  world: World,
  state: GameState,
  door: Door,
  damage: number,
  byId: string,
): void {
  const at = { x: door.cell.x + 0.5, y: door.cell.y + 0.5 };
  if (door.barricade > 0) {
    door.barricade = Math.max(0, door.barricade - damage);
    emitNoise(state, at, world.rules.noise.doorBash, 'door', byId);
    if (door.barricade === 0)
      emit(state, 'DOOR_CHANGED', { doorId: door.id, barricade: 0, byId, barricadeBroken: true });
    return;
  }
  door.hp -= damage;
  if (door.kind === 'window') {
    if (door.hp > 0) {
      emitNoise(state, at, world.rules.noise.doorBash * 0.6, 'glass', byId);
      return;
    }
    door.broken = true;
    emitNoise(state, at, world.rules.barriers.glassBreakNoise, 'glass', byId);
    emit(state, 'DOOR_CHANGED', { doorId: door.id, broken: true, window: true, byId });
    return;
  }
  emitNoise(state, at, world.rules.noise.doorBash, 'door', byId);
  if (door.hp <= 0) {
    door.broken = true;
    door.open = true;
    door.locked = false;
    emit(state, 'DOOR_CHANGED', { doorId: door.id, broken: true, byId });
  }
}

function zombieAttacks(
  world: World,
  state: GameState,
  ctx: TickContext,
  z: Zombie,
  queue: DamageEntry[],
): void {
  const type = zombieType(world, z);
  if (z.attackCooldown > 0) z.attackCooldown -= 1;
  if (state.tick < z.staggerUntil || z.attackCooldown > 0) return;
  if (z.ai.doorTargetId) {
    const door = state.doors.find((d) => d.id === z.ai.doorTargetId);
    z.ai.doorTargetId = null;
    if (door && isDoorClosed(door) && doorAt(world, state, door.cell.x, door.cell.y) === door) {
      bashBarrier(world, state, door, type.doorDamage, z.id);
      z.attackCooldown = Math.round(type.attackCooldownSeconds * 10);
      return;
    }
  }
  if (z.ai.state !== 'pursue' && z.ai.state !== 'attack') return;
  let target: Survivor | null = null;
  let bestD = Infinity;
  for (const s of ctx.survivorHash.query(z.position, 2)) {
    if (!s.alive || s.extracted) continue;
    const d = dist(z.position, s.position);
    if (d > zombieReach(world, z, s)) continue;
    if (!hasLineOfSight(world, state, z.position, s.position)) continue;
    const preferred = s.id === z.ai.targetId ? -0.5 : 0;
    if (d + preferred < bestD) {
      bestD = d + preferred;
      target = s;
    }
  }
  if (!target) return;
  z.attackCooldown = Math.round(type.attackCooldownSeconds * 10);
  z.facing = q(Math.atan2(target.position.y - z.position.y, target.position.x - z.position.x));
  const hit = ctx.rng.next() < type.attackHitChance;
  if (!hit) return;
  const bite = ctx.rng.next() < type.biteChanceOnHit;
  queue.push({
    targetId: target.id,
    sourceId: z.id,
    amount: type.attackDamage,
    bite,
    cause: 'zombie',
  });
}

/** Executes attacks decided this tick. Deterministic order: survivors then zombies, by array order. */
export function resolveCombat(world: World, state: GameState, ctx: TickContext): DamageEntry[] {
  const queue: DamageEntry[] = [];
  for (const s of state.survivors) {
    if (!s.alive || s.extracted || s.isObjectiveCivilian) continue;
    tickWeapon(world, state, s);
    if (s.panicked || !s.attackIntent || !s.targetId) continue;
    const target = ctx.zombiesById.get(s.targetId);
    if (!target || !target.alive) continue;
    if (s.attackIntent === 'fire') fire(world, state, ctx, s, target, queue);
    else melee(world, state, ctx, s, target, queue);
  }
  for (const z of state.zombies) {
    if (z.alive) zombieAttacks(world, state, ctx, z, queue);
  }
  return queue;
}
