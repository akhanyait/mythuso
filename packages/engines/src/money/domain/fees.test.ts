import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, type Payout } from './ledger.ts';
import { doctorFees, isRefusal, rangeOf, refusal } from './contract.ts';
import { doctorOwedCents, isDecided } from './fees.ts';

/* The doctor's per-case fee is a range in the documents and null in the contract. Until somebody
   named decides it, every signed case is recorded and no doctor's payout is scheduled. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');
const reviewed = (reviewRef: string, feeCode = 'review-per-case') =>
 ({ type: 'review.billable', version: 1, occurredAt: '2026-09-13T12:00:00+02:00', payload: { reviewRef, reviewedByRef: 'D-401', feeCode } });

test('the contract’s fee is undecided: no amount, nobody’s name, and a range cited rather than typed', () => {
 for (const fee of doctorFees) {
  assert.equal(fee.amount, null);
  assert.equal(fee.decidedBy, null);
  assert.equal(isDecided(fee), false);
  const [low, high] = rangeOf(fee);
  assert.ok(low > 0 && low < high);
 }
});

test('signed cases are recorded, and scheduling a doctor’s payout is refused while the fee is undecided', () => {
 const money = createMoney({ clock, simulation: true });
 assert.ok(!isRefusal(money.hear(reviewed('RV-1'))));
 assert.ok(!isRefusal(money.hear(reviewed('RV-2'))));
 money.hear(reviewed('RV-2')); // redelivered
 assert.equal(money.casesFor('D-401').length, 2);
 const attempt = money.scheduleDoctorPayout('D-401', '2026-09-20');
 assert.deepEqual(attempt, refusal('doctor-fee-undecided'));
 assert.equal(money.outbox().length, 0, 'an undecided fee published a payout');
 assert.deepEqual(money.payoutsFor({ role: 'doctor', subjectRef: 'D-401' }), []);
});

test('a fee code Money does not know is not something it can hear', () => {
 const money = createMoney({ clock, simulation: true });
 assert.deepEqual(money.hear(reviewed('RV-9', 'second-opinion')), refusal('hears-only-its-list'));
});

test('once decided — by a person, on a day, inside the range — the payout is arithmetic on that amount alone', () => {
 const [low, high] = rangeOf(doctorFees[0]!);
 const decided = doctorFees.map(f => ({ ...f, amount: low, decidedBy: 'A test, not a decision', decidedOn: '2026-09-14' }));
 const money = createMoney({ clock, simulation: true, doctorFees: decided });
 money.hear(reviewed('RV-1'));
 money.hear(reviewed('RV-2'));
 const payout = money.scheduleDoctorPayout('D-401', '2026-09-20') as Payout;
 assert.equal(payout.totalCents, 2 * low * 100);
 assert.equal(money.outbox().find(e => e.type === 'payout.scheduled')!.payload['lineCount'], 2);
 /* An amount without a name, or outside the cited range, is still undecided. */
 assert.deepEqual(doctorOwedCents([{ reviewRef: 'x', feeCode: 'review-per-case', on: '2026-09-13' }], doctorFees.map(f => ({ ...f, amount: low }))), refusal('doctor-fee-undecided'));
 assert.deepEqual(doctorOwedCents([{ reviewRef: 'x', feeCode: 'review-per-case', on: '2026-09-13' }], decided.map(f => ({ ...f, amount: high + 1 }))), refusal('doctor-fee-undecided'));
});
