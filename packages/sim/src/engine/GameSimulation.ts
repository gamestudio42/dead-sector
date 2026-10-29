import { loadContent, type ContentBundle } from '@dead-sector/content';
import type { GameCommand, GameCommandInput, GameState, SimEvent } from '../model/types';
import { createWorld, type World } from '../model/World';
import { createMissionState } from '../mission/createMission';
import { advanceWaypoints, applyCommands } from '../systems/Commands';
import { resolveCombat } from '../systems/Combat';
import { resolveDamageAndInfection } from '../systems/Infection';
import { moveActors } from '../systems/Movement';
import { updateNoise } from '../systems/Noise';
import { evaluateObjectives, updateInteractions } from '../systems/Objectives';
import { updatePerception } from '../systems/Perception';
import { updatePsychology } from '../systems/Psychology';
import { updateReinforcements } from '../systems/Reinforcements';
import { decideSurvivors } from '../systems/SurvivorAI';
import { decideZombies } from '../systems/ZombieAI';
import { SeededRng } from './SeededRng';
import { buildContext } from './TickContext';

/**
 * Advances the world by exactly one 100 ms tick. All state mutation happens here, in the
 * fixed pipeline order from the spec. After the mission ends the tick no longer advances.
 */
export function advanceTick(
  world: World,
  state: GameState,
  commands: readonly GameCommand[],
  rng: SeededRng,
): void {
  state.events = [];
  const ctx = buildContext(world, state, rng);
  applyCommands(world, state, ctx, commands);
  if (state.mission.status !== 'running') return;
  updatePerception(world, state, ctx);
  updateNoise(world, state, ctx);
  updateReinforcements(world, state, ctx);
  decideZombies(world, state, ctx);
  decideSurvivors(world, state, ctx);
  moveActors(world, state, ctx);
  const damage = resolveCombat(world, state, ctx);
  resolveDamageAndInfection(world, state, ctx, damage);
  updateInteractions(world, state, ctx);
  updatePsychology(world, state, ctx);
  evaluateObjectives(world, state);
  advanceWaypoints(world, state, ctx);
  state.tick += 1;
}

export interface CommandRecord {
  command: GameCommand;
}

/** Convenience wrapper owning state, world and RNG; hosts and tests drive it tick by tick. */
export class GameSimulation {
  readonly world: World;
  readonly rng: SeededRng;
  private queue: GameCommand[] = [];
  private commandCounter = 0;
  /** Every command actually applied, with the tick it was applied on (replay log). */
  readonly commandLog: GameCommand[] = [];

  constructor(
    readonly content: ContentBundle,
    public state: GameState,
  ) {
    this.world = createWorld(content, state.missionId, state.doors);
    this.rng = new SeededRng(state);
  }

  static create(
    missionId = 'a-ultima-farmacia',
    seed?: number,
    content: ContentBundle = loadContent(),
  ): GameSimulation {
    const mission = content.missions[missionId];
    if (!mission) throw new Error(`Unknown mission ${missionId}`);
    return new GameSimulation(
      content,
      createMissionState(content, missionId, seed ?? mission.canonicalSeed),
    );
  }

  get tick(): number {
    return this.state.tick;
  }

  get ended(): boolean {
    return this.state.mission.status !== 'running';
  }

  /** Queues a command for the next tick (accepted while paused, executed on resume). */
  enqueue(input: GameCommandInput): GameCommand {
    this.commandCounter += 1;
    const cmd = {
      ...input,
      id: `cmd-${this.state.tick}-${this.commandCounter}`,
      scheduledTick: this.state.tick,
    } as GameCommand;
    this.queue.push(cmd);
    return cmd;
  }

  /** Runs one tick with the queued commands. Returns events produced in that tick. */
  step(): SimEvent[] {
    const cmds = this.queue.map((c) => ({ ...c, scheduledTick: this.state.tick }) as GameCommand);
    this.queue = [];
    this.commandLog.push(...cmds);
    advanceTick(this.world, this.state, cmds, this.rng);
    return this.state.events;
  }

  run(ticks: number): SimEvent[] {
    const all: SimEvent[] = [];
    for (let i = 0; i < ticks && !this.ended; i++) all.push(...this.step());
    return all;
  }
}
