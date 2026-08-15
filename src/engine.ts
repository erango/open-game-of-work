import { PROJECT_PROFILES, PROJECT_SQUARES, SQUARES } from './board';
import { SET_BONUS_BOSS_RATING, type ChanceCard, type ScruplesCard } from './cards';
import { deck } from './decks';
import { DEFAULT_NAMES, projectName } from './names';
import { Rng } from './rng';
import * as R from './rules';
import {
  PERSONALITIES,
  RANKS,
  type GameLength,
  type GameState,
  type Modal,
  type Personality,
  type PersonalityChoice,
  type PartyEntry,
  type Player,
  type Profile,
  type Project,
  type SeatKind,
} from './types';

export interface SeatConfig {
  kind: SeatKind;
  name: string;
  /** 'random' is resolved from the seeded RNG when the game is created. */
  personality: PersonalityChoice;
}

export interface NewGameConfig {
  length: GameLength;
  seats: SeatConfig[];
  seed?: number;
}

export class Game {
  state: GameState;
  rng: Rng;

  constructor(config: NewGameConfig) {
    const seed = config.seed ?? (Math.random() * 0xffffffff) >>> 0;
    this.rng = new Rng(seed);
    this.state = this.createState(config, seed);
  }

  // ---------------------------------------------------------------- setup

  private createState(config: NewGameConfig, seed: number): GameState {
    const start = R.LENGTH_START[config.length];

    const players: Player[] = [];
    config.seats.forEach((seat, i) => {
      if (seat.kind === 'off') return;
      const id = players.length;
      players.push({
        id,
        name: seat.name || DEFAULT_NAMES[i] || `Player ${i + 1}`,
        kind: seat.kind,
        personality: seat.kind === 'computer' ? this.resolvePersonality(seat.personality) : null,
        color: R.PLAYER_COLORS[i % R.PLAYER_COLORS.length],
        square: 0,
        bossRating: start.bossRating,
        rank: start.rank,
        friendliness: {},
        president: false,
        karma: [],
      });
    });

    // Friendliness starts neutral toward everyone else.
    for (const p of players) {
      for (const q of players) {
        if (p.id !== q.id) p.friendliness[q.id] = 0;
      }
    }

    const projects: Project[] = PROJECT_SQUARES.map((sq, i) => {
      const profile = PROJECT_PROFILES[i] as Profile;
      return {
        id: i,
        square: sq.index,
        profile,
        name: projectName(profile, this.rng),
        progress: 0,
        work: R.PROJECT_WORK[profile],
        owner: null,
        shoddy: false,
      };
    });

    return {
      phase: 'idle',
      length: config.length,
      players,
      projects,
      current: 0,
      turn: 1,
      die: null,
      stock: R.STOCK_START,
      stockHistory: [{ turn: 0, price: R.STOCK_START }],
      stockPeak: R.STOCK_START,
      lastStockDelta: 0,
      log: [],
      crashed: false,
      winner: null,
      rolled: false,
      modal: null,
      rngSeed: seed,
      stockCostCarry: 0,
      pendingSteps: 0,
      pendingNotices: [],
      soundCues: [],
    };
  }

  /** Resolves a setup seat's personality, drawing from the seeded RNG for 'random'. */
  private resolvePersonality(choice: PersonalityChoice): Personality {
    return choice === 'random' ? this.rng.pick(PERSONALITIES) : choice;
  }

  // ---------------------------------------------------------------- helpers

  get s(): GameState {
    return this.state;
  }

  get active(): Player {
    return this.state.players[this.state.current];
  }

  player(id: number): Player {
    return this.state.players[id];
  }

  projectsOf(id: number): Project[] {
    return this.state.projects.filter((p) => p.owner === id);
  }

  /** Stress is the sum of the profiles of everything a player owns. */
  stress(id: number): number {
    return this.projectsOf(id).reduce((n, p) => n + p.profile, 0);
  }

  /** Profiles for which this player owns every project on the board. */
  completeSets(id: number): Profile[] {
    const sets: Profile[] = [];
    for (const profile of [1, 2, 3, 4, 5] as Profile[]) {
      const all = this.state.projects.filter((p) => p.profile === profile);
      if (all.length > 0 && all.every((p) => p.owner === id)) sets.push(profile);
    }
    return sets;
  }

  /** Widened so TypeScript does not narrow `phase` away across mutating helpers. */
  private isOver(): boolean {
    return (this.state.phase as string) === 'gameOver';
  }

  /** Raises an audio cue. Purely advisory — headless play never reads these. */
  private cue(name: string): void {
    this.state.soundCues.push(name);
    if (this.state.soundCues.length > 16) this.state.soundCues.shift();
  }

  /** Drains and returns pending audio cues. */
  drainCues(): string[] {
    const out = this.state.soundCues;
    this.state.soundCues = [];
    return out;
  }

  private log(text: string, playerId: number | null = null, art?: string): void {
    this.state.log.push({ turn: this.state.turn, playerId, text, art });
    if (this.state.log.length > 400) this.state.log.shift();
  }

  private castCache: { key: string; cast: { rival: string; proj: string; rivalProj: string } } | null = null;

  /**
   * Who and what the placeholders resolve to, fixed for one player's turn.
   *
   * Every string on a card goes through fill() separately — the situation, each answer, the
   * outcome, the delayed consequence — and this used to draw a fresh rival each time, so a card
   * could ask about Jen and report back about George. The choice is made once per turn and
   * reused, which is the only reading that makes sense of a card naming someone twice.
   */
  private cast(playerId: number): { rival: string; proj: string; rivalProj: string } {
    const key = `${this.state.turn}:${playerId}`;
    if (this.castCache?.key === key) return this.castCache.cast;
    const rivals = this.state.players.filter((q) => q.id !== playerId);
    const own = this.projectsOf(playerId);
    const rivalOwned = this.state.projects.filter((q) => q.owner !== null && q.owner !== playerId);
    const cast = {
      rival: rivals.length ? this.rng.pick(rivals).name : 'a colleague',
      proj: own.length ? this.rng.pick(own).name : 'an unnamed initiative',
      rivalProj: rivalOwned.length ? this.rng.pick(rivalOwned).name : 'one of their projects',
    };
    this.castCache = { key, cast };
    return cast;
  }

  private fill(text: string, playerId: number): string {
    const p = this.player(playerId);
    const { rival, proj, rivalProj } = this.cast(playerId);
    return text
      .replace(/\{you\}/g, p.name)
      .replace(/\{rival\}/g, rival)
      .replace(/\{rivalproject\}/g, rivalProj)
      .replace(/\{project\}/g, proj);
  }

  private adjustStock(delta: number, why: string): void {
    if (delta === 0) return;
    const before = this.state.stock;
    this.state.stock = Math.max(R.STOCK_MIN, Math.min(R.STOCK_MAX, before + delta));
    // Report the change that actually landed, after clamping at the floor and ceiling.
    this.state.lastStockDelta = this.state.stock - before;
    if (this.state.stock > this.state.stockPeak) this.state.stockPeak = this.state.stock;
    this.state.stockHistory.push({ turn: this.state.turn, price: this.state.stock });
    if (this.state.stock <= R.STOCK_MIN && !this.state.crashed) {
      this.state.crashed = true;
      this.state.phase = 'gameOver';
      this.cue('crash');
      this.log(
        `The stock hit zero. The company is disbanded — everybody loses. (${why})`,
        null,
        'COMPANYDISBANDED1',
      );
      this.state.modal = {
        kind: 'gameOver',
        text: 'The share price reached zero. The company has been disbanded and every player loses.',
      };
    }
  }

  private adjustBossRating(id: number, delta: number): void {
    if (delta === 0) return;
    const p = this.player(id);
    p.bossRating = Math.max(-50, p.bossRating + delta);
  }

  private adjustFriendliness(towardId: number, delta: number): void {
    if (delta === 0) return;
    for (const p of this.state.players) {
      if (p.kind !== 'computer' || p.id === towardId) continue;
      p.friendliness[towardId] = (p.friendliness[towardId] ?? 0) + delta;
    }
  }

  // ---------------------------------------------------------------- turn flow

  canRoll(): boolean {
    return this.state.phase === 'idle' && !this.state.rolled && !this.state.modal;
  }

  /**
   * Rolls the die and enters the movement phase. Does NOT move or resolve — call stepMove()
   * until pendingSteps reaches zero, then resolveLanding(). This mirrors the original, where
   * the token walks the board a square at a time and the result appears only once it stops.
   * Headless callers can use finishMoveInstantly() instead.
   */
  roll(): number {
    if (!this.canRoll()) return 0;
    const die = this.rng.die();
    this.state.die = die;
    this.state.rolled = true;
    this.state.pendingSteps = die;
    this.state.phase = 'moving';
    this.log(`${this.active.name} rolls ${die}.`, this.active.id);
    this.cue('roll');
    return die;
  }

  /** True while the token still has squares to walk. */
  get moving(): boolean {
    return (this.state.phase as string) === 'moving' && this.state.pendingSteps > 0;
  }

  /**
   * Advances the token exactly one square.
   *
   * Stepping one at a time makes the Home award fall out naturally: crossing or landing on
   * Home simply means arriving at square 0, so no modular arithmetic is needed to detect a
   * pass. Any promotion is queued rather than shown, so it surfaces after movement ends.
   */
  stepMove(): void {
    if (!this.moving) return;
    const p = this.active;
    p.square = (p.square + 1) % R.RING;
    this.state.pendingSteps -= 1;
    this.cue('move');
    if (p.square === 0) {
      this.arriveHome(p, this.state.pendingSteps === 0 ? 'landing' : 'passing');
    }
  }

  /** Applies the landing square once movement has finished. */
  resolveLanding(): void {
    if ((this.state.phase as string) === 'gameOver') return;
    if (this.state.pendingSteps > 0) return;
    this.resolveSquare();
  }

  /** Walks out the entire roll with no animation, for headless play and tests. */
  finishMoveInstantly(): void {
    while (this.moving) this.stepMove();
    this.state.pendingNotices = [];
    this.resolveLanding();
  }

  /** Drains queued mid-movement results (promotions and demotions). */
  drainNotices(): Modal[] {
    const out = this.state.pendingNotices;
    this.state.pendingNotices = [];
    return out;
  }

  /** Home award plus a one-step promotion or demotion check. */
  private arriveHome(p: Player, how: 'passing' | 'landing'): void {
    this.adjustBossRating(p.id, R.HOME_BOSS_RATING);
    this.log(
      `${p.name} ${how === 'passing' ? 'passes' : 'lands on'} Home: +${R.HOME_BOSS_RATING} Boss Rating.`,
      p.id,
    );

    const target = R.rankForBossRating(p.bossRating);
    const next = R.stepRank(p.rank, target);
    if (next === p.rank) return;

    const from = p.rank;
    p.rank = next;
    const up = next > from;
    this.cue(up ? `promotion:${from}` : 'demotion');
    this.log(
      `${p.name} is ${up ? 'promoted' : 'demoted'} to ${RANKS[next]}.`,
      p.id,
    );

    if (next === RANKS.length - 1) {
      p.president = true;
      this.cue('win');
      this.state.winner = p.id;
      this.state.phase = 'gameOver';
      this.state.modal = {
        kind: 'gameOver',
        text: `${p.name} has been promoted to President and wins the game.`,
      };
      return;
    }

    this.state.pendingNotices.push({ kind: 'rankChange', playerId: p.id, from, to: next });
  }

  /** Applies the landing square's effect. May open a modal. */
  private resolveSquare(): void {
    const p = this.active;
    const sq = SQUARES[p.square];

    switch (sq.kind) {
      case 'home':
        // Already awarded by arriveHome via the pass check.
        this.finishWork({ landedOnOther: false, ownProject: null });
        break;

      case 'project': {
        const proj = this.state.projects[sq.project!];
        if (proj.owner === null) {
          this.state.phase = 'resolving';
          this.state.modal = { kind: 'takeProject', playerId: p.id, projectId: proj.id };
          return;
        }
        if (proj.owner === p.id) {
          this.log(
            `${p.name} lands on their own project ${proj.name} — extra work done.`,
            p.id,
            'LANDOWN',
          );
          this.finishWork({ landedOnOther: false, ownProject: proj.id });
        } else {
          const owner = this.player(proj.owner);
          this.log(
            `${p.name} lands on ${owner.name}'s project ${proj.name} and must work on it instead.`,
            p.id,
            'LANDOTHER',
          );
          this.addWork(proj, R.WORK_LANDING_OTHER);
          this.adjustFriendliness(p.id, 1);
          this.finishWork({ landedOnOther: true, ownProject: null });
        }
        break;
      }

      case 'businessTrip':
        this.cue('businessTrip');
        this.log(`${p.name} is sent on a business trip.`, p.id, 'TRIP');
        p.square = 0;
        this.arriveHome(p, 'landing');
        if (this.state.phase === 'gameOver') return;
        this.adjustBossRating(p.id, R.BUSINESS_TRIP_BONUS);
        this.log(`Business trip bonus: +${R.BUSINESS_TRIP_BONUS} Boss Rating.`, p.id);
        this.finishWork({ landedOnOther: false, ownProject: null });
        break;

      case 'chance':
        this.state.phase = 'resolving';
        this.state.modal = { kind: 'chance', playerId: p.id, cardId: this.drawChance(p.id) };
        return;

      case 'scruples':
        this.state.phase = 'resolving';
        this.state.modal = { kind: 'scruples', playerId: p.id, cardId: this.drawScruples(p.id) };
        return;

      case 'meeting':
        this.state.phase = 'resolving';
        this.state.modal = this.buildMeeting(p.id);
        return;

      case 'officeParty':
        this.state.phase = 'resolving';
        this.state.modal = this.buildOfficeParty(p.id);
        return;

      case 'powerMonger': {
        const actions = R.POWER_MONGER_ACTIONS[p.rank];
        if (actions === 0) {
          this.log(`${p.name} lands on Power Monger but has no clout as ${RANKS[p.rank]}.`, p.id);
          this.finishWork({ landedOnOther: false, ownProject: null });
        } else {
          this.state.phase = 'resolving';
          this.state.modal = { kind: 'powerMonger', playerId: p.id, actionsLeft: actions };
          return;
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- work & projects

  /**
   * Advances the active player's projects, then ends the turn.
   * Called once per turn, after the landing square has been resolved.
   */
  finishWork(opts: { landedOnOther: boolean; ownProject: number | null }): void {
    const p = this.active;

    if (!opts.landedOnOther) {
      const sets = new Set(this.completeSets(p.id));
      for (const proj of this.projectsOf(p.id)) {
        let amount = R.WORK_PER_TURN;
        if (sets.has(proj.profile)) amount *= R.SET_MULTIPLIER;
        if (proj.id === opts.ownProject) amount += R.WORK_LANDING_OWN;
        this.addWork(proj, amount);
      }
    } else {
      this.log(`${p.name} does no work on their own projects this turn.`, p.id);
    }

    this.rollShoddy(p.id);
    this.fireKarma(p.id);
    if (this.isOver()) return;
    this.maybeStockBonus();
    if (this.isOver()) return;

    this.state.phase = 'idle';
  }

  private addWork(proj: Project, amount: number): void {
    if (proj.owner === null) return;
    proj.progress = Math.max(0, proj.progress + amount);
    if (proj.progress >= proj.work) this.completeProject(proj);
  }

  private completeProject(proj: Project): void {
    const ownerId = proj.owner!;
    const owner = this.player(ownerId);
    const wasShoddy = proj.shoddy;

    this.cue('projectComplete');
    const br = R.COMPLETION_BOSS_RATING[proj.profile];
    this.adjustBossRating(ownerId, br);
    this.log(
      `${owner.name} completes ${proj.name} (profile ${proj.profile}): +${br} Boss Rating.`,
      ownerId,
      'FINISHEDPROJECT',
    );
    this.adjustStock(R.COMPLETION_STOCK[proj.profile], `${proj.name} shipped`);

    if (wasShoddy) {
      owner.karma.push({
        delay: R.SHODDY_PENALTY_DELAY,
        text: `${proj.name} was shipped shoddy, and it has come back to haunt ${owner.name}.`,
        bossRating: R.SHODDY_PENALTY_BOSS_RATING,
        stock: R.SHODDY_PENALTY_STOCK,
      });
      this.log(`${proj.name} shipped shoddy. This will be remembered.`, ownerId);
    }

    // The project resets, is renamed, and returns to the pool unowned.
    proj.progress = 0;
    proj.shoddy = false;
    proj.owner = null;
    proj.name = projectName(proj.profile, this.rng);
  }

  /** Heavy stress can turn in-progress projects shoddy. */
  private rollShoddy(id: number): void {
    const stress = this.stress(id);
    if (stress <= R.STRESS_SHODDY_THRESHOLD) return;
    const over = stress - R.STRESS_SHODDY_THRESHOLD;
    const p = R.SHODDY_CHANCE_PER_POINT * over;
    for (const proj of this.projectsOf(id)) {
      if (!proj.shoddy && this.rng.chance(p)) {
        proj.shoddy = true;
        this.log(`${this.player(id).name} is overloaded — ${proj.name} is turning shoddy.`, id);
      }
    }
  }

  /** Assigns an unowned project to a player. */
  takeProject(projectId: number, playerId: number): void {
    const proj = this.state.projects[projectId];
    proj.owner = playerId;
    proj.progress = 0;
    proj.shoddy = false;
    this.cue('projectTaken');
    this.log(`${this.player(playerId).name} takes on ${proj.name}.`, playerId);
    this.noteSets(playerId);
  }

  /** Awards a one-off bonus the first time a player holds a full set. */
  private seenSets = new Map<string, boolean>();

  private noteSets(id: number): void {
    for (const profile of this.completeSets(id)) {
      const key = `${id}:${profile}`;
      if (this.seenSets.get(key)) continue;
      this.seenSets.set(key, true);
      const bonus = SET_BONUS_BOSS_RATING[profile];
      this.adjustBossRating(id, bonus);
      this.log(
        `${this.player(id).name} now owns every profile-${profile} project: +${bonus} Boss Rating, and double work on them.`,
        id,
        'SETOFPROJECTS',
      );
    }
  }

  // ---------------------------------------------------------------- cards

  private drawChance(playerId: number): number {
    const hasProject = this.projectsOf(playerId).length > 0;
    const hasRival = this.state.players.length > 1;
    const pool = deck().chance;
    const eligible = pool.map((_, i) => i).filter((i) => {
      const c = pool[i];
      if (c.needsProject && !hasProject) return false;
      if (c.needsRival && !hasRival) return false;
      return true;
    });
    return this.rng.pick(eligible);
  }

  private drawScruples(playerId: number): number {
    const hasProject = this.projectsOf(playerId).length > 0;
    const hasRival = this.state.players.length > 1;
    const pool = deck().scruples;
    const eligible = pool.map((_, i) => i).filter((i) => {
      const c = pool[i];
      if (c.needsProject && !hasProject) return false;
      if (c.needsRival && !hasRival) return false;
      return true;
    });
    return this.rng.pick(eligible);
  }

  /** Renders a chance card's text with names substituted. */
  chanceText(cardId: number, playerId: number): string {
    return this.fill(deck().chance[cardId].text, playerId);
  }

  chanceCard(cardId: number): ChanceCard {
    return deck().chance[cardId];
  }

  scruplesCard(cardId: number): ScruplesCard {
    return deck().scruples[cardId];
  }

  scruplesText(cardId: number, playerId: number): string {
    return this.fill(deck().scruples[cardId].situation, playerId);
  }

  /**
   * The three answers, with names substituted.
   *
   * Answers went to the screen raw: fill() was applied to the situation, the outcome and the
   * delayed text but never to the labels, so a card offering 'Tell {rival} about the request.'
   * printed exactly that.
   */
  scruplesLabels(cardId: number, playerId: number): string[] {
    return deck().scruples[cardId].choices.map((c) => this.fill(c.label, playerId));
  }

  /** Applies a chance card and ends the square resolution. */
  applyChance(cardId: number, playerId: number): void {
    const c: ChanceCard = deck().chance[cardId];
    this.adjustBossRating(playerId, c.bossRating ?? 0);
    if (c.work) {
      const own = this.projectsOf(playerId);
      if (c.workSingleProject && own.length) {
        // The original applies some cards to one project rather than the whole workload.
        this.addWork(this.rng.pick(own), c.work);
      } else {
        for (const proj of own) this.addWork(proj, c.work);
      }
    }
    if (c.stock) this.adjustStock(c.stock, 'chance event');
    if (c.delayed) {
      this.player(playerId).karma.push({
        delay: c.delayed.turns,
        text: this.fill(c.delayed.text, playerId),
        bossRating: c.delayed.bossRating ?? 0,
        stock: c.delayed.stock ?? 0,
      });
    }
    if (c.moveTo !== undefined) {
      this.player(playerId).square = c.moveTo;
      if (c.moveTo === 22) {
        this.player(playerId).square = 0;
        this.arriveHome(this.player(playerId), 'landing');
        if (this.state.phase === 'gameOver') return;
        this.adjustBossRating(playerId, R.BUSINESS_TRIP_BONUS);
      }
    }
    if (this.state.phase === 'gameOver') return;
    this.finishWork({ landedOnOther: false, ownProject: null });
  }

  /** Applies a scruples answer (0-2) and ends the square resolution. */
  applyScruples(cardId: number, playerId: number, choiceIndex: number): string {
    const choice = deck().scruples[cardId].choices[choiceIndex];
    this.adjustBossRating(playerId, choice.bossRating ?? 0);
    if (choice.work) for (const proj of this.projectsOf(playerId)) this.addWork(proj, choice.work);
    if (choice.stock) this.adjustStock(choice.stock, 'scruples');
    if (choice.friendliness) this.adjustFriendliness(playerId, choice.friendliness);
    if (choice.delayed) {
      this.player(playerId).karma.push({
        delay: choice.delayed.turns,
        text: this.fill(choice.delayed.text, playerId),
        bossRating: choice.delayed.bossRating ?? 0,
        stock: choice.delayed.stock ?? 0,
      });
    }
    const outcome = this.fill(choice.outcome, playerId);
    this.log(outcome, playerId);
    if (this.state.phase !== 'gameOver') {
      this.finishWork({ landedOnOther: false, ownProject: null });
    }
    return outcome;
  }

  /** Delayed consequences tick down at the end of the owner's turn. */
  private fireKarma(id: number): void {
    const p = this.player(id);
    const remaining: typeof p.karma = [];
    for (const k of p.karma) {
      k.delay -= 1;
      if (k.delay > 0) {
        remaining.push(k);
        continue;
      }
      this.adjustBossRating(id, k.bossRating);
      if (k.stock) this.adjustStock(k.stock, 'past decisions');
      this.log(k.text, id);
      if (this.state.phase === 'gameOver') break;
    }
    p.karma = remaining;
  }

  // ---------------------------------------------------------------- squares with modals

  private buildMeeting(playerId: number): Modal {
    const n = this.projectsOf(playerId).length;
    let delta: number;
    let text: string;
    const name = this.player(playerId).name;

    if (n === 0) {
      delta = R.MEETING_BANDS.none;
      text = `${name} has nothing to present. The boss is furious that ${name} is holding no projects at all.`;
    } else if (n <= 2) {
      delta = R.MEETING_BANDS.few;
      text = `${name} presents ${n} project${n === 1 ? '' : 's'} calmly and in detail. It goes over very well.`;
    } else if (n <= 4) {
      delta = R.MEETING_BANDS.ok;
      text = `${name} gets through all ${n} projects. It is competent, if a little rushed.`;
    } else if (n <= 6) {
      delta = R.MEETING_BANDS.many;
      text = `${name} tries to cover ${n} projects and loses the room halfway through.`;
    } else {
      delta = R.MEETING_BANDS.overloaded;
      text = `${name} is juggling ${n} projects and cannot answer a single question about any of them.`;
    }

    // Stress makes a bad meeting worse and takes the edge off a good one.
    const stress = this.stress(playerId);
    if (stress > R.STRESS_SHODDY_THRESHOLD) delta -= 2;

    return { kind: 'meeting', playerId, text, delta };
  }

  applyMeeting(playerId: number, delta: number): void {
    this.adjustBossRating(playerId, delta);
    this.log(
      `${this.player(playerId).name} presents at the meeting: ${delta >= 0 ? '+' : ''}${delta} Boss Rating.`,
      playerId,
    );
    this.finishWork({ landedOnOther: false, ownProject: null });
  }

  /**
   * The whole office attends, so every player gets an outcome. Each entry carries the mood
   * that selects its sprite set, matching the original's separate hammered, crawling,
   * wobbling and standing image lists.
   */
  private buildOfficeParty(_playerId: number): Modal {
    const entries: PartyEntry[] = [];
    for (const p of this.state.players) {
      const stress = this.stress(p.id);
      let delta: number;
      let line: string;
      let mood: PartyEntry['mood'];
      if (stress >= R.PARTY_DRUNK_STRESS) {
        delta = -this.rng.range(4, 8);
        mood = 'drunk';
        line = `${p.name} is carrying too much and drinks to forget about all of it. The boss watches.`;
      } else if (stress <= R.PARTY_BORED_STRESS) {
        delta = -this.rng.range(2, 5);
        mood = 'wild';
        line = `${p.name} has nothing to worry about and parties far too hard.`;
      } else {
        delta = this.rng.range(1, 5);
        mood = 'fine';
        line = `${p.name} works the room, stays sober, and leaves at a respectable hour.`;
      }
      this.adjustBossRating(p.id, delta);
      entries.push({ playerId: p.id, text: line, delta, mood });
      this.log(line, p.id);
    }
    return { kind: 'officeParty', entries };
  }

  // ---------------------------------------------------------------- power monger

  powerMongerActions(playerId: number): number {
    return R.POWER_MONGER_ACTIONS[this.player(playerId).rank];
  }

  /** Cancel a project outright — it returns to the pool, unowned and renamed. */
  cancelProject(projectId: number, byId: number): void {
    const proj = this.state.projects[projectId];
    const victim = proj.owner;
    this.log(
      `${this.player(byId).name} cancels ${proj.name}${victim !== null ? `, ${this.player(victim).name}'s project` : ''}.`,
      byId,
    );
    if (victim !== null && victim !== byId) this.adjustFriendliness(byId, -4);
    proj.owner = null;
    proj.progress = 0;
    proj.shoddy = false;
    proj.name = projectName(proj.profile, this.rng);
  }

  /** Reassign a project to another player (or to yourself). */
  assignProject(projectId: number, toId: number, byId: number): void {
    const proj = this.state.projects[projectId];
    const fromId = proj.owner;
    proj.owner = toId;
    this.log(
      `${this.player(byId).name} assigns ${proj.name} to ${this.player(toId).name}.`,
      byId,
    );
    if (fromId !== null && fromId !== byId) this.adjustFriendliness(byId, -3);
    if (toId !== byId && fromId === byId) this.adjustFriendliness(byId, -2);
    this.noteSets(toId);
  }

  // ---------------------------------------------------------------- trading

  /** Executes an accepted trade. */
  executeTrade(fromId: number, toId: number, give: number[], want: number[]): void {
    for (const id of give) this.state.projects[id].owner = toId;
    for (const id of want) this.state.projects[id].owner = fromId;
    const giveNames = give.map((i) => this.state.projects[i].name).join(', ') || 'nothing';
    const wantNames = want.map((i) => this.state.projects[i].name).join(', ') || 'nothing';
    this.log(
      `${this.player(fromId).name} trades ${giveNames} to ${this.player(toId).name} for ${wantNames}.`,
      fromId,
    );
    this.cue('trade');
    this.adjustFriendliness(fromId, 2);
    this.noteSets(fromId);
    this.noteSets(toId);
  }

  declineTrade(fromId: number, toId: number): void {
    this.log(`${this.player(toId).name} declines ${this.player(fromId).name}'s trade offer.`, toId);
  }

  // ---------------------------------------------------------------- stock bonus

  private maybeStockBonus(): void {
    if (this.state.turn % R.STOCK_BONUS_EVERY !== 0) return;
    if (this.state.stock < R.STOCK_BONUS_THRESHOLD) return;
    this.cue('stockMarket');
    this.log(
      `The stock is at ${this.state.stock}. The boss hands out rank-scaled rewards.`,
      null,
      'STOCKBONUS',
    );
    for (const p of this.state.players) {
      const bonus = p.rank * R.STOCK_BONUS_PER_RANK;
      if (bonus > 0) {
        this.adjustBossRating(p.id, bonus);
        this.log(`${p.name} receives +${bonus} Boss Rating as ${RANKS[p.rank]}.`, p.id);
      }
    }
  }

  // ---------------------------------------------------------------- resign / advance

  resign(playerId: number): void {
    const p = this.player(playerId);
    if (p.kind !== 'human') return;
    p.kind = 'computer';
    p.resigned = true;
    p.personality = this.resolvePersonality('random');
    for (const q of this.state.players) if (q.id !== p.id) p.friendliness[q.id] = 0;
    this.cue('resign');
    // 'an ambitious computer player', not 'a ambitious' — personalities start with a vowel often
    // enough for the wrong article to be the first thing you notice in the log.
    const article = /^[aeiou]/i.test(p.personality ?? '') ? 'An' : 'A';
    this.log(`${p.name} resigns. ${article} ${p.personality} computer player takes over the seat.`, p.id);
  }

  /** Ends the current turn and moves to the next player. */
  endTurn(): void {
    if (this.state.phase === 'gameOver') return;
    this.state.rolled = false;
    this.state.die = null;
    this.state.modal = null;
    this.state.current = (this.state.current + 1) % this.state.players.length;
    if (this.state.current === 0) {
      this.state.turn += 1;
      this.chargeOperatingCost();
      if (this.isOver()) return;
    }
    this.state.phase = 'idle';
  }

  /**
   * Charges one round of operating cost, scaled by how many projects the company has on
   * its books. The fraction is carried so the long-run rate stays exact.
   */
  private chargeOperatingCost(): void {
    const owned = this.state.projects.filter((p) => p.owner !== null).length;
    this.state.stockCostCarry += R.STOCK_TUNING.costPerOwnedProjectPerRound * owned;
    const whole = Math.floor(this.state.stockCostCarry);
    if (whole < 1) return;
    this.state.stockCostCarry -= whole;
    this.adjustStock(-whole, 'operating costs');
  }

  /** True when the turn is finished and we are waiting to advance. */
  turnComplete(): boolean {
    return this.state.phase === 'idle' && this.state.rolled && !this.state.modal;
  }

  // ---------------------------------------------------------------- save / load

  serialize(): string {
    return JSON.stringify({
      version: 1,
      state: this.state,
      rngSeed: this.rng.seed,
      seenSets: [...this.seenSets.keys()],
    });
  }

  static deserialize(json: string): Game {
    const data = JSON.parse(json);
    const g = Object.create(Game.prototype) as Game;
    g.state = data.state;
    g.rng = new Rng(data.rngSeed);
    (g as unknown as { seenSets: Map<string, boolean> }).seenSets = new Map(
      (data.seenSets ?? []).map((k: string) => [k, true]),
    );
    return g;
  }
}
