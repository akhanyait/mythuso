import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, type Payment, type Receipt } from './ledger.ts';
import { isRefusal, money as contract, refusal, serviceById } from './contract.ts';

/* Cash is recorded when the person who paid and the person who was paid agree, against a visit
   Care has said is billable — never on the nurse's word, and never before the visit finished. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');
const patient = { role: 'patient', subjectRef: 'subj-thabo' };
const nurse = { role: 'nurse', subjectRef: 'N-205' };
const vitals = serviceById('vitals');

function cashVisit() {
 const money = createMoney({ clock, simulation: true });
 money.openVisitPayable({ payableRef: 'MT-CASH-1', serviceId: 'vitals', subjectRef: patient.subjectRef, appointmentRef: 'APT-CASH-1' });
 const receipt = money.pay(patient, { idempotencyKey: 'cash-1', payableRef: 'MT-CASH-1', method: 'cash-otp', amountCents: vitals.price * 100 }) as Receipt;
 return { money, receipt };
}
const billable = { type: 'visit.billable', version: 1, payload: { appointmentRef: 'APT-CASH-1', serviceId: 'vitals', clinicianRef: 'N-205' } };

test('cash waits, with a code for the patient, and nothing is published until it is entered', () => {
 const { money, receipt } = cashVisit();
 assert.equal(receipt.stateCode, 'pending');
 assert.equal(receipt.cashCode?.length, contract.cash.codeLength);
 assert.match(receipt.cashCode ?? '', /^\d+$/);
 assert.equal(money.outbox().length, 0);
});

test('a cash code entered before the visit is billable is refused', () => {
 const { money, receipt } = cashVisit();
 assert.deepEqual(money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code: receipt.cashCode! }), refusal('cash-before-the-visit-finished'));
});

test('the wrong code, or the wrong nurse, records nothing', () => {
 const { money, receipt } = cashVisit();
 money.hear(billable);
 const wrong = receipt.cashCode === '000000' ? '111111' : '000000';
 assert.deepEqual(money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code: wrong }), refusal('cash-without-otp'));
 assert.deepEqual(money.enterCashCode({ role: 'nurse', subjectRef: 'N-204' }, { paymentRef: receipt.paymentRef, code: receipt.cashCode! }), refusal('cash-code-not-your-visit'));
 /* Refused before the code was compared, so the nurse who was there has lost no attempt to her. */
 assert.equal(money.cashStanding(receipt.paymentRef)!.wrongAttempts, 1);
 assert.equal(money.payment(receipt.paymentRef)!.stateCode, 'pending');
});

test('the right code from the visit’s own nurse, after visit.billable, is paid and published once', () => {
 const { money, receipt } = cashVisit();
 assert.ok(!isRefusal(money.hear(billable)));
 const paid = money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code: receipt.cashCode! }) as Payment;
 assert.equal(paid.stateCode, 'succeeded');
 money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code: receipt.cashCode! });
 const published = money.outbox().filter(e => e.type === 'payment.succeeded');
 assert.equal(published.length, 1);
 assert.equal(published[0]!.payload['method'], 'cash-otp');
 assert.equal(published[0]!.payload['amountCents'], vitals.price * 100);
 /* And a second cash payment for the same visit is the same one, not another. */
 assert.deepEqual(money.pay(patient, { idempotencyKey: 'cash-2', payableRef: 'MT-CASH-1', method: 'cash-otp', amountCents: vitals.price * 100 }), refusal('already-paid'));
});
