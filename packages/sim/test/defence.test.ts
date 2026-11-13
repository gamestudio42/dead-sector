import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  deserializeState,
  GameSimulation,
  hashState,
  MISSION_PLANS,
  objectiveOrder,
  runPlan,
  serializeState,
  type SimEvent,
} from '../src';

const ID = 'cerco-dom-bosco';

function collect(sim: GameSimulation, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks && !sim.ended; i++) out.push(...sim.step());
  return out;
}

describe('defence mission', () => {
  const content = loadContent();
  const mission = content.missions[ID]!;
  const def = mission.objectives.defence!;

  it('holds its position before the radio, and only defence missions do', () => {
    expect(objectiveOrder(mission)).toEqual([
      'enterPerimeter',
      'collectMedicine',
      'rescueCivilian',
      'holdPosition',
      'activateExtraction',
      'holdExtraction',
    ]);
    expect(objectiveOrder(content.missions['a-ultima-farmacia']!)).not.toContain('holdPosition');
    const sim = GameSimulation.create(ID);
    expect(sim.state.objectives.map((o) => o.id)).toEqual(objectiveOrder(mission));
  });

  it('announces the siege, then sends every wave on its timetable', () => {
    const sim = GameSimulation.create(ID);
    // nobody moves: the squads stay at the gate, and the teacher, alone, falls before the last wave
    const events = collect(sim, Math.round((def.startsAtSeconds + 200) * 10));
    const incoming = events.find((e) => e.type === 'SIEGE_INCOMING')!;
    expect(incoming.tick).toBe(Math.round((def.startsAtSeconds - def.warningSeconds) * 10));
    const waves = events.filter((e) => e.type === 'SIEGE_WAVE');
    expect(waves.length).toBeGreaterThanOrEqual(3);
    waves.forEach((ev, i) => {
      const w = def.waves[i]!;
      const due = Math.round((def.startsAtSeconds + w.atSeconds) * 10);
      expect(ev.tick).toBeGreaterThanOrEqual(due);
      expect(ev.tick).toBeLessThan(due + 100);
      expect(ev.payload['size']).toBe(w.walkers + w.runners + w.heavies);
    });
  });

  it('only counts the hold while someone is inside, and keeps the radio shut until it is done', () => {
    const sim = GameSimulation.create(ID);
    collect(sim, Math.round((def.startsAtSeconds + 20) * 10));
    expect(sim.state.mission.defenceHoldTicks).toBe(0);
    expect(sim.state.mission.defenceHolding).toBe(false);
    // even with the supplies in hand, the convoy cannot be called before the siege is over
    sim.state.mission.medicineCollected = true;
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'beacon' },
    });
    const ev = collect(sim, 5);
    const blocked = ev.find((e) => e.type === 'ORDER_BLOCKED');
    expect(blocked?.payload['reason']).toBe('requiresDefence');
    expect(sim.state.mission.extractionActive).toBe(false);
  });

  it('the supply cabinet hands out plank kits and ammunition', () => {
    const sim = GameSimulation.create(ID);
    const kits = sim.state.squads.map((q) => q.barricadeKits);
    const rounds = sim.state.survivors
      .filter((s) => s.squadId)
      .map((s) => s.weapon?.reserveRounds ?? 0);
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: 'cabinet' },
    });
    for (let i = 0; i < 1500 && !sim.state.mission.medicineCollected; i++) sim.step();
    expect(sim.state.mission.medicineCollected).toBe(true);
    expect(sim.state.squads.map((q) => q.barricadeKits)).toEqual(kits.map((k) => k + 2));
    const after = sim.state.survivors
      .filter((s) => s.squadId)
      .map((s) => s.weapon?.reserveRounds ?? 0);
    // armed members gained the cabinet's rounds (minus anything fired on the way)
    expect(after.reduce((a, b) => a + b, 0)).toBeGreaterThan(rounds.reduce((a, b) => a + b, 0));
  });

  it('the scripted defence wins on the canonical seed and on others', () => {
    for (const seed of [mission.canonicalSeed, 1, 2, 3]) {
      const sim = GameSimulation.create(ID, seed);
      runPlan(sim, MISSION_PLANS[ID]!);
      expect(sim.state.mission.status, `seed ${seed}`).toBe('success');
      expect(sim.state.mission.defenceDone).toBe(true);
      expect(sim.state.objectives.every((o) => o.status === 'completed')).toBe(true);
    }
  });

  it('a save taken mid-siege resumes identically', () => {
    const a = GameSimulation.create(ID, 5);
    collect(a, Math.round((def.startsAtSeconds + 40) * 10));
    const b = new GameSimulation(content, deserializeState(serializeState(a.state)));
    collect(a, 600);
    collect(b, 600);
    expect(hashState(b.state)).toBe(hashState(a.state));
  });

  it('migrates a v3 save to v4 without a defence', () => {
    const sim = GameSimulation.create('a-ultima-farmacia', 3);
    const env = JSON.parse(serializeState(sim.state)) as { state: Record<string, unknown> };
    const raw = env.state;
    raw['schemaVersion'] = 3;
    const m = raw['mission'] as Record<string, unknown>;
    for (const k of [
      'siegeStartTick',
      'siegeAnnounced',
      'wavesSpawned',
      'defenceHoldTicks',
      'defenceRequiredTicks',
      'defenceHolding',
      'defenceDone',
    ])
      delete m[k];
    const back = deserializeState(JSON.stringify(env));
    expect(back.mission.siegeStartTick).toBe(-1);
    expect(back.mission.defenceDone).toBe(false);
  });
});
