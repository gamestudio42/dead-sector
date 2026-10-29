import type { ContentBundle, SurvivorTemplate } from '@dead-sector/content';
import type {
  Door,
  GameState,
  ObjectiveId,
  Squad,
  Survivor,
  Vec2,
  Zombie,
  ZombieStateName,
} from '../model/types';
import { createWorld, parseTiles, type World } from '../model/World';
import { SeededRng, seedToRngState } from '../engine/SeededRng';
import { blocksMovement } from '../spatial/Grid';
import { cellCenter, dist } from '../spatial/vec';

export const SCHEMA_VERSION = 2;
export const SURVIVOR_RADIUS = 0.25;
export const ZOMBIE_RADIUS = 0.28;

export const OBJECTIVE_ORDER: ObjectiveId[] = [
  'enterPerimeter',
  'collectMedicine',
  'rescueCivilian',
  'activateExtraction',
  'holdExtraction',
];

function makeSurvivor(
  t: Pick<
    SurvivorTemplate,
    | 'id'
    | 'name'
    | 'role'
    | 'courage'
    | 'discipline'
    | 'leadership'
    | 'marksmanship'
    | 'medicine'
    | 'mechanics'
    | 'stealth'
  >,
  position: Vec2,
  squadId: string | null,
  isLeader: boolean,
  maxHealth: number,
  weapon: Survivor['weapon'],
): Survivor {
  return {
    id: t.id,
    kind: 'survivor',
    templateId: t.id,
    name: t.name,
    role: t.role,
    squadId,
    isLeader,
    isObjectiveCivilian: squadId === null,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    facing: Math.PI / 2,
    health: maxHealth,
    maxHealth,
    alive: true,
    collisionRadius: SURVIVOR_RADIUS,
    stamina: 100,
    stress: 0,
    band: 'calm',
    panicked: false,
    panicSinceTick: 0,
    courage: t.courage,
    discipline: t.discipline,
    leadership: t.leadership,
    marksmanship: t.marksmanship,
    medicine: t.medicine,
    mechanics: t.mechanics,
    stealth: t.stealth,
    pendingImpulses: [],
    weapon,
    meleeCooldown: 0,
    path: [],
    pathIndex: 0,
    slot: null,
    moving: false,
    moveMode: 'move',
    activity: squadId === null ? 'waiting' : 'idle',
    reason: null,
    targetId: null,
    attackIntent: null,
    pauseMove: false,
    interaction: null,
    stuckCheckTick: 0,
    stuckCheckPos: { ...position },
    replans: 0,
    fleeReplanTick: 0,
    infection: 'healthy',
    infectionTicks: 0,
    bitten: false,
    lastHitTick: -1,
    rescued: false,
    followTargetId: null,
    seenZombieIds: [],
    shotsFired: 0,
    kills: 0,
    extracted: false,
    outOfAmmoReported: false,
  };
}

export function makeZombie(
  world: World,
  id: string,
  typeId: string,
  position: Vec2,
  facing: number,
  state: ZombieStateName,
  thinkOffset: number,
): Zombie {
  const type = world.content.zombieTypes[typeId];
  if (!type) throw new Error(`Unknown zombie type ${typeId}`);
  return {
    id,
    kind: 'zombie',
    typeId,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    facing,
    health: type.maxHealth,
    maxHealth: type.maxHealth,
    alive: true,
    collisionRadius: ZOMBIE_RADIUS,
    ai: {
      state,
      nextThinkTick: thinkOffset,
      targetId: null,
      lastKnownPos: null,
      lastSeenTick: -1,
      goal: null,
      stateUntil: thinkOffset + 20,
      heard: null,
      doorTargetId: null,
    },
    staggerUntil: 0,
    attackCooldown: 0,
    path: [],
    pathIndex: 0,
    pathGoalCell: -1,
    spawnedBy: null,
  };
}

/** Formation-friendly free cells around a point (ring order, deterministic). */
export function freeCellsAround(
  world: World,
  state: GameState,
  center: Vec2,
  count: number,
  taken: Set<number>,
): Vec2[] {
  const out: Vec2[] = [];
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  for (let r = 0; r <= 6 && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy++) {
      for (let dx = -r; dx <= r && out.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        const k = y * world.width + x;
        if (taken.has(k) || blocksMovement(world, state, x, y)) continue;
        taken.add(k);
        out.push(cellCenter(x, y));
      }
    }
  }
  return out;
}

/** Builds the deterministic initial GameState for a mission and seed. */
export function createMissionState(
  content: ContentBundle,
  missionId: string,
  seed: number,
): GameState {
  const mission = content.missions[missionId];
  if (!mission) throw new Error(`Unknown mission ${missionId}`);
  const map = content.maps[mission.mapId];
  if (!map) throw new Error(`Unknown map ${mission.mapId}`);
  const tiles = parseTiles(map);
  const doors: Door[] = [];
  tiles.forEach((t, i) => {
    if (t === 'doorClosed' || t === 'doorOpen' || t === 'doorLocked') {
      const x = i % map.width;
      const y = (i - x) / map.width;
      const hp = t === 'doorLocked' ? 220 : 120;
      doors.push({
        id: `door-${x}-${y}`,
        cell: { x, y },
        open: t === 'doorOpen',
        locked: t === 'doorLocked',
        broken: false,
        hp,
        maxHp: hp,
      });
    }
  });
  const world = createWorld(content, missionId, doors);
  const difficulty = world.difficulty;

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    tick: 0,
    seed,
    rngState: seedToRngState(seed),
    missionId,
    mapId: mission.mapId,
    difficultyId: mission.difficultyId,
    nextId: 0,
    squads: [],
    survivors: [],
    zombies: [],
    doors,
    fog: { cells: new Array(map.width * map.height).fill(0) },
    contacts: [],
    pendingNoises: [],
    recentNoises: [],
    objectives: OBJECTIVE_ORDER.map((id) => ({ id, status: 'pending', completedAtTick: null })),
    mission: {
      status: 'running',
      endReason: null,
      endedAtTick: null,
      timeLimitTicks: Math.round(mission.timeLimitSeconds * 10),
      medicineCollected: false,
      civilianRescued: false,
      extractionActive: false,
      extractionStartedTick: null,
      extractionHoldTicks: 0,
      extractionHoldRequiredTicks: Math.round(mission.objectives.extraction.holdSeconds * 10),
      extractionReady: false,
      nextPulseTick: 0,
      reinforcementsSpawned: 0,
      reinforcementBudget: Math.round(
        mission.reinforcements.budget * difficulty.reinforcementBudgetMultiplier,
      ),
      spawners: mission.spawners.map((s) => ({
        id: s.id,
        cell: { ...s.cell },
        pressure: 0,
        cooldownUntil: 0,
        lastNoisePos: null,
      })),
    },
    stats: {
      shotsFired: 0,
      hits: 0,
      meleeAttacks: 0,
      zombiesKilled: 0,
      totalNoise: 0,
      noiseEvents: 0,
      panicEvents: 0,
      bites: 0,
      damageTaken: 0,
      ordersIssued: 0,
      ordersBlocked: 0,
      ammoUsed: 0,
    },
    events: [],
    eventLog: [],
  };
  const rng = new SeededRng(state);
  const taken = new Set<number>();

  for (const sq of mission.squads) {
    const cells = freeCellsAround(world, state, sq.spawn, sq.memberIds.length, taken);
    const squad: Squad = {
      id: sq.id,
      displayName: sq.displayName,
      memberIds: [],
      leaderId: null,
      order: null,
      firePolicy: sq.firePolicy,
      moveMode: sq.moveMode,
      waypoints: [],
      spawn: { ...sq.spawn },
    };
    sq.memberIds.forEach((memberId, i) => {
      const t = content.survivors[memberId];
      if (!t) throw new Error(`Unknown survivor ${memberId}`);
      const w = content.weapons[t.weaponId];
      if (!w) throw new Error(`Unknown weapon ${t.weaponId}`);
      const s = makeSurvivor(t, cells[i] ?? sq.spawn, sq.id, t.isLeader, t.maxHealth, {
        weaponId: w.id,
        magazineRounds: w.magazineCapacity,
        reserveRounds: t.reserveRounds,
        magazineCapacity: w.magazineCapacity,
        reloadTicks: Math.round(w.reloadSeconds * 10),
        reloadRemaining: 0,
        cooldown: 0,
      });
      s.moveMode = sq.moveMode;
      squad.memberIds.push(s.id);
      if (t.isLeader && !squad.leaderId) squad.leaderId = s.id;
      state.survivors.push(s);
    });
    state.squads.push(squad);
  }

  const civ = mission.civilian;
  const civilian = makeSurvivor(
    {
      id: civ.id,
      name: civ.name,
      role: civ.role,
      courage: 30,
      discipline: 30,
      leadership: 10,
      marksmanship: 10,
      medicine: 10,
      mechanics: 10,
      stealth: 60,
    },
    civ.position,
    null,
    false,
    civ.maxHealth,
    {
      weaponId: 'melee',
      magazineRounds: 0,
      reserveRounds: 0,
      magazineCapacity: 0,
      reloadTicks: 0,
      reloadRemaining: 0,
      cooldown: 0,
    },
  );
  state.survivors.push(civilian);

  const spawns = mission.squads.map((s) => s.spawn);
  for (const zone of mission.zombieZones) {
    for (let i = 0; i < zone.count; i++) {
      let pos: Vec2 | null = null;
      for (let attempt = 0; attempt < 80 && !pos; attempt++) {
        const x = rng.int(zone.rect.x0, zone.rect.x1);
        const y = rng.int(zone.rect.y0, zone.rect.y1);
        const k = y * map.width + x;
        if (taken.has(k) || blocksMovement(world, state, x, y)) continue;
        const c = cellCenter(x, y);
        if (spawns.some((sp) => dist(sp, c) < 20)) continue;
        if (dist(c, civ.position) < 2.5) continue;
        taken.add(k);
        pos = c;
      }
      if (!pos) continue;
      const id = `z-${state.zombies.length + 1}`;
      const initial: ZombieStateName = rng.chance(0.5) ? 'idle' : 'wander';
      state.zombies.push(
        makeZombie(world, id, zone.typeId, pos, rng.range(0, Math.PI * 2), initial, rng.int(0, 9)),
      );
    }
  }
  return state;
}
