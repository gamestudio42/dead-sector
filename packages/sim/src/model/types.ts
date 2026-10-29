import type { FirePolicy, MoveMode } from '@dead-sector/content';

export type { FirePolicy, MoveMode };
export type EntityId = string;
export type SquadId = string;
export type Tick = number;

export interface Vec2 {
  x: number;
  y: number;
}

export type OrderType =
  'move' | 'sneak' | 'sprint' | 'hold' | 'hide' | 'attack' | 'retreat' | 'interact' | 'regroup';

export type OrderStatus =
  'queued' | 'planning' | 'executing' | 'completed' | 'blocked' | 'interrupted' | 'cancelled';

export type BlockReason =
  'noPath' | 'stuck' | 'locked' | 'invalidTarget' | 'noMembers' | 'requiresMedicine';

export interface SquadOrder {
  id: string;
  squadId: SquadId;
  type: OrderType;
  issuedAtTick: Tick;
  targetPosition?: Vec2;
  targetEntityId?: EntityId;
  status: OrderStatus;
  mode: MoveMode;
  /** Planned centroid route, for UI route visualization only. */
  routePreview: Vec2[];
  interactorId?: EntityId;
  blockedReason?: BlockReason;
}

export interface ActorCore {
  id: EntityId;
  position: Vec2;
  velocity: Vec2;
  facing: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  collisionRadius: number;
}

export type StressBand = 'calm' | 'alert' | 'shaken' | 'panic' | 'breakdown';
export type InfectionStage = 'healthy' | 'exposed' | 'infected' | 'critical';

export interface WeaponState {
  weaponId: string;
  magazineRounds: number;
  reserveRounds: number;
  magazineCapacity: number;
  reloadTicks: number;
  reloadRemaining: number;
  cooldown: number;
}

export type SurvivorActivity =
  | 'idle'
  | 'moving'
  | 'holding'
  | 'hiding'
  | 'reloading'
  | 'firing'
  | 'melee'
  | 'fleeing'
  | 'frozen'
  | 'interacting'
  | 'following'
  | 'waiting'
  | 'refusing'
  | 'dead';

export type InteractKind = 'door' | 'cabinet' | 'civilian' | 'beacon';

export interface Interaction {
  kind: InteractKind;
  targetId: string;
  totalTicks: number;
  progressTicks: number;
}

export interface StressImpulse {
  id: string;
  amount: number;
}

export interface Survivor extends ActorCore {
  kind: 'survivor';
  templateId: string;
  name: string;
  role: string;
  squadId: SquadId | null;
  isLeader: boolean;
  isObjectiveCivilian: boolean;
  stamina: number;
  stress: number;
  band: StressBand;
  panicked: boolean;
  panicSinceTick: Tick;
  courage: number;
  discipline: number;
  leadership: number;
  marksmanship: number;
  medicine: number;
  mechanics: number;
  stealth: number;
  pendingImpulses: StressImpulse[];
  weapon: WeaponState;
  meleeCooldown: number;
  path: Vec2[];
  pathIndex: number;
  slot: Vec2 | null;
  moving: boolean;
  moveMode: MoveMode;
  activity: SurvivorActivity;
  /** Machine-readable reason for the current autonomous behaviour (localized by UI). */
  reason: string | null;
  targetId: EntityId | null;
  /** Attack decided by SurvivorAI this tick and executed by Combat. */
  attackIntent: 'fire' | 'melee' | null;
  /** Set by AI when the survivor must stand still this tick (bracing, aiming on attack orders). */
  pauseMove: boolean;
  interaction: Interaction | null;
  stuckCheckTick: Tick;
  stuckCheckPos: Vec2;
  replans: number;
  fleeReplanTick: Tick;
  infection: InfectionStage;
  infectionTicks: number;
  bitten: boolean;
  lastHitTick: Tick;
  rescued: boolean;
  followTargetId: EntityId | null;
  seenZombieIds: EntityId[];
  shotsFired: number;
  kills: number;
  extracted: boolean;
  outOfAmmoReported: boolean;
}

export type ZombieStateName = 'idle' | 'wander' | 'investigate' | 'pursue' | 'attack' | 'search';

export interface HeardNoise {
  position: Vec2;
  intensity: number;
  tick: Tick;
}

export interface ZombieAi {
  state: ZombieStateName;
  nextThinkTick: Tick;
  targetId: EntityId | null;
  lastKnownPos: Vec2 | null;
  lastSeenTick: Tick;
  goal: Vec2 | null;
  stateUntil: Tick;
  heard: HeardNoise | null;
  doorTargetId: string | null;
}

export interface Zombie extends ActorCore {
  kind: 'zombie';
  typeId: string;
  ai: ZombieAi;
  staggerUntil: Tick;
  attackCooldown: number;
  path: Vec2[];
  pathIndex: number;
  pathGoalCell: number;
  spawnedBy: string | null;
}

export interface Door {
  id: string;
  cell: { x: number; y: number };
  open: boolean;
  locked: boolean;
  broken: boolean;
  hp: number;
  maxHp: number;
}

export type NoiseCategory =
  'shot' | 'footstep' | 'glass' | 'door' | 'explosion' | 'shout' | 'alarm';

export interface NoiseEvent {
  id: string;
  tick: Tick;
  position: Vec2;
  intensity: number;
  category: NoiseCategory;
  sourceEntityId?: EntityId;
}

export interface Contact {
  zombieId: EntityId;
  typeId: string;
  position: Vec2;
  tick: Tick;
  visible: boolean;
}

export type ObjectiveId =
  'enterPerimeter' | 'collectMedicine' | 'rescueCivilian' | 'activateExtraction' | 'holdExtraction';

export interface ObjectiveState {
  id: ObjectiveId;
  status: 'pending' | 'completed' | 'failed';
  completedAtTick: Tick | null;
}

export type MissionStatus = 'running' | 'success' | 'partial' | 'failed';
export type MissionEndReason =
  'extracted' | 'extractedWithoutCivilian' | 'allDead' | 'civilianDied' | 'timeLimit';

export interface SpawnerState {
  id: string;
  cell: { x: number; y: number };
  pressure: number;
  cooldownUntil: Tick;
  lastNoisePos: Vec2 | null;
}

export interface MissionState {
  status: MissionStatus;
  endReason: MissionEndReason | null;
  endedAtTick: Tick | null;
  timeLimitTicks: number;
  medicineCollected: boolean;
  civilianRescued: boolean;
  extractionActive: boolean;
  extractionStartedTick: Tick | null;
  extractionHoldTicks: number;
  extractionHoldRequiredTicks: number;
  /** Hold timer complete, waiting for the civilian or an explicit confirmation to leave without her. */
  extractionReady: boolean;
  nextPulseTick: Tick;
  reinforcementsSpawned: number;
  reinforcementBudget: number;
  spawners: SpawnerState[];
}

export interface MissionStats {
  shotsFired: number;
  hits: number;
  meleeAttacks: number;
  zombiesKilled: number;
  totalNoise: number;
  noiseEvents: number;
  panicEvents: number;
  bites: number;
  damageTaken: number;
  ordersIssued: number;
  ordersBlocked: number;
  ammoUsed: number;
}

export type SimEventType =
  | 'ORDER_ISSUED'
  | 'ORDER_COMPLETED'
  | 'ORDER_BLOCKED'
  | 'ORDER_REJECTED'
  | 'ENEMY_SPOTTED'
  | 'ENEMY_LOST'
  | 'NOISE_EMITTED'
  | 'ZOMBIE_ALERTED'
  | 'SHOT_FIRED'
  | 'MELEE_ATTACK'
  | 'WEAPON_RELOADED'
  | 'OUT_OF_AMMO'
  | 'ACTOR_INJURED'
  | 'ACTOR_KILLED'
  | 'LEADER_CHANGED'
  | 'SURVIVOR_PANICKED'
  | 'SURVIVOR_RALLIED'
  | 'DOOR_CHANGED'
  | 'INTERACTION_STARTED'
  | 'INTERACTION_INTERRUPTED'
  | 'OBJECTIVE_COMPLETED'
  | 'EXTRACTION_STARTED'
  | 'EXTRACTION_READY'
  | 'REINFORCEMENT_SPAWNED'
  | 'MISSION_ENDED'
  | 'ORDER_QUEUED';

export interface SimEvent<T = Record<string, unknown>> {
  id: string;
  tick: Tick;
  type: SimEventType;
  payload: T;
}

export interface Squad {
  id: SquadId;
  displayName: string;
  memberIds: EntityId[];
  leaderId: EntityId | null;
  order: SquadOrder | null;
  firePolicy: FirePolicy;
  moveMode: MoveMode;
  spawn: Vec2;
  /** Orders queued with Shift; the next one starts when the current order completes. */
  waypoints: QueuedOrder[];
}

export interface QueuedOrder {
  type: OrderType;
  targetPosition?: Vec2;
  targetEntityId?: EntityId;
}

export interface FogState {
  /** 0 = unexplored, 1 = explored, 2 = visible; one entry per cell. */
  cells: number[];
}

export interface GameState {
  schemaVersion: number;
  tick: Tick;
  seed: number;
  rngState: number;
  missionId: string;
  mapId: string;
  difficultyId: string;
  nextId: number;
  squads: Squad[];
  survivors: Survivor[];
  zombies: Zombie[];
  doors: Door[];
  fog: FogState;
  contacts: Contact[];
  pendingNoises: NoiseEvent[];
  recentNoises: NoiseEvent[];
  objectives: ObjectiveState[];
  mission: MissionState;
  stats: MissionStats;
  events: SimEvent[];
  eventLog: SimEvent[];
}

export type GameCommand =
  | {
      id: string;
      scheduledTick: Tick;
      type: 'issueOrder';
      squadId: SquadId;
      payload: {
        type: OrderType;
        targetPosition?: Vec2;
        targetEntityId?: EntityId;
        /** Append after the current order instead of replacing it (Shift-click). */
        queue?: boolean;
      };
    }
  | {
      id: string;
      scheduledTick: Tick;
      type: 'setFirePolicy';
      squadId: SquadId;
      payload: { policy: FirePolicy };
    }
  | {
      id: string;
      scheduledTick: Tick;
      type: 'setMoveMode';
      squadId: SquadId;
      payload: { mode: MoveMode };
    }
  | { id: string; scheduledTick: Tick; type: 'confirmExtraction'; payload: Record<string, never> }
  | { id: string; scheduledTick: Tick; type: 'setSimulationSpeed'; payload: { speed: 1 | 2 } };

export type GameCommandInput = GameCommand extends infer C
  ? C extends GameCommand
    ? Omit<C, 'id' | 'scheduledTick'>
    : never
  : never;
