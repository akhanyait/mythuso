/**
 * The simulated delivery channel and the sign-in office, held to their own refusals.
 *
 * Six sentences across two capabilities, and each of them is exercised here rather than admired in
 * a JSON file. The three that matter most are the ones a demonstration would be tempted to sand
 * off: a message that does not arrive, a code that is not shown when it did not arrive, and a
 * process that has forgotten every challenge it ever issued because it was restarted.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal, type SimulatedEvent, type SimulatedRefusal } from '../src/simulation/index.ts';
import {
 CODE_LENGTH, CODE_LIFE_SECONDS, carriedMessage, codeFor, forgetEverything, messageChannel, send,
 signInCodes, verify, type Verified
} from '../src/simulation/suppliers.ts';
import capabilities from '../../../packages/catalog/capabilities.json' with { type: 'json' };

const refusesOf = (id: string) =>
 (capabilities.capabilities.find(c => c.id === id) as { simulation: { refuses: string[] } }).simulation.refuses;
const sentence = (id: string, matching: RegExp) => refusesOf(id).find(s => matching.test(s))!;

const at = new Date('2026-09-10T14:32:07+02:00');
/* `verify` answers with a refusal or with a verification, which is a narrower pair than a
   simulator's answer — so the registry's own guard, typed for the latter, does not fit it. */
const refused = (answer: Verified | SimulatedRefusal): answer is SimulatedRefusal => 'refused' in answer;
const event = (answer: ReturnType<typeof send>): SimulatedEvent => {
 assert.equal(isRefusal(answer), false, isRefusal(answer) ? `expected a delivery, got a refusal: ${answer.refused}` : '');
 return answer as SimulatedEvent;
};

describe('the channel', () => {
 test('carries a message and reports what happened to it', () => {
  forgetEverything();
  const receipt = event(send({ subject: 'first', at, detail: { kind: 'family-invitation' } }));
  assert.equal(receipt.capability, 'messaging');
  assert.match(receipt.payload['messageId'] as string, /^MSG-\d{6}$/);
  assert.ok(['delivered', 'failed'].includes(receipt.payload['status'] as string));
  assert.equal(receipt.payload['at'], at.toISOString());
 });

 test('will not be handed somewhere to reach — by field name or by the shape of a number', () => {
  forgetEverything();
  const byName = send({ subject: 'x', at, detail: { msisdn: 'somewhere' } });
  const byValue = send({ subject: 'y', at, detail: { note: 'ring 082 123 4567 if it fails' } });
  const asSubject = send({ subject: '+27821234567', at });
  for (const answer of [byName, byValue, asSubject]) {
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, sentence('messaging', /address outside this machine/));
  }
 });

 test('will not report a delivery it did not simulate', () => {
  forgetEverything();
  const answer = messageChannel.produce({ subject: 'MSG-000000', at });
  assert.ok(isRefusal(answer));
  assert.equal(answer.refused, sentence('messaging', /did not simulate/));
 });

 test('will not carry the same message twice, because a simulated failure is a chosen failure', () => {
  forgetEverything();
  event(send({ subject: 'once', at }));
  const again = send({ subject: 'once', at });
  assert.ok(isRefusal(again));
  assert.equal(again.refused, sentence('messaging', /^Retry/));
 });

 test('a failure is a state that actually happens, and it says why in words', () => {
  forgetEverything();
  /* The rate is one in eight, so a run of subjects finds one. If this ever stops finding a failure
     the simulator has become a fixture that only succeeds, which is the whole thing it is not. */
  let failed: SimulatedEvent | null = null;
  for (let i = 0; i < 200 && !failed; i += 1) {
   const answer = send({ subject: `sweep-${i}`, at });
   if (!isRefusal(answer) && answer.payload['status'] === 'failed') failed = answer;
  }
  assert.ok(failed, 'two hundred simulated sends and not one of them failed');
  const why = failed.payload['failureReason'] as string;
  assert.match(why, /^[A-Z].*\.$/, 'a failure reason is a sentence a person reads, not a provider code');
  assert.doesNotMatch(why, /\b\d{3,}\b/, 'a failure reason assembled from a numeric code is a sentence written by a lookup table');
 });

 test('a delivered message carries no failure reason, and a failed one carries no code', () => {
  forgetEverything();
  for (let i = 0; i < 40; i += 1) {
   const answer = send({ subject: `both-${i}`, at });
   if (isRefusal(answer)) continue;
   const status = answer.payload['status'];
   assert.equal('failureReason' in answer.payload, status === 'failed');
   assert.equal(carriedMessage(answer.payload['messageId'] as string)?.status, status);
  }
 });
});

describe('the sign-in office', () => {
 test('issues a code, and shows it only because it never left this machine', () => {
  forgetEverything();
  let issued: SimulatedEvent | null = null;
  for (let i = 0; i < 50 && !issued; i += 1) {
   const answer = signInCodes.produce({ subject: `ok-${i}`, at });
   if (!isRefusal(answer) && answer.payload['status'] === 'delivered') issued = answer;
  }
  assert.ok(issued);
  assert.equal(issued.capability, 'accounts');
  const code = codeFor(issued.reference)!;
  assert.match(code, new RegExp(`^\\d{${CODE_LENGTH}}$`));
  /* The credential is never in the payload. The feed refuses it at the door and the reason is that
     a delivery log carrying it would be a list of live sign-in codes. */
  assert.equal(Object.values(issued.payload).includes(code), false);
 });

 test('will not be told a handset', () => {
  forgetEverything();
  const answer = signInCodes.produce({ subject: '0821234567', at });
  assert.ok(isRefusal(answer));
  assert.equal(answer.refused, sentence('accounts', /handset/));
 });

 test('a code that did not arrive is not shown, because the person does not have it', () => {
  forgetEverything();
  let lost: SimulatedEvent | null = null;
  for (let i = 0; i < 200 && !lost; i += 1) {
   const answer = signInCodes.produce({ subject: `lost-${i}`, at });
   if (!isRefusal(answer) && answer.payload['status'] === 'failed') lost = answer;
  }
  assert.ok(lost, 'two hundred simulated sign-in codes and every one of them arrived');
  assert.equal(codeFor(lost.reference), null);
 });

 test('will not accept a code it did not itself produce', () => {
  forgetEverything();
  const issued = event(signInCodes.produce({ subject: 'verify-me', at })) as SimulatedEvent;
  const code = codeFor(issued.reference);
  const wrong = verify(issued.reference, code === '000000' ? '111111' : '000000', at);
  assert.ok(refused(wrong));
  assert.equal(wrong.refused, sentence('accounts', /did not itself produce/));
 });

 test('will not survive a restart, and says that rather than saying the code is wrong', () => {
  forgetEverything();
  const issued = event(signInCodes.produce({ subject: 'restart-me', at })) as SimulatedEvent;
  const code = codeFor(issued.reference);
  /* Everything this process remembers, gone — which is what a restart is. The challenge is not
     wrong, it is not expired and the person may well be holding the right code; there is simply
     nobody left who knows. Telling them the code does not match would be a small lie. */
  forgetEverything();
  const answer = verify(issued.reference, code ?? '000000', at);
  assert.ok(refused(answer));
  assert.equal(answer.refused, sentence('accounts', /restart/));
 });

 test('a code expires, and an expired one is not a code this office produced', () => {
  forgetEverything();
  let issued: SimulatedEvent | null = null;
  for (let i = 0; i < 50 && !issued; i += 1) {
   const answer = signInCodes.produce({ subject: `expiry-${i}`, at });
   if (!isRefusal(answer) && answer.payload['status'] === 'delivered') issued = answer;
  }
  assert.ok(issued);
  const code = codeFor(issued.reference)!;
  const justInside = new Date(at.getTime() + (CODE_LIFE_SECONDS - 1) * 1000);
  const justOutside = new Date(at.getTime() + (CODE_LIFE_SECONDS + 1) * 1000);
  assert.deepEqual(verify(issued.reference, code, justInside), { verified: true, challenge: issued.reference, at: justInside.toISOString() });
  const late = verify(issued.reference, code, justOutside);
  assert.ok(refused(late));
  assert.equal(late.refused, sentence('accounts', /did not itself produce/));
 });

 test('the same attempt produces the same code on any machine', () => {
  forgetEverything();
  const first = signInCodes.produce({ subject: 'repeatable', at });
  const firstCode = isRefusal(first) ? null : codeFor(first.reference);
  forgetEverything();
  const again = signInCodes.produce({ subject: 'repeatable', at });
  const againCode = isRefusal(again) ? null : codeFor(again.reference);
  assert.deepEqual(first, again);
  assert.equal(firstCode, againCode);
 });
});
