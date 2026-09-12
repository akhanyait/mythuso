import contract from '../../../../packages/catalog/wellbeing.json';
/* Live well — the reasoning, with no screen attached to it.
 *
 * packages/catalog/wellbeing.json is the design. This module does only the part a contract cannot:
 * hand the words to a screen, and hold what somebody wrote for as long as the tab is open.
 *
 * Three things here are the feature rather than its plumbing.
 *
 * NOTHING TAKES A NUMBER. An entry is a habit and a sentence, and that is the whole of the type.
 * There is no field to put a figure in, so there is nothing to total, nothing to average, nothing
 * to compare and nothing to plot. That single absence is what makes the ten refusals cheap to keep
 * rather than a thing anybody has to be disciplined about: a weight in kilograms in this type
 * would have grown a line through it inside a week, and a line through somebody's body is an
 * opinion about their health that no clinician in this product ever issued.
 *
 * `days()` GROUPS BY THE DAY SOMETHING WAS WRITTEN AND SKIPS THE DAYS NOTHING WAS. There is no run
 * of days counted anywhere below, and there must not be one: a count of consecutive days is the
 * thing the contract's no-punished-gap refusal forbids whatever it gets called, and it punishes
 * exactly the person this product exists for — somebody who was too ill to write.
 *
 * NOTHING IS PERSISTED. No storage of any kind on this side of the app, as everywhere else in the
 * preview, and here it is also the honest thing rather than merely the rule: the capability notice
 * says nothing typed here is stored, and it is true because nothing is.
 */

export const whatItIs = contract.whatItIs;
export const habits = contract.habits;
export const timeline = contract.timeline;
export const takingItToAClinician = contract.takingItToAClinician;
/* It names clinical-records rather than a capability of its own. The contract's capabilityNote says
   why: there is no wellbeing supplier to be blocked on, and inventing one would be inventing a gap
   that does not exist. The notice is rendered by components/NotConnected.tsx, word for word. */
export const capabilityId = contract.capability;

export type Habit = typeof habits[number];
export type HabitId = Habit['id'];
export const habitById = (id: string): Habit => {
 const found = habits.find(habit => habit.id === id);
 /* Thrown on rather than found-or-undefined, for the reason capabilities.ts throws: a habit that
    quietly resolves to nothing is a prompt that has silently left the screen. */
 if (!found) throw new Error(`No habit "${id}" in packages/catalog/wellbeing.json`);
 return found;
};

/* The ten refusals, addressed by id and thrown on when one does not resolve.
 *
 * Each one is rendered word for word, once, at the place on the screen where it bites rather than
 * all ten in a block at the foot where the person about to write something will not read them:
 * no-diagnosis under the heading, no-sharing-by-default beside the field somebody is typing into,
 * no-punished-gap above the record, and the other seven together below. `elsewhere` is what keeps
 * that arrangement honest — add a refusal to the contract and it appears in the list without
 * anybody remembering to put it there. */
export const refusals = contract.refusals;
export const refusal = (id: string) => {
 const found = refusals.find(r => r.id === id);
 if (!found) throw new Error(`No refusal "${id}" in packages/catalog/wellbeing.json`);
 return found.sentence;
};
const placed = ['no-diagnosis', 'no-sharing-by-default', 'no-punished-gap'];
export const refusalsElsewhere = refusals.filter(r => !placed.includes(r.id));

/** A habit, some words, and when they were written. There is no fourth field and there is no room
    for one — see the head of this file. */
export type Entry = { id: string; habit: HabitId; words: string; at: number };

const DAY = 86_400_000;
const midnight = (at: number) => { const day = new Date(at); day.setHours(0, 0, 0, 0); return day.getTime(); };
/* Rounded rather than floored: the two ends of a South African day are the same length today, and
   will not be the day this runs somewhere that changes its clocks. */
export const dayOffsetOf = (at: number) => Math.round((midnight(at) - midnight(Date.now())) / DAY);
export const dayLabelOf = (offset: number) =>
 offset === 0 ? 'Today' : offset === -1 ? 'Yesterday'
  : new Date(Date.now() + offset * DAY).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
export const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });

/** What was written, newest first, in days — and only the days something was written.
 *
 *  A day nobody wrote on is absent from this list rather than present and empty. The difference is
 *  the whole of the no-punished-gap refusal: an empty row for a day somebody spent in bed is the
 *  product telling them they missed one, which is the same sentence a broken streak says in a
 *  friendlier font. Nothing counts the days between two of these groups. */
export const days = (entries: Entry[]) => {
 const newest = [...entries].sort((a, b) => b.at - a.at);
 const groups: { offset: number; label: string; entries: Entry[] }[] = [];
 for (const entry of newest) {
  const offset = dayOffsetOf(entry.at);
  const open = groups[groups.length - 1];
  if (open && open.offset === offset) open.entries.push(entry);
  else groups.push({ offset, label: dayLabelOf(offset), entries: [entry] });
 }
 return groups;
};

let written = 0;
export const write = (habit: HabitId, words: string): Entry => {
 written += 1;
 return { id: `wb-${written}`, habit, words: words.trim(), at: Date.now() };
};

/* The demonstration diary, in Lerato's own words and nobody else's.
 *
 * Fixtures, like the sample visits in Pages.tsx, and written as day offsets from today so the
 * preview never goes stale. Two things about them are deliberate. Not one of them contains a
 * figure, because a sample entry reading "walked two kilometres" is a worked example of the one
 * thing this feature refuses to hold. And there is nothing at all on the day between the last two,
 * so what a gap looks like here — nothing, no row, no note, no mention — is a thing a reader can
 * see rather than a sentence they have to take on trust. */
/* Today's samples are pulled back behind the clock rather than pinned to an hour.
 *
 * They were written at 07:40 and 07:45, which is a perfectly ordinary morning and wrong for anybody
 * opening the app before breakfast: a note written at 06:00 sorted *underneath* two entries stamped
 * later the same day, so "what you write goes to the top of your record" was false for a few hours
 * every morning and true for the rest — the worst kind of bug, because it is a real defect that
 * looks like a flaky test. A sample on an earlier day keeps its hour, which is what makes the
 * timeline read like a week rather than a list. */
const at = (dayOffset: number, hour: number, minute: number) => {
 const wanted = midnight(Date.now()) + dayOffset * DAY + hour * 3_600_000 + minute * 60_000;
 if (dayOffset < 0) return wanted;
 const nudge = (hour * 60 + minute) % 7;   /* keeps the samples in their written order */
 return Math.min(wanted, Date.now() - (3 + nudge) * 60_000);
};
export const sampleEntries = (): Entry[] => [
 { id: 'wb-s1', habit: 'moving', words: 'Walked to the shops and back. Easier than last week — I did not have to stop at the corner.', at: at(0, 7, 40) },
 { id: 'wb-s2', habit: 'feeling', words: 'Tired, but not the heavy kind.', at: at(0, 7, 45) },
 { id: 'wb-s3', habit: 'medicines', words: 'Took the morning ones. Forgot the evening ones until it was late.', at: at(-1, 20, 5) },
 { id: 'wb-s4', habit: 'eating', words: 'Pap and morogo at lunch, which sat better than the bread has been.', at: at(-1, 13, 10) },
 { id: 'wb-s5', habit: 'sleeping', words: 'Woke twice in the night. Got up sore, and then the morning was alright.', at: at(-3, 6, 20) }
];
