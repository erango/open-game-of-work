import { MidiPlayer } from './midiPlayer';
/**
 * Optional audio.
 *
 * This repo ships no audio files. The original's ~95 WAVs are not redistributable, so the
 * port looks for them at runtime in `public/assets/sounds/` — a gitignored directory you
 * point at your own extracted copy. Every cue degrades silently to nothing when the file
 * is absent, so the game is fully playable with no assets at all.
 *
 *   ln -s /path/to/your/GameOfWork/sounds public/assets/sounds
 *
 * Cue names are semantic. Each maps to a list of candidate filenames tried in order, so
 * the same cue can match different naming in different builds of the original.
 */

export type Cue =
  | 'gameStart'
  | 'seatHuman'
  | 'seatComputer'
  | 'soundOn'
  | 'stockHigh'
  | 'roll'
  | 'move'
  | 'projectTaken'
  | 'projectComplete'
  | 'chance'
  | 'scruples'
  | 'meetingGood'
  | 'meetingBad'
  | 'meetingTerrible'
  | 'officeParty'
  | 'businessTrip'
  | 'powerMonger'
  | 'demotion'
  | 'trade'
  | 'stockMarket'
  | 'resign'
  | 'win'
  | 'crash'
  /** Promotion is rank-indexed: the original ships <rank>promo<1-6>.wav. */
  | `promotion:${number}`
  /** Per-player name clip, e.g. 'name:brad'. */
  | `name:${string}`
  /** Seat-slot announcement, e.g. 'slot:2' -> player2<0-4>.wav. */
  | `slot:${number}`;

/**
 * Candidate filenames per cue, in preference order. Verified against a 2000-era `sounds/`
 * directory: the first that responds to a HEAD request wins and is cached. Cues with no
 * matching file resolve once to null and then stay silent.
 *
 * Not every cue has a counterpart — the original had no dedicated Chance or Scruples
 * sting, so those borrow the computer/human voice stabs, and demotion borrows the
 * really-bad-meeting sting since no demote clip shipped.
 */
const CANDIDATES: Record<string, string[]> = {
  gameStart: ['intro.wav'],
  roll: ['roll.wav'],
  move: ['move.wav'],
  soundOn: ['soundon.wav'],
  // human.wav and computer.wav are click feedback for the New Game seat selector, not turn
  // announcements. TNEWGAMEFORM holds six clickable seat images (Image7..Image12, each with
  // its own OnClick) whose three faces are the NEWGAMEHUMAN / NEWGAMECOMPUTER / NEWGAMEOFF
  // bitmaps, so a seat is cycled by clicking and the clip confirms the new type. They are
  // also short (0.57s and 0.88s) next to the 1.1-1.9s player<slot><variant>.wav lines, which
  // is what actually announces whose turn it is.
  seatHuman: ['human.wav'],
  seatComputer: ['computer.wav'],
  stockHigh: ['NEWSTOCKHIGHSCORE.WAV', 'newstockhighscore.wav'],
  projectComplete: ['PROJECTCOMPLETED.WAV', 'projectcompleted.wav'],
  // The original shipped no Chance or Scruples sting. Leaving these empty keeps them silent
  // rather than borrowing the turn-announcement clips, which is what they used to do.
  projectTaken: [],
  chance: [],
  scruples: [],
  meetingGood: ['meetinggood.wav'],
  meetingBad: ['meetingbad.wav'],
  meetingTerrible: ['meetingreallybad.wav', 'meetingbad.wav'],
  officeParty: ['iceglass.wav'],
  businessTrip: ['businesstrip.wav'],
  powerMonger: ['Power0.wav', 'power1.wav'],
  demotion: ['meetingreallybad.wav'],
  trade: ['move.wav'],
  stockMarket: ['STOCKMARKET.WAV', 'stockmarket.wav'],
  resign: ['0resign.wav'],
  win: ['NEWPRESHIGHSCORE.WAV', 'newpreshighscore.wav'],
  crash: ['bodyfalling.wav'],
};

/** Five spoken variants per seat slot: player<slot>0.wav .. player<slot>4.wav. */
function slotCandidates(slot: number): string[] {
  const n = Math.max(0, Math.min(5, slot));
  return [0, 1, 2, 3, 4].map((v) => `player${n}${v}.wav`);
}

/** Six promotion variants per rank, so repeated promotions do not repeat the same line. */
function promotionCandidates(rank: number): string[] {
  const r = Math.max(0, Math.min(5, rank));
  const files = [1, 2, 3, 4, 5, 6].map((v) => `${r}promo${v}.wav`);
  return [...files, '0promo1.wav'];
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const BASE = 'assets/sounds/';

/**
 * Background music. The original shipped a .mid, which no browser plays natively, so it is
 * parsed and synthesized via midi.ts + midiPlayer.ts instead of bundling a softsynth.
 */
const MUSIC = 'assets/sounds/party.mid';

export class Sound {
  /**
   * Spoken cues are serialized through this chain.
   *
   * The startup clip, the per-player name clips and the human/computer seat clips are all
   * speech, so overlapping them makes both unintelligible. Fixed delays are not enough:
   * browsers block audio until the first user gesture, so a clip can start much later than
   * the code that requested it. Chaining on actual playback end is the only reliable order.
   * Short effects (roll, move) still fire immediately and may overlap.
   */
  private voiceChain: Promise<void> = Promise.resolve();
  private music = new MidiPlayer();
  private musicLoaded: boolean | null = null;
  private cache = new Map<Cue, HTMLAudioElement | null>();
  private enabled: boolean;
  /** True once any cue has successfully resolved a file. */
  available = false;

  constructor() {
    this.enabled = localStorage.getItem('ogow:sound') !== 'off';
  }

  get on(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    localStorage.setItem('ogow:sound', this.enabled ? 'on' : 'off');
    if (!this.enabled) this.music.stop();
    else this.play('soundOn');
    return this.enabled;
  }

  /** True once the .mid has been found and parsed. */
  get musicAvailable(): boolean {
    return this.musicLoaded === true;
  }

  get musicPlaying(): boolean {
    return this.music.playing;
  }

  /** Starts the background track, loading it on first use. No-op when absent or muted. */
  async startMusic(loop = true): Promise<void> {
    if (!this.enabled) return;
    if (this.musicLoaded === null) this.musicLoaded = await this.music.load(MUSIC);
    if (!this.musicLoaded) return;
    await this.music.start(loop);
  }

  stopMusic(): void {
    this.music.stop();
  }

  /** Ducks the music while a one-shot cue plays over it. */
  private duck(): void {
    if (!this.music.playing) return;
    this.music.setVolume(0.14);
    window.setTimeout(() => this.music.setVolume(0.32), 900);
  }

/**
   * Queues a spoken cue behind any speech already playing. Resolves once it has finished,
   * so callers can sequence further speech after it.
   */
  speak(cue: Cue): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.voiceChain = this.voiceChain
      .then(async () => {
        await this.speakNow(cue);
      })
      .catch(() => {});
    return this.voiceChain;
  }

  private async speakNow(cue: Cue): Promise<boolean> {
    if (!this.enabled) return false;
    let audio = this.cache.get(cue);
    if (audio === undefined) {
      await this.resolve(cue, /* autoplay */ false);
      audio = this.cache.get(cue);
    }
    if (!audio) return false;
    this.duck();
    await this.fire(audio);
    return true;
  }

  /**
   * Announces whose turn it is, before they roll.
   *
   * Uses one of the five player<slot><variant>.wav lines for that seat, which is what the
   * original shipped 30 of (6 seats x 5 variants) and why they run 1.1-1.9s. Falls back to
   * the short per-name clip when a slot line is missing. Deliberately does NOT play the
   * human/computer clips: those belong to the New Game seat selector, and firing them every
   * turn means hearing "computer" on every AI move.
   */
  async announceTurn(name: string, slot: number): Promise<void> {
    if (!this.enabled) return;
    await this.speak(`slot:${slot}`);
    if (this.spokeLast) return;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (slug) await this.speak(`name:${slug}`);
  }

  /** Click feedback when a New Game seat is cycled between Human and Computer. */
  seatChanged(kind: 'human' | 'computer' | 'off'): void {
    if (kind === 'off') return; // the original shipped no clip for the Off state
    void this.speak(kind === 'human' ? 'seatHuman' : 'seatComputer');
  }

  /** Whether the most recent speak() actually found a file. */
  private spokeLast = false;

  play(cue: Cue): void {
    if (!this.enabled) return;
    this.duck();
    const cached = this.cache.get(cue);
    if (cached === null) return; // known missing
    if (cached) {
      void this.fire(cached);
      return;
    }
    void this.resolve(cue);
  }

  /** Filenames to try for a cue, expanding the parameterised forms. */
  private candidates(cue: Cue): string[] {
    if (cue.startsWith('name:')) {
      return [`${cue.slice('name:'.length)}.wav`];
    }
    if (cue.startsWith('slot:')) {
      return shuffle(slotCandidates(Number(cue.slice('slot:'.length)) || 0));
    }
    if (cue.startsWith('promotion:')) {
      const files = promotionCandidates(Number(cue.slice('promotion:'.length)) || 0);
      // Shuffle the six variants, keeping the final fallback last.
      return [...shuffle(files.slice(0, -1)), files[files.length - 1]];
    }
    return CANDIDATES[cue] ?? [];
  }

  private async resolve(cue: Cue, autoplay = true): Promise<void> {
    for (const file of this.candidates(cue)) {
      const url = BASE + file;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) continue;
        const audio = new Audio(url);
        audio.preload = 'auto';
        this.cache.set(cue, audio);
        this.available = true;
        if (autoplay) void this.fire(audio);
        return;
      } catch {
        // network/permission failure — treat as missing and stop probing this cue
      }
    }
    this.cache.set(cue, null);
  }

  /** Plays a clip and resolves when it ends, so speech can be sequenced. */
  private fire(audio: HTMLAudioElement): Promise<void> {
    this.spokeLast = false;
    return new Promise<void>((resolve) => {
      const node = audio.cloneNode() as HTMLAudioElement;
      node.volume = 0.6;
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve();
      };
      const arm = (ms: number) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(finish, ms);
      };
      node.addEventListener('ended', finish, { once: true });
      node.addEventListener('error', finish, { once: true });
      /*
       * The guard is armed BEFORE play(), which is the whole point of it. play() returns a
       * promise that can stay pending indefinitely — a blocked or stuck decode never settles
       * it either way — and arming the timeout inside .then() meant that case hung forever.
       * Since every caller of speech awaits this promise, and the turn loop awaits the
       * announcement, a hung clip froze the entire game with the die disabled.
       */
      arm(6000);
      const refine = () => {
        if (Number.isFinite(node.duration) && node.duration > 0) arm(node.duration * 1000 + 400);
      };
      node.addEventListener('loadedmetadata', refine, { once: true });
      node
        .play()
        .then(() => {
          this.spokeLast = true;
          refine();
        })
        .catch(() => {
          // Blocked until the first user gesture; give up on this one and keep the chain moving.
          finish();
        });
    });
  }
}
