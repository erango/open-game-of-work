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

/**
 * The two illustrated sets, each with its own manifest.
 *
 * `original` is extracted from a local copy of the game. `generated` is produced by the
 * pipeline in scripts/, and deliberately lives in its own directory: sharing one root would
 * make the generator's resume check see the extracted files and skip every job, and would
 * overwrite them on the way through.
 */
const SETS = {
  original: 'assets/graphics/',
  generated: 'assets/graphics-gen/',
} as const;

export type SetName = keyof typeof SETS;

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

const manifests: Record<SetName, Set<string>> = { original: new Set(), generated: new Set() };
let loaded = false;

/**
 * Which artwork to draw when both sets exist.
 *
 * Having an extraction installed should not force it on: the inline SVG set is a deliberate
 * piece of work, and a light pixel-art board is a very different thing to look at from the
 * dark vector one. So this is a preference, not a consequence of what happens to be on disk.
 *
 * It gates artwork only. The original card text and help text are chosen separately, in the
 * New Game window and the How to Play window, and are unaffected.
 */
export type GraphicsMode = SetName | 'modern';

const STORED = localStorage.getItem('ogow:graphics');
let mode: GraphicsMode =
  STORED === 'modern' || STORED === 'generated' || STORED === 'original' ? STORED : 'original';

export function graphicsMode(): GraphicsMode {
  return mode;
}

export function setGraphicsMode(next: GraphicsMode): void {
  // Fall back rather than silently drawing nothing if a set was removed.
  if (next !== 'modern' && manifests[next].size === 0) next = 'modern';
  mode = next;
  localStorage.setItem('ogow:graphics', next);
}

/** Which illustrated sets are actually present, regardless of which is being drawn. */
export function installedSets(): SetName[] {
  return (Object.keys(SETS) as SetName[]).filter((n) => manifests[n].size > 0);
}

/** Whether any illustrated set exists, i.e. whether there is a choice to offer. */
export function assetsInstalled(): boolean {
  return installedSets().length > 0;
}

/** Reads the extractor's manifest. Safe to call when no assets are installed. */
export async function loadAssets(): Promise<boolean> {
  if (loaded) return assetsInstalled();
  loaded = true;
  await Promise.all(
    (Object.keys(SETS) as SetName[]).map(async (name) => {
      try {
        const res = await fetch(`${SETS[name]}manifest.txt`);
        if (!res.ok) return;
        const text = await res.text();
        manifests[name] = new Set(
          text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        );
      } catch {
        // Absent set; leave its manifest empty.
      }
    }),
  );
  // Honour the stored preference only if that set turned up.
  setGraphicsMode(mode);
  return assetsInstalled();
}

/** Whether an illustrated set should actually be drawn right now. */
export function assetsAvailable(): boolean {
  return mode !== 'modern' && manifests[mode].size > 0;
}

/**
 * Swaps the tab icon for the original's application icon when one has been extracted.
 *
 * The original stores a single 32x32 4bpp icon under GROUP_ICON "MAINICON". Because that is
 * its artwork rather than ours, it is never committed; the repo ships an SVG of its own and
 * this upgrade only fires on a machine with a local extraction.
 */
export function applyFavicon(): void {
  const link = document.getElementById('favicon') as HTMLLinkElement | null;
  if (!link) return;
  const png = url('icon.png');
  if (png) {
    link.type = 'image/png';
    link.href = png;
  } else {
    // Back to the mark this repo ships, so the tab follows the chosen artwork.
    link.type = 'image/svg+xml';
    link.href = '/favicon.svg';
  }
}

function url(rel: string): string | null {
  if (mode === 'modern') return null;
  return manifests[mode].has(rel) ? SETS[mode] + rel : null;
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

/** The original's about-box illustration (TABOUTFORM). */
export function aboutImage(): string | null {
  return url('forms/TABOUTFORM/Image1.png');
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
  // Cursors ship only with the original extraction, and sit alongside it rather than in the
  // manifest, so they apply to that set only.
  if (mode !== 'original' || manifests.original.size === 0) return null;
  return SETS.original + `cursors/Cursor${which}.cur`;
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
