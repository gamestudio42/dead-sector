import type { GameState, SimEvent, SimEventType } from '../model/types';

const LOGGED_EXCLUDE = new Set<SimEventType>(['NOISE_EMITTED', 'SHOT_FIRED', 'MELEE_ATTACK']);
const EVENT_LOG_LIMIT = 150;

export function nextId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

/** Appends an event to the current tick; HUD/tests read `state.events` and `state.eventLog`. */
export function emit(
  state: GameState,
  type: SimEventType,
  payload: Record<string, unknown>,
): SimEvent {
  const event: SimEvent = {
    id: `evt-${state.tick}-${state.events.length}`,
    tick: state.tick,
    type,
    payload,
  };
  state.events.push(event);
  if (!LOGGED_EXCLUDE.has(type)) {
    state.eventLog.push(event);
    if (state.eventLog.length > EVENT_LOG_LIMIT)
      state.eventLog.splice(0, state.eventLog.length - EVENT_LOG_LIMIT);
  }
  return event;
}
