import type { CampaignDef, ContentBundle } from '@dead-sector/content';
import { SeededRng, seedToRngState } from '../engine/SeededRng';
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

export interface CampaignState {
  version: 2;
  campaignId: string;
  seed: number;
  /** Strategic RNG, separate from every mission's. */
  rngState: number;
  day: number;
  /** One operation per day. */
  operatedToday: boolean;
  /** Sector of the operation being played, so its result is folded into the right place. */
  activeSectorId: string | null;
  roster: RosterEntry[];
  stock: Stock;
  /** People in the shelter who do not fight. */
  population: number;
  evacuated: number;
  sectors: Record<string, SectorState>;
  rescued: string[];
  history: MissionRecordEntry[];
  /** What the last operation or night did, in PT-BR, to show again after a reload. */
  lastReport: string[];
  status: 'active' | 'won' | 'lost';
  endReason: string | null;
}

/** Lines shown after an operation or a night, in PT-BR (player-facing). */
export interface CampaignReport {
  lines: string[];
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
  const roster = templatesFor(content, def).map((templateId) => {
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
  const { population, ...stock } = def.start;
  const c: CampaignState = {
    version: 2,
    campaignId,
    seed,
    rngState: seedToRngState(seed),
    day: 1,
    operatedToday: false,
    activeSectorId: null,
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

/** Reads a stored campaign of any version; null when it cannot be used. */
export function migrateCampaign(content: ContentBundle, raw: unknown): CampaignState | null {
  const old = raw as Partial<CampaignState> & { missionIndex?: number; supplies?: number };
  if (!old || !Array.isArray(old.roster) || !old.campaignId || !content.campaigns[old.campaignId])
    return null;
  if (old.version === 2) return old as CampaignState;
  if ((old as { version?: number }).version !== 1) return null;
  const def = defOf(content, old.campaignId);
  const history = old.history ?? [];
  const rescued = old.rescued ?? [];
  const c = newCampaign(content, old.campaignId, history.length + 1);
  c.day = history.length + 1;
  c.roster = old.roster;
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

/** Why an operation cannot start in this sector right now (PT-BR); null when it can. */
export function operationBlockReason(
  content: ContentBundle,
  c: CampaignState,
  sectorId: string,
): string | null {
  const def = defOf(content, c.campaignId);
  const sec = def.sectors.find((s) => s.id === sectorId);
  if (!sec) throw new Error(`Unknown sector ${sectorId}`);
  if (c.status !== 'active') return 'A campanha terminou.';
  if (!sec.missionId) return 'Ainda não há plano de operação para este setor.';
  const status = sectorStatus(def, c, sectorId);
  if (status === 'unknown') return 'Setor desconhecido: assegure um vizinho primeiro.';
  if (status === 'lost') return 'Setor perdido para os infectados.';
  if (c.operatedToday) return 'Já houve uma operação hoje. Encerre o dia.';
  if (status === 'secured' && sec.evacuates === 0) return 'Setor já assegurado.';
  if (sec.evacuates > 0 && status === 'secured' && c.population === 0)
    return 'Não há mais ninguém para evacuar.';
  const connected = sec.neighbors.some(
    (n) => n === def.shelterSectorId || sectorStatus(def, c, n) === 'secured',
  );
  if (!connected) return 'Sem rota: assegure um setor vizinho primeiro.';
  return null;
}

/** Reinforcements in a mission follow how infested its sector is on the day. */
export function reinforcementMultiplier(infestation: number): number {
  return 0.6 + infestation / 125;
}

export function missionSeed(content: ContentBundle, c: CampaignState, missionId: string): number {
  const tries = c.history.filter((h) => h.missionId === missionId).length;
  return (content.missions[missionId]?.canonicalSeed ?? 0) + tries;
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
const clone = (c: CampaignState) => JSON.parse(JSON.stringify(c)) as CampaignState;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

function checkEnd(def: CampaignDef, c: CampaignState): void {
  if (c.status !== 'active') return;
  if (c.evacuated >= def.victory.evacuateGoal) {
    c.status = 'won';
    c.endReason = `${c.evacuated} pessoas saíram do setor.`;
  } else if (!c.roster.some((r) => r.alive)) {
    c.status = 'lost';
    c.endReason = 'Não restou ninguém para lutar.';
  } else if (c.sectors[def.shelterSectorId]!.lost) {
    c.status = 'lost';
    c.endReason = 'Os infectados tomaram o abrigo.';
  } else if (!def.sectors.some((s) => s.evacuates > 0 && !c.sectors[s.id]!.lost)) {
    c.status = 'lost';
    c.endReason = 'A rota de evacuação caiu.';
  } else if (c.day > def.victory.deadlineDays) {
    c.status = 'lost';
    c.endReason = 'O prazo acabou antes da evacuação.';
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
    next.population += 1;
    lines.push(`${rescued} está a salvo no abrigo.`);
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
    const bits = [
      got.food && `${got.food} de comida`,
      got.medicine && `${got.medicine} de remédios`,
      got.ammo && `${got.ammo} balas`,
      got.parts && `${got.parts} peças`,
      pay(people) && `${pay(people)} pessoa(s)`,
    ].filter(Boolean);
    if (bits.length) lines.push(`Trouxeram ${bits.join(', ')}.`);
  }
  if (success && sec.evacuates > 0) {
    const moved = Math.min(sec.evacuates, next.population);
    next.population -= moved;
    next.evacuated += moved;
    if (moved) lines.push(`Um comboio levou ${moved} pessoas para fora do setor.`);
  }
  state.infestation = clamp(
    state.infestation +
      def.operationEffect[success ? (outcome === 'success' ? 'success' : 'partial') : 'failed'],
  );
  const heat = Math.round(final.stats.totalNoise / def.migration.noisePerHeat);
  state.noise += heat;
  if (heat >= 10)
    lines.push(`O barulho em ${sec.displayName} vai atrair infectados dos arredores.`);

  next.history.push({ missionId: final.missionId, outcome, deaths, rescued });
  next.operatedToday = true;
  next.activeSectorId = null;
  revealAround(def, next);
  checkEnd(def, next);
  next.lastReport = lines;
  return { campaign: next, report: { lines, turnedOvernight: [] } };
}

/** Spends one dose on one survivor; null when it cannot be done. */
export function treatInfection(
  content: ContentBundle,
  campaign: CampaignState,
  templateId: string,
): CampaignState | null {
  const r = campaign.roster.find((x) => x.templateId === templateId);
  if (!r || !r.alive || r.infection === 'healthy' || campaign.stock.medicine <= 0) return null;
  const next = clone(campaign);
  const t = next.roster.find((x) => x.templateId === templateId)!;
  t.infection = 'healthy';
  t.bitten = false;
  next.stock.medicine -= 1;
  next.lastReport = [
    ...next.lastReport,
    `Tratamento aplicado em ${nameOf(content, templateId)}: infecção eliminada.`,
  ];
  return next;
}

/** Infected move along the connections: towards emptier sectors and towards noise. */
function migrate(def: CampaignDef, c: CampaignState, rng: SeededRng, lines: string[]): void {
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
      lines.push(`${sec.displayName} foi perdido para os infectados.`);
      continue;
    }
    const now = sectorStatus(def, c, sec.id);
    if (sec.id !== def.shelterSectorId && before[sec.id] === 'secured' && now !== 'secured')
      lines.push(`Infectados voltaram a ${sec.displayName}.`);
  }
  const shelter = def.sectors.find((s) => s.id === def.shelterSectorId)!;
  if (c.sectors[shelter.id]!.infestation >= def.thresholds.infestedFrom)
    lines.push(`Infectados cercam ${shelter.displayName}.`);
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
  const lines: string[] = [];
  const turnedOvernight: string[] = [];

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
      lines.push(`${name} piorou: agora está ${STAGE_PT[stage]}.`);
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
    lines.push(
      lost ? `Faltou comida: ${lost} pessoa(s) a menos no abrigo.` : 'Faltou comida no abrigo.',
    );
  }

  let shortOfAmmo = false;
  for (const r of next.roster) {
    if (!r.alive) continue;
    const t = content.survivors[r.templateId];
    if (!t) continue;
    const before = r.health;
    r.health = Math.min(t.maxHealth, r.health + Math.round(t.maxHealth * def.healFraction));
    if (r.health > before && before < t.maxHealth)
      lines.push(`${firstName(t.name)} se recuperou (vida ${before} → ${r.health}).`);
    const w = content.weapons[t.weaponId];
    if (w && w.magazineCapacity > 0) {
      const missing = w.magazineCapacity + t.reserveRounds - r.ammo;
      const taken = Math.min(next.stock.ammo, missing);
      if (taken < missing) shortOfAmmo = true;
      if (taken > 0) {
        r.ammo += taken;
        next.stock.ammo -= taken;
      }
    }
  }

  if (shortOfAmmo) lines.push('A munição do estoque não bastou para rearmar todo mundo.');

  migrate(def, next, rng, lines);
  next.day += 1;
  next.operatedToday = false;
  revealAround(def, next);
  checkEnd(def, next);
  next.lastReport = lines;
  return { campaign: next, report: { lines, turnedOvernight } };
}

const STAGE_PT: Record<InfectionStage, string> = {
  healthy: 'bem',
  exposed: 'exposto',
  infected: 'infectado',
  critical: 'em estado crítico',
};

function nameOf(content: ContentBundle, templateId: string): string {
  return content.survivors[templateId]?.name ?? templateId;
}
