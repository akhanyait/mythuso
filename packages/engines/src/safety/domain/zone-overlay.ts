/* The dispatch map's field-safety overlay: what is open in each suburb right now.
 *
 * WHY THIS EXISTS. The desk queue and the dispatch board were two pictures of one afternoon, and an
 * operator choosing which nurse to send to Soweto while a panic was open in Soweto was reading two
 * screens and reconciling them by hand. This groups the queue's own rows by suburb so the zones the
 * board already draws can carry the counts that belong to them. It is a grouping and nothing more:
 * it has no route, no store and no figure that outlives the render that drew it.
 *
 * THE THREE THINGS IT WILL NOT DO, all of them in packages/catalog/field-safety.json#zoneOverlay.rules
 * and each one enforced structurally here rather than by convention:
 *
 *  1. NO SCORE, NO TREND, NO RANKING (no-zone-risk-score). ZoneOpen carries a suburb's name and five
 *     counts: three of rows in the queue handed in, one of the people those rows belong to, and one of
 *     people from the roster. There is no
 *     weighted figure, no comparison against an earlier draw, and no sort that could be read as a
 *     league table. geography.json's no-history-drawn says no map here draws where anybody has been,
 *     and a score is that rule broken with arithmetic instead of pixels — to rank a suburb you have to
 *     keep what happened in it. There is also no reviewer for the claim a score would make: a number
 *     on a map that says a suburb is dangerous decides whether a patient is seen at home or on a
 *     screen, and nothing in this repository is qualified to make that call.
 *
 *  2. NOTHING KEPT (nothing-is-kept). Every call recomputes from the arguments. No module state, no
 *     cache, no memo outside the caller's own render. A figure that survives its render becomes a
 *     history whatever it was called, and the first version of this overlay that remembered
 *     yesterday's count would be this product's first record of where trouble had been. Deriving it
 *     is also what stops the two screens disagreeing: the queue is the arithmetic on the timers and
 *     panics, so the map cannot say two are open while the desk says one.
 *
 *  3. NO VERDICT (a-zone-is-not-a-verdict). Every sentence comes from the contract and none of them
 *     grades a place. 'Soweto is high risk' is a claim about a suburb and about the people in it made
 *     by a count of three; 'two nurses are past check-out in Soweto' is a thing an operator can act on
 *     in the next minute, and it is the only sentence this product has the data for.
 *
 * WHAT THE FLOOR GOVERNS, AND WHAT IT DOES NOT. The floor is k-anonymity and it applies to the
 * proportion alone. The counts are drawn whole whatever it is set to, and that is deliberate: an open
 * panic in a suburb with one nurse on the roster is exactly the incident the operator most needs to
 * see, and a suppression rule that hid it would be a safety feature protecting a suburb's reputation
 * instead of a person. What the floor stops is the other thing — one of one nurse with something open
 * drawn as a statistic about a place. The roster has nine nurses across six suburbs, Soweto three,
 * Randburg two and four suburbs with one each, so on a real day most of them are below any floor and
 * are drawn from a single incident apiece. The counts say which nurse's afternoon that is; the
 * proportion would only have said a number about her.
 *
 * The proportion is drawn as two integers, never as a percentage. A percentage is what makes three
 * data points look like a measurement, and the honest form of one of three is the two numbers.
 *
 * Zero dependencies and apps/api's type-stripping rules: no enums, no namespaces, no constructor
 * parameter properties. Time is not read here at all — the queue carries the ages and this file has
 * no reason to know what o'clock it is, which is part of what stops it accumulating anything.
 */
import { fieldSafety, fill } from './rules.ts';
import type { DeskItem } from './desk.ts';

/** One suburb's open items, counted off the queue handed in. Five counts and no person. */
export type ZoneOpen = {
 /** The suburb's name, as the roster and geography.json both write it. Never a zone id a screen would have to resolve. */
 readonly zone: string;
 readonly panics: number;
 readonly overdues: number;
 /** Panics plus overdues that are still open. A closed row counts towards nothing here. */
 readonly open: number;
 /** How many different nurses those open items belong to, each counted once however many she holds. The
     proportion's numerator: a nurse with a panic and two overdue timers is one nurse with something open,
     and counting her three times drew "3 of 3 nurses" over a suburb where the other two had nothing open.
     A count, never a person — the references it is counted from stay inside zoneOverlay(). */
 readonly holders: number;
 /** How many nurses work this suburb, from the roster. A count of people, never a person. */
 readonly rostered: number;
};

/* The proportion, and the two ways it can be answered. `drawn: true` gives the two integers; `false`
   gives the contract's own sentence saying how many nurses there are and why that is too few to draw
   one over. A suppressed zone is not a hidden zone: its counts are on the overlay either way, and the
   sentence says what was withheld and what the floor was, rather than leaving a gap a reader fills
   with a guess. */
export type ZoneProportion =
 | { readonly drawn: true; readonly sentence: string }
 | { readonly drawn: false; readonly sentence: string };

const overlay = fieldSafety.zoneOverlay;

/**
 * Group the live queue by suburb and count what is open.
 *
 * `rosteredBy` is handed in rather than read here, for the same reason deskQueue takes a `who`: the
 * engine holds references and knows no roster. A suburb with no nurse rostered to it is still drawn if
 * something is open there — a nurse covering a suburb she is not rostered to is precisely the case
 * where the count matters and the proportion would be a lie.
 *
 * Only suburbs with something open come back. A board with six amber circles on a quiet afternoon
 * would be noise the operator has to look past to find the one that is real; an uncoloured zone says
 * nothing is open there, which is true of the queue this was computed from and is the same fact the
 * desk's own rows state.
 */
export function zoneOverlay(queue: readonly DeskItem[], rosteredBy: (zone: string) => number): ZoneOpen[] {
 /* Each suburb's counts, and beside them the set of whoever the open rows belong to. The set is how a
    nurse is counted once, and it never leaves this call: only its size goes on the row, so a reference
    is used to tell two people apart and is not carried anywhere a screen could draw it. A row whose
    nurse is not known is counted as an item and as nobody — guessing it was a different person would
    inflate the numerator, and guessing it was the same one would be a guess either way. */
 const byZone = new Map<string, { panics: number; overdues: number; open: number; who: Set<string> }>();
 for (const row of queue) {
  if (!row.open) continue;
  const zone = row.suburb;
  /* A row with no suburb is a timer nobody has acted on yet, which has no nurse and so no zone. It is
     dropped from the overlay and stays on the desk's own rows, where it belongs: the queue is what an
     operator works, and the map is a picture of part of it. */
  if (!zone) continue;
  const found = byZone.get(zone) ?? { panics: 0, overdues: 0, open: 0, who: new Set<string>() };
  if (row.kind === 'panic') found.panics += 1; else found.overdues += 1;
  found.open += 1;
  if (row.nurse) found.who.add(row.nurse);
  byZone.set(zone, found);
 }
 /* Sorted by name. Not by count: a sort on the counts is a ranking with the heading taken off, and
    the ordering a controller needs on a map is the one the map already gives her — where the suburb
    is. The oldest-first order the queue carries is preserved on the queue, where picking something
    up happens. */
 return [...byZone.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([zone, { panics, overdues, open, who }]) => ({ zone, panics, overdues, open, holders: who.size, rostered: rosteredBy(zone) }));
}

/** How many suburbs have something open, and how many items are open across all of them. */
export const overlayCounts = (zones: readonly ZoneOpen[]) => ({
 zones: zones.length,
 open: zones.reduce((total, zone) => total + zone.open, 0),
 panics: zones.reduce((total, zone) => total + zone.panics, 0)
});

/** The heading's own line: how many open across how many suburbs, with the plural filled in. */
export const totalsSentence = (zones: readonly ZoneOpen[]): string => {
 const counts = overlayCounts(zones);
 return fill(overlay.totalSentence, {
  open: String(counts.open),
  zones: String(counts.zones),
  zonePlural: counts.zones === 1 ? '' : 's'
 });
};

/**
 * The proportion, or the sentence saying why there is none.
 *
 * `floor` is the setting in force — zone-share-minimum-nurses — handed in by the caller the way a
 * timer is handed its grace, so this file reads no setting and there is no default for it to fall
 * back on. A floor of five over a suburb with three nurses answers `drawn: false`, and the counts
 * are drawn anyway: that is what whyCountsAreNeverFloored is about.
 */
export function proportionOf(zone: ZoneOpen, floor: number): ZoneProportion {
 /* The numerator is people and not items: the label says "nurses with something open", and a count of
    items over a count of nurses can read 4 of 3. */
 const values = {
  holders: String(zone.holders),
  rostered: String(zone.rostered),
  nursePlural: zone.rostered === 1 ? '' : 's'
 };
 /* Nought rostered is not a small group, it is no group at all — and the sentence that fits is the
    suppressed one rather than a proportion over nobody. */
 if (zone.rostered < floor) return { drawn: false, sentence: fill(overlay.share.suppressedSentence, values) };
 return { drawn: true, sentence: fill(overlay.share.sentence, values) };
}

/** The contract's own sentence for one suburb's counts, with the panic plural filled in. */
export const countsSentence = (zone: ZoneOpen): string => fill(overlay.countSentence, {
 zone: zone.zone,
 open: String(zone.open),
 panics: String(zone.panics),
 overdues: String(zone.overdues),
 panicPlural: zone.panics === 1 ? '' : 's'
});

/** The line under a count: how many of each kind, so a suburb's colour is never the only thing saying it. */
export const kindsSentence = (zone: ZoneOpen): string => fill(overlay.kindsSentence, {
 zone: zone.zone,
 open: String(zone.open),
 panics: String(zone.panics),
 overdues: String(zone.overdues),
 panicPlural: zone.panics === 1 ? '' : 's'
});

/** What the overlay says when nothing anywhere is open. */
export const nothingOpenSentence = (): string => overlay.noZoneSentence;
