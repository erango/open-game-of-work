import type { Cue } from './sound';

/**
 * Which cues have a recorded scene effect, and what file each maps to.
 *
 * Kept out of sound.ts so the suite can check it: sound.ts reaches localStorage through theme.ts
 * the moment it is imported, and the tests are DOM-free by design (see CLAUDE.md).
 *
 * The list is the same one scripts/sfx-manifest.mjs generates. It is stated rather than probed
 * for, so the frequent cues never ask — `move` fires hundreds of times a game — and so the
 * boundary stays explicit: these are scenes, everything else is a synth voice in sfx.ts.
 */
export const SCENE_CUES = new Set([
  'officeParty',
  'win',
  'crash',
  'meetingTerrible',
  'businessTrip',
  'resign',
  'powerMonger',
  'promotion1',
  'promotion2',
  'promotion3',
  'promotion4',
  'promotion5',
]);

/** The filename a cue maps to, or null when this cue has no recording. */
export function sceneName(cue: Cue): string | null {
  // Promotion is rank-indexed on the wire and one file per rank on disk. Seven ranks give six
  // possible steps, so the index is clamped to the five files that exist.
  const name = cue.startsWith('promotion:')
    ? `promotion${Math.min(5, Math.max(1, Number(cue.slice('promotion:'.length)) || 1))}`
    : cue;
  return SCENE_CUES.has(name) ? name : null;
}
