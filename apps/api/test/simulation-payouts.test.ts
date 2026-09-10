/**
 * The simulated bank payout channel, held to its three refusals.
 *
 * Two of them are unconditional and that is not a shortcut. A channel that could verify an account
 * would need a bank; a channel that could reverse a payout would need one to have left. Neither is
 * true here, so both functions exist to say no in the contract's own words — which is a screen
 * calling something and being refused, rather than a screen moving on quietly as though a bank had
 * confirmed something. The third is conditional and is the one that keeps a fixture honest: hand it
 * an account number and it stops, because acting on one is what paying somebody is.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal, type SimulatedEvent } from '../src/simulation/index.ts';
import { bankPayouts, reversePayout, verifyAccount } from '../src/simulation/suppliers.ts';
import capabilities from '../../../packages/catalog/capabilities.json' with { type: 'json' };
import earnings from '../../../packages/catalog/earnings.json' with { type: 'json' };

const refusesOf = (id: string) =>
 (capabilities.capabilities.find(c => c.id === id) as { simulation: { refuses: string[] } }).simulation.refuses;
const sentence = (matching: RegExp) => refusesOf('payouts').find(s => matching.test(s))!;
const states = earnings.states as ReadonlyArray<{ id: string; detail: string; settled: boolean }>;
const at = new Date('2026-09-10T14:32:07+02:00');

const advise = (subject: string, detail: Record<string, unknown> = {}) =>
 bankPayouts.produce({ subject, at, detail: { partyId: 'N-205', amountCents: 133_500, ...detail } });

describe('what it advises', () => {
 test('a run comes back as one of the states the earnings contract already draws', () => {
  const settled = new Set(states.map(state => state.id));
  for (let i = 0; i < 60; i += 1) {
   const answer = advise(`w-${i}`);
   assert.ok(!isRefusal(answer));
   assert.ok(settled.has(answer.payload['outcome'] as string));
   assert.ok(['in-transit', 'paid', 'failed'].includes(answer.payload['outcome'] as string));
   assert.equal(answer.payload['amountCents'], 133_500);
   assert.equal(answer.payload['partyId'], 'N-205');
   assert.equal(answer.payload['weekId'], `w-${i}`);
  }
 });

 test('a failed run goes out again and is never cleared to paid', () => {
  /* The feed's own switch-on condition, and the sentence already on the screen promises it: the
     money is still owed and it goes out with the next run. A channel that could mark a returned
     week paid would close the one state a nurse most needs left open. */
  for (let i = 0; i < 60; i += 1) {
   const answer = advise(`retry-${i}`, { was: 'failed' });
   assert.ok(!isRefusal(answer));
   assert.equal(answer.payload['outcome'], 'in-transit');
  }
 });

 test('a returned run says why in the words earnings.json already uses', () => {
  let returned: SimulatedEvent | null = null;
  for (let i = 0; i < 200 && !returned; i += 1) {
   const answer = advise(`sweep-${i}`);
   if (!isRefusal(answer) && answer.payload['outcome'] === 'failed') returned = answer;
  }
  assert.ok(returned, 'two hundred simulated payment runs and every one of them reached the account');
  assert.equal(returned.payload['failureReason'], states.find(state => state.id === 'failed')!.detail);
 });

 test('a run that reached the account carries no failure reason', () => {
  for (let i = 0; i < 60; i += 1) {
   const answer = advise(`shape-${i}`);
   if (isRefusal(answer)) continue;
   assert.equal('failureReason' in answer.payload, answer.payload['outcome'] === 'failed');
  }
 });

 test('the same week for the same nurse is the same answer on any machine', () => {
  assert.deepEqual(advise('w-1'), advise('w-1'));
  /* And a different nurse's week is a different run, because the seed is both. */
  assert.notDeepEqual(advise('w-1'), advise('w-1', { partyId: 'N-204' }));
 });
});

describe('what it refuses', () => {
 test('to be handed the means to pay anybody', () => {
  const spellings = ['accountNumber', 'bankAccount', 'accountNo', 'iban', 'beneficiaryAccount', 'branchCode', 'sortCode', 'routingNumber', 'bic', 'swift'];
  for (const field of spellings) {
   const answer = advise('w-1', { [field]: 'x' });
   assert.ok(isRefusal(answer), `a payout advice carrying "${field}" was not refused`);
   assert.equal(answer.refused, sentence(/^Pay anybody/));
  }
  const byShape = advise('w-1', { note: 'into 6201234567 please' });
  assert.ok(isRefusal(byShape));
  assert.equal(byShape.refused, sentence(/^Pay anybody/));
 });

 test('and the amount is not mistaken for an account number, however long it is', () => {
  /* The one field here that is legitimately a long run of digits. R1.2m in cents is nine of them,
     which is exactly the shape the check above is looking for. */
  const answer = advise('w-big', { amountCents: 123_456_789 });
  assert.ok(!isRefusal(answer));
  assert.equal(answer.payload['amountCents'], 123_456_789);
 });

 test('to verify a real bank account, always', () => {
  const answer = verifyAccount({ subject: 'N-205', at });
  assert.ok(isRefusal(answer));
  assert.equal(answer.refused, sentence(/Verify a real bank account/));
 });

 test('to reverse a payout that never left, which is all of them', () => {
  for (const week of ['w-1', 'w-2', 'w-3']) {
   const answer = reversePayout({ subject: week, at });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, sentence(/Reverse a payout that never left/));
  }
 });

 test('an advice with no party or no amount is a caller bug rather than a bank answer', () => {
  assert.throws(() => bankPayouts.produce({ subject: 'w-1', at, detail: { amountCents: 1 } }), /vetted party/);
  assert.throws(() => bankPayouts.produce({ subject: 'w-1', at, detail: { partyId: 'N-205' } }), /whole cents/);
  assert.throws(() => bankPayouts.produce({ subject: 'w-1', at, detail: { partyId: 'N-205', amountCents: 12.5 } }), /whole cents/);
 });
});
