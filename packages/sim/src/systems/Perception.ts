import type { Contact, GameState, Survivor, Zombie } from '../model/types';
import type { World } from '../model/World';
import { emit } from '../engine/EventBus';
import { isSquadMember, type TickContext } from '../engine/TickContext';
import { castVisionRay, hasLineOfSight } from '../spatial/Raycast';
import { angleDiff, copy, dist } from '../spatial/vec';

export function survivorVisionRange(world: World): number {
  return world.mission.isNight
    ? world.rules.vision.survivorNightRange
    : world.rules.vision.survivorDayRange;
}

/** Whether survivor `s` currently sees world point `p` (range, FOV/peripheral, occlusion). */
export function survivorCanSee(
  world: World,
  state: GameState,
  s: Survivor,
  p: { x: number; y: number },
): boolean {
  const d = dist(s.position, p);
  if (d > survivorVisionRange(world)) return false;
  const peripheral = world.rules.vision.peripheralRange;
  if (d > peripheral) {
    const half = ((world.rules.vision.fovDegrees / 2) * Math.PI) / 180;
    const ang = Math.atan2(p.y - s.position.y, p.x - s.position.x);
    if (angleDiff(ang, s.facing) > half) return false;
  }
  return hasLineOfSight(world, state, s.position, p);
}

/** Recomputes fog of war, per-survivor sightings and the player's contact memory. */
export function updatePerception(world: World, state: GameState, ctx: TickContext): void {
  const fog = state.fog.cells;
  for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
  const range = survivorVisionRange(world);
  const half = ((world.rules.vision.fovDegrees / 2) * Math.PI) / 180;
  const peripheral = world.rules.vision.peripheralRange;
  const mark = (cx: number, cy: number) => {
    fog[cy * world.width + cx] = 2;
  };
  const squadSeen = new Set<string>();

  for (const s of state.survivors) {
    s.seenZombieIds = [];
    if (!s.alive || s.extracted) continue;
    const eye = s.position;
    if (isSquadMember(s)) {
      const step = 0.5 / range;
      for (let a = -half; a <= half + 1e-9; a += step)
        castVisionRay(world, state, eye, s.facing + a, range, mark);
      if (peripheral > 0) {
        const pStep = 0.5 / peripheral;
        for (let a = 0; a < Math.PI * 2; a += pStep)
          castVisionRay(world, state, eye, a, peripheral, mark);
      }
    }
    for (const z of ctx.zombieHash.query(eye, range)) {
      if (survivorCanSee(world, state, s, z.position)) {
        s.seenZombieIds.push(z.id);
        if (isSquadMember(s)) squadSeen.add(z.id);
      }
    }
    s.seenZombieIds.sort();
  }

  // Player contact memory: visible now, or last known position with timestamp.
  const memoryTicks = world.rules.vision.contactMemorySeconds * 10;
  const byId = new Map<string, Contact>(state.contacts.map((c) => [c.zombieId, c]));
  for (const id of [...squadSeen].sort()) {
    const z = ctx.zombiesById.get(id) as Zombie;
    const c = byId.get(id);
    if (!c) {
      const nc: Contact = {
        zombieId: id,
        typeId: z.typeId,
        position: copy(z.position),
        tick: state.tick,
        visible: true,
      };
      byId.set(id, nc);
      emit(state, 'ENEMY_SPOTTED', {
        zombieId: id,
        typeId: z.typeId,
        x: z.position.x,
        y: z.position.y,
      });
    } else {
      if (!c.visible)
        emit(state, 'ENEMY_SPOTTED', {
          zombieId: id,
          typeId: z.typeId,
          x: z.position.x,
          y: z.position.y,
          reacquired: true,
        });
      c.position = copy(z.position);
      c.tick = state.tick;
      c.visible = true;
    }
  }
  const contacts: Contact[] = [];
  for (const c of byId.values()) {
    const z = ctx.zombiesById.get(c.zombieId);
    if (!z || !z.alive) continue;
    if (c.visible && !squadSeen.has(c.zombieId)) {
      c.visible = false;
      emit(state, 'ENEMY_LOST', { zombieId: c.zombieId, x: c.position.x, y: c.position.y });
    }
    if (!c.visible && state.tick - c.tick > memoryTicks) continue;
    contacts.push(c);
  }
  contacts.sort((a, b) => (a.zombieId < b.zombieId ? -1 : a.zombieId > b.zombieId ? 1 : 0));
  state.contacts = contacts;
}
