import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import survivors from '../../../packages/content/survivors/survivors.json';
import looks from '../src/render/characterLooks.json';
import manifest from '../public/sprites/manifest.json';

const sheet = (key: string) =>
  readFileSync(fileURLToPath(new URL(`../public/sprites/${key}.png`, import.meta.url)));

describe('baked character sheets', () => {
  it('ships a sheet for every survivor template and infected look', () => {
    const expected = [
      ...Object.keys(looks.survivors).map((id) => `sv-${id}`),
      ...looks.walkers.map((_, i) => `zb-walker-${i}`),
      'zb-runner',
      'zb-heavy',
      'zb-screamer',
    ].sort();
    expect(Object.keys(manifest.sheets).sort()).toEqual(expected);
    for (const s of survivors) expect(looks.survivors).toHaveProperty(s.id);
  });

  it('keeps the frame layout the renderer expects', () => {
    // 0..7 walk, 8 attack, 9 corpse; a frame spans two cells
    expect(manifest.frames).toBe(10);
    expect(manifest.frameSize / manifest.pxPerCell).toBe(2);
  });

  for (const [key, s] of Object.entries(manifest.sheets))
    it(`${key}: the sheet matches its manifest and passed its bake checks`, () => {
      const png = sheet(key);
      expect(createHash('sha256').update(png).digest('hex')).toBe(s.sha256);
      // PNG IHDR: width and height big-endian at bytes 16 and 20; colour type 6 is RGBA
      expect(png.readUInt32BE(16)).toBe(manifest.frames * manifest.frameSize);
      expect(png.readUInt32BE(20)).toBe(manifest.frameSize);
      expect(png[25]).toBe(6);
      // every frame has a body in it, and nothing was cut off at the frame's edge
      expect(s.coverage).toHaveLength(manifest.frames);
      expect(Math.min(...s.coverage)).toBeGreaterThanOrEqual(0.03);
      expect(s.borderAlpha).toBeLessThan(0.05);
    });
});
