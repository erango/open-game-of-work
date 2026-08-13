import type { SquareKind } from './types';

/**
 * Original inline SVG artwork for the board faces.
 *
 * Drawn for this port. The original's 96 bitmaps are not redistributable, so nothing here
 * traces or reproduces them — these are new marks chosen to read at 40px on a dark board.
 * All strokes use `currentColor` so a square can tint its own icon.
 */

const svg = (body: string, size = 40): string =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" ` +
  `stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Office block with a lit doorway — where everyone clocks in and gets judged. */
const HOME = svg(`
  <path d="M8 42V14l16-8 16 8v28"/>
  <path d="M4 42h40"/>
  <rect x="20" y="30" width="8" height="12" fill="currentColor" opacity=".35"/>
  <rect x="13" y="19" width="6" height="6"/>
  <rect x="29" y="19" width="6" height="6"/>
`);

/** Paper cup and bubbles. */
const OFFICE_PARTY = svg(`
  <path d="M14 18h20l-2.5 20a3 3 0 0 1-3 2.6h-9A3 3 0 0 1 16.5 38Z"/>
  <path d="M11 18h26"/>
  <circle cx="34" cy="10" r="2.4"/>
  <circle cx="27" cy="6" r="1.7"/>
  <circle cx="39" cy="16" r="1.4"/>
`);

/** Easel with a line that goes the wrong way. */
const MEETING = svg(`
  <rect x="7" y="7" width="34" height="24" rx="2"/>
  <path d="M13 25l7-7 5 5 8-10"/>
  <path d="M24 31v10"/>
  <path d="M16 41h16"/>
`);

/** Briefcase with a boarding tag. */
const BUSINESS_TRIP = svg(`
  <rect x="6" y="16" width="36" height="22" rx="3"/>
  <path d="M18 16v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4"/>
  <path d="M6 26h36"/>
  <path d="M33 30l7-6-7-6" opacity=".5"/>
`);

/** A rolling pair of dice. */
const CHANCE = svg(`
  <rect x="5" y="18" width="21" height="21" rx="3.5"/>
  <circle cx="11.5" cy="24.5" r="1.7" fill="currentColor" stroke="none"/>
  <circle cx="19.5" cy="32.5" r="1.7" fill="currentColor" stroke="none"/>
  <rect x="26" y="7" width="19" height="19" rx="3.5" opacity=".75"/>
  <circle cx="35.5" cy="16.5" r="1.6" fill="currentColor" stroke="none" opacity=".75"/>
  <circle cx="31" cy="12" r="1.6" fill="currentColor" stroke="none" opacity=".75"/>
  <circle cx="40" cy="21" r="1.6" fill="currentColor" stroke="none" opacity=".75"/>
`);

/** A dilemma, in a speech bubble. */
const SCRUPLES = svg(`
  <path d="M7 11a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H20l-9 8v-8h-1a3 3 0 0 1-3-3Z"/>
  <path d="M19.5 16.5a4.6 4.6 0 1 1 5.4 4.5v3"/>
  <circle cx="24.7" cy="27.6" r="1.5" fill="currentColor" stroke="none"/>
`);

/** A crown, because rank is the whole point of this square. */
const POWER_MONGER = svg(`
  <path d="M7 34 5 14l10 7 9-12 9 12 10-7-2 20Z"/>
  <path d="M9 39h30"/>
  <circle cx="24" cy="26" r="2" fill="currentColor" stroke="none" opacity=".5"/>
`);

const ICONS: Partial<Record<SquareKind, string>> = {
  home: HOME,
  officeParty: OFFICE_PARTY,
  meeting: MEETING,
  businessTrip: BUSINESS_TRIP,
  chance: CHANCE,
  scruples: SCRUPLES,
  powerMonger: POWER_MONGER,
};

/** Icon markup for a square kind, or '' when the kind draws itself (projects). */
export function squareIcon(kind: SquareKind, size = 40): string {
  const body = ICONS[kind];
  if (!body) return '';
  return size === 40 ? body : body.replace(/width="40" height="40"/, `width="${size}" height="${size}"`);
}
