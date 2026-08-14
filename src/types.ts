export type Profile = 1 | 2 | 3 | 4 | 5;

export const RANKS = [
  'Mailroom',
  'Entry Level Manager',
  'Junior Manager',
  'Middle Manager',
  'Senior Manager',
  'Vice President',
  'President',
] as const;

export type Rank = number; // index into RANKS

/**
 * Single-letter rank badges for the stats panel, which the original sized at 11px wide.
 * Only 'E' (Entry Level) is confirmed from the recovered DFM default caption; the rest are
 * chosen to stay unambiguous, since Mailroom and Middle Manager would otherwise collide.
 */
export const RANK_LETTERS = ['R', 'E', 'J', 'M', 'S', 'V', 'P'] as const;

export type GameLength = 'short' | 'medium' | 'long';

export type Personality = 'evil' | 'ambitious' | 'goodytwoshoes' | 'average';

export const PERSONALITIES: Personality[] = ['evil', 'ambitious', 'goodytwoshoes', 'average'];

/** What a setup seat may request. 'random' is resolved once, at game creation. */
export type PersonalityChoice = Personality | 'random';

export type SeatKind = 'human' | 'computer' | 'off';

export type SquareKind =
  | 'home'
  | 'project'
  | 'chance'
  | 'scruples'
  | 'officeParty'
  | 'meeting'
  | 'businessTrip'
  | 'powerMonger';

export interface Square {
  index: number;
  kind: SquareKind;
  /** Original TMAINFORM geometry, in the 784x580 design space. */
  left: number;
  top: number;
  size: number;
  /** Only for kind === 'project': index into GameState.projects */
  project?: number;
}

export interface Project {
  id: number;
  /** Board square this project lives on. */
  square: number;
  profile: Profile;
  name: string;
  /** Work completed so far, 0..work. Displayed bar fills as this rises. */
  progress: number;
  /** Total work needed. Derived from profile. */
  work: number;
  /** Player id, or null when unowned. */
  owner: number | null;
  shoddy: boolean;
}

export interface Player {
  id: number;
  name: string;
  kind: Exclude<SeatKind, 'off'>;
  personality: Personality | null;
  color: string;
  square: number;
  bossRating: number;
  rank: Rank;
  /** Only meaningful for computer players: friendliness toward each player id. */
  friendliness: Record<number, number>;
  /** Set when this player has won. */
  president: boolean;
  /**
   * Set when a human resigned this seat and a computer took it over. Display only — no rule
   * reads it — but the panel has to be able to say the human is gone.
   */
  resigned?: boolean;
  /** Pending consequences queued by shoddy projects and scruples answers. */
  karma: KarmaEntry[];
}

export interface KarmaEntry {
  /** Turns remaining before it fires. */
  delay: number;
  text: string;
  bossRating: number;
  stock: number;
}

/** One player's outcome at the office party, including which sprite set to draw. */
export interface PartyEntry {
  playerId: number;
  text: string;
  delta: number;
  mood: 'fine' | 'wild' | 'drunk';
}

export interface StockPoint {
  turn: number;
  price: number;
}

export type Phase =
  | 'setup'
  | 'idle'          // active player may roll / trade / resign
  | 'rolling'
  | 'moving'
  | 'resolving'     // a modal square effect is open
  | 'gameOver';

export interface LogEntry {
  turn: number;
  playerId: number | null;
  text: string;
  /** Name of the original bitmap illustrating this event, when one exists. */
  art?: string;
}

export interface GameState {
  phase: Phase;
  length: GameLength;
  players: Player[];
  projects: Project[];
  current: number;      // index into players
  turn: number;
  die: number | null;
  stock: number;
  stockHistory: StockPoint[];
  /** Highest share price reached this game, for the Highest Stock table. */
  stockPeak: number;
  /**
   * Most recent change to the share price, for the board's Stock Ticker readout. The
   * original showed this in a small raised panel labelled "Stock Ticker", in lime.
   */
  lastStockDelta: number;
  log: LogEntry[];
  /** Set when the company crashes: everybody loses. */
  crashed: boolean;
  winner: number | null;
  /** Whether the active player already rolled this turn. */
  rolled: boolean;
  /** Pending modal, drives the UI. */
  modal: Modal | null;
  rngSeed: number;
  /** Fractional carry for per-turn operating costs, so they stay exact over time. */
  stockCostCarry: number;
  /**
   * Squares left to step through on the current roll. The original animates movement one
   * square at a time and only reveals the landing result afterwards, so movement is a
   * distinct phase rather than a teleport.
   */
  pendingSteps: number;
  /**
   * Results that occurred mid-movement (promotions from crossing Home) and must be shown
   * after the token stops, not while it is still travelling.
   */
  pendingNotices: Modal[];
  /**
   * Semantic audio cues raised since the last drain. Names match Cue in sound.ts. The
   * engine only appends; whoever renders drains it. Headless play ignores it entirely.
   */
  soundCues: string[];
}

export type Modal =
  | { kind: 'takeProject'; playerId: number; projectId: number }
  | { kind: 'chance'; playerId: number; cardId: number }
  | { kind: 'scruples'; playerId: number; cardId: number }
  | { kind: 'meeting'; playerId: number; text: string; delta: number }
  | { kind: 'officeParty'; entries: PartyEntry[] }
  | { kind: 'powerMonger'; playerId: number; actionsLeft: number }
  | { kind: 'trade'; from: number }
  | { kind: 'acceptTrade'; from: number; to: number; give: number[]; want: number[] }
  | { kind: 'rankChange'; playerId: number; from: Rank; to: Rank }
  | { kind: 'notice'; title: string; lines: string[] }
  | { kind: 'gameOver'; text: string };
