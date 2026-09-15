import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, type Receipt } from './ledger.ts';
import { isRefusal, refusal, serviceById } from './contract.ts';
import { attempt } from './provider.ts';

/* Payments, held to the refusals in packages/catalog/apis/money.json. Every expected sentence is
   read back out of the contract, so a test cannot pass by agreeing with a typo. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');
const lerato = { role: 'patient', subjectRef: 'subj-lerato' };
const wound = serviceById('wound');

/* A payable whose first attempt the simulated provider authorises, found by asking it — the same
   look-before-you-press the Playwright journey does, so no test depends on a lucky reference. */
function payableThat(outcome: 'authorised' | 'declined', from = 0) {
 for (let i = from; i < from + 200; i += 1) {
  const ref = `MT-TEST-${i}`;
  if (attempt(ref, 1, 'x', wound.price * 100, clock()).outcome === outcome) return ref;
 }
 throw new Error(`No reference in 200 draws is ${outcome} on its first attempt.`);
}

function ledgerWith(ref: string) {
 const money = createMoney({ clock, simulation: true });
 money.openVisitPayable({ payableRef: ref, serviceId: 'wound', subjectRef: lerato.subjectRef, appointmentRef: `APT-${ref}`, bookingRef: `BK-${ref}` });
 return money;
}
const request = (ref: string, over: Record<string, unknown> = {}) => ({ idempotencyKey: `key-${ref}`, payableRef: ref, method: 'card', amountCents: wound.price * 100, ...over });

test('the same key with the same payment is the same answer, and charges once', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 const first = money.pay(lerato, request(ref)) as Receipt;
 const second = money.pay(lerato, request(ref)) as Receipt;
 assert.equal(first.stateCode, 'succeeded');
 assert.equal(second.replayed, true);
 assert.equal(second.paymentRef, first.paymentRef);
 assert.equal(second.stateCode, first.stateCode);
 assert.equal(money.outbox().filter(e => e.type === 'payment.succeeded').length, 1, 'a replay published a second payment.succeeded');
});

test('the same key with a different payment is refused, and nothing is charged', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 money.pay(lerato, request(ref));
 const other = money.pay(lerato, request(ref, { method: 'eft' }));
 assert.deepEqual(other, refusal('idempotency-key-reused'));
 const wrongAmount = money.pay(lerato, request(ref, { amountCents: 100 }));
 assert.deepEqual(wrongAmount, refusal('idempotency-key-reused'));
 assert.equal(money.outbox().length, 1);
});

test('nothing is charged without a key, and a card number is refused before anything else', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 assert.deepEqual(money.pay(lerato, request(ref, { idempotencyKey: '' })), refusal('charge-without-a-key'));
 const { idempotencyKey: _k, ...keyless } = request(ref);
 assert.deepEqual(money.pay(lerato, keyless), refusal('charge-without-a-key'));
 /* By name, by another spelling, and by shape in a field with an innocent name. The digits are the
    disclosure, so the fixture is built from a digit rather than written out as a number. */
 const digits = '4'.repeat(16);
 assert.deepEqual(money.pay(lerato, request(ref, { cardNumber: 'x' })), refusal('card-number-sent'));
 assert.deepEqual(money.pay(lerato, request(ref, { pan: 'x' })), refusal('card-number-sent'));
 assert.deepEqual(money.pay(lerato, request(ref, { idempotencyKey: `k ${digits}` })), refusal('card-number-sent'));
 assert.equal(money.outbox().length, 0);
});

test('a key built from a dated visit reference is a key, and a card number in any spacing is still a card', () => {
 /* The web keys a payment on the visit reference, the method and the attempt. Its digits — a date, an
    hour, an attempt — are separated by letters and colons, and must not be read as a card. */
 const ref = 'MT-VITALS-2026-09-16-0900-LERATO';
 const money = createMoney({ clock, simulation: true });
 money.openVisitPayable({ payableRef: ref, serviceId: 'vitals', subjectRef: lerato.subjectRef });
 const vitals = serviceById('vitals');
 for (const method of ['card', 'eft']) {
  const answer = money.pay(lerato, { idempotencyKey: `${ref}:${method}:1`, payableRef: ref, method, amountCents: vitals.price * 100 });
  assert.ok(!isRefusal(answer) || answer.id !== 'card-number-sent', `${method} with a dated reference was refused as a card number`);
  if (!isRefusal(answer) && answer.stateCode === 'succeeded') break;
 }
 const other = createMoney({ clock, simulation: true });
 other.openVisitPayable({ payableRef: 'MT-X', serviceId: 'vitals', subjectRef: lerato.subjectRef });
 const four = '4'.repeat(4);
 for (const shaped of [`${four} ${four} ${four} ${four}`, `${four}-${four}-${four}-${four}`, four.repeat(4)]) {
  assert.deepEqual(other.pay(lerato, { idempotencyKey: `k ${shaped}`, payableRef: 'MT-X', method: 'card', amountCents: vitals.price * 100 }), refusal('card-number-sent'), shaped);
 }
});

test('the amount is the catalogue’s, the payable is somebody’s, and a wallet is not offered yet', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 assert.deepEqual(money.pay(lerato, request(ref, { amountCents: 100 })), refusal('amount-mismatch'));
 assert.deepEqual(money.pay({ role: 'patient', subjectRef: 'subj-other' }, request(ref)), refusal('someone-elses-payable'));
 assert.deepEqual(money.pay(lerato, request(ref, { method: 'wallet' })), refusal('method-not-offered'));
 assert.deepEqual(money.pay(lerato, request(ref, { method: 'debit-order' })), refusal('method-not-offered'), 'a debit order is for plans only');
 assert.deepEqual(money.pay(lerato, request('MT-NOWHERE')), refusal('payable-not-found'));
 assert.deepEqual(money.pay({ role: 'nurse', subjectRef: 'N-205' }, request(ref)), refusal('caller-not-allowed'));
 /* And a refused request did not spend its key: the corrected one goes through. */
 assert.equal((money.pay(lerato, request(ref)) as Receipt).stateCode, 'succeeded');
});

test('a paid payable is not paid twice under a new key', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 money.pay(lerato, request(ref));
 assert.deepEqual(money.pay(lerato, request(ref, { idempotencyKey: 'another' })), refusal('already-paid'));
});

test('a decline says why in words, publishes payment.failed without the words, and a new key tries again', () => {
 const ref = payableThat('declined');
 const money = ledgerWith(ref);
 const declined = money.pay(lerato, request(ref)) as Receipt;
 assert.equal(declined.stateCode, 'failed');
 assert.match(declined.declineReason ?? '', /Nothing has been taken\.$/);
 const failed = money.outbox().find(e => e.type === 'payment.failed')!;
 assert.deepEqual(Object.keys(failed.payload).sort(), ['payableRef', 'paymentRef', 'reasonCode']);
 const retry = money.pay(lerato, request(ref, { idempotencyKey: 'second-attempt' })) as Receipt;
 assert.equal(retry.attempt, 2);
 assert.notEqual(retry.paymentRef, declined.paymentRef);
});

test('results arrive only through the door: the network is refused, and so is a result without the simulation', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 const receipt = money.pay(lerato, request(ref)) as Receipt;
 const payload = attempt(ref, 1, receipt.paymentRef, wound.price * 100, clock());
 assert.deepEqual(money.acceptPaymentResult(payload, 'network'), refusal('door-locked'));
 const offline = createMoney({ clock });
 offline.openVisitPayable({ payableRef: ref, serviceId: 'wound', subjectRef: lerato.subjectRef });
 const pending = offline.pay(lerato, request(ref)) as Receipt;
 assert.equal(pending.stateCode, 'pending', 'with no simulated provider nothing can answer, so nothing is paid');
 assert.deepEqual(offline.acceptPaymentResult({ ...payload, reference: pending.paymentRef }, 'simulated-provider'), refusal('door-locked'));
});

test('the door refuses a card number, a narrative and an amount it cannot reconcile', () => {
 const ref = payableThat('declined');
 const money = ledgerWith(ref);
 const receipt = money.pay(lerato, request(ref)) as Receipt;
 const base = { reference: receipt.paymentRef, outcome: 'authorised', amountCents: wound.price * 100, currency: 'ZAR', at: clock().toISOString() };
 const withLast4 = money.acceptPaymentResult({ ...base, last4: 'x' }, 'simulated-provider');
 assert.ok(isRefusal(withLast4) && /card number/.test(withLast4.statement));
 const withNarrative = money.acceptPaymentResult({ ...base, serviceName: 'x' }, 'simulated-provider');
 assert.ok(isRefusal(withNarrative) && /narrative/.test(withNarrative.statement));
 assert.deepEqual(money.acceptPaymentResult({ ...base, amountCents: 1 }, 'simulated-provider'), refusal('amount-mismatch'));
 assert.deepEqual(money.acceptPaymentResult({ ...base, currency: 'USD' }, 'simulated-provider'), refusal('amount-mismatch'));
});

test('a cancelled booking refunds what was paid, through the door, naming the payment', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 const receipt = money.pay(lerato, request(ref)) as Receipt;
 const heard = money.hear({ type: 'booking.cancelled', version: 1, payload: { bookingRef: `BK-${ref}`, cancelledByRole: 'patient', reasonCode: 'no-longer-needed' } });
 assert.ok(!isRefusal(heard));
 assert.equal(money.payment(receipt.paymentRef)!.stateCode, 'refunded');
 assert.deepEqual(money.pay(lerato, request(ref, { idempotencyKey: 'after-cancel' })), refusal('payable-not-found'));
});

test('no scheme or employer sees what one person paid, and a patient sees only their own', () => {
 const ref = payableThat('authorised');
 const money = ledgerWith(ref);
 money.pay(lerato, request(ref));
 assert.deepEqual(money.paymentsFor({ role: 'scheme', subjectRef: 'scheme-1' }), refusal('scheme-sees-a-payment'));
 assert.deepEqual(money.paymentsFor({ role: 'employer', subjectRef: 'employer-1' }), refusal('scheme-sees-a-payment'));
 assert.equal((money.paymentsFor(lerato) as unknown[]).length, 1);
 assert.equal((money.paymentsFor({ role: 'patient', subjectRef: 'subj-other' }) as unknown[]).length, 0);
});

test('a plan is priced from its own contract, and a plan with no price is owed by nobody', () => {
 const money = createMoney({ clock, simulation: true });
 const essential = money.openPlanPayable({ payableRef: 'PLAN-1', planId: 'mom', tierId: 'essential', subjectRef: lerato.subjectRef });
 assert.ok(!isRefusal(essential));
 assert.ok(essential.amountCents !== null && essential.amountCents % 100 === 0, 'a plan payable is priced in whole rand from its contract');
 assert.deepEqual(money.openPlanPayable({ payableRef: 'PLAN-2', planId: 'recover', subjectRef: lerato.subjectRef }), refusal('payable-not-found'));
 assert.deepEqual(money.pay(lerato, { idempotencyKey: 'p', payableRef: 'PLAN-1', method: 'cash-otp', amountCents: essential.amountCents }), refusal('method-not-offered'), 'cash is for visits only');
});
