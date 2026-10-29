import { Settings } from '../ui/SaveStore';
import type { Cue, CueKind } from './cues';

/** Minimum seconds between two cues of the same kind (keeps bursts readable and cheap). */
const MIN_INTERVAL: Partial<Record<CueKind, number>> = {
  footstep: 0.07,
  groan: 0.22,
  shriek: 0.3,
  gunshot: 0.025,
  melee: 0.05,
  hurt: 0.12,
  order: 0.08,
  blocked: 0.3,
  horde: 1.5,
  zombieDeath: 0.06,
};

/** Distance (cells) at which a cue drops to half volume; loud events carry further. */
const HALF_DISTANCE: Partial<Record<CueKind, number>> = {
  gunshot: 34,
  horde: 60,
  doorBreak: 26,
  shriek: 26,
  groan: 16,
  footstep: 9,
};

/** Reverb send per kind: open-air slap for shots, little for close foley. */
const WET: Partial<Record<CueKind, number>> = {
  gunshot: 0.55,
  doorBreak: 0.45,
  groan: 0.35,
  shriek: 0.4,
  horde: 0.6,
  death: 0.4,
  objective: 0.3,
  panic: 0.35,
  victory: 0.4,
  defeat: 0.5,
};

const MAX_VOICES = 40;

/**
 * Procedural WebAudio sound engine. Every sound is synthesized at runtime from oscillators and
 * a noise buffer, so the project ships no third-party audio. Presentation only: it consumes
 * cues derived from simulation events and never feeds anything back into the simulation.
 */
export class AudioEngine {
  private static instance: AudioEngine | null = null;

  static get(): AudioEngine {
    if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine();
    return AudioEngine.instance;
  }

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambienceBus!: GainNode;
  private reverbIn!: GainNode;
  private noise!: AudioBuffer;
  private listener = { x: 0, y: 0 };
  private lastPlayed = new Map<CueKind, number>();
  private voices = 0;
  private ambience: {
    nodes: AudioScheduledSourceNode[];
    tension: GainNode;
    tensionFilter: BiquadFilterNode;
    radio: GainNode;
  } | null = null;

  /** Creates/resumes the context; must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = Settings.ambienceVolume;
    this.ambienceBus.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 1.9);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    reverb.buffer = ir;
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    this.reverbIn.connect(reverb).connect(this.master);
    this.applySettings();
  }

  applySettings(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(Settings.muted ? 0 : Settings.volume, t, 0.05);
    this.sfx.gain.setTargetAtTime(Settings.sfxVolume, t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(Settings.ambienceVolume, t, 0.05);
  }

  /** Short interface sound for menus (not positional, no simulation meaning). */
  uiClick(): void {
    if (!this.ready) return;
    this.play({ kind: 'order', muffled: false });
  }

  toggleMute(): boolean {
    Settings.muted = !Settings.muted;
    this.applySettings();
    return Settings.muted;
  }

  /** Listener follows the camera centre, in cells. */
  setListener(x: number, y: number): void {
    this.listener.x = x;
    this.listener.y = y;
  }

  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(cue.kind) ?? -1;
    if (now - last < (MIN_INTERVAL[cue.kind] ?? 0.02)) return;

    let gain = 1;
    let pan = 0;
    if (cue.x !== undefined && cue.y !== undefined) {
      const dx = cue.x - this.listener.x;
      const dy = cue.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      const half = HALF_DISTANCE[cue.kind] ?? 14;
      gain = 1 / (1 + (d / half) * (d / half));
      if (gain < 0.025) return;
      pan = Math.max(-0.85, Math.min(0.85, dx / 22));
    }
    if (cue.muffled) gain *= 0.6;
    this.lastPlayed.set(cue.kind, now);

    const out = ctx.createGain();
    out.gain.value = gain;
    let head: AudioNode = out;
    if (cue.muffled) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 650;
      head.connect(lp);
      head = lp;
    }
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    head.connect(panner).connect(this.sfx);
    const wet = WET[cue.kind] ?? 0.12;
    const send = ctx.createGain();
    send.gain.value = wet * (cue.muffled ? 1.3 : 1);
    out.connect(send).connect(this.reverbIn);

    this.voices++;
    const dur = this.synth(cue, out, now + 0.005);
    window.setTimeout(
      () => {
        this.voices--;
        out.disconnect();
        send.disconnect();
        panner.disconnect();
      },
      (dur + 2.2) * 1000,
    );
  }

  // ------------------------------------------------------------------ synthesis primitives

  private noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 1.5, dur + 0.05);
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = (this.ctx as AudioContext).createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Percussive envelope: fast attack, exponential decay. */
  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = (this.ctx as AudioContext).createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private osc(
    type: OscillatorType,
    t: number,
    dur: number,
    f0: number,
    f1?: number,
  ): OscillatorNode {
    const o = (this.ctx as AudioContext).createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noiseHit(
    out: AudioNode,
    t: number,
    dur: number,
    peak: number,
    type: BiquadFilterType,
    freq: number,
    q = 0.7,
  ): void {
    this.noiseSource(t, dur)
      .connect(this.filter(type, freq, q))
      .connect(this.env(t, peak, 0.002, dur))
      .connect(out);
  }

  private thump(
    out: AudioNode,
    t: number,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
  ): void {
    this.osc('sine', t, dur, f0, f1)
      .connect(this.env(t, peak, 0.003, dur))
      .connect(out);
  }

  private click(out: AudioNode, t: number, peak: number): void {
    this.noiseHit(out, t, 0.018, peak, 'highpass', 3200);
  }

  private voice(
    out: AudioNode,
    t: number,
    dur: number,
    f0: number,
    f1: number,
    formant: number,
    peak: number,
    vibrato = 0,
  ): void {
    const ctx = this.ctx as AudioContext;
    const o = this.osc('sawtooth', t, dur, f0, f1);
    if (vibrato > 0) {
      const lfo = this.osc('sine', t, dur, 4 + Math.random() * 3);
      const depth = ctx.createGain();
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(o.frequency);
    }
    const bp = this.filter('bandpass', formant, 3.5);
    bp.frequency.setValueAtTime(formant * 0.7, t);
    bp.frequency.linearRampToValueAtTime(formant * 1.25, t + dur * 0.4);
    bp.frequency.linearRampToValueAtTime(formant * 0.6, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.15, dur * 0.25));
    g.gain.setValueAtTime(peak * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(out);
    this.noiseSource(t, dur)
      .connect(this.filter('bandpass', formant * 1.6, 1.2))
      .connect(this.env(t, peak * 0.35, dur * 0.3, dur * 0.7))
      .connect(out);
  }

  private tone(
    out: AudioNode,
    type: OscillatorType,
    t: number,
    f: number,
    dur: number,
    peak: number,
  ): void {
    this.osc(type, t, dur, f)
      .connect(this.env(t, peak, 0.01, dur))
      .connect(out);
  }

  /** Builds the cue's graph into `out`; returns its duration in seconds. */
  private synth(cue: Cue, out: AudioNode, t: number): number {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (cue.kind) {
      case 'gunshot': {
        const kind = cue.variant ?? 'pistol';
        if (kind === 'shotgun') {
          this.noiseHit(out, t, 0.34, 1.0, 'lowpass', 3200);
          this.thump(out, t, 120, 38, 0.28, 1.0);
          this.noiseHit(out, t + 0.002, 0.05, 0.5, 'highpass', 2500);
          return 0.4;
        }
        if (kind === 'carbine') {
          this.noiseHit(out, t, 0.02, 0.9, 'highpass', 3000);
          this.noiseHit(out, t, 0.2, 0.85, 'lowpass', 8000);
          this.thump(out, t, 160, 50, 0.16, 0.8);
          return 0.25;
        }
        this.noiseHit(out, t, 0.14, 0.75, 'bandpass', 1800, 0.6);
        this.thump(out, t, 150, 55, 0.12, 0.7);
        return 0.2;
      }
      case 'melee':
        this.noiseHit(out, t, 0.08, 0.6, 'lowpass', 700);
        this.thump(out, t, 110, 60, 0.1, 0.6);
        return 0.12;
      case 'groan': {
        const d = r(0.8, 1.5);
        this.voice(out, t, d, r(62, 92), r(48, 70), r(380, 560), 0.45, r(2, 5));
        return d;
      }
      case 'shriek': {
        const d = r(0.5, 0.75);
        this.voice(out, t, d, r(360, 420), r(240, 300), 1500, 0.4, 18);
        this.noiseHit(out, t, d, 0.18, 'highpass', 2200);
        return d;
      }
      case 'horde':
        for (let i = 0; i < 4; i++)
          this.voice(
            out,
            t + i * r(0.12, 0.3),
            r(1.2, 2),
            r(55, 85),
            r(45, 60),
            r(350, 500),
            0.4,
            4,
          );
        return 2.6;
      case 'footstep': {
        const surface = cue.variant ?? 'street';
        const freq =
          surface === 'grass'
            ? 600
            : surface === 'floor'
              ? 2200
              : surface === 'rubble'
                ? 1500
                : 1100;
        const peak = surface === 'grass' ? 0.1 : 0.16;
        this.noiseHit(out, t, r(0.035, 0.06), peak, 'bandpass', freq * r(0.85, 1.15), 1.4);
        if (surface === 'rubble') this.noiseHit(out, t + 0.02, 0.03, 0.08, 'highpass', 3500);
        return 0.08;
      }
      case 'door': {
        const ctx = this.ctx as AudioContext;
        const o = this.osc('sawtooth', t, 0.38, 150);
        for (let i = 1; i < 10; i++) o.frequency.setValueAtTime(r(120, 200), t + i * 0.035);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        o.connect(this.filter('bandpass', 950, 6))
          .connect(g)
          .connect(out);
        this.thump(out, t + 0.33, 90, 55, 0.12, 0.45);
        return 0.5;
      }
      case 'doorBreak':
        this.noiseHit(out, t, 0.6, 1.0, 'lowpass', 2600);
        this.noiseHit(out, t, 0.06, 0.6, 'highpass', 3000);
        this.thump(out, t, 90, 40, 0.25, 0.9);
        this.thump(out, t + 0.09, 75, 38, 0.2, 0.6);
        for (let i = 0; i < 5; i++) this.click(out, t + 0.12 + i * r(0.03, 0.08), 0.3);
        return 0.8;
      case 'reload':
        this.click(out, t, 0.4);
        this.noiseHit(out, t + 0.08, 0.09, 0.18, 'bandpass', 2800, 2);
        this.click(out, t + 0.22, 0.5);
        return 0.3;
      case 'dryFire':
        this.click(out, t, 0.55);
        return 0.05;
      case 'hurt':
        this.voice(out, t, 0.22, r(190, 230), r(140, 160), 1000, 0.35);
        this.thump(out, t, 90, 50, 0.1, 0.4);
        return 0.25;
      case 'bite':
        this.voice(out, t, 0.35, r(230, 270), r(150, 170), 1200, 0.4, 12);
        this.noiseHit(out, t, 0.25, 0.5, 'lowpass', 750);
        this.thump(out, t, 70, 40, 0.15, 0.6);
        return 0.4;
      case 'death':
        this.voice(out, t, 0.75, r(170, 190), 85, 800, 0.35);
        this.tone(out, 'sine', t + 0.1, 55, 1.6, 0.35);
        this.tone(out, 'triangle', t + 0.1, 82.4, 1.6, 0.15);
        return 1.8;
      case 'zombieDeath':
        this.noiseHit(out, t, 0.25, 0.5, 'lowpass', 420);
        this.thump(out, t, 75, 38, 0.2, 0.55);
        return 0.3;
      case 'radio':
        for (let i = 0; i < 6; i++)
          this.noiseHit(out, t + i * 0.09, 0.07, 0.25, 'bandpass', 2300, 1.5);
        this.tone(out, 'sine', t + 0.6, 1180, 0.08, 0.2);
        this.tone(out, 'sine', t + 0.75, 1180, 0.08, 0.2);
        return 1;
      case 'objective':
        this.tone(out, 'triangle', t, 523.25, 0.7, 0.22);
        this.tone(out, 'triangle', t + 0.12, 783.99, 0.7, 0.2);
        this.tone(out, 'sine', t + 0.24, 1046.5, 0.9, 0.12);
        return 1.2;
      case 'panic': {
        const ctx = this.ctx as AudioContext;
        const lp = this.filter('lowpass', 400, 4);
        lp.frequency.linearRampToValueAtTime(2400, t + 1.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        this.osc('sawtooth', t, 1.3, 220).connect(lp);
        this.osc('sawtooth', t, 1.3, 233).connect(lp);
        lp.connect(g).connect(out);
        return 1.3;
      }
      case 'order':
        this.tone(out, 'sine', t, 880, 0.05, 0.07);
        return 0.06;
      case 'blocked':
        this.tone(out, 'square', t, 140, 0.1, 0.06);
        this.tone(out, 'square', t + 0.11, 110, 0.12, 0.06);
        return 0.25;
      case 'victory':
        for (const [i, f] of [392, 493.88, 587.33, 783.99].entries())
          this.tone(out, 'triangle', t + i * 0.18, f, 2.2, 0.16);
        return 3;
      case 'defeat':
        this.tone(out, 'sawtooth', t, 55, 3, 0.12);
        this.tone(out, 'sawtooth', t, 58.3, 3, 0.12);
        this.tone(out, 'sine', t + 0.4, 41.2, 3, 0.25);
        return 3.5;
    }
  }

  // ------------------------------------------------------------------ ambience

  /** Wind bed, an adaptive tension drone and a radio-static layer for the extraction. */
  startAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || this.ambience) return;
    const t = ctx.currentTime;
    const nodes: AudioScheduledSourceNode[] = [];

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const windLp = this.filter('lowpass', 380, 0.9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 220;
    lfo.connect(lfoDepth).connect(windLp.frequency);
    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.0001, t);
    windGain.gain.exponentialRampToValueAtTime(0.16, t + 3);
    wind.connect(windLp).connect(windGain).connect(this.ambienceBus);
    wind.start(t);
    lfo.start(t);
    nodes.push(wind, lfo);

    const tension = ctx.createGain();
    tension.gain.value = 0.0001;
    const tensionFilter = this.filter('lowpass', 180, 2);
    for (const f of [55, 55.7, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(tensionFilter);
      o.start(t);
      nodes.push(o);
    }
    tensionFilter.connect(tension).connect(this.ambienceBus);

    const radioSrc = ctx.createBufferSource();
    radioSrc.buffer = this.noise;
    radioSrc.loop = true;
    const radio = ctx.createGain();
    radio.gain.value = 0;
    radioSrc
      .connect(this.filter('bandpass', 2400, 1.4))
      .connect(radio)
      .connect(this.ambienceBus);
    radioSrc.start(t);
    nodes.push(radioSrc);

    this.ambience = { nodes, tension, tensionFilter, radio };
  }

  stopAmbience(): void {
    if (!this.ambience || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of this.ambience.nodes) n.stop(t + 0.3);
    this.ambience.tension.gain.setTargetAtTime(0.0001, t, 0.1);
    this.ambience = null;
  }

  /** 0..1 threat drives drone level and brightness. */
  setTension(level: number): void {
    if (!this.ambience || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambience.tension.gain.setTargetAtTime(0.0001 + level * 0.2, t, 1.2);
    this.ambience.tensionFilter.frequency.setTargetAtTime(160 + level * 700, t, 1.2);
  }

  setRadio(active: boolean): void {
    if (!this.ambience || !this.ctx) return;
    this.ambience.radio.gain.setTargetAtTime(active ? 0.035 : 0, this.ctx.currentTime, 0.4);
  }
}
