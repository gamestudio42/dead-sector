import type { GameState, Squad, Survivor } from '../model/types';
import type { World } from '../model/World';
import { emit, nextId } from '../engine/EventBus';
import { makeZombie } from '../mission/createMission';
import type { TickContext } from '../engine/TickContext';
import { dist } from '../spatial/vec';
import type { DamageEntry } from './Combat';
import { aliveMembers } from './Orders';

function addImpulse(s: Survivor, id: string, amount: number): void {
  if (!s.alive) return;
  if (s.pendingImpulses.some((i) => i.id === id)) return;
  s.pendingImpulses.push({ id, amount });
}

function handleSurvivorDeath(
  world: World,
  state: GameState,
  ctx: TickContext,
  s: Survivor,
  killerId: string,
  cause: 'wounds' | 'turned' = 'wounds',
): void {
  s.alive = false;
  s.health = 0;
  s.activity = 'dead';
  s.path = [];
  s.pathIndex = 0;
  s.interaction = null;
  s.attackIntent = null;
  s.targetId = null;
  s.panicked = false;
  emit(state, 'ACTOR_KILLED', {
    actorId: s.id,
    kind: 'survivor',
    killerId,
    name: s.name,
    civilian: s.isObjectiveCivilian,
    cause,
  });
  const imp = world.rules.stress.impulses;
  for (const other of state.survivors) {
    if (!other.alive || other === s) continue;
    if (s.isObjectiveCivilian) {
      addImpulse(other, `civdeath-${s.id}`, imp.civilianDeath);
    } else if (other.squadId === s.squadId || dist(other.position, s.position) < 15) {
      addImpulse(other, `death-${s.id}`, imp.allyDeath);
    }
  }
  if (!s.squadId) return;
  const squad = state.squads.find((q) => q.id === s.squadId) as Squad;
  if (squad.leaderId === s.id) {
    s.isLeader = false;
    const candidates = aliveMembers(state, ctx, squad).sort(
      (a, b) => b.leadership - a.leadership || (a.id < b.id ? -1 : 1),
    );
    const next = candidates[0] ?? null;
    squad.leaderId = next?.id ?? null;
    if (next) next.isLeader = true;
    emit(state, 'LEADER_CHANGED', {
      squadId: squad.id,
      previousLeaderId: s.id,
      leaderId: squad.leaderId,
    });
    for (const m of candidates) addImpulse(m, `leaderdeath-${s.id}`, imp.leaderDeath);
  }
  if (squad.order && squad.order.interactorId === s.id && squad.order.status === 'executing') {
    squad.order.status = 'interrupted';
  }
}

/** Applies queued damage in order; death is processed exactly once per entity. */
export function resolveDamageAndInfection(
  world: World,
  state: GameState,
  ctx: TickContext,
  queue: DamageEntry[],
): void {
  for (const hit of queue) {
    const z = ctx.zombiesById.get(hit.targetId);
    if (z) {
      if (!z.alive) continue;
      z.health -= hit.amount;
      const staggerFactor = world.content.zombieTypes[z.typeId]?.staggerFactor ?? 1;
      z.staggerUntil =
        state.tick + Math.round(world.rules.combat.zombieStaggerSeconds * 10 * staggerFactor);
      if (z.health <= 0) {
        z.health = 0;
        z.alive = false;
        z.path = [];
        state.stats.zombiesKilled += 1;
        const killer = ctx.survivorsById.get(hit.sourceId);
        if (killer) killer.kills += 1;
        emit(state, 'ACTOR_KILLED', {
          actorId: z.id,
          kind: 'zombie',
          killerId: hit.sourceId,
          typeId: z.typeId,
          cause: hit.cause,
        });
      } else if (z.ai.state !== 'pursue' && z.ai.state !== 'attack') {
        // being hurt is a stimulus: look towards the attacker's position (it was physically perceived)
        const src = ctx.survivorsById.get(hit.sourceId);
        if (src) z.ai.heard = { position: { ...src.position }, intensity: 100, tick: state.tick };
      }
      continue;
    }
    const s = ctx.survivorsById.get(hit.targetId);
    if (!s || !s.alive) continue;
    s.health -= hit.amount;
    s.lastHitTick = state.tick;
    state.stats.damageTaken += hit.amount;
    addImpulse(s, `wound-${state.tick}`, world.rules.stress.impulses.wound);
    if (hit.bite) {
      state.stats.bites += 1;
      s.bitten = true;
      addImpulse(s, `bite-${state.tick}`, world.rules.stress.impulses.bite);
      if (s.infection === 'healthy' && ctx.rng.next() < world.difficulty.infectionChanceOnBite) {
        s.infection = 'exposed';
        s.infectionTicks = 0;
      }
    }
    emit(state, 'ACTOR_INJURED', {
      actorId: s.id,
      damage: hit.amount,
      health: Math.max(0, s.health),
      bitten: hit.bite,
      sourceId: hit.sourceId,
    });
    if (s.health <= 0) handleSurvivorDeath(world, state, ctx, s, hit.sourceId);
  }

  progressInfection(world, state, ctx);
}

/** A squad medic close by slows the infection (spec 7.4: treatment buys time, never cures). */
function medicNearby(state: GameState, ctx: TickContext, s: Survivor): boolean {
  if (!s.squadId) return false;
  const squad = state.squads.find((q) => q.id === s.squadId);
  return !!squad?.memberIds.some((id) => {
    const m = ctx.survivorsById.get(id);
    return (
      !!m &&
      m !== s &&
      m.alive &&
      !m.panicked &&
      m.medicine >= 50 &&
      dist(m.position, s.position) <= 4
    );
  });
}

/**
 * Infection advances on mission time: exposed → infected → critical → turned. Turning kills the
 * survivor (counted once, like any death) and an infected rises in the same spot.
 */
function progressInfection(world: World, state: GameState, ctx: TickContext): void {
  const inf = world.rules.infection;
  const stages: Record<string, number> = {
    exposed: inf.exposedToInfectedSeconds * 10,
    infected: inf.infectedToCriticalSeconds * 10,
    critical: inf.criticalToTurnSeconds * 10,
  };
  for (const s of state.survivors) {
    if (!s.alive || s.extracted || s.infection === 'healthy') continue;
    // with a medic nearby the clock only advances on part of the ticks (deterministic, no RNG)
    const step = medicNearby(state, ctx, s) ? inf.medicSlowFactor : 1;
    s.infectionTicks += step;
    const limit = stages[s.infection] ?? Infinity;
    if (s.infectionTicks < limit) continue;
    s.infectionTicks = 0;
    if (s.infection === 'exposed') s.infection = 'infected';
    else if (s.infection === 'infected') s.infection = 'critical';
    else turnSurvivor(world, state, ctx, s);
  }
}

function turnSurvivor(world: World, state: GameState, ctx: TickContext, s: Survivor): void {
  const pos = { ...s.position };
  handleSurvivorDeath(world, state, ctx, s, s.id, 'turned');
  const id = nextId(state, 'zt');
  const z = makeZombie(world, id, 'walker', pos, s.facing, 'idle', state.tick + 1);
  z.spawnedBy = s.id;
  state.zombies.push(z);
  ctx.zombiesById.set(z.id, z);
  emit(state, 'SURVIVOR_TURNED', {
    survivorId: s.id,
    zombieId: id,
    x: pos.x,
    y: pos.y,
    name: s.name,
  });
  // watching a friend turn is the worst thing that can happen to morale
  for (const other of state.survivors) {
    if (other.alive && other !== s && dist(other.position, pos) < 15)
      addImpulse(other, `turned-${s.id}`, world.rules.stress.impulses.allyDeath * 1.5);
  }
}
