/**
 * The "How to Play" help system, mirroring THELPFORM.
 *
 * The original lists twelve topics down the left edge of a window titled "How to Play",
 * each swapping the text in a read-only scrolling memo, with the group captioned
 * "Integrated Information System". Its topic bodies are the original authors' prose, so
 * they are not shipped here: `tools/extract-assets.py` writes them to a gitignored
 * `public/assets/help.json` and they are loaded at runtime when present.
 *
 * The summaries below are written for this port and describe the same mechanics. They are
 * what a clone shows, and they stay available as a "Port summary" alongside the original
 * text on a machine with an extraction installed.
 */

export interface HelpTopic {
  key: string;
  title: string;
  body: string;
}

/** Topic order as the original lists its buttons. */
export const TOPIC_ORDER = [
  'getStarted',
  'rules',
  'home',
  'projects',
  'chance',
  'scruples',
  'officeParty',
  'meeting',
  'powerMonger',
  'businessTrip',
  'stockMarket',
  'other',
] as const;

const OWN: Record<string, HelpTopic> = {
  getStarted: {
    key: 'getStarted',
    title: 'How to Get Started',
    body: `Pick a game length at the top of the New Game window.

Long starts everyone at the lowest of the three starting ranks with no Boss Rating. Medium starts a rank higher with some. Short starts higher still with a significant amount, so it finishes soonest. Long is the default.

Then set each of the six seats to Human, Computer or Off — click a seat's face to cycle it. Rename seats freely, and give computer seats a personality or leave it on Random. Two seats minimum.

Click OK and the game begins. On your turn you may trade projects, then roll. Everything else follows from where you land.`,
  },
  rules: {
    key: 'rules',
    title: 'Rules of the Game',
    body: `You are a manager in a company of two to six. The object is to climb the ladder and become President.

Boss Rating is how much the boss likes you. It is the top meter in your stat box, in your own colour. Completing projects raises it, as do chance events and well-judged answers to dilemmas; poor decisions lower it. Reaching 100 makes you eligible for the presidency.

Ranks run Mailroom, Entry Level Manager, Junior Manager, Middle Manager, Senior Manager, Vice President, President. Promotion and demotion are decided only when you pass or land on Home, and move at most one rank at a time — so the climb takes laps of the board, not just a high rating.

Stress is the sum of the profiles of every project you hold. Carrying too much risks your work turning shoddy, which ships anyway and rebounds on you later.

Computer players also track friendliness toward each rival, raised by decent treatment and lowered by nasty surprises, and it guides everything they choose to do.

You may trade projects on your own turn, as often as you like, before rolling. You may also resign, handing your seat to a computer player.`,
  },
  home: {
    key: 'home',
    title: 'Home',
    body: `Home is the top-left corner and everyone starts there.

Passing or landing on Home awards Boss Rating and triggers a promotion or demotion check. That check moves you at most one rank, so reaching President means completing several laps however good your rating is.`,
  },
  projects: {
    key: 'projects',
    title: 'Projects',
    body: `Each project square shows a name, a progress bar down its left edge, and a tile colour. The colour is its profile, 1 to 5: higher profiles take more work, pay more Boss Rating, and add more stress.

Land on an unowned project and you are offered it. Land on a rival's and you must work on theirs instead, doing nothing for your own that turn. Land on your own and it gets extra work on top of the usual.

Every turn each project you own advances, unless you landed on someone else's. Name and bar show in the owner's colour, or black when unowned. A completed project pays out, raises the share price, then resets under a new name.

Own every project of one profile and work on them doubles. The profiles are not equal in size, so some sets are far easier to complete than others.`,
  },
  chance: {
    key: 'chance',
    title: 'Chance',
    body: `Chance squares are marked with dice. Landing on one draws an event that hits you alone — a windfall, a humiliation, or occasionally the consequence of something you did several turns ago.`,
  },
  scruples: {
    key: 'scruples',
    title: 'Scruples',
    body: `Scruples squares are marked with a question mark. Landing on one puts an office dilemma to you with three answers; pick with the mouse or keys 1 to 3.

Answers have immediate effects and can also set up something that surfaces later, so the profitable choice is not always the safe one.`,
  },
  officeParty: {
    key: 'officeParty',
    title: 'Office Party',
    body: `One player lands on it and the whole office attends, so everyone gets an outcome.

Anyone carrying too much work may drink to forget about it. Anyone carrying too little may celebrate rather harder than is wise. The comfortable middle works the room and leaves at a sensible hour. The boss is present throughout, and it all lands on Boss Rating.`,
  },
  meeting: {
    key: 'meeting',
    title: 'Meeting',
    body: `You present, and your Boss Rating moves by how it goes.

Holding a couple of projects tends to go well, since you can actually speak to them. Holding a great many tends to go badly. Holding none is the worst outcome on the board — the boss takes a dim view of a manager with nothing to report.`,
  },
  powerMonger: {
    key: 'powerMonger',
    title: 'Power Monger',
    body: `The most consequential square. You may take between zero and three actions, set by your rank: none in the Mailroom, one at Entry or Junior level, two at Middle or Senior, three as Vice President.

Each action is one of: do nothing; cancel any project on the board outright; or assign any project to any player, yourself included. Mix and repeat them freely up to your allowance.

Cancelling destroys the work already done. Assigning is how you hand a rival something enormous, or quietly complete a set of your own.`,
  },
  businessTrip: {
    key: 'businessTrip',
    title: 'Business Trip',
    body: `Sends you to Home and pays extra Boss Rating on top of the usual Home award. A promotion check happens on arrival, so it can be worth landing on.`,
  },
  stockMarket: {
    key: 'stockMarket',
    title: 'Stock Market',
    body: `One share price, shared by everybody. The board's Stock Ticker shows the latest change.

Shipping a project raises it, more so for higher profiles. Various events move it either way, and running the company costs something every round, so a table that stops delivering will watch it slide.

If the price reaches zero the company is disbanded and everyone loses, regardless of rank. When it is performing well the boss hands out rank-scaled rewards.`,
  },
  other: {
    key: 'other',
    title: 'Anything Else?',
    body: `Shortcuts: Space rolls, T opens trading, R resigns.

Every dialog answers to the keyboard. Enter takes the highlighted answer, or the main button — Take it on, Start game, Continue. Escape takes the other one: Decline, Cancel, Keep playing. On a Scruples dilemma, 1 to 3 pick an answer and Enter commits it; Escape does nothing there, because a dilemma has no safe default and dismissing it would be answering it.

On the New Game window each seat has a Human, Cpu and Off switch, and the theme control changes the artwork, the palette, the music and the card deck together.

High Scores keeps two tables of ten: shortest time to President, and highest share price reached. Short and Medium games have their turn counts scaled so they compare against Long ones.

Options: Sound toggles speech and effects, Music toggles the soundtrack separately. Auto Click dismisses result dialogs by itself after a set number of seconds, separately for human and computer players. The remaining options control how the board is scaled and how large its text stays.

This is an independent reimplementation, not the original program. Artwork, audio and text from the original are loaded from your own copy when present and are never distributed with it.`,
  },
};

const HELP_URL = 'assets/help.json';

interface RawHelp {
  topics?: Record<string, { title: string; body: string }>;
}

let original: Record<string, HelpTopic> | null = null;
let attempted = false;

/** Loads the original help text. Returns false when no extraction is installed. */
export async function loadHelp(): Promise<boolean> {
  if (attempted) return original !== null;
  attempted = true;
  try {
    const res = await fetch(HELP_URL);
    if (!res.ok) return false;
    const raw = (await res.json()) as RawHelp;
    if (!raw.topics) return false;
    const out: Record<string, HelpTopic> = {};
    for (const [key, v] of Object.entries(raw.topics)) {
      if (v && typeof v.body === 'string') out[key] = { key, title: v.title, body: v.body };
    }
    original = Object.keys(out).length ? out : null;
  } catch {
    return false;
  }
  return original !== null;
}

export function originalHelpAvailable(): boolean {
  return original !== null;
}

/** Topics for display. `useOriginal` falls back per-topic when one is missing. */
export function topics(useOriginal: boolean): HelpTopic[] {
  return TOPIC_ORDER.map((key) => {
    const own = OWN[key];
    if (useOriginal && original && original[key]) {
      return { key, title: own?.title ?? original[key].title, body: original[key].body };
    }
    return own;
  }).filter((t): t is HelpTopic => Boolean(t));
}
