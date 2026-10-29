import type { GameState, SimEvent, Survivor, Vec2 } from '@dead-sector/sim';

/** A short spoken line shown above a survivor. Higher priority pre-empts lower ones. */
export interface Bark {
  survivorId: string;
  text: string;
  priority: 1 | 2 | 3 | 4;
}

const ORDER_LINES: Record<string, string[]> = {
  move: ['Entendido.', 'Em movimento.', 'Vamos.', 'Certo, andando.'],
  hold: ['Segurando aqui.', 'Posição.', 'Ninguém passa.'],
  hide: ['Abaixem-se!', 'Escondam-se.', 'Silêncio, todo mundo.'],
  retreat: ['Recuar!', 'Para trás, agora!', 'Saindo daqui!'],
  regroup: ['Comigo!', 'Reagrupar.', 'Juntos, pessoal.'],
  attack: ['Fogo nele!', 'Derrubem esse!', 'Concentrar fogo!'],
  interact: ['Deixa comigo.', 'Me cubram.', 'Já vou.'],
};

const SPOT_WALKER = ['Contato!', 'Infectado à frente.', 'Tem um ali.', 'Olha lá...'];
const SPOT_RUNNER = ['Corredor!', 'Um rápido vindo!', 'Esse aí corre!'];
const NO_AMMO = ['Estou sem munição!', 'Acabou a munição!', 'Seco! Sem bala!'];
const BITTEN = ['Ele me mordeu!', 'Aaah! Mordida!', 'Me pegou!'];
const HURT = ['Fui atingido!', 'Argh!', 'Tô ferido!'];
const PANIC_FLEE = ['Não dá! Tô fora!', 'Eu não fico aqui!', 'Corre, corre!'];
const PANIC_FREEZE = ['Não consigo me mexer...', 'Não, não, não...', 'Eu… não…'];
const RALLY = ['Tá... estou bem.', 'Voltei. Vamos.', 'Respira... certo.'];
const NEW_LEADER = ['Eu assumo o comando!', 'Comigo agora!'];

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
        const lines = ORDER_LINES[p['orderType'] as string];
        if (squad && lines) say(surv(squad.leaderId), lines, e.id, 1);
        break;
      }
      case 'ENEMY_SPOTTED':
        if (!p['reacquired'])
          say(
            nearestSquadMember(state, { x: p['x'] as number, y: p['y'] as number }),
            p['typeId'] === 'runner' ? SPOT_RUNNER : SPOT_WALKER,
            e.id,
            p['typeId'] === 'runner' ? 3 : 2,
          );
        break;
      case 'OUT_OF_AMMO':
        say(surv(p['survivorId']), NO_AMMO, e.id, 3);
        break;
      case 'ACTOR_INJURED':
        say(surv(p['actorId']), p['bitten'] ? BITTEN : HURT, e.id, p['bitten'] ? 4 : 3);
        break;
      case 'ACTOR_KILLED': {
        if (p['kind'] !== 'survivor') break;
        const dead = surv(p['actorId']);
        if (!dead) break;
        const line = dead.isObjectiveCivilian
          ? ['A civil caiu!', 'Perdemos a civil!']
          : [`Perdemos ${firstName(dead)}!`, `Não! ${firstName(dead)}!`];
        say(nearestSquadMember(state, dead.position, dead.id), line, e.id, 4);
        break;
      }
      case 'SURVIVOR_PANICKED':
        say(surv(p['survivorId']), p['behaviour'] === 'flee' ? PANIC_FLEE : PANIC_FREEZE, e.id, 4);
        break;
      case 'SURVIVOR_RALLIED':
        say(surv(p['survivorId']), RALLY, e.id, 2);
        break;
      case 'LEADER_CHANGED':
        say(surv(p['leaderId']), NEW_LEADER, e.id, 3);
        break;
      case 'OBJECTIVE_COMPLETED': {
        const id = p['objectiveId'] as string;
        if (id === 'rescueCivilian') {
          const civ = state.survivors.find((s) => s.isObjectiveCivilian);
          say(
            civ,
            ['Graças a Deus... eu vou com vocês.', 'Vocês vieram! Vamos embora daqui.'],
            e.id,
            3,
          );
        } else if (id === 'collectMedicine') {
          const c =
            state.survivors.find((s) => s.alive && s.interaction?.targetId === 'cabinet') ??
            state.survivors.find((s) => s.alive && s.isLeader);
          say(c, ['Peguei os remédios!', 'Remédios na mochila.'], e.id, 3);
        }
        break;
      }
      case 'EXTRACTION_STARTED':
        say(
          surv(p['survivorId']),
          ['Rádio ligado. Agora é aguentar!', 'Chamando resgate... segurem!'],
          e.id,
          3,
        );
        break;
      default:
        break;
    }
  }
  return out;
}
