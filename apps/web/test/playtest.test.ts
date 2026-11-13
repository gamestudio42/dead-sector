import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  COMBAT_PLAN,
  createPlanRunner,
  GameSimulation,
  hashState,
  tickPlan,
} from '@dead-sector/sim';
import {
  appendCapped,
  buildExport,
  entriesForEvents,
  FORMAT,
  snapshot,
  type PlaytestEntry,
} from '../src/telemetry/entries';

function playCombatRoute() {
  const sim = GameSimulation.create('a-ultima-farmacia', undefined, loadContent());
  const runner = createPlanRunner();
  const log: Record<string, unknown>[] = [];
  while (!sim.ended && sim.tick < 9000) {
    tickPlan(sim, COMBAT_PLAN, runner);
    const events = sim.step();
    const before = hashState(sim.state);
    log.push(...entriesForEvents(events, sim.state));
    // the log only reads the simulation
    expect(hashState(sim.state)).toBe(before);
  }
  return { sim, log };
}

describe('playtest log', () => {
  it('records a full mission without changing it, and ends with its outcome', () => {
    const { sim, log } = playCombatRoute();
    expect(sim.ended).toBe(true);
    const kinds = log.map((e) => e['kind']);
    expect(kinds).toContain('objective');
    expect(kinds.filter((k) => k === 'missionEnd')).toHaveLength(1);
    expect(kinds[kinds.length - 1]).toBe('missionEnd');
    const end = log[log.length - 1]!;
    expect(end['status']).toBe(sim.state.mission.status);
    expect(end['stats']).toEqual(sim.state.stats);
    for (const e of log.filter((x) => x['kind'] === 'death')) {
      expect(typeof e['survivor']).toBe('string');
      expect(typeof e['x']).toBe('number');
    }
  });

  it('is identical for the same seed and orders', () => {
    expect(playCombatRoute().log).toEqual(playCombatRoute().log);
  });

  it('snapshots the squad, not the escorted civilian', () => {
    const sim = GameSimulation.create('a-ultima-farmacia', undefined, loadContent());
    const snap = snapshot(sim.state);
    const squad = sim.state.survivors.filter((s) => !s.isObjectiveCivilian);
    expect(snap['alive']).toBe(squad.length);
    expect(snap['objectivesDone']).toBe(0);
    expect(snap['ammo']).toBeGreaterThan(0);
  });

  it('keeps only the newest entries past the cap', () => {
    const list: PlaytestEntry[] = [];
    for (let i = 0; i < 12; i++) appendCapped(list, { t: i, session: 's', kind: 'k' }, 10);
    expect(list).toHaveLength(10);
    expect(list[0]!.t).toBe(2);
  });

  it('exports a versioned file with a trimmed tester label', () => {
    const file = buildExport(
      [{ t: 1, session: 's', kind: 'session' }],
      'b1',
      '  Ana  ',
      new Date('2026-11-13T12:00:00Z'),
    );
    expect(file.format).toBe(FORMAT);
    expect(file.version).toBe(1);
    expect(file.tester).toBe('Ana');
    expect(file.exportedAt).toBe('2026-11-13T12:00:00.000Z');
    expect(file.entries).toHaveLength(1);
  });
});

describe('playtest report', () => {
  it('merges exports into funnel, mission and death tables', async () => {
    // @ts-expect-error plain ESM tool script without types
    const { buildReport } = (await import('../../../tools/playtest/report.mjs')) as {
      buildReport: (x: unknown[]) => string;
    };
    const { sim, log } = playCombatRoute();
    let t = 0;
    const e = (kind: string, f: Record<string, unknown> = {}): PlaytestEntry => ({
      t: t++,
      session: 'a',
      kind,
      ...f,
    });
    const input = {
      pauses: 2,
      pausedMs: 30000,
      speedToggles: 1,
      orders: { move: 5 },
      modes: { sneak: 1 },
      firePolicy: 0,
      contextMenu: 0,
      quicksaves: 0,
      quickloads: 0,
      options: 0,
      tips: ['select'],
    };
    const entries: PlaytestEntry[] = [
      e('session', { viewport: '1920x1080' }),
      e('menu', { choice: 'a-ultima-farmacia' }),
      e('briefing', { choice: 'deploy', seconds: 40 }),
      e('missionStart', { missionId: 'a-ultima-farmacia' }),
      ...log.slice(0, -1).map((x) => e(String(x['kind']), x)),
      e('missionEnd', { ...log[log.length - 1], realSeconds: 300, input }),
      e('missionStart', { missionId: 'a-ultima-farmacia' }),
      e('missionAbandon', {
        how: 'menu',
        tick: 600,
        objectivesDone: 1,
        alive: 7,
        squadSize: 7,
        realSeconds: 70,
        input,
      }),
    ];
    const md = buildReport([buildExport(entries, 'b1', 'Ana', new Date())]);
    expect(md).toContain('| Ana | 1 |');
    expect(md).toContain('| Finished a mission (any result) | 1 / 1 |');
    expect(md).toContain(`a-ultima-farmacia: ${sim.state.mission.status}`);
    expect(md).toContain('1× a-ultima-farmacia: menu at 1:00, 1 objective(s) done, 7/7 alive');
    expect(md).toContain('Median time on the briefing before deploying: 0:40');
  });
});
