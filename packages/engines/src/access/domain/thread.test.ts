/* The visit thread's refusals, each in the route's own words, and the one thing it never does: publish. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../../catalog/apis/access.json' with { type: 'json' };
import contract from '../../../../catalog/booking.json' with { type: 'json' };
import { cancelBooking, emptyLedger, offeredDays, requestBooking, type Candidate, type Ledger } from './booking.ts';
import { MAX_CHARACTERS, closeThread, closedSentence, postMessage, readThread, threadFor, type Thread } from './thread.ts';
import type { Outcome } from './contract.ts';

const now = new Date('2026-09-14T10:00:00+02:00');
const WRITE = 'POST /v1/access/visit-threads/{bookingRef}/messages@1';
const READ = 'GET /v1/access/visit-threads/{bookingRef}@1';
const statement = (route: string, id: string) =>
 access.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;
function ok<T>(outcome: Outcome<T>) {
 if (outcome.refused) assert.fail(`refused: ${outcome.id}`);
 return outcome;
}
const naledi: Candidate = { nurseRef: 'N-205', name: 'N-205', zone: 'Rosebank', covered: true, badgeCurrent: true, notOfferedBecause: null, distanceKm: 3 };
const book = (slotRef: string): { ledger: Ledger; thread: Thread; bookingRef: string } => {
 const { value } = ok(requestBooking(emptyLedger, { idempotencyKey: slotRef, subjectRef: 'subject-lerato', serviceId: 'vitals', mode: 'home', slotRef, actorRole: 'patient' }, { now, candidates: [naledi], visitCovered: true }));
 return { ledger: value.ledger, thread: threadFor(value.booking), bookingRef: value.booking.bookingRef };
};
const day = offeredDays(now)[0]!;
const patient = { role: 'patient' as const, ref: 'subject-lerato' };
const theNurse = { role: 'nurse' as const, ref: 'N-205' };

test('the patient and the named nurse write, a message is kept and not delivered, and nothing is published', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const first = ok(postMessage(thread, { idempotencyKey: 'm-1', actor: patient, message: '  The gate code is at the guard hut.  ', now }));
 assert.equal(first.events.length, 0);
 assert.equal(first.value.message.message, 'The gate code is at the guard hut.');
 assert.equal(first.value.message.deliveryCode, 'kept-not-delivered');
 const reply = ok(postMessage(first.value.thread, { idempotencyKey: 'm-2', actor: theNurse, message: 'Thank you.', now }));
 assert.equal(reply.events.length, 0);
 assert.deepEqual(ok(readThread(reply.value.thread, theNurse)).value.messages.map(m => m.fromRole), ['patient', 'nurse']);
});

test('somebody who is not on the visit is refused, and a read never says whether the thread exists', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const stranger = postMessage(thread, { idempotencyKey: 'x', actor: { role: 'nurse', ref: 'N-201' }, message: 'Hello', now });
 assert.ok(stranger.refused);
 assert.deepEqual([stranger.id, stranger.status, stranger.statement], ['not-on-this-visit', 403, statement(WRITE, 'not-on-this-visit')]);
 const peek = readThread(thread, { role: 'patient', ref: 'subject-somebody-else' });
 assert.ok(peek.refused);
 assert.deepEqual([peek.status, peek.statement], [404, statement(READ, 'not-on-this-visit')]);
 // A nearest-nurse booking names no nurse until Care assigns one, so no nurse is on it yet.
 const nearest = book(`${day}T10:00~nearest`).thread;
 assert.ok(postMessage(nearest, { idempotencyKey: 'n', actor: theNurse, message: 'On my way', now }).refused);
});

test('words only, and short', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const photo = postMessage(thread, { idempotencyKey: 'p', actor: patient, message: 'Here is the wound', attachments: 1, now });
 assert.ok(photo.refused);
 assert.deepEqual([photo.id, photo.statement], ['no-attachments', statement(WRITE, 'no-attachments')]);
 const long = postMessage(thread, { idempotencyKey: 'l', actor: patient, message: 'a'.repeat(MAX_CHARACTERS + 1), now });
 assert.ok(long.refused);
 assert.equal(long.id, 'message-too-long');
 assert.equal(MAX_CHARACTERS, contract.thread.maxCharacters);
 ok(postMessage(thread, { idempotencyKey: 'e', actor: patient, message: 'é'.repeat(MAX_CHARACTERS), now }));
 const blank = postMessage(thread, { idempotencyKey: 'b', actor: patient, message: '   ', now });
 assert.ok(blank.refused);
 assert.equal(blank.id, 'required-field-missing');
});

test('a thread closes with the visit, keeps what was said, and refuses anything more', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const said = ok(postMessage(thread, { idempotencyKey: 'm-1', actor: patient, message: 'See you at nine.', now })).value.thread;
 const closed = closeThread(said, 'visit-completed');
 const late = postMessage(closed, { idempotencyKey: 'm-2', actor: patient, message: 'One more thing', now });
 assert.ok(late.refused);
 assert.deepEqual([late.id, late.status, late.statement], ['thread-closed', 409, statement(WRITE, 'thread-closed')]);
 assert.equal(ok(readThread(closed, patient)).value.messages.length, 1);
 assert.equal(closeThread(closed, 'booking-cancelled').closedBecause, 'visit-completed');
 assert.ok(closedSentence('visit-completed') && closedSentence('booking-cancelled'));
});

test('a cancelled booking has a closed thread', () => {
 const { ledger, bookingRef } = book(`${day}T09:00~N-205`);
 const { value } = ok(cancelBooking(ledger, { idempotencyKey: 'c', bookingRef, subjectRef: 'subject-lerato', reasonCode: 'unstated', actorRole: 'patient' }, now));
 const thread = threadFor(value.booking);
 assert.deepEqual([thread.state, thread.closedBecause], ['closed', 'booking-cancelled']);
});

test('the same idempotency key is one message', () => {
 const { thread } = book(`${day}T09:00~N-205`);
 const once = ok(postMessage(thread, { idempotencyKey: 'm-1', actor: patient, message: 'Running late', now })).value.thread;
 const twice = ok(postMessage(once, { idempotencyKey: 'm-1', actor: patient, message: 'Running late', now })).value.thread;
 assert.equal(twice.messages.length, 1);
});
