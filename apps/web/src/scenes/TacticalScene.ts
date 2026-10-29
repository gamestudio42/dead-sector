import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import {
  COMBAT_PLAN,
  createPlanRunner,
  deserializeState,
  FixedStepClock,
  GameSimulation,
  hashState,
  serializeState,
  STEALTH_PLAN,
  tickPlan,
  type GameCommandInput,
  type MoveMode,
  type OrderType,
  type PlanStep,
  type Vec2,
} from '@dead-sector/sim';
import { AudioEngine } from '../audio/AudioEngine';
import { captionFor } from '../audio/captions';
import { cuesForEvents, threatLevel } from '../audio/cues';
import { CameraController } from '../input/CameraController';
import { KeyBindings, type Action } from '../input/KeyBindings';
import { commandsForRightClick, targetAt, type RightClickOptions } from '../input/OrderController';
import { squadAt, squadsInRect } from '../input/SelectionController';
import { barksForEvents } from '../presentation/barks';
import {
  emptyRecord,
  recordEvents,
  recordTraces,
  type MissionRecord,
} from '../presentation/timeline';
import { BarkRenderer } from '../render/BarkRenderer';
import { CELL } from '../render/constants';
import { DebugRenderer } from '../render/DebugRenderer';
import { EffectsRenderer } from '../render/EffectsRenderer';
import { EntityRenderer } from '../render/EntityRenderer';
import { FogRenderer } from '../render/FogRenderer';
import { LightingRenderer } from '../render/LightingRenderer';
import { MapRenderer } from '../render/MapRenderer';
import { ContextMenu } from '../ui/ContextMenu';
import { clearUi, uiRoot } from '../ui/dom';
import { Hud, POLICY_CYCLE } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { openOptions } from '../ui/OptionsPanel';
import { SaveStore, Settings } from '../ui/SaveStore';
import { MISSION_ID, QUICKSAVE } from './MenuScene';

const ORDER_ACTIONS: Partial<Record<Action, OrderType>> = {
  hold: 'hold',
  hide: 'hide',
  retreat: 'retreat',
  regroup: 'regroup',
};
const MODE_ACTIONS: Partial<Record<Action, MoveMode>> = {
  modeSneak: 'sneak',
  modeMove: 'move',
  modeSprint: 'sprint',
};
/** Screen pixels the pointer must travel before a left press becomes a drag box. */
const DRAG_THRESHOLD = 6;

export class TacticalScene extends Phaser.Scene {
  sim!: GameSimulation;
  clock!: FixedStepClock;
  private camCtl!: CameraController;
  private mapR!: MapRenderer;
  private fogR!: FogRenderer;
  private entR!: EntityRenderer;
  private fxR!: EffectsRenderer;
  private lightR!: LightingRenderer;
  private barkR!: BarkRenderer;
  private audio = AudioEngine.get();
  private nextTensionAt = 0;
  private minimap!: Minimap;
  private optionsEl: HTMLDivElement | null = null;
  private record: MissionRecord = emptyRecord();
  private dbgR: DebugRenderer | null = null;
  private hud!: Hud;
  /** Selected squads; the first one is the primary (shown in the orders panel and unit strip). */
  private selection: string[] = ['alfa'];
  private drag: { sx: number; sy: number; wx: number; wy: number; active: boolean } | null = null;
  private boxG!: Phaser.GameObjects.Graphics;
  private menu = new ContextMenu();
  private prev = new Map<string, Vec2>();
  private endAt = 0;
  private pauseMenu: HTMLDivElement | null = null;
  private tickMsAvg = 0;
  private plan: { steps: PlanStep[]; runner: ReturnType<typeof createPlanRunner> } | null = null;
  private eventCounts: Record<string, number> = {};
  private onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor() {
    super('Tactical');
  }

  create(data: { seed?: number; save?: string; paused?: boolean }): void {
    clearUi();
    const content = loadContent();
    if (data.save) {
      try {
        this.sim = new GameSimulation(content, deserializeState(data.save));
      } catch (err) {
        this.sim = GameSimulation.create(MISSION_ID, data.seed, content);
        window.setTimeout(
          () => this.hud.toast(`Salvamento inválido: ${(err as Error).message}`),
          50,
        );
      }
    } else this.sim = GameSimulation.create(MISSION_ID, data.seed, content);
    this.clock = new FixedStepClock();
    this.clock.paused = !!data.paused;
    this.eventCounts = {};
    this.record = emptyRecord();
    this.prev.clear();
    this.endAt = 0;
    this.plan = null;
    const world = this.sim.world;
    this.mapR = new MapRenderer(this, world);
    this.fogR = new FogRenderer(this, world);
    this.lightR = new LightingRenderer(this, world, this.mapR.burning, Settings.lighting);
    this.entR = new EntityRenderer(this, world);
    this.fxR = new EffectsRenderer(this, world, this.lightR);
    this.barkR = new BarkRenderer(this);
    this.audio.unlock();
    this.audio.startAmbience();
    if (new URLSearchParams(location.search).get('debug') === '1') this.toggleDebug();
    this.camCtl = new CameraController(this, world.width, world.height);
    const alfa = this.sim.state.survivors.find((s) => s.squadId === 'alfa');
    this.camCtl.centerOn(alfa?.position.x ?? 10, (alfa?.position.y ?? 6) + 6);

    this.hud = new Hud(uiRoot(), {
      selectSquad: (id, additive) => this.select(id, additive),
      order: (type) => this.orderFromPanel(type),
      cyclePolicy: () => this.cyclePolicy(),
      setMode: (m) => this.setMode(m),
      togglePause: () => this.togglePause(),
      toggleSpeed: () => this.toggleSpeed(),
      save: () => void this.saveGame(),
      load: () => void this.loadGame(),
      confirmExtraction: () => this.issue({ type: 'confirmExtraction', payload: {} }),
      openMenu: () => this.togglePauseMenu(),
      openOptions: () => this.showOptions(),
      toggleMinimap: () => this.minimap.toggle(),
    });
    this.minimap = new Minimap(
      world,
      (x, y) => this.camCtl.centerOn(x, y),
      (x, y) => this.rightClick({ x, y }),
    );
    this.hud.mountMinimap(this.minimap.el);

    this.selection = [this.sim.state.squads[0]?.id ?? 'alfa'];
    this.boxG = this.add.graphics().setDepth(19);
    this.input.mouse?.disableContextMenu();
    const toWorld = (p: Phaser.Input.Pointer) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      return { x: wp.x / CELL, y: wp.y / CELL };
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const ev = p.event as MouseEvent;
      const w = toWorld(p);
      if (p.rightButtonDown()) {
        if (ev.ctrlKey || ev.metaKey) this.openContextMenu(w, ev.clientX, ev.clientY);
        else this.rightClick(w, { queue: ev.shiftKey });
      } else if (p.leftButtonDown()) {
        this.drag = { sx: p.x, sy: p.y, wx: w.x, wy: w.y, active: false };
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.leftButtonDown()) return;
      if (!this.drag.active && Math.hypot(p.x - this.drag.sx, p.y - this.drag.sy) > DRAG_THRESHOLD)
        this.drag.active = true;
      if (this.drag.active) this.drawDragBox(toWorld(p));
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      this.boxG.clear();
      if (!d || (p.event as MouseEvent).button !== 0) return;
      const additive = (p.event as MouseEvent).shiftKey;
      const w = toWorld(p);
      if (d.active) {
        const ids = squadsInRect(this.sim.state, { x: d.wx, y: d.wy }, w);
        if (ids.length) this.setSelection(additive ? [...this.selection, ...ids] : ids);
      } else {
        const sq = squadAt(this.sim.state, w);
        if (sq) this.select(sq, additive);
      }
    });
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => this.teardown());
    this.exposeTestHooks();
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.onKey);
    this.menu.close();
    this.audio.stopAmbience();
    this.fxR.destroy();
    this.lightR.destroy();
    this.camCtl.destroy();
    this.hud.destroy();
    this.pauseMenu?.remove();
    this.pauseMenu = null;
    this.optionsEl?.remove();
    this.optionsEl = null;
    this.dbgR?.destroy();
    this.dbgR = null;
  }

  private issue(cmd: GameCommandInput): void {
    if (this.sim.ended) return;
    this.sim.enqueue(cmd);
  }

  private get primary(): string | null {
    return this.selection[0] ?? null;
  }

  /** Squads that can still take orders (dead squads drop out of the selection). */
  private orderable(): string[] {
    return this.selection.filter((id) =>
      this.sim.state.survivors.some((s) => s.squadId === id && s.alive && !s.extracted),
    );
  }

  private setSelection(ids: string[]): void {
    const known = new Set(this.sim.state.squads.map((s) => s.id));
    const next = [...new Set(ids)].filter((id) => known.has(id));
    if (next.length) this.selection = next;
    this.hud.setContext('');
  }

  /** Plain select replaces the selection; additive (Shift) toggles the squad in or out. */
  private select(id: string, additive = false): void {
    if (!this.sim.state.squads.some((s) => s.id === id)) {
      this.hud.toast('Esquadrão inexistente nesta missão');
      return;
    }
    if (!additive) return this.setSelection([id]);
    if (!this.selection.includes(id)) return this.setSelection([...this.selection, id]);
    if (this.selection.length > 1) this.setSelection(this.selection.filter((s) => s !== id));
  }

  private rightClick(p: Vec2, opts: RightClickOptions = {}): void {
    const ids = this.orderable();
    if (!ids.length) return this.hud.toast('Selecione um esquadrão (1, 2, clique ou arraste)');
    for (const cmd of commandsForRightClick(this.sim.world, this.sim.state, ids, p, opts))
      this.issue(cmd);
  }

  private drawDragBox(w: Vec2): void {
    const d = this.drag;
    if (!d) return;
    const x = Math.min(d.wx, w.x) * CELL;
    const y = Math.min(d.wy, w.y) * CELL;
    const bw = Math.abs(w.x - d.wx) * CELL;
    const bh = Math.abs(w.y - d.wy) * CELL;
    this.boxG
      .clear()
      .fillStyle(0x9fe870, 0.08)
      .fillRect(x, y, bw, bh)
      .lineStyle(1 / this.cameras.main.zoom + 0.5, 0x9fe870, 0.85)
      .strokeRect(x, y, bw, bh);
  }

  /** Ctrl + right click: every order that makes sense at this spot, with its consequence. */
  private openContextMenu(p: Vec2, sx: number, sy: number): void {
    const ids = this.orderable();
    if (!ids.length) return this.hud.toast('Selecione um esquadrão primeiro');
    const st = this.sim.state;
    const busy = ids.some((id) => {
      const o = st.squads.find((s) => s.id === id)?.order;
      return !!o && (o.status === 'executing' || o.status === 'planning' || o.status === 'queued');
    });
    const target = targetAt(this.sim.world, st, p);
    const go = (opts: RightClickOptions) => () => this.rightClick(p, opts);
    const names = ids
      .map((id) => st.squads.find((s) => s.id === id)?.displayName ?? id)
      .join(' + ');
    const items = [];
    if (target)
      items.push({
        label: target.label,
        hint: target.kind === 'attack' ? 'Concentrar fogo neste alvo' : 'O mais próximo executa',
        run: go({}),
      });
    items.push(
      { label: 'Mover aqui', hint: 'Passo normal', run: go({ moveType: 'move' }) },
      { label: 'Furtivo até aqui', hint: 'Lento e silencioso', run: go({ moveType: 'sneak' }) },
      {
        label: 'Correr até aqui',
        hint: 'Rápido, barulhento, cansa',
        run: go({ moveType: 'sprint' }),
      },
      {
        label: 'Adicionar como próximo ponto',
        hint: 'Mesmo que Shift + clique direito',
        disabled: !busy,
        run: go({ queue: true }),
      },
      {
        label: 'Ir e manter posição',
        hint: 'Move até aqui e segura',
        run: () => {
          this.rightClick(p, { moveType: 'move' });
          for (const id of ids)
            this.issue({ type: 'issueOrder', squadId: id, payload: { type: 'hold', queue: true } });
        },
      },
      {
        label: 'Ir e esconder-se',
        hint: 'Move até aqui e evita contato',
        run: () => {
          this.rightClick(p, { moveType: 'sneak' });
          for (const id of ids)
            this.issue({ type: 'issueOrder', squadId: id, payload: { type: 'hide', queue: true } });
        },
      },
      {
        label: 'Parar (cancela a fila)',
        disabled: !ids.some(
          (id) => (st.squads.find((s) => s.id === id)?.waypoints.length ?? 0) > 0,
        ),
        danger: true,
        run: () => {
          for (const id of ids)
            this.issue({ type: 'issueOrder', squadId: id, payload: { type: 'hold' } });
        },
      },
    );
    this.menu.show(sx, sy, `Ordens — ${names}`, items);
  }

  private orderFromPanel(type: OrderType): void {
    if (type === 'move' || type === 'sneak' || type === 'sprint') return this.setMode(type);
    for (const id of this.orderable())
      this.issue({ type: 'issueOrder', squadId: id, payload: { type } });
  }

  private setMode(mode: MoveMode): void {
    const ids = this.orderable();
    if (!ids.length) return;
    for (const id of ids) this.issue({ type: 'setMoveMode', squadId: id, payload: { mode } });
    this.hud.toast(
      `Modo: ${mode === 'sneak' ? 'furtivo' : mode === 'sprint' ? 'correr' : 'normal'} — clique direito para mover`,
    );
  }

  private cyclePolicy(): void {
    const first = this.sim.state.squads.find((s) => s.id === this.primary);
    if (!first) return;
    // all selected squads move to the primary's next policy, so they end up in agreement
    const next = POLICY_CYCLE[(POLICY_CYCLE.indexOf(first.firePolicy) + 1) % POLICY_CYCLE.length]!;
    for (const id of this.orderable()) {
      const sq = this.sim.state.squads.find((s) => s.id === id);
      if (!sq) continue;
      this.issue({ type: 'setFirePolicy', squadId: sq.id, payload: { policy: next } });
      sq.firePolicy = next; // optimistic UI echo; the sim applies the same value next tick
    }
  }

  private togglePause(): void {
    this.clock.togglePause();
  }

  private toggleSpeed(): void {
    this.clock.speed = this.clock.speed === 1 ? 2 : 1;
    this.issue({ type: 'setSimulationSpeed', payload: { speed: this.clock.speed } });
  }

  private toggleDebug(): void {
    if (this.dbgR) {
      this.dbgR.destroy();
      this.dbgR = null;
    } else this.dbgR = new DebugRenderer(this, this.sim.world);
  }

  private async saveGame(): Promise<void> {
    await SaveStore.save(QUICKSAVE, serializeState(this.sim.state));
    this.hud.toast(`Jogo salvo (tick ${this.sim.tick})`);
  }

  private async loadGame(): Promise<void> {
    const data = await SaveStore.load(QUICKSAVE);
    if (!data) return this.hud.toast('Nenhum salvamento encontrado');
    this.scene.restart({ save: data });
  }

  private showOptions(): void {
    if (this.optionsEl) return;
    const wasPaused = this.clock.paused;
    this.clock.paused = true;
    this.pauseMenu?.style.setProperty('display', 'none');
    this.optionsEl = openOptions(() => {
      this.optionsEl = null;
      if (this.pauseMenu) this.pauseMenu.style.removeProperty('display');
      else this.clock.paused = wasPaused;
    });
  }

  private togglePauseMenu(): void {
    if (this.pauseMenu) {
      this.pauseMenu.remove();
      this.pauseMenu = null;
      this.clock.paused = false;
      return;
    }
    this.clock.paused = true;
    const m = document.createElement('div');
    m.className = 'overlay-menu';
    m.innerHTML = `<div class="card panel"><h3>Pausa</h3>
      <button data-a="resume">Retomar</button><button data-a="save">Salvar</button><button data-a="load">Carregar</button>
      <button data-a="options">Opções</button>
      <button data-a="restart">Reiniciar missão</button><button data-a="menu">Sair para o menu</button></div>`;
    m.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset['a'];
      if (a === 'resume') this.togglePauseMenu();
      if (a === 'save') void this.saveGame();
      if (a === 'load') void this.loadGame();
      if (a === 'options') this.showOptions();
      if (a === 'restart') this.scene.restart({ seed: this.sim.state.seed });
      if (a === 'menu') this.scene.start('Menu');
    });
    uiRoot().appendChild(m);
    this.pauseMenu = m;
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.optionsEl || this.menu.open) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
    if (e.key === 'Escape') return this.togglePauseMenu();
    const action = KeyBindings.actionFor(e.code);
    if (!action) return;
    if (
      action === 'pause' ||
      action === 'speed' ||
      action === 'quicksave' ||
      action === 'quickload'
    )
      e.preventDefault();
    if (action === 'quicksave') return void this.saveGame();
    if (action === 'quickload') return void this.loadGame();
    if (this.pauseMenu) return;
    switch (action) {
      case 'pause':
        return this.togglePause();
      case 'speed':
        return this.toggleSpeed();
      case 'debug':
        return this.toggleDebug();
      case 'mute':
        this.audio.unlock();
        return this.hud.toast(this.audio.toggleMute() ? 'Som desligado' : 'Som ligado');
      case 'squad1':
      case 'squad2':
      case 'squad3':
      case 'squad4': {
        const sq = this.sim.state.squads[Number(action.slice(5)) - 1];
        if (sq) this.select(sq.id, e.shiftKey);
        else this.hud.toast('Esquadrão inexistente nesta missão');
        return;
      }
      case 'firePolicy':
        return this.cyclePolicy();
      default:
        break;
    }
    const mode = MODE_ACTIONS[action];
    if (mode) return this.setMode(mode);
    const order = ORDER_ACTIONS[action];
    if (order) this.orderFromPanel(order);
  }

  private stepOnce(): void {
    for (const s of this.sim.state.survivors) this.prev.set(s.id, { ...s.position });
    for (const z of this.sim.state.zombies) this.prev.set(z.id, { ...z.position });
    if (this.plan) tickPlan(this.sim, this.plan.steps, this.plan.runner);
    const t0 = performance.now();
    const events = this.sim.step();
    this.tickMsAvg = this.tickMsAvg * 0.9 + (performance.now() - t0) * 0.1;
    for (const e of events) {
      const key = e.type === 'ZOMBIE_ALERTED' ? `ZOMBIE_ALERTED:${e.payload['cause']}` : e.type;
      this.eventCounts[key] = (this.eventCounts[key] ?? 0) + 1;
    }
    recordEvents(this.record, events, this.sim.state);
    recordTraces(this.record, this.sim.state);
    const now = this.time.now;
    this.fxR.ingest(events, this.sim.state, now);
    this.entR.ingest(events, now);
    const view = this.cameras.main.worldView;
    const listener = { x: view.centerX / CELL, y: view.centerY / CELL };
    for (const cue of cuesForEvents(events, this.sim.state, this.sim.world)) {
      this.audio.play(cue);
      if (Settings.captions) {
        const text = captionFor(cue, listener);
        if (text) this.hud.caption(text);
      }
    }
    this.minimap.ingest(events, this.sim.state, now);
    this.barkR.push(barksForEvents(events, this.sim.state), now);
    this.hud.ingest(events, this.sim.state, this.sim.world);
    if (this.dbgR && this.sim.tick % 100 === 0)
      console.debug(`[dead-sector] tick ${this.sim.tick} hash ${hashState(this.sim.state)}`);
  }

  override update(time: number, delta: number): void {
    this.camCtl.update(delta);
    if (!this.sim.ended) {
      const n = this.clock.advance(delta);
      for (let i = 0; i < n && !this.sim.ended; i++) this.stepOnce();
    }
    if (this.sim.ended) {
      if (!this.endAt) this.endAt = time;
      else if (time - this.endAt > 1500) {
        this.scene.start('Debrief', { state: this.sim.state, record: this.record });
        return;
      }
    }
    const alpha = this.clock.alpha;
    const lookup = (id: string, cur: Vec2): Vec2 => {
      const p = this.prev.get(id);
      return p ? { x: p.x + (cur.x - p.x) * alpha, y: p.y + (cur.y - p.y) * alpha } : cur;
    };
    this.mapR.update(this.sim.state);
    this.fogR.update(this.sim.state, delta);
    this.entR.draw(this.sim.state, lookup, this.selection, !!this.dbgR, time);
    this.lightR.update(this.sim.state, time, (cb) => this.entR.forEachSurvivorView(cb));
    this.fxR.draw(time);
    this.barkR.draw(this.sim.state, lookup, time);
    const view = this.cameras.main.worldView;
    this.audio.setListener(view.centerX / CELL, view.centerY / CELL);
    this.minimap.draw(
      this.sim.state,
      { x: view.x / CELL, y: view.y / CELL, w: view.width / CELL, h: view.height / CELL },
      this.selection,
      time,
    );
    if (time >= this.nextTensionAt) {
      this.nextTensionAt = time + 400;
      this.audio.setTension(this.sim.ended ? 0 : threatLevel(this.sim.state));
      this.audio.setRadio(this.sim.state.mission.extractionActive && !this.sim.ended);
    }
    this.dbgR?.draw(this.sim.state);
    const st = this.sim.state;
    this.hud.update(
      {
        state: st,
        world: this.sim.world,
        selectedSquadId: this.primary,
        selectedIds: this.selection,
        paused: this.clock.paused,
        speed: this.clock.speed,
        debugText: this.dbgR
          ? `FPS ${this.game.loop.actualFps.toFixed(0)} · tick ${st.tick} · ${this.tickMsAvg.toFixed(2)} ms/tick\nzumbis vivos ${st.zombies.filter((z) => z.alive).length} · reforços ${st.mission.reinforcementsSpawned}/${st.mission.reinforcementBudget}\nseed ${st.seed} · contatos ${st.contacts.length}`
          : null,
      },
      time,
    );
  }

  /** Test/automation hooks (used by Playwright). They only enqueue commands or drive the clock. */
  private exposeTestHooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w['__DEAD_SECTOR__'] = {
      scene: 'Tactical',
      state: () => this.sim.state,
      tick: () => this.sim.tick,
      paused: () => this.clock.paused,
      selected: () => this.primary,
      selection: () => [...this.selection],
      enqueue: (cmd: GameCommandInput) => this.issue(cmd),
      setSpeed: (s: 1 | 2) => (this.clock.speed = s),
      worldToScreen: (x: number, y: number) => {
        const cam = this.cameras.main;
        return {
          x: (x * CELL - cam.worldView.x) * cam.zoom,
          y: (y * CELL - cam.worldView.y) * cam.zoom,
        };
      },
      centerOn: (x: number, y: number) => this.camCtl.centerOn(x, y),
      fastForward: (ticks: number) => {
        for (let i = 0; i < ticks && !this.sim.ended; i++) this.stepOnce();
        return this.sim.tick;
      },
      eventCount: (type: string) => this.eventCounts[type] ?? 0,
      restart: (seed?: number, paused = true) =>
        this.scene.restart({ seed: seed ?? this.sim.state.seed, paused }),
      startPlan: (name: 'stealth' | 'combat') => {
        this.plan = {
          steps: name === 'stealth' ? STEALTH_PLAN : COMBAT_PLAN,
          runner: createPlanRunner(),
        };
      },
    };
  }
}
