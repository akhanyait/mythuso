/* The offline queue arriving: the four conflicts as packages/catalog/capture.json resolves them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import care from '../../../../catalog/care.json' with { type: 'json' };
import { careContract } from './contract.ts';
import { SyncIntake, type QueuedCapture } from './sync.ts';
import { HEARD, TrustCache } from './trust.ts';
import { VisitDesk } from './visits.ts';
import { careByDefault } from './settings.ts';

const NOW = new Date('2026-09-14T15:50:00+02:00');
const me = { clinicianRef: 'N-205' };
const capture = (operationRef: string, observationId: string, extra: Partial<QueuedCapture> = {}): QueuedCapture => ({
 operationRef, kind: 'capture', appointmentRef: 'TH-3107', observationId, observationRef: `obs-${operationRef}`,
 capturedBy: 'N-205', deviceAt: '2026-09-14T15:45:00+02:00', ...extra
});

function setup(cleared = true) {
 const trust = new TrustCache(careContract.badgeTiers);
 trust.learn({ ...HEARD, subjectRef: 'N-205', occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: cleared } });
 const visits = new VisitDesk({ contract: careContract, settings: () => careByDefault, record: { encounterComplete: () => true, encounterSigned: () => true } });
 visits.hold({ appointmentRef: 'TH-3107', subjectRef: 'sub', serviceId: 'wound', clinicianRef: 'N-205', scheduledFor: '2026-09-14T16:00:00+02:00' }, care.preview.visitCode);
 visits.start({ appointmentRef: 'TH-3107', visitCode: care.preview.visitCode }, me, NOW);
 return { visits, intake: new SyncIntake({ contract: careContract, visits, trust }) };
}

test('a duplicate observation is shown back, never merged, and the first reading stands alone', () => {
 const { visits, intake } = setup();
 const got = intake.receive({ batchRef: 'b1', operations: [capture('op1', 'systolic'), capture('op2', 'systolic'), capture('op3', 'pulse')] }, me, NOW);
 assert.ok(got.ok);
 if (!got.ok) return;
 assert.equal(got.value.acceptedCount, 2);
 assert.deepEqual(got.value.conflictRefs, ['op2']);
 assert.equal(got.value.conflicts[0]!.conflictId, 'duplicate-observation');
 assert.equal(got.value.notMerged, 'A conflict is shown to the nurse, never merged silently.');
 assert.deepEqual(visits.visit('TH-3107')!.observationRefs, ['obs-op1', 'obs-op3']);
});

test('a device clock ahead of the server is applied in server order, with what the device believed kept beside it', () => {
 const { intake } = setup();
 const got = intake.receive({ batchRef: 'b1', operations: [capture('op1', 'temperature', { deviceAt: '2026-09-14T18:00:00+02:00' })] }, me, NOW);
 assert.ok(got.ok);
 if (!got.ok) return;
 assert.deepEqual(got.value.conflictRefs, []);
 assert.deepEqual(got.value.applied[0], { operationRef: 'op1', receivedAt: NOW.toISOString(), deviceBelieved: '2026-09-14T18:00:00+02:00', clockSkew: true });
});

test('a reading that arrives after the visit completed is a stale write for a clinician, not applied', () => {
 const { visits, intake } = setup();
 visits.complete({ appointmentRef: 'TH-3107', visitCode: care.preview.visitCode, encounterRef: 'enc' }, me, NOW);
 const got = intake.receive({ batchRef: 'b1', operations: [capture('op1', 'pulse')] }, me, NOW);
 assert.ok(got.ok);
 if (got.ok) assert.deepEqual([got.value.acceptedCount, got.value.conflicts[0]!.conflictId], [0, 'stale-write']);
});

test('a capturer whose standing lapsed before arrival is shown as vetting-lapsed, and nothing is filed on her authority', () => {
 const { visits, intake } = setup(false);
 const got = intake.receive({ batchRef: 'b1', operations: [capture('op1', 'pulse')] }, me, NOW);
 assert.ok(got.ok);
 if (!got.ok) return;
 assert.equal(got.value.conflicts[0]!.conflictId, 'vetting-lapsed');
 assert.deepEqual(visits.visit('TH-3107')!.observationRefs, []);
});

test('the same batch twice is one answer and nothing attached twice', () => {
 const { visits, intake } = setup();
 const first = intake.receive({ batchRef: 'same', operations: [capture('op1', 'pulse')] }, me, NOW);
 const again = intake.receive({ batchRef: 'same', operations: [capture('op1', 'pulse')] }, me, NOW);
 assert.ok(first.ok && again.ok);
 if (first.ok && again.ok) assert.deepEqual(again.value, first.value);
 assert.deepEqual(visits.visit('TH-3107')!.observationRefs, ['obs-op1']);
});

test('somebody else’s queued reading is refused, not attached', () => {
 const { intake } = setup();
 const got = intake.receive({ batchRef: 'b1', operations: [capture('op1', 'pulse', { capturedBy: 'N-201' })] }, me, NOW);
 assert.ok(got.ok);
 if (got.ok) assert.deepEqual([got.value.acceptedCount, got.value.refused.length], [0, 1]);
});
