import { CHANCE, SCRUPLES, type ChanceCard, type ScruplesCard } from './cards';
import { loadOriginalDeck } from './originalCards';

/**
 * Which deck the game draws Chance and Scruples cards from.
 *
 * - `new`      the decks written for this port, which is all a clone has.
 * - `original` the decks recovered from a local copy of the binary, with their artwork.
 * - `both`     everything shuffled together.
 *
 * `original` and `both` are only selectable on a machine with an extraction installed, since
 * the original text is not distributed with this repo.
 */
export type DeckMode = 'new' | 'original' | 'both';

export interface Deck {
  chance: ChanceCard[];
  scruples: ScruplesCard[];
}

const NEW_DECK: Deck = { chance: CHANCE, scruples: SCRUPLES };

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
  if (next !== 'new' && !originalLoaded) next = 'new';
  mode = next;
  if (next === 'new' || !originalLoaded) {
    active = NEW_DECK;
  } else if (next === 'original') {
    active = originalLoaded;
  } else {
    active = {
      chance: [...NEW_DECK.chance, ...originalLoaded.chance],
      scruples: [...NEW_DECK.scruples, ...originalLoaded.scruples],
    };
  }
  return mode;
}

export function deckMode(): DeckMode {
  return mode;
}

export function deck(): Deck {
  return active;
}
