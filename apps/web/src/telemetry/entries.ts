import type { GameState, SimEvent } from '@dead-sector/sim';

/**
 * Playtest log: what a tester did and what happened to them, kept only in this browser.
 *
 * Nothing is sent anywhere. The tester turns it on (Options → Playtest, or `?playtest=1`), plays,
 * and exports a JSON file to hand to the team. `tools/playtest/report.mjs` merges those files.
 * Everything here reads the simulation and never changes it.
 */

export const FORMAT = 'dead-sector-playtest';
export const FORMAT_VERSION = 1;
/** Oldest entries are dropped past this, so a long tester profile stays well under storage limits. */
export const MAX_ENTRIES = 6000;
/** Simulation ticks between state samples (30 s of game time). */
export const SAMPLE_TICKS = 300;

export interface PlaytestEntry {
  /** Wall-clock time (ms since epoch). */
  t: number;
  /** Page session, so separate sittings can be told apart. */
  session: string;
  kind: string;
  [field: string]: unknown;
}

export interface PlaytestExport {
  format: typeof FORMAT;
  version: typeof FORMAT_VERSION;
  exportedAt: string;
  build: string;
  /** Tester label typed on export (optional, free text chosen by the tester). */
  tester: string;
  entries: PlaytestEntry[];
}

type Fields = Record<string, unknown>;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Survivor id and role, never the tester's data: the names are the game's own characters. */
function who(state: GameState, id: unknown): Fields {
  const s = state.survivors.find((m) => m.id === id);
  return s
    ? { survivor: s.id, role: s.templateId, civilian: s.isObjectiveCivilian }
    : { survivor: String(id) };
}

/**
 * The moments of one tick worth logging. Pure: same events and state, same entries, and the
 * state is only read.
 */
export function entriesForEvents(events: readonly SimEvent[], state: GameState): Fields[] {
  const out: Fields[] = [];
  for (const e of events) {
    const p = e.payload;
    const at = { tick: e.tick };
    switch (e.type) {
      case 'ACTOR_KILLED':
        if (p['kind'] === 'survivor') {
          const s = state.survivors.find((m) => m.id === p['actorId']);
          out.push({
            kind: 'death',
            ...at,
            ...who(state, p['actorId']),
            cause: p['cause'] ?? null,
            x: s ? round1(s.position.x) : null,
            y: s ? round1(s.position.y) : null,
          });
        }
        break;
      case 'ACTOR_INJURED':
        if (p['bitten']) out.push({ kind: 'bitten', ...at, ...who(state, p['actorId']) });
        break;
      case 'SURVIVOR_PANICKED':
        out.push({
          kind: 'panic',
          ...at,
          ...who(state, p['survivorId']),
          behaviour: p['behaviour'],
        });
        break;
      case 'SURVIVOR_TURNED':
        out.push({ kind: 'turned', ...at, ...who(state, p['survivorId']) });
        break;
      case 'OBJECTIVE_COMPLETED':
        out.push({ kind: 'objective', ...at, objective: p['objectiveId'] });
        break;
      case 'ORDER_BLOCKED':
        out.push({ kind: 'orderBlocked', ...at, order: p['orderType'], reason: p['reason'] });
        break;
      case 'ORDER_REJECTED':
        out.push({ kind: 'orderRejected', ...at, reason: p['reason'] ?? null });
        break;
      case 'ALARM_CHANGED':
        out.push({ kind: 'alarm', ...at, level: p['level'], previous: p['previous'] });
        break;
      case 'HORDE_SPAWNED':
        out.push({ kind: 'horde', ...at, size: p['size'] });
        break;
      case 'SIEGE_WAVE':
        out.push({ kind: 'wave', ...at, wave: p['wave'], size: p['size'] });
        break;
      case 'DEFENCE_HOLD_CHANGED':
        out.push({
          kind: 'defenceHold',
          ...at,
          holding: p['holding'],
          secondsLeft: p['secondsLeft'],
        });
        break;
      case 'DEFENCE_COMPLETED':
        out.push({ kind: 'defence', ...at });
        break;
      case 'EXTRACTION_STARTED':
        out.push({ kind: 'extraction', ...at });
        break;
      case 'MISSION_ENDED':
        out.push({
          kind: 'missionEnd',
          ...at,
          status: p['status'],
          reason: p['reason'],
          ...outcomeOf(state),
        });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Squad condition and pressure at a moment (periodic samples and the final tally). */
export function snapshot(state: GameState): Fields {
  const squad = state.survivors.filter((s) => !s.isObjectiveCivilian);
  const alive = squad.filter((s) => s.alive);
  return {
    alive: alive.length,
    squadSize: squad.length,
    zombies: state.zombies.filter((z) => z.alive).length,
    alarm: state.mission.alarmLevel,
    ammo: alive.reduce((n, s) => n + s.weapon.magazineRounds + s.weapon.reserveRounds, 0),
    stress: alive.length ? Math.round(alive.reduce((n, s) => n + s.stress, 0) / alive.length) : 0,
    objectivesDone: state.objectives.filter((o) => o.status === 'completed').length,
  };
}

function outcomeOf(state: GameState): Fields {
  return { ...snapshot(state), stats: { ...state.stats } };
}

/** Counters for what the tester did with the interface during one mission. */
export interface InputCounters {
  pauses: number;
  /** Real milliseconds spent paused (including menus and options). */
  pausedMs: number;
  speedToggles: number;
  orders: Record<string, number>;
  modes: Record<string, number>;
  firePolicy: number;
  contextMenu: number;
  quicksaves: number;
  quickloads: number;
  options: number;
  tips: string[];
}

export const emptyCounters = (): InputCounters => ({
  pauses: 0,
  pausedMs: 0,
  speedToggles: 0,
  orders: {},
  modes: {},
  firePolicy: 0,
  contextMenu: 0,
  quicksaves: 0,
  quickloads: 0,
  options: 0,
  tips: [],
});

/** Builds the export file. Pure, so its shape is tested without a browser. */
export function buildExport(
  entries: readonly PlaytestEntry[],
  build: string,
  tester: string,
  now: Date,
): PlaytestExport {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    build,
    tester: tester.trim().slice(0, 60),
    entries: [...entries],
  };
}

/** Appends and trims to the newest `max` entries. */
export function appendCapped(
  list: PlaytestEntry[],
  entry: PlaytestEntry,
  max = MAX_ENTRIES,
): PlaytestEntry[] {
  list.push(entry);
  if (list.length > max) list.splice(0, list.length - max);
  return list;
}
