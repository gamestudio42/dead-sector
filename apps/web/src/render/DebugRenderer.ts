import Phaser from 'phaser';
import { propagateNoise, type GameState, type NoiseEvent, type World } from '@dead-sector/sim';
import { CELL, DEPTH } from './constants';

const STATE_COLORS: Record<string, string> = {
  idle: '#9a9a9a',
  wander: '#c8c8c8',
  investigate: '#ffd27a',
  search: '#7ab8ff',
  pursue: '#ff6a4a',
  attack: '#ff2a2a',
};

/** ?debug=1 overlay: grid, LOS lines, acoustic field, zombie FSM state, spawners and paths. */
export class DebugRenderer {
  private g: Phaser.GameObjects.Graphics;
  private field: Phaser.GameObjects.Graphics;
  private grid: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private lastNoiseId = '';

  constructor(
    private scene: Phaser.Scene,
    private world: World,
  ) {
    this.grid = scene.add.graphics().setDepth(2);
    this.grid.lineStyle(1, 0xffffff, 0.06);
    for (let x = 0; x <= world.width; x++)
      this.grid.lineBetween(x * CELL, 0, x * CELL, world.height * CELL);
    for (let y = 0; y <= world.height; y++)
      this.grid.lineBetween(0, y * CELL, world.width * CELL, y * CELL);
    this.field = scene.add.graphics().setDepth(DEPTH.debug);
    this.g = scene.add.graphics().setDepth(DEPTH.debug);
  }

  private drawField(state: GameState, noise: NoiseEvent): void {
    const f = propagateNoise(this.world, state, noise.position, noise.intensity);
    const g = this.field.clear();
    const W = this.world.width;
    for (let i = 0; i < f.length; i++) {
      const v = f[i] as number;
      if (v <= 0) continue;
      const x = i % W;
      const y = (i - x) / W;
      g.fillStyle(v >= 15 ? 0xff7a3a : 0x3a8aff, Math.min(0.45, v / 120)).fillRect(
        x * CELL,
        y * CELL,
        CELL,
        CELL,
      );
    }
  }

  draw(state: GameState): void {
    const loud = [...state.recentNoises].reverse().find((n) => n.category !== 'footstep');
    if (loud && loud.id !== this.lastNoiseId) {
      this.lastNoiseId = loud.id;
      this.drawField(state, loud);
    } else if (!loud && this.lastNoiseId) {
      this.lastNoiseId = '';
      this.field.clear();
    }
    const g = this.g.clear();
    let li = 0;
    const label = (text: string, x: number, y: number, color: string) => {
      let t = this.labels[li];
      if (!t) {
        t = this.scene.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#fff',
            stroke: '#000',
            strokeThickness: 2,
          })
          .setDepth(DEPTH.labels)
          .setOrigin(0.5, 0);
        this.labels.push(t);
      }
      t.setText(text).setColor(color).setPosition(x, y).setVisible(true);
      li++;
    };
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const x = z.position.x * CELL;
      const y = z.position.y * CELL;
      const c = STATE_COLORS[z.ai.state] ?? '#fff';
      label(z.ai.state, x, y + 7, c);
      if (z.ai.goal)
        g.lineStyle(1, Phaser.Display.Color.HexStringToColor(c).color, 0.5).lineBetween(
          x,
          y,
          z.ai.goal.x * CELL,
          z.ai.goal.y * CELL,
        );
    }
    for (const s of state.survivors) {
      if (!s.alive) continue;
      for (const id of s.seenZombieIds) {
        const z = state.zombies.find((q) => q.id === id);
        if (z)
          g.lineStyle(1, 0x9fe870, 0.35).lineBetween(
            s.position.x * CELL,
            s.position.y * CELL,
            z.position.x * CELL,
            z.position.y * CELL,
          );
      }
    }
    for (const sp of state.mission.spawners) {
      g.lineStyle(2, 0xff00ff, 0.8).strokeRect(sp.cell.x * CELL, sp.cell.y * CELL, CELL, CELL);
      label(
        `spawn ${Math.round(sp.pressure)}`,
        sp.cell.x * CELL + 8,
        sp.cell.y * CELL + (sp.cell.y > 50 ? -14 : 16),
        '#ff9cff',
      );
    }
    for (let i = li; i < this.labels.length; i++) this.labels[i]!.setVisible(false);
  }

  destroy(): void {
    this.g.destroy();
    this.field.destroy();
    this.grid.destroy();
    for (const t of this.labels) t.destroy();
  }
}
