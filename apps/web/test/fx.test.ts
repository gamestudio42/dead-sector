import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../public/fx/manifest.json';

const sheet = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../public/fx/${name}.png`, import.meta.url)));

describe('baked combat effects', () => {
  const effects = Object.entries(manifest.effects);

  it('ships the effects the renderer plays', () => {
    expect(Object.keys(manifest.effects).sort()).toEqual(
      [
        'blood_hit',
        'door_splinters',
        'dust_puff',
        'glass_shatter',
        'ichor_hit',
        'impact_sparks',
        'infected_death',
        'muzzle_flash',
        'plank_splinters',
        'scream_burst',
        'wreck_fire',
        'wreck_smoke',
        'beacon_pulse',
      ].sort(),
    );
  });

  for (const [name, e] of effects)
    it(`${name}: the strip matches its manifest and passed its bake checks`, () => {
      const png = sheet(name);
      expect(createHash('sha256').update(png).digest('hex')).toBe(e.sha256);
      // PNG IHDR: width and height are big-endian at bytes 16 and 20; colour type 6 is RGBA
      // frames run left to right and wrap onto more rows when a strip would be too wide
      const columns = 'columns' in e ? e.columns : e.frames;
      expect(png.readUInt32BE(16)).toBe(columns * e.frameWidth);
      expect(png.readUInt32BE(20)).toBe(Math.ceil(e.frames / columns) * e.frameHeight);
      expect(png.readUInt32BE(16)).toBeLessThanOrEqual(4096);
      expect(png[25]).toBe(6);
      // a one-shot effect must end transparent; a loop must meet its own first frame
      if ('loop' in e && e.loop) expect(e.loopSeam).toBeLessThanOrEqual(24);
      else expect(e.lastCoverage).toBeLessThanOrEqual(0.01);
      expect(e.maxAlpha).toBeGreaterThanOrEqual(name === 'wreck_smoke' ? 64 : 128);
    });
});
