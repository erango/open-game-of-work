import type { ChanceCard, ScruplesCard } from './cards';

/**
 * A third Chance and Scruples pack, in the cyberpunk register the reskin takes.
 *
 * Additive: `cards.ts` (this port's original writing) and the recovered original deck are both
 * untouched, and all three can be selected or shuffled together — see `decks.ts`.
 *
 * All text here is newly written. The numeric shapes deliberately stay inside the ranges the
 * `new` pack already occupies (Boss Rating -9..+9, stock -7..+10, work -3..+4, friendliness
 * -5..+5, two delayed chance cards, roughly a quarter of answers delayed), so swapping packs
 * changes the voice and not the balance.
 *
 * Placeholders substituted at draw time: {you}, {rival}, {project}.
 */

export const CHANCE_NEON: ChanceCard[] = [
  {
    text: '{you} ships a patch at 03:00 that removes four thousand lines and breaks nothing. The commit message is a single full stop.',
    bossRating: 7,
    stock: 3,
  },
  {
    text: 'A compliance drone follows {you} for the whole shift, filming. The footage is used in the recruitment ad.',
    bossRating: 5,
  },
  {
    text: '{you} accepts the free eye upgrade from the company clinic. The overlay is advertising. It cannot be turned off.',
    bossRating: 3,
    work: 1,
  },
  {
    text: 'Someone pastes a live production token into the all-hands channel. {you} rotates it before anyone else has finished reading.',
    bossRating: 8,
    stock: 4,
  },
  {
    text: '{you} lets an unattended terminal auto-lock instead of walking back. Security logs it as an incident anyway.',
    bossRating: -2,
  },
  {
    text: 'The building AI develops a preference for {you} and begins holding lifts. Everyone else notices, and resents it.',
    bossRating: 4,
  },
  {
    text: '{you} rewrites a legacy service in a language nobody else on the floor reads. It is beautiful. It is now unmaintainable.',
    bossRating: 6,
    work: 2,
  },
  {
    text: 'A recruiter reaches {you} on an internal channel. The message is visible in {you}’s history for three days before anyone thinks to check.',
    bossRating: -6,
  },
  {
    text: '{you} presents a roadmap as a single glowing arrow. The board applauds. Nobody asks what the arrow is made of.',
    bossRating: 6,
    stock: 6,
  },
  {
    text: 'Cost control cuts the floor’s cooling by nine percent. {you}’s rig throttles and every deadline slips.',
    work: 3,
    bossRating: -3,
    stock: -7,
  },
  {
    text: '{you} finds the bug. The bug is in {you}’s own code from two quarters ago. {you} fixes it quietly and takes the credit for the fix.',
    bossRating: 5,
    work: -1,
  },
  {
    text: 'A neural-link firmware update makes standing meetings feel four times longer. Nobody schedules fewer of them.',
    bossRating: -4,
  },
  {
    text: '{you} discovers the office coffee subscription has been billing a decommissioned cost centre for a year. Finance is thrilled with {you}.',
    bossRating: 5,
    stock: 3,
  },
  {
    text: 'The quarterly synergy hologram malfunctions and displays {you}’s browser history across the atrium for six seconds.',
    bossRating: -9,
    stock: -2,
  },
  {
    text: '{you} volunteers for the on-call rotation nobody wants. It is quiet all week. The gratitude is disproportionate.',
    bossRating: 6,
    work: -1,
  },
  {
    text: 'A ransomware crew encrypts the archive nobody has read since the merger. {you} points out the backups exist and are current.',
    bossRating: 4,
    stock: 8,
  },
  {
    text: '{you} misreads a dashboard and escalates an outage that is not happening. Two teams are woken. The dashboard was wrong, but so was {you}.',
    bossRating: -5,
  },
  {
    text: 'The vending machine begins accepting {you}’s expired badge. {you} says nothing for a fortnight.',
    bossRating: 2,
  },
  {
    text: '{you} automates the weekly report. The automation writes better prose than the humans it replaced, which several of them notice.',
    bossRating: 5,
    work: -2,
  },
  {
    text: 'A drone delivery lands on {project}’s only prototype. The crate is labelled "fragile", which is now ironic.',
    work: 4,
    workSingleProject: true,
    needsProject: true,
    bossRating: -3,
  },
  {
    text: '{you} refuses the productivity implant on principle. The principle is admired and the throughput is not.',
    bossRating: -2,
    work: 1,
  },
  {
    text: 'Legal discovers {you} has been the sole reviewer on every deploy for eleven weeks. This is a finding. It is also a compliment.',
    bossRating: 3,
    work: 2,
  },
  {
    text: '{you} gets the corner pod with the working window. The window looks at another window.',
    bossRating: 4,
  },
  {
    text: 'A rival division open-sources the tool {you} was three weeks from shipping. {you} contributes to it instead and is named a maintainer.',
    bossRating: 6,
    work: -3,
    stock: -3,
  },
  {
    text: 'The badge system loses {you} entirely. For two days {you} does not exist, and gets more done than in the previous month.',
    bossRating: 3,
    work: -1,
    delayed: {
      turns: 3,
      text: 'Payroll catches up with the badge system. {you} was not paid for those two days, and says so loudly.',
      bossRating: -4,
    },
  },
  {
    text: 'A junior asks {you} to review a design. It is better than {you}’s. {you} says so, in writing, in the shared channel.',
    bossRating: 5,
  },
  {
    text: '{you} skips the mandatory resilience workshop to actually be resilient about something. Attendance is tracked.',
    bossRating: -3,
    work: -1,
  },
  {
    text: 'An analyst upgrades the company on the strength of one demo. {you} gave the demo, and knows exactly how much of it was real.',
    bossRating: 4,
    stock: 10,
    delayed: {
      turns: 5,
      text: 'The analyst asks to see the demo again, in production this time. {you} runs out of excuses.',
      bossRating: -6,
      stock: -7,
    },
  },
  {
    text: '{you} restores the archive from cold storage on a hunch. The hunch is right and the file is the one Legal needed.',
    bossRating: 8,
  },
  {
    text: 'The all-hands is moved to the immersive suite. {you} is sick for forty minutes afterwards, but is filmed nodding.',
    bossRating: 2,
    work: 1,
  },
];

export const SCRUPLES_NEON: ScruplesCard[] = [
  {
    situation:
      '{you}, the floor’s only working uplink is reserved by {rival} for a client demo at the hour {you} needs it to ship.',
    needsRival: true,
    choices: [
      {
        label: 'Reassign the reservation to yourself and blame the scheduler.',
        bossRating: 6,
        friendliness: -4,
        outcome: 'The release lands on time. {rival} demos to a spinning connection icon.',
        delayed: {
          turns: 4,
          text: 'The scheduler’s audit log is not as forgetful as {you} hoped. It has {you}’s name on it.',
          bossRating: -8,
        },
      },
      {
        label: 'Split the window and warn them.',
        bossRating: 2,
        friendliness: 3,
        outcome: 'Both go out degraded, and neither of you is the story afterwards.',
      },
      {
        label: 'Ship over the public network and eat the risk.',
        bossRating: 4,
        stock: -2,
        outcome: 'It works. Security has questions for a week, but it works.',
      },
    ],
  },
  {
    situation:
      '{you} finds an unlogged admin key in an old repository. It still works on everything.',
    // One answer unblocks {project}, so the card needs the player to own one.
    needsProject: true,
    choices: [
      {
        label: 'Report it, loudly, in the security channel.',
        bossRating: 5,
        friendliness: 2,
        outcome: 'The rotation takes a weekend. {you} is the reason it was only a weekend.',
      },
      {
        label: 'Report it quietly to one person and keep a copy.',
        bossRating: 3,
        friendliness: -1,
        outcome: 'The hole is closed. The copy stays in {you}’s pocket, unmentioned.',
        delayed: {
          turns: 5,
          text: 'A routine key audit finds {you}’s copy. Nobody believes it was for convenience.',
          bossRating: -7,
        },
      },
      {
        label: 'Use it to unblock {project} first.',
        bossRating: 4,
        work: -2,
        outcome: 'Two weeks of blocked work clears in an afternoon. Nobody asks how.',
        delayed: {
          turns: 3,
          text: 'The access logs surface in a compliance review with {you} all over them.',
          bossRating: -6,
        },
      },
    ],
  },
  {
    situation:
      '{you}, the model that scores everyone’s productivity has a bug that flatters {you} by about fifteen percent.',
    choices: [
      {
        label: 'Fix it.',
        bossRating: 3,
        friendliness: 4,
        outcome: 'The score drops and the respect does not. It is a better trade than it looks.',
      },
      {
        label: 'Say nothing until review season is over.',
        bossRating: 7,
        friendliness: -3,
        outcome: 'The review goes extremely well. {you} is careful not to look pleased.',
        delayed: {
          turns: 4,
          text: 'Someone else finds the bug, and finds {you} filed a ticket about it months ago.',
          bossRating: -9,
        },
      },
      {
        label: 'Fix it, and fix the three that flatter other people too.',
        bossRating: 5,
        friendliness: -2,
        work: 1,
        outcome: 'Accuracy improves across the floor. So does the number of people annoyed with {you}.',
      },
    ],
  },
  {
    situation:
      '{you} is asked to sign off on {rival}’s architecture. It will work, and it will be miserable to maintain for years.',
    needsRival: true,
    choices: [
      {
        label: 'Sign it. Not your problem.',
        bossRating: 3,
        friendliness: 3,
        outcome: 'It ships. It works. The maintenance burden arrives later, for someone.',
        delayed: {
          turns: 6,
          text: 'The maintenance burden arrives for {you}, specifically, in writing.',
          bossRating: -5,
          stock: -4,
        },
      },
      {
        label: 'Refuse, in detail, in the shared review.',
        bossRating: 5,
        friendliness: -5,
        outcome: 'The review is unpleasant and the design gets better. {rival} does not forget it.',
      },
      {
        label: 'Sign it, and quietly write the migration plan nobody asked for.',
        bossRating: 4,
        work: 3,
        friendliness: 1,
        outcome: 'Nine months later the plan is the only reason the migration is survivable.',
      },
    ],
  },
  {
    situation:
      '{you}, the office AI offers to draft the performance review of someone {you} manages. It is a good draft.',
    choices: [
      {
        label: 'Send it as written.',
        bossRating: 2,
        friendliness: -4,
        outcome: 'It is accurate, fluent and obviously not written by a person. They can tell.',
      },
      {
        label: 'Rewrite it yourself, badly, over three evenings.',
        bossRating: 4,
        work: 2,
        friendliness: 5,
        outcome: 'It is worse prose and much better received.',
      },
      {
        label: 'Use it as notes and have the conversation in person.',
        bossRating: 5,
        friendliness: 3,
        outcome: 'The conversation goes somewhere the draft never would have.',
      },
    ],
  },
  {
    situation:
      '{you} could finish {project} tonight by pushing untested code straight to production.',
    needsProject: true,
    choices: [
      {
        label: 'Push it.',
        bossRating: 6,
        stock: 5,
        work: -3,
        outcome: 'It holds. The demo is triumphant and nobody looks at the coverage report.',
        delayed: {
          turns: 3,
          text: 'The untested path finds a customer. The incident review finds {you}.',
          bossRating: -8,
          stock: -5,
        },
      },
      {
        label: 'Push it behind a flag, off by default.',
        bossRating: 4,
        work: -1,
        outcome: 'It ships on paper, which is enough for the meeting and honest enough to defend.',
      },
      {
        label: 'Miss the date and say why.',
        bossRating: -2,
        friendliness: 2,
        outcome: 'The date slips a week. The trust does not.',
      },
    ],
  },
  {
    situation:
      '{you} overhears {rival} on a call agreeing to a deadline nobody on the floor can meet.',
    needsRival: true,
    choices: [
      {
        label: 'Escalate it now, over their head.',
        bossRating: 5,
        friendliness: -5,
        outcome: 'The deadline moves. So does everyone’s opinion of {you}.',
      },
      {
        label: 'Tell {rival} privately and let them fix it.',
        bossRating: 2,
        friendliness: 4,
        outcome: 'They fix it, badly, and credit themselves. {you} is owed one.',
      },
      {
        label: 'Say nothing and prepare to be the one who saves it.',
        bossRating: 4,
        work: 3,
        outcome: 'The rescue is heroic. It was also entirely avoidable, which {you} knows.',
        delayed: {
          turns: 4,
          text: 'It emerges that {you} knew about the deadline three weeks before the rescue.',
          bossRating: -6,
        },
      },
    ],
  },
  {
    situation:
      '{you}, a contractor asks whether their team is being cut. {you} was told this morning that it is.',
    choices: [
      {
        label: 'Tell them.',
        bossRating: -4,
        friendliness: 5,
        outcome: 'They have four weeks to land somewhere instead of four days. Legal is furious.',
      },
      {
        label: 'Say you cannot say, in a tone that says it.',
        bossRating: 1,
        friendliness: 2,
        outcome: 'They understand perfectly and nothing is on the record.',
      },
      {
        label: 'Deny it.',
        bossRating: 3,
        friendliness: -4,
        outcome: 'The line holds for nine days, and then it does not.',
        delayed: {
          turns: 3,
          text: 'The cuts are announced. Everyone remembers exactly what {you} said.',
          bossRating: -7,
        },
      },
    ],
  },
  {
    situation:
      '{you} is offered a night-shift bonus that requires the sleep-suppression implant.',
    choices: [
      {
        label: 'Take it and work through.',
        bossRating: 6,
        work: -2,
        outcome: 'Three weeks of output nobody can argue with, and a tremor nobody mentions.',
        delayed: {
          turns: 5,
          text: 'The tremor becomes a medical leave. The output does not carry over.',
          bossRating: -6,
        },
      },
      {
        label: 'Take the bonus, skip the implant, sleep anyway.',
        bossRating: 2,
        stock: -2,
        outcome: 'The numbers are unremarkable and {you} is fully conscious for all of them.',
      },
      {
        label: 'Decline and say why in the health survey.',
        bossRating: -1,
        friendliness: 4,
        outcome: 'The survey is anonymous. Within a week, everyone knows who wrote it.',
      },
    ],
  },
  {
    situation:
      '{you} finds that {project} duplicates a system {rival}’s team shipped last quarter.',
    needsRival: true,
    needsProject: true,
    choices: [
      {
        label: 'Kill yours and adopt theirs.',
        bossRating: 4,
        work: -3,
        friendliness: 3,
        outcome: 'A quarter of work evaporates and the floor is measurably better off.',
      },
      {
        label: 'Finish yours and argue it is better.',
        bossRating: 3,
        work: 2,
        friendliness: -3,
        outcome: 'It is marginally better and cost twice as much. Both facts are presented selectively.',
      },
      {
        label: 'Merge the teams and put yourself in charge.',
        bossRating: 7,
        friendliness: -2,
        outcome: 'Consolidation reads as leadership. {rival} reads it differently.',
        delayed: {
          turns: 4,
          text: 'Half of {rival}’s team transfers out, and the reason given is {you}.',
          bossRating: -5,
        },
      },
    ],
  },
  {
    situation:
      '{you}, the incident review needs a cause. The honest answer is that the process failed, not a person.',
    choices: [
      {
        label: 'Name the process, and say so plainly.',
        bossRating: 4,
        friendliness: 3,
        outcome: 'The process changes. Two people who expected to be blamed remember it for years.',
      },
      {
        label: 'Name the junior who pressed the button.',
        bossRating: 5,
        friendliness: -5,
        outcome: 'The review closes in twenty minutes and the room is very quiet.',
        delayed: {
          turns: 3,
          text: 'The junior resigns and their exit notes circulate. {you} is named in them.',
          bossRating: -8,
        },
      },
      {
        label: 'Take it yourself.',
        bossRating: -2,
        friendliness: 5,
        outcome: 'It costs {you} the quarter and buys something that lasts longer than a quarter.',
      },
    ],
  },
  {
    situation:
      '{you} is handed the budget for the floor and told to find nine percent.',
    choices: [
      {
        label: 'Cut the training budget. Nobody notices for a year.',
        bossRating: 5,
        stock: 3,
        friendliness: -3,
        outcome: 'The number is found on the first pass and the cost arrives much later.',
        delayed: {
          turns: 6,
          text: 'Two senior engineers leave for somewhere that still trains people. Their exit interviews are specific.',
          bossRating: -5,
          stock: -6,
        },
      },
      {
        label: 'Cut your own headcount request and absorb the work.',
        bossRating: 3,
        work: 4,
        friendliness: 2,
        outcome: 'The floor is intact and {you} is doing the job of one and a half people.',
      },
      {
        label: 'Refuse and present the case for nine percent more.',
        bossRating: -5,
        friendliness: 4,
        outcome: 'The case is good. It is also declined, and remembered as insubordination.',
      },
    ],
  },
];
