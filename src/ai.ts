import type { Game } from './engine';
import * as R from './rules';
import type { Personality, Profile, Project } from './types';

/**
 * Computer player decision making. See SPEC.md §11.
 *
 * Each personality is a set of weights over the same decision surface, and every choice
 * involving another player is additionally shaded by this AI's friendliness toward them.
 */

interface Weights {
  /** Appetite for taking on new projects even when already loaded. */
  greed: number;
  /** Willingness to hurt another player for gain. */
  malice: number;
  /** Preference for actions that raise Boss Rating directly. */
  sycophancy: number;
  /** Willingness to help others. */
  altruism: number;
  /** Tolerance for stress before declining work. */
  stressTolerance: number;
}

const WEIGHTS: Record<Personality, Weights> = {
  evil: { greed: 0.3, malice: 1.0, sycophancy: 0.4, altruism: 0.0, stressTolerance: 8 },
  ambitious: { greed: 1.0, malice: 0.6, sycophancy: 0.7, altruism: 0.1, stressTolerance: 22 },
  goodytwoshoes: { greed: 0.5, malice: 0.0, sycophancy: 1.0, altruism: 1.0, stressTolerance: 14 },
  average: { greed: 0.6, malice: 0.4, sycophancy: 0.6, altruism: 0.4, stressTolerance: 14 },
};

function weights(p: Personality | null): Weights {
  return WEIGHTS[p ?? 'average'];
}

/** Should this AI accept an offered unowned project? */
export function decideTakeProject(game: Game, playerId: number, projectId: number): boolean {
  const p = game.player(playerId);
  const w = weights(p.personality);
  const proj = game.state.projects[projectId];
  const stress = game.stress(playerId);

  // A project that completes a set is worth taking almost regardless of load.
  const sameProfile = game.state.projects.filter((q) => q.profile === proj.profile);
  const ownedOfProfile = sameProfile.filter((q) => q.owner === playerId).length;
  const completesSet = ownedOfProfile === sameProfile.length - 1;
  if (completesSet) return true;

  // Room left before this AI considers itself overloaded.
  const headroom = w.stressTolerance - stress;
  if (headroom <= 0) return game.rng.chance(0.1 * w.greed);

  // Higher profiles pay more Boss Rating but cost more stress.
  const appeal = w.greed * (headroom / w.stressTolerance) + 0.1 * proj.profile * w.sycophancy;
  return game.rng.chance(Math.min(0.95, appeal));
}

/** Which scruples answer to pick. */
export function decideScruples(game: Game, playerId: number, cardId: number): number {
  const p = game.player(playerId);
  const w = weights(p.personality);
  const card = game.scruplesCard(cardId);

  let best = 0;
  let bestScore = -Infinity;
  card.choices.forEach((c, i) => {
    let score = 0;
    score += (c.bossRating ?? 0) * (0.5 + w.sycophancy);
    score += (c.work ?? 0) * 1.5;
    score += (c.stock ?? 0) * 0.3;
    // Malicious AIs positively like choices that cost them friendliness.
    const f = c.friendliness ?? 0;
    score += f < 0 ? -f * w.malice * 1.2 : f * w.altruism * 1.2;
    // Delayed penalties are discounted, and the reckless discount them harder.
    if (c.delayed) {
      const later = (c.delayed.bossRating ?? 0) + (c.delayed.stock ?? 0) * 0.3;
      score += later * (p.personality === 'ambitious' ? 0.25 : 0.6);
    }
    score += game.rng.next() * 2; // keep them from being fully predictable
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export interface PowerMongerAction {
  kind: 'nothing' | 'cancel' | 'assign';
  projectId?: number;
  targetId?: number;
}

/** Pick one Power Monger action. Called once per available action. */
export function decidePowerMonger(game: Game, playerId: number): PowerMongerAction {
  const p = game.player(playerId);
  const w = weights(p.personality);
  const stress = game.stress(playerId);
  const others = game.state.players.filter((q) => q.id !== playerId);

  // Grab something that completes a set for us.
  for (const profile of [5, 4, 3, 2, 1] as Profile[]) {
    const all = game.state.projects.filter((q) => q.profile === profile);
    const mine = all.filter((q) => q.owner === playerId);
    if (all.length > 1 && mine.length === all.length - 1) {
      const missing = all.find((q) => q.owner !== playerId)!;
      if (stress + missing.profile <= w.stressTolerance + 6) {
        return { kind: 'assign', projectId: missing.id, targetId: playerId };
      }
    }
  }

  // Offload our worst project onto someone we dislike.
  if (stress > w.stressTolerance && others.length) {
    const mine = game.projectsOf(playerId);
    if (mine.length) {
      const worst = mine.reduce((a, b) => (b.profile > a.profile ? b : a));
      const target = leastLiked(game, playerId, others.map((o) => o.id));
      if (game.rng.chance(0.5 + w.malice * 0.4)) {
        return { kind: 'assign', projectId: worst.id, targetId: target };
      }
    }
  }

  // Hurt the leader.
  if (w.malice > 0 && others.length) {
    const leader = others.reduce((a, b) => (b.bossRating > a.bossRating ? b : a));
    const theirs = game.projectsOf(leader.id);
    if (theirs.length && game.rng.chance(w.malice * 0.7)) {
      // Cancel whatever is closest to shipping.
      const nearest = theirs.reduce((a, b) =>
        b.progress / b.work > a.progress / a.work ? b : a,
      );
      return { kind: 'cancel', projectId: nearest.id };
    }
  }

  // Helpful types hand a stalled project to whoever is furthest behind.
  if (w.altruism > 0.5 && others.length && game.rng.chance(w.altruism * 0.4)) {
    const behind = others.reduce((a, b) => (b.bossRating < a.bossRating ? b : a));
    const free = game.state.projects.filter((q) => q.owner === null);
    if (free.length) {
      const gift = game.rng.pick(free);
      return { kind: 'assign', projectId: gift.id, targetId: behind.id };
    }
  }

  // Otherwise pick up something unowned if we have room.
  const free = game.state.projects.filter((q) => q.owner === null);
  if (free.length && stress < w.stressTolerance) {
    const want = free.reduce((a, b) => (b.profile > a.profile ? b : a));
    return { kind: 'assign', projectId: want.id, targetId: playerId };
  }

  return { kind: 'nothing' };
}

/** Should this AI accept an offered trade? */
export function decideAcceptTrade(
  game: Game,
  toId: number,
  fromId: number,
  give: number[],
  want: number[],
): boolean {
  const p = game.player(toId);
  const w = weights(p.personality);
  const incoming = give.map((i) => game.state.projects[i]);
  const outgoing = want.map((i) => game.state.projects[i]);

  const value = (list: Project[]) =>
    list.reduce((n, proj) => n + R.COMPLETION_BOSS_RATING[proj.profile] * (proj.progress / proj.work + 0.4), 0);

  const gain = value(incoming) - value(outgoing);
  const stressDelta =
    incoming.reduce((n, q) => n + q.profile, 0) - outgoing.reduce((n, q) => n + q.profile, 0);

  let score = gain;
  // Overloaded AIs value shedding stress; hungry ones ignore it.
  if (game.stress(toId) + stressDelta > w.stressTolerance) score -= stressDelta * 1.5;

  // Friendliness tilts the answer, and helpful types will eat a bad trade.
  const f = p.friendliness[fromId] ?? 0;
  score += f * 0.8;
  score += w.altruism * 3;
  score -= w.malice * 2;

  // Would this hand the other player a set? Refuse if so, unless very friendly.
  for (const profile of [1, 2, 3, 4, 5] as Profile[]) {
    const all = game.state.projects.filter((q) => q.profile === profile);
    const theirsAfter = all.filter(
      (q) => (want.includes(q.id) ? false : q.owner === fromId) || give.includes(q.id) === false && q.owner === fromId,
    );
    const wouldComplete = all.every(
      (q) => q.owner === fromId || want.includes(q.id),
    );
    if (wouldComplete && theirsAfter.length && f < 5) score -= 10;
  }

  return score > 0;
}

/** Does this AI want to propose a trade before rolling? Returns null for no. */
export function decideProposeTrade(
  game: Game,
  fromId: number,
): { toId: number; give: number[]; want: number[] } | null {
  const p = game.player(fromId);
  const w = weights(p.personality);
  if (!game.rng.chance(0.25 + w.greed * 0.2)) return null;

  const mine = game.projectsOf(fromId);
  if (!mine.length) return null;

  // Look for a single-for-single swap that moves us toward a set.
  for (const profile of [5, 4, 3, 2, 1] as Profile[]) {
    const all = game.state.projects.filter((q) => q.profile === profile);
    const owned = all.filter((q) => q.owner === fromId);
    if (all.length < 2 || owned.length !== all.length - 1) continue;
    const missing = all.find((q) => q.owner !== null && q.owner !== fromId);
    if (!missing) continue;
    // Offer our least useful project of a different profile.
    const spare = mine
      .filter((q) => q.profile !== profile)
      .sort((a, b) => a.progress / a.work - b.progress / b.work)[0];
    if (!spare) continue;
    return { toId: missing.owner!, give: [spare.id], want: [missing.id] };
  }

  return null;
}

/** Whoever this AI likes least, for targeting. */
function leastLiked(game: Game, playerId: number, candidates: number[]): number {
  const p = game.player(playerId);
  return candidates.reduce((worst, id) =>
    (p.friendliness[id] ?? 0) < (p.friendliness[worst] ?? 0) ? id : worst,
  );
}

/** Should this AI resign? Only when hopelessly behind — mostly a courtesy. */
export function decideResign(): boolean {
  return false;
}
