import type { ContentBundle } from '@dead-sector/content';
import type { GameCommand, GameState } from '../model/types';
import { GameSimulation } from '../engine/GameSimulation';
import { createMissionState } from '../mission/createMission';

/** FNV-1a hash of the canonical JSON state; debug mode logs it every 100 ticks. */
export function hashState(state: GameState): string {
  const json = JSON.stringify({ ...state, events: [] });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface Replay {
  missionId: string;
  seed: number;
  commands: GameCommand[];
  ticks: number;
}

/** Re-runs a replay from the initial snapshot, applying commands at their scheduled tick. */
export function runReplay(content: ContentBundle, replay: Replay): GameSimulation {
  const sim = new GameSimulation(
    content,
    createMissionState(content, replay.missionId, replay.seed),
  );
  const byTick = new Map<number, GameCommand[]>();
  for (const c of replay.commands) {
    const list = byTick.get(c.scheduledTick) ?? [];
    list.push(c);
    byTick.set(c.scheduledTick, list);
  }
  for (let t = 0; t < replay.ticks && !sim.ended; t++) {
    for (const c of byTick.get(sim.tick) ?? []) {
      const { id: _id, scheduledTick: _t, ...input } = c;
      sim.enqueue(input as Parameters<GameSimulation['enqueue']>[0]);
    }
    sim.step();
  }
  return sim;
}
