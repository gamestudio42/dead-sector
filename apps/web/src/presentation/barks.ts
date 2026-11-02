import type { GameState, SimEvent, Survivor, Vec2 } from '@dead-sector/sim';
import { catalog, fill } from '../ui/i18n';

/** A short spoken line shown above a survivor. Higher priority pre-empts lower ones. */
export interface Bark {
  survivorId: string;
  text: string;
  priority: 1 | 2 | 3 | 4;
}

const lines = () => catalog().barks;

/** Deterministic line choice from the event id so replays read the same. */
function pick(lines: string[], key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return lines[Math.abs(h) % lines.length] as string;
}

function firstName(s: Survivor): string {
  return s.name.split(' ')[0] ?? s.name;
}

function nearestSquadMember(state: GameState, p: Vec2, exceptId?: string): Survivor | undefined {
  let best: Survivor | undefined;
  let bestD = Infinity;
  for (const s of state.survivors) {
    if (!s.alive || s.extracted || s.squadId === null || s.id === exceptId || s.panicked) continue;
    const d = Math.hypot(s.position.x - p.x, s.position.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function barksForEvents(events: SimEvent[], state: GameState): Bark[] {
  const out: Bark[] = [];
  const surv = (id: unknown) => state.survivors.find((s) => s.id === id);
  const say = (
    s: Survivor | undefined,
    lines: string[],
    key: string,
    priority: Bark['priority'],
  ) => {
    if (s && s.alive && !s.extracted)
      out.push({ survivorId: s.id, text: pick(lines, key), priority });
  };
  for (const e of events) {
    const p = e.payload;
    switch (e.type) {
      case 'ORDER_ISSUED': {
        const squad = state.squads.find((s) => s.id === p['squadId']);
        const orderLines = lines().order[p['orderType'] as keyof ReturnType<typeof lines>['order']];
        if (squad && orderLines) say(surv(squad.leaderId), orderLines, e.id, 1);
        break;
      }
      case 'ENEMY_SPOTTED':
        if (!p['reacquired'])
          say(
            nearestSquadMember(state, { x: p['x'] as number, y: p['y'] as number }),
            lines().spot[p['typeId'] as keyof ReturnType<typeof lines>['spot']] ??
              lines().spot.walker,
            e.id,
            p['typeId'] === 'walker' ? 2 : 3,
          );
        break;
      case 'OUT_OF_AMMO':
        say(surv(p['survivorId']), lines().noAmmo, e.id, 3);
        break;
      case 'ACTOR_INJURED':
        say(
          surv(p['actorId']),
          p['bitten'] ? lines().bitten : lines().hurt,
          e.id,
          p['bitten'] ? 4 : 3,
        );
        break;
      case 'ACTOR_KILLED': {
        if (p['kind'] !== 'survivor') break;
        const dead = surv(p['actorId']);
        if (!dead) break;
        const line = dead.isObjectiveCivilian
          ? lines().lostPerson.map((s) => fill(s))
          : lines().lostNamed.map((s) => fill(s, { name: firstName(dead) }));
        say(nearestSquadMember(state, dead.position, dead.id), line, e.id, 4);
        break;
      }
      case 'SURVIVOR_PANICKED':
        say(
          surv(p['survivorId']),
          p['behaviour'] === 'flee' ? lines().panicFlee : lines().panicFreeze,
          e.id,
          4,
        );
        break;
      case 'SURVIVOR_RALLIED':
        say(surv(p['survivorId']), lines().rally, e.id, 2);
        break;
      case 'LEADER_CHANGED':
        say(surv(p['leaderId']), lines().newLeader, e.id, 3);
        break;
      case 'OBJECTIVE_COMPLETED': {
        const id = p['objectiveId'] as string;
        if (id === 'rescueCivilian') {
          const civ = state.survivors.find((s) => s.isObjectiveCivilian);
          say(civ, lines().civilianThanks, e.id, 3);
        } else if (id === 'collectMedicine') {
          const c =
            state.survivors.find((s) => s.alive && s.interaction?.targetId === 'cabinet') ??
            state.survivors.find((s) => s.alive && s.isLeader);
          say(
            c,
            lines().gotItem.map((s) => fill(s)),
            e.id,
            3,
          );
        }
        break;
      }
      case 'SURVIVOR_TURNED':
        say(
          nearestSquadMember(
            state,
            { x: p['x'] as number, y: p['y'] as number },
            p['survivorId'] as string,
          ),
          lines().turned,
          e.id,
          4,
        );
        break;
      case 'HORDE_INCOMING': {
        const leader = state.survivors.find((s) => s.alive && s.isLeader && !s.extracted);
        say(leader, lines().horde, e.id, 4);
        break;
      }
      case 'BARRICADE_BUILT':
        say(surv(p['byId']), lines().barricade, e.id, 2);
        break;
      case 'ZOMBIE_SCREAMED':
        say(
          nearestSquadMember(state, { x: p['x'] as number, y: p['y'] as number }),
          lines().screamHeard,
          e.id,
          3,
        );
        break;
      case 'EXTRACTION_STARTED':
        say(surv(p['survivorId']), lines().extraction, e.id, 3);
        break;
      default:
        break;
    }
  }
  return out;
}
