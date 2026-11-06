#!/usr/bin/env node
// Cuts the trailer: an EffectCraft title card, gameplay shots captured by apps/web/promo/trailer.promo.ts
// with captions drawn in EffectCraft, and an end card. Output: ~/assets/_staging/dead-sector/trailer/
// dead-sector-trailer.mp4 (1920×1080, 30 fps, H.264, silent). Usage: node tools/promo/trailer.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1920;
const H = 1080;
const FPS = 30;
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(homedir(), 'assets', '_staging', 'dead-sector', 'trailer');
const FOOTAGE = path.join(ROOT, 'footage');
const WORK = path.join(ROOT, 'work');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const ec = (...a) => execFileSync('effectcraft-cli', a, { encoding: 'utf8' });
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);

const SHOTS = [
  { footage: 'sneak', caption: 'Command squads, not soldiers.' },
  { footage: 'fight', caption: 'Every shot is heard.' },
  { footage: 'horde', caption: 'And the whole sector answers.' },
  {
    still: path.join(here, '..', '..', 'docs', 'screenshots', 'campaign.png'),
    seconds: 3.5,
    caption: 'Every day costs food, ammo and lives.',
  },
  { footage: 'night', caption: 'Hold the night. Get them out.' },
];

// point text is centred on its position, with y on the baseline
const text = (name, value, [x, y], size, fill, style = 'Bold', tracking = 0) => ({
  command: 'layer.newText',
  params: { name, text: value, position: [x, y], font: 'Inter', style, size, fill, tracking },
});
const key = (layer, p, time, value) => ({
  command: 'prop.addKey',
  params: { layer, path: p, time, value },
});

/** Builds and renders one EffectCraft comp to a PNG sequence (or one still with `still`). */
function comp(name, seconds, layers, still = false) {
  const dir = path.join(WORK, name);
  mkdirSync(dir, { recursive: true });
  const project = path.join(dir, `${name}.ecproj`);
  const steps = [
    {
      command: 'comp.new',
      params: { name, width: W, height: H, frameRate: FPS, duration: seconds + 1 / FPS },
    },
    ...layers,
    { command: 'file.save', params: { path: project } },
  ];
  writeFileSync(path.join(dir, 'build.json'), JSON.stringify(steps, null, 1));
  ec('run', '--commands', path.join(dir, 'build.json'));
  if (still) {
    const out = path.join(dir, 'still.png');
    ec('render-frame', '--comp', name, '--time', '0', '--transparent', '--out', out, project);
    return out;
  }
  mkdirSync(path.join(dir, 'frames'));
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
    String(seconds),
    '--out',
    path.join(dir, 'frames', 'f.png'),
    project,
  );
  return path.join(dir, 'frames', 'f_%05d.png');
}

/** The name, fading in word by word when `animate`, or already there (the end card). */
const title = (animate) => [
  text('dead', 'DEAD', [W / 2, 520], 150, '#d9d2bf', 'Bold', 220),
  text('sector', 'SECTOR', [W / 2, 690], 150, '#8fb05a', 'Bold', 220),
  ...(animate
    ? ['dead', 'sector'].flatMap((l, i) => [
        key(l, 'transform/opacity', 0, 0),
        key(l, 'transform/opacity', 0.2 + i * 0.25, 0),
        key(l, 'transform/opacity', 0.9 + i * 0.25, 100),
      ])
    : []),
];

// 1. title card: the name comes out of the dark
const intro = comp('intro', 3, title(true));
// 2. end card: the name stays and the call to action fades in under it
const outro = comp('outro', 4, [
  ...title(false),
  text('play', 'Play free in your browser', [W / 2, 810], 44, '#e4e1d8', 'SemiBold'),
  text('url', 'gamestudio42.github.io/dead-sector', [W / 2, 870], 36, '#8fb05a', 'Regular'),
  text(
    'license',
    'Free software · AGPL-3.0 · Game Studio 42',
    [W / 2, 1020],
    24,
    '#9a9890',
    'Regular',
  ),
  ...['play', 'url', 'license'].flatMap((l) => [
    key(l, 'transform/opacity', 0, 0),
    key(l, 'transform/opacity', 0.8, 0),
    key(l, 'transform/opacity', 1.5, 100),
  ]),
]);

// captions: a lower third on a soft dark band, as transparent stills
const captions = SHOTS.map((s, i) =>
  comp(
    `caption${i}`,
    1,
    [
      {
        command: 'layer.newShape',
        params: {
          kind: 'rect',
          name: 'band',
          size: [W, 190],
          fill: '#08090b',
          position: [W / 2, H - 120],
        },
      },
      { command: 'effect.apply', params: { effect: 'Gaussian Blur', layers: ['band'] } },
      { command: 'prop.set', params: { layer: 'band', path: 'effects/#1/blurriness', value: 60 } },
      { command: 'prop.set', params: { layer: 'band', path: 'transform/opacity', value: 75 } },
      text('caption', s.caption, [W / 2, H - 100], 56, '#e4e1d8', 'SemiBold'),
    ],
    true,
  ),
);

const x264 = [
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '19',
  '-pix_fmt',
  'yuv420p',
  '-r',
  String(FPS),
];
const fades = (seconds) =>
  `fade=t=in:st=0:d=0.3,fade=t=out:st=${(seconds - 0.35).toFixed(2)}:d=0.35`;
const clips = [];
const clip = (name) => {
  const p = path.join(WORK, `${String(clips.length).padStart(2, '0')}-${name}.mp4`);
  clips.push(p);
  return p;
};

ff(
  '-f',
  'lavfi',
  '-i',
  `color=c=0x08090b:s=${W}x${H}:r=${FPS}:d=3`,
  '-framerate',
  String(FPS),
  '-i',
  intro,
  '-filter_complex',
  `[0][1]overlay=format=auto,${fades(3)}`,
  ...x264,
  '-t',
  '3',
  clip('intro'),
);
SHOTS.forEach((s, i) => {
  const cap = captions[i];
  if (s.still) {
    // a still gets a slow push-in so it reads as a shot, not a slide
    const n = Math.round(s.seconds * FPS);
    ff(
      '-loop',
      '1',
      '-i',
      s.still,
      // the caption is one image: loop it, or its fade leaves the only frame transparent
      '-loop',
      '1',
      '-i',
      cap,
      '-filter_complex',
      `[0]scale=${W * 2}:-1,zoompan=z='1+0.06*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS}[v];[1]format=rgba,fade=t=in:st=0.4:d=0.4:alpha=1[c];[v][c]overlay=format=auto:shortest=1,${fades(s.seconds)}`,
      ...x264,
      '-t',
      String(s.seconds),
      clip(`still${i}`),
    );
    return;
  }
  const dir = path.join(FOOTAGE, s.footage);
  if (!existsSync(dir))
    throw new Error(`missing footage ${s.footage}: run the trailer captures first`);
  const seconds = readdirSync(dir).length / FPS;
  ff(
    '-framerate',
    String(FPS),
    '-i',
    path.join(dir, 'f_%05d.jpg'),
    '-loop',
    '1',
    '-i',
    cap,
    '-filter_complex',
    `[0]scale=${W}:${H}[v];[1]format=rgba,fade=t=in:st=0.4:d=0.4:alpha=1[c];[v][c]overlay=format=auto:shortest=1,${fades(seconds)}`,
    ...x264,
    '-t',
    seconds.toFixed(3),
    clip(s.footage),
  );
});
ff(
  '-f',
  'lavfi',
  '-i',
  `color=c=0x08090b:s=${W}x${H}:r=${FPS}:d=4`,
  '-framerate',
  String(FPS),
  '-i',
  outro,
  '-filter_complex',
  '[0][1]overlay=format=auto,fade=t=in:st=0:d=0.3',
  ...x264,
  '-t',
  '4',
  clip('outro'),
);

writeFileSync(path.join(WORK, 'list.txt'), clips.map((c) => `file '${c}'`).join('\n') + '\n');
const out = path.join(ROOT, 'dead-sector-trailer.mp4');
ff(
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  path.join(WORK, 'list.txt'),
  '-c',
  'copy',
  '-movflags',
  '+faststart',
  out,
);
console.log(`trailer → ${out}`);
