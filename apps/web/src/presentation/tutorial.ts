import type { GameState, SimEvent } from '@dead-sector/sim';
import { keyName } from '../input/KeyBindings';
import { catalog, fill } from '../ui/i18n';

/** A contextual hint, shown once per profile the first time its situation happens. */
export interface Tip {
  id: string;
  title: string;
  text: string;
}

const TIPS = [
  'select',
  'sneak',
  'contact',
  'noise',
  'locked',
  'bite',
  'panic',
  'alarm',
  'horde',
  'rescue',
  'extraction',
  'orders',
] as const;

function tipCopy(id: (typeof TIPS)[number]): Omit<Tip, 'id'> {
  const tip = catalog().tips[id];
  const pan = ['panUp', 'panLeft', 'panDown', 'panRight']
    .map((a) => keyName(a as 'panUp'))
    .join('');
  return {
    title: tip.title,
    text: fill(tip.text, {
      squad1: keyName('squad1'),
      squad2: keyName('squad2'),
      pan,
      pause: keyName('pause'),
      sneak: keyName('modeSneak'),
      fire: keyName('firePolicy'),
      barricade: keyName('barricade'),
    }),
  };
}

export function tip(id: string): Tip | null {
  if (!(TIPS as readonly string[]).includes(id)) return null;
  return { id, ...tipCopy(id as (typeof TIPS)[number]) };
}

/** Tips due at mission start. */
export function startTips(seen: ReadonlySet<string>): string[] {
  return seen.has('select') ? [] : ['select'];
}

/** Tips triggered by this tick's events that were never shown before (each id at most once). */
export function tipsForEvents(
  events: SimEvent[],
  state: GameState,
  seen: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (!seen.has(id) && !out.includes(id)) out.push(id);
  };
  for (const e of events) {
    const p = e.payload;
    switch (e.type) {
      case 'ORDER_ISSUED':
        if (p['orderType'] === 'move' || p['orderType'] === 'sprint') add('sneak');
        if (state.stats.ordersIssued >= 4) add('orders');
        break;
      case 'ENEMY_SPOTTED':
        add('contact');
        break;
      case 'SHOT_FIRED':
        add('noise');
        break;
      case 'ORDER_BLOCKED':
        if (p['reason'] === 'locked') add('locked');
        break;
      case 'INTERACTION_STARTED':
        if (p['kind'] === 'door' && state.doors.some((d) => d.id === p['targetId'] && d.locked))
          add('locked');
        break;
      case 'ACTOR_INJURED':
        if (p['bitten']) add('bite');
        break;
      case 'SURVIVOR_PANICKED':
        add('panic');
        break;
      case 'ALARM_CHANGED':
        if ((p['level'] as number) >= 2) add('alarm');
        break;
      case 'HORDE_INCOMING':
        add('horde');
        break;
      case 'OBJECTIVE_COMPLETED':
        if (p['objectiveId'] === 'rescueCivilian') add('rescue');
        break;
      case 'EXTRACTION_STARTED':
        add('extraction');
        break;
      default:
        break;
    }
  }
  return out;
}
