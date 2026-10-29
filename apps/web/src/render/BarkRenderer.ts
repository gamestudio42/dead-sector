import Phaser from 'phaser';
import type { GameState, Vec2 } from '@dead-sector/sim';
import type { Bark } from '../presentation/barks';
import { CELL, DEPTH } from './constants';
import type { PositionLookup } from './EntityRenderer';

const TTL = 2300;
const PER_SURVIVOR_COOLDOWN = 3500;
const GLOBAL_GAP = 700;
const MAX_BUBBLES = 3;

interface Bubble {
  survivorId: string;
  text: Phaser.GameObjects.Text;
  born: number;
  priority: number;
}

/** Speech bubbles over survivors, rate-limited so only the most important lines get through. */
export class BarkRenderer {
  private bubbles: Bubble[] = [];
  private lastBySurvivor = new Map<string, number>();
  private lastAny = 0;

  constructor(private scene: Phaser.Scene) {}

  push(barks: Bark[], now: number): void {
    for (const b of barks.sort((a, c) => c.priority - a.priority)) {
      const urgent = b.priority >= 3;
      if (!urgent && now - this.lastAny < GLOBAL_GAP) continue;
      if (!urgent && now - (this.lastBySurvivor.get(b.survivorId) ?? -1e9) < PER_SURVIVOR_COOLDOWN)
        continue;
      const existing = this.bubbles.find((x) => x.survivorId === b.survivorId);
      if (existing) {
        if (existing.priority > b.priority && now - existing.born < TTL * 0.6) continue;
        existing.text.destroy();
        this.bubbles.splice(this.bubbles.indexOf(existing), 1);
      }
      if (this.bubbles.length >= MAX_BUBBLES) {
        const weakest = [...this.bubbles].sort(
          (a, c) => a.priority - c.priority || a.born - c.born,
        )[0] as Bubble;
        if (weakest.priority > b.priority) continue;
        weakest.text.destroy();
        this.bubbles.splice(this.bubbles.indexOf(weakest), 1);
      }
      const text = this.scene.add
        .text(0, 0, b.text, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '9px',
          fontStyle: b.priority >= 4 ? 'bold' : 'normal',
          color: b.priority >= 4 ? '#ffd7cf' : '#f1efe8',
          backgroundColor: b.priority >= 4 ? 'rgba(90,16,12,0.86)' : 'rgba(12,14,18,0.82)',
          padding: { x: 4, y: 2 },
          resolution: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.labels);
      this.bubbles.push({ survivorId: b.survivorId, text, born: now, priority: b.priority });
      this.lastBySurvivor.set(b.survivorId, now);
      this.lastAny = now;
    }
  }

  draw(state: GameState, pos: PositionLookup, now: number): void {
    this.bubbles = this.bubbles.filter((b) => {
      const s = state.survivors.find((m) => m.id === b.survivorId);
      const age = now - b.born;
      if (!s || age > TTL || s.extracted) {
        b.text.destroy();
        return false;
      }
      const p: Vec2 = pos(s.id, s.position);
      const rise = Math.min(1, age / 180);
      const zoom = this.scene.cameras.main.zoom;
      b.text
        .setPosition(p.x * CELL, p.y * CELL - 15 - rise * 3)
        .setScale(1.25 / zoom)
        .setAlpha(Math.min(rise * 1.5, (TTL - age) / 400, 1));
      return true;
    });
  }
}
