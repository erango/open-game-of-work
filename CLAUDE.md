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
npm run check:contrast  # WCAG AA audit of the running UI in real Chrome (see below)

npm run art:manifest  # build the art job list  -> scripts/art-manifest.json
npm run art:gen       # drive perchance in real Chrome -> art/_raw/
npm run art:cutout    # cut/resize/place -> public/assets/graphics-gen/
```

The art pipeline is documented in `scripts/README-art-pipeline.md`; all three steps are
resumable and skip existing outputs. `ART_STYLE` picks the house style — `neon` (default,
matching the reskin) or `flat`. Raw output is per style under `art/_raw/<style>/`, but both
styles write to the **same** finished paths, so replacing an installed set needs
`FORCE=1 npm run art:cutout`.

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
- `decks.ts` falls back to the newly-written decks in `cards.ts` / `cardsNeon.ts`.
- `help.ts` falls back to summaries written for this port.
- `sound.ts` probes per cue and stays quiet when a file is missing.

A fresh clone is fully playable. When adding a feature that uses original material, follow
this pattern — never make the game depend on assets being present.

### There are three artwork sets, not two

`assets.ts` has a `GraphicsMode` of `original | generated | modern`, and `installedSets()`
lists whichever image sets are actually on disk:

```
public/assets/graphics/      extracted from the original    (never committable)
public/assets/graphics-gen/  produced by the art pipeline   (your own work)
```

The generated set has a **separate root deliberately**. Pointing the pipeline at the same
directory made its resume check see the extracted files and skip every job, and it would have
overwritten them on the way through. Each set carries its own `manifest.txt`; `art:cutout`
rewrites only the generated one.

## Architecture

`types.ts` state shapes · `rules.ts` all tunables · `board.ts` geometry and colours ·
`engine.ts` DOM-free state machine · `ai.ts` four personalities · `autoplay.ts` headless
driver · `ui.ts` renderer · `main.ts` modal flow · `decks.ts`/`originalCards.ts` deck
selection · `help.ts`/`highscores.ts` · `sound.ts`/`midi.ts`/`midiPlayer.ts` audio ·
`assets.ts`/`icons.ts` art. Card text lives in `cards.ts` and `cardsNeon.ts`.

### Three card packs, interchangeable by design

`DeckMode` is `new | neon | original | both`. `cards.ts` and `cardsNeon.ts` are both ours and
deliberately identical in size (30 chance, 12 scruples) and numeric range, so the choice is one
of voice, not balance. The suite asserts that: size, three answers per card, `{rival}`/`{project}`
only on cards gated with `needsRival`/`needsProject`, and magnitudes inside the shared bounds.

**A pack can retune the game without touching `rules.ts`.** The neon pack's first draft netted
+35 immediate stock against only -14 delayed, where the existing pack runs +25 against -25. The
share price then only climbed and the price-zero ending became unreachable — 40 presidencies and
zero crashes over 40 games. Compare a new pack against the existing one with `autoplay` before
believing it is neutral.

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

### `style.css` is a token system with two palettes

`:root` defines the whole surface as custom properties; `:root[data-palette="neon"]` redefines
*only* the colour tokens. `ui.ts` swaps the `data-palette` attribute and `main.ts` applies the
stored choice at boot. Rules for touching it:

- **No literal hex below the two palette blocks.** Everything downstream reads tokens, so a
  hard-coded colour silently ignores the palette switch. `grep -E '#[0-9a-fA-F]{3,8}\b'` past
  the palette blocks should return nothing.
- **Board text scales with the board**, so board font sizes are `calc(Npx * var(--text-k, 1))`
  rather than raw pixels — the coefficient shrinks type at large scales.
- The neon palette keeps each profile's and player's **hue** and raises chroma. It is a reskin,
  not a recolour: swapping hues would break the recovered identity of a tile.
- `design/handoff/README.md` is the redesign specification, with per-component specs, state
  matrices and the token list. Read it before restyling anything.

Two things that look like bugs and are not: owned project names are dark ink rather than the
owner's colour (the pale player colours measure 2–3:1 on pastel tiles, and the bar already
carries ownership), and project names wrap to two lines because `names.ts` generates mid-teens
names that a 73×27 label cannot hold on one.

### Contrast is checked against the running UI, not by eye

`npm run check:contrast` drives the real interface in real Chrome, walks every rendered text
node, composites its colour over the nearest opaque ancestor background and asserts WCAG AA
(4.5:1, or 3:1 for large text) across **both palettes** — about 5,600 text nodes a run. It is
deliberately outside `npm test`, which stays DOM-free and instant.

Notes for changing it:

- It forces the **vector** artwork set. Text over an installed illustration has no computable
  background, and the illustrations are not ours to constrain.
- The menu pass runs on the **pre-game board**. Once six human seats are playing, every square
  opens a dialog that waits for a click, so a dialog is back over the menu bar within a second
  of closing the last one.
- Interact through **locators, not element handles**: every render rebuilds the controls it
  touches, so a handle taken before a render is detached by the time it is clicked.
- Gradients are treated as translucent overlays and walked through; only `url(` backgrounds
  make a pair uncomputable.

It has already paid for itself twice over, and not only on colour: writing it surfaced two
hangs (below). The colour findings were the same trap in a new place — **the recovered player
colours are not text colours**. Blue measures 3.75:1 and dark green 3.68:1 on the sidebar card,
so log entries carry ownership as a coloured edge, exactly as owned project names on the board
are dark ink rather than the owner's colour. `--accent-2` is likewise a ring colour: as text it
misses AA at 4.4:1, which is why `--link` exists.

### The turn loop must re-enter after every await

`step()` in `main.ts` parks on `sound.announceTurn()`, which runs 1.1-1.9s. A click on the die
during that await sets `moving`, and the loop then fell through to the human branch and
`return`ed without re-examining state: the roll was swallowed and the turn hung with the die
disabled forever. **After any await inside that loop, `continue` rather than falling through** —
the state you decided on before the await may no longer be the state you are in.

Relatedly, `Sound.fire()` arms its stall guard *before* calling `play()`. A `play()` promise can
stay pending indefinitely, and arming the timeout inside `.then()` meant that case hung the
speech chain — and therefore the turn loop — permanently.

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

Hard-won lessons. Nearly every wrong turn in this project came from reading a recovered value
without checking how it was encoded or whether the running program overrode it.

### Tooling

- **Ghidra** is a brew *formula*, not a cask, and needs JDK 21:
  ```bash
  brew install ghidra openjdk@21
  JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
    /opt/homebrew/Cellar/ghidra/*/libexec/support/analyzeHeadless \
    /tmp/gproj gow -import gamework.exe -scriptPath <dir> -postScript DumpFuncs.java 0x413e10
  ```
  Re-run against an existing project with `-process gamework.exe -noanalysis` to skip
  re-analysis. A script that decompiles every function in `0x401000..0x430000` and scores
  which struct-field offsets it touches is an effective way to find a subsystem.
- **capstone** is not installed system-wide; use a venv. `tools/extract-assets.py` treats it
  as optional and skips the disassembly-dependent output without it.

### The DFM: authoritative for some things, misleading for others

**Trust it for** geometry, colours, fonts, component names and event-handler names. Every
coordinate, tile colour and font size in `board.ts` came from there and has held up.

**Do not trust it for** anything the running program assigns:

- `Edit1..Edit6` carry `Text='Player 1'..'Player 6'`, but the game actually assigns Brad,
  Jen, George, Spot, Muriel, Ned. Seat avatars are fixed art, so a wrong name order visibly
  mismatches every portrait.
- A *missing* property means **defaulted, not unset**. `projectStatusShape` has no
  `Brush.Color`, and `TShape` defaults to `clWhite` — so it is the white mask over the unearned
  part of the bar, not the fill. Misreading that inverted every progress bar, making untouched
  projects look finished.
- Identical `Left`/`Top` across sibling controls means they live in separate parents and are
  templated, which is a hint their contents are set in code.

**One inversion worth knowing:** design-time captions *are* authoritative for the idle screen,
because that is literally what the program showed before a game started —
`projectNameLabel='project Name'`, `stockChangeLabel='+32'`, `rankLabel='E'`. That is where the
pre-game board's appearance came from.

Prefer a screenshot of the running game over a DFM property for anything code can overwrite.
Several errors here were caught only because the user supplied one.

### Binary structures

- **`TFont.Height` is negative.** A dump that reads those bytes as unsigned reports nonsense
  like 245, 240, 225 — signed they are -11, -16, -31, i.e. pixel heights. See `board.ts` FONTS.
- **`TPicture` blobs are inconsistent by class.** `TBitmap` is class name + u32 length +
  payload; `TIcon` is class name followed *immediately* by the `.ico` bytes with no length.
  Being 4 bytes out made every icon fail to parse.
- **`TImageList.Bitmap`** is `[u32 colour-BMP size][u32 images in use][24bpp strip][1bpp mask]`.
  Frames sit in a wrapping grid and Delphi over-allocates, so the strip holds more cells than
  are used; a set mask bit means transparent.
- **Icon DIBs store height doubled**: top half colour, bottom half a 1bpp AND mask.
- **Validate frame order with a self-checking case.** The die list's six frames contain 279,
  558, 837, 1116, 1395 and 1674 white pixels — an exact 1:2:3:4:5:6 ratio, so frame *k* carries
  *k*+1 pips. That proved the grid layout without needing to look at anything.

### Decompilation

Known addresses:

| Address | What |
|---|---|
| `0x402048` | Chance card constructor — 6 numerics into fields `[3..8]` |
| `0x413e10` | Scruples answer constructor — 18 params, 15 numerics in two groups |
| `0x4137fc` | card constructor (5 strings + 3 numerics) |
| `0x413c14` | Scruples OK handler — records the chosen index only |
| `0x4081a8` | stats panel painter |
| `0x43b018` / `0x472024` | string assign / allocator, useful as block landmarks |

- **A field offset does not tell you whether a slot holds a value or a pointer.**
  `DAT_004751e8+0xc..+0x20` looks exactly like the Chance card's six-integer record, but the
  slots are double-dereferenced and null-checked: they are six *player* pointers. Assuming
  otherwise sent a whole investigation sideways.
- The stats painter sizes its meters as `bossRating * width / 100` and
  `stress * width * 2 / 0x2c`, which independently confirms `PRESIDENT_THRESHOLD = 100` from
  compiled code and gives the workload meter a full scale of 22. Boss Rating is at
  `player + 0x18`.
- **capstone renders `push 0` with no `0x` prefix.** An immediate-detector keyed on that
  prefix silently discards every zero, which caused several dead ends. Parse with
  `int(op, 0)`.
- **Decoding x86 backwards from an arbitrary offset desynchronises.** Anchor on the byte just
  past a `call`, always an instruction boundary.

### What is recovered versus calibrated

Recovered from the binary: board geometry, tile and player colours, profile distribution
(2/4/4/3/2), fonts, seat names and order, default game length, the presidency threshold, the
workload meter scale, and **all 30 Chance card effects** (confirmed three independent ways).

Calibrated by simulation, not recovered: everything else in `rules.ts`, and the Scruples
answer effects. All 108 answers × 15 parameters are extracted and preserved in `cards.json`
as `scruplesRawEffects`, and the grouping is proven (36 constructors each preceded by exactly
3 answers), but **which slot means Boss Rating is unestablished**. Two decompiler scans found
no reader of the answer object's high fields. Do not apply those numbers under guessed labels.

### Verification discipline

The failures here were all *plausible-looking* results, so:

- **Test a hypothesis against a known-good subset before trusting it.** Pairing answer groups
  to cards by rank order looked reasonable and disagreed with all 23 directly-evidenced pairs.
- **A clean-looking bijection is not evidence.** A global matching returned a "perfect" 36-to-36
  assignment whose distances ran from 65 to 28,013 bytes, with two thirds of pairs pointing the
  wrong way. Check the residuals, not the fact that it converged.
- **Verify a new guard actually fails on the bug it targets.** The stylesheet-positioning test
  was confirmed by reintroducing the bug and watching it fail, twice.
- Word pools must stay within 9 characters: the original's own pool tops out there (mean 5.9),
  and a 73x27 label at 11px will not hold more. Board scaling does not help, since the board is
  transform-scaled and text grows with it.

### Working practice

`ui.ts` and `main.ts` are now large enough that string-anchored patching is risky — one edit
here spliced the wrong region and duplicated five methods. Prefer explicit method boundaries,
and let `npm run typecheck` catch it before anything else.

`board.ts` is **not** a design file. Coordinates, colours, the profile distribution and the
recovered font sizes are all load-bearing, and a restyle never needs to touch it. Change the
surface in `style.css` instead.

Replacing a block of `style.css` wholesale leaves **stale duplicates**: a selector list that
matches only exact selector strings misses variants (`.board-original .center-caption` when the
list held `.center-caption`), and the survivors sit *above* their replacements where they can
still win on specificity. After a bulk rewrite, split the file on brace depth and check for
repeated selectors rather than trusting the removal count.

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
