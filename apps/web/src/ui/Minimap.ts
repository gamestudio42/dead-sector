import type { GameState, SimEvent, World } from '@dead-sector/sim';
import { baseMap, drawMissionMarks, fogLayer } from './MapCanvas';
import { Settings } from './SaveStore';

const PX = 2;
const SQUAD_CSS: Record<string, string> = { alfa: '#5aa9ff', bravo: '#ffad4d' };

interface Ping {
  x: number;
  y: number;
  born: number;
  color: string;
}

export interface MinimapView {
  /** Camera view in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Minimap (spec 13.1): explored terrain, own units, known contacts only (visible infected and
 * last-known markers — never unseen zombies), mission areas, camera frame and event pings.
 * Left click/drag moves the camera; right click sends the selected squad there.
 */
export class Minimap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private fog = document.createElement('canvas');
  private pings: Ping[] = [];
  private dragging = false;
  private lastDraw = 0;

  constructor(
    private world: World,
    private onCenter: (x: number, y: number) => void,
    private onMove: (x: number, y: number) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'minimap panel';
    this.el.dataset['testid'] = 'minimap';
    this.el.innerHTML = `<h4 class="collapsible" data-toggle="minimap">Mapa <span class="chev"></span></h4>`;
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.width * PX;
    this.canvas.height = world.height * PX;
    this.canvas.title = 'Clique: mover câmera · botão direito: mover esquadrão';
    this.el.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.g.imageSmoothingEnabled = false;
    this.el.classList.toggle('collapsed', !Settings.minimapOpen);

    const cell = (ev: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - r.left) / r.width) * world.width,
        y: ((ev.clientY - r.top) / r.height) * world.height,
      };
    };
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = cell(e);
      if (e.button === 2) return this.onMove(p.x, p.y);
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.onCenter(p.x, p.y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const p = cell(e);
      this.onCenter(p.x, p.y);
    });
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
  }

  toggle(): void {
    Settings.minimapOpen = !Settings.minimapOpen;
    this.el.classList.toggle('collapsed', !Settings.minimapOpen);
  }

  /** Pings for things the squads know happened (never positions they could not know). */
  ingest(events: SimEvent[], state: GameState, now: number): void {
    for (const e of events) {
      const p = e.payload;
      if (e.type === 'REINFORCEMENT_SPAWNED') {
        const sp = this.world.mission.spawners.find((s) => s.id === p['spawnerId']);
        if (sp)
          this.pings.push({ x: sp.cell.x + 0.5, y: sp.cell.y + 0.5, born: now, color: '#e0563e' });
      } else if (
        e.type === 'ACTOR_INJURED' ||
        (e.type === 'ACTOR_KILLED' && p['kind'] === 'survivor')
      ) {
        const s = state.survivors.find((m) => m.id === p['actorId']);
        if (s) this.pings.push({ x: s.position.x, y: s.position.y, born: now, color: '#ff6a50' });
      } else if (e.type === 'EXTRACTION_STARTED') {
        const b = this.world.mission.objectives.extraction.beacon;
        this.pings.push({ x: b.x, y: b.y, born: now, color: '#9fe870' });
      }
    }
  }

  draw(state: GameState, view: MinimapView, selectedIds: string[], now: number): void {
    if (!Settings.minimapOpen || now - this.lastDraw < 120) return;
    this.lastDraw = now;
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.drawImage(baseMap(this.world, PX), 0, 0);
    drawMissionMarks(g, this.world, PX, state.mission.medicineCollected);
    g.drawImage(fogLayer(state, this.world, this.fog), 0, 0, W, H);

    // known contacts
    for (const c of state.contacts) {
      const x = c.position.x * PX;
      const y = c.position.y * PX;
      if (c.visible) {
        g.fillStyle = '#ff4b3a';
        g.beginPath();
        g.moveTo(x, y - 3);
        g.lineTo(x + 3, y + 2.5);
        g.lineTo(x - 3, y + 2.5);
        g.closePath();
        g.fill();
      } else {
        g.strokeStyle = 'rgba(200,200,200,0.75)';
        g.lineWidth = 1;
        g.strokeRect(x - 2, y - 2, 4, 4);
      }
    }
    // own units
    for (const s of state.survivors) {
      if (s.extracted) continue;
      if (
        s.isObjectiveCivilian &&
        !s.rescued &&
        state.fog.cells[Math.floor(s.position.y) * this.world.width + Math.floor(s.position.x)] !==
          2
      )
        continue;
      const x = s.position.x * PX;
      const y = s.position.y * PX;
      if (!s.alive) {
        g.strokeStyle = '#a04030';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x - 2, y - 2);
        g.lineTo(x + 2, y + 2);
        g.moveTo(x + 2, y - 2);
        g.lineTo(x - 2, y + 2);
        g.stroke();
        continue;
      }
      const r = s.squadId !== null && selectedIds.includes(s.squadId) ? 3.2 : 2.5;
      g.fillStyle = s.isObjectiveCivilian ? '#f0e6d6' : (SQUAD_CSS[s.squadId ?? ''] ?? '#fff');
      g.strokeStyle = '#0b0c0e';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // pings
    this.pings = this.pings.filter((p) => now - p.born < 2400);
    for (const p of this.pings) {
      const t = (now - p.born) / 2400;
      g.strokeStyle = p.color;
      g.globalAlpha = 1 - t;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(p.x * PX, p.y * PX, 3 + t * 14, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    // camera frame
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1;
    g.strokeRect(view.x * PX + 0.5, view.y * PX + 0.5, view.w * PX, view.h * PX);
  }
}
