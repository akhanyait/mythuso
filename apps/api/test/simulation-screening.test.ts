/**
 * The simulated screening model.
 *
 * The interesting assertions here are the two about words: that a finding never becomes a diagnosis,
 * and that an urgent one names a red flag packages/catalog/sos.json actually holds rather than one
 * this product invented for itself.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import records from '../../../packages/catalog/records.json' with { type: 'json' };
import sos from '../../../packages/catalog/sos.json' with { type: 'json' };
import { canonical, decide, feedById } from '../src/feeds/index.ts';
import { isRefusal, type SimulatorAnswer } from '../src/simulation/index.ts';
import { MODEL_ID, MODEL_VERSION, SCREENING, signOff } from '../src/simulation/screening.ts';

const FEED = feedById('screening-result')!;
const AT = new Date('2026-09-10T09:00:00Z');
const CLINICIAN = { partyId: 'D-401', name: 'Dr Naledi Khumalo', registration: 'HPCSA MP0712345', role: 'doctor' };

function payloadOf(answer: SimulatorAnswer): Record<string, unknown> {
 assert.ok(!isRefusal(answer), 'expected an event, got a refusal');
 return answer.payload;
}

describe('the simulated screening model', () => {
 test('stands in front of the screening-result seam for the screening capability', () => {
  assert.equal(SCREENING.feed, 'screening-result');
  assert.equal(SCREENING.capability, 'screening');
  assert.equal(SCREENING.supplier, 'A simulated screening model, in process.');
 });

 test('names a model and a version that cannot be mistaken for a product', () => {
  const payload = payloadOf(SCREENING.produce({ subject: 'CAP-1', at: AT }));
  assert.equal(payload.modelId, MODEL_ID);
  assert.equal(payload.modelVersion, MODEL_VERSION);
  assert.match(String(payload.modelVersion), /simulated/);
 });

 test('produces a result the seam would recognise, for every measure the record contract holds', () => {
  for (const measure of records.observations.measures) {
   const payload = payloadOf(SCREENING.produce({ subject: `CAP-${measure.id}`, at: AT, detail: { measureId: measure.id } }));
   const refusal = decide(FEED, payload);
   assert.equal(refusal.kind, 'not-connected', `${measure.id}: refused as ${refusal.kind}`);
  }
 });

 test('states the range from the record contract rather than one of its own', () => {
  for (const measure of records.observations.measures) {
   const payload = payloadOf(SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { measureId: measure.id, value: measure.high + 10 } }));
   const finding = String(payload.finding);
   assert.ok(finding.includes(measure.label), `${measure.id}: the finding does not name the measure`);
   assert.ok(finding.includes(`${measure.low}–${measure.high}`), `${measure.id}: the finding does not carry the contract's range`);
   assert.ok(finding.includes('outside'), `${measure.id}: a reading past the top of the range was not called outside it`);
  }
 });

 test('states no confidence where none was given, rather than inventing one', () => {
  assert.equal(payloadOf(SCREENING.produce({ subject: 'CAP-1', at: AT })).confidence, undefined);
  assert.equal(payloadOf(SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { confidence: 0.61 } })).confidence, 0.61);
 });

 test('carries none of the four fields that seam never accepts, under any spelling', () => {
  const forbidden = new Set(FEED.neverAccepts.flatMap(never => [never.field, ...never.also]).map(canonical));
  const payload = payloadOf(SCREENING.produce({ subject: 'CAP-1', at: AT }));
  for (const key of Object.keys(payload)) assert.ok(!forbidden.has(canonical(key)), `${key} is a field the screening seam refuses`);
 });

 test('reads the same capture the same way, on any machine', () => {
  assert.deepEqual(SCREENING.produce({ subject: 'CAP-9', at: AT }), SCREENING.produce({ subject: 'CAP-9', at: AT }));
 });

 describe('refuses', () => {
  test('a finding written in the language of a diagnosis', () => {
   const diagnoses = [
    'Atrial fibrillation, diagnosed.',
    'Findings consistent with pneumonia.',
    'The patient has hypertension.',
    'I10 — essential hypertension.',
    'Clinical impression: sepsis.'
   ];
   for (const finding of diagnoses) {
    const answer = SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { finding } });
    assert.ok(isRefusal(answer), `"${finding}" was produced as a finding`);
    assert.equal(answer.refused, 'Issue a diagnosis.');
   }
  });

  test('an urgent result that names no red flag at all', () => {
   const answer = SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { urgent: true } });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Produce an urgent result without naming a red flag the emergency contract holds.');
  });

  test('an urgent result naming a red flag the emergency contract does not hold', () => {
   const answer = SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { urgent: true, redFlag: 'looks-unwell' } });
   assert.ok(isRefusal(answer));
   assert.equal(answer.refused, 'Produce an urgent result without naming a red flag the emergency contract holds.');
  });

  test('a sign-off with no registration on it', () => {
   const result = SCREENING.produce({ subject: 'CAP-1', at: AT });
   const answer = signOff('CAP-1', result, { ...CLINICIAN, registration: '' }, AT);
   assert.ok('refused' in answer);
   assert.equal(answer.refused, 'Be signed off by anybody but a named clinician.');
  });

  test('a sign-off by a role the vetting register does not let sign a clinical review', () => {
   const result = SCREENING.produce({ subject: 'CAP-1', at: AT });
   for (const role of ['nurse', 'operator', 'admin', 'pharmacy']) {
    const answer = signOff('CAP-1', result, { ...CLINICIAN, role }, AT);
    assert.ok('refused' in answer, `a ${role} signed a screening result off`);
    assert.equal(answer.refused, 'Be signed off by anybody but a named clinician.');
   }
  });

  test('a sign-off on a refusal, which has no finding to stand behind', () => {
   const refused = SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { urgent: true } });
   assert.ok(isRefusal(refused));
   const answer = signOff('CAP-1', refused, CLINICIAN, AT);
   assert.ok('refused' in answer);
  });
 });

 test('produces an urgent result when it names one of the eight conditions that end the questions', () => {
  for (const condition of sos.redFlags.conditions) {
   const payload = payloadOf(SCREENING.produce({ subject: 'CAP-1', at: AT, detail: { urgent: true, redFlag: condition.id } }));
   assert.ok(String(payload.finding).includes(condition.name.toLowerCase()), `${condition.id} is not named in the finding`);
   assert.equal(decide(FEED, payload).kind, 'not-connected');
  }
 });

 test('is signed off by a named, registered clinician, and says whose name is on it', () => {
  const result = SCREENING.produce({ subject: 'CAP-1', at: AT });
  const signature = signOff('CAP-1', result, CLINICIAN, AT);
  assert.ok(!('refused' in signature));
  assert.equal(signature.registration, CLINICIAN.registration);
  assert.equal(signature.name, CLINICIAN.name);
  assert.equal(signature.finding, payloadOf(result).finding);
 });
});
