import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PITCH_CLASSES,
  layerLevels,
  notesAt,
  STEPS_PER_BAR,
  type Mood,
} from '../src/audio/music';

const MOODS: Mood[] = ['menu', 'strategic', 'tactical'];
const loop = (mood: Mood, alarm = 0) =>
  Array.from({ length: STEPS_PER_BAR * 16 }, (_, step) => notesAt(mood, step, alarm)).flat();

describe('music score', () => {
  it('is deterministic', () => {
    for (const mood of MOODS) expect(loop(mood, 2)).toEqual(loop(mood, 2));
  });

  it('stays in A minor (with G sharp and B flat)', () => {
    for (const mood of MOODS)
      for (const n of loop(mood, 3))
        if (!['kick', 'snare', 'hat'].includes(n.layer))
          expect(ALLOWED_PITCH_CLASSES.has(n.midi % 12), `${mood} ${n.layer} ${n.midi}`).toBe(true);
  });

  it('keeps notes in a playable range and lengths positive', () => {
    for (const mood of MOODS)
      for (const n of loop(mood, 3)) {
        expect(n.steps).toBeGreaterThan(0);
        expect(n.velocity).toBeGreaterThan(0);
        expect(n.velocity).toBeLessThanOrEqual(1);
        if (n.midi) expect(n.midi).toBeGreaterThanOrEqual(36);
        if (n.midi) expect(n.midi).toBeLessThanOrEqual(84);
      }
  });

  it('opens every bar with the chord and plays the menu theme only on alternate passes', () => {
    for (const mood of MOODS)
      for (let bar = 0; bar < 16; bar++)
        expect(notesAt(mood, bar * STEPS_PER_BAR).filter((n) => n.layer === 'pad').length).toBe(4);
    const leadBars = new Set(
      Array.from({ length: STEPS_PER_BAR * 32 }, (_, s) => s)
        .filter((s) => notesAt('menu', s).some((n) => n.layer === 'lead'))
        .map((s) => Math.floor(s / STEPS_PER_BAR / 8)),
    );
    expect([...leadBars].sort()).toEqual([1, 3]);
  });

  it('is silent when off', () => {
    expect(notesAt('off', 0)).toEqual([]);
    expect(Object.values(layerLevels('off', 1, 3)).every((v) => v === 0)).toBe(true);
  });

  it('builds the tactical score with the threat and the alarm', () => {
    const calm = layerLevels('tactical', 0, 0);
    expect(calm.pad).toBeGreaterThan(0);
    expect(calm.bass + calm.pulse + calm.kick).toBe(0);
    const hunted = layerLevels('tactical', 0.5, 0);
    expect(hunted.bass).toBeGreaterThan(0.9);
    expect(hunted.kick).toBe(0);
    const loud = layerLevels('tactical', 0.2, 2);
    expect(loud.kick).toBeGreaterThan(0);
    expect(layerLevels('tactical', 0.2, 3).kick).toBeGreaterThan(loud.kick);
    expect(layerLevels('tactical', 0, 0, true).pulse).toBeGreaterThan(0);
    // more threat never makes a layer quieter
    for (let t = 0; t < 1; t += 0.05) {
      const a = layerLevels('tactical', t, 1);
      const b = layerLevels('tactical', t + 0.05, 1);
      for (const k of Object.keys(a) as (keyof typeof a)[])
        expect(b[k]).toBeGreaterThanOrEqual(a[k]);
    }
  });

  it('keeps drums out of the menu and the campaign map', () => {
    for (const mood of ['menu', 'strategic'] as const) {
      const l = layerLevels(mood, 1, 3);
      expect(l.kick + l.snare + l.hat).toBe(0);
    }
  });
});
