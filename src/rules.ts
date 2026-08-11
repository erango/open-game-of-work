import type { GameLength, Profile, Rank } from './types';

/**
 * Tunable numbers.
 *
 * The original encoded these in code, not resources, so exact values could not be
 * recovered by static analysis. Everything here is chosen to reproduce the *described*
 * behaviour and pacing from SPEC.md. Tweak freely — this file is the whole balance surface.
 */

/** Board is a ring of 26 squares. */
export const RING = 26;

/** Boss Rating at or above this makes a Vice President eligible for the presidency. */
export const PRESIDENT_THRESHOLD = 100;

/** Awarded every time a player passes or lands on Home. */
export const HOME_BOSS_RATING = 2;

/** Business Trip grants this on top of the Home award it triggers. */
export const BUSINESS_TRIP_BONUS = 2;

/** Total work units a project needs, by profile. Higher profile = bigger job. */
export const PROJECT_WORK: Record<Profile, number> = { 1: 4, 2: 6, 3: 8, 4: 11, 5: 14 };

/**
 * Boss Rating granted for completing a project you own, by profile.
 *
 * Tuned down from a first pass: promotion only happens when passing Home and moves at
 * most one rank, so a player needs five laps to climb Entry Level -> President. If
 * completion pays too well, Boss Rating saturates far past PRESIDENT_THRESHOLD in two
 * laps and the remaining game is decided purely by lap count. These values keep the
 * rating roughly in step with the lap requirement, so it stays the binding constraint.
 */
export const COMPLETION_BOSS_RATING: Record<Profile, number> = { 1: 2, 2: 4, 3: 6, 4: 9, 5: 12 };

/**
 * Stock price movement when a project completes, by profile.
 *
 * Also tuned down: completions are frequent and were swamping every negative event, so
 * the documented "share price hits zero and everybody loses" state was unreachable.
 */
export const COMPLETION_STOCK: Record<Profile, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 };

/** Work added per turn to each project a player owns. */
export const WORK_PER_TURN = 1;

/** Extra work when you land on a project you already own. */
export const WORK_LANDING_OWN = 2;

/** Work you are forced to contribute when you land on someone else's project. */
export const WORK_LANDING_OTHER = 2;

/** Owning every project of a profile doubles work on those projects. */
export const SET_MULTIPLIER = 2;

export const STOCK_START = 50;
export const STOCK_MIN = 0;
export const STOCK_MAX = 200;

export const STOCK_TUNING = {
  /**
   * Operating cost per round, charged per project currently owned by anybody.
   *
   * ADDED, not recovered — see SPEC.md §14. The original documents that the price "is
   * affected by various other things" and ships COMPANYDISBANDED artwork for the
   * price-hits-zero ending, so that ending was reachable. Without steady downward pressure
   * it is not: completions are frequent and uniformly positive, and in simulation the
   * price never fell below its starting value across 60 games.
   *
   * Scaling matters more than magnitude. Charging per *player* made six-player tables far
   * more crash-prone than two-player ones, because income is bounded by the fixed 15
   * project squares while a headcount charge grows without limit. Charging per *owned
   * project* tracks the company's actual workload, so the pressure is the same shape at
   * every table size.
   *
   * Calibrated by sweep rather than arithmetic: the naive estimate from COMPLETION_STOCK
   * over PROJECT_WORK is about +0.4 per owned project per round, but set bonuses and
   * landing bonuses accelerate completion, so realised income runs higher.
   *
   * Retuned after the real profile distribution was recovered from the original's tile
   * colours (2/4/4/3/2 rather than three per profile). Profiles 1 and 5 need only two
   * squares, so set bonuses and their double-work multiplier land far more often, which
   * lifted income enough to make the crash ending unreachable again at the previous 0.7.
   *
   * Mutable so the balance sweep in test/ can vary it.
   */
  costPerOwnedProjectPerRound: 0.76,
};


/** Boss hands out rank-scaled rewards when stock sits above this, every N turns. */
export const STOCK_BONUS_THRESHOLD = 90;
export const STOCK_BONUS_EVERY = 8;
export const STOCK_BONUS_PER_RANK = 2;

/**
 * Stress above this gives in-progress projects a chance to turn shoddy each turn.
 * Stress is the sum of the profiles of everything you own, so 5 projects at profile 3
 * is stress 15.
 */
export const STRESS_SHODDY_THRESHOLD = 12;
export const SHODDY_CHANCE_PER_POINT = 0.02;

/** A shoddy project that completes queues a delayed penalty. */
export const SHODDY_PENALTY_DELAY = 3;
export const SHODDY_PENALTY_BOSS_RATING = -8;
export const SHODDY_PENALTY_STOCK = -4;

/** Office Party stress bands. */
export const PARTY_DRUNK_STRESS = 14;   // at or above: drinks too much
export const PARTY_BORED_STRESS = 4;    // at or below: parties too hard

/** Meeting outcome bands, by number of projects held. */
export const MEETING_BANDS = {
  none: -12,       // zero projects: boss very angry
  few: 8,          // 1-2 projects
  ok: 3,           // 3-4
  many: -6,        // 5-6
  overloaded: -11, // 7+
};

/** Power Monger actions permitted per rank index. */
export const POWER_MONGER_ACTIONS: number[] = [
  0, // Mailroom
  1, // Entry Level Manager
  1, // Junior Manager
  2, // Middle Manager
  2, // Senior Manager
  3, // Vice President
  3, // President (terminal, never actually acts)
];

/**
 * Boss Rating needed to hold each rank. Passing Home moves at most one rank, so a
 * player drifts up and down this ladder gradually.
 *
 * Index matches RANKS. Mailroom has no floor — it is where you land when demoted out
 * of Entry Level.
 */
export const RANK_FLOOR: number[] = [
  -Infinity, // Mailroom
  0,         // Entry Level Manager
  20,        // Junior Manager
  40,        // Middle Manager
  60,        // Senior Manager
  80,        // Vice President
  PRESIDENT_THRESHOLD,
];

/** Starting rank and Boss Rating per game length. */
export const LENGTH_START: Record<GameLength, { rank: Rank; bossRating: number }> = {
  short: { rank: 3, bossRating: 45 },  // Middle Manager
  medium: { rank: 2, bossRating: 22 }, // Junior Manager
  long: { rank: 1, bossRating: 0 },    // Entry Level Manager
};

/** High-score turn counts are scaled so shorter games compare against Long. */
export const LENGTH_TURN_SCALE: Record<GameLength, number> = {
  short: 2.0,
  medium: 1.4,
  long: 1.0,
};

export const PLAYER_COLORS = [
  '#d2323c', // red
  '#2e63c8', // blue
  '#2f9e44', // green
  '#e0a020', // amber
  '#8c4bc8', // violet
  '#26a4a4', // teal
];

/** Where a player's Boss Rating sits relative to the rank they currently hold. */
export function rankForBossRating(br: number): Rank {
  let r: Rank = 0;
  for (let i = RANK_FLOOR.length - 1; i >= 0; i--) {
    if (br >= RANK_FLOOR[i]) {
      r = i;
      break;
    }
  }
  return r;
}

/** Promotion/demotion moves at most one step toward the rating-implied rank. */
export function stepRank(current: Rank, target: Rank): Rank {
  if (target > current) return current + 1;
  if (target < current) return current - 1;
  return current;
}
