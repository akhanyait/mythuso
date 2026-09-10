/**
 * The simulated acknowledgement channel.
 *
 * The three refusals in packages/catalog/capabilities.json have a test each, and they are the point
 * of this file rather than a section of it. 10177, 112 and 10111 reach real people. A person on the
 * emergency screen may be about to need an ambulance, and a convincing acknowledgement is the thing
 * that would keep them looking at a phone instead of dialling.
 *
 * Everything below is written so that it fails if somebody makes this simulator more helpful.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import sos from '../../../packages/catalog/sos.json' with { type: 'json' };
import { canonical, decide, feedById } from '../src/feeds/index.ts';
import { isRefusal, type SimulatorAnswer } from '../src/simulation/index.ts';
import { CLAIMS_AN_AMBULANCE, EMERGENCY, NOTICE, PRODUCIBLE_STATES, REAL_NUMBERS, acknowledge } from '../src/simulation/emergency.ts';

const FEED = feedById('emergency-acknowledgement')!;
const AT = new Date('2026-09-10T09:00:00Z');
/** What a screen has already put in front of the person. Nothing is answered without it. */
const SHOWN = { numbersShown: [...REAL_NUMBERS], numbersShownAt: new Date('2026-09-10T08:59:00Z') };

function payloadOf(answer: SimulatorAnswer): Record<string, unknown> {
 assert.ok(!isRefusal(answer), 'expected an event, got a refusal');
 return answer.payload;
}

describe('the simulated acknowledgement channel', () => {
 test('stands in front of the emergency-acknowledgement seam for the emergency capability', () => {
  assert.equal(EMERGENCY.feed, 'emergency-acknowledgement');
  assert.equal(EMERGENCY.capability, 'emergency');
  assert.equal(EMERGENCY.supplier, 'A simulated acknowledgement channel, in process.');
 });

 test('reads the three real numbers out of the contract rather than holding its own', () => {
  assert.deepEqual([...REAL_NUMBERS], ['10177', '112', '10111']);
  assert.deepEqual([...REAL_NUMBERS], sos.emergency.numbers.map(number => number.number));
 });

 describe('will not replace or delay the emergency numbers on any screen', () => {
  test('refuses an acknowledgement timed before the numbers reached the screen', () => {
   const answer = EMERGENCY.produce({
    subject: 'A-1', at: new Date('2026-09-10T08:00:00Z'),
    detail: { numbersShown: [...REAL_NUMBERS], numbersShownAt: new Date('2026-09-10T08:59:00Z') }
   });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Replace or delay the emergency numbers on any screen.');
  });

  test('refuses to put any number at all in a payload a screen could print', () => {
   /* The way a real number gets replaced is not somebody deleting it. It is a plausible-looking
      number appearing next to it. So a partner id that reads like one is turned away. */
   const answer = EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { ...SHOWN, partnerId: 'Netcare 911 · 082911' } });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Replace or delay the emergency numbers on any screen.');
  });

  test('carries no digit run in anything it composed, on any state it can produce', () => {
   for (const state of PRODUCIBLE_STATES) {
    const payload = payloadOf(EMERGENCY.produce({ subject: `A-${state}`, at: AT, detail: { ...SHOWN, state } }));
    for (const [field, value] of Object.entries(payload)) {
     /* The alert reference is the product's own and the timestamp is a moment. Everything else in
        here was made up by the simulator, and a number it made up is a number a screen may print. */
     if (field === 'at' || field === 'alertReference' || typeof value !== 'string') continue;
     assert.doesNotMatch(value, /\d{3,}/, `${state}.${field} carries a number: ${value}`);
    }
   }
  });

  test('refuses to echo a real emergency number back, in any field, from anywhere', () => {
   for (const number of REAL_NUMBERS) {
    const echoed = EMERGENCY.produce({ subject: `SOS-${number}`, at: AT, detail: { ...SHOWN } });
    assert.ok(isRefusal(echoed), `an alert reference carrying ${number} was accepted`);
    assert.equal(echoed.refused, 'Replace or delay the emergency numbers on any screen.');
   }
  });

  test('accepts an ordinary MyThuso alert reference, which has digits in it', () => {
   /* The second rule is about strings this simulator makes up, not about the product's own
      references. A guard that refused SOS-000123 would be a guard nobody could use. */
   const payload = payloadOf(EMERGENCY.produce({ subject: 'SOS-000123', at: AT, detail: { ...SHOWN } }));
   assert.equal(payload.alertReference, 'SOS-000123');
  });

  test('hands the numbers back above the answer, with the notice that names two of them', () => {
   const answered = acknowledge('A-1', { ...SHOWN }, AT);
   assert.deepEqual(answered.numbers.map(number => number.number), [...REAL_NUMBERS]);
   assert.equal(answered.notice, NOTICE);
   for (const number of ['10177', '112']) assert.ok(answered.notice.includes(number), `the notice no longer names ${number}`);
   assert.ok(!isRefusal(answered.answer));
   /* The order of the object's own keys, because a template that iterates them renders the
      ambulance number before anything a partner said. */
   assert.deepEqual(Object.keys(answered), ['numbers', 'notice', 'answer']);
  });
 });

 describe('will not claim an ambulance is coming', () => {
  test('refuses en-route and arrived, the two states that assert a vehicle in the world', () => {
   for (const state of CLAIMS_AN_AMBULANCE) {
    const answer = EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { ...SHOWN, state } });
    assert.ok(isRefusal(answer), `${state} was produced`);
    assert.equal(answer.refused, 'Claim an ambulance is coming.');
   }
  });

  test('carries no free text a caller composed — a stand-down says the contract\'s own words', () => {
   const payload = payloadOf(EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { ...SHOWN, state: 'stood-down', standDownReason: 'gone-to-hospital' } }));
   assert.equal(payload.reason, sos.standDown.reasons.find(reason => reason.id === 'gone-to-hospital')!.label);
  });

  test('says nothing at all where the contract wrote nothing', () => {
   const payload = payloadOf(EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { ...SHOWN, state: 'accepted' } }));
   assert.equal(payload.reason, undefined);
  });
 });

 describe('will not answer at all until the real numbers have been shown first', () => {
  test('refuses when nothing was shown', () => {
   const answer = EMERGENCY.produce({ subject: 'A-1', at: AT });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Answer at all until the real numbers have been shown first.');
  });

  test('refuses when any one of the three is missing', () => {
   for (const missing of REAL_NUMBERS) {
    const answer = EMERGENCY.produce({
     subject: 'A-1', at: AT,
     detail: { numbersShown: REAL_NUMBERS.filter(number => number !== missing) }
    });
    assert.ok(isRefusal(answer), `answered with ${missing} not yet on the screen`);
    assert.equal(answer.refused, 'Answer at all until the real numbers have been shown first.');
   }
  });

  test('refuses before it decides anything else — an impossible state is still a refusal about the numbers', () => {
   /* If the state were read first, this would throw about `en-route`. It refuses about the numbers
      instead, which is the ordering that matters: nothing is worked out before they are shown. */
   const answer = EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { state: 'en-route' } });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Answer at all until the real numbers have been shown first.');
  });

  test('answers once all three are on the screen', () => {
   const payload = payloadOf(EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { ...SHOWN } }));
   assert.equal(payload.state, 'accepted');
   const refusal = decide(FEED, payload);
   assert.equal(refusal.kind, 'not-connected');
  });
 });

 test('carries none of the four fields that seam never accepts, under any spelling', () => {
  const forbidden = new Set(FEED.neverAccepts.flatMap(never => [never.field, ...never.also]).map(canonical));
  const payload = payloadOf(EMERGENCY.produce({ subject: 'A-1', at: AT, detail: { ...SHOWN } }));
  for (const key of Object.keys(payload)) assert.ok(!forbidden.has(canonical(key)), `${key} is a field the emergency seam refuses`);
 });

 test('answers the same alert the same way, on any machine', () => {
  assert.deepEqual(
   EMERGENCY.produce({ subject: 'A-77', at: AT, detail: { ...SHOWN } }),
   EMERGENCY.produce({ subject: 'A-77', at: AT, detail: { ...SHOWN } })
  );
 });
});
