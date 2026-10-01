/* The dispatch map's field-safety overlay: what is open in each suburb right now, grouped off the
   desk queue, with the proportion floored so a small roster never becomes a statistic about a place.
   Every number is read from the contract or the roster, so a changed floor or a changed roster moves
   the test with it rather than making it lie. What is held here is the three refusals
   field-safety.json#zoneOverlay.rules names: no score, nothing kept, and no verdict — plus the one
   thing the floor must never do, which is suppress a count. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, fieldSafety } from './rules.ts';
import { defaultTimings, defaultsInForce, panicWindowOf } from './settings.ts';
import { startTimer, tick, type Timer } from './checkins.ts';
import { raisePanic, type Panic } from './panics.ts';
import { deskQueue } from './desk.ts';
import { zoneOverlay, overlayCounts, proportionOf, countsSentence, nothingOpenSentence, type ZoneOpen } from './zone-overlay.ts';

const T0 = Date.UTC(2026, 8, 14, 6, 0);
const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => { assert.ok(r.ok); return (r as { value: T }).value; };
const overdueTimer = (ref: string, nurseRef: string, at: number): Timer => {
 const timer = ok(startTimer({ checkinRef: ref, event: { appointmentRef: `A-${ref}`, visitCodeMatched: true }, serviceId: 'senior', nurseRef }, at, defaultsInForce));
 return ok(tick(timer, timer.dueAt));
};
const panicAt = (ref: string, nurseRef: string, at: number): Panic =>
 ok(raisePanic({ panicRef: ref, raisedByRole: 'nurse', nurseRef, locationShareMinutes: defaultTimings.panicWindowMinutes }, at, panicWindowOf([])));

/* A roster as the overlay is handed one: suburb name to how many nurses work it. The real one has nine
   across six suburbs, so most of it sits below the floor — which is the state the floor exists for. */
const rostered = (counts: Record<string, number>) => (zone: string) => counts[zone] ?? 0;
const who = (suburbs: Record<string, string>) => (ref: string | null) => ({ nurse: ref ? `Nurse ${ref}` : null, suburb: ref ? (suburbs[ref] ?? '') : '' });
const floor = fieldSafety.settings.items.find(s => s.key === 'zone-share-minimum-nurses')!.default.value as number;

test('it groups the open queue by suburb and counts panics and overdues apart', () => {
 const now = T0 + 6 * 60 * MINUTE;
 const queue = deskQueue(
  [overdueTimer('CHK-1', 'N-201', T0), overdueTimer('CHK-2', 'N-204', T0)],
  [panicAt('PNC-1', 'N-201', now - 4 * MINUTE)],
  now,
  who({ 'N-201': 'Soweto', 'N-204': 'Soweto' })
 );
 const rows = zoneOverlay(queue, rostered({ Soweto: 3 }));
 assert.equal(rows.length, 1);
 /* Three items and two nurses: N-201 holds an overdue timer and the panic, N-204 the other timer. */
 assert.deepEqual(rows[0], { zone: 'Soweto', panics: 1, overdues: 2, open: 3, holders: 2, rostered: 3 });
 assert.deepEqual(overlayCounts(rows), { zones: 1, open: 3, panics: 1 });
});

test('only suburbs with something open come back, and a closed row counts towards nothing', () => {
 const now = T0 + 6 * 60 * MINUTE;
 const closed = ok(startTimer({ checkinRef: 'CHK-CLOSED', event: { appointmentRef: 'A-CLOSED', visitCodeMatched: true }, serviceId: 'senior', nurseRef: 'N-205' }, T0, defaultsInForce));
 /* A timer that never went overdue, in Melville: nothing open there, so no Melville row. */
 const queue = deskQueue([closed], [panicAt('PNC-1', 'N-201', now - 4 * MINUTE)], now, who({ 'N-201': 'Soweto', 'N-205': 'Melville' }));
 const rows = zoneOverlay(queue, rostered({ Soweto: 3, Melville: 1 }));
 assert.deepEqual(rows.map(r => r.zone), ['Soweto']);
});

test('a row with no suburb — a timer nobody has acted on yet — is dropped from the overlay and stays on the queue', () => {
 const now = T0 + 6 * 60 * MINUTE;
 const queue = deskQueue([overdueTimer('CHK-1', 'N-999', T0)], [], now, who({}));
 /* The desk still works it; the map has no suburb to put it in. */
 assert.equal(queue.length, 1);
 assert.equal(queue[0].suburb, '');
 assert.deepEqual(zoneOverlay(queue, rostered({})), []);
});

test('the proportion is floored by roster size, and the floor is k-anonymity not a verdict', () => {
 const oneNurse: ZoneOpen = { zone: 'Melville', panics: 1, overdues: 0, open: 1, holders: 1, rostered: 1 };
 const threeNurses: ZoneOpen = { zone: 'Soweto', panics: 1, overdues: 0, open: 1, holders: 1, rostered: 3 };
 const bigRoster: ZoneOpen = { zone: 'Sandton', panics: 1, overdues: 0, open: 1, holders: 1, rostered: floor };
 /* Below the floor: suppressed, and the sentence says how many nurses there are and that it is too few. */
 assert.equal(proportionOf(oneNurse, floor).drawn, false);
 assert.equal(proportionOf(oneNurse, floor).sentence, '1 nurse — too few to draw a proportion over', 'one nurse reads singular');
 /* Held to whichever side of the floor three nurses fall on, so a floor moved down to three moves the
    expectation with it instead of leaving the test asserting a suppression that no longer happens. */
 const three = proportionOf(threeNurses, floor);
 assert.equal(three.drawn, floor <= 3);
 assert.equal(three.sentence, floor <= 3 ? '1 of 3 nurses' : '3 nurses — too few to draw a proportion over');
 /* At the floor exactly: drawn, as two integers and never a percentage. */
 assert.equal(proportionOf(bigRoster, floor).drawn, true);
 assert.equal(proportionOf(bigRoster, floor).sentence, `1 of ${floor} nurses`);
 /* The suppressed sentence says why, and never grades the place it is about. */
 assert.ok(!proportionOf(oneNurse, floor).sentence.toLowerCase().match(/\b(safe|unsafe|risk|danger)\b/), 'a-zone-is-not-a-verdict');
 /* Nought rostered is no group at all, and answers suppressed rather than a proportion over nobody. */
 assert.equal(proportionOf({ ...oneNurse, rostered: 0 }, floor).drawn, false);
 assert.ok(!proportionOf({ ...oneNurse, rostered: 0 }, floor).sentence.includes('{'), 'no token is left unfilled');
});

test('the proportion counts nurses, not items — one nurse holding three items is one of the roster', () => {
 const now = T0 + 6 * 60 * MINUTE;
 /* One nurse in Soweto with two overdue timers and a panic. Counting items drew this as "3 of 3 nurses"
    while the other two on the roster had nothing open; with a fourth item it read "4 of 3". */
 const queue = deskQueue(
  [overdueTimer('CHK-1', 'N-201', T0), overdueTimer('CHK-2', 'N-201', T0)],
  [panicAt('PNC-1', 'N-201', now - 4 * MINUTE)],
  now,
  who({ 'N-201': 'Soweto' })
 );
 /* A roster at the floor, so the proportion is drawn and its numerator is on the screen. */
 const rows = zoneOverlay(queue, rostered({ Soweto: floor }));
 assert.equal(rows.length, 1);
 /* The items are counted whole: three open, two of them past check-out and one panic. */
 assert.deepEqual(rows[0], { zone: 'Soweto', panics: 1, overdues: 2, open: 3, holders: 1, rostered: floor });
 const share = proportionOf(rows[0], floor);
 assert.equal(share.drawn, true);
 assert.equal(share.sentence, `1 of ${floor} nurses`);
 /* The count of people is all that leaves the call: no reference or name rides on the row. */
 assert.ok(!JSON.stringify(rows).includes('N-201'), 'the nurse\'s reference never reaches the row');
 /* A second nurse in the same suburb is a second holder, and her one item adds one to the items too. */
 const two = zoneOverlay(deskQueue(
  [overdueTimer('CHK-1', 'N-201', T0), overdueTimer('CHK-2', 'N-201', T0), overdueTimer('CHK-3', 'N-202', T0)],
  [panicAt('PNC-1', 'N-201', now - 4 * MINUTE)], now, who({ 'N-201': 'Soweto', 'N-202': 'Soweto' })
 ), rostered({ Soweto: floor }));
 assert.equal(two[0].open, 4);
 assert.equal(two[0].holders, 2);
 assert.equal(proportionOf(two[0], floor).sentence, `2 of ${floor} nurses`);
});

test('THE COUNT IS DRAWN WHATEVER THE FLOOR IS — a suppressed proportion never hides an open panic', () => {
 const now = T0 + 6 * 60 * MINUTE;
 /* Melville has one nurse on the roster and one open panic in it. This is the case the floor must not
    swallow: it is exactly the incident the operator most needs to see. */
 const queue = deskQueue([], [panicAt('PNC-1', 'N-208', now - 4 * MINUTE)], now, who({ 'N-208': 'Melville' }));
 const rows = zoneOverlay(queue, rostered({ Melville: 1 }));
 assert.equal(rows.length, 1, 'the suburb is still on the overlay');
 assert.equal(rows[0].open, 1, 'and its count is drawn whole');
 assert.equal(rows[0].panics, 1);
 assert.equal(proportionOf(rows[0], floor).drawn, false, 'only the proportion is floored');
});

test('it computes no score, no trend and no ranking, and sorts by name rather than by count', () => {
 const now = T0 + 6 * 60 * MINUTE;
 /* Three suburbs with three different counts, so that all three orderings disagree: by name it is
    Alexandra, Melville, Soweto; most-open-first it is Alexandra, Soweto, Melville; fewest-first it is
    Melville, Soweto, Alexandra. Two suburbs cannot hold this, and neither can a tie — with one the two
    rankings share the name order or leave it ambiguous, and the test passes against a sort it should
    fail. Three distinct counts is the smallest fixture that fails on a ranking in either direction. */
 const queue = deskQueue(
  [overdueTimer('CHK-1', 'N-201', T0), overdueTimer('CHK-2', 'N-204', T0)],
  [panicAt('PNC-1', 'N-202', now - MINUTE), panicAt('PNC-2', 'N-207', now - 2 * MINUTE), panicAt('PNC-3', 'N-208', now - 3 * MINUTE), panicAt('PNC-4', 'N-209', now - 4 * MINUTE)],
  now,
  who({ 'N-201': 'Soweto', 'N-202': 'Soweto', 'N-204': 'Alexandra', 'N-207': 'Alexandra', 'N-208': 'Melville', 'N-209': 'Alexandra' })
 );
 /* The roster as it really is: Soweto three, Alexandra and Melville one each. Alexandra has three open
    against one nurse, which is the case the floor exists for and the case whose count must still be drawn. */
 const rows = zoneOverlay(queue, rostered({ Soweto: 3, Alexandra: 1, Melville: 1 }));
 assert.deepEqual(rows.map(r => ({ zone: r.zone, open: r.open })), [
  { zone: 'Alexandra', open: 3 },
  { zone: 'Melville', open: 1 },
  { zone: 'Soweto', open: 2 }
 ]);
 /* No field on a row is a score. Five integers beside the name, and no derived grade. */
 for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['holders', 'open', 'overdues', 'panics', 'rostered', 'zone'].sort());
});

test('it carries the contract\'s fields and none of the five it never carries', () => {
 const now = T0 + 6 * 60 * MINUTE;
 const queue = deskQueue([overdueTimer('CHK-1', 'N-201', T0)], [], now, who({ 'N-201': 'Soweto' }));
 const rows = zoneOverlay(queue, rostered({ Soweto: 3 }));
 const keys = Object.keys(rows[0]);
 assert.deepEqual([...keys].sort(), [...fieldSafety.zoneOverlay.carries].sort());
 for (const never of fieldSafety.zoneOverlay.neverCarries)
  assert.ok(!keys.some(k => k.toLowerCase().includes(never.field.toLowerCase())), `a zone row never carries ${never.field}`);
 /* A grouping of the queue never reintroduces the service the queue itself refuses: the timer was a senior visit. */
 assert.ok(!JSON.stringify(rows).toLowerCase().includes('senior'));
});

test('the counts sentence is the contract\'s, with the panic plural filled in, and a quiet board says so', () => {
 const one: ZoneOpen = { zone: 'Soweto', panics: 1, overdues: 1, open: 2, holders: 2, rostered: 3 };
 const two: ZoneOpen = { zone: 'Soweto', panics: 2, overdues: 0, open: 2, holders: 2, rostered: 3 };
 assert.equal(countsSentence(one), '2 open in Soweto');
 /* One panic reads singular, two plural — the {panicPlural} token is filled, not left in the sentence. */
 assert.ok(!countsSentence(one).includes('{'));
 assert.ok(!countsSentence(two).includes('{'));
 assert.equal(nothingOpenSentence(), fieldSafety.zoneOverlay.noZoneSentence);
});
