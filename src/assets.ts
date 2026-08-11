/**
 * Optional original artwork.
 *
 * This repo ships no images. `tools/extract-assets.py` pulls them out of a local copy of
 * gamework.exe into `public/assets/graphics/`, which is gitignored. When that directory is
 * present the board renders the original art; when it is absent the board falls back to the
 * inline SVG in `icons.ts`, so the game always looks finished either way.
 *
 * Availability is resolved once at boot from the extractor's manifest, so rendering stays
 * synchronous and no request is made per square.
 */

const BASE = 'assets/graphics/';
const MANIFEST = BASE + 'manifest.txt';

/**
 * Board square index -> TMAINFORM component name. Verified against the component
 * coordinates, so each Chance and Scruples square gets the specific face the original
 * used at that position rather than a repeated one.
 */
const SQUARE_IMAGES: Record<number, string> = {
  0: 'homeImage',
  3: 'chanceImage1',
  6: 'scruplesImage1',
  9: 'officePartyImage',
  11: 'chanceImage2',
  13: 'meetingImage',
  14: 'scruplesImage2',
  17: 'powerMongerImage',
  20: 'chanceImage3',
  22: 'businessTripImage',
  24: 'scruplesImage3',
};

/** Centre-cluster controls that have their own artwork. */
const CENTER_IMAGES = {
  makeTrade: 'makeTradeImage',
  resign: 'resignImage',
} as const;

let available = new Set<string>();
let loaded = false;

/** Reads the extractor's manifest. Safe to call when no assets are installed. */
export async function loadAssets(): Promise<boolean> {
  if (loaded) return available.size > 0;
  loaded = true;
  try {
    const res = await fetch(MANIFEST);
    if (!res.ok) return false;
    const text = await res.text();
    available = new Set(
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    );
  } catch {
    return false;
  }
  return available.size > 0;
}

export function assetsAvailable(): boolean {
  return available.size > 0;
}

function url(rel: string): string | null {
  return available.has(rel) ? BASE + rel : null;
}

/** Original face for a board square, or null to fall back to the SVG icon. */
export function squareImage(index: number): string | null {
  const name = SQUARE_IMAGES[index];
  return name ? url(`forms/TMAINFORM/${name}.png`) : null;
}

export function centerImage(which: keyof typeof CENTER_IMAGES): string | null {
  return url(`forms/TMAINFORM/${CENTER_IMAGES[which]}.png`);
}

/** A named PE bitmap resource, e.g. 'RANKPROMO1', 'CHANCE7', 'STOCKBONUS'. */
export function resourceImage(name: string): string | null {
  return url(`res/${name}.png`);
}
