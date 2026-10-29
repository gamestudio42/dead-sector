import Phaser from 'phaser';
import {
  BEACON_ID,
  CABINET_ID,
  type GameState,
  type SimEvent,
  type Survivor,
  type Vec2,
  type World,
} from '@dead-sector/sim';
import { Settings } from '../ui/SaveStore';
import { CELL, COLORS, DEPTH, SQUAD_COLORS } from './constants';
import {
  ATTACK_FRAME,
  CORPSE_FRAME,
  SPRITE_PX,
  survivorTextureKey,
  WALK_FRAMES,
  zombieTextureKey,
} from './SpriteFactory';

export type PositionLookup = (id: string, current: Vec2) => Vec2;

const SCALE = CELL / SPRITE_PX;
/** Walk-cycle frames advanced per cell travelled. */
const FRAMES_PER_CELL = 6;

interface ActorView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  blood: Phaser.GameObjects.Image | null;
  anim: number;
  last: Vec2 | null;
  angle: number;
  alpha: number;
  wasAlive: boolean;
  phase: number;
  survivor: boolean;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Draws actors as animated sprites plus tactical overlays (selection, health, routes,
 * last-known contacts, objectives). Unseen zombies are never drawn outside debug mode.
 */
export class EntityRenderer {
  private ground: Phaser.GameObjects.Graphics;
  private areas: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private views = new Map<string, ActorView>();
  private attackUntil = new Map<string, number>();
  private hurtUntil = new Map<string, number>();
  private lastTime = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: World,
  ) {
    this.areas = scene.add.graphics().setDepth(DEPTH.areas);
    this.ground = scene.add.graphics().setDepth(DEPTH.groundOverlay);
    this.top = scene.add.graphics().setDepth(DEPTH.topOverlay);
  }

  /** Remembers short presentation states (attack pose, hurt flash) from this tick's events. */
  ingest(events: SimEvent[], now: number): void {
    for (const e of events) {
      const p = e.payload;
      if (e.type === 'SHOT_FIRED') this.attackUntil.set(p['shooterId'] as string, now + 110);
      else if (e.type === 'MELEE_ATTACK')
        this.attackUntil.set(p['attackerId'] as string, now + 220);
      else if (e.type === 'ACTOR_INJURED') {
        this.hurtUntil.set(p['actorId'] as string, now + 160);
        if (p['sourceId']) this.attackUntil.set(p['sourceId'] as string, now + 260);
      }
    }
  }

  private label(id: string, text: string, x: number, y: number, color: string): void {
    let t = this.labels.get(id);
    if (!t) {
      t = this.scene.add
        .text(0, 0, text, {
          fontFamily: 'system-ui, sans-serif',
          fontStyle: 'bold',
          fontSize: '9px',
          color,
          stroke: '#000',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.labels);
      this.labels.set(id, t);
    }
    t.setText(text).setPosition(x, y).setVisible(true);
  }

  private view(id: string, texture: string, survivor: boolean): ActorView {
    let v = this.views.get(id);
    if (!v) {
      const shadow = this.scene.add.image(0, 0, 'fx-shadow').setDepth(DEPTH.shadows).setScale(0.62);
      const sprite = this.scene.add.image(0, 0, texture, 0).setDepth(DEPTH.actors).setScale(SCALE);
      v = {
        sprite,
        shadow,
        blood: null,
        anim: 0,
        last: null,
        angle: 0,
        alpha: 0,
        wasAlive: true,
        phase: (this.views.size * 1.7) % (Math.PI * 2),
        survivor,
      };
      this.views.set(id, v);
    }
    return v;
  }

  /** Shared per-actor animation: facing, walk cycle, attack/hurt poses, fade, death. */
  private animate(
    v: ActorView,
    id: string,
    p: Vec2,
    facing: number,
    alive: boolean,
    targetAlpha: number,
    now: number,
    dt: number,
    deathSeen: boolean,
  ): void {
    const x = p.x * CELL;
    const y = p.y * CELL;
    if (!alive) {
      if (v.wasAlive) {
        v.wasAlive = false;
        v.sprite.setFrame(CORPSE_FRAME).setDepth(DEPTH.corpses).clearTint();
        v.shadow.setVisible(false);
        if (deathSeen) {
          v.sprite.setScale(SCALE * 0.85);
          this.scene.tweens.add({
            targets: v.sprite,
            scale: SCALE,
            rotation: v.angle + 0.35,
            duration: 380,
            ease: 'Quad.easeOut',
          });
        } else v.sprite.setRotation(v.angle + 0.35);
        if (Settings.blood && !v.blood) {
          const b = this.scene.add
            .image(x, y, `fx-blood-${Math.floor(v.phase * 10) % 4}`)
            .setDepth(DEPTH.decals)
            .setRotation(v.phase * 3)
            .setScale(0.15)
            .setAlpha(0.9);
          this.scene.tweens.add({
            targets: b,
            scale: 0.42,
            duration: deathSeen ? 2600 : 1,
            ease: 'Sine.easeOut',
          });
          v.blood = b;
        }
      }
      v.sprite
        .setPosition(x, y)
        .setAlpha(targetAlpha > 0 ? 0.92 : 0)
        .setVisible(targetAlpha > 0);
      v.blood?.setVisible(targetAlpha > 0);
      return;
    }
    v.wasAlive = true;
    const moved = v.last ? Math.hypot(p.x - v.last.x, p.y - v.last.y) : 0;
    v.last = { x: p.x, y: p.y };
    v.anim = (v.anim + moved * FRAMES_PER_CELL) % WALK_FRAMES;
    v.angle = lerpAngle(v.angle, facing, Math.min(1, dt * 12));
    v.alpha += (targetAlpha - v.alpha) * Math.min(1, dt * 7);
    const attacking = (this.attackUntil.get(id) ?? 0) > now;
    const frame = attacking ? ATTACK_FRAME : moved > 0.0005 ? Math.floor(v.anim) : 0;
    const breathe = 1 + Math.sin(now / 650 + v.phase) * (moved > 0.0005 ? 0 : 0.025);
    v.sprite
      .setFrame(frame)
      .setPosition(x, y)
      .setRotation(v.angle)
      .setScale(SCALE * breathe)
      .setAlpha(v.alpha)
      .setVisible(v.alpha > 0.02);
    if ((this.hurtUntil.get(id) ?? 0) > now) v.sprite.setTintFill(0xff5040);
    else v.sprite.clearTint();
    v.shadow
      .setPosition(x + 1.4, y + 2)
      .setAlpha(v.alpha)
      .setVisible(v.alpha > 0.02);
  }

  draw(
    state: GameState,
    pos: PositionLookup,
    selectedSquadId: string | null,
    showAllZombies: boolean,
    timeMs: number,
  ): void {
    const dt = this.lastTime ? Math.min(0.1, (timeMs - this.lastTime) / 1000) : 0;
    this.lastTime = timeMs;
    const g = this.ground.clear();
    const top = this.top.clear();
    const o = this.areas.clear();
    for (const t of this.labels.values()) t.setVisible(false);
    const mission = this.world.mission;
    const fogAt = (p: Vec2) =>
      state.fog.cells[Math.floor(p.y) * this.world.width + Math.floor(p.x)] ?? 0;

    // mission areas (known from the briefing)
    const per = mission.objectives.perimeter;
    o.lineStyle(1, COLORS.perimeter, 0.3).strokeRect(
      per.x0 * CELL,
      per.y0 * CELL,
      (per.x1 - per.x0 + 1) * CELL,
      (per.y1 - per.y0 + 1) * CELL,
    );
    const ex = mission.objectives.extraction.zone;
    const exAlpha = state.mission.extractionActive ? 0.16 + 0.08 * Math.sin(timeMs / 250) : 0.07;
    o.fillStyle(COLORS.extraction, exAlpha).fillRect(
      ex.x0 * CELL,
      ex.y0 * CELL,
      (ex.x1 - ex.x0 + 1) * CELL,
      (ex.y1 - ex.y0 + 1) * CELL,
    );
    o.lineStyle(1.5, COLORS.extraction, 0.65).strokeRect(
      ex.x0 * CELL,
      ex.y0 * CELL,
      (ex.x1 - ex.x0 + 1) * CELL,
      (ex.y1 - ex.y0 + 1) * CELL,
    );
    const b = mission.objectives.extraction.beacon;
    const bx = b.x * CELL;
    const by = b.y * CELL;
    g.fillStyle(0x1a1c1f).fillRoundedRect(bx - 6, by - 5, 12, 10, 2);
    g.fillStyle(state.mission.extractionActive ? 0x9fe870 : 0x5f7f4a).fillRect(
      bx - 4,
      by - 3,
      5,
      6,
    );
    g.lineStyle(1, 0xbfc7b0, 0.9).lineBetween(bx + 3, by - 4, bx + 5, by - 12);
    if (state.mission.extractionActive) {
      const r = 6 + ((timeMs / 40) % 22);
      g.lineStyle(1.2, 0x9fe870, Math.max(0, 0.7 - r / 32)).strokeCircle(bx, by, r);
    }
    this.label(
      BEACON_ID,
      state.mission.extractionActive ? 'RÁDIO ATIVO' : 'RÁDIO',
      bx,
      by - 13,
      '#b9e2a8',
    );
    if (!state.mission.medicineCollected) {
      const c = mission.objectives.cabinet.cell;
      const cx = (c.x + 1) * CELL;
      const cy = (c.y + 0.5) * CELL;
      const pulse = 0.6 + 0.4 * Math.sin(timeMs / 300);
      g.lineStyle(1, 0x7fe0c0, 0.5 * pulse).strokeCircle(cx, cy, 10);
      g.fillStyle(0x7fe0c0)
        .fillRect(cx - 1.5, cy - 5, 3, 10)
        .fillRect(cx - 5, cy - 1.5, 10, 3);
      this.label(CABINET_ID, 'REMÉDIOS', cx, cy - 11, '#9ff0d8');
    }

    // last-known contacts (never live positions of unseen zombies)
    for (const c of state.contacts) {
      if (c.visible) continue;
      const age = (state.tick - c.tick) / 10;
      const a = Math.max(0.15, 0.7 - age / 60);
      const x = c.position.x * CELL;
      const y = c.position.y * CELL;
      g.lineStyle(1, COLORS.contact, a).strokeCircle(x, y, 6);
      g.lineStyle(1, COLORS.contact, a * 0.6)
        .lineBetween(x - 9, y, x - 7, y)
        .lineBetween(x + 7, y, x + 9, y);
      top.fillStyle(COLORS.contact, a).fillRect(x - 1, y - 3, 2, 4);
    }

    const visible = new Set(state.contacts.filter((c) => c.visible).map((c) => c.zombieId));
    const seen = new Set<string>();
    for (const z of state.zombies) {
      seen.add(z.id);
      const p = pos(z.id, z.position);
      const v = this.view(z.id, zombieTextureKey(z.typeId, z.id), false);
      if (!z.alive) {
        const known = v.alpha > 0.05 || !v.wasAlive;
        const shown = (known || showAllZombies) && fogAt(z.position) !== 0;
        this.animate(v, z.id, p, z.facing, false, shown ? 1 : 0, timeMs, dt, v.alpha > 0.3);
        continue;
      }
      const target = visible.has(z.id) ? 1 : showAllZombies ? 0.45 : 0;
      this.animate(v, z.id, p, z.facing, true, target, timeMs, dt, false);
      if (target > 0 && (z.ai.state === 'pursue' || z.ai.state === 'attack')) {
        const x = p.x * CELL;
        const y = p.y * CELL;
        top.fillStyle(0xff4b3a, v.alpha).fillTriangle(x - 3, y - 13, x + 3, y - 13, x, y - 9);
      }
    }

    const selectedSquad = state.squads.find((s) => s.id === selectedSquadId);
    if (selectedSquad?.order && selectedSquad.order.status === 'executing') {
      const color = SQUAD_COLORS[selectedSquad.id] ?? 0xffffff;
      for (const id of selectedSquad.memberIds) {
        const s = state.survivors.find((m) => m.id === id);
        if (!s || !s.alive || s.pathIndex >= s.path.length) continue;
        const p = pos(s.id, s.position);
        g.lineStyle(1, color, 0.45)
          .beginPath()
          .moveTo(p.x * CELL, p.y * CELL);
        for (let i = s.pathIndex; i < s.path.length; i++) {
          const w = s.path[i] as Vec2;
          g.lineTo(w.x * CELL, w.y * CELL);
        }
        g.strokePath();
        if (s.slot) g.lineStyle(1, 0xffffff, 0.5).strokeCircle(s.slot.x * CELL, s.slot.y * CELL, 3);
      }
      const t = selectedSquad.order.targetPosition;
      if (t) {
        const r = 7 + Math.sin(timeMs / 200) * 1.2;
        g.lineStyle(1.5, color, 0.85).strokeCircle(t.x * CELL, t.y * CELL, r);
      }
    }

    for (const s of state.survivors) {
      seen.add(s.id);
      const v = this.view(s.id, survivorTextureKey(s.templateId, s.isObjectiveCivilian), true);
      const p = pos(s.id, s.position);
      if (s.extracted) {
        v.sprite.setVisible(false);
        v.shadow.setVisible(false);
        continue;
      }
      let target = 1;
      if (s.isObjectiveCivilian && !s.rescued && s.alive && fogAt(s.position) !== 2) target = 0;
      this.animate(v, s.id, p, s.facing, s.alive, target, timeMs, dt, true);
      if (!s.alive || target === 0) continue;
      this.drawSurvivorOverlay(
        g,
        top,
        s,
        p,
        s.squadId === selectedSquadId && s.squadId !== null,
        timeMs,
      );
    }

    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.blood?.destroy();
      this.views.delete(id);
    }
  }

  private drawSurvivorOverlay(
    g: Phaser.GameObjects.Graphics,
    top: Phaser.GameObjects.Graphics,
    s: Survivor,
    p: Vec2,
    selected: boolean,
    timeMs: number,
  ): void {
    const x = p.x * CELL;
    const y = p.y * CELL;
    const color = s.isObjectiveCivilian
      ? COLORS.civilian
      : (SQUAD_COLORS[s.squadId ?? ''] ?? 0xffffff);
    // squad ring on the ground: always on (identification), brighter when selected
    g.lineStyle(1, selected ? COLORS.select : color, selected ? 0.9 : 0.45).strokeEllipse(
      x,
      y + 1,
      14,
      11,
    );
    if (s.panicked && Math.floor(timeMs / 200) % 2 === 0)
      g.lineStyle(2, COLORS.panic, 1).strokeEllipse(x, y + 1, 19, 15);
    if (s.isLeader)
      top.fillStyle(0xffffff, 0.9).fillTriangle(x - 2.2, y - 12, x + 2.2, y - 12, x, y - 9.5);
    if (s.isObjectiveCivilian) this.label(s.id, 'CIVIL', x, y - 10, '#f0e6d6');
    // health arc only when hurt or selected (keeps the field readable)
    const hp = Math.max(0, s.health / s.maxHealth);
    if (hp < 0.999 || selected) {
      top
        .lineStyle(2, hp > 0.5 ? 0x6fb35a : hp > 0.25 ? 0xe3b341 : 0xe0563e, 0.95)
        .beginPath()
        .arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + hp * Math.PI * 2)
        .strokePath();
    }
    if (s.interaction) {
      const f = s.interaction.progressTicks / s.interaction.totalTicks;
      top.fillStyle(0x000000, 0.7).fillRect(x - 10, y + 11, 20, 4);
      top.fillStyle(0x9fe870).fillRect(x - 10, y + 11, 20 * f, 4);
    } else if (s.weapon.reloadRemaining > 0) {
      const f = 1 - s.weapon.reloadRemaining / Math.max(1, s.weapon.reloadTicks);
      top.fillStyle(0x000000, 0.7).fillRect(x - 10, y + 11, 20, 3);
      top.fillStyle(0x5b8fc9).fillRect(x - 10, y + 11, 20 * f, 3);
    }
  }

  /** Light sources carried by visible actors (consumed by the lighting pass). */
  forEachSurvivorView(cb: (x: number, y: number, angle: number) => void): void {
    for (const v of this.views.values()) {
      if (v.survivor && v.wasAlive && v.sprite.visible && v.alpha > 0.5)
        cb(v.sprite.x, v.sprite.y, v.angle);
    }
  }
}
