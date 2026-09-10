/**
 * Simulated answers from the thirteen authorities.
 *
 * The word this simulator produces is `confirmed`, which makes it the one whose tests are about
 * what it will not say. Three things are asserted and each is a different way the same defect
 * arrives: an answer invented about somebody nobody has vetted, a confirmation handed out for a
 * check that ran out last night, and an answer asked to be the thing that grants a capability.
 *
 * The fourth, which is not a refusal, is the one apps/api/src/vetting/authority.ts spends a
 * paragraph on: `unavailable` and `confirmed` are different values and no caller may collapse them.
 * A simulator where every enquiry succeeded would never have taught anybody that.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vetting from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { AUTHORITY_OUTCOMES } from '../src/vetting/authority.ts';
import { canonical, decide, feedById } from '../src/feeds/index.ts';
import { forbiddenIndex } from '../src/feeds/contract.ts';
import { refusalsOf } from '../src/simulation/contract.ts';
import { isRefusal, type SimulatedEvent } from '../src/simulation/index.ts';
import { SIMULATED_NURSES, answersFor, credentialAnswer, enquiryReference, outcomeFor, nurseById } from '../src/simulation/care.ts';

const FEED = feedById('credential-answer')!;
const FORBIDDEN = forbiddenIndex(FEED);
const NOW = new Date();
const CHECKS = vetting.roles.find(role => role.id === 'nurse')!.checks;

const answer = (subject: string, detail: Record<string, unknown>) => credentialAnswer.produce({ subject, at: NOW, detail });
const event = (subject: string, checkId: string): SimulatedEvent => {
 const produced = answer(subject, { checkId });
 assert.ok(!isRefusal(produced), `${subject}/${checkId} was refused`);
 return produced as SimulatedEvent;
};

describe('an answer is the shape an authority would send', () => {
 test('the ingestion boundary finds nothing wrong with it', () => {
  const refusal = decide(FEED, event('N-205', 'sanc-registration').payload);
  assert.equal(refusal.kind, 'not-connected');
  assert.equal(refusal.forbidden, null);
  assert.equal(refusal.unknownFields, 0);
  assert.deepEqual(refusal.missing, []);
  assert.deepEqual(refusal.wrongType, []);
 });

 test('no answer echoes back an identity number, a biometric or a list of offences', () => {
  for (const nurse of SIMULATED_NURSES) {
   for (const produced of answersFor(nurse.id, NOW).answered) {
    for (const key of Object.keys(produced.payload)) {
     assert.ok(!FORBIDDEN.has(canonical(key)), `${nurse.id} answered with "${key}"`);
    }
    /* And not in the words either. The detail is what a person reads, and a provider stack trace or
       a credential value arriving in it would undo the whole arrangement in the half nobody reads. */
    assert.ok(!/\d{13}/.test(String(produced.payload.detail)), 'a thirteen-digit number in the sentence a person reads');
   }
  }
 });

 test('the outcome is one of the six the adapter interface declares and never a seventh', () => {
  for (const nurse of SIMULATED_NURSES) {
   for (const produced of answersFor(nurse.id, NOW).answered) {
    assert.ok(AUTHORITY_OUTCOMES.includes(produced.payload.outcome as never), `${produced.payload.outcome}`);
   }
  }
 });

 test('an expiry is stated only where the register actually holds one', () => {
  const lapsed = event('N-204', 'police-clearance');
  assert.ok(typeof lapsed.payload.expiresOn === 'string', 'the roster writes this one down');
  const silent = event('N-205', 'identity');
  assert.equal(silent.payload.expiresOn, undefined, 'an authority usually states no date, and inventing one is worse than none');
 });

 test('the enquiry reference identifies the question and is the same question twice', () => {
  assert.equal(
   enquiryReference('sanc', 'N-205', 'sanc-registration'),
   enquiryReference('sanc', 'N-205', 'sanc-registration')
  );
  assert.notEqual(
   enquiryReference('sanc', 'N-205', 'sanc-registration'),
   enquiryReference('sanc', 'N-206', 'sanc-registration')
  );
  assert.match(event('N-205', 'sanc-registration').payload.reference as string, /^sanc:[0-9a-f]{16}$/);
 });
});

describe('a lapsed check is never cleared', () => {
 test('the outcome for a lapsed clearance is expired and not confirmed', () => {
  assert.equal(outcomeFor(nurseById('N-204')!, 'police-clearance', NOW), 'expired');
 });

 test('no answer anywhere in the register confirms a check the gate resolves as lapsed', () => {
  for (const nurse of SIMULATED_NURSES) {
   for (const check of CHECKS) {
    const outcome = outcomeFor(nurse, check.id, NOW);
    if (outcome !== 'confirmed') continue;
    const produced = answer(nurse.id, { checkId: check.id, confirm: true });
    assert.ok(!isRefusal(produced), `${nurse.id}/${check.id} confirmed and then refused a confirmation`);
   }
  }
 });

 test('asking for a confirmation of a lapsed check is refused in the capability’s own words', () => {
  const produced = answer('N-204', { checkId: 'police-clearance', confirm: true });
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('lapsed'));
 });

 test('an unreachable register answers unavailable rather than being refused, and is never agreement', () => {
  const unreachable = SIMULATED_NURSES.flatMap(nurse =>
   CHECKS.map(check => ({ nurse, check })).filter(pair => outcomeFor(pair.nurse, pair.check.id, NOW) === 'unavailable'));
  assert.ok(unreachable.length > 0, 'a simulator where every register answers teaches the product that they always do');
  for (const { nurse, check } of unreachable) {
   const produced = answer(nurse.id, { checkId: check.id, confirm: true });
   assert.ok(!isRefusal(produced));
   assert.equal((produced as SimulatedEvent).payload.outcome, 'unavailable');
   assert.notEqual((produced as SimulatedEvent).payload.outcome, 'confirmed');
  }
 });
});

describe('every refusal the capability declares is reachable, and none is typed here', () => {
 test('all three fire', () => {
  const fired = new Set<string>();
  for (const detail of [
   { checkId: 'sanc-registration' },                                  // N-999: nobody
   { checkId: 'not-a-check' },                                        // a check nobody has
   { checkId: 'police-clearance', confirm: true },                    // a lapsed one, confirmed
   { checkId: 'sanc-registration', grants: 'take-visit' }             // asked to be the grant
  ]) {
   for (const subject of ['N-999', 'N-204']) {
    const produced = answer(subject, detail);
    if (isRefusal(produced)) fired.add(produced.refused);
   }
  }
  assert.deepEqual([...fired].sort(), [...refusalsOf('credential-verification')].sort());
 });

 test('a request that names the capability it is about to open is refused before anything is looked up', () => {
  const produced = answer('N-205', { checkId: 'sanc-registration', grants: 'take-visit' });
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('grants a capability'));
 });

 test('nothing exported here returns a boolean about a person', () => {
  /* The gate decides, from stored evidence, over the whole role. A function in this module that
     answered "is she cleared" would be the shortcut every screen took. */
  assert.equal(typeof outcomeFor(nurseById('N-205')!, 'sanc-registration', NOW), 'string');
 });
});
