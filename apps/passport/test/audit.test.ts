/**
 * The audit chain: every access in it, the patient able to read their own, and tampering visible.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { harness, seed, sentence } from './harness.ts';

const NOTE = 'Collapsed in the street and carrying no phone at all';

describe('every access is written down', () => {
 test('granted and refused alike, and the patient reads both', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  assert.ok(h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', s.subject).ok);
  assert.equal(h.gateway.search(s.as(g.artefact, 'billing'), 'AllergyIntolerance', s.subject).ok, false);
  const history = h.gateway.auditMine(s.patientSession);
  assert.ok(history.ok);
  const byNurse = history.entries.filter(entry => (entry.agent as { type: { text: string } }[])[0]!.type.text === 'nurse-assigned');
  assert.deepEqual(byNurse.map(entry => entry.outcome), ['0', '4']);
  assert.equal(byNurse[1]!.outcomeDesc, sentence('wrong-purpose'));
  assert.equal(history.chain.intact, true);
 });

 test('finding 6: a probe of patient B\'s record with patient A\'s grant is in B\'s history too, without A\'s grant reference', () => {
  const h = harness();
  const a = seed(h);
  const b = seed(h);
  const g = a.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  h.gateway.read(a.as(g.artefact), 'AllergyIntolerance', b.ids.allergy);
  h.gateway.search(a.as(g.artefact), 'AllergyIntolerance', b.subject);
  const theirs = h.gateway.auditMine(b.patientSession);
  assert.ok(theirs.ok);
  const probes = theirs.entries.filter(entry => String((entry.type as { code: string }).code).endsWith('.probe'));
  assert.deepEqual(probes.map(entry => (entry.type as { code: string }).code).sort(), ['read.probe', 'search.probe']);
  for (const probe of probes) {
   assert.equal(probe.outcome, '4');
   assert.equal((probe.agent as { type: { text: string } }[])[0]!.type.text, 'nurse-assigned');
   assert.equal('who' in (probe.agent as object[])[0]!, false);
  }
  assert.equal(JSON.stringify(theirs.entries).includes(g.grantId), false);
  const mine = h.gateway.auditMine(a.patientSession);
  assert.ok(mine.ok);
  assert.ok(mine.entries.some(entry => entry.outcomeDesc === sentence('not-found')));
 });

 test('finding 6: a refusal with no requester at all is still written, under a descriptor that names nobody', () => {
  const h = harness();
  const before = h.auditRows().length;
  const refused = h.gateway.refuseRequest(401, 'no-grant', 'GET /fhir/Observation');
  assert.equal(refused.reason, sentence('no-grant'));
  const rows = h.auditRows();
  assert.equal(rows.length, before + 1);
  assert.equal(rows.at(-1)!.requester_role, 'unauthenticated');
  assert.equal(rows.at(-1)!.requester_ref, null);
  assert.equal(rows.at(-1)!.subject, null);
  assert.equal(h.gateway.audit.verify().intact, true);
 });

 test('a patient reads their own history and nobody else\'s', () => {
  const h = harness();
  const a = seed(h);
  const b = seed(h);
  const g = a.grant({ recipientRole: 'caregiver', scope: ['allergy'] });
  h.gateway.search(a.as(g.artefact), 'AllergyIntolerance', a.subject);
  const theirs = h.gateway.auditMine(b.patientSession);
  assert.ok(theirs.ok);
  assert.equal(JSON.stringify(theirs.entries).includes(g.grantId), false);
  assert.equal(h.gateway.auditMine('not-a-session').ok, false);
 });

 test('an entry never carries what was read', () => {
  const h = harness();
  const s = seed(h);
  h.gateway.read(s.me, 'AllergyIntolerance', s.ids.allergy);
  assert.equal(JSON.stringify(h.auditRows()).includes('Synthetic allergen A'), false);
 });
});

describe('the chain shows tampering', () => {
 test('an altered entry is named, and the patient is told the chain is broken', () => {
  const h = harness();
  const s = seed(h);
  assert.equal(h.gateway.audit.verify().firstBroken, null);
  h.store.database.prepare('UPDATE audit_events SET reason = ? WHERE seq = 3').run('Nothing happened here.');
  assert.equal(h.gateway.audit.verify().firstBroken, 3);
  const history = h.gateway.auditMine(s.patientSession);
  assert.ok(history.ok);
  assert.equal(history.chain.intact, false);
  assert.equal(history.chain.firstBroken, 3);
 });

 test('an entry removed from the middle is found', () => {
  const h = harness();
  seed(h);
  h.store.database.prepare('DELETE FROM audit_events WHERE seq = 2').run();
  assert.equal(h.gateway.audit.verify().firstBroken, 2);
 });

 test('two entries swapped are found', () => {
  const h = harness();
  seed(h);
  const db = h.store.database;
  db.prepare('UPDATE audit_events SET seq = -1 WHERE seq = 2').run();
  db.prepare('UPDATE audit_events SET seq = 2 WHERE seq = 3').run();
  db.prepare('UPDATE audit_events SET seq = 3 WHERE seq = -1').run();
  assert.equal(h.gateway.audit.verify().firstBroken, 2);
 });

 test('a break-glass flag quietly cleared is found', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ credential: h.operator(), subject: s.subject, reasonCode: 'unresponsive', note: NOTE });
  assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  h.store.database.prepare('UPDATE audit_events SET break_glass = 0 WHERE seq = ?').run(opened.auditSeq);
  assert.equal(h.gateway.audit.verify().firstBroken, opened.auditSeq);
 });
});
