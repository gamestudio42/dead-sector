import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { createWorld, tileAt, type World } from '@dead-sector/sim';
import { CELL, DEPTH } from './constants';
import { MapRenderer } from './MapRenderer';
import { SPRITE_PX, WALK_FRAMES, zombieTextureKey } from './SpriteFactory';

interface Drifter {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  angle: number;
  speed: number;
  anim: number;
}

/**
 * Living menu background: the real mission map at dusk, a slow cinematic camera drift and a few
 * infected shambling through the streets. Purely decorative — no simulation runs here.
 */
export class Backdrop {
  readonly world: World;
  private drifters: Drifter[] = [];

  constructor(
    private scene: Phaser.Scene,
    missionId: string,
  ) {
    this.world = createWorld(loadContent(), missionId, []);
    new MapRenderer(scene, this.world);
    const cam = scene.cameras.main;
    cam.setZoom(1.6);
    cam.setBounds(0, 0, this.world.width * CELL, this.world.height * CELL);
    const W = this.world.width * CELL;
    const H = this.world.height * CELL;
    cam.centerOn(W * 0.42, H * 0.55);
    scene.tweens.add({
      targets: cam,
      scrollX: cam.scrollX + W * 0.22,
      scrollY: cam.scrollY - H * 0.18,
      duration: 70_000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const walkable = (x: number, y: number) => {
      const t = tileAt(this.world, Math.floor(x), Math.floor(y));
      return t === 'street' || t === 'sidewalk' || t === 'parking' || t === 'grass';
    };
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i++) {
      let x = 0;
      let y = 0;
      for (let k = 0; k < 50; k++) {
        x = 4 + rnd() * (this.world.width - 8);
        y = 4 + rnd() * (this.world.height - 8);
        if (walkable(x, y)) break;
      }
      const key = zombieTextureKey(i % 5 === 0 ? 'runner' : 'walker', `bd-${i}`);
      const shadow = scene.add
        .image(x * CELL, y * CELL, 'fx-shadow')
        .setDepth(DEPTH.shadows)
        .setScale(0.62);
      const sprite = scene.add
        .image(x * CELL, y * CELL, key, 0)
        .setDepth(DEPTH.actors)
        .setScale(CELL / SPRITE_PX);
      this.drifters.push({
        sprite,
        shadow,
        angle: rnd() * Math.PI * 2,
        speed: 0.25 + rnd() * 0.35,
        anim: rnd() * 8,
      });
    }
    // dusk grade over everything; vignette comes from the page CSS
    scene.add
      .rectangle(
        -scene.scale.width,
        -scene.scale.height,
        scene.scale.width * 3,
        scene.scale.height * 3,
        0x05070c,
        0.5,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.lighting);
    scene.scale.on('resize', (size: Phaser.Structs.Size) => {
      cam.setSize(size.width, size.height);
    });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const d of this.drifters) {
      const nx = d.sprite.x / CELL + Math.cos(d.angle) * d.speed * dt;
      const ny = d.sprite.y / CELL + Math.sin(d.angle) * d.speed * dt;
      const t = tileAt(this.world, Math.floor(nx), Math.floor(ny));
      if (t === 'wall' || t === 'window' || t === 'fence' || t === 'wreck' || t === 'bush') {
        d.angle += Math.PI * (0.5 + Math.random());
        continue;
      }
      if (Math.random() < dt * 0.15) d.angle += (Math.random() - 0.5) * 1.2;
      d.anim = (d.anim + d.speed * dt * 6) % WALK_FRAMES;
      d.sprite
        .setPosition(nx * CELL, ny * CELL)
        .setRotation(d.angle)
        .setFrame(Math.floor(d.anim));
      d.shadow.setPosition(nx * CELL + 1.4, ny * CELL + 2);
    }
  }
}
