import { describe, expect, it } from 'vitest';
import { builtInRawContent, ContentValidationError, loadContent, validateContent } from '../src';

describe('content validation', () => {
  it('built-in content is valid and cross-referenced', () => {
    const c = loadContent();
    expect(Object.keys(c.weapons)).toEqual(
      expect.arrayContaining(['pistol', 'carbine', 'shotgun', 'melee']),
    );
    expect(c.zombieTypes['walker']?.maxHealth).toBe(100);
    expect(c.zombieTypes['runner']?.moveSpeedMetersPerSecond).toBe(2.4);
    const m = c.missions['a-ultima-farmacia']!;
    expect(m.squads.map((s) => s.memberIds.length)).toEqual([4, 4]);
    expect(
      m.zombieZones.filter((z) => z.typeId === 'walker').reduce((a, z) => a + z.count, 0),
    ).toBe(22);
    for (const special of ['heavy', 'screamer'])
      expect(m.zombieZones.some((z) => z.typeId === special)).toBe(true);
    expect(m.hordes?.routes.length).toBe(3);
    expect(
      m.zombieZones.filter((z) => z.typeId === 'runner').reduce((a, z) => a + z.count, 0),
    ).toBe(6);
    expect(m.reinforcements.budget).toBe(30);
    expect(m.reinforcements.maxConcurrent).toBe(60);
    const map = c.maps[m.mapId]!;
    expect([map.width, map.height]).toEqual([96, 96]);
  });

  it('fails with a descriptive error for a broken reference', () => {
    const survivors = (builtInRawContent.survivors as Array<Record<string, unknown>>).map((s, i) =>
      i === 0 ? { ...s, weaponId: 'laser' } : s,
    );
    expect(() => validateContent({ ...builtInRawContent, survivors })).toThrow(
      /unknown weapon laser/,
    );
  });

  it('fails with a descriptive error for malformed maps and values', () => {
    const map = { ...(builtInRawContent.maps[0] as Record<string, unknown>), rows: ['###'] };
    try {
      validateContent({ ...builtInRawContent, maps: [map] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentValidationError);
      expect((e as Error).message).toMatch(/rows/);
    }
    const zombies = (builtInRawContent.zombies as Array<Record<string, unknown>>).map((z) => ({
      ...z,
      biteChanceOnHit: 3,
    }));
    expect(() => validateContent({ ...builtInRawContent, zombies })).toThrow(
      ContentValidationError,
    );
  });
});
