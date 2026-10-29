import type { GameState, NoiseCategory, NoiseEvent, Squad, Vec2 } from '../model/types';
import type { World } from '../model/World';
import { emit, nextId } from '../engine/EventBus';
import type { TickContext } from '../engine/TickContext';
import { acousticTile, inBounds } from '../spatial/Grid';
import { MinHeap } from '../spatial/Heap';
import { copy } from '../spatial/vec';
import { updateAlarm } from './Hordes';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const heap = new MinHeap();

/**
 * Intensity-budgeted Dijkstra: remaining(next) = remaining(cur) - stepDistance*attenuation - absorption(next).
 * Returns the remaining intensity per cell (0 where the sound never reached).
 */
export function propagateNoise(
  world: World,
  state: GameState,
  origin: Vec2,
  intensity: number,
): Float32Array {
  const W = world.width;
  const field = new Float32Array(world.width * world.height);
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  if (!inBounds(world, ox, oy) || intensity <= 0) return field;
  const atten = world.rules.noise.attenuationPerMeter;
  const absorption = world.rules.noise.absorption;
  const absorb = (cx: number, cy: number): number =>
    absorption[acousticTile(world, state, cx, cy)] ?? 0;
  heap.clear();
  field[oy * W + ox] = intensity;
  heap.push(-intensity, oy * W + ox);
  while (heap.size > 0) {
    const cur = heap.pop();
    const cx = cur % W;
    const cy = (cur - cx) / W;
    const value = field[cur] as number;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(world, nx, ny)) continue;
      const diag = dx !== 0 && dy !== 0;
      // sound does not squeeze diagonally between two solid corners
      if (diag && (absorb(cx + dx, cy) >= 10 || absorb(cx, cy + dy) >= 10)) continue;
      const remaining = value - (diag ? Math.SQRT2 : 1) * atten - absorb(nx, ny);
      if (remaining <= 0) continue;
      const ni = ny * W + nx;
      if (remaining > (field[ni] as number) + 1e-6) {
        field[ni] = remaining;
        heap.push(-remaining, ni);
      }
    }
  }
  return field;
}

/** Queues a noise; it propagates at the next updateNoise step. Every noise is an explicit sim event. */
export function emitNoise(
  state: GameState,
  position: Vec2,
  intensity: number,
  category: NoiseCategory,
  sourceEntityId?: string,
): NoiseEvent {
  const noise: NoiseEvent = {
    id: nextId(state, 'noise'),
    tick: state.tick,
    position: copy(position),
    intensity: Math.max(0, Math.min(100, intensity)),
    category,
  };
  if (sourceEntityId) noise.sourceEntityId = sourceEntityId;
  state.pendingNoises.push(noise);
  state.stats.totalNoise += noise.intensity;
  state.stats.noiseEvents += 1;
  emit(state, 'NOISE_EMITTED', {
    noiseId: noise.id,
    category,
    intensity: noise.intensity,
    x: noise.position.x,
    y: noise.position.y,
    sourceEntityId: sourceEntityId ?? null,
  });
  return noise;
}

/** Propagates queued noises; zombies that hear one store it as a stimulus, spawners accumulate pressure. */
export function updateNoise(world: World, state: GameState, ctx: TickContext): void {
  const pending = state.pendingNoises;
  state.pendingNoises = [];
  const hearingMul = world.difficulty.zombieHearingMultiplier;
  for (const noise of pending) {
    const field = propagateNoise(world, state, noise.position, noise.intensity);
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const type = world.content.zombieTypes[z.typeId];
      if (!type) continue;
      const cx = Math.floor(z.position.x);
      const cy = Math.floor(z.position.y);
      if (!inBounds(world, cx, cy)) continue;
      const heardIntensity = field[cy * world.width + cx] as number;
      if (heardIntensity >= type.hearingThreshold / hearingMul) {
        const prev = z.ai.heard;
        if (!prev || heardIntensity > prev.intensity || state.tick - prev.tick > 20) {
          z.ai.heard = {
            position: copy(noise.position),
            intensity: heardIntensity,
            tick: state.tick,
          };
        }
      }
    }
    for (const sp of state.mission.spawners) {
      const v = field[sp.cell.y * world.width + sp.cell.x] as number;
      if (v > 0) {
        sp.pressure += v;
        sp.lastNoisePos = copy(noise.position);
      }
    }
    state.recentNoises.push(noise);
  }
  updateAlarm(world, state, pending);
  const keepAfter = state.tick - world.rules.noise.recentNoiseSeconds * 10;
  state.recentNoises = state.recentNoises.filter((n) => n.tick >= keepAfter);
  void ctx;
}

/** Footsteps aggregated per squad every pulse: loudest member plus a small bonus per extra mover. */
export function emitFootstepPulses(world: World, state: GameState, ctx: TickContext): void {
  const pulseTicks = Math.max(1, Math.round(world.rules.noise.footstepPulseSeconds * 10));
  if (state.tick % pulseTicks !== 0) return;
  const fs = world.rules.noise.footstep;
  const pulse = (
    members: { position: Vec2; moveMode: 'sneak' | 'move' | 'sprint'; stealth: number }[],
    sourceId: string,
  ) => {
    if (members.length === 0) return;
    let loudest = 0;
    let sx = 0;
    let sy = 0;
    for (const m of members) {
      const base = fs[m.moveMode] * (1 - (m.stealth - 50) / 400);
      loudest = Math.max(loudest, base);
      sx += m.position.x;
      sy += m.position.y;
    }
    const intensity = loudest + world.rules.noise.groupBonusPerExtraMember * (members.length - 1);
    emitNoise(
      state,
      { x: sx / members.length, y: sy / members.length },
      intensity,
      'footstep',
      sourceId,
    );
  };
  for (const squad of state.squads as Squad[]) {
    const movers = squad.memberIds
      .map((id) => ctx.survivorsById.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s && s.alive && s.moving && !s.extracted);
    pulse(movers, squad.id);
  }
  for (const s of state.survivors) {
    if (s.isObjectiveCivilian && s.alive && s.moving && !s.extracted) pulse([s], s.id);
  }
}
