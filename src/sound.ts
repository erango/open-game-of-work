import { MidiPlayer } from './midiPlayer';
import { SCENE_CUES, sceneName } from './sceneCues';
import { Sfx, type Voice } from './sfx';
import { themeName, type ThemeName } from './theme';
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

/**
 * Recorded music, three tracks per theme. These are ordinary audio files rather than MIDI, so
 * they cannot go through the parser — this is a second, simpler player alongside it.
 *
 * Files are `.m4a` (AAC), re-encoded by scripts/audio-encode.sh.
 *
 * - `theme` once, from the moment the splash is dismissed through the New Game window
 * - `play`  looping under the game
 * - `party` looping for the Office Party scene, then back to `play`
 *
 * Optional like everything else here: absent files leave the game silent, except for the party,
 * which falls back to the original's own .mid where an extraction is installed.
 */
export type MusicTrack = 'theme' | 'play' | 'party';

const MUSIC_DIR: Record<ThemeName, string> = {
  original: 'original',
  openPlan: 'open-plan',
  cyberpunk: 'cyberpunk',
};

const MUSIC_BASE = 'assets/music/';
const MUSIC_VOLUME = 0.3;
/** What the music drops to while a spoken clip or an effect plays over it. */
const MUSIC_DUCKED = 0.1;
/**
 * Recorded scene effects, per theme: `assets/sfx/<theme>/<cue>.mp3`.
 *
 * Only the once-or-twice-a-game moments live here — a room of people, a siren, applause — which
 * are texture a synth cannot give. Everything frequent stays synthesised in sfx.ts. Optional as
 * ever: without them the synth recipe plays instead.
 */
const SCENE_BASE = 'assets/sfx/';
const SCENE_DIR: Record<ThemeName, string> = {
  original: 'original',
  openPlan: 'open-plan',
  cyberpunk: 'cyberpunk',
};

/**
 * Whether a HEAD response is really an audio file.
 *
 * A 200 is not proof: a dev server (and many SPA hosts) answer unknown paths with index.html, so
 * probing for a file that does not exist returned OK and the game then tried to play a page of
 * HTML. Checking the content type is what actually distinguishes the two.
 */
function isAudio(res: Response): boolean {
  const type = res.headers.get('content-type') ?? '';
  return res.ok && (type.startsWith('audio/') || type === 'application/octet-stream');
}

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
  /**
   * Recorded tracks, keyed `<theme>/<track>`, resolving to null when absent.
   *
   * The *promise* is cached, not the element. Boot and the New Game window both ask for the
   * theme track within a frame of each other; caching only the finished element let both probes
   * run and build two elements for the same file, which then played over each other.
   */
  private trackCache = new Map<string, Promise<HTMLAudioElement | null>>();
  private track: HTMLAudioElement | null = null;
  /** What should be playing, so a theme change can restart the same track from the new set. */
  private trackName: MusicTrack | null = null;
  private duckTimer = 0;
  /** rAF handle for the ducking ramp, and the level it is currently at. */
  private musicRamp = 0;
  private musicLevel = MUSIC_VOLUME;
  private sfx = new Sfx();
  /** Probed scene recordings, keyed `<theme>/<cue>`; the promise is cached, as with music. */
  private sceneCache = new Map<string, Promise<HTMLAudioElement | null>>();
  /** Settled results of the above, so play() can decide synchronously. */
  private sceneResolved = new Map<string, boolean>();
  private cache = new Map<Cue, HTMLAudioElement | null>();
  private enabled: boolean;
  /**
   * Music has its own switch. The sound toggle covers speech and effects, which carry
   * information — who is up, what a square did — while music carries none, so wanting one
   * without the other is an ordinary thing to want.
   */
  private musicEnabled: boolean;
  /** True once any cue has successfully resolved a file. */
  available = false;

  constructor() {
    this.enabled = localStorage.getItem('ogow:sound') !== 'off';
    this.musicEnabled = localStorage.getItem('ogow:music') !== 'off';
  }

  get on(): boolean {
    return this.enabled;
  }

  get musicOn(): boolean {
    return this.musicEnabled;
  }

  /** Stops or resumes background music without touching speech and effects. */
  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    localStorage.setItem('ogow:music', this.musicEnabled ? 'on' : 'off');
    if (!this.musicEnabled) this.stopMusic();
    else if (this.trackName) void this.playTrack(this.trackName);
    return this.musicEnabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    localStorage.setItem('ogow:sound', this.enabled ? 'on' : 'off');
    if (!this.enabled) this.stopMusic();
    else {
      this.play('soundOn');
      // Muting stops the track; unmuting puts back whatever should have been playing.
      if (this.musicEnabled && this.trackName) void this.playTrack(this.trackName);
    }
    return this.enabled;
  }

  /** True once the .mid has been found and parsed. */
  get musicAvailable(): boolean {
    return this.musicLoaded === true;
  }

  get musicPlaying(): boolean {
    return this.music.playing || (this.track !== null && !this.track.paused);
  }

  /**
   * Starts one of the recorded tracks for the current theme.
   *
   * Autoplay policy means this can only succeed after a user gesture, which is why the theme
   * track starts when the splash is dismissed rather than at load: a rejected play() would
   * otherwise be the whole music system, silently.
   */
  async playTrack(name: MusicTrack, loop = name !== 'theme'): Promise<void> {
    // Recorded even when muted, so unmuting resumes whatever should have been playing.
    this.trackName = name;
    if (!this.enabled || !this.musicEnabled) return;
    const audio = await this.resolveTrack(themeName(), name);
    /*
     * Identity, not playing state: boot and the New Game window both ask for the theme track
     * within a frame, and a `paused` check still reads true while the first play() is pending —
     * so the second call stopped and restarted the clip audibly. `this.track` is assigned
     * before play() is awaited, which makes it the record of intent.
     */
    if (audio && audio === this.track) return;
    if (!audio) {
      // The original only ever had party music, so that is the one with something to fall
      // back to. Anything else simply stays quiet.
      if (name === 'party') await this.startMusic(loop);
      return;
    }
    this.stopMusic();
    this.track = audio;
    audio.loop = loop;
    // The level, not the nominal one: starting a track mid-duck must not punch through the clip
    // that is ducking it.
    audio.volume = Math.min(1, this.musicLevel);
    audio.currentTime = 0;
    // Blocked until the first gesture, or the file went away between the probe and now.
    await audio.play().catch(() => {});
  }

  /** Restarts the current track from the new theme's set. Called when the theme changes. */
  async retheme(): Promise<void> {
    if (this.trackName) await this.playTrack(this.trackName);
  }

  /** Probes `<theme>/<track>` once, returning the same element to every caller. */
  private resolveTrack(theme: ThemeName, name: MusicTrack): Promise<HTMLAudioElement | null> {
    const key = `${MUSIC_DIR[theme]}/${name}`;
    const cached = this.trackCache.get(key);
    if (cached) return cached;
    const probe = (async () => {
      // AAC in MP4: see scripts/audio-encode.sh for why not Opus.
      const url = `${MUSIC_BASE}${key}.m4a`;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!isAudio(res)) return null;
        const audio = new Audio(url);
        audio.preload = 'auto';
        return audio;
      } catch {
        return null;
      }
    })();
    this.trackCache.set(key, probe);
    return probe;
  }

  /** Starts the background track, loading it on first use. No-op when absent or muted. */
  async startMusic(loop = true): Promise<void> {
    if (!this.enabled || !this.musicEnabled) return;
    if (this.musicLoaded === null) this.musicLoaded = await this.music.load(MUSIC);
    if (!this.musicLoaded) return;
    await this.music.start(loop);
  }

  stopMusic(): void {
    this.music.stop();
    if (this.track) {
      this.track.pause();
      this.track = null;
    }
  }

  /**
   * Ducks the music while a one-shot cue plays over it, and brings it back on a curve.
   *
   * Both edges were instant volume steps, and the return was the audible one: the bed
   * reappearing at full level in a single sample reads as a fault rather than as a mix. It
   * ramps now — fast down (90ms, so the cue is never masked) and slower up (420ms), on an
   * ease-out.
   *
   * The interpolation is exponential rather than linear because loudness is perceived that way:
   * a linear ramp from .1 to .3 does most of its *audible* work in the first third and then
   * appears to stall.
   */
  private duck(): void {
    const midi = this.music.playing;
    const rec = this.track !== null && !this.track.paused;
    if (!midi && !rec) return;
    this.rampMusic(MUSIC_DUCKED, 90);
    window.clearTimeout(this.duckTimer);
    this.duckTimer = window.setTimeout(() => this.rampMusic(MUSIC_VOLUME, 420), 900);
  }

  /**
   * Moves both players' music level to `target` over `ms`.
   *
   * `HTMLAudioElement.volume` has no scheduling API — unlike a Web Audio gain node — so it has
   * to be animated. One rAF loop drives both, so the recorded track and the parsed .mid never
   * drift apart mid-ramp.
   */
  private rampMusic(target: number, ms: number): void {
    if (this.musicRamp) cancelAnimationFrame(this.musicRamp);
    const from = Math.max(0.0001, this.musicLevel);
    const to = Math.max(0.0001, target);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Ease-out: most of the movement early, settling gently rather than arriving hard.
      const eased = 1 - (1 - t) * (1 - t);
      const level = from * Math.pow(to / from, eased);
      this.musicLevel = level;
      if (this.music.playing) this.music.setVolume(level);
      if (this.track) this.track.volume = Math.min(1, level);
      if (t < 1) this.musicRamp = requestAnimationFrame(step);
      else {
        this.musicRamp = 0;
        this.musicLevel = target;
      }
    };
    this.musicRamp = requestAnimationFrame(step);
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
    /*
     * Under the Original theme the extracted recordings are the point, so they come first.
     * Under our own themes the synthesised voice in sfx.ts *is* the sound design — a theme's
     * effects are then a handful of numbers rather than a second directory of files — so it
     * wins for every cue it covers, and only speech falls through to a recording.
     */
    const voice = this.voice();
    if (themeName() !== 'original') {
      const scene = this.sceneReady(cue);
      if (scene === 'yes') {
        void this.scene(cue);
        return;
      }
      // 'unknown' starts the probe and lets the synth cover this one instance, so a cue is never
      // silent while a file is being looked for; every later call uses the recording.
      if (scene === 'unknown') void this.scene(cue);
      if (this.sfx.covers(cue, voice)) {
        this.sfx.play(cue, voice);
        return;
      }
    }
    const cached = this.cache.get(cue);
    if (cached === null) {
      // Probed and absent: synthesise it rather than saying nothing.
      this.sfx.play(cue, voice);
      return;
    }
    if (cached) {
      void this.fire(cached);
      return;
    }
    void this.resolve(cue);
  }

  private voice(): Voice {
    return themeName() === 'cyberpunk' ? 'cyber' : 'office';
  }

  /**
   * Probes every scene recording for the current theme up front.
   *
   * Without this the first occurrence of each cue plays the synth while its file is still being
   * looked for, which is a per-session gap on the very moments that most want the recording.
   * Twelve HEADs on a theme change is a fair price; results are cached per theme.
   */
  warmScenes(): void {
    if (!this.enabled) return;
    // The Original theme plays the recovered recordings and ships no scene set, so probing for
    // one is twelve requests that can only fail.
    if (themeName() === 'original') return;
    for (const name of SCENE_CUES) void this.scene(name as Cue);
  }

  /** Whether a recording for this cue is known present, known absent, or not yet probed. */
  private sceneReady(cue: Cue): 'yes' | 'no' | 'unknown' {
    const name = sceneName(cue);
    if (name === null) return 'no';
    const known = this.sceneResolved.get(`${SCENE_DIR[themeName()]}/${name}`);
    return known === undefined ? 'unknown' : known ? 'yes' : 'no';
  }

  /**
   * Plays the recorded scene effect for this cue if the theme has one.
   *
   * Returns whether it played. The first call for a cue only starts the probe, so the synth
   * covers that one instance and every later call uses the recording.
   */
  private async scene(cue: Cue): Promise<boolean> {
    const name = sceneName(cue);
    if (name === null) return false;
    const key = `${SCENE_DIR[themeName()]}/${name}`;
    const known = this.sceneCache.get(key);
    if (known === undefined) {
      this.sceneCache.set(
        key,
        (async () => {
          try {
            const res = await fetch(`${SCENE_BASE}${key}.mp3`, { method: 'HEAD' });
            if (!isAudio(res)) return null;
            const audio = new Audio(`${SCENE_BASE}${key}.mp3`);
            audio.preload = 'auto';
            return audio;
          } catch {
            return null;
          }
        })().then((audio) => {
          this.sceneResolved.set(key, audio !== null);
          return audio;
        }),
      );
      return false;
    }
    const audio = await known;
    if (!audio) return false;
    void this.fire(audio);
    return true;
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
        if (!isAudio(res)) continue;
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
    // Nothing on disk for this cue, so the synth covers it if it can. Only reached on the first
    // probe; later calls take the `cached === null` path in play().
    if (autoplay) this.sfx.play(cue, this.voice());
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
