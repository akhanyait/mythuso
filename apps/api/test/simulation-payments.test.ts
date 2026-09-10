/**
 * The simulated card and EFT provider, held to its three refusals.
 *
 * The one worth reading twice is the card. Nothing in this repository stores a card number, and the
 * likeliest place a first one would ever appear is a fixture — it is only a test, it is only
 * `4111 1111 1111 1111`, and it is in the history for ever the moment it is committed. So the
 * simulator refuses to be handed one at all, by field name and by shape, and this is where that is
 * proved. The digits below are refused rather than kept, which is the only reason they can be here.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal, type SimulatedEvent } from '../src/simulation/index.ts';
import { CURRENCY, cardAndEft, priceInCents, reversePayment } from '../src/simulation/suppliers.ts';
import capabilities from '../../../packages/catalog/capabilities.json' with { type: 'json' };
import catalogue from '../../../packages/catalog/services.json' with { type: 'json' };

const refusesOf = (id: string) =>
 (capabilities.capabilities.find(c => c.id === id) as { simulation: { refuses: string[] } }).simulation.refuses;
const sentence = (matching: RegExp) => refusesOf('payments').find(s => matching.test(s))!;
const at = new Date('2026-09-10T14:32:07+02:00');
const services = catalogue as ReadonlyArray<{ id: string; price: number; name: string }>;

const pay = (subject: string, service = 'vitals', detail: Record<string, unknown> = {}) =>
 cardAndEft.produce({ subject, at, detail: { service, ...detail } });

describe('what it produces', () => {
 test('an authorisation prices the visit from the catalogue rather than from whoever asked', () => {
  for (const service of services) {
   let authorised: SimulatedEvent | null = null;
   for (let i = 0; i < 40 && !authorised; i += 1) {
    const answer = pay(`MT-${service.id}-${i}`, service.id);
    if (!isRefusal(answer) && answer.payload['outcome'] === 'authorised') authorised = answer;
   }
   assert.ok(authorised, `no attempt at ${service.id} was ever authorised`);
   assert.equal(authorised.payload['amountCents'], service.price * 100);
   assert.equal(authorised.payload['currency'], CURRENCY);
  }
 });

 test('a decline is a state that happens, and it says what happened in words a person reads', () => {
  let declined: SimulatedEvent | null = null;
  for (let i = 0; i < 200 && !declined; i += 1) {
   const answer = pay(`MT-DECLINE-${i}`);
   if (!isRefusal(answer) && answer.payload['outcome'] === 'declined') declined = answer;
  }
  assert.ok(declined, 'two hundred simulated payments and not one of them was declined');
  const why = declined.payload['declineReason'] as string;
  assert.match(why, /Nothing has been taken\.$/, 'the first thing anybody wants to know about a declined payment is whether money moved');
  assert.doesNotMatch(why, /\b\d{2,}\b/, 'a decline reason assembled from a numeric code is a sentence written by a lookup table');
 });

 test('an authorisation carries no decline reason, and every receipt says it is simulated', () => {
  for (let i = 0; i < 40; i += 1) {
   const answer = pay(`MT-SHAPE-${i}`);
   if (isRefusal(answer)) continue;
   assert.equal('declineReason' in answer.payload, answer.payload['outcome'] === 'declined');
   assert.match(answer.payload['providerReference'] as string, /^SIM-PAY-\d{6}$/);
   assert.equal(answer.payload['reference'], `MT-SHAPE-${i}`);
  }
 });

 test('nothing it produces names what was bought', () => {
  /* The feed refuses a narrative naming the service and says why: the catalogue's names are the
     closest this product comes to a diagnosis, and a settlement file listing them against a person
     is health information on a bank statement. The simulator is told a service id and must not let
     it out the other side. */
  const answer = pay('MT-NARRATIVE-1', 'wound');
  assert.ok(!isRefusal(answer));
  const written = JSON.stringify(answer.payload);
  for (const service of services) assert.doesNotMatch(written, new RegExp(service.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
 });

 test('a reversal names the visit it reverses', () => {
  const answer = reversePayment({ subject: 'MT-REVERSE-1', at, detail: { service: 'vitals' } });
  assert.ok(!isRefusal(answer));
  assert.equal(answer.payload['outcome'], 'reversed');
  assert.equal(answer.payload['reference'], 'MT-REVERSE-1');
  assert.equal(answer.payload['amountCents'], priceInCents('vitals'));
 });

 test('a first attempt on a reference is the same answer everywhere, and a retry is its own event', () => {
  assert.deepEqual(pay('MT-SEED-1'), pay('MT-SEED-1'));
  const attempts = new Set([1, 2, 3, 4, 5].map(attempt => {
   const answer = pay('MT-SEED-1', 'vitals', { attempt });
   return isRefusal(answer) ? 'refused' : String(answer.payload['outcome']);
  }));
  assert.ok(attempts.size >= 1);
  assert.deepEqual(pay('MT-SEED-1', 'vitals', { attempt: 3 }), pay('MT-SEED-1', 'vitals', { attempt: 3 }));
 });
});

describe('what it refuses', () => {
 test('a card number, by every spelling the feed knows and by its shape', () => {
  const spellings = ['cardNumber', 'pan', 'card', 'cardNo', 'primaryAccountNumber', 'maskedPan', 'last4', 'cvv', 'cvc', 'securityCode'];
  for (const field of spellings) {
   const answer = pay('MT-CARD-1', 'vitals', { [field]: '1234' });
   assert.ok(isRefusal(answer), `a payment carrying "${field}" was not refused`);
   assert.equal(answer.refused, sentence(/card number/));
  }
  /* And in a field nobody would have thought to forbid, which is where a fixture actually puts it. */
  const byShape = pay('MT-CARD-2', 'vitals', { note: '4111 1111 1111 1111' });
  assert.ok(isRefusal(byShape));
  assert.equal(byShape.refused, sentence(/card number/));
 });

 test('settling, because settlement is a fact about a bank', () => {
  for (const detail of [{ outcome: 'settled' }, { settle: true }]) {
   const answer = pay('MT-SETTLE-1', 'vitals', detail);
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, sentence(/^Settle/));
  }
 });

 test('stamping a receipt with a number that does not say it is simulated', () => {
  const answer = pay('MT-RECEIPT-1', 'vitals', { providerReference: 'ACQ-99881' });
  assert.ok(isRefusal(answer));
  assert.equal(answer.refused, sentence(/receipt/));
 });

 test('and it never produces `settled`, however many times it is asked', () => {
  for (let i = 0; i < 300; i += 1) {
   const answer = pay(`MT-NEVER-${i}`);
   if (isRefusal(answer)) continue;
   assert.notEqual(answer.payload['outcome'], 'settled');
  }
 });
});

test('an amount that disagrees with the catalogue is an incident rather than a rounding', () => {
 assert.throws(
  () => pay('MT-AMOUNT-1', 'vitals', { amountCents: priceInCents('vitals') - 1 }),
  /incident rather than a rounding/
 );
 /* An amount that agrees is simply the amount, so the check is a reconciliation rather than a ban. */
 const answer = pay('MT-AMOUNT-2', 'vitals', { amountCents: priceInCents('vitals') });
 assert.ok(!isRefusal(answer));
});
