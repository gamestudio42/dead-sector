import type { TileType } from '@dead-sector/content';
import type { GameState, World } from '@dead-sector/sim';

/** Flat cartographic palette for overview maps (minimap, briefing, debrief). */
const TILE_COLORS: Record<TileType, string> = {
  street: '#2c2e32',
  sidewalk: '#45474b',
  grass: '#33422a',
  rubble: '#4a4136',
  wall: '#8d8377',
  window: '#6d93a8',
  fence: '#6b5a3e',
  doorClosed: '#7a5232',
  doorOpen: '#5a4030',
  doorLocked: '#a07a2a',
  floor: '#4c443b',
  parking: '#37393d',
  wreck: '#5e4a40',
  bush: '#22351c',
  cabinet: '#4d9a8a',
};

const cache = new Map<string, HTMLCanvasElement>();

/** Terrain painted at `px` pixels per cell; cached per map and scale. */
export function baseMap(world: World, px: number): HTMLCanvasElement {
  const key = `${world.map.id}:${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = world.width * px;
  c.height = world.height * px;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let y = 0; y < world.height; y++)
    for (let x = 0; x < world.width; x++) {
      g.fillStyle = TILE_COLORS[world.tiles[y * world.width + x] as TileType] ?? '#000';
      g.fillRect(x * px, y * px, px, px);
    }
  cache.set(key, c);
  return c;
}

/** Fog layer (one pixel per cell) to be drawn scaled over the base map. */
export function fogLayer(
  state: GameState,
  world: World,
  out?: HTMLCanvasElement,
): HTMLCanvasElement {
  const c = out ?? document.createElement('canvas');
  c.width = world.width;
  c.height = world.height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(world.width, world.height);
  const cells = state.fog.cells;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    img.data[i * 4 + 3] = v === 0 ? 235 : v === 1 ? 120 : 0;
    img.data[i * 4] = 6;
    img.data[i * 4 + 1] = 7;
    img.data[i * 4 + 2] = 9;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Mission areas known from the briefing: perimeter, cabinet, extraction zone and radio. */
export function drawMissionMarks(
  g: CanvasRenderingContext2D,
  world: World,
  px: number,
  medicineCollected: boolean,
): void {
  const o = world.mission.objectives;
  g.save();
  g.lineWidth = Math.max(1, px * 0.5);
  g.setLineDash([px * 1.5, px]);
  g.strokeStyle = 'rgba(201,167,74,0.85)';
  const p = o.perimeter;
  g.strokeRect(p.x0 * px, p.y0 * px, (p.x1 - p.x0 + 1) * px, (p.y1 - p.y0 + 1) * px);
  g.setLineDash([]);
  const e = o.extraction.zone;
  g.fillStyle = 'rgba(127,191,106,0.22)';
  g.strokeStyle = 'rgba(127,191,106,0.95)';
  g.fillRect(e.x0 * px, e.y0 * px, (e.x1 - e.x0 + 1) * px, (e.y1 - e.y0 + 1) * px);
  g.strokeRect(e.x0 * px, e.y0 * px, (e.x1 - e.x0 + 1) * px, (e.y1 - e.y0 + 1) * px);
  const b = o.extraction.beacon;
  g.fillStyle = '#9fe870';
  g.fillRect(b.x * px - px, b.y * px - px, px * 2, px * 2);
  if (!medicineCollected) {
    const c = o.cabinet.cell;
    const cx = (c.x + 1) * px;
    const cy = (c.y + 0.5) * px;
    g.fillStyle = '#7fe0c0';
    g.fillRect(cx - px * 0.5, cy - px * 1.6, px, px * 3.2);
    g.fillRect(cx - px * 1.6, cy - px * 0.5, px * 3.2, px);
  }
  g.restore();
}
