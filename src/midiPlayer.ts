import { parseMidi, type MidiFile, type MidiNote } from './midi';

/**
 * Web Audio playback for a parsed MIDI file.
 *
 * Browsers have no native MIDI support, and the usual answers — a WASM softsynth plus a
 * SoundFont — mean shipping megabytes of binary. Instead each note is rendered with plain
 * oscillators and a gain envelope. It sounds like early-90s FM hardware rather than a
 * sampled piano, which suits a game from 2000 well enough.
 *
 * Notes are scheduled lazily in windows rather than all at once, so an 86-second track does
 * not create thousands of live audio nodes up front.
 */

/** How far ahead to schedule, and how often to top up. */
const WINDOW_S = 1.5;
const TICK_MS = 500;

type Voice = 'keys' | 'bass' | 'perc' | 'lead';

/**
 * Maps a General MIDI program number to one of our synthesized voices.
 * GM program families are 8 apart: 0-7 piano, 8-15 chromatic percussion, 32-39 bass, etc.
 */
function voiceFor(program: number, channel: number): Voice {
  if (channel === 9) return 'perc'; // GM reserves channel 10 (0-indexed 9) for drums
  if (program >= 112) return 'perc'; // 112-119 percussive, 120-127 sound effects
  if (program >= 32 && program <= 39) return 'bass';
  if (program >= 0 && program <= 15) return 'keys';
  return 'lead';
}

const midiToHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class MidiPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private file: MidiFile | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private startedAt = 0;
  private nextIndex = 0;
  private timer: number | null = null;
  private looping = false;
  private live: AudioScheduledSourceNode[] = [];

  volume = 0.32;

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Fetches and parses a .mid. Returns false when the file is absent. */
  async load(url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      this.file = parseMidi(await res.arrayBuffer());
      return this.file.notes.length > 0;
    } catch {
      return false;
    }
  }

  async start(loop = true): Promise<void> {
    if (!this.file || this.playing) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(this.ctx);
    }
    // Autoplay policy: a context created before a user gesture starts suspended.
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.master!.gain.value = this.volume;
    this.looping = loop;
    this.nextIndex = 0;
    this.startedAt = this.ctx.currentTime + 0.08;
    this.pump();
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const node of this.live) {
      try {
        node.stop();
      } catch {
        // already finished
      }
    }
    this.live = [];
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Schedules every note that falls inside the next window. */
  private pump(): void {
    const ctx = this.ctx;
    const file = this.file;
    if (!ctx || !file) return;

    const horizon = ctx.currentTime + WINDOW_S;
    while (this.nextIndex < file.notes.length) {
      const n = file.notes[this.nextIndex];
      const at = this.startedAt + n.time;
      if (at > horizon) break;
      this.scheduleNote(ctx, n, at);
      this.nextIndex++;
    }

    if (this.nextIndex >= file.notes.length) {
      const endsAt = this.startedAt + file.duration;
      if (ctx.currentTime >= endsAt - WINDOW_S) {
        if (this.looping) {
          this.startedAt = endsAt + 0.25;
          this.nextIndex = 0;
        } else if (ctx.currentTime >= endsAt) {
          this.stop();
        }
      }
    }

    // Drop finished nodes so the array does not grow unbounded across loops.
    if (this.live.length > 256) this.live = this.live.slice(-128);
  }

  private scheduleNote(ctx: AudioContext, n: MidiNote, at: number): void {
    const voice = voiceFor(n.program, n.channel);
    const vel = (n.velocity / 127) * 0.9 + 0.1;
    if (voice === 'perc') {
      this.schedulePerc(ctx, n, at, vel);
      return;
    }

    const hz = midiToHz(n.note);
    const gain = ctx.createGain();
    gain.connect(this.master!);

    // Two detuned oscillators give the tone some body; a lowpass keeps it from getting shrill.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice === 'bass' ? 900 : 3800;
    filter.Q.value = 0.7;
    filter.connect(gain);

    const shapes: Record<Exclude<Voice, 'perc'>, OscillatorType> = {
      keys: 'triangle',
      bass: 'sine',
      lead: 'sawtooth',
    };

    const oscs: OscillatorNode[] = [];
    for (const detune of voice === 'keys' ? [0, 6] : [0]) {
      const osc = ctx.createOscillator();
      osc.type = shapes[voice];
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(filter);
      oscs.push(osc);
    }

    // Percussive attack, exponential decay — closer to a struck string than a held pad.
    const peak = vel * (voice === 'bass' ? 0.5 : 0.3);
    const attack = 0.008;
    const hold = Math.max(0.06, n.duration);
    const release = voice === 'bass' ? 0.12 : 0.22;

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.35), at + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + hold + release);

    for (const osc of oscs) {
      osc.start(at);
      osc.stop(at + hold + release + 0.02);
      this.live.push(osc);
    }
  }

  /** Drum-ish hit: a short noise burst plus a pitch-dropping body. */
  private schedulePerc(ctx: AudioContext, n: MidiNote, at: number, vel: number): void {
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    const base = midiToHz(n.note);
    body.frequency.setValueAtTime(base * 1.6, at);
    body.frequency.exponentialRampToValueAtTime(Math.max(30, base * 0.7), at + 0.16);
    bodyGain.gain.setValueAtTime(vel * 0.5, at);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    body.connect(bodyGain).connect(this.master!);
    body.start(at);
    body.stop(at + 0.3);
    this.live.push(body);

    if (!this.noiseBuffer) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vel * 0.16, at);
    nGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    noise.connect(hp).connect(nGain).connect(this.master!);
    noise.start(at);
    noise.stop(at + 0.09);
    this.live.push(noise);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
