/**
 * A prescription's whole custody, end to end, and the lab result that follows it: prescribed, verified by a
 * pharmacist who did not prescribe it, dispensed against its seal, authorised to a collector, collected by
 * nobody else, and handed over only to the right PIN — which is counted when wrong, expires with the terms it
 * was shown under, and never reaches the bus or the trail. Then a result from that patient's laboratory order
 * raises Core's concern at the rung Medicines' settings name, and neither the order nor the concern closes
 * until the clinician who ordered it acknowledges the result.
 *
 * Medicines, Clinical and Core run for real; Verify stands in as a publisher on the next tick, the way
 * packages/engines/src/medicines/engine.test.ts stands it in, because Medicines learns a badge only from
 * its events. This file sits beside the engines rather than inside one, because it binds four. Nothing here
 * is a real service: no script is written, no medicine exists and no sample is taken.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import medicinesContract from '../../../catalog/medicines.json' with { type: 'json' };
import clinicalApi from '../../../catalog/apis/clinical.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from '../runtime/index.ts';
import { namedLike } from '../runtime/contract.ts';
import { engine as medicines } from '../medicines/engine.ts';
import { engine as clinical } from '../clinical/engine.ts';
import { engine as core } from '../core/engine.ts';
import { MINUTE, refusal } from '../medicines/domain/contract.ts';
import { medicinesDefaults, resultRungOf, termsOf } from '../medicines/domain/settings.ts';

const START = '2026-09-15T09:00:00+02:00';
const UNTIL = '2027-09-15';
const ORDER = 'POST /v1/medicines/lab-orders@2';
const CLOSE = 'POST /v1/medicines/lab-orders/{labOrderRef}/close@1';
const ACKNOWLEDGE = 'POST /v1/clinical/results/{resultRef}/acknowledge@1';
const TURNAROUND = medicinesContract.labs.syntheticLab.turnaroundMinutes * MINUTE;
const DOCTOR = 'party-synthetic-doctor', PHARMACIST = 'party-synthetic-pharmacist', PHARMACY = 'party-synthetic-pharmacy';
const OTHER_DOCTOR = 'party-synthetic-other-doctor';
const PATIENT = 'subject-synthetic-patient', NURSE = 'party-synthetic-nurse';
const DEFAULTS = termsOf(medicinesDefaults);
const R = {
 check: 'POST /v1/medicines/interaction-checks@2', prescribe: 'POST /v1/medicines/prescriptions@2',
 verify: 'POST /v1/medicines/prescriptions/{prescriptionRef}/verify@2', dispense: 'POST /v1/medicines/prescriptions/{prescriptionRef}/dispense@2',
 authorise: 'POST /v1/medicines/collection-authorisations@1', collect: 'POST /v1/medicines/collections@2',
 handover: 'POST /v1/medicines/collections/{collectionRef}/handover@2'
} as const;
const acknowledgeRoute = clinicalApi.routes.find(r => r.path === '/v1/clinical/results/{resultRef}/acknowledge' && r.version === 1)!;
const clinicalSentence = (id: string) => acknowledgeRoute.refusals.find(r => r.id === id)!;

type Reply = { status: number; body: Record<string, unknown> };
const refused = (answer: Reply, id: string) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const accepted = (answer: Reply) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };

function world() {
 const pending: { key: EventKey; subjectRef: string; payload: Record<string, unknown> }[] = [];
 const trust = defineEngine({
  id: 'trust', routes: {}, subscriptions: {}, store: { schema: '' },
  tick: ctx => { for (const event of pending.splice(0)) ctx.publish(event.key, event.payload, { subjectRef: event.subjectRef, purposeOfUse: 'audit' }); }
 });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [medicines, clinical, core, trust], dataDirectory: MEMORY, clock: createClock(START) });
 const trustSays = (key: EventKey, subjectRef: string, payload: Record<string, unknown>) => { pending.push({ key, subjectRef, payload }); runtime.advance(0); };
 const call = (key: string, role: string, ref: string | null, purpose: string, fields: Record<string, unknown>): Reply => runtime.call(key as RouteKey, { role, ref, purpose, fields });
 const published = (key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key).map(entry => JSON.parse(entry.body) as { payload: Record<string, unknown> });
 const cleared = () => {
  trustSays('person.verified@1', DOCTOR, { role: 'doctor', badgeTier: 'verified', verifiedUntil: UNTIL });
  trustSays('partner.verified@1', PHARMACY, { partnerKind: 'pharmacy', verifiedUntil: UNTIL });
 };
 const check = (role: string, ref: string, stageCode: string, subjectRef = PATIENT) =>
  accepted(call(R.check, role, ref, stageCode === 'prescribe' ? 'treatment' : 'dispensing', { subjectRef, stageCode }))['checkRef'] as string;
 const prescribe = (over: Record<string, unknown> = {}, ref: string = DOCTOR) =>
  call(R.prescribe, 'doctor', ref, 'treatment', { subjectRef: PATIENT, medicationRequestRef: 'medication-request-synthetic-1', checkRef: check('doctor', ref, 'prescribe'), scheduleCode: 'S2', pharmacyRef: PHARMACY, notCheckedRead: true, ...over });
 const verify = (prescriptionRef: string) => call(R.verify, 'pharmacist', PHARMACIST, 'dispensing', { prescriptionRef });
 const dispense = (prescriptionRef: string) =>
  call(R.dispense, 'pharmacist', PHARMACIST, 'dispensing', { prescriptionRef, dispenseEntryRef: 'dispense-entry-synthetic-1', checkRef: check('pharmacist', PHARMACIST, 'dispense'), sealRef: 'seal-synthetic-1', notCheckedRead: true });
 const authorise = (prescriptionRef: string) => call(R.authorise, 'patient', PATIENT, 'dispensing', { prescriptionRef, collectorRef: NURSE, collectorRole: 'nurse' });
 const collect = (prescriptionRef: string, authorisationRef: string) => call(R.collect, 'nurse', NURSE, 'dispensing', { prescriptionRef, authorisationRef, sealRef: 'seal-synthetic-1' });
 const handOver = (collectionRef: string, handoverPin: string) => call(R.handover, 'nurse', NURSE, 'dispensing', { collectionRef, handoverPin, sealIntact: true });
 /* Prescribed, verified and dispensed, authorised for the nurse and collected by her: the door is all that is left. */
 const atTheDoor = () => {
  const prescriptionRef = accepted(prescribe())['prescriptionRef'] as string;
  accepted(verify(prescriptionRef));
  accepted(dispense(prescriptionRef));
  const given = accepted(authorise(prescriptionRef));
  const collectionRef = accepted(collect(prescriptionRef, given['authorisationRef'] as string))['collectionRef'] as string;
  return { prescriptionRef, collectionRef, pin: given['handoverPin'] as string };
 };
 const wrongPin = (pin: string) => pin.replace(/\d$/, d => String((Number(d) + 1) % 10));
 const order = () => call(ORDER, 'doctor', DOCTOR, 'diagnostics', { subjectRef: PATIENT, serviceRequestRef: 'service-request-synthetic-1', collectionMode: 'home' });
 return { runtime, trustSays, call, published, cleared, prescribe, verify, dispense, authorise, collect, handOver, atTheDoor, wrongPin, order };
}

test('the whole custody: dispensed to a seal, collected by its collector, and handed over only to the right PIN, which is counted when wrong and never reaches the bus', () => {
 const { runtime, cleared, handOver, atTheDoor, wrongPin, published } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 assert.equal(pin.length, medicinesContract.custody.pinDigits.value);
 assert.equal(handOver(collectionRef, wrongPin(pin)).body['error'], 'wrong-pin', 'a wrong PIN is counted, not ignored');
 assert.equal(handOver(collectionRef, pin).status, 200, 'the right PIN still opens it below the limit');

 for (const key of ['prescription.prescribed@1', 'prescription.verified@1', 'dispense.completed@1', 'delivery.collected@1', 'delivery.handed_over@1']) {
  const events = published(key);
  assert.equal(events.length, 1, `${key} was published once`);
  /* Read the way the event contract reads a field: by what its name ends in, so a reference to a MedicationRequest
     is a reference and a medication is refused. */
  for (const field of Object.keys(events[0]!.payload)) assert.ok(!medicinesContract.bus.neverCarries.some(name => namedLike(field, name)), `${key} carries ${field}`);
 }
 assert.ok(!published('delivery.handed_over@1').some(event => JSON.stringify(event).includes(pin)), 'the PIN is never on the bus');
 assert.ok(runtime.trail.all().every(entry => !entry.body.includes(pin)), 'and never in the trail');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a PIN expires with the terms it was shown under, and the hand-over after it is refused', () => {
 const { runtime, cleared, handOver, atTheDoor } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 runtime.advance(Math.min(DEFAULTS.pinLifetimeMs, DEFAULTS.windowMs));
 refused(handOver(collectionRef, pin), DEFAULTS.pinLifetimeMs < DEFAULTS.windowMs ? 'pin-expired' : 'authorisation-lapsed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a result from the chain\'s own patient raises one concern at Medicines\' rung, and neither it nor the order closes until the ordering clinician acknowledges it', () => {
 const { runtime, cleared, atTheDoor, order, published, call } = world();
 cleared();
 const { collectionRef, pin } = atTheDoor();
 assert.equal((call(R.handover, 'nurse', NURSE, 'dispensing', { collectionRef, handoverPin: pin, sealIntact: true })).status, 200, 'the chain reaches its hand-over before the lab leg begins');

 const labOrderRef = order().body['labOrderRef'] as string;
 assert.ok(labOrderRef, 'the order was placed with the synthetic laboratory');
 refused(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }), 'no-result-yet');

 runtime.advance(TURNAROUND - MINUTE);
 assert.equal(published('lab.result.received@1').length, 0, 'nothing arrives before the turnaround');
 runtime.advance(MINUTE);
 const [received] = published('lab.result.received@1');
 const resultRef = received!.payload['resultEntryRef'] as string;
 const [raised] = published('alert.raised@1');
 assert.equal(raised!.payload['tier'], resultRungOf(medicinesDefaults).rung, 'raised on the rung Medicines\' settings name');
 assert.equal(raised!.payload['recordEntryRef'], resultRef, 'the concern points at the result, never at a value');

 refused(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }), 'lab-result-complete-before-acknowledgement');
 const notYours = call(ACKNOWLEDGE, 'doctor', OTHER_DOCTOR, 'diagnostics', { resultRef });
 assert.deepEqual([notYours.body['error'], notYours.body['message'], notYours.status], ['result-not-yours', clinicalSentence('result-not-yours').statement, clinicalSentence('result-not-yours').status]);
 assert.equal(call(ACKNOWLEDGE, 'doctor', DOCTOR, 'diagnostics', { resultRef }).status, 200);
 assert.deepEqual(published('result.acknowledged@1').map(e => e.payload), [{ resultRef, acknowledgedByRef: DOCTOR }]);

 const [closedAlert] = published('alert.closed@1');
 assert.equal(closedAlert!.payload['outcomeRef'], resultRef, 'Core closed the concern, pointing at the result it was about');
 assert.equal(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }).status, 200);
 refused(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }), 'lab-order-closed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
