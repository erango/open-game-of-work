# Music prompts

Three tracks per theme, for a generative music tool (written against Google Flow; they work
anywhere that takes a text prompt). A generated set is installed and wired — see **Where the
files live** at the end.

| track | where it plays | length |
|---|---|---|
| **theme** | the splash at launch, once | 20–30s, ending on a resolved chord |
| **play** | under the whole game, looping | 60–120s, seamless loop |
| **party** | the Office Party scene only | 30–45s, seamless loop |

The original shipped exactly one piece of music, `party.mid`, and no theme or play track. This
is additive, so the recovered file stays the party track for the **Original** theme and the
prompt below is only for a machine without an extraction.

## Constraints that apply to every prompt

Paste these with any of the prompts; they are what makes the difference between usable and
unusable, not the genre.

```
instrumental only, no vocals, no lyrics, no vocal samples
seamless loop, identical energy at the start and the end, no fade in, no fade out
no build, no drop, no crescendo, no big finish
consistent volume throughout, no sudden accents, nothing percussive above a soft tap
mid-forward mix leaving the top and bottom of the spectrum quiet, so speech sits over it
```

**The play track is the one that will annoy people.** It runs for the length of a game, which
is 40+ turns, and it plays *under* spoken clips. So:

- **No melody with a hook.** A tune you can hum is a tune you will hear four hundred times.
  Ask for a texture, a slow harmonic movement, a repeating figure that does not resolve.
- **No percussion with a pulse you can tap.** Anything with a beat starts competing with the
  pace of play, which is dictated by clicks, not by bars.
- **Nothing in the 1–4 kHz range**, which is where the speech clips live.
- **Long.** A 20-second loop is recognisable as a loop within two minutes; 90 seconds is not.

The game already ducks music to 14% while a clip plays (`Sound.duck()`), so the track does not
have to solve that itself — but a track with a strong pulse will still fight the announcements
through the duck.

---

## Original — 2000 corporate

The house style is the sound of a Windows 98 machine with a sound card and a General MIDI set.
Own the era rather than apologising for it.

**theme**
```
Late-90s corporate multimedia title music, General MIDI sound set, bright FM electric piano
lead over a synth-brass pad and a simple slap-bass line, straight 110 BPM, major key, tidy
eight-bar phrase resolving on the tonic, the sound of a training CD-ROM opening. Instrumental,
no vocals, clean and unironic, 24 seconds.
```

**play**
```
Late-90s office software background music, General MIDI, muted electric piano playing sparse
sustained chords over a soft warm pad, no drums at all, 70 BPM, one slow chord every two bars
cycling through four chords that never resolve, no melody, no hook, nothing to hum.
Instrumental, seamless loop, constant volume, 90 seconds. Deliberately unmemorable furniture
music that will not wear out over forty minutes.
```

**party**
```
Cheap late-90s MIDI party music, General MIDI sound set, four-on-the-floor synth-bass with a
tinny closed hi-hat, brass stabs and a marimba figure, 118 BPM, major key, relentlessly
cheerful in an office-party-in-the-canteen way. Instrumental, seamless loop, no build, no drop,
40 seconds. Slightly too fast and slightly too happy for the occasion.
```

## Open Plan — this port's own look

Restrained, modern, made of few parts. The visual set is marks and colour with no illustration;
the music should be the same — a small number of clean sounds and a lot of space.

**theme**
```
Minimal modern title music, felted upright piano and a single warm analogue synth pad, four
notes repeating with the pedal down, 84 BPM, gentle and matter-of-fact, resolving cleanly.
Instrumental, dry close-miked piano with light room reverb, no drums, no strings swell,
22 seconds. Understated, like well-made software opening.
```

**play**
```
Quiet ambient background for a strategy game, felted piano single notes and a low sine pad,
no percussion whatsoever, 60 BPM feel with no clear pulse, slow harmonic drift over five
chords, long gaps of near silence between phrases, no melodic hook. Instrumental, seamless
loop, even volume, 110 seconds. Should be possible to forget it is playing.
```

**party**
```
Understated party music heard from the next room, muted funk electric guitar on the offbeat,
soft brushed-kit shuffle, warm electric bass, 104 BPM, filtered as if through a wall and a
closed door. Instrumental, seamless loop, no vocals, no build, 36 seconds. Cheerful but
low-key: someone else's party, and you are still at your desk.
```

## Cyberpunk — the reskin

The visual reskin is deliberately graphic rather than atmospheric — flat shapes, a dark ground,
one thing glowing. The music should follow: **cold and clean, not rain-and-saxophone**. No
noir, no city ambience, no thunder.

**theme**
```
Cold synthwave title music, detuned analogue saw lead over a slow arpeggiated bass, gated
reverb on a single rim shot, 96 BPM, minor key, one bright glassy bell hit at the end.
Instrumental, tight and clean with no rain or crowd ambience, resolving, 26 seconds. Corporate
dystopia in a boardroom, not a back alley.
```

**play**
```
Dark ambient synth background for a long strategy game, low analogue drone and a slow filtered
pad, one soft bell note every eight bars, no drums, no arpeggio, no melody, 55 BPM feel with no
detectable pulse, minor key holding one unresolved chord for a long time. Instrumental,
seamless loop, absolutely even volume, 120 seconds. Cold, patient and easy to ignore, with no
rain, no sirens, no voices, no city noise.
```

**party**
```
Neon-lit office party synth track, dry electro drum machine with a tight closed hat, rubbery
analogue bassline, short stabbed chords, 112 BPM, minor key, one detuned lead riff. No vocals,
no risers, no drop, seamless loop, 40 seconds. Sounds like an open-plan floor at 2am with the
lights left on.
```

---

## Where the files live

Wired and in use. `src/sound.ts` prefers a recorded track and keeps the MIDI path as the party
fallback:

```
public/assets/music/original/{theme,play,party}.mp3
public/assets/music/open-plan/{theme,play,party}.mp3
public/assets/music/cyberpunk/{theme,play,party}.mp3
```

The directory name matches `ThemeName` in `src/theme.ts` (`openPlan` → `open-plan`). Absent
files leave the game silent, except the party, which falls back to the original's own parsed
`.mid` where an extraction is installed — so a fresh clone stays fully playable.

- **theme** starts when the splash is dismissed, not at load: that click is the gesture that
  unblocks audio, and a rejected `play()` would silently be the whole music system. It plays on
  through the New Game window.
- **play** starts when a game begins and loops.
- **party** takes over for the Office Party scene, then the play loop resumes.
- Switching theme restarts whatever is playing from the new set (`Sound.retheme()`).
- Music sits at 0.3 and ducks to 0.1 under spoken clips, on a timer that restarts rather than
  stacking.

`public/assets/` is gitignored, so these are not committed — same as every other asset here.

Two practical notes on the files themselves:

- **Check the loop by playing it four times**, not once. Generators routinely put a half-beat of
  silence or a level change at the seam, which is inaudible on a single pass and obvious on the
  third.
- **Normalise to about −20 LUFS**, well under the speech clips. Music at the same level as the
  announcements is the thing that makes people turn sound off, and turning it off loses the
  announcements too.
