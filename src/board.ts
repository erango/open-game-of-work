import type { Profile, Square, SquareKind } from './types';

/**
 * Board geometry, transcribed from TMAINFORM component Left/Top values in the original
 * 784x580 window. Order is clockwise from Home. See SPEC.md §2.
 */
const LAYOUT: Array<[SquareKind, number, number, number]> = [
  ['home', 8, 8, 140],
  ['project', 147, 8, 81],
  ['project', 227, 8, 81],
  ['chance', 227, 88, 81],
  ['project', 307, 88, 81],
  ['project', 387, 88, 81],
  ['scruples', 387, 8, 81],
  ['project', 467, 8, 81],
  ['project', 547, 8, 81],
  ['officeParty', 627, 8, 140],
  ['project', 686, 147, 81],
  ['chance', 686, 226, 81],
  ['project', 686, 307, 81],
  ['meeting', 627, 387, 140],
  ['scruples', 547, 446, 81],
  ['project', 467, 446, 81],
  ['project', 467, 366, 81],
  ['powerMonger', 387, 366, 81],
  ['project', 307, 366, 81],
  ['project', 307, 446, 81],
  ['chance', 227, 446, 81],
  ['project', 147, 446, 81],
  ['businessTrip', 8, 387, 140],
  ['project', 8, 307, 81],
  ['scruples', 8, 227, 81],
  ['project', 8, 147, 81],
];

export const DESIGN_WIDTH = 776;
export const DESIGN_HEIGHT = 535;

/**
 * Profile per project square, in board order.
 *
 * APPROXIMATED — see SPEC.md §14. The original stored tile colours at runtime, so the
 * true mapping is in code we did not translate. Confirmed from the rules text: the first
 * two project squares clockwise of Home are both profile 1. 15 squares over 5 profiles
 * gives 3 each; this assignment is symmetric about the board and keeps each profile's
 * three squares spread apart so set-collecting requires moving around the whole ring.
 */
export const PROJECT_PROFILES: Profile[] = [
  1, 1, // squares 1, 2   — confirmed profile 1
  2, 2, // squares 4, 5
  3, 3, // squares 7, 8
  4, 4, // squares 10, 12
  5, 5, // squares 15, 16
  4,    // square 18
  3,    // square 19
  2,    // square 21
  5,    // square 23
  1,    // square 25
];

export function buildSquares(): Square[] {
  const squares: Square[] = [];
  let projectIndex = 0;
  LAYOUT.forEach(([kind, left, top, size], index) => {
    const sq: Square = { index, kind, left, top, size };
    if (kind === 'project') sq.project = projectIndex++;
    squares.push(sq);
  });
  return squares;
}

export const SQUARES = buildSquares();

export const PROJECT_SQUARES = SQUARES.filter((s) => s.kind === 'project');

export const PROJECT_COUNT = PROJECT_SQUARES.length; // 15

/** Center-cluster geometry, also from TMAINFORM. */
export const CENTER = {
  rollDie: { left: 336, top: 224, size: 81 },
  makeTrade: { left: 437, top: 224, size: 81 },
  resign: { left: 594, top: 296, size: 50 },
  stats: { left: 96, top: 172, width: 205, height: 211 },
  /**
   * Per-player row geometry inside the stats panel, transcribed from the original's
   * TMAINFORM children (Shape13..Shape18, playerNNameLabel, rankLabelN, smallPlayerImage).
   * Coordinates are relative to the stats panel. Row spacing is 32px except row 3, which
   * the original placed one pixel lower.
   */
  statRows: {
    barTops: [26, 58, 90, 123, 155, 187],
    nameTops: [8, 40, 72, 105, 137, 169],
    portrait: { left: 16, size: 16 },
    bar: { left: 32, width: 136, height: 16 },
    name: { left: 10, width: 140, height: 17 },
    rank: { left: 176, width: 11, height: 16 },
  },
  tokens: { left: 500, top: 106, size: 32, gapX: 32, gapY: 33, perRow: 3 },
};

/** Human-readable label per square kind, for the board face. */
export const KIND_LABEL: Record<SquareKind, string> = {
  home: 'HOME',
  project: '',
  chance: 'CHANCE',
  scruples: '?',
  officeParty: 'OFFICE\nPARTY',
  meeting: 'MEETING',
  businessTrip: 'BUSINESS\nTRIP',
  powerMonger: 'POWER\nMONGER',
};

/** Tile colour per profile — the original used one colour per profile, blue for 1. */
export const PROFILE_COLORS: Record<Profile, string> = {
  1: '#4a72b8',
  2: '#4a9e6a',
  3: '#c8a23c',
  4: '#c4703c',
  5: '#9a4a8c',
};

/** Center-to-center token offset so multiple players on one square don't fully overlap. */
export function tokenOffset(slot: number): { dx: number; dy: number } {
  const ring = [
    { dx: -10, dy: -10 },
    { dx: 10, dy: -10 },
    { dx: -10, dy: 10 },
    { dx: 10, dy: 10 },
    { dx: 0, dy: -14 },
    { dx: 0, dy: 14 },
  ];
  return ring[slot % ring.length];
}
