/**
 * The consent gateway: who × what × why × how long, and sealed content.
 *
 * Every refusal is compared with the sentence in packages/catalog/passport-gateway.json.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HOUR, PROVENANCE, harness, roleOf, seed, sentence, statementOf } from './harness.ts';
import { openBytes } from '../src/keys.ts';
import { GRANT_CEILING_DAYS, expiryCeilingDays } from '../src/contract.ts';
import consent from '../../../packages/catalog/consent.json' with { type: 'json' };

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

 test('denied: an artefact the Passport did not sign, one altered after it did, or one with an extra segment', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'nurse-assigned', scope: ['allergy'] });
  refused(h.gateway.search(s.as(''), 'AllergyIntolerance', s.subject), 'bad-grant');
  const [payload, signature] = g.artefact.split('.');
  const widened = Buffer.from(JSON.stringify({ ...g.grant, scope: ['allergy', 'prescription'] }), 'utf8').toString('base64url');
  refused(h.gateway.search(s.as(`${widened}.${signature}`), 'MedicationStatement', s.subject), 'bad-grant');
  refused(h.gateway.search(s.as(`${payload}.${signature!.slice(0, -2)}xx`), 'AllergyIntolerance', s.subject), 'bad-grant');
  refused(h.gateway.search(s.as(`${g.artefact}.junk`), 'AllergyIntolerance', s.subject), 'bad-grant');
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
  refused(h.gateway.search(s.as(g.artefact, 'billing'), 'AllergyIntolerance', s.subject), 'wrong-purpose');
  refused(h.gateway.check(g.artefact, 'audit', 'allergy'), 'wrong-purpose');
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
  refused(h.gateway.grant('forged.session', { subject: s.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'treatment', expiresAt }), 'patient-session-required');
  refused(h.gateway.grant(s.patientSession, { subject: other.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'treatment', expiresAt }), 'wrong-subject');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'employer', scope: ['allergy'], purpose: 'treatment', expiresAt }), 'unknown-role');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['hiv-status-free-text'], purpose: 'treatment', expiresAt }), 'unknown-category');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'treatment', expiresAt: new Date(h.at() - 1).toISOString() }), 'expired');
 });

 test('what each role can never be given', () => {
  const h = harness();
  const s = seed(h);
  const expiresAt = new Date(h.at() + HOUR).toISOString();
  const ask = (recipientRole: string, scope: string[], purpose: string, sealedIncluded = false) => h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole, scope, purpose, expiresAt, sealedIncluded });
  refused(ask('scheme-aggregate', ['claim'], 'billing'), 'aggregate-only');
  refused(ask('responder-on-trip', ['vitals'], 'dispatch'), 'emergency-only');
  refused(ask('care-coordinator', ['allergy'], 'dispatch'), 'clinical-detail');
  refused(ask('pharmacist', ['prescription', 'maternal-health'], 'dispensing', true), 'sealed-never');
  assert.ok(ask('care-coordinator', ['appointment'], 'dispatch').ok);
 });
});

describe('finding 7: a grant has a ceiling on its length and a list of purposes, from the contract', () => {
 test('an end date past the role\'s maxExpiryDays is refused, and one on the ceiling is not', () => {
  const h = harness();
  const s = seed(h);
  const role = roleOf('pharmacist');
  const ask = (days: number) => h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'pharmacist', scope: ['prescription'], purpose: 'dispensing', expiresAt: new Date(h.at() + days * DAY).toISOString() });
  assert.ok(ask(role.maxExpiryDays).ok);
  refused(ask(role.maxExpiryDays + 1), 'expiry-too-long');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['prescription'], purpose: 'treatment', expiresAt: new Date(h.at() + 20 * 365 * DAY).toISOString() }), 'expiry-too-long');
 });

 test('the founder\'s contract-wide ceiling holds every role, and the gateway applies it on top of a role\'s own', () => {
  const ceiling = consent.grants.maximumExpiryDays;
  assert.equal(GRANT_CEILING_DAYS, ceiling);
  for (const role of consent.grants.recipientRoles) assert.ok(role.maxExpiryDays <= ceiling && role.defaultExpiryDays <= ceiling, role.id);
  /* A role somebody edited past the ceiling is still held to it. */
  assert.equal(expiryCeilingDays({ maxExpiryDays: 365 }), ceiling);
  assert.equal(expiryCeilingDays({ maxExpiryDays: 7 }), 7);
  const h = harness();
  const s = seed(h);
  const ask = (days: number) => h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'next-of-kin', scope: ['emergency-card'], purpose: 'emergency', expiresAt: new Date(h.at() + days * DAY).toISOString() });
  assert.ok(ask(ceiling).ok);
  refused(ask(ceiling + 1), 'expiry-too-long');
  refused(ask(365), 'expiry-too-long');
 });

 test('a purpose the role may not name is refused, and so is a purpose that is not a purpose at all', () => {
  const h = harness();
  const s = seed(h);
  const expiresAt = new Date(h.at() + HOUR).toISOString();
  const ask = (recipientRole: string, purpose: string) => h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole, scope: ['prescription'], purpose, expiresAt });
  refused(ask('pharmacist', 'treatment'), 'purpose-not-allowed');
  refused(ask('caregiver', 'billing'), 'purpose-not-allowed');
  refused(ask('caregiver', 'marketing to this family'), 'purpose-not-allowed');
  for (const purpose of roleOf('caregiver').allowedPurposes) assert.ok(ask('caregiver', purpose).ok, purpose);
 });
});

describe('finding 8: a responder is grantable for exactly the items of its default scope', () => {
 test('the emergency card and the trip\'s transport are grantable; anything beyond them is not', () => {
  const h = harness();
  const s = seed(h);
  const responder = roleOf('responder-on-trip');
  const ask = (scope: string[]) => h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: responder.id, scope, purpose: 'dispatch', expiresAt: new Date(h.at() + DAY).toISOString() });
  assert.ok(ask(responder.defaultScope).ok);
  assert.ok(ask(['emergency-card']).ok);
  refused(ask([...responder.defaultScope, 'vitals']), 'emergency-only');
 });
});

describe('sealed categories and private entries', () => {
 test('finding 1: a sealed tick that names no sealed category is refused — the caregiver\'s vitals grant that opened a private reading', () => {
  const h = harness();
  const s = seed(h);
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['vitals'], purpose: 'treatment', expiresAt: new Date(h.at() + DAY).toISOString(), sealedIncluded: true }), 'sealed-tick-names-nothing');
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['vitals', 'maternal-health'], purpose: 'treatment', expiresAt: new Date(h.at() + DAY).toISOString() }), 'sealed-not-ticked');
 });

 test('finding 1: a tick that names a sealed category opens that category and never an entry marked private', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'caregiver', scope: ['vitals', 'maternal-health'], sealedIncluded: true });
  const found = h.gateway.search(s.as(g.artefact), 'Observation', s.subject);
  assert.ok(found.ok);
  assert.deepEqual(texts(found.entries), ['Synthetic antenatal reading', 'Synthetic pulse']);
  refused(h.gateway.read(s.as(g.artefact), 'Observation', s.ids.privateVitals), 'out-of-scope');
  const doctor = s.grant({ recipientRole: 'doctor-assigned', scope: ['vitals', 'maternal-health'], sealedIncluded: true });
  const byId = h.gateway.read(s.as(doctor.artefact), 'Observation', s.ids.privateVitals);
  assert.ok(byId.ok);
  assert.equal(byId.resource, null);
  assert.equal(byId.sealedContentExists, true);
  assert.equal(JSON.stringify(byId).includes('Synthetic private reading'), false);
 });

 test('excluded without the category, and a clinician is told sealed content exists without seeing it', () => {
  const h = harness();
  const s = seed(h);
  const g = s.grant({ recipientRole: 'doctor-assigned', scope: ['vitals'] });
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
  const g = s.grant({ recipientRole: 'caregiver', scope: ['vitals'] });
  const found = h.gateway.search(s.as(g.artefact), 'Observation', s.subject);
  assert.ok(found.ok);
  assert.deepEqual(texts(found.entries), ['Synthetic pulse']);
  assert.equal('sealedContentExists' in found, false);
  refused(h.gateway.read(s.as(g.artefact), 'Observation', s.ids.maternal), 'out-of-scope');
 });

 test('finding 9: when every sealed entry was shown, the clinician is not told sealed content exists', () => {
  const h = harness();
  const s = seed(h, { withPrivate: false });
  const g = s.grant({ recipientRole: 'doctor-assigned', scope: ['vitals', 'maternal-health'], sealedIncluded: true });
  const found = h.gateway.search(s.as(g.artefact), 'Observation', s.subject);
  assert.ok(found.ok);
  assert.deepEqual(texts(found.entries), ['Synthetic antenatal reading', 'Synthetic pulse']);
  assert.equal('sealedContentExists' in found, false, 'everything sealed was shown, so nothing was left out');
 });

 test('the patient\'s own session sees everything, sealed and private included', () => {
  const h = harness();
  const s = seed(h);
  const mine = h.gateway.search(s.me, 'Observation', s.subject);
  assert.ok(mine.ok);
  assert.equal(mine.entries.length, 3);
 });

 test('sealed and private content are each under a key of their own, and nothing is stored in the clear', () => {
  const h = harness();
  const s = seed(h);
  const scopes = h.store.keyScopesFor(s.subject);
  assert.ok(scopes.includes('general'));
  assert.equal(scopes.filter(scope => scope.startsWith('sealed:')).length, 1);
  assert.equal(scopes.filter(scope => scope.startsWith('private:')).length, 1);
  const maternal = h.store.resource(s.ids.maternal)!;
  const general = h.keys.unwrapDataKey(s.subject, 'general', h.store.dataKey(s.subject, 'general')!);
  assert.throws(() => openBytes(general, maternal.sealed_body, `${s.subject}|${maternal.id}|${maternal.key_scope}|1`));
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
   resource: { code: { text: 'Synthetic nurse reading' } },
   provenance: { activity: 'home-visit-observation', sourceSystem: 'synthetic-nurse-app' }
  });
  assert.ok(written.ok, written.ok ? '' : written.reason);
  const read = h.gateway.read(s.me, 'Observation', written.id);
  assert.ok(read.ok);
  const agent = (read.provenance[0]!.agent as { type: { text: string }; who: { identifier: { value: string } } }[])[0]!;
  assert.equal(agent.type.text, 'nurse-assigned');
  assert.equal(agent.who.identifier.value, g.grantId);
  assert.equal((read.provenance[0]!.activity as { text: string }).text, 'home-visit-observation');
 });

 test('finding 5: provenance is ciphertext under the entry\'s own key — a sealed entry\'s activity is not readable in the table', () => {
  const h = harness();
  const s = seed(h);
  const written = h.gateway.write(s.me, {
   subject: s.subject, resourceType: 'Observation', category: 'maternal-health', resource: { code: { text: 'Synthetic sealed reading' } },
   provenance: { activity: 'Synthetic viral load at an antenatal visit', sourceSystem: 'synthetic-clinic-system' }
  });
  assert.ok(written.ok);
  const rows = h.store.database.prepare('SELECT * FROM provenance WHERE target = ?').all(written.id) as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  const raw = JSON.stringify(rows, (_key, value) => value instanceof Uint8Array ? Buffer.from(value).toString('latin1') : value);
  for (const leaked of ['viral load', 'antenatal', 'synthetic-clinic-system', 'patient']) assert.equal(raw.includes(leaked), false, leaked);
  const resource = h.store.resource(written.id)!;
  assert.equal(rows[0]!.key_scope, resource.key_scope);
  const general = h.keys.unwrapDataKey(s.subject, 'general', h.store.dataKey(s.subject, 'general')!);
  const p = rows[0] as { id: string; target: string; key_scope: string; sealed_body: Uint8Array };
  assert.throws(() => openBytes(general, p.sealed_body, `provenance|${s.subject}|${p.id}|${p.target}|${p.key_scope}`));
 });

 test('no provenance, no write', () => {
  const h = harness();
  const s = seed(h);
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'AllergyIntolerance', category: 'allergy', resource: {} }), 'no-provenance');
 });

 test('finding 10: the body cannot overwrite the category or the private mark the gateway decided', () => {
  const h = harness();
  const s = seed(h);
  const written = h.gateway.write(s.me, { subject: s.subject, resourceType: 'Observation', category: 'vitals', resource: { category: 'patient', markedPrivate: true, id: 'mine', code: { text: 'Synthetic override' } }, provenance: PROVENANCE });
  assert.ok(written.ok);
  const read = h.gateway.read(s.me, 'Observation', written.id);
  assert.ok(read.ok);
  assert.equal(read.resource!.category, 'vitals');
  assert.equal(read.resource!.markedPrivate, false);
  assert.equal(read.resource!.id, written.id);
 });

 test('finding 13: a name, a phone number or an identity number is refused at any depth, in any resource', () => {
  const h = harness();
  const s = seed(h);
  const write = (resourceType: string, category: string, resource: Record<string, unknown>) => h.gateway.write(s.me, { subject: s.subject, resourceType, category, resource, provenance: PROVENANCE });
  refused(write('Patient', 'patient', { name: [{ text: 'Synthetic Person' }] }), 'identity-in-resource');
  refused(write('Observation', 'vitals', { extension: [{ url: 'http://synthetic.example/patient-name', valueString: 'Synthetic Person' }] }), 'identity-in-resource');
  refused(write('Observation', 'vitals', { performer: [{ display: 'Synthetic Nurse' }] }), 'identity-in-resource');
  refused(write('Observation', 'vitals', { note: [{ text: 'Call her on 082 000 0000 if it rises' }] }), 'identity-in-resource');
  refused(write('AllergyIntolerance', 'allergy', { reaction: [{ description: 'reported by synthetic@example.invalid' }] }), 'identity-in-resource');
  refused(write('MedicationStatement', 'prescription', { medication: { text: 'Synthetic' }, deep: { deeper: { identifier: 'x' } } }), 'identity-in-resource');
  refused(h.gateway.write(s.me, { subject: s.subject, resourceType: 'Observation', category: 'vitals', resource: {}, provenance: { activity: 'visit, patient number 0000000000000', sourceSystem: 'synthetic' } }), 'identity-in-resource');
  assert.ok(write('Observation', 'vitals', { code: { coding: [{ display: 'Blood pressure' }] }, valueString: '120/80', effectiveDateTime: '2026-09-14T09:00:00+02:00' }).ok);
  assert.ok(write('Patient', 'patient', {}).ok);
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

describe('finding 11: a patient session expires, can be ended, and is parsed strictly', () => {
 test('it stops working when its lifetime is over', () => {
  const h = harness();
  const s = seed(h);
  assert.ok(h.gateway.auditMine(s.patientSession).ok);
  h.advance(31 * 60_000);
  refused(h.gateway.auditMine(s.patientSession), 'session-ended');
  refused(h.gateway.search(s.me, 'Observation', s.subject), 'session-ended');
 });
 test('it stops working the moment it is ended', () => {
  const h = harness();
  const s = seed(h);
  assert.ok(h.gateway.endSession(s.patientSession).ok);
  refused(h.gateway.grant(s.patientSession, { subject: s.subject, recipientRole: 'caregiver', scope: ['allergy'], purpose: 'treatment', expiresAt: new Date(h.at() + HOUR).toISOString() }), 'session-ended');
 });
 test('a token with an extra segment, or a signed session that was never issued, is not a session', () => {
  const h = harness();
  const s = seed(h);
  refused(h.gateway.auditMine(`${s.patientSession}.junk`), 'patient-session-required');
  refused(h.gateway.auditMine(` ${s.patientSession}`), 'patient-session-required');
 });
});
