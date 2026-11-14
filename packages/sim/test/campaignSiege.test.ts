import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  applyOperationResult,
  carryOver,
  endDay,
  GameSimulation,
  migrateCampaign,
  MISSION_PLANS,
  newCampaign,
  operationBlockReason,
  operationMissionId,
  runPlan,
  type CampaignState,
  type GameState,
} from '../src';

const content = loadContent();
const def = content.campaigns['ferrugem']!;
const siege = def.siege!;

/** A campaign whose shelter is about to be besieged tonight. */
function nearSiege(): CampaignState {
  const c = newCampaign(content, 'ferrugem', 5);
  c.sectors['abrigo']!.infestation = siege.raisedFrom + 5;
  return c;
}

function besieged(): CampaignState {
  return endDay(content, nearSiege()).campaign;
}

let played: GameState | null = null;
function playSiege(c: CampaignState): GameState {
  if (played) return played;
  const sim = GameSimulation.create(siege.missionId, undefined, content, carryOver(c));
  runPlan(sim, MISSION_PLANS[siege.missionId]!);
  played = sim.state;
  return played;
}

describe('campaign siege on the shelter', () => {
  it('is raised at night when the shelter infestation reaches the threshold', () => {
    const quiet = endDay(content, newCampaign(content, 'ferrugem', 5)).campaign;
    expect(quiet.siegePending).toBe(false);
    const c = besieged();
    expect(c.siegePending).toBe(true);
    expect(c.lastReport).toContainEqual({ kind: 'siege-raised', sector: 'Escola Dom Bosco' });
  });

  it('makes the siege the only operation of the day', () => {
    const c = besieged();
    expect(operationMissionId(content, c, 'abrigo')).toBe(siege.missionId);
    expect(operationBlockReason(content, c, 'abrigo')).toBeNull();
    expect(operationBlockReason(content, c, 'ferrugem')).toBe('siege');
    const calm = newCampaign(content, 'ferrugem', 5);
    expect(operationMissionId(content, calm, 'abrigo')).toBeNull();
    expect(operationBlockReason(content, calm, 'abrigo')).toBe('no-plan');
  });

  it('a held siege pushes the horde back and adds no noise heat', () => {
    const c = besieged();
    const state = playSiege(c);
    expect(['success', 'partial']).toContain(state.mission.status);
    const { campaign: next, report } = applyOperationResult(content, c, 'abrigo', state);
    expect(next.siegePending).toBe(false);
    expect(next.sieges).toBe(1);
    expect(next.sectors['abrigo']!.infestation).toBeLessThan(c.sectors['abrigo']!.infestation);
    expect(next.sectors['abrigo']!.noise).toBe(0);
    expect(report.lines).toContainEqual({ kind: 'siege-broken', sector: 'Escola Dom Bosco' });
    // the teacher already lived there: nobody new joins the shelter
    expect(next.rescued).toEqual(c.rescued);
    expect(next.population).toBe(c.population);
    expect(next.operatedToday).toBe(true);
  });

  it('a lost siege costs people of the shelter', () => {
    const c = besieged();
    const lost = JSON.parse(JSON.stringify(playSiege(c))) as GameState;
    lost.mission.status = 'failed';
    const next = applyOperationResult(content, c, 'abrigo', lost).campaign;
    expect(next.siegePending).toBe(false);
    expect(next.population).toBe(c.population - siege.breachLoss);
    expect(next.lastReport).toContainEqual({
      kind: 'shelter-breached',
      sector: 'Escola Dom Bosco',
      lost: siege.breachLoss,
    });
  });

  it('ending the day without fighting lets the infected in', () => {
    const c = besieged();
    const next = endDay(content, c).campaign;
    expect(next.sieges).toBe(1);
    expect(next.lastReport[0]).toEqual({
      kind: 'shelter-breached',
      sector: 'Escola Dom Bosco',
      lost: siege.breachLoss,
    });
    expect(next.population).toBeLessThan(c.population);
  });

  it('old saves load with no siege pending', () => {
    const c = newCampaign(content, 'ferrugem', 2) as Partial<CampaignState>;
    delete c.siegePending;
    delete c.sieges;
    const back = migrateCampaign(content, { ...c, version: 3 })!;
    expect(back.version).toBe(4);
    expect(back.siegePending).toBe(false);
    expect(back.sieges).toBe(0);
  });
});
