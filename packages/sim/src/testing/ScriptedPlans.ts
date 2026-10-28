import type { GameCommandInput, GameState, ObjectiveId, OrderType, Vec2 } from '../model/types';
import type { GameSimulation } from '../engine/GameSimulation';
import { dist } from '../spatial/vec';

/**
 * Deterministic command scripts that play the mission like a (careful) human would.
 * Used by acceptance tests and the browser E2E to prove both routes are completable.
 */
export type PlanCondition =
  | { kind: 'start' }
  | { kind: 'orderSettled'; squadId: string }
  | { kind: 'objective'; id: ObjectiveId }
  | { kind: 'extractionReady' };

export interface PlanStep {
  label: string;
  when: PlanCondition[];
  commands: GameCommandInput[];
}

const order = (
  squadId: string,
  type: OrderType,
  targetPosition?: Vec2,
  targetEntityId?: string,
): GameCommandInput => {
  const payload: { type: OrderType; targetPosition?: Vec2; targetEntityId?: string } = { type };
  if (targetPosition) payload.targetPosition = targetPosition;
  if (targetEntityId) payload.targetEntityId = targetEntityId;
  return { type: 'issueOrder', squadId, payload };
};
const both = (type: OrderType, a: Vec2, b: Vec2): GameCommandInput[] => [
  order('alfa', type, a),
  order('bravo', type, b),
];
const settled = (...ids: string[]): PlanCondition[] =>
  ids.map((squadId) => ({ kind: 'orderSettled', squadId }) as PlanCondition);
const fire = (policy: 'weaponsFree' | 'returnFire' | 'holdFire'): GameCommandInput[] => [
  { type: 'setFirePolicy', squadId: 'alfa', payload: { policy } },
  { type: 'setFirePolicy', squadId: 'bravo', payload: { policy } },
];

/** Stealth: alley, quiet street crossings, locked back door forced by the mechanic. */
export const STEALTH_PLAN: PlanStep[] = [
  {
    label: 'alley entrance',
    when: [{ kind: 'start' }],
    commands: [...fire('holdFire'), ...both('sneak', { x: 21.5, y: 16.5 }, { x: 21.5, y: 22.5 })],
  },
  {
    label: 'alley exit',
    when: settled('alfa', 'bravo'),
    commands: both('sneak', { x: 21.5, y: 36.5 }, { x: 21.5, y: 39.5 }),
  },
  {
    label: 'cross west street',
    when: settled('alfa', 'bravo'),
    commands: both('sneak', { x: 23.5, y: 60.5 }, { x: 23.5, y: 64.5 }),
  },
  {
    label: 'service lane',
    when: settled('alfa', 'bravo'),
    commands: both('sneak', { x: 30.5, y: 75.5 }, { x: 36.5, y: 75.5 }),
  },
  {
    label: 'cross south avenue',
    when: settled('alfa', 'bravo'),
    commands: both('sneak', { x: 58.5, y: 79.5 }, { x: 64.5, y: 79.5 }),
  },
  {
    label: 'east alley',
    when: settled('alfa', 'bravo'),
    commands: both('sneak', { x: 83.5, y: 76.5 }, { x: 83.5, y: 72.5 }),
  },
  {
    label: 'pharmacy back yard',
    when: settled('alfa', 'bravo'),
    commands: both('sneak', { x: 79.5, y: 73.5 }, { x: 78.5, y: 68.5 }),
  },
  {
    label: 'force back door',
    when: settled('alfa', 'bravo'),
    commands: [order('bravo', 'interact', undefined, 'door-76-68')],
  },
  {
    label: 'rescue civilian',
    when: settled('bravo'),
    commands: [order('bravo', 'interact', undefined, 'civilian-marta')],
  },
  {
    label: 'medicine',
    when: [{ kind: 'objective', id: 'rescueCivilian' }],
    commands: [
      order('bravo', 'interact', undefined, 'cabinet'),
      order('alfa', 'sneak', { x: 78.5, y: 70.5 }),
    ],
  },
  {
    label: 'leave by back door',
    when: [{ kind: 'objective', id: 'collectMedicine' }],
    commands: both('sneak', { x: 83.5, y: 78.5 }, { x: 80.5, y: 79.5 }),
  },
  {
    label: 'to parking',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 38.5, y: 86.5 }, { x: 38.5, y: 89.5 }),
  },
  {
    label: 'beacon',
    when: settled('alfa', 'bravo'),
    commands: [
      order('alfa', 'interact', undefined, 'beacon'),
      order('bravo', 'move', { x: 20.5, y: 88.5 }),
    ],
  },
  {
    label: 'hold extraction',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: [order('alfa', 'move', { x: 18.5, y: 86.5 }), ...fire('weaponsFree')],
  },
  {
    label: 'hold',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'hold'), order('bravo', 'hold')],
  },
];

/** Combat: straight down the main avenue with weapons free, front door, then fighting retreat. */
export const COMBAT_PLAN: PlanStep[] = [
  {
    label: 'north strip',
    when: [{ kind: 'start' }],
    commands: [...fire('weaponsFree'), ...both('move', { x: 40.5, y: 2.5 }, { x: 36.5, y: 2.5 })],
  },
  {
    label: 'avenue north',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 47.5, y: 20.5 }, { x: 47.5, y: 14.5 }),
  },
  {
    label: 'crossroads',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 47.5, y: 40.5 }, { x: 47.5, y: 36.5 }),
  },
  {
    label: 'pharmacy gate',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 54.5, y: 65.5 }, { x: 54.5, y: 62.5 }),
  },
  {
    label: 'front yard',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 59.5, y: 66.5 }, { x: 59.5, y: 64.5 }),
  },
  {
    label: 'medicine',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'interact', undefined, 'cabinet'), order('bravo', 'hold')],
  },
  {
    label: 'storeroom door',
    when: [{ kind: 'objective', id: 'collectMedicine' }],
    commands: [order('alfa', 'interact', undefined, 'civilian-marta')],
  },
  {
    label: 'out front',
    when: [{ kind: 'objective', id: 'rescueCivilian' }],
    commands: both('move', { x: 59.5, y: 67.5 }, { x: 59.5, y: 64.5 }),
  },
  {
    label: 'avenue south',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 50.5, y: 84.5 }, { x: 50.5, y: 80.5 }),
  },
  {
    label: 'parking',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 24.5, y: 86.5 }, { x: 24.5, y: 89.5 }),
  },
  {
    label: 'beacon',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'interact', undefined, 'beacon')],
  },
  {
    label: 'hold extraction',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: [order('alfa', 'hold'), order('bravo', 'move', { x: 18.5, y: 88.5 })],
  },
  { label: 'hold', when: settled('bravo'), commands: [order('bravo', 'hold')] },
];

function holds(state: GameState, c: PlanCondition, stepStartTick: number): boolean {
  switch (c.kind) {
    case 'start':
      return true;
    case 'orderSettled': {
      const sq = state.squads.find((s) => s.id === c.squadId);
      if (!sq) return true;
      const alive = sq.memberIds.some((id) => state.survivors.find((s) => s.id === id)?.alive);
      if (!alive) return true;
      return (
        !sq.order ||
        (sq.order.status !== 'executing' &&
          sq.order.status !== 'planning' &&
          sq.order.status !== 'queued') ||
        state.tick - stepStartTick > 900
      );
    }
    case 'objective':
      return state.objectives.some((o) => o.id === c.id && o.status === 'completed');
    case 'extractionReady':
      return state.mission.extractionReady;
  }
}

export interface PlanRunner {
  stepIndex: number;
  stepStartTick: number;
  log: string[];
}

export function createPlanRunner(): PlanRunner {
  return { stepIndex: 0, stepStartTick: 0, log: [] };
}

/** Issues the next plan step when its conditions hold; re-issues a blocked/interrupted step once per 3 s. */
export function tickPlan(sim: GameSimulation, plan: PlanStep[], runner: PlanRunner): void {
  const state = sim.state;
  if (runner.stepIndex > 0) {
    const prev = plan[runner.stepIndex - 1] as PlanStep;
    const retry = prev.commands.some((c) => {
      if (c.type !== 'issueOrder') return false;
      const sq = state.squads.find((s) => s.id === c.squadId);
      return sq?.order && (sq.order.status === 'blocked' || sq.order.status === 'interrupted');
    });
    if (retry && state.tick - runner.stepStartTick >= 30) {
      runner.log.push(`${state.tick}: retry ${prev.label}`);
      for (const c of prev.commands) sim.enqueue(c);
      runner.stepStartTick = state.tick;
      return;
    }
  }
  const step = plan[runner.stepIndex];
  if (!step || state.tick - runner.stepStartTick < 2) return;
  if (!step.when.every((c) => holds(state, c, runner.stepStartTick))) return;
  runner.log.push(`${state.tick}: ${step.label}`);
  for (const c of step.commands) sim.enqueue(c);
  runner.stepIndex += 1;
  runner.stepStartTick = state.tick;
}

/** Runs a plan to the end of the mission (or maxTicks). */
export function runPlan(sim: GameSimulation, plan: PlanStep[], maxTicks = 9000): PlanRunner {
  const runner = createPlanRunner();
  while (!sim.ended && sim.tick < maxTicks) {
    tickPlan(sim, plan, runner);
    sim.step();
  }
  return runner;
}

export const distanceBetween = dist;
