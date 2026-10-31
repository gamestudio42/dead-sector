import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  applyOperationResult,
  buildDebrief,
  carryOver,
  endDay,
  GameSimulation,
  migrateCampaign,
  MISSION_PLANS,
  missionSeed,
  newCampaign,
  operationBlockReason,
  reinforcementMultiplier,
  runPlan,
  sectorStatus,
  serializeState,
  STEALTH_PLAN,
  treatInfection,
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

const def = content.campaigns['ferrugem']!;

describe('campaign: progress and losses persist', () => {
  it('a fresh campaign deploys the full roster in good shape', () => {
    const c = newCampaign(content, 'ferrugem');
    expect(c.roster).toHaveLength(8);
    expect(c.roster.every((r) => r.alive && r.infection === 'healthy')).toBe(true);
    expect(c.day).toBe(1);
  });

  it('the dead do not deploy again, the wounded keep their wounds, ammo carries over', () => {
    const c = newCampaign(content, 'ferrugem');
    const first = GameSimulation.create('a-ultima-farmacia', undefined, content, carryOver(c));
    const dead = first.state.survivors.find((s) => s.templateId === 'bravo-volunteer')!;
    const hurt = first.state.survivors.find((s) => s.templateId === 'alfa-marksman')!;
    runPlan(first, MISSION_PLANS['a-ultima-farmacia']!);
    expect(first.state.mission.status).toBe('success');
    dead.alive = false;
    hurt.health = 30;
    const spent = hurt.weapon.magazineRounds + hurt.weapon.reserveRounds;
    const res = applyOperationResult(content, c, 'ferrugem', first.state).campaign;
    expect(res.roster.find((r) => r.templateId === 'bravo-volunteer')!.alive).toBe(false);
    const marks = res.roster.find((r) => r.templateId === 'alfa-marksman')!;
    expect(marks.health).toBe(30);
    expect(marks.ammo).toBe(spent);

    const second = GameSimulation.create('sinal-fraco', undefined, content, carryOver(res));
    expect(second.state.survivors.some((s) => s.templateId === 'bravo-volunteer')).toBe(false);
    const m2 = second.state.survivors.find((s) => s.templateId === 'alfa-marksman')!;
    expect(m2.health).toBe(30);
    expect(m2.weapon.magazineRounds + m2.weapon.reserveRounds).toBe(spent);
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

  it('a failed operation keeps its losses; losing everyone ends the campaign', () => {
    const c = newCampaign(content, 'ferrugem');
    const sim = GameSimulation.create('a-ultima-farmacia', undefined, content, carryOver(c));
    sim.state.mission.status = 'failed';
    sim.state.survivors.find((s) => s.templateId === 'bravo-scout')!.alive = false;
    const res = applyOperationResult(content, c, 'ferrugem', sim.state).campaign;
    expect(res.status).toBe('active');
    expect(res.sectors['ferrugem']!.infestation).toBeGreaterThan(
      c.sectors['ferrugem']!.infestation,
    );
    expect(res.roster.find((r) => r.templateId === 'bravo-scout')!.alive).toBe(false);
    for (const s of sim.state.survivors) s.alive = false;
    expect(applyOperationResult(content, c, 'ferrugem', sim.state).campaign.status).toBe('lost');
  });
});

describe('strategic layer: decisions have explicit costs', () => {
  const finished = (c: CampaignState, id = 'a-ultima-farmacia') => {
    const sim = GameSimulation.create(id, undefined, content, carryOver(c));
    runPlan(sim, MISSION_PLANS[id]!);
    expect(sim.state.mission.status).toBe('success');
    return sim.state;
  };

  it('only sectors connected to the shelter can be operated, once a day', () => {
    const c = newCampaign(content, 'ferrugem');
    expect(sectorStatus(def, c, 'centro')).toBe('unknown');
    expect(operationBlockReason(content, c, 'centro')).toMatch(/desconhecido/);
    expect(operationBlockReason(content, c, 'avenida')).toMatch(/plano/);
    expect(operationBlockReason(content, c, 'ferrugem')).toBeNull();
    const after = applyOperationResult(content, c, 'ferrugem', finished(c)).campaign;
    expect(after.operatedToday).toBe(true);
    expect(operationBlockReason(content, after, 'ferrovia')).toMatch(/hoje/);
    // a loud run can undo the sector overnight; a quiet one keeps the way open
    const quiet = {
      ...after,
      sectors: { ...after.sectors, ferrugem: { ...after.sectors['ferrugem']!, noise: 0 } },
    };
    expect(operationBlockReason(content, endDay(content, quiet).campaign, 'ferrovia')).toBeNull();
  });

  it('securing a sector cleans it, pays its reward and reveals what is next', () => {
    const c = newCampaign(content, 'ferrugem');
    const after = applyOperationResult(content, c, 'ferrugem', finished(c)).campaign;
    expect(sectorStatus(def, after, 'ferrugem')).toBe('secured');
    expect(sectorStatus(def, after, 'ferrovia')).not.toBe('unknown');
    expect(after.stock.food).toBe(c.stock.food + 14);
    expect(after.stock.medicine).toBe(c.stock.medicine + 2);
    expect(after.population).toBe(c.population + 2); // the civilian and the reward's person
  });

  it('a second run pays half: stock is never free', () => {
    const c = newCampaign(content, 'ferrugem');
    const first = applyOperationResult(content, c, 'ferrugem', finished(c)).campaign;
    const again = applyOperationResult(content, first, 'ferrugem', finished(c)).campaign;
    expect(again.stock.food - first.stock.food).toBe(7);
  });

  it('every day costs food, and hunger costs people', () => {
    const c = newCampaign(content, 'ferrugem');
    const need = Math.ceil((c.population + 8) / def.peoplePerFood);
    expect(endDay(content, c).campaign.stock.food).toBe(c.stock.food - need);
    const hungry = { ...c, stock: { ...c.stock, food: 0 } };
    const r = endDay(content, hungry);
    expect(r.campaign.population).toBeLessThan(c.population);
    expect(r.report.lines.join()).toMatch(/comida/);
  });

  it('squads rearm from the stock, and an empty stock means they stay short', () => {
    const c = newCampaign(content, 'ferrugem');
    const r = c.roster.find((x) => x.templateId === 'alfa-marksman')!;
    const full = r.ammo;
    r.ammo = 1;
    c.stock.ammo = 5;
    const next = endDay(content, c).campaign;
    expect(next.roster.find((x) => x.templateId === 'alfa-marksman')!.ammo).toBe(6);
    expect(next.stock.ammo).toBe(0);
    expect(next.lastReport.join()).toMatch(/munição/);
    expect(full).toBeGreaterThan(6);
  });

  it('treatment spends a dose; an untreated infection advances and a critical one turns', () => {
    const c = newCampaign(content, 'ferrugem');
    const medic = c.roster.find((r) => r.templateId === 'alfa-medic')!;
    medic.infection = 'critical';
    const treated = treatInfection(content, c, 'alfa-medic')!;
    expect(treated.stock.medicine).toBe(c.stock.medicine - 1);
    expect(treated.roster.find((r) => r.templateId === 'alfa-medic')!.infection).toBe('healthy');
    expect(treatInfection(content, treated, 'alfa-medic')).toBeNull();
    expect(
      treatInfection(content, { ...c, stock: { ...c.stock, medicine: 0 } }, 'alfa-medic'),
    ).toBeNull();

    const r = endDay(content, c);
    expect(r.report.turnedOvernight).toContain('Caio Brandão');
    expect(r.campaign.roster.find((x) => x.templateId === 'alfa-medic')!.alive).toBe(false);
  });

  it('infected drift towards emptier sectors, and noise pulls them harder', () => {
    const quiet = newCampaign(content, 'ferrugem');
    const noisy = newCampaign(content, 'ferrugem');
    noisy.sectors['ferrugem']!.noise = 60;
    const q = endDay(content, quiet).campaign;
    const n = endDay(content, noisy).campaign;
    // the shelter takes infected from its dirtier neighbours
    expect(q.sectors['abrigo']!.infestation).toBeGreaterThan(quiet.sectors['abrigo']!.infestation);
    expect(n.sectors['ferrugem']!.infestation).toBeGreaterThan(q.sectors['ferrugem']!.infestation);
    expect(n.sectors['avenida']!.infestation).toBeLessThan(q.sectors['avenida']!.infestation);
    expect(n.sectors['ferrugem']!.noise).toBe(30);
  });

  it('a sector full of infected is lost for good, and so is the campaign if it was the way out', () => {
    const c = newCampaign(content, 'ferrugem');
    c.sectors['centro']!.infestation = 100;
    const r = endDay(content, c).campaign;
    expect(sectorStatus(def, r, 'centro')).toBe('lost');
    expect(r.status).toBe('active');
    expect(operationBlockReason(content, r, 'centro')).toMatch(/perdido/);

    c.sectors['ferrovia']!.infestation = 100;
    const out = endDay(content, c).campaign;
    expect(out.status).toBe('lost');
    expect(out.endReason).toMatch(/evacuação/);
  });

  it('the deadline and the shelter falling both end the campaign', () => {
    const late = newCampaign(content, 'ferrugem');
    late.day = def.victory.deadlineDays;
    expect(endDay(content, late).campaign.status).toBe('lost');
    const overrun = newCampaign(content, 'ferrugem');
    overrun.sectors['abrigo']!.infestation = 100;
    const o = endDay(content, overrun).campaign;
    expect(o.status).toBe('lost');
    expect(o.endReason).toMatch(/abrigo/);
  });

  it('reinforcements follow the infestation of the sector on the day', () => {
    const budget = (m: number) =>
      GameSimulation.create('a-ultima-farmacia', undefined, content, undefined, m).state.mission
        .reinforcementBudget;
    expect(budget(reinforcementMultiplier(100))).toBeGreaterThan(
      budget(reinforcementMultiplier(10)),
    );
    // no multiplier means the mission plays exactly as it did before the strategic layer
    expect(serializeState(GameSimulation.create('a-ultima-farmacia').state)).toBe(
      serializeState(
        GameSimulation.create('a-ultima-farmacia', undefined, content, undefined, 1).state,
      ),
    );
  });

  it('the strategic layer is deterministic for the same seed and choices', () => {
    const run = (seed: number) => {
      let c = newCampaign(content, 'ferrugem', seed);
      for (let i = 0; i < 6; i++) c = endDay(content, c).campaign;
      return JSON.stringify(c);
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });

  it('survives a JSON round trip mid-campaign', () => {
    const c = endDay(content, newCampaign(content, 'ferrugem', 3)).campaign;
    const back = migrateCampaign(content, JSON.parse(JSON.stringify(c)))!;
    expect(JSON.stringify(endDay(content, back).campaign)).toBe(
      JSON.stringify(endDay(content, c).campaign),
    );
  });

  it('a campaign saved by the old version keeps its people and progress', () => {
    const fresh = newCampaign(content, 'ferrugem');
    const roster = fresh.roster.map((r, i) => (i === 0 ? { ...r, alive: false } : r));
    const v1 = {
      version: 1,
      campaignId: 'ferrugem',
      missionIndex: 2,
      roster,
      supplies: 3,
      rescued: ['A', 'B'],
      history: [{}, {}],
      status: 'active',
    };
    const c = migrateCampaign(content, v1)!;
    expect(c.version).toBe(2);
    expect(c.roster[0]!.alive).toBe(false);
    expect(c.stock.medicine).toBe(3);
    expect(c.population).toBe(def.start.population + 2);
    expect(c.day).toBe(3);
    expect(sectorStatus(def, c, 'ferrugem')).toBe('secured');
    expect(sectorStatus(def, c, 'ferrovia')).toBe('secured');
    expect(sectorStatus(def, c, 'centro')).not.toBe('secured');
    expect(c.sectors['centro']!.revealed).toBe(true);
    expect(migrateCampaign(content, { version: 9, roster: [], campaignId: 'ferrugem' })).toBeNull();
    expect(migrateCampaign(content, null)).toBeNull();
  });
});

describe('strategic layer: the campaign can be won', () => {
  it('securing the way to the railyard and running convoys evacuates the people in time', () => {
    let c = newCampaign(content, 'ferrugem', 1);
    const plan: [string, string][] = [
      ['ferrugem', 'a-ultima-farmacia'],
      ['ferrovia', 'sinal-fraco'],
      ['ferrovia', 'sinal-fraco'],
    ];
    while (c.status === 'active' && c.day <= def.victory.deadlineDays) {
      const next = plan[0];
      if (next && operationBlockReason(content, c, next[0]) === null) {
        const [sector, id] = next;
        const sim = GameSimulation.create(
          id,
          missionSeed(content, c, id),
          content,
          carryOver(c),
          reinforcementMultiplier(c.sectors[sector]!.infestation),
        );
        runPlan(sim, id === 'a-ultima-farmacia' ? STEALTH_PLAN : MISSION_PLANS[id]!);
        const before = c.evacuated;
        c = applyOperationResult(content, c, sector, sim.state).campaign;
        if (
          sim.state.mission.status !== 'failed' &&
          (sector !== 'ferrovia' || c.evacuated > before)
        )
          plan.shift();
      }
      if (c.status !== 'active') break;
      for (const r of c.roster)
        if (r.alive && r.infection !== 'healthy') c = treatInfection(content, c, r.templateId) ?? c;
      c = endDay(content, c).campaign;
    }
    expect(c.status).toBe('won');
    expect(c.evacuated).toBeGreaterThanOrEqual(def.victory.evacuateGoal);
  });
});
