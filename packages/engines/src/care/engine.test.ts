/* The Care engine on the runtime: a visit offered, passed on, lapsed, started, refused a checklist,
   handed over and completed — through the routes, with the refusals the contract renders and the
   events the bus actually carried. Verify, the record and Access are stood in for by synthetic
   publishers, because Care learns a badge, an encounter and a booking only from their events. Every
   person calling carries a caller reference: the runtime keys a replay to the caller who asked, and
   refuses an idempotent write from somebody it cannot identify.

   And Care's settings, through packages/engines/src/settings: an admin reads the offer expiry in force
   with who decided it and its bounds; a change is refused in the shared sentences of
   packages/catalog/settings.json, is recorded once and replayed under the same key; and an offer made
   before a change lapses when it said it would, while the next offer reads the change. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import care from '../../../catalog/care.json' with { type: 'json' };
import roster from '../../../catalog/roster.json' with { type: 'json' };
import settingsContract from '../../../catalog/settings.json' with { type: 'json' };
import careApi from '../../../catalog/apis/care.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EngineContext, type RouteKey, type Runtime } from '../runtime/index.ts';
import { confirmReview } from '../settings/shape.ts';
import { careBlock, careByDefault } from './domain/settings.ts';
import { engine } from './engine.ts';

const START = '2026-09-14T09:00:00+02:00';
const P = care.preview;
const WOUND = roster.nurses.filter(n => n.scope.includes('Wound care')).map(n => n.id);
const ACCEPT: RouteKey = 'POST /v1/care/offers/{offerRef}/accept@1';
const DECLINE: RouteKey = 'POST /v1/care/offers/{offerRef}/decline@1';
const READ: RouteKey = 'GET /v1/care/settings@1';
const CHANGE: RouteKey = 'POST /v1/care/setting-changes@1';
const DISPATCHER = 'dispatcher-synthetic-1';
const ADMIN = { role: 'admin', ref: 'party-synthetic-901', purpose: 'audit' };
const MINUTE = 60_000;
const expiry = careBlock.items.find(s => s.key === 'offer-expiry')!;
const { lowest, highest } = expiry.bounds!;

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
const change = (runtime: Runtime, fields: Record<string, unknown>) =>
 runtime.call(CHANGE, { ...ADMIN, fields: { idempotencyKey: 'change-1', setting: 'offer-expiry', wholeNumber: careByDefault.offerExpiryMinutes * 2, reason: 'Nurses in the outer suburbs need longer to read an offer.', expectedVersion: 1, ...fields } });
const sentence = (id: string) => settingsContract.refusals.find(r => r.route === 'change' && r.id === id)!.statement;

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

test('an unanswered offer lapses when the setting in force says, passes on, and cannot be accepted after', () => {
 const { runtime } = setup(WOUND);
 const offerRef = String(offer(runtime).body.offerRef);
 runtime.advance(careByDefault.offerExpiryMinutes * MINUTE);
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

/* ---- Settings ---------------------------------------------------------------------------------- */

test('an admin reads the offer expiry in force with who decided it and its bounds, and a nurse or the dispatcher cannot', () => {
 const { runtime } = setup([]);
 const answer = runtime.call(READ, { ...ADMIN, fields: {} });
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 assert.equal(answer.body.settingsVersion, 1);
 assert.deepEqual(answer.body.history, []);
 const [row] = answer.body.settings as { setting: string; inForce: number; default: number; setAtVersion: number; provenance: { decidedBy: string; decidedOn: string }; limits: { bounds: { lowest: { value: number }; highest: { value: number } } }; changedBy: string[]; appliesTo: string; reviewRequired: string | null }[];
 assert.equal(row!.setting, 'offer-expiry');
 assert.deepEqual([row!.inForce, row!.default, row!.setAtVersion], [careByDefault.offerExpiryMinutes, careByDefault.offerExpiryMinutes, 1]);
 assert.deepEqual([row!.provenance.decidedBy, row!.provenance.decidedOn], [expiry.default.decidedBy, expiry.default.decidedOn]);
 assert.deepEqual([row!.limits.bounds.lowest.value, row!.limits.bounds.highest.value], [lowest.value, highest.value]);
 assert.deepEqual(row!.changedBy, ['admin']);
 assert.equal(row!.appliesTo, expiry.appliesTo);
 assert.equal(row!.reviewRequired, null);
 for (const role of ['nurse', 'dispatcher']) assert.equal(runtime.call(READ, { role, ref: 'party-synthetic-1', purpose: 'audit', fields: {} }).body.error, 'caller-not-allowed', role);
 runtime.close();
});

test('a change is refused in the shared sentences, and nothing is recorded or published', () => {
 const { runtime } = setup([]);
 const refused = (answer: { body: Record<string, unknown> }, id: string) => assert.deepEqual([answer.body.error, answer.body.message], [id, sentence(id)], JSON.stringify(answer.body));
 refused(change(runtime, { idempotencyKey: 'grace', setting: 'grace' }), 'setting-not-known');
 refused(change(runtime, { idempotencyKey: 'no-reason', reason: undefined }), 'setting-change-without-reason');
 refused(change(runtime, { idempotencyKey: 'blank', reason: '  ' }), 'setting-change-without-reason');
 refused(change(runtime, { idempotencyKey: 'stale', expectedVersion: 2 }), 'settings-version-stale');
 refused(change(runtime, { idempotencyKey: 'as-words', wholeNumber: undefined, wording: 'twenty' }), 'setting-value-wrong-type');
 refused(change(runtime, { idempotencyKey: 'zero', wholeNumber: 0 }), 'setting-not-above-zero');
 refused(change(runtime, { idempotencyKey: 'below', wholeNumber: lowest.value - 1 }), 'setting-out-of-range');
 refused(change(runtime, { idempotencyKey: 'above', wholeNumber: highest.value + 1 }), 'setting-out-of-range');
 refused(change(runtime, { idempotencyKey: 'same', wholeNumber: careByDefault.offerExpiryMinutes }), 'setting-unchanged');
 assert.equal(change(runtime, { idempotencyKey: 'a-word', wholeNumber: 'twenty' }).body.error, 'field-of-the-wrong-type', 'the binder refuses a word where the route declares a number');
 assert.equal(runtime.call(CHANGE, { role: 'nurse', ref: 'N-205', purpose: 'audit', fields: { idempotencyKey: 'n', setting: 'offer-expiry', wholeNumber: 20, reason: 'x', expectedVersion: 1 } }).body.error, 'caller-not-allowed');
 assert.equal(runtime.call(CHANGE, { ...ADMIN, ref: null, fields: { idempotencyKey: 'nobody', setting: 'offer-expiry', wholeNumber: 20, reason: 'x', expectedVersion: 1 } }).body.error, 'caller-unidentified', 'an admin nobody can name is never recorded as having changed anything');
 assert.deepEqual(runtime.call(READ, { ...ADMIN, fields: {} }).body.history, []);
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published').length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an accepted change is recorded once with who, when, from, to and why, and the same key replays it rather than repeating it', () => {
 const { runtime } = setup([]);
 runtime.advance(5 * MINUTE);
 const at = runtime.clock.iso();
 const to = careByDefault.offerExpiryMinutes * 2;
 const first = change(runtime, {});
 assert.equal(first.status, 200, JSON.stringify(first.body));
 assert.deepEqual(first.body, { settingsVersion: 2, appliesFrom: new Date(Date.parse(at)).toISOString() });
 assert.deepEqual(change(runtime, {}).body, first.body, 'the same key and the same request is answered, not applied again');
 assert.equal(change(runtime, { wholeNumber: to + 1 }).body.error, 'idempotency-key-reused', 'a reused key with a different change is refused rather than replayed');
 const read = runtime.call(READ, { ...ADMIN, fields: {} }).body;
 assert.equal(read.settingsVersion, 2);
 assert.deepEqual(read.history, [{ settingsVersion: 2, setting: 'offer-expiry', from: careByDefault.offerExpiryMinutes, to, reason: 'Nurses in the outer suburbs need longer to read an offer.', byRole: 'admin', byRef: ADMIN.ref, at: new Date(Date.parse(at)).toISOString() }]);
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published').length, 0, 'a change is the row in the history and nothing on the bus');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an offer made before a change lapses when it said it would, and the offer after it reads the change', () => {
 const { runtime } = setup(WOUND);
 const madeAt = runtime.clock.now().getTime();
 const made = offer(runtime);
 assert.equal(made.status, 200, JSON.stringify(made.body));
 assert.equal(Date.parse(String(made.body.offerExpiresAt)), madeAt + careByDefault.offerExpiryMinutes * MINUTE);

 const longer = highest.value;
 assert.equal(change(runtime, { wholeNumber: longer }).status, 200);
 runtime.advance(careByDefault.offerExpiryMinutes * MINUTE - 1);
 assert.equal(published(runtime, 'appointment.offered@1').length, 1, 'a longer expiry does not keep the first offer open past its own');
 runtime.advance(1);
 const offered = published(runtime, 'appointment.offered@1').map(e => (JSON.parse(e.body) as { payload: { offerExpiresAt: string } }).payload.offerExpiresAt);
 assert.equal(offered.length, 2, 'the first offer lapsed at its own expiry and passed on');
 assert.equal(Date.parse(offered[0]!), madeAt + careByDefault.offerExpiryMinutes * MINUTE, 'the first offer kept the expiry it was made with');
 assert.equal(Date.parse(offered[1]!), runtime.clock.now().getTime() + longer * MINUTE, 'the next offer was made with the expiry in force');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

/* ---- Clinical review of the scope settings ------------------------------------------------------ */

const REVIEW: RouteKey = 'POST /v1/care/setting-reviews@1';
const DOCTOR = { role: 'doctor', ref: 'party-synthetic-401', purpose: 'audit' };
const CLINICALLY_SAFE = 'Inside a registered nurse’s general scope, under the injection administration protocol.';
type ReadRow = { setting: string; inForce: unknown; setAtVersion: number; reviewRequired: string | null; reviewed: { byRef: string } | null };
const rowOf = (runtime: Runtime, key: string) => (runtime.call(READ, { ...DOCTOR, fields: {} }).body.settings as ReadRow[]).find(s => s.setting === key)!;
const review = (runtime: Runtime, fields: Record<string, unknown>, caller: { role: string; ref: string | null; purpose: string } = DOCTOR) =>
 runtime.call(REVIEW, { ...caller, fields: { idempotencyKey: 'review-1', setting: 'injection-roles', reason: CLINICALLY_SAFE, ...fields } });
const refusedInReview = (answer: { body: Record<string, unknown> }, id: string) =>
 assert.deepEqual([answer.body.error, answer.body.message], [id, settingsContract.refusals.find(r => r.route === 'review' && r.id === id)!.statement], JSON.stringify(answer.body));
const narrowInjections = (runtime: Runtime, fields: Record<string, unknown> = {}, caller = ADMIN) =>
 runtime.call(CHANGE, { ...caller, fields: { idempotencyKey: 'narrow', setting: 'injection-roles', roles: ['nurse'], reason: 'Locums are not yet covered for injections.', expectedVersion: 1, ...fields } });

test('the scope settings are in force and read as not clinically reviewed, by the admin who changes them and the doctor who reviews them', () => {
 const { runtime } = setup([]);
 for (const key of ['injection-roles', 'family-planning-roles', 'sick-note-roles', 'encounter-entry-counts-as-signed']) {
  const row = rowOf(runtime, key);
  assert.deepEqual([row.inForce, row.reviewRequired, row.reviewed], [careBlock.items.find(s => s.key === key)!.default.value, 'sign-clinical-review', null], key);
 }
 assert.equal(runtime.call(READ, { ...ADMIN, fields: {} }).status, 200);
 runtime.close();
});

test('a doctor confirms the exact version in force, never an older or a later one, and once', () => {
 const { runtime } = setup([]);
 assert.equal(narrowInjections(runtime).status, 200);
 assert.deepEqual([rowOf(runtime, 'injection-roles').inForce, rowOf(runtime, 'injection-roles').reviewed], [['nurse'], null], 'in force at once, and not clinically reviewed');

 refusedInReview(review(runtime, { idempotencyKey: 'old', settingsVersion: 1 }), 'setting-review-not-in-force');
 refusedInReview(review(runtime, { idempotencyKey: 'ahead', settingsVersion: 3 }), 'setting-review-not-in-force');
 refusedInReview(review(runtime, { idempotencyKey: 'no-reason', settingsVersion: 2, reason: '  ' }), 'setting-review-without-reason');
 refusedInReview(review(runtime, { idempotencyKey: 'expiry', setting: 'offer-expiry', settingsVersion: 1 }), 'setting-review-not-needed');

 const confirmed = review(runtime, { settingsVersion: 2 });
 assert.deepEqual([confirmed.status, confirmed.body], [200, { settingsVersion: 2, reviewedAt: new Date(runtime.clock.iso()).toISOString() }], JSON.stringify(confirmed.body));
 assert.equal(rowOf(runtime, 'injection-roles').reviewed?.byRef, DOCTOR.ref);
 assert.equal(rowOf(runtime, 'family-planning-roles').reviewed, null, 'a review confirms one setting and no other');
 refusedInReview(review(runtime, { idempotencyKey: 'twice', settingsVersion: 2 }, { ...DOCTOR, ref: 'party-synthetic-402' }), 'setting-review-already-confirmed');

 /* A change after a confirmation is a value nobody has reviewed, and the old confirmation does not reach it. */
 assert.equal(narrowInjections(runtime, { idempotencyKey: 'widen', roles: ['nurse', 'locum'], expectedVersion: 2, reason: 'Locum cover was confirmed.' }).status, 200);
 assert.equal(rowOf(runtime, 'injection-roles').reviewed, null);
 refusedInReview(review(runtime, { idempotencyKey: 'stale', settingsVersion: 2 }), 'setting-review-not-in-force');
 assert.equal(review(runtime, { idempotencyKey: 'fresh', settingsVersion: 3 }).status, 200);
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published').length, 0, 'a confirmation is a row in the reviews and nothing on the bus');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('nobody confirms the clinical review of a change they made themselves', () => {
 const { runtime } = setup([]);
 const both = 'party-synthetic-777';
 assert.equal(narrowInjections(runtime, {}, { ...ADMIN, ref: both }).status, 200);
 const own = review(runtime, { settingsVersion: 2 }, { ...DOCTOR, ref: both });
 assert.equal(own.status, 403);
 refusedInReview(own, 'setting-review-own-change');
 assert.equal(rowOf(runtime, 'injection-roles').reviewed, null);
 assert.equal(review(runtime, { idempotencyKey: 'another', settingsVersion: 2 }).status, 200, 'another doctor confirms it');
 runtime.close();
});

test('a nurse, an admin, a doctor nobody can name, and a doctor without the capability the setting names are refused a review', () => {
 const { runtime } = setup([]);
 for (const role of ['nurse', 'admin', 'dispatcher']) assert.equal(review(runtime, { idempotencyKey: role, settingsVersion: 1 }, { role, ref: 'party-synthetic-1', purpose: 'audit' }).body.error, 'caller-not-allowed', role);
 assert.equal(review(runtime, { idempotencyKey: 'nobody', settingsVersion: 1 }, { ...DOCTOR, ref: null }).body.error, 'caller-unidentified');
 assert.equal(rowOf(runtime, 'injection-roles').reviewed, null);
 runtime.close();

 /* The route admits the roles that hold sign-clinical-review; the rules ask the setting's own capability.
    A setting that named one doctors do not hold is refused to a doctor in the contract's sentence. */
 const otherCapability = { block: { ...careBlock, items: careBlock.items.map(s => s.key === 'injection-roles' ? { ...s, reviewRequired: 'review-vetting' } : s) } };
 const refused = confirmReview(otherCapability, [], [], { setting: 'injection-roles', settingsVersion: 1, reason: CLINICALLY_SAFE, byRole: 'doctor', byRef: DOCTOR.ref }, Date.parse(START));
 assert.deepEqual(refused.ok ? null : [refused.refusal.id, refused.refusal.statement], ['setting-review-not-permitted', settingsContract.refusals.find(r => r.route === 'review' && r.id === 'setting-review-not-permitted')!.statement]);
});

test('switched off, an Encounter entry does not count as signed: a visit started after the change is refused handover and completion, and one started before it is not', () => {
 const unconfirmed = careApi.refusals.find(r => r.id === 'encounter-signature-unconfirmed')!;
 const walk = (switchOffBeforeStart: boolean) => {
  const { runtime, as } = setup(WOUND);
  const offerRef = String(offer(runtime).body.offerRef);
  asNurse(runtime, P.clinicianRef, ACCEPT, 'dispatch', { idempotencyKey: 'a-1', offerRef });
  const visit = (route: RouteKey, fields: Record<string, unknown>) => asNurse(runtime, P.clinicianRef, route, 'treatment', { appointmentRef: P.appointmentRef, ...fields });
  const switchOff = () => assert.equal(runtime.call(CHANGE, { ...ADMIN, fields: { idempotencyKey: 'off', setting: 'encounter-entry-counts-as-signed', switchedOn: false, reason: 'An entry written is not proof the nurse signed it.', expectedVersion: 1 } }).status, 200);
  if (switchOffBeforeStart) switchOff();
  assert.equal(visit('POST /v1/care/visits/{appointmentRef}/start@1', { visitCode: P.visitCode }).status, 200);
  if (!switchOffBeforeStart) switchOff();
  as('record', ctx => ctx.publish('passport.entry.written@1', { entryRef: P.encounterRef, resourceType: 'Encounter', authorRole: 'nurse', authorRef: P.clinicianRef, provenance: 'nurse-visit' }, { subjectRef: P.subjectRef, purposeOfUse: 'treatment' }));
  return { runtime, visit };
 };

 const after = walk(true);
 const handover = after.visit('POST /v1/care/visits/{appointmentRef}/handover@1', { encounterRef: P.encounterRef });
 assert.deepEqual([handover.status, handover.body.error, handover.body.message], [unconfirmed.status, unconfirmed.id, unconfirmed.statement]);
 const complete = after.visit('POST /v1/care/visits/{appointmentRef}/complete@1', { visitCode: P.visitCode, encounterRef: P.encounterRef });
 assert.deepEqual([complete.status, complete.body.error], [unconfirmed.status, unconfirmed.id]);
 assert.ok(unconfirmed.statement.includes('GET /fhir/{resourceType}/{id}'), 'the sentence names the record route that is missing');
 assert.equal(published(after.runtime, 'visit.billable@1').length, 0);
 assert.deepEqual(after.runtime.faults(), []);
 after.runtime.close();

 const before = walk(false);
 assert.equal(before.visit('POST /v1/care/visits/{appointmentRef}/handover@1', { encounterRef: P.encounterRef }).body.reviewQueued, true, 'a visit keeps the rule it started under');
 assert.equal(before.visit('POST /v1/care/visits/{appointmentRef}/complete@1', { visitCode: P.visitCode, encounterRef: P.encounterRef }).status, 200);
 assert.deepEqual(before.runtime.faults(), []);
 before.runtime.close();
});
