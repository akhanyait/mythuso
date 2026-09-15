/* Medicines on the runtime: a prescription from prescribed to handed over, and every refusal on the way.
 *
 * The prescriber never verifies their own script, whatever role they call in; a driver is never authorised to
 * carry Schedule 5 or 6; nothing is dispensed unverified; a check that was not run answers not checked and is
 * gone ahead on only once somebody says they read why; nobody the vetting register and Trust do not clear
 * prescribes, verifies or dispenses. At the door, a wrong PIN is counted and the count survives the refusal, the
 * last attempt voids the collection, a broken seal voids it too, and a PIN expires. An admin's change reaches the
 * next collection and never one already authorised. The pharmacy's queue carries exactly what the contract lets
 * it carry. Lab results, Clinical and Core are proved together in src/lab-result-reaches-core.test.ts.
 *
 * Trust is a stand-in that publishes what the real one would, on the next tick, so standing reaches Medicines the
 * way it does in the contract: on the bus. Every sentence is the contract's and every minute a setting's. Nothing
 * here is a real service.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import medicines from '../../../catalog/medicines.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from '../runtime/index.ts';
import { namedLike } from '../runtime/contract.ts';
import { engine } from './engine.ts';
import { NOT_CHECKED, refusal } from './domain/contract.ts';
import { medicinesDefaults, termsOf } from './domain/settings.ts';

const START = '2026-09-15T09:00:00+02:00';
const UNTIL = '2027-09-15';
const R = {
 formulary: 'GET /v1/medicines/formulary@2', check: 'POST /v1/medicines/interaction-checks@2', prescribe: 'POST /v1/medicines/prescriptions@2',
 verify: 'POST /v1/medicines/prescriptions/{prescriptionRef}/verify@2', dispense: 'POST /v1/medicines/prescriptions/{prescriptionRef}/dispense@2',
 authorise: 'POST /v1/medicines/collection-authorisations@1', collect: 'POST /v1/medicines/collections@2',
 handover: 'POST /v1/medicines/collections/{collectionRef}/handover@2', orders: 'GET /v1/medicines/orders@2', change: 'POST /v1/medicines/setting-changes@1'
} as const;
const DOCTOR = 'party-synthetic-doctor', PHARMACIST = 'party-synthetic-pharmacist', PHARMACY = 'party-synthetic-pharmacy', OTHER_PHARMACY = 'party-synthetic-other-pharmacy';
const PATIENT = 'subject-synthetic-patient', NURSE = 'party-synthetic-nurse', COURIER = 'party-synthetic-courier', ADMIN = 'party-synthetic-admin';
const DEFAULTS = termsOf(medicinesDefaults);

type Answer = { status: number; body: Record<string, unknown> };
const refused = (answer: Answer, id: string) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const accepted = (answer: Answer) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };

function world() {
 const pending: { key: EventKey; subjectRef: string; payload: Record<string, unknown> }[] = [];
 const trust = defineEngine({
  id: 'trust', routes: {}, subscriptions: {}, store: { schema: '' },
  tick: ctx => { for (const event of pending.splice(0)) ctx.publish(event.key, event.payload, { subjectRef: event.subjectRef, purposeOfUse: 'audit' }); }
 });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, trust], dataDirectory: MEMORY, clock: createClock(START) });
 const trustSays = (key: EventKey, subjectRef: string, payload: Record<string, unknown>) => { pending.push({ key, subjectRef, payload }); runtime.advance(0); };
 const call = (key: string, role: string, ref: string | null, purpose: string, fields: Record<string, unknown>): Answer => runtime.call(key as RouteKey, { role, ref, purpose, fields });
 const published = (key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key).map(entry => JSON.parse(entry.body) as { payload: Record<string, unknown> });
 const cleared = () => {
  trustSays('person.verified@1', DOCTOR, { role: 'doctor', badgeTier: 'verified', verifiedUntil: UNTIL });
  trustSays('partner.verified@1', PHARMACY, { partnerKind: 'pharmacy', verifiedUntil: UNTIL });
 };
 const check = (role: string, ref: string, stageCode: string, subjectRef = PATIENT) =>
  accepted(call(R.check, role, ref, stageCode === 'prescribe' ? 'treatment' : 'dispensing', { subjectRef, stageCode }))['checkRef'] as string;
 const prescribe = (over: Record<string, unknown> = {}, ref: string = DOCTOR) =>
  call(R.prescribe, 'doctor', ref, 'treatment', { subjectRef: PATIENT, medicationRequestRef: 'medication-request-synthetic-1', checkRef: check('doctor', ref, 'prescribe'), scheduleCode: 'S2', pharmacyRef: PHARMACY, notCheckedRead: true, ...over });
 const verify = (prescriptionRef: string, ref: string = PHARMACIST) => call(R.verify, 'pharmacist', ref, 'dispensing', { prescriptionRef });
 const dispense = (prescriptionRef: string, over: Record<string, unknown> = {}) =>
  call(R.dispense, 'pharmacist', PHARMACIST, 'dispensing', { prescriptionRef, dispenseEntryRef: 'dispense-entry-synthetic-1', checkRef: check('pharmacist', PHARMACIST, 'dispense'), sealRef: 'seal-synthetic-1', notCheckedRead: true, ...over });
 const authorise = (prescriptionRef: string, collectorRole = 'nurse', collectorRef = NURSE) => call(R.authorise, 'patient', PATIENT, 'dispensing', { prescriptionRef, collectorRef, collectorRole });
 const collect = (prescriptionRef: string, authorisationRef: string, role = 'nurse', ref = NURSE, sealRef = 'seal-synthetic-1') => call(R.collect, role, ref, 'dispensing', { prescriptionRef, authorisationRef, sealRef });
 const handOver = (collectionRef: string, handoverPin: string, sealIntact = true, ref = NURSE) => call(R.handover, 'nurse', ref, 'dispensing', { collectionRef, handoverPin, sealIntact });
 /* Prescribed, verified and dispensed, authorised for the nurse and collected by her: the door is all that is left. */
 const atTheDoor = (scheduleCode = 'S2') => {
  const prescriptionRef = accepted(prescribe({ scheduleCode }))['prescriptionRef'] as string;
  accepted(verify(prescriptionRef));
  accepted(dispense(prescriptionRef));
  const given = accepted(authorise(prescriptionRef));
  const collectionRef = accepted(collect(prescriptionRef, given['authorisationRef'] as string))['collectionRef'] as string;
  return { prescriptionRef, collectionRef, pin: given['handoverPin'] as string };
 };
 const wrongPin = (pin: string) => pin.replace(/\d$/, d => String((Number(d) + 1) % 10));
 return { runtime, trustSays, call, published, cleared, check, prescribe, verify, dispense, authorise, collect, handOver, atTheDoor, wrongPin };
}

test('the formulary is synthetic and says so in every answer, and is never handed over whole', () => {
 const { call } = world();
 const found = accepted(call(R.formulary, 'doctor', DOCTOR, 'treatment', { query: 'synthetic' }));
 assert.equal(found['listStatus'], medicines.formulary.listStatus);
 assert.equal(found['notice'], medicines.formulary.notice);
 assert.equal((found['entries'] as unknown[]).length, medicines.formulary.entries.length);
 refused(call(R.formulary, 'doctor', DOCTOR, 'treatment', { query: '   ' }), 'blank-query');
});

test('a check with no licensed source answers not checked with the reason, and never that nothing was found', () => {
 const { call } = world();
 const answer = accepted(call(R.check, 'doctor', DOCTOR, 'treatment', { subjectRef: PATIENT, stageCode: 'prescribe' }));
 assert.equal(answer['outcomeCode'], NOT_CHECKED.code);
 assert.equal(answer['reason'], NOT_CHECKED.reason);
 for (const phrase of medicines.interactionChecks.neverSays) assert.ok(!JSON.stringify(answer).toLowerCase().includes(phrase), `a check said "${phrase}"`);
 refused(call(R.check, 'doctor', DOCTOR, 'treatment', { subjectRef: PATIENT, stageCode: 'refill' }), 'stage-not-known');
});

test('the whole path: prescribed, verified, dispensed, authorised, collected and handed over, with nothing clinical on the bus', () => {
 const { cleared, published, handOver, atTheDoor } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 assert.equal(pin.length, medicines.custody.pinDigits.value);
 assert.equal(handOver(collectionRef, pin).status, 200);
 for (const key of ['prescription.prescribed@1', 'prescription.verified@1', 'dispense.completed@1', 'delivery.collected@1', 'delivery.handed_over@1']) {
  const events = published(key);
  assert.equal(events.length, 1, `${key} was published once`);
  /* Read the way the event contract reads a field: by what its name ends in, so a reference to a MedicationRequest
     is a reference and a medication is refused. */
  for (const field of Object.keys(events[0]!.payload)) assert.ok(!medicines.bus.neverCarries.some(name => namedLike(field, name)), `${key} carries ${field}`);
 }
 assert.ok(!published('delivery.handed_over@1').some(event => JSON.stringify(event).includes(pin)), 'the PIN is never on the bus');
});

test('the prescriber cannot verify their own script, whatever role they call in', () => {
 const { cleared, prescribe, verify } = world();
 cleared();
 const prescriptionRef = accepted(prescribe())['prescriptionRef'] as string;
 refused(verify(prescriptionRef, DOCTOR), 'prescriber-verifies-own-script');
 accepted(verify(prescriptionRef));
 refused(verify(prescriptionRef), 'already-verified');
 refused(verify('prescription-nobody-issued'), 'no-such-prescription');
});

test('nothing is dispensed before it is verified, from a pharmacy that is not verified, or twice', () => {
 const { cleared, prescribe, verify, dispense, trustSays } = world();
 cleared();
 const prescriptionRef = accepted(prescribe())['prescriptionRef'] as string;
 refused(dispense(prescriptionRef), 'not-verified');
 accepted(verify(prescriptionRef));
 accepted(dispense(prescriptionRef));
 refused(dispense(prescriptionRef), 'already-dispensed');
 const second = accepted(prescribe())['prescriptionRef'] as string;
 accepted(verify(second));
 trustSays('partner.suspended@1', PHARMACY, { partnerKind: 'pharmacy', reasonCode: 'licence-lapsed' });
 refused(dispense(second), 'unlicensed-pharmacy');
});

test('an act stands on a check run for this patient at this stage, cited once, and read when it was not run', () => {
 const { cleared, prescribe, check } = world();
 cleared();
 refused(prescribe({ checkRef: 'check-nobody-ran' }), 'no-interaction-check');
 refused(prescribe({ checkRef: check('doctor', DOCTOR, 'prescribe', 'subject-synthetic-somebody-else') }), 'check-not-for-this');
 refused(prescribe({ checkRef: check('doctor', DOCTOR, 'dispense') }), 'check-not-for-this');
 refused(prescribe({ notCheckedRead: false }), 'not-checked-not-read');
 const once = check('doctor', DOCTOR, 'prescribe');
 accepted(prescribe({ checkRef: once }));
 refused(prescribe({ checkRef: once }), 'check-already-cited');
});

test('nobody the register and Trust do not clear today prescribes, verifies or dispenses', () => {
 const { trustSays, prescribe, verify, cleared, call } = world();
 refused(prescribe(), 'not-vetted-for-this');
 cleared();
 trustSays('person.suspended@1', DOCTOR, { role: 'doctor', reasonCode: 'panel-decision' });
 refused(prescribe(), 'not-vetted-for-this');
 trustSays('person.reinstated@1', DOCTOR, { role: 'doctor', badgeTier: 'verified' });
 const prescriptionRef = accepted(prescribe())['prescriptionRef'] as string;
 refused(prescribe({ pharmacyRef: OTHER_PHARMACY }), 'pharmacy-not-verified');
 refused(prescribe({ scheduleCode: 'S7' }), 'schedule-not-handled');
 trustSays('person.suspended@1', PHARMACIST, { role: 'nurse', reasonCode: 'panel-decision' });
 refused(verify(prescriptionRef), 'not-vetted-for-this');
 refused(call(R.prescribe, 'doctor', null, 'treatment', { subjectRef: PATIENT, medicationRequestRef: 'm', checkRef: 'c', scheduleCode: 'S2', pharmacyRef: PHARMACY }), 'unnamed-caller');
});

test('a driver is never authorised to carry Schedule 5 or 6, and only the patient authorises, only a collecting role', () => {
 const { cleared, prescribe, verify, dispense, authorise, call } = world();
 cleared();
 for (const scheduleCode of ['S5', 'S6']) {
  const prescriptionRef = accepted(prescribe({ scheduleCode }))['prescriptionRef'] as string;
  refused(authorise(prescriptionRef, 'courier', COURIER), 'schedule-five-six-by-driver');
  refused(authorise(prescriptionRef, 'responder', COURIER), 'schedule-five-six-by-driver');
  accepted(authorise(prescriptionRef, 'nurse', NURSE));
 }
 const s2 = accepted(prescribe())['prescriptionRef'] as string;
 accepted(verify(s2));
 accepted(dispense(s2));
 refused(call(R.authorise, 'patient', 'subject-synthetic-somebody-else', 'dispensing', { prescriptionRef: s2, collectorRef: NURSE, collectorRole: 'nurse' }), 'not-your-prescription');
 refused(authorise(s2, 'carer', COURIER), 'collector-role-not-allowed');
 accepted(authorise(s2, 'courier', COURIER));
 refused(authorise(s2), 'collection-under-way');
});

test('only the authorised collector collects, the bag it was sealed as, once it is dispensed', () => {
 const { cleared, prescribe, verify, dispense, authorise, collect } = world();
 cleared();
 const prescriptionRef = accepted(prescribe())['prescriptionRef'] as string;
 const authorisationRef = accepted(authorise(prescriptionRef))['authorisationRef'] as string;
 refused(collect(prescriptionRef, authorisationRef), 'not-dispensed');
 accepted(verify(prescriptionRef));
 accepted(dispense(prescriptionRef));
 refused(collect(prescriptionRef, 'authorisation-nobody-gave'), 'no-authorisation');
 refused(collect(prescriptionRef, authorisationRef, 'courier', COURIER), 'not-the-authorised-collector');
 refused(collect(prescriptionRef, authorisationRef, 'nurse', NURSE, 'seal-synthetic-other'), 'seal-does-not-match');
 accepted(collect(prescriptionRef, authorisationRef));
 refused(collect(prescriptionRef, authorisationRef), 'already-collected');
});

test('a wrong PIN is counted and the count survives the refusal; the last attempt voids the collection, and the right PIN then opens nothing', () => {
 const { cleared, handOver, atTheDoor, wrongPin, published } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 for (let attempt = 1; attempt < DEFAULTS.pinAttempts; attempt += 1) refused(handOver(collectionRef, wrongPin(pin)), 'wrong-pin');
 refused(handOver(collectionRef, wrongPin(pin)), 'pin-attempts-exhausted');
 refused(handOver(collectionRef, pin), 'collection-voided');
 refused(handOver('collection-nobody-issued', pin), 'no-such-collection');
 assert.equal(published('delivery.handed_over@1').length, 0);
});

test('a broken seal voids the delivery whatever PIN is given, and only the authorised collector hands over', () => {
 const { cleared, handOver, atTheDoor } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 refused(handOver(collectionRef, pin, true, COURIER), 'not-the-authorised-collector');
 refused(handOver(collectionRef, pin, false), 'broken-seal');
 refused(handOver(collectionRef, pin, true), 'collection-voided');
});

test('a PIN expires with the terms it was shown under, and a hand-over after it is refused', () => {
 const { runtime, cleared, handOver, atTheDoor } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 runtime.advance(Math.min(DEFAULTS.pinLifetimeMs, DEFAULTS.windowMs));
 const answer = handOver(collectionRef, pin);
 refused(answer, DEFAULTS.pinLifetimeMs < DEFAULTS.windowMs ? 'pin-expired' : 'authorisation-lapsed');
});

test('an admin changing the attempts and the window reaches the next collection and never one already authorised', () => {
 const { call, cleared, handOver, atTheDoor, wrongPin } = world();
 cleared();
 const live = atTheDoor();
 const change = (setting: string, wholeNumber: number, expectedVersion: number, key: string) =>
  call(R.change, 'admin', ADMIN, 'audit', { idempotencyKey: key, setting, wholeNumber, reason: 'Testing that a change never reaches a running collection.', expectedVersion });
 refused(change('pin-lifetime', DEFAULTS.windowMs / 60_000 + 1, 1, 'too-long'), 'pin-outlives-the-window');
 accepted(change('pin-attempts', 1, 1, 'one-attempt'));
 refused(handOver(live.collectionRef, wrongPin(live.pin)), 'wrong-pin');
 accepted(handOver(live.collectionRef, live.pin));
 const next = atTheDoor();
 refused(handOver(next.collectionRef, wrongPin(next.pin)), 'pin-attempts-exhausted');
});

test('a pharmacy reads its own queue, carrying exactly what the contract lets it carry and nothing about the patient', () => {
 const { cleared, prescribe, call } = world();
 cleared();
 accepted(prescribe());
 const queue = accepted(call(R.orders, 'pharmacy', PHARMACY, 'dispensing', { pharmacyRef: PHARMACY }))['orders'] as Record<string, unknown>[];
 assert.equal(queue.length, 1);
 assert.deepEqual(Object.keys(queue[0]!).sort(), [...medicines.partnerQueue.carries].sort());
 assert.ok(!JSON.stringify(queue).includes(PATIENT) && !JSON.stringify(queue).includes(DOCTOR), 'the queue names neither the patient nor the prescriber');
 assert.equal(queue[0]!['prescribeCheckOutcomeCode'], NOT_CHECKED.code);
 refused(call(R.orders, 'pharmacy', OTHER_PHARMACY, 'dispensing', { pharmacyRef: PHARMACY }), 'another-pharmacys-queue');
});
