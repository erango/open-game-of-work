# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A clean-room TypeScript reimplementation of **Game of Work**, an office-politics board game
published by Hotpot Software around 2000 (Borland Delphi 5, 32-bit Windows) and no longer
available anywhere. Mechanics were recovered by static analysis of the original binary.

`SPEC.md` is the authoritative mechanics document — the reverse-engineering write-up with the
board map, every subsystem, and §14 listing what could **not** be recovered. Read it before
changing game logic. `README.md` documents the recovery chain and the balance history.

## Commands

```bash
npm run dev        # Vite dev server
npm test           # full suite: geometry, rules tables, engine invariants, 75 simulated games
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle
```

There is no test framework — `test/smoke.test.ts` is a single script with a local `test()`
helper that tallies failures and exits non-zero. To run one focused check or a balance
experiment, drive the engine directly instead of editing the suite:

```bash
npx tsx -e "
import {autoplay} from './src/autoplay.ts';
import {STOCK_TUNING} from './src/rules.ts';
STOCK_TUNING.costPerOwnedProjectPerRound = 0.8;   // mutable for exactly this purpose
const r = autoplay({length:'long', seed:42, seats:[...]}, 400);
console.log(r.turns, r.winner, r.crashed, r.finalStock);
"
```

Note `tsx` is required for tests: `src/` uses extensionless bundler-style imports, which
Node's `--experimental-strip-types` rejects.

## Architecture

### The engine is DOM-free, and that is load-bearing

`engine.ts` has no browser dependency. `autoplay.ts` runs complete games in Node using
`ai.ts` for every decision. This is how balance gets **measured rather than guessed** — the
two balance bugs recorded in `rules.ts` comments were both found by simulation, not by
reading code. Keep the engine free of DOM references.

### Modal-driven turn flow — the main hazard

The engine never blocks. When a square needs a decision it sets `state.modal` and returns.
Something outside must resolve it and then call back into the engine. There are **two**
resolvers, and both must handle every modal kind:

- `main.ts` → `resolveModal()` — shows a dialog for humans, defers to `ai.ts` for computers
- `autoplay.ts` → `resolveHeadless()` — always `ai.ts`

**Adding a `Modal` variant in `types.ts` means updating both.** Miss one and games hang:
the headless driver has a convergence guard that throws, but the UI just stalls.

### `finishWork()` terminates the turn

Every path through a landing square must call `finishWork()` exactly once. It applies the
per-turn work step to the active player's projects, rolls for shoddy, fires delayed karma,
checks the stock bonus, and returns the phase to `idle`. Call it twice and a player gets
double work; skip it and the turn never completes. Squares that open a modal defer the call
to whichever resolver closes that modal.

The `landedOnOther` flag exists because landing on another player's project means **no work
at all** on your own that turn — a documented rule, not an optimisation.

### `rules.ts` is the entire balance surface

Every tunable number lives there with a comment explaining its value. The original's numeric
tables are in compiled code and were not recovered, so these are calibrated, not faithful.
Two are non-obvious and were hard-won:

- `COMPLETION_BOSS_RATING` is deliberately low. Promotion only fires on passing Home and
  moves one rank max, so Entry Level → President needs five laps. Generous rewards make
  Boss Rating saturate past the 100 threshold in two laps and the game becomes pure
  lap-counting.
- `STOCK_TUNING.costPerOwnedProjectPerRound` scales per **owned project**, never per player.
  Income is bounded by the fixed 15 project squares, so a headcount charge makes six-player
  tables crash far more than two-player ones. This is an *added* mechanism — the original
  documents the price-zero ending but nothing in the recovered rules pushes the price down.

### Board geometry is transcribed, not designed

`board.ts` `LAYOUT` holds the original `TMAINFORM` component coordinates in its 776×535
design space. Adjacent squares share a 1px border, and squares 10/11 overlap by 2px because
the original placed `chanceImage2` at top 226 where the 81px grid wants 228. **Do not tidy
these** — the test asserts a 2px tolerance and documents why. `ui.ts` renders in the design
space and CSS-scales the whole board to fit.

`PROJECT_PROFILES` is a documented approximation (SPEC.md §14): squares 1 and 2 are
confirmed profile 1, and 15 squares over 5 profiles implies 3 each, but the true mapping is
in untranslated code. It is isolated as one editable table.

### Determinism

`rng.ts` is a seeded mulberry32 and the engine draws all randomness from it. Same seed plus
same config replays identically — the test suite depends on this. Never call `Math.random()`
in engine or AI code.

### `isOver()`

`engine.ts` uses `private isOver()` rather than comparing `state.phase === 'gameOver'`
inline. TypeScript narrows `phase` away across mutating helper calls and rejects the direct
comparison; the helper widens it. Keep using it.

## The clean-room boundary

This is the project's central constraint. Game mechanics are not copyrightable and were
reimplemented from a spec; the original's expression was not copied. When extending:

- **Never** translate original machine code into TypeScript.
- **Never** commit the original's assets — its 96 bitmaps, 10 cursors, or ~95 WAV files.
  The port ships no art or audio and must stay distributable.
- **Never** paste original text. All Chance cards, Scruples dilemmas, and project-name word
  pools in `cards.ts` / `names.ts` are newly written. The original's deck sizes (30 chance,
  36 scruples) informed count and shape only.

Board coordinates are the deliberate exception: a layout's geometry is fact rather than
creative expression, and it makes the port recognisable.
