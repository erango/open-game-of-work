# Brief: a modern interface for Open Game of Work

Paste the section below into Claude Design. It asks for **interface design only** — layout,
colour, type, components, states. Illustrative artwork is produced separately; see
`ART-PROMPTS.md`.

---

## The prompt

I'm building a browser reimplementation of *Game of Work*, an office-politics board game
originally published for Windows in 2000. The game logic is finished. What I need is a
**visual design system for the interface** — a considered modern alternative to the original's
grey-Windows-dialog look, without losing the fact that it's a board game about corporate
back-stabbing.

Design the interface only. Do not design illustrations, characters or scene art; those are
being produced separately and drop into fixed slots.

### What the screen contains

**A board**, authored in a fixed 776×535 coordinate space and CSS `transform: scale()`d to fit
the window. Every coordinate below is in that space and must not move — the layout is
transcribed from the original and its geometry is load-bearing.

- A ring of **26 squares** traversed clockwise. Four corners at 140×140; all other squares
  81×81. The top and bottom edges each dip inward one row, forming two U-shaped notches
  rather than a plain rectangle.
- Ring composition: 1 Home corner, 1 Office Party corner, 1 Meeting corner, 1 Business Trip
  corner, **15 project squares**, 3 Chance, 3 Scruples, 1 Power Monger.
- Each **project square** carries three things: a flat tile colour encoding its difficulty
  profile (1–5), a **vertical progress bar 7px wide down its left edge**, and a centred name
  label 73×27 offset 8px from the left so it clears the bar. The bar is drawn full in the
  owner's colour and masked from the top by the work still outstanding — so it fills upward.
- A **centre cluster**: a die control 81×81 at (336,224), a trade control 81×81 at (437,224),
  a resign control 50×50 at (594,296), each with a caption beneath it.
- A **stock ticker**: a small inset readout at (561,214) 106×50, showing the latest change to
  a share price in green or red, with a label above it.
- A **player panel** at (96,172) 205×211 holding up to six rows. Each row is a name, a 16×16
  portrait slot, a **single bordered track 136×16 containing two stacked meters** — Boss
  Rating on top in the player's colour, workload beneath it in red — and a one-letter rank
  badge.
- Up to six **player tokens** move around the ring, and park in a 3×2 grid at (500,106) when
  no game is running.

**A sidebar** (~330px) with the current turn, the share price with a sparkline, and a scrolling
event log. Log entries can carry a small square thumbnail.

**A menu bar** above the board: Game, Options, How to Play, About, with dropdowns and
checkable items.

**Dialogs**, up to ~620px wide, for: New Game (six seat rows, each with a seat-type control,
a name field and a personality select), a three-answer dilemma card, a trade builder with two
multi-select project lists, an action picker, a two-table high-score window, a help window
with a topic list beside scrolling text, and a chart window.

### Constraints

- **No external assets.** No web fonts, no icon libraries, no images. Everything must be
  expressible in CSS and inline SVG. System font stacks only.
- **Two artwork modes.** The user can switch between illustrated artwork and a vector set.
  Your design has to look deliberate in both: with pictures in the tiles, and with only
  colour, type and simple marks.
- **Fixed geometry, flexible surface.** Sizes and positions above are immovable. Colour,
  border, shadow, type, texture, state treatment and the sidebar/dialog layout are yours.
- **Board text scales with the board**, so it grows on large displays. Text sizes in the design
  space are roughly: project names 11px, captions 16px, ticker 31px, player names 15px. Assume
  they may be multiplied by ~0.6–1.0 at large scales.
- **Contrast.** Every text/background pair must clear WCAG AA. Several states combine (an item
  can be selected *and* hovered) — specify those explicitly rather than leaving them to
  cascade.
- Tiles are small. At 1× a project square is 81px holding a colour, a bar and two lines of
  text; the design has to stay legible there, not just in a mockup at 3×.

### The five profile colours are fixed

Recovered from the original and used to identify project difficulty:

```
1  #00b7b7    2  #94bcda    3  #8bb889    4  #debe89    5  #d88fd6
```

They must remain visually distinct from each other and from the six player colours. You may
propose an adjusted palette *alongside* these if you think it reads better, but treat these as
the default.

### Tone

The game is comedy about office politics — projects called things like *Casual Postcard* and
*Titanic Deathstar*, dilemmas about who gets blamed for the fish in the microwave. It should
feel wry and corporate rather than either grim or cartoonish. Think a well-made piece of
software that happens to be about a hostile open-plan office.

### Deliverables

1. A colour system as CSS custom properties, with dark and light variants, covering board
   surface, tiles, panels, text, accents, and success/danger.
2. Type scale and weights for board, sidebar, menu and dialogs.
3. Component specs for: project square (owned / unowned / shoddy), corner square, player row
   with its two meters, token, menu bar and dropdown, dialog shell, segmented control,
   primary/secondary button, log entry with and without a thumbnail.
4. State matrices for anything with more than two states, including combined ones.
5. Rendered mockups of the full board and two dialogs, at 1× and at ~2×.
6. A short note on what you changed and why, so decisions can be argued with.
