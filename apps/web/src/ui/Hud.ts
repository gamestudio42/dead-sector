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
import { fmtTime, MT, T } from './i18n';
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
const SPAWNER_NAMES: Record<string, string> = {
  'spawn-north': 'norte',
  'spawn-south': 'sul',
  'spawn-west': 'oeste',
  'spawn-east': 'leste',
};

function direction(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  const dirs = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];
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
        <span class="noise" title="Ruído recente: quanto mais alto, mais infectados ouvem e mais reforços chegam">${ICONS.sound}<span class="meter"><i data-el="noise" style="width:0%"></i></span></span>
        <span class="alarm" data-el="alarm" data-testid="alarm" title="Alerta do bairro: tiros, portas, vidro e gritos acumulam; em Alerta vêm mais corredores, em Caçada uma horda é atraída"></span>
        <span class="paused-flag" data-el="pausedFlag" data-testid="paused-flag"></span>
        <span class="tools">
          <button data-act="pause" data-testid="btn-pause" title="Pausar / retomar" data-hint="pause" aria-label="Pausar"><span data-el="pauseLabel">${ICONS.pause}</span></button>
          <button data-act="speed" data-testid="btn-speed" title="Velocidade" data-hint="speed"><span data-el="speed">1×</span></button>
          <button data-act="save" data-testid="btn-save" title="Salvamento rápido" data-hint="quicksave" aria-label="Salvar">${ICONS.save}</button>
          <button data-act="load" data-testid="btn-load" title="Carregar salvamento rápido" data-hint="quickload" aria-label="Carregar">${ICONS.load}</button>
          <button data-act="options" data-testid="btn-options" title="Opções" aria-label="Opções">${ICONS.gear}</button>
          <button data-act="menu" title="Menu de pausa (Esc)" aria-label="Menu">${ICONS.menu}</button>
        </span>
      </div>
      <div class="left">
        <div data-el="squads"></div>
        <div class="objectives panel" data-panel="objectives">
          <h4 class="collapsible" data-toggle="objectives">Objetivos <span class="chev"></span></h4>
          <ul data-el="objectives" data-testid="objectives"></ul>
        </div>
      </div>
      <div class="minimap-slot" data-el="minimapSlot"></div>
      <div class="right">
        <div class="orders panel">
          <h4>Ordens — <span data-el="orderSquad">—</span>
            <span class="help" title="Botão direito no chão: mover no modo atual&#10;Sobre infectado visível: atacar&#10;Sobre porta, armário, civil ou rádio: interagir&#10;No minimapa: mover o esquadrão">?</span></h4>
          <div class="grid">
            <button data-order="move" title="Mover no passo normal" data-hint="modeMove"><span class="kbd" data-kbd="modeMove">${keyName('modeMove')}</span>Mover</button>
            <button data-order="sneak" title="Furtivo: lento e silencioso" data-hint="modeSneak"><span class="kbd" data-kbd="modeSneak">${keyName('modeSneak')}</span>Furtivo</button>
            <button data-order="sprint" title="Correr: rápido, barulhento, cansa" data-hint="modeSprint"><span class="kbd" data-kbd="modeSprint">${keyName('modeSprint')}</span>Correr</button>
            <button data-order="hold" title="Manter posição" data-hint="hold"><span class="kbd" data-kbd="hold">${keyName('hold')}</span>Manter</button>
            <button data-order="hide" title="Esconder-se e evitar contato" data-hint="hide"><span class="kbd" data-kbd="hide">${keyName('hide')}</span>Esconder</button>
            <button data-order="retreat" title="Retirada para o ponto seguro" data-hint="retreat"><span class="kbd" data-kbd="retreat">${keyName('retreat')}</span>Retirada</button>
            <button data-order="regroup" title="Reagrupar no líder" data-hint="regroup"><span class="kbd" data-kbd="regroup">G</span>Reagrupar</button>
            <button data-act="policy" data-testid="btn-policy" title="Disciplina de fogo" data-hint="firePolicy"><span class="kbd" data-kbd="firePolicy">F</span><span data-el="policy"></span></button>
          </div>
          <div class="context" data-el="context" data-testid="context"></div>
        </div>
        <div class="log panel" data-panel="log">
          <h4 class="collapsible" data-toggle="log">Registro <span class="chev"></span></h4>
          <ul data-el="log" data-testid="event-log"></ul>
        </div>
      </div>
      <div class="bottom-wrap" data-panel="units">
        <button class="units-toggle" data-toggle="units" title="Mostrar/ocultar detalhes da equipe"><span class="chev"></span></button>
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
  }

  destroy(): void {
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
      <div class="tip-actions"><button data-tip="ok" data-testid="tip-ok">Entendi</button><button data-tip="off" class="link">Desligar dicas</button></div>`;
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
            `${this.squadName(state, p['squadId'])}: ordem ${T.orders[p['orderType'] as string] ?? p['orderType']}`,
          );
          break;
        case 'ORDER_BLOCKED': {
          const msg = `${this.squadName(state, p['squadId'])}: ${T.blocked[p['reason'] as string] ?? 'ordem bloqueada'}`;
          this.push(state, msg, 'bad');
          this.toast(msg);
          this.context = msg;
          break;
        }
        case 'ORDER_REJECTED':
          this.toast(T.blocked[p['reason'] as string] ?? 'Ordem recusada');
          break;
        case 'ORDER_QUEUED':
          this.push(
            state,
            `${this.squadName(state, p['squadId'])}: ${T.orders[p['orderType'] as string] ?? p['orderType']} na fila (${p['index']})`,
          );
          break;
        case 'ORDER_COMPLETED':
          this.push(state, `${this.squadName(state, p['squadId'])}: ordem concluída`);
          break;
        case 'ENEMY_SPOTTED':
          if (!p['reacquired'])
            this.push(
              state,
              `Contato: ${T.zombie[p['typeId'] as string] ?? 'infectado'} avistado`,
              'warn',
            );
          break;
        case 'ZOMBIE_ALERTED':
          if (visible.has(p['zombieId'] as string))
            this.push(
              state,
              `Infectado alertado (${p['cause'] === 'sound' ? 'ouviu algo' : 'viu a equipe'})`,
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
            d < 6 ? 'muito perto' : `a ${direction(x - near.position.x, y - near.position.y)}`;
          const label =
            cat === 'door'
              ? 'Pancadas em porta'
              : cat === 'shout'
                ? 'Rosnados'
                : (T.noise[cat] ?? 'Ruído');
          this.push(state, `🔊 ${label} ${where}`, cat === 'alarm' ? 'good' : 'warn');
          break;
        }
        case 'OUT_OF_AMMO':
          this.push(state, `${this.name(state, p['survivorId'])} está sem munição`, 'warn');
          break;
        case 'ACTOR_INJURED':
          this.push(
            state,
            p['bitten']
              ? `${this.name(state, p['actorId'])} foi MORDIDO!`
              : `${this.name(state, p['actorId'])} ferido (−${p['damage']})`,
            'bad',
          );
          break;
        case 'ACTOR_KILLED':
          if (p['kind'] === 'survivor')
            this.push(state, `${this.name(state, p['actorId'])} morreu`, 'bad');
          else
            this.push(
              state,
              `${T.zombie[p['typeId'] as string] ?? 'Infectado'} abatido por ${this.name(state, p['killerId'])}`,
              'good',
            );
          break;
        case 'LEADER_CHANGED':
          this.push(
            state,
            p['leaderId']
              ? `${this.squadName(state, p['squadId'])}: liderança passa para ${this.name(state, p['leaderId'])}`
              : `${this.squadName(state, p['squadId'])} está sem líder`,
            'warn',
          );
          break;
        case 'SURVIVOR_PANICKED':
          this.push(
            state,
            `${this.name(state, p['survivorId'])} entrou em pânico (${p['behaviour'] === 'flee' ? 'fugindo' : 'paralisado'})`,
            'bad',
          );
          break;
        case 'SURVIVOR_RALLIED':
          this.push(state, `${this.name(state, p['survivorId'])} se recompôs`, 'good');
          break;
        case 'DOOR_CHANGED':
          if (p['barricadeBroken']) this.push(state, 'Uma barricada cedeu!', 'bad');
          else if (p['removed'])
            this.push(state, `${this.name(state, p['byId'])} removeu uma barricada`);
          else if (p['broken'] && p['window'])
            this.push(state, 'Vidro quebrado: infectados entrando por uma janela', 'bad');
          else if (p['broken']) this.push(state, 'Uma porta cedeu aos infectados!', 'bad');
          else if (p['forced'])
            this.push(state, `${this.name(state, p['byId'])} arrombou a porta`, 'warn');
          break;
        case 'INTERACTION_STARTED': {
          const what: Record<string, string> = {
            cabinet: `recolhendo ${MT.item}`,
            civilian: `resgatando ${MT.person}`,
            beacon: 'ativando o rádio',
            door: 'mexendo na porta',
            barricade: 'pregando tábuas (barulho!)',
          };
          this.push(
            state,
            `${this.name(state, p['survivorId'])}: ${what[p['kind'] as string] ?? 'interagindo'}…`,
          );
          break;
        }
        case 'INTERACTION_INTERRUPTED':
          this.push(state, `${this.name(state, p['survivorId'])}: interação interrompida`, 'warn');
          break;
        case 'OBJECTIVE_COMPLETED':
          this.push(
            state,
            `Objetivo concluído: ${T.objectives[p['objectiveId'] as string]}`,
            'good',
          );
          this.toast('Objetivo concluído');
          break;
        case 'EXTRACTION_STARTED':
          this.push(
            state,
            'Rádio ativado: transporte a caminho. O sinal atrai infectados!',
            'warn',
          );
          break;
        case 'EXTRACTION_READY':
          this.push(state, 'Transporte no local — todos na área de extração!', 'good');
          break;
        case 'REINFORCEMENT_SPAWNED':
          this.push(
            state,
            `🔊 Movimentação de infectados na entrada ${SPAWNER_NAMES[p['spawnerId'] as string] ?? ''}`,
            'warn',
          );
          break;
        case 'ALARM_CHANGED': {
          const level = p['level'] as number;
          const up = level > (p['previous'] as number);
          this.push(
            state,
            `Alerta do bairro: ${T.alarm[level]}`,
            up ? (level >= 2 ? 'bad' : 'warn') : 'good',
          );
          if (up && level >= 2) this.toast(`Alerta: ${T.alarm[level]}`);
          break;
        }
        case 'HORDE_INCOMING': {
          const msg = `🔊 Horda se aproximando pela entrada ${T.spawner[p['spawnerId'] as string] ?? ''} (${p['inSeconds']} s)`;
          this.push(state, msg, 'bad');
          this.toast(msg);
          break;
        }
        case 'HORDE_SPAWNED':
          this.push(
            state,
            `Horda de ${p['size']} infectados entrou pelo ${T.spawner[p['spawnerId'] as string] ?? ''}`,
            'bad',
          );
          break;
        case 'ZOMBIE_SCREAMED':
          this.push(state, '🔊 Um gritador berrou — tudo por perto vem ver', 'bad');
          break;
        case 'SURVIVOR_TURNED': {
          const msg = `${esc(String(p['name']).split(' ')[0] ?? '')} se transformou!`;
          this.push(state, msg, 'bad');
          this.toast(msg);
          break;
        }
        case 'BARRICADE_BUILT':
          this.push(
            state,
            `${this.squadName(state, p['squadId'])}: barricada pronta (${p['kitsLeft']} ${p['kitsLeft'] === 1 ? 'kit restante' : 'kits restantes'})`,
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
    if (panic) tags.push(`<span class="tag bad">⚠ pânico ${panic}</span>`);
    if (wounded) tags.push(`<span class="tag warn">✚ feridos ${wounded}</span>`);
    if (noAmmo) tags.push(`<span class="tag warn">∅ sem munição ${noAmmo}</span>`);
    if (!panic && !wounded)
      tags.push(
        `<span class="tag ok">✓ ${members.some((m) => m.band !== 'calm') ? 'tenso' : 'calmo'}</span>`,
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
      ? ` · <span class="queued" data-testid="queue-${sq.id}">+${sq.waypoints.length} na fila</span>`
      : '';
    const order =
      (sq.order ? `${T.orders[sq.order.type]} · ${T.orderStatus[sq.order.status]}` : 'sem ordem') +
      queued;
    return `<div class="squad-card panel ${selected ? 'selected' : ''}" data-squad="${sq.id}" data-testid="squad-${sq.id}" style="border-left-color:${color}">
      <div class="name"><span class="kbd">${index + 1}</span>${esc(sq.displayName)} <span class="small">${alive.length}/${members.length}</span></div>
      <div class="meta">Líder: ${leader && leader.alive ? esc(leader.name) : '—'}</div>
      <div class="meta">${order}</div>
      <div class="meta">${T.policy[sq.firePolicy]} · ${T.mode[sq.moveMode]} · <span title="Kits de barricada">🪵 ${sq.barricadeKits}</span></div>
      <div>${alive.length ? this.statusTags(state, alive) : '<span class="tag bad">eliminado</span>'}</div>
    </div>`;
  }

  private unitCard(world: World, s: Survivor): string {
    const w = weaponDef(world, s);
    const ammo =
      w.kind === 'melee' ? 'corpo a corpo' : `${s.weapon.magazineRounds}/${s.weapon.reserveRounds}`;
    const reason = s.reason ? (T.reasons[s.reason] ?? s.reason) : '';
    const act = s.alive
      ? `${T.activity[s.activity] ?? s.activity}${reason ? ` — ${reason}` : ''}`
      : 'morto';
    const inf =
      s.infection !== 'healthy'
        ? `<span class="tag bad">${T.infection[s.infection]}</span>`
        : s.bitten
          ? '<span class="tag warn">mordido</span>'
          : '';
    const hp = Math.max(0, Math.round(s.health));
    const lowAmmo =
      w.kind !== 'melee' &&
      s.weapon.magazineRounds + s.weapon.reserveRounds <= s.weapon.magazineCapacity;
    const band = s.panicked ? 'bad' : s.band === 'calm' ? 'ok' : 'warn';
    const tip = `${s.name} — ${s.role}\nArma: ${w.displayName} (${ammo})\nVida ${hp}/${s.maxHealth} · Estresse ${Math.round(s.stress)} (${T.bands[s.band]}) · Fôlego ${Math.round(s.stamina)}\n${act}`;
    return `<div class="unit panel ${s.alive ? '' : 'dead'} ${s.panicked ? 'panicking' : ''}" data-testid="unit-${s.id}" title="${esc(tip)}">
      <div class="head"><span class="n">${s.isLeader ? '★ ' : ''}${esc(s.name)}</span><span class="ammo ${lowAmmo ? 'low' : ''}">${ammo}</span></div>
      <div class="r">${esc(s.role)} · ${esc(w.displayName)} ${inf}</div>
      <div class="bars">
        <span class="lbl" title="Vida">♥</span><div class="bar hp ${hp < s.maxHealth * 0.35 ? 'crit' : ''}"><i style="width:${pct(s.health, s.maxHealth)}%"></i></div><span class="num">${hp}</span>
        <span class="lbl" title="Estresse">⚡</span><div class="bar st"><i style="width:${pct(s.stress)}%"></i></div><span class="num tag-${band}">${T.bands[s.band]}</span>
        <span class="lbl" title="Fôlego">≋</span><div class="bar sta"><i style="width:${pct(s.stamina)}%"></i></div><span class="num">${Math.round(s.stamina)}</span>
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
    (els['pausedFlag'] as HTMLElement).textContent = view.paused ? 'PAUSADO' : '';
    this.setHtml(els['pauseLabel'], view.paused ? ICONS.play : ICONS.pause);
    this.root.querySelectorAll<HTMLElement>('[data-hint]').forEach((el) => {
      el.dataset['base'] ??= el.title;
      const title = `${el.dataset['base']} (${keyName(el.dataset['hint'] as Action)})`;
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
      ctx = `Equipe não obedece totalmente: ${panicked.map((s) => `${esc(s!.name.split(' ')[0] as string)} (${T.reasons[s!.reason ?? ''] ?? T.activity[s!.activity]})`).join(', ')}`;
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
            ? 'Transporte no local — embarcando…'
            : `Transporte no local. Aguardando ${MT.person} na área de extração. <button data-act="confirmExtraction" data-testid="btn-confirm-extraction">Extrair sem ${MT.person} (sucesso parcial)</button>`,
        );
      } else {
        this.setHtml(
          banner,
          `Extração: resistam na área — <b>${Math.floor(m.extractionHoldTicks / 10)}/${Math.round(m.extractionHoldRequiredTicks / 10)} s</b>${civIn ? '' : ` · ${MT.person} fora da área`}`,
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
