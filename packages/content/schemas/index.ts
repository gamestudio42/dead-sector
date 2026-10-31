import { z } from 'zod';

export const vec2Schema = z.object({ x: z.number(), y: z.number() });
export const cellSchema = z.object({ x: z.number().int(), y: z.number().int() });
export const rectSchema = z
  .object({
    x0: z.number().int(),
    y0: z.number().int(),
    x1: z.number().int(),
    y1: z.number().int(),
  })
  .refine((r) => r.x1 >= r.x0 && r.y1 >= r.y0, 'rect must have x1>=x0 and y1>=y0');

export const tileTypeSchema = z.enum([
  'street',
  'sidewalk',
  'grass',
  'rubble',
  'wall',
  'fence',
  'window',
  'doorClosed',
  'doorOpen',
  'doorLocked',
  'floor',
  'parking',
  'wreck',
  'bush',
  'cabinet',
]);

export const weaponSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  kind: z.enum(['firearm', 'melee']),
  shotsPerSecond: z.number().positive(),
  magazineCapacity: z.number().int().nonnegative(),
  damage: z.number().positive(),
  minDamageAtMaxRange: z.number().positive(),
  noise: z.number().min(0).max(100),
  rangeMeters: z.number().positive(),
  baseAccuracy: z.number().min(0).max(1),
  reloadSeconds: z.number().nonnegative(),
});

export const zombieTypeSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  maxHealth: z.number().positive(),
  moveSpeedMetersPerSecond: z.number().positive(),
  wanderSpeedFactor: z.number().positive().max(1),
  visionRangeMeters: z.number().positive(),
  visionFovDegrees: z.number().positive().max(360),
  closeAwarenessMeters: z.number().nonnegative(),
  hearingThreshold: z.number().positive(),
  attackRangeMeters: z.number().positive(),
  attackCooldownSeconds: z.number().positive(),
  attackDamage: z.number().positive(),
  attackHitChance: z.number().min(0).max(1),
  biteChanceOnHit: z.number().min(0).max(1),
  doorDamage: z.number().nonnegative(),
  searchSeconds: z.number().positive(),
  spawnWeight: z.number().nonnegative(),
  /** Fraction of the stagger a hit causes (heavy infected shrug most of it off). */
  staggerFactor: z.number().min(0).max(1).default(1),
  /** Loud shriek on first sight of a survivor (screamer); 0 = never screams. */
  screamIntensity: z.number().min(0).max(100).default(0),
  screamCooldownSeconds: z.number().positive().default(15),
});

const stat = z.number().min(0).max(100);
export const survivorTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  squadId: z.string().min(1),
  isLeader: z.boolean(),
  weaponId: z.string().min(1),
  reserveRounds: z.number().int().nonnegative(),
  maxHealth: z.number().positive().max(100),
  courage: stat,
  discipline: stat,
  leadership: stat,
  marksmanship: stat,
  medicine: stat,
  mechanics: stat,
  stealth: stat,
});

export const difficultySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  zombieVisionMultiplier: z.number().positive(),
  zombieHearingMultiplier: z.number().positive(),
  infectionChanceOnBite: z.number().min(0).max(1),
  reinforcementBudgetMultiplier: z.number().nonnegative(),
});

export const mapSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    cellSizeMeters: z.literal(1),
    legend: z.record(z.string().length(1), tileTypeSchema),
    rows: z.array(z.string()),
  })
  .superRefine((m, ctx) => {
    if (m.rows.length !== m.height) {
      ctx.addIssue({
        code: 'custom',
        message: `map has ${m.rows.length} rows, expected ${m.height}`,
      });
    }
    m.rows.forEach((row, y) => {
      if (row.length !== m.width) {
        ctx.addIssue({
          code: 'custom',
          message: `row ${y} has ${row.length} columns, expected ${m.width}`,
        });
      }
      for (const ch of row) {
        if (!(ch in m.legend)) {
          ctx.addIssue({ code: 'custom', message: `row ${y} uses unknown tile '${ch}'` });
          break;
        }
      }
    });
  });

export const firePolicySchema = z.enum(['weaponsFree', 'returnFire', 'holdFire']);
export const moveModeSchema = z.enum(['sneak', 'move', 'sprint']);

export const missionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  briefing: z.string(),
  mapId: z.string().min(1),
  canonicalSeed: z.number().int(),
  difficultyId: z.string().min(1),
  timeLimitSeconds: z.number().positive(),
  isNight: z.boolean(),
  squads: z
    .array(
      z.object({
        id: z.string().min(1),
        displayName: z.string().min(1),
        memberIds: z.array(z.string().min(1)).min(1).max(6),
        spawn: vec2Schema,
        firePolicy: firePolicySchema,
        moveMode: moveModeSchema,
        /** Plank kits for barricading doors and windows. */
        barricadeKits: z.number().int().nonnegative().default(2),
      }),
    )
    .min(1)
    .max(4),
  civilian: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string(),
    position: vec2Schema,
    maxHealth: z.number().positive(),
  }),
  zombieZones: z.array(
    z.object({
      typeId: z.string().min(1),
      count: z.number().int().nonnegative(),
      rect: rectSchema,
    }),
  ),
  spawners: z.array(z.object({ id: z.string().min(1), cell: cellSchema })),
  /** Roaming hordes: timed and alarm-triggered groups that patrol a route through the map. */
  hordes: z
    .object({
      firstAtSeconds: z.number().positive(),
      intervalSeconds: z.number().positive(),
      max: z.number().int().nonnegative(),
      size: z.number().int().positive(),
      heavyPerHorde: z.number().int().nonnegative(),
      warningSeconds: z.number().nonnegative(),
      routes: z
        .array(z.object({ spawnerId: z.string().min(1), waypoints: z.array(cellSchema).min(1) }))
        .min(1),
    })
    .optional(),
  reinforcements: z.object({
    budget: z.number().int().nonnegative(),
    maxConcurrent: z.number().int().positive(),
    pressureThreshold: z.number().positive(),
    pressureDecayPerSecond: z.number().min(0).max(1),
    cooldownSeconds: z.number().nonnegative(),
    runnerChance: z.number().min(0).max(1),
    minSurvivorDistance: z.number().nonnegative(),
  }),
  objectives: z.object({
    perimeter: rectSchema,
    cabinet: z.object({ cell: cellSchema, interactSeconds: z.number().positive() }),
    civilianRescueSeconds: z.number().positive(),
    extraction: z.object({
      beacon: vec2Schema,
      zone: rectSchema,
      activateSeconds: z.number().positive(),
      holdSeconds: z.number().positive(),
      activationNoise: z.number().min(0).max(100),
      pulseNoise: z.number().min(0).max(100),
      pulseSeconds: z.number().positive(),
    }),
  }),
  /** Player-facing PT-BR texts for this mission (objective names, item and person, intel). */
  texts: z.object({
    area: z.string().min(1),
    item: z.string().min(1),
    itemTag: z.string().min(1),
    itemDone: z.string().min(1),
    person: z.string().min(1),
    personTag: z.string().min(1),
    objectives: z.object({
      enterPerimeter: z.string().min(1),
      collectMedicine: z.string().min(1),
      rescueCivilian: z.string().min(1),
      activateExtraction: z.string().min(1),
      holdExtraction: z.string().min(1),
    }),
    intel: z.array(z.string().min(1)),
  }),
});

const stockSchema = z.object({
  food: z.number().int().nonnegative(),
  medicine: z.number().int().nonnegative(),
  ammo: z.number().int().nonnegative(),
  parts: z.number().int().nonnegative(),
});

/** One node of the strategic map; a sector without a mission only moves infected for now. */
export const sectorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  blurb: z.string().min(1),
  /** Position on the strategic map, 0–100 on each axis. */
  pos: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  neighbors: z.array(z.string().min(1)).min(1),
  missionId: z.string().min(1).nullable(),
  /** Infected density at the start of the campaign, 0–100. */
  infestation: z.number().min(0).max(100),
  /** Infected arriving per day from outside the map. */
  growth: z.number().nonnegative(),
  /** Paid when the operation brings its item back; half on later runs. */
  reward: stockSchema.extend({ people: z.number().int().nonnegative() }),
  /** People a successful operation here takes out of the sector for good. */
  evacuates: z.number().int().nonnegative(),
});

/** A strategic campaign: a shelter, connected sectors, scarce stock and a deadline. */
export const campaignSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  intro: z.string().min(1),
  shelterSectorId: z.string().min(1),
  start: stockSchema.extend({ population: z.number().int().nonnegative() }),
  /** One food unit feeds this many people for a day. */
  peoplePerFood: z.number().int().positive(),
  /** Fraction of max health recovered each day. */
  healFraction: z.number().min(0).max(1),
  victory: z.object({
    evacuateGoal: z.number().int().positive(),
    deadlineDays: z.number().int().positive(),
  }),
  thresholds: z.object({ securedBelow: z.number(), infestedFrom: z.number() }),
  migration: z.object({
    /** Fraction of the density gap that crosses each connection per day. */
    flowRate: z.number().min(0).max(0.5),
    /** Fraction of a noisy sector's heat drawn from each neighbour per day. */
    noiseDraw: z.number().min(0).max(1),
    /** Mission noise points per point of sector heat. */
    noisePerHeat: z.number().positive(),
    /** Random infected per sector per day, from 0 to this. */
    jitter: z.number().int().nonnegative(),
  }),
  /** Infestation change after an operation, by outcome. */
  operationEffect: z.object({ success: z.number(), partial: z.number(), failed: z.number() }),
  sectors: z.array(sectorSchema).min(2),
});

const num = z.number();
const nonNeg = z.number().nonnegative();
export const simulationRulesSchema = z.object({
  tickMs: z.literal(100),
  movement: z.object({
    sneakSpeed: nonNeg,
    moveSpeed: nonNeg,
    sprintSpeed: nonNeg,
    sprintStaminaPerSecond: nonNeg,
    staminaRegenPerSecond: nonNeg,
    minSprintStamina: nonNeg,
    woundedHealthThreshold: nonNeg,
    woundedSpeedFactor: nonNeg,
    formationSpacing: nonNeg,
    arriveDistance: nonNeg,
    stuckWindowSeconds: nonNeg,
    stuckMinDistance: nonNeg,
    maxReplans: z.number().int().nonnegative(),
    civilianSpeed: nonNeg,
    civilianFollowDistance: nonNeg,
  }),
  noise: z.object({
    attenuationPerMeter: z.number().positive(),
    footstep: z.object({ sneak: nonNeg, move: nonNeg, sprint: nonNeg }),
    footstepPulseSeconds: z.number().positive(),
    groupBonusPerExtraMember: nonNeg,
    absorption: z.record(tileTypeSchema, nonNeg),
    doorOpen: nonNeg,
    doorForce: nonNeg,
    doorBash: nonNeg,
    zombieGroan: nonNeg,
    recentNoiseSeconds: z.number().positive(),
  }),
  vision: z.object({
    survivorDayRange: z.number().positive(),
    survivorNightRange: z.number().positive(),
    fovDegrees: z.number().positive().max(360),
    peripheralRange: nonNeg,
    sneakDetectionFactor: z.number().positive(),
    hideDetectionFactor: z.number().positive(),
    sprintDetectionFactor: z.number().positive(),
    contactMemorySeconds: z.number().positive(),
  }),
  stress: z.object({
    perZombieWithin6m: num,
    maxZombiesCounted: nonNeg,
    surrounded: num,
    isolated: num,
    safeArea: num,
    leaderNearby: num,
    courage: num,
    nearZombieRadius: nonNeg,
    surroundRadius: nonNeg,
    isolationRadius: nonNeg,
    leaderRadius: nonNeg,
    safeRadius: nonNeg,
    panicEnter: nonNeg,
    panicExit: nonNeg,
    panicMinSeconds: nonNeg,
    breakdown: nonNeg,
    shakenThreshold: nonNeg,
    shakenRiskZombies: nonNeg,
    impulses: z.object({
      allyDeath: num,
      leaderDeath: num,
      bite: num,
      wound: num,
      civilianDeath: num,
    }),
  }),
  combat: z.object({
    skillBonusPerPoint: nonNeg,
    rangePenalty: nonNeg,
    movePenalty: nonNeg,
    stressPenalty: nonNeg,
    darknessPenalty: nonNeg,
    holdStanceBonus: nonNeg,
    meleeStaminaCost: nonNeg,
    meleeTriggerDistance: z.number().positive(),
    autoReloadFraction: z.number().min(0).max(1),
    returnFireRadius: nonNeg,
    zombieStaggerSeconds: nonNeg,
  }),
  infection: z.object({
    exposedToInfectedSeconds: z.number().positive(),
    infectedToCriticalSeconds: z.number().positive(),
    /** Critical survivors turn into infected after this long. */
    criticalToTurnSeconds: z.number().positive(),
    /** Progress multiplier while a squad medic (medicine ≥ 50) stays within 4 m. */
    medicSlowFactor: z.number().min(0).max(1),
  }),
  barriers: z.object({
    windowHp: z.number().positive(),
    barricadeHp: z.number().positive(),
    barricadeSeconds: z.number().positive(),
    removeBarricadeSeconds: z.number().positive(),
    hammerNoise: z.number().min(0).max(100),
    glassBreakNoise: z.number().min(0).max(100),
  }),
  alarm: z.object({
    /** Alarm points per point of intensity of loud noises (shots, doors, glass, screams, radio). */
    perIntensity: z.number().nonnegative(),
    decayPerSecond: z.number().nonnegative(),
    /** Thresholds for levels 1–3 (inquieto, alerta, caçada). */
    tiers: z.tuple([z.number(), z.number(), z.number()]),
  }),
  interaction: z.object({
    doorForceSecondsBase: z.number().positive(),
    doorForceSecondsMin: z.number().positive(),
    doorToggleSeconds: z.number().positive(),
    interruptRadius: nonNeg,
  }),
});

export type TileType = z.infer<typeof tileTypeSchema>;
export type WeaponDef = z.infer<typeof weaponSchema>;
export type ZombieTypeDef = z.infer<typeof zombieTypeSchema>;
export type SurvivorTemplate = z.infer<typeof survivorTemplateSchema>;
export type DifficultyDef = z.infer<typeof difficultySchema>;
export type MapDef = z.infer<typeof mapSchema>;
export type MissionDef = z.infer<typeof missionSchema>;
export type CampaignDef = z.infer<typeof campaignSchema>;
export type SimulationRules = z.infer<typeof simulationRulesSchema>;
export type Rect = z.infer<typeof rectSchema>;
export type FirePolicy = z.infer<typeof firePolicySchema>;
export type MoveMode = z.infer<typeof moveModeSchema>;
