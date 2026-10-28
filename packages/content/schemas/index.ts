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
export type SimulationRules = z.infer<typeof simulationRulesSchema>;
export type Rect = z.infer<typeof rectSchema>;
export type FirePolicy = z.infer<typeof firePolicySchema>;
export type MoveMode = z.infer<typeof moveModeSchema>;
