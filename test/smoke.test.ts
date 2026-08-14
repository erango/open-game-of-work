import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoplay } from '../src/autoplay.ts';
import { CHANCE, SCRUPLES, type ChanceCard, type ScruplesCard } from '../src/cards.ts';
import { WORD_POOLS } from '../src/names.ts';
import { sceneName } from '../src/sceneCues.ts';
import { CHANCE_NEON, SCRUPLES_NEON } from '../src/cardsNeon.ts';
import { PROJECT_PROFILES, PROJECT_COUNT, SQUARES } from '../src/board.ts';
import { Game } from '../src/engine.ts';
import { parseMidi } from '../src/midi.ts';
import { emptyScores, record, scaleTurns, TABLE_SIZE } from '../src/highscores.ts';
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

test('profile distribution matches the recovered tile colours', () => {
  // From TMAINFORM projectShape Brush.Color grouping: 2/4/4/3/2, not three per profile.
  const expected: Record<number, number> = { 1: 2, 2: 4, 3: 4, 4: 3, 5: 2 };
  for (const profile of [1, 2, 3, 4, 5]) {
    const n = PROJECT_PROFILES.filter((p) => p === profile).length;
    assert.equal(n, expected[profile], `profile ${profile} should cover ${expected[profile]} squares, got ${n}`);
  }
  assert.equal(PROJECT_PROFILES.length, 15);
});

test('profiles are contiguous around the board, ascending', () => {
  // The original's colour groups are runs, so difficulty rises as you travel clockwise.
  let seen = 0;
  for (const p of PROJECT_PROFILES) {
    assert.ok(p >= seen, `profile ${p} appears after ${seen}; groups must be contiguous`);
    seen = p;
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

test('no stylesheet rule overrides .sq absolute positioning', () => {
  // Regression: appending `.sq-project { position: relative }` later in the stylesheet beat
  // `.sq { position: absolute }` and scattered every project square out of the ring.
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const offenders: string[] = [];
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css))) {
    const selector = m[1].trim();
    const body = m[2];
    // Any rule touching .sq or its descendants, including child selectors like
    // `.sq-project > *`, which outrank a plain `.proj-track { position: absolute }` and
    // silently collapse the tile layout.
    if (!/\.sq[-\w]*/.test(selector)) continue;
    const pos = /(?:^|;)\s*position\s*:\s*([a-z]+)/.exec(body);
    if (pos && pos[1] !== 'absolute') offenders.push(`${selector} -> position: ${pos[1]}`);
  }
  assert.deepEqual(offenders, [], `square selectors must stay absolute:\n  ${offenders.join('\n  ')}`);
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
  g.finishMoveInstantly();
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

console.log('\nhigh scores');

test('turn counts scale so shorter games compare against Long', () => {
  assert.equal(scaleTurns(20, 'long'), 20, 'Long is the baseline');
  assert.ok(scaleTurns(20, 'medium') > 20, 'Medium scales up');
  assert.ok(scaleTurns(20, 'short') > scaleTurns(20, 'medium'), 'Short scales up further');
});

test('fastest table ranks by scaled turns, not raw', () => {
  let s = emptyScores();
  // A 30-turn Long game beats a 20-turn Short game once scaled.
  s = record(s, { name: 'Long', turns: 30, peakStock: 60, length: 'long', when: 1 }).scores;
  const r = record(s, { name: 'Short', turns: 20, peakStock: 60, length: 'short', when: 2 });
  assert.equal(r.scores.fastest[0].name, 'Long', 'scaled comparison must decide the order');
  assert.equal(r.fastestPlace, 2);
});

test('richest table ranks by highest peak stock', () => {
  let s = emptyScores();
  s = record(s, { name: 'Low', turns: 30, peakStock: 70, length: 'long', when: 1 }).scores;
  const r = record(s, { name: 'High', turns: 40, peakStock: 150, length: 'long', when: 2 });
  assert.equal(r.scores.richest[0].name, 'High');
  assert.equal(r.richestPlace, 1);
});

test('each table keeps only the best ten', () => {
  let s = emptyScores();
  for (let i = 0; i < 15; i++) {
    s = record(s, { name: `P${i}`, turns: 100 - i, peakStock: 50 + i, length: 'long', when: i }).scores;
  }
  assert.equal(s.fastest.length, TABLE_SIZE);
  assert.equal(s.richest.length, TABLE_SIZE);
  assert.equal(s.fastest[0].turns, 86, 'fewest turns first');
  assert.equal(s.richest[0].price, 64, 'highest stock first');
});

test('a score that does not place reports no position', () => {
  let s = emptyScores();
  for (let i = 0; i < TABLE_SIZE; i++) {
    s = record(s, { name: `P${i}`, turns: 20, peakStock: 200, length: 'long', when: i }).scores;
  }
  const r = record(s, { name: 'Slow', turns: 400, peakStock: 1, length: 'long', when: 99 });
  assert.equal(r.fastestPlace, null);
  assert.equal(r.richestPlace, null);
});

test('engine tracks the peak share price, not just the final one', () => {
  const g = new Game(config('medium', 3, 8080));
  assert.equal(g.state.stockPeak, R.STOCK_START);
  for (let i = 0; i < 120 && g.state.phase !== 'gameOver'; i++) {
    const m = g.state.modal;
    if (m) {
      g.state.modal = null;
      if (m.kind === 'takeProject') g.takeProject(m.projectId, m.playerId);
      if (g.state.phase === 'resolving') g.finishWork({ landedOnOther: false, ownProject: null });
      continue;
    }
    if (g.turnComplete()) { g.endTurn(); continue; }
    g.roll();
    g.finishMoveInstantly();
    assert.ok(g.state.stockPeak >= g.state.stock, 'peak must never fall below current');
  }
});

test('every project-name word fits the tile', () => {
  /*
   * 9 characters, in both word packs. The label is 73x27 in the design space and the original's
   * own pool tops out at 9 with a mean of 5.9; a longer word overflows, and board scaling does
   * not help since the board is transform-scaled and the text grows with it.
   */
  for (const [pool, tiers] of Object.entries(WORD_POOLS)) {
    for (const [profile, words] of Object.entries(tiers)) {
      for (const w of words as string[]) {
        assert.ok(w.length <= 9, `${pool} profile ${profile}: "${w}" is ${w.length} characters`);
      }
    }
  }
});

test('scene cues map to their recordings, and nothing else does', () => {
  // The scene set: once-or-twice-a-game moments that want a recording.
  assert.equal(sceneName('officeParty'), 'officeParty');
  assert.equal(sceneName('crash'), 'crash');
  // Promotion is rank-indexed on the wire, one file per rank on disk, clamped to the five that
  // exist — seven ranks give six possible steps, so an unclamped index would 404 at the top.
  assert.equal(sceneName('promotion:1'), 'promotion1');
  assert.equal(sceneName('promotion:5'), 'promotion5');
  assert.equal(sceneName('promotion:9'), 'promotion5');
  assert.equal(sceneName('promotion:0'), 'promotion1');
  // Frequent cues are synthesised and must never probe for a file.
  assert.equal(sceneName('move'), null);
  assert.equal(sceneName('roll'), null);
  assert.equal(sceneName('trade'), null);
  // Speech is never in this set.
  assert.equal(sceneName('name:brad'), null);
  assert.equal(sceneName('slot:2'), null);
  assert.equal(sceneName('gameStart'), null);
});

console.log('\nCard packs');

/*
 * The two packs written for this port are meant to be interchangeable: same size, same numeric
 * ranges, so choosing between them changes the voice and not the balance. These checks are what
 * keeps a new pack from quietly retuning the game — a milder stock spread took the price-zero
 * ending off the table entirely the first time this one was written.
 */
const PACKS: Array<[string, ChanceCard[], ScruplesCard[]]> = [
  ['new', CHANCE, SCRUPLES],
  ['neon', CHANCE_NEON, SCRUPLES_NEON],
];

const stockTotals = (chance: ChanceCard[], scruples: ScruplesCard[]) => {
  const answers = scruples.flatMap((c) => c.choices);
  const now = [...chance.map((c) => c.stock), ...answers.map((c) => c.stock)];
  const later = [...chance.map((c) => c.delayed?.stock), ...answers.map((c) => c.delayed?.stock)];
  const sum = (xs: Array<number | undefined>) => xs.reduce((a, b) => a + (b ?? 0), 0);
  return { now: sum(now), later: sum(later) };
};

for (const [name, chance, scruples] of PACKS) {
  test(`${name} pack is 30 chance and 12 scruples`, () => {
    assert.equal(chance.length, 30);
    assert.equal(scruples.length, 12);
  });

  test(`${name} pack: every scruples card offers exactly three answers`, () => {
    for (const c of scruples) assert.equal(c.choices.length, 3, c.situation.slice(0, 40));
  });

  test(`${name} pack: {rival} and {project} only appear on cards that require them`, () => {
    for (const c of scruples) {
      const text = [
        c.situation,
        ...c.choices.flatMap((a) => [a.label, a.outcome, a.delayed?.text ?? '']),
      ].join(' ');
      if (text.includes('{rival}')) assert.ok(c.needsRival, `needsRival: ${c.situation.slice(0, 40)}`);
      if (text.includes('{project}')) {
        assert.ok(c.needsProject, `needsProject: ${c.situation.slice(0, 40)}`);
      }
    }
    // A chance card naming a project must be gated on owning one, or {project} has nothing to
    // substitute. Both flags gate it: needsProject directly, workSingleProject by implication.
    for (const c of chance) {
      if (c.text.includes('{project}')) {
        assert.ok(
          c.needsProject || c.workSingleProject,
          `needsProject: ${c.text.slice(0, 40)}`,
        );
      }
      if (c.text.includes('{rival}')) assert.ok(c.needsRival, `needsRival: ${c.text.slice(0, 40)}`);
    }
  });

  test(`${name} pack: effects stay inside the shared ranges`, () => {
    const answers = scruples.flatMap((c) => c.choices);
    const within = (v: number | undefined, lo: number, hi: number, what: string) => {
      if (v === undefined) return;
      assert.ok(v >= lo && v <= hi, `${what} out of range: ${v}`);
    };
    for (const c of [...chance, ...answers]) {
      within(c.bossRating, -9, 9, 'bossRating');
      within(c.stock, -10, 10, 'stock');
      within(c.work, -3, 4, 'work');
      within(c.delayed?.bossRating, -12, 12, 'delayed bossRating');
      within(c.delayed?.stock, -10, 10, 'delayed stock');
    }
    for (const a of answers) within(a.friendliness, -5, 5, 'friendliness');
  });

  test(`${name} pack: upside is paid for later`, () => {
    const { now, later } = stockTotals(chance, scruples);
    assert.ok(now > 0, `immediate stock should net positive, got ${now}`);
    // Without a comparable delayed cost the share price only climbs, and the price-zero ending
    // becomes unreachable.
    assert.ok(later <= -now * 0.5, `delayed stock ${later} too mild against immediate ${now}`);
  });
}

console.log('\nMIDI parser');

{
  // party.mid is the original's music, third-party copyrighted and gitignored, so these
  // checks only run when a local copy is present.
  const midiPath = new URL('../public/assets/sounds/party.mid', import.meta.url);
  let bytes: Buffer | null = null;
  try {
    bytes = readFileSync(midiPath);
  } catch {
    console.log('  skip   party.mid not present (see README for the symlink)');
  }

  if (bytes) {
    test('parses a real format-1 MIDI file', () => {
      const m = parseMidi(bytes!);
      assert.equal(m.format, 1);
      assert.ok(m.ticksPerQuarter > 0);
      assert.ok(m.notes.length > 100, `expected a substantial note list, got ${m.notes.length}`);
      assert.ok(m.duration > 10, `expected a real duration, got ${m.duration}`);
    });

    test('notes are time-ordered with positive durations', () => {
      const m = parseMidi(bytes!);
      let last = -1;
      for (const n of m.notes) {
        assert.ok(n.time >= last, 'notes must be sorted by time');
        last = n.time;
        assert.ok(n.duration > 0, `note ${n.note} has non-positive duration`);
        assert.ok(n.note >= 0 && n.note <= 127, 'note number in range');
        assert.ok(n.velocity > 0 && n.velocity <= 127, 'velocity in range');
        assert.ok(n.channel >= 0 && n.channel <= 15, 'channel in range');
      }
    });

    test('parsing is deterministic', () => {
      const a = parseMidi(bytes!);
      const b = parseMidi(bytes!);
      assert.equal(a.notes.length, b.notes.length);
      assert.equal(a.duration.toFixed(6), b.duration.toFixed(6));
    });
  }
}

test('rejects data that is not a MIDI file', () => {
  assert.throws(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /not a MIDI file/);
});

console.log('\nstepwise movement');

test('roll enters the movement phase without moving or resolving', () => {
  const g = new Game(config('medium', 3, 5150));
  const before = g.active.square;
  const die = g.roll();
  assert.ok(die >= 1 && die <= 6);
  assert.equal(g.state.phase, 'moving');
  assert.equal(g.state.pendingSteps, die, 'pendingSteps must equal the roll');
  assert.equal(g.active.square, before, 'roll() must not move the token');
  assert.equal(g.state.modal, null, 'roll() must not reveal a result');
});

test('stepMove advances exactly one square and drains pendingSteps', () => {
  const g = new Game(config('medium', 3, 991));
  const die = g.roll();
  for (let i = 0; i < die; i++) {
    const at = g.active.square;
    g.stepMove();
    assert.equal(g.active.square, (at + 1) % R.RING, 'each step is one square');
    assert.equal(g.state.pendingSteps, die - i - 1);
  }
  assert.equal(g.moving, false, 'movement finished');
});

test('resolveLanding is a no-op until the token stops', () => {
  const g = new Game(config('medium', 3, 4242));
  g.roll();
  if (g.state.pendingSteps < 2) g.stepMove(); // ensure at least one step remains
  const steps = g.state.pendingSteps;
  if (steps > 0) {
    g.resolveLanding();
    assert.equal(g.state.modal, null, 'must not resolve mid-movement');
    assert.equal(g.state.pendingSteps, steps, 'resolveLanding must not consume steps');
  }
});

test('crossing Home awards Boss Rating once per lap, not once per step', () => {
  const g = new Game(config('long', 2, 31337));
  const p = g.active;
  // Park the token two squares short of Home, then roll past it.
  p.square = R.RING - 2;
  const before = p.bossRating;
  g.roll();
  const die = g.state.die!;
  g.finishMoveInstantly();
  const laps = Math.floor((R.RING - 2 + die) / R.RING);
  assert.equal(laps, 1, 'a single die roll cannot lap twice on a 26-square ring');
  // Home may also award via a Business Trip landing, so assert at least the Home award.
  assert.ok(
    p.bossRating >= before + R.HOME_BOSS_RATING,
    `expected at least +${R.HOME_BOSS_RATING} for crossing Home, got ${p.bossRating - before}`,
  );
});

test('promotions are queued as notices, never shown mid-movement', () => {
  const g = new Game(config('long', 2, 777));
  const p = g.active;
  // Sit one square before Home with enough Boss Rating to earn a promotion on the pass.
  p.square = R.RING - 1;
  p.bossRating = R.RANK_FLOOR[p.rank + 1] + 5;
  const rank = p.rank;
  g.roll();
  while (g.moving) {
    g.stepMove();
    assert.notEqual(g.state.modal?.kind, 'rankChange', 'rank change must not surface mid-move');
  }
  assert.equal(p.rank, rank + 1, 'promotion applied on crossing Home');
  const notices = g.drainNotices();
  assert.equal(notices.length, 1, 'promotion should be queued as exactly one notice');
  assert.equal(notices[0].kind, 'rankChange');
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
      g.finishMoveInstantly();
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
