import type { Cue } from './sound';

/**
 * Synthesised one-shot effects.
 *
 * These are generated as they play rather than loaded, for three reasons.
 *
 * Repetition is the problem to solve: `move` fires once per square, so several times a roll and
 * hundreds of times a game. The same recording that often is what makes a game feel cheap,
 * while a voice built per call — with its pitch and level nudged each time — never quite
 * repeats. Second, a theme's sound is then a handful of numbers rather than a directory of
 * files: the same envelope with a different oscillator and filter *is* the difference between
 * the office themes and the cyberpunk one. Third, nothing to download, no licence, no missing
 * file to probe for and no autoplay gap.
 *
 * `Math.random` is used deliberately and only here. This is presentation, so it must not draw
 * on the engine's seeded stream — see the determinism note in CLAUDE.md.
 *
 * The extracted originals still win under the Original theme; see `Sound.play`.
 */

export type Voice = 'office' | 'cyber';

type Wave = OscillatorType | 'noise';

interface Layer {
  wave: Wave;
  /** Hz at the start, and at the end when the pitch should move. */
  freq: number;
  freqTo?: number;
  /** Seconds. `attack` is included in `dur`. */
  dur: number;
  attack?: number;
  gain: number;
  /** Delay before this layer starts, for two-part sounds. */
  at?: number;
  filter?: { type: BiquadFilterType; freq: number; freqTo?: number; q?: number };
  /** Cents of random detune per call, so repeats are never identical. */
  drift?: number;
}

type Recipe = Layer[];

/** A short filtered noise burst: dice on a desk, a drawer, a paper shuffle. */
const knock = (freq: number, dur: number, gain: number, q = 1.2): Layer => ({
  wave: 'noise',
  freq: 0,
  dur,
  gain,
  filter: { type: 'bandpass', freq, q },
});

/** A pitched blip. `to` bends it, which is most of what distinguishes one cue from another. */
const tone = (
  wave: OscillatorType,
  freq: number,
  to: number | undefined,
  dur: number,
  gain: number,
  extra: Partial<Layer> = {},
): Layer => ({ wave, freq, freqTo: to, dur, gain, drift: 25, ...extra });

/**
 * Recipes per voice.
 *
 * The office voice is wood, paper and plastic: narrow noise bursts, soft triangles, nothing
 * that rings. The cyberpunk voice is the same *rhythm* with electricity in place of wood —
 * square and sawtooth waves through a resonant filter, and pitch bends. Keeping the timing
 * identical between the two is what makes them feel like the same game in different clothes.
 */
const OFFICE: Partial<Record<string, Recipe>> = {
  roll: [knock(900, 0.07, 0.5), knock(620, 0.09, 0.4, 2), { ...knock(420, 0.12, 0.3, 2), at: 0.07 }],
  move: [knock(1400, 0.035, 0.28, 3)],
  trade: [tone('triangle', 520, 700, 0.09, 0.22), tone('triangle', 700, 880, 0.1, 0.2, { at: 0.07 })],
  soundOn: [tone('triangle', 660, 990, 0.12, 0.25)],
  projectTaken: [tone('triangle', 440, 587, 0.14, 0.24), knock(1200, 0.05, 0.16, 3)],
  projectComplete: [
    tone('triangle', 587, undefined, 0.12, 0.24),
    tone('triangle', 784, undefined, 0.14, 0.24, { at: 0.1 }),
    tone('triangle', 1046, undefined, 0.2, 0.22, { at: 0.2 }),
  ],
  chance: [tone('sine', 880, 1320, 0.1, 0.2), knock(2200, 0.04, 0.12, 4)],
  scruples: [tone('sine', 740, 560, 0.16, 0.2)],
  powerMonger: [tone('sawtooth', 220, 165, 0.2, 0.16, { filter: { type: 'lowpass', freq: 1200, q: 1 } })],
  stockMarket: [knock(700, 0.06, 0.3, 2), tone('triangle', 620, 760, 0.1, 0.16, { at: 0.05 })],
  stockHigh: [
    tone('triangle', 784, undefined, 0.1, 0.2),
    tone('triangle', 1175, undefined, 0.16, 0.2, { at: 0.08 }),
  ],
  resign: [tone('triangle', 392, 262, 0.26, 0.22, { filter: { type: 'lowpass', freq: 1600, q: 1 } })],
  demotion: [tone('triangle', 330, 196, 0.3, 0.22), knock(300, 0.16, 0.14, 1.5)],
  businessTrip: [tone('sine', 523, 784, 0.18, 0.2), tone('sine', 784, 1046, 0.2, 0.16, { at: 0.14 })],
  officeParty: [
    tone('triangle', 523, undefined, 0.1, 0.2),
    tone('triangle', 659, undefined, 0.1, 0.2, { at: 0.09 }),
    tone('triangle', 784, undefined, 0.18, 0.2, { at: 0.18 }),
  ],
  meetingGood: [tone('triangle', 587, 880, 0.16, 0.22)],
  meetingBad: [tone('triangle', 440, 330, 0.2, 0.2)],
  meetingTerrible: [tone('sawtooth', 300, 150, 0.34, 0.18, { filter: { type: 'lowpass', freq: 900, q: 1 } })],
  win: [
    tone('triangle', 523, undefined, 0.12, 0.24),
    tone('triangle', 659, undefined, 0.12, 0.24, { at: 0.11 }),
    tone('triangle', 784, undefined, 0.12, 0.24, { at: 0.22 }),
    tone('triangle', 1046, undefined, 0.3, 0.26, { at: 0.33 }),
  ],
  crash: [
    tone('sawtooth', 260, 60, 0.6, 0.2, { filter: { type: 'lowpass', freq: 800, freqTo: 160, q: 2 } }),
    knock(200, 0.5, 0.14, 0.8),
  ],
};

const CYBER: Partial<Record<string, Recipe>> = {
  roll: [
    tone('square', 1200, 300, 0.09, 0.16, { filter: { type: 'bandpass', freq: 1600, freqTo: 500, q: 6 } }),
    knock(2400, 0.05, 0.2, 5),
    { ...knock(900, 0.1, 0.16, 4), at: 0.07 },
  ],
  move: [tone('square', 2200, 1600, 0.03, 0.14, { filter: { type: 'highpass', freq: 900, q: 1 } })],
  trade: [
    tone('square', 660, 1320, 0.07, 0.14, { filter: { type: 'bandpass', freq: 1400, q: 5 } }),
    tone('square', 990, 1760, 0.08, 0.12, { at: 0.06, filter: { type: 'bandpass', freq: 1800, q: 5 } }),
  ],
  soundOn: [tone('square', 880, 1760, 0.12, 0.16, { filter: { type: 'bandpass', freq: 2000, q: 4 } })],
  projectTaken: [
    tone('sawtooth', 330, 660, 0.12, 0.14, { filter: { type: 'lowpass', freq: 2400, q: 4 } }),
    knock(3000, 0.04, 0.12, 6),
  ],
  projectComplete: [
    tone('square', 659, undefined, 0.1, 0.14, { filter: { type: 'bandpass', freq: 1600, q: 4 } }),
    tone('square', 988, undefined, 0.1, 0.14, { at: 0.09, filter: { type: 'bandpass', freq: 2000, q: 4 } }),
    tone('square', 1319, 1568, 0.22, 0.14, { at: 0.18, filter: { type: 'bandpass', freq: 2600, q: 3 } }),
  ],
  chance: [tone('square', 1200, 2400, 0.1, 0.14, { filter: { type: 'bandpass', freq: 2600, q: 6 } })],
  scruples: [tone('sawtooth', 900, 500, 0.18, 0.14, { filter: { type: 'lowpass', freq: 2200, freqTo: 700, q: 6 } })],
  powerMonger: [
    tone('sawtooth', 165, 110, 0.28, 0.16, { filter: { type: 'lowpass', freq: 1400, freqTo: 400, q: 5 } }),
  ],
  stockMarket: [tone('square', 740, 880, 0.08, 0.14, { filter: { type: 'bandpass', freq: 1500, q: 5 } })],
  stockHigh: [
    tone('square', 988, undefined, 0.09, 0.14, { filter: { type: 'bandpass', freq: 2000, q: 4 } }),
    tone('square', 1568, 1976, 0.18, 0.14, { at: 0.08, filter: { type: 'bandpass', freq: 2800, q: 3 } }),
  ],
  resign: [tone('sawtooth', 440, 110, 0.34, 0.16, { filter: { type: 'lowpass', freq: 1800, freqTo: 300, q: 4 } })],
  demotion: [tone('sawtooth', 330, 82, 0.4, 0.16, { filter: { type: 'lowpass', freq: 1200, freqTo: 240, q: 4 } })],
  businessTrip: [
    tone('sawtooth', 220, 1200, 0.3, 0.14, { filter: { type: 'bandpass', freq: 1200, freqTo: 3000, q: 4 } }),
  ],
  officeParty: [
    tone('square', 523, undefined, 0.09, 0.14, { filter: { type: 'bandpass', freq: 1400, q: 5 } }),
    tone('square', 784, undefined, 0.09, 0.14, { at: 0.08, filter: { type: 'bandpass', freq: 1800, q: 5 } }),
    tone('square', 1046, 1568, 0.2, 0.14, { at: 0.16, filter: { type: 'bandpass', freq: 2400, q: 4 } }),
  ],
  meetingGood: [tone('square', 659, 1319, 0.16, 0.14, { filter: { type: 'bandpass', freq: 2000, q: 4 } })],
  meetingBad: [tone('sawtooth', 392, 196, 0.22, 0.14, { filter: { type: 'lowpass', freq: 1600, q: 4 } })],
  meetingTerrible: [
    tone('sawtooth', 260, 70, 0.42, 0.16, { filter: { type: 'lowpass', freq: 1000, freqTo: 180, q: 5 } }),
  ],
  win: [
    tone('square', 523, undefined, 0.11, 0.15, { filter: { type: 'bandpass', freq: 1400, q: 4 } }),
    tone('square', 784, undefined, 0.11, 0.15, { at: 0.1, filter: { type: 'bandpass', freq: 1800, q: 4 } }),
    tone('square', 1046, undefined, 0.11, 0.15, { at: 0.2, filter: { type: 'bandpass', freq: 2200, q: 4 } }),
    tone('sawtooth', 1568, 2093, 0.34, 0.14, { at: 0.3, filter: { type: 'bandpass', freq: 3000, q: 3 } }),
  ],
  crash: [
    tone('sawtooth', 300, 40, 0.7, 0.18, { filter: { type: 'lowpass', freq: 900, freqTo: 120, q: 6 } }),
    { ...knock(160, 0.6, 0.12, 0.7), at: 0.05 },
  ],
};

const RECIPES: Record<Voice, Partial<Record<string, Recipe>>> = { office: OFFICE, cyber: CYBER };

/** Cues with no recipe: the spoken ones, which are recordings or nothing. */
const key = (cue: Cue): string => (cue.includes(':') ? cue.slice(0, cue.indexOf(':')) : cue);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** One second of noise, reused by every burst rather than rebuilt per call. */
  private noise: AudioBuffer | null = null;

  /** Whether this cue can be synthesised at all. */
  covers(cue: Cue, voice: Voice): boolean {
    if (key(cue) === 'promotion') return true;
    return RECIPES[voice][cue] !== undefined;
  }

  play(cue: Cue, voice: Voice): void {
    const recipe = this.recipe(cue, voice);
    if (!recipe) return;
    const ctx = this.audio();
    if (!ctx) return;
    // Created before the first gesture, a context starts suspended; resuming is a no-op after.
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const layer of recipe) this.layer(ctx, layer, now + (layer.at ?? 0));
  }

  /** Promotion is rank-indexed, so its fanfare rises with the rank rather than being one sound. */
  private recipe(cue: Cue, voice: Voice): Recipe | undefined {
    if (key(cue) !== 'promotion') return RECIPES[voice][cue];
    const rank = Number(cue.slice('promotion:'.length)) || 1;
    const step = Math.min(5, Math.max(1, rank));
    const base = 392 * Math.pow(2, (step - 1) / 12 / 2);
    const wave: OscillatorType = voice === 'cyber' ? 'square' : 'triangle';
    const filter = voice === 'cyber' ? { type: 'bandpass' as BiquadFilterType, freq: 1800, q: 4 } : undefined;
    return [
      tone(wave, base, undefined, 0.1, 0.2, { filter }),
      tone(wave, base * 1.26, undefined, 0.1, 0.2, { at: 0.09, filter }),
      tone(wave, base * 1.5, undefined, 0.12, 0.2, { at: 0.18, filter }),
      tone(wave, base * 2, base * 2.4, 0.28, 0.22, { at: 0.28, filter }),
    ];
  }

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      // No Web Audio: the game is silent, which is a supported state.
      return null;
    }
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  private layer(ctx: AudioContext, layer: Layer, at: number): void {
    const gain = ctx.createGain();
    const attack = layer.attack ?? 0.004;
    const peak = layer.gain * (0.9 + Math.random() * 0.2);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    // Exponential decay, since a linear one reads as a click at the tail.
    gain.gain.exponentialRampToValueAtTime(0.0001, at + layer.dur);

    let tail: AudioNode = gain;
    if (layer.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter.type;
      filter.Q.value = layer.filter.q ?? 1;
      filter.frequency.setValueAtTime(layer.filter.freq, at);
      if (layer.filter.freqTo !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, layer.filter.freqTo), at + layer.dur);
      }
      gain.connect(filter);
      tail = filter;
    }
    tail.connect(this.master!);

    if (layer.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      // A random offset into the buffer, so successive bursts are not the same noise.
      src.start(at, Math.random() * 0.9, layer.dur);
      src.connect(gain);
      src.stop(at + layer.dur + 0.01);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = layer.wave;
    const drift = layer.drift ? 1 + (Math.random() - 0.5) * (layer.drift / 1200) : 1;
    osc.frequency.setValueAtTime(layer.freq * drift, at);
    if (layer.freqTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.freqTo * drift), at + layer.dur);
    }
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + layer.dur + 0.01);
  }
}
