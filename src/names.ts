import type { Profile } from './types';
import type { Rng } from './rng';

/**
 * Procedural project names: adjective + noun, pooled per profile tier so the name
 * telegraphs difficulty. Tier 1 reads small and harmless, tier 5 reads absurdly grand.
 *
 * These word pools are newly written for this port. The original had its own.
 *
 * Keep every word to 9 characters or fewer. The name label is 73x27 in the original's design
 * space, which holds roughly two lines of twelve characters at the recovered 11px bold, and
 * the original's own pool tops out at 9 with a mean of 5.9. Longer words overflow the tile,
 * and no amount of board scaling helps: the board is transform-scaled, so text grows with it.
 */

/**
 * Which word pack the names come from.
 *
 * Set from the theme (see `applyTheme` in main.ts), the same way the card pack is. Held here
 * rather than passed through the engine so `engine.ts` stays free of anything theme-shaped;
 * `autoplay.ts` and the suite use the default, so simulated games remain comparable.
 */
export type NameStyle = 'office' | 'cyber';

let style: NameStyle = 'office';

export function setNameStyle(next: NameStyle): void {
  style = next;
}

export function nameStyle(): NameStyle {
  return style;
}

const ADJECTIVES: Record<Profile, string[]> = {
  1: ['Tiny', 'Gentle', 'Napping', 'Casual', 'Beige', 'Snoozy', 'Mild', 'Placid'],
  2: ['Modest', 'Passable', 'Tepid', 'Semi', 'Chipper', 'Perky', 'Plain', 'Fussy'],
  3: ['Knotty', 'Cranky', 'Lumpy', 'Bristling', 'Stubborn', 'Middling', 'Wobbly', 'Thorny'],
  4: ['Looming', 'Roaring', 'Grim', 'Sprawling', 'Ravenous', 'Bleak', 'Colossal', 'Feral'],
  5: ['Legendary', 'Doomed', 'Imperial', 'Unhinged', 'Titanic', 'Supreme', 'Galactic', 'Immortal'],
};

const NOUNS: Record<Profile, string[]> = {
  1: ['Pebble', 'Teaspoon', 'Doorstop', 'Muffin', 'Sock', 'Kitten', 'Sprout', 'Postcard', 'Pigeon'],
  2: ['Toaster', 'Ferret', 'Bicycle', 'Casserole', 'Mailbag', 'Gerbil', 'Trellis', 'Kazoo'],
  3: ['Doghouse', 'Barrow', 'Beehive', 'Sawmill', 'Llama', 'Furnace', 'Bridge', 'Ostrich'],
  4: ['Monolith', 'Leviathan', 'Ziggurat', 'Foundry', 'Cyclone', 'Aqueduct', 'Kraken', 'Quarry'],
  5: ['Deathstar', 'Cathedral', 'Vortex', 'Colossus', 'Titan', 'Obelisk', 'Behemoth', 'Pyramid'],
};

/**
 * The cyberpunk pack. Same shape, same tiers, same nine-character ceiling — a project still
 * telegraphs its difficulty, from a chore nobody will notice to something that will outlive
 * the company.
 */
const CYBER_ADJECTIVES: Record<Profile, string[]> = {
  1: ['Idle', 'Cached', 'Muted', 'Stubbed', 'Dormant', 'Trivial', 'Legacy', 'Quiet'],
  2: ['Beta', 'Patched', 'Flaky', 'Throttled', 'Warm', 'Nightly', 'Staged', 'Tepid'],
  3: ['Rogue', 'Encrypted', 'Ghosted', 'Hardened', 'Spliced', 'Volatile', 'Grafted', 'Wired'],
  4: ['Runaway', 'Black', 'Cascading', 'Rampant', 'Hostile', 'Sprawling', 'Feral', 'Burning'],
  5: ['Sovereign', 'Immortal', 'Absolute', 'Doomsday', 'Godlike', 'Terminal', 'Apex', 'Endless'],
};

const CYBER_NOUNS: Record<Profile, string[]> = {
  1: ['Ticket', 'Cronjob', 'Sticker', 'Kiosk', 'Beacon', 'Widget', 'Toaster', 'Badge'],
  2: ['Router', 'Chatbot', 'Dashboard', 'Turnstile', 'Vending', 'Printer', 'Drone', 'Terminal'],
  3: ['Firewall', 'Datavault', 'Skiplift', 'Powerhub', 'Splicer', 'Server', 'Reactor', 'Uplink'],
  4: ['Arcology', 'Mainframe', 'Refinery', 'Megagrid', 'Foundry', 'Orbital', 'Leviathan', 'Spire'],
  5: ['Singular', 'Overmind', 'Godcore', 'Overseer', 'Ascendant', 'Obelisk', 'Colossus', 'Zenith'],
};

export function projectName(profile: Profile, rng: Rng): string {
  const adjectives = style === 'cyber' ? CYBER_ADJECTIVES : ADJECTIVES;
  const nouns = style === 'cyber' ? CYBER_NOUNS : NOUNS;
  const a = rng.pick(adjectives[profile]);
  const n = rng.pick(nouns[profile]);
  return `${a} ${n}`;
}

/** Both packs, for the tests that police the nine-character ceiling. */
export const WORD_POOLS = { ADJECTIVES, NOUNS, CYBER_ADJECTIVES, CYBER_NOUNS };

/**
 * Default seat names, in seat order.
 *
 * Confirmed twice over. The six names sit consecutively in .data at 0x47cc48, 0x47cc4d,
 * 0x47cc51, 0x47cc58, 0x47cc5d and 0x47cc64, each with exactly one code reference, and a
 * screenshot of the original's New Game dialog shows the same order down the six seats.
 *
 * Two earlier attempts at this were wrong. First the order was guessed from the audio
 * filenames, which put Muriel in seat 2 where Jen belongs. Then it was "corrected" to
 * generic Player 1..6 on the strength of TNEWGAMEFORM's design-time Edit Text values —
 * but those are placeholders the runtime overwrites, as the dialog itself shows.
 *
 * The pairing matters because seat avatars are fixed art: seat 4 is Spot, and Spot is the
 * dog. Getting the order wrong visibly mismatches every name against its portrait.
 */
export const DEFAULT_NAMES = ['Brad', 'Jen', 'George', 'Spot', 'Muriel', 'Ned'];
