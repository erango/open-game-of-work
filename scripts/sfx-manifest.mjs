// The scene sound effects, per theme. Machine-readable source of truth; design/SFX-PROMPTS.md is
// the same thing written for a human.
//
// Only the cues worth *recording* are here. Everything that fires often — roll, move, trade, the
// clicks — is synthesised at runtime in src/sfx.ts, because a recording played hundreds of times
// a game is exactly what makes a game feel cheap. These are the once-or-twice-a-game moments
// that want texture a synth cannot give: a room of people, a siren, applause.
//
// Speech is deliberately absent. The per-name and per-seat clips belong to the original.
//
// Run directly to (re)write scripts/sfx-manifest.json.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'public/assets/sfx';

/** Themes that get their own set. `original` is excluded: it has the recovered WAVs. */
const THEMES = ['open-plan', 'cyberpunk'];

/**
 * Per cue: how long, and what it is in each voice.
 *
 * `seconds` is the *target* length; the generator overshoots and the post step trims. Keep these
 * short. A sting that outlasts the dialog it announces is worse than no sting.
 */
const CUES = [
  {
    cue: 'officeParty',
    seconds: 4,
    'open-plan':
      'A small office party heard from just outside the room: muffled chatter of a dozen people, ' +
      'a few laughs, glasses touching, a chair scraping. No music. Dry, close, indoors.',
    cyberpunk:
      'A cramped neon-lit office party: a dozen people talking over a low synth thud through a ' +
      'wall, glass capsules clinking, one electronic laugh. Dry, indoors, no rain, no sirens.',
  },
  {
    cue: 'win',
    seconds: 5,
    'open-plan':
      'A small group of office workers breaking into genuine applause and a couple of cheers in a ' +
      'carpeted room, settling after four seconds. Dry, close, no music, no reverb tail.',
    cyberpunk:
      'A short triumphant synth chord swelling over a small crowd of people cheering in a large ' +
      'atrium, one bright electronic sparkle at the end. No drums, no vocals, no rain.',
  },
  {
    cue: 'crash',
    seconds: 5,
    'open-plan':
      'A trading floor losing it: a sharp collective groan from a dozen people, papers falling, ' +
      'a phone knocked off a desk, then silence. Dry, indoors, no music.',
    cyberpunk:
      'A financial system failing: a descending electronic alarm tone, a low power-down hum, ' +
      'glass panels cracking once, then silence. No voices, no rain, no explosion.',
  },
  {
    cue: 'meetingTerrible',
    seconds: 3,
    'open-plan':
      'A meeting going badly: one cough in a silent room, a chair creaking, papers being ' +
      'straightened. Very quiet, dry, close, no music.',
    cyberpunk:
      'A presentation failing: a projector powering down with a falling whine, one dry electronic ' +
      'error beep, a room going quiet. No voices, no music.',
  },
  {
    cue: 'businessTrip',
    seconds: 4,
    'open-plan':
      'A departure: a rolling suitcase on a hard floor for two seconds, a distant airport ' +
      'announcement chime, a door closing. Dry, no voices, no music.',
    cyberpunk:
      'A transit pod leaving: a magnetic clamp releasing, a rising electric whine passing left to ' +
      'right, a soft pressure hiss. No engine roar, no rain, no voices.',
  },
  {
    cue: 'resign',
    seconds: 3,
    'open-plan':
      'Leaving a job: a cardboard box set down on a desk, then a drawer closing, then a badge ' +
      'dropped on a hard surface. Three distinct sounds one after another, continuous with no ' +
      'gaps between them, dry, close, no music, no voices.',
    cyberpunk:
      'Access being revoked: a badge reader refusing with two flat tones, a lock disengaging, a ' +
      'light strip powering down. No voices, no music.',
  },
  {
    cue: 'powerMonger',
    seconds: 3,
    'open-plan':
      'Quiet menace in an office: a heavy door closing on a latch, a single slow footstep on ' +
      'carpet, a desk drawer being locked. Dry, close, no music.',
    cyberpunk:
      'An override being taken: a deep servo actuating, a low authoritative synth swell, one ' +
      'hard relay click. No voices, no music, no rain.',
  },
  // Promotion is rank-indexed. Five steps, escalating from a shrug to a coronation, so the sound
  // has to carry the difference between them — one clip for all five would flatten the ladder.
  ...[1, 2, 3, 4, 5].map((rank) => ({
    cue: `promotion${rank}`,
    seconds: rank <= 2 ? 2.5 : rank === 5 ? 5 : 3.5,
    'open-plan': [
      // Not "very short": asked for that, the model returned a 0.3s blip padded with silence.
      'A modest congratulation: one person says well done, a light pat on the back, then a chair ' +
        'turning and a keyboard resuming. Three distinct sounds in sequence, dry, no music.',
      'A small congratulation in an office: three or four people giving a brief round of applause. ' +
        'Dry, close, no music.',
      'A promotion: a dozen people applauding warmly for three seconds in a carpeted room, one ' +
        'whistle. Dry, no music.',
      'A significant promotion: a room of people applauding and cheering, a champagne cork, ' +
        'glasses touching. Dry, indoors, no music.',
      'A coronation in a boardroom: a large room of people applauding and cheering, a ceremonial ' +
        'chime, a heavy door opening onto it. Dry, no music.',
    ][rank - 1],
    cyberpunk: [
      'A system acknowledging a small privilege upgrade: two soft ascending electronic tones, a ' +
        'relay click, then a short data chirp. Four distinct sounds in sequence with no gaps, ' +
        'dry, no music.',
      'A clearance level increasing: three ascending synth tones and a light data chirp. Dry, no ' +
        'music, no voices.',
      'A promotion in a corporate system: four ascending synth tones, a bright confirmation ' +
        'chime, a distant crowd of people approving. Dry.',
      'A major clearance upgrade: a rising synth arpeggio, a heavy lock releasing, a small crowd ' +
        'of people cheering in an atrium. No rain, no sirens.',
      'Absolute authority granted: a deep power-up swell, a rising synth fanfare, a large crowd ' +
        'of people cheering, one vast bell. No rain, no drums.',
    ][rank - 1],
  })),
];

/**
 * Constraints appended to every prompt. These matter more than the wording of any one of them:
 * the same failure modes come back every time otherwise — music underneath, a reverb tail that
 * outlasts the moment, or a tempting but useless voice-over.
 */
const SUFFIX =
  'Sound effect only. No music, no melody, no singing, no speech, no intelligible words. ' +
  'Dry and close, minimal reverb, no long tail. Starts immediately with no silence at the front.';

const jobs = [];
for (const spec of CUES) {
  for (const theme of THEMES) {
    jobs.push({
      id: `${theme}/${spec.cue}`,
      theme,
      cue: spec.cue,
      seconds: spec.seconds,
      raw: `art/_sfx_raw/${theme}/${spec.cue}.mp3`,
      out: `${OUT}/${theme}/${spec.cue}.mp3`,
      prompt: `${spec[theme]} ${SUFFIX}`,
    });
  }
}

writeFileSync(resolve(ROOT, 'scripts/sfx-manifest.json'), `${JSON.stringify(jobs, null, 1)}\n`);
console.log(`${jobs.length} sfx jobs (${THEMES.length} themes x ${CUES.length} cues) -> scripts/sfx-manifest.json`);

export { jobs };
