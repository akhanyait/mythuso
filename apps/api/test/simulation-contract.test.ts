/**
 * Every simulated supplier, held to the seam it stands in front of.
 *
 * The strongest thing that can be said about a simulator's payload is not that it looks right. It
 * is that the door it would arrive at refuses it for one reason and one reason only: that the
 * capability is not connected. `decide()` checks a forbidden field first, then the shape — a closed
 * schema, so an undeclared field is refused rather than ignored — and only then answers
 * `not-connected`. So a payload that comes back `not-connected` carries no field the feed forbids,
 * no field it does not declare, every field it requires, and each of them of the declared type.
 *
 * That is why this suite runs the payloads through the real refusal path rather than comparing them
 * against a copy of the schema written here. A simulator producing a shape its own seam would
 * refuse is teaching the product a shape no supplier will ever send, and the way that gets past a
 * test is a test that knows what it expects.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, decide, feedById, type Feed } from '../src/feeds/index.ts';
import { isRefusal, simulators, type SimulatedEvent, type SimulatedRefusal, type SimulatorAnswer } from '../src/simulation/index.ts';
import {
 bankPayouts, cardAndEft, messageChannel, reversePayment, reversePayout, send, signInCodes,
 verify, verifyAccount
} from '../src/simulation/suppliers.ts';
import capabilities from '../../../packages/catalog/capabilities.json' with { type: 'json' };

const declared = capabilities.capabilities as ReadonlyArray<{ id: string; state: string; simulation?: { refuses: string[] } }>;
const at = new Date('2026-09-10T14:32:07+02:00');

/* Everything the three suppliers can be asked for, in one list, so the checks below are about the
   seam rather than about whichever simulator somebody happened to remember. A sign-in code is asked
   for by subject rather than by number: the office refuses to be told a handset.

   Asked for once, at module load, and read from there by every test. Asking again inside each one
   would not repeat this run: a channel that has already carried a message refuses to carry it
   again, so the second call would answer with refusals and the payload checks would quietly stop
   having anything to check. */
const everything: SimulatorAnswer[] = [
 signInCodes.produce({ subject: 'one', at }),
 signInCodes.produce({ subject: 'two', at }),
 send({ subject: 'invitation-to-nomsa', at, detail: { kind: 'family-invitation' } }),
 send({ subject: 'reminder-for-tuesday', at, detail: { kind: 'visit-reminder' } }),
 cardAndEft.produce({ subject: 'MT-VITALS-0001', at, detail: { service: 'vitals' } }),
 cardAndEft.produce({ subject: 'MT-WOUND-0002', at, detail: { service: 'wound' } }),
 reversePayment({ subject: 'MT-VITALS-0001', at, detail: { service: 'vitals' } }),
 bankPayouts.produce({ subject: 'w-1', at, detail: { partyId: 'N-205', amountCents: 133_500, was: 'in-transit' } }),
 bankPayouts.produce({ subject: 'w-2', at, detail: { partyId: 'N-204', amountCents: 98_700, was: 'failed' } }),
 /* The three that only ever refuse, so a refusal is checked against the contract as hard as an
    event is checked against the schema. */
 verifyAccount({ subject: 'N-205', at }),
 reversePayout({ subject: 'w-3', at }),
 /* A challenge nobody here has heard of. `verify` has no branch that verifies one, which is why
    this can be read as a refusal without asking. */
 verify('SIM-NOTHING-000000', '000000', at) as SimulatedRefusal
];

describe('a simulated payload is refused at its own door for one reason only', () => {
 for (const answer of everything) {
  if (isRefusal(answer)) continue;
  const event = answer as SimulatedEvent;
  const feed = feedById(event.feed)!;
  test(`${event.feed}: ${JSON.stringify(event.payload['outcome'] ?? event.payload['status'] ?? '')} is well-formed`, () => {
   const refusal = decide(feed, event.payload);
   assert.equal(refusal.kind, 'not-connected',
    `the ${event.feed} simulator produced a payload its own seam refuses as ${refusal.kind}` +
    (refusal.forbidden ? ` — it carries ${refusal.forbidden.field}` : '') +
    (refusal.missing.length ? ` — missing ${refusal.missing.join(', ')}` : '') +
    (refusal.wrongType.length ? ` — wrong type on ${refusal.wrongType.join(', ')}` : '') +
    (refusal.unknownFields ? ` — ${refusal.unknownFields} field(s) the schema does not declare` : ''));
  });
 }
});

test('no payload carries a field the feed has ever named as one it must never be sent', () => {
 for (const answer of everything) {
  if (isRefusal(answer)) continue;
  const feed: Feed = feedById(answer.feed)!;
  const forbidden = new Set(feed.neverAccepts.flatMap(never => [never.field, ...never.also]).map(canonical));
  for (const key of Object.keys(answer.payload)) {
   assert.equal(forbidden.has(canonical(key)), false,
    `the ${answer.feed} simulator produced "${key}", which that feed refuses at the door. ${feed.neverAccepts.find(n => [n.field, ...n.also].map(canonical).includes(canonical(key)))?.refusal ?? ''}`);
  }
 }
});

test('a payment payload holds nothing that is or resembles a card number', () => {
 /* Said separately from the check above because it is the one the capability contract writes down
    as a refusal in its own right, and because the failure would be silent: a card number in a field
    the schema happens to declare as a string would pass a schema check and still be a card number. */
 for (const answer of everything) {
  if (isRefusal(answer) || answer.capability !== 'payments') continue;
  for (const value of Object.values(answer.payload)) {
   if (typeof value !== 'string') continue;
   assert.equal(/(?:\d[ -]?){13,19}/.test(value), false, `a payment payload carries ${JSON.stringify(value)}, which has the shape of a primary account number`);
  }
 }
});

test('every refusal is one of the sentences its own capability wrote down', () => {
 const refusals = everything.filter(isRefusal);
 assert.ok(refusals.length >= 3, 'the simulators refused nothing at all, which is a fixture with a label on it');
 for (const refusal of refusals) {
  const simulation = declared.find(capability => capability.id === refusal.capability)?.simulation;
  assert.ok(simulation, `a simulator refused for capability "${refusal.capability}", which is not marked simulated`);
  assert.ok(simulation.refuses.includes(refusal.refused),
   `"${refusal.refused}" is not one of the things capability "${refusal.capability}" says it refuses to do. A refusal typed rather than looked up is a sentence that stops matching the screens.`);
 }
});

test('every registered simulator answers a declared feed for a capability the contract marks simulated', () => {
 assert.deepEqual(simulators().map(simulator => simulator.feed).sort(), ['message-delivery', 'payment-result', 'payout-advice']);
 for (const simulator of simulators()) {
  const feed = feedById(simulator.feed)!;
  assert.ok(feed.capabilities.includes(simulator.capability));
  const capability = declared.find(entry => entry.id === simulator.capability)!;
  assert.equal(capability.state, 'simulated');
  assert.equal(simulator.supplier, capabilities.capabilities.find(entry => entry.id === simulator.capability)!.simulation!.supplier);
 }
});

test('the same subject produces the same answer, on this machine and on any other', () => {
 /* Determinism is the second thing a simulator owes and it is the one a test can actually hold it
    to. Not the message channel: asking it twice for the same message is a retry, and it refuses. */
 const first = cardAndEft.produce({ subject: 'MT-DETERMINISM-0001', at, detail: { service: 'senior' } });
 const again = cardAndEft.produce({ subject: 'MT-DETERMINISM-0001', at, detail: { service: 'senior' } });
 assert.deepEqual(first, again);
 const payout = bankPayouts.produce({ subject: 'w-9', at, detail: { partyId: 'N-205', amountCents: 1_000 } });
 const payoutAgain = bankPayouts.produce({ subject: 'w-9', at, detail: { partyId: 'N-205', amountCents: 1_000 } });
 assert.deepEqual(payout, payoutAgain);
 /* And a different subject is a different answer, or the seed is not doing anything. */
 const other = bankPayouts.produce({ subject: 'w-10', at, detail: { partyId: 'N-205', amountCents: 1_000 } });
 assert.notDeepEqual((payout as SimulatedEvent).reference, (other as SimulatedEvent).reference);
});

test('nothing in the simulation directory is reachable from a request', () => {
 /* scripts/check-boundaries.mjs fails the build on an import from server.ts or the feed modules.
    This is the same rule from the other side and it is cheap: `messageChannel` is a module-level
    object with no transport in it, and if that ever stops being true this is where it shows. */
 assert.equal(typeof messageChannel.produce, 'function');
 assert.equal(Object.keys(messageChannel).sort().join(','), 'capability,feed,id,produce,supplier');
});
