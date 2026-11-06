#!/usr/bin/env node
// Cover for the studio site and the store: a real gameplay plate (apps/web/promo, HUD hidden)
// with the title drawn in EffectCraft on top. Usage: node tools/promo/cover.mjs <plate.png>
// Writes docs/screenshots/cover.jpg (1600×900). The title layer is rendered with alpha and
// composited with ffmpeg, so the gameplay pixels underneath stay untouched.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const plate = process.argv[2];
if (!plate) throw new Error('usage: cover.mjs <plate.png>');
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'docs', 'screenshots', 'cover.jpg');
const dir = path.join(homedir(), 'assets', '_staging', 'dead-sector', 'cover');
mkdirSync(dir, { recursive: true });
const project = path.join(dir, 'cover.ecproj');

// paragraph text in a box [x, y, w, h], left-aligned from x (point text is centred on its position)
const text = (name, value, box, size, fill, style = 'Bold', tracking = 0) => ({
  command: 'layer.newText',
  params: { name, text: value, box, font: 'Inter', style, size, fill, tracking },
});
const steps = [
  {
    command: 'comp.new',
    params: { name: 'cover', width: 1600, height: 900, frameRate: 30, duration: 1 },
  },
  // a soft dark band keeps the title legible over any plate
  {
    command: 'layer.newShape',
    params: { kind: 'rect', name: 'band', size: [760, 900], fill: '#08090b', position: [300, 450] },
  },
  { command: 'effect.apply', params: { effect: 'Gaussian Blur', layers: ['band'] } },
  { command: 'prop.set', params: { layer: 'band', path: 'effects/#1/blurriness', value: 120 } },
  { command: 'prop.set', params: { layer: 'band', path: 'transform/opacity', value: 70 } },
  text('dead', 'DEAD', [108, 290, 900, 160], 128, '#d9d2bf', 'Bold', 180),
  text('sector', 'SECTOR', [108, 420, 900, 160], 128, '#8fb05a', 'Bold', 180),
  text(
    'tagline',
    'Every shot is heard. Every order has a price.',
    [114, 590, 1100, 60],
    34,
    '#b8b4a8',
    'Regular',
  ),
  { command: 'file.save', params: { path: project } },
];
writeFileSync(path.join(dir, 'cover.build.json'), JSON.stringify(steps, null, 1));
execFileSync('effectcraft-cli', ['run', '--commands', path.join(dir, 'cover.build.json')]);
const title = path.join(dir, 'title.png');
execFileSync('effectcraft-cli', [
  'render-frame',
  '--comp',
  'cover',
  '--time',
  '0.5',
  '--transparent',
  '--out',
  title,
  project,
]);
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-i',
  plate,
  '-i',
  title,
  '-filter_complex',
  '[0][1]overlay=format=auto',
  '-frames:v',
  '1',
  '-q:v',
  '3',
  OUT,
]);
console.log(`cover → ${OUT}`);
