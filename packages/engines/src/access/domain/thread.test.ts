/* The visit thread's refusals, each in the route's own words, and the one thing it never does: publish.
   The length and the hours a thread stays open are Access's settings, read here as they stand with no
   history — the defaults — and changed by handing the domain a different value, as a change would. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../../catalog/apis/access.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { cancelBooking, emptyLedger, offeredDays, requestBooking, type Candidate, type Ledger } from './booking.ts';
import { accessInForce } from './settings.ts';
import { closeThread, closedSentence, completeThread, postMessage, readThread, threadAt, threadFor, type Post, type Thread } from './thread.ts';
import type { Outcome } from './contract.ts';

const now = new Date('2026-09-14T10:00:00+02:00');
const HOUR = 3_600_000;
const WRITE = 'POST /v1/access/visit-threads/{bookingRef}/messages@1';
const READ = 'GET /v1/access/visit-threads/{bookingRef}@1';
const inForce = accessInForce([]);
const MAX = inForce.threadMaxCharacters;
const statement = (route: string, id: string) =>
 access.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;
function ok<T>(outcome: Outcome<T>) {
 if (outcome.refused) assert.fail(`refused: ${outcome.id}`);
 return outcome;
}
const naledi: Candidate = { nurseRef: 'N-205', name: 'N-205', zone: 'Rosebank', covered: true, badgeCurrent: true, notOfferedBecause: null, distanceKm: 3 };
const book = (slotRef: string): { ledger: Ledger; thread: Thread; bookingRef: string } => {
 const { value } = ok(requestBooking(emptyLedger, { idempotencyKey: slotRef, subjectRef: 'subject-lerato', serviceId: 'vitals', mode: 'home', slotRef, zoneId: geography.zones[0]!.id, actorRole: 'patient' },
  { now, candidates: [naledi], namedNurseFallback: inForce.namedNurseFallback }));
 return { ledger: value.ledger, thread: threadFor(value.booking), bookingRef: value.booking.bookingRef };
};
const post = (thread: Thread, p: Omit<Post, 'maxCharacters' | 'now'> & { maxCharacters?: number; now?: Date }) =>
 postMessage(thread, { now, maxCharacters: MAX, ...p });
const day = offeredDays(now)[0]!;
const patient = { role: 'patient' as const, ref: 'subject-lerato' };
const theNurse = { role: 'nurse' as const, ref: 'N-205' };

test('the patient and the named nurse write, a message is kept and not delivered, and nothing is published', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const first = ok(post(thread, { idempotencyKey: 'm-1', actor: patient, message: '  The gate code is at the guard hut.  ' }));
 assert.equal(first.events.length, 0);
 assert.equal(first.value.message.message, 'The gate code is at the guard hut.');
 assert.equal(first.value.message.deliveryCode, 'kept-not-delivered');
 const reply = ok(post(first.value.thread, { idempotencyKey: 'm-2', actor: theNurse, message: 'Thank you.' }));
 assert.equal(reply.events.length, 0);
 assert.deepEqual(ok(readThread(reply.value.thread, theNurse, now)).value.messages.map(m => m.fromRole), ['patient', 'nurse']);
});

test('somebody who is not on the visit is refused, and a read never says whether the thread exists', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const stranger = post(thread, { idempotencyKey: 'x', actor: { role: 'nurse', ref: 'N-201' }, message: 'Hello' });
 assert.ok(stranger.refused);
 assert.deepEqual([stranger.id, stranger.status, stranger.statement], ['not-on-this-visit', 403, statement(WRITE, 'not-on-this-visit')]);
 const peek = readThread(thread, { role: 'patient', ref: 'subject-somebody-else' }, now);
 assert.ok(peek.refused);
 assert.deepEqual([peek.status, peek.statement], [404, statement(READ, 'not-on-this-visit')]);
 // A nearest-nurse booking names no nurse until Care assigns one, so no nurse is on it yet.
 const nearest = book(`${day}T10:00~nearest`).thread;
 assert.ok(post(nearest, { idempotencyKey: 'n', actor: theNurse, message: 'On my way' }).refused);
});

test('words only, and no longer than the length in force when the message is written', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const photo = post(thread, { idempotencyKey: 'p', actor: patient, message: 'Here is the wound', attachments: 1 });
 assert.ok(photo.refused);
 assert.deepEqual([photo.id, photo.statement], ['no-attachments', statement(WRITE, 'no-attachments')]);
 const long = post(thread, { idempotencyKey: 'l', actor: patient, message: 'a'.repeat(MAX + 1) });
 assert.ok(long.refused);
 assert.equal(long.id, 'message-too-long');
 ok(post(thread, { idempotencyKey: 'e', actor: patient, message: 'é'.repeat(MAX) }));
 const blank = post(thread, { idempotencyKey: 'b', actor: patient, message: '   ' });
 assert.ok(blank.refused);
 assert.equal(blank.id, 'required-field-missing');
 // An admin made it shorter: the next message is measured against the new length, and one already kept stays.
 const kept = ok(post(thread, { idempotencyKey: 'k', actor: patient, message: 'b'.repeat(400) })).value.thread;
 const shorter = 300;
 assert.equal(post(kept, { idempotencyKey: 's', actor: patient, message: 'c'.repeat(shorter + 1), maxCharacters: shorter }).refused, true);
 const fits = ok(post(kept, { idempotencyKey: 't', actor: patient, message: 'c'.repeat(shorter), maxCharacters: shorter })).value.thread;
 assert.deepEqual(fits.messages.map(m => [...m.message].length), [400, shorter]);
});

test('a cancelled thread closes, keeps what was said, and refuses anything more', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const said = ok(post(thread, { idempotencyKey: 'm-1', actor: patient, message: 'See you at nine.' })).value.thread;
 const closed = closeThread(said, 'booking-cancelled');
 const late = post(closed, { idempotencyKey: 'm-2', actor: patient, message: 'One more thing' });
 assert.ok(late.refused);
 assert.deepEqual([late.id, late.status, late.statement], ['thread-closed', 409, statement(WRITE, 'thread-closed')]);
 assert.equal(ok(readThread(closed, patient, now)).value.messages.length, 1);
 assert.equal(closeThread(closed, 'visit-completed').closedBecause, 'booking-cancelled');
 assert.ok(closedSentence('visit-completed') && closedSentence('booking-cancelled'));
});

test('a completed visit keeps its thread open for the hours in force at completion, then closes it for good', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const hours = inForce.threadOpenHoursAfterVisit;
 const completed = completeThread(thread, now, hours);
 assert.equal(completed.state, 'open');
 const justBefore = new Date(now.getTime() + hours * HOUR - 1);
 ok(post(completed, { idempotencyKey: 'follow-up', actor: patient, message: 'The dressing is holding.', now: justBefore }));
 const after = new Date(now.getTime() + hours * HOUR);
 const late = post(completed, { idempotencyKey: 'late', actor: patient, message: 'And another thing', now: after });
 assert.deepEqual(late.refused && [late.id, late.statement], ['thread-closed', statement(WRITE, 'thread-closed')]);
 assert.deepEqual([threadAt(completed, after).state, threadAt(completed, after).closedBecause], ['closed', 'visit-completed']);
 // The closing instant is written once: completing it again under a longer setting does not move it.
 assert.equal(completeThread(completed, now, hours * 3).closesAt, completed.closesAt);
 // A thread already closed never opens again, whatever the hours.
 const cancelled = closeThread(thread, 'booking-cancelled');
 assert.equal(completeThread(cancelled, now, 72).state, 'closed');
 // Nought hours closes it with the visit.
 assert.deepEqual([completeThread(thread, now, 0).state, completeThread(thread, now, 0).closedBecause], ['closed', 'visit-completed']);
});

test('a cancelled booking has a closed thread', () => {
 const { ledger, bookingRef } = book(`${day}T09:00~N-205`);
 const { value } = ok(cancelBooking(ledger, { idempotencyKey: 'c', bookingRef, subjectRef: 'subject-lerato', reasonCode: 'unstated', actorRole: 'patient' }, now));
 const thread = threadFor(value.booking);
 assert.deepEqual([thread.state, thread.closedBecause], ['closed', 'booking-cancelled']);
});

test('the same idempotency key is one message', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const once = ok(post(thread, { idempotencyKey: 'm-1', actor: patient, message: 'Running late' })).value.thread;
 const twice = ok(post(once, { idempotencyKey: 'm-1', actor: patient, message: 'Running late' })).value.thread;
 assert.equal(twice.messages.length, 1);
});
