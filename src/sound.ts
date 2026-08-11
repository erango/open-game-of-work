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
  | `promotion:${number}`;

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
  projectTaken: ['human.wav'],
  projectComplete: ['PROJECTCOMPLETED.WAV', 'projectcompleted.wav'],
  chance: ['computer.wav'],
  scruples: ['human.wav'],
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

/** Six promotion variants per rank, so repeated promotions do not repeat the same line. */
function promotionCandidates(rank: number): string[] {
  const r = Math.max(0, Math.min(5, rank));
  const files = [1, 2, 3, 4, 5, 6].map((v) => `${r}promo${v}.wav`);
  return [...files, '0promo1.wav'];
}

const BASE = 'assets/sounds/';

/**
 * Background music. The original shipped a .mid, which no browser plays natively, so it is
 * parsed and synthesized via midi.ts + midiPlayer.ts instead of bundling a softsynth.
 */
const MUSIC = 'assets/sounds/party.mid';

export class Sound {
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

  /** Filenames to try for a cue, expanding the rank-indexed promotion form. */
  private candidates(cue: Cue): string[] {
    if (cue.startsWith('promotion:')) {
      const files = promotionCandidates(Number(cue.slice('promotion:'.length)) || 0);
      // Shuffle the six variants so a rank does not always use its first line.
      for (let i = files.length - 2; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [files[i], files[j]] = [files[j], files[i]];
      }
      return files;
    }
    return CANDIDATES[cue] ?? [];
  }

  private async resolve(cue: Cue): Promise<void> {
    for (const file of this.candidates(cue)) {
      const url = BASE + file;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) continue;
        const audio = new Audio(url);
        audio.preload = 'auto';
        this.cache.set(cue, audio);
        this.available = true;
        void this.fire(audio);
        return;
      } catch {
        // network/permission failure — treat as missing and stop probing this cue
      }
    }
    this.cache.set(cue, null);
  }

  private async fire(audio: HTMLAudioElement): Promise<void> {
    try {
      const node = audio.cloneNode() as HTMLAudioElement;
      node.volume = 0.6;
      await node.play();
    } catch {
      // Browsers block playback until the first user gesture; the next cue will land.
    }
  }
}
