import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  applyOperationResult,
  carryOver,
  GameSimulation,
  migrate,
  createPlanRunner,
  MISSION_PLANS,
  newCampaign,
  objectiveOrder,
  OPERATION_VARIANTS,
  operationVariant,
  tickPlan,
  type GameState,
} from '../src';

const content = loadContent();
const MISSIONS = ['comboio-parado', 'feira-fantasma'] as const;

const played = new Map<string, { state: GameState; searched: Record<string, unknown>[] }>();
function play(id: string): { state: GameState; searched: Record<string, unknown>[] } {
  const hit = played.get(id);
  if (hit) return hit;
  const sim = GameSimulation.create(id, undefined, content);
  const plan = MISSION_PLANS[id]!;
  const runner = createPlanRunner();
  const searched: Record<string, unknown>[] = [];
  while (!sim.ended && sim.tick < 9000) {
    tickPlan(sim, plan, runner);
    sim.step();
    for (const e of sim.state.events)
      if (e.type === 'CACHE_SEARCHED') searched.push(e.payload as Record<string, unknown>);
  }
  const out = { state: sim.state, searched };
  played.set(id, out);
  return out;
}

describe('scavenging objective', () => {
  it('searches the caches before the radio; other missions keep their objectives', () => {
    const order = objectiveOrder(content.missions['comboio-parado']!);
    expect(order.indexOf('scavengeSupplies')).toBe(order.indexOf('activateExtraction') - 1);
    expect(objectiveOrder(content.missions['a-ultima-farmacia']!)).not.toContain(
      'scavengeSupplies',
    );
  });

  it('the radio is blocked until enough caches are searched', () => {
    const sim = GameSimulation.create('comboio-parado', undefined, content);
    sim.state.mission.medicineCollected = true;
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'beacon' },
    });
    for (let i = 0; i < 5; i++) sim.step();
    const blocked = sim.state.eventLog.find((e) => e.type === 'ORDER_BLOCKED');
    expect(blocked?.payload).toMatchObject({ reason: 'requiresScavenge' });
  });

  for (const id of MISSIONS)
    it(`${id}: the scripted route searches, is heard, and extracts`, () => {
      const { state, searched } = play(id);
      const sc = content.missions[id]!.objectives.scavenge!;
      expect(state.mission.status).toBe('success');
      expect(state.mission.cachesSearched.length).toBeGreaterThanOrEqual(sc.required);
      expect(searched).toHaveLength(state.mission.cachesSearched.length);
      expect(searched.at(-1)).toMatchObject({ required: sc.required });
      const done = state.objectives.find((o) => o.id === 'scavengeSupplies')!;
      expect(done.status).toBe('completed');
      // the radio came after the search
      const radio = state.objectives.find((o) => o.id === 'activateExtraction')!;
      expect(radio.completedAtTick!).toBeGreaterThan(done.completedAtTick!);
    });

  it('a cache cannot be searched twice', () => {
    const { state } = play('comboio-parado');
    expect(new Set(state.mission.cachesSearched).size).toBe(state.mission.cachesSearched.length);
  });
});

describe('scavenging in the campaign', () => {
  it('everything searched comes home on a successful extraction', () => {
    const c = newCampaign(content, 'ferrugem', 3);
    const { state } = play('comboio-parado');
    const sc = content.missions['comboio-parado']!.objectives.scavenge!;
    const loot = sc.caches
      .filter((k) => state.mission.cachesSearched.includes(k.id))
      .reduce((a, k) => a + k.loot.food, 0);
    const reward = content.campaigns['ferrugem']!.sectors.find((s) => s.id === 'avenida')!.reward;
    const { campaign: next, report } = applyOperationResult(content, c, 'avenida', state);
    expect(next.stock.food).toBe(c.stock.food + reward.food + loot);
    expect(report.lines).toContainEqual(
      expect.objectContaining({
        kind: 'scavenged',
        caches: state.mission.cachesSearched.length,
        food: loot,
      }),
    );
  });

  it('a failed run brings nothing back', () => {
    const c = newCampaign(content, 'ferrugem', 3);
    const lost = JSON.parse(JSON.stringify(play('comboio-parado').state)) as GameState;
    lost.mission.status = 'failed';
    const next = applyOperationResult(content, c, 'avenida', lost).campaign;
    expect(next.stock.food).toBe(c.stock.food);
    expect(next.lastReport.some((l) => l.kind === 'scavenged')).toBe(false);
  });

  it('the sector state picks the variant: more infected when infested, fewer when secured', () => {
    const c = newCampaign(content, 'ferrugem', 3);
    expect(operationVariant(content, c, 'avenida')).toBe('overrun'); // 70: infested
    expect(operationVariant(content, c, 'ferrugem')).toBe('standard');
    expect(operationVariant(content, c, 'abrigo')).toBe('standard');
    c.sectors['ferrugem']!.infestation = 10;
    expect(operationVariant(content, c, 'ferrugem')).toBe('quiet');

    const count = (v: keyof typeof OPERATION_VARIANTS) =>
      GameSimulation.create(
        'comboio-parado',
        undefined,
        content,
        carryOver(c),
        1,
        OPERATION_VARIANTS[v],
      ).state;
    const quiet = count('quiet');
    const standard = count('standard');
    const overrun = count('overrun');
    expect(quiet.zombies.length).toBeLessThan(standard.zombies.length);
    expect(overrun.zombies.length).toBeGreaterThan(standard.zombies.length);
    expect(overrun.mission.nextHordeTick).toBeLessThan(standard.mission.nextHordeTick);
    expect(quiet.mission.nextHordeTick).toBeGreaterThan(standard.mission.nextHordeTick);
  });
});

describe('save schema v5', () => {
  it('older mission saves load with no caches searched', () => {
    const sim = GameSimulation.create('a-ultima-farmacia', undefined, content);
    const raw = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
    delete (raw['mission'] as Record<string, unknown>)['cachesSearched'];
    raw['schemaVersion'] = 4;
    const back = migrate(raw);
    expect(back.schemaVersion).toBe(5);
    expect(back.mission.cachesSearched).toEqual([]);
  });
});
