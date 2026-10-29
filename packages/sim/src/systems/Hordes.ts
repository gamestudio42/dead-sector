import type { GameState, Horde, NoiseEvent, Vec2 } from '../model/types';
import type { World } from '../model/World';
import { emit, nextId } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { cellCenter, dist } from '../spatial/vec';
import { freeCellsAround, makeZombie } from '../mission/createMission';

/** Noise that stirs the neighbourhood: everything but footsteps and ordinary groans. */
export function raisesAlarm(noise: NoiseEvent): boolean {
  if (noise.category === 'footstep') return false;
  if (noise.category === 'shout') return noise.intensity >= 50; // screams, not groans
  return true;
}

export function alarmLevelFor(world: World, alarm: number): 0 | 1 | 2 | 3 {
  const [a, b, c] = world.rules.alarm.tiers;
  return alarm >= c ? 3 : alarm >= b ? 2 : alarm >= a ? 1 : 0;
}

/** Accumulates the alarm from this tick's loud noises, decays it, and announces level changes. */
export function updateAlarm(world: World, state: GameState, noises: readonly NoiseEvent[]): void {
  const cfg = world.rules.alarm;
  const m = state.mission;
  for (const n of noises) if (raisesAlarm(n)) m.alarm += n.intensity * cfg.perIntensity;
  m.alarm = Math.min(100, Math.max(0, m.alarm - cfg.decayPerSecond * 0.1));
  // rises immediately, falls only 5 points below a threshold (no flicker at the boundary)
  const up = alarmLevelFor(world, m.alarm);
  const down = alarmLevelFor(world, m.alarm + 5);
  const level = up > m.alarmLevel ? up : (Math.min(m.alarmLevel, down) as 0 | 1 | 2 | 3);
  if (level !== m.alarmLevel) {
    emit(state, 'ALARM_CHANGED', { level, previous: m.alarmLevel, alarm: Math.round(m.alarm) });
    m.alarmLevel = level;
  }
}

function spawnerPos(state: GameState, id: string): Vec2 | null {
  const sp = state.mission.spawners.find((s) => s.id === id);
  return sp ? cellCenter(sp.cell.x, sp.cell.y) : null;
}

/** Entry for the next horde: the routed spawner farthest from the squads (they arrive, not appear). */
function chooseSpawner(world: World, state: GameState): string | null {
  const routes = world.mission.hordes?.routes ?? [];
  const alive = state.survivors.filter((s) => s.alive && !s.extracted);
  let best: string | null = null;
  let bestD = -1;
  for (const r of routes) {
    const p = spawnerPos(state, r.spawnerId);
    if (!p) continue;
    const d = alive.reduce((min, s) => Math.min(min, dist(s.position, p)), Infinity);
    if (d > bestD + 1e-9) {
      bestD = d;
      best = r.spawnerId;
    }
  }
  return best;
}

function spawnHorde(world: World, state: GameState, ctx: TickContext, spawnerId: string): boolean {
  const cfg = world.mission.hordes;
  const route = cfg?.routes.find((r) => r.spawnerId === spawnerId);
  const origin = spawnerPos(state, spawnerId);
  if (!cfg || !route || !origin) return false;
  // never pop into view or next to the squads: wait until the entry is clear
  const sp = state.mission.spawners.find((s) => s.id === spawnerId);
  if (sp && state.fog.cells[sp.cell.y * world.width + sp.cell.x] === 2) return false;
  const minD = world.mission.reinforcements.minSurvivorDistance;
  if (state.survivors.some((s) => s.alive && !s.extracted && dist(s.position, origin) < minD))
    return false;
  const taken = new Set<number>();
  for (const z of state.zombies)
    if (z.alive) taken.add(Math.floor(z.position.y) * world.width + Math.floor(z.position.x));
  const cells = freeCellsAround(world, state, origin, cfg.size, taken);
  if (cells.length === 0) return false;
  const horde: Horde = {
    id: nextId(state, 'horde'),
    spawnerId,
    route: route.waypoints.map((w) => cellCenter(w.x, w.y)),
    index: 0,
    direction: 1,
    spawnedAtTick: state.tick,
  };
  cells.forEach((c, i) => {
    const typeId = i < cfg.heavyPerHorde ? 'heavy' : 'walker';
    const z = makeZombie(world, nextId(state, 'zh'), typeId, c, 0, 'wander', state.tick + (i % 5));
    z.hordeId = horde.id;
    z.spawnedBy = spawnerId;
    z.ai.goal = hordeGoal(horde, z.id);
    state.zombies.push(z);
    ctx.zombiesById.set(z.id, z);
  });
  state.hordes.push(horde);
  state.mission.hordesSpawned += 1;
  emit(state, 'HORDE_SPAWNED', { hordeId: horde.id, spawnerId, size: cells.length });
  return true;
}

/** Each member walks to the horde's current waypoint with a stable personal offset (a loose crowd). */
export function hordeGoal(horde: Horde, zombieId: string): Vec2 {
  let h = 0;
  for (let i = 0; i < zombieId.length; i++) h = (h * 31 + zombieId.charCodeAt(i)) | 0;
  const wp = horde.route[horde.index] as Vec2;
  return { x: wp.x + ((Math.abs(h) % 5) - 2) * 0.9, y: wp.y + ((Math.abs(h >> 3) % 5) - 2) * 0.9 };
}

/**
 * Hordes arrive on a timer and earlier when the alarm reaches "caçada"; each is announced
 * `warningSeconds` ahead, then patrols its route back and forth. Members still react to what
 * they see and hear individually and rejoin the crowd when they calm down.
 */
export function updateHordes(world: World, state: GameState, ctx: TickContext): void {
  const cfg = world.mission.hordes;
  const m = state.mission;
  if (!cfg || m.status !== 'running') return;
  const scheduled = m.hordesSpawned + (m.pendingHorde ? 1 : 0);
  if (!m.pendingHorde && scheduled < cfg.max) {
    const timed = m.nextHordeTick >= 0 && state.tick >= m.nextHordeTick;
    // the alarm can bring a horde early, but never two within half an interval of each other
    const gap = Math.round((cfg.intervalSeconds * 10) / 2);
    const alarmed = m.alarmLevel === 3 && state.tick >= m.lastHordeTick + gap;
    if (timed || alarmed) {
      const spawnerId = chooseSpawner(world, state);
      if (spawnerId) {
        const inTicks = Math.round(cfg.warningSeconds * 10);
        m.pendingHorde = { spawnerId, atTick: state.tick + inTicks };
        m.nextHordeTick = state.tick + Math.round(cfg.intervalSeconds * 10);
        m.lastHordeTick = state.tick;
        emit(state, 'HORDE_INCOMING', {
          spawnerId,
          inSeconds: cfg.warningSeconds,
          cause: alarmed && !timed ? 'alarm' : 'time',
        });
      }
    }
  }
  if (m.pendingHorde && state.tick >= m.pendingHorde.atTick) {
    if (spawnHorde(world, state, ctx, m.pendingHorde.spawnerId)) m.pendingHorde = null;
    else m.pendingHorde.atTick = state.tick + 50; // entry busy or watched: try again in 5 s
  }
  if (state.tick % 10 !== 0) return;
  for (const horde of state.hordes) {
    const calm = state.zombies.filter(
      (z) =>
        z.alive && z.hordeId === horde.id && (z.ai.state === 'wander' || z.ai.state === 'idle'),
    );
    if (calm.length === 0) continue;
    const cx = calm.reduce((a, z) => a + z.position.x, 0) / calm.length;
    const cy = calm.reduce((a, z) => a + z.position.y, 0) / calm.length;
    if (dist({ x: cx, y: cy }, horde.route[horde.index] as Vec2) > 4) continue;
    if (horde.route.length === 1) continue;
    const next = horde.index + horde.direction;
    if (next < 0 || next >= horde.route.length) horde.direction = horde.direction === 1 ? -1 : 1;
    horde.index += horde.direction;
    for (const z of calm) z.ai.goal = hordeGoal(horde, z.id);
  }
}
