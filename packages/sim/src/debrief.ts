import type { GameState, MissionStatus } from './model/types';

export interface DebriefSurvivorLine {
  id: string;
  name: string;
  role: string;
  squadId: string | null;
  status: 'extracted' | 'alive' | 'dead';
  health: number;
  wounded: boolean;
  bitten: boolean;
  infection: string;
  kills: number;
  shotsFired: number;
}

export interface Debrief {
  outcome: MissionStatus;
  reason: string | null;
  durationSeconds: number;
  extracted: number;
  dead: number;
  wounded: number;
  ammoUsed: number;
  totalNoise: number;
  medicineRecovered: boolean;
  civilianExtracted: boolean;
  zombiesKilled: number;
  shotsFired: number;
  hitRate: number;
  panicEvents: number;
  reinforcements: number;
  survivors: DebriefSurvivorLine[];
}

export function buildDebrief(state: GameState): Debrief {
  const lines: DebriefSurvivorLine[] = state.survivors.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    squadId: s.squadId,
    status: s.extracted ? 'extracted' : s.alive ? 'alive' : 'dead',
    health: Math.max(0, Math.round(s.health)),
    wounded: s.alive && s.health < s.maxHealth,
    bitten: s.bitten,
    infection: s.infection,
    kills: s.kills,
    shotsFired: s.shotsFired,
  }));
  const civ = state.survivors.find((s) => s.isObjectiveCivilian);
  return {
    outcome: state.mission.status,
    reason: state.mission.endReason,
    durationSeconds: Math.round((state.mission.endedAtTick ?? state.tick) / 10),
    extracted: lines.filter((l) => l.status === 'extracted').length,
    dead: lines.filter((l) => l.status === 'dead').length,
    wounded: lines.filter((l) => l.wounded || l.bitten).length,
    ammoUsed: state.stats.ammoUsed,
    totalNoise: Math.round(state.stats.totalNoise),
    medicineRecovered: state.mission.medicineCollected,
    civilianExtracted: !!civ?.extracted,
    zombiesKilled: state.stats.zombiesKilled,
    shotsFired: state.stats.shotsFired,
    hitRate: state.stats.shotsFired ? state.stats.hits / state.stats.shotsFired : 0,
    panicEvents: state.stats.panicEvents,
    reinforcements: state.mission.reinforcementsSpawned,
    survivors: lines,
  };
}
