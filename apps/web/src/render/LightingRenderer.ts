import Phaser from 'phaser';
import type { GameState, Vec2, World } from '@dead-sector/sim';
import type { LightingMode, Quality } from '../ui/SaveStore';
import { CELL, DEPTH } from './constants';

/** Lighting buffer resolution relative to world pixels (lights are soft, so 1/4 is plenty). */
const RES = 4;
const AMBIENT_DUSK = 0.4;
const AMBIENT_NIGHT = 0.66;

interface Flash {
  x: number;
  y: number;
  born: number;
  ttl: number;
  radius: number;
}

/**
 * Dusk atmosphere: a darkness layer with lights erased from it (survivor lanterns and
 * flashlight cones, muzzle flashes, the radio beacon, smouldering wrecks) plus additive warm
 * glows. Purely visual — the simulation's vision rules are unchanged and fog still decides
 * what is known.
 */
export class LightingRenderer {
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private light: Phaser.GameObjects.Image;
  private cone: Phaser.GameObjects.Image;
  private glows: Phaser.GameObjects.Image[] = [];
  private flashes: Flash[] = [];
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private frame = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: World,
    private burning: Vec2[],
    mode: LightingMode,
    private quality: Quality = 'high',
  ) {
    this.light = scene.make.image({ key: 'fx-light', add: false });
    this.cone = scene.make.image({ key: 'fx-cone', add: false });
    const dark = mode === 'dusk' || world.mission.isNight;
    if (dark && quality === 'low') {
      // no dynamic light on low quality: a flat grade keeps the mood at almost no cost
      scene.add
        .rectangle(
          0,
          0,
          world.width * CELL,
          world.height * CELL,
          0x05070c,
          world.mission.isNight ? 0.45 : 0.25,
        )
        .setOrigin(0, 0)
        .setDepth(DEPTH.lighting);
    } else if (dark) {
      this.rt = scene.add
        .renderTexture(0, 0, (world.width * CELL) / RES, (world.height * CELL) / RES)
        .setOrigin(0, 0)
        .setScale(RES)
        .setDepth(DEPTH.lighting);
    }
    for (const b of quality === 'low' ? [] : burning) {
      this.glows.push(
        scene.add
          .image(b.x * CELL, b.y * CELL, 'fx-glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.glow)
          .setScale(1.3),
      );
      this.smoke.push(
        scene.add
          .particles(b.x * CELL, b.y * CELL, 'fx-puff', {
            lifespan: { min: 2500, max: 4200 },
            speedX: { min: 4, max: 14 },
            speedY: { min: -16, max: -6 },
            scale: { start: 0.35, end: 1.6 },
            alpha: { start: 0.32, end: 0 },
            tint: [0x2a2622, 0x3a3430, 0x1c1a18],
            frequency: 260,
            rotate: { min: 0, max: 360 },
          })
          .setDepth(DEPTH.particles),
      );
    }
  }

  /** Muzzle flash or explosion lighting (cells). */
  flash(x: number, y: number, radius = 7, ttl = 90): void {
    this.flashes.push({ x, y, born: this.scene.time.now, ttl, radius });
  }

  private eraseLight(x: number, y: number, radiusCells: number, alpha: number): void {
    const rt = this.rt as Phaser.GameObjects.RenderTexture;
    this.light
      .setScale((radiusCells * CELL) / RES / 64)
      .setAlpha(alpha)
      .setRotation(0);
    rt.erase(this.light, x / RES, y / RES);
  }

  update(
    state: GameState,
    now: number,
    survivorLights: (cb: (x: number, y: number, angle: number) => void) => void,
  ): void {
    const flicker = (k: number) =>
      0.82 + 0.1 * Math.sin(now / 90 + k * 7) + 0.08 * Math.sin(now / 37 + k * 3);
    this.glows.forEach((gl, i) =>
      gl.setAlpha(0.55 * flicker(i)).setScale(1.2 + 0.15 * flicker(i + 1)),
    );
    this.flashes = this.flashes.filter((f) => now - f.born < f.ttl);
    const rt = this.rt;
    if (!rt) return;
    // medium quality redraws the light map every other frame (flashes still show)
    this.frame += 1;
    if (this.quality === 'medium' && this.frame % 2 === 1 && this.flashes.length === 0) return;

    rt.clear();
    // night missions are much darker: only lanterns, flashes and fires cut through
    rt.fill(0x05070c, this.world.mission.isNight ? AMBIENT_NIGHT : AMBIENT_DUSK);
    survivorLights((x, y, angle) => {
      this.eraseLight(x, y, 4.5, 0.85);
      this.cone
        .setScale((11 * CELL) / RES / 128)
        .setRotation(angle)
        .setAlpha(0.75);
      rt.erase(this.cone, x / RES, y / RES);
    });
    const b = this.world.mission.objectives.extraction.beacon;
    const active = state.mission.extractionActive;
    this.eraseLight(
      b.x * CELL,
      b.y * CELL,
      active ? 5 + Math.sin(now / 180) : 2.2,
      active ? 0.95 : 0.6,
    );
    this.burning.forEach((p, i) => this.eraseLight(p.x * CELL, p.y * CELL, 6.5 * flicker(i), 0.85));
    for (const f of this.flashes) {
      const t = 1 - (now - f.born) / f.ttl;
      this.eraseLight(f.x * CELL, f.y * CELL, f.radius, t);
    }
  }

  destroy(): void {
    this.rt?.destroy();
    for (const g of this.glows) g.destroy();
    for (const s of this.smoke) s.destroy();
    this.light.destroy();
    this.cone.destroy();
  }
}
