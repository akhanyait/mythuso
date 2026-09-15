/**
 * A result that arrives by HL7 is never complete until a clinician acknowledges it, across the two services that each
 * own a part: the Passport files the laboratory's DiagnosticReport and keeps its hand-off, and on the engine runtime
 * Medicines takes the hand-off in as a result received and not acknowledged, raises its concern with Core, refuses the
 * close, and closes only after Clinical records the acknowledgement by the clinician who ordered the test. The call
 * between the two services does not exist, so the test carries the hand-off across as the call would, as engine:record.
 * Nothing here is a real service: no sample was taken and no laboratory sent anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hl7 from '../../../packages/catalog/hl7v2-inbound.json' with { type: 'json' };
import medicinesApi from '../../../packages/catalog/apis/medicines.json' with { type: 'json' };
import clinicalApi from '../../../packages/catalog/apis/clinical.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, type RouteKey } from '../../../packages/engines/src/runtime/index.ts';
import { engine as medicines } from '../../../packages/engines/src/medicines/engine.ts';
import { engine as clinical } from '../../../packages/engines/src/clinical/engine.ts';
import { engine as core } from '../../../packages/engines/src/core/engine.ts';
import { engine as record } from '../../../packages/engines/src/record/engine.ts';
import { syntheticOru } from '../../../packages/engines/src/record/domain/hl7.ts';
import type { PlacedOrder } from '../src/gateway.ts';
import { harness, seed } from './harness.ts';

const DOCTOR = 'party-synthetic-doctor';
const INTAKE = 'POST /v1/medicines/lab-results@1' as RouteKey;
const CLOSE = 'POST /v1/medicines/lab-orders/{labOrderRef}/close@1' as RouteKey;
const ACKNOWLEDGE = 'POST /v1/clinical/results/{resultRef}/acknowledge@1' as RouteKey;
const refusalOf = (routes: { path: string; version: number; refusals: { id: string; status: number; statement: string }[]; withdrawn?: unknown }[], path: string, id: string) =>
 routes.find(r => r.path === path && !r.withdrawn)!.refusals.find(r => r.id === id)!;

test('an HL7 result is taken in unacknowledged, its order cannot close, and the clinician who ordered it acknowledges it before it does', () => {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [medicines, clinical, core, record], dataDirectory: MEMORY, clock: createClock('2026-09-15T09:00:00+02:00') });
 const placed = new Map<string, PlacedOrder>();
 const h = harness({ placedOrder: ref => placed.get(ref) ?? null });
 const s = seed(h, { withPrivate: false });
 const identifier = { authority: hl7.assigningAuthorities[0]!.id, value: 'SYN500600' };
 assert.ok(h.gateway.linkIdentifier(s.patientSession, { assigningAuthority: identifier.authority, identifier: identifier.value }).ok);

 /* Medicines places the order; Record hears it, which is what the Passport is handed. */
 const ordered = runtime.call('POST /v1/medicines/lab-orders@2' as RouteKey, { role: 'doctor', ref: DOCTOR, purpose: 'diagnostics', fields: { subjectRef: s.subject, serviceRequestRef: 'service-request-synthetic-hl7', collectionMode: 'home' } });
 assert.equal(ordered.status, 200, JSON.stringify(ordered.body));
 const labOrderRef = String(ordered.body['labOrderRef']);
 assert.ok(runtime.trail.all().some(e => e.kind === 'delivered' && e.eventKey === 'lab.order.placed@1' && e.engine === 'record'), 'Record heard the order placed');
 placed.set(labOrderRef, { subjectRef: s.subject });

 const laboratory = hl7.facilities.find(f => f.kind === 'laboratory')!;
 const filed = h.gateway.receiveHl7(h.developer(), { message: syntheticOru({ facility: laboratory, controlId: 'SYN-ACK-1', sentAt: h.at(), identifier, labOrderRef, verifiedBy: hl7.preview.verifiedBy }) });
 assert.equal(filed.ok, true, JSON.stringify(filed));
 const [handOff] = h.gateway.hl7HandOffs();

 const taken = runtime.call(INTAKE, { role: 'engine:record', ref: null, purpose: 'diagnostics', fields: { ...handOff } });
 assert.equal(taken.status, 200, JSON.stringify(taken.body));
 const received = runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'lab.result.received@1').map(e => (JSON.parse(e.body) as { owner: string; payload: Record<string, unknown> }));
 assert.deepEqual(received.map(e => [e.owner, e.payload['labOrderRef'], e.payload['resultEntryRef']]), [['medicines', labOrderRef, handOff!.resultEntryRef]], 'Medicines, and only Medicines, announced the result');
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'alert.raised@1').length, 1, 'Core was given its concern');

 const early = runtime.call(CLOSE, { role: 'doctor', ref: DOCTOR, purpose: 'diagnostics', fields: { labOrderRef } });
 const incomplete = medicinesApi.refusals.find(r => r.id === 'lab-result-complete-before-acknowledgement')!;
 assert.deepEqual([early.status, early.body['message']], [incomplete.status, incomplete.statement], 'an HL7 result is not complete until it is acknowledged');

 assert.equal(runtime.call(ACKNOWLEDGE, { role: 'doctor', ref: DOCTOR, purpose: 'diagnostics', fields: { resultRef: handOff!.resultEntryRef } }).status, 200);
 assert.equal(runtime.call(CLOSE, { role: 'doctor', ref: DOCTOR, purpose: 'diagnostics', fields: { labOrderRef } }).status, 200);
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'alert.closed@1').length, 1, 'Core stood its concern down');

 const again = runtime.call(INTAKE, { role: 'engine:record', ref: null, purpose: 'diagnostics', fields: { ...handOff } });
 assert.deepEqual([again.status, again.body['error']], [refusalOf(medicinesApi.routes, '/v1/medicines/lab-results', 'lab-result-already-received').status, 'lab-result-already-received']);
 const nobody = runtime.call(INTAKE, { role: 'engine:record', ref: null, purpose: 'diagnostics', fields: { ...handOff, labOrderRef: 'lab-order-nobody-placed' } });
 assert.equal(nobody.body['error'], 'no-such-lab-order');
 const second = runtime.call('POST /v1/medicines/lab-orders@2' as RouteKey, { role: 'doctor', ref: DOCTOR, purpose: 'diagnostics', fields: { subjectRef: s.subject, serviceRequestRef: 'service-request-synthetic-hl7-2', collectionMode: 'home' } });
 const elsewhere = runtime.call(INTAKE, { role: 'engine:record', ref: null, purpose: 'diagnostics', fields: { ...handOff, labOrderRef: String(second.body['labOrderRef']), labPartyRef: 'synthetic-reference-laboratory' } });
 assert.equal(elsewhere.body['message'], refusalOf(medicinesApi.routes, '/v1/medicines/lab-results', 'lab-not-contracted').statement);
 const doctorCalling = runtime.call(INTAKE, { role: 'doctor', ref: DOCTOR, purpose: 'diagnostics', fields: { ...handOff } });
 assert.equal(doctorCalling.status, 403, 'only Record hands a result over');
 assert.ok(clinicalApi.routes.some(r => r.path === '/v1/clinical/results/{resultRef}/acknowledge'));
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
