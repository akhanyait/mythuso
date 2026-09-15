import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, type Payout } from './ledger.ts';
import { acceptLine, lineCents, linesFromEarningsWeek, periodEndFor, recompute, totalCents, type PayoutLine } from './payouts.ts';
import { catalogue, earningsContract, isRefusal, platformShare, refusal, serviceById } from './contract.ts';
import eventsContract from '../../../../catalog/events.json' with { type: 'json' };

/* A nurse's payout is her share of every billable visit, from services.json, and nothing a
   suspension or a recomputation can take back. */
const clock = () => new Date('2026-09-16T09:00:00+02:00'); // a Wednesday
const nurse = { role: 'nurse', subjectRef: 'N-205' };
const billable = (appointmentRef: string, serviceId: string, clinicianRef = 'N-205', occurredAt = '2026-09-15T10:00:00+02:00') =>
 ({ type: 'visit.billable', version: 1, occurredAt, payload: { appointmentRef, serviceId, clinicianRef } });

test('a visit line is worth the nurse’s share in services.json, and the share is not restated anywhere', () => {
 for (const service of catalogue) {
  assert.equal(lineCents({ kind: 'visit', reference: 'x', serviceId: service.id }), service.nurseShare * 100);
  assert.equal(lineCents({ kind: 'plan-visit', reference: 'x', serviceId: service.id }), service.nurseShare * 100, 'a plan visit is paid at the same rate');
 }
 /* The platform keeps its quarter out of the price, so the nurse's share is the rest — to within the
    rounding services.json already does to whole rand. */
 for (const service of catalogue.filter(s => s.phase === 1)) assert.ok(Math.abs(service.nurseShare - service.price * (1 - platformShare)) <= 1, service.id);
});

test('a visit line that names its own amount is refused, and a deduction without a reason is refused', () => {
 assert.deepEqual(acceptLine({ kind: 'visit', reference: 'TH-1', serviceId: 'wound', amountCents: 100 }), refusal('payout-line-names-its-amount'));
 assert.deepEqual(acceptLine({ kind: 'reversal', reference: 'TH-1', amountCents: 100, reason: '  ' }), refusal('deduction-without-a-reason'));
 const reversal = acceptLine({ kind: 'reversal', reference: 'TH-1', amountCents: 22400, reason: 'Refunded: no access to the address.' }) as PayoutLine;
 assert.equal(lineCents(reversal), -22400);
});

test('every sample week in earnings.json totals the same through the ledger as through the catalogue', () => {
 for (const week of earningsContract.weeks) {
  const lines = linesFromEarningsWeek(week as Parameters<typeof linesFromEarningsWeek>[0]);
  const byHand = week.lines.reduce((sum, line) => {
   const sign = earningsContract.lineKinds.find(k => k.id === line.kind)!.sign;
   const rand = 'service' in line && line.service ? serviceById(line.service).nurseShare : ('amount' in line ? line.amount as number : 0);
   return sum + sign * rand * 100;
  }, 0);
  assert.equal(totalCents(lines), byHand, week.id);
 }
});

test('a week closes on the contract’s own day, and closing it twice is one payout', () => {
 assert.equal(new Date(`${periodEndFor(clock())}T00:00:00Z`).getUTCDay(), ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(earningsContract.cycle.weekEndsOn));
 const money = createMoney({ clock, simulation: true });
 money.hear(billable('APT-1', 'wound'));
 money.hear(billable('APT-2', 'senior'));
 money.hear(billable('APT-2', 'senior')); // redelivered
 money.hear(billable('APT-3', 'vitals', 'N-201'));
 const periodEnd = periodEndFor(new Date('2026-09-15T10:00:00+02:00'));
 const first = money.schedulePayouts(periodEnd);
 const again = money.schedulePayouts(periodEnd);
 const mine = first.find(p => p.partyRef === 'N-205')!;
 assert.equal(mine.totalCents, (serviceById('wound').nurseShare + serviceById('senior').nurseShare) * 100);
 assert.equal(mine.lines.length, 2);
 assert.ok(mine.lines.every(line => !('amountCents' in line)), 'a scheduled visit line carries an amount');
 assert.equal(again.find(p => p.partyRef === 'N-205')!.payoutRef, mine.payoutRef);
 const scheduled = money.outbox().filter(e => e.type === 'payout.scheduled');
 assert.equal(scheduled.length, 2, 'one per party, and none for closing the week a second time');
 assert.deepEqual(Object.keys(scheduled[0]!.payload).sort(), ['lineCount', 'payoutRef', 'periodEnd']);
 /* A nurse reads her own payouts and nobody else's. */
 assert.equal((money.payoutsFor(nurse) as Payout[]).length, 1);
 assert.equal((money.payoutsFor({ role: 'nurse', subjectRef: 'N-201' }) as Payout[])[0]!.partyRef, 'N-201');
 assert.deepEqual(money.payoutsFor({ role: 'employer', subjectRef: 'e' }), refusal('scheme-sees-a-payment'));
});

test('a suspension never touches money already earned', () => {
 const money = createMoney({ clock, simulation: true });
 money.hear(billable('APT-1', 'wound'));
 money.hear(billable('APT-2', 'postop'));
 const periodEnd = periodEndFor(new Date('2026-09-15T10:00:00+02:00'));
 const [payout] = money.schedulePayouts(periodEnd);
 const earned = payout!.totalCents;

 /* Money does not hear a nurse's suspension at all. The nearest thing on its list is a partner's. */
 const suspended = eventsContract.events.find(e => e.type === 'partner.suspended' && !('withdrawn' in e))!;
 const payload = Object.fromEntries(suspended.payload.map(f => [f.field, f.field.endsWith('Ref') ? 'N-205' : 'lapsed-clearance']));
 assert.ok(!isRefusal(money.hear({ type: 'partner.suspended', version: suspended.version, payload })));
 assert.equal((money.payoutsFor(nurse) as Payout[])[0]!.totalCents, earned);

 /* A recomputation because of a suspension that would take anything away is refused. */
 assert.deepEqual(money.recomputePayout(payout!.payoutRef, payout!.lines.slice(1), 'suspension'), refusal('suspension-touches-earned-money'));
 assert.deepEqual(recompute(payout!.lines, [], 'suspension'), refusal('suspension-touches-earned-money'));
 /* And so is any recomputation that drops an earned line without a reversal naming it. */
 assert.deepEqual(money.recomputePayout(payout!.payoutRef, payout!.lines.slice(1), 'correction'), refusal('deduction-without-a-reason'));
 assert.equal((money.payoutsFor(nurse) as Payout[])[0]!.totalCents, earned);

 /* A reversal that names the visit and the reason is how a payout goes down, and the only way. */
 const reversed = money.recomputePayout(payout!.payoutRef, [...payout!.lines, { kind: 'reversal', reference: 'APT-2', amountCents: 26200, reason: 'Refunded to the patient: the visit did not take place.' }], 'reversal') as Payout;
 assert.equal(reversed.totalCents, earned - 26200);
});

test('a returned run is still owed, goes out again, and is never marked paid straight from failed', () => {
 const money = createMoney({ clock, simulation: true });
 const week = earningsContract.weeks.find(w => w.state === 'failed')!;
 const lines = linesFromEarningsWeek(week as Parameters<typeof linesFromEarningsWeek>[0]);
 const payout = money.importWeek({ weekId: week.id, partyRef: 'N-205', periodEnd: '2026-08-30', lines, state: 'failed' });
 const failedWords = earningsContract.states.find(s => s.id === 'failed')!.detail;
 const direct = money.acceptPayoutAdvice({ weekId: week.id, partyId: 'N-205', outcome: 'paid', amountCents: payout.totalCents, at: clock().toISOString() }, 'simulated-provider') as Payout;
 assert.equal(direct.state, 'failed');
 const again = money.runPayout(week.id, 'N-205') as Payout;
 assert.equal(again.state, 'in-transit');
 assert.deepEqual(money.acceptPayoutAdvice({ weekId: week.id, partyId: 'N-205', outcome: 'paid', amountCents: 1, at: clock().toISOString() }, 'simulated-provider'), refusal('amount-mismatch'));
 assert.deepEqual(money.acceptPayoutAdvice({ weekId: week.id, partyId: 'N-205', outcome: 'paid', amountCents: payout.totalCents, at: clock().toISOString() }, 'network'), refusal('door-locked'));
 const withAccount = money.acceptPayoutAdvice({ weekId: week.id, partyId: 'N-205', outcome: 'paid', amountCents: payout.totalCents, at: clock().toISOString(), iban: 'x' }, 'simulated-provider');
 assert.ok(isRefusal(withAccount) && /bank account number/.test(withAccount.statement));
 assert.ok(failedWords.includes('still owed to you'));
});
