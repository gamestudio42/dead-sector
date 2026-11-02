import {
  inRect,
  weaponDef,
  type FirePolicy,
  type GameState,
  type MoveMode,
  type OrderType,
  type SimEvent,
  type Squad,
  type Survivor,
  type World,
} from '@dead-sector/sim';
import { catalog, fmtTime, onLocale, roleLabel, T, text, weaponLabel } from './i18n';
import { KeyBindings, keyLabel, keyName, type Action } from '../input/KeyBindings';
import type { Tip } from '../presentation/tutorial';
import { Settings } from './SaveStore';

export interface HudActions {
  selectSquad(id: string, additive: boolean): void;
  order(type: OrderType): void;
  cyclePolicy(): void;
  setMode(mode: MoveMode): void;
  togglePause(): void;
  toggleSpeed(): void;
  save(): void;
  load(): void;
  confirmExtraction(): void;
  openMenu(): void;
  openOptions(): void;
  toggleMinimap(): void;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">${body}</svg>`;
const ICONS = {
  pause: svg(
    '<rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/>',
  ),
  play: svg('<path d="M4 2.5v11l9-5.5z"/>'),
  save: svg(
    '<path d="M2 2h9l3 3v9H2z" opacity=".9"/><rect x="4.5" y="3" width="5" height="3.5" fill="#1b1e22"/><rect x="4" y="9" width="8" height="4" fill="#1b1e22"/>',
  ),
  load: svg('<path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7l1.8.6A3.6 3.6 0 1 0 8 4.4V6.5L4.6 3.6 8 .7z"/>'),
  gear: svg(
    '<path d="M7 1h2l.4 1.9 1.4.6 1.6-1.1 1.4 1.4-1.1 1.6.6 1.4L15 7v2l-1.9.4-.6 1.4 1.1 1.6-1.4 1.4-1.6-1.1-1.4.6L9 15H7l-.4-1.9-1.4-.6-1.6 1.1-1.4-1.4 1.1-1.6-.6-1.4L1 9V7l1.9-.4.6-1.4-1.1-1.6 1.4-1.4 1.6 1.1 1.4-.6zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>',
  ),
  menu: svg(
    '<rect x="2" y="3" width="12" height="2" rx="1"/><rect x="2" y="7" width="12" height="2" rx="1"/><rect x="2" y="11" width="12" height="2" rx="1"/>',
  ),
  sound: svg(
    '<path d="M2 6h3l4-3v10L5 10H2z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" fill="none" stroke-width="1.4"/>',
  ),
};

const PANEL_FLAGS = {
  objectives: {
    get: () => Settings.objectivesOpen,
    set: (v: boolean) => (Settings.objectivesOpen = v),
  },
  log: { get: () => Settings.logOpen, set: (v: boolean) => (Settings.logOpen = v) },
  units: { get: () => Settings.unitsOpen, set: (v: boolean) => (Settings.unitsOpen = v) },
};

export interface HudView {
  state: GameState;
  world: World;
  selectedSquadId: string | null;
  /** Every selected squad (primary first). */
  selectedIds: string[];
  paused: boolean;
  speed: 1 | 2;
  debugText: string | null;
}

const esc = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
const pct = (v: number, max = 100): number => Math.max(0, Math.min(100, (v / max) * 100));
function direction(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  const dirs = catalog().captions.dirs;
  return dirs[(Math.round(a / 45) + 8) % 8] as string;
}

/** HTML/CSS tactical HUD. Reads state, sends intents through HudActions; never mutates the simulation. */
export class Hud {
  private root: HTMLDivElement;
  private els: Record<string, HTMLElement> = {};
  private logItems: string[] = [];
  private lastCategoryLog: Record<string, number> = {};
  private toastTimer: number | undefined;
  private context = '';
  private lastRender = 0;
  private htmlCache = new Map<HTMLElement, string>();
  private captionSeen = new Map<string, number>();
  private stopLocale: (() => void) | null = null;

  /** Writes markup only when it changed, avoiding DOM churn (and detached-element races). */
  private setHtml(el: HTMLElement | undefined, html: string): void {
    if (!el || this.htmlCache.get(el) === html) return;
    this.htmlCache.set(el, html);
    el.innerHTML = html;
  }

  constructor(
    host: HTMLElement,
    private actions: HudActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="topbar panel" data-testid="topbar">
        <span class="objective" data-el="objective" data-testid="current-objective"></span>
        <span class="clock" data-el="clock" data-testid="clock"></span>
        <span class="noise" data-title="hud.noiseTitle">${ICONS.sound}<span class="meter"><i data-el="noise" style="width:0%"></i></span></span>
        <span class="alarm" data-el="alarm" data-testid="alarm" data-title="hud.alarmTitle"></span>
        <span class="paused-flag" data-el="pausedFlag" data-testid="paused-flag"></span>
        <span class="tools">
          <button data-act="pause" data-testid="btn-pause" data-title="hud.pause" data-hint="pause" data-label="hud.pause"><span data-el="pauseLabel">${ICONS.pause}</span></button>
          <button data-act="speed" data-testid="btn-speed" data-title="hud.speed" data-hint="speed"><span data-el="speed">1×</span></button>
          <button data-act="save" data-testid="btn-save" data-title="hud.save" data-hint="quicksave" data-label="hud.save">${ICONS.save}</button>
          <button data-act="load" data-testid="btn-load" data-title="hud.load" data-hint="quickload" data-label="hud.load">${ICONS.load}</button>
          <button data-act="options" data-testid="btn-options" data-title="hud.options" data-label="hud.options">${ICONS.gear}</button>
          <button data-act="menu" data-title="hud.menu" data-label="hud.menu">${ICONS.menu}</button>
        </span>
      </div>
      <div class="left">
        <div data-el="squads"></div>
        <div class="objectives panel" data-panel="objectives">
          <h4 class="collapsible" data-toggle="objectives"><span data-copy="hud.objectives"></span> <span class="chev"></span></h4>
          <ul data-el="objectives" data-testid="objectives"></ul>
        </div>
      </div>
      <div class="minimap-slot" data-el="minimapSlot"></div>
      <div class="right">
        <div class="orders panel">
          <h4><span data-copy="hud.orders"></span> — <span data-el="orderSquad">—</span>
            <span class="help" data-title="hud.ordersHelp">?</span></h4>
          <div class="grid">
            <button data-order="move" data-title="hud.moveTitle" data-hint="modeMove"><span class="kbd" data-kbd="modeMove">${keyName('modeMove')}</span><span data-copy="hud.move"></span></button>
            <button data-order="sneak" data-title="hud.sneakTitle" data-hint="modeSneak"><span class="kbd" data-kbd="modeSneak">${keyName('modeSneak')}</span><span data-copy="hud.sneak"></span></button>
            <button data-order="sprint" data-title="hud.sprintTitle" data-hint="modeSprint"><span class="kbd" data-kbd="modeSprint">${keyName('modeSprint')}</span><span data-copy="hud.sprint"></span></button>
            <button data-order="hold" data-title="hud.holdTitle" data-hint="hold"><span class="kbd" data-kbd="hold">${keyName('hold')}</span><span data-copy="hud.hold"></span></button>
            <button data-order="hide" data-title="hud.hideTitle" data-hint="hide"><span class="kbd" data-kbd="hide">${keyName('hide')}</span><span data-copy="hud.hide"></span></button>
            <button data-order="retreat" data-title="hud.retreatTitle" data-hint="retreat"><span class="kbd" data-kbd="retreat">${keyName('retreat')}</span><span data-copy="hud.retreat"></span></button>
            <button data-order="regroup" data-title="hud.regroupTitle" data-hint="regroup"><span class="kbd" data-kbd="regroup">G</span><span data-copy="hud.regroup"></span></button>
            <button data-act="policy" data-testid="btn-policy" data-title="hud.policyTitle" data-hint="firePolicy"><span class="kbd" data-kbd="firePolicy">F</span><span data-el="policy"></span></button>
          </div>
          <div class="context" data-el="context" data-testid="context"></div>
        </div>
        <div class="log panel" data-panel="log">
          <h4 class="collapsible" data-toggle="log"><span data-copy="hud.log"></span> <span class="chev"></span></h4>
          <ul data-el="log" data-testid="event-log"></ul>
        </div>
      </div>
      <div class="bottom-wrap" data-panel="units">
        <button class="units-toggle" data-toggle="units" data-title="hud.unitsTitle"><span class="chev"></span></button>
        <div class="captions" data-el="captions" aria-live="polite"></div>
        <div class="bottom" data-el="units" data-testid="units"></div>
      </div>
      <div class="banner panel" data-el="banner" style="display:none"></div>
      <div class="toast" data-el="toast" style="opacity:0"></div>
      <div class="tip-card panel" data-el="tip" data-testid="tip" hidden></div>
      <div class="debug panel" data-el="debug" style="display:none"></div>`;
    host.appendChild(this.root);
    this.root
      .querySelectorAll<HTMLElement>('[data-el]')
      .forEach((el) => (this.els[el.dataset['el'] as string] = el));
    for (const key of ['objectives', 'log', 'units'] as const)
      this.root
        .querySelector(`[data-panel=${key}]`)
        ?.classList.toggle('collapsed', !PANEL_FLAGS[key].get());
    this.root.addEventListener('click', (ev) => {
      const tipBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (tipBtn) {
        if (tipBtn.dataset['tip'] === 'off') {
          Settings.tips = false;
          this.tipQueue = [];
        } else this.tipQueue.shift();
        return this.renderTip();
      }
      const toggle = (ev.target as HTMLElement).closest<HTMLElement>('[data-toggle]');
      if (toggle) return this.togglePanel(toggle.dataset['toggle'] as string);
      const t = (ev.target as HTMLElement).closest<HTMLElement>(
        '[data-act],[data-order],[data-squad]',
      );
      if (!t) return;
      if (t.dataset['order']) this.actions.order(t.dataset['order'] as OrderType);
      if (t.dataset['squad']) this.actions.selectSquad(t.dataset['squad'], ev.shiftKey);
      switch (t.dataset['act']) {
        case 'pause':
          return this.actions.togglePause();
        case 'speed':
          return this.actions.toggleSpeed();
        case 'save':
          return this.actions.save();
        case 'load':
          return this.actions.load();
        case 'menu':
          return this.actions.openMenu();
        case 'options':
          return this.actions.openOptions();
        case 'policy':
          return this.actions.cyclePolicy();
        case 'confirmExtraction':
          return this.actions.confirmExtraction();
      }
    });
    this.applyCopy();
    this.stopLocale = onLocale(() => this.applyCopy());
  }

  /** Writes the chrome labels in the language the player is reading. */
  private applyCopy(): void {
    this.root.querySelectorAll<HTMLElement>('[data-copy]').forEach((el) => {
      const value = text(el.dataset['copy'] ?? '');
      if (el.textContent !== value) el.textContent = value;
    });
    this.root.querySelectorAll<HTMLElement>('[data-title]').forEach((el) => {
      const value = text(el.dataset['title'] ?? '');
      if (!el.dataset['hint']) el.title = value;
    });
    this.root.querySelectorAll<HTMLElement>('[data-label]').forEach((el) => {
      el.setAttribute('aria-label', text(el.dataset['label'] ?? ''));
    });
  }

  destroy(): void {
    this.stopLocale?.();
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }

  private tipQueue: Tip[] = [];

  /** Queues a contextual hint; one card at a time, each marked seen when it appears. */
  queueTip(t: Tip | null): void {
    if (!t || !Settings.tips || this.tipQueue.some((q) => q.id === t.id)) return;
    this.tipQueue.push(t);
    if (this.tipQueue.length === 1) this.renderTip();
  }

  private renderTip(): void {
    const el = this.els['tip'] as HTMLElement;
    const t = this.tipQueue[0];
    if (!t || !Settings.tips) {
      el.hidden = true;
      return;
    }
    Settings.markTipSeen(t.id);
    el.hidden = false;
    el.innerHTML = `<div class="tip-title">💡 ${esc(t.title)}</div><p>${esc(t.text)}</p>
      <div class="tip-actions"><button data-tip="ok" data-testid="tip-ok">${text('hud.tipOk')}</button><button data-tip="off" class="link">${text('hud.tipOff')}</button></div>`;
  }

  /** Collapses/expands a HUD panel and remembers the choice. */
  togglePanel(key: string): void {
    if (key === 'minimap') return this.actions.toggleMinimap();
    const flag = PANEL_FLAGS[key as keyof typeof PANEL_FLAGS];
    if (!flag) return;
    flag.set(!flag.get());
    this.root.querySelector(`[data-panel=${key}]`)?.classList.toggle('collapsed', !flag.get());
  }

  mountMinimap(el: HTMLElement): void {
    this.els['minimapSlot']?.appendChild(el);
  }

  /** Subtitle line for an important sound (accessibility); short-lived, newest at the bottom. */
  caption(text: string): void {
    const host = this.els['captions'] as HTMLElement;
    const now = performance.now();
    if ((this.captionSeen.get(text) ?? -1e9) > now - 1800) return;
    this.captionSeen.set(text, now);
    const line = document.createElement('div');
    line.textContent = text;
    host.appendChild(line);
    while (host.childElementCount > 3) host.firstElementChild?.remove();
    window.setTimeout(() => line.remove(), 3200);
  }

  toast(msg: string): void {
    const el = this.els['toast'] as HTMLElement;
    el.textContent = msg;
    el.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (el.style.opacity = '0'), 2600);
  }

  setContext(msg: string): void {
    this.context = msg;
  }

  private push(state: GameState, text: string, cls = ''): void {
    this.logItems.unshift(
      `<li class="${cls}"><span class="t">${fmtTime(state.tick / 10)}</span>${text}</li>`,
    );
    if (this.logItems.length > 60) this.logItems.length = 60;
  }

  private name(state: GameState, id: unknown): string {
    const s = state.survivors.find((x) => x.id === id);
    return esc(s ? (s.name.split(' ')[0] as string) : String(id));
  }

  private squadName(state: GameState, id: unknown): string {
    return esc(state.squads.find((s) => s.id === id)?.displayName ?? String(id));
  }

  /** Converts simulation events into PT-BR log lines (only information the squads could know). */
  ingest(events: SimEvent[], state: GameState, world: World): void {
    const visible = new Set(state.contacts.filter((c) => c.visible).map((c) => c.zombieId));
    for (const e of events) {
      const p = e.payload;
      switch (e.type) {
        case 'ORDER_ISSUED':
          this.push(
            state,
            text('log.orderIssued', {
              squad: this.squadName(state, p['squadId']),
              order: T.orders[p['orderType'] as string] ?? String(p['orderType']),
            }),
          );
          break;
        case 'ORDER_BLOCKED': {
          const msg = text('log.orderBlocked', {
            squad: this.squadName(state, p['squadId']),
            reason: T.blocked[p['reason'] as string] ?? text('log.orderBlockedFallback'),
          });
          this.push(state, msg, 'bad');
          this.toast(msg);
          this.context = msg;
          break;
        }
        case 'ORDER_REJECTED':
          this.toast(T.blocked[p['reason'] as string] ?? text('log.orderRejected'));
          break;
        case 'ORDER_QUEUED':
          this.push(
            state,
            text('log.orderQueued', {
              squad: this.squadName(state, p['squadId']),
              order: T.orders[p['orderType'] as string] ?? String(p['orderType']),
              index: String(p['index']),
            }),
          );
          break;
        case 'ORDER_COMPLETED':
          this.push(state, text('log.orderDone', { squad: this.squadName(state, p['squadId']) }));
          break;
        case 'ENEMY_SPOTTED':
          if (!p['reacquired'])
            this.push(
              state,
              text('log.contact', {
                zombie: T.zombie[p['typeId'] as string] ?? text('log.infectedFallback'),
              }),
              'warn',
            );
          break;
        case 'ZOMBIE_ALERTED':
          if (visible.has(p['zombieId'] as string))
            this.push(
              state,
              text('log.alerted', {
                cause: p['cause'] === 'sound' ? text('log.heard') : text('log.saw'),
              }),
              'warn',
            );
          break;
        case 'NOISE_EMITTED': {
          const cat = p['category'] as string;
          const ours =
            state.squads.some((s) => s.id === p['sourceEntityId']) ||
            state.survivors.some((s) => s.id === p['sourceEntityId']);
          if (ours || cat === 'footstep') break;
          const x = p['x'] as number;
          const y = p['y'] as number;
          const listeners = state.survivors.filter(
            (s) => s.alive && s.squadId !== null && !s.extracted,
          );
          if (listeners.length === 0) break;
          const near = listeners.reduce((a, b) =>
            Math.hypot(a.position.x - x, a.position.y - y) <
            Math.hypot(b.position.x - x, b.position.y - y)
              ? a
              : b,
          );
          const d = Math.hypot(near.position.x - x, near.position.y - y);
          if ((p['intensity'] as number) - d * world.rules.noise.attenuationPerMeter < 8) break;
          if ((this.lastCategoryLog[cat] ?? -999) > state.tick - 40) break;
          this.lastCategoryLog[cat] = state.tick;
          const where =
            d < 6
              ? text('log.veryNear')
              : text('log.toDir', { dir: direction(x - near.position.x, y - near.position.y) });
          const label =
            cat === 'door'
              ? text('log.doorHits')
              : cat === 'shout'
                ? text('log.groans')
                : (T.noise[cat] ?? text('log.noiseFallback'));
          this.push(state, `🔊 ${label} ${where}`, cat === 'alarm' ? 'good' : 'warn');
          break;
        }
        case 'OUT_OF_AMMO':
          this.push(state, text('log.noAmmo', { name: this.name(state, p['survivorId']) }), 'warn');
          break;
        case 'ACTOR_INJURED':
          this.push(
            state,
            p['bitten']
              ? text('log.bitten', { name: this.name(state, p['actorId']) })
              : text('log.hurt', {
                  name: this.name(state, p['actorId']),
                  damage: String(p['damage']),
                }),
            'bad',
          );
          break;
        case 'ACTOR_KILLED':
          if (p['kind'] === 'survivor')
            this.push(state, text('log.died', { name: this.name(state, p['actorId']) }), 'bad');
          else
            this.push(
              state,
              text('log.killed', {
                zombie: T.zombie[p['typeId'] as string] ?? text('log.zombieFallback'),
                name: this.name(state, p['killerId']),
              }),
              'good',
            );
          break;
        case 'LEADER_CHANGED':
          this.push(
            state,
            p['leaderId']
              ? text('log.leader', {
                  squad: this.squadName(state, p['squadId']),
                  name: this.name(state, p['leaderId']),
                })
              : text('log.noLeader', { squad: this.squadName(state, p['squadId']) }),
            'warn',
          );
          break;
        case 'SURVIVOR_PANICKED':
          this.push(
            state,
            text('log.panic', {
              name: this.name(state, p['survivorId']),
              behaviour: p['behaviour'] === 'flee' ? text('log.fleeing') : text('log.frozen'),
            }),
            'bad',
          );
          break;
        case 'SURVIVOR_RALLIED':
          this.push(
            state,
            text('log.rallied', { name: this.name(state, p['survivorId']) }),
            'good',
          );
          break;
        case 'DOOR_CHANGED':
          if (p['barricadeBroken']) this.push(state, text('log.barricadeBroke'), 'bad');
          else if (p['removed'])
            this.push(state, text('log.barricadeRemoved', { name: this.name(state, p['byId']) }));
          else if (p['broken'] && p['window']) this.push(state, text('log.windowBreak'), 'bad');
          else if (p['broken']) this.push(state, text('log.doorBroke'), 'bad');
          else if (p['forced'])
            this.push(state, text('log.doorForced', { name: this.name(state, p['byId']) }), 'warn');
          break;
        case 'INTERACTION_STARTED': {
          const what: Record<string, string> = {
            cabinet: text('log.interactCabinet'),
            civilian: text('log.interactCivilian'),
            beacon: text('log.interactBeacon'),
            door: text('log.interactDoor'),
            barricade: text('log.interactBarricade'),
          };
          this.push(
            state,
            `${this.name(state, p['survivorId'])}: ${what[p['kind'] as string] ?? text('log.interacting')}…`,
          );
          break;
        }
        case 'INTERACTION_INTERRUPTED':
          this.push(
            state,
            text('log.interactStopped', { name: this.name(state, p['survivorId']) }),
            'warn',
          );
          break;
        case 'OBJECTIVE_COMPLETED':
          this.push(
            state,
            text('log.objectiveDone', {
              objective: T.objectives[p['objectiveId'] as string] ?? '',
            }),
            'good',
          );
          this.toast(text('log.objectiveToast'));
          break;
        case 'EXTRACTION_STARTED':
          this.push(state, text('log.radioOn'), 'warn');
          break;
        case 'EXTRACTION_READY':
          this.push(state, text('log.transportHere'), 'good');
          break;
        case 'REINFORCEMENT_SPAWNED':
          this.push(
            state,
            text('log.spawnMove', { dir: T.spawner[p['spawnerId'] as string] ?? '' }),
            'warn',
          );
          break;
        case 'ALARM_CHANGED': {
          const level = p['level'] as number;
          const up = level > (p['previous'] as number);
          this.push(
            state,
            text('log.alarm', { level: T.alarm[level] ?? '' }),
            up ? (level >= 2 ? 'bad' : 'warn') : 'good',
          );
          if (up && level >= 2) this.toast(text('log.alarmToast', { level: T.alarm[level] ?? '' }));
          break;
        }
        case 'HORDE_INCOMING': {
          const msg = text('log.hordeIncoming', {
            dir: T.spawner[p['spawnerId'] as string] ?? '',
            seconds: String(p['inSeconds']),
          });
          this.push(state, msg, 'bad');
          this.toast(msg);
          break;
        }
        case 'HORDE_SPAWNED':
          this.push(
            state,
            text('log.hordeSpawned', {
              size: String(p['size']),
              dir: T.spawner[p['spawnerId'] as string] ?? '',
            }),
            'bad',
          );
          break;
        case 'ZOMBIE_SCREAMED':
          this.push(state, text('log.screamer'), 'bad');
          break;
        case 'SURVIVOR_TURNED': {
          const msg = text('log.turned', { name: esc(String(p['name']).split(' ')[0] ?? '') });
          this.push(state, msg, 'bad');
          this.toast(msg);
          break;
        }
        case 'BARRICADE_BUILT':
          this.push(
            state,
            text('log.barricadeReady', {
              squad: this.squadName(state, p['squadId']),
              kits: String(p['kitsLeft']),
              kitsWord: p['kitsLeft'] === 1 ? text('log.kitLeft') : text('log.kitsLeft'),
            }),
            'good',
          );
          break;
        case 'MISSION_ENDED':
          this.push(
            state,
            `${T.outcome[p['status'] as string]}`,
            p['status'] === 'success' ? 'good' : 'bad',
          );
          break;
      }
    }
  }

  private statusTags(state: GameState, members: Survivor[]): string {
    const tags: string[] = [];
    const panic = members.filter((m) => m.panicked).length;
    const wounded = members.filter((m) => m.health < m.maxHealth * 0.6).length;
    const noAmmo = members.filter(
      (m) =>
        m.weapon.magazineCapacity > 0 &&
        m.weapon.magazineRounds === 0 &&
        m.weapon.reserveRounds === 0,
    ).length;
    if (panic) tags.push(`<span class="tag bad">${text('hud.panicTag', { n: panic })}</span>`);
    if (wounded)
      tags.push(`<span class="tag warn">${text('hud.woundedTag', { n: wounded })}</span>`);
    if (noAmmo) tags.push(`<span class="tag warn">${text('hud.noAmmoTag', { n: noAmmo })}</span>`);
    if (!panic && !wounded)
      tags.push(
        `<span class="tag ok">✓ ${members.some((m) => m.band !== 'calm') ? text('hud.tense') : text('hud.calm')}</span>`,
      );
    void state;
    return tags.join('');
  }

  private squadCard(state: GameState, sq: Squad, index: number, selected: boolean): string {
    const members = sq.memberIds
      .map((id) => state.survivors.find((s) => s.id === id))
      .filter((s): s is Survivor => !!s);
    const alive = members.filter((m) => m.alive);
    const leader = members.find((m) => m.id === sq.leaderId);
    const color = sq.id === 'alfa' ? 'var(--alfa)' : 'var(--bravo)';
    const queued = sq.waypoints.length
      ? ` · <span class="queued" data-testid="queue-${sq.id}">${text('hud.queued', { n: sq.waypoints.length })}</span>`
      : '';
    const order =
      (sq.order
        ? `${T.orders[sq.order.type]} · ${T.orderStatus[sq.order.status]}`
        : text('hud.noOrder')) + queued;
    return `<div class="squad-card panel ${selected ? 'selected' : ''}" data-squad="${sq.id}" data-testid="squad-${sq.id}" style="border-left-color:${color}">
      <div class="name"><span class="kbd">${index + 1}</span>${esc(sq.displayName)} <span class="small">${alive.length}/${members.length}</span></div>
      <div class="meta">${text('hud.leader', { name: leader && leader.alive ? esc(leader.name) : '—' })}</div>
      <div class="meta">${order}</div>
      <div class="meta">${T.policy[sq.firePolicy]} · ${T.mode[sq.moveMode]} · <span title="${text('hud.kitsTitle')}">🪵 ${sq.barricadeKits}</span></div>
      <div>${alive.length ? this.statusTags(state, alive) : `<span class="tag bad">${text('hud.eliminated')}</span>`}</div>
    </div>`;
  }

  private unitCard(world: World, s: Survivor): string {
    const w = weaponDef(world, s);
    const ammo =
      w.kind === 'melee'
        ? text('hud.melee')
        : `${s.weapon.magazineRounds}/${s.weapon.reserveRounds}`;
    const reason = s.reason ? (T.reasons[s.reason] ?? s.reason) : '';
    const act = s.alive
      ? `${T.activity[s.activity] ?? s.activity}${reason ? ` — ${reason}` : ''}`
      : text('hud.dead');
    const inf =
      s.infection !== 'healthy'
        ? `<span class="tag bad">${T.infection[s.infection]}</span>`
        : s.bitten
          ? `<span class="tag warn">${text('hud.bitten')}</span>`
          : '';
    const hp = Math.max(0, Math.round(s.health));
    const lowAmmo =
      w.kind !== 'melee' &&
      s.weapon.magazineRounds + s.weapon.reserveRounds <= s.weapon.magazineCapacity;
    const band = s.panicked ? 'bad' : s.band === 'calm' ? 'ok' : 'warn';
    const role = roleLabel(s.templateId, s.role, s.isObjectiveCivilian);
    const weapon = weaponLabel(s.weapon.weaponId, w.displayName);
    const tip = `${s.name} — ${role}\n${text('hud.weapon')}: ${weapon} (${ammo})\n${text('hud.health')} ${hp}/${s.maxHealth} · ${text('hud.stress')} ${Math.round(s.stress)} (${T.bands[s.band]}) · ${text('hud.stamina')} ${Math.round(s.stamina)}\n${act}`;
    return `<div class="unit panel ${s.alive ? '' : 'dead'} ${s.panicked ? 'panicking' : ''}" data-testid="unit-${s.id}" title="${esc(tip)}">
      <div class="head"><span class="n">${s.isLeader ? '★ ' : ''}${esc(s.name)}</span><span class="ammo ${lowAmmo ? 'low' : ''}">${ammo}</span></div>
      <div class="r">${esc(role)} · ${esc(weapon)} ${inf}</div>
      <div class="bars">
        <span class="lbl" title="${text('hud.life')}">♥</span><div class="bar hp ${hp < s.maxHealth * 0.35 ? 'crit' : ''}"><i style="width:${pct(s.health, s.maxHealth)}%"></i></div><span class="num">${hp}</span>
        <span class="lbl" title="${text('hud.stress')}">⚡</span><div class="bar st"><i style="width:${pct(s.stress)}%"></i></div><span class="num tag-${band}">${T.bands[s.band]}</span>
        <span class="lbl" title="${text('hud.stamina')}">≋</span><div class="bar sta"><i style="width:${pct(s.stamina)}%"></i></div><span class="num">${Math.round(s.stamina)}</span>
      </div>
      <div class="act">${act}</div>
    </div>`;
  }

  update(view: HudView, now: number): void {
    if (now - this.lastRender < 100) return;
    this.lastRender = now;
    const { state, world } = view;
    const els = this.els;
    const current = state.objectives.find((o) => o.status === 'pending');
    (els['objective'] as HTMLElement).textContent = current
      ? `▶ ${T.objectives[current.id]}`
      : (T.outcome[state.mission.status] ?? '');
    (els['clock'] as HTMLElement).textContent =
      `${fmtTime(state.tick / 10)} / ${fmtTime(state.mission.timeLimitTicks / 10)}`;
    const level = state.mission.alarmLevel;
    this.setHtml(els['alarm'], `<span class="alarm-pip lv${level}"></span>${T.alarm[level]}`);
    const recent = state.recentNoises.reduce((a, n) => a + n.intensity, 0);
    (els['noise'] as HTMLElement).style.width = `${pct(recent, 400)}%`;
    (els['pausedFlag'] as HTMLElement).textContent = view.paused ? text('hud.paused') : '';
    this.setHtml(els['pauseLabel'], view.paused ? ICONS.play : ICONS.pause);
    this.root.querySelectorAll<HTMLElement>('[data-hint]').forEach((el) => {
      const base = el.dataset['title'] ? text(el.dataset['title']) : el.title;
      const title = `${base} (${keyName(el.dataset['hint'] as Action)})`;
      if (el.title !== title) el.title = title;
    });
    this.root
      .querySelectorAll<HTMLElement>('[data-kbd]')
      .forEach((el) => this.setHtml(el, keyLabel(KeyBindings.get(el.dataset['kbd'] as Action))));
    (els['speed'] as HTMLElement).textContent = `${view.speed}×`;
    this.setHtml(
      els['squads'],
      state.squads
        .map((sq, i) => this.squadCard(state, sq, i, view.selectedIds.includes(sq.id)))
        .join(''),
    );
    const sel = state.squads.find((s) => s.id === view.selectedSquadId);
    (els['orderSquad'] as HTMLElement).textContent =
      view.selectedIds
        .map((id) => state.squads.find((s) => s.id === id)?.displayName)
        .filter(Boolean)
        .join(' + ') || '—';
    (els['policy'] as HTMLElement).textContent = sel ? (T.policy[sel.firePolicy] ?? '') : '';
    this.root.querySelectorAll<HTMLButtonElement>('[data-order]').forEach((b) => {
      b.classList.toggle(
        'active',
        !!sel && sel.order?.type === b.dataset['order'] && sel.order?.status === 'executing',
      );
      b.disabled = !sel;
    });
    this.setHtml(
      els['objectives'],
      state.objectives
        .map((o) => {
          const cls =
            o.status === 'completed'
              ? 'obj-done'
              : o.status === 'failed'
                ? 'obj-failed'
                : o === current
                  ? 'obj-current'
                  : '';
          const mark = o.status === 'completed' ? '✓' : o.status === 'failed' ? '✗' : '○';
          return `<li class="${cls}">${mark} ${T.objectives[o.id]}</li>`;
        })
        .join(''),
    );
    this.setHtml(
      els['units'],
      sel
        ? sel.memberIds
            .map((id) => state.survivors.find((s) => s.id === id))
            .filter((s): s is Survivor => !!s)
            .map((s) => this.unitCard(world, s))
            .join('')
        : '',
    );
    this.setHtml(els['log'], this.logItems.join(''));
    // explain autonomous behaviour of the selected squad
    let ctx = this.context;
    const panicked = sel?.memberIds
      .map((id) => state.survivors.find((s) => s.id === id))
      .filter((s) => s && s.alive && (s.panicked || s.activity === 'refusing'));
    if (panicked && panicked.length)
      ctx = text('hud.disobey', {
        who: panicked
          .map(
            (s) =>
              `${esc(s!.name.split(' ')[0] as string)} (${T.reasons[s!.reason ?? ''] ?? T.activity[s!.activity]})`,
          )
          .join(', '),
      });
    else if (sel?.order?.status === 'executing') ctx = '';
    this.setHtml(els['context'], ctx);

    const m = state.mission;
    const banner = els['banner'] as HTMLElement;
    const civ = state.survivors.find((s) => s.isObjectiveCivilian);
    if (m.extractionActive && m.status === 'running') {
      banner.style.display = 'block';
      const civIn =
        !!civ &&
        civ.alive &&
        civ.rescued &&
        inRect(civ.position, world.mission.objectives.extraction.zone);
      if (m.extractionReady) {
        this.setHtml(
          banner,
          civIn
            ? text('hud.boarding')
            : `${text('hud.waitingCivilian')} <button data-act="confirmExtraction" data-testid="btn-confirm-extraction">${text('hud.extractWithout')}</button>`,
        );
      } else {
        this.setHtml(
          banner,
          `${text('hud.holdBanner', { held: Math.floor(m.extractionHoldTicks / 10), need: Math.round(m.extractionHoldRequiredTicks / 10) })}${civIn ? '' : ` · ${text('hud.civilianOut')}`}`,
        );
      }
    } else banner.style.display = 'none';

    const dbg = els['debug'] as HTMLElement;
    if (view.debugText) {
      dbg.style.display = 'block';
      dbg.textContent = view.debugText;
    } else dbg.style.display = 'none';
  }
}

export const POLICY_CYCLE: FirePolicy[] = ['returnFire', 'weaponsFree', 'holdFire'];
