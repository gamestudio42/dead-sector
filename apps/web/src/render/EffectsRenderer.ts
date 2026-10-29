import Phaser from 'phaser';
import type { GameState, SimEvent, World } from '@dead-sector/sim';
import { uiRoot } from '../ui/dom';
import { Settings } from '../ui/SaveStore';
import { CELL, DEPTH, SQUAD_COLORS } from './constants';
import type { LightingRenderer } from './LightingRenderer';

interface Fx {
  kind: 'tracer' | 'ring' | 'order';
  x: number;
  y: number;
  x2: number;
  y2: number;
  radius: number;
  color: number;
  born: number;
  ttl: number;
}

const NOISE_COLORS: Record<string, number> = {
  shot: 0xffd27a,
  footstep: 0x8fb3d9,
  door: 0xc7a27a,
  shout: 0x9fd16a,
  alarm: 0x9fe870,
  glass: 0xbfe6ff,
  explosion: 0xff7a4a,
};

const MAX_DECALS = 140;

/**
 * Short-lived feedback driven only by sim events: tracers, muzzle flashes, impact particles,
 * blood decals, sound rings, order markers, camera shake and the damage vignette.
 */
export class EffectsRenderer {
  private g: Phaser.GameObjects.Graphics;
  private fx: Fx[] = [];
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private blood: Phaser.GameObjects.Particles.ParticleEmitter;
  private ichor: Phaser.GameObjects.Particles.ParticleEmitter;
  private decals: Phaser.GameObjects.Image[] = [];
  private vignette: HTMLDivElement;

  constructor(
    private scene: Phaser.Scene,
    private world: World,
    private lighting: LightingRenderer,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.glow);
    const burst = (
      texture: string,
      cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
      depth: number,
    ) => scene.add.particles(0, 0, texture, { ...cfg, emitting: false }).setDepth(depth);
    this.dust = burst(
      'fx-puff',
      {
        lifespan: { min: 350, max: 700 },
        speed: { min: 8, max: 34 },
        scale: { start: 0.12, end: 0.45 },
        alpha: { start: 0.5, end: 0 },
        tint: [0x9a9284, 0x7d776c],
      },
      DEPTH.particles,
    );
    this.sparks = burst(
      'fx-dot',
      {
        lifespan: { min: 90, max: 200 },
        speed: { min: 50, max: 140 },
        scale: { start: 0.45, end: 0.1 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe7a0, 0xffb64a],
        blendMode: Phaser.BlendModes.ADD,
      },
      DEPTH.glow,
    );
    this.debris = burst(
      'fx-dot',
      {
        lifespan: { min: 400, max: 800 },
        speed: { min: 25, max: 90 },
        scale: { start: 0.7, end: 0.3 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x6e4a2c, 0x4a3322, 0x8a6a48],
      },
      DEPTH.particles,
    );
    this.blood = burst(
      'fx-dot',
      {
        lifespan: { min: 250, max: 520 },
        speed: { min: 18, max: 70 },
        scale: { start: 0.55, end: 0.2 },
        alpha: { start: 1, end: 0 },
        tint: [0x8a1410, 0x5c0c0a],
      },
      DEPTH.particles,
    );
    this.ichor = burst(
      'fx-dot',
      {
        lifespan: { min: 250, max: 520 },
        speed: { min: 18, max: 65 },
        scale: { start: 0.55, end: 0.2 },
        alpha: { start: 1, end: 0 },
        tint: [0x3b2a18, 0x4a3a1c, 0x2a2010],
      },
      DEPTH.particles,
    );
    this.vignette = document.createElement('div');
    this.vignette.className = 'damage-vignette';
    uiRoot().appendChild(this.vignette);
  }

  /** Radius at which an average walker would still hear this sound in open air. */
  hearingRadius(intensity: number): number {
    const walker = this.world.content.zombieTypes['walker'];
    return Math.max(
      0,
      (intensity - (walker?.hearingThreshold ?? 15)) / this.world.rules.noise.attenuationPerMeter,
    );
  }

  private onScreen(x: number, y: number, margin = 2): boolean {
    const v = this.scene.cameras.main.worldView;
    return (
      x * CELL > v.x - margin * CELL &&
      x * CELL < v.right + margin * CELL &&
      y * CELL > v.y - margin * CELL &&
      y * CELL < v.bottom + margin * CELL
    );
  }

  private decal(x: number, y: number, scale: number): void {
    if (!Settings.blood) return;
    const img = this.scene.add
      .image(x * CELL, y * CELL, `fx-blood-${Math.floor(Math.random() * 4)}`)
      .setDepth(DEPTH.decals)
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(scale)
      .setAlpha(0.75);
    this.decals.push(img);
    if (this.decals.length > MAX_DECALS) this.decals.shift()?.destroy();
  }

  private shake(ms: number, intensity: number): void {
    if (Settings.shake) this.scene.cameras.main.shake(ms, intensity, false);
  }

  private hitVignette(strong: boolean): void {
    if (!Settings.shake) return;
    this.vignette.classList.remove('hit', 'bite');
    void this.vignette.offsetWidth; // restart the CSS animation
    this.vignette.classList.add(strong ? 'bite' : 'hit');
  }

  ingest(events: SimEvent[], state: GameState, now: number): void {
    const visible = (x: number, y: number) =>
      state.fog.cells[Math.floor(y) * this.world.width + Math.floor(x)] === 2;
    for (const e of events) {
      const p = e.payload;
      switch (e.type) {
        case 'SHOT_FIRED': {
          const fx = p['fromX'] as number;
          const fy = p['fromY'] as number;
          let tx = p['toX'] as number;
          let ty = p['toY'] as number;
          const ang = Math.atan2(ty - fy, tx - fx);
          if (!p['hit']) {
            // misses land around the target
            tx += (Math.random() - 0.5) * 1.6 + Math.cos(ang) * 0.8;
            ty += (Math.random() - 0.5) * 1.6 + Math.sin(ang) * 0.8;
          }
          this.fx.push({
            kind: 'tracer',
            x: fx,
            y: fy,
            x2: tx,
            y2: ty,
            radius: 0,
            color: 0xffe3a0,
            born: now,
            ttl: 110,
          });
          const mx = (fx + Math.cos(ang) * 0.55) * CELL;
          const my = (fy + Math.sin(ang) * 0.55) * CELL;
          const flash = this.scene.add
            .image(mx, my, 'fx-flash')
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.glow)
            .setRotation(ang)
            .setScale(p['weaponId'] === 'shotgun' ? 0.75 : 0.5, 0.35);
          this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 0.9,
            duration: 70,
            onComplete: () => flash.destroy(),
          });
          this.lighting.flash(fx, fy, p['weaponId'] === 'shotgun' ? 9 : 6.5);
          this.sparks.explode(4, mx, my);
          if (p['hit']) {
            (Settings.blood ? this.ichor : this.dust).explode(8, tx * CELL, ty * CELL);
            if (Math.random() < 0.35) this.decal(tx, ty, 0.1 + Math.random() * 0.08);
          } else this.dust.explode(5, tx * CELL, ty * CELL);
          if (this.onScreen(fx, fy, 0))
            this.shake(
              p['weaponId'] === 'shotgun' ? 90 : 45,
              p['weaponId'] === 'shotgun' ? 0.0028 : 0.0011,
            );
          break;
        }
        case 'MELEE_ATTACK': {
          const t = state.zombies.find((z) => z.id === p['targetId']);
          if (t && p['hit'])
            (Settings.blood ? this.ichor : this.dust).explode(
              7,
              t.position.x * CELL,
              t.position.y * CELL,
            );
          break;
        }
        case 'NOISE_EMITTED': {
          const intensity = p['intensity'] as number;
          const r = this.hearingRadius(intensity);
          if (r <= 0.3) break;
          const x = p['x'] as number;
          const y = p['y'] as number;
          const category = p['category'] as string;
          const ours =
            state.squads.some((s) => s.id === p['sourceEntityId']) ||
            state.survivors.some((s) => s.id === p['sourceEntityId']);
          if (!ours && !visible(x, y) && category !== 'alarm') break; // unseen sources go to the HUD log only
          // one ring per place and sound type at a time: a firefight reads as a pulse, not a moiré
          const color = NOISE_COLORS[category] ?? 0xffffff;
          const dup = this.fx.some(
            (f) =>
              f.kind === 'ring' &&
              f.color === color &&
              now - f.born < 420 &&
              Math.abs(f.x - x) + Math.abs(f.y - y) < 4,
          );
          if (dup) break;
          this.fx.push({
            kind: 'ring',
            x,
            y,
            x2: 0,
            y2: 0,
            radius: r,
            color,
            born: now,
            ttl: category === 'footstep' ? 500 : 750,
          });
          break;
        }
        case 'ACTOR_INJURED': {
          const s = state.survivors.find((m) => m.id === p['actorId']);
          if (!s) break;
          if (Settings.blood) {
            this.blood.explode(p['bitten'] ? 14 : 9, s.position.x * CELL, s.position.y * CELL);
            this.decal(s.position.x, s.position.y, 0.12 + Math.random() * 0.08);
          } else this.dust.explode(6, s.position.x * CELL, s.position.y * CELL);
          if (!s.isObjectiveCivilian || s.rescued) {
            this.shake(p['bitten'] ? 200 : 120, p['bitten'] ? 0.006 : 0.0035);
            this.hitVignette(!!p['bitten']);
          }
          break;
        }
        case 'ACTOR_KILLED':
          if (p['kind'] === 'survivor') this.shake(260, 0.007);
          break;
        case 'DOOR_CHANGED': {
          const d = state.doors.find((door) => door.id === p['doorId']);
          if (d && p['broken']) {
            this.debris.explode(18, (d.cell.x + 0.5) * CELL, (d.cell.y + 0.5) * CELL);
            this.dust.explode(10, (d.cell.x + 0.5) * CELL, (d.cell.y + 0.5) * CELL);
          }
          break;
        }
        case 'ORDER_ISSUED': {
          if (p['x'] === null || p['x'] === undefined) break;
          this.fx.push({
            kind: 'order',
            x: p['x'] as number,
            y: p['y'] as number,
            x2: 0,
            y2: 0,
            radius: 0,
            color: SQUAD_COLORS[p['squadId'] as string] ?? 0xffffff,
            born: now,
            ttl: 650,
          });
          break;
        }
        default:
          break;
      }
    }
  }

  draw(now: number): void {
    const g = this.g.clear();
    this.fx = this.fx.filter((f) => now - f.born < f.ttl);
    for (const f of this.fx) {
      const t = (now - f.born) / f.ttl;
      if (f.kind === 'tracer') {
        // bright head travelling along the line with a fading tail
        const hx = f.x + (f.x2 - f.x) * Math.min(1, t * 1.6);
        const hy = f.y + (f.y2 - f.y) * Math.min(1, t * 1.6);
        const tx = f.x + (f.x2 - f.x) * Math.max(0, t * 1.6 - 0.45);
        const ty = f.y + (f.y2 - f.y) * Math.max(0, t * 1.6 - 0.45);
        g.lineStyle(2.2, f.color, 0.35 * (1 - t)).lineBetween(
          tx * CELL,
          ty * CELL,
          hx * CELL,
          hy * CELL,
        );
        g.lineStyle(1, 0xffffff, 0.9 * (1 - t)).lineBetween(
          tx * CELL,
          ty * CELL,
          hx * CELL,
          hy * CELL,
        );
      } else if (f.kind === 'ring') {
        // ease-out expansion; fades fast so overlapping pulses stay legible
        const e = 1 - (1 - t) * (1 - t);
        const r = f.radius * CELL * (0.15 + 0.85 * e);
        g.lineStyle(1, f.color, 0.32 * (1 - t) * (1 - t)).strokeCircle(f.x * CELL, f.y * CELL, r);
      } else {
        const x = f.x * CELL;
        const y = f.y * CELL;
        const r = 14 * (1 - t) + 5;
        g.lineStyle(1.6, f.color, 1 - t).strokeCircle(x, y, r);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          const d = r + 4;
          const cx = x + Math.cos(a) * d;
          const cy = y + Math.sin(a) * d;
          g.fillStyle(f.color, 1 - t).fillTriangle(
            cx + Math.cos(a) * 3,
            cy + Math.sin(a) * 3,
            cx + Math.cos(a + 2.4) * 3,
            cy + Math.sin(a + 2.4) * 3,
            cx + Math.cos(a - 2.4) * 3,
            cy + Math.sin(a - 2.4) * 3,
          );
        }
      }
    }
  }

  destroy(): void {
    this.vignette.remove();
  }
}
