import type { GameCommand, GameState, OrderType, Squad, SquadOrder } from '../model/types';
import type { World } from '../model/World';
import { emit, nextId } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { copy } from '../spatial/vec';
import { confirmExtraction } from './Objectives';
import { aliveMembers, planOrder } from './Orders';

const ORDER_TYPES = new Set<OrderType>([
  'move',
  'sneak',
  'sprint',
  'hold',
  'hide',
  'attack',
  'retreat',
  'interact',
  'regroup',
]);
const POSITION_ORDERS = new Set<OrderType>(['move', 'sneak', 'sprint']);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function reject(state: GameState, cmd: GameCommand, reason: string): void {
  emit(state, 'ORDER_REJECTED', { commandId: cmd.id, commandType: cmd.type, reason });
}

function issueOrder(
  world: World,
  state: GameState,
  ctx: TickContext,
  squad: Squad,
  type: OrderType,
  payload: { targetPosition?: { x: number; y: number }; targetEntityId?: string },
): void {
  const mode =
    type === 'sneak' || type === 'move' || type === 'sprint'
      ? type
      : type === 'retreat'
        ? 'sprint'
        : squad.moveMode;
  if (type === 'sneak' || type === 'move' || type === 'sprint') squad.moveMode = type;
  if (
    squad.order &&
    (squad.order.status === 'executing' ||
      squad.order.status === 'planning' ||
      squad.order.status === 'queued')
  ) {
    squad.order.status = 'cancelled';
  }
  const order: SquadOrder = {
    id: nextId(state, 'order'),
    squadId: squad.id,
    type,
    issuedAtTick: state.tick,
    status: 'queued',
    mode,
    routePreview: [],
  };
  if (payload.targetPosition) order.targetPosition = copy(payload.targetPosition);
  if (payload.targetEntityId) order.targetEntityId = payload.targetEntityId;
  squad.order = order;
  state.stats.ordersIssued += 1;
  emit(state, 'ORDER_ISSUED', {
    squadId: squad.id,
    orderId: order.id,
    orderType: type,
    x: order.targetPosition?.x ?? null,
    y: order.targetPosition?.y ?? null,
    targetEntityId: order.targetEntityId ?? null,
  });
  planOrder(world, state, ctx, squad, order);
}

/** Validates and applies player commands for this tick. Invalid or late commands are rejected with an event. */
export function applyCommands(
  world: World,
  state: GameState,
  ctx: TickContext,
  commands: readonly GameCommand[],
): void {
  for (const cmd of commands) {
    if (cmd.type === 'setSimulationSpeed') continue; // host clock concern, recorded for replay only
    if (state.mission.status !== 'running') {
      reject(state, cmd, 'missionEnded');
      continue;
    }
    if (cmd.type === 'confirmExtraction') {
      if (!confirmExtraction(world, state)) reject(state, cmd, 'extractionNotReady');
      continue;
    }
    const squad = state.squads.find((s) => s.id === cmd.squadId);
    if (!squad) {
      reject(state, cmd, 'unknownSquad');
      continue;
    }
    if (aliveMembers(state, ctx, squad).length === 0) {
      reject(state, cmd, 'noMembers');
      continue;
    }
    if (cmd.type === 'setFirePolicy') {
      if (!['weaponsFree', 'returnFire', 'holdFire'].includes(cmd.payload.policy))
        reject(state, cmd, 'invalidPayload');
      else squad.firePolicy = cmd.payload.policy;
      continue;
    }
    if (cmd.type === 'setMoveMode') {
      const mode = cmd.payload.mode;
      if (!['sneak', 'move', 'sprint'].includes(mode)) {
        reject(state, cmd, 'invalidPayload');
        continue;
      }
      squad.moveMode = mode;
      const o = squad.order;
      if (o && o.status === 'executing' && POSITION_ORDERS.has(o.type) && o.targetPosition) {
        issueOrder(world, state, ctx, squad, mode, { targetPosition: o.targetPosition });
      } else if (
        o &&
        o.status === 'executing' &&
        (o.type === 'regroup' || o.type === 'attack' || o.type === 'interact')
      ) {
        o.mode = mode;
        for (const m of aliveMembers(state, ctx, squad)) m.moveMode = mode;
      }
      continue;
    }
    if (cmd.type === 'issueOrder') {
      const p = cmd.payload;
      if (!p || !ORDER_TYPES.has(p.type)) {
        reject(state, cmd, 'invalidPayload');
        continue;
      }
      if (
        POSITION_ORDERS.has(p.type) &&
        !(p.targetPosition && finite(p.targetPosition.x) && finite(p.targetPosition.y))
      ) {
        reject(state, cmd, 'invalidPayload');
        continue;
      }
      if ((p.type === 'attack' || p.type === 'interact') && typeof p.targetEntityId !== 'string') {
        reject(state, cmd, 'invalidPayload');
        continue;
      }
      const payload: { targetPosition?: { x: number; y: number }; targetEntityId?: string } = {};
      if (p.targetPosition) payload.targetPosition = p.targetPosition;
      if (p.targetEntityId) payload.targetEntityId = p.targetEntityId;
      issueOrder(world, state, ctx, squad, p.type, payload);
    }
  }
}
