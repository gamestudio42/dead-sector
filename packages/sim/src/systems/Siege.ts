import type { GameState, Vec2 } from '../model/types';
import type { World } from '../model/World';
import { emit, nextId } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { cellCenter, dist } from '../spatial/vec';
import { blocksMovement } from '../spatial/Grid';
import { freeCellsAround, makeZombie } from '../mission/createMission';
import { inRect } from './Objectives';

/** A walkable cell inside the defended area, picked from the seeded stream. */
function targetInZone(world: World, state: GameState, ctx: TickContext): Vec2 {
  const z = world.mission.objectives.defence!.zone;
  for (let i = 0; i < 30; i++) {
    const x = ctx.rng.int(z.x0, z.x1);
    const y = ctx.rng.int(z.y0, z.y1);
    if (!blocksMovement(world, state, x, y)) return cellCenter(x, y);
  }
  return { x: (z.x0 + z.x1 + 1) / 2, y: (z.y0 + z.y1 + 1) / 2 };
}

/**
 * Defence missions. The siege is announced `warningSeconds` ahead, then waves arrive at their
 * entries on a timetable. Every infected in a wave already knows where the squads are holed up:
 * it heads for a cell inside the defended area and breaks whatever door, window or barricade is
 * in the way. A wave whose entry is watched or crowded waits and retries every 2 s.
 */
export function updateSiege(world: World, state: GameState, ctx: TickContext): void {
  const def = world.mission.objectives.defence;
  const m = state.mission;
  if (!def || m.status !== 'running' || m.siegeStartTick < 0) return;
  const warnAt = m.siegeStartTick - Math.round(def.warningSeconds * 10);
  if (!m.siegeAnnounced && state.tick >= warnAt) {
    m.siegeAnnounced = true;
    emit(state, 'SIEGE_INCOMING', {
      inSeconds: Math.max(0, Math.round((m.siegeStartTick - state.tick) / 10)),
      waves: def.waves.length,
    });
  }
  if (m.wavesSpawned >= def.waves.length) return;
  const wave = def.waves[m.wavesSpawned]!;
  const due = m.siegeStartTick + Math.round(wave.atSeconds * 10);
  if (state.tick < due || (state.tick - due) % 20 !== 0) return;

  const alive = state.survivors.filter((s) => s.alive && !s.extracted);
  const minD = world.mission.reinforcements.minSurvivorDistance;
  const entries = wave.spawnerIds
    .map((id) => m.spawners.find((s) => s.id === id))
    .filter((sp): sp is NonNullable<typeof sp> => !!sp)
    .filter((sp) => {
      const p = cellCenter(sp.cell.x, sp.cell.y);
      return (
        state.fog.cells[sp.cell.y * world.width + sp.cell.x] !== 2 &&
        !alive.some((s) => dist(s.position, p) < minD)
      );
    });
  if (entries.length === 0) return;

  const types: string[] = [
    ...Array<string>(wave.heavies).fill('heavy'),
    ...Array<string>(wave.runners).fill('runner'),
    ...Array<string>(wave.walkers).fill('walker'),
  ];
  const taken = new Set<number>();
  for (const z of state.zombies)
    if (z.alive) taken.add(Math.floor(z.position.y) * world.width + Math.floor(z.position.x));
  // split the wave across the open entries, in order
  const share = Math.ceil(types.length / entries.length);
  let spawned = 0;
  entries.forEach((sp, e) => {
    const group = types.slice(e * share, (e + 1) * share);
    const cells = freeCellsAround(
      world,
      state,
      cellCenter(sp.cell.x, sp.cell.y),
      group.length,
      taken,
    );
    cells.forEach((c, i) => {
      const z = makeZombie(
        world,
        nextId(state, 'zs'),
        group[i]!,
        c,
        0,
        'investigate',
        state.tick + (i % 5),
      );
      const goal = targetInZone(world, state, ctx);
      z.ai.goal = goal;
      z.ai.lastKnownPos = { ...goal };
      // they keep coming for a long while before they give up and search
      z.ai.stateUntil = state.tick + 1200;
      z.spawnedBy = sp.id;
      state.zombies.push(z);
      ctx.zombiesById.set(z.id, z);
      spawned++;
    });
  });
  m.wavesSpawned += 1;
  emit(state, 'SIEGE_WAVE', {
    wave: m.wavesSpawned,
    of: def.waves.length,
    size: spawned,
    spawnerIds: entries.map((sp) => sp.id),
  });
}

/** Runs the hold timer: it counts while a squad member is inside the defended area. */
export function updateDefenceHold(world: World, state: GameState): boolean {
  const def = world.mission.objectives.defence;
  const m = state.mission;
  if (!def || m.defenceDone || m.siegeStartTick < 0 || state.tick < m.siegeStartTick) return false;
  const holding = state.survivors.some(
    (s) => s.squadId !== null && s.alive && !s.extracted && inRect(s.position, def.zone),
  );
  if (holding !== m.defenceHolding) {
    m.defenceHolding = holding;
    emit(state, 'DEFENCE_HOLD_CHANGED', {
      holding,
      secondsLeft: Math.ceil((m.defenceRequiredTicks - m.defenceHoldTicks) / 10),
    });
  }
  if (holding) m.defenceHoldTicks += 1;
  if (m.defenceHoldTicks >= m.defenceRequiredTicks) {
    m.defenceDone = true;
    m.defenceHolding = false;
    emit(state, 'DEFENCE_COMPLETED', {});
    return true;
  }
  return false;
}
