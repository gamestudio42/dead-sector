import { z } from 'zod';
import {
  difficultySchema,
  mapSchema,
  missionSchema,
  simulationRulesSchema,
  survivorTemplateSchema,
  weaponSchema,
  zombieTypeSchema,
  type DifficultyDef,
  type MapDef,
  type MissionDef,
  type SimulationRules,
  type SurvivorTemplate,
  type WeaponDef,
  type ZombieTypeDef,
} from '../schemas/index';
import weaponsJson from '../weapons/weapons.json';
import zombiesJson from '../zombies/zombies.json';
import survivorsJson from '../survivors/survivors.json';
import difficultyJson from '../difficulty/difficulty.json';
import rulesJson from '../rules/simulation.json';
import pharmacyMissionJson from '../missions/a-ultima-farmacia.json';
import ferrugemMapJson from '../maps/bairro-da-ferrugem.json';

export * from '../schemas/index';

export interface ContentBundle {
  weapons: Record<string, WeaponDef>;
  zombieTypes: Record<string, ZombieTypeDef>;
  survivors: Record<string, SurvivorTemplate>;
  difficulties: Record<string, DifficultyDef>;
  missions: Record<string, MissionDef>;
  maps: Record<string, MapDef>;
  rules: SimulationRules;
}

export class ContentValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: string[],
  ) {
    super(`Invalid content in ${source}:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ContentValidationError';
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ContentValidationError(
      source,
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}

function indexById<T extends { id: string }>(items: T[], source: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) {
    if (out[item.id]) throw new ContentValidationError(source, [`duplicate id '${item.id}'`]);
    out[item.id] = item;
  }
  return out;
}

export interface RawContent {
  weapons: unknown;
  zombies: unknown;
  survivors: unknown;
  difficulties: unknown;
  rules: unknown;
  missions: unknown[];
  maps: unknown[];
}

export const builtInRawContent: RawContent = {
  weapons: weaponsJson,
  zombies: zombiesJson,
  survivors: survivorsJson,
  difficulties: difficultyJson,
  rules: rulesJson,
  missions: [pharmacyMissionJson],
  maps: [ferrugemMapJson],
};

/** Validates raw JSON content and checks cross references; throws ContentValidationError. */
export function validateContent(raw: RawContent): ContentBundle {
  const bundle: ContentBundle = {
    weapons: indexById(parse(z.array(weaponSchema), raw.weapons, 'weapons'), 'weapons'),
    zombieTypes: indexById(parse(z.array(zombieTypeSchema), raw.zombies, 'zombies'), 'zombies'),
    survivors: indexById(
      parse(z.array(survivorTemplateSchema), raw.survivors, 'survivors'),
      'survivors',
    ),
    difficulties: indexById(
      parse(z.array(difficultySchema), raw.difficulties, 'difficulty'),
      'difficulty',
    ),
    rules: parse(simulationRulesSchema, raw.rules, 'rules'),
    missions: indexById(
      raw.missions.map((m, i) => parse(missionSchema, m, `missions[${i}]`)),
      'missions',
    ),
    maps: indexById(
      raw.maps.map((m, i) => parse(mapSchema, m, `maps[${i}]`)),
      'maps',
    ),
  };
  const issues: string[] = [];
  for (const s of Object.values(bundle.survivors)) {
    if (!bundle.weapons[s.weaponId])
      issues.push(`survivor ${s.id} uses unknown weapon ${s.weaponId}`);
  }
  for (const m of Object.values(bundle.missions)) {
    const map = bundle.maps[m.mapId];
    if (!map) issues.push(`mission ${m.id} uses unknown map ${m.mapId}`);
    if (!bundle.difficulties[m.difficultyId])
      issues.push(`mission ${m.id} uses unknown difficulty ${m.difficultyId}`);
    for (const sq of m.squads) {
      for (const id of sq.memberIds) {
        const t = bundle.survivors[id];
        if (!t) issues.push(`mission ${m.id} squad ${sq.id} references unknown survivor ${id}`);
        else if (t.squadId !== sq.id)
          issues.push(`survivor ${id} belongs to ${t.squadId}, not ${sq.id}`);
      }
    }
    for (const z0 of m.zombieZones) {
      if (!bundle.zombieTypes[z0.typeId])
        issues.push(`mission ${m.id} uses unknown zombie type ${z0.typeId}`);
    }
    if (map) {
      for (const sp of m.spawners) {
        if (sp.cell.x < 0 || sp.cell.y < 0 || sp.cell.x >= map.width || sp.cell.y >= map.height) {
          issues.push(`spawner ${sp.id} outside map`);
        }
      }
    }
  }
  if (issues.length) throw new ContentValidationError('cross-references', issues);
  return bundle;
}

let cached: ContentBundle | null = null;
/** Built-in content, validated once. */
export function loadContent(): ContentBundle {
  cached ??= validateContent(builtInRawContent);
  return cached;
}
