import type {
  ContentBundle,
  DifficultyDef,
  MapDef,
  MissionDef,
  SimulationRules,
  TileType,
} from '@dead-sector/content';
import type { Door } from './types';

/** Static (non-serialized) world data derived from content. Mutable world state lives in GameState. */
export interface World {
  content: ContentBundle;
  mission: MissionDef;
  map: MapDef;
  rules: SimulationRules;
  difficulty: DifficultyDef;
  width: number;
  height: number;
  tiles: TileType[];
  /** Index into GameState.doors for each cell, or -1. */
  doorIndexByCell: Int32Array;
}

export function parseTiles(map: MapDef): TileType[] {
  const tiles: TileType[] = new Array(map.width * map.height);
  for (let y = 0; y < map.height; y++) {
    const row = map.rows[y] as string;
    for (let x = 0; x < map.width; x++) {
      tiles[y * map.width + x] = map.legend[row[x] as string] as TileType;
    }
  }
  return tiles;
}

export function createWorld(content: ContentBundle, missionId: string, doors: Door[]): World {
  const mission = content.missions[missionId];
  if (!mission) throw new Error(`Unknown mission ${missionId}`);
  const map = content.maps[mission.mapId];
  if (!map) throw new Error(`Unknown map ${mission.mapId}`);
  const difficulty = content.difficulties[mission.difficultyId];
  if (!difficulty) throw new Error(`Unknown difficulty ${mission.difficultyId}`);
  const doorIndexByCell = new Int32Array(map.width * map.height).fill(-1);
  doors.forEach((d, i) => {
    doorIndexByCell[d.cell.y * map.width + d.cell.x] = i;
  });
  return {
    content,
    mission,
    map,
    rules: content.rules,
    difficulty,
    width: map.width,
    height: map.height,
    tiles: parseTiles(map),
    doorIndexByCell,
  };
}
