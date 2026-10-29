import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  applyMissionResult,
  buildDebrief,
  carryOver,
  currentMissionId,
  GameSimulation,
  MISSION_PLANS,
  newCampaign,
  runPlan,
  STEALTH_PLAN,
  type CampaignState,
} from '../src';

const content = loadContent();

function play(missionId: string, campaign?: CampaignState): GameSimulation {
  const sim = GameSimulation.create(
    missionId,
    undefined,
    content,
    campaign ? carryOver(campaign) : undefined,
  );
  runPlan(sim, MISSION_PLANS[missionId]!);
  return sim;
}

describe('new missions (canonical seeds)', () => {
  for (const id of ['sinal-fraco', 'plantao-noturno'])
    it(`${id} is completable end to end by its scripted route`, () => {
      const sim = play(id);
      const d = buildDebrief(sim.state);
      expect(d.outcome).toBe('success');
      expect(d.civilianExtracted).toBe(true);
      expect(d.medicineRecovered).toBe(true);
    });
});

describe('campaign: progress and losses persist', () => {
  it('a fresh campaign deploys the full roster in good shape', () => {
    const c = newCampaign(content, 'ferrugem');
    expect(c.roster).toHaveLength(8);
    expect(c.roster.every((r) => r.alive && r.infection === 'healthy')).toBe(true);
    expect(currentMissionId(content, c)).toBe('a-ultima-farmacia');
  });

  it('the dead do not deploy again, the wounded keep their wounds, ammo carries over', () => {
    let c = newCampaign(content, 'ferrugem');
    const first = GameSimulation.create('a-ultima-farmacia', undefined, content, carryOver(c));
    const dead = first.state.survivors.find((s) => s.templateId === 'bravo-volunteer')!;
    const hurt = first.state.survivors.find((s) => s.templateId === 'alfa-marksman')!;
    // scripted outcome: one dies, one is hurt and bitten, everyone else extracts with the civilian
    runPlan(first, MISSION_PLANS['a-ultima-farmacia']!);
    expect(first.state.mission.status).toBe('success');
    dead.alive = false;
    hurt.health = 30;
    hurt.infection = 'exposed';
    hurt.bitten = true;
    const spent = hurt.weapon.magazineRounds + hurt.weapon.reserveRounds;
    const res = applyMissionResult(content, c, first.state);
    c = res.campaign;
    expect(c.missionIndex).toBe(1);
    expect(c.roster.find((r) => r.templateId === 'bravo-volunteer')!.alive).toBe(false);
    // medicine from the pharmacy cured the bite overnight
    const marks = c.roster.find((r) => r.templateId === 'alfa-marksman')!;
    expect(marks.infection).toBe('healthy');
    expect(res.report.cured).toContain('Iara Monteiro');
    expect(marks.health).toBeGreaterThan(30);
    expect(marks.health).toBeLessThan(100);
    expect(marks.ammo).toBeGreaterThanOrEqual(spent);

    const second = GameSimulation.create('sinal-fraco', undefined, content, carryOver(c));
    expect(second.state.survivors.some((s) => s.templateId === 'bravo-volunteer')).toBe(false);
    const m2 = second.state.survivors.find((s) => s.templateId === 'alfa-marksman')!;
    expect(m2.health).toBe(marks.health);
    expect(m2.weapon.magazineRounds + m2.weapon.reserveRounds).toBe(marks.ammo);
  });

  it('an untreated critical infection turns overnight', () => {
    const c = newCampaign(content, 'ferrugem');
    const sim = play('a-ultima-farmacia');
    const s = sim.state.survivors.find((x) => x.templateId === 'alfa-medic')!;
    s.infection = 'critical';
    sim.state.mission.medicineCollected = false; // no doses this time
    const res = applyMissionResult(content, c, sim.state);
    expect(res.report.turnedOvernight).toContain('Caio Brandão');
    expect(res.campaign.roster.find((r) => r.templateId === 'alfa-medic')!.alive).toBe(false);
  });

  it('a lost leader is replaced by the most able survivor in the next mission', () => {
    const c = newCampaign(content, 'ferrugem');
    c.roster.find((r) => r.templateId === 'alfa-leader')!.alive = false;
    const sim = GameSimulation.create('sinal-fraco', undefined, content, carryOver(c));
    const alfa = sim.state.squads.find((s) => s.id === 'alfa')!;
    expect(alfa.memberIds).toHaveLength(3);
    expect(alfa.leaderId).not.toBeNull();
    expect(sim.state.survivors.find((s) => s.id === alfa.leaderId)!.isLeader).toBe(true);
  });

  it('a failed mission keeps its losses and is retried; losing everyone ends the campaign', () => {
    const c = newCampaign(content, 'ferrugem');
    const sim = GameSimulation.create('a-ultima-farmacia', undefined, content, carryOver(c));
    sim.state.mission.status = 'failed';
    sim.state.survivors.find((s) => s.templateId === 'bravo-scout')!.alive = false;
    const res = applyMissionResult(content, c, sim.state);
    expect(res.campaign.missionIndex).toBe(0);
    expect(res.campaign.status).toBe('active');
    expect(res.campaign.roster.find((r) => r.templateId === 'bravo-scout')!.alive).toBe(false);
    for (const s of sim.state.survivors) s.alive = false;
    expect(applyMissionResult(content, c, sim.state).campaign.status).toBe('lost');
  });

  it('the whole campaign can be won, retrying failed missions with whoever is left', () => {
    let c = newCampaign(content, 'ferrugem');
    let attempts = 0;
    const deathsBefore: number[] = [];
    while (c.status === 'active' && attempts < 8) {
      const id = currentMissionId(content, c)!;
      const tries = c.history.filter((h) => h.missionId === id).length;
      const seed = content.missions[id]!.canonicalSeed + tries;
      const sim = GameSimulation.create(id, seed, content, carryOver(c));
      // a careful player sneaks through the first mission
      runPlan(sim, id === 'a-ultima-farmacia' ? STEALTH_PLAN : MISSION_PLANS[id]!);
      deathsBefore.push(c.roster.filter((r) => !r.alive).length);
      c = applyMissionResult(content, c, sim.state).campaign;
      attempts += 1;
    }
    expect(c.status).toBe('won');
    expect(c.history.filter((h) => h.outcome !== 'failed')).toHaveLength(3);
    expect(c.rescued).toHaveLength(3);
    // losses only ever accumulate
    for (let i = 1; i < deathsBefore.length; i++)
      expect(deathsBefore[i]).toBeGreaterThanOrEqual(deathsBefore[i - 1]!);
  });
});
