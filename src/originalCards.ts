import type { ChanceCard, ScruplesCard, ScruplesChoice } from './cards';

/**
 * Loads the original game's Chance and Scruples decks.
 *
 * The repo ships none of this text. `tools/extract-assets.py` recovers it from a local copy
 * of the binary into `public/assets/cards.json`, which is gitignored, exactly as the artwork
 * and audio are handled. With no local extraction the game uses its own decks and this
 * module is inert.
 *
 * Fidelity, precisely:
 *
 *  - Chance cards use the original's REAL effects. The numbers were compiled into code
 *    rather than stored as text, and are recovered from the call site that builds each card
 *    (see chance_effects in tools/extract-assets.py). All 30 came back complete.
 *  - Scruples answers do NOT. Their effects are applied by a separate handler roughly 450
 *    bytes away from the answer strings, because all three answers are assigned before any
 *    effect runs, so a call site cannot be attributed to a specific answer by proximity.
 *    106 candidate sites were found against 108 answers. Rather than ship a guessed mapping
 *    as though it were the original's, those effects stay inferred; see choiceSpread.
 */

const CARDS_URL = 'assets/cards.json';

interface RawCards {
  chance: string[];
  /** Six values per card, read out of compiled code. See tools/extract-assets.py. */
  chanceEffects?: number[][];
  scruples: Array<{ situation: string; choices: string[] }>;
}

/**
 * Slot meanings for a recovered Chance effect tuple, in push order.
 *
 * Established by correlating the values against the cards' own effect clauses:
 * slot 2 tracks work remaining and agrees with every card that mentions work, slot 3 is the
 * share price, slot 4 is Boss Rating, and slot 0 flags a card that hits every project rather
 * than one (agreeing with the wording on 26 of 30). Slot 1's meaning is not established and
 * is deliberately not applied. Slot 5 is -1 on all 30 cards, so a sentinel.
 */
const SLOT = { allProjects: 0, unknown: 1, workRemaining: 2, stock: 3, bossRating: 4 } as const;

function fromRecovered(values: number[], text: string): ChanceCard {
  // The original counts work REMAINING, where this port counts work DONE, so the sign flips.
  const work = -values[SLOT.workRemaining];
  const card: ChanceCard = {
    text,
    bossRating: values[SLOT.bossRating],
    stock: values[SLOT.stock],
    work,
    workSingleProject: work !== 0 && values[SLOT.allProjects] === 0,
  };
  return card;
}

/**
 * The original marks substitutions with angle-bracket tokens. Translate them to the brace
 * tokens the engine's own text uses so both decks render through one code path.
 */
function convertPlaceholders(text: string): string {
  return text
    .replace(/<yourname>/g, '{you}')
    .replace(/<opponentname>/g, '{rival}')
    .replace(/<youroldproject>/g, '{project}')
    .replace(/<yourproject>/g, '{project}')
    .replace(/<opponentproject>/g, '{rivalproject}');
}

/** Normalises the original's CRLF line endings. */
function tidy(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * Effect inference.
 *
 * Each Chance card ends with a short clause stating its consequence, and choice labels often
 * imply one. These patterns map that wording onto deltas. Magnitudes deliberately match the
 * ranges used by this port's own deck so the two are interchangeable without reshaping the
 * balance in `rules.ts`.
 */
interface Inferred {
  bossRating: number;
  stock: number;
  work: number;
}

const PATTERNS: Array<{ re: RegExp; effect: Partial<Inferred> }> = [
  // Work
  { re: /\b(more work|work is done|extra work|speeds? up|ahead of schedule)\b/i, effect: { work: 2 } },
  { re: /\b(less work|no work|work is lost|slows? down|behind schedule|running late)\b/i, effect: { work: -2 } },
  // Stock
  { re: /\bstock (value |price )?(goes up|rises|increases|is up)\b/i, effect: { stock: 6 } },
  { re: /\bstock (value |price )?(goes down|falls|drops|decreases|is down)\b/i, effect: { stock: -6 } },
  // Boss sentiment
  { re: /\bboss is (pleased|delighted|happy|impressed|thrilled)\b/i, effect: { bossRating: 7 } },
  { re: /\bboss is (fuming|angry|furious|livid|not pleased|unhappy|annoyed)\b/i, effect: { bossRating: -8 } },
  { re: /\b(promoted|commended|praised|rewarded|congratulat)/i, effect: { bossRating: 6 } },
  { re: /\b(demoted|reprimanded|blamed|fired|in big trouble|in trouble)\b/i, effect: { bossRating: -9 } },
  { re: /\b(impressed|admires?|respects?)\b/i, effect: { bossRating: 4 } },
  { re: /\b(embarrass|humiliat|disgrac|ashamed)/i, effect: { bossRating: -5 } },
  { re: /\b(quits|resigns|leaves the company|takes company secrets)\b/i, effect: { bossRating: -4, work: -1 } },
];

function infer(text: string): Inferred {
  const out: Inferred = { bossRating: 0, stock: 0, work: 0 };
  for (const { re, effect } of PATTERNS) {
    if (!re.test(text)) continue;
    out.bossRating += effect.bossRating ?? 0;
    out.stock += effect.stock ?? 0;
    out.work += effect.work ?? 0;
  }
  return out;
}

/**
 * A card whose wording implies nothing measurable still has to do something, or landing on
 * the square would be a no-op. Fall back to a small effect keyed off the card's index so it
 * is stable across runs rather than random.
 */
function fallback(index: number): Inferred {
  const table: Inferred[] = [
    { bossRating: 3, stock: 0, work: 0 },
    { bossRating: -3, stock: 0, work: 0 },
    { bossRating: 0, stock: 3, work: 0 },
    { bossRating: 0, stock: -3, work: 0 },
    { bossRating: 2, stock: 0, work: 1 },
    { bossRating: -2, stock: 0, work: -1 },
  ];
  return table[index % table.length];
}

function isEmpty(e: Inferred): boolean {
  return e.bossRating === 0 && e.stock === 0 && e.work === 0;
}

/**
 * Effects for a Scruples answer whose wording implies nothing measurable.
 *
 * This is the weakest part of playing the original deck, and worth being plain about: none
 * of the 108 original answer labels state a consequence — they are short imperatives, with
 * the consequences held in compiled code. So these numbers are entirely this port's.
 *
 * The shape varies by card as well as by answer, so different cards at least play
 * differently from one another. Four profiles rotate by card index:
 *   0  a safe/risky split         2  reputation against progress
 *   1  cost now, payoff later     3  everything mild, the answer barely matters
 * Within a profile the third answer is consistently the self-serving one, which is the only
 * ordering assumption carried over from the original's own presentation.
 */
function choiceSpread(cardIndex: number, choiceIndex: number): Inferred {
  const profiles: Inferred[][] = [
    [
      { bossRating: 2, stock: 1, work: 0 },
      { bossRating: 4, stock: 0, work: 1 },
      { bossRating: 7, stock: -3, work: 2 },
    ],
    [
      { bossRating: -2, stock: 2, work: 2 },
      { bossRating: 3, stock: 0, work: 0 },
      { bossRating: 6, stock: -2, work: -1 },
    ],
    [
      { bossRating: 5, stock: 0, work: -2 },
      { bossRating: 1, stock: 1, work: 1 },
      { bossRating: -3, stock: 3, work: 3 },
    ],
    [
      { bossRating: 1, stock: 0, work: 1 },
      { bossRating: 2, stock: 1, work: 0 },
      { bossRating: 3, stock: -1, work: 1 },
    ],
  ];
  const profile = profiles[cardIndex % profiles.length];
  return profile[choiceIndex] ?? profile[0];
}

function toChance(raw: string, index: number, recovered?: number[]): ChanceCard {
  const text = convertPlaceholders(tidy(raw));
  let card: ChanceCard;
  if (recovered && recovered.length === 6) {
    // Real values from the binary; no guessing needed.
    card = fromRecovered(recovered, text);
  } else {
    let effect = infer(text);
    if (isEmpty(effect)) effect = fallback(index);
    card = { text, bossRating: effect.bossRating, stock: effect.stock, work: effect.work };
  }
  card.art = `CHANCE${index}`;
  if (/\{project\}/.test(text)) card.needsProject = true;
  if (/\{rival\}|\{rivalproject\}/.test(text)) card.needsRival = true;
  return card;
}

function toScruples(
  raw: { situation: string; choices: string[] },
  index: number,
): ScruplesCard {
  const situation = convertPlaceholders(tidy(raw.situation));

  const choices = raw.choices.map((label, i) => {
    const text = convertPlaceholders(tidy(label));
    let effect = infer(text);
    if (isEmpty(effect)) effect = choiceSpread(index, i);
    const choice: ScruplesChoice = {
      label: text,
      bossRating: effect.bossRating,
      stock: effect.stock,
      work: effect.work,
      friendliness: i === 2 ? -2 : i === 0 ? 2 : 0,
      outcome: `${'{you}'} goes with: ${text}`,
    };
    return choice;
  }) as [ScruplesChoice, ScruplesChoice, ScruplesChoice];

  const card: ScruplesCard = { situation, choices, art: `SCRUPLES${index}` };
  if (/\{project\}/.test(situation)) card.needsProject = true;
  if (/\{rival\}|\{rivalproject\}/.test(situation)) card.needsRival = true;
  return card;
}

export interface OriginalDeck {
  chance: ChanceCard[];
  scruples: ScruplesCard[];
}

let cached: OriginalDeck | null = null;
let attempted = false;

/** Fetches and adapts the original decks. Returns null when no extraction is installed. */
export async function loadOriginalDeck(): Promise<OriginalDeck | null> {
  if (attempted) return cached;
  attempted = true;
  try {
    const res = await fetch(CARDS_URL);
    if (!res.ok) return null;
    const raw = (await res.json()) as RawCards;
    if (!Array.isArray(raw.chance) || !Array.isArray(raw.scruples)) return null;
    cached = {
      chance: raw.chance.map((t, i) => toChance(t, i, raw.chanceEffects?.[i])),
      scruples: raw.scruples.map(toScruples),
    };
  } catch {
    return null;
  }
  return cached;
}

export function originalDeckAvailable(): boolean {
  return cached !== null;
}
