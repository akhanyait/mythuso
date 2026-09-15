import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, type Payout } from './ledger.ts';
import { doctorFees, isRefusal, refusal } from './contract.ts';
import { doctorOwedCents, type FeeInForce } from './fees.ts';
import { doctorFeeOf, doctorFeeRangeCents, moneyDefaults } from './settings.ts';

/* The doctor's per-case fee is a range in the documents and a proposal in Money's settings. A proposal
   pays nobody: every signed case is recorded with the fee in force that day, and a payout is scheduled
   only at a fee an admin has confirmed. A case keeps the fee it was signed under. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');
const reviewed = (reviewRef: string, feeCode = 'review-per-case') =>
 ({ type: 'review.billable', version: 1, occurredAt: '2026-09-13T12:00:00+02:00', payload: { reviewRef, reviewedByRef: 'D-401', feeCode } });
const proposed = doctorFeeOf(moneyDefaults);
const confirmedAt = (amountCents: number, settingsVersion = 3): FeeInForce => ({ feeCode: proposed.feeCode, amountCents, confirmed: true, settingsVersion });

test('the fee in force by default is a proposal inside the cited range, and it is not confirmed', () => {
 assert.equal(doctorFees.length, 1);
 assert.equal(proposed.feeCode, doctorFees[0]!.feeCode);
 assert.equal(proposed.confirmed, false);
 assert.ok(doctorFeeRangeCents.lowest > 0 && doctorFeeRangeCents.lowest < doctorFeeRangeCents.highest);
 assert.ok(proposed.amountCents >= doctorFeeRangeCents.lowest && proposed.amountCents <= doctorFeeRangeCents.highest);
});

test('signed cases are recorded with the fee in force, and a payout at an unconfirmed proposal is refused and publishes nothing', () => {
 const money = createMoney({ clock, simulation: true, doctorFee: () => proposed });
 assert.ok(!isRefusal(money.hear(reviewed('RV-1'))));
 assert.ok(!isRefusal(money.hear(reviewed('RV-2'))));
 money.hear(reviewed('RV-2')); // redelivered
 assert.equal(money.casesFor('D-401').length, 2);
 assert.deepEqual(money.casesFor('D-401').map(c => c.fee), [proposed, proposed], 'each case keeps the fee in force when it was heard');
 assert.deepEqual(money.scheduleDoctorPayout('D-401', '2026-09-20'), refusal('doctor-fee-undecided'));
 assert.equal(money.outbox().length, 0, 'an unconfirmed proposal published a payout');
 assert.deepEqual(money.payoutsFor({ role: 'doctor', subjectRef: 'D-401' }), []);
});

test('with no fee handed in, nothing is in force and nothing is paid', () => {
 const money = createMoney({ clock, simulation: true });
 money.hear(reviewed('RV-1'));
 assert.equal(money.casesFor('D-401')[0]!.fee, null);
 assert.deepEqual(money.scheduleDoctorPayout('D-401', '2026-09-20'), refusal('doctor-fee-undecided'));
});

test('a fee code Money does not know is not something it can hear', () => {
 const money = createMoney({ clock, simulation: true, doctorFee: () => proposed });
 assert.deepEqual(money.hear(reviewed('RV-9', 'second-opinion')), refusal('hears-only-its-list'));
});

test('once confirmed, the payout is arithmetic on the fee each case was signed under', () => {
 let fee: FeeInForce = confirmedAt(doctorFeeRangeCents.lowest);
 const money = createMoney({ clock, simulation: true, doctorFee: () => fee });
 money.hear(reviewed('RV-1'));
 fee = confirmedAt(doctorFeeRangeCents.highest, 4);
 money.hear(reviewed('RV-2'));
 const payout = money.scheduleDoctorPayout('D-401', '2026-09-20') as Payout;
 assert.equal(payout.totalCents, doctorFeeRangeCents.lowest + doctorFeeRangeCents.highest, 'each case at the fee in force on the day it was signed');
 assert.equal(money.outbox().find(e => e.type === 'payout.scheduled')!.payload['lineCount'], 2);
});

test('unconfirming the fee later never takes back a case signed while it was confirmed', () => {
 let fee: FeeInForce = confirmedAt(doctorFeeRangeCents.highest);
 const money = createMoney({ clock, simulation: true, doctorFee: () => fee });
 money.hear(reviewed('RV-1'));
 fee = { ...proposed, settingsVersion: 5 };
 const payout = money.scheduleDoctorPayout('D-401', '2026-09-20') as Payout;
 assert.equal(payout.totalCents, doctorFeeRangeCents.highest);
 money.hear({ ...reviewed('RV-2'), payload: { reviewRef: 'RV-2', reviewedByRef: 'D-402', feeCode: 'review-per-case' } });
 assert.deepEqual(money.scheduleDoctorPayout('D-402', '2026-09-20'), refusal('doctor-fee-undecided'), 'a case signed after the fee was unconfirmed waits');
});

test('a case signed under a proposal is paid at the fee an admin confirms before its payout, and never at the proposal', () => {
 let fee: FeeInForce = proposed;
 const money = createMoney({ clock, simulation: true, doctorFee: () => fee });
 money.hear(reviewed('RV-1'));
 fee = confirmedAt(proposed.amountCents + 100);
 assert.equal((money.scheduleDoctorPayout('D-401', '2026-09-20') as Payout).totalCents, proposed.amountCents + 100);
 assert.deepEqual(doctorOwedCents([], null), refusal('doctor-fee-undecided'), 'nothing signed and nothing confirmed is no payout, not an R0 one');
 assert.equal(doctorOwedCents([], confirmedAt(proposed.amountCents)), 0);
});
