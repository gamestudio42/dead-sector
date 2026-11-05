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
      ].sort(),
    );
  });

  for (const [name, e] of effects)
    it(`${name}: the strip matches its manifest and was verified transparent at the end`, () => {
      const png = sheet(name);
      expect(createHash('sha256').update(png).digest('hex')).toBe(e.sha256);
      // PNG IHDR: width and height are big-endian at bytes 16 and 20; colour type 6 is RGBA
      expect(png.readUInt32BE(16)).toBe(e.frames * e.frameWidth);
      expect(png.readUInt32BE(20)).toBe(e.frameHeight);
      expect(png[25]).toBe(6);
      expect(e.lastCoverage).toBeLessThanOrEqual(0.01);
      expect(e.maxAlpha).toBeGreaterThanOrEqual(128);
    });
});
