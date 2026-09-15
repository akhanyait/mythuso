/* Movement bound to the runtime, journey by journey: a P3 trip requested, offered, accepted, tracked inside its
   window and handed over; a P1 refused and sent nowhere; a P2 refused unless a vetted clinician set it in their own
   name with a reason, and never taken by a responder it was not offered to; a position dropped after the window
   and refused when read; an admission pending until a simulated answer decides it; a packet that ends at the
   hand-over; and a settings change that never moves a trip already requested. Verify and the Health Passport are
   stood in for by synthetic publishers, because Movement learns a standing and a link only from their events.
   Every sentence is the contract's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime, defineEngine, type EngineContext, type RouteKey, type Runtime } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { DAY, MINUTE, refusal } from './domain/contract.ts';
import { movementByDefault } from './domain/settings.ts';

const START = '2026-09-15T09:00:00+02:00';
const TRIPS: RouteKey = 'POST /v1/movement/trips@2';
const BEAT: RouteKey = 'POST /v1/movement/responder-heartbeats@2';
const ACCEPT: RouteKey = 'POST /v1/movement/trips/{tripRef}/accept@2';
const DECLINE: RouteKey = 'POST /v1/movement/trips/{tripRef}/decline@1';
const HANDOVER: RouteKey = 'POST /v1/movement/trips/{tripRef}/handover@2';
const POSITION: RouteKey = 'GET /v1/movement/trips/{tripRef}/position@1';
const EMS: RouteKey = 'POST /v1/movement/ems-requests@1';
const FACILITIES: RouteKey = 'GET /v1/movement/facilities@2';
const ADMISSIONS: RouteKey = 'POST /v1/movement/admissions@2';
const ADMISSION: RouteKey = 'GET /v1/movement/admissions/{admissionRef}@2';
const PACKET: RouteKey = 'POST /v1/movement/admissions/{admissionRef}/packet@2';
const DECISION: RouteKey = 'POST /v1/movement/admissions/{admissionRef}/decision@2';
const MORE: RouteKey = 'POST /v1/movement/admissions/{admissionRef}/more-information@1';
const ARRIVAL: RouteKey = 'POST /v1/movement/admissions/{admissionRef}/arrival@2';
const ADMISSION_HANDOVER: RouteKey = 'POST /v1/movement/admissions/{admissionRef}/handover@2';
const CHANGE: RouteKey = 'POST /v1/movement/setting-changes@1';
const READ_SETTINGS: RouteKey = 'GET /v1/movement/settings@1';

const NURSE = { role: 'nurse', ref: 'party-synthetic-205' };
const DOCTOR = { role: 'doctor', ref: 'party-synthetic-401' };
const DISPATCHER = { role: 'dispatcher', ref: 'party-synthetic-701' };
const OPS = { role: 'ops-desk', ref: 'party-synthetic-801' };
const ADMIN = { role: 'admin', ref: 'party-synthetic-901' };
const RESPONDER = { role: 'responder', ref: 'responder-synthetic-311' };
const OTHER_RESPONDER = { role: 'responder', ref: 'responder-synthetic-312' };
const PATIENT = { role: 'patient', ref: 'subject-synthetic-7' };
const VERIFIED_UNTIL = '2027-09-15';

type Who = { role: string; ref: string };

function setup() {
 const queues: Record<string, ((ctx: EngineContext) => void)[]> = { trust: [], record: [] };
 const publisher = (id: string) => defineEngine({ id, routes: {}, subscriptions: {}, store: { schema: '' }, tick: (ctx: EngineContext) => {
  const due = queues[id]!;
  queues[id] = [];
  for (const act of due) act(ctx);
 } });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, publisher('trust'), publisher('record')], dataDirectory: MEMORY, clock: createClock(START) });
 const as = (id: 'trust' | 'record', act: (ctx: EngineContext) => void) => { queues[id]!.push(act); runtime.advance(1); };
 const verify = (who: Who) => as('trust', ctx => ctx.publish('person.verified@1', { role: who.role, badgeTier: 'verified', verifiedUntil: VERIFIED_UNTIL }, { subjectRef: who.ref, purposeOfUse: 'dispatch' }));
 const suspend = (who: Who) => as('trust', ctx => ctx.publish('person.suspended@1', { role: who.role, reasonCode: 'credential-lapsed' }, { subjectRef: who.ref, purposeOfUse: 'dispatch' }));
 const linkMade = (linkRef: string, purpose: string, expiresInMs: number) => {
  const now = runtime.clock.now().getTime();
  as('record', ctx => ctx.publish('passport.share.link_created@1', { linkRef, purpose, expiresAt: new Date(now + expiresInMs).toISOString().replace('Z', '+00:00') }, { subjectRef: PATIENT.ref, purposeOfUse: purpose }));
 };
 const linkUsed = (linkRef: string) => as('record', ctx => ctx.publish('passport.share.link_used@1', { linkRef, openedByRole: 'responder-on-trip' }, { subjectRef: PATIENT.ref, purposeOfUse: 'dispatch' }));
 return { runtime, verify, suspend, linkMade, linkUsed };
}

const call = (runtime: Runtime, route: RouteKey, who: Who, purpose: string, fields: Record<string, unknown>) => runtime.call(route, { role: who.role, ref: who.ref, purpose, fields });
const refused = (answer: { status: number; body: Record<string, unknown> }, id: string) => {
 assert.equal(answer.body.error, id, JSON.stringify(answer.body));
 assert.equal(answer.body.message, refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const answered = (answer: { status: number; body: Record<string, unknown> }) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };
const published = (runtime: Runtime, key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key);
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
const nowMs = (runtime: Runtime) => runtime.clock.now().getTime();

let keys = 0;
const key = () => `key-${++keys}`;
const tripFields = (runtime: Runtime, fields: Record<string, unknown> = {}) => ({
 idempotencyKey: key(), subjectRef: PATIENT.ref, priorityClass: 'P3', pickupWindowStart: iso(nowMs(runtime) + 60 * MINUTE), zoneId: 'randburg', facilityRef: 'facility-synthetic-1', ...fields
});
const beat = (runtime: Runtime, who: Who, fields: Record<string, unknown> = {}) => call(runtime, BEAT, who, 'dispatch', { idempotencyKey: key(), online: true, ...fields });

test('a P3 trip is offered to a verified online responder, accepted, tracked inside its window and handed over', () => {
 const { runtime, verify } = setup();
 refused(beat(runtime, RESPONDER), 'not-verified');
 verify(RESPONDER);
 const first = answered(beat(runtime, RESPONDER));
 assert.equal(first.nextBeatSeconds, movementByDefault.heartbeatIntervalSeconds);
 assert.equal(first.positionKept, false);
 refused(beat(runtime, RESPONDER, { lat: -26.0941, lng: 27.9993 }), 'position-without-a-trip');
 refused(beat(runtime, RESPONDER, { lat: -26.0941 }), 'half-a-position');

 const requested = answered(call(runtime, TRIPS, NURSE, 'dispatch', tripFields(runtime)));
 assert.equal(requested.stateCode, 'requested');
 const tripRef = requested.tripRef as string;
 assert.equal(published(runtime, 'trip.requested@1').length, 1);
 refused(call(runtime, ACCEPT, OTHER_RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef }), 'not-verified');
 refused(beat(runtime, RESPONDER, { tripRef, lat: -26.0941, lng: 27.9993 }), 'trip-not-yours');

 const accepted = answered(call(runtime, ACCEPT, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef }));
 assert.equal(accepted.zoneId, 'randburg');
 assert.equal(published(runtime, 'trip.accepted@1').length, 1);
 assert.equal(published(runtime, 'transport.enroute@1').length, 0, 'a trip that serves no admission announces nothing as on its way');

 refused(call(runtime, POSITION, PATIENT, 'dispatch', { tripRef }), 'no-position-yet');
 const kept = answered(beat(runtime, RESPONDER, { tripRef, lat: -26.09412, lng: 27.99934 }));
 assert.equal(kept.positionKept, true);
 const read = answered(call(runtime, POSITION, PATIENT, 'dispatch', { tripRef }));
 assert.deepEqual([read.lat, read.lng], [-26.094, 27.999], 'a position is kept at geography.json\'s precision and no finer');
 refused(call(runtime, POSITION, { role: 'patient', ref: 'subject-synthetic-somebody-else' }, 'dispatch', { tripRef }), 'trip-not-found');

 refused(call(runtime, HANDOVER, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef, receivingRole: 'the-cleaner', checklistComplete: true }), 'unnamed-receiver');
 refused(call(runtime, HANDOVER, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef, receivingRole: 'admissions-desk', checklistComplete: false }), 'checklist-not-followed');
 refused(call(runtime, HANDOVER, OTHER_RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef, receivingRole: 'admissions-desk', checklistComplete: true }), 'trip-not-yours');
 const handed = answered(call(runtime, HANDOVER, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef, receivingRole: 'admissions-desk', checklistComplete: true }));
 assert.equal(handed.windowClosedAt, handed.handedOverAt);

 refused(beat(runtime, RESPONDER, { tripRef, lat: -26.1, lng: 28 }), 'position-after-the-window');
 refused(call(runtime, POSITION, OPS, 'dispatch', { tripRef }), 'position-after-the-window');
 refused(call(runtime, HANDOVER, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef, receivingRole: 'admissions-desk', checklistComplete: true }), 'trip-closed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a P1 is refused before anything else is read, sent nowhere, and the P1 route refuses every request', () => {
 const { runtime, verify } = setup();
 verify(DOCTOR);
 for (const who of [NURSE, DOCTOR, DISPATCHER]) {
  refused(call(runtime, TRIPS, who, 'dispatch', tripFields(runtime, { priorityClass: 'P1', zoneId: 'nowhere', facilityRef: 'no-such-facility' })), 'p1-refused-no-ambulance-partner');
 }
 refused(call(runtime, TRIPS, NURSE, 'dispatch', tripFields(runtime, { priorityClass: 'P4' })), 'priority-not-offered');
 refused(call(runtime, ADMISSIONS, NURSE, 'dispatch', { idempotencyKey: key(), subjectRef: PATIENT.ref, facilityRef: 'facility-synthetic-1', bedCategory: 'general-ward', priorityCode: 'P1', arrivalWindowStart: iso(nowMs(runtime) + DAY) }), 'p1-refused-no-ambulance-partner');
 for (const who of [NURSE, OPS]) refused(call(runtime, EMS, who, 'emergency', { subjectRef: PATIENT.ref, zoneId: 'soweto' }), 'no-ambulance-partner-connected');
 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published' && /^(trip|transport|admission)\./.test(entry.eventKey ?? '')).length, 0, 'nothing about a P1 reaches the bus');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a P2 is refused unless a vetted nurse or doctor set it in their own name with a reason, and a responder never takes one not offered', () => {
 const { runtime, verify, suspend } = setup();
 const p2 = (fields: Record<string, unknown>) => tripFields(runtime, { priorityClass: 'P2', priorityReasonCode: 'admission-accepted-for-today', ...fields });
 refused(call(runtime, TRIPS, DISPATCHER, 'dispatch', p2({ prioritySetByRef: DOCTOR.ref })), 'p2-not-set-by-a-vetted-clinician');
 refused(call(runtime, TRIPS, NURSE, 'dispatch', p2({ prioritySetByRef: NURSE.ref })), 'p2-not-set-by-a-vetted-clinician');
 verify(NURSE);
 refused(call(runtime, TRIPS, NURSE, 'dispatch', p2({ prioritySetByRef: DOCTOR.ref })), 'p2-not-set-by-a-vetted-clinician');
 refused(call(runtime, TRIPS, NURSE, 'dispatch', p2({})), 'p2-not-set-by-a-vetted-clinician');
 refused(call(runtime, TRIPS, NURSE, 'dispatch', p2({ prioritySetByRef: NURSE.ref, priorityReasonCode: 'feels-urgent' })), 'p2-without-reason');
 const tripRef = answered(call(runtime, TRIPS, NURSE, 'dispatch', p2({ prioritySetByRef: NURSE.ref }))).tripRef as string;

 suspend(NURSE);
 refused(call(runtime, TRIPS, NURSE, 'dispatch', p2({ prioritySetByRef: NURSE.ref })), 'p2-not-set-by-a-vetted-clinician');

 /* Three responders are offered it at once; a fourth, verified and online after the offers were made, is not. */
 const fleet = ['a', 'b', 'c', 'd'].map(s => ({ role: 'responder', ref: `responder-synthetic-4${s}` }));
 for (const who of fleet.slice(0, movementByDefault.offersAtOnce)) { verify(who); answered(beat(runtime, who)); }
 const late = fleet[movementByDefault.offersAtOnce]!;
 verify(late);
 answered(beat(runtime, late));
 refused(call(runtime, ACCEPT, late, 'dispatch', { idempotencyKey: key(), tripRef }), 'self-assigned-p2');
 answered(call(runtime, DECLINE, fleet[0]!, 'dispatch', { idempotencyKey: key(), tripRef }));
 refused(call(runtime, DECLINE, fleet[0]!, 'dispatch', { idempotencyKey: key(), tripRef }), 'trip-not-offered');
 answered(call(runtime, ACCEPT, late, 'dispatch', { idempotencyKey: key(), tripRef }));
 refused(call(runtime, ACCEPT, fleet[1]!, 'dispatch', { idempotencyKey: key(), tripRef }), 'trip-taken');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a position is dropped when the window the trip was requested with runs out, and a read after it is refused', () => {
 const { runtime, verify } = setup();
 verify(RESPONDER);
 answered(beat(runtime, RESPONDER));
 const tripRef = answered(call(runtime, TRIPS, NURSE, 'dispatch', tripFields(runtime))).tripRef as string;
 answered(call(runtime, ACCEPT, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef }));
 answered(beat(runtime, RESPONDER, { tripRef, lat: -26.2, lng: 27.9 }));
 answered(call(runtime, POSITION, DISPATCHER, 'dispatch', { tripRef }));

 /* Nobody hands the patient over. The window runs out an hour after the tick that took the request, plus the
    trip window in force when it was requested. */
 runtime.advance((60 + movementByDefault.tripWindowMinutes) * MINUTE);
 refused(call(runtime, POSITION, DISPATCHER, 'dispatch', { tripRef }), 'position-after-the-window');
 refused(beat(runtime, RESPONDER, { tripRef, lat: -26.2, lng: 27.9 }), 'position-after-the-window');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an admission is pending, never shown as booked, until a simulated answer decides it; then it arrives and is handed over', () => {
 const { runtime } = setup();
 const request = (fields: Record<string, unknown> = {}) => call(runtime, ADMISSIONS, DOCTOR, 'dispatch', {
  idempotencyKey: key(), subjectRef: PATIENT.ref, facilityRef: 'facility-synthetic-2', bedCategory: 'high-care', priorityCode: 'P3', arrivalWindowStart: iso(nowMs(runtime) + 3 * 60 * MINUTE), ...fields
 });
 refused(request({ facilityRef: 'facility-synthetic-3' }), 'bed-category-not-offered');
 refused(request({ bedCategory: 'penthouse' }), 'bed-category-not-declared');
 refused(request({ arrivalWindowStart: iso(nowMs(runtime) - MINUTE) }), 'arrival-window-passed');
 refused(request({ bedStatus: 'booked' }), 'pending-bed-shown-as-booked');
 const made = answered(request());
 assert.equal(made.pending, true);
 const admissionRef = made.admissionRef as string;
 assert.equal(published(runtime, 'admission.requested@1').length, 1);

 const read = (who: Who = OPS) => call(runtime, ADMISSION, who, 'dispatch', { admissionRef });
 assert.deepEqual(answered(read()), { stateCode: 'requesting', pending: true, destinationConfirmed: false, decisionSimulated: false, packetStateCode: 'none' });
 answered(read({ role: 'patient', ref: PATIENT.ref }));
 refused(read({ role: 'patient', ref: 'subject-synthetic-somebody-else' }), 'not-found');

 const decision = (fields: Record<string, unknown>) => call(runtime, DECISION, OPS, 'dispatch', { idempotencyKey: key(), admissionRef, alternativeOffered: false, simulated: true, ...fields });
 refused(decision({ decisionCode: 'accepted', receivingPoint: 'admissions-desk', simulated: false }), 'facility-not-connected');
 refused(decision({ decisionCode: 'maybe' }), 'decision-not-declared');
 refused(decision({ decisionCode: 'accepted' }), 'acceptance-without-receiving-point');
 refused(decision({ decisionCode: 'declined' }), 'decline-without-reason');
 refused(call(runtime, ARRIVAL, OPS, 'treatment', { admissionRef, receivingPoint: 'admissions-desk', agreedWithPretriage: true, simulated: true }), 'arrival-before-acceptance');

 answered(call(runtime, MORE, OPS, 'dispatch', { idempotencyKey: key(), admissionRef, informationCode: 'pre-arrival-packet', simulated: true }));
 assert.equal(answered(read()).pending, true);
 assert.equal(answered(decision({ decisionCode: 'waitlisted' })).pending, true);
 assert.deepEqual(answered(read()), { stateCode: 'waitlisted', pending: true, destinationConfirmed: false, decisionSimulated: true, packetStateCode: 'none' });
 assert.equal(published(runtime, 'admission.waitlisted@1').length, 1);

 answered(decision({ decisionCode: 'accepted', receivingPoint: 'admissions-desk' }));
 assert.deepEqual(answered(read()), { stateCode: 'accepted', pending: false, destinationConfirmed: true, receivingPoint: 'admissions-desk', decisionSimulated: true, packetStateCode: 'none' });
 refused(decision({ decisionCode: 'declined', reasonCode: 'no-bed-in-category' }), 'decision-not-pending');

 refused(call(runtime, ADMISSION_HANDOVER, OPS, 'treatment', { admissionRef, receivingRole: 'receiving-nurse', encounterRef: 'Encounter/synthetic-1', simulated: true }), 'handover-before-arrival');
 answered(call(runtime, ARRIVAL, OPS, 'treatment', { admissionRef, receivingPoint: 'admissions-desk', agreedWithPretriage: false, simulated: true }));
 assert.equal(published(runtime, 'admission.arrived@1').length, 1);
 assert.equal(published(runtime, 'triage.verified@1').length, 1);
 refused(call(runtime, ADMISSION_HANDOVER, OPS, 'treatment', { admissionRef, receivingRole: 'receiving-nurse', encounterRef: ' ', simulated: true }), 'receiver-not-named');
 answered(call(runtime, ADMISSION_HANDOVER, OPS, 'treatment', { admissionRef, receivingRole: 'receiving-nurse', encounterRef: 'Encounter/synthetic-1', simulated: true }));
 assert.equal(published(runtime, 'admission.handover_complete@1').length, 1);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('the packet is only a link the Passport made, bounded by Record\'s ceiling for a trip\'s card, and ends at the hand-over', () => {
 const { runtime, linkMade, linkUsed } = setup();
 const admissionRef = answered(call(runtime, ADMISSIONS, NURSE, 'dispatch', {
  idempotencyKey: key(), subjectRef: PATIENT.ref, facilityRef: 'facility-synthetic-1', bedCategory: 'general-ward', priorityCode: 'P3', arrivalWindowStart: iso(nowMs(runtime) + 2 * 60 * MINUTE)
 })).admissionRef as string;
 const send = (shareLinkRef: string) => call(runtime, PACKET, NURSE, 'treatment', { admissionRef, shareLinkRef });

 refused(send('link-never-made'), 'packet-link-not-heard');
 linkMade('link-treatment', 'treatment', 12 * 60 * MINUTE);
 refused(send('link-treatment'), 'unrestricted-access');
 linkMade('link-too-long', 'dispatch', 2 * DAY);
 refused(send('link-too-long'), 'packet-link-outlives-its-bound');
 linkMade('link-card', 'emergency', 12 * 60 * MINUTE);
 const sent = answered(send('link-card'));
 assert.equal(Date.parse(sent.endsAt as string) > Date.parse(sent.sentAt as string), true);
 const state = () => answered(call(runtime, ADMISSION, OPS, 'dispatch', { admissionRef })).packetStateCode;
 assert.equal(state(), 'sent');
 linkUsed('link-card');
 assert.equal(state(), 'opened');

 answered(call(runtime, DECISION, OPS, 'dispatch', { idempotencyKey: key(), admissionRef, decisionCode: 'accepted', receivingPoint: 'ward-reception', alternativeOffered: false, simulated: true }));
 answered(call(runtime, ARRIVAL, OPS, 'treatment', { admissionRef, receivingPoint: 'ward-reception', agreedWithPretriage: true, simulated: true }));
 answered(call(runtime, ADMISSION_HANDOVER, OPS, 'treatment', { admissionRef, receivingRole: 'admissions-desk', encounterRef: 'Encounter/synthetic-2', simulated: true }));
 assert.equal(state(), 'ended', 'the packet ends at the hand-over, though its link has hours left');
 refused(send('link-card'), 'packet-after-handover');

 /* A link that expires is forgotten by the tick, so an old reference cannot be sent later. */
 linkMade('link-short', 'dispatch', 30 * MINUTE);
 runtime.advance(31 * MINUTE);
 const other = answered(call(runtime, ADMISSIONS, NURSE, 'dispatch', {
  idempotencyKey: key(), subjectRef: PATIENT.ref, facilityRef: 'facility-synthetic-1', bedCategory: 'general-ward', priorityCode: 'P2', arrivalWindowStart: iso(nowMs(runtime) + 2 * 60 * MINUTE)
 })).admissionRef as string;
 refused(call(runtime, PACKET, NURSE, 'treatment', { admissionRef: other, shareLinkRef: 'link-short' }), 'packet-link-not-heard');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a settings change reaches the next trip and heartbeat, and never moves a trip already requested', () => {
 const { runtime, verify } = setup();
 verify(RESPONDER);
 answered(beat(runtime, RESPONDER));
 const before = answered(call(runtime, TRIPS, NURSE, 'dispatch', tripFields(runtime)));
 const tripRef = before.tripRef as string;
 answered(call(runtime, ACCEPT, RESPONDER, 'dispatch', { idempotencyKey: key(), tripRef }));

 const read = answered(call(runtime, READ_SETTINGS, ADMIN, 'audit', {}));
 assert.equal(read.settingsVersion, 1);
 const lowest = (read.settings as { setting: string; limits: { bounds: { lowest: { value: number } } } }[]).find(s => s.setting === 'trip-window-minutes')!.limits.bounds.lowest.value;
 const outOfRange = call(runtime, CHANGE, ADMIN, 'audit', { idempotencyKey: key(), setting: 'trip-window-minutes', wholeNumber: lowest - 1, reason: 'Short trips only.', expectedVersion: 1 });
 assert.equal(outOfRange.status, 422);
 assert.equal(outOfRange.body.error, 'setting-out-of-range');
 const shorter = movementByDefault.tripWindowMinutes / 4;
 answered(call(runtime, CHANGE, ADMIN, 'audit', { idempotencyKey: key(), setting: 'trip-window-minutes', wholeNumber: shorter * 2, reason: 'Trips in this pilot are all inside one suburb.', expectedVersion: 1 }));
 answered(call(runtime, CHANGE, ADMIN, 'audit', { idempotencyKey: key(), setting: 'heartbeat-interval-seconds', wholeNumber: 30, reason: 'Responders asked for longer battery life.', expectedVersion: 2 }));

 /* Past the new, shorter window and inside the one the trip was requested with: the trip still keeps a position. */
 runtime.advance((60 + shorter * 2 + 10) * MINUTE);
 const kept = answered(beat(runtime, RESPONDER, { tripRef, lat: -26.15, lng: 28.02 }));
 assert.equal(kept.positionKept, true);
 assert.equal(kept.nextBeatSeconds, 30, 'the interval is read when the heartbeat arrives');
 answered(call(runtime, POSITION, OPS, 'dispatch', { tripRef }));

 const after = answered(call(runtime, TRIPS, NURSE, 'dispatch', tripFields(runtime)));
 assert.equal(after.settingsVersion, 3);
 assert.equal(before.settingsVersion, 1);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('the directory lists synthetic facilities by zone and category, and refuses a question about free beds', () => {
 const { runtime } = setup();
 const all = answered(call(runtime, FACILITIES, PATIENT, 'dispatch', {})).facilities as { facilityRef: string; synthetic: boolean }[];
 assert.ok(all.length > 0 && all.every(f => f.synthetic === true));
 const maternity = answered(call(runtime, FACILITIES, NURSE, 'dispatch', { bedCategory: 'maternity' })).facilities as { bedCategories: string[] }[];
 assert.ok(maternity.every(f => f.bedCategories.includes('maternity')));
 refused(call(runtime, FACILITIES, NURSE, 'dispatch', { zoneId: 'cape-town' }), 'zone-not-covered');
 refused(call(runtime, FACILITIES, NURSE, 'dispatch', { availableBeds: 'true' }), 'no-availability-claim');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
