/**
 * Minimal Standard MIDI File parser.
 *
 * Exists so the port can play a `.mid` without a WASM synth or a SoundFont — browsers have
 * no native MIDI playback, and the usual fixes are large binary dependencies. This reads
 * the file into a flat note list with absolute times in seconds; `midiPlayer.ts` renders it
 * with Web Audio oscillators.
 *
 * Supports what real files in the wild actually use: formats 0 and 1, running status,
 * tempo maps, meta and sysex skipping. Deliberately ignores pitch bend, controllers, and
 * SMPTE time division.
 *
 * Pure and DOM-free, so it is testable in Node.
 */

export interface MidiNote {
  /** Seconds from the start of the sequence. */
  time: number;
  /** Seconds. */
  duration: number;
  /** MIDI note number, 0-127. */
  note: number;
  /** 0-127. */
  velocity: number;
  /** 0-15. */
  channel: number;
  /** GM program selected on this channel when the note started, 0-127. */
  program: number;
}

export interface MidiFile {
  format: number;
  ticksPerQuarter: number;
  /** Total length in seconds, including the tail of the last note. */
  duration: number;
  notes: MidiNote[];
  /** Free-text meta strings found in the file (track names, copyright). */
  text: string[];
}

class Reader {
  constructor(
    readonly d: Uint8Array,
    public i = 0,
  ) {}

  u8(): number {
    return this.d[this.i++];
  }

  u16(): number {
    const v = (this.d[this.i] << 8) | this.d[this.i + 1];
    this.i += 2;
    return v;
  }

  u32(): number {
    const v =
      this.d[this.i] * 0x1000000 +
      (this.d[this.i + 1] << 16) +
      (this.d[this.i + 2] << 8) +
      this.d[this.i + 3];
    this.i += 4;
    return v;
  }

  /** MIDI variable-length quantity. */
  vlq(): number {
    let v = 0;
    for (let n = 0; n < 4; n++) {
      const b = this.d[this.i++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  }

  tag(): string {
    const s = String.fromCharCode(this.d[this.i], this.d[this.i + 1], this.d[this.i + 2], this.d[this.i + 3]);
    this.i += 4;
    return s;
  }
}

interface RawEvent {
  tick: number;
  kind: 'on' | 'off' | 'program' | 'tempo';
  channel: number;
  a: number;
  b: number;
}

export function parseMidi(bytes: ArrayBuffer | Uint8Array): MidiFile {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const r = new Reader(d);

  if (r.tag() !== 'MThd') throw new Error('not a MIDI file (missing MThd)');
  const headerLen = r.u32();
  const format = r.u16();
  const trackCount = r.u16();
  const division = r.u16();
  r.i = 8 + headerLen;

  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  const ticksPerQuarter = division || 480;

  const events: RawEvent[] = [];
  const text: string[] = [];

  for (let t = 0; t < trackCount && r.i < d.length; t++) {
    if (r.tag() !== 'MTrk') break;
    const len = r.u32();
    const end = r.i + len;
    let tick = 0;
    let status = 0;

    while (r.i < end) {
      tick += r.vlq();
      let b = d[r.i];

      if (b === 0xff) {
        r.i++;
        const type = r.u8();
        const len2 = r.vlq();
        const data = d.subarray(r.i, r.i + len2);
        r.i += len2;
        if (type === 0x51 && len2 === 3) {
          const usPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
          events.push({ tick, kind: 'tempo', channel: 0, a: usPerQuarter, b: 0 });
        } else if (type >= 0x01 && type <= 0x07) {
          const s = new TextDecoder('latin1').decode(data).trim();
          if (s) text.push(s);
        }
        continue;
      }

      if (b === 0xf0 || b === 0xf7) {
        r.i++;
        r.i += r.vlq();
        continue;
      }

      if (b & 0x80) {
        status = b;
        r.i++;
      } else {
        b = status; // running status
      }
      const hi = status & 0xf0;
      const channel = status & 0x0f;

      switch (hi) {
        case 0x90: {
          const note = r.u8();
          const vel = r.u8();
          // Note-on with velocity 0 is a note-off, per the spec.
          events.push({ tick, kind: vel > 0 ? 'on' : 'off', channel, a: note, b: vel });
          break;
        }
        case 0x80: {
          const note = r.u8();
          r.u8();
          events.push({ tick, kind: 'off', channel, a: note, b: 0 });
          break;
        }
        case 0xc0:
          events.push({ tick, kind: 'program', channel, a: r.u8(), b: 0 });
          break;
        case 0xd0:
          r.i += 1;
          break;
        case 0xa0:
        case 0xb0:
        case 0xe0:
          r.i += 2;
          break;
        default:
          // Unknown status: bail out of this track rather than desynchronising.
          r.i = end;
      }
    }
    r.i = end;
  }

  events.sort((a, b) => a.tick - b.tick);

  // Walk the event list building a tick -> seconds map from the tempo changes.
  let usPerQuarter = 500000; // 120 BPM default
  let lastTick = 0;
  let seconds = 0;
  const secondsAt = (tick: number): number =>
    seconds + ((tick - lastTick) / ticksPerQuarter) * (usPerQuarter / 1e6);

  const programs = new Array<number>(16).fill(0);
  const open = new Map<string, MidiNote>();
  const notes: MidiNote[] = [];

  for (const e of events) {
    const at = secondsAt(e.tick);

    if (e.kind === 'tempo') {
      seconds = at;
      lastTick = e.tick;
      usPerQuarter = e.a || usPerQuarter;
      continue;
    }
    if (e.kind === 'program') {
      programs[e.channel] = e.a;
      continue;
    }

    const key = `${e.channel}:${e.a}`;
    if (e.kind === 'on') {
      // Re-triggering an already sounding note ends the previous one.
      const prev = open.get(key);
      if (prev) prev.duration = Math.max(0.01, at - prev.time);
      const n: MidiNote = {
        time: at,
        duration: 0,
        note: e.a,
        velocity: e.b,
        channel: e.channel,
        program: programs[e.channel],
      };
      open.set(key, n);
      notes.push(n);
    } else {
      const n = open.get(key);
      if (n) {
        n.duration = Math.max(0.01, at - n.time);
        open.delete(key);
      }
    }
  }

  // Any notes still held at end of file get a short tail.
  for (const n of open.values()) if (n.duration === 0) n.duration = 0.25;

  notes.sort((a, b) => a.time - b.time);
  const duration = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0);

  return { format, ticksPerQuarter, duration, notes, text };
}
