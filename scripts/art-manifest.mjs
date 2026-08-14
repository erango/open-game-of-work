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
// Two named styles, chosen with ART_STYLE. Keep whichever you pick identical across the whole
// set: with a free model, consistency between images matters far more than the quality of any
// single one.
//
//   ART_STYLE=neon   (default) matches the interface reskin — see design/handoff/README.md
//   ART_STYLE=flat            the earlier retro-corporate clip-art set
//
// Raw output is kept per style, so switching styles regenerates rather than silently resuming
// on top of the other one's images.
const STYLES = {
  flat: {
    style:
      'flat vector illustration, bold clean outlines, limited palette of teal, sand, dusty pink ' +
      'and slate blue, simple geometric shapes, no gradients, no texture, centred single subject, ' +
      'plain off-white background, generous margin around the subject, retro corporate clip-art feel',
    negative:
      'photorealistic, 3d render, text, letters, words, watermark, signature, busy background, ' +
      'drop shadow, gradient mesh, clutter, cropped subject, multiple subjects',
  },
  neon: {
    // Deliberately flat and graphic rather than atmospheric: these are 50-140px tiles, and a
    // hazy rain-slicked street reads as mud at that size. The neon does the work, the shapes
    // stay simple, and the ground is the dark slate the reskinned board sits on.
    style:
      'flat vector illustration, bold clean outlines, near-black slate background, neon magenta ' +
      'and electric cyan accents with cold steel grey, one bright emissive highlight per image, ' +
      'simple geometric shapes, no gradients, no texture, centred single subject, generous ' +
      'margin around the subject, cyberpunk corporate iconography, high contrast',
    // 'pile, heap, debris' earns its place: asked for several objects the model stacks them
    // into rubbish. 'white background' likewise — a few generations came back on white, which
    // is glaringly wrong on a dark board.
    negative:
      'photorealistic, 3d render, text, letters, words, watermark, signature, busy background, ' +
      'rain, fog, haze, crowd, city clutter, drop shadow, gradient mesh, clutter, cropped ' +
      'subject, multiple subjects, warm sunlight, pastel, pile, heap, stack of objects, ' +
      'debris, junk, rubbish, white background, light background',
  },
};

const STYLE_NAME = process.env.ART_STYLE === 'flat' ? 'flat' : 'neon';
const { style: STYLE, negative: NEG } = STYLES[STYLE_NAME];

/**
 * Six seats, each with a silhouette cue so a 32px avatar still reads. The neon set keeps the
 * same six silhouettes — a seat has to stay recognisable between its avatar, its party sprite
 * and its winner card — and adds the hardware.
 */
const SEATS =
  STYLE_NAME === 'neon'
    ? [
        'round mirrored glasses',
        'long straight hair with a glowing dermal implant at the temple',
        'a flat cap and a wired earpiece',
        'a beard and a jawline plate',
        'a high ponytail and a neck jack',
        'a bald chromed head and a moustache',
      ]
    : [
        'round glasses',
        'long straight hair',
        'a flat cap',
        'a beard',
        'a high ponytail',
        'a bald head and a moustache',
      ];

const jobs = [];
const add = (j) => {
  const { subject, subjectNeon, ...rest } = j;
  // A subject may name a period-specific thing (a mid-century office block, a boxy desktop).
  // Where the register matters, the neon set supplies its own.
  const chosen = STYLE_NAME === 'neon' && subjectNeon ? subjectNeon : subject;
  jobs.push({
    negative: NEG,
    shape: 'square',
    cutout: false,
    ...rest,
    subject: chosen,
    raw: `art/_raw/${STYLE_NAME}/${j.id}.png`,
    prompt: `${chosen}, ${STYLE}`,
  });
};

// ---------------------------------------------------------------- tier 1: board faces
const BOARD = [
  ['home', 'homeImage', 140,
    'a plain mid-century office block seen straight on, entrance at street level',
    'a corporate arcology tower seen straight on, one lit lobby entrance at street level'],
  ['officeparty', 'officePartyImage', 140,
    'two paper cups touching in a toast, a few streamers behind them',
    // 'two capsules touching' produced two unreadable cylinders. A single glass has a
    // silhouette that survives 140px and cannot be mistaken for anything else.
    'one single tall champagne flute seen straight on, glowing bubbles rising inside it, nothing else in the frame, dark near-black background'],
  ['meeting', 'meetingImage', 140,
    'a presentation easel holding a chart whose line falls sharply',
    // A chart *line* is too fine at this size; one bold arrow carries the same meaning.
    'one single presentation screen on a stand, seen straight on, one bold glowing arrow pointing sharply down on it, nothing else in the frame, dark near-black background'],
  ['businesstrip', 'businessTripImage', 140,
    'a hard-shell suitcase beside a boarding pass with a small aeroplane above',
    // One object, not three. Naming a case *and* a chit *and* an aircraft got all three
    // merged into a heap on top of a suitcase — it read as an overflowing skip.
    'one single hard-shell rolling travel case standing upright, seen straight on, telescopic handle extended and glowing cyan, nothing else in the frame, dark near-black background'],
  ['chance1', 'chanceImage1', 81, 'two dice mid-tumble', 'two dice mid-tumble, edges lit'],
  ['chance2', 'chanceImage2', 81, 'a single die resting on one corner',
    'a single die balanced on one corner, edges lit'],
  ['chance3', 'chanceImage3', 81, 'three dice stacked in a pyramid',
    'three dice stacked in a pyramid, edges lit'],
  ['scruples1', 'scruplesImage1', 81, 'an oversized question mark inside a speech bubble',
    'an oversized glowing question mark inside a hard-edged speech bubble'],
  ['scruples2', 'scruplesImage2', 81, 'two arrows forking in opposite directions',
    'two glowing arrows forking in opposite directions'],
  ['scruples3', 'scruplesImage3', 81, 'a set of balance scales with one pan lower',
    'a set of balance scales with one pan lower, the low pan glowing'],
  ['powermonger', 'powerMongerImage', 81, 'a small crown resting in a desk in-tray',
    'a small crown resting in a steel in-tray, crown glowing'],
  ['maketrade', 'makeTradeImage', 81, 'two hands exchanging identical manila folders',
    'two hands exchanging identical glowing data shards'],
  ['resign', 'resignImage', 50, 'a cardboard box holding a desk plant and a mug',
    'a crate holding a dying desk plant and a mug, one dead light strip'],
];
for (const [id, file, size, subject, subjectNeon] of BOARD) {
  add({ kind: 'board', id, out: `${G}/forms/TMAINFORM/${file}.png`, size, subject, subjectNeon });
}

// Die faces are DRAWN, not generated: `npm run art:dice`. An image model will not give an
// exact pip count — asked for three it returns a plausible die in perspective with pips on
// every visible face — and at 81px the count is the only information a die face carries. The
// jobs stay listed with `drawn: true` so the prompts are on record; the generator and the
// cutout step both skip them, and a FORCE cutout cannot overwrite the drawn faces.
for (let n = 1; n <= 6; n++) {
  add({
    kind: 'die',
    id: `die${n}`,
    drawn: true,
    out: `${G}/forms/TMAINFORM/dieImageList/${n - 1}.png`,
    size: 81,
    subject: `a single die face showing exactly ${n} pip${n === 1 ? '' : 's'}, seen flat on, red rounded square with white circular pips, no perspective`,
    subjectNeon: `a single die face showing exactly ${n} pip${n === 1 ? '' : 's'}, seen flat on, dark rounded square with glowing magenta circular pips, no perspective`,
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
    subjectNeon: `a simple flat portrait bust of a corporate operative, shoulders up, facing forward, distinct silhouette, ${feature}, rim-lit in neon`,
  });
});

const SEAT_TYPES = [
  ['human', 'NEWGAMEHUMAN', 'a simple smiling face seen front on',
    'a simple face seen front on, one eye replaced by a glowing lens'],
  ['computer', 'NEWGAMECOMPUTER', 'a boxy desktop computer with a blank screen',
    'a server blade with a single glowing status light'],
  ['off', 'NEWGAMEOFF', 'an empty office chair seen from the side',
    'an empty chair seen from the side, its light strip dark'],
];
for (const [id, file, subject, subjectNeon] of SEAT_TYPES) {
  add({ kind: 'seat', id: `seat-${id}`, out: `${G}/res/${file}.png`, size: 64, subject, subjectNeon });
}

// ---------------------------------------------------------------- tier 3: event art
const EVENTS = [
  ['finishedproject', 'FINISHEDPROJECT', 'a document with a bold approval stamp across it',
    'a data slab with a bold glowing approval sigil across it'],
  ['landown', 'LANDOWN', 'an office worker at a tidy desk, looking pleased',
    'an operative at a tidy terminal desk, lit from the screen, pleased'],
  ['landother', 'LANDOTHER', 'an office worker carrying a tall stack of folders that are not theirs',
    'an operative carrying a tall stack of glowing data slabs that are not theirs'],
  ['setofprojects', 'SETOFPROJECTS', 'four matching folders fanned out in a row',
    'four matching data shards fanned out in a row, all lit'],
  ['stockbonus', 'STOCKBONUS', 'a small pay envelope with the edge of a banknote showing',
    'a credit chip with its balance strip glowing'],
  ['trip', 'TRIP', 'a runway with an aeroplane lifting off',
    'a lit landing pad with a shuttle lifting off'],
  ['drink', 'DRINK', 'a tumbler tipping over with liquid arcing out',
    'a capsule tipping over with luminous liquid arcing out'],
  ['meetinggood', 'MEETINGGOOD', 'a chart line rising steeply with an approving thumb beside it',
    'a holographic chart line rising steeply, an approving thumb beside it'],
  ['meetingbad', 'MEETINGBAD', 'a chart line collapsing with an empty chair beside it',
    'a holographic chart line collapsing, an empty chair beside it'],
  ['disbanded1', 'COMPANYDISBANDED1', 'an office block with dark windows and a notice on the door',
    'an arcology tower with every window dark and a sealed door'],
  ['star', 'STAR', 'a single bold five-pointed star', 'a single bold five-pointed star, emissive'],
  ['scrupleschance', 'SCRUPLESCHANCE', 'a question mark and a die side by side',
    'a glowing question mark and a die side by side'],
];
for (const [id, file, subject, subjectNeon] of EVENTS) {
  add({ kind: 'event', id, out: `${G}/res/${file}.png`, size: 96, subject, subjectNeon });
}

// Rank changes, escalating so the sequence reads as a promotion ladder.
const PROMO = [
  ['a nameplate on a plain desk', 'a glowing nameplate on a plain steel desk'],
  ['a slightly larger private office', 'a slightly larger private booth with its own light strip'],
  ['a corner office with two windows', 'a corner office with two tall windows over a lit skyline'],
  ['an imposing boardroom chair at the head of a long table',
    'an imposing boardroom chair at the head of a long lit table'],
  ['a top-floor office window overlooking a city skyline',
    'a top-floor window overlooking a neon skyline from above the smog'],
];
PROMO.forEach(([subject, subjectNeon], i) => {
  add({ kind: 'rank', id: `promo${i + 1}`, out: `${G}/res/RANKPROMO${i + 1}.png`, size: 150, subject, subjectNeon });
});
add({
  kind: 'rank',
  id: 'demo',
  out: `${G}/res/RANKDEMO.png`,
  size: 150,
  subject: 'a lone desk pushed out into a bare corridor',
  subjectNeon: 'a lone desk pushed out into a bare corridor under one failing light',
});
add({
  kind: 'rank',
  id: 'demo-mailroom',
  out: `${G}/res/RANKDEMOMAILROOM.png`,
  size: 150,
  subject: 'a mail trolley in a windowless basement room',
  subjectNeon: 'a parcel trolley in a windowless sub-level, one dim light overhead',
});

// Winners: the same six faces, now behind an enormous desk.
SEATS.forEach((feature, i) => {
  add({
    kind: 'winner',
    id: `president${i + 1}`,
    out: `${G}/res/PLAYER${i + 1}PRES.png`,
    size: 150,
    subject: `an office worker with ${feature} seated behind an enormous executive desk in front of a city window, triumphant`,
    subjectNeon: `a corporate operative with ${feature} seated behind an enormous executive desk in front of a neon skyline window, triumphant, rim-lit`,
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
      subjectNeon: `a full-body corporate operative with ${feature}, ${pose}, at an office party, rim-lit in neon`,
    });
  });
}

// ---------------------------------------------------------------- tier 5: chrome
add({
  kind: 'chrome',
  id: 'splash',
  out: `${G}/forms/TSPLASHFORM/Image1.png`,
  size: 512,
  // A tower wants height. The flat set keeps its wide establishing shot.
  shape: STYLE_NAME === 'neon' ? 'portrait' : 'landscape',
  // Cut out for neon, so the tower stands on the splash's own black rather than inside a
  // rectangle of someone else's black.
  cutout: STYLE_NAME === 'neon',
  // The game overlays its own title, so the top of the frame has to stay quiet.
  subject: 'an office block at dusk with a single lit window, wide establishing view, empty sky across the upper third',
  /*
   * No lettering in the prompt. Asked for a sign reading "GoW Corp." it produced
   * "GoW GopaCorp" — a diffusion model cannot spell, and the wordmark is the one thing on the
   * splash that has to be right. The building is generated; the sign is drawn over it in CSS
   * (`.splash-sign`), which is legible at any size and picks up the palette.
   */
  subjectNeon:
    'one single towering corporate skyscraper seen from street level looking up, lit windows ' +
    'in a grid, glowing, nothing else in the frame, empty dark sky across the upper third',
});
add({
  kind: 'chrome',
  id: 'about',
  out: `${G}/forms/TABOUTFORM/Image1.png`,
  size: 512,
  shape: 'landscape',
  subject: 'the same plain office block in flat daylight, wide establishing view',
  subjectNeon: 'the same arcology tower under flat grey daylight, wide establishing view',
});
add({
  kind: 'chrome',
  id: 'icon',
  out: `${G}/icon.png`,
  size: 32,
  cutout: true,
  subject: 'a single manila folder seen straight on, one bold emblematic shape',
  subjectNeon: 'a single glowing data shard seen straight on, one bold emblematic shape',
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
    subjectNeon: 'a wry vignette of an everyday mishap in a neon-lit office, one clear subject',
  });
}
for (let i = 0; i < 12; i++) {
  add({
    kind: 'card',
    id: `scruples-card-${i}`,
    out: `${G}/res/SCRUPLES${i}.png`,
    size: 96,
    subject: 'a wry vignette of an office dilemma with two tempting paths, one clear subject',
    subjectNeon: 'a wry vignette of a dilemma in a neon-lit office, two tempting paths, one clear subject',
  });
}

writeFileSync(resolve(ROOT, 'scripts/art-manifest.json'), `${JSON.stringify(jobs, null, 1)}\n`);

const byKind = jobs.reduce((a, j) => ((a[j.kind] = (a[j.kind] || 0) + 1), a), {});
console.log(`${jobs.length} jobs (ART_STYLE=${STYLE_NAME})  ->  scripts/art-manifest.json`);
console.log(
  Object.entries(byKind)
    .map(([k, n]) => `  ${k}: ${n}`)
    .join('\n'),
);

export { jobs };
