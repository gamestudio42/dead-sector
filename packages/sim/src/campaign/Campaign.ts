import type { CampaignDef, ContentBundle } from '@dead-sector/content';
import { SeededRng, seedToRngState } from '../engine/SeededRng';
import type { GameState, InfectionStage, MissionStatus } from '../model/types';
import { STANDARD_VARIANT, type MissionVariant } from '../mission/createMission';

/** What one survivor brings from mission to mission. */
export interface RosterEntry {
  /** Unique in the campaign; the template id for the original squads. */
  id: string;
  /** Stats, weapon and look. Recruits share one template. */
  templateId: string;
  name: string;
  /** Squad this survivor deploys with; null stays in the shelter. */
  squadId: string | null;
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

export interface Stock {
  food: number;
  medicine: number;
  ammo: number;
  parts: number;
}

export type SectorStatus = 'unknown' | 'infested' | 'contested' | 'secured' | 'lost';

export interface SectorState {
  /** Infected density, 0–100. */
  infestation: number;
  /** Heat left by noise: draws infected from the neighbours, halves every day. */
  noise: number;
  revealed: boolean;
  /** Overrun for good: no more operations, and its reward is gone. */
  lost: boolean;
  /** The full reward was already taken; later runs pay half. */
  looted: boolean;
}

/**
 * Something the shelter should tell the player. The simulation stores the kind and the numbers;
 * the interface writes the sentence in the chosen language. `legacy` is a sentence already
 * written by an older version.
 */
export type CampaignNotice =
  | { kind: 'legacy'; text: string }
  | { kind: 'did-not-return'; name: string }
  | { kind: 'left-behind'; name: string }
  | { kind: 'rescued-safe'; name: string }
  | {
      kind: 'brought';
      food: number;
      medicine: number;
      ammo: number;
      parts: number;
      people: number;
    }
  | {
      kind: 'scavenged';
      caches: number;
      food: number;
      medicine: number;
      ammo: number;
      parts: number;
    }
  | { kind: 'convoy'; count: number }
  | { kind: 'noise-heat'; sector: string }
  | { kind: 'sector-lost'; sector: string }
  | { kind: 'infected-returned'; sector: string }
  | { kind: 'shelter-surrounded'; sector: string }
  | { kind: 'siege-raised'; sector: string }
  | { kind: 'siege-broken'; sector: string }
  | { kind: 'shelter-breached'; sector: string; lost: number }
  | { kind: 'treated'; name: string }
  | { kind: 'turned'; name: string }
  | { kind: 'worsened'; name: string; stage: InfectionStage }
  | { kind: 'starved'; lost: number }
  | { kind: 'no-food' }
  | { kind: 'recovered'; name: string; before: number; after: number }
  | { kind: 'ammo-short' }
  | { kind: 'recruited'; name: string }
  | { kind: 'rounds-returned'; count: number };

/** Why a campaign ended. `legacy` keeps a sentence saved by an older version. */
export type CampaignEnd =
  | { kind: 'legacy'; text: string }
  | { kind: 'evacuated'; count: number }
  | { kind: 'no-fighters' }
  | { kind: 'shelter-lost' }
  | { kind: 'route-lost' }
  | { kind: 'deadline' };

/** Why an operation cannot start. Null means it can. The interface translates the code. */
export type OperationBlock =
  | 'campaign-over'
  | 'no-plan'
  | 'unknown'
  | 'lost'
  | 'already-operated'
  | 'secured'
  | 'nobody-to-evacuate'
  | 'no-route'
  | 'siege';

/** Why nobody can be recruited now. Null means someone can. */
export type RecruitBlock = 'campaign-over' | 'no-recruits' | 'nobody' | 'today' | 'full';

/** Who deploys where for one operation, and the extra rounds per armed member of each squad. */
export interface Deployment {
  squads: Record<string, string | null>;
  extraRounds: Record<string, number>;
}

export interface CampaignState {
  version: 5;
  campaignId: string;
  seed: number;
  /** Strategic RNG, separate from every mission's. */
  rngState: number;
  day: number;
  /** One operation per day. */
  operatedToday: boolean;
  /** Sector of the operation being played, so its result is folded into the right place. */
  activeSectorId: string | null;
  /** The shelter is besieged: today's only operation is the siege mission. */
  siegePending: boolean;
  /** Sieges fought or suffered so far. */
  sieges: number;
  /** People recruited today, and in the whole campaign (which also names the next one). */
  recruitedToday: number;
  recruitsMade: number;
  roster: RosterEntry[];
  stock: Stock;
  /** People in the shelter who do not fight. */
  population: number;
  evacuated: number;
  sectors: Record<string, SectorState>;
  rescued: string[];
  history: MissionRecordEntry[];
  /** What the last operation or night did, to show again after a reload. */
  lastReport: CampaignNotice[];
  status: 'active' | 'won' | 'lost';
  endReason: CampaignEnd | null;
}

/** Notices shown after an operation or a night. */
export interface CampaignReport {
  lines: CampaignNotice[];
  turnedOvernight: string[];
}

const NEXT_STAGE: Record<InfectionStage, InfectionStage | 'turn'> = {
  healthy: 'healthy',
  exposed: 'infected',
  infected: 'critical',
  critical: 'turn',
};

function defOf(content: ContentBundle, campaignId: string): CampaignDef {
  const def = content.campaigns[campaignId];
  if (!def) throw new Error(`Unknown campaign ${campaignId}`);
  return def;
}

function templatesFor(content: ContentBundle, def: CampaignDef): string[] {
  const first = def.sectors.find((s) => s.missionId);
  const mission = first?.missionId ? content.missions[first.missionId] : undefined;
  if (!mission) throw new Error(`Campaign ${def.id} has no mission`);
  return mission.squads.flatMap((s) => s.memberIds);
}

function revealAround(def: CampaignDef, c: CampaignState): void {
  for (const sec of def.sectors) {
    const state = c.sectors[sec.id]!;
    if (sec.id === def.shelterSectorId || sectorStatus(def, c, sec.id) === 'secured')
      for (const n of [sec.id, ...sec.neighbors]) c.sectors[n]!.revealed = true;
    else if (state.lost) state.revealed = true;
  }
}

export function newCampaign(content: ContentBundle, campaignId: string, seed = 1): CampaignState {
  const def = defOf(content, campaignId);
  const roster = templatesFor(content, def).map((templateId): RosterEntry => {
    const t = content.survivors[templateId];
    if (!t) throw new Error(`Unknown survivor ${templateId}`);
    const w = content.weapons[t.weaponId];
    return {
      id: templateId,
      templateId,
      name: t.name,
      squadId: t.squadId,
      alive: true,
      health: t.maxHealth,
      infection: 'healthy',
      bitten: false,
      ammo: (w?.magazineCapacity ?? 0) + t.reserveRounds,
      kills: 0,
      missionsSurvived: 0,
    };
  });
  const { population, ...stock } = def.start;
  const c: CampaignState = {
    version: 5,
    campaignId,
    seed,
    rngState: seedToRngState(seed),
    day: 1,
    operatedToday: false,
    activeSectorId: null,
    siegePending: false,
    sieges: 0,
    recruitedToday: 0,
    recruitsMade: 0,
    roster,
    stock,
    population,
    evacuated: 0,
    sectors: Object.fromEntries(
      def.sectors.map((s) => [
        s.id,
        { infestation: s.infestation, noise: 0, revealed: false, lost: false, looted: false },
      ]),
    ),
    rescued: [],
    history: [],
    lastReport: [],
    status: 'active',
    endReason: null,
  };
  revealAround(def, c);
  return c;
}

/** Version 1 was a fixed list of three missions: those already done become secured sectors. */
const V1_ORDER = ['ferrugem', 'ferrovia', 'centro'];

function asNotices(raw: unknown): CampaignNotice[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === 'string' ? { kind: 'legacy', text: item } : (item as CampaignNotice),
  );
}

function asEnd(raw: unknown): CampaignEnd | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return { kind: 'legacy', text: raw };
  return raw as CampaignEnd;
}

/** Before version 5 a survivor was known by its template: that becomes its id, name and squad. */
function withIdentity(content: ContentBundle, r: Partial<RosterEntry>): RosterEntry {
  const t = content.survivors[r.templateId ?? ''];
  return {
    ...(r as RosterEntry),
    id: r.id ?? r.templateId ?? '',
    name: r.name ?? t?.name ?? r.templateId ?? '',
    squadId: r.squadId !== undefined ? r.squadId : (t?.squadId ?? null),
  };
}

/** Reads a stored campaign of any version; null when it cannot be used. */
export function migrateCampaign(content: ContentBundle, raw: unknown): CampaignState | null {
  const old = raw as Omit<Partial<CampaignState>, 'version'> & {
    version?: number;
    missionIndex?: number;
    supplies?: number;
  };
  if (!old || !Array.isArray(old.roster) || !old.campaignId || !content.campaigns[old.campaignId])
    return null;
  if (old.version && old.version >= 2 && old.version <= 5) {
    const current = old as CampaignState;
    return {
      ...current,
      version: 5,
      roster: current.roster.map((r) => withIdentity(content, r)),
      recruitedToday: current.recruitedToday ?? 0,
      recruitsMade: current.recruitsMade ?? 0,
      siegePending: current.siegePending ?? false,
      sieges: current.sieges ?? 0,
      lastReport: asNotices(current.lastReport),
      endReason: asEnd(current.endReason),
    };
  }
  if (old.version !== 1) return null;
  const def = defOf(content, old.campaignId);
  const history = old.history ?? [];
  const rescued = old.rescued ?? [];
  const c = newCampaign(content, old.campaignId, history.length + 1);
  c.day = history.length + 1;
  c.roster = old.roster.map((r) => withIdentity(content, r));
  c.history = history;
  c.rescued = rescued;
  c.population += rescued.length;
  c.stock.medicine = old.supplies ?? 0;
  c.status = old.status ?? 'active';
  V1_ORDER.slice(0, old.missionIndex ?? 0).forEach((id) => {
    const s = c.sectors[id];
    if (!s) return;
    s.infestation = Math.min(s.infestation, def.thresholds.securedBelow - 1);
    s.looted = true;
  });
  revealAround(def, c);
  return c;
}

export function sectorStatus(def: CampaignDef, c: CampaignState, sectorId: string): SectorStatus {
  const s = c.sectors[sectorId];
  if (!s) throw new Error(`Unknown sector ${sectorId}`);
  if (s.lost) return 'lost';
  if (sectorId === def.shelterSectorId) return 'secured';
  if (!s.revealed) return 'unknown';
  if (s.infestation < def.thresholds.securedBelow) return 'secured';
  return s.infestation >= def.thresholds.infestedFrom ? 'infested' : 'contested';
}

/** The mission an operation in this sector plays: the siege at a besieged shelter. */
export function operationMissionId(
  content: ContentBundle,
  c: CampaignState,
  sectorId: string,
): string | null {
  const def = defOf(content, c.campaignId);
  if (sectorId === def.shelterSectorId)
    return c.siegePending && def.siege ? def.siege.missionId : null;
  return def.sectors.find((s) => s.id === sectorId)?.missionId ?? null;
}

/** Why an operation cannot start in this sector right now; null when it can. */
export function operationBlockReason(
  content: ContentBundle,
  c: CampaignState,
  sectorId: string,
): OperationBlock | null {
  const def = defOf(content, c.campaignId);
  const sec = def.sectors.find((s) => s.id === sectorId);
  if (!sec) throw new Error(`Unknown sector ${sectorId}`);
  if (c.status !== 'active') return 'campaign-over';
  if (sectorId === def.shelterSectorId) {
    if (!operationMissionId(content, c, sectorId)) return 'no-plan';
    return c.operatedToday ? 'already-operated' : null;
  }
  if (c.siegePending) return 'siege';
  if (!sec.missionId) return 'no-plan';
  const status = sectorStatus(def, c, sectorId);
  if (status === 'unknown') return 'unknown';
  if (status === 'lost') return 'lost';
  if (c.operatedToday) return 'already-operated';
  if (status === 'secured' && sec.evacuates === 0) return 'secured';
  if (sec.evacuates > 0 && status === 'secured' && c.population === 0) return 'nobody-to-evacuate';
  const connected = sec.neighbors.some(
    (n) => n === def.shelterSectorId || sectorStatus(def, c, n) === 'secured',
  );
  if (!connected) return 'no-route';
  return null;
}

/** Reinforcements in a mission follow how infested its sector is on the day. */
export function reinforcementMultiplier(infestation: number): number {
  return 0.6 + infestation / 125;
}

/** How a sector's state changes the mission played there; see `MissionVariant`. */
export type OperationVariantId = 'quiet' | 'standard' | 'overrun';

export const OPERATION_VARIANTS: Record<OperationVariantId, MissionVariant> = {
  quiet: { zombieMultiplier: 0.7, hordeDelayMultiplier: 1.3 },
  standard: STANDARD_VARIANT,
  overrun: { zombieMultiplier: 1.35, hordeDelayMultiplier: 0.75 },
};

/**
 * A secured sector is quieter and an infested one is overrun. The siege is always standard: its
 * waves are the threat.
 */
export function operationVariant(
  content: ContentBundle,
  c: CampaignState,
  sectorId: string,
): OperationVariantId {
  const def = defOf(content, c.campaignId);
  if (sectorId === def.shelterSectorId) return 'standard';
  const status = sectorStatus(def, c, sectorId);
  if (status === 'secured') return 'quiet';
  if (status === 'infested') return 'overrun';
  return 'standard';
}

export function missionSeed(content: ContentBundle, c: CampaignState, missionId: string): number {
  const tries = c.history.filter((h) => h.missionId === missionId).length;
  return (content.missions[missionId]?.canonicalSeed ?? 0) + tries;
}

/**
 * Carry-over handed to `createMissionState`, by roster id: who deploys, in which squad and in what
 * condition.
 */
export type CarryOver = Record<string, Omit<RosterEntry, 'id' | 'missionsSurvived'>>;

export function carryOver(c: CampaignState): CarryOver {
  const out: CarryOver = {};
  for (const r of c.roster)
    out[r.id] = {
      templateId: r.templateId,
      name: r.name,
      squadId: r.squadId,
      alive: r.alive,
      health: r.health,
      infection: r.infection,
      bitten: r.bitten,
      ammo: r.ammo,
      kills: r.kills,
    };
  return out;
}

/** How many survivors each squad of a mission fields. */
export function squadSlots(content: ContentBundle, missionId: string): Record<string, number> {
  const mission = content.missions[missionId];
  if (!mission) throw new Error(`Unknown mission ${missionId}`);
  return Object.fromEntries(mission.squads.map((sq) => [sq.id, sq.memberIds.length]));
}

/** Rounds a survivor's weapon holds when fully loaded (magazine + standard reserve). */
export function fullLoad(content: ContentBundle, templateId: string): number {
  const t = content.survivors[templateId];
  const w = t ? content.weapons[t.weaponId] : undefined;
  return w && w.magazineCapacity > 0 ? w.magazineCapacity + t!.reserveRounds : 0;
}

/** Stock rounds a deployment draws: its extra rounds for every armed member who goes. */
export function deploymentCost(content: ContentBundle, c: CampaignState, d: Deployment): number {
  let cost = 0;
  for (const r of c.roster) {
    const squad = d.squads[r.id];
    if (!r.alive || !squad || fullLoad(content, r.templateId) === 0) continue;
    cost += d.extraRounds[squad] ?? 0;
  }
  return cost;
}

/** Why a deployment cannot go; null when it can. */
export type DeploymentBlock = 'nobody' | 'squad-full' | 'rounds' | 'not-enough-ammo';

export function deploymentBlockReason(
  content: ContentBundle,
  c: CampaignState,
  missionId: string,
  d: Deployment,
): DeploymentBlock | null {
  const def = defOf(content, c.campaignId);
  const slots = squadSlots(content, missionId);
  const count: Record<string, number> = {};
  for (const r of c.roster) {
    const squad = d.squads[r.id];
    if (!r.alive || !squad) continue;
    if (!(squad in slots)) return 'squad-full';
    count[squad] = (count[squad] ?? 0) + 1;
  }
  if (!Object.keys(count).length) return 'nobody';
  if (Object.entries(count).some(([sq, n]) => n > slots[sq]!)) return 'squad-full';
  const step = def.recruits?.extraRoundsStep ?? 1;
  const max = def.recruits?.extraRoundsMax ?? 0;
  if (Object.values(d.extraRounds).some((v) => v < 0 || v > max || v % step !== 0)) return 'rounds';
  if (deploymentCost(content, c, d) > c.stock.ammo) return 'not-enough-ammo';
  return null;
}

/** The squads as the roster stands: each survivor's last squad, extra rounds at zero. */
export function currentDeployment(c: CampaignState): Deployment {
  return {
    squads: Object.fromEntries(c.roster.filter((r) => r.alive).map((r) => [r.id, r.squadId])),
    extraRounds: {},
  };
}

/**
 * Sends the squads out: everyone's squad is remembered for the next operation, and the extra
 * rounds move from the stock to the armed members who go. Null when the deployment is invalid.
 */
export function deploy(
  content: ContentBundle,
  campaign: CampaignState,
  missionId: string,
  d: Deployment,
): CampaignState | null {
  if (deploymentBlockReason(content, campaign, missionId, d)) return null;
  const next = clone(campaign);
  next.stock.ammo -= deploymentCost(content, campaign, d);
  for (const r of next.roster) {
    if (!r.alive || !(r.id in d.squads)) continue;
    r.squadId = d.squads[r.id] ?? null;
    if (r.squadId && fullLoad(content, r.templateId) > 0) r.ammo += d.extraRounds[r.squadId] ?? 0;
  }
  return next;
}

export function recruitBlockReason(content: ContentBundle, c: CampaignState): RecruitBlock | null {
  const rec = defOf(content, c.campaignId).recruits;
  if (c.status !== 'active') return 'campaign-over';
  if (!rec) return 'no-recruits';
  if (c.population <= 0) return 'nobody';
  if (c.recruitedToday >= rec.perDay) return 'today';
  if (c.roster.filter((r) => r.alive).length >= rec.maxRoster) return 'full';
  return null;
}

/**
 * One person of the shelter takes up arms: one fewer to evacuate, one more fighter to feed the
 * same. Their rounds come from the stock. They join the squad with fewer people, if it has room.
 */
export function recruit(content: ContentBundle, campaign: CampaignState): CampaignState | null {
  if (recruitBlockReason(content, campaign)) return null;
  const def = defOf(content, campaign.campaignId);
  const rec = def.recruits!;
  const t = content.survivors[rec.templateId]!;
  const next = clone(campaign);
  const n = next.recruitsMade;
  const name =
    rec.names[n % rec.names.length]! +
    (n >= rec.names.length ? ` ${Math.floor(n / rec.names.length) + 1}` : '');
  const first = def.sectors.find((s) => s.missionId)?.missionId;
  const slots = first ? squadSlots(content, first) : {};
  const size = (sq: string) => next.roster.filter((r) => r.alive && r.squadId === sq).length;
  const squad =
    Object.keys(slots)
      .filter((sq) => size(sq) < slots[sq]!)
      .sort((a, b) => size(a) - size(b) || (a < b ? -1 : 1))[0] ?? null;
  const ammo = Math.min(fullLoad(content, t.id), next.stock.ammo);
  next.stock.ammo -= ammo;
  next.population -= 1;
  next.recruitedToday += 1;
  next.recruitsMade += 1;
  next.roster.push({
    id: `recruit-${n + 1}`,
    templateId: t.id,
    name,
    squadId: squad,
    alive: true,
    health: t.maxHealth,
    infection: 'healthy',
    bitten: false,
    ammo,
    kills: 0,
    missionsSurvived: 0,
  });
  next.lastReport = [...next.lastReport, { kind: 'recruited', name }];
  return next;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;
const clone = (c: CampaignState) => JSON.parse(JSON.stringify(c)) as CampaignState;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

function checkEnd(def: CampaignDef, c: CampaignState): void {
  if (c.status !== 'active') return;
  if (c.evacuated >= def.victory.evacuateGoal) {
    c.status = 'won';
    c.endReason = { kind: 'evacuated', count: c.evacuated };
  } else if (!c.roster.some((r) => r.alive)) {
    c.status = 'lost';
    c.endReason = { kind: 'no-fighters' };
  } else if (c.sectors[def.shelterSectorId]!.lost) {
    c.status = 'lost';
    c.endReason = { kind: 'shelter-lost' };
  } else if (!def.sectors.some((s) => s.evacuates > 0 && !c.sectors[s.id]!.lost)) {
    c.status = 'lost';
    c.endReason = { kind: 'route-lost' };
  } else if (c.day > def.victory.deadlineDays) {
    c.status = 'lost';
    c.endReason = { kind: 'deadline' };
  }
}

/**
 * Folds a finished operation into the campaign: losses persist whatever the outcome, the sector
 * gets cleaner or worse, its reward enters the stock and the noise made stays as heat there.
 * Time only passes in `endDay`, so the player can still treat people first.
 */
export function applyOperationResult(
  content: ContentBundle,
  campaign: CampaignState,
  sectorId: string,
  final: GameState,
): { campaign: CampaignState; report: CampaignReport } {
  const def = defOf(content, campaign.campaignId);
  const sec = def.sectors.find((s) => s.id === sectorId);
  if (!sec) throw new Error(`Unknown sector ${sectorId}`);
  const next = clone(campaign);
  const state = next.sectors[sectorId]!;
  const lines: CampaignNotice[] = [];
  const deaths: string[] = [];
  const outcome = final.mission.status;
  const success = outcome === 'success' || outcome === 'partial';
  const siege = sectorId === def.shelterSectorId && next.siegePending ? def.siege : undefined;

  for (const r of next.roster) {
    if (!r.alive) continue;
    const s = final.survivors.find((x) => x.id === r.id && x.squadId !== null);
    if (!s) continue; // did not deploy
    r.kills = s.kills;
    if (!s.alive) {
      r.alive = false;
      r.health = 0;
      deaths.push(s.name);
      lines.push({ kind: 'did-not-return', name: s.name });
      continue;
    }
    // left behind on a successful extraction counts as lost too
    if (success && !s.extracted) {
      r.alive = false;
      deaths.push(s.name);
      lines.push({ kind: 'left-behind', name: s.name });
      continue;
    }
    r.health = Math.max(1, Math.round(s.health));
    r.infection = s.infection;
    r.bitten = s.bitten;
    r.ammo = s.weapon.magazineCapacity > 0 ? s.weapon.magazineRounds + s.weapon.reserveRounds : 0;
    r.missionsSurvived += 1;
  }

  const civ = final.survivors.find((s) => s.isObjectiveCivilian);
  // in a siege the civilian already lives in the shelter: nobody new arrives, but a death counts
  const rescued = civ?.extracted && !siege ? civ.name : null;
  if (siege && civ && !civ.alive) {
    next.population = Math.max(0, next.population - 1);
    lines.push({ kind: 'did-not-return', name: civ.name });
  }
  if (rescued) {
    next.rescued.push(rescued);
    next.population += 1;
    lines.push({ kind: 'rescued-safe', name: rescued });
  }
  if (success && final.mission.medicineCollected) {
    const pay = (v: number) => (state.looted ? Math.floor(v / 2) : v);
    const { food, medicine, ammo, parts, people } = sec.reward;
    const got = { food: pay(food), medicine: pay(medicine), ammo: pay(ammo), parts: pay(parts) };
    next.stock.food += got.food;
    next.stock.medicine += got.medicine;
    next.stock.ammo += got.ammo;
    next.stock.parts += got.parts;
    next.population += pay(people);
    state.looted = true;
    const brought = pay(people);
    if (got.food || got.medicine || got.ammo || got.parts || brought)
      lines.push({ kind: 'brought', ...got, people: brought });
  }
  const scavenge = content.missions[final.missionId]?.objectives.scavenge;
  if (success && scavenge && final.mission.cachesSearched.length) {
    // whatever was searched comes home in the packs, full value every time
    const got = { food: 0, medicine: 0, ammo: 0, parts: 0 };
    for (const k of scavenge.caches) {
      if (!final.mission.cachesSearched.includes(k.id)) continue;
      got.food += k.loot.food;
      got.medicine += k.loot.medicine;
      got.ammo += k.loot.ammo;
      got.parts += k.loot.parts;
    }
    next.stock.food += got.food;
    next.stock.medicine += got.medicine;
    next.stock.ammo += got.ammo;
    next.stock.parts += got.parts;
    lines.push({ kind: 'scavenged', caches: final.mission.cachesSearched.length, ...got });
  }
  if (success && sec.evacuates > 0) {
    const moved = Math.min(sec.evacuates, next.population);
    next.population -= moved;
    next.evacuated += moved;
    if (moved) lines.push({ kind: 'convoy', count: moved });
  }
  const effectKey = success ? (outcome === 'success' ? 'success' : 'partial') : 'failed';
  if (siege) {
    next.siegePending = false;
    next.sieges += 1;
    if (success) {
      state.infestation = clamp(state.infestation + siege.effect[effectKey]);
      lines.push({ kind: 'siege-broken', sector: sec.displayName });
    } else breach(def, next, lines);
    // the fight was at home: its noise is the horde already there, not heat that draws more
  } else {
    state.infestation = clamp(state.infestation + def.operationEffect[effectKey]);
    const heat = Math.round(final.stats.totalNoise / def.migration.noisePerHeat);
    state.noise += heat;
    if (heat >= 10) lines.push({ kind: 'noise-heat', sector: sec.displayName });
  }

  next.history.push({ missionId: final.missionId, outcome, deaths, rescued });
  next.operatedToday = true;
  next.activeSectorId = null;
  revealAround(def, next);
  checkEnd(def, next);
  next.lastReport = lines;
  return { campaign: next, report: { lines, turnedOvernight: [] } };
}

/** A siege lost or not fought: the infected get into the shelter and take people with them. */
function breach(def: CampaignDef, c: CampaignState, lines: CampaignNotice[]): void {
  const siege = def.siege;
  if (!siege) return;
  const shelter = def.sectors.find((s) => s.id === def.shelterSectorId)!;
  const lost = Math.min(c.population, siege.breachLoss);
  c.population -= lost;
  const s = c.sectors[shelter.id]!;
  s.infestation = clamp(s.infestation + siege.effect.failed);
  lines.push({ kind: 'shelter-breached', sector: shelter.displayName, lost });
}

/** Spends one dose on one survivor; null when it cannot be done. */
export function treatInfection(
  content: ContentBundle,
  campaign: CampaignState,
  rosterId: string,
): CampaignState | null {
  const r = campaign.roster.find((x) => x.id === rosterId);
  if (!r || !r.alive || r.infection === 'healthy' || campaign.stock.medicine <= 0) return null;
  const next = clone(campaign);
  const t = next.roster.find((x) => x.id === rosterId)!;
  t.infection = 'healthy';
  t.bitten = false;
  next.stock.medicine -= 1;
  next.lastReport = [...next.lastReport, { kind: 'treated', name: t.name }];
  return next;
}

/** Infected move along the connections: towards emptier sectors and towards noise. */
function migrate(
  def: CampaignDef,
  c: CampaignState,
  rng: SeededRng,
  lines: CampaignNotice[],
): void {
  const m = def.migration;
  const before = Object.fromEntries(
    def.sectors.map((s) => [s.id, sectorStatus(def, c, s.id)]),
  ) as Record<string, SectorStatus>;
  const delta: Record<string, number> = {};
  const add = (id: string, v: number) => (delta[id] = (delta[id] ?? 0) + v);
  for (const sec of def.sectors) {
    const here = c.sectors[sec.id]!;
    add(sec.id, sec.growth + rng.int(0, m.jitter));
    for (const n of sec.neighbors) {
      const there = c.sectors[n]!;
      // each connection is listed on both ends; only the higher side pushes
      const flow = Math.round((here.infestation - there.infestation) * m.flowRate);
      if (flow > 0) {
        add(sec.id, -flow);
        add(n, flow);
      }
      const drawn = Math.min(there.infestation, Math.round(here.noise * m.noiseDraw));
      if (drawn > 0) {
        add(n, -drawn);
        add(sec.id, drawn);
      }
    }
  }
  for (const sec of def.sectors) {
    const s = c.sectors[sec.id]!;
    const peak = s.infestation;
    s.infestation = clamp(s.infestation + (delta[sec.id] ?? 0));
    s.noise = Math.floor(s.noise / 2);
    if (!s.lost && Math.max(peak, s.infestation) >= 100) {
      s.lost = true;
      s.revealed = true;
      lines.push({ kind: 'sector-lost', sector: sec.displayName });
      continue;
    }
    const now = sectorStatus(def, c, sec.id);
    if (sec.id !== def.shelterSectorId && before[sec.id] === 'secured' && now !== 'secured')
      lines.push({ kind: 'infected-returned', sector: sec.displayName });
  }
  const shelter = def.sectors.find((s) => s.id === def.shelterSectorId)!;
  if (c.sectors[shelter.id]!.infestation >= def.thresholds.infestedFrom)
    lines.push({ kind: 'shelter-surrounded', sector: shelter.displayName });
}

/**
 * The night: everyone eats, wounds heal, the squads rearm from the stock, untreated infections
 * advance and the infected move on the map. Ends the campaign when the deadline runs out.
 */
export function endDay(
  content: ContentBundle,
  campaign: CampaignState,
): { campaign: CampaignState; report: CampaignReport } {
  const def = defOf(content, campaign.campaignId);
  const next = clone(campaign);
  const rng = new SeededRng(next);
  const lines: CampaignNotice[] = [];
  const turnedOvernight: string[] = [];

  if (next.siegePending) {
    // nobody went to the school: the siege happens anyway
    next.siegePending = false;
    next.sieges += 1;
    breach(def, next, lines);
  }

  for (const r of next.roster) {
    if (!r.alive || r.infection === 'healthy') continue;
    const stage = NEXT_STAGE[r.infection];
    const name = r.name;
    if (stage === 'turn') {
      r.alive = false;
      turnedOvernight.push(name);
      lines.push({ kind: 'turned', name });
    } else {
      r.infection = stage;
      lines.push({ kind: 'worsened', name, stage });
    }
  }

  const fighters = next.roster.filter((r) => r.alive).length;
  const need = Math.ceil((next.population + fighters) / def.peoplePerFood);
  if (next.stock.food >= need) next.stock.food -= need;
  else {
    next.stock.food = 0;
    // whoever does not fight gives way first: the hungry leave or do not wake up
    const lost = Math.min(next.population, 1 + Math.floor((need - campaign.stock.food) / 2));
    next.population -= lost;
    lines.push(lost ? { kind: 'starved', lost } : { kind: 'no-food' });
  }

  let shortOfAmmo = false;
  let returned = 0;
  for (const r of next.roster) {
    if (!r.alive) continue;
    const t = content.survivors[r.templateId];
    if (!t) continue;
    const before = r.health;
    r.health = Math.min(t.maxHealth, r.health + Math.round(t.maxHealth * def.healFraction));
    if (r.health > before && before < t.maxHealth)
      lines.push({ kind: 'recovered', name: firstName(r.name), before, after: r.health });
    const w = content.weapons[t.weaponId];
    if (w && w.magazineCapacity > 0) {
      const missing = w.magazineCapacity + t.reserveRounds - r.ammo;
      if (missing < 0) {
        // extra rounds taken out and not fired go back to the stock
        r.ammo += missing;
        next.stock.ammo -= missing;
        returned -= missing;
        continue;
      }
      const taken = Math.min(next.stock.ammo, missing);
      if (taken < missing) shortOfAmmo = true;
      if (taken > 0) {
        r.ammo += taken;
        next.stock.ammo -= taken;
      }
    }
  }

  if (shortOfAmmo) lines.push({ kind: 'ammo-short' });
  if (returned) lines.push({ kind: 'rounds-returned', count: returned });

  migrate(def, next, rng, lines);
  next.day += 1;
  next.operatedToday = false;
  next.recruitedToday = 0;
  revealAround(def, next);
  checkEnd(def, next);
  const shelter = def.sectors.find((s) => s.id === def.shelterSectorId)!;
  const home = next.sectors[shelter.id]!;
  if (
    def.siege &&
    next.status === 'active' &&
    !home.lost &&
    home.infestation >= def.siege.raisedFrom
  ) {
    next.siegePending = true;
    lines.push({ kind: 'siege-raised', sector: shelter.displayName });
  }
  next.lastReport = lines;
  return { campaign: next, report: { lines, turnedOvernight } };
}
