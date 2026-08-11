import assert from 'node:assert/strict';
import { autoplay } from '../src/autoplay.ts';
import { PROJECT_PROFILES, PROJECT_COUNT, SQUARES } from '../src/board.ts';
import { Game } from '../src/engine.ts';
import * as R from '../src/rules.ts';
import type { GameLength, NewGameConfig, Personality } from '../src/types.ts';

let failures = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${(e as Error).message.split('\n')[0]}`);
  }
}

const PERSONALITIES: Personality[] = ['evil', 'ambitious', 'goodytwoshoes', 'average'];

function config(length: GameLength, n: number, seed: number): NewGameConfig {
  return {
    length,
    seed,
    seats: Array.from({ length: 6 }, (_, i) => ({
      kind: i < n ? ('computer' as const) : ('off' as const),
      name: `P${i + 1}`,
      personality: PERSONALITIES[i % 4],
    })),
  };
}

console.log('\nboard');

test('ring is 26 squares', () => {
  assert.equal(SQUARES.length, R.RING);
  assert.equal(SQUARES.length, 26);
});

test('15 project squares, one profile each', () => {
  assert.equal(PROJECT_COUNT, 15);
  assert.equal(PROJECT_PROFILES.length, 15);
});

test('each profile appears exactly 3 times', () => {
  for (const profile of [1, 2, 3, 4, 5]) {
    const n = PROJECT_PROFILES.filter((p) => p === profile).length;
    assert.equal(n, 3, `profile ${profile} appears ${n} times`);
  }
});

test('squares 1 and 2 are profile 1 (confirmed from original rules text)', () => {
  assert.equal(PROJECT_PROFILES[0], 1);
  assert.equal(PROJECT_PROFILES[1], 1);
});

test('the four corners sit at the corner coordinates', () => {
  const corners = SQUARES.filter((s) => s.size === 140).map((s) => s.kind);
  assert.deepEqual(corners.sort(), ['businessTrip', 'home', 'meeting', 'officeParty']);
});

test('geometry stays inside the original 776x535 design space', () => {
  for (const s of SQUARES) {
    assert.ok(s.left >= 0 && s.left + s.size <= 776, `square ${s.index} overflows horizontally`);
    assert.ok(s.top >= 0 && s.top + s.size <= 535, `square ${s.index} overflows vertically`);
  }
});

test('no two squares overlap by more than a shared border', () => {
  // Adjacent squares in the original share a 1px border: Home spans x 8..148 and the next
  // square starts at x 147. Squares 10 and 11 share 2px, because the original placed
  // chanceImage2 at top 226 where the 81px grid wants 228 — an off-by-one in the 2000
  // build. Both are transcribed faithfully rather than silently corrected.
  const SHARED_BORDER = 2;
  for (let i = 0; i < SQUARES.length; i++) {
    for (let j = i + 1; j < SQUARES.length; j++) {
      const a = SQUARES[i];
      const b = SQUARES[j];
      const dx = Math.min(a.left + a.size, b.left + b.size) - Math.max(a.left, b.left);
      const dy = Math.min(a.top + a.size, b.top + b.size) - Math.max(a.top, b.top);
      if (dx <= 0 || dy <= 0) continue; // disjoint on at least one axis
      assert.ok(
        dx <= SHARED_BORDER || dy <= SHARED_BORDER,
        `squares ${i} and ${j} overlap by ${dx}x${dy}px`,
      );
    }
  }
});

console.log('\nrules tables');

test('rank ladder and power monger table line up', () => {
  assert.equal(R.POWER_MONGER_ACTIONS.length, 7);
  assert.equal(R.RANK_FLOOR.length, 7);
  assert.equal(R.POWER_MONGER_ACTIONS[0], 0, 'Mailroom gets no actions');
  assert.equal(R.POWER_MONGER_ACTIONS[1], 1);
  assert.equal(R.POWER_MONGER_ACTIONS[2], 1);
  assert.equal(R.POWER_MONGER_ACTIONS[3], 2);
  assert.equal(R.POWER_MONGER_ACTIONS[4], 2);
  assert.equal(R.POWER_MONGER_ACTIONS[5], 3, 'Vice President gets three');
});

test('game length start ranks descend short > medium > long', () => {
  assert.ok(R.LENGTH_START.short.rank > R.LENGTH_START.medium.rank);
  assert.ok(R.LENGTH_START.medium.rank > R.LENGTH_START.long.rank);
  assert.ok(R.LENGTH_START.short.bossRating > R.LENGTH_START.medium.bossRating);
  assert.equal(R.LENGTH_START.long.bossRating, 0, 'Long games start with no Boss Rating');
});

test('higher profiles cost more work and pay more', () => {
  for (let p = 1; p < 5; p++) {
    const a = p as 1 | 2 | 3 | 4;
    const b = (p + 1) as 2 | 3 | 4 | 5;
    assert.ok(R.PROJECT_WORK[b] > R.PROJECT_WORK[a]);
    assert.ok(R.COMPLETION_BOSS_RATING[b] > R.COMPLETION_BOSS_RATING[a]);
    assert.ok(R.COMPLETION_STOCK[b] > R.COMPLETION_STOCK[a]);
  }
});

test('meeting with no projects is the worst outcome', () => {
  const bands = Object.values(R.MEETING_BANDS);
  assert.equal(Math.min(...bands), R.MEETING_BANDS.none);
});

test('rankForBossRating maps thresholds correctly', () => {
  assert.equal(R.rankForBossRating(-10), 0, 'negative rating is Mailroom');
  assert.equal(R.rankForBossRating(0), 1);
  assert.equal(R.rankForBossRating(25), 2);
  assert.equal(R.rankForBossRating(100), 6, 'threshold reaches President');
});

test('stepRank never moves more than one rank', () => {
  assert.equal(R.stepRank(1, 6), 2);
  assert.equal(R.stepRank(5, 0), 4);
  assert.equal(R.stepRank(3, 3), 3);
});

console.log('\nengine invariants');

test('a new game starts everyone on Home with nothing owned', () => {
  const g = new Game(config('medium', 4, 12345));
  assert.equal(g.state.players.length, 4);
  for (const p of g.state.players) {
    assert.equal(p.square, 0);
    assert.equal(g.projectsOf(p.id).length, 0);
    assert.equal(g.stress(p.id), 0);
    assert.equal(p.rank, R.LENGTH_START.medium.rank);
  }
  assert.equal(g.state.projects.length, 15);
  assert.equal(g.state.stock, R.STOCK_START);
});

test('the same seed replays identically', () => {
  const a = autoplay(config('short', 4, 777), 200);
  const b = autoplay(config('short', 4, 777), 200);
  assert.equal(a.turns, b.turns);
  assert.equal(a.winner, b.winner);
  assert.equal(a.finalStock, b.finalStock);
  assert.deepEqual(
    a.players.map((p) => p.bossRating),
    b.players.map((p) => p.bossRating),
  );
});

test('different seeds diverge', () => {
  const a = autoplay(config('short', 4, 1), 200);
  const b = autoplay(config('short', 4, 2), 200);
  const same = a.turns === b.turns && a.finalStock === b.finalStock;
  assert.ok(!same, 'two different seeds produced identical games');
});

test('save/load round-trips', () => {
  const g = new Game(config('medium', 3, 424242));
  g.roll();
  const json = g.serialize();
  const h = Game.deserialize(json);
  assert.equal(h.state.turn, g.state.turn);
  assert.equal(h.state.current, g.state.current);
  assert.equal(h.state.stock, g.state.stock);
  assert.deepEqual(
    h.state.players.map((p) => p.square),
    g.state.players.map((p) => p.square),
  );
});

console.log('\nfull-game simulation');

const lengths: GameLength[] = ['short', 'medium', 'long'];
const results: Array<{ length: GameLength; seed: number; r: ReturnType<typeof autoplay> }> = [];

for (const length of lengths) {
  for (let seed = 1; seed <= 25; seed++) {
    test(`${length} game, ${2 + (seed % 5)} players, seed ${seed} completes`, () => {
      const n = 2 + (seed % 5);
      const r = autoplay(config(length, n, seed * 1013), 400);
      results.push({ length, seed, r });

      // Every game must terminate one way or another.
      assert.ok(r.turns <= 400, 'ran past the turn cap');

      // Invariants that must hold no matter how the game ended.
      assert.ok(r.finalStock >= 0 && r.finalStock <= R.STOCK_MAX, `stock out of range: ${r.finalStock}`);
      for (const p of r.players) {
        assert.ok(p.rank >= 0 && p.rank <= 6, `${p.name} has invalid rank ${p.rank}`);
      }
      if (r.crashed) assert.equal(r.finalStock, 0, 'crashed without stock at zero');
      if (r.winner !== null) {
        assert.equal(r.players[r.winner].rank, 6, 'winner is not President');
        assert.ok(
          r.players[r.winner].bossRating >= R.PRESIDENT_THRESHOLD,
          'winner below the presidency threshold',
        );
      }
      // Exactly one terminal condition, or the turn cap.
      const terminal = (r.winner !== null ? 1 : 0) + (r.crashed ? 1 : 0);
      assert.ok(terminal <= 1, 'both won and crashed');
    });
  }
}

console.log('\nproject ownership consistency');

test('projects never end up owned by a nonexistent player', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const g = new Game(config('medium', 4, seed * 31));
    for (let i = 0; i < 300 && g.state.phase !== 'gameOver'; i++) {
      const m = g.state.modal;
      if (m) {
        // Force-resolve without AI to keep this test focused on ownership.
        if (m.kind === 'takeProject') {
          g.takeProject(m.projectId, m.playerId);
          g.state.modal = null;
          g.finishWork({ landedOnOther: false, ownProject: m.projectId });
        } else if (m.kind === 'gameOver') {
          break;
        } else {
          g.state.modal = null;
          if (g.state.phase === 'resolving') g.finishWork({ landedOnOther: false, ownProject: null });
        }
        continue;
      }
      if (g.turnComplete()) {
        g.endTurn();
        continue;
      }
      g.roll();
      for (const proj of g.state.projects) {
        assert.ok(
          proj.owner === null || (proj.owner >= 0 && proj.owner < g.state.players.length),
          `project ${proj.id} owned by invalid player ${proj.owner}`,
        );
        assert.ok(proj.progress >= 0 && proj.progress <= proj.work, `project ${proj.id} progress out of range`);
      }
    }
  }
});

// ------------------------------------------------------------------ summary

const wins = results.filter((x) => x.r.winner !== null).length;
const crashes = results.filter((x) => x.r.crashed).length;
const capped = results.filter((x) => x.r.winner === null && !x.r.crashed).length;
const avgTurns = Math.round(results.reduce((n, x) => n + x.r.turns, 0) / results.length);

console.log('\n--- outcome distribution over %d simulated games ---', results.length);
console.log(`  presidency reached : ${wins}`);
console.log(`  company crashed    : ${crashes}`);
console.log(`  hit turn cap       : ${capped}`);
console.log(`  average turns      : ${avgTurns}`);

for (const length of lengths) {
  const subset = results.filter((x) => x.length === length);
  const t = Math.round(subset.reduce((n, x) => n + x.r.turns, 0) / subset.length);
  const w = subset.filter((x) => x.r.winner !== null).length;
  console.log(`  ${length.padEnd(7)} avg ${String(t).padStart(3)} turns, ${w}/${subset.length} reached President`);
}

// Personality win-rate tally, to check no personality is dead weight.
const byPersonality = new Map<string, { games: number; wins: number; br: number }>();
for (const { r } of results) {
  r.players.forEach((p, i) => {
    const key = p.personality ?? 'human';
    const rec = byPersonality.get(key) ?? { games: 0, wins: 0, br: 0 };
    rec.games++;
    rec.br += p.bossRating;
    if (r.winner === i) rec.wins++;
    byPersonality.set(key, rec);
  });
}
console.log('\n--- personality performance ---');
for (const [k, v] of [...byPersonality].sort((a, b) => b[1].wins - a[1].wins)) {
  console.log(
    `  ${k.padEnd(14)} ${String(v.wins).padStart(3)} wins / ${String(v.games).padStart(3)} seats · avg Boss Rating ${Math.round(v.br / v.games)}`,
  );
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
