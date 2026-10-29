import Phaser from 'phaser';
import type { GameState, World } from '@dead-sector/sim';
import { CELL, DEPTH } from './constants';

/** Upsampling factor of the displayed fog relative to the cell grid. */
const UP = 4;
const ALPHA = [0.97, 0.55, 0] as const;

/**
 * Fog of war: per-cell opacity eases towards the simulation's fog state (no popping), then
 * is upscaled with bilinear filtering and blurred so the edge of vision reads as soft
 * falloff instead of a staircase of tiles.
 */
export class FogRenderer {
  private tex: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private small: HTMLCanvasElement;
  private smallCtx: CanvasRenderingContext2D;
  private data: ImageData;
  private current: Float32Array;
  private initialized = false;

  constructor(
    scene: Phaser.Scene,
    private world: World,
  ) {
    if (scene.textures.exists('fog')) scene.textures.remove('fog');
    this.tex = scene.textures.createCanvas(
      'fog',
      world.width * UP,
      world.height * UP,
    ) as Phaser.Textures.CanvasTexture;
    this.small = document.createElement('canvas');
    this.small.width = world.width;
    this.small.height = world.height;
    this.smallCtx = this.small.getContext('2d') as CanvasRenderingContext2D;
    this.data = this.smallCtx.createImageData(world.width, world.height);
    this.current = new Float32Array(world.width * world.height);
    this.image = scene.add
      .image(0, 0, 'fog')
      .setOrigin(0, 0)
      .setScale(CELL / UP)
      .setDepth(DEPTH.fog);
  }

  setVisible(v: boolean): void {
    this.image.setVisible(v);
  }

  update(state: GameState, dtMs: number): void {
    const cells = state.fog.cells;
    const k = this.initialized ? Math.min(1, (dtMs / 1000) * 7) : 1;
    let changed = !this.initialized;
    const px = this.data.data;
    for (let i = 0; i < cells.length; i++) {
      const target = ALPHA[(cells[i] ?? 0) as 0 | 1 | 2];
      const cur = this.current[i] as number;
      const d = target - cur;
      if (Math.abs(d) > 0.002) {
        changed = true;
        this.current[i] = cur + d * k;
      } else this.current[i] = target;
      const o = i * 4;
      px[o] = 7;
      px[o + 1] = 9;
      px[o + 2] = 13;
      px[o + 3] = Math.round((this.current[i] as number) * 255);
    }
    this.initialized = true;
    if (!changed) return;
    this.smallCtx.putImageData(this.data, 0, 0);
    const c = this.tex.context;
    const w = this.world.width * UP;
    const h = this.world.height * UP;
    c.clearRect(0, 0, w, h);
    c.save();
    c.imageSmoothingEnabled = true;
    c.filter = `blur(${UP * 0.7}px)`;
    c.drawImage(this.small, 0, 0, w, h);
    c.restore();
    this.tex.refresh();
  }
}
