import type { ContentBundle } from '@dead-sector/content';
import type { GameState, InfectionStage, MissionStatus } from '../model/types';

/** What one survivor brings from mission to mission. */
export interface RosterEntry {
  templateId: string;
  alive: boolean;
  health: number;
  infection: InfectionStage;
  bitten: boolean;
  /** Rounds carried (magazine + reserve); melee weapons ignore it. */
  ammo: number;
  kills: number;
  missionsSurvived: number;
}

export interface MissionRecordEntry {
  missionId: string;
  outcome: MissionStatus;
  deaths: string[];
  rescued: string | null;
  /** Client-side identity of the finished run, so it is never applied twice. */
  key?: string;
}

export interface CampaignState {
  version: 1;
  campaignId: string;
  /** Index into the campaign's mission list of the next mission to play. */
  missionIndex: number;
  roster: RosterEntry[];
  /** Treatment doses: each cures one infected survivor between missions. */
  supplies: number;
  rescued: string[];
  history: MissionRecordEntry[];
  status: 'active' | 'won' | 'lost';
}

/** Lines shown on the interlude screen, in PT-BR (player-facing). */
export interface InterludeReport {
  lines: string[];
  turnedOvernight: string[];
  cured: string[];
}

const NEXT_STAGE: Record<InfectionStage, InfectionStage | 'turn'> = {
  healthy: 'healthy',
  exposed: 'infected',
  infected: 'critical',
  critical: 'turn',
};

function templatesFor(content: ContentBundle, campaignId: string): string[] {
  const c = content.campaigns[campaignId];
  if (!c) throw new Error(`Unknown campaign ${campaignId}`);
  const first = content.missions[c.missions[0]?.missionId ?? ''];
  if (!first) throw new Error(`Campaign ${campaignId} has no first mission`);
  return first.squads.flatMap((s) => s.memberIds);
}

export function newCampaign(content: ContentBundle, campaignId: string): CampaignState {
  const roster = templatesFor(content, campaignId).map((templateId) => {
    const t = content.survivors[templateId];
    if (!t) throw new Error(`Unknown survivor ${templateId}`);
    const w = content.weapons[t.weaponId];
    return {
      templateId,
      alive: true,
      health: t.maxHealth,
      infection: 'healthy' as InfectionStage,
      bitten: false,
      ammo: (w?.magazineCapacity ?? 0) + t.reserveRounds,
      kills: 0,
      missionsSurvived: 0,
    };
  });
  return {
    version: 1,
    campaignId,
    missionIndex: 0,
    roster,
    supplies: 0,
    rescued: [],
    history: [],
    status: 'active',
  };
}

export function currentMissionId(content: ContentBundle, c: CampaignState): string | null {
  return content.campaigns[c.campaignId]?.missions[c.missionIndex]?.missionId ?? null;
}

/** Carry-over handed to `createMissionState`: who deploys and in what condition. */
export type CarryOver = Record<string, Omit<RosterEntry, 'templateId' | 'missionsSurvived'>>;

export function carryOver(c: CampaignState): CarryOver {
  const out: CarryOver = {};
  for (const r of c.roster)
    out[r.templateId] = {
      alive: r.alive,
      health: r.health,
      infection: r.infection,
      bitten: r.bitten,
      ammo: r.ammo,
      kills: r.kills,
    };
  return out;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

/**
 * Folds a finished mission into the campaign: losses persist whatever the outcome; success or
 * partial success advances, failure means retrying the same mission with whoever is left.
 * Between missions: wounds partly heal, ammo is partly found, supplies cure the most advanced
 * infections first, and every untreated infection advances one stage (critical survivors turn).
 */
export function applyMissionResult(
  content: ContentBundle,
  campaign: CampaignState,
  final: GameState,
): { campaign: CampaignState; report: InterludeReport } {
  const def = content.campaigns[campaign.campaignId];
  if (!def) throw new Error(`Unknown campaign ${campaign.campaignId}`);
  const step = def.missions[campaign.missionIndex];
  const next = JSON.parse(JSON.stringify(campaign)) as CampaignState;
  const lines: string[] = [];
  const deaths: string[] = [];
  const outcome = final.mission.status;
  const success = outcome === 'success' || outcome === 'partial';

  for (const r of next.roster) {
    if (!r.alive) continue;
    const s = final.survivors.find((x) => x.templateId === r.templateId && x.squadId !== null);
    if (!s) continue; // did not deploy
    r.kills = s.kills;
    if (!s.alive) {
      r.alive = false;
      r.health = 0;
      deaths.push(s.name);
      lines.push(`${s.name} não voltou.`);
      continue;
    }
    // left behind on a successful extraction counts as lost too
    if (success && !s.extracted) {
      r.alive = false;
      deaths.push(s.name);
      lines.push(`${s.name} ficou para trás.`);
      continue;
    }
    r.health = Math.max(1, Math.round(s.health));
    r.infection = s.infection;
    r.bitten = s.bitten;
    r.ammo = s.weapon.magazineCapacity > 0 ? s.weapon.magazineRounds + s.weapon.reserveRounds : 0;
    r.missionsSurvived += 1;
  }

  const civ = final.survivors.find((s) => s.isObjectiveCivilian);
  const rescued = civ?.extracted ? civ.name : null;
  if (rescued) {
    next.rescued.push(rescued);
    lines.push(`${rescued} está a salvo no abrigo.`);
  }
  if (success && final.mission.medicineCollected && step) {
    next.supplies += step.rewardSupplies;
    if (step.rewardSupplies > 0)
      lines.push(`+${step.rewardSupplies} doses de tratamento recuperadas.`);
  }
  next.history.push({ missionId: final.missionId, outcome, deaths, rescued });

  // ---- the night between missions
  const cured: string[] = [];
  const turnedOvernight: string[] = [];
  const order: InfectionStage[] = ['critical', 'infected', 'exposed'];
  for (const stage of order)
    for (const r of next.roster) {
      if (!r.alive || r.infection !== stage || next.supplies <= 0) continue;
      next.supplies -= 1;
      r.infection = 'healthy';
      r.bitten = false;
      cured.push(nameOf(content, r.templateId));
    }
  for (const name of cured) lines.push(`Tratamento aplicado em ${name}: infecção eliminada.`);
  for (const r of next.roster) {
    if (!r.alive || r.infection === 'healthy') continue;
    const stage = NEXT_STAGE[r.infection];
    const name = nameOf(content, r.templateId);
    if (stage === 'turn') {
      r.alive = false;
      turnedOvernight.push(name);
      lines.push(`${name} se transformou durante a noite.`);
    } else {
      r.infection = stage;
      lines.push(`${name} piorou: infecção ${STAGE_PT[stage]}.`);
    }
  }
  for (const r of next.roster) {
    if (!r.alive) continue;
    const t = content.survivors[r.templateId];
    if (!t) continue;
    const before = r.health;
    r.health = Math.min(t.maxHealth, r.health + Math.round(t.maxHealth * def.healFraction));
    if (r.health > before && before < t.maxHealth)
      lines.push(`${firstName(t.name)} se recuperou (vida ${before} → ${r.health}).`);
    const w = content.weapons[t.weaponId];
    if (w && w.magazineCapacity > 0)
      r.ammo = Math.min(
        w.magazineCapacity + t.reserveRounds,
        r.ammo + Math.round(t.reserveRounds * def.ammoResupplyFraction),
      );
  }

  const anyAlive = next.roster.some((r) => r.alive);
  if (!anyAlive) next.status = 'lost';
  else if (success) {
    next.missionIndex += 1;
    if (next.missionIndex >= def.missions.length) next.status = 'won';
  }
  return { campaign: next, report: { lines, turnedOvernight, cured } };
}

const STAGE_PT: Record<InfectionStage, string> = {
  healthy: 'nenhuma',
  exposed: 'exposto',
  infected: 'infectado',
  critical: 'crítica',
};

function nameOf(content: ContentBundle, templateId: string): string {
  return content.survivors[templateId]?.name ?? templateId;
}
