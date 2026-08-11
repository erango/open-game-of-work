# Open Game of Work

A clean-room reimplementation, in TypeScript, of **Game of Work** — an office-politics
board game published by Hotpot Software around 2000 and long since lost. The original was
a 32-bit Windows binary built in Borland Delphi 5, shipped inside a 16-bit InstallShield
installer, and is no longer available anywhere including its publisher.

This port exists so the design survives on hardware and browsers that will still exist
next decade.

```bash
npm install
npm run dev        # play at the printed localhost URL
npm test           # 80+ checks incl. 75 fully simulated games
npm run build      # typecheck + production bundle
```

Requires Node 20+. No runtime dependencies — the game is plain TypeScript and DOM.

---

## What this is, and what it deliberately is not

**Mechanics are reimplemented. Nothing is copied.**

Game rules and systems are not copyrightable, so they were recovered by static analysis of
the original binary and reimplemented from a written spec. What was *not* done:

- **No machine code was translated.** Not one instruction was decompiled into TypeScript.
  Every line here is original.
- **No assets are redistributed.** The original's 96 bitmaps, 10 cursors, and ~95 WAV files
  stay in your own copy. This repo contains none of them.
- **No original text is reused.** All Chance cards, Scruples dilemmas, and project-name
  word pools were newly written. The original's 30 chance cards and 36 scruples cards
  informed the *count and shape* of the decks, not their wording.

The board geometry is transcribed from the original form resources, because coordinates are
facts about a layout rather than creative expression — and it makes the port recognisable to
anyone who played it.

[`SPEC.md`](./SPEC.md) is the full reverse-engineering write-up: binary provenance, the
26-square board map with original coordinates, every subsystem, and an explicit list of
what could not be recovered.

---

## How the original was recovered

The chain, for anyone repeating this on another lost Delphi title:

1. **Disc image → filesystem.** `bchunk` on a `.cue`/`.bin` pair. The CUE needed CRLF
   stripped first; `bchunk` doesn't handle `\r` and emits garbage track names.
2. **Installer → payload.** The game shipped as InstallShield v3 (`_SETUP.1`, a "Z"
   archive). `7z` can't read that format; [`unshieldv3`](https://github.com/wfr/unshieldv3)
   can. This revealed `gamework.exe` as **PE32** — only the *installer* was 16-bit, which is
   why the game runs under Wine on Apple Silicon while its installer cannot.
3. **Identifying the toolchain.** Linker version 2.25 plus the `.tls`/`.edata` section
   layout pins it to Borland Delphi 5. That matters enormously: Delphi stores its entire UI
   as **DFM form resources**, which are declarative and fully recoverable.
4. **Resources → structure.** A PE resource-directory walker plus a DFM binary decoder
   (`TPF0` format) yielded 18 forms, giving every control, its coordinates, and its event
   handler names — including the complete board layout.
5. **Rules text.** Found as Pascal string literals in `.data`, not in the string tables
   (which held only Delphi VCL boilerplate). The in-game help documented Boss Rating,
   Stress, Friendliness, all four AI personalities, and every square's behaviour.
6. **Numeric tables.** Not recoverable — they live in compiled code. These are the port's
   own, calibrated by simulation. See below.

---

## Architecture

```
src/
  types.ts      state shapes, ranks, phases
  rules.ts      every tunable number — the whole balance surface
  board.ts      26-square ring, original coordinates, profile assignment
  names.ts      procedural project names (own word pools)
  cards.ts      Chance + Scruples decks (own text)
  rng.ts        seeded mulberry32 — games are reproducible
  engine.ts     game state machine, headless and UI-agnostic
  ai.ts         4 personalities over a shared weighted decision surface
  autoplay.ts   headless driver: all-computer games, no browser
  ui.ts         DOM renderer, board scaled from the original 776x535 space
  main.ts       modal flow, setup screen, turn loop
test/
  smoke.test.ts geometry, rules tables, engine invariants, 75 simulated games
```

The engine has no DOM dependency, so `autoplay.ts` runs complete games in Node. That is
how balance gets measured rather than guessed.

## Balance, and how it was set

Numeric tables couldn't be recovered, so they were calibrated by simulating games and
checking the result against the behaviour the original's own help text describes. Two
problems the simulation caught, both recorded in `rules.ts` comments:

- **Boss Rating overshoot.** Promotion happens only when passing Home and moves at most one
  rank, so climbing Entry Level → President needs five laps. With generous completion
  rewards, players hit the 100-point presidency threshold in two laps and the rest of the
  game was decided purely by lap count — the rating stopped mattering. Completion rewards
  were cut roughly in half; winners now finish near 100 rather than past 200.
- **A dead lose condition.** The original documents that a share price of zero disbands the
  company and everyone loses, and ships `COMPANYDISBANDED` artwork for it. In simulation the
  price never once fell below its starting value in 60 games, because completions are
  frequent and uniformly positive with nothing pushing back. An operating cost was added —
  charged **per owned project per round**, not per player. Per-player scaling made six-player
  tables far more crash-prone than two-player ones, because income is bounded by the fixed
  15 project squares while a headcount charge grows without limit.

Current outcome distribution over 75 simulated games (`npm test` prints this):

| | |
|---|---|
| Presidency reached | 67 |
| Company crashed | 8 |
| Hit turn cap | 0 |
| Average turns | 34 (short 25 · medium 34 · long 42) |

Personalities are meaningfully different rather than cosmetic — Ambitious wins most,
Evil least, with average final Boss Ratings of 115 and 59 respectively.

## Playing with the original's assets

The port ships no art or audio and needs none. If you have your own extracted copy, its
`sounds/` and `graphics/` folders match the names the original used, so wiring them up is
a local change — deliberately not included here, so this repo stays distributable.

## Status

Playable end to end: 2–6 seats in any mix of human and computer, all 26 squares
implemented, trading, Power Monger, promotions and demotions, shoddy work with delayed
consequences, stock market with the crash ending, save/load, and keyboard shortcuts
matching the original (`Space` roll, `T` trade, `R` resign, `1`–`3` on Scruples).

Not implemented: high-score tables, the stock chart window as a separate view (the price
history is charted inline instead), and the original's registration nag screens.

## Credit

Original design by **Hotpot Software** (2000). This reimplementation is an independent work
by admirers of it, and is not affiliated with or endorsed by the original authors. If you
hold rights to Game of Work and want something changed here, please open an issue.
