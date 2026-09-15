/* The Access engine bound to the runtime: each built route answers as the contract says, refuses in the
   contract's words, publishes only what it declares, and the handover route is left to the mock. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../catalog/apis/access.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, type RouteKey } from '../runtime/index.ts';
import settingsContract from '../../../catalog/settings.json' with { type: 'json' };
import booking from '../../../catalog/booking.json' with { type: 'json' };
import { offeredDays } from './domain/booking.ts';
import { accessInForce } from './domain/settings.ts';
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
 const booked = book(runtime, `${day}T09:00~N-205~wait`);
 assert.deepEqual([booked.status, booked.answeredBy, booked.body.stateCode], [200, 'engine', 'requested']);
 assert.match(String(booked.body.bookingRef), /^SIM-BKG-/);
 assert.equal(book(runtime, `${day}T09:00~N-205~wait`).body.bookingRef, booked.body.bookingRef);
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
 const lapsed = book(runtime, `${day}T09:00~N-204~wait`, 'k-2');
 assert.deepEqual([lapsed.status, lapsed.body.error], [409, 'slot-not-offered']);
 const outside = book(runtime, `${day}T09:00~N-203~wait`, 'k-3');
 assert.equal(outside.body.error, 'slot-not-offered');
 const booked = book(runtime, `${day}T09:00~N-205~wait`, 'k-4');
 const peek = runtime.call(READ, { role: 'patient', ref: 'subject-somebody-else', purpose: 'subject-access', fields: { bookingRef: booked.body.bookingRef } });
 const none = runtime.call(READ, { role: 'patient', ref: 'subject-somebody-else', purpose: 'subject-access', fields: { bookingRef: 'SIM-BKG-NOTHING0' } });
 assert.deepEqual([peek.status, peek.body], [none.status, none.body]);
 assert.deepEqual(published(runtime), ['booking.requested@1']);
 runtime.close();
});

test('a cancellation takes a listed reason, records the window, closes the thread and publishes booking.cancelled', () => {
 const runtime = start();
 const { bookingRef } = book(runtime, `${day}T09:00~N-205~wait`).body;
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
 const { bookingRef } = book(runtime, `${day}T09:00~N-205~wait`).body;
 const nurse = { role: 'nurse', ref: 'N-205', purpose: 'dispatch' };
 assert.equal(runtime.call(WRITE, { ...nurse, fields: { idempotencyKey: 'n-1', bookingRef, message: 'I will call from the gate.' } }).status, 200);
 const stranger = runtime.call(WRITE, { role: 'nurse', ref: 'N-201', purpose: 'dispatch', fields: { idempotencyKey: 'n-2', bookingRef, message: 'Hello' } });
 assert.deepEqual([stranger.status, stranger.body.message], [403, statement(WRITE, 'not-on-this-visit')]);
 const photo = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'p-1', bookingRef, message: 'See the wound', photo: 'data:image/jpeg;base64,AAAA' } });
 assert.deepEqual([photo.status, photo.body.message], [422, statement(WRITE, 'no-attachments')]);
 const long = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'l-1', bookingRef, message: 'a'.repeat(accessInForce([]).threadMaxCharacters + 1) } });
 assert.equal(long.body.error, 'message-too-long');
 assert.deepEqual(published(runtime), ['booking.requested@1']);
 runtime.close();
});

/* ---- Settings ---------------------------------------------------------------------------------- */

const SETTINGS: RouteKey = 'GET /v1/access/settings@1';
const CHANGE_SETTING: RouteKey = 'POST /v1/access/setting-changes@1';
const REVIEW_SETTING: RouteKey = 'POST /v1/access/setting-reviews@1';
const ADMIN = { role: 'admin', ref: 'party-admin-1', purpose: 'audit' };
const DOCTOR = { role: 'doctor', ref: 'party-doctor-1', purpose: 'audit' };
const shared = (id: string) => settingsContract.refusals.find(r => r.route === 'change' && r.id === id)!.statement;
const changeSetting = (runtime: Runtime, idempotencyKey: string, fields: Record<string, unknown>, expectedVersion = 1) =>
 runtime.call(CHANGE_SETTING, { ...ADMIN, fields: { idempotencyKey, reason: 'Synthetic, for the Access engine test.', expectedVersion, ...fields } });

test('an admin and a doctor read Access’s six settings with their proposals, and a patient or a nurse cannot', () => {
 const runtime = start();
 const read = runtime.call(SETTINGS, { ...ADMIN, fields: {} });
 assert.equal(read.status, 200, JSON.stringify(read.body));
 const rows = read.body.settings as { setting: string; provenance: { decidedBy: string | null; proposedBy: string }; reviewRequired: string | null; reviewed: unknown }[];
 assert.deepEqual(rows.map(r => r.setting), booking.settings.items.map(s => s.key));
 assert.ok(rows.every(r => r.provenance.decidedBy === null && r.provenance.proposedBy === 'Integrator (Wave 3)'), 'every Access default is a proposal nobody has decided');
 const photos = rows.find(r => r.setting === 'visit-thread-photos')!;
 assert.deepEqual([photos.reviewRequired, photos.reviewed], ['sign-clinical-review', null]);
 assert.equal(runtime.call(SETTINGS, { ...DOCTOR, fields: {} }).status, 200);
 for (const caller of [lerato, { role: 'nurse', ref: 'N-205', purpose: 'audit' }]) assert.equal(runtime.call(SETTINGS, { ...caller, purpose: 'audit', fields: {} }).body.error, 'caller-not-allowed', caller.role);
 runtime.close();
});

test('a message is measured against the length in force when it is written, and one kept before a change stays', () => {
 const runtime = start();
 const { bookingRef } = book(runtime, `${day}T09:00~N-205~wait`).body;
 const before = accessInForce([]).threadMaxCharacters;
 const shorter = before - 200;
 assert.equal(runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-long', bookingRef, message: 'a'.repeat(before) } }).status, 200);
 assert.equal(changeSetting(runtime, 'shorter', { setting: 'visit-thread-max-characters', wholeNumber: shorter }).status, 200);
 const over = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-over', bookingRef, message: 'b'.repeat(shorter + 1) } });
 assert.deepEqual([over.status, over.body.message], [422, statement(WRITE, 'message-too-long')]);
 assert.equal(runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-fits', bookingRef, message: 'b'.repeat(shorter) } }).status, 200);
 const thread = runtime.call(THREAD, { ...lerato, fields: { bookingRef } });
 assert.deepEqual((thread.body.messages as { message: string }[]).map(m => m.message.length), [before, shorter]);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a rota with no window, a role that is not clinical and a fallback with no sentence are refused, and nothing is recorded', () => {
 const runtime = start();
 const ownRule = access.routes.find(r => `${r.method} ${r.path}@${r.version}` === CHANGE_SETTING)!.refusals.find(r => r.id === 'handover-hours-never-open')!.statement;
 const never = changeSetting(runtime, 'never-open', { setting: 'handover-hours', windows: [] });
 assert.deepEqual([never.status, never.body.error, never.body.message], [422, 'handover-hours-never-open', ownRule]);
 const operator = changeSetting(runtime, 'operator', { setting: 'handover-answered-by', roles: ['operator'] });
 assert.deepEqual([operator.body.error, operator.body.message], ['setting-out-of-range', shared('setting-out-of-range')]);
 const nobody = changeSetting(runtime, 'nobody', { setting: 'handover-answered-by', roles: [] });
 assert.equal(nobody.body.error, 'setting-out-of-range');
 const quietly = changeSetting(runtime, 'quietly', { setting: 'named-nurse-fallback', choice: 'cancel-quietly' });
 assert.equal(quietly.body.error, 'setting-out-of-range');
 const person = changeSetting(runtime, 'person', { setting: 'handover-hours', windows: [{ post: 'handover-desk', days: ['mon'], from: '06:00', to: '22:00', name: 'Sister Dlamini' }] });
 assert.equal(person.body.error, 'setting-value-wrong-type', 'a rota names a post and never a person');
 assert.deepEqual(runtime.call(SETTINGS, { ...ADMIN, fields: {} }).body.history, []);
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published').length, 0);
 runtime.close();
});

test('the named-nurse fallback in force decides which slots a booking may be made against, and a booking keeps its own', () => {
 const runtime = start();
 const soonest = book(runtime, 'asap~N-205~soonest', 'f-1');
 assert.equal(soonest.status, 200, 'with the patient asked, as soon as possible stays beside a named nurse');
 assert.equal(changeSetting(runtime, 'wait', { setting: 'named-nurse-fallback', choice: 'wait-for-named' }).status, 200);
 const asapNow = book(runtime, 'asap~N-205~wait', 'f-2');
 assert.deepEqual([asapNow.status, asapNow.body.message], [409, statement(BOOK, 'slot-not-offered')]);
 assert.equal(book(runtime, `${day}T10:00~N-205~soonest`, 'f-3').body.error, 'slot-not-offered', 'the fallback that waits offers no slot that sends somebody else');
 assert.equal(book(runtime, `${day}T10:00~N-205~wait`, 'f-4').status, 200);
 const kept = runtime.call(READ, { ...lerato, purpose: 'subject-access', fields: { bookingRef: soonest.body.bookingRef } });
 assert.deepEqual([kept.status, kept.body.stateCode], [200, 'requested']);
 runtime.close();
});

test('photos in a thread wait on a doctor’s review: the admin who switches them on cannot confirm it, a doctor can, once', () => {
 const runtime = start();
 const on = changeSetting(runtime, 'photos-on', { setting: 'visit-thread-photos', switchedOn: true });
 assert.deepEqual(on.body, { settingsVersion: 2, appliesFrom: on.body.appliesFrom });
 assert.equal(runtime.call(REVIEW_SETTING, { ...ADMIN, fields: { idempotencyKey: 'r-admin', setting: 'visit-thread-photos', settingsVersion: 2, reason: 'Mine.' } }).body.error, 'caller-not-allowed');
 const noReason = runtime.call(REVIEW_SETTING, { ...DOCTOR, fields: { idempotencyKey: 'r-0', setting: 'visit-thread-photos', settingsVersion: 2 } });
 assert.equal(noReason.body.error, 'setting-review-without-reason');
 const reviewed = runtime.call(REVIEW_SETTING, { ...DOCTOR, fields: { idempotencyKey: 'r-1', setting: 'visit-thread-photos', settingsVersion: 2, reason: 'Synthetic review for the test.' } });
 assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
 assert.equal(runtime.call(REVIEW_SETTING, { ...DOCTOR, fields: { idempotencyKey: 'r-2', setting: 'visit-thread-photos', settingsVersion: 2, reason: 'Again.' } }).body.error, 'setting-review-already-confirmed');
 assert.equal(runtime.call(REVIEW_SETTING, { ...DOCTOR, fields: { idempotencyKey: 'r-3', setting: 'visit-thread-max-characters', settingsVersion: 1, reason: 'Not needed.' } }).body.error, 'setting-review-not-needed');
 const photos = (runtime.call(SETTINGS, { ...DOCTOR, fields: {} }).body.settings as { setting: string; reviewed: { byRef: string } | null }[]).find(r => r.setting === 'visit-thread-photos')!;
 assert.equal(photos.reviewed?.byRef, DOCTOR.ref);
 // Switched on and reviewed, a photo still does not travel: the route declares no field for one.
 const { bookingRef } = book(runtime, `${day}T09:00~N-205~wait`, 'k-photo').body;
 assert.equal(runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'p-1', bookingRef, message: 'See the wound', photo: 'data:image/jpeg;base64,AAAA' } }).body.error, 'no-attachments');
 runtime.close();
});

test('the handover route is not bound here, so the mock answers it', () => {
 const runtime = start();
 const answer = runtime.call('POST /v1/access/conversations/{conversationRef}/handover@1', { role: 'patient', ref: 'subject-lerato', purpose: 'treatment', fields: { conversationRef: 'conv-1', summaryEntryRef: 'entry-1' } });
 assert.equal(answer.answeredBy, 'mock');
 runtime.close();
});
