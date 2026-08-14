# Prompt for Claude Code

Paste this into Claude Code from the root of the `open-game-of-work` checkout, with this
handoff folder available (or its contents pasted in).

---

I'm reskinning the interface of this project. `design_handoff_board_redesign/README.md` is the
full specification and `Redesign.dc.html` / `Board.dc.html` in the same folder are the design
references — HTML prototypes of the intended look, not code to copy. `Current UI.dc.html` is a
faithful recreation of how the app renders today, for before/after comparison.

Implement the redesign in this codebase's own idiom: plain TypeScript and DOM, class-based CSS in
`src/style.css`, no runtime dependencies. Hard constraints, all of them already true of this repo:
no web fonts, no icon libraries, no image assets, system font stacks only, everything expressible
in CSS and inline SVG.

Work in this order, and stop after each step so I can look:

1. **Tokens.** Replace the `:root` block in `src/style.css` with the two token sets from the
   README's Design tokens table, switched by `[data-palette="neon"]` on `<html>`. Keep the
   existing variable names where they still apply. Everything downstream must read tokens — no
   literal hex values below `:root` except inside the two palette blocks.

2. **Board.** Update `.sq`, `.sq-corner`, the per-kind classes, `.sq-project` and its parts,
   `.center-btn`, `.bevel` (now removed), `.center-caption`, `.ticker`, `.stats-panel` and
   `.token` to the specs in "Board (776×535 design space)". Then adjust `src/ui.ts` where the
   markup shape changed:
   - project name becomes two elements (adjective line + noun line) inside the existing
     73×27 label box, and a profile numeral is added
   - the progress bar becomes a trough plus a bottom-anchored fill, instead of a full bar with a
     white mask on top — `PROJECT_TILE` still describes the geometry, so keep reading it
   - the die face is drawn as a 3×3 pip grid when no artwork is installed
   - the raised bevel frames go away
   - the active player row gets a band element instead of the `::after` dot
   Do not change any coordinate, size or font size that comes from `src/board.ts` — geometry and
   the recovered font sizes are load-bearing. Do not change `src/board.ts` at all.

3. **Shell.** Menu bar, sidebar cards, log entries per the README. Add the Palette segmented
   control to the menu bar and an Options → Palette item, persisting to `localStorage` under
   `ogow:palette`, following the existing `ogow:snap` pattern.

4. **Dialogs.** Restyle the dialog shell, buttons, segmented control, inputs and list rows in
   `src/style.css`, then update New Game in `src/main.ts`: seat rows become
   `80px 132px minmax(0,1fr) 128px`, the seat-type cycling button becomes a three-state segmented
   control (keep the detached `<select>` as the source of truth so the existing change plumbing
   still works), and the seat artwork renders at its **native 64×64** — it must never be
   resampled. Apply the same shell treatment to Scruples, then carry it across the remaining
   dialogs (trade, power monger, help, high scores, stock chart, about) using the shared specs.

5. **States.** Implement the state matrices explicitly, including the combined cases. In
   particular: locked AI choices keep full opacity with an accent ring and only dim their text;
   disabled buttons change colour rather than taking `opacity`; an open menu item looks identical
   hovered and unhovered.

6. **Verify.** Every text/background pair must clear WCAG AA — 4.5:1 for anything under
   18.66px/700, 3:1 above. Write a small dev-only check (or a test in `test/`) that walks rendered
   text nodes, composites each colour over its nearest opaque ancestor background and asserts the
   ratio, and run it against both palettes with six seats seated. The board's small text is the
   part that regresses easily. Then run `npm test` and `npm run build`.

Notes on decisions in the design that look like bugs but are not, so please keep them:

- Owned project names are dark ink, not the owner's colour. The pale player colours measure
  2–3:1 on the pastel tiles; ownership is carried by the bar.
- Project names are two lines (small-caps adjective over an emphasised noun) because
  `src/names.ts` generates names in the mid-teens of characters, which cannot fit one legible
  line in a 73px box.
- Nothing may be added inside the 205×211 player panel: a six-seat game fills all six rows.
- `Resign` overflows its transcribed 48px caption box by ~1px per side. Leave it; overflow is
  visible and the geometry is from the original.
- The neon palette keeps each profile's hue and raises chroma so board reading transfers between
  palettes.

Ask me before adding any dependency, changing the numbers in `src/rules.ts`, or altering game
behaviour. This is a surface change only.
