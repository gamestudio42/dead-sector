#!/usr/bin/env node
// Bakes the combat VFX: recipe → EffectCraft project → PNG sequence → alpha check → strip + manifest.
// Usage: node tools/vfx/bake.mjs [name ...]   (needs effectcraft-cli and ffmpeg on PATH)
// Work files go to ~/assets/_staging/dead-sector; only verified strips are copied into the game.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from './recipes.mjs';

const FPS = 30;
const VISIBLE = 8; // alpha below this is encoder noise
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'apps', 'web', 'public', 'fx');
const STAGING = path.join(homedir(), 'assets', '_staging', 'dead-sector');
const ec = (...args) => execFileSync('effectcraft-cli', args, { encoding: 'utf8' });

function alphaStats(file, w, h) {
  const raw = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-',
  ]);
  let visible = 0;
  let max = 0;
  for (let i = 3; i < raw.length; i += 4) {
    if (raw[i] >= VISIBLE) visible++;
    if (raw[i] > max) max = raw[i];
  }
  return { coverage: visible / (w * h), max };
}

function bake(name) {
  const r = RECIPES[name];
  if (!r) throw new Error(`unknown recipe ${name}`);
  const dir = path.join(STAGING, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const project = path.join(dir, `${name}.ecproj`);
  const steps = [
    {
      command: 'comp.new',
      params: { name, width: r.width, height: r.height, frameRate: FPS, duration: r.duration },
    },
    ...r.layers(),
    { command: 'file.save', params: { path: project } },
  ];
  writeFileSync(path.join(dir, `${name}.build.json`), JSON.stringify(steps, null, 1));
  ec('run', '--commands', path.join(dir, `${name}.build.json`));
  const frameCount = Math.round(r.duration * FPS);
  ec(
    'render',
    '--comp',
    name,
    '--format',
    'png',
    '--channels',
    'rgba',
    '--start',
    '0',
    '--end',
    String(frameCount / FPS),
    '--out',
    path.join(dir, 'frames', 'f.png'),
    project,
  );
  const frames = readdirSync(path.join(dir, 'frames'))
    .filter((f) => f.endsWith('.png'))
    .sort();
  const stats = frames.map((f) => alphaStats(path.join(dir, 'frames', f), r.width, r.height));
  const peak = stats.reduce((best, s, i) => (s.coverage > stats[best].coverage ? i : best), 0);
  const last = stats[stats.length - 1];
  const problems = [];
  // coverage peaks late in a spreading effect while its densest pixel comes early: check both
  const densest = Math.max(...stats.map((s) => s.max));
  if (stats[peak].coverage < 0.01 || densest < 128) problems.push('the effect is nearly invisible');
  if (last.coverage > 0.01) problems.push('last frame still visible: the effect would pop out');
  if (stats.slice(0, 3).every((s) => s.coverage === 0))
    problems.push('first frames empty: the effect starts late');
  // one horizontal strip; Phaser slices it with frameWidth/frameHeight
  const strip = path.join(dir, `${name}.png`);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-framerate',
    String(FPS),
    '-i',
    path.join(dir, 'frames', 'f_%05d.png'),
    '-vf',
    `tile=${frames.length}x1`,
    '-frames:v',
    '1',
    '-pix_fmt',
    'rgba',
    strip,
  ]);
  // preview on a street-coloured background at 4×, for review only
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x2a2c30:s=${r.width * frames.length}x${r.height}`,
    '-i',
    strip,
    '-filter_complex',
    '[0][1]overlay=format=auto,scale=iw*4:ih*4:flags=neighbor',
    '-frames:v',
    '1',
    path.join(dir, `${name}.preview.png`),
  ]);
  const report = {
    name,
    frames: frames.length,
    frameWidth: r.width,
    frameHeight: r.height,
    fps: FPS,
    peakFrame: peak,
    peakCoverage: +stats[peak].coverage.toFixed(3),
    maxAlpha: densest,
    lastCoverage: +last.coverage.toFixed(3),
    coverage: stats.map((s) => +s.coverage.toFixed(3)),
    problems,
  };
  if (!problems.length) {
    mkdirSync(OUT, { recursive: true });
    const bytes = readFileSync(strip);
    writeFileSync(path.join(OUT, `${name}.png`), bytes);
    report.sha256 = createHash('sha256').update(bytes).digest('hex');
    report.bytes = bytes.length;
  }
  return report;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(RECIPES);
const version = ec('--version').trim();
const results = names.map(bake);
for (const r of results)
  console.log(
    `${r.problems.length ? 'FAIL' : 'PASS'} ${r.name}: ${r.frames} frames, peak ${r.peakCoverage} at ${r.peakFrame}, last ${r.lastCoverage}${r.problems.length ? ' — ' + r.problems.join('; ') : ''}`,
  );
const manifestPath = path.join(OUT, 'manifest.json');
let manifest = { tool: version, effects: {} };
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  /* first bake */
}
manifest.tool = version;
for (const r of results.filter((x) => !x.problems.length)) {
  const { problems: _p, coverage: _c, name, ...entry } = r;
  manifest.effects[name] = entry;
}
mkdirSync(OUT, { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
