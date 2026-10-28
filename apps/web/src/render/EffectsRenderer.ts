import Phaser from 'phaser';
import type { GameState, SimEvent, World } from '@dead-sector/sim';
import { CELL } from './constants';

interface Fx {
  kind: 'tracer' | 'ring' | 'hit';
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

/** Short-lived visual feedback driven only by sim events (tracers, sound rings, hits). */
export class EffectsRenderer {
  private g: Phaser.GameObjects.Graphics;
  private fx: Fx[] = [];

  constructor(
    scene: Phaser.Scene,
    private world: World,
  ) {
    this.g = scene.add.graphics().setDepth(12);
  }

  /** Radius at which an average walker would still hear this sound in open air. */
  hearingRadius(intensity: number): number {
    const walker = this.world.content.zombieTypes['walker'];
    return Math.max(
      0,
      (intensity - (walker?.hearingThreshold ?? 15)) / this.world.rules.noise.attenuationPerMeter,
    );
  }

  ingest(events: SimEvent[], state: GameState, now: number): void {
    for (const e of events) {
      const p = e.payload;
      if (e.type === 'SHOT_FIRED') {
        this.fx.push({
          kind: 'tracer',
          x: p['fromX'] as number,
          y: p['fromY'] as number,
          x2: p['toX'] as number,
          y2: p['toY'] as number,
          radius: 0,
          color: p['hit'] ? 0xffe9a8 : 0xa89a7a,
          born: now,
          ttl: 140,
        });
      } else if (e.type === 'NOISE_EMITTED') {
        const intensity = p['intensity'] as number;
        const r = this.hearingRadius(intensity);
        if (r <= 0.3) continue;
        const x = p['x'] as number;
        const y = p['y'] as number;
        const cell = state.fog.cells[Math.floor(y) * this.world.width + Math.floor(x)];
        const ours =
          state.squads.some((s) => s.id === p['sourceEntityId']) ||
          state.survivors.some((s) => s.id === p['sourceEntityId']);
        if (!ours && cell !== 2 && p['category'] !== 'alarm') continue; // sounds from unseen sources go to the HUD log only
        this.fx.push({
          kind: 'ring',
          x,
          y,
          x2: 0,
          y2: 0,
          radius: r,
          color: NOISE_COLORS[p['category'] as string] ?? 0xffffff,
          born: now,
          ttl: p['category'] === 'footstep' ? 500 : 900,
        });
      } else if (e.type === 'ACTOR_INJURED') {
        const s = state.survivors.find((m) => m.id === p['actorId']);
        if (s)
          this.fx.push({
            kind: 'hit',
            x: s.position.x,
            y: s.position.y,
            x2: 0,
            y2: 0,
            radius: 12,
            color: 0xff3b2a,
            born: now,
            ttl: 350,
          });
      }
    }
  }

  draw(now: number): void {
    const g = this.g.clear();
    this.fx = this.fx.filter((f) => now - f.born < f.ttl);
    for (const f of this.fx) {
      const t = (now - f.born) / f.ttl;
      if (f.kind === 'tracer') {
        g.lineStyle(1.5, f.color, 1 - t).lineBetween(
          f.x * CELL,
          f.y * CELL,
          f.x2 * CELL,
          f.y2 * CELL,
        );
      } else if (f.kind === 'ring') {
        g.lineStyle(f.radius > 6 ? 2 : 1, f.color, 0.55 * (1 - t)).strokeCircle(
          f.x * CELL,
          f.y * CELL,
          f.radius * CELL * (0.25 + 0.75 * t),
        );
      } else {
        g.lineStyle(3, f.color, 1 - t).strokeCircle(f.x * CELL, f.y * CELL, f.radius * (0.6 + t));
      }
    }
  }
}
