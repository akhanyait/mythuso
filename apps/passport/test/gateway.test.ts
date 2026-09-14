/**
 * The consent gateway: who × what × why × how long, and sealed content.
 *
 * Every refusal is compared with the sentence in packages/catalog/passport-gateway.json.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, PROVENANCE, harness, seed, sentence, statementOf } from './harness.ts';
import { openBytes } from '../src/keys.ts';

const refused = (result: { ok: boolean; reason?: string }, id: string) => {
 assert.equal(result.ok, false, `expected a refusal: ${id}`);
 assert.equal(result.reason, sentence(id));
};
const texts = (entries: Record<string, unknown>[]) => entries.map(entry => ((entry.code ?? entry.medication) as { text: string }).text).sort();

describe('a grant opens what it names, for whom, for why, for how long', () => {
 test('allowed: an assigned nurse reads allergies under a treatment grant, with provenance', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  const found = h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', s.subject);
  assert.ok(found.ok);
  assert.deepEqual(texts(found.entries), ['Synthetic allergen A']);
  const read = h.gateway.read(s.as(g.artefact), 'AllergyIntolerance', s.ids.allergy);
  assert.ok(read.ok);
  assert.equal((read.resource!.subject as { reference: string }).reference, `Patient/${s.subject}`);
  assert.equal(((read.provenance[0]!.agent as { type: { text: string } }[])[0]!).type.text, 'patient');
 });

 test('denied: an artefact the Passport did not sign, or one altered after it did', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  refused(h.gateway.search(s.as(''), 'AllergyIntolerance', s.subject), 'bad-grant');
  const [payload, signature] = g.artefact.split('.');
  const widened = Buffer.from(JSON.stringify({ ...g.grant, scope: ['allergy', 'prescription'] }), 'utf8').toString('base64url');
  refused(h.gateway.search(s.as(`${widened}.${signature}`), 'MedicationStatement', s.subject), 'bad-grant');
  refused(h.gateway.search(s.as(`${payload}.${signature!.slice(0, -2)}xx`), 'AllergyIntolerance', s.subject), 'bad-grant');
 });

 test('denied: an expired grant', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'], expiresAt: new Date(h.at() + HOUR).toISOString() });
  assert.ok(h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', s.subject).ok);
  h.advance(HOUR + 1);
  refused(h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', s.subject), 'expired');
 });

 test('denied: a revoked grant, from the moment it is revoked', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'caregiver', scope: ['allergy'] });
  assert.ok(h.gateway.revoke(s.patientSession, g.grantId).ok);
  refused(h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', s.subject), 'revoked');
 });

 test('denied: the wrong purpose', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'doctor-assigned', scope: ['allergy'] });
  refused(h.gateway.search(s.as(g.artefact, 'research'), 'AllergyIntolerance', s.subject), 'wrong-purpose');
  refused(h.gateway.check(g.artefact, 'marketing', 'allergy'), 'wrong-purpose');
 });

 test('denied: a category outside the scope, by search, by id and by check', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  refused(h.gateway.search(s.as(g.artefact), 'MedicationStatement', s.subject), 'out-of-scope');
  refused(h.gateway.read(s.as(g.artefact), 'MedicationStatement', s.ids.medicine), 'out-of-scope');
  refused(h.gateway.check(g.artefact, 'treatment', 'prescription'), 'out-of-scope');
  assert.ok(h.gateway.check(g.artefact, 'treatment', 'allergy').ok);
 });

 test('denied: another person\'s record under this person\'s grant', () => {
  const h = harness();
  const s = seed(h);
  const other = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  refused(h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', other.subject), 'wrong-subject');
  refused(h.gateway.read(s.as(g.artefact), 'AllergyIntolerance', other.ids.allergy), 'not-found');
 });

 test('only the patient\'s own session issues a grant, and only about themselves', () => {
  const h = harness();
  const s = seed(h);
  const other = seed(h);
  const expiresAt = new Date(h.at() + HOUR).toISOString();
  refused(h.gateway.grant('forged.session', { subject: s.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'care', expiresAt }), 'patient-session-required');
  refused(h.gateway.grant(s.patientSession, { subject: other.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'care', expiresAt }), 'wrong-subject');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'employer', scope: ['allergy'], purpose: 'care', expiresAt }), 'unknown-role');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['hiv-status-free-text'], purpose: 'care', expiresAt }), 'unknown-category');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'care', expiresAt: new Date(h.at() - 1).toISOString() }), 'expired');
 });

 test('what each role can never be given', () => {
  const h = harness();
  const s = seed(h);
  const expiresAt = new Date(h.at() + HOUR).toISOString();
  const ask = (recipientRole: string, scope: string[], sealedIncluded = false) => h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole, scope, purpose: 'treatment', expiresAt, sealedIncluded });
  refused(ask('scheme-aggregate', ['claim']), 'aggregate-only');
  refused(ask('responder-on-trip', ['vitals']), 'emergency-only');
  refused(ask('care-coordinator', ['allergy']), 'clinical-detail');
  refused(ask('pharmacist', ['prescription', 'maternal-health'], true), 'sealed-never');
  assert.ok(ask('care-coordinator', ['appointment']).ok);
 });

 test('a responder on a trip reads the emergency summary and nothing else', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'responder-on-trip', scope: ['emergency-card'], purpose: 'emergency-transport' });
  refused(h.gateway.search(s.as(g.artefact, 'emergency-transport'), 'Observation', s.subject), 'emergency-only');
  refused(h.gateway.read(s.as(g.artefact, 'emergency-transport'), 'AllergyIntolerance', s.ids.allergy), 'emergency-only');
  const summary = h.gateway.emergencySummary(s.as(g.artefact, 'emergency-transport'), s.subject);
  assert.ok(summary.ok);
  assert.deepEqual(texts(summary.summary.allergy!), ['Synthetic allergen A']);
  assert.deepEqual(texts(summary.summary.prescription!), ['Synthetic medicine B']);
 });
});

describe('sealed categories', () => {
 test('excluded by default, and a clinician is told sealed content exists without seeing it', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'doctor-assigned', scope: ['vitals', 'maternal-health'] });
  const found = h.gateway.search(s.as(g.artefact), 'Observation', s.subject);
  assert.ok(found.ok);
  assert.deepEqual(texts(found.entries), ['Synthetic pulse']);
  assert.equal(found.sealedContentExists, true);
  assert.equal(found.notice, statementOf('sealedExists'));
  const byId = h.gateway.read(s.as(g.artefact), 'Observation', s.ids.maternal);
  assert.ok(byId.ok);
  assert.equal(byId.resource, null);
  assert.equal(byId.sealedContentExists, true);
  assert.equal(JSON.stringify(byId).includes('antenatal'), false);
 });

 test('a caregiver whose read excluded sealed content is told nothing about it', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'caregiver', scope: ['vitals', 'maternal-health'], purpose: 'care' });
  const found = h.gateway.search(s.as(g.artefact, 'care'), 'Observation', s.subject);
  assert.ok(found.ok);
  assert.deepEqual(texts(found.entries), ['Synthetic pulse']);
  assert.equal('sealedContentExists' in found, false);
  refused(h.gateway.read(s.as(g.artefact, 'care'), 'Observation', s.ids.maternal), 'out-of-scope');
 });

 test('included only when the grant says sealedIncluded and ticks the category', () => {
  const h = harness();
  const s = seed(h);
  const both = s.grant({ recipientRole: 'doctor-assigned', scope: ['vitals', 'maternal-health'], sealedIncluded: true });
  assert.deepEqual(texts((h.gateway.search(s.as(both.artefact), 'Observation', s.subject) as { entries: Record<string, unknown>[] }).entries),
   ['Synthetic antenatal reading', 'Synthetic private reading', 'Synthetic pulse']);
  const vitalsOnly = s.grant({ recipientRole: 'doctor-assigned', scope: ['vitals'], sealedIncluded: true });
  const narrower = h.gateway.search(s.as(vitalsOnly.artefact), 'Observation', s.subject);
  assert.ok(narrower.ok);
  assert.deepEqual(texts(narrower.entries), ['Synthetic private reading', 'Synthetic pulse']);
  assert.equal(narrower.sealedContentExists, true);
 });

 test('the patient\'s own session sees everything, sealed included', () => {
  const h = harness();
  const s = seed(h);
  const mine = h.gateway.search(s.me, 'Observation', s.subject);
  assert.ok(mine.ok);
  assert.equal(mine.entries.length, 3);
 });

 test('sealed content is encrypted under a key of its own, and nothing is stored in the clear', () => {
  const h = harness();
  const s = seed(h);
  const scopes = h.store.keyScopesFor(s.subject);
  assert.ok(scopes.includes('general'));
  assert.equal(scopes.filter(scope => scope.startsWith('sealed:')).length, 2, 'maternal health and the private vitals reading each have their own key');
  const maternal = h.store.resource(s.ids.maternal)!;
  assert.ok(maternal.key_scope.startsWith('sealed:'));
  const general = h.keys.unwrapDataKey(s.subject, 'general', h.store.dataKey(s.subject, 'general')!);
  assert.throws(() => openBytes(general, maternal.sealed_body, `${s.subject}|${maternal.id}|${maternal.key_scope}|1`));
  assert.throws(() => openBytes(general, maternal.sealed_body, `${s.subject}|${maternal.id}|general|1`));
  for (const row of h.store.resourcesOf(s.subject)) {
   assert.equal(Buffer.from(row.sealed_body).toString('latin1').includes('Synthetic'), false);
   assert.equal(row.category_tag.includes('maternal'), false);
  }
 });
});

describe('writes', () => {
 test('provenance on every write, with the author taken from the grant rather than the body', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['vitals'] });
  const written = h.gateway.write(s.as(g.artefact), {
   subject: s.subject, resourceType: 'Observation', category: 'vitals',
   resource: { code: { text: 'Synthetic nurse reading' }, performer: 'somebody the body names' },
   provenance: { activity: 'home-visit-observation', sourceSystem: 'synthetic-nurse-app' }
  });
  assert.ok(written.ok, written.ok ? '' : written.reason);
  const provenance = h.store.provenanceFor(written.id);
  assert.equal(provenance.length, 1);
  assert.equal(provenance[0]!.author_role, 'nurse-assigned');
  assert.equal(provenance[0]!.author_ref, g.grantId);
  assert.equal(provenance[0]!.activity, 'home-visit-observation');
 });

 test('no provenance, no write', () => {
  const h = harness();
  const s = seed(h);
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'AllergyIntolerance', category: 'allergy', resource: {} }), 'no-provenance');
 });

 test('a Patient resource is a token and nothing else', () => {
  const h = harness();
  const s = seed(h);
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'Patient', category: 'patient', resource: { name: [{ text: 'Synthetic Person' }] }, provenance: PROVENANCE }), 'identity-on-patient');
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'Patient', category: 'patient', resource: { telecom: [{ value: 'synthetic' }] }, provenance: PROVENANCE }), 'identity-on-patient');
  assert.ok(h.gateway.write(s.me, { subject: s.subject, resourceType: 'Patient', category: 'patient', resource: {}, provenance: PROVENANCE }).ok);
 });

 test('a caregiver reads and does not write, and nobody writes provenance or audit', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'caregiver', scope: ['vitals'] });
  refused(h.gateway.write(s.as(g.artefact), { subject: s.subject, resourceType: 'Observation', category: 'vitals', resource: {}, provenance: PROVENANCE }), 'write-not-permitted');
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'Provenance', category: 'audit', resource: {}, provenance: PROVENANCE }), 'not-stored-here');
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'AuditEvent', category: 'audit', resource: {}, provenance: PROVENANCE }), 'not-stored-here');
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'Observation', category: 'allergy', resource: {}, provenance: PROVENANCE }), 'wrong-category');
 });

 test('a subject is a token the Passport issued, never an identity number', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  refused(h.gateway.search(s.as(g.artefact), 'AllergyIntolerance', '0000000000000'), 'not-a-token');
  refused(h.gateway.emergencySummary(s.me, 'not-a-token-at-all'), 'not-a-token');
 });
});
