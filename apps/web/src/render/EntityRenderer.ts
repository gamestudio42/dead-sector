import Phaser from 'phaser';
import {
  BEACON_ID,
  CABINET_ID,
  type GameState,
  type Survivor,
  type Vec2,
  type World,
} from '@dead-sector/sim';
import { CELL, COLORS, SQUAD_COLORS } from './constants';

export type PositionLookup = (id: string, current: Vec2) => Vec2;

/** Draws survivors, visible zombies, last-known contacts, objectives and the selected squad's routes. */
export class EntityRenderer {
  private g: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(
    private scene: Phaser.Scene,
    private world: World,
  ) {
    this.overlay = scene.add.graphics().setDepth(4);
    this.g = scene.add.graphics().setDepth(10);
  }

  private label(id: string, text: string, x: number, y: number, color: string): void {
    let t = this.labels.get(id);
    if (!t) {
      t = this.scene.add
        .text(0, 0, text, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color,
          stroke: '#000',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(11);
      this.labels.set(id, t);
    }
    t.setText(text).setPosition(x, y).setVisible(true);
  }

  draw(
    state: GameState,
    pos: PositionLookup,
    selectedSquadId: string | null,
    showAllZombies: boolean,
    timeMs: number,
  ): void {
    const g = this.g.clear();
    const o = this.overlay.clear();
    for (const t of this.labels.values()) t.setVisible(false);
    const mission = this.world.mission;

    // mission areas (known from the briefing)
    const per = mission.objectives.perimeter;
    o.lineStyle(1, COLORS.perimeter, 0.35).strokeRect(
      per.x0 * CELL,
      per.y0 * CELL,
      (per.x1 - per.x0 + 1) * CELL,
      (per.y1 - per.y0 + 1) * CELL,
    );
    const ex = mission.objectives.extraction.zone;
    const exAlpha = state.mission.extractionActive ? 0.18 + 0.08 * Math.sin(timeMs / 250) : 0.08;
    o.fillStyle(COLORS.extraction, exAlpha).fillRect(
      ex.x0 * CELL,
      ex.y0 * CELL,
      (ex.x1 - ex.x0 + 1) * CELL,
      (ex.y1 - ex.y0 + 1) * CELL,
    );
    o.lineStyle(1.5, COLORS.extraction, 0.7).strokeRect(
      ex.x0 * CELL,
      ex.y0 * CELL,
      (ex.x1 - ex.x0 + 1) * CELL,
      (ex.y1 - ex.y0 + 1) * CELL,
    );
    const b = mission.objectives.extraction.beacon;
    g.fillStyle(state.mission.extractionActive ? 0x9fe870 : 0x6f8f5a).fillRect(
      b.x * CELL - 5,
      b.y * CELL - 5,
      10,
      10,
    );
    g.lineStyle(1, 0xffffff, 0.8).strokeRect(b.x * CELL - 5, b.y * CELL - 5, 10, 10);
    this.label(
      BEACON_ID,
      state.mission.extractionActive ? 'RÁDIO ATIVO' : 'RÁDIO',
      b.x * CELL,
      b.y * CELL - 7,
      '#b9e2a8',
    );
    if (!state.mission.medicineCollected) {
      const c = mission.objectives.cabinet.cell;
      const cx = (c.x + 1) * CELL;
      const cy = (c.y + 0.5) * CELL;
      g.fillStyle(0x7fe0c0)
        .fillRect(cx - 1.5, cy - 5, 3, 10)
        .fillRect(cx - 5, cy - 1.5, 10, 3);
      this.label(CABINET_ID, 'REMÉDIOS', cx, cy - 7, '#9ff0d8');
    }

    // last-known contacts (never live positions of unseen zombies)
    for (const c of state.contacts) {
      if (c.visible) continue;
      const age = (state.tick - c.tick) / 10;
      const a = Math.max(0.15, 0.7 - age / 60);
      g.lineStyle(1, COLORS.contact, a).strokeCircle(c.position.x * CELL, c.position.y * CELL, 6);
      g.fillStyle(COLORS.contact, a).fillRect(
        c.position.x * CELL - 1,
        c.position.y * CELL - 3,
        2,
        4,
      );
    }

    const visible = new Set(state.contacts.filter((c) => c.visible).map((c) => c.zombieId));
    for (const z of state.zombies) {
      const shown = visible.has(z.id) || showAllZombies;
      if (!shown) continue;
      const p = pos(z.id, z.position);
      const x = p.x * CELL;
      const y = p.y * CELL;
      if (!z.alive) {
        if (
          state.fog.cells[
            Math.floor(z.position.y) * this.world.width + Math.floor(z.position.x)
          ] === 0
        )
          continue;
        g.fillStyle(0x3a3f32, 0.8).fillEllipse(x, y, 11, 7);
        continue;
      }
      const color = z.typeId === 'runner' ? COLORS.runner : COLORS.walker;
      g.fillStyle(color, visible.has(z.id) ? 1 : 0.45).fillCircle(x, y, 6);
      g.lineStyle(1.5, 0x111111, 1).strokeCircle(x, y, 6);
      g.lineStyle(2, 0x1b1f15, 1).lineBetween(
        x,
        y,
        x + Math.cos(z.facing) * 8,
        y + Math.sin(z.facing) * 8,
      );
      if (z.ai.state === 'pursue' || z.ai.state === 'attack')
        g.fillStyle(0xff4b3a).fillTriangle(x - 3, y - 11, x + 3, y - 11, x, y - 7);
    }

    // corpses of survivors under the living
    for (const s of state.survivors) {
      if (s.alive) continue;
      const x = s.position.x * CELL;
      const y = s.position.y * CELL;
      g.lineStyle(2, 0x8a3a30, 0.9)
        .lineBetween(x - 5, y - 5, x + 5, y + 5)
        .lineBetween(x - 5, y + 5, x + 5, y - 5);
    }

    const selectedSquad = state.squads.find((s) => s.id === selectedSquadId);
    if (selectedSquad?.order && selectedSquad.order.status === 'executing') {
      for (const id of selectedSquad.memberIds) {
        const s = state.survivors.find((m) => m.id === id);
        if (!s || !s.alive || s.pathIndex >= s.path.length) continue;
        const p = pos(s.id, s.position);
        g.lineStyle(1, SQUAD_COLORS[selectedSquad.id] ?? 0xffffff, 0.55)
          .beginPath()
          .moveTo(p.x * CELL, p.y * CELL);
        for (let i = s.pathIndex; i < s.path.length; i++) {
          const w = s.path[i] as Vec2;
          g.lineTo(w.x * CELL, w.y * CELL);
        }
        g.strokePath();
        if (s.slot) g.lineStyle(1, 0xffffff, 0.6).strokeCircle(s.slot.x * CELL, s.slot.y * CELL, 3);
      }
      const t = selectedSquad.order.targetPosition;
      if (t) g.lineStyle(1.5, 0xffffff, 0.8).strokeCircle(t.x * CELL, t.y * CELL, 7);
    }

    for (const s of state.survivors) {
      if (!s.alive || s.extracted) continue;
      if (s.isObjectiveCivilian && !s.rescued) {
        const cell =
          state.fog.cells[Math.floor(s.position.y) * this.world.width + Math.floor(s.position.x)];
        if (cell !== 2) continue;
      }
      this.drawSurvivor(
        g,
        s,
        pos(s.id, s.position),
        s.squadId === selectedSquadId && s.squadId !== null,
        timeMs,
      );
    }
  }

  private drawSurvivor(
    g: Phaser.GameObjects.Graphics,
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
    if (selected) g.lineStyle(2, COLORS.select, 0.9).strokeCircle(x, y, 9);
    if (s.panicked && Math.floor(timeMs / 200) % 2 === 0)
      g.lineStyle(2, COLORS.panic, 1).strokeCircle(x, y, 11);
    g.fillStyle(color, 1).fillCircle(x, y, 6);
    g.lineStyle(1.5, 0x0b0c0e, 1).strokeCircle(x, y, 6);
    g.lineStyle(2, 0xffffff, 0.85).lineBetween(
      x,
      y,
      x + Math.cos(s.facing) * 9,
      y + Math.sin(s.facing) * 9,
    );
    if (s.isLeader) g.fillStyle(0xffffff).fillTriangle(x - 3, y - 9, x + 3, y - 9, x, y - 13);
    if (s.isObjectiveCivilian) this.label(s.id, 'CIVIL', x, y - 8, '#f0e6d6');
    // health ring segment
    const hp = Math.max(0, s.health / s.maxHealth);
    g.lineStyle(2, hp > 0.5 ? 0x6fb35a : hp > 0.25 ? 0xe3b341 : 0xe0563e, 1)
      .beginPath()
      .arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + hp * Math.PI * 2)
      .strokePath();
    if (s.interaction) {
      const f = s.interaction.progressTicks / s.interaction.totalTicks;
      g.fillStyle(0x000000, 0.7).fillRect(x - 10, y + 10, 20, 4);
      g.fillStyle(0x9fe870).fillRect(x - 10, y + 10, 20 * f, 4);
    } else if (s.weapon.reloadRemaining > 0) {
      const f = 1 - s.weapon.reloadRemaining / Math.max(1, s.weapon.reloadTicks);
      g.fillStyle(0x000000, 0.7).fillRect(x - 10, y + 10, 20, 3);
      g.fillStyle(0x5b8fc9).fillRect(x - 10, y + 10, 20 * f, 3);
    }
  }
}
