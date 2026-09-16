/**
 * Wave 6: an Encounter's signature and supersede, and the status route Care asks about it.
 *
 * writeEncounter and signEncounter have no HTTP route of their own yet (see the comment above them in
 * apps/passport/src/gateway.ts), so they are exercised directly here, exactly as write() already is in
 * every other test in this package. encounterStatus is GET /v1/record/encounter-statuses/{encounterRef}@1,
 * and every refusal it can give is compared with its sentence in packages/catalog/passport-gateway.json.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HL7 } from '../../../packages/engines/src/record/domain/hl7.ts';
import { OPEN } from '../src/store.ts';
import { PROVENANCE, harness, seed, sentence, type Harness } from './harness.ts';

const CATEGORY = HL7.encounters.category;

const refused = (result: { ok: boolean; reason?: string; status?: number }, id: string, status?: number) => {
 assert.equal(result.ok, false, `expected a refusal: ${id}`);
 assert.equal(result.reason, sentence(id));
 if (status !== undefined) assert.equal(result.status, status);
};

/* A patient with a nurse's grant to write an Encounter and a doctor's grant to sign one, both scoped to
   the admission category an Encounter is filed under. */
function world(h: Harness) {
 const s = seed(h);
 const nurse = s.grant({ recipientRole: 'nurse-assigned', scope: [CATEGORY] });
 const doctor = s.grant({ recipientRole: 'doctor-assigned', scope: [CATEGORY] });
 const asNurse = s.as(nurse.artefact);
 const asDoctor = s.as(doctor.artefact);
 const write = (fields: Record<string, unknown> = {}) => h.gateway.writeEncounter(asNurse, {
  subject: s.subject, resource: { code: { text: 'Synthetic admission' } }, provenance: PROVENANCE, ...fields
 });
 const sign = (ref: string, requester = asDoctor) => h.gateway.signEncounter(requester, ref);
 return { s, nurse, doctor, asNurse, asDoctor, write, sign };
}

describe('an Encounter is written, signed once and superseded once', () => {
 test('written: the status route answers written, with no signedAt and no supersededByRef', () => {
  const h = harness();
  const w = world(h);
  const written = w.write();
  assert.ok(written.ok, written.ok ? '' : written.reason);
  const status = h.gateway.encounterStatus(written.id);
  assert.ok(status.ok, status.ok ? '' : status.reason);
  assert.equal(status.stateCode, 'written');
  assert.equal('signedAt' in status, false);
  assert.equal('supersededByRef' in status, false);
 });

 test('written, then signed: the doctor\'s own grant signs it, and signedAt appears', () => {
  const h = harness();
  const w = world(h);
  const written = w.write();
  assert.ok(written.ok);
  const signed = w.sign(written.id);
  assert.ok(signed.ok, signed.ok ? '' : signed.reason);
  const status = h.gateway.encounterStatus(written.id);
  assert.ok(status.ok);
  assert.equal(status.stateCode, 'signed');
  assert.equal(status.signedAt, signed.signedAt);
  assert.equal('supersededByRef' in status, false);
 });

 test('written v1, then v2 supersedes it: v1 reads superseded, pointing at v2', () => {
  const h = harness();
  const w = world(h);
  const v1 = w.write();
  assert.ok(v1.ok);
  const v2 = w.write({ supersedes: v1.id });
  assert.ok(v2.ok, v2.ok ? '' : v2.reason);
  assert.equal(v2.supersededRef, v1.id);
  const v1Status = h.gateway.encounterStatus(v1.id);
  assert.ok(v1Status.ok);
  assert.equal(v1Status.stateCode, 'superseded');
  assert.equal(v1Status.supersededByRef, v2.id);
  const v2Status = h.gateway.encounterStatus(v2.id);
  assert.ok(v2Status.ok);
  assert.equal(v2Status.stateCode, 'written');
 });

 test('signing a superseded version is refused, and the superseded version is unaffected', () => {
  const h = harness();
  const w = world(h);
  const v1 = w.write();
  assert.ok(v1.ok);
  const v2 = w.write({ supersedes: v1.id });
  assert.ok(v2.ok);
  refused(w.sign(v1.id), 'encounter-already-superseded', 409);
  const status = h.gateway.encounterStatus(v1.id);
  assert.ok(status.ok);
  assert.equal(status.stateCode, 'superseded', 'a refused sign must not have moved the state on');
 });

 test('superseding a signed version is refused: a signed encounter is corrected by a new entry, not replaced', () => {
  const h = harness();
  const w = world(h);
  const signedOne = w.write();
  assert.ok(signedOne.ok);
  const signedResult = w.sign(signedOne.id);
  assert.ok(signedResult.ok);
  const attempt = w.write({ supersedes: signedOne.id });
  refused(attempt, 'encounter-already-signed', 409);
  /* The correction is a fresh entry with no supersedes at all, and it is filed as any first version is. */
  const fresh = w.write();
  assert.ok(fresh.ok, fresh.ok ? '' : fresh.reason);
  const stillSigned = h.gateway.encounterStatus(signedOne.id);
  assert.ok(stillSigned.ok);
  assert.equal(stillSigned.stateCode, 'signed', 'a refused supersede must not have moved the signed state on');
 });

 test('signing twice, and superseding twice, are both refused the same way as signing or superseding out of order', () => {
  const h = harness();
  const w = world(h);
  const written = w.write();
  assert.ok(written.ok);
  assert.ok(w.sign(written.id).ok);
  refused(w.sign(written.id), 'encounter-already-signed', 409);
  const other = w.write();
  assert.ok(other.ok);
  const v2 = w.write({ supersedes: other.id });
  assert.ok(v2.ok);
  refused(w.write({ supersedes: other.id }), 'encounter-already-superseded', 409);
 });
});

describe('the status route cannot be used to probe the record', () => {
 test('an unknown reference and a reference of a different kind answer identically', () => {
  const h = harness();
  const w = world(h);
  const unknown = h.gateway.encounterStatus('res_00000000-0000-0000-0000-000000000000');
  const differentKind = h.gateway.encounterStatus(w.s.ids.allergy);
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown, differentKind, 'the two refusals must be byte-for-byte the same response');
  refused(unknown, 'no-such-encounter', 404);
 });

 test('a reference that is an Encounter this Passport has no state for is refused rather than guessed at', () => {
  const h = harness();
  const w = world(h);
  /* Simulates an Encounter filed by a path that predates this Passport's state tracking: a resource row
     with no encounter_states row beside it. Every writer this Wave 6 adds — writeEncounter and the HL7
     admission path — gives an Encounter a state in the same write, so this is otherwise unreachable. */
  const untracked = 'res_untracked-encounter';
  h.store.putResource({ id: untracked, subject: w.s.subject, resource_type: 'Encounter', category_tag: 'untracked', key_scope: 'general', sealed: OPEN, version: 1, sealed_body: Buffer.from('synthetic'), written_at: h.at() });
  refused(h.gateway.encounterStatus(untracked), 'status-before-written', 409);
 });
});

describe('who may write and who may sign', () => {
 test('the patient\'s own session never writes or signs an Encounter', () => {
  const h = harness();
  const w = world(h);
  refused(h.gateway.writeEncounter(w.s.me, { subject: w.s.subject, resource: {}, provenance: PROVENANCE }), 'write-not-permitted', 403);
  refused(h.gateway.signEncounter(w.s.me, 'res_whatever'), 'write-not-permitted', 403);
 });

 test('a nurse\'s grant may write but never sign', () => {
  const h = harness();
  const w = world(h);
  const written = w.write();
  assert.ok(written.ok);
  refused(h.gateway.signEncounter(w.asNurse, written.id), 'sign-requires-a-doctor', 403);
 });

 test('a grant out of the admission scope may not write or sign', () => {
  const h = harness();
  const s = seed(h);
  const narrowNurse = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  refused(h.gateway.writeEncounter(s.as(narrowNurse.artefact), { subject: s.subject, resource: {}, provenance: PROVENANCE }), 'out-of-scope', 403);
 });
});

describe('every transition is in the patient\'s own audit chain', () => {
 test('write, sign and supersede all appear, and the chain is intact', () => {
  const h = harness();
  const w = world(h);
  const v1 = w.write();
  assert.ok(v1.ok);
  const v2 = w.write({ supersedes: v1.id });
  assert.ok(v2.ok);
  const otherToSign = w.write();
  assert.ok(otherToSign.ok);
  assert.ok(w.sign(otherToSign.id).ok);
  h.gateway.encounterStatus(v2.id);
  const history = h.gateway.auditMine(w.s.patientSession);
  assert.ok(history.ok);
  const actions = history.entries.map(entry => (entry.type as { code: string }).code);
  for (const action of ['encounter.write', 'encounter.supersede', 'encounter.sign', 'encounter.status']) {
   assert.ok(actions.includes(action), `expected "${action}" in the patient's own audit chain: saw ${JSON.stringify(actions)}`);
  }
  assert.equal(h.gateway.audit.verify().intact, true);
 });
});
