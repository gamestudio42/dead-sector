import type { GameState, SimEvent } from '@dead-sector/sim';
import { MT } from '../ui/i18n';

/** A contextual hint, shown once per profile the first time its situation happens. */
export interface Tip {
  id: string;
  title: string;
  text: string;
}

const TIPS: Record<string, () => Omit<Tip, 'id'>> = {
  select: () => ({
    title: 'Comando',
    text: 'Selecione um esquadrão (1/2, clique ou arraste uma caixa) e clique com o botão direito no chão para mover. Espaço pausa a qualquer momento — ordens dadas em pausa são cumpridas ao retomar.',
  }),
  sneak: () => ({
    title: 'Silêncio',
    text: 'Q deixa o esquadrão furtivo: mais lento, muito mais silencioso. Os anéis no chão mostram até onde cada som chega.',
  }),
  contact: () => ({
    title: 'Contato',
    text: 'Infectados só reagem ao que veem e ouvem. Fique fora do campo de visão e evite barulho — ou clique direito sobre um deles para atacar.',
  }),
  noise: () => ({
    title: 'Tiros chamam atenção',
    text: 'Cada disparo é ouvido longe e eleva o alerta do bairro. F troca a disciplina de fogo: responder, livre ou cessar.',
  }),
  locked: () => ({
    title: 'Porta trancada',
    text: 'Clique direito na porta para arrombar. Leva tempo e faz barulho; o mecânico é o mais rápido.',
  }),
  bite: () => ({
    title: 'Mordida',
    text: 'Quem é mordido se transforma em poucos minutos. Mantenha o socorrista a até 4 m para ganhar tempo.',
  }),
  panic: () => ({
    title: 'Pânico',
    text: 'Em pânico, o sobrevivente ignora ordens até se recompor. Um líder por perto e menos ameaças à vista ajudam.',
  }),
  alarm: () => ({
    title: 'Bairro em alerta',
    text: 'Com o alerta alto chegam mais corredores — e em "Caçada", uma horda. Pare de atirar por um tempo para o bairro se acalmar.',
  }),
  horde: () => ({
    title: 'Horda a caminho',
    text: 'Evite as avenidas por onde ela vai passar, barrique portas (B com o cursor sobre a porta) ou termine o trabalho depressa.',
  }),
  rescue: () => ({
    title: 'Escolta',
    text: `${MT.person.charAt(0).toUpperCase()}${MT.person.slice(1)} segue a equipe a pé e não luta. Se morrer, a missão fracassa — mantenha atrás do grupo.`,
  }),
  extraction: () => ({
    title: 'Extração',
    text: 'O rádio atrai infectados enquanto transmite. Segurem a área até o transporte chegar.',
  }),
  orders: () => ({
    title: 'Planejar',
    text: 'Shift + clique direito enfileira pontos de passagem; Ctrl + clique direito abre o menu de ordens no local.',
  }),
};

export function tip(id: string): Tip | null {
  const t = TIPS[id];
  return t ? { id, ...t() } : null;
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
