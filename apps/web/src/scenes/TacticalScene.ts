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
import { commandForRightClick } from '../input/OrderController';
import { squadAt } from '../input/SelectionController';
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
import { clearUi, uiRoot } from '../ui/dom';
import { Hud, POLICY_CYCLE } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { openOptions } from '../ui/OptionsPanel';
import { SaveStore, Settings } from '../ui/SaveStore';
import { MISSION_ID, QUICKSAVE } from './MenuScene';

const ORDER_KEYS: Record<string, OrderType> = { h: 'hold', t: 'hide', r: 'retreat', g: 'regroup' };
const MODE_KEYS: Record<string, MoveMode> = { q: 'sneak', w: 'move', e: 'sprint' };

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
  private selected: string | null = 'alfa';
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
      selectSquad: (id) => this.select(id),
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

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const world = { x: wp.x / CELL, y: wp.y / CELL };
      if (p.rightButtonDown()) this.rightClick(world);
      else if (p.leftButtonDown()) {
        const sq = squadAt(this.sim.state, world);
        if (sq) this.select(sq);
      }
    });
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => this.teardown());
    this.exposeTestHooks();
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.onKey);
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

  private select(id: string): void {
    const sq = this.sim.state.squads.find((s) => s.id === id);
    if (!sq) {
      this.hud.toast('Esquadrão inexistente nesta missão');
      return;
    }
    this.selected = id;
    this.hud.setContext('');
  }

  private rightClick(p: Vec2): void {
    if (!this.selected) return this.hud.toast('Selecione um esquadrão (1, 2 ou clique)');
    const cmd = commandForRightClick(this.sim.world, this.sim.state, this.selected, p);
    if (cmd) this.issue(cmd);
  }

  private orderFromPanel(type: OrderType): void {
    if (!this.selected) return;
    if (type === 'move' || type === 'sneak' || type === 'sprint') return this.setMode(type);
    this.issue({ type: 'issueOrder', squadId: this.selected, payload: { type } });
  }

  private setMode(mode: MoveMode): void {
    if (!this.selected) return;
    this.issue({ type: 'setMoveMode', squadId: this.selected, payload: { mode } });
    this.hud.toast(
      `Modo: ${mode === 'sneak' ? 'furtivo' : mode === 'sprint' ? 'correr' : 'normal'} — clique direito para mover`,
    );
  }

  private cyclePolicy(): void {
    const sq = this.sim.state.squads.find((s) => s.id === this.selected);
    if (!sq) return;
    const next = POLICY_CYCLE[(POLICY_CYCLE.indexOf(sq.firePolicy) + 1) % POLICY_CYCLE.length]!;
    this.issue({ type: 'setFirePolicy', squadId: sq.id, payload: { policy: next } });
    sq.firePolicy = next; // optimistic UI echo; the sim applies the same value next tick
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
    const k = e.key.toLowerCase();
    if (this.optionsEl) return;
    if (e.key === ' ' || e.key === 'Tab' || e.key === 'F5' || e.key === 'F9') e.preventDefault();
    if (e.key === 'F5') return void this.saveGame();
    if (e.key === 'F9') return void this.loadGame();
    if (e.key === 'Escape') return this.togglePauseMenu();
    if (this.pauseMenu) return;
    if (e.key === ' ') return this.togglePause();
    if (e.key === 'Tab') return this.toggleSpeed();
    if (e.key === '`') return this.toggleDebug();
    if (k === 'm') {
      this.audio.unlock();
      return this.hud.toast(this.audio.toggleMute() ? 'Som desligado (M)' : 'Som ligado (M)');
    }
    if (['1', '2', '3', '4'].includes(e.key)) {
      const sq = this.sim.state.squads[Number(e.key) - 1];
      if (sq) this.select(sq.id);
      else this.hud.toast('Esquadrão inexistente nesta missão');
      return;
    }
    if (!this.selected) return;
    if (MODE_KEYS[k]) return this.setMode(MODE_KEYS[k]);
    if (ORDER_KEYS[k])
      return this.issue({
        type: 'issueOrder',
        squadId: this.selected,
        payload: { type: ORDER_KEYS[k] },
      });
    if (k === 'f') return this.cyclePolicy();
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
    this.entR.draw(this.sim.state, lookup, this.selected, !!this.dbgR, time);
    this.lightR.update(this.sim.state, time, (cb) => this.entR.forEachSurvivorView(cb));
    this.fxR.draw(time);
    this.barkR.draw(this.sim.state, lookup, time);
    const view = this.cameras.main.worldView;
    this.audio.setListener(view.centerX / CELL, view.centerY / CELL);
    this.minimap.draw(
      this.sim.state,
      { x: view.x / CELL, y: view.y / CELL, w: view.width / CELL, h: view.height / CELL },
      this.selected,
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
        selectedSquadId: this.selected,
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
      selected: () => this.selected,
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
