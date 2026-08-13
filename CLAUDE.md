# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A clean-room TypeScript reimplementation of **Game of Work**, an office-politics board game
published by Hotpot Software around 2000 (Borland Delphi 5, 32-bit Windows) and no longer
available anywhere. Mechanics, geometry and colours were recovered by analysing the original
binary; its artwork, audio and prose are never distributed here.

`SPEC.md` is the authoritative mechanics document. `README.md` covers the recovery chain and
balance history. Read `SPEC.md` before changing game logic.

## Commands

```bash
npm run dev        # Vite dev server
npm test           # geometry, rules tables, engine invariants, high scores, 75 simulated games
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle
```

There is no test framework — `test/smoke.test.ts` is one script with a local `test()` helper
that tallies failures and exits non-zero. For a focused check or a balance experiment, drive
the engine directly rather than editing the suite:

```bash
npx tsx -e "
import {autoplay} from './src/autoplay.ts';
import {STOCK_TUNING} from './src/rules.ts';
STOCK_TUNING.costPerOwnedProjectPerRound = 0.9;   // mutable for exactly this purpose
const r = autoplay({length:'long', seed:42, seats:[...]}, 400);
console.log(r.turns, r.winner, r.crashed, r.finalStock);
"
```

`tsx` is required: `src/` uses extensionless bundler-style imports, which Node's
`--experimental-strip-types` rejects.

## Optional assets — the defining architectural choice

The repo ships **no** artwork, audio, card text or help text. `tools/extract-assets.py` pulls
all of it from a local copy of `gamework.exe` into `public/assets/`, which is **gitignored**:

```
public/assets/graphics/   190 images + manifest.txt, cursors/
public/assets/cards.json  the original Chance and Scruples decks
public/assets/help.json   the twelve How to Play topics
public/assets/sounds  ->  symlink to the original's sounds/ directory
```

Every consumer resolves availability once at boot and **degrades silently**:

- `assets.ts` reads `manifest.txt`; without it the board draws `icons.ts` inline SVG.
- `decks.ts` falls back to the newly-written decks in `cards.ts`.
- `help.ts` falls back to summaries written for this port.
- `sound.ts` probes per cue and stays quiet when a file is missing.

A fresh clone is fully playable. When adding a feature that uses original material, follow
this pattern — never make the game depend on assets being present.

## Architecture

`types.ts` state shapes · `rules.ts` all tunables · `board.ts` geometry and colours ·
`engine.ts` DOM-free state machine · `ai.ts` four personalities · `autoplay.ts` headless
driver · `ui.ts` renderer · `main.ts` modal flow · `decks.ts`/`originalCards.ts` deck
selection · `help.ts`/`highscores.ts` · `sound.ts`/`midi.ts`/`midiPlayer.ts` audio ·
`assets.ts`/`icons.ts` art.

### The engine is DOM-free, and that is load-bearing

`autoplay.ts` runs complete games in Node using `ai.ts` for every decision, which is how
balance gets **measured rather than guessed**. Every balance bug recorded in `rules.ts` was
found by simulation. Keep DOM references out of `engine.ts`.

### Modal-driven turn flow — the main hazard

The engine never blocks. A square needing a decision sets `state.modal` and returns; something
outside resolves it and calls back. There are **two** resolvers and both must handle every
modal kind:

- `main.ts` → `resolveModal()` — dialogs for humans, `ai.ts` for computers
- `autoplay.ts` → `resolveHeadless()` — always `ai.ts`

**Adding a `Modal` variant means updating both.** Miss one and games hang: the headless driver
throws on a convergence guard, the UI just stalls.

### Movement is a phase, not a jump

`roll()` sets `phase: 'moving'` and `pendingSteps`; it does **not** move or resolve. Callers
then either step it out (`stepMove()` per square, then `resolveLanding()`) or use
`finishMoveInstantly()` for headless play. The original animated movement and revealed the
result only once the token stopped.

Two consequences: crossing Home is simply arriving at square 0, so no modular arithmetic is
needed; and promotions earned mid-move queue into `pendingNotices` rather than opening a modal
while the token is still travelling. Drain them before `resolveLanding()`.

### `finishWork()` terminates the turn

Every path through a landing square must call it **exactly once**. It applies the per-turn work
step, rolls for shoddy, fires delayed karma, checks the stock bonus and returns the phase to
`idle`. Twice gives double work; never leaves the turn stuck. Squares that open a modal defer
the call to whichever resolver closes it.

`landedOnOther` exists because landing on a rival's project means **no work at all** on your
own that turn — a documented rule, not an optimisation.

### `rules.ts` is the entire balance surface

Two values are non-obvious and hard-won:

- `COMPLETION_BOSS_RATING` is deliberately low. Promotion fires only on passing Home and moves
  one rank max, so the climb needs several laps. Generous rewards saturate Boss Rating past the
  100 threshold early and the game becomes pure lap-counting.
- `STOCK_TUNING.costPerOwnedProjectPerRound` scales per **owned project**, never per player.
  Income is bounded by the fixed 15 project squares, so a headcount charge makes six-player
  tables crash far more often than two-player ones. This is an *added* mechanism: the original
  documents the price-zero ending but nothing recovered pushes the price down.

Current distribution across 75 simulated games: ~72 presidencies, ~3 crashes, 0 turn caps.
Re-run `npm test` after touching any of this; the suite prints the distribution.

### Board data is transcribed, not designed

`board.ts` holds `TMAINFORM` coordinates in the original 776×535 space. Adjacent squares share
a 1px border and squares 10/11 overlap by 2px, because the original placed `chanceImage2` at
top 226 where the 81px grid wants 228. **Do not tidy these** — a test asserts the tolerance.

`PROJECT_PROFILES` is **recovered, not approximated**: every `projectShape` carries an explicit
`Brush.Color`, and grouping by colour gives runs of **2/4/4/3/2**, not three per profile. So
set-collecting is deliberately asymmetric. Player colours, tile colours, the board background
and the stat-row geometry are all likewise recovered.

### CSS hazard: never set `position` on `.sq` or its descendants

`.sq` is absolutely positioned in the design space, and project tiles position their parts
inside it. A later rule setting `position: relative` on `.sq*` — or on a descendant selector
like `.sq-project > *` — outranks it and scatters the board. A test parses `style.css` and
fails on any such rule; it has caught this twice.

### Determinism

`rng.ts` is a seeded mulberry32 and the engine draws all randomness from it. Same seed plus
same config replays identically, and the suite depends on it. Never call `Math.random()` in
engine or AI code. (UI-only jitter, like picking a voice-clip variant, is fine.)

### `isOver()`

`engine.ts` uses `private isOver()` instead of comparing `state.phase === 'gameOver'` inline:
TypeScript narrows `phase` away across mutating helpers and rejects the direct comparison.

## Reverse-engineering notes

Hard-won lessons for anyone digging further into the binary:

- **The DFM is authoritative for geometry and colours, and unreliable for defaults and runtime
  behaviour.** Five bugs came from trusting a design-time property where the running program
  did something else — most memorably `Edit1..Edit6` carrying `Text='Player 1'..'Player 6'`
  while the game actually assigns Brad, Jen, George, Spot, Muriel, Ned. Seat avatars are fixed
  art, so a wrong name order visibly mismatches every portrait. Prefer a screenshot of the
  running game over a DFM property for anything the code can overwrite.
- **capstone** is not installed system-wide; use a venv (`python3 -m venv`, `pip install
  capstone`). The extractor treats it as optional.
- **capstone renders `push 0` with no `0x` prefix.** An immediate-detector keyed on that prefix
  silently discards every zero. This caused several dead ends. Parse with `int(op, 0)`.
- **Decoding x86 backwards from an arbitrary offset desynchronises.** Anchor on the byte just
  past a `call`, which is always an instruction boundary.
- **Ghidra headless** works and is the right tool for anything structural:
  ```bash
  JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
    /opt/homebrew/Cellar/ghidra/*/libexec/support/analyzeHeadless \
    /tmp/gproj gow -import gamework.exe -scriptPath <dir> -postScript DumpFuncs.java 0x413e10
  ```
  Known addresses: `0x402048` Chance card constructor, `0x413e10` Scruples answer constructor
  (18 params), `0x4137fc` card constructor, `0x413c14` the Scruples OK handler.
- **Chance effects are genuinely recovered** (all 30, confirmed three independent ways).
  **Scruples answer effects are not.** All 108 × 15 parameters are extracted and preserved in
  `cards.json` as `scruplesRawEffects`, but which slot means Boss Rating is unestablished, so
  `originalCards.ts` infers them. Do not apply those numbers under guessed labels.

## The clean-room boundary

Game mechanics are not copyrightable and were reimplemented from a spec. Numeric parameters,
coordinates and colours are facts about behaviour and are recovered deliberately. The
original's *expression* is never committed.

- **Never** translate original machine code into TypeScript.
- **Never** commit anything under `public/assets/` — art, audio, card text or help text. The
  extractor tool is ours and is committed; its output is not.
- **Never** paste original prose into source. `cards.ts`, `names.ts` and `help.ts` are newly
  written. The original's deck sizes (30 chance, 36 scruples) informed count and shape only,
  and its numbered card art is paired only with its own text, never with ours.
