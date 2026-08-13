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

/**
 * Swaps the tab icon for the original's application icon when one has been extracted.
 *
 * The original stores a single 32x32 4bpp icon under GROUP_ICON "MAINICON". Because that is
 * its artwork rather than ours, it is never committed; the repo ships an SVG of its own and
 * this upgrade only fires on a machine with a local extraction.
 */
export function applyFavicon(): void {
  const png = url('icon.png');
  if (!png) return;
  const link = document.getElementById('favicon') as HTMLLinkElement | null;
  if (!link) return;
  link.type = 'image/png';
  link.href = png;
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

/**
 * Die face for a roll of 1-6, from TMAINFORM's dieImageList (6 frames of 81x81). The die
 * was never a static picture in the original — it is an image list indexed by the roll.
 */
export function dieFace(roll: number): string | null {
  if (roll < 1 || roll > 6) return null;
  return url(`forms/TMAINFORM/dieImageList/${roll - 1}.png`);
}

/**
 * Board token for a seat, from player1Image..player6Image. These are TIcon pictures parked
 * in a 3x2 grid at design time and repositioned at runtime, i.e. the moving pieces.
 */
export function playerToken(slot: number): string | null {
  return url(`forms/TMAINFORM/player${slot + 1}Image.png`);
}

/** 16x16 portrait for the stats panel, from playerSmallImageList. */
export function playerPortrait(slot: number): string | null {
  return url(`forms/TMAINFORM/playerSmallImageList/${slot}.png`);
}

/** Seat-type face for the New Game selector, cycled by clicking in the original. */
export function seatFace(kind: 'human' | 'computer' | 'off'): string | null {
  const name =
    kind === 'human' ? 'NEWGAMEHUMAN' : kind === 'computer' ? 'NEWGAMECOMPUTER' : 'NEWGAMEOFF';
  return url(`res/${name}.png`);
}

/**
 * Artwork for a rank change.
 *
 * The original ships RANKPROMO1..5 plus RANKDEMO and RANKDEMOMAILROOM. Seven ranks give
 * six possible promotions, so which promo image belongs to which step is not recoverable;
 * this maps the target rank onto the five available images and is marked as approximate.
 * Demotion into Mailroom has its own image, which is why that one is unambiguous.
 */
export function rankArt(from: number, to: number): string | null {
  if (to < from) {
    return url(`res/${to === 0 ? 'RANKDEMOMAILROOM' : 'RANKDEMO'}.png`);
  }
  const n = Math.min(5, Math.max(1, to - 1));
  return url(`res/RANKPROMO${n}.png`);
}

/**
 * The original's illustration for a game event. These are PE bitmap resources whose names
 * say what they depict, so each maps to the moment it belongs to.
 */
export type EventArt =
  | 'FINISHEDPROJECT'
  | 'LANDOWN'
  | 'LANDOTHER'
  | 'SETOFPROJECTS'
  | 'STOCKBONUS'
  | 'TRIP'
  | 'DRINK'
  | 'MEETINGGOOD'
  | 'MEETINGBAD'
  | 'COMPANYDISBANDED1'
  | 'COMPANYDISBANDED2'
  | 'STAR'
  | 'SCRUPLESPOPUP'
  | 'SCRUPLESCHANCE'
  | `PLAYER${number}PRES`;

export function eventArt(name: EventArt | string): string | null {
  return url(`res/${name}.png`);
}

/** The borderless startup splash (TSPLASHFORM holds a single full-bleed TImage). */
export function splashImage(): string | null {
  return url('forms/TSPLASHFORM/Image1.png');
}

/** Winner artwork for a seat — PLAYER1PRES..PLAYER6PRES, "PRES" for President. */
export function presidentArt(slot: number): string | null {
  return url(`res/PLAYER${slot + 1}PRES.png`);
}

/** Original mouse cursors, for CSS `cursor: url(...)`. */
export function cursorUrl(which: 'Dice' | 'Hand' | 'Stock' | 'Trade'): string | null {
  const rel = `cursors/Cursor${which}.cur`;
  // Cursors are copied alongside the extraction rather than listed in the manifest.
  return available.size > 0 ? BASE + rel : null;
}

/** Which office-party sprite set a player is drawn from. */
export type PartyMood = 'fine' | 'wild' | 'drunk';

/**
 * Office-party sprite. TOFFICEPARTYFORM carries six 6-frame image lists — one per player —
 * for standing, hammered, crawling and wobbling left/right, plus a 32x32 idle set. It also
 * holds the only TTimer in the application, so the scene animated.
 */
export function partySprite(mood: PartyMood, slot: number, phase: number): string | null {
  let list: string;
  if (mood === 'drunk') {
    list = phase % 2 === 0 ? 'playerHammeredImageList' : 'crawlImageList';
  } else if (mood === 'wild') {
    list = phase % 2 === 0 ? 'wobbleLeftImageList' : 'wobbleRightImageList';
  } else {
    list = 'playerVerticalImageList';
  }
  return url(`forms/TOFFICEPARTYFORM/${list}/${slot}.png`);
}
