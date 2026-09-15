/* The Care engine on the runtime: a visit offered, passed on, lapsed, started, refused a checklist,
   handed over and completed — through the routes, with the refusals the contract renders and the
   events the bus actually carried. Verify, the record and Access are stood in for by synthetic
   publishers, because Care learns a badge, an encounter and a booking only from their events. Every
   person calling carries a caller reference: the runtime keys a replay to the caller who asked, and
   refuses an idempotent write from somebody it cannot identify. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import care from '../../../catalog/care.json' with { type: 'json' };
import roster from '../../../catalog/roster.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EngineContext, type RouteKey, type Runtime } from '../runtime/index.ts';
import { engine } from './engine.ts';

const START = '2026-09-14T09:00:00+02:00';
const P = care.preview;
const WOUND = roster.nurses.filter(n => n.scope.includes('Wound care')).map(n => n.id);
const ACCEPT: RouteKey = 'POST /v1/care/offers/{offerRef}/accept@1';
const DECLINE: RouteKey = 'POST /v1/care/offers/{offerRef}/decline@1';
const DISPATCHER = 'dispatcher-synthetic-1';

function setup(cleared: readonly string[]) {
 const queues: Record<string, ((ctx: EngineContext) => void)[]> = { trust: [], record: [], access: [] };
 const publisher = (id: string) => defineEngine({ id, routes: {}, subscriptions: {}, store: { schema: '' }, tick: (ctx: EngineContext) => {
  const due = queues[id]!;
  queues[id] = [];
  for (const act of due) act(ctx);
 } });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, publisher('trust'), publisher('record'), publisher('access')], dataDirectory: MEMORY, clock: createClock(START) });
 const as = (id: 'trust' | 'record' | 'access', act: (ctx: EngineContext) => void) => { queues[id]!.push(act); runtime.advance(1); };
 /* Verify, standing in. Which nurses hold a badge is the test's choice, passed in. */
 if (cleared.length) as('trust', ctx => {
  for (const ref of cleared) ctx.publish('person.trust_updated@2', { badgeTier: 'verified', hardGatesPassed: true }, { subjectRef: ref, purposeOfUse: 'dispatch' });
 });
 return { runtime, as };
}

const offer = (runtime: Runtime, key = 'offer-1', appointmentRef = P.appointmentRef) =>
 runtime.call('POST /v1/care/offers@1', { role: 'dispatcher', ref: DISPATCHER, purpose: 'dispatch', fields: { idempotencyKey: key, appointmentRef, serviceId: P.serviceId } });
const asNurse = (runtime: Runtime, ref: string, route: RouteKey, purpose: string, fields: Record<string, unknown>) =>
 runtime.call(route, { role: 'nurse', ref, purpose, fields });
const published = (runtime: Runtime, key: string) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === key);

test('with no badge heard, nobody is offered the visit, and the refusal is the Trust Score one', () => {
 const { runtime } = setup([]);
 const answer = offer(runtime);
 assert.deepEqual([answer.status, answer.body.error, answer.answeredBy], [409, 'no-current-trust-score', 'engine']);
 assert.equal(published(runtime, 'appointment.offered@1').length, 0);
 runtime.close();
});

test('the visit is offered to the previous nurse first, and is personal to her', () => {
 const { runtime } = setup(WOUND);
 const made = offer(runtime);
 assert.equal(made.status, 200);
 const offerRef = String(made.body.offerRef);
 const stranger = asNurse(runtime, 'N-206', ACCEPT, 'dispatch', { idempotencyKey: 'a-x', offerRef });
 assert.deepEqual([stranger.status, stranger.body.message], [403, 'That offer was made to somebody else.']);
 const mine = asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'a-1', offerRef });
 assert.deepEqual([mine.status, mine.body.appointmentRef], [200, P.appointmentRef]);
 assert.equal(published(runtime, 'appointment.offered@1').length, 1);
 assert.equal(published(runtime, 'appointment.booked@1').length, 1);
 runtime.close();
});

test('two nurses using the same idempotency key get two independent answers, never each other’s', () => {
 const { runtime } = setup(WOUND);
 const offerRef = String(offer(runtime).body.offerRef);
 /* The same key from somebody the offer was not made to is her own act, refused on its own merits,
    and it does not become the answer the offer's nurse is replayed. */
 const stranger = asNurse(runtime, 'N-206', ACCEPT, 'dispatch', { idempotencyKey: 'shared-key', offerRef });
 const mine = asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'shared-key', offerRef });
 assert.deepEqual([stranger.status, mine.status], [403, 200]);
 /* And each one replays as itself. */
 assert.equal(asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'shared-key', offerRef }).status, 200);
 assert.equal(asNurse(runtime, 'N-206', ACCEPT, 'dispatch', { idempotencyKey: 'shared-key', offerRef }).status, 403);
 assert.equal(published(runtime, 'appointment.booked@1').length, 1, 'the replay booked nothing twice');
 const declineStranger = asNurse(runtime, 'N-201', DECLINE, 'dispatch', { idempotencyKey: 'shared-key', offerRef });
 assert.equal(declineStranger.body.error, 'not-your-offer');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a decline passes the visit on at the next tick; the declined offer cannot then be accepted', () => {
 const { runtime } = setup(WOUND);
 const offerRef = String(offer(runtime).body.offerRef);
 const declined = asNurse(runtime, P.clinicianRef, DECLINE, 'dispatch', { idempotencyKey: 'd-1', offerRef });
 assert.deepEqual([declined.status, declined.body], [200, { declined: true }]);
 assert.equal(published(runtime, 'appointment.offered@1').length, 1, 'declining emits nothing of its own');
 runtime.advance(1000);
 assert.equal(published(runtime, 'appointment.offered@1').length, 2, 'the tick offered it to the next nurse');
 const again = asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'a-late', offerRef });
 assert.equal(again.status, 410);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an unanswered offer lapses when the contract says, passes on, and cannot be accepted after', () => {
 const { runtime } = setup(WOUND);
 const offerRef = String(offer(runtime).body.offerRef);
 runtime.advance(care.offers.expiresAfterMinutes * 60_000);
 assert.equal(published(runtime, 'appointment.offered@1').length, 2);
 const late = asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'a-1', offerRef });
 assert.deepEqual([late.status, late.body.message], [410, 'That offer has lapsed.']);
 runtime.close();
});

test('the visit: the code to start, no checklist under a draft, handover and completion only once the record says the encounter exists', () => {
 const { runtime, as } = setup(WOUND);
 const offerRef = String(offer(runtime).body.offerRef);
 asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'a-1', offerRef });
 const visit = (route: RouteKey, fields: Record<string, unknown>) => asNurse(runtime, P.clinicianRef, route, 'treatment', { appointmentRef: P.appointmentRef, ...fields });

 const stranger = asNurse(runtime, 'N-201', 'POST /v1/care/visits/{appointmentRef}/start@1', 'treatment', { appointmentRef: P.appointmentRef, visitCode: P.visitCode });
 assert.equal(stranger.body.error, 'caller-not-allowed');
 const wrong = visit('POST /v1/care/visits/{appointmentRef}/start@1', { visitCode: '000000' });
 assert.deepEqual([wrong.status, wrong.body.message], [403, 'The visit code did not match, so the visit has not started.']);
 assert.equal(visit('POST /v1/care/visits/{appointmentRef}/start@1', { visitCode: P.visitCode }).status, 200);

 const checklist = visit('POST /v1/care/visits/{appointmentRef}/checklist@1', { protocolVersionId: 'wound-care@1', completedItems: [] });
 assert.deepEqual([checklist.status, checklist.body.message], [409, 'A checklist runs only under a ratified protocol.']);
 assert.equal(visit('POST /v1/care/visits/{appointmentRef}/capture@1', { observationRefs: ['obs-1', 'obs-2'] }).body.attachedCount, 2);

 assert.equal(visit('POST /v1/care/visits/{appointmentRef}/handover@1', { encounterRef: P.encounterRef }).status, 422);
 assert.equal(visit('POST /v1/care/visits/{appointmentRef}/complete@1', { visitCode: P.visitCode, encounterRef: P.encounterRef }).body.error, 'encounter-unsigned');

 as('record', ctx => ctx.publish('passport.entry.written@1', { entryRef: P.encounterRef, resourceType: 'Encounter', authorRole: 'nurse', authorRef: P.clinicianRef, provenance: 'nurse-visit' }, { subjectRef: P.subjectRef, purposeOfUse: 'treatment' }));

 assert.equal(visit('POST /v1/care/visits/{appointmentRef}/handover@1', { encounterRef: P.encounterRef }).body.reviewQueued, true);
 const wrongEnd = visit('POST /v1/care/visits/{appointmentRef}/complete@1', { visitCode: '482191', encounterRef: P.encounterRef });
 assert.equal(wrongEnd.body.message, 'The visit code did not match, so the visit is not complete.');
 assert.equal(visit('POST /v1/care/visits/{appointmentRef}/complete@1', { visitCode: P.visitCode, encounterRef: P.encounterRef }).status, 200);

 for (const key of ['appointment.in_progress@1', 'visit.handover.submitted@1', 'appointment.completed@1', 'visit.billable@1']) assert.equal(published(runtime, key).length, 1, key);
 assert.ok(runtime.trail.all().every(e => !e.body.includes(P.visitCode)), 'the visit code is never written to the trail');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a booking heard on the bus becomes an appointment Care owns, and waits for its suburb rather than being offered', () => {
 const { runtime, as } = setup(WOUND);
 as('access', ctx => ctx.publish('booking.requested@1', { bookingRef: 'bk-1', serviceId: 'wound', mode: 'home', requestedFor: '2026-09-15T10:00:00+02:00' }, { subjectRef: 'sub-bk-1', purposeOfUse: 'dispatch' }));
 assert.equal(published(runtime, 'appointment.requested@1').length, 1);
 const answer = offer(runtime, 'o-bk', 'apt-bk-1');
 assert.deepEqual([answer.status, answer.body.error], [409, 'visit-zone-unknown']);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
