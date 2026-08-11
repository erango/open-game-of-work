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
 * Default seat names.
 *
 * Recovered from the original's audio filenames — it shipped one voice clip per default
 * player (`brad.wav`, `muriel.wav`, `ned.wav`, `jen.wav`, `spot.wav`, `george.wav`), and
 * the in-game rules text uses the same cast in its Power Monger worked example.
 */
export const DEFAULT_NAMES = ['Brad', 'Muriel', 'Ned', 'Jen', 'Spot', 'George'];
