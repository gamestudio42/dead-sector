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

/** Largest strip side most GPUs accept; longer effects wrap onto more rows. */
const MAX_SIDE = 4096;

function rgba(file) {
  return execFileSync('ffmpeg', [
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
}

function bake(name) {
  const r = RECIPES[name];
  if (!r) throw new Error(`unknown recipe ${name}`);
  const fps = r.fps ?? FPS;
  const dir = path.join(STAGING, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const project = path.join(dir, `${name}.ecproj`);
  const frameCount = Math.round(r.duration * fps);
  // a loop renders one frame past its period: that frame must match the first, or the seam shows
  const rendered = frameCount + (r.loop ? 1 : 0);
  const steps = [
    {
      command: 'comp.new',
      params: {
        name,
        width: r.width,
        height: r.height,
        frameRate: fps,
        duration: (rendered + 1) / fps,
      },
    },
    ...r.layers(),
    { command: 'file.save', params: { path: project } },
  ];
  writeFileSync(path.join(dir, `${name}.build.json`), JSON.stringify(steps, null, 1));
  ec('run', '--commands', path.join(dir, `${name}.build.json`));
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
    String(rendered / fps),
    '--out',
    path.join(dir, 'frames', 'f.png'),
    project,
  );
  let frames = readdirSync(path.join(dir, 'frames'))
    .filter((f) => f.endsWith('.png'))
    .sort();
  const problems = [];
  let seam = null;
  if (r.loop) {
    const a = rgba(path.join(dir, 'frames', frames[0]));
    const b = rgba(path.join(dir, 'frames', frames[frames.length - 1]));
    let worst = 0;
    for (let k = 0; k < a.length; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]));
    seam = worst;
    if (worst > 24)
      problems.push(`loop seam: the frame after the last differs from the first by ${worst}/255`);
    rmSync(path.join(dir, 'frames', frames[frames.length - 1]));
    frames = frames.slice(0, -1);
  }
  const stats = frames.map((f) => alphaStats(path.join(dir, 'frames', f), r.width, r.height));
  const peak = stats.reduce((best, s, i) => (s.coverage > stats[best].coverage ? i : best), 0);
  const last = stats[stats.length - 1];
  // coverage peaks late in a spreading effect while its densest pixel comes early: check both
  const densest = Math.max(...stats.map((s) => s.max));
  if (stats[peak].coverage < 0.01 || densest < (r.minAlpha ?? 128))
    problems.push('the effect is nearly invisible');
  // an interface mark may end on a frame meant to stay on screen (`hold`)
  if (!r.loop && !r.hold && last.coverage > 0.01)
    problems.push('last frame still visible: the effect would pop out');
  if (!r.loop && stats.slice(0, 3).every((s) => s.coverage === 0))
    problems.push('first frames empty: the effect starts late');
  // frames left to right, wrapping onto more rows past MAX_SIDE; Phaser slices by frame size
  const columns = Math.min(frames.length, Math.floor(MAX_SIDE / r.width));
  const rows = Math.ceil(frames.length / columns);
  const strip = path.join(dir, `${name}.png`);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-framerate',
    String(fps),
    '-i',
    path.join(dir, 'frames', 'f_%05d.png'),
    '-vf',
    `tile=${columns}x${rows}:color=0x00000000`,
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
    `color=c=0x2a2c30:s=${r.width * columns}x${r.height * rows}`,
    '-i',
    strip,
    '-filter_complex',
    `[0][1]overlay=format=auto,scale=iw*${rows > 1 ? 2 : 4}:ih*${rows > 1 ? 2 : 4}:flags=neighbor`,
    '-frames:v',
    '1',
    path.join(dir, `${name}.preview.png`),
  ]);
  const report = {
    name,
    frames: frames.length,
    frameWidth: r.width,
    frameHeight: r.height,
    columns,
    fps,
    loop: !!r.loop,
    hold: !!r.hold,
    peakFrame: peak,
    peakCoverage: +stats[peak].coverage.toFixed(3),
    maxAlpha: densest,
    lastCoverage: +last.coverage.toFixed(3),
    ...(seam === null ? {} : { loopSeam: seam }),
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
    `${r.problems.length ? 'FAIL' : 'PASS'} ${r.name}: ${r.frames} frames, peak ${r.peakCoverage} at ${r.peakFrame}, last ${r.lastCoverage}${r.loop ? `, seam ${r.loopSeam}` : ''}${r.problems.length ? ' — ' + r.problems.join('; ') : ''}`,
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
