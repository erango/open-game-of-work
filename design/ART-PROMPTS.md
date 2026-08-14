# Art prompts for an alternative illustration set

**These prompts are automated.** `scripts/art-manifest.mjs` holds the same house style and
subjects in machine-readable form, and `npm run art:gen` drives perchance through a real
browser to produce the whole set — see `scripts/README-art-pipeline.md`. This document is the
human-readable version: the reasoning, the tier ordering, and what to check. Edit the `.mjs`
and re-run `npm run art:manifest` if you change a prompt.

Prompts for a free image generator (Perchance, or anything similar). The goal is an **original**
illustrated set for the same functional slots the game already has — not a reproduction of the
2000 game's drawings. Never ask a generator to imitate, recreate or match the original's
artwork; describe the subject and let it invent.

If you produce a complete set, it can be committed to the repo under your own licence, since
it would be entirely your work.

---

## House style

Prepend this to every prompt so the set holds together. Adjust the two bracketed choices once,
then keep them identical across every generation — consistency matters far more than any single
image.

```
flat vector illustration, bold clean outlines, limited palette of [teal, sand, dusty pink,
slate blue], simple geometric shapes, no gradients, no texture, centred single subject,
plain [off-white] background, generous margin around the subject, retro corporate clip-art
feel, 1:1 square
```

Negative prompt, every time:

```
photorealistic, 3d render, text, letters, words, watermark, signature, busy background,
drop shadow, gradient mesh, clutter, cropped subject, multiple subjects
```

### Practical notes

- Generate square at whatever size the tool offers (512 or 1024), then downscale to the target
  below. Downscale with a **smooth** filter for these illustrations — they are not pixel art.
- Backgrounds: these generators cannot do transparency. Keep the background flat and identical
  everywhere so tiles read as a set; the game draws them edge to edge.
- The tiles are **small**. A subject that needs fine detail will not survive 81px. Prefer one
  large, simple, high-contrast shape per image. Check every result downscaled before accepting.
- Generate 4–6 candidates per slot and pick; free models vary wildly.

---

## Tier 1 — board faces (do these first, they carry the board)

| Target file | Size | Prompt subject |
|---|---|---|
| `forms/TMAINFORM/homeImage.png` | 140² | a plain mid-century office block seen straight on, entrance at street level |
| `forms/TMAINFORM/officePartyImage.png` | 140² | two paper cups touching in a toast, a few streamers behind them |
| `forms/TMAINFORM/meetingImage.png` | 140² | a presentation easel holding a chart whose line falls sharply |
| `forms/TMAINFORM/businessTripImage.png` | 140² | a hard-shell suitcase beside a boarding pass, a small aeroplane above |
| `forms/TMAINFORM/chanceImage1.png` | 81² | two dice mid-tumble |
| `forms/TMAINFORM/chanceImage2.png` | 81² | a single die resting on its corner |
| `forms/TMAINFORM/chanceImage3.png` | 81² | three dice stacked in a pyramid |
| `forms/TMAINFORM/scruplesImage1.png` | 81² | an oversized question mark in a speech bubble |
| `forms/TMAINFORM/scruplesImage2.png` | 81² | two arrows forking in opposite directions |
| `forms/TMAINFORM/scruplesImage3.png` | 81² | a set of balance scales, one pan lower |
| `forms/TMAINFORM/powerMongerImage.png` | 81² | a small crown resting on a desk in-tray |
| `forms/TMAINFORM/makeTradeImage.png` | 81² | two hands exchanging identical manila folders |
| `forms/TMAINFORM/resignImage.png` | 50² | a cardboard box holding a desk plant and a mug |

**Die faces** — `forms/TMAINFORM/dieImageList/0.png` … `5.png`, 81² each, showing **1 through 6
pips in order** (file `0` is one pip). These are the one place to abandon the illustration style
and just draw them: a plain rounded square with round pips renders far better at 81px than
anything a generator will give you. Six SVGs by hand, or six prompts:

```
a single [N]-pip die face seen flat on, red rounded square, white circular pips, no
perspective, centred, plain off-white background
```

## Tier 2 — players and seats

**Six player avatars** — `forms/TMAINFORM/player1Image.png` … `player6Image.png`, 32² each.
Tiny, so faces need to be almost emblematic. One prompt each, keeping the same framing:

```
simple flat portrait bust of an office worker, shoulders up, facing forward, distinct
silhouette, [distinguishing feature], plain off-white background
```

Vary only the bracketed feature across the six: *round glasses* · *long straight hair* ·
*a flat cap* · *a beard* · *a high ponytail* · *a bald head and moustache*. One seat in the
original was a dog, which is worth keeping as a joke — make one of the six a dog in a collar.

Then downscale each to 16² for `forms/TMAINFORM/playerSmallImageList/0.png` … `5.png`, in the
same seat order.

**Seat types** — 64² each, and these must read at a glance since they label a control:

- `res/NEWGAMEHUMAN.png` — a simple smiling face, front on
- `res/NEWGAMECOMPUTER.png` — a boxy desktop computer with a blank screen
- `res/NEWGAMEOFF.png` — an empty chair seen from the side

## Tier 3 — event illustrations

Shown beside log entries and heading result dialogs. 96² is plenty; the game scales them down.

| File | Subject |
|---|---|
| `res/FINISHEDPROJECT.png` | a stamped document, the stamp reading nothing legible |
| `res/LANDOWN.png` | a worker at a tidy desk, pleased |
| `res/LANDOTHER.png` | a worker carrying a stack of folders that is not theirs |
| `res/SETOFPROJECTS.png` | four matching folders fanned out in a row |
| `res/STOCKBONUS.png` | a small envelope with a banknote edge showing |
| `res/TRIP.png` | a runway with a plane lifting off |
| `res/DRINK.png` | a tumbler tipping, liquid arcing out |
| `res/MEETINGGOOD.png` | a chart line rising, an approving thumb beside it |
| `res/MEETINGBAD.png` | a chart line collapsing, an empty chair beside it |
| `res/COMPANYDISBANDED1.png` | an office block with its windows dark and a sign on the door |
| `res/STAR.png` | a single bold five-pointed star |
| `res/SCRUPLESCHANCE.png` | a question mark and a die side by side |

**Rank changes** — 150² each. `res/RANKPROMO1.png` … `RANKPROMO5.png` show an ascending
sequence, so the subject should escalate: *a nameplate on a desk* · *a slightly larger office* ·
*a corner office window* · *a boardroom chair* · *a top-floor view over the city*. Then
`res/RANKDEMO.png` — a desk moved into a corridor. `res/RANKDEMOMAILROOM.png` — a mail trolley
in a windowless room.

**Winners** — `res/PLAYER1PRES.png` … `PLAYER6PRES.png`, 150² each: the matching avatar from
Tier 2, now behind an enormous desk with a city window, same distinguishing feature so the
seat is recognisable.

## Tier 4 — party animation (optional, 30 images)

The office-party scene animates by alternating frames. Six players × five poses, 50² each,
under `forms/TOFFICEPARTYFORM/<list>/<seat>.png`:

| List | Pose |
|---|---|
| `playerVerticalImageList` | standing upright, drink in hand, composed |
| `playerHammeredImageList` | slumped, eyes shut, tie askew |
| `wobbleLeftImageList` | leaning hard to the left, arms out |
| `wobbleRightImageList` | leaning hard to the right, arms out |
| `crawlImageList` | on hands and knees |
| `playerImageList` | 32², standing neutral |

Full-body, same distinguishing feature per seat as the avatars. This is the largest job in the
set and entirely skippable — without it the party still works, just without sprites.

## Tier 5 — the rest

- `forms/TSPLASHFORM/Image1.png` — a title card, roughly 4:3, an office block at dusk with one
  window lit. The game overlays its own title text, so **leave the upper third clear**.
- `forms/TABOUTFORM/Image1.png` — the same building in daylight, roughly 4:3.
- `icon.png` — 32², one bold emblematic shape that survives a browser tab: a single manila
  folder, or a die.
- **Card art** for this port's own decks, if you want it: 30 Chance and 12 Scruples, 96² each,
  named `res/CHANCE0.png` … `CHANCE29.png` and `res/SCRUPLES0.png` … `SCRUPLES11.png`. Read the
  matching card in `src/cards.ts` and illustrate its situation. Lowest priority, highest volume.

---

## Installing a finished set

The loader is driven by a manifest, so a new set drops in with no code change:

1. Put the files at the paths above under `public/assets/graphics/`.
2. Write `public/assets/graphics/manifest.txt` — one relative path per line, exactly matching.
3. Reload. **Options → Original artwork** switches between your set and the built-in vector one.

`public/assets/` is gitignored by default, since it normally holds material extracted from the
original. A set you generated yourself is your own work, so if you want it committed, add an
exception in `.gitignore` for that directory rather than removing the rule.
