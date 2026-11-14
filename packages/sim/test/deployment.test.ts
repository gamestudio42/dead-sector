import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  applyOperationResult,
  carryOver,
  currentDeployment,
  deploy,
  deploymentBlockReason,
  deploymentCost,
  endDay,
  fullLoad,
  GameSimulation,
  migrateCampaign,
  MISSION_PLANS,
  newCampaign,
  recruit,
  recruitBlockReason,
  runPlan,
  type CampaignState,
} from '../src';

const content = loadContent();
const def = content.campaigns['ferrugem']!;
const rec = def.recruits!;
const MISSION = 'a-ultima-farmacia';

const fresh = () => newCampaign(content, 'ferrugem', 7);

describe('roster by id, deployment and recruits', () => {
  it('the original roster keeps its template ids, names and squads', () => {
    const c = fresh();
    expect(c.roster.map((r) => r.id)).toEqual(c.roster.map((r) => r.templateId));
    expect(c.roster.find((r) => r.id === 'alfa-leader')).toMatchObject({
      name: 'Teresa Vidal',
      squadId: 'alfa',
    });
  });

  it('a recruit leaves the shelter population, takes rounds from the stock and joins a squad', () => {
    const c = fresh();
    c.roster.find((r) => r.id === 'bravo-scout')!.alive = false;
    const next = recruit(content, c)!;
    const r = next.roster.at(-1)!;
    expect(r).toMatchObject({ id: 'recruit-1', templateId: rec.templateId, name: rec.names[0] });
    expect(r.squadId).toBe('bravo'); // the squad with room
    expect(next.population).toBe(c.population - 1);
    expect(next.stock.ammo).toBe(c.stock.ammo - fullLoad(content, rec.templateId));
    expect(next.lastReport.at(-1)).toEqual({ kind: 'recruited', name: rec.names[0] });
    // one a day
    expect(recruitBlockReason(content, next)).toBe('today');
    const tomorrow = endDay(content, next).campaign;
    expect(recruitBlockReason(content, tomorrow)).toBeNull();
    expect(recruit(content, tomorrow)!.roster.at(-1)!.name).toBe(rec.names[1]);
  });

  it('a recruit with both squads full stays in the shelter; nobody left means no recruit', () => {
    const extra = recruit(content, fresh())!;
    expect(extra.roster.at(-1)!.squadId).toBeNull();
    const empty = { ...fresh(), population: 0 };
    expect(recruitBlockReason(content, empty)).toBe('nobody');
    expect(recruit(content, empty)).toBeNull();
  });

  it('deployment respects squad slots and the stock, and remembers the squads', () => {
    const c = fresh();
    const d = currentDeployment(c);
    expect(deploymentBlockReason(content, c, MISSION, d)).toBeNull();
    // five in Alfa does not fit
    const crowded = { ...d, squads: { ...d.squads, 'bravo-scout': 'alfa' } };
    expect(deploymentBlockReason(content, c, MISSION, crowded)).toBe('squad-full');
    const nobody = {
      squads: Object.fromEntries(c.roster.map((r) => [r.id, null])),
      extraRounds: {},
    };
    expect(deploymentBlockReason(content, c, MISSION, nobody)).toBe('nobody');
    expect(deploymentBlockReason(content, c, MISSION, { ...d, extraRounds: { alfa: 5 } })).toBe(
      'rounds',
    );
    const poor = { ...c, stock: { ...c.stock, ammo: 10 } };
    expect(deploymentBlockReason(content, poor, MISSION, { ...d, extraRounds: { alfa: 12 } })).toBe(
      'not-enough-ammo',
    );

    // the medic stays home, Alfa takes 12 extra rounds per armed member
    const plan = {
      squads: { ...d.squads, 'alfa-medic': null },
      extraRounds: { alfa: rec.extraRoundsStep },
    };
    const cost = deploymentCost(content, c, plan);
    expect(cost).toBe(2 * rec.extraRoundsStep); // leader and marksman; the civilian is unarmed
    const next = deploy(content, c, MISSION, plan)!;
    expect(next.stock.ammo).toBe(c.stock.ammo - cost);
    expect(next.roster.find((r) => r.id === 'alfa-medic')!.squadId).toBeNull();
    const leader = next.roster.find((r) => r.id === 'alfa-leader')!;
    expect(leader.ammo).toBe(c.roster.find((r) => r.id === 'alfa-leader')!.ammo + 12);

    const sim = GameSimulation.create(MISSION, undefined, content, carryOver(next));
    const ids = sim.state.survivors.filter((s) => s.squadId).map((s) => s.id);
    expect(ids).not.toContain('alfa-medic');
    expect(ids).toHaveLength(7);
    const lead = sim.state.survivors.find((s) => s.id === 'alfa-leader')!;
    expect(lead.weapon.magazineRounds + lead.weapon.reserveRounds).toBe(leader.ammo);
  });

  it('a recruit fights under their own id and name and comes back in the roster', () => {
    let c: CampaignState = fresh();
    c.roster.find((r) => r.id === 'bravo-volunteer')!.alive = false;
    c = recruit(content, c)!;
    const sim = GameSimulation.create(MISSION, undefined, content, carryOver(c));
    const r = sim.state.survivors.find((s) => s.id === 'recruit-1')!;
    expect(r).toMatchObject({ name: rec.names[0], templateId: rec.templateId, squadId: 'bravo' });
    runPlan(sim, MISSION_PLANS[MISSION]!);
    const after = applyOperationResult(content, c, 'ferrugem', sim.state).campaign;
    const back = after.roster.find((x) => x.id === 'recruit-1')!;
    expect(back.missionsSurvived + (back.alive ? 0 : 1)).toBe(1);
  });

  it('two leaders in one squad: only the first leads', () => {
    const c = fresh();
    const d = currentDeployment(c);
    const plan = {
      squads: { ...d.squads, 'bravo-leader': 'alfa', 'alfa-civilian': 'bravo' },
      extraRounds: {},
    };
    const next = deploy(content, c, MISSION, plan)!;
    const sim = GameSimulation.create(MISSION, undefined, content, carryOver(next));
    const alfa = sim.state.survivors.filter((s) => s.squadId === 'alfa');
    expect(alfa.filter((s) => s.isLeader)).toHaveLength(1);
    const bravo = sim.state.survivors.filter((s) => s.squadId === 'bravo');
    expect(bravo.filter((s) => s.isLeader)).toHaveLength(1);
  });

  it('extra rounds not fired go back to the stock at night', () => {
    const c = fresh();
    const leader = c.roster.find((r) => r.id === 'alfa-leader')!;
    leader.ammo = fullLoad(content, 'alfa-leader') + 10;
    const next = endDay(content, c).campaign;
    expect(next.roster.find((r) => r.id === 'alfa-leader')!.ammo).toBe(
      fullLoad(content, 'alfa-leader'),
    );
    expect(next.lastReport).toContainEqual({ kind: 'rounds-returned', count: 10 });
  });

  it('version 4 saves get ids, names and squads from their templates', () => {
    const c = fresh() as unknown as Record<string, unknown>;
    const roster = (c['roster'] as Record<string, unknown>[]).map(
      ({ id: _id, name: _n, squadId: _s, ...rest }) => rest,
    );
    const old = { ...c, version: 4, roster, recruitedToday: undefined, recruitsMade: undefined };
    const back = migrateCampaign(content, old)!;
    expect(back.version).toBe(5);
    expect(back.recruitsMade).toBe(0);
    expect(back.roster[0]).toMatchObject({
      id: 'alfa-leader',
      name: 'Teresa Vidal',
      squadId: 'alfa',
    });
  });
});
