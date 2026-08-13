import type { Profile } from './types';

/**
 * Chance and Scruples decks.
 *
 * All card text here is newly written for this port. The original shipped 30 chance
 * cards and 36 scruples cards; none of their wording is reused. The *shapes* of the
 * effects follow SPEC.md §7 — chance cards hit the landing player, scruples cards offer
 * three answers with immediate and sometimes delayed consequences.
 *
 * Placeholders substituted at draw time:
 *   {you}      active player name
 *   {rival}    a random other player's name
 *   {project}  one of the active player's projects, if any
 */

export interface ChanceCard {
  text: string;
  /** Name of the original bitmap illustrating this card, when it came from that deck. */
  art?: string;
  bossRating?: number;
  stock?: number;
  /** Work added to (or removed from) every project the player owns. */
  work?: number;
  /** Move the player to this square index. */
  moveTo?: number;
  /** Queue a delayed consequence. */
  delayed?: { turns: number; text: string; bossRating?: number; stock?: number };
  /** Card only makes sense if the player owns something. */
  needsProject?: boolean;
  /** Card only makes sense with another player in the game. */
  needsRival?: boolean;
}

export const CHANCE: ChanceCard[] = [
  {
    text: '{you} reply-alls to a company-wide thread to ask everyone to stop reply-alling. Four hundred people notice.',
    bossRating: -5,
  },
  {
    text: 'The boss finds {you} at the desk at 7am. {you} had in fact slept there, but the boss does not need to know that.',
    bossRating: 6,
  },
  {
    text: '{you} fixes the office printer by staring at it. Nobody can explain it. Morale soars.',
    bossRating: 4,
    work: 1,
  },
  {
    text: '{you} schedules a meeting to decide whether the earlier meeting was necessary. It was not.',
    bossRating: -3,
    work: -1,
  },
  {
    text: 'A vendor sends {you} a fruit basket. {you} shares it. The goodwill is enormous and entirely undeserved.',
    bossRating: 3,
  },
  {
    text: '{you} presents a slide deck with one slide. It is the correct slide. The room is stunned.',
    bossRating: 7,
    stock: 3,
  },
  {
    text: 'Someone microwaves fish. {you} is blamed. {you} did not do it. It does not matter.',
    bossRating: -4,
  },
  {
    text: '{you} discovers a filing cabinet nobody has opened since the merger. Inside: budget nobody is tracking.',
    bossRating: 5,
    stock: 4,
  },
  {
    text: 'The quarterly numbers come in early and they are good. Everyone claims credit; {you} claims it loudest.',
    bossRating: 4,
    stock: 6,
  },
  {
    text: 'A rumour spreads that {you} is being headhunted. The boss becomes noticeably warmer.',
    bossRating: 6,
    delayed: {
      turns: 4,
      text: 'The headhunting rumour about {you} turns out to be about someone else entirely. The boss feels foolish.',
      bossRating: -7,
    },
  },
  {
    text: '{you} volunteers to organise the offsite. It goes badly. There was a canoe.',
    bossRating: -6,
    work: -1,
  },
  {
    text: '{you} accidentally forwards a spreadsheet with the hidden tab still in it. The hidden tab was honest.',
    bossRating: -8,
    stock: -3,
  },
  {
    text: 'The team ships early. {you} takes the week off and nobody notices the difference.',
    work: 2,
    bossRating: 2,
  },
  {
    text: '{you} is cc-ed on a thread meant for executives and reads all of it.',
    bossRating: 2,
    delayed: {
      turns: 3,
      text: 'It emerges that {you} read the executive thread. The executives are unamused.',
      bossRating: -6,
    },
  },
  {
    text: 'A consultant recommends restructuring. {rival} is restructured. {you} is not.',
    bossRating: 3,
    needsRival: true,
  },
  {
    text: 'Project {project} gets an unexpected budget line. Work accelerates.',
    work: 3,
    needsProject: true,
  },
  {
    text: 'The contractor on project {project} vanishes, taking the only copy of the schedule.',
    work: -3,
    bossRating: -3,
    needsProject: true,
  },
  {
    text: 'A trade publication praises the company. The stock ticks up and nobody knows why.',
    stock: 8,
  },
  {
    text: 'An analyst downgrades the company over "cultural concerns". The office party is cited.',
    stock: -7,
  },
  {
    text: '{you} is summoned for a surprise business trip. Off to the airport.',
    moveTo: 22,
  },
  {
    text: 'The fire alarm goes off during {you}\'s presentation. It was not a drill. It was the toaster.',
    bossRating: -2,
    work: -1,
  },
  {
    text: '{you} mentors an intern who turns out to be brilliant, and generously accepts the credit.',
    bossRating: 5,
    work: 1,
  },
  {
    text: 'A misfiled expense report of {you}\'s surfaces in an audit. It listed a jet ski.',
    bossRating: -9,
  },
  {
    text: '{you} says "let\'s take that offline" and, shockingly, actually does.',
    bossRating: 4,
  },
  {
    text: 'The boss\'s dog takes a liking to {you}. This matters far more than it should.',
    bossRating: 8,
  },
  {
    text: '{you} breaks the coffee machine. The office turns on {you} with real venom.',
    bossRating: -5,
    work: -1,
  },
  {
    text: 'A competitor collapses. The company absorbs its customers and its terrible software.',
    stock: 10,
    work: -1,
  },
  {
    text: '{you} finally reads the employee handbook and discovers an unclaimed allowance.',
    bossRating: 3,
  },
  {
    text: '{rival} publicly credits {you} for work {you} did not do. {you} accepts graciously.',
    bossRating: 5,
    needsRival: true,
  },
  {
    text: 'Payroll makes an error in {you}\'s favour. {you} reports it, loudly, where the boss can hear.',
    bossRating: 6,
  },
];

export interface ScruplesChoice {
  label: string;
  bossRating?: number;
  stock?: number;
  work?: number;
  /** Friendliness delta applied from every computer player toward the actor. */
  friendliness?: number;
  delayed?: { turns: number; text: string; bossRating?: number; stock?: number };
  outcome: string;
}

export interface ScruplesCard {
  situation: string;
  /** Name of the original bitmap illustrating this card, when it came from that deck. */
  art?: string;
  choices: [ScruplesChoice, ScruplesChoice, ScruplesChoice];
  needsRival?: boolean;
  needsProject?: boolean;
}

export const SCRUPLES: ScruplesCard[] = [
  {
    situation:
      '{you}, the last working projector in the building is booked by {rival} for tomorrow morning. {you} has a presentation at the same hour.',
    needsRival: true,
    choices: [
      {
        label: 'Quietly move the booking to your own name.',
        bossRating: 6,
        friendliness: -3,
        outcome: 'The presentation goes beautifully. {rival} presents to a blank wall.',
        delayed: {
          turns: 4,
          text: 'Facilities produces the booking log. Everyone learns what {you} did.',
          bossRating: -8,
        },
      },
      {
        label: 'Ask to share the slot.',
        bossRating: 2,
        friendliness: 2,
        outcome: 'Both presentations are rushed, but nobody is humiliated.',
      },
      {
        label: 'Present without slides.',
        bossRating: 4,
        friendliness: 1,
        outcome: 'Speaking from memory reads as confidence. The boss is quietly impressed.',
      },
    ],
  },
  {
    situation:
      '{you}, a worker on {rival}\'s team asks {you} for help getting transferred away from them.',
    needsRival: true,
    choices: [
      {
        label: 'Help, and take them for yourself.',
        bossRating: 4,
        work: 2,
        friendliness: -4,
        outcome: 'You gain a capable worker. {rival} gains a grudge.',
      },
      {
        label: 'Help, and place them elsewhere.',
        bossRating: 3,
        friendliness: 2,
        outcome: 'Word gets round that {you} looks after people. That currency spends well.',
      },
      {
        label: 'Tell {rival} about the request.',
        bossRating: -2,
        friendliness: -5,
        outcome: 'The worker is trapped and everyone hears how they got there.',
      },
    ],
  },
  {
    situation:
      '{you}, a consultant is reviewing project {project} and seems likely to conclude the problem is {you}.',
    needsProject: true,
    choices: [
      {
        label: 'Get ahead of it and admit the problems.',
        bossRating: 5,
        outcome: 'Owning it first defuses the report entirely. The boss respects candour.',
      },
      {
        label: 'Bury the consultant in documentation.',
        bossRating: 1,
        work: -1,
        outcome: 'The report is delayed indefinitely. So is everything else.',
      },
      {
        label: 'Undermine the consultant.',
        bossRating: 3,
        friendliness: -2,
        outcome: 'The consultant leaves. Their invoice does not.',
        delayed: {
          turns: 3,
          text: 'The consultant\'s successor arrives with the previous notes and a grudge.',
          bossRating: -7,
        },
      },
    ],
  },
  {
    situation:
      '{you}, the boss asks whether an underperforming worker of yours would suit {rival}\'s project.',
    needsRival: true,
    choices: [
      {
        label: 'Recommend them enthusiastically.',
        bossRating: 3,
        work: 1,
        friendliness: -4,
        outcome: 'The problem becomes {rival}\'s problem. This is called delegation.',
        delayed: {
          turns: 4,
          text: 'The worker {you} offloaded fails visibly, and the recommendation is remembered.',
          bossRating: -6,
        },
      },
      {
        label: 'Be honest about them.',
        bossRating: 6,
        friendliness: 3,
        outcome: 'Honesty costs nothing here and buys a great deal.',
      },
      {
        label: 'Say nothing and keep them.',
        work: -1,
        outcome: 'The status quo holds. The work does not.',
      },
    ],
  },
  {
    situation:
      '{you}, at a company dinner the boss challenges {you} to a drinking contest. There is a presentation in the morning.',
    choices: [
      {
        label: 'Win the contest.',
        bossRating: 9,
        work: -2,
        outcome: 'The boss is delighted. The morning is a catastrophe.',
      },
      {
        label: 'Lose gracefully and go home.',
        bossRating: 2,
        outcome: 'The presentation lands cleanly. Nobody remembers the dinner.',
      },
      {
        label: 'Decline entirely.',
        bossRating: -4,
        work: 1,
        outcome: 'The boss takes it personally, which is unreasonable and also permanent.',
      },
    ],
  },
  {
    situation:
      '{you}, someone from a competitor offers information that would speed up project {project}, for a small consideration.',
    needsProject: true,
    choices: [
      {
        label: 'Take the deal.',
        work: 4,
        stock: -2,
        outcome: 'Project {project} leaps forward on knowledge you should not have.',
        delayed: {
          turns: 5,
          text: 'Legal has questions for {you} about where project information came from.',
          bossRating: -12,
          stock: -5,
        },
      },
      {
        label: 'Refuse and report it.',
        bossRating: 7,
        stock: 3,
        outcome: 'Reporting it makes {you} briefly and genuinely a hero.',
      },
      {
        label: 'Refuse and say nothing.',
        bossRating: 1,
        outcome: 'Nothing happens, which is its own kind of decision.',
      },
    ],
  },
  {
    situation:
      '{you}, a worker leaving the company asks {you} for a reference. They were adequate at best.',
    choices: [
      {
        label: 'Write a glowing reference.',
        friendliness: 3,
        bossRating: -1,
        outcome: 'They get the job. Their new employer will discover things.',
      },
      {
        label: 'Write an accurate reference.',
        bossRating: 3,
        friendliness: -1,
        outcome: 'Accuracy is unfashionable but it holds up.',
      },
      {
        label: 'Refuse to write one.',
        bossRating: -2,
        friendliness: -3,
        outcome: 'The refusal is discussed at length in the kitchen.',
      },
    ],
  },
  {
    situation:
      '{you} discovers that project {project} will miss its date, and nobody else knows yet.',
    needsProject: true,
    choices: [
      {
        label: 'Escalate immediately.',
        bossRating: 4,
        stock: -2,
        outcome: 'Bad news early is still bad news, but it is survivable.',
      },
      {
        label: 'Quietly cut the scope.',
        bossRating: 2,
        work: 3,
        outcome: 'The date is met. Something important is missing from the product.',
        delayed: {
          turns: 4,
          text: 'Customers find what {you} cut from project scope. They write in.',
          bossRating: -5,
          stock: -4,
        },
      },
      {
        label: 'Say nothing and hope.',
        outcome: 'Hope is not a strategy, but it is free.',
        delayed: {
          turns: 2,
          text: 'The date {you} said nothing about arrives, and passes, publicly.',
          bossRating: -10,
          stock: -6,
        },
      },
    ],
  },
  {
    situation:
      '{you}, the boss asks {you} to deliver bad news to {rival} that the boss should really deliver personally.',
    needsRival: true,
    choices: [
      {
        label: 'Deliver it as instructed.',
        bossRating: 5,
        friendliness: -4,
        outcome: 'The boss is spared. {rival} will remember who was in the room.',
      },
      {
        label: 'Deliver it, and make clear whose decision it was.',
        bossRating: 1,
        friendliness: 2,
        outcome: 'Honest, and mildly disloyal. Both facts are noted.',
      },
      {
        label: 'Refuse.',
        bossRating: -6,
        friendliness: 4,
        outcome: 'Principled. Expensive.',
      },
    ],
  },
  {
    situation:
      '{you} is asked to sign off on numbers that are technically defensible and obviously optimistic.',
    choices: [
      {
        label: 'Sign.',
        bossRating: 4,
        stock: 5,
        outcome: 'The numbers go out. The market likes them a great deal.',
        delayed: {
          turns: 5,
          text: 'The optimistic numbers {you} signed meet reality. Reality wins.',
          bossRating: -9,
          stock: -10,
        },
      },
      {
        label: 'Sign with written caveats.',
        bossRating: 1,
        stock: 2,
        outcome: 'The caveats are ignored now and invaluable later.',
      },
      {
        label: 'Refuse to sign.',
        bossRating: -5,
        stock: -2,
        outcome: 'Someone else signs within the hour. {you} is now the difficult one.',
      },
    ],
  },
  {
    situation:
      '{you}, the office has a strict policy about the good conference room. The good conference room is empty.',
    choices: [
      {
        label: 'Use it anyway.',
        bossRating: 2,
        work: 1,
        outcome: 'Nobody stops {you}. Policies rarely survive an empty room.',
      },
      {
        label: 'Book it properly for next week.',
        bossRating: 1,
        outcome: 'Correct, patient, and slightly maddening.',
      },
      {
        label: 'Report that it sat empty all week.',
        bossRating: 4,
        friendliness: -3,
        outcome: 'Facilities is grateful. Everyone else is not.',
      },
    ],
  },
  {
    situation:
      '{you}, a junior employee takes the blame for a mistake that was actually {you}\'s.',
    choices: [
      {
        label: 'Let it stand.',
        bossRating: 3,
        friendliness: -5,
        outcome: 'The mistake is filed under someone else\'s name. Everyone saw.',
        delayed: {
          turns: 3,
          text: 'The truth about the mistake {you} let someone else carry gets out.',
          bossRating: -11,
        },
      },
      {
        label: 'Correct the record immediately.',
        bossRating: 4,
        friendliness: 5,
        outcome: 'Taking the hit publicly costs less than it looks like it will.',
      },
      {
        label: 'Correct it privately with the boss only.',
        bossRating: 2,
        friendliness: 1,
        outcome: 'The boss knows, the office does not. A reasonable compromise.',
      },
    ],
  },
];

/**
 * Boss Rating awarded the first time a player holds every project of one profile.
 * Scaled to match the tuned completion values in rules.ts.
 */
export const SET_BONUS_BOSS_RATING: Record<Profile, number> = {
  1: 3,
  2: 5,
  3: 7,
  4: 10,
  5: 13,
};
