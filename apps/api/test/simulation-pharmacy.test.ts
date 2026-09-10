/**
 * The simulated pharmacy network.
 *
 * What is worth testing about a fixture is not that it produces something. It is that it produces
 * the *shape the seam declares* — asked of the seam rather than of a reviewer — and that it refuses
 * the three things section 22F and packages/catalog/dispensing.json say a pharmacy may not do.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import dispensing from '../../../packages/catalog/dispensing.json' with { type: 'json' };
import { canonical, decide, feedById } from '../src/feeds/index.ts';
import { isRefusal, type SimulatorAnswer } from '../src/simulation/index.ts';
import { PHARMACY, STEPS, SAMPLE_PRESCRIPTION, handover } from '../src/simulation/pharmacy.ts';
import { refusalSaying } from '../src/simulation/contract.ts';

const FEED = feedById('pharmacy-order')!;

function payloadOf(answer: SimulatorAnswer): Record<string, unknown> {
 assert.ok(!isRefusal(answer), 'expected an event, got a refusal');
 return answer.payload;
}

/** The payload, through the door it stands in front of. Only `not-connected` is a pass. */
function assertTheSeamWouldRecogniseIt(answer: SimulatorAnswer) {
 const refusal = decide(FEED, payloadOf(answer));
 assert.equal(refusal.kind, 'not-connected', `refused as ${refusal.kind}: forbidden=${refusal.forbidden?.field}, unknown=${refusal.unknownFields}, missing=${refusal.missing}, wrongType=${refusal.wrongType}`);
}

describe('the simulated pharmacy network', () => {
 test('stands in front of the pharmacy-order seam for the dispensing capability', () => {
  assert.equal(PHARMACY.feed, 'pharmacy-order');
  assert.equal(PHARMACY.capability, 'dispensing');
  assert.equal(PHARMACY.supplier, 'A simulated pharmacy network, in process.');
 });

 test('walks the whole chain of custody the contract names, in its order', () => {
  const chain = handover(SAMPLE_PRESCRIPTION, new Date('2026-09-10T09:00:00Z'));
  assert.deepEqual(chain.map(answer => payloadOf(answer).state), [...STEPS]);
  for (const step of chain) assertTheSeamWouldRecogniseIt(step);
 });

 test('carries none of the four fields that seam never accepts, under any spelling', () => {
  const forbidden = new Set(FEED.neverAccepts.flatMap(never => [never.field, ...never.also]).map(canonical));
  for (const step of handover(SAMPLE_PRESCRIPTION)) {
   const payload = payloadOf(step);
   for (const key of Object.keys(payload)) assert.ok(!forbidden.has(canonical(key)), `${key} is a field the pharmacy seam refuses`);
  }
 });

 test('produces the same handover for the same prescription, on any machine', () => {
  const at = new Date('2026-09-10T09:00:00Z');
  assert.deepEqual(handover('RX-TEST', at), handover('RX-TEST', at));
 });

 test('names the moment with the offset South Africa actually has', () => {
  const [first] = handover(SAMPLE_PRESCRIPTION, new Date('2026-09-10T09:00:00Z'));
  assert.ok(first);
  assert.match(String(payloadOf(first).at), /\+02:00$/);
 });

 describe('refuses', () => {
  test('a substitution on a ground the Act does not permit one on', () => {
   /* Levothyroxine: narrow therapeutic index, and the patient's thyroid function was brought right
      on this exact product. Class `must-not`, so nothing on this pathway may change it. */
   const answer = PHARMACY.produce({
    subject: SAMPLE_PRESCRIPTION,
    detail: { state: 'decided', itemId: 'levothyroxine', dispensedAs: 'Euthyrox 100 µg tablets' }
   });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, refusalSaying('dispensing', /outside the classes/i));
   assert.equal(answer.refused, 'Substitute outside the classes the Act permits.');
  });

  test('a swap that changes the molecule', () => {
   const answer = PHARMACY.produce({
    subject: SAMPLE_PRESCRIPTION,
    detail: { state: 'decided', itemId: 'amlodipine', dispensedAs: 'Felodipine 5 mg tablets (Aspen)' }
   });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Change a molecule or a strength.');
  });

  test('a swap that changes the strength', () => {
   const answer = PHARMACY.produce({
    subject: SAMPLE_PRESCRIPTION,
    detail: { state: 'decided', itemId: 'amlodipine', dispensedAs: 'Amlodipine 10 mg tablets (Aspen)' }
   });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Change a molecule or a strength.');
  });

  test('any step at all with no pharmacist registration on it', () => {
   for (const state of STEPS) {
    const answer = PHARMACY.produce({ subject: SAMPLE_PRESCRIPTION, detail: { state, pharmacistRegistration: null } });
    assert.ok(isRefusal(answer), `${state} was produced with nobody's registration on it`);
    assert.equal(answer.refused, "Dispense without a simulated pharmacist's registration.");
   }
  });
 });

 test('lets through the substitution the contract itself records, on its own ground', () => {
  /* Hydrochlorothiazide out of stock nationally: same molecule, same strength, pharmacist's
     judgement, prescriber told. This is the case that must keep working, or the refusals above are
     a simulator that can only say no. */
  const answer = PHARMACY.produce({ subject: SAMPLE_PRESCRIPTION, detail: { state: 'decided', itemId: 'hydrochlorothiazide' } });
  assertTheSeamWouldRecogniseIt(answer);
  const payload = payloadOf(answer);
  assert.equal(payload.substitutionGround, 'supply-failure');
  assert.equal(payload.pharmacistRegistration, dispensing.prescription.pharmacist.registration);
 });

 test('records no substitution ground for an item that was dispensed as written', () => {
  for (const id of ['metformin', 'levothyroxine', 'insulin-glargine']) {
   const answer = PHARMACY.produce({ subject: SAMPLE_PRESCRIPTION, detail: { state: 'decided', itemId: id } });
   assert.equal(payloadOf(answer).substitutionGround, undefined, `${id} was recorded as a substitution and it was not one`);
  }
 });
});
