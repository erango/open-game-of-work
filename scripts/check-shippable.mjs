// Refuse to publish anything extracted from the original game.
//
// `vite build` copies everything under public/ into dist/, and on a machine with an extraction
// installed that includes the publisher's artwork, audio, card text and help text. In CI the
// checkout is clean so it cannot happen — but "cannot happen because of how we happen to run it"
// is not a guarantee, and a manually uploaded local dist would breach the one rule this project
// has. So it is checked.
//
//   npm run check:shippable
import { existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Paths under dist/ that must never exist, and why. */
const FORBIDDEN = [
  ['assets/graphics', 'artwork extracted from gamework.exe'],
  ['assets/sounds', "the original's audio"],
  ['assets/cards.json', "the original's Chance and Scruples text"],
  ['assets/help.json', "the original's How to Play text"],
];

if (!existsSync(DIST)) {
  console.error('No dist/ — run npm run build first.');
  process.exit(1);
}

const found = FORBIDDEN.filter(([rel]) => existsSync(join(DIST, rel)));

if (found.length) {
  console.error('This build contains material from the original game and must not be published:\n');
  for (const [rel, what] of found) console.error(`  dist/${rel}  — ${what}`);
  console.error(
    '\nThat directory is gitignored and only exists because an extraction is installed locally.\n' +
      'The deployed site is built from a clean checkout; delete dist/ and let CI build it, or\n' +
      'move public/assets/graphics and public/assets/sounds aside before building by hand.',
  );
  process.exit(1);
}

// Positive check too: a deploy that silently shipped none of our own artwork would "pass" the
// rule above while being a broken site.
const ours = ['assets/graphics-gen/manifest.txt', 'assets/music', 'assets/sfx'];
const missing = ours.filter((rel) => !existsSync(join(DIST, rel)));
if (missing.length) {
  console.error(`Build is missing this project's own assets: ${missing.join(', ')}`);
  process.exit(1);
}

const count = (rel) => {
  const walk = (dir) =>
    readdirSync(dir).reduce((n, f) => {
      const p = join(dir, f);
      return n + (statSync(p).isDirectory() ? walk(p) : 1);
    }, 0);
  return walk(join(DIST, rel));
};

console.log(
  `shippable: ${count('assets/graphics-gen')} images, ${count('assets/music')} music tracks, ` +
    `${count('assets/sfx')} sound effects, and nothing from the original.`,
);
