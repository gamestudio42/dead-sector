#!/usr/bin/env node
/**
 * Renders the game's score to WAV files, offline and faster than real time, with the same
 * MusicPlayer the game uses, for listening, the trailer and store videos.
 *
 *   node tools/music/render.mjs [--out DIR]
 *
 * It serves apps/web with Vite, opens headless Chromium with Playwright, renders each clip in an
 * OfflineAudioContext and writes 16-bit stereo WAVs. It prints the peak and loudness of each clip
 * and exits non-zero if one clips (peak at or above 0 dBFS) or is nearly silent.
 */
/* global OfflineAudioContext -- used inside page.evaluate, which runs in the browser */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const web = path.join(root, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const out = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'music-render');
const SR = 44100;

/** Each clip: a mood and the intensity over time ([seconds, threat, alarm, extraction]). */
const CLIPS = [
  { name: 'menu', mood: 'menu', seconds: 60, timeline: [[0, 0, 0, false]] },
  { name: 'campaign', mood: 'strategic', seconds: 32, timeline: [[0, 0, 0, false]] },
  { name: 'tactical-sneaking', mood: 'tactical', seconds: 20, timeline: [[0, 0.05, 0, false]] },
  { name: 'tactical-hunted', mood: 'tactical', seconds: 20, timeline: [[0, 0.55, 1, false]] },
  { name: 'tactical-alarm', mood: 'tactical', seconds: 20, timeline: [[0, 0.8, 3, false]] },
  { name: 'tactical-extraction', mood: 'tactical', seconds: 20, timeline: [[0, 0.3, 1, true]] },
  {
    // the arc of a mission in 30 s, for the trailer: sneaking, found, the alarm, the horde
    name: 'trailer-30s',
    mood: 'tactical',
    seconds: 30,
    timeline: [
      [0, 0.05, 0, false],
      [7, 0.5, 1, false],
      [14, 0.7, 2, false],
      [21, 1, 3, false],
    ],
  },
];

function wav(left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

const server = await createServer({
  root: web,
  configFile: path.join(web, 'vite.config.ts'),
  server: { port: 4319, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:4319/');
  mkdirSync(out, { recursive: true });
  for (const clip of CLIPS) {
    const data = await page.evaluate(
      async ({ clip, SR }) => {
        const { MusicPlayer } = await import('/src/audio/MusicPlayer.ts');
        const ctx = new OfflineAudioContext(2, SR * clip.seconds, SR);
        const noise = ctx.createBuffer(1, SR * 2, SR);
        const nd = noise.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        // the same room as the game: a 1.9 s decaying noise impulse at half level
        const ir = ctx.createBuffer(2, Math.floor(SR * 1.9), SR);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < d.length; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
        }
        const verb = ctx.createConvolver();
        verb.buffer = ir;
        const verbIn = ctx.createGain();
        verbIn.gain.value = 0.5;
        verbIn.connect(verb).connect(ctx.destination);
        const player = new MusicPlayer(ctx, ctx.destination, verbIn, noise);
        player.setMood(clip.mood);
        const at = (t) => {
          let cur = clip.timeline[0];
          for (const k of clip.timeline) if (k[0] <= t) cur = k;
          return cur;
        };
        // schedule in half-second slices so layers that fade in later still get their notes
        let last = null;
        const slice = (t) => {
          const k = at(t);
          if (k !== last) {
            player.setIntensity(k[1], k[2], k[3]);
            last = k;
          }
          player.fill(t + 1);
        };
        slice(0);
        for (let t = 0.5; t < clip.seconds; t += 0.5)
          ctx.suspend(t).then(() => {
            slice(t);
            return ctx.resume();
          });
        const buf = await ctx.startRendering();
        player.dispose();
        const L = buf.getChannelData(0);
        const R = buf.getChannelData(1);
        let peak = 0;
        let sum = 0;
        for (let i = 0; i < L.length; i++) {
          peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
          sum += L[i] * L[i] + R[i] * R[i];
        }
        return { L: Array.from(L), R: Array.from(R), peak, rms: Math.sqrt(sum / (2 * L.length)) };
      },
      { clip, SR },
    );
    const file = path.join(out, `dead-sector-${clip.name}.wav`);
    writeFileSync(file, wav(data.L, data.R));
    const bad = data.peak >= 1 || data.rms < 0.005;
    failed ||= bad;
    console.log(
      `${clip.name.padEnd(20)} ${clip.seconds}s  peak ${db(data.peak).toFixed(1)} dBFS  rms ${db(data.rms).toFixed(1)} dBFS ${bad ? ' FAIL' : ''}`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`written to ${out}`);
process.exit(failed ? 1 : 0);
