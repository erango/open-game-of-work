# Automated art pipeline

Generates an alternative illustration set on [perchance.org](https://perchance.org) through a
real browser, then post-processes each image into the exact slot the game loads. Adapted from
the pipeline in `dungeon-vengeance`, which had already solved the awkward parts.

Three steps, all resumable — existing outputs are skipped, so stop and restart freely.

```bash
npm run art:manifest   # build the job list -> scripts/art-manifest.json (134 jobs)
npm run art:gen        # drive perchance (HEADED) -> art/_raw/<style>/*.png
npm run art:cutout     # cut, resize, place -> public/assets/graphics-gen/, rewrite manifest.txt
npm run art:dice       # DRAW the six die faces (never generated — see below)
```

**Two house styles.** `ART_STYLE=neon` (the default) matches the interface reskin;
`ART_STYLE=flat` is the earlier retro-corporate set. Raw output is per style, so switching
regenerates rather than resuming on top of the other one's images — but both styles write to
the *same* finished paths, so use `FORCE=1 npm run art:cutout` when replacing an installed set.
Every command below takes it:

```bash
ART_STYLE=flat npm run art:gen
```

## One-time setup

```bash
npm i                                    # playwright (no browser download; uses real Chrome)
python3 -m venv .cache/venv
.cache/venv/bin/python -m pip install rembg pillow onnxruntime
```

`npm run art:cutout` picks up `.cache/venv` automatically and falls back to `python3`.

## `art:gen` — read before the first run

**Use real Chrome.** Playwright's bundled Chromium is fingerprinted as a bot and Cloudflare
blocks it. Two modes:

1. **Your own Chrome over CDP** (best, since the profile is trusted). Quit Chrome, then launch
   it with a *dedicated* profile directory — Chrome 136+ refuses debugging on the default one —
   clear Cloudflare once in that window, and connect:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/ogow-chrome"
   CDP=1 npm run art:gen
   ```
2. **Let the script launch Chrome** with a persistent profile in `.cache/chrome-perchance/`:
   just `npm run art:gen`, and solve any Cloudflare challenge once in the window.

Useful flags:

```bash
node scripts/perchance-gen.mjs board      # one kind: board die player seat event rank winner party chrome card
node scripts/perchance-gen.mjs home       # one id, or any substring
FORCE=1 node scripts/perchance-gen.mjs home
SEED=123456 npm run art:gen               # default 770770, fixed so the set stays coherent
```

Per job it pins **style → No style** so the prompt drives the result, sets the shape from the
job, sets the seed, types the prompt with real keystrokes, clicks generate, and waits for a
*new* result in the embed frame, rejecting anything under 6 kB.

If perchance changes its markup, re-probe the selectors — the ones in use are
`textarea.paragraph-input[data-name="description"]` for the prompt (note: **not**
`#positivePromptInput`, which is a decoy tag box), `#generateButtonEl`, `#imageSeed`, and the
style/shape `<select>`s found by their option text.

## `art:cutout`

- **Per-job size.** Targets run from 16px portraits to 150px rank art, so the size comes from
  the job, not one global setting.
- **Written at 3x the slot** (`ART_SCALE`, clamped so nothing is ever upscaled past what was
  generated). Every slot is sized by layout, so the intrinsic resolution is free detail: the
  board is transform-scaled and routinely renders at 1.4-2.6x, and writing a 140px tile out of a
  768px generation threw the rest away and then upscaled what was left. That, plus the
  nearest-neighbour rendering the original art needs, was what made the generated set look
  pixelated.
- **Per-job transparency.** Board tiles are drawn edge to edge and keep their background.
  Anything drawn *over* something else — tokens, party sprites, the icon — is cut out with
  `rembg`, trimmed to content and padded to a centred square so nothing clips.
- **Derived sizes.** The 16px stats portrait is a downscale of the 32px avatar rather than its
  own generation, so the two can never drift apart.
- **Landscape jobs** (splash, about) keep their aspect ratio.
- **Rewrites `graphics-gen/manifest.txt`** from what is on disk, which is how the game discovers
  the set. The extracted originals have their own manifest and are never touched.

```bash
npm run art:cutout -- party        # filter by kind or id
FORCE=1 npm run art:cutout         # redo existing
ART_SCALE=1 npm run art:cutout     # write at the slot size exactly, no headroom
REMBG_MODEL=u2net npm run art:cutout   # lighter model; default birefnet-general is ~1GB
```

## Where the prompts live

`scripts/art-manifest.mjs` is the machine-readable source: a shared house-style string plus a
subject per slot. `design/ART-PROMPTS.md` is the same thing written for a human, with the
reasoning and the tier ordering. Edit the `.mjs` and re-run `npm run art:manifest`.

Two things worth keeping in mind:

- **The die faces are drawn, not generated** — `npm run art:dice`. This is not a preference:
  asked for three pips a model returns a plausible die in perspective with pips on every
  visible face, and at 81px the count is the only information a die face carries. The jobs stay
  in the manifest with `drawn: true` so the prompts are on record; `art:gen` and `art:cutout`
  both skip them, and even `FORCE=1` cannot overwrite the drawn faces.
- **The splash needs its upper third quiet**, because the game overlays its own title there.

## Output and licensing

Everything lands in `public/assets/graphics-gen/`, deliberately **separate** from the extracted
originals in `public/assets/graphics/`. Sharing one directory would have made the generator's
resume check see the extracted files and skip every job, and would have overwritten them on the
way through.

The game treats them as two independent sets and lists whichever are installed under
**Options**, alongside the built-in vector set, so all three can be compared without moving
files around.

Both directories are gitignored. A generated set is **your own work**, so if you want it
committed, add a negative pattern for `public/assets/graphics-gen/` rather than dropping the
rule that protects the extracted material.
