# Game of Work — reverse-engineered mechanics spec

Derived from static analysis of `gamework.exe` (Hotpot Software, ~2000, Borland Delphi 5),
recovered from a CD image. This document records **game mechanics** — rules and systems,
which are not copyrightable — so they can be reimplemented from scratch.

No machine code was translated, and no original text, art, or audio is reproduced here or
in the port. Card and project-name wording in this implementation is newly written.

---

## 1. Binary provenance

| Property | Value |
|---|---|
| Format | PE32, Intel 80386, GUI subsystem |
| Toolchain | Borland Delphi 5 (linker 2.25; `.tls`/`.edata` layout) |
| Size | 2,449,408 bytes |
| Publisher | Hotpot Software |
| Shipped as | InstallShield v3 (`_SETUP.1`), 16-bit NE installer wrapping a 32-bit game |

Resource inventory: 18 DFM forms, 96 bitmaps, 10 cursors, 22 VCL string blocks.
Asset files alongside the exe: 4 `.cur` in `graphics/`, ~95 `.wav` in `sounds/`.

Notable resources: `CHANCE0..29` (30 chance cards), `SCRUPLES0..35` (36 scruples cards),
`RANKPROMO1..5` / `RANKDEMO` / `RANKDEMOMAILROOM`, `COMPANYDISBANDED1..2`,
`MEETINGGOOD` / `MEETINGBAD`, `LANDOWN` / `LANDOTHER`, `SETOFPROJECTS`, `STOCKBONUS`.

Forms: `TMAINFORM`, `TNEWGAMEFORM`, `TSCRUPLESFORM`, `TSTOCKMARKETFORM`,
`TPOWERMONGERFORM`, `TTAKEPROJECTFORM`, `TTRADEPROJECTSFORM`, `TACCEPTTRADEFORM`,
`TOFFICEPARTYFORM`, `TRANKCHANGEFORM`, `THIGHSCORESFORM`, `TPOPUPFORM`, `TSPLASHFORM`,
`TABOUTFORM`, `THELPFORM`, `TAUTOCLICKFORM`, `TREGFORM`, `TREGINFOFORM`.

---

## 2. Board layout

Window 784×580. Ring of **26 squares** traversed clockwise from Home.
Corners are 140×140; all other squares 81×81. Coordinates are the original
`TMAINFORM` component `Left`/`Top` values, so the port's geometry is faithful.

| # | Square | Left | Top | Size |
|--:|---|--:|--:|---|
| 0 | Home | 8 | 8 | 140 |
| 1 | Project | 147 | 8 | 81 |
| 2 | Project | 227 | 8 | 81 |
| 3 | Chance | 227 | 88 | 81 |
| 4 | Project | 307 | 88 | 81 |
| 5 | Project | 387 | 88 | 81 |
| 6 | Scruples | 387 | 8 | 81 |
| 7 | Project | 467 | 8 | 81 |
| 8 | Project | 547 | 8 | 81 |
| 9 | Office Party | 627 | 8 | 140 |
| 10 | Project | 686 | 147 | 81 |
| 11 | Chance | 686 | 226 | 81 |
| 12 | Project | 686 | 307 | 81 |
| 13 | Meeting | 627 | 387 | 140 |
| 14 | Scruples | 547 | 446 | 81 |
| 15 | Project | 467 | 446 | 81 |
| 16 | Project | 467 | 366 | 81 |
| 17 | Power Monger | 387 | 366 | 81 |
| 18 | Project | 307 | 366 | 81 |
| 19 | Project | 307 | 446 | 81 |
| 20 | Chance | 227 | 446 | 81 |
| 21 | Project | 147 | 446 | 81 |
| 22 | Business Trip | 8 | 387 | 140 |
| 23 | Project | 8 | 307 | 81 |
| 24 | Scruples | 8 | 227 | 81 |
| 25 | Project | 8 | 147 | 81 |

The top edge dips inward between squares 2→6 and the bottom edge dips inward
between 15→19, giving two U-shaped notches rather than a plain rectangular ring.

Center cluster: Roll Die at (336,224) 81×81, Make Trade at (437,224) 81×81,
Resign at (594,296) 50×50, player stats panel at (96,172) 205×211,
player token chips in a 3×2 grid from (500,106), 32×32 each.

**15 project squares.** The original numbered its components `projectShape1..16`
skipping 9 — component 9 exists but is unpositioned, i.e. a leftover.

---

## 3. Core stats

### Boss Rating
How much the boss likes a player. Displayed as the top bar of the player's stat box,
tinted the player's colour.

- Rises/falls from project completions, chance cards, scruples answers, meetings, parties.
- **+2 each time a player passes or lands on Home.**
- Business Trip grants **+2 extra** on top of the Home award it triggers.
- Governs promotion and demotion at Home.
- **≥ 100 → eligible for promotion to President** (the win).

### Stress
`stress = sum(profile of each project the player owns)`. Profiles are 1–5.

- Affects performance across several subsystems.
- High stress gives owned projects a chance to turn **shoddy**; a shoddy project that
  completes may later rebound on the player who finished it.
- Drives Office Party outcomes in both directions (too stressed / not stressed enough).

### Friendliness
Per-ordered-pair value held by **computer players only**, toward every other player.
Rises when treated well, falls when treated badly. Guides all AI decisions.

---

## 4. Ranks

Seven ranks, low to high:

0. Mailroom
1. Entry Level Manager
2. Junior Manager
3. Middle Manager
4. Senior Manager
5. Vice President
6. President — terminal, wins the game

Promotion/demotion is evaluated when a player **passes or lands on Home**, and moves
**at most one rank per pass**, based on current Boss Rating.

Power Monger actions permitted per rank:

| Rank | Actions |
|---|--:|
| Mailroom | 0 |
| Entry Level, Junior | 1 |
| Middle, Senior | 2 |
| Vice President | 3 |

---

## 5. Game length

Chosen at setup: **Short / Medium / Long**. Length sets the starting rank and starting
Boss Rating for every player.

| Length | Start rank | Start Boss Rating |
|---|---|---|
| Short | highest of the three starting ranks | significant |
| Medium | middle | some |
| Long | lowest | none |

High-score turn counts for Short and Medium games are scaled up so they compare
against Long games.

---

## 6. Projects

Each project square carries a **name**, a **progress bar**, and a **tile colour**.

- **Tile colour encodes profile** (1–5); same profile ⇒ same colour. The two squares
  immediately clockwise of Home are both profile 1 (blue).
- **Name** is regenerated every time the project completes. Name and bar are drawn in
  the owner's colour, or black when unowned.
- **Progress bar** shows work *remaining* inverted: a fuller bar means less work left.
  On completion the bar resets to its starting state.

### Work accrual
- Every turn, **all of the active player's projects advance by one step**…
- …**unless** that player landed on a project owned by someone else, in which case
  none of their own projects progress that turn.
- Landing on a project you own grants **extra** work on it, on top of the normal step.
- **Set bonus:** owning every project of one profile ⇒ **double work** on those projects.

### Landing on a project square
1. **Unowned** → the player is offered the project.
2. **Owned by another player** → the player must work on *that* project instead, and does
   no work on their own projects this turn.
3. **Owned by the player** → extra work on it, in addition to the normal turn's work.

### Completion
Completing a project you own grants Boss Rating scaled by its profile — higher profile,
more Boss Rating — and raises the stock price, also scaled by profile.

### Shoddy projects
While a player is heavily stressed, their in-progress projects can be flagged shoddy.
A shoddy project still completes, but may generate a later penalty event against the
player who completed it.

---

## 7. Squares

### Home (corner, start)
Every player begins here. Passing or landing awards **+2 Boss Rating** and triggers a
promotion/demotion check, limited to one rank of movement.

### Business Trip (corner)
Sends the player to Home and awards **+2 extra** Boss Rating beyond the Home award.

### Office Party (corner)
**All** players attend, not just the one who landed.
- A player who is too stressed may drink too much to forget about work.
- A player who is not stressed enough may party too hard.
- The boss attends, so every action feeds back into Boss Rating.

### Meeting (corner)
The landing player gives a presentation; Boss Rating shifts by how it goes, driven by how
many projects they hold.
- Few projects → likely goes well.
- Many projects → likely goes badly.
- **Zero projects → the boss becomes very angry** (worst outcome).

### Chance (×3, marked with dice)
Draws one of 30 chance events affecting the player who landed. Some events are
consequences of that player's own earlier actions rather than fresh random draws.

### Scruples (×3, marked with `?`)
Presents an office-politics dilemma with **three** answers (mouse, or keys 1–3).
The chosen answer produces immediate effects and can also set up delayed consequences.
36 scruples cards exist.

### Power Monger (×1)
The most consequential square. The landing player performs **0–3 actions**, count set by
rank (table in §4). Each action is one of:
- **Do nothing**
- **Cancel a project** — pick any project on the board and destroy it
- **Assign a project** — pick a target player and a project, and move that project to them
  (including to yourself)

Actions may be mixed and repeated freely up to the allowance.

---

## 8. Stock market

A single company-wide share price shared by all players.

- Completing a project raises it, scaled by that project's profile.
- Other events move it in both directions.
- **Price reaching 0 crashes the company and every player loses** — a shared lose state
  distinct from the per-player win.
- Periodically, if the stock is performing well, the boss issues rewards to players
  scaled by rank.

A stock chart window plots price history.

---

## 9. Trading

On their own turn, **before rolling**, a player may attempt trades without limit.

1. Initiator selects one or more projects to give, a target player, and one or more
   projects wanted in return (multi-select supported).
2. Target player accepts or declines.

Trades move project ownership, which immediately re-computes both players' stress and
possibly their set bonuses.

---

## 10. Resigning

A human player may resign at the start of their turn. A computer player with a randomly
chosen personality takes over their seat; the game continues with their position, projects,
rank, and Boss Rating intact.

---

## 11. Computer players

2–6 seats, each Human / Computer / Off. Computer seats pick a personality:

| Personality | Behaviour |
|---|---|
| **Evil** | Office slacker. Pushes work onto others; frames, tramples, and acts nastily without hesitation. |
| **Ambitious** | Wants everything and will pay for it. Overcommits on projects; does whatever it takes to climb. |
| **Goodytwoshoes** | Two drives: help other players, and suck up to the boss. |
| **Average** | Blends the other three. |

All AI choices are additionally weighted by that AI's friendliness toward each other player.

---

## 12. Controls

Main board: `Space` roll · `T` trade · `S` stock chart · `R` resign
New Game: `1`–`6` cycle player type for that seat
Scruples: `1`–`3` select answer

An all-computer game can be aborted with `Esc` during a roll or move.

---

## 13. Procedural project names

Names are composed **adjective + noun**, with separate word pools per profile tier 1–5,
so a name signals difficulty. Low tiers read gentle and small; high tiers read grandiose.
The original shipped roughly 8 adjectives and 8–10 nouns per tier.

This port uses **newly written word pools** following the same tiered structure.

---

## 14. Unresolved

Determined to be encoded in code rather than resources, so approximated in this port and
marked in `src/board.ts`:

- **Exact profile assignment per project square.** Confirmed: squares 1 and 2 are profile 1.
  15 squares over 5 profiles implies 3 per profile. The port uses a symmetric assignment
  and isolates it as a single editable table.
- Precise numeric curves: Boss Rating deltas per profile, promotion/demotion thresholds
  per rank, stock deltas, shoddy probability, meeting outcome bands, project work step
  sizes and bar lengths. The port uses tuned values that reproduce the described
  behaviour and pacing; all live in `src/rules.ts`.
- Save-file format (the original encrypts saves; a stray developer string in `.data`
  admits the algorithm is weak). The port defines its own JSON save format.
