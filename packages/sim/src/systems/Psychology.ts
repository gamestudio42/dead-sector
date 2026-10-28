import type { SimulationRules } from '@dead-sector/content';
import type { GameState, StressBand, Survivor } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { dist, q } from '../spatial/vec';

export interface StressInputs {
  zombiesWithin6m: number;
  surrounded: boolean;
  isolated: boolean;
  inSafeArea: boolean;
  leaderLeadership: number | null;
  courage: number;
}

/** Continuous stress rate (per second) from the spec formula; impulses are applied separately. */
export function stressRatePerSecond(rules: SimulationRules['stress'], i: StressInputs): number {
  return (
    rules.perZombieWithin6m * Math.min(i.zombiesWithin6m, rules.maxZombiesCounted) +
    rules.surrounded * (i.surrounded ? 1 : 0) +
    rules.isolated * (i.isolated ? 1 : 0) +
    rules.safeArea * (i.inSafeArea ? 1 : 0) +
    rules.leaderNearby * (i.leaderLeadership !== null ? i.leaderLeadership / 100 : 0) +
    rules.courage * (i.courage / 100)
  );
}

export function bandFor(
  stress: number,
  panicked: boolean,
  rules: SimulationRules['stress'],
): StressBand {
  if (panicked) return stress >= rules.breakdown ? 'breakdown' : 'panic';
  if (stress < 25) return 'calm';
  if (stress < 50) return 'alert';
  return 'shaken';
}

/**
 * Hysteresis: enter panic at >= panicEnter; leave only when stress < panicExit
 * and at least panicMinSeconds have passed since entering.
 */
export function updatePanicState(
  state: GameState,
  s: Survivor,
  rules: SimulationRules['stress'],
): void {
  if (!s.panicked && s.stress >= rules.panicEnter) {
    s.panicked = true;
    s.panicSinceTick = state.tick;
    state.stats.panicEvents += 1;
    emit(state, 'SURVIVOR_PANICKED', {
      survivorId: s.id,
      stress: q(s.stress),
      behaviour: s.courage >= 40 && !s.isObjectiveCivilian ? 'flee' : 'freeze',
    });
  } else if (
    s.panicked &&
    s.stress < rules.panicExit &&
    state.tick - s.panicSinceTick >= rules.panicMinSeconds * 10
  ) {
    s.panicked = false;
    emit(state, 'SURVIVOR_RALLIED', { survivorId: s.id, stress: q(s.stress) });
  }
  s.band = bandFor(s.stress, s.panicked, rules);
}

function inputsFor(world: World, state: GameState, ctx: TickContext, s: Survivor): StressInputs {
  const r = world.rules.stress;
  let within6 = 0;
  const quadrants = new Set<number>();
  let close = 0;
  for (const id of s.seenZombieIds) {
    const z = ctx.zombiesById.get(id);
    if (!z || !z.alive) continue;
    const d = dist(z.position, s.position);
    if (d <= r.nearZombieRadius) within6 += 1;
    if (d <= r.surroundRadius) {
      close += 1;
      const ang = Math.atan2(z.position.y - s.position.y, z.position.x - s.position.x);
      quadrants.add(Math.floor(((ang + Math.PI) / (Math.PI / 2)) % 4));
    }
  }
  const allies = state.survivors.filter(
    (o) =>
      o !== s &&
      o.alive &&
      !o.extracted &&
      (o.squadId === s.squadId || s.isObjectiveCivilian) &&
      o.squadId !== null,
  );
  const isolated =
    allies.length > 0 && !allies.some((o) => dist(o.position, s.position) <= r.isolationRadius);
  const threatNear = state.contacts.some(
    (c) => c.visible && dist(c.position, s.position) <= r.safeRadius,
  );
  let leaderLeadership: number | null = null;
  for (const o of allies) {
    if (o.isLeader && dist(o.position, s.position) <= r.leaderRadius) {
      leaderLeadership = Math.max(leaderLeadership ?? 0, o.leadership);
    }
  }
  return {
    zombiesWithin6m: within6,
    surrounded: quadrants.size >= 3 || close >= 4,
    isolated,
    inSafeArea: !threatNear && within6 === 0,
    leaderLeadership,
    courage: s.courage,
  };
}

export function updatePsychology(world: World, state: GameState, ctx: TickContext): void {
  const r = world.rules.stress;
  for (const s of state.survivors) {
    if (!s.alive || s.extracted) continue;
    if (s.isObjectiveCivilian && !s.rescued) continue;
    const rate = stressRatePerSecond(r, inputsFor(world, state, ctx, s));
    let next = s.stress + rate * 0.1;
    for (const imp of s.pendingImpulses) next += imp.amount;
    s.pendingImpulses = [];
    s.stress = q(Math.max(0, Math.min(100, next)));
    updatePanicState(state, s, r);
  }
}
