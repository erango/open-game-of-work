# Open Game of Work

A clean-room reimplementation, in TypeScript, of **Game of Work** — an office-politics
board game published by Hotpot Software around 2000 and long since lost. The original was
a 32-bit Windows binary built in Borland Delphi 5, shipped inside a 16-bit InstallShield
installer, and is no longer available anywhere including its publisher.

This port exists so the design survives on hardware and browsers that will still exist
next decade.

**▶ Play it: https://erango.github.io/open-game-of-work/** — no install, no original binary
needed.

```bash
npm install
npm run dev        # play at the printed localhost URL
npm test           # 90+ checks incl. 75 fully simulated games
npm run build      # typecheck + production bundle
npm run check:contrast   # WCAG AA audit of the running UI, both palettes (needs Chrome)
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

## Three themes

A theme is the palette, the artwork, the music, the sound effects, the card pack and the
project-name vocabulary, chosen together — switching one is a statement about the whole look,
so it is a single control (menu bar, Options, or the New Game window).

| | **Original** | **Open Plan** | **Cyberpunk** |
|---|---|---|---|
| artwork | the 2000 bitmaps | inline SVG, drawn for this port | generated illustration set |
| palette | warm charcoal | warm charcoal | neon |
| effects | the original's WAVs | synthesised | synthesised |
| cards | the recovered deck | this port's own | a cyberpunk pack |
| projects | *Casual Postcard* | *Casual Postcard* | *Cached Cronjob* |

**Original only appears if you have your own extraction**, since none of that material is in
this repository. Without one it falls back to Open Plan, and that fallback is deliberately not
remembered — install an extraction later and Original is simply there.

### What is shipped, and what is not

Everything in `public/assets/` that this project made is committed and deployed: the generated
Cyberpunk illustration set, three music tracks per theme, and 24 scene sound effects. Anything
extracted from `gamework.exe` — 96 bitmaps, 10 cursors, ~95 WAVs, the card text and the help
text — is gitignored and never leaves your machine. `npm run check:shippable` fails the build if
any of it reaches `dist/`, and CI runs it before every deploy.

Effects split by how often they fire. `move` plays once per square — hundreds of times a game —
so the frequent cues are **synthesised** in Web Audio, where a voice built per call never quite
repeats and a theme's sound design is a handful of numbers rather than a directory of files. The
twelve once-a-game moments that want texture a synth cannot give — a room of people, a siren,
applause — are recordings. Speech is never synthesised: the per-name and per-seat clips belong
to the original.

### Producing the assets

Each pipeline is resumable and documented next to its script:

```bash
npm run art:manifest && npm run art:gen && npm run art:cutout   # illustration set
npm run art:dice                                                # die faces, drawn not generated
ELEVENLABS_API_KEY=... npm run sfx:gen && npm run sfx:post      # scene effects
npm run audio:encode                                            # music -> AAC for shipping
```

`design/ART-PROMPTS.md`, `design/MUSIC-PROMPTS.md` and `design/SFX-PROMPTS.md` explain the
prompts and, more usefully, the failure modes each one is written around.

## Status

Playable end to end: 2–6 seats in any mix of human and computer, all 26 squares
implemented, trading, Power Monger, promotions and demotions, shoddy work with delayed
consequences, stock market with the crash ending, save/load, and keyboard shortcuts
matching the original (`Space` roll, `T` trade, `R` resign, `1`–`3` on Scruples).

High-score tables and the stock chart window are implemented. Not implemented: the original's
registration nag screens.

Open questions are in `SPEC.md`. The largest is the Scruples answer effects: all 108 answers ×
15 parameters are extracted and their grouping is proven, but which slot means Boss Rating is
unestablished, so this port infers them rather than shipping a guess.

## Licence

The code, and everything else authored for this port — the inline SVG artwork, the Chance and
Scruples decks in `src/cards.ts`, the project-name word pools, the help summaries, and the
extraction tooling — is MIT licensed. See [LICENSE](./LICENSE).

**That licence does not extend to the original game's material.** Its artwork, audio, card
text and help text remain the property of their authors and are not distributed here. The port
loads them from your own copy at runtime, or falls back to its own set. One file deserves a
specific mention: `party.mid` carries its own copyright notice crediting a third party rather
than the game's publisher, so permission from the publisher would not cover it.

## Credit

Original design by **Hotpot Software** (2000). This reimplementation is an independent work
by admirers of it, and is not affiliated with or endorsed by the original authors. If you
hold rights to Game of Work and want something changed here, please open an issue.
