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
  | { kind: 'extractionReady' }
  | { kind: 'defenceDone' };

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

/** "Sinal Fraco": rescue the switchman south of the tracks, cross on the service road, batteries, north dock. */
export const SIGNAL_PLAN: PlanStep[] = [
  {
    label: 'leave the lot',
    when: [{ kind: 'start' }],
    commands: [...fire('weaponsFree'), ...both('move', { x: 22.5, y: 59.5 }, { x: 18.5, y: 60.5 })],
  },
  {
    label: 'signal cabin',
    when: settled('alfa', 'bravo'),
    commands: [
      order('bravo', 'interact', undefined, 'civilian-joaquim'),
      order('alfa', 'move', { x: 30.5, y: 58.5 }),
    ],
  },
  {
    label: 'service road north',
    when: [{ kind: 'objective', id: 'rescueCivilian' }],
    commands: both('move', { x: 40.5, y: 38.5 }, { x: 39.5, y: 42.5 }),
  },
  {
    label: 'control yard',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 47.5, y: 31.5 }, { x: 44.5, y: 33.5 }),
  },
  {
    label: 'batteries',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'interact', undefined, 'cabinet'), order('bravo', 'hold')],
  },
  {
    label: 'out of the building',
    when: [{ kind: 'objective', id: 'collectMedicine' }],
    commands: both('move', { x: 47.5, y: 30.5 }, { x: 44.5, y: 30.5 }),
  },
  {
    label: 'road north',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 43.5, y: 18.5 }, { x: 41.5, y: 20.5 }),
  },
  {
    label: 'dock',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 55.5, y: 12.5 }, { x: 59.5, y: 9.5 }),
  },
  {
    label: 'radio',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'interact', undefined, 'beacon')],
  },
  {
    label: 'hold the dock',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: [order('alfa', 'move', { x: 56.5, y: 8.5 }), order('bravo', 'hold')],
  },
  { label: 'hold', when: settled('alfa'), commands: [order('alfa', 'hold')] },
];

/** "Plantão Noturno": around the plaza by the west road, clinic front door, back north-west to the park. */
export const NIGHT_PLAN: PlanStep[] = [
  {
    label: 'courtyard to the road',
    when: [{ kind: 'start' }],
    // at night every shot carries: only shoot back
    commands: [...fire('returnFire'), ...both('move', { x: 18.5, y: 57.5 }, { x: 19.5, y: 61.5 })],
  },
  {
    label: 'west road north',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 18.5, y: 44.5 }, { x: 19.5, y: 47.5 }),
  },
  {
    label: 'cross avenue',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 38.5, y: 41.5 }, { x: 34.5, y: 41.5 }),
  },
  {
    label: 'clinic front',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 51.5, y: 39.5 }, { x: 47.5, y: 39.5 }),
  },
  {
    label: 'antibiotics and doctor',
    when: settled('alfa', 'bravo'),
    commands: [
      order('alfa', 'interact', undefined, 'cabinet'),
      order('bravo', 'interact', undefined, 'civilian-helena'),
    ],
  },
  {
    label: 'regroup out front',
    when: [
      { kind: 'objective', id: 'collectMedicine' },
      { kind: 'objective', id: 'rescueCivilian' },
    ],
    commands: both('move', { x: 50.5, y: 40.5 }, { x: 46.5, y: 41.5 }),
  },
  {
    label: 'avenue west',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 21.5, y: 40.5 }, { x: 24.5, y: 41.5 }),
  },
  {
    label: 'west road north',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 18.5, y: 22.5 }, { x: 19.5, y: 25.5 }),
  },
  {
    label: 'to the park',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 10.5, y: 14.5 }, { x: 13.5, y: 12.5 }),
  },
  {
    label: 'signal the truck',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'interact', undefined, 'beacon')],
  },
  {
    label: 'hold the park',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: [order('alfa', 'hold'), order('bravo', 'move', { x: 9.5, y: 6.5 })],
  },
  { label: 'hold', when: settled('bravo'), commands: [order('bravo', 'hold')] },
];

const barricade = (squadId: string, id: string): GameCommandInput => ({
  type: 'issueOrder',
  squadId,
  payload: { type: 'barricade', targetEntityId: id },
});

/**
 * Defence: into the school, planks and the teacher, barricade the west door, the back door, two
 * north windows, the south-west room and the front doors, then both squads hold the hall (no
 * windows, one inner door) through the siege, open the front door and signal the convoy.
 */
export const DEFENCE_PLAN: PlanStep[] = [
  {
    label: 'into the school',
    when: [{ kind: 'start' }],
    commands: [...fire('weaponsFree'), ...both('move', { x: 38.5, y: 40.5 }, { x: 41.5, y: 42.5 })],
  },
  {
    label: 'corridor',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 31.5, y: 35.5 }, { x: 47.5, y: 35.5 }),
  },
  {
    label: 'planks and teacher',
    when: settled('alfa', 'bravo'),
    commands: [
      order('alfa', 'interact', undefined, 'cabinet'),
      order('bravo', 'interact', undefined, 'civilian-irene'),
    ],
  },
  {
    label: 'barricade west door and the safe room window',
    when: [
      { kind: 'objective', id: 'collectMedicine' },
      { kind: 'objective', id: 'rescueCivilian' },
    ],
    commands: [barricade('alfa', 'door-27-35'), barricade('bravo', 'window-27-41')],
  },
  {
    label: 'barricade back door and the safe room front window',
    when: settled('alfa', 'bravo'),
    commands: [barricade('alfa', 'door-40-26'), barricade('bravo', 'window-30-45')],
  },
  {
    label: 'barricade north windows and a front door',
    when: settled('alfa', 'bravo'),
    commands: [barricade('alfa', 'window-30-26'), barricade('bravo', 'door-39-45')],
  },
  {
    label: 'barricade more',
    when: settled('alfa', 'bravo'),
    commands: [barricade('alfa', 'window-37-26'), barricade('bravo', 'door-40-45')],
  },
  {
    label: 'both squads hold the hall: it has no windows',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 38.5, y: 40.5 }, { x: 41.5, y: 42.5 }),
  },
  {
    label: 'hold',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'hold'), order('bravo', 'hold')],
  },
  {
    label: 'open the front door',
    when: [{ kind: 'defenceDone' }],
    commands: [
      order('alfa', 'interact', undefined, 'door-39-45'),
      order('bravo', 'move', { x: 39.5, y: 41.5 }),
    ],
  },
  {
    label: 'to the gate',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 38.5, y: 55.5 }, { x: 41.5, y: 55.5 }),
  },
  {
    label: 'signal the convoy',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'interact', undefined, 'beacon')],
  },
  {
    label: 'hold the gate',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: both('move', { x: 38.5, y: 60.5 }, { x: 41.5, y: 60.5 }),
  },
  {
    label: 'hold',
    when: settled('alfa', 'bravo'),
    commands: [order('alfa', 'hold'), order('bravo', 'hold')],
  },
];

const interact = (squadId: string, id: string): GameCommandInput =>
  order(squadId, 'interact', undefined, id);

/**
 * Scavenging on the avenue: up the avenue to the bus and two trucks, into the garage for the
 * toolbox and the driver, then back south to the parking lot.
 */
export const CONVOY_PLAN: PlanStep[] = [
  {
    label: 'up the avenue',
    when: [{ kind: 'start' }],
    commands: [...fire('returnFire'), ...both('move', { x: 39.5, y: 47.5 }, { x: 43.5, y: 47.5 })],
  },
  {
    label: 'the bus and the third truck',
    when: settled('alfa', 'bravo'),
    commands: [interact('alfa', 'cache:truck-3'), interact('bravo', 'cache:bus')],
  },
  {
    label: 'the second truck',
    when: settled('alfa', 'bravo'),
    commands: [interact('alfa', 'cache:truck-2'), order('bravo', 'move', { x: 44.5, y: 23.5 })],
  },
  {
    label: 'garage front',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 53.5, y: 14.5 }, { x: 53.5, y: 17.5 }),
  },
  {
    label: 'toolbox and driver',
    when: settled('alfa', 'bravo'),
    commands: [interact('alfa', 'cabinet'), interact('bravo', 'civilian-otavio')],
  },
  {
    label: 'back to the avenue',
    when: [
      { kind: 'objective', id: 'collectMedicine' },
      { kind: 'objective', id: 'rescueCivilian' },
      { kind: 'objective', id: 'scavengeSupplies' },
    ],
    commands: both('move', { x: 44.5, y: 37.5 }, { x: 45.5, y: 39.5 }),
  },
  {
    label: 'into the parking lot',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 18.5, y: 63.5 }, { x: 21.5, y: 65.5 }),
  },
  {
    label: 'signal',
    when: settled('alfa', 'bravo'),
    commands: [interact('alfa', 'beacon'), interact('bravo', 'beacon')],
  },
  {
    label: 'hold the lot',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: [order('alfa', 'hold'), order('bravo', 'hold')],
  },
];

/**
 * Scavenging in the market: in by the west door, three stalls on the west side, the office for the
 * milk, the cold room for the vendor, back out by the west door and down the street to the parking lot.
 */
export const MARKET_PLAN: PlanStep[] = [
  {
    label: 'loading yard',
    when: [{ kind: 'start' }],
    commands: [...fire('returnFire'), ...both('move', { x: 15.5, y: 37.5 }, { x: 15.5, y: 40.5 })],
  },
  {
    label: 'into the hall',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 21.5, y: 37.5 }, { x: 21.5, y: 40.5 }),
  },
  {
    label: 'pharmacy and produce stalls',
    when: settled('alfa', 'bravo'),
    commands: [interact('alfa', 'cache:stall-pharmacy'), interact('bravo', 'cache:stall-produce')],
  },
  {
    label: 'grain stall',
    when: settled('alfa', 'bravo'),
    commands: [
      interact('alfa', 'cache:stall-grains'),
      order('bravo', 'move', { x: 30.5, y: 32.5 }),
    ],
  },
  {
    label: 'office door',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 24.5, y: 26.5 }, { x: 27.5, y: 26.5 }),
  },
  { label: 'the milk', when: settled('alfa', 'bravo'), commands: [interact('alfa', 'cabinet')] },
  {
    label: 'to the cold room',
    when: [{ kind: 'objective', id: 'collectMedicine' }],
    commands: both('move', { x: 55.5, y: 26.5 }, { x: 57.5, y: 26.5 }),
  },
  {
    label: 'the vendor',
    when: settled('alfa', 'bravo'),
    commands: [interact('bravo', 'civilian-raimundo')],
  },
  {
    label: 'back to the west door',
    when: [
      { kind: 'objective', id: 'rescueCivilian' },
      { kind: 'objective', id: 'scavengeSupplies' },
    ],
    commands: both('move', { x: 20.5, y: 37.5 }, { x: 20.5, y: 39.5 }),
  },
  {
    label: 'down the west street',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 8.5, y: 62.5 }, { x: 9.5, y: 60.5 }),
  },
  {
    label: 'out to the parking lot',
    when: settled('alfa', 'bravo'),
    commands: both('move', { x: 19.5, y: 73.5 }, { x: 22.5, y: 74.5 }),
  },
  {
    label: 'signal',
    when: settled('alfa', 'bravo'),
    commands: [interact('alfa', 'beacon'), interact('bravo', 'beacon')],
  },
  {
    label: 'hold the lot',
    when: [{ kind: 'objective', id: 'activateExtraction' }],
    commands: [order('alfa', 'hold'), order('bravo', 'hold')],
  },
];

/** One scripted route per mission (the combat route for the first one), for acceptance and E2E. */
export const MISSION_PLANS: Record<string, PlanStep[]> = {
  'a-ultima-farmacia': COMBAT_PLAN,
  'sinal-fraco': SIGNAL_PLAN,
  'plantao-noturno': NIGHT_PLAN,
  'cerco-dom-bosco': DEFENCE_PLAN,
  'comboio-parado': CONVOY_PLAN,
  'feira-fantasma': MARKET_PLAN,
};

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
    case 'defenceDone':
      return state.mission.defenceDone;
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
