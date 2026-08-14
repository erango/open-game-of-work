// Build the art job manifest. This file is the machine-readable source of truth for the
// illustration set; design/ART-PROMPTS.md is the human-readable version of the same thing.
//
// Each job: { kind, id, raw, out, also, size, cutout, shape, prompt, negative }
//   raw    where the generator drops its output
//   out    final path under public/assets/graphics, exactly where the loader looks
//   also   extra outputs at other sizes derived from the same raw image
//   size   final square edge in px (the game's slots are small, 16 to 150)
//   cutout true when the asset is drawn over something else and needs transparency
//
// Run directly to (re)write scripts/art-manifest.json.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// A SEPARATE root from the extracted originals. Sharing one would make the resume check see
// the extracted files and skip every job, and would overwrite them on the way through.
const G = 'public/assets/graphics-gen';

// ---------------------------------------------------------------- house style
// Keep this identical across the whole set. With a free model, consistency between images
// matters far more than the quality of any single one.
const STYLE =
  'flat vector illustration, bold clean outlines, limited palette of teal, sand, dusty pink ' +
  'and slate blue, simple geometric shapes, no gradients, no texture, centred single subject, ' +
  'plain off-white background, generous margin around the subject, retro corporate clip-art feel';

const NEG =
  'photorealistic, 3d render, text, letters, words, watermark, signature, busy background, ' +
  'drop shadow, gradient mesh, clutter, cropped subject, multiple subjects';

/** Six seats, each with a silhouette cue so a 32px avatar still reads. */
const SEATS = [
  'round glasses',
  'long straight hair',
  'a flat cap',
  'a beard',
  'a high ponytail',
  'a bald head and a moustache',
];

const jobs = [];
const add = (j) => {
  jobs.push({
    negative: NEG,
    shape: 'square',
    cutout: false,
    ...j,
    raw: `art/_raw/${j.id}.png`,
    prompt: `${j.subject}, ${STYLE}`,
  });
};

// ---------------------------------------------------------------- tier 1: board faces
const BOARD = [
  ['home', 'homeImage', 140, 'a plain mid-century office block seen straight on, entrance at street level'],
  ['officeparty', 'officePartyImage', 140, 'two paper cups touching in a toast, a few streamers behind them'],
  ['meeting', 'meetingImage', 140, 'a presentation easel holding a chart whose line falls sharply'],
  ['businesstrip', 'businessTripImage', 140, 'a hard-shell suitcase beside a boarding pass with a small aeroplane above'],
  ['chance1', 'chanceImage1', 81, 'two dice mid-tumble'],
  ['chance2', 'chanceImage2', 81, 'a single die resting on one corner'],
  ['chance3', 'chanceImage3', 81, 'three dice stacked in a pyramid'],
  ['scruples1', 'scruplesImage1', 81, 'an oversized question mark inside a speech bubble'],
  ['scruples2', 'scruplesImage2', 81, 'two arrows forking in opposite directions'],
  ['scruples3', 'scruplesImage3', 81, 'a set of balance scales with one pan lower'],
  ['powermonger', 'powerMongerImage', 81, 'a small crown resting in a desk in-tray'],
  ['maketrade', 'makeTradeImage', 81, 'two hands exchanging identical manila folders'],
  ['resign', 'resignImage', 50, 'a cardboard box holding a desk plant and a mug'],
];
for (const [id, file, size, subject] of BOARD) {
  add({ kind: 'board', id, out: `${G}/forms/TMAINFORM/${file}.png`, size, subject });
}

// Die faces. Generated models are poor at exact pip counts, so these are worth drawing by
// hand — see the note in design/ART-PROMPTS.md. Included so the set is complete if you try.
for (let n = 1; n <= 6; n++) {
  add({
    kind: 'die',
    id: `die${n}`,
    out: `${G}/forms/TMAINFORM/dieImageList/${n - 1}.png`,
    size: 81,
    subject: `a single die face showing exactly ${n} pip${n === 1 ? '' : 's'}, seen flat on, red rounded square with white circular pips, no perspective`,
  });
}

// ---------------------------------------------------------------- tier 2: players and seats
SEATS.forEach((feature, i) => {
  add({
    kind: 'player',
    id: `avatar${i + 1}`,
    out: `${G}/forms/TMAINFORM/player${i + 1}Image.png`,
    // The stats panel wants a 16px version of the same face.
    also: [{ out: `${G}/forms/TMAINFORM/playerSmallImageList/${i}.png`, size: 16 }],
    size: 32,
    cutout: true,
    subject: `a simple flat portrait bust of an office worker, shoulders up, facing forward, distinct silhouette, ${feature}`,
  });
});

const SEAT_TYPES = [
  ['human', 'NEWGAMEHUMAN', 'a simple smiling face seen front on'],
  ['computer', 'NEWGAMECOMPUTER', 'a boxy desktop computer with a blank screen'],
  ['off', 'NEWGAMEOFF', 'an empty office chair seen from the side'],
];
for (const [id, file, subject] of SEAT_TYPES) {
  add({ kind: 'seat', id: `seat-${id}`, out: `${G}/res/${file}.png`, size: 64, subject });
}

// ---------------------------------------------------------------- tier 3: event art
const EVENTS = [
  ['finishedproject', 'FINISHEDPROJECT', 'a document with a bold approval stamp across it'],
  ['landown', 'LANDOWN', 'an office worker at a tidy desk, looking pleased'],
  ['landother', 'LANDOTHER', 'an office worker carrying a tall stack of folders that are not theirs'],
  ['setofprojects', 'SETOFPROJECTS', 'four matching folders fanned out in a row'],
  ['stockbonus', 'STOCKBONUS', 'a small pay envelope with the edge of a banknote showing'],
  ['trip', 'TRIP', 'a runway with an aeroplane lifting off'],
  ['drink', 'DRINK', 'a tumbler tipping over with liquid arcing out'],
  ['meetinggood', 'MEETINGGOOD', 'a chart line rising steeply with an approving thumb beside it'],
  ['meetingbad', 'MEETINGBAD', 'a chart line collapsing with an empty chair beside it'],
  ['disbanded1', 'COMPANYDISBANDED1', 'an office block with dark windows and a notice on the door'],
  ['star', 'STAR', 'a single bold five-pointed star'],
  ['scrupleschance', 'SCRUPLESCHANCE', 'a question mark and a die side by side'],
];
for (const [id, file, subject] of EVENTS) {
  add({ kind: 'event', id, out: `${G}/res/${file}.png`, size: 96, subject });
}

// Rank changes, escalating so the sequence reads as a promotion ladder.
const PROMO = [
  'a nameplate on a plain desk',
  'a slightly larger private office',
  'a corner office with two windows',
  'an imposing boardroom chair at the head of a long table',
  'a top-floor office window overlooking a city skyline',
];
PROMO.forEach((subject, i) => {
  add({ kind: 'rank', id: `promo${i + 1}`, out: `${G}/res/RANKPROMO${i + 1}.png`, size: 150, subject });
});
add({ kind: 'rank', id: 'demo', out: `${G}/res/RANKDEMO.png`, size: 150, subject: 'a lone desk pushed out into a bare corridor' });
add({ kind: 'rank', id: 'demo-mailroom', out: `${G}/res/RANKDEMOMAILROOM.png`, size: 150, subject: 'a mail trolley in a windowless basement room' });

// Winners: the same six faces, now behind an enormous desk.
SEATS.forEach((feature, i) => {
  add({
    kind: 'winner',
    id: `president${i + 1}`,
    out: `${G}/res/PLAYER${i + 1}PRES.png`,
    size: 150,
    subject: `an office worker with ${feature} seated behind an enormous executive desk in front of a city window, triumphant`,
  });
});

// ---------------------------------------------------------------- tier 4: party sprites
// Optional and by far the largest job: filter it out with `node scripts/perchance-gen.mjs board`
// or run it alone with `party`.
const POSES = [
  ['playerVerticalImageList', 50, 'standing upright holding a drink, composed'],
  ['playerHammeredImageList', 50, 'slumped with eyes shut and tie askew'],
  ['wobbleLeftImageList', 50, 'leaning hard to the left with arms out for balance'],
  ['wobbleRightImageList', 50, 'leaning hard to the right with arms out for balance'],
  ['crawlImageList', 50, 'on hands and knees'],
  ['playerImageList', 32, 'standing neutral'],
];
for (const [list, size, pose] of POSES) {
  SEATS.forEach((feature, i) => {
    add({
      kind: 'party',
      id: `${list}-${i}`,
      out: `${G}/forms/TOFFICEPARTYFORM/${list}/${i}.png`,
      size,
      cutout: true,
      subject: `a full-body office worker with ${feature}, ${pose}, at an office party`,
    });
  });
}

// ---------------------------------------------------------------- tier 5: chrome
add({
  kind: 'chrome',
  id: 'splash',
  out: `${G}/forms/TSPLASHFORM/Image1.png`,
  size: 512,
  shape: 'landscape',
  // The game overlays its own title, so the top of the frame has to stay quiet.
  subject: 'an office block at dusk with a single lit window, wide establishing view, empty sky across the upper third',
});
add({
  kind: 'chrome',
  id: 'about',
  out: `${G}/forms/TABOUTFORM/Image1.png`,
  size: 512,
  shape: 'landscape',
  subject: 'the same plain office block in flat daylight, wide establishing view',
});
add({
  kind: 'chrome',
  id: 'icon',
  out: `${G}/icon.png`,
  size: 32,
  cutout: true,
  subject: 'a single manila folder seen straight on, one bold emblematic shape',
});

// ---------------------------------------------------------------- card art (optional)
// Illustrations for this port's own decks. Read the matching card in src/cards.ts before
// accepting a result; the subjects here are intentionally generic.
for (let i = 0; i < 30; i++) {
  add({
    kind: 'card',
    id: `chance-card-${i}`,
    out: `${G}/res/CHANCE${i}.png`,
    size: 96,
    subject: 'a wry vignette of an everyday office mishap, one clear subject',
  });
}
for (let i = 0; i < 12; i++) {
  add({
    kind: 'card',
    id: `scruples-card-${i}`,
    out: `${G}/res/SCRUPLES${i}.png`,
    size: 96,
    subject: 'a wry vignette of an office dilemma with two tempting paths, one clear subject',
  });
}

writeFileSync(resolve(ROOT, 'scripts/art-manifest.json'), `${JSON.stringify(jobs, null, 1)}\n`);

const byKind = jobs.reduce((a, j) => ((a[j.kind] = (a[j.kind] || 0) + 1), a), {});
console.log(`${jobs.length} jobs ->  scripts/art-manifest.json`);
console.log(
  Object.entries(byKind)
    .map(([k, n]) => `  ${k}: ${n}`)
    .join('\n'),
);

export { jobs };
