import type { Profile } from './types';
import type { Rng } from './rng';

/**
 * Procedural project names: adjective + noun, pooled per profile tier so the name
 * telegraphs difficulty. Tier 1 reads small and harmless, tier 5 reads absurdly grand.
 *
 * These word pools are newly written for this port. The original had its own.
 */

const ADJECTIVES: Record<Profile, string[]> = {
  1: ['Tiny', 'Gentle', 'Napping', 'Casual', 'Beige', 'Snoozy', 'Mild', 'Placid'],
  2: ['Modest', 'Passable', 'Tepid', 'Semi', 'Chipper', 'Perky', 'Plain', 'Fussy'],
  3: ['Knotty', 'Cranky', 'Lumpy', 'Bristling', 'Stubborn', 'Middling', 'Wobbly', 'Thorny'],
  4: ['Looming', 'Thunderous', 'Grim', 'Sprawling', 'Ravenous', 'Bleak', 'Colossal', 'Feral'],
  5: ['Legendary', 'Apocalyptic', 'Imperial', 'Unhinged', 'Titanic', 'Supreme', 'Galactic', 'Immortal'],
};

const NOUNS: Record<Profile, string[]> = {
  1: ['Pebble', 'Teaspoon', 'Doorstop', 'Muffin', 'Sock', 'Kitten', 'Sprout', 'Postcard', 'Pigeon'],
  2: ['Toaster', 'Ferret', 'Bicycle', 'Casserole', 'Mailbag', 'Gerbil', 'Trellis', 'Kazoo'],
  3: ['Doghouse', 'Wheelbarrow', 'Beehive', 'Sawmill', 'Llama', 'Furnace', 'Drawbridge', 'Ostrich'],
  4: ['Monolith', 'Leviathan', 'Ziggurat', 'Foundry', 'Cyclone', 'Aqueduct', 'Kraken', 'Quarry'],
  5: ['Deathstar', 'Cathedral', 'Singularity', 'Colossus', 'Dreadnought', 'Obelisk', 'Behemoth', 'Pyramid'],
};

export function projectName(profile: Profile, rng: Rng): string {
  const a = rng.pick(ADJECTIVES[profile]);
  const n = rng.pick(NOUNS[profile]);
  return `${a} ${n}`;
}

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
