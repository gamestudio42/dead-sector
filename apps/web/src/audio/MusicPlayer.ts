import {
  BPM,
  layerLevels,
  midiToHz,
  notesAt,
  type Layer,
  type Mood,
  type MusicNote,
} from './music';

const LAYERS: Layer[] = ['pad', 'bass', 'pulse', 'lead', 'kick', 'snare', 'hat'];
/** How far ahead notes are scheduled (s) and how often the scheduler wakes (ms). */
const LOOKAHEAD = 0.35;
const TICK_MS = 60;
/** Reverb send per layer. */
const WET: Record<Layer, number> = {
  pad: 0.6,
  bass: 0.1,
  pulse: 0.3,
  lead: 0.55,
  kick: 0.15,
  snare: 0.3,
  hat: 0.1,
};
/** Mix level of each layer at full intensity. */
const MIX: Record<Layer, number> = {
  pad: 0.05,
  bass: 0.16,
  pulse: 0.05,
  lead: 0.07,
  kick: 0.32,
  snare: 0.12,
  hat: 0.035,
};

/**
 * Plays the score from `music.ts` with WebAudio synths, scheduled slightly ahead of the audio
 * clock so timing does not depend on frame rate. Presentation only.
 */
export class MusicPlayer {
  private readonly bus: GainNode;
  private readonly layers = {} as Record<Layer, GainNode>;
  private mood: Mood = 'off';
  private pending: Mood | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private alarm = 0;
  private levels = layerLevels('off', 0, 0);

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly reverb: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    for (const l of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      const send = ctx.createGain();
      send.gain.value = WET[l];
      g.connect(send).connect(reverb);
      this.layers[l] = g;
    }
  }

  /** Switches the piece: fades the current one out, then starts the new one from its first bar. */
  setMood(mood: Mood): void {
    if (mood === (this.pending ?? this.mood)) return;
    const t = this.ctx.currentTime;
    if (this.mood === 'off') {
      this.start(mood);
      return;
    }
    this.pending = mood;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.35);
    window.setTimeout(() => {
      const next = this.pending;
      this.pending = null;
      if (next !== null) this.start(next);
    }, 1400);
  }

  /** Tactical intensity: threat 0..1, district alarm 0..3, extraction under way. */
  setIntensity(threat: number, alarm: number, extraction: boolean): void {
    this.alarm = alarm;
    this.levels = layerLevels(this.mood, threat, alarm, extraction);
    this.applyLevels(2.5);
  }

  private start(mood: Mood): void {
    this.mood = mood;
    this.step = 0;
    this.levels = layerLevels(mood, 0, 0);
    const t = this.ctx.currentTime;
    this.applyLevels(0.01);
    this.bus.gain.cancelScheduledValues(t);
    if (mood === 'off') {
      this.bus.gain.setTargetAtTime(0, t, 0.3);
      this.stopTimer();
      return;
    }
    this.bus.gain.setValueAtTime(0, t);
    this.bus.gain.linearRampToValueAtTime(1, t + 3);
    this.nextTime = t + 0.1;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private applyLevels(timeConstant: number): void {
    const t = this.ctx.currentTime;
    for (const l of LAYERS)
      this.layers[l].gain.setTargetAtTime(this.levels[l] * MIX[l], t, timeConstant);
  }

  /** Stops the scheduler (the offline renderer in tools/music calls this when it is done). */
  dispose(): void {
    this.stopTimer();
  }

  private schedule(): void {
    if (this.mood === 'off' || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // a throttled background tab can fall behind: skip ahead instead of firing a burst
    if (this.nextTime < now) this.nextTime = now + 0.05;
    this.fill(now + LOOKAHEAD);
  }

  /** Schedules every step that starts before `until` (audio-clock seconds). */
  fill(until: number): void {
    if (this.mood === 'off') return;
    const stepLen = 60 / BPM[this.mood] / 4;
    while (this.nextTime < until) {
      for (const n of notesAt(this.mood, this.step, this.alarm))
        if (this.levels[n.layer] > 0.01) this.voice(n, this.nextTime, stepLen);
      this.step++;
      this.nextTime += stepLen;
    }
  }

  private voice(n: MusicNote, t: number, stepLen: number): void {
    const ctx = this.ctx;
    const out = this.layers[n.layer];
    const dur = n.steps * stepLen;
    const v = n.velocity;
    switch (n.layer) {
      case 'pad': {
        // three detuned saws through a slow low-pass: a cold string pad
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        lp.Q.value = 0.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + Math.min(1.6, dur * 0.4));
        g.gain.setTargetAtTime(0.0001, t + dur, 0.9);
        for (const detune of [-9, 0, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midiToHz(n.midi);
          o.detune.value = detune;
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + 4);
        }
        lp.connect(g).connect(out);
        break;
      }
      case 'bass': {
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 260;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, dur));
        for (const [type, mult] of [
          ['sine', 1],
          ['triangle', 2],
        ] as const) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = midiToHz(n.midi) * mult;
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + 0.1);
        }
        lp.connect(g).connect(out);
        break;
      }
      case 'pulse':
      case 'lead': {
        // plucked: bright attack that closes quickly, like a muted piano or harp
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        const lead = n.layer === 'lead';
        lp.frequency.setValueAtTime(lead ? 3200 : 2400, t);
        lp.frequency.exponentialRampToValueAtTime(lead ? 900 : 500, t + 0.25);
        const tail = lead ? Math.max(1.2, dur) : Math.max(0.18, dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + tail);
        const o = ctx.createOscillator();
        o.type = lead ? 'triangle' : 'square';
        o.frequency.value = midiToHz(n.midi);
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = midiToHz(n.midi) * 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.3;
        o.connect(lp);
        o2.connect(g2).connect(lp);
        lp.connect(g).connect(out);
        for (const x of [o, o2]) {
          x.start(t);
          x.stop(t + tail + 0.05);
        }
        break;
      }
      case 'kick': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.4);
        break;
      }
      case 'snare':
      case 'hat': {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        const hat = n.layer === 'hat';
        f.type = hat ? 'highpass' : 'bandpass';
        f.frequency.value = hat ? 7000 : 1700;
        f.Q.value = hat ? 0.7 : 0.9;
        const g = ctx.createGain();
        const len = hat ? 0.045 : 0.18;
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(f).connect(g).connect(out);
        src.start(t, Math.random() * 1.5);
        src.stop(t + len + 0.02);
        break;
      }
    }
  }
}
