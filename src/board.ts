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
 * RECOVERED, not guessed. Every projectShape in TMAINFORM carries an explicit Brush.Color,
 * and the original's rules text states that tile colour encodes profile. Grouping the 15
 * squares by colour yields exactly five groups:
 *
 *   #00b7b7  shapes 1, 2         -> profile 1
 *   #94bcda  shapes 3, 4, 5, 6   -> profile 2
 *   #8bb889  shapes 7, 8, 10, 11 -> profile 3
 *   #debe89  shapes 12, 13, 14   -> profile 4
 *   #d88fd6  shapes 15, 16       -> profile 5
 *
 * So the distribution is 2/4/4/3/2, NOT three per profile as this file previously assumed.
 * Two independent checks agree: the rules text calls the first two squares clockwise of Home
 * profile 1, and in-game screenshots show tier-4 project names (Bomb, Mighty T-REX) on the
 * #debe89 squares and tier-3 names (Alligator, Parrot) on the #8bb889 squares, matching the
 * original's per-tier word pools.
 *
 * Set collecting is therefore asymmetric by design: profiles 1 and 5 need only two squares,
 * while profiles 2 and 3 need four.
 */
export const PROJECT_PROFILES: Profile[] = [
  1, 1, // shapes 1, 2
  2, 2, 2, 2, // shapes 3, 4, 5, 6
  3, 3, 3, 3, // shapes 7, 8, 10, 11
  4, 4, 4, // shapes 12, 13, 14
  5, 5, // shapes 15, 16
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
  /**
   * Raised frames and captions around the centre cluster, transcribed from TMAINFORM.
   * The original drew each control's caption in a label *below* the icon, not inside it,
   * and framed each with a bsRaised TBevel.
   */
  frames: {
    rollDie: { left: 334, top: 222, width: 86, height: 85 },
    makeTrade: { left: 435, top: 222, width: 86, height: 85 },
    resign: { left: 592, top: 294, width: 55, height: 55 },
    ticker: { left: 561, top: 214, width: 106, height: 50 },
  },
  captions: {
    rollDie: { left: 347, top: 312, width: 58, height: 23, text: 'Roll Die' },
    makeTrade: { left: 430, top: 312, width: 94, height: 23, text: 'Make Trade' },
    resign: { left: 595, top: 352, width: 48, height: 23, text: 'Resign' },
    ticker: { left: 560, top: 192, width: 106, height: 19, text: 'Stock Ticker' },
  },
  /** The lime readout inside the ticker frame. */
  tickerValue: { left: 567, top: 220, width: 93, height: 37 },
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

/**
 * Tile colour per profile, taken from the original's projectShape Brush.Color values
 * (Delphi TColor is 0x00BBGGRR, so these are byte-swapped from the stored integers).
 */
export const PROFILE_COLORS: Record<Profile, string> = {
  1: '#00b7b7',
  2: '#94bcda',
  3: '#8bb889',
  4: '#debe89',
  5: '#d88fd6',
};

/** The original board's background (TmainForm.Color = 15707751) and stats panel colour. */
export const BOARD_COLOR = '#67aeef';
export const STATS_PANEL_COLOR = '#5199fb';

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
