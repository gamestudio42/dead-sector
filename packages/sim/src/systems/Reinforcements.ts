import type { GameState } from '../model/types';
import type { World } from '../model/World';
import { emit, nextId } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { cellCenter, dist } from '../spatial/vec';
import { makeZombie } from '../mission/createMission';

/**
 * Explicit, auditable spawners at map entries: loud noise that reaches a spawner builds pressure;
 * when it crosses the threshold (and the entry is out of sight) one infected arrives, already
 * investigating the noise that drew it.
 */
export function updateReinforcements(world: World, state: GameState, ctx: TickContext): void {
  const cfg = world.mission.reinforcements;
  const m = state.mission;
  const decay = 1 - cfg.pressureDecayPerSecond * 0.1;
  const alive = state.zombies.filter((z) => z.alive).length;
  let spawnedNow = 0;
  for (const sp of m.spawners) {
    sp.pressure *= decay;
    if (sp.pressure < cfg.pressureThreshold || state.tick < sp.cooldownUntil) continue;
    if (m.reinforcementsSpawned >= m.reinforcementBudget || alive + spawnedNow >= cfg.maxConcurrent)
      continue;
    if (state.fog.cells[sp.cell.y * world.width + sp.cell.x] === 2) continue;
    const pos = cellCenter(sp.cell.x, sp.cell.y);
    if (
      state.survivors.some(
        (s) => s.alive && !s.extracted && dist(s.position, pos) < cfg.minSurvivorDistance,
      )
    )
      continue;
    if (state.zombies.some((z) => z.alive && dist(z.position, pos) < 0.7)) continue;
    const typeId = ctx.rng.chance(cfg.runnerChance) ? 'runner' : 'walker';
    const id = nextId(state, 'zr');
    const z = makeZombie(world, id, typeId, pos, 0, 'investigate', state.tick);
    z.spawnedBy = sp.id;
    if (sp.lastNoisePos) {
      z.ai.goal = { ...sp.lastNoisePos };
      z.ai.lastKnownPos = { ...sp.lastNoisePos };
      z.ai.stateUntil = state.tick + 400;
    }
    state.zombies.push(z);
    ctx.zombiesById.set(z.id, z);
    m.reinforcementsSpawned += 1;
    spawnedNow += 1;
    sp.pressure -= cfg.pressureThreshold;
    sp.cooldownUntil = state.tick + Math.round(cfg.cooldownSeconds * 10);
    emit(state, 'REINFORCEMENT_SPAWNED', { spawnerId: sp.id, zombieId: id, typeId });
  }
}
