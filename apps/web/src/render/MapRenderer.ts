import Phaser from 'phaser';
import type { TileType } from '@dead-sector/content';
import { tileAt, type GameState, type World } from '@dead-sector/sim';
import { CELL, COLORS } from './constants';

const GROUND: Partial<Record<TileType, number>> = {
  street: COLORS.street,
  sidewalk: COLORS.sidewalk,
  grass: COLORS.grass,
  rubble: COLORS.rubble,
  floor: COLORS.floor,
  parking: COLORS.parking,
  doorClosed: COLORS.floor,
  doorOpen: COLORS.floor,
  doorLocked: COLORS.floor,
};

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((color & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Neighbouring walkable ground colour for tiles drawn on top of ground (fences, bushes, wrecks). */
function groundBelow(world: World, x: number, y: number): number {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const g = GROUND[tileAt(world, x + dx, y + dy)];
    if (g !== undefined) return g;
  }
  return COLORS.sidewalk;
}

/** Static terrain baked once into a RenderTexture; doors are a separate dynamic layer. */
export class MapRenderer {
  private doorLayer: Phaser.GameObjects.Graphics;
  private doorKey = '';

  constructor(
    private scene: Phaser.Scene,
    private world: World,
  ) {
    const g = scene.make.graphics({}, false);
    const W = world.width;
    const H = world.height;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tileAt(world, x, y);
        const px = x * CELL;
        const py = y * CELL;
        const n = 0.92 + hash(x, y) * 0.16;
        const ground = GROUND[t];
        if (ground !== undefined) {
          g.fillStyle(shade(ground, n)).fillRect(px, py, CELL, CELL);
          if (t === 'rubble') {
            g.fillStyle(shade(COLORS.rubble, 1.25))
              .fillRect(px + 3, py + 4, 4, 3)
              .fillRect(px + 9, py + 9, 3, 3);
          }
          continue;
        }
        switch (t) {
          case 'wall':
            g.fillStyle(shade(COLORS.wall, n)).fillRect(px, py, CELL, CELL);
            g.fillStyle(COLORS.wallTop).fillRect(px, py, CELL, 3);
            break;
          case 'window':
            g.fillStyle(COLORS.wall).fillRect(px, py, CELL, CELL);
            g.fillStyle(COLORS.window).fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
            break;
          case 'fence': {
            g.fillStyle(shade(groundBelow(world, x, y), n)).fillRect(px, py, CELL, CELL);
            g.fillStyle(COLORS.fence);
            const horiz =
              tileAt(world, x - 1, y) === 'fence' || tileAt(world, x + 1, y) === 'fence';
            if (horiz) g.fillRect(px, py + 6, CELL, 3);
            else g.fillRect(px + 6, py, 3, CELL);
            break;
          }
          case 'bush':
            g.fillStyle(shade(groundBelow(world, x, y), n)).fillRect(px, py, CELL, CELL);
            g.fillStyle(COLORS.bush).fillCircle(px + 8, py + 8, 8);
            g.fillStyle(shade(COLORS.bush, 1.5)).fillCircle(px + 6, py + 6, 3);
            break;
          case 'wreck':
            g.fillStyle(shade(groundBelow(world, x, y), n)).fillRect(px, py, CELL, CELL);
            g.fillStyle(COLORS.wreck).fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
            g.fillStyle(COLORS.wreckTop).fillRect(px + 3, py + 4, CELL - 6, CELL - 8);
            break;
          case 'cabinet':
            g.fillStyle(COLORS.floor).fillRect(px, py, CELL, CELL);
            g.fillStyle(COLORS.cabinet).fillRect(px + 1, py + 2, CELL - 2, CELL - 5);
            break;
          default:
            g.fillStyle(0xff00ff).fillRect(px, py, CELL, CELL);
        }
      }
    }
    // lane markings on the two avenues and parking stripes
    g.fillStyle(0x8c8a72, 0.55);
    for (let y = 0; y < H; y += 3)
      if (tileAt(world, 47, y) === 'street') g.fillRect(47.85 * CELL, y * CELL + 2, 4, 9);
    for (let x = 0; x < W; x += 3)
      if (tileAt(world, x, 47) === 'street') g.fillRect(x * CELL + 2, 47.85 * CELL, 9, 4);
    g.fillStyle(0xd8d4c4, 0.25);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x += 4)
        if (tileAt(world, x, y) === 'parking' && y % 8 < 3) g.fillRect(x * CELL, y * CELL, 2, CELL);

    const rt = scene.add
      .renderTexture(0, 0, W * CELL, H * CELL)
      .setOrigin(0, 0)
      .setDepth(0);
    rt.draw(g);
    g.destroy();
    this.doorLayer = scene.add.graphics().setDepth(1);
  }

  /** Redraws doors only when any door state changed. */
  update(state: GameState): void {
    const key = state.doors
      .map((d) => `${d.open ? 1 : 0}${d.locked ? 1 : 0}${d.broken ? 1 : 0}`)
      .join('');
    if (key === this.doorKey) return;
    this.doorKey = key;
    const g = this.doorLayer.clear();
    for (const d of state.doors) {
      const px = d.cell.x * CELL;
      const py = d.cell.y * CELL;
      const vertical =
        tileAt(this.world, d.cell.x, d.cell.y - 1) === 'wall' ||
        tileAt(this.world, d.cell.x, d.cell.y + 1) === 'wall';
      if (d.broken) {
        g.fillStyle(COLORS.doorBroken)
          .fillRect(px + 2, py + 2, 4, 4)
          .fillRect(px + 9, py + 8, 5, 4);
      } else if (d.open) {
        g.fillStyle(COLORS.doorOpen);
        if (vertical) g.fillRect(px, py, CELL, 3);
        else g.fillRect(px, py, 3, CELL);
      } else {
        g.fillStyle(COLORS.door);
        if (vertical) g.fillRect(px + 5, py, 6, CELL);
        else g.fillRect(px, py + 5, CELL, 6);
        if (d.locked) g.fillStyle(COLORS.lock).fillCircle(px + 8, py + 8, 2.5);
      }
    }
  }
}
