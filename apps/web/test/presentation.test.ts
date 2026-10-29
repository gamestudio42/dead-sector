import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  COMBAT_PLAN,
  createPlanRunner,
  GameSimulation,
  hashState,
  tickPlan,
  type SimEvent,
} from '@dead-sector/sim';
import { cuesForEvents, threatLevel } from '../src/audio/cues';
import { barksForEvents } from '../src/presentation/barks';

const MISSION = 'a-ultima-farmacia';

/** Plays the scripted combat route and records each tick's events with the state after it. */
function recordCombat(ticks: number) {
  const sim = GameSimulation.create(MISSION, 1337, loadContent());
  const runner = createPlanRunner();
  const frames: { events: SimEvent[]; hash: string }[] = [];
  for (let i = 0; i < ticks && !sim.ended; i++) {
    tickPlan(sim, COMBAT_PLAN, runner);
    const events = sim.step();
    frames.push({ events, hash: hashState(sim.state) });
    // presentation consumers run between ticks exactly like the client does
    cuesForEvents(events, sim.state, sim.world);
    barksForEvents(events, sim.state);
    threatLevel(sim.state);
    expect(hashState(sim.state)).toBe(frames[frames.length - 1]?.hash);
  }
  return { sim, frames };
}

describe('presentation layer (audio cues, barks)', () => {
  const { sim, frames } = recordCombat(900);
  const all = frames.flatMap((f) => f.events);

  it('presentation never mutates simulation state', () => {
    // asserted per tick inside recordCombat; a full replay must also reach the same hash
    const again = recordCombat(900);
    expect(again.frames.at(-1)?.hash).toBe(frames.at(-1)?.hash);
    expect(all.length).toBeGreaterThan(0);
  });

  it('every gunshot sound comes from exactly one SHOT_FIRED event, with its weapon', () => {
    const shots = all.filter((e) => e.type === 'SHOT_FIRED');
    expect(shots.length).toBeGreaterThan(10);
    const cues = cuesForEvents(shots, sim.state, sim.world);
    expect(cues.filter((c) => c.kind === 'gunshot')).toHaveLength(shots.length);
    for (const [i, c] of cues.entries()) expect(c.variant).toBe(shots[i]?.payload['weaponId']);
  });

  it('no event means no sound: an empty tick yields no cues', () => {
    expect(cuesForEvents([], sim.state, sim.world)).toEqual([]);
  });

  it('sounds from outside the field of view are muffled', () => {
    const world = sim.world;
    const hidden = sim.state.fog.cells.findIndex((v) => v !== 2);
    const visible = sim.state.fog.cells.findIndex((v) => v === 2);
    const at = (i: number): SimEvent => ({
      id: `t-${i}`,
      tick: sim.state.tick,
      type: 'SHOT_FIRED',
      payload: {
        fromX: (i % world.width) + 0.5,
        fromY: Math.floor(i / world.width) + 0.5,
        weaponId: 'pistol',
      },
    });
    expect(cuesForEvents([at(hidden)], sim.state, world)[0]?.muffled).toBe(true);
    expect(cuesForEvents([at(visible)], sim.state, world)[0]?.muffled).toBe(false);
  });

  it('threat level stays within 0..1', () => {
    const t = threatLevel(sim.state);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
  });

  it('barks are deterministic and spoken by living survivors', () => {
    let spoken = 0;
    for (const f of frames) {
      const a = barksForEvents(f.events, sim.state);
      const b = barksForEvents(f.events, sim.state);
      expect(b).toEqual(a);
      spoken += a.length;
    }
    expect(spoken).toBeGreaterThan(0);
    const last = barksForEvents(all, sim.state);
    for (const bark of last) {
      const s = sim.state.survivors.find((m) => m.id === bark.survivorId);
      expect(s?.alive).toBe(true);
      expect(bark.text.length).toBeGreaterThan(0);
    }
  });

  it('out-of-ammo lines are spoken by the survivor who ran dry', () => {
    const ev: SimEvent = {
      id: 'evt-x',
      tick: 0,
      type: 'OUT_OF_AMMO',
      payload: { survivorId: sim.state.survivors.find((s) => s.alive && s.squadId)?.id },
    };
    const [bark] = barksForEvents([ev], sim.state);
    expect(bark?.survivorId).toBe(ev.payload['survivorId']);
    expect(bark?.priority).toBe(3);
  });
});
