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

export type GameLength = 'short' | 'medium' | 'long';

export type Personality = 'evil' | 'ambitious' | 'goodytwoshoes' | 'average';

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
}

export type Modal =
  | { kind: 'takeProject'; playerId: number; projectId: number }
  | { kind: 'chance'; playerId: number; cardId: number }
  | { kind: 'scruples'; playerId: number; cardId: number }
  | { kind: 'meeting'; playerId: number; text: string; delta: number }
  | { kind: 'officeParty'; lines: string[] }
  | { kind: 'powerMonger'; playerId: number; actionsLeft: number }
  | { kind: 'trade'; from: number }
  | { kind: 'acceptTrade'; from: number; to: number; give: number[]; want: number[] }
  | { kind: 'rankChange'; playerId: number; from: Rank; to: Rank }
  | { kind: 'notice'; title: string; lines: string[] }
  | { kind: 'gameOver'; text: string };
