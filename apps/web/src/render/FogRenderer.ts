import Phaser from 'phaser';
import type { GameState, World } from '@dead-sector/sim';
import { CELL } from './constants';

/** Fog of war as a 1-pixel-per-cell canvas texture scaled up: black unexplored, dim explored, clear visible. */
export class FogRenderer {
  private tex: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private data: ImageData;
  private lastTick = -1;

  constructor(
    scene: Phaser.Scene,
    private world: World,
  ) {
    const existing = scene.textures.exists('fog');
    if (existing) scene.textures.remove('fog');
    this.tex = scene.textures.createCanvas(
      'fog',
      world.width,
      world.height,
    ) as Phaser.Textures.CanvasTexture;
    this.data = this.tex.context.createImageData(world.width, world.height);
    this.image = scene.add.image(0, 0, 'fog').setOrigin(0, 0).setScale(CELL).setDepth(5);
  }

  setVisible(v: boolean): void {
    this.image.setVisible(v);
  }

  update(state: GameState): void {
    if (state.tick === this.lastTick) return;
    this.lastTick = state.tick;
    const px = this.data.data;
    const cells = state.fog.cells;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      const o = i * 4;
      px[o] = 6;
      px[o + 1] = 7;
      px[o + 2] = 9;
      px[o + 3] = v === 0 ? 250 : v === 1 ? 150 : 0;
    }
    this.tex.context.putImageData(this.data, 0, 0);
    this.tex.refresh();
    void this.world;
  }
}
