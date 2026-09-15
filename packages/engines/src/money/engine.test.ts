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
import { attempt } from './domain/provider.ts';
import { hearing, refusal, serviceById } from './domain/contract.ts';

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

test('a booked visit is priced by visit.billable, paid once, and refused in the contract’s words', () => {
 const { care, runtime, published } = world();
 care.queue.push({ key: 'appointment.booked@1', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-1', clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00' } });
 runtime.advance(1000);

 /* Before the visit is billable the payable has no price, and nothing is charged. */
 const early = runtime.call('POST /v1/money/payments@1', pay({ idempotencyKey: 'k-early' }));
 assert.deepEqual([early.status, early.body], [refusal('payable-not-priced').status, { error: 'payable-not-priced', message: refusal('payable-not-priced').statement }]);

 care.queue.push({ key: 'visit.billable@1', subjectRef: 'subj-lerato', payload: { appointmentRef: 'APT-1', serviceId: 'vitals', clinicianRef: 'N-205' } });
 runtime.advance(1000);

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
  care.queue.push({ key: 'appointment.booked@1', subjectRef, payload: { appointmentRef, clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00' } });
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
