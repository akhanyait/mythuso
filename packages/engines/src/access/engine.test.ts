/* The Access engine bound to the runtime: each built route answers as the contract says, refuses in the
   contract's words, publishes only what it declares, and the handover route is left to the mock. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../catalog/apis/access.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, type RouteKey } from '../runtime/index.ts';
import { offeredDays } from './domain/booking.ts';
import { engine } from './engine.ts';

const START = '2026-09-14T09:00:00+02:00';
const start = () => createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine], dataDirectory: MEMORY, clock: createClock(START) });
const day = offeredDays(new Date(START))[0]!;
const statement = (route: string, id: string) =>
 access.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;
const lerato = { role: 'patient', ref: 'subject-lerato', purpose: 'dispatch' };
const BOOK: RouteKey = 'POST /v1/access/bookings@1';
const READ: RouteKey = 'GET /v1/access/bookings/{bookingRef}@1';
const CANCEL: RouteKey = 'POST /v1/access/bookings/{bookingRef}/cancel@1';
const THREAD: RouteKey = 'GET /v1/access/visit-threads/{bookingRef}@1';
const WRITE: RouteKey = 'POST /v1/access/visit-threads/{bookingRef}/messages@1';
type Runtime = ReturnType<typeof start>;
const published = (runtime: Runtime) => runtime.trail.all().filter(e => e.kind === 'published').map(e => e.eventKey);
const book = (runtime: Runtime, slotRef: string, idempotencyKey = 'k-1') =>
 runtime.call(BOOK, { ...lerato, fields: { idempotencyKey, subjectRef: 'subject-lerato', serviceId: 'wound', mode: 'home', slotRef } });

test('a patient books an offered hour with a nurse whose badge is current, and the bus hears booking.requested once', () => {
 const runtime = start();
 const booked = book(runtime, `${day}T09:00~N-205`);
 assert.deepEqual([booked.status, booked.answeredBy, booked.body.stateCode], [200, 'engine', 'requested']);
 assert.match(String(booked.body.bookingRef), /^SIM-BKG-/);
 assert.equal(book(runtime, `${day}T09:00~N-205`).body.bookingRef, booked.body.bookingRef);
 assert.deepEqual(published(runtime), ['booking.requested@1']);
 const read = runtime.call(READ, { ...lerato, purpose: 'subject-access', fields: { bookingRef: booked.body.bookingRef } });
 assert.deepEqual([read.status, read.body.stateCode], [200, 'requested']);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a patient cannot book for somebody else under their own session', () => {
 const runtime = start();
 const other = runtime.call(BOOK, { ...lerato, fields: { idempotencyKey: 'k-x', subjectRef: 'subject-somebody-else', serviceId: 'wound', mode: 'home', slotRef: `${day}T09:00~nearest` } });
 assert.deepEqual([other.status, other.body.error], [403, 'caller-not-allowed']);
 assert.deepEqual(published(runtime), []);
 runtime.close();
});

test('an invented slot, a lapsed nurse and somebody else’s booking are refused in the route’s words', () => {
 const runtime = start();
 const invented = book(runtime, `${day}T13:00~nearest`);
 assert.deepEqual([invented.status, invented.body.message], [409, statement(BOOK, 'slot-not-offered')]);
 const lapsed = book(runtime, `${day}T09:00~N-204`, 'k-2');
 assert.deepEqual([lapsed.status, lapsed.body.error], [409, 'slot-not-offered']);
 const outside = book(runtime, `${day}T09:00~N-203`, 'k-3');
 assert.equal(outside.body.error, 'slot-not-offered');
 const booked = book(runtime, `${day}T09:00~N-205`, 'k-4');
 const peek = runtime.call(READ, { role: 'patient', ref: 'subject-somebody-else', purpose: 'subject-access', fields: { bookingRef: booked.body.bookingRef } });
 const none = runtime.call(READ, { role: 'patient', ref: 'subject-somebody-else', purpose: 'subject-access', fields: { bookingRef: 'SIM-BKG-NOTHING0' } });
 assert.deepEqual([peek.status, peek.body], [none.status, none.body]);
 assert.deepEqual(published(runtime), ['booking.requested@1']);
 runtime.close();
});

test('a cancellation takes a listed reason, records the window, closes the thread and publishes booking.cancelled', () => {
 const runtime = start();
 const { bookingRef } = book(runtime, `${day}T09:00~N-205`).body;
 const freeText = runtime.call(CANCEL, { ...lerato, fields: { idempotencyKey: 'c-1', bookingRef, reasonCode: 'my knee is better' } });
 assert.deepEqual([freeText.status, freeText.body.message], [422, statement(CANCEL, 'reason-not-listed')]);
 const said = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-1', bookingRef, message: 'The gate is on the left.' } });
 assert.deepEqual([said.status, said.body.deliveryCode], [200, 'kept-not-delivered']);
 const cancelled = runtime.call(CANCEL, { ...lerato, fields: { idempotencyKey: 'c-2', bookingRef, reasonCode: 'unstated' } });
 assert.deepEqual([cancelled.status, cancelled.body.stateCode, cancelled.body.windowCode], [200, 'cancelled', 'before-window']);
 const late = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-2', bookingRef, message: 'Sorry' } });
 assert.deepEqual([late.status, late.body.message], [409, statement(WRITE, 'thread-closed')]);
 const thread = runtime.call(THREAD, { ...lerato, fields: { bookingRef } });
 assert.deepEqual([thread.body.threadStateCode, (thread.body.messages as unknown[]).length], ['closed', 1]);
 assert.deepEqual(published(runtime), ['booking.requested@1', 'booking.cancelled@1']);
 runtime.close();
});

test('a visit thread takes words from the two people on the visit and nothing attached, and publishes nothing', () => {
 const runtime = start();
 const { bookingRef } = book(runtime, `${day}T09:00~N-205`).body;
 const nurse = { role: 'nurse', ref: 'N-205', purpose: 'dispatch' };
 assert.equal(runtime.call(WRITE, { ...nurse, fields: { idempotencyKey: 'n-1', bookingRef, message: 'I will call from the gate.' } }).status, 200);
 const stranger = runtime.call(WRITE, { role: 'nurse', ref: 'N-201', purpose: 'dispatch', fields: { idempotencyKey: 'n-2', bookingRef, message: 'Hello' } });
 assert.deepEqual([stranger.status, stranger.body.message], [403, statement(WRITE, 'not-on-this-visit')]);
 const photo = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'p-1', bookingRef, message: 'See the wound', photo: 'data:image/jpeg;base64,AAAA' } });
 assert.deepEqual([photo.status, photo.body.message], [422, statement(WRITE, 'no-attachments')]);
 const long = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'l-1', bookingRef, message: 'a'.repeat(501) } });
 assert.equal(long.body.error, 'message-too-long');
 assert.deepEqual(published(runtime), ['booking.requested@1']);
 runtime.close();
});

test('the handover route is not bound here, so the mock answers it', () => {
 const runtime = start();
 const answer = runtime.call('POST /v1/access/conversations/{conversationRef}/handover@1', { role: 'patient', ref: 'subject-lerato', purpose: 'treatment', fields: { conversationRef: 'conv-1', summaryEntryRef: 'entry-1' } });
 assert.equal(answer.answeredBy, 'mock');
 runtime.close();
});
