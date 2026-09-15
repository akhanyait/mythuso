/**
 * Money on the runtime, end to end: the payable a booking opens, the price visit.billable gives it,
 * a payment through the bound route, a replay, the refusals the binder and the ledger make between
 * them, the weekly payout the tick schedules and pays, and the doctor's payout nobody schedules.
 *
 * Care and Clinical are synthetic publishers written for this test — a tick that publishes what the
 * test queued — so the events Money hears arrive through the real bus, validated against the frozen
 * contract, rather than being handed to the ledger directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey } from '../runtime/index.ts';
import { loadRuntimeContract } from '../runtime/contract.ts';
import { engine, HEARD } from './engine.ts';
import { attempt, reversal } from './domain/provider.ts';
import { hearing, isRefusal, refusal, serviceById } from './domain/contract.ts';
import { createMoney } from './domain/ledger.ts';
import { moneyBlock } from './domain/settings.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-14T09:00:00+02:00'; // a Monday
const DAY = 86_400_000;

type Queued = { key: EventKey; payload: Record<string, unknown>; subjectRef: string };
const publisher = (id: string) => {
 const queue: Queued[] = [];
 return {
  queue,
  module: defineEngine({
   id, routes: {}, subscriptions: {}, store: { schema: '' },
   tick: ctx => { for (const e of queue.splice(0)) ctx.publish(e.key, e.payload, { subjectRef: e.subjectRef, purposeOfUse: 'treatment' }); }
  })
 };
};

function world() {
 const care = publisher('care');
 const clinical = publisher('clinical');
 const runtime = createRuntime({ env: FLAG, engines: [care.module, clinical.module, engine], dataDirectory: MEMORY, clock: createClock(START) });
 const published = (key: string) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === key);
 return { care, clinical, runtime, published };
}

const lerato = { role: 'patient', ref: 'subj-lerato', purpose: 'billing' };
const vitals = serviceById('vitals');
const pay = (fields: Record<string, unknown>) => ({ ...lerato, fields: { payableRef: 'PB-APT-1', method: 'card', amountCents: vitals.price * 100, ...fields } });

test('Money subscribes only to events on its moneyHears list', () => {
 for (const key of HEARD) assert.ok(hearing.events.some(e => e.type === key.split('@')[0]), key);
 assert.deepEqual(Object.keys(engine.subscriptions).sort(), [...HEARD].sort());
});

test('a booked visit is priced from its serviceId as it opens, paid once, and refused in the contract’s words', () => {
 const { care, runtime, published } = world();
 care.queue.push({ key: 'appointment.booked@2', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-1', clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'vitals' } });
 runtime.advance(1000);

 /* No visit.billable has arrived, and the payable already has the catalogue's price: an amount that is not it is refused. */
 const short = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-short', amountCents: vitals.price * 100 - 1 }));
 assert.deepEqual([short.status, short.body], [refusal('amount-mismatch').status, { error: 'amount-mismatch', message: refusal('amount-mismatch').statement }]);

 const expected = attempt('PB-APT-1', 1, 'x', vitals.price * 100, new Date()).outcome === 'authorised' ? 'succeeded' : 'failed';
 const first = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-1' }));
 assert.equal(first.status, 200, JSON.stringify(first.body));
 assert.equal(first.body['stateCode'], expected);
 const charged = published('payment.succeeded@1').length + published('payment.failed@1').length;
 assert.equal(charged, 1);

 /* The same key again is the same act once. */
 const again = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-1' }));
 assert.deepEqual(again.body, first.body);
 assert.equal(published('payment.succeeded@1').length + published('payment.failed@1').length, charged, 'a replay charged again');

 /* A card number by name, as a field the route never declared, and the wrong amount. */
 const card = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-card', cardNumber: 'x' }));
 assert.equal(card.body['error'], 'card-number-sent');
 const wrong = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-wrong', amountCents: 100 }));
 /* The amount is reconciled before anything else about the payable is asked. */
 assert.equal(wrong.body['error'], 'amount-mismatch');
 const other = runtime.call('POST /v1/money/payments@1', { ...pay({ idempotencyKey: 'k-other' }), ref: 'subj-somebody-else' });
 assert.equal(other.body['error'], 'someone-elses-payable');

 /* A scheme is not a caller of either route. */
 assert.equal(runtime.call('GET /v1/money/payouts@1', { role: 'scheme', purpose: 'billing', fields: {} }).body['error'], 'caller-not-allowed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

/* appointment.booked@2 names the service, and Money prices the payable from services.json as it opens it. A service
   the catalogue does not sell is refused loudly: the delivery is rolled back, and nothing is owed at a price nobody set. */
test('appointment.booked@2 opens its payable at the catalogue’s price for each service, and a service nobody sells opens nothing', () => {
 const { care, runtime } = world();
 const sold = ['wound', 'senior'].map((serviceId, i) => ({ serviceId, appointmentRef: `APT-PRICED-${i}` }));
 for (const { serviceId, appointmentRef } of sold) care.queue.push({ key: 'appointment.booked@2', subjectRef: 'subj-lerato', payload: { appointmentRef, clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId } });
 care.queue.push({ key: 'appointment.booked@2', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-UNSOLD', clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'nothing-sold-synthetic' } });
 runtime.advance(1000);
 for (const { serviceId, appointmentRef } of sold) {
  const price = serviceById(serviceId).price * 100;
  const off = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: `off-${serviceId}`, payableRef: `PB-${appointmentRef}`, amountCents: price + 100 }));
  assert.equal(off.body['error'], 'amount-mismatch', serviceId);
  const right = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: `right-${serviceId}`, payableRef: `PB-${appointmentRef}`, amountCents: price }));
  assert.equal(right.status, 200, `${serviceId}: ${JSON.stringify(right.body)}`);
 }
 const unsold = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'unsold', payableRef: 'PB-APT-UNSOLD' }));
 assert.equal(unsold.body['error'], 'payable-not-found');
 const failed = runtime.trail.all().filter(e => e.kind === 'delivery-failed' && e.eventKey === 'appointment.booked@2' && e.engine === 'money');
 assert.equal(failed.length, 1, 'the unsold service was not refused on delivery');
 assert.equal(runtime.faults().length, 1);
 assert.match(String((runtime.faults()[0]!.error as Error).message), /services\.json/);
 runtime.close();
});

/* A cancelled visit's card payment goes back through the payment-result door, and payment.refunded@1 says so once:
   the cancellation delivered again finds the payment refunded and tells nobody a second time. */
test('a cancelled visit’s payment is refunded whole and published once, with references and the amount and nothing else', () => {
 const { care, runtime, published } = world();
 /* The simulated provider declines one attempt in five, seeded on the payable; the visit is one it authorises. */
 const appointmentRef = Array.from({ length: 40 }, (_, i) => `APT-REFUND-${i}`).find(ref => attempt(`PB-${ref}`, 1, 'x', vitals.price * 100, new Date(START)).outcome === 'authorised')!;
 const payableRef = `PB-${appointmentRef}`;
 care.queue.push({ key: 'appointment.booked@2', subjectRef: 'subj-lerato', payload: { appointmentRef, clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'vitals' } });
 runtime.advance(1000);
 const paid = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-refund', payableRef }));
 assert.deepEqual([paid.status, paid.body['stateCode']], [200, 'succeeded'], JSON.stringify(paid.body));

 const cancelled = { appointmentRef, cancelledByRole: 'patient', reasonCode: 'no-longer-needed', scheduledFor: '2026-09-15T09:00:00+02:00' };
 care.queue.push({ key: 'appointment.cancelled@1', subjectRef: 'subj-lerato', payload: cancelled }, { key: 'appointment.cancelled@1', subjectRef: 'subj-lerato', payload: cancelled });
 runtime.advance(1000);
 care.queue.push({ key: 'appointment.cancelled@1', subjectRef: 'subj-lerato', payload: cancelled });
 runtime.advance(1000);

 const refunds = published('payment.refunded@1');
 assert.equal(refunds.length, 1, 'a redelivered cancellation refunded twice');
 const payload = (JSON.parse(refunds[0]!.body) as { payload: Record<string, unknown> }).payload;
 assert.deepEqual(payload, { paymentRef: paid.body['paymentRef'], payableRef, amountCents: vitals.price * 100 });
 assert.ok(!/card|cash|code|finding/i.test(Object.keys(payload).join()), 'the refund carries more than references and the amount');
 /* The payable is closed, so nothing more is taken for a visit that is not happening. */
 assert.equal(runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-after', payableRef })).body['error'], 'payable-not-found');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();

 /* The ledger on its own: the same reversal sent through the door twice publishes once, and a booking's payable says which booking. */
 const ledger = createMoney({ clock: () => new Date(START), simulation: true });
 ledger.openVisitPayable({ payableRef, serviceId: 'vitals', subjectRef: 'subj-lerato', bookingRef: 'BK-SYNTHETIC-1' });
 const receipt = ledger.pay({ role: 'patient', subjectRef: 'subj-lerato' }, { idempotencyKey: 'k', payableRef, method: 'card', amountCents: vitals.price * 100 });
 assert.ok(!isRefusal(receipt) && receipt.stateCode === 'succeeded');
 const reverse = reversal(payableRef, (receipt as { paymentRef: string }).paymentRef, vitals.price * 100, new Date(START));
 ledger.acceptPaymentResult(reverse, 'simulated-provider');
 ledger.acceptPaymentResult(reverse, 'simulated-provider');
 const told = ledger.outbox().filter(e => e.type === 'payment.refunded');
 assert.deepEqual(told.map(e => e.payload), [{ paymentRef: (receipt as { paymentRef: string }).paymentRef, payableRef, amountCents: vitals.price * 100, bookingRef: 'BK-SYNTHETIC-1' }]);
});

/* booking.confirmed@2 names the service that was booked, so Money prices by service from the catalogue rather
   than by asking Access. A confirmation is not a charge, so nothing is owed; what Money does with it is read the
   service, and one packages/catalog/services.json does not sell is refused loudly rather than priced at nothing. */
test('a confirmed booking is heard at version two and its serviceId is read, and a service nobody sells is refused rather than priced', () => {
 const access = publisher('access');
 const runtime = createRuntime({ env: FLAG, engines: [access.module, engine], dataDirectory: MEMORY, clock: createClock(START) });
 assert.ok(HEARD.includes('booking.confirmed@2'));
 access.queue.push({ key: 'booking.confirmed@2', subjectRef: 'subj-lerato', payload: { bookingRef: 'BK-1', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'wound' } });
 runtime.advance(1000);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();

 const money = createMoney({ clock: () => new Date(START), simulation: true });
 assert.ok(!isRefusal(money.hear({ type: 'booking.confirmed', version: 2, payload: { bookingRef: 'BK-2', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'wound' } })));
 assert.throws(() => money.hear({ type: 'booking.confirmed', version: 2, payload: { bookingRef: 'BK-3', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'nothing-sold-synthetic' } }), /services\.json/);
 /* Version one is withdrawn: Money no longer hears it, with or without a service on it. */
 assert.deepEqual(money.hear({ type: 'booking.confirmed', version: 1, payload: { bookingRef: 'BK-4', scheduledFor: '2026-09-15T09:00:00+02:00' } }), refusal('hears-only-its-list'));
});

test('the tick closes a nurse’s week, pays it on the contract’s day, and schedules nothing for an undecided fee', () => {
 const { care, clinical, runtime, published } = world();
 care.queue.push({ key: 'visit.billable@1', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-2', serviceId: 'wound', clinicianRef: 'N-205' } });
 clinical.queue.push({ key: 'review.billable@1', subjectRef: 'subj-lerato', payload: { reviewRef: 'RV-1', reviewedByRef: 'D-401', feeCode: 'review-per-case' } });
 runtime.advance(1000);
 assert.equal(published('payout.scheduled@1').length, 0, 'a week still running was closed');

 /* The next Monday: the week that ended on Sunday is closed and scheduled, once. */
 runtime.advance(7 * DAY);
 runtime.advance(1000);
 assert.equal(published('payout.scheduled@1').length, 1);
 const nurse = runtime.call('GET /v1/money/payouts@1', { role: 'nurse', ref: 'N-205', purpose: 'billing', fields: {} });
 const [payout] = nurse.body['payouts'] as { totalCents: number; lines: Record<string, unknown>[]; state: string }[];
 assert.equal(payout!.totalCents, serviceById('wound').nurseShare * 100);
 assert.deepEqual(payout!.lines, [{ kind: 'visit', reference: 'APT-2', serviceId: 'wound' }]);
 assert.equal(payout!.state, 'closed');

 /* Wednesday: the simulated bank answers, in earnings.json's own states. */
 runtime.advance(2 * DAY);
 const paid = (runtime.call('GET /v1/money/payouts@1', { role: 'nurse', ref: 'N-205', purpose: 'billing', fields: {} }).body['payouts'] as { state: string }[])[0]!;
 assert.ok(['paid', 'failed'].includes(paid.state), paid.state);
 assert.equal(published('payout.paid@1').length, paid.state === 'paid' ? 1 : 0);

 /* The doctor's signed case is recorded, and no payout is scheduled while the fee is undecided. */
 assert.deepEqual(runtime.call('GET /v1/money/payouts@1', { role: 'doctor', ref: 'D-401', purpose: 'billing', fields: {} }).body, { payouts: [] });
 assert.equal(published('payout.scheduled@1').length, 1);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

/* The runtime now keys a stored reply by the caller as well as the key, and compares what was sent.
   These journeys hold the two layers together: the runtime's refusal for a different request under a
   used key, the ledger's own behind it, and a key two people happen to choose being two payments. */
function billableFor(care: ReturnType<typeof publisher>, runtime: ReturnType<typeof createRuntime>, patients: [string, string][]) {
 for (const [appointmentRef, subjectRef] of patients) {
  care.queue.push({ key: 'appointment.booked@2', subjectRef, payload: { appointmentRef, clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'vitals' } });
 }
 runtime.advance(1000);
 for (const [appointmentRef, subjectRef] of patients) {
  care.queue.push({ key: 'visit.billable@1', subjectRef, payload: { appointmentRef, serviceId: 'vitals', clinicianRef: 'N-205' } });
 }
 runtime.advance(1000);
}

test('the same caller and key with a different payment is refused, and charges nothing', () => {
 const { care, runtime, published } = world();
 billableFor(care, runtime, [['APT-1', 'subj-lerato']]);
 runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-1' }));
 const charged = published('payment.succeeded@1').length + published('payment.failed@1').length;
 const changed = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-1', method: 'eft' }));
 assert.equal(changed.status, refusal('idempotency-key-reused').status);
 assert.equal(changed.body['error'], 'idempotency-key-reused');
 /* The runtime's shared sentence, answered before Money's handler is asked — Money declares no copy. */
 assert.equal(changed.body['message'], refusal('idempotency-key-reused').statement);
 assert.equal(published('payment.succeeded@1').length + published('payment.failed@1').length, charged);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('two payers who choose the same key are two independent payments', () => {
 const { care, runtime, published } = world();
 billableFor(care, runtime, [['APT-1', 'subj-lerato'], ['APT-3', 'subj-thabo']]);
 const lerato = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'shared-key' }));
 const thabo = runtime.call('POST /v1/money/payments@1', { ...pay({ idempotencyKey: 'shared-key', payableRef: 'PB-APT-3' }), ref: 'subj-thabo' });
 assert.equal(lerato.status, 200, JSON.stringify(lerato.body));
 assert.equal(thabo.status, 200, JSON.stringify(thabo.body));
 assert.notEqual(lerato.body['paymentRef'], thabo.body['paymentRef']);
 assert.equal(published('payment.succeeded@1').length + published('payment.failed@1').length, 2);
 runtime.close();
});

test('a payment from a person the runtime cannot identify is refused before Money is asked', () => {
 const { care, runtime } = world();
 billableFor(care, runtime, [['APT-1', 'subj-lerato']]);
 const { ref: _ref, ...anonymous } = pay({ idempotencyKey: 'k-anon' });
 const answer = runtime.call('POST /v1/money/payments@1', anonymous);
 assert.equal(answer.body['error'], 'caller-unidentified');
 runtime.close();
});

test('version one refuses cash and names version two, which carries the code to the caller who paid and nobody else', () => {
 const { care, runtime, published } = world();
 billableFor(care, runtime, [['APT-1', 'subj-lerato']]);
 const cash = { idempotencyKey: 'k-cash', method: 'cash-otp' };
 const onOne = runtime.call('POST /v1/money/payments@1', pay(cash));
 assert.deepEqual(onOne.body, { error: 'cash-needs-version-2', message: refusal('cash-needs-version-2').statement });
 const onTwo = runtime.call('POST /v1/money/payments@2', pay(cash));
 assert.equal(onTwo.status, 200, JSON.stringify(onTwo.body));
 assert.equal(onTwo.body['stateCode'], 'pending');
 assert.match(String(onTwo.body['cashCode']), /^\d{6}$/);
 /* Somebody else calling with the payer's key is a different caller: no payable of theirs, no code. */
 const stranger = runtime.call('POST /v1/money/payments@2', { ...pay(cash), ref: 'subj-somebody-else' });
 assert.equal(stranger.body['error'], 'someone-elses-payable');
 assert.equal(stranger.body['cashCode'], undefined);
 /* Nothing on the bus carries the code. */
 assert.ok(!runtime.trail.all().some(e => e.body.includes(String(onTwo.body['cashCode']))), 'the cash code reached the bus trail');
 assert.equal(published('payment.succeeded@1').length, 0);
 runtime.close();
});

test('a runtime that sleeps through two weeks pays both when it wakes, once each', () => {
 const { care, runtime, published } = world();
 care.queue.push({ key: 'visit.billable@1', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-W1', serviceId: 'wound', clinicianRef: 'N-205' } });
 runtime.advance(1000);
 runtime.advance(7 * DAY);
 care.queue.push({ key: 'visit.billable@1', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-W2', serviceId: 'vitals', clinicianRef: 'N-205' } });
 /* Delivered with a short step, then the runtime sleeps past the week it belongs to and the one after:
    the first tick it runs on waking is the only chance that week gets. */
 runtime.advance(1000);
 runtime.advance(15 * DAY);
 const payouts = runtime.call('GET /v1/money/payouts@1', { role: 'nurse', ref: 'N-205', purpose: 'billing', fields: {} }).body['payouts'] as { totalCents: number; lines: { reference: string }[] }[];
 const references = payouts.flatMap(p => p.lines.map(l => l.reference)).sort();
 assert.deepEqual(references, ['APT-W1', 'APT-W2'], 'a billable visit was left unpaid after the runtime woke');
 assert.equal(published('payout.scheduled@1').length, payouts.length, 'a week was scheduled more than once');
 runtime.advance(1000);
 assert.equal(published('payout.scheduled@1').length, payouts.length);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('through the door, the version a caller names decides which payments route answers, and naming none is refused', () => {
 const { care, runtime } = world();
 billableFor(care, runtime, [['APT-1', 'subj-lerato']]);
 const settings = loadRuntimeContract();
 const door = (version: string | undefined) => runtime.handle({
  method: 'POST', path: '/v1/money/payments', query: {},
  headers: { [settings.mock.mock.roleHeader]: 'patient', [settings.mock.mock.purposeHeader]: 'billing', [settings.settings.callerRefHeader]: 'subj-lerato', [settings.mock.mock.versionHeader]: version },
  body: { payableRef: 'PB-APT-1', method: 'cash-otp', amountCents: vitals.price * 100, idempotencyKey: `door-${version ?? 'unnamed'}` }
 });
 const unnamed = door(undefined);
 assert.deepEqual([unnamed.status, unnamed.body['error'], unnamed.answeredBy], [400, 'route-version-required', 'runtime']);
 assert.deepEqual(door('1').body, { error: 'cash-needs-version-2', message: refusal('cash-needs-version-2').statement });
 const two = door('2');
 assert.equal(two.status, 200, JSON.stringify(two.body));
 assert.equal(two.answeredBy, 'engine');
 assert.match(String(two.body['cashCode']), /^\d{6}$/);
 assert.equal(door('9').body['error'], 'route-version-not-declared');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

/* ---- Settings ---------------------------------------------------------------------------------- */

const ADMIN = { role: 'admin', ref: 'party-synthetic-901', purpose: 'audit' };
const moneyDefaultsKeys = moneyBlock.items.map(s => s.key);
const SETTINGS_READ = 'GET /v1/money/settings@1' as const;
const SETTINGS_CHANGE = 'POST /v1/money/setting-changes@1' as const;

test('an admin reads Money’s settings in force with who decided each, and a doctor or a nurse cannot', () => {
 const { runtime } = world();
 const answer = runtime.call(SETTINGS_READ, { ...ADMIN, fields: {} });
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 const rows = answer.body['settings'] as { setting: string; inForce: unknown; default: unknown; provenance: { decidedBy: string | null }; changedBy: string[] }[];
 assert.deepEqual(rows.map(r => r.setting), moneyDefaultsKeys);
 for (const row of rows) {
  assert.deepEqual(row.inForce, row.default, row.setting);
  assert.deepEqual(row.changedBy, ['admin'], row.setting);
 }
 assert.equal(rows.find(r => r.setting === 'doctor-fee-confirmed')!.inForce, false, 'the proposed fee is not confirmed');
 for (const role of ['doctor', 'nurse']) assert.equal(runtime.call(SETTINGS_READ, { role, ref: 'party-synthetic-1', purpose: 'audit', fields: {} }).body['error'], 'caller-not-allowed', role);
 runtime.close();
});

test('a change is refused in the shared sentences and in Money’s own, and an accepted one is recorded once', () => {
 const { runtime, published } = world();
 const changeOf = (fields: Record<string, unknown>) => runtime.call(SETTINGS_CHANGE, { ...ADMIN, fields: { reason: 'The share is not the same part of every visit.', expectedVersion: 1, ...fields } });
 const fraction = changeOf({ idempotencyKey: 'fraction', setting: 'nurse-share-sentence', wording: 'Your share is three quarters of what the patient paid.' });
 assert.deepEqual([fraction.status, fraction.body['error'], fraction.body['message']], [refusal('share-wording-states-a-fraction').status, 'share-wording-states-a-fraction', refusal('share-wording-states-a-fraction').statement]);
 const below = changeOf({ idempotencyKey: 'below', setting: 'doctor-case-fee', wholeNumber: 1 });
 assert.equal(below.body['error'], 'setting-out-of-range');
 const week = changeOf({ idempotencyKey: 'week', setting: 'plus-urgent-callouts', parts: { count: 1, period: 'week' } });
 assert.equal(week.body['error'], 'setting-out-of-range');

 const confirmed = changeOf({ idempotencyKey: 'confirm', setting: 'doctor-fee-confirmed', switchedOn: true, reason: 'The review panel lead agreed the proposed fee.' });
 assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
 assert.deepEqual(changeOf({ idempotencyKey: 'confirm', setting: 'doctor-fee-confirmed', switchedOn: true, reason: 'The review panel lead agreed the proposed fee.' }).body, confirmed.body, 'the same key replays rather than repeating');
 const read = runtime.call(SETTINGS_READ, { ...ADMIN, fields: {} }).body;
 assert.equal(read['settingsVersion'], 2);
 assert.deepEqual((read['history'] as { setting: string; from: unknown; to: unknown; byRef: string }[]).map(h => [h.setting, h.from, h.to, h.byRef]), [['doctor-fee-confirmed', false, true, ADMIN.ref]]);
 assert.equal(published('payout.scheduled@1').length, 0, 'confirming a fee schedules nothing by itself');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
