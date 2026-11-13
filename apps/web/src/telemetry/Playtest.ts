import type { GameState, SimEvent } from '@dead-sector/sim';
import { getLocale } from '../ui/i18n';
import {
  appendCapped,
  buildExport,
  emptyCounters,
  entriesForEvents,
  SAMPLE_TICKS,
  snapshot,
  type InputCounters,
  type PlaytestEntry,
} from './entries';

const LOG_KEY = 'dead-sector:playtestLog';
const FLAG_KEY = 'dead-sector:playtest';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: the log is a convenience, the game goes on */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.floor(Math.random() * 0xffffffff).toString(16);
  }
}

let entries: PlaytestEntry[] | null = null;
let sessionStarted = false;
const session = newId();

function load(): PlaytestEntry[] {
  if (entries) return entries;
  try {
    const parsed = JSON.parse(read(LOG_KEY) ?? '[]') as unknown;
    entries = Array.isArray(parsed) ? (parsed as PlaytestEntry[]) : [];
  } catch {
    entries = [];
  }
  return entries;
}

function persist(): void {
  write(LOG_KEY, JSON.stringify(load()));
}

/** Local playtest log (opt-in). See `entries.ts` for what is recorded and why. */
export const Playtest = {
  get enabled(): boolean {
    return read(FLAG_KEY) === '1';
  },
  set enabled(v: boolean) {
    write(FLAG_KEY, v ? '1' : '0');
    if (v) Playtest.startSession();
  },
  get count(): number {
    return load().length;
  },

  /** `?playtest=1` in the link turns the log on (and `?playtest=0` off) for this profile. */
  applyQuery(search = location.search): void {
    const v = new URLSearchParams(search).get('playtest');
    if (v === '1') Playtest.enabled = true;
    if (v === '0') Playtest.enabled = false;
  },

  /** One entry per page load with the conditions the tester played under. */
  startSession(): void {
    if (sessionStarted || !Playtest.enabled) return;
    sessionStarted = true;
    Playtest.log('session', {
      build: __BUILD_ID__,
      locale: getLocale(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      touch: navigator.maxTouchPoints > 0,
    });
  },

  log(kind: string, fields: Record<string, unknown> = {}): void {
    if (!Playtest.enabled) return;
    appendCapped(load(), { t: Date.now(), session, kind, ...fields });
    persist();
  },

  clear(): void {
    entries = [];
    persist();
  },

  /** Saves the log as a JSON file the tester sends to the team. */
  download(tester: string): void {
    const data = buildExport(load(), __BUILD_ID__, tester, new Date());
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const label = data.tester.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'tester';
    a.href = url;
    a.download = `dead-sector-playtest-${label}-${data.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/**
 * One mission as the tester played it: what happened (from sim events), what they did with the
 * interface, and how it ended — finished, restarted, abandoned to the menu, or the tab closed.
 */
export class MissionPlaytest {
  private counters: InputCounters = emptyCounters();
  private pausedSince: number | null = null;
  private nextSample = SAMPLE_TICKS;
  private done = false;
  private readonly startedAt = Date.now();
  private readonly onHide = () => this.abandon('closed');

  constructor(
    private readonly state: () => GameState,
    info: { missionId: string; seed: number; campaign: boolean; fromSave: boolean },
  ) {
    if (!Playtest.enabled) {
      this.done = true;
      return;
    }
    Playtest.startSession();
    const st = state();
    this.nextSample = st.tick + SAMPLE_TICKS;
    Playtest.log('missionStart', { ...info, tick: st.tick, ...snapshot(st) });
    window.addEventListener('pagehide', this.onHide);
  }

  get active(): boolean {
    return !this.done;
  }

  ingest(events: readonly SimEvent[], state: GameState, fps: number): void {
    if (this.done) return;
    for (const entry of entriesForEvents(events, state)) {
      if (entry['kind'] === 'missionEnd') {
        this.finish(entry);
        return;
      }
      Playtest.log(String(entry['kind']), entry);
    }
    if (state.tick >= this.nextSample) {
      this.nextSample = state.tick + SAMPLE_TICKS;
      Playtest.log('sample', { tick: state.tick, fps: Math.round(fps), ...snapshot(state) });
    }
  }

  setPaused(paused: boolean): void {
    if (this.done) return;
    const now = performance.now();
    if (paused && this.pausedSince === null) {
      this.pausedSince = now;
      this.counters.pauses++;
    } else if (!paused && this.pausedSince !== null) {
      this.counters.pausedMs += now - this.pausedSince;
      this.pausedSince = null;
    }
  }

  count(what: Exclude<keyof InputCounters, 'orders' | 'modes' | 'tips' | 'pausedMs'>): void {
    if (!this.done) this.counters[what]++;
  }

  order(type: string): void {
    if (!this.done) this.counters.orders[type] = (this.counters.orders[type] ?? 0) + 1;
  }

  mode(mode: string): void {
    if (!this.done) this.counters.modes[mode] = (this.counters.modes[mode] ?? 0) + 1;
  }

  /** A tip offered to the player; the HUD offers it again until it is dismissed, so count it once. */
  tip(id: string): void {
    if (!this.done && !this.counters.tips.includes(id)) this.counters.tips.push(id);
  }

  /** The tester left before the mission ended. */
  abandon(how: 'menu' | 'restart' | 'load' | 'closed'): void {
    if (this.done) return;
    const st = this.state();
    this.close('missionAbandon', { how, tick: st.tick, ...snapshot(st), stats: { ...st.stats } });
  }

  private finish(entry: Record<string, unknown>): void {
    this.close('missionEnd', entry);
  }

  private close(kind: string, fields: Record<string, unknown>): void {
    this.setPaused(false);
    this.done = true;
    window.removeEventListener('pagehide', this.onHide);
    Playtest.log(kind, {
      ...fields,
      realSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      input: { ...this.counters, pausedMs: Math.round(this.counters.pausedMs) },
    });
  }
}
