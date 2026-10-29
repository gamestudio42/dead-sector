import type { TileType } from '@dead-sector/content';
import type { Door, GameState } from '../model/types';
import type { World } from '../model/World';

const MOVE_COST: Record<TileType, number> = {
  street: 1,
  sidewalk: 1,
  grass: 1.2,
  rubble: 1.6,
  wall: Infinity,
  fence: 1.5,
  // climbing through a broken window is slow; intact glass is blocked by the barrier check
  window: 2,
  doorClosed: 1,
  doorOpen: 1,
  doorLocked: 1,
  floor: 1,
  parking: 1,
  wreck: Infinity,
  bush: 1.4,
  cabinet: Infinity,
};

const STATIC_BLOCKING = new Set<TileType>(['wall', 'wreck', 'cabinet']);
const STATIC_OPAQUE = new Set<TileType>(['wall', 'bush']);
/** Cells that hold a breakable barrier entity (`Door`): doors and windows. */
const DOOR_TILES = new Set<TileType>(['doorClosed', 'doorOpen', 'doorLocked', 'window']);

export const inBounds = (world: World, cx: number, cy: number): boolean =>
  cx >= 0 && cy >= 0 && cx < world.width && cy < world.height;

export const cellIndex = (world: World, cx: number, cy: number): number => cy * world.width + cx;

export function tileAt(world: World, cx: number, cy: number): TileType {
  if (!inBounds(world, cx, cy)) return 'wall';
  return world.tiles[cy * world.width + cx] as TileType;
}

export function doorAt(world: World, state: GameState, cx: number, cy: number): Door | undefined {
  if (!inBounds(world, cx, cy)) return undefined;
  const i = world.doorIndexByCell[cy * world.width + cx] as number;
  return i >= 0 ? state.doors[i] : undefined;
}

/** True while the barrier stops movement: a closed intact door/window, or any barricade. */
export const isDoorClosed = (door: Door): boolean =>
  door.barricade > 0 || (!door.open && !door.broken);

export function isDoorTile(world: World, cx: number, cy: number): boolean {
  return DOOR_TILES.has(tileAt(world, cx, cy));
}

/** True when an actor cannot currently stand in or move through the cell. */
export function blocksMovement(world: World, state: GameState, cx: number, cy: number): boolean {
  const t = tileAt(world, cx, cy);
  if (STATIC_BLOCKING.has(t)) return true;
  if (DOOR_TILES.has(t)) {
    const door = doorAt(world, state, cx, cy);
    // a window without an entity (pre-v3 save) stays solid
    return door ? isDoorClosed(door) : t === 'window';
  }
  return false;
}

/** True when the cell blocks line of sight (walls, bushes, closed doors). Windows are transparent. */
export function isOpaque(world: World, state: GameState, cx: number, cy: number): boolean {
  const t = tileAt(world, cx, cy);
  if (STATIC_OPAQUE.has(t)) return true;
  if (t === 'window') return false;
  if (DOOR_TILES.has(t)) {
    const door = doorAt(world, state, cx, cy);
    return door ? isDoorClosed(door) : false;
  }
  return false;
}

export function moveCost(world: World, cx: number, cy: number): number {
  return MOVE_COST[tileAt(world, cx, cy)];
}

/** Tile type including the dynamic door state, used for acoustic absorption. */
export function acousticTile(world: World, state: GameState, cx: number, cy: number): TileType {
  const t = tileAt(world, cx, cy);
  if (DOOR_TILES.has(t)) {
    const door = doorAt(world, state, cx, cy);
    if (!door) return t;
    if (t === 'window') return isDoorClosed(door) ? 'window' : 'doorOpen';
    return isDoorClosed(door) ? 'doorClosed' : 'doorOpen';
  }
  return t;
}
