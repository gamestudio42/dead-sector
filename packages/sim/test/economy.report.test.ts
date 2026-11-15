import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import {
  applyOperationResult,
  buildUpgrade,
  campaignDeadline,
  carryOver,
  endDay,
  GameSimulation,
  MISSION_PLANS,
  missionModifiers,
  missionSeed,
  newCampaign,
  operationBlockReason,
  operationMissionId,
  operationReinforcements,
  recruit,
  recruitBlockReason,
  runPlan,
  STEALTH_PLAN,
  treatInfection,
  type CampaignState,
  type PlanStep,
} from '../src';

/**
 * Campaign economy report (opt-in: `pnpm economy`). Two fixed policies play whole campaigns on each
 * difficulty with the scripted mission routes and write docs/testing/economy.md. The policies are
 * simple and never adapt their routes, so the numbers say where the stock runs dry or piles up, not
 * how well a person plays.
 */
const RUNS = Number(process.env['ECONOMY_RUNS'] ?? 8);
/** The policy rests instead of sending squads out with fewer rounds than this between them. */
const MIN_ROUNDS = 80;
const enabled = !!process.env['ECONOMY_REPORT'];
const content = loadContent();
const def = content.campaigns['ferrugem']!;
/** The quiet route where there is one: a careful player does not fight through the pharmacy. */
const POLICY_PLANS: Record<string, PlanStep[]> = { 'a-ultima-farmacia': STEALTH_PLAN };
/** Cheapest protection first, then food, then healing. */
const BUILD_ORDER = ['oficina', 'muro', 'horta', 'enfermaria'];

/** `raids` never plays a scavenging run; `scavenger` weighs one by the caches its radio needs. */
const POLICIES = ['raids', 'scavenger'] as const;
type Policy = (typeof POLICIES)[number];

interface Day {
  food: number;
  ammo: number;
  parts: number;
  population: number;
  evacuated: number;
}

type Loot = { food: number; medicine: number; ammo: number; parts: number; people?: number };
const worth = (r: Loot) => r.food + r.medicine * 4 + r.ammo / 3 + r.parts * 3 + (r.people ?? 0) * 4;

function scavengeOf(sectorId: string) {
  const id = def.sectors.find((s) => s.id === sectorId)!.missionId;
  return id ? content.missions[id]?.objectives.scavenge : undefined;
}

/** The sector's reward plus, on a scavenging run, the richest caches the radio needs searched. */
function value(sectorId: string): number {
  const sec = def.sectors.find((s) => s.id === sectorId)!;
  const sc = scavengeOf(sectorId);
  const caches = sc
    ? sc.caches
        .map((k) => worth(k.loot))
        .sort((a, b) => b - a)
        .slice(0, sc.required)
        .reduce((a, b) => a + b, 0)
    : 0;
  return worth(sec.reward) + caches;
}

interface Operation {
  policy: Policy;
  missionId: string;
  status: string;
  rounds: number;
  deaths: number;
}
const operationsLog: Operation[] = [];

/** One whole campaign: returns the final state, the stock at the start of each day and the operations. */
function play(policy: Policy, difficulty: string, run: number) {
  let c: CampaignState = newCampaign(content, 'ferrugem', 1000 + run * 37, difficulty);
  const days: Day[] = [];
  let operations = 0;
  let won = 0;
  while (c.status === 'active' && days.length < 30) {
    days.push({
      food: c.stock.food,
      ammo: c.stock.ammo,
      parts: c.stock.parts,
      population: c.population,
      evacuated: c.evacuated,
    });
    for (const r of c.roster)
      if (r.alive && r.infection !== 'healthy' && c.stock.medicine > 0)
        c = treatInfection(content, c, r.id) ?? c;
    for (const id of BUILD_ORDER) c = buildUpgrade(content, c, id) ?? c;
    const fighters = c.roster.filter((r) => r.alive && r.squadId).length;
    if (fighters < 8 && c.population > 4 && !recruitBlockReason(content, c))
      c = recruit(content, c) ?? c;

    const rounds = c.roster.filter((r) => r.alive && r.squadId).reduce((a, r) => a + r.ammo, 0);
    const open = def.sectors.filter(
      (s) =>
        !operationBlockReason(content, c, s.id) &&
        (s.id === def.shelterSectorId || rounds >= MIN_ROUNDS) &&
        (policy === 'scavenger' || !scavengeOf(s.id)),
    );
    // the convoy when there are people to move, otherwise the richest sector not yet looted
    const pick =
      open.find((s) => s.id === def.shelterSectorId) ??
      open.find((s) => s.evacuates > 0 && c.population >= 3) ??
      [...open].sort(
        (a, b) =>
          value(b.id) / (c.sectors[b.id]!.looted ? 2 : 1) -
            value(a.id) / (c.sectors[a.id]!.looted ? 2 : 1) ||
          c.sectors[a.id]!.infestation - c.sectors[b.id]!.infestation,
      )[0];
    if (pick) {
      const missionId = operationMissionId(content, c, pick.id)!;
      const sim = GameSimulation.create(
        missionId,
        missionSeed(content, c, missionId) + run * 101,
        content,
        carryOver(c),
        operationReinforcements(content, c, pick.id),
        missionModifiers(content, c, pick.id),
      );
      runPlan(sim, POLICY_PLANS[missionId] ?? MISSION_PLANS[missionId]!);
      operations += 1;
      if (sim.state.mission.status !== 'failed') won += 1;
      operationsLog.push({
        policy,
        missionId,
        status: sim.state.mission.status,
        rounds: sim.state.stats.ammoUsed,
        deaths: sim.state.survivors.filter((x) => x.squadId && !x.alive).length,
      });
      c = applyOperationResult(content, c, pick.id, sim.state).campaign;
    }
    if (c.status === 'active') c = endDay(content, c).campaign;
  }
  return { c, days, operations, won };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f1 = (n: number) => n.toFixed(1);
/** Lets the worker answer vitest between campaigns, so a long report does not time out its RPC. */
const breathe = () => new Promise((r) => setImmediate(r));

describe.skipIf(!enabled)('economy report', () => {
  it('writes docs/testing/economy.md', async () => {
    const rows: string[] = [];
    const curves: string[] = [];
    for (const policy of POLICIES)
      for (const d of def.difficulties) {
        const runs: ReturnType<typeof play>[] = [];
        for (let i = 0; i < RUNS; i++) {
          runs.push(play(policy, d.id, i));
          await breathe();
        }
        const ends: Record<string, number> = {};
        for (const r of runs) {
          const k = r.c.status === 'won' ? 'won' : (r.c.endReason?.kind ?? '?');
          ends[k] = (ends[k] ?? 0) + 1;
        }
        rows.push(
          `| ${policy} | ${d.id} | ${runs.filter((r) => r.c.status === 'won').length}/${RUNS} | ${f1(avg(runs.map((r) => r.c.day)))} / ${campaignDeadline(content, runs[0]!.c)} | ${f1(avg(runs.map((r) => r.c.evacuated)))} | ${f1(avg(runs.map((r) => r.c.roster.filter((x) => !x.alive).length)))} | ${f1(avg(runs.map((r) => r.won / Math.max(1, r.operations))) * 100)}% | ${f1(avg(runs.map((r) => r.c.sieges)))} | ${f1(avg(runs.map((r) => r.c.upgrades.length)))} | ${Math.round(avg(runs.map((r) => r.c.stock.food)))} / ${Math.round(avg(runs.map((r) => r.c.stock.ammo)))} / ${Math.round(avg(runs.map((r) => r.c.stock.parts)))} | ${Object.entries(
            ends,
          )
            .map(([k, n]) => `${k} ×${n}`)
            .join(', ')} |`,
        );
        // stock at the start of each day, averaged over the runs still going that day
        const longest = Math.max(...runs.map((r) => r.days.length));
        const line: string[] = [];
        for (let day = 0; day < longest; day++) {
          const at = runs.map((r) => r.days[day]).filter((x): x is Day => !!x);
          line.push(
            `| ${day + 1} | ${at.length} | ${Math.round(avg(at.map((x) => x.food)))} | ${Math.round(avg(at.map((x) => x.ammo)))} | ${f1(avg(at.map((x) => x.parts)))} | ${f1(avg(at.map((x) => x.population)))} | ${f1(avg(at.map((x) => x.evacuated)))} |`,
          );
        }
        curves.push(`### ${policy}, ${d.id}

| Day | Runs | Food | Rounds | Parts | Shelter | Evacuated |
| --- | ---- | ---- | ------ | ----- | ------- | --------- |
${line.join('\n')}
`);
      }
    const missions = POLICIES.flatMap((policy) =>
      [...new Set(operationsLog.filter((o) => o.policy === policy).map((o) => o.missionId))].map(
        (id) => {
          const ops = operationsLog.filter((o) => o.policy === policy && o.missionId === id);
          return `| ${policy} | ${content.missions[id]!.displayName} | ${ops.length} | ${Math.round((ops.filter((o) => o.status !== 'failed').length / ops.length) * 100)}% | ${Math.round(avg(ops.map((o) => o.rounds)))} | ${f1(avg(ops.map((o) => o.deaths)))} |`;
        },
      ),
    );
    const md = `# Economy report

Generated by \`pnpm economy\`: ${RUNS} whole campaigns of ${def.displayName} per difficulty and policy, played with
the scripted mission routes. Each day a policy treats every infected survivor it has medicine for, builds upgrades
it can afford (${BUILD_ORDER.join(', ')}), recruits while the squads are short and the shelter has more than four
people, then operates unless the squads carry fewer than ${MIN_ROUNDS} rounds between them (then it rests): the
siege when there is one, the railway convoy when at least three people wait, otherwise the richest sector it can
reach. **raids** never plays a scavenging run; **scavenger** does, and counts the richest caches its radio needs as
part of the sector's worth. The routes never adapt, so these numbers show where the stock runs dry or piles up; they
are not a difficulty rating for a person.

| Policy | Difficulty | Wins | Days / deadline | Evacuated | Survivors lost | Operations won | Sieges | Upgrades | Food / rounds / parts left | Endings |
| ------ | ---------- | ---- | --------------- | --------- | -------------- | -------------- | ------ | -------- | -------------------------- | ------- |
${rows.join('\n')}

## Operations

| Policy | Mission | Played | Won | Rounds fired (avg) | Squad deaths (avg) |
| ------ | ------- | ------ | --- | ------------------ | ------------------ |
${missions.join('\n')}

## Stock at the start of each day

${curves.join('\n')}`;
    writeFileSync(new URL('../../../docs/testing/economy.md', import.meta.url), md);
    console.log(md);
  }, 1_200_000);
});
