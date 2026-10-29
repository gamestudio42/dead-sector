import type { GameState, SimEvent, World } from '@dead-sector/sim';

/**
 * Presentation-only audio cues derived from simulation events. Every positional cue is the
 * echo of something the simulation already did (shot, noise, door, injury), so audio can
 * never inform zombies of anything — it only plays what the sim emitted.
 */
export type CueKind =
  | 'gunshot'
  | 'melee'
  | 'groan'
  | 'shriek'
  | 'footstep'
  | 'door'
  | 'doorBreak'
  | 'reload'
  | 'dryFire'
  | 'hurt'
  | 'bite'
  | 'death'
  | 'zombieDeath'
  | 'radio'
  | 'objective'
  | 'panic'
  | 'order'
  | 'blocked'
  | 'horde'
  | 'victory'
  | 'defeat'
  | 'glass'
  | 'hammer'
  | 'bash'
  | 'scream'
  | 'hordeWarning'
  | 'turn';

export interface Cue {
  kind: CueKind;
  /** World position in cells; absent for interface cues. */
  x?: number;
  y?: number;
  /** Weapon id for gunshots, surface for footsteps. */
  variant?: string;
  /** Source is outside the current field of view: played filtered and quieter. */
  muffled: boolean;
}

function visibleAt(state: GameState, world: World, x: number, y: number): boolean {
  return state.fog.cells[Math.floor(y) * world.width + Math.floor(x)] === 2;
}

export function cuesForEvents(events: SimEvent[], state: GameState, world: World): Cue[] {
  const cues: Cue[] = [];
  const survivor = (id: unknown) => state.survivors.find((s) => s.id === id);
  const zombie = (id: unknown) => state.zombies.find((z) => z.id === id);
  const at = (kind: CueKind, x: number, y: number, variant?: string): void => {
    cues.push({ kind, x, y, variant, muffled: !visibleAt(state, world, x, y) });
  };

  for (const e of events) {
    const p = e.payload;
    switch (e.type) {
      case 'SHOT_FIRED':
        at('gunshot', p['fromX'] as number, p['fromY'] as number, p['weaponId'] as string);
        break;
      case 'MELEE_ATTACK': {
        const s = survivor(p['attackerId']);
        if (s) at('melee', s.position.x, s.position.y);
        break;
      }
      case 'NOISE_EMITTED': {
        const x = p['x'] as number;
        const y = p['y'] as number;
        if (p['category'] === 'footstep') {
          at('footstep', x, y, world.tiles[Math.floor(y) * world.width + Math.floor(x)]);
        } else if (p['category'] === 'shout') {
          const z = zombie(p['sourceEntityId']);
          // the screamer's shriek has its own cue (ZOMBIE_SCREAMED); here only ordinary groans
          if (z && (p['intensity'] as number) < 50)
            at(z.typeId === 'runner' ? 'shriek' : 'groan', x, y, z.typeId);
        } else if (p['category'] === 'glass') {
          at('glass', x, y);
        } else if (p['category'] === 'door') {
          // survivors hammering planks, or infected pounding a door
          const byZombie = !!zombie(p['sourceEntityId']);
          const s = survivor(p['sourceEntityId']);
          if (byZombie) at('bash', x, y);
          else if (s && s.interaction?.kind === 'barricade') at('hammer', x, y);
        }
        break;
      }
      case 'DOOR_CHANGED': {
        const d = state.doors.find((door) => door.id === p['doorId']);
        // glass and planks have their own sounds; plain open/close/break are door sounds
        if (d && !p['window'] && p['barricade'] === undefined)
          at(p['broken'] ? 'doorBreak' : 'door', d.cell.x + 0.5, d.cell.y + 0.5);
        break;
      }
      case 'WEAPON_RELOADED': {
        const s = survivor(p['survivorId']);
        if (s) at('reload', s.position.x, s.position.y);
        break;
      }
      case 'OUT_OF_AMMO': {
        const s = survivor(p['survivorId']);
        if (s) at('dryFire', s.position.x, s.position.y);
        break;
      }
      case 'ACTOR_INJURED': {
        const s = survivor(p['actorId']);
        if (s) at(p['bitten'] ? 'bite' : 'hurt', s.position.x, s.position.y);
        break;
      }
      case 'ACTOR_KILLED': {
        if (p['kind'] === 'survivor') {
          const s = survivor(p['actorId']);
          if (s) at('death', s.position.x, s.position.y);
        } else {
          const z = zombie(p['actorId']);
          if (z) at('zombieDeath', z.position.x, z.position.y);
        }
        break;
      }
      case 'REINFORCEMENT_SPAWNED': {
        const sp = world.mission.spawners.find((s) => s.id === p['spawnerId']);
        if (sp) at('horde', sp.cell.x + 0.5, sp.cell.y + 0.5);
        break;
      }
      case 'ZOMBIE_SCREAMED':
        at('scream', p['x'] as number, p['y'] as number);
        break;
      case 'SURVIVOR_TURNED':
        at('turn', p['x'] as number, p['y'] as number);
        break;
      case 'HORDE_INCOMING': {
        const sp = world.mission.spawners.find((s) => s.id === p['spawnerId']);
        if (sp) at('hordeWarning', sp.cell.x + 0.5, sp.cell.y + 0.5);
        break;
      }
      case 'EXTRACTION_STARTED':
        cues.push({ kind: 'radio', muffled: false });
        break;
      case 'OBJECTIVE_COMPLETED':
        cues.push({ kind: 'objective', muffled: false });
        break;
      case 'SURVIVOR_PANICKED':
        cues.push({ kind: 'panic', muffled: false });
        break;
      case 'ORDER_ISSUED':
        cues.push({ kind: 'order', muffled: false });
        break;
      case 'ORDER_BLOCKED':
      case 'ORDER_REJECTED':
        cues.push({ kind: 'blocked', muffled: false });
        break;
      case 'MISSION_ENDED':
        cues.push({ kind: p['status'] === 'failed' ? 'defeat' : 'victory', muffled: false });
        break;
      default:
        break;
    }
  }
  return cues;
}

/** 0..1 tension used by the adaptive drone: zombies hunting the squads, weighted by distance. */
export function threatLevel(state: GameState): number {
  let t = 0;
  const alive = state.survivors.filter((s) => s.alive && !s.extracted);
  for (const z of state.zombies) {
    if (!z.alive) continue;
    const hunting = z.ai.state === 'pursue' || z.ai.state === 'attack';
    const investigating = z.ai.state === 'investigate' || z.ai.state === 'search';
    if (!hunting && !investigating) continue;
    let best = Infinity;
    for (const s of alive) {
      const d = Math.hypot(s.position.x - z.position.x, s.position.y - z.position.y);
      if (d < best) best = d;
    }
    const near = Math.max(0, 1 - best / 25);
    t += (hunting ? 0.22 : 0.07) * (0.35 + 0.65 * near);
  }
  if (alive.some((s) => s.panicked)) t += 0.25;
  return Math.min(1, t);
}
