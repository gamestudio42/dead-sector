import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  buildDebrief,
  COMBAT_PLAN,
  createPlanRunner,
  GameSimulation,
  STEALTH_PLAN,
  tickPlan,
  type Debrief,
  type PlanStep,
} from '@dead-sector/sim';
import { captionFor } from '../src/audio/captions';
import { gradeFor } from '../src/presentation/grade';
import { emptyRecord, recordEvents, recordTraces } from '../src/presentation/timeline';

function playToEnd(plan: PlanStep[]) {
  const sim = GameSimulation.create('a-ultima-farmacia', 1337, loadContent());
  const runner = createPlanRunner();
  const rec = emptyRecord();
  for (let i = 0; i < 9000 && !sim.ended; i++) {
    tickPlan(sim, plan, runner);
    const events = sim.step();
    recordEvents(rec, events, sim.state);
    recordTraces(rec, sim.state);
  }
  return { sim, rec, debrief: buildDebrief(sim.state) };
}

describe('debriefing grade and timeline', () => {
  const stealth = playToEnd(STEALTH_PLAN);
  const combat = playToEnd(COMBAT_PLAN);

  it('both canonical routes win and the quiet one grades at least as well', () => {
    expect(stealth.debrief.outcome).toBe('success');
    expect(combat.debrief.outcome).toBe('success');
    const order = 'SABCDF';
    const s = gradeFor(stealth.debrief).letter;
    const c = gradeFor(combat.debrief).letter;
    expect(order.indexOf(s)).toBeLessThanOrEqual(order.indexOf(c));
    expect(gradeFor(combat.debrief).notes).toContain('Barulho alto atraiu reforços');
  });

  it('failure is always F and partial success never beats C', () => {
    const failed: Debrief = { ...stealth.debrief, outcome: 'failed' };
    expect(gradeFor(failed).letter).toBe('F');
    const partial: Debrief = { ...stealth.debrief, outcome: 'partial' };
    expect('CDF').toContain(gradeFor(partial).letter);
  });

  it('timeline lists all five objectives in order and ends with the outcome', () => {
    const tl = stealth.rec.timeline;
    const objectives = tl.filter((e) => e.tone === 'good').map((e) => e.text);
    expect(objectives.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < tl.length; i++) expect(tl[i]!.tick).toBeGreaterThanOrEqual(tl[i - 1]!.tick);
    expect(tl.at(-1)?.text).toBe('Missão cumprida');
  });

  it('route traces cover every squad member and the rescued civilian', () => {
    const ids = Object.keys(stealth.rec.traces);
    for (const s of stealth.sim.state.survivors) expect(ids).toContain(s.id);
    const civ = stealth.sim.state.survivors.find((s) => s.isObjectiveCivilian)!;
    expect(stealth.rec.traces[civ.id]!.length).toBeGreaterThan(3);
  });
});

describe('sound captions', () => {
  const listener = { x: 50, y: 50 };

  it('describe kind, distance and direction', () => {
    expect(captionFor({ kind: 'gunshot', x: 55, y: 50, muffled: false }, listener)).toBe(
      '[Tiros — perto, a leste]',
    );
    expect(captionFor({ kind: 'groan', x: 50, y: 20, muffled: true }, listener)).toBe(
      '[Rosnados — abafado, longe, a norte]',
    );
  });

  it('skip footsteps and interface sounds', () => {
    expect(captionFor({ kind: 'footstep', x: 51, y: 50, muffled: false }, listener)).toBeNull();
    expect(captionFor({ kind: 'order', muffled: false }, listener)).toBeNull();
  });
});
