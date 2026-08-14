import { CHANCE, SCRUPLES, type ChanceCard, type ScruplesCard } from './cards';
import { CHANCE_NEON, SCRUPLES_NEON } from './cardsNeon';
import { loadOriginalDeck } from './originalCards';

/**
 * Which deck the game draws Chance and Scruples cards from.
 *
 * - `new`      the decks written for this port, which is all a clone has.
 * - `neon`     a second pack of our own, in the cyberpunk register of the reskin.
 * - `original` the decks recovered from a local copy of the binary, with their artwork.
 * - `both`     every pack available, shuffled together.
 *
 * `new` and `neon` are the same size and use the same numeric ranges, so choosing between them
 * changes the voice and not the balance. `original` and `both` are only selectable on a machine
 * with an extraction installed, since the original text is not distributed with this repo.
 */
export type DeckMode = 'new' | 'neon' | 'original' | 'both';

export interface Deck {
  chance: ChanceCard[];
  scruples: ScruplesCard[];
}

const NEW_DECK: Deck = { chance: CHANCE, scruples: SCRUPLES };
const NEON_DECK: Deck = { chance: CHANCE_NEON, scruples: SCRUPLES_NEON };

let active: Deck = NEW_DECK;
let mode: DeckMode = 'new';
let originalLoaded: Deck | null = null;

/** Attempts to load the original decks. Safe to call when none are installed. */
export async function initDecks(): Promise<boolean> {
  originalLoaded = await loadOriginalDeck();
  return originalLoaded !== null;
}

export function originalAvailable(): boolean {
  return originalLoaded !== null;
}

export function setDeckMode(next: DeckMode): DeckMode {
  // Only the original pack can be missing; our own two always ship.
  if ((next === 'original' || next === 'both') && !originalLoaded) next = 'new';
  mode = next;
  if (next === 'neon') {
    active = NEON_DECK;
  } else if (next === 'original' && originalLoaded) {
    active = originalLoaded;
  } else if (next === 'both' && originalLoaded) {
    active = {
      chance: [...NEW_DECK.chance, ...NEON_DECK.chance, ...originalLoaded.chance],
      scruples: [...NEW_DECK.scruples, ...NEON_DECK.scruples, ...originalLoaded.scruples],
    };
  } else {
    active = NEW_DECK;
  }
  return mode;
}

export function deckMode(): DeckMode {
  return mode;
}

export function deck(): Deck {
  return active;
}
