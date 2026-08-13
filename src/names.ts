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
 * Default seat names, matching the original: TNEWGAMEFORM's Edit1..Edit6 ship with Text
 * values of 'Player 1' through 'Player 6'.
 *
 * An earlier version of this file used Brad / Muriel / Ned / Jen / Spot / George and
 * described them as recovered. That was wrong. Those names do exist in the original as
 * voice clips (brad.wav and friends) and appear together in the rules text's Power Monger
 * worked example, but they are not the seat defaults, and pinning one to each seat invented
 * a name-to-avatar pairing the original never had — seat avatars are fixed, names are not.
 *
 * Typing one of those names still triggers its clip: announceTurn falls back to a per-name
 * clip when a seat has one, which is most likely how the original used them.
 */
export const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];
