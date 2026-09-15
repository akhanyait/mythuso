import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, memoryTables, TABLE_NAMES, type MoneyTables, type Payment, type Receipt } from './ledger.ts';
import { isRefusal, money as contract, refusal, serviceById } from './contract.ts';
import { seeded } from './provider.ts';
import { doctorOwedCents } from './fees.ts';

/* The review's findings, each held by a test that failed before its fix: a cash code computed from its
   own reference and tried without limit, a week the tick never looked at, and a doctor's payout of R0
   under a fee nobody decided. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');
const patient = { role: 'patient', subjectRef: 'subj-thabo' };
const nurse = { role: 'nurse', subjectRef: 'N-205' };
const desk = { role: 'ops-desk', subjectRef: 'O-801' };
const vitals = serviceById('vitals');

function cashVisit(tables: MoneyTables = memoryTables()) {
 const money = createMoney({ clock, simulation: true, tables });
 money.openVisitPayable({ payableRef: 'MT-CASH-1', serviceId: 'vitals', subjectRef: patient.subjectRef, appointmentRef: 'APT-CASH-1' });
 const request = { idempotencyKey: 'cash-1', payableRef: 'MT-CASH-1', method: 'cash-otp', amountCents: vitals.price * 100 };
 const receipt = money.pay(patient, request) as Receipt;
 money.hear({ type: 'visit.billable', version: 1, payload: { appointmentRef: 'APT-CASH-1', serviceId: 'vitals', clinicianRef: 'N-205' } });
 return { money, receipt, request, tables };
}
const wrongFor = (code: string) => (code === '000000' ? '111111' : '000000');

test('a cash code cannot be computed from its payment reference, and is stored nowhere', () => {
 const codes = new Set<string>();
 let paymentRef = '';
 for (let i = 0; i < 6; i += 1) {
  const { receipt, tables } = cashVisit();
  paymentRef = receipt.paymentRef;
  codes.add(receipt.cashCode!);
  const everything = TABLE_NAMES.map(name => JSON.stringify((tables[name] as { all(): unknown[] }).all())).join('');
  assert.ok(!everything.includes(`"${receipt.cashCode}"`), 'a table holds the code itself');
 }
 /* Six ledgers, one reference: a code derived from the reference would be the same six times. */
 assert.ok(codes.size > 1, 'the same reference produced the same code every time');
 const derived = (() => { const rand = seeded(`cash:${paymentRef}`); return Array.from({ length: 6 }, () => Math.floor(rand() * 10)).join(''); })();
 assert.ok([...codes].some(code => code !== derived), 'the code is still the seeded derivation of its reference');
});

test('a replayed cash payment does not show its code again', () => {
 const { money, request, receipt } = cashVisit();
 const again = money.pay(patient, request) as Receipt;
 assert.equal(again.replayed, true);
 assert.equal(again.paymentRef, receipt.paymentRef);
 assert.equal(again.cashCode, undefined);
 assert.equal(again.cashCodeAlreadyShown, true);
});

test('five wrong codes hold the payment, the right code is refused until the desk releases it, and every attempt is audited', () => {
 const { money, receipt } = cashVisit();
 const code = receipt.cashCode!;
 const limit = contract.cash.attemptLimit;
 for (let i = 1; i < limit; i += 1) assert.deepEqual(money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code: wrongFor(code) }), refusal('cash-without-otp'), `attempt ${i}`);
 assert.deepEqual(money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code: wrongFor(code) }), refusal('cash-code-held'), 'the attempt that reaches the limit holds the payment');
 assert.deepEqual(money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code }), refusal('cash-code-held'), 'the right code after the limit');
 assert.equal(money.payment(receipt.paymentRef)!.stateCode, 'pending');

 assert.deepEqual(money.releaseCashCode(nurse, receipt.paymentRef), refusal('caller-not-allowed'), 'a nurse cannot release her own hold');
 assert.ok(!isRefusal(money.releaseCashCode(desk, receipt.paymentRef)));
 const paid = money.enterCashCode(nurse, { paymentRef: receipt.paymentRef, code }) as Payment;
 assert.equal(paid.stateCode, 'succeeded');
 assert.equal(money.outbox().filter(e => e.type === 'payment.succeeded').length, 1);

 const trail = money.cashAuditFor(receipt.paymentRef);
 assert.deepEqual(trail.map(r => r.outcome), [...Array(limit - 1).fill('wrong'), 'held', 'refused-while-held', 'released', 'accepted']);
 for (const row of trail) {
  assert.deepEqual(Object.keys(row).sort(), ['actorRef', 'actorRole', 'at', 'outcome', 'paymentRef'], 'an audit row carries who and when, never what was entered');
  assert.ok(!JSON.stringify(row).includes(code));
 }
});

test('a fifteen-day jump pays both weeks, and scheduling again schedules nothing new', () => {
 let now = new Date('2026-09-09T10:00:00+02:00');
 const money = createMoney({ clock: () => now, simulation: true });
 money.hear({ type: 'visit.billable', version: 1, occurredAt: '2026-09-09T10:00:00+02:00', payload: { appointmentRef: 'APT-A', serviceId: 'wound', clinicianRef: 'N-205' } });
 money.hear({ type: 'visit.billable', version: 1, occurredAt: '2026-09-16T10:00:00+02:00', payload: { appointmentRef: 'APT-B', serviceId: 'vitals', clinicianRef: 'N-205' } });
 now = new Date('2026-09-24T10:00:00+02:00');
 const scheduled = money.scheduleClosedWeeks();
 assert.deepEqual(scheduled.map(p => [p.periodEnd, p.totalCents]).sort(), [['2026-09-13', serviceById('wound').nurseShare * 100], ['2026-09-20', vitals.nurseShare * 100]]);
 assert.deepEqual(money.unscheduledClosedLines(), [], 'a billable line from a closed week is still unscheduled');
 money.scheduleClosedWeeks();
 money.schedulePayouts('2026-09-13');
 assert.equal(money.outbox().filter(e => e.type === 'payout.scheduled').length, 2, 'a week was scheduled twice');
});

test('a line that arrives late for a week already closed is still scheduled, into its own week', () => {
 let now = new Date('2026-09-22T10:00:00+02:00');
 const money = createMoney({ clock: () => now, simulation: true });
 money.hear({ type: 'visit.billable', version: 1, occurredAt: '2026-09-16T10:00:00+02:00', payload: { appointmentRef: 'APT-B', serviceId: 'vitals', clinicianRef: 'N-205' } });
 money.scheduleClosedWeeks();
 money.hear({ type: 'visit.billable', version: 1, occurredAt: '2026-09-10T10:00:00+02:00', payload: { appointmentRef: 'APT-LATE', serviceId: 'wound', clinicianRef: 'N-205' } });
 now = new Date('2026-09-23T10:00:00+02:00');
 money.scheduleClosedWeeks();
 const late = money.allPayouts().find(p => p.periodEnd === '2026-09-13')!;
 assert.deepEqual(late.lines, [{ kind: 'visit', reference: 'APT-LATE', serviceId: 'wound' }]);
 assert.deepEqual(money.unscheduledClosedLines(), []);
});

test('no doctor payout is scheduled while the fee is unconfirmed, even with no signed cases', () => {
 const money = createMoney({ clock, simulation: true });
 assert.deepEqual(money.scheduleDoctorPayout('D-999', '2026-09-20'), refusal('doctor-fee-undecided'));
 assert.deepEqual(doctorOwedCents([], null), refusal('doctor-fee-undecided'));
 assert.equal(money.outbox().length, 0, 'an R0 payout was published under a fee nobody confirmed');
});
