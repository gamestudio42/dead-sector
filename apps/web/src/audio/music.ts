/**
 * The game's score, as data. Pure: given a mood, a step and how tense the moment is, it says which
 * notes start on that step and how loud each layer should be. `MusicPlayer` turns that into sound.
 *
 * Everything is in A minor. The tactical loop leans on the flat second (B♭, Phrygian) for dread,
 * and the dominant is E major (G♯) so phrases resolve. A bar is 16 steps (sixteenth notes).
 */

export type Mood = 'off' | 'menu' | 'strategic' | 'tactical';
export type Layer = 'pad' | 'bass' | 'pulse' | 'lead' | 'kick' | 'snare' | 'hat';

export interface MusicNote {
  layer: Layer;
  /** MIDI note number (ignored by the drum layers). */
  midi: number;
  /** Length in steps. */
  steps: number;
  /** 0..1 */
  velocity: number;
}

export const STEPS_PER_BAR = 16;

export const BPM: Record<Exclude<Mood, 'off'>, number> = { menu: 70, strategic: 66, tactical: 92 };

interface Chord {
  /** Bass root (MIDI). */
  root: number;
  /** Pad voicing (MIDI). */
  notes: number[];
}

const Am: Chord = { root: 45, notes: [57, 60, 64, 71] };
const F: Chord = { root: 41, notes: [53, 57, 60, 64] };
const Dm: Chord = { root: 38, notes: [50, 57, 60, 65] };
const Esus: Chord = { root: 40, notes: [52, 57, 59, 64] };
const E: Chord = { root: 40, notes: [52, 56, 59, 64] };
const Bb: Chord = { root: 46, notes: [50, 58, 62, 65] };
const C: Chord = { root: 36, notes: [48, 55, 60, 64] };
const G: Chord = { root: 43, notes: [50, 55, 59, 62] };

const PROGRESSIONS: Record<Exclude<Mood, 'off'>, Chord[]> = {
  menu: [Am, F, Dm, Esus, Am, F, Dm, E],
  strategic: [Am, F, C, G, Am, F, Dm, E],
  tactical: [Am, Am, Bb, Am, Am, F, Dm, E],
};

/** The menu theme: [step, midi, steps] per bar, eight bars over the menu progression. */
const THEME: [number, number, number][][] = [
  [
    [0, 76, 6],
    [6, 72, 2],
    [8, 71, 4],
    [12, 69, 4],
  ],
  [
    [0, 69, 6],
    [6, 72, 2],
    [8, 77, 8],
  ],
  [
    [0, 76, 4],
    [4, 74, 4],
    [8, 77, 4],
    [12, 81, 4],
  ],
  [[0, 76, 12]],
  [
    [0, 81, 6],
    [6, 79, 2],
    [8, 76, 8],
  ],
  [
    [0, 77, 4],
    [4, 76, 4],
    [8, 72, 8],
  ],
  [
    [0, 74, 6],
    [6, 76, 2],
    [8, 77, 4],
    [12, 76, 4],
  ],
  [
    [0, 71, 8],
    [8, 68, 8],
  ],
];

/** Pitch classes the score may use: A natural minor plus G♯ and B♭. */
export const ALLOWED_PITCH_CLASSES = new Set([9, 11, 0, 2, 4, 5, 7, 8, 10]);

export function chordAt(mood: Exclude<Mood, 'off'>, bar: number): Chord {
  const prog = PROGRESSIONS[mood];
  return prog[((bar % prog.length) + prog.length) % prog.length]!;
}

/** Notes that start on this step. Deterministic: the same arguments always give the same notes. */
export function notesAt(mood: Mood, step: number, alarm = 0): MusicNote[] {
  if (mood === 'off' || step < 0) return [];
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const chord = chordAt(mood, bar);
  const cycle = Math.floor(bar / 8);
  const out: MusicNote[] = [];

  // pad: the chord held for the whole bar
  if (s === 0)
    for (const midi of chord.notes) out.push({ layer: 'pad', midi, steps: 16, velocity: 0.8 });

  // bass: root on beats one and three, a heartbeat pickup in the tactical loop
  if (s === 0 || s === 8) out.push({ layer: 'bass', midi: chord.root, steps: 6, velocity: 0.9 });
  if (mood === 'tactical' && s === 2)
    out.push({ layer: 'bass', midi: chord.root, steps: 2, velocity: 0.55 });

  // pulse: chord tones on every eighth (tactical) or a slow arpeggio (strategic)
  if (mood === 'tactical' && s % 2 === 0) {
    const order = [0, 2, 1, 3, 2, 1, 3, 2];
    const n = chord.notes[order[s / 2]!]!;
    out.push({ layer: 'pulse', midi: n + 12, steps: 1, velocity: s % 8 === 0 ? 0.9 : 0.6 });
  }
  if (mood === 'strategic' && [0, 3, 6, 10].includes(s)) {
    const n = chord.notes[[0, 2, 3, 1][[0, 3, 6, 10].indexOf(s)]!]!;
    out.push({ layer: 'pulse', midi: n + 12, steps: 3, velocity: 0.7 });
  }

  // lead: the theme on every other pass through the menu loop, so it never wears out
  if (mood === 'menu' && cycle % 2 === 1)
    for (const [at, midi, steps] of THEME[bar % 8]!)
      if (at === s) out.push({ layer: 'lead', midi, steps, velocity: 0.8 });

  // drums: only the tactical loop has them; the layer levels decide whether they are heard
  if (mood === 'tactical') {
    if (s === 0 || s === 6 || s === 8 || (alarm >= 3 && s === 14))
      out.push({ layer: 'kick', midi: 0, steps: 1, velocity: s === 0 ? 1 : 0.75 });
    if (s === 4 || s === 12) out.push({ layer: 'snare', midi: 0, steps: 1, velocity: 0.8 });
    if (alarm >= 3 ? true : s % 2 === 0)
      out.push({ layer: 'hat', midi: 0, steps: 1, velocity: s % 4 === 2 ? 0.7 : 0.4 });
  }
  return out;
}

/**
 * How loud each layer is (0..1). The tactical score builds with the threat (0..1, from
 * `threatLevel`) and the district alarm (0..3): a quiet pad while sneaking, a heartbeat bass once
 * something hunts the squad, a pulse as it closes in and drums when the alarm is up or the fight is
 * on. The extraction keeps at least the pulse going.
 */
export function layerLevels(
  mood: Mood,
  threat: number,
  alarm: number,
  extraction = false,
): Record<Layer, number> {
  const zero = { pad: 0, bass: 0, pulse: 0, lead: 0, kick: 0, snare: 0, hat: 0 };
  if (mood === 'off') return zero;
  if (mood === 'menu') return { ...zero, pad: 0.8, bass: 0.5, lead: 0.7 };
  if (mood === 'strategic') return { ...zero, pad: 0.7, bass: 0.4, pulse: 0.5 };
  const t = Math.max(0, Math.min(1, threat));
  const ramp = (from: number, to: number) => Math.max(0, Math.min(1, (t - from) / (to - from)));
  const urgency = Math.max(extraction ? 0.6 : 0, alarm >= 2 ? 0.5 + (alarm - 2) * 0.25 : 0);
  const drums = Math.max(ramp(0.6, 0.9), alarm >= 2 ? 0.6 + (alarm - 2) * 0.4 : 0);
  return {
    ...zero,
    pad: 0.55 + 0.25 * t,
    bass: Math.max(ramp(0.15, 0.4), urgency),
    pulse: Math.max(ramp(0.35, 0.65), urgency),
    kick: drums,
    snare: drums * 0.8,
    hat: drums * 0.6,
  };
}

export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
