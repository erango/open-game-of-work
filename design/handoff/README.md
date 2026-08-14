# Handoff: board & shell redesign (Open Game of Work)

## Overview

A new interface surface for the browser reimplementation of *Game of Work* — a considered
replacement for the current dark-shell / green-felt look, in two switchable palettes
("Original" warm charcoal, "Neon" cyberpunk). The board's authored geometry is unchanged;
everything else — colour, type, borders, state treatment, sidebar and dialog layout — is new.

Target codebase: `erango/open-game-of-work` (`master`). The renderer to change is
`src/ui.ts` + `src/style.css`; dialogs live in `src/main.ts`. Geometry constants in
`src/board.ts` must not be edited.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing the
intended look, not production code to copy. The task is to **recreate them in the target
codebase's own environment**: plain TypeScript + DOM, no runtime dependencies, class-based
CSS in `src/style.css`, board children positioned absolutely in the 776×535 design space.
Do not introduce React, a CSS framework, web fonts, icon libraries or image assets — the
project's hard constraint is "no external assets, system font stacks only, everything
expressible in CSS and inline SVG".

The prototypes use inline styles because of how they were authored. In the real codebase
these become **CSS custom properties + classes** in `src/style.css` (see Design tokens).

## Fidelity

**High fidelity.** Colours, sizes, weights, tracking and state treatments are final and
measured; every text/background pair in the prototypes clears WCAG AA (4.5:1 for body and
small text, 3:1 for ≥24px). Recreate pixel-perfectly. Where a value here disagrees with
the current `style.css`, this document wins — except geometry, where `src/board.ts` wins.

## Screens / views

### 1. App shell

- CSS grid, `minmax(0,1fr) 330px`, `gap: 16px`, `padding: 16px`, `height: 100vh`.
- Left column: `grid-template-rows: auto minmax(0,1fr)`, `gap: 10px` — menu bar above the
  board column. Board column centres the board and is measured to size it (unchanged logic
  in `Ui.scaleBoard`).
- Page background `--bg`. No border on the app frame.

### 2. Menu bar (replaces `.menubar`)

- Height 38px, `padding: 0 4px`, `border-radius: 6px`, background `--panel`,
  `box-shadow: inset 0 0 0 1px --panel-line`. No outer border.
- Top-level items: transparent buttons, 13px, weight 500 (600 when open), `padding: 9px 12px 7px`,
  `white-space: nowrap`, colour `--ink-2`.
  - hover: colour `--ink`
  - open: colour `--ink` + `border-bottom: 2px solid --accent-2` (never a filled background —
    the old amber fill changed the label's advance width and shifted the bar)
  - Neon palette only: labels uppercase, `letter-spacing: .06em`
- Right side of the bar carries two segmented controls, label + control, label 11px
  uppercase `letter-spacing: .12em` colour `--ink-3`:
  - **Palette**: Original | Neon
  - **Artwork**: Vector | Original (only when an extraction is installed)
- Dropdown (`.menu-drop`): min-width 232px, background `--panel-2`,
  `inset 0 0 0 1px --line`, radius 7px, padding 4px, `box-shadow: 0 14px 36px rgb(0 0 0 / .55)`.
  Items: `grid-template-columns: 18px 1fr`, 13px, `padding: 8px 9px`, radius 5px;
  hover background `--panel-3`; check glyph in `--accent-2`; separator 1px `--line`, margin `4px 6px`.

### 3. Board (776×535 design space — geometry from `src/board.ts`, do not move)

Field: `background: --field`, `border-radius: 6px`,
`box-shadow: inset 0 0 0 1px --panel-line, inset 0 40px 90px rgb(0 0 0 / .35)`.
Replaces the felt + 2px border + drop shadow.

#### Project square (81×81)

| part | spec |
|---|---|
| tile | `background: --tile-N` (N = profile 1–5), radius 3px, `box-shadow: inset 0 0 0 1px rgb(0 0 0 / .28)` |
| bar track | left 0, top 0, 7×81, `background: rgb(0 0 0 / .34)` |
| bar fill | left 0, **bottom 0**, 7px wide, height = `81 * progress/work`, `background:` owner colour |
| name box | left 8, top 0, 73×27, flex column, centred, `padding: 0 2px`, `overflow: hidden` |
| name line 1 (adjective) | 8.5px, weight 600, `letter-spacing: var(--track-adj)`, uppercase, `line-height: 11px`, colour `--tile-ink-dim`, `nowrap` |
| name line 2 (noun) | 11.5px, weight 700 owned / 600 unowned, `letter-spacing: -.008em`, `line-height: 14px`, colour `--tile-ink` owned / `--tile-ink-dim` unowned, `nowrap` |
| profile numeral | right 5, bottom 3, 9px weight 700, colour `--tile-ink-dim` |
| shoddy | overlay `repeating-linear-gradient(135deg, rgb(0 0 0 / .10) 0 3px, transparent 3px 8px)` over the whole tile + 7px dot at left 11, bottom 3, `--danger-2`, `box-shadow: 0 0 0 1.5px rgb(0 0 0 / .3)` |

Notes / deliberate changes:
- Bars **fill upward from a dark trough**. The original drew a full bar masked from the top
  by a white shape; visually equivalent, but the trough removes the white rectangle that
  read as an object of its own.
- Owned project names are **dark ink, not the owner's colour**. The pale player colours on a
  pastel tile measure ~2–3:1; ownership is carried by the bar colour alone.
- Names are **two lines, adjective over noun**. `src/names.ts` pools words up to 9 characters,
  so one line at a legible size elides the majority of generated names.
- The **profile numeral** is new: difficulty survives when illustrated artwork fills the tile.
- All board text keeps the existing `calc(Npx * var(--text-k, 1))` pattern so the comfortable
  text multiplier still works.

#### Corner square (140×140)

`background: --sq-corner`, radius 3px, `inset 0 0 0 1px --line-sq`, flex column, `gap: 10px`:
icon 44px in `--icon`; title 12px weight 600 uppercase `letter-spacing: var(--track-wide)`
colour `--ink-2`; sublabel 9.5px `letter-spacing: .06em` colour `--ink-3`
("pass for review", "everyone attends", "present your load", "+2 boss rating").

#### Chance / Scruples squares (81×81)

`background: --sq-chance` / `--sq-scruples`, `inset 0 0 0 1px --line-sq`, `gap: 6px`:
icon 32px in `--icon-2`, label 9.5px weight 600 uppercase `letter-spacing: var(--track-wide)`
colour `--ink-2b`. Icons are the existing `src/icons.ts` markup, unchanged.

#### Power Monger (81×81)

`background: --sq-power`, `inset 0 0 0 1px --sq-power-line`, icon `--sq-power-icon`,
two-line label 9.5px uppercase `letter-spacing: .14em` colour `--sq-power-label`.
The only special square that carries colour — it is the only one that lets a player act on
someone else's work.

#### Centre cluster (positions from `CENTER` in `src/board.ts`)

- **Roll die** 81×81 at (336,224): the only filled control on the board.
  `background: --accent`, radius 5px, `box-shadow: inset 0 0 0 1px rgb(255 255 255 / .14), 0 4px 14px rgb(0 0 0 / .4)`,
  no border. Face drawn as a 3×3 grid, `gap: 6px`, `padding: 16px`, pips 9px circles in `--accent-ink`.
  Hover `--accent-hover`; disabled `opacity: .4`, no hover.
- **Trade** 81×81 at (437,224) and **Resign** 50×50 at (594,296):
  `background: --ctl`, `inset 0 0 0 1px --ctl-line`, radius 5px, icon 34px / 22px in `--ctl-icon`.
  Hover `--ctl-hover`. The old raised bevel frames are gone.
- **Captions** at the transcribed boxes: uppercase, weight 600. Roll 13px `letter-spacing: .12em`
  colour `--caption`; Trade 13px `.12em` and Resign 12px `.1em` colour `--icon` (the quiet tone);
  Ticker label 11px `.14em` colour `--icon`. `white-space: nowrap`. ("Roll Die"/"Make Trade"
  shortened to "Roll"/"Trade"; the Resign box is 48px and the word measures 50px — a
  deliberate 1px spill per side, overflow visible.)
- **Ticker** frame (561,214,106×50): `background: --inset`, radius 4px,
  `box-shadow: inset 0 0 0 1px --inset-line, inset 0 2px 6px rgb(0 0 0 / .6)`.
  Value box (567,220,93×37): 29px weight 700, `font-variant-numeric: tabular-nums`,
  `letter-spacing: -.01em`; colour `--success` up, `--danger-2` down, `--ink-3` flat.
  No glow, no monospace face — the sans with tabular figures is steadier at 29px.

#### Player panel (96,172,205×211)

`background: --panel`, radius 5px, `inset 0 0 0 1px --panel-line`. Rows on the transcribed
tops (`CENTER.statRows`): nameTops 8/40/72/105/137/169, barTops 26/58/90/123/155/187.
**Nothing else may occupy the panel** — a six-seat game uses every row.

- name: left 10, 140×17, 14px weight 600 `letter-spacing: .01em`, colour `--ink` active /
  `--ink-2` inactive, `nowrap`
- portrait slot: left 16, 16×16, radius 2px, owner colour, initial 9px weight 700 —
  `rgb(0 0 0 / .6)` on the four pale player colours, `#fff` on `#2f7d3f` and `#4b63e4`
- meter track: left 32, 136×16, radius 2px, `background: --trough`,
  `inset 0 0 0 1px --panel-line`, `padding: 1px`, flex column `gap: 2px`;
  boss meter 6px in the owner colour (`#2f7d3f` lightened to `#57b06a` so it reads on the trough),
  workload meter 5px in `--danger`
- rank badge: left 174, 16×16, radius 2px, `background: --ctl`, 11px weight 700,
  colour `--caption` active / `--ink-2b` inactive
- active row: full-width band at `top: barTop − 24`, height 32px,
  `background: --accent-soft`, `border-left: 2px solid --accent-2`. Replaces the amber dot.

#### Tokens

22px circles (26px with original artwork), owner colour,
`box-shadow: 0 0 0 2px --field, 0 2px 6px rgb(0 0 0 / .55)` — a field-coloured ring instead
of a black border, so tokens read on both tiles and field. Initial 11px weight 700, ink as
per portrait slots. Offsets from `tokenOffset()` unchanged.

### 4. Sidebar (330px, `gap: 12px`)

Cards: `background: --panel`, radius 8px, `inset 0 0 0 1px --panel-line`, `padding: 14px`.
Card label: 11px weight 600 uppercase `letter-spacing: .14em` colour `--ink-3`.

- **Turn card**: label row "Turn N" + "Your move" in `--accent-2` (11px uppercase `.1em`);
  player chip 10px square radius 2px in the player colour + name 19px weight 600
  `letter-spacing: -.01em`; rank 13px `--ink-2`; two labelled meters (Boss rating `46 / 100`,
  Workload `9 / 22`) — label 11px uppercase `--ink-3`, value `--ink` tabular, track 6px radius 1px
  `background: --trough` `inset 0 0 0 1px --rule`, fills player colour and `--danger`;
  buttons row: Roll (primary, flex 1) + Trade (secondary).
- **Share price card**: 30px weight 600 tabular `letter-spacing: -.02em`; delta 13px weight 600
  in `--success` / `--danger-2`; "peak N" 12px `--ink-3` right-aligned; sparkline 56px tall,
  `preserveAspectRatio="none"`, 1px dashed `--rule` baseline at the starting price, 1.5px path
  in `--success` / `--danger-2`; hint 12px `--ink-3`.
- **Log**: entries `padding: 8px 0`, `border-bottom: 1px solid --rule-2`, 13px/1.5, colour `--ink-2`;
  player name inline in the player colour weight 600; deltas in `--success` / `--danger-2`;
  system lines in `--ink-3`. With a thumbnail: `grid-template-columns: 40px minmax(0,1fr)`,
  `gap: 10px`, art 40×30 radius 2px. Without art the entry is a plain block with no art column.

### 5. Dialogs (max-width 620px)

Scrim `rgb(10 9 8 / .72)`. Shell: `background: --panel`, radius 10px,
`box-shadow: inset 0 0 0 1px --line, 0 24px 60px rgb(0 0 0 / .6)`, `padding: 22px`.
Title 20px weight 600 `letter-spacing: -.01em`; subtitle 14px/1.5 `--ink-2`; prose 17px/1.55
`--ink` with `text-wrap: pretty`. Field label 11px weight 600 uppercase `.14em` `--ink-3`;
hint 12px `--ink-3`. Footer right-aligned, `gap: 8px`.

- **Primary button**: `background: --accent`, colour `--accent-ink`, 14px weight 600,
  `padding: 10px 20px`, radius 6px, no border; hover `--accent-hover`.
- **Secondary button**: `background: --ctl-2`, `inset 0 0 0 1px --panel-line`, colour `--ink-2`,
  14px, `padding: 10px 16px`; hover `--ctl-hover-2`.
- **Segmented control**: wrapper `padding: 2px`, radius 5–6px, `background: --ctl-2`,
  `inset 0 0 0 1px --line`; segment 12–13px weight 600, `padding: 5px 0`/`7px 0`, radius 3–4px,
  off colour `--ink-2b`, hover colour `--ink`, on `background: --accent` colour `--accent-ink`.
- **Text input / select**: `background: --field-input`, `inset 0 0 0 1px --line`, colour `--ink`,
  radius 5px, `padding: 8px 10px`, 13px.

**New Game.** Two-up row: Length (segmented Short/Medium/Long, default Long) and Deck (select).
Seats header row: "Seats" label + "N of 6 filled" 12px `--ink-3`. Six seat rows,
`grid-template-columns: 80px 132px minmax(0,1fr) 128px`, `gap: 10px`,
`padding: 7px 10px 7px 0`, radius 7px, `background: --row`, `inset 0 0 0 1px --row-line`:
1. 4px colour bar (`SEAT_ROW_COLORS[i]`, full 64px height, radius `0 2px 2px 0`) + **seat art at
   its native 64×64**, `margin-left: 8px`, radius 3px. The art is 64px in the original and must
   never be resampled.
2. seat-type segmented control Human | Cpu | Off (replaces the cycling button; a three-state
   cycle hid the two states you were not on)
3. name input
4. personality select — `—` placeholder for human seats
Off row: `background: --row-off`, `inset 0 0 0 1px --row-off-line`, name and disabled labels at
`--ink-3` (stated deliberately: off seats stay readable; off-ness is carried by the dimmer row
and the filled "Off" segment). Footer: `?` circular button (30px, `--ctl-2`, `inset 0 0 0 1px --panel-line`,
colour `--ink-2`) sits top-right of the header, then Cancel + Start.

**Scruples (dilemma card).** Header: 20px icon in `--icon-2`, "Scruples" 11px weight 600
uppercase `letter-spacing: var(--track-wide)` `--ink-2b`, right-aligned "player · turn N" 12px `--ink-3`.
Optional card illustration slot beneath (full width, 120px tall). Situation as 17px prose.
Three answer buttons, `gap: 8px`, flex row `gap: 12px`, `padding: 13px 14px`, radius 7px,
15px/1.45, `background: --row`, `inset 0 0 0 1px --row-line`, colour `--ink-2`;
numeral chip 20×20 radius 3px `background: --ctl` `inset 0 0 0 1px --line-sq` colour `--ink-2b` 12px weight 700.
Footer hint "Press 1, 2 or 3." 12px `--ink-3`.

## State matrices

**Answer / choice button** (Scruples, and any list choice)

| | default | hover | AI-chosen | AI-chosen + disabled others |
|---|---|---|---|---|
| background | `--row` | `--row-hover` | `--accent-weak` | `--row` |
| ring | `--row-line` | `--accent-2` | `--accent-2` | `--row-line` |
| text | `--ink-2` | `--ink` | `--ink` | `--ink-3` |
| numeral chip | `--ctl` / `--ink-2b` | `--ctl` / `--ink` | `--accent` / `--accent-ink` | `--ctl` / `--ink-3` |
| tag | — | — | "chosen" 10px uppercase `--accent-2` | — |

Disabled-and-chosen keeps full opacity and the accent ring; disabled-and-not-chosen drops to
`--ink-3` text — never `opacity` on the whole button, which is what made the old locked AI
dialogs unreadable.

**Project square**

| | unowned | owned | owned + shoddy | owned + complete |
|---|---|---|---|---|
| bar fill | none (trough only) | owner colour, height ∝ progress | owner colour + hatch overlay | full-height owner colour |
| noun | `--tile-ink-dim`, weight 600 | `--tile-ink`, weight 700 | `--tile-ink`, weight 700 | `--tile-ink`, weight 700 |
| marker | — | — | 7px `--danger-2` dot, left 11 bottom 3 | — |

**Segment** — off / off+hover / on / on+hover / disabled:
`--ink-2b` → `--ink` → `--accent` bg + `--accent-ink` → same as on (no hover change) →
`--ctl` bg + `--ink-3`.

**Menu top item** — rest / hover / open / open+hover:
`--ink-2` → `--ink` → `--ink` + 2px `--accent-2` underline → identical to open (stating it
explicitly: the old rule let `:hover` outrank the open state and the label vanished).

**Player row** — inactive / active / resigned (computer-controlled after resign):
name `--ink-2` → `--ink` + accent band → `--ink-3` with the rank badge in `--ink-3`.

**Buttons** — rest / hover / disabled: primary `--accent` → `--accent-hover` → `--ctl` bg with
`--ink-3` text (not opacity); secondary `--ctl-2` → `--ctl-hover-2` → same rule.

## Design tokens

Ship both sets as CSS custom properties on `:root`, switched by a `data-palette="original|neon"`
attribute on `<html>` (persist in `localStorage`, same pattern as `ogow:snap`). Board and shell
read the same tokens; the prototypes prove every pair clears AA.

| token | original (warm charcoal) | neon |
|---|---|---|
| `--bg` | `#131211` | `#06090f` |
| `--panel` | `#1b1917` | `#0a1220` |
| `--panel-2` | `#242220` | `#0e1828` |
| `--panel-3` | `#2c2926` | `#162134` |
| `--panel-line` | `#2f2c28` | `#1b2a3f` |
| `--line` | `#33302b` | `#1d3550` |
| `--rule` | `#332f2a` | `#17293c` |
| `--rule-2` | `#262320` | `#142234` |
| `--field` | `#221f1c` | `#0b0f18` |
| `--field-input` | `#191715` | `#0e1828` |
| `--sq-corner` | `#1d1b18` | `#0a0e16` |
| `--sq-chance` / `--sq-scruples` | `#242119` / `#24201c` | `#0d1520` |
| `--sq-power` / `--sq-power-line` | `#2a1d1c` / `#4e332e` | `#1b0e1c` / `#4a1c48` |
| `--sq-power-icon` / `--sq-power-label` | `#c98878` / `#d3a294` | `#ff7bf0` / `#ff9ef4` |
| `--line-sq` | `#3d3831` | `#1c2c42` |
| `--ink` | `#f2efe9` | `#eaf6ff` |
| `--ink-2` | `#b6afa4` | `#9fd6ff` |
| `--ink-2b` | `#a29a8c` | `#7fb8de` |
| `--ink-3` | `#9a9288` | `#8fb6d6` |
| `--icon` / `--icon-2` | `#9b9389` / `#8b8272` | `#8fb6d6` / `#7fa9cc` |
| `--caption` | `#cfc8bd` | `#cfefff` |
| `--ctl` / `--ctl-2` | `#2b2825` / `#242220` | `#101827` / `#0e1828` |
| `--ctl-line` | `#423d36` | `#23364f` |
| `--ctl-icon` | `#6f6a62` | `#5b86ad` |
| `--ctl-hover` / `--ctl-hover-2` | `#332f2b` / `#2c2926` | `#162134` / `#132135` |
| `--row` / `--row-line` | `#211f1d` / `#302d29` | `#0e1828` / `#1d3550` |
| `--row-hover` | `#272522` | `#132135` |
| `--row-off` / `--row-off-line` | `#1c1a18` / `#2a2724` | `#0a1018` / `#152337` |
| `--inset` / `--inset-line` | `#151311` / `#38332c` | `#04070d` / `#1d3550` |
| `--trough` | `#100f0e` | `#05090f` |
| `--accent` | `#4a5cd0` | `#ff2bd6` |
| `--accent-hover` | `#5a6bdd` | `#ff5ce0` |
| `--accent-2` | `#6b7fe8` | `#ff5ce0` |
| `--accent-ink` | `#f4f2ee` | `#0a0410` |
| `--accent-soft` | `rgb(74 92 208 / .16)` | `rgb(255 43 214 / .16)` |
| `--accent-weak` | `#232532` | `#1d0f22` |
| `--success` | `#5ec08e` | `#2bffb0` |
| `--danger` | `#b0483a` | `#ff3b6b` |
| `--danger-2` | `#c0503c` | `#ff5c7f` |
| `--tile-1` | `#00b7b7` | `#00e0ff` |
| `--tile-2` | `#94bcda` | `#6aa8ff` |
| `--tile-3` | `#8bb889` | `#4bd455` |
| `--tile-4` | `#debe89` | `#ffc94d` |
| `--tile-5` | `#d88fd6` | `#ff6ae0` |
| `--tile-ink` | `#191714` | `#050b12` |
| `--tile-ink-dim` | `#3b332b` | `#123246` |
| `--track-wide` / `--track-wide2` / `--track-adj` | `.16em` / `.14em` / `.06em` | `.22em` / `.2em` / `.12em` |

Player colours stay as recovered (`PLAYER_COLORS` in `src/rules.ts`), with two rendering rules:
`#2f7d3f` lightens to `#57b06a` for meter fills, and initials on `#2f7d3f` / `#4b63e4` are
opaque white.

**Type.** One system sans throughout:
`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
Weights 500 / 600 / 700 only. Numbers use `font-variant-numeric: tabular-nums`.

| role | size | weight | tracking |
|---|---|---|---|
| board: project adjective | 8.5px | 600 | `--track-adj`, uppercase |
| board: project noun | 11.5px | 700 / 600 | `-.008em` |
| board: profile numeral | 9px | 700 | — |
| board: special-square label | 9.5px | 600 | `--track-wide`, uppercase |
| board: corner title | 12px | 600 | `--track-wide`, uppercase |
| board: corner sublabel | 9.5px | 400 | `.06em` |
| board: control caption | 12–13px | 600 | `.1–.12em`, uppercase |
| board: ticker label / value | 11px / 29px | 600 / 700 | `.14em` / `-.01em` |
| board: player name / rank badge | 14px / 11px | 600 / 700 | `.01em` / — |
| shell: card + field label | 11px | 600 | `.14em`, uppercase |
| shell: body / log | 13px | 400 | — |
| shell: control text | 14px | 500–600 | — |
| shell: player name | 19px | 600 | `-.01em` |
| shell: metric | 30px | 600 | `-.02em` |
| dialog: title | 20px | 600 | `-.01em` |
| dialog: prose | 17px | 400 | — |
| dialog: choice | 15px | 400 | — |

All board sizes keep `calc(Npx * var(--text-k, 1))`. Minimum board size at 1× is 8.5px, which
is the adjective line only; it is uppercase and tracked, and grows with the board.

## Interactions & behaviour

No change to game logic, keyboard shortcuts (`Space`/`T`/`R`/`1`–`3`), movement animation,
die tumble, or modal flow. New behaviour is limited to:

- **Palette switch** — menu bar segmented control and an Options menu item; sets
  `document.documentElement.dataset.palette`, persists to `localStorage` under `ogow:palette`,
  no re-render needed (tokens cascade).
- **Seat type** — segmented control replaces the cycling image button; all three states visible,
  same underlying `<select>` as the source of truth so existing change plumbing is untouched.
- Transitions: keep the existing `.18s` token move and `.25s` meter/bar widths; add nothing else.
  Hover changes are instantaneous (no transition) so the board stays responsive at 2.6× scale.

## Assets

None bundled. The design ships no images and no fonts. Art slots at native size, to be filled
by generated artwork: tile 81×81, corner 140×140, die face 81×81 (×6), seat portrait 64×64,
token 32×32, panel portrait 16×16, dialog event illustration full width, log thumbnail 40×30,
Scruples card illustration ~200×120. Icons are the existing inline SVGs in `src/icons.ts`,
recoloured via `currentColor` from the tokens above.

## Files

| file | what it is |
|---|---|
| `PROMPT.md` | the prompt to paste into Claude Code |
| `Redesign.dc.html` | the new design: neon section (2a) and warm section (1a), board at 1× and 2×, New Game and Scruples dialogs, palette + art-slot reference |
| `Board.dc.html` | the board face, tokenised — every themeable value is a `var()` with the original as fallback |
| `Current UI.dc.html` | pixel-faithful recreation of the interface as it renders today, for before/after comparison |
| `github.md` | source association: repo, branch, screen map |

The `.dc.html` files open directly in a browser.

## Not yet designed

Trade builder, high scores, How to Play, stock chart and the About/splash dialogs still use
the current styling; the dialog shell, segmented control, button and list-row specs above are
enough to carry them across. A light variant of both palettes is also outstanding.
