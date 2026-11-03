import type { GameState, SimEvent, Vec2 } from '@dead-sector/sim';
import { T, text } from '../ui/i18n';

export interface TimelineEntry {
  tick: number;
  text: string;
  tone: 'good' | 'bad' | 'warn' | 'info';
}

/** What the debriefing shows of a played mission (kept by the client, not saved with the sim). */
export interface MissionRecord {
  timeline: TimelineEntry[];
  /** Sampled positions per survivor id. */
  traces: Record<string, Vec2[]>;
  deaths: { x: number; y: number; survivor: boolean }[];
}

export const emptyRecord = (): MissionRecord => ({ timeline: [], traces: {}, deaths: [] });

const first = (state: GameState, id: unknown) =>
  state.survivors.find((s) => s.id === id)?.name.split(' ')[0] ?? '?';

/** Appends the key moments of this tick (objectives, losses, bites, panic, extraction). */
export function recordEvents(rec: MissionRecord, events: SimEvent[], state: GameState): void {
  const add = (text: string, tone: TimelineEntry['tone']) =>
    rec.timeline.push({ tick: state.tick, text, tone });
  for (const e of events) {
    const p = e.payload;
    switch (e.type) {
      case 'OBJECTIVE_COMPLETED':
        add(T.objectives[p['objectiveId'] as string] ?? text('timeline.objectiveFallback'), 'good');
        break;
      case 'ACTOR_KILLED':
        if (p['kind'] === 'survivor' && p['cause'] !== 'turned') {
          const s = state.survivors.find((m) => m.id === p['actorId']);
          if (s) rec.deaths.push({ x: s.position.x, y: s.position.y, survivor: true });
          add(text('timeline.died', { name: first(state, p['actorId']) }), 'bad');
        }
        break;
      case 'ACTOR_INJURED':
        if (p['bitten']) add(text('timeline.bitten', { name: first(state, p['actorId']) }), 'bad');
        break;
      case 'SURVIVOR_PANICKED':
        add(text('timeline.panic', { name: first(state, p['survivorId']) }), 'warn');
        break;
      case 'LEADER_CHANGED':
        if (p['leaderId'])
          add(text('timeline.leader', { name: first(state, p['leaderId']) }), 'warn');
        break;
      case 'DOOR_CHANGED':
        if (p['broken']) add(text('timeline.door'), 'warn');
        break;
      case 'EXTRACTION_STARTED':
        add(text('timeline.radio'), 'info');
        break;
      case 'SURVIVOR_TURNED':
        rec.deaths.push({ x: p['x'] as number, y: p['y'] as number, survivor: true });
        add(text('timeline.turned', { name: String(p['name']).split(' ')[0] ?? '' }), 'bad');
        break;
      case 'HORDE_SPAWNED':
        add(text('timeline.horde', { size: String(p['size']) }), 'bad');
        break;
      case 'ALARM_CHANGED':
        if ((p['level'] as number) === 3) add(text('timeline.alarm'), 'bad');
        break;
      case 'BARRICADE_BUILT':
        add(text('timeline.barricade'), 'info');
        break;
      case 'REINFORCEMENT_SPAWNED':
        if (state.mission.reinforcementsSpawned === 1) add(text('timeline.reinforcements'), 'warn');
        break;
      case 'MISSION_ENDED':
        add(
          T.outcome[p['status'] as string] ?? text('timeline.missionEndFallback'),
          p['status'] === 'failed' ? 'bad' : 'good',
        );
        break;
      default:
        break;
    }
  }
}

/** Samples squad positions every 2 s of game time for the route map. */
export function recordTraces(rec: MissionRecord, state: GameState): void {
  if (state.tick % 20 !== 0) return;
  for (const s of state.survivors) {
    if (!s.alive || s.extracted) continue;
    if (s.isObjectiveCivilian && !s.rescued) continue;
    (rec.traces[s.id] ??= []).push({ x: s.position.x, y: s.position.y });
  }
}
