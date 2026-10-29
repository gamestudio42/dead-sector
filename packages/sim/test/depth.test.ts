import { describe, expect, it } from 'vitest';
import { builtInRawContent, loadContent, validateContent } from '@dead-sector/content';
import {
  createMissionState,
  enterCost,
  deserializeState,
  findPath,
  GameSimulation,
  hasLineOfSight,
  serializeState,
  type SimEvent,
} from '../src';
import { addZombie, field, keepOnly, setCell, survivor, testSim } from './helpers';

/** A room: wall column at x=10 with a window (or door) at y=5. */
function walled(c: string) {
  const rows = field(24, 11);
  for (let y = 1; y <= 9; y++) setCell(rows, 10, y, '#');
  setCell(rows, 10, 5, c);
  return rows;
}

const collect = (sim: GameSimulation, ticks: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step());
  return out;
};

describe('windows and barricades', () => {
  it('a window lets sight through but blocks survivors and calm infected', () => {
    const sim = testSim({ rows: walled('W'), alfaSpawn: { x: 4.5, y: 5.5 } });
    const world = sim.world;
    expect(hasLineOfSight(world, sim.state, { x: 4.5, y: 5.5 }, { x: 16.5, y: 5.5 })).toBe(true);
    const route = { agent: 'survivor' as const };
    const p = findPath(world, sim.state, { x: 4.5, y: 5.5 }, { x: 16.5, y: 5.5 }, route);
    expect(p).toBeNull();
    const calm = findPath(
      world,
      sim.state,
      { x: 4.5, y: 5.5 },
      { x: 16.5, y: 5.5 },
      { agent: 'zombieCalm' },
    );
    expect(calm).toBeNull();
    const motivated = findPath(
      world,
      sim.state,
      { x: 16.5, y: 5.5 },
      { x: 4.5, y: 5.5 },
      { agent: 'zombie' },
    );
    expect(motivated).not.toBeNull();
  });

  it('an infected that heard something breaks the glass, loudly, and walks through', () => {
    const sim = testSim({ rows: walled('W'), alfaSpawn: { x: 3.5, y: 2.5 } });
    keepOnly(sim, ['alfa-leader']);
    const z = addZombie(sim, 16.5, 5.5, { state: 'investigate' });
    z.ai.goal = { x: 4.5, y: 5.5 };
    z.ai.lastKnownPos = { x: 4.5, y: 5.5 };
    const events = collect(sim, 400);
    const broke = events.find((e) => e.type === 'DOOR_CHANGED' && e.payload['window']);
    expect(broke).toBeDefined();
    expect(
      events.some((e) => e.type === 'NOISE_EMITTED' && e.payload['category'] === 'glass'),
    ).toBe(true);
    expect(z.position.x).toBeLessThan(10);
  });

  it('barricading consumes a kit, makes noise while hammering and soaks damage first', () => {
    const sim = testSim({ rows: walled('D'), alfaSpawn: { x: 6.5, y: 5.5 } });
    keepOnly(sim, ['alfa-leader', 'alfa-marksman']);
    const door = sim.state.doors.find((d) => d.kind === 'door')!;
    const kits = sim.state.squads[0]!.barricadeKits;
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'barricade', targetEntityId: door.id },
    });
    const events = collect(sim, 200);
    expect(events.some((e) => e.type === 'BARRICADE_BUILT')).toBe(true);
    const hammering = events.filter(
      (e) => e.type === 'NOISE_EMITTED' && e.payload['category'] === 'door',
    );
    expect(hammering.length).toBeGreaterThanOrEqual(3);
    expect(sim.state.squads[0]!.barricadeKits).toBe(kits - 1);
    expect(door.barricade).toBe(sim.world.rules.barriers.barricadeHp);
    // survivors cannot path through their own barricade
    expect(
      findPath(
        sim.world,
        sim.state,
        { x: 6.5, y: 5.5 },
        { x: 16.5, y: 5.5 },
        { agent: 'survivor' },
      ),
    ).toBeNull();
    // an infected hammering on it wears the planks down before the door itself
    const hp = door.hp;
    const z = addZombie(sim, 13.5, 5.5, { state: 'investigate' });
    z.ai.goal = { x: 6.5, y: 5.5 };
    collect(sim, 60);
    expect(door.barricade).toBeLessThan(sim.world.rules.barriers.barricadeHp);
    expect(door.hp).toBe(hp);
  });

  it('no kits left blocks the order with a reason', () => {
    const sim = testSim({ rows: walled('D'), alfaSpawn: { x: 6.5, y: 5.5 } });
    sim.state.squads[0]!.barricadeKits = 0;
    const door = sim.state.doors[0]!;
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'barricade', targetEntityId: door.id },
    });
    const events = sim.step();
    expect(events.find((e) => e.type === 'ORDER_BLOCKED')?.payload['reason']).toBe('noKits');
  });

  it('interacting with a barricaded door removes the planks', () => {
    const sim = testSim({ rows: walled('D'), alfaSpawn: { x: 6.5, y: 5.5 } });
    const door = sim.state.doors[0]!;
    door.barricade = 100;
    sim.enqueue({
      type: 'issueOrder',
      squadId: 'alfa',
      payload: { type: 'interact', targetEntityId: door.id },
    });
    collect(sim, 120);
    expect(door.barricade).toBe(0);
  });
});

describe('infection turns survivors', () => {
  it('an infected survivor turns into a walker exactly once', () => {
    const sim = testSim({ rows: field(30, 12), alfaSpawn: { x: 4.5, y: 5.5 } });
    keepOnly(sim, ['alfa-leader', 'alfa-marksman']);
    const s = survivor(sim, 'alfa-marksman');
    s.infection = 'critical';
    s.infectionTicks = 0;
    const turnTicks = sim.world.rules.infection.criticalToTurnSeconds * 10;
    const events = collect(sim, turnTicks + 5);
    const turned = events.filter((e) => e.type === 'SURVIVOR_TURNED');
    expect(turned).toHaveLength(1);
    expect(s.alive).toBe(false);
    const killed = events.filter((e) => e.type === 'ACTOR_KILLED' && e.payload['actorId'] === s.id);
    expect(killed).toHaveLength(1);
    expect(killed[0]!.payload['cause']).toBe('turned');
    const z = sim.state.zombies.find((zz) => zz.id === turned[0]!.payload['zombieId']);
    expect(z?.alive).toBe(true);
    // the infected rises exactly where the survivor fell
    expect(turned[0]!.payload['x']).toBe(s.position.x);
    expect(turned[0]!.payload['y']).toBe(s.position.y);
  });

  it('a medic nearby slows the infection down', () => {
    const progress = (withMedic: boolean) => {
      const sim = testSim({ rows: field(30, 12), alfaSpawn: { x: 4.5, y: 5.5 } });
      keepOnly(sim, withMedic ? ['alfa-leader', 'alfa-medic'] : ['alfa-leader']);
      const s = survivor(sim, 'alfa-leader');
      s.infection = 'exposed';
      collect(sim, 300);
      return s.infectionTicks;
    };
    expect(progress(true)).toBeLessThan(progress(false));
  });
});

describe('heavy and screamer infected', () => {
  it('a screamer shrieks once per cooldown when it spots someone, and far infected hear it', () => {
    const sim = testSim({ rows: field(70, 12), alfaSpawn: { x: 4.5, y: 5.5 } });
    keepOnly(sim, ['alfa-leader']);
    const screamer = addZombie(sim, 10.5, 5.5, { typeId: 'screamer', facing: Math.PI });
    const far = addZombie(sim, 55.5, 5.5, { state: 'idle' });
    const events = collect(sim, 40);
    const screams = events.filter((e) => e.type === 'ZOMBIE_SCREAMED');
    expect(screams).toHaveLength(1);
    expect(screams[0]!.payload['zombieId']).toBe(screamer.id);
    expect(far.ai.state).toBe('investigate');
  });

  it('a heavy shrugs off most of the stagger and smashes doors faster', () => {
    const c = loadContent();
    const heavy = c.zombieTypes['heavy']!;
    const walker = c.zombieTypes['walker']!;
    expect(heavy.staggerFactor).toBeLessThan(walker.staggerFactor);
    expect(heavy.doorDamage).toBeGreaterThan(walker.doorDamage * 2);
    expect(heavy.maxHealth).toBeGreaterThan(walker.maxHealth * 2);
  });
});

describe('alarm and hordes', () => {
  it('sustained loud noise raises the alarm level, which then decays with hysteresis', () => {
    const sim = GameSimulation.create('a-ultima-farmacia', 1337);
    const m = sim.state.mission;
    m.alarm = 82;
    sim.step();
    expect(m.alarmLevel).toBe(3);
    // just under the threshold does not drop the level yet
    m.alarm = 78;
    sim.step();
    expect(m.alarmLevel).toBe(3);
    m.alarm = 70;
    sim.step();
    expect(m.alarmLevel).toBe(2);
    for (let i = 0; i < 1200; i++) sim.step();
    expect(m.alarm).toBeLessThan(5);
  });

  it('a timed horde is announced ahead, spawns away from the squads and patrols its route', () => {
    const raw = JSON.parse(JSON.stringify(builtInRawContent));
    raw.missions[0].hordes.firstAtSeconds = 2;
    const content = validateContent(raw);
    const sim = new GameSimulation(content, createMissionState(content, 'a-ultima-farmacia', 1337));
    const events = collect(sim, 320);
    const incoming = events.find((e) => e.type === 'HORDE_INCOMING');
    const spawned = events.find((e) => e.type === 'HORDE_SPAWNED');
    expect(incoming).toBeDefined();
    expect(spawned).toBeDefined();
    expect(spawned!.tick - incoming!.tick).toBeGreaterThanOrEqual(
      content.missions['a-ultima-farmacia']!.hordes!.warningSeconds * 10,
    );
    const horde = sim.state.hordes[0]!;
    const members = sim.state.zombies.filter((z) => z.hordeId === horde.id);
    expect(members).toHaveLength(content.missions['a-ultima-farmacia']!.hordes!.size);
    expect(members.filter((z) => z.typeId === 'heavy')).toHaveLength(1);
    for (const z of members)
      for (const s of sim.state.survivors.filter((x) => x.alive))
        expect(
          Math.hypot(z.position.x - s.position.x, z.position.y - s.position.y),
        ).toBeGreaterThan(14);
    collect(sim, 1500);
    expect(horde.index).toBeGreaterThan(0);
  });

  it('hordes, screams and turning stay deterministic and survive save/load', () => {
    const raw = JSON.parse(JSON.stringify(builtInRawContent));
    raw.missions[0].hordes.firstAtSeconds = 2;
    const content = validateContent(raw);
    const a = new GameSimulation(content, createMissionState(content, 'a-ultima-farmacia', 7));
    collect(a, 400);
    const b = new GameSimulation(content, deserializeState(serializeState(a.state)));
    collect(a, 600);
    collect(b, 600);
    expect(serializeState(b.state)).toBe(serializeState(a.state));
  });

  it('v2 saves migrate to barrier/horde/alarm fields', () => {
    const a = GameSimulation.create('a-ultima-farmacia', 1337);
    const raw = JSON.parse(serializeState(a.state));
    raw.state.schemaVersion = 2;
    raw.state.doors = raw.state.doors
      .filter((d: { kind: string }) => d.kind === 'door')
      .map((d: Record<string, unknown>) => {
        delete d['kind'];
        delete d['barricade'];
        return d;
      });
    delete raw.state.hordes;
    delete raw.state.mission.alarm;
    for (const sq of raw.state.squads) delete sq.barricadeKits;
    const s = deserializeState(JSON.stringify(raw));
    expect(s.hordes).toEqual([]);
    expect(s.mission.alarm).toBe(0);
    expect(s.doors.every((d) => d.kind === 'door' && d.barricade === 0)).toBe(true);
    // windows without entities stay solid in old saves
    const sim = new GameSimulation(loadContent(), s);
    const w = sim.world.tiles.findIndex((t) => t === 'window');
    const x = w % sim.world.width;
    const y = Math.floor(w / sim.world.width);
    expect(enterCost(sim.world, sim.state, x, y, 'zombie')).toBe(Infinity);
  });
});
