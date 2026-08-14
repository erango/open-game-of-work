import { graphicsMode, installedSets, setGraphicsMode, type GraphicsMode, type SetName } from './assets';
import type { DeckMode } from './decks';

/**
 * A theme is the palette and the artwork chosen together.
 *
 * They were two independent controls, which let you build combinations nobody designed — the
 * original's light pixel tiles on the neon surface, or cyberpunk illustrations on the warm
 * charcoal one. Each look is a whole; this is one choice.
 *
 * - `original`   the extracted artwork on the warm charcoal surface it was recovered against.
 *                Only offered where an extraction is installed.
 * - `openPlan`   this port's own work: inline SVG marks, no illustrations, same warm surface.
 *                Always available, and the fallback whenever a theme's artwork is missing —
 *                a fresh clone has nothing else.
 * - `cyberpunk`  the reskin: neon surface and the generated illustration set.
 */
export type ThemeName = 'original' | 'openPlan' | 'cyberpunk';

export type PaletteName = 'original' | 'neon';

interface Theme {
  label: string;
  /** One line for the menu, and for anywhere the choice needs explaining. */
  blurb: string;
  palette: PaletteName;
  graphics: GraphicsMode;
  /**
   * The card pack that goes with the look. Applied on every theme change and then free to
   * override in New Game — switching theme is a statement about the whole look, but the deck is
   * also a taste, so it is a default rather than a lock.
   */
  deck: DeckMode;
  /** An installed set this theme cannot be offered without. */
  requires?: SetName;
}

const THEMES: Record<ThemeName, Theme> = {
  original: {
    label: 'Original',
    blurb: 'The 2000 artwork, on the surface it was recovered against.',
    palette: 'original',
    graphics: 'original',
    deck: 'original',
    requires: 'original',
  },
  openPlan: {
    label: 'Open Plan',
    blurb: 'This port’s own drawings: marks and colour, no illustrations.',
    palette: 'original',
    graphics: 'modern',
    deck: 'new',
  },
  cyberpunk: {
    label: 'Cyberpunk',
    blurb: 'Neon surface and the generated illustration set.',
    palette: 'neon',
    graphics: 'generated',
    deck: 'neon',
  },
};

const ORDER: ThemeName[] = ['original', 'openPlan', 'cyberpunk'];
const KEY = 'ogow:theme';

const isTheme = (v: string | null): v is ThemeName => v !== null && v in THEMES;

/**
 * Query overrides, so a screenshot or the contrast audit can pin a combination without writing
 * to storage: `?theme=cyberpunk&art=modern`. `art` deliberately outranks the theme — the audit
 * needs the vector set, whose backgrounds are computable, in whichever palette it is checking.
 */
function query(): { theme: ThemeName | null; art: GraphicsMode | null } {
  const q = new URLSearchParams(location.search);
  const t = q.get('theme');
  const a = q.get('art');
  return {
    theme: isTheme(t) ? t : null,
    art: a === 'modern' || a === 'original' || a === 'generated' ? a : null,
  };
}

/** Falls back to the closest available theme when one needs a set that is not installed. */
function resolve(name: ThemeName): ThemeName {
  const need = THEMES[name].requires;
  if (need && !installedSets().includes(need)) return 'openPlan';
  return name;
}

/**
 * The last theme chosen, or the default for a first visit.
 *
 * **Original is the default**, because the point of the project is the recovered game; with an
 * extraction installed that is what should come up. `resolve()` drops it to Open Plan when the
 * artwork is not there, which is what a fresh clone gets.
 *
 * Also migrates the two keys this replaced: someone who had picked the neon palette gets
 * Cyberpunk, someone who had explicitly chosen the vector set keeps it.
 */
function stored(): ThemeName {
  const direct = localStorage.getItem(KEY);
  if (isTheme(direct)) return direct;
  const palette = localStorage.getItem('ogow:palette');
  const graphics = localStorage.getItem('ogow:graphics');
  if (palette === 'neon' || graphics === 'generated') return 'cyberpunk';
  if (graphics === 'modern') return 'openPlan';
  return 'original';
}

let current: ThemeName = 'original';

export function themeName(): ThemeName {
  return current;
}

export function themeLabel(name: ThemeName): string {
  return THEMES[name].label;
}

export function themeBlurb(name: ThemeName): string {
  return THEMES[name].blurb;
}

/** The card pack this theme comes with. `decks.ts` falls back if it is not installed. */
export function themeDeck(name: ThemeName): DeckMode {
  return THEMES[name].deck;
}

/** The themes worth offering: every one whose artwork is actually present. */
export function availableThemes(): ThemeName[] {
  return ORDER.filter((n) => resolve(n) === n);
}

/**
 * Applies the palette immediately and the artwork through `assets.ts`, which falls back to the
 * vector set on its own if a directory has gone missing.
 */
export function setTheme(next: ThemeName, persist = true): ThemeName {
  current = resolve(next);
  // Only a choice that could actually be honoured is stored. Writing the fallback would mean a
  // fresh clone recorded Open Plan and then stayed there after an extraction was installed,
  // instead of coming up as Original the way a first visit does.
  if (persist && current === next) localStorage.setItem(KEY, current);
  document.documentElement.setAttribute('data-palette', THEMES[current].palette);
  const art = query().art ?? THEMES[current].graphics;
  if (graphicsMode() !== art) setGraphicsMode(art);
  return current;
}

/**
 * Applies the palette before anything renders, without touching the artwork — the manifest has
 * not been read yet at that point, so `assets.ts` cannot resolve a set. Call `initTheme` after
 * `loadAssets()` to finish the job.
 */
export function applyPaletteEarly(): void {
  const name = query().theme ?? stored();
  const theme = THEMES[isTheme(name) ? name : 'original'];
  document.documentElement.setAttribute('data-palette', theme.palette);
}

/** Resolves and applies the stored (or query-pinned) theme. Safe to call once, after boot. */
export function initTheme(): ThemeName {
  const q = query();
  // A pinned theme is for this page view only, so it must not overwrite the stored choice.
  return setTheme(q.theme ?? stored(), q.theme === null);
}
