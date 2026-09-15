/* The Access engine bound to the runtime: each built route answers as the contract says, refuses in the
   contract's words and publishes only what it declares — the booking at version two with its zone and its
   named-nurse answer in their own fields, the handover at version two evaluated against the desk's hours in
   force, and a visit thread closed by Care's completion after the hours in force when the visit was completed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../catalog/apis/access.json' with { type: 'json' };
import assistant from '../../../catalog/assistant.json' with { type: 'json' };
import geography from '../../../catalog/geography.json' with { type: 'json' };
import sos from '../../../catalog/sos.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EngineContext, type RouteKey } from '../runtime/index.ts';
import settingsContract from '../../../catalog/settings.json' with { type: 'json' };
import booking from '../../../catalog/booking.json' with { type: 'json' };
import { rotaAt } from '../settings/shape.ts';
import { offeredDays } from './domain/booking.ts';
import { instantOf, isoIn } from './domain/contract.ts';
import { accessInForce } from './domain/settings.ts';
import { engine } from './engine.ts';

const START = '2026-09-14T09:00:00+02:00';
/* Care, standing in: a tick that publishes what a test queued, so a completion arrives through the real bus. */
function world(at = START) {
 const queue: ((ctx: EngineContext) => void)[] = [];
 const care = defineEngine({ id: 'care', routes: {}, subscriptions: {}, store: { schema: '' }, tick: (ctx: EngineContext) => { for (const act of queue.splice(0)) act(ctx); } });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, care], dataDirectory: MEMORY, clock: createClock(at) });
 const asCare = (act: (ctx: EngineContext) => void) => { queue.push(act); runtime.advance(1); };
 return { runtime, asCare };
}
const start = (at = START) => world(at).runtime;
const day = offeredDays(new Date(START))[0]!;
const statement = (route: string, id: string) =>
 access.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;
const lerato = { role: 'patient', ref: 'subject-lerato', purpose: 'dispatch' };
const BOOK: RouteKey = 'POST /v1/access/bookings@2';
const READ: RouteKey = 'GET /v1/access/bookings/{bookingRef}@1';
const CANCEL: RouteKey = 'POST /v1/access/bookings/{bookingRef}/cancel@1';
const THREAD: RouteKey = 'GET /v1/access/visit-threads/{bookingRef}@1';
const WRITE: RouteKey = 'POST /v1/access/visit-threads/{bookingRef}/messages@1';
const HANDOVER: RouteKey = 'POST /v1/access/conversations/{conversationRef}/handover@2';
const HOUR = 3_600_000;
/* The demo patient's suburb, by its geography.json id. */
const ZONE = geography.zones.find(z => z.name === booking.fixtures.suburb)!.id;
type Runtime = ReturnType<typeof start>;
const published = (runtime: Runtime) => runtime.trail.all().filter(e => e.kind === 'published').map(e => e.eventKey);
const book = (runtime: Runtime, slotRef: string, idempotencyKey = 'k-1', namedNurseFallback?: string, zoneId = ZONE) =>
 runtime.call(BOOK, { ...lerato, fields: { idempotencyKey, subjectRef: 'subject-lerato', serviceId: 'wound', mode: 'home', slotRef, zoneId, ...(namedNurseFallback ? { namedNurseFallback } : {}) } });

test('a patient books an offered hour with a nurse whose badge is current, and the bus hears booking.requested@2 once, with the zone and never an address', () => {
 const runtime = start();
 const booked = book(runtime, `${day}T09:00~N-205`, 'k-1', 'wait');
 assert.deepEqual([booked.status, booked.answeredBy, booked.body.stateCode, booked.body.namedNurseFallback], [200, 'engine', 'requested', 'wait']);
 assert.match(String(booked.body.bookingRef), /^SIM-BKG-/);
 assert.equal(book(runtime, `${day}T09:00~N-205`, 'k-1', 'wait').body.bookingRef, booked.body.bookingRef);
 assert.deepEqual(published(runtime), ['booking.requested@2']);
 const [entry] = runtime.trail.all().filter(e => e.kind === 'published');
 for (const words of [`"zoneId":"${ZONE}"`, '"namedClinicianRef":"N-205"', '"namedNurseFallback":"wait"']) assert.ok(entry!.body.includes(words), words);
 assert.ok(!/address|street|coordinate|"lat"|"lng"/i.test(entry!.body), entry!.body);
 const read = runtime.call(READ, { ...lerato, purpose: 'subject-access', fields: { bookingRef: booked.body.bookingRef } });
 assert.deepEqual([read.status, read.body.stateCode], [200, 'requested']);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a patient cannot book for somebody else under their own session', () => {
 const runtime = start();
 const other = runtime.call(BOOK, { ...lerato, fields: { idempotencyKey: 'k-x', subjectRef: 'subject-somebody-else', serviceId: 'wound', mode: 'home', slotRef: `${day}T09:00~nearest`, zoneId: ZONE } });
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
 assert.deepEqual(published(runtime), ['booking.requested@2']);
 runtime.close();
});

test('version two refuses a zone geography.json does not hold, an answer folded into the slot reference, and an answer for whoever is nearest — and version one is not bound', () => {
 const runtime = start();
 const nowhere = book(runtime, `${day}T09:00~nearest`, 'z-1', undefined, 'nowhere-synthetic');
 assert.deepEqual([nowhere.status, nowhere.body.error, nowhere.body.message], [422, 'service-not-here', statement(BOOK, 'service-not-here')]);
 for (const id of booking.person.fallback.choices.map(c => c.id)) {
  const folded = book(runtime, `${day}T09:00~N-205~${id}`, `f-${id}`);
  assert.deepEqual([folded.status, folded.body.error], [409, 'slot-not-offered'], id);
 }
 const nearest = book(runtime, `${day}T09:00~nearest`, 'n-1', 'wait');
 assert.deepEqual([nearest.status, nearest.body.error, nearest.body.message], [422, 'fallback-not-offered', statement(BOOK, 'fallback-not-offered')]);
 assert.ok(!Object.keys(engine.routes).includes('POST /v1/access/bookings@1'));
 assert.notEqual(runtime.call('POST /v1/access/bookings@1', { ...lerato, fields: { idempotencyKey: 'old', subjectRef: 'subject-lerato', serviceId: 'wound', mode: 'home', slotRef: `${day}T09:00~N-205~wait` } }).answeredBy, 'engine');
 assert.deepEqual(published(runtime), []);
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
 assert.deepEqual(published(runtime), ['booking.requested@2', 'booking.cancelled@1']);
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
 const long = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'l-1', bookingRef, message: 'a'.repeat(accessInForce([]).threadMaxCharacters + 1) } });
 assert.equal(long.body.error, 'message-too-long');
 assert.deepEqual(published(runtime), ['booking.requested@2']);
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
 const { bookingRef } = book(runtime, `${day}T09:00~N-205`).body;
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

test('the named-nurse fallback in force decides the answers a booking may be given and which slots it may be made against, and a booking keeps its own', () => {
 const runtime = start();
 const soonest = book(runtime, 'asap~N-205', 'f-1', 'soonest');
 assert.deepEqual([soonest.status, soonest.body.namedNurseFallback], [200, 'soonest'], 'with the patient asked, as soon as possible stays beside a named nurse, and either answer may be given');
 assert.equal(changeSetting(runtime, 'wait', { setting: 'named-nurse-fallback', choice: 'wait-for-named' }).status, 200);
 const asapNow = book(runtime, 'asap~N-205', 'f-2', 'wait');
 assert.deepEqual([asapNow.status, asapNow.body.message], [409, statement(BOOK, 'slot-not-offered')]);
 const sendsSomebodyElse = book(runtime, `${day}T10:00~N-205`, 'f-3', 'soonest');
 assert.deepEqual([sendsSomebodyElse.status, sendsSomebodyElse.body.error], [422, 'fallback-not-offered'], 'the fallback that waits takes no answer that sends somebody else');
 assert.deepEqual([book(runtime, `${day}T10:00~N-205`, 'f-4', 'wait').body.namedNurseFallback], ['wait']);
 assert.equal(book(runtime, `${day}T11:00~N-205`, 'f-5').body.namedNurseFallback, 'wait', 'left out, the answer is the one the setting in force resolves to');
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
 const { bookingRef } = book(runtime, `${day}T09:00~N-205`, 'k-photo').body;
 assert.equal(runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'p-1', bookingRef, message: 'See the wound', photo: 'data:image/jpeg;base64,AAAA' } }).body.error, 'no-attachments');
 runtime.close();
});

/* ---- The handover ------------------------------------------------------------------------------ */

const [EMERGENCY, NOT_ASSESSED] = assistant.answers.handover.urgency.map(u => u.id) as [string, string];
const handOver = (runtime: Runtime, urgencyCode: string, conversationRef = 'conv-1', ref = 'subject-lerato', summaryEntryRef = 'entry-synthetic-1') =>
 runtime.call(HANDOVER, { role: 'patient', ref, purpose: 'treatment', fields: { conversationRef, summaryEntryRef, urgencyCode } });
const withNumbers = (text: string) => text.replace(/\{(\w+)\}/g, (token, id: string) => sos.emergency.numbers.find(n => n.id === id)?.number ?? token);
/* A moment the desk's hours in force leave out: the default rota's first window closes at its `to`, so an hour
   past it on the same evening is shut. Worked out from the setting rather than typed. */
const defaultHours = accessInForce([]).handoverHours;
const NIGHT = instantOf(day, defaultHours[0]!.to, new Date(START)).replace(/T\d{2}:\d{2}/, m => `T${String((Number(m.slice(1, 3)) + 1) % 24).padStart(2, '0')}${m.slice(3)}`);

test('in hours the handover goes to the queue with the urgency sent, and says who answers from the setting in force', () => {
 const runtime = start();
 const sent = handOver(runtime, NOT_ASSESSED);
 assert.equal(sent.status, 200, JSON.stringify(sent.body));
 assert.equal(sent.answeredBy, 'engine');
 assert.match(String(sent.body.handoverRef), /^SIM-HO-/);
 assert.deepEqual([sent.body.urgencyCode, sent.body.sentNow, sent.body.deskStateCode, sent.body.answeredByRoles], [NOT_ASSESSED, true, 'open', [...accessInForce([]).handoverAnsweredBy]]);
 for (const field of ['outOfHours', 'outOfHoursNumbers', 'callbackFrom']) assert.ok(!(field in sent.body), field);
 assert.deepEqual(published(runtime), ['conversation.handover@1']);
 const [entry] = runtime.trail.all().filter(e => e.kind === 'published');
 assert.ok(entry!.body.includes(`"urgencyCode":"${NOT_ASSESSED}"`) && entry!.body.includes('"summaryEntryRef":"entry-synthetic-1"'));
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('out of hours the engine says nobody is on the desk, then the emergency numbers, then when a nurse would call back — and the handover still goes', () => {
 assert.equal(rotaAt(defaultHours, Date.parse(NIGHT)).open, false, NIGHT);
 const runtime = start(NIGHT);
 const shut = handOver(runtime, NOT_ASSESSED);
 assert.equal(shut.status, 200, JSON.stringify(shut.body));
 assert.equal(shut.body.deskStateCode, 'out-of-hours');
 assert.equal(shut.body.outOfHours, booking.handover.outOfHours);
 assert.equal(shut.body.outOfHoursNumbers, withNumbers(booking.handover.outOfHoursNumbers));
 for (const n of sos.emergency.numbers.filter(n => booking.handover.outOfHoursNumbers.includes(`{${n.id}}`))) assert.ok(String(shut.body.outOfHoursNumbers).includes(n.number), n.id);
 const opens = rotaAt(defaultHours, Date.parse(NIGHT)).opens!;
 assert.equal(shut.body.callbackFrom, instantOf(isoIn(new Date(opens.at)), opens.from, new Date(opens.at)));
 assert.ok(Date.parse(String(shut.body.callbackFrom)) > Date.parse(NIGHT), 'the call back is offered for when the desk next opens, not before');
 const order = Object.keys(shut.body);
 assert.ok(order.indexOf('outOfHours') < order.indexOf('outOfHoursNumbers') && order.indexOf('outOfHoursNumbers') < order.indexOf('callbackFrom'), order.join(', '));
 assert.deepEqual(published(runtime), ['conversation.handover@1']);
 runtime.close();
});

test('the desk’s hours are the setting in force when the handover is asked for: an admin moves them, and the next handover is out of hours', () => {
 const runtime = start();
 assert.equal(handOver(runtime, NOT_ASSESSED, 'conv-before').body.deskStateCode, 'open');
 const later = defaultHours.map(w => ({ ...w, from: defaultHours[0]!.to === w.to ? instantOf(day, w.to, new Date(START)).slice(11, 16).replace(/^(\d{2})/, h => String(Number(h) - 1).padStart(2, '0')) : w.from }));
 assert.equal(changeSetting(runtime, 'desk-later', { setting: 'handover-hours', windows: later }).status, 200);
 const after = handOver(runtime, NOT_ASSESSED, 'conv-after');
 assert.deepEqual([after.status, after.body.deskStateCode, after.body.outOfHours], [200, 'out-of-hours', booking.handover.outOfHours]);
 assert.equal(String(after.body.callbackFrom).slice(0, 16), instantOf(isoIn(new Date(START)), later[0]!.from, new Date(START)).slice(0, 16), 'the call back is when the moved rota opens, later today');
 runtime.close();
});

test('an urgency is never lowered: a calmer code after an emergency sends nothing and answers the emergency, an unlisted one is refused, and a stranger’s conversation is their own', () => {
 const runtime = start();
 const route = access.routes.find(r => `${r.method} ${r.path}@${r.version}` === HANDOVER)!;
 const first = handOver(runtime, EMERGENCY);
 assert.deepEqual([first.body.urgencyCode, first.body.sentNow], [EMERGENCY, true]);
 const calmer = handOver(runtime, NOT_ASSESSED);
 assert.deepEqual([calmer.status, calmer.body.urgencyCode, calmer.body.sentNow, calmer.body.handoverRef], [200, EMERGENCY, false, first.body.handoverRef]);
 assert.equal(handOver(runtime, EMERGENCY).body.sentNow, false, 'the same urgency again sends nothing new');
 for (const calm of ['routine', 'low', 'EMERGENCY']) {
  const refused = handOver(runtime, calm);
  assert.deepEqual([refused.status, refused.body.error, refused.body.message], [422, 'urgency-not-listed', route.refusals.find(r => r.id === 'urgency-not-listed')!.statement], calm);
 }
 /* A blank summary entry never reaches the handler: the binder refuses a required field sent empty, and the
    domain's own no-summary refusal is proved in domain/handover.test.ts. Either way nothing goes. */
 const blank = handOver(runtime, NOT_ASSESSED, 'conv-2', 'subject-lerato', '');
 assert.deepEqual([blank.status, blank.body.error], [400, 'required-field-missing']);
 const stranger = handOver(runtime, NOT_ASSESSED, 'conv-1', 'subject-somebody-else');
 assert.deepEqual([stranger.body.urgencyCode, stranger.body.sentNow], [NOT_ASSESSED, true]);
 assert.notEqual(stranger.body.handoverRef, first.body.handoverRef);
 assert.deepEqual(published(runtime), ['conversation.handover@1', 'conversation.handover@1']);
 assert.ok(!Object.keys(engine.routes).includes('POST /v1/access/conversations/{conversationRef}/handover@1'));
 runtime.close();
});

/* ---- A thread after its visit ------------------------------------------------------------------ */

test('Care’s completion closes the booking’s thread after the hours in force when it was completed, and a change afterwards moves nothing', () => {
 const { runtime, asCare } = world();
 const { bookingRef } = book(runtime, `${day}T09:00~N-205`, 'k-done', 'wait').body;
 const hours = accessInForce([]).threadOpenHoursAfterVisit;
 const shorter = Math.floor(hours / 2);
 assert.equal(changeSetting(runtime, 'hours-shorter', { setting: 'visit-thread-open-hours-after-visit', wholeNumber: shorter }).status, 200);
 const complete = (appointmentRef: string) => asCare(ctx => ctx.publish('appointment.completed@1', { appointmentRef, encounterRef: 'enc-synthetic-1', serviceId: 'wound' }, { subjectRef: 'subject-lerato', purposeOfUse: 'treatment' }));
 complete(booking.careAppointmentRef.replace('{bookingRef}', String(bookingRef)));
 // An appointment no booking here opened — the preview visit — closes nothing and is no fault.
 complete('TH-3107');
 assert.equal(changeSetting(runtime, 'hours-back', { setting: 'visit-thread-open-hours-after-visit', wholeNumber: hours }, 2).status, 200);

 runtime.advance(shorter * HOUR - 60_000);
 const inTime = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-in-time', bookingRef, message: 'The dressing is holding.' } });
 assert.equal(inTime.status, 200, JSON.stringify(inTime.body));
 runtime.advance(60_000);
 const late = runtime.call(WRITE, { ...lerato, fields: { idempotencyKey: 'm-late', bookingRef, message: 'And one more thing' } });
 assert.deepEqual([late.status, late.body.message], [409, statement(WRITE, 'thread-closed')], 'the hours in force at completion, not the ones restored afterwards');
 const thread = runtime.call(THREAD, { ...lerato, fields: { bookingRef } });
 assert.deepEqual([thread.body.threadStateCode, (thread.body.messages as unknown[]).length], ['closed', 1]);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
