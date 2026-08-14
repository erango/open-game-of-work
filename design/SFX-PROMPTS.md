# Sound effect prompts

Two mechanisms, split by how often a cue fires. This is the whole design, and getting the split
right matters more than the prompts.

| | frequent cues | scene cues |
|---|---|---|
| examples | `roll`, `move`, `trade`, clicks | `officeParty`, `win`, `crash`, `promotion:N` |
| how often | hundreds of times a game | once or twice |
| produced by | `src/sfx.ts`, synthesised at play time | generated files, this document |
| why | a recording played that often is what makes a game feel cheap | a room of people is not an envelope |

`move` fires once per square. There is no recording good enough to survive four hundred plays;
a voice built per call, with its pitch and level nudged each time, never quite repeats. Scene
cues have the opposite problem — applause, a siren, a group groan — which no synth will give you.

**Speech is not generated.** The per-name and per-seat clips belong to the original, and a
synthesised substitute for six fixed names would be worse than silence.

## Generating

`scripts/sfx-manifest.mjs` holds the prompts; this file is the reasoning. 24 clips — 12 cues ×
2 themes (Original keeps the recovered WAVs, so it has no set).

```bash
ELEVENLABS_API_KEY=... npm run sfx:gen     # -> art/_sfx_raw/<theme>/<cue>.mp3
npm run sfx:post                           # -> public/assets/sfx/<theme>/<cue>.mp3
```

Both steps are resumable and skip what exists; `FORCE=1` redoes it. `npm run sfx:gen -- win`
filters by any substring of `<theme>/<cue>`.

The endpoint is `POST https://api.elevenlabs.io/v1/sound-generation` with
`model_id: eleven_text_to_sound_v2`. `prompt_influence` is raised to **0.6** from the 0.3
default: these prompts are specific, and the failure mode is the model inventing music or a
voice-over rather than following them. Override with `PROMPT_INFLUENCE`.

## What the prompts are shaped around

Every prompt ends with the same suffix, and it earns its place — these are the failure modes
that come back otherwise:

```
Sound effect only. No music, no melody, no singing, no speech, no intelligible words.
Dry and close, minimal reverb, no long tail. Starts immediately with no silence at the front.
```

- **"No music"** twice over, because a text-to-sound model reaches for a bed under anything
  emotional, and a bed fights the actual soundtrack.
- **"No speech, no intelligible words"** — crowd chatter is wanted, dialogue is not. Words in a
  clip that plays every office party become unbearable on the third hearing.
- **"Dry and close, no long tail"** — a sting that outlasts the dialog it announces is worse
  than no sting.
- **Cyberpunk prompts explicitly exclude rain and sirens.** The visual reskin is graphic rather
  than atmospheric for the same reason, and a rain bed under every event turns the game into a
  different one.

Promotion is five separate prompts, not one clip reused. The ladder escalates from *two people
saying well done* to *a coronation in a boardroom*; one sound for all five would flatten the
one progression the game is built around.

## Why `sfx:post` exists

This is the step that separates usable from amateur, and the one everybody skips. In order of
how much it matters:

1. **Leading silence.** Generators routinely return 100–300ms of nothing before the sound. On a
   cue that fires the moment you click, that reads as lag in the game, not in the audio.
2. **Level.** Every cue is peak-normalised to −12 dBFS, so none is startling and none is lost
   under the −20 LUFS music bed. Most amateur-sounding audio is only badly gain-staged.
3. **The tail.** A 5s request often comes back with 2s of room decay. Trailing silence is cut
   and a 50ms fade applied so nothing clicks off.

Peak normalisation rather than `loudnorm`, deliberately: EBU R128 integrated loudness is not
meaningful on a 2-second one-shot, and `loudnorm`'s true-peak parameter cannot go below −9 dB.
The trim uses the `areverse` idiom, since `silenceremove` only works forwards.

## How the game picks a source

`Sound.play` in order:

1. Under the **Original** theme, the extracted recordings win — they are the point of that theme.
2. Otherwise, a **scene recording** for the current theme if one is installed.
3. Otherwise, the **synth** voice for that theme (`office` or `cyber`).
4. Speech always falls through to a recording, whatever the theme.

The first play of a scene cue happens while its file is still being probed, so the synth covers
that one instance and every later play uses the recording — a cue is never silent waiting on a
`HEAD`. `src/sceneCues.ts` states which cues have recordings, so the frequent ones never probe
at all; the suite checks that list, the rank clamp and the speech exclusion.

`public/assets/` is gitignored, so generated audio is not committed, same as every other asset.
