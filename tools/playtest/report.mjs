#!/usr/bin/env node
// Merges exported playtest logs (Options → Playtest → Export) into one Markdown report.
//
//   node tools/playtest/report.mjs <file-or-folder>... [--out report.md]
//
// It reads only the JSON files it is given and writes Markdown to stdout or --out. These are
// observations: the report counts what happened and never explains why (see
// docs/testing/playtest.md for how to turn them into decisions).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FORMAT = 'dead-sector-playtest';

function parseArgs(argv) {
  const inputs = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i] ?? null;
    else inputs.push(argv[i]);
  }
  return { inputs, out };
}

function collectFiles(paths) {
  const files = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory())
      for (const f of readdirSync(p).sort()) {
        if (f.endsWith('.json')) files.push(join(p, f));
      }
    else files.push(p);
  }
  return files;
}

function loadExport(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data?.format !== FORMAT || !Array.isArray(data.entries))
    throw new Error(`${file}: not a Dead Sector playtest export`);
  if (data.version !== 1) throw new Error(`${file}: unsupported version ${data.version}`);
  return data;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtSec = (s) =>
  s === null || s === undefined
    ? '—'
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
const top = (map, n = 8) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/** Splits one tester's log into missions: each starts at missionStart and closes at its end. */
function missionsOf(entries) {
  const missions = [];
  let cur = null;
  for (const e of entries) {
    if (e.kind === 'missionStart') {
      cur = { start: e, events: [], end: null };
      missions.push(cur);
    } else if (cur && (e.kind === 'missionEnd' || e.kind === 'missionAbandon')) {
      cur.end = e;
      cur = null;
    } else if (cur && e.session === cur.start.session) cur.events.push(e);
  }
  return missions;
}

export function buildReport(exports) {
  const lines = [];
  const say = (s = '') => lines.push(s);
  const all = exports.flatMap((x) => x.entries.map((e) => ({ ...e, tester: x.tester || x.file })));
  const missions = exports.flatMap((x) =>
    missionsOf(x.entries).map((m) => ({ ...m, tester: x.tester || x.file })),
  );

  say('# Playtest report');
  say();
  say(
    `${exports.length} file(s), ${new Set(all.map((e) => e.tester)).size} tester(s), ` +
      `${new Set(all.map((e) => e.session)).size} sitting(s), builds: ` +
      `${[...new Set(exports.map((x) => x.build))].join(', ')}.`,
  );
  say();
  say('Observations only. Interpretation and decisions go in the playtest notes.');

  // --- per tester
  say();
  say('## Testers');
  say();
  say(
    '| Tester | Sittings | Played (real) | Missions started | Finished | Abandoned | First mission result |',
  );
  say('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const x of exports) {
    const ms = missions.filter((m) => m.tester === (x.tester || x.file));
    const played = ms.reduce((n, m) => n + (m.end?.realSeconds ?? 0), 0);
    const first = ms[0]?.end;
    const firstText = !first
      ? 'no end recorded'
      : first.kind === 'missionEnd'
        ? `${first.status} (${first.reason})`
        : `left: ${first.how}`;
    say(
      `| ${x.tester || x.file} | ${new Set(x.entries.map((e) => e.session)).size} | ${fmtSec(played)} | ${ms.length} | ` +
        `${ms.filter((m) => m.end?.kind === 'missionEnd').length} | ${ms.filter((m) => m.end?.kind === 'missionAbandon').length} | ${firstText} |`,
    );
  }

  // --- funnel
  const testers = exports.map((x) => x.tester || x.file);
  const reached = (pred) =>
    testers.filter((t) => all.some((e) => e.tester === t && pred(e))).length;
  say();
  say('## Funnel');
  say();
  say('| Step | Testers |');
  say('| --- | ---: |');
  const steps = [
    ['Opened the game', (e) => e.kind === 'session'],
    ['Read a briefing and deployed', (e) => e.kind === 'briefing' && e.choice === 'deploy'],
    ['Completed one objective', (e) => e.kind === 'objective'],
    ['Finished a mission (any result)', (e) => e.kind === 'missionEnd'],
    ['Won a mission', (e) => e.kind === 'missionEnd' && e.status === 'success'],
    ['Started the campaign', (e) => e.kind === 'menu' && /ampaign/.test(e.choice)],
    ['Ended a campaign day', (e) => e.kind === 'dayEnd'],
    ['Reached day 6', (e) => e.kind === 'dayEnd' && e.day >= 6],
    ['Finished the campaign', (e) => e.kind === 'campaignEnd'],
  ];
  for (const [label, pred] of steps) say(`| ${label} | ${reached(pred)} / ${testers.length} |`);

  // --- per mission
  say();
  say('## Missions');
  say();
  say(
    '| Mission | Starts | Win | Partial | Fail | Abandoned | Median length (game) | Median real time | Squad deaths / run | Panics / run | Paused share |',
  );
  say('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  const byMission = new Map();
  for (const m of missions) {
    const id = m.start.missionId;
    if (!byMission.has(id)) byMission.set(id, []);
    byMission.get(id).push(m);
  }
  for (const [id, ms] of byMission) {
    const ended = ms.filter((m) => m.end?.kind === 'missionEnd');
    const status = (s) => ended.filter((m) => m.end.status === s).length;
    const deaths = ms.map((m) => m.events.filter((e) => e.kind === 'death' && !e.civilian).length);
    const panics = ms.map((m) => m.events.filter((e) => e.kind === 'panic').length);
    const real = ms.map((m) => m.end?.realSeconds).filter((v) => typeof v === 'number');
    const paused = ms
      .map((m) => (m.end?.realSeconds ? m.end.input.pausedMs / 1000 / m.end.realSeconds : null))
      .filter((v) => v !== null);
    const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
    say(
      `| ${id} | ${ms.length} | ${status('success')} | ${status('partial')} | ${status('failed')} | ` +
        `${ms.filter((m) => m.end?.kind === 'missionAbandon').length} | ` +
        `${fmtSec(median(ended.map((m) => m.end.tick / 10)))} | ${fmtSec(median(real))} | ${avg(deaths)} | ${avg(panics)} | ` +
        `${
          paused.length
            ? pct(
                paused.reduce((a, b) => a + b, 0),
                paused.length,
              )
            : '—'
        } |`,
    );
  }

  // --- why missions end
  const reasons = new Map();
  const quits = new Map();
  for (const m of missions) {
    if (m.end?.kind === 'missionEnd')
      bump(reasons, `${m.start.missionId}: ${m.end.status} — ${m.end.reason}`);
    if (m.end?.kind === 'missionAbandon')
      bump(
        quits,
        `${m.start.missionId}: ${m.end.how} at ${fmtSec(m.end.tick / 10)}, ${m.end.objectivesDone} objective(s) done, ${m.end.alive}/${m.end.squadSize} alive`,
      );
  }
  say();
  say('## How missions ended');
  say();
  for (const [k, n] of top(reasons, 20)) say(`- ${n}× ${k}`);
  if (!reasons.size) say('- none finished');
  say();
  say('## Where testers left a mission early');
  say();
  for (const [k, n] of top(quits, 20)) say(`- ${n}× ${k}`);
  if (!quits.size) say('- nobody left a mission early');

  // --- deaths and pressure
  const deathCause = new Map();
  const deathRole = new Map();
  const deathCell = new Map();
  const blocked = new Map();
  for (const m of missions)
    for (const e of m.events) {
      if (e.kind === 'death') {
        bump(deathCause, e.cause ?? 'unknown');
        bump(deathRole, e.role ?? e.survivor);
        if (typeof e.x === 'number')
          bump(
            deathCell,
            `${m.start.missionId} (${Math.floor(e.x / 8) * 8}, ${Math.floor(e.y / 8) * 8})`,
          );
      }
      if (e.kind === 'orderBlocked') bump(blocked, `${e.order}: ${e.reason}`);
    }
  say();
  say('## Deaths');
  say();
  say(
    `Causes: ${
      top(deathCause)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }.`,
  );
  say();
  say(
    `Who: ${
      top(deathRole)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }.`,
  );
  say();
  say('Places (8×8-cell areas, top-left corner):');
  say();
  for (const [k, n] of top(deathCell)) say(`- ${n}× ${k}`);
  if (!deathCell.size) say('- none');
  say();
  say('## Blocked orders');
  say();
  for (const [k, n] of top(blocked)) say(`- ${n}× ${k}`);
  if (!blocked.size) say('- none');

  // --- interface use
  const orders = new Map();
  const modes = new Map();
  const tips = new Map();
  let ctx = 0;
  let saves = 0;
  let loads = 0;
  let speed = 0;
  let closed = 0;
  for (const m of missions) {
    const inp = m.end?.input;
    if (!inp) continue;
    for (const [k, n] of Object.entries(inp.orders)) bump(orders, k, n);
    for (const [k, n] of Object.entries(inp.modes)) bump(modes, k, n);
    for (const t of inp.tips) bump(tips, t);
    ctx += inp.contextMenu;
    saves += inp.quicksaves;
    loads += inp.quickloads;
    speed += inp.speedToggles;
    if (m.end.how === 'closed') closed++;
  }
  say();
  say('## Interface use (all missions)');
  say();
  say(
    `- Orders: ${
      top(orders, 20)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }`,
  );
  say(
    `- Movement modes: ${
      top(modes)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'never changed'
    }`,
  );
  say(
    `- Order menu (Ctrl + right click): ${ctx} · speed toggles: ${speed} · quicksaves: ${saves} · quickloads: ${loads}`,
  );
  say(`- Tab closed during a mission: ${closed}`);
  say(
    `- Tips shown: ${
      top(tips, 20)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }`,
  );

  // --- briefing and performance
  const reads = all
    .filter((e) => e.kind === 'briefing' && e.choice === 'deploy')
    .map((e) => e.seconds);
  const fps = all.filter((e) => e.kind === 'sample' && e.fps > 0).map((e) => e.fps);
  const views = new Map();
  for (const e of all) if (e.kind === 'session') bump(views, e.viewport);
  say();
  say('## Briefing and performance');
  say();
  say(
    `- Median time on the briefing before deploying: ${fmtSec(median(reads))} (${reads.length} briefings)`,
  );
  say(
    `- FPS samples: ${fps.length ? `median ${median(fps)}, lowest ${Math.min(...fps)}, below 30 in ${pct(fps.filter((f) => f < 30).length, fps.length)}` : 'none'}`,
  );
  say(
    `- Screens: ${
      top(views)
        .map(([k, n]) => `${k} (${n})`)
        .join(', ') || '—'
    }`,
  );

  // --- campaign
  const days = all.filter((e) => e.kind === 'dayEnd');
  const ends = all.filter((e) => e.kind === 'campaignEnd');
  say();
  say('## Campaign');
  say();
  if (!days.length) say('- nobody ended a campaign day');
  else {
    say('| Tester | Last day | Evacuated | Food | Ammo | Medicine | Ended |');
    say('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const t of testers) {
      const last = days.filter((e) => e.tester === t).at(-1);
      if (!last) continue;
      const end = ends.filter((e) => e.tester === t).at(-1);
      say(
        `| ${t} | ${last.day} | ${last.evacuated} | ${last.stock.food} | ${last.stock.ammo} | ${last.stock.medicine} | ` +
          `${end ? `${end.status} (${end.reason?.kind ?? end.reason ?? ''})` : '—'} |`,
      );
    }
    const skipped = days.filter((e) => e.operated === false).length;
    say();
    say(`Days ended without an operation: ${skipped} of ${days.length}.`);
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { inputs, out } = parseArgs(process.argv.slice(2));
  if (!inputs.length) {
    console.error('usage: node tools/playtest/report.mjs <file-or-folder>... [--out report.md]');
    process.exit(2);
  }
  const exports = collectFiles(inputs).map((f) => ({ ...loadExport(f), file: f }));
  const md = buildReport(exports);
  if (out) writeFileSync(out, md);
  else process.stdout.write(md);
}
