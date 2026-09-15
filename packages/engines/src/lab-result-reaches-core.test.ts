/**
 * A lab result from order to close, across the three engines that each own a part of it: Medicines places the
 * order and receives the synthetic laboratory's result, Clinical records the acknowledgement by the clinician
 * who ordered the test, and Core raises and stands down the concern in between.
 *
 * The Wave 4 exit test is here: a lab result cannot close unacknowledged. And the loop around it: the concern Core
 * opens for a result escalates when nobody takes it on, and closes, pointing at the result's entry, only when the
 * clinician responsible acknowledges it. The rung is Medicines' setting and the time it holds is Core's ladder,
 * both read rather than typed. This file sits beside the engines because it binds three, and an engine's own
 * directory reaches no other engine. Nothing here is a real service: no sample is taken and nobody is paged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import medicinesContract from '../../catalog/medicines.json' with { type: 'json' };
import clinicalApi from '../../catalog/apis/clinical.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, type RouteKey } from './runtime/index.ts';
import { engine as medicines } from './medicines/engine.ts';
import { engine as clinical } from './clinical/engine.ts';
import { engine as core } from './core/engine.ts';
import { MINUTE, refusal } from './medicines/domain/contract.ts';
import { medicinesDefaults, resultRungOf } from './medicines/domain/settings.ts';
import { contract as closedLoop, spanForRung } from './core/domain/contract.ts';

const START = '2026-09-15T09:00:00+02:00';
const ORDER = 'POST /v1/medicines/lab-orders@1';
const CLOSE = 'POST /v1/medicines/lab-orders/{labOrderRef}/close@1';
const ACKNOWLEDGE = 'POST /v1/clinical/results/{resultRef}/acknowledge@1';
const DOCTOR = 'party-synthetic-doctor', OTHER_DOCTOR = 'party-synthetic-other-doctor', PATIENT = 'subject-synthetic-patient';
const TURNAROUND = medicinesContract.labs.syntheticLab.turnaroundMinutes * MINUTE;
const acknowledgeRoute = clinicalApi.routes.find(r => r.path === '/v1/clinical/results/{resultRef}/acknowledge' && r.version === 1)!;
const clinicalSentence = (id: string) => acknowledgeRoute.refusals.find(r => r.id === id)!;

type Answer = { status: number; body: Record<string, unknown> };
function world() {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [medicines, clinical, core], dataDirectory: MEMORY, clock: createClock(START) });
 const call = (key: string, role: string, ref: string, purpose: string, fields: Record<string, unknown>): Answer => runtime.call(key as RouteKey, { role, ref, purpose, fields });
 const published = (key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key).map(entry => JSON.parse(entry.body) as { payload: Record<string, unknown> });
 const order = (collectionMode = 'home', ref = DOCTOR) => call(ORDER, 'doctor', ref, 'diagnostics', { subjectRef: PATIENT, serviceRequestRef: 'service-request-synthetic-1', collectionMode });
 return { runtime, call, published, order };
}
const refusedBy = (answer: Answer, sentence: { id: string; status: number; statement: string }) => {
 assert.equal(answer.body['error'], sentence.id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], sentence.statement);
 assert.equal(answer.status, sentence.status);
};

test('a lab result cannot close unacknowledged; the clinician who ordered it acknowledges it once, and Core stands its concern down', () => {
 const { runtime, call, published, order } = world();
 const labOrderRef = (order().body['labOrderRef']) as string;
 assert.ok(labOrderRef, 'the order was placed with the synthetic laboratory');
 refusedBy(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }), refusal('no-result-yet'));

 runtime.advance(TURNAROUND - MINUTE);
 assert.equal(published('lab.result.received@1').length, 0, 'nothing arrives before the turnaround');
 runtime.advance(MINUTE);
 const [received] = published('lab.result.received@1');
 const resultRef = received!.payload['resultEntryRef'] as string;
 const [raised] = published('alert.raised@1');
 assert.equal(raised!.payload['tier'], resultRungOf(medicinesDefaults).rung, 'raised on the rung Medicines\' settings name');
 assert.equal(raised!.payload['recordEntryRef'], resultRef, 'the concern points at the result, never at a value');

 refusedBy(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }), refusal('lab-result-complete-before-acknowledgement'));
 refusedBy(call(ACKNOWLEDGE, 'doctor', OTHER_DOCTOR, 'diagnostics', { resultRef }), clinicalSentence('result-not-yours'));
 refusedBy(call(ACKNOWLEDGE, 'doctor', DOCTOR, 'diagnostics', { resultRef: 'synthetic-result-nobody-received' }), clinicalSentence('result-not-yours'));
 assert.equal(call(ACKNOWLEDGE, 'doctor', DOCTOR, 'diagnostics', { resultRef }).status, 200);
 refusedBy(call(ACKNOWLEDGE, 'doctor', DOCTOR, 'diagnostics', { resultRef }), clinicalSentence('already-acknowledged'));
 assert.deepEqual(published('result.acknowledged@1').map(e => e.payload), [{ resultRef, acknowledgedByRef: DOCTOR }]);

 const [closedAlert] = published('alert.closed@1');
 assert.equal(closedAlert!.payload['outcomeRef'], resultRef, 'Core closed the concern, pointing at the result it was about');
 assert.equal(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }).status, 200);
 refusedBy(call(CLOSE, 'doctor', DOCTOR, 'diagnostics', { labOrderRef }), refusal('lab-order-closed'));
 assert.deepEqual(runtime.faults(), []);
});

test('a result nobody acknowledges is never closed: its concern escalates on Core\'s ladder instead', () => {
 const { runtime, published, order } = world();
 order();
 runtime.advance(TURNAROUND);
 assert.equal(published('alert.raised@1').length, 1);
 runtime.advance(spanForRung(resultRungOf(medicinesDefaults).rung)!);
 assert.ok(published('alert.escalated@1').length >= 1, 'the concern moved to its fallback');
 assert.equal(published('alert.closed@1').length, 0);
 assert.ok(closedLoop.resultAcknowledged.alertsFrom === 'medicines');
});

test('an order to a laboratory nobody serves is refused in the contract\'s sentence', () => {
 const { order } = world();
 refusedBy(order('lab'), refusal('lab-not-contracted'));
});
