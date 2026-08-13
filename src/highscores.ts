import { LENGTH_TURN_SCALE } from './rules';
import type { GameLength } from './types';

/**
 * High score tables, mirroring THIGHSCORESFORM.
 *
 * The original keeps two tables of ten, with these headers:
 *
 *   "Shortest time to President"  Rank | Name of President          | # of turns
 *   "Highest Stock"               Rank | Name of Eventual President | Stock Price
 *
 * Both are keyed on a president, so a game that ends with the company folding records
 * nothing — there is no eventual president to name.
 *
 * Turn counts are scaled before comparison. The original's own help text says Short and
 * Medium games have their turn counts scaled "to make them comparable to Long games", which
 * is what LENGTH_TURN_SCALE has been carrying since it was written.
 *
 * The original also rendered names with a title suffix — its layout placeholder reads
 * "WWWWWWWWWW the Megalomaniac". Those titles are its own writing and are not reproduced
 * here, so this shows plain names.
 */

export const TABLE_SIZE = 10;

export interface TurnScore {
  name: string;
  /** Turns actually played. */
  turns: number;
  /** Turns after length scaling, which is what the table ranks on. */
  scaled: number;
  length: GameLength;
  when: number;
}

export interface StockScore {
  name: string;
  price: number;
  length: GameLength;
  when: number;
}

export interface HighScores {
  fastest: TurnScore[];
  richest: StockScore[];
}

const KEY = 'ogow:highscores';

export function emptyScores(): HighScores {
  return { fastest: [], richest: [] };
}

export function loadScores(): HighScores {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyScores();
    const parsed = JSON.parse(raw) as Partial<HighScores>;
    return {
      fastest: Array.isArray(parsed.fastest) ? parsed.fastest.slice(0, TABLE_SIZE) : [],
      richest: Array.isArray(parsed.richest) ? parsed.richest.slice(0, TABLE_SIZE) : [],
    };
  } catch {
    return emptyScores();
  }
}

export function saveScores(scores: HighScores): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(scores));
  } catch {
    // Storage disabled or full; scores simply do not persist.
  }
}

/** Scales a raw turn count so shorter games compare against Long ones. */
export function scaleTurns(turns: number, length: GameLength): number {
  return Math.round(turns * LENGTH_TURN_SCALE[length]);
}

export interface Recorded {
  /** 1-based position in the fastest table, or null when it did not place. */
  fastestPlace: number | null;
  richestPlace: number | null;
  scores: HighScores;
}

/**
 * Records a finished game. Only a game with a president places, and each table keeps the
 * best ten: fewest scaled turns, and highest stock price reached.
 */
export function record(
  scores: HighScores,
  entry: { name: string; turns: number; peakStock: number; length: GameLength; when: number },
): Recorded {
  const next: HighScores = { fastest: [...scores.fastest], richest: [...scores.richest] };

  const turnScore: TurnScore = {
    name: entry.name,
    turns: entry.turns,
    scaled: scaleTurns(entry.turns, entry.length),
    length: entry.length,
    when: entry.when,
  };
  next.fastest.push(turnScore);
  next.fastest.sort((a, b) => a.scaled - b.scaled || a.when - b.when);
  next.fastest = next.fastest.slice(0, TABLE_SIZE);
  const fi = next.fastest.indexOf(turnScore);

  const stockScore: StockScore = {
    name: entry.name,
    price: entry.peakStock,
    length: entry.length,
    when: entry.when,
  };
  next.richest.push(stockScore);
  next.richest.sort((a, b) => b.price - a.price || a.when - b.when);
  next.richest = next.richest.slice(0, TABLE_SIZE);
  const ri = next.richest.indexOf(stockScore);

  return {
    fastestPlace: fi >= 0 ? fi + 1 : null,
    richestPlace: ri >= 0 ? ri + 1 : null,
    scores: next,
  };
}
