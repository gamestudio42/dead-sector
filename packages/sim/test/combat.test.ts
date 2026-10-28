import { describe, expect, it } from 'vitest';
import { addZombie, field, keepOnly, setCell, survivor, testSim } from './helpers';

function duel() {
  const sim = testSim({ rows: field(30, 15), alfaSpawn: { x: 5.5, y: 7.5 } });
  keepOnly(sim, ['alfa-leader']);
  sim.state.squads[0]!.firePolicy = 'weaponsFree';
  const s = survivor(sim, 'alfa-leader');
  s.position = { x: 5.5, y: 7.5 };
  s.facing = 0;
  const z = addZombie(sim, 13.5, 7.5, { facing: Math.PI / 2 });
  return { sim, s, z };
}

describe('combat', () => {
  it('no ammunition means no shot/no false gunshot noise', () => {
    const { sim, s } = duel();
    s.weapon.magazineRounds = 0;
    s.weapon.reserveRounds = 0;
    const events = sim.run(60);
    expect(events.filter((e) => e.type === 'SHOT_FIRED')).toHaveLength(0);
    expect(
      events.filter((e) => e.type === 'NOISE_EMITTED' && e.payload['category'] === 'shot'),
    ).toHaveLength(0);
    expect(events.some((e) => e.type === 'OUT_OF_AMMO')).toBe(true);
    expect(s.weapon.magazineRounds).toBe(0);
  });

  it('each shot consumes exactly one round and makes noise, hit or miss', () => {
    const { sim, s } = duel();
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const before = s.weapon.magazineRounds;
      const events = sim.step();
      const shots = events.filter((e) => e.type === 'SHOT_FIRED');
      const noises = events.filter(
        (e) => e.type === 'NOISE_EMITTED' && e.payload['category'] === 'shot',
      );
      expect(shots.length).toBeLessThanOrEqual(1); // cooldown prevents multiple shots per tick
      expect(noises.length).toBe(shots.length);
      if (shots.length === 1 && s.weapon.reloadRemaining === 0 && s.weapon.magazineRounds > 0) {
        expect(s.weapon.magazineRounds).toBe(before - 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sim.state.stats.ammoUsed).toBe(sim.state.stats.shotsFired);
  });

  it('a wall blocks shooting', () => {
    const rows = field(30, 15);
    for (let y = 1; y <= 13; y++) setCell(rows, 9, y, '#');
    const sim = testSim({ rows, alfaSpawn: { x: 5.5, y: 7.5 } });
    keepOnly(sim, ['alfa-leader']);
    sim.state.squads[0]!.firePolicy = 'weaponsFree';
    const s = survivor(sim, 'alfa-leader');
    s.position = { x: 5.5, y: 7.5 };
    s.facing = 0;
    addZombie(sim, 11.5, 7.5, { facing: Math.PI / 2 });
    const events = sim.run(50);
    expect(events.filter((e) => e.type === 'SHOT_FIRED')).toHaveLength(0);
  });

  it('dead entity cannot attack or be killed repeatedly', () => {
    const { sim, z } = duel();
    let kills = 0;
    let attacksAfterDeath = 0;
    let deathTick = -1;
    for (let i = 0; i < 300; i++) {
      for (const e of sim.step()) {
        if (e.type === 'ACTOR_KILLED' && e.payload['actorId'] === z.id) {
          kills++;
          deathTick = e.tick;
        }
        const after = deathTick >= 0 && e.tick > deathTick;
        if (after && e.type === 'ACTOR_INJURED' && e.payload['sourceId'] === z.id)
          attacksAfterDeath++;
        if (
          after &&
          (e.type === 'SHOT_FIRED' || e.type === 'MELEE_ATTACK') &&
          e.payload['targetId'] === z.id
        )
          attacksAfterDeath++;
      }
    }
    expect(z.alive).toBe(false);
    expect(kills).toBe(1);
    expect(attacksAfterDeath).toBe(0);

    // survivor side: a dying survivor is reported once and stops acting
    const d = duel();
    d.s.health = 5;
    d.s.weapon.magazineRounds = 0;
    d.s.weapon.reserveRounds = 0;
    d.z.position = { x: 6.2, y: 7.5 };
    let deaths = 0;
    for (let i = 0; i < 300; i++)
      for (const e of d.sim.step())
        if (e.type === 'ACTOR_KILLED' && e.payload['actorId'] === d.s.id) deaths++;
    expect(deaths).toBe(1);
    expect(d.s.alive).toBe(false);
    expect(d.sim.ended).toBe(true);
  });

  it('hold fire never shoots by initiative', () => {
    const { sim } = duel();
    sim.state.squads[0]!.firePolicy = 'holdFire';
    const events = sim.run(40);
    expect(events.filter((e) => e.type === 'SHOT_FIRED')).toHaveLength(0);
  });
});
