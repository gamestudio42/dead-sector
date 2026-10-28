import type { Rect } from '@dead-sector/content';
import type {
  GameState,
  MissionEndReason,
  MissionStatus,
  ObjectiveId,
  Squad,
  Survivor,
  Vec2,
} from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { dist } from '../spatial/vec';
import { emitNoise } from './Noise';
import { BEACON_ID, CABINET_ID, listInteractables, pathMemberTo } from './Orders';
import { pathDone } from './SurvivorAI';

export const inRect = (p: Vec2, r: Rect): boolean =>
  p.x >= r.x0 && p.x < r.x1 + 1 && p.y >= r.y0 && p.y < r.y1 + 1;

function completeObjective(state: GameState, id: ObjectiveId): void {
  const o = state.objectives.find((x) => x.id === id);
  if (!o || o.status !== 'pending') return;
  o.status = 'completed';
  o.completedAtTick = state.tick;
  emit(state, 'OBJECTIVE_COMPLETED', { objectiveId: id });
}

function interactionTicks(
  world: World,
  state: GameState,
  s: Survivor,
  kind: string,
  targetId: string,
): number {
  const i = world.rules.interaction;
  switch (kind) {
    case 'door': {
      const door = state.doors.find((d) => d.id === targetId);
      if (door?.locked)
        return Math.round(
          Math.max(i.doorForceSecondsMin, i.doorForceSecondsBase - s.mechanics / 25) * 10,
        );
      return Math.round(i.doorToggleSeconds * 10);
    }
    case 'cabinet':
      return Math.round(world.mission.objectives.cabinet.interactSeconds * 10);
    case 'civilian':
      return Math.round(world.mission.objectives.civilianRescueSeconds * 10);
    default:
      return Math.round(world.mission.objectives.extraction.activateSeconds * 10);
  }
}

function applyInteraction(
  world: World,
  state: GameState,
  ctx: TickContext,
  squad: Squad,
  s: Survivor,
  kind: string,
  targetId: string,
): boolean {
  if (kind === 'door') {
    const door = state.doors.find((d) => d.id === targetId);
    if (!door || door.broken) return false;
    if (door.locked) {
      door.locked = false;
      door.open = true;
      emitNoise(
        state,
        { x: door.cell.x + 0.5, y: door.cell.y + 0.5 },
        world.rules.noise.doorForce,
        'door',
        s.id,
      );
      emit(state, 'DOOR_CHANGED', { doorId: door.id, open: true, forced: true, byId: s.id });
      return true;
    }
    if (door.open) {
      const occupied = [...state.survivors, ...state.zombies].some(
        (a) =>
          a.alive &&
          Math.floor(a.position.x) === door.cell.x &&
          Math.floor(a.position.y) === door.cell.y,
      );
      if (occupied) return false;
      door.open = false;
    } else door.open = true;
    emitNoise(
      state,
      { x: door.cell.x + 0.5, y: door.cell.y + 0.5 },
      world.rules.noise.doorOpen,
      'door',
      s.id,
    );
    emit(state, 'DOOR_CHANGED', { doorId: door.id, open: door.open, byId: s.id });
    return true;
  }
  if (kind === 'cabinet') {
    state.mission.medicineCollected = true;
    completeObjective(state, 'collectMedicine');
    return true;
  }
  if (kind === 'civilian') {
    const civ = ctx.survivorsById.get(targetId);
    if (!civ || !civ.alive) return false;
    civ.rescued = true;
    civ.followTargetId = squad.leaderId ?? s.id;
    civ.activity = 'following';
    state.mission.civilianRescued = true;
    completeObjective(state, 'rescueCivilian');
    return true;
  }
  if (kind === 'beacon') {
    if (!state.mission.medicineCollected) return false;
    const ex = world.mission.objectives.extraction;
    state.mission.extractionActive = true;
    state.mission.extractionStartedTick = state.tick;
    state.mission.nextPulseTick = state.tick + Math.round(ex.pulseSeconds * 10);
    emitNoise(state, ex.beacon, ex.activationNoise, 'alarm', s.id);
    emit(state, 'EXTRACTION_STARTED', { squadId: squad.id, survivorId: s.id });
    completeObjective(state, 'activateExtraction');
    return true;
  }
  return false;
}

/** Progresses timed interactions (doors, cabinet, civilian, beacon); any threat resets them. */
export function updateInteractions(world: World, state: GameState, ctx: TickContext): void {
  for (const squad of state.squads) {
    const order = squad.order;
    if (!order || order.type !== 'interact' || order.status !== 'executing' || !order.interactorId)
      continue;
    const s = ctx.survivorsById.get(order.interactorId);
    const target = listInteractables(world, state).find((i) => i.id === order.targetEntityId);
    if (!s || !s.alive || !target) {
      order.status = 'interrupted';
      continue;
    }
    if (!target.available) {
      order.status = 'completed';
      emit(state, 'ORDER_COMPLETED', {
        squadId: squad.id,
        orderId: order.id,
        orderType: order.type,
      });
      continue;
    }
    if (s.panicked) continue;
    const inReach = dist(s.position, target.position) <= 1.75;
    if (!inReach) {
      if (pathDone(s) && s.slot && state.tick % 10 === 0) pathMemberTo(world, state, s, s.slot);
      continue;
    }
    const threatened =
      s.lastHitTick === state.tick ||
      s.seenZombieIds.some((id) => {
        const z = ctx.zombiesById.get(id);
        return (
          !!z && z.alive && dist(z.position, s.position) <= world.rules.interaction.interruptRadius
        );
      });
    if (threatened) {
      if (s.interaction && s.interaction.progressTicks > 0) {
        emit(state, 'INTERACTION_INTERRUPTED', {
          survivorId: s.id,
          kind: target.kind,
          targetId: target.id,
          reason: 'threat',
        });
      }
      s.interaction = null;
      continue;
    }
    if (!s.interaction || s.interaction.targetId !== target.id) {
      s.interaction = {
        kind: target.kind,
        targetId: target.id,
        totalTicks: interactionTicks(world, state, s, target.kind, target.id),
        progressTicks: 0,
      };
      s.path = [];
      s.pathIndex = 0;
      emit(state, 'INTERACTION_STARTED', {
        survivorId: s.id,
        kind: target.kind,
        targetId: target.id,
        ticks: s.interaction.totalTicks,
      });
    }
    s.interaction.progressTicks += 1;
    s.activity = 'interacting';
    s.facing = Math.atan2(target.position.y - s.position.y, target.position.x - s.position.x);
    if (s.interaction.progressTicks >= s.interaction.totalTicks) {
      const ok = applyInteraction(world, state, ctx, squad, s, target.kind, target.id);
      s.interaction = null;
      if (ok) {
        order.status = 'completed';
        emit(state, 'ORDER_COMPLETED', {
          squadId: squad.id,
          orderId: order.id,
          orderType: order.type,
        });
      } else {
        order.status = 'blocked';
        order.blockedReason = 'invalidTarget';
        state.stats.ordersBlocked += 1;
        emit(state, 'ORDER_BLOCKED', {
          squadId: squad.id,
          orderId: order.id,
          orderType: order.type,
          reason: 'obstructed',
        });
      }
    }
  }
}

export function endMission(
  state: GameState,
  world: World,
  status: MissionStatus,
  reason: MissionEndReason,
): void {
  if (state.mission.status !== 'running') return;
  const zone = world.mission.objectives.extraction.zone;
  if (status === 'success' || status === 'partial') {
    for (const s of state.survivors) {
      if (s.alive && inRect(s.position, zone) && (s.squadId !== null || s.rescued))
        s.extracted = true;
    }
    if (status === 'success') completeObjective(state, 'holdExtraction');
  }
  for (const o of state.objectives)
    if (o.status === 'pending' && status === 'failed') o.status = 'failed';
  state.mission.status = status;
  state.mission.endReason = reason;
  state.mission.endedAtTick = state.tick;
  for (const sq of state.squads)
    if (sq.order && sq.order.status === 'executing') sq.order.status = 'cancelled';
  emit(state, 'MISSION_ENDED', { status, reason, tick: state.tick });
}

export function civilianOf(state: GameState): Survivor | undefined {
  return state.survivors.find((s) => s.isObjectiveCivilian);
}

/** Objective, extraction and win/fail evaluation, run once per tick after damage. */
export function evaluateObjectives(world: World, state: GameState): void {
  const m = state.mission;
  if (m.status !== 'running') return;
  const mission = world.mission;
  const squadSurvivors = state.survivors.filter((s) => s.squadId !== null && s.alive);
  const civ = civilianOf(state);

  if (squadSurvivors.some((s) => inRect(s.position, mission.objectives.perimeter)))
    completeObjective(state, 'enterPerimeter');

  if (squadSurvivors.length === 0) return endMission(state, world, 'failed', 'allDead');
  if (civ && !civ.alive) return endMission(state, world, 'failed', 'civilianDied');

  if (m.extractionActive) {
    const ex = mission.objectives.extraction;
    const inZone = squadSurvivors.filter((s) => inRect(s.position, ex.zone));
    if (state.tick >= m.nextPulseTick) {
      emitNoise(state, ex.beacon, ex.pulseNoise, 'alarm');
      m.nextPulseTick = state.tick + Math.round(ex.pulseSeconds * 10);
    }
    if (inZone.length > 0)
      m.extractionHoldTicks = Math.min(m.extractionHoldRequiredTicks, m.extractionHoldTicks + 1);
    else if (!m.extractionReady) m.extractionHoldTicks = 0;
    if (!m.extractionReady && m.extractionHoldTicks >= m.extractionHoldRequiredTicks) {
      m.extractionReady = true;
      emit(state, 'EXTRACTION_READY', {});
    }
    if (
      m.extractionReady &&
      inZone.length > 0 &&
      civ &&
      civ.alive &&
      civ.rescued &&
      inRect(civ.position, ex.zone)
    ) {
      return endMission(state, world, 'success', 'extracted');
    }
  }

  if (state.tick >= m.timeLimitTicks) return endMission(state, world, 'failed', 'timeLimit');
}

/** Player confirmation to leave without the civilian once the extraction hold has completed. */
export function confirmExtraction(world: World, state: GameState): boolean {
  const m = state.mission;
  if (m.status !== 'running' || !m.extractionReady) return false;
  const zone = world.mission.objectives.extraction.zone;
  const anyIn = state.survivors.some(
    (s) => s.squadId !== null && s.alive && inRect(s.position, zone),
  );
  if (!anyIn) return false;
  const civ = civilianOf(state);
  if (civ && civ.alive && civ.rescued && inRect(civ.position, zone))
    endMission(state, world, 'success', 'extracted');
  else endMission(state, world, 'partial', 'extractedWithoutCivilian');
  return true;
}

export { CABINET_ID, BEACON_ID };
