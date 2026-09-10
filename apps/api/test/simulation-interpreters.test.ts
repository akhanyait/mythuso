/**
 * The simulated interpreter roster.
 *
 * Three of these tests are the three sentences the capability refuses, and the fourth kind is the
 * one that keeps them honest: a roster that could only ever say no would prove nothing about a
 * product that has to be able to book somebody.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import interpreting from '../../../packages/catalog/interpreting.json' with { type: 'json' };
import { canonical, decide, feedById } from '../src/feeds/index.ts';
import { isRefusal, type SimulatorAnswer } from '../src/simulation/index.ts';
import { INTERPRETERS, MODE_IDS, cancelHold, freeHours, holdOrDispatch } from '../src/simulation/interpreters.ts';

const FEED = feedById('interpreter-roster')!;
const AT = new Date('2026-09-10T09:00:00Z');

function payloadOf(answer: SimulatorAnswer): Record<string, unknown> {
 assert.ok(!isRefusal(answer), 'expected an event, got a refusal');
 return answer.payload;
}

describe('the simulated interpreter roster', () => {
 test('stands in front of the interpreter-roster seam for the interpreting capability', () => {
  assert.equal(INTERPRETERS.feed, 'interpreter-roster');
  assert.equal(INTERPRETERS.capability, 'interpreting');
  assert.equal(INTERPRETERS.supplier, 'A simulated interpreter roster, in process.');
 });

 test('produces a shift the seam would recognise, for every mode that has anybody free', () => {
  for (const mode of MODE_IDS) {
   if (freeHours(mode, AT).length === 0) continue;
   const answer = INTERPRETERS.produce({ subject: 'V-1001', at: AT, detail: { mode } });
   const refusal = decide(FEED, payloadOf(answer));
   assert.equal(refusal.kind, 'not-connected', `${mode}: refused as ${refusal.kind}`);
  }
 });

 test('carries none of the three fields that seam never accepts, under any spelling', () => {
  const forbidden = new Set(FEED.neverAccepts.flatMap(never => [never.field, ...never.also]).map(canonical));
  const payload = payloadOf(INTERPRETERS.produce({ subject: 'V-1001', at: AT }));
  for (const key of Object.keys(payload)) assert.ok(!forbidden.has(canonical(key)), `${key} is a field the interpreter seam refuses`);
 });

 test('only ever offers somebody who is on the vetted roster', () => {
  const vetted = new Set(interpreting.roster.map(person => person.id));
  for (const mode of MODE_IDS) {
   if (freeHours(mode, AT).length === 0) continue;
   for (const subject of ['V-1', 'V-2', 'V-3', 'V-4', 'V-5']) {
    assert.ok(vetted.has(String(payloadOf(INTERPRETERS.produce({ subject, at: AT, detail: { mode } })).partyId)));
   }
  }
 });

 test('offers the same interpreter at the same hour for the same visit, on any machine', () => {
  assert.deepEqual(
   INTERPRETERS.produce({ subject: 'V-1001', at: AT }),
   INTERPRETERS.produce({ subject: 'V-1001', at: AT })
  );
 });

 test('states an area even for an interpreter joining on video, because "anywhere" is a claim', () => {
  const video = freeHours('video-remote', AT);
  assert.ok(video.length > 0);
  const payload = payloadOf(INTERPRETERS.produce({ subject: 'V-2002', at: AT, detail: { mode: 'video-remote' } }));
  assert.ok(String(payload.area).length > 0);
 });

 describe('refuses', () => {
  test('a family member offered as the interpreter', () => {
   const answer = INTERPRETERS.produce({
    subject: 'V-1001', at: AT,
    detail: { offer: { partyId: 'the patient’s daughter', relationshipToPatient: 'daughter' } }
   });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Offer a family member or a child.');
  });

  test('a child offered as the interpreter — at no age, so no threshold is consulted', () => {
   for (const ageYears of [7, 12, 16, 17, 19, 40]) {
    const answer = INTERPRETERS.produce({ subject: 'V-1001', at: AT, detail: { offer: { partyId: 'I-701', ageYears } } });
    assert.ok(isRefusal(answer), `an offer describing somebody's age was accepted at ${ageYears}`);
    assert.equal(answer.refused, 'Offer a family member or a child.');
   }
  });

  test('anybody at all who is not on the vetted roster', () => {
   const answer = INTERPRETERS.produce({ subject: 'V-1001', at: AT, detail: { offer: { partyId: 'I-999' } } });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Offer a family member or a child.');
  });

  test('a charge for cancelling a held visit', () => {
   const answer = cancelHold('V-1001', { charge: 150 }, AT);
   assert.ok('refused' in answer);
   assert.equal(answer.refused, 'Charge a patient for a cancelled accommodation.');
  });

  test('dispatching a visit that needs an interpreter and has none', () => {
   /* Tactile. The one interpreter on this roster who does it has nothing free, and the contract is
      emphatic that this is the state the honest-wait rule exists for. */
   assert.equal(freeHours('tactile', AT).length, 0);
   const decision = holdOrDispatch('V-3003', 'tactile', AT);
   assert.equal(decision.dispatched, false);
   assert.ok(!decision.dispatched);
   assert.equal(decision.refused, 'Dispatch a visit that needs an interpreter and has none.');
   assert.equal(decision.status, interpreting.hold.status);
   assert.equal(decision.sentence, interpreting.hold.sentence);
  });
 });

 test('cancels a held visit for nothing, recorded against MyThuso rather than the patient', () => {
  const cancellation = cancelHold('V-3003', {}, AT);
  assert.ok(!('refused' in cancellation));
  assert.equal(cancellation.fee, 0);
  assert.equal(cancellation.attributedTo, 'MyThuso');
  assert.equal(cancellation.keepsTheRequirement, interpreting.cancellation.keepsTheRequirement);
 });

 test('dispatches when somebody is actually free, or the refusals above prove nothing', () => {
  const decision = holdOrDispatch('V-4004', 'video-remote', AT);
  assert.equal(decision.dispatched, true);
  assert.ok(decision.dispatched);
  assert.match(decision.at, /\+02:00$/);
 });
});
