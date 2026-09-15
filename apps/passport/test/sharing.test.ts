/**
 * Passport P1: share links, the emergency card and the export, through the consent gateway.
 *
 * Every refusal is compared with its sentence in packages/catalog/passport-gateway.json, and every end and every
 * count of uses is read from the Record settings in force, never typed here: a test that typed the default would
 * go on passing the day an admin's change stopped reaching a link.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import consent from '../../../packages/catalog/consent.json' with { type: 'json' };
import sharing from '../../../packages/catalog/passport-sharing.json' with { type: 'json' };
import { proposeChange, type Change } from '../../../packages/engines/src/settings/shape.ts';
import { recordSettings, sharingInForce } from '../../../packages/engines/src/record/domain/settings.ts';
import { DAY, HOUR, harness, roleOf, seed, sentence, statementOf, type Harness } from './harness.ts';

const refused = (result: { ok: boolean; reason?: string }, id: string) => {
 assert.equal(result.ok, false, `expected a refusal: ${id}`);
 assert.equal(result.reason, sentence(id));
};
const defaults = sharingInForce([]);
const iso = (at: number) => new Date(at).toISOString();
const maxDays = (role: string) => roleOf(role).maxExpiryDays;
const texts = (resources: Record<string, unknown>[]) => resources.map(r => ((r.code ?? r.medication) as { text: string }).text).sort();
const keys = (() => { let n = 0; return () => `use-${++n}`; })();

/* A patient, a grant of the role's longest, and a way to make links on it and open them. */
function world(h: Harness, role = 'doctor-assigned', scope = ['allergy', 'prescription', 'vitals', 'emergency-card'], extra: { sealedIncluded?: boolean; purpose?: string } = {}) {
 const s = seed(h);
 const g = s.grant({ recipientRole: role, scope, expiresAt: iso(h.at() + maxDays(role) * DAY), ...extra });
 const link = (fields: Record<string, unknown> = {}) => h.gateway.createLink(s.patientSession, { grantId: g.grantId, recipientRole: role, kindCode: 'share-link', ...fields });
 const made = (fields: Record<string, unknown> = {}) => {
  const answer = link(fields);
  if (!answer.ok) throw new Error(answer.reason);
  return answer;
 };
 const open = (secret: string, key = keys()) => h.gateway.openLink(secret, key);
 return { s, g, link, made, open };
}

describe('a share link is made on a grant, opened as its recipient, and counted', () => {
 test('made and opened: the scope the patient chose, the setting in force for its end and its uses', () => {
  const h = harness();
  const w = world(h);
  const l = w.made({ scope: ['allergy'] });
  assert.equal(Date.parse(l.expiresAt), h.at() + defaults.linkLifetimeDays * DAY);
  assert.equal(l.usesAllowed, defaults.linkMaxUses);
  assert.equal(l.settingsVersion, defaults.settingsVersion);
  assert.deepEqual(l.scope, ['allergy']);
  const opened = w.open(l.linkSecret);
  assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  assert.deepEqual(opened.opened.map(o => o.category), ['allergy']);
  assert.deepEqual(texts(opened.opened[0]!.resources), ['Synthetic allergen A']);
  assert.equal(opened.purpose, w.g.grant.purpose);
  assert.equal(opened.usesLeft, defaults.linkMaxUses - 1);
 });

 test('left out, the scope is the default in force, which opens the emergency summary and nothing else', () => {
  const h = harness();
  const w = world(h);
  assert.equal(defaults.linkDefaultScope, 'emergency-summary', 'the contract default changed; this test reads what it opens');
  const l = w.made();
  assert.deepEqual(l.scope, ['emergency-card']);
  const opened = w.open(l.linkSecret);
  assert.ok(opened.ok);
  assert.deepEqual(texts(opened.opened[0]!.resources), ['Synthetic allergen A', 'Synthetic medicine B']);
 });

 test('use-count: the same key twice is one use, and a use beyond the uses is refused', () => {
  const h = harness();
  const w = world(h);
  const l = w.made({ scope: ['allergy'] });
  assert.ok(w.open(l.linkSecret, 'retry').ok);
  const again = w.open(l.linkSecret, 'retry');
  assert.ok(again.ok);
  assert.equal(again.usesLeft, defaults.linkMaxUses - 1, 'a retry with the same key counted as a second use');
  for (let i = 1; i < defaults.linkMaxUses; i++) assert.ok(w.open(l.linkSecret).ok);
  refused(w.open(l.linkSecret), 'link-used-up');
  assert.ok(w.open(l.linkSecret, 'retry').ok, 'a use already counted is still the same use');
  refused(h.gateway.openLink(l.linkSecret, ''), 'idempotency-key-required');
 });

 test('expiry: a link ends at its end, and at its grant\'s end when that comes first', () => {
  const h = harness();
  const w = world(h);
  const l = w.made({ scope: ['allergy'] });
  h.advance(defaults.linkLifetimeDays * DAY - 1);
  assert.ok(w.open(l.linkSecret).ok);
  h.advance(1);
  refused(w.open(l.linkSecret), 'link-expired');

  const short = harness();
  const s = seed(short);
  const g = s.grant({ recipientRole: 'doctor-assigned', scope: ['allergy'], expiresAt: iso(short.at() + 2 * DAY) });
  const early = short.gateway.createLink(s.patientSession, { grantId: g.grantId, recipientRole: 'doctor-assigned', kindCode: 'share-link', scope: ['allergy'] });
  assert.ok(early.ok);
  assert.equal(early.expiresAt, g.grant.expiresAt, 'a link outlived the grant it rides on');
 });

 test('the end asked for: past the ceiling, past the setting in force, past the grant, or already past', () => {
  const h = harness();
  const w = world(h);
  refused(w.link({ scope: ['allergy'], expiresAt: iso(h.at() + (consent.grants.maximumExpiryDays + 1) * DAY) }), 'link-beyond-the-ceiling');
  refused(w.link({ scope: ['allergy'], expiresAt: iso(h.at() + defaults.linkLifetimeDays * DAY + HOUR) }), 'link-longer-than-allowed');
  refused(w.link({ scope: ['allergy'], expiresAt: iso(h.at() - HOUR) }), 'link-expired');
  const asked = w.made({ scope: ['allergy'], expiresAt: iso(h.at() + DAY) });
  assert.equal(Date.parse(asked.expiresAt), h.at() + DAY);

  const s = seed(h);
  const g = s.grant({ recipientRole: 'doctor-assigned', scope: ['allergy'], expiresAt: iso(h.at() + 2 * DAY) });
  refused(h.gateway.createLink(s.patientSession, { grantId: g.grantId, recipientRole: 'doctor-assigned', kindCode: 'share-link', scope: ['allergy'], expiresAt: iso(h.at() + 3 * DAY) }), 'link-outlives-its-grant');
 });

 test('revocation: a revoked link refuses its next use, and revoking the grant closes every link on it', () => {
  const h = harness();
  const w = world(h);
  const one = w.made({ scope: ['allergy'] });
  const two = w.made({ scope: ['prescription'] });
  assert.ok(w.open(one.linkSecret).ok);
  const revoked = h.gateway.revokeLink(w.s.patientSession, one.linkRef);
  assert.ok(revoked.ok);
  refused(w.open(one.linkSecret), 'link-revoked');
  assert.ok(h.gateway.revokeLink(w.s.patientSession, one.linkRef).ok, 'a second revocation is refused');
  assert.ok(w.open(two.linkSecret).ok);
  assert.ok(h.gateway.revoke(w.s.patientSession, w.g.grantId).ok);
  refused(w.open(two.linkSecret), 'revoked');
  refused(w.link({ scope: ['allergy'] }), 'revoked');
 });

 test('a secret the Passport did not issue, or one altered, is one refusal, and names nobody\'s record', () => {
  const h = harness();
  const w = world(h);
  const l = w.made({ scope: ['allergy'] });
  const before = h.auditRows().length;
  refused(w.open(''), 'link-not-recognised');
  refused(w.open(`${l.linkSecret.slice(0, -2)}xx`), 'link-not-recognised');
  refused(w.open(`${l.linkRef}.${'A'.repeat(32)}`), 'link-not-recognised');
  const rows = h.auditRows().slice(before);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.subject === null && row.requester_role === 'unauthenticated' && row.outcome === 'refused'));
 });
});

describe('what a link will not be', () => {
 test('no link to a scheme, an insurer or an employer, whatever grant is named, and asked before the grant', () => {
  const h = harness();
  const w = world(h);
  for (const payer of sharing.links.neverTo.map(p => p.id)) refused(w.link({ recipientRole: payer, scope: ['allergy'] }), 'link-to-a-payer');
  refused(h.gateway.createLink(w.s.patientSession, { grantId: 'grant_that-does-not-exist', recipientRole: 'employer', kindCode: 'share-link' }), 'link-to-a-payer');
  for (const role of consent.grants.recipientRoles.filter(r => r.gateway.reads === 'aggregate')) refused(w.link({ recipientRole: role.id }), 'link-to-a-payer');
 });

 test('no scope wider than the grant, no recipient but the grant\'s, no kind nobody declared, no grant of somebody else\'s', () => {
  const h = harness();
  const w = world(h, 'doctor-assigned', ['allergy']);
  refused(w.link({ scope: ['allergy', 'prescription'] }), 'link-wider-than-grant');
  refused(w.link({ scope: ['not-a-category'] }), 'unknown-category');
  refused(w.link({ recipientRole: 'nurse-assigned', scope: ['allergy'] }), 'link-recipient-not-the-grants');
  refused(w.link({ kindCode: 'forever' }), 'link-kind-unknown');
  const other = seed(h);
  refused(h.gateway.createLink(other.patientSession, { grantId: w.g.grantId, recipientRole: 'doctor-assigned', kindCode: 'share-link', scope: ['allergy'] }), 'not-found');
  assert.ok(h.gateway.audit.forSubject(w.s.subject).some(entry => (entry.type as { code: string }).code === 'share.link.create.probe'), 'a probe of this patient\'s grant is not in their log');
 });

 test('sealed content: refused without the patient\'s named tick, and a tick the grant did not give is wider than the grant', () => {
  const h = harness();
  const w = world(h, 'doctor-assigned', ['allergy', 'vitals', 'maternal-health'], { sealedIncluded: true });
  refused(w.link({ scope: ['maternal-health'] }), 'sealed-not-ticked');
  refused(w.link({ scope: ['allergy'], sealedIncluded: true }), 'sealed-tick-names-nothing');
  const sealed = w.made({ scope: ['maternal-health', 'vitals'], sealedIncluded: true });
  const opened = w.open(sealed.linkSecret);
  assert.ok(opened.ok);
  assert.deepEqual(texts(opened.opened.find(o => o.category === 'maternal-health')!.resources), ['Synthetic antenatal reading']);
  assert.deepEqual(texts(opened.opened.find(o => o.category === 'vitals')!.resources), ['Synthetic pulse'], 'a link opened an entry the patient marked private');

  const plain = world(h, 'doctor-assigned', ['vitals']);
  refused(plain.link({ scope: ['vitals'], sealedIncluded: true }), 'link-wider-than-grant');
 });

 test('an emergency card opens the emergency summary alone, never a sealed category, and is the only link a responder carries', () => {
  const h = harness();
  const w = world(h, 'next-of-kin', ['emergency-card'], { purpose: 'emergency' });
  refused(w.link({ kindCode: 'emergency-card', scope: ['allergy'] }), 'emergency-card-beyond-the-summary');
  refused(w.link({ kindCode: 'emergency-card', sealedIncluded: true }), 'emergency-card-beyond-the-summary');
  const card = w.made({ kindCode: 'emergency-card' });
  assert.deepEqual(card.scope, ['emergency-card']);
  assert.equal(card.usesAllowed, defaults.cardMaxUses);
  assert.equal(Date.parse(card.expiresAt), h.at() + Math.min(defaults.cardLifetimeDays, maxDays('next-of-kin')) * DAY);
  const opened = w.open(card.linkSecret);
  assert.ok(opened.ok);
  assert.deepEqual(texts(opened.opened[0]!.resources), ['Synthetic allergen A', 'Synthetic medicine B']);

  const trip = world(h, 'responder-on-trip', ['emergency-card'], { purpose: 'dispatch' });
  refused(trip.link({}), 'emergency-only');
  const tripCard = trip.made({ kindCode: 'emergency-card' });
  assert.equal(tripCard.expiresAt, trip.g.grant.expiresAt, 'a responder\'s card outlived the trip grant');
 });
});

describe('a settings change reaches the next link and never one already made', () => {
 test('a longer lifetime and more uses in force do not lengthen or widen a link made before them', () => {
  let history: Change[] = [];
  const h = harness({ settings: () => sharingInForce(history) });
  const change = (setting: string, value: number) => {
   const result = proposeChange(recordSettings, history, { setting, value, reason: 'Synthetic, for the Passport P1 test.', expectedVersion: sharingInForce(history).settingsVersion, byRole: 'admin', byRef: 'party-admin-test' }, h.at());
   if (!result.ok) throw new Error(result.refusal.statement);
   history = [...history, result.value.change];
  };
  const w = world(h);
  const before = w.made({ scope: ['allergy'] });
  change('share-link-lifetime-days', defaults.linkLifetimeDays + 3);
  change('share-link-max-uses', defaults.linkMaxUses + 5);
  const after = w.made({ scope: ['allergy'] });
  assert.equal(after.settingsVersion, defaults.settingsVersion + 2);
  assert.equal(after.usesAllowed, defaults.linkMaxUses + 5);
  assert.equal(Date.parse(after.expiresAt), h.at() + (defaults.linkLifetimeDays + 3) * DAY);

  assert.equal(before.settingsVersion, defaults.settingsVersion);
  for (let i = 0; i < defaults.linkMaxUses; i++) assert.ok(w.open(before.linkSecret).ok);
  refused(w.open(before.linkSecret), 'link-used-up');
  const kept = h.store.link(before.linkRef)!;
  assert.equal(kept.uses_allowed, defaults.linkMaxUses);
  assert.equal(kept.expires_at, Date.parse(before.expiresAt));
  h.advance(defaults.linkLifetimeDays * DAY);
  refused(w.open(before.linkSecret, 'late'), 'link-expired');
  assert.ok(w.open(after.linkSecret).ok, 'the link made under the longer lifetime ended at the old one');
 });
});

describe('the export', () => {
 test('a FHIR R4 bundle with what it includes and leaves out as declared, and no step-up, said plainly', () => {
  const h = harness();
  const s = seed(h);
  const exported = h.gateway.exportRecord(s.patientSession, { format: 'fhir-bundle' });
  assert.ok(exported.ok, exported.ok ? '' : exported.reason);
  assert.equal(exported.bundle.resourceType, 'Bundle');
  assert.equal(exported.bundle.type, 'collection');
  const ids = exported.bundle.entry.map(e => e.resource.id);
  for (const id of [s.ids.allergy, s.ids.vitals, s.ids.medicine]) assert.ok(ids.includes(id), `left out ${id}`);
  assert.equal(ids.includes(s.ids.maternal), false, 'a sealed entry was exported without a tick');
  assert.equal(ids.includes(s.ids.privateVitals), false, 'a private entry was exported');
  const provenance = exported.bundle.entry.filter(e => e.resource.resourceType === 'Provenance');
  assert.equal(provenance.length, 3, 'every exported entry carries its provenance, and only those');
  assert.deepEqual(exported.exclusions.map(e => e.excludedCode), sharing.export.exclusions.map(e => e.id));
  assert.deepEqual(exported.exclusions.map(e => e.statement), sharing.export.exclusions.map(e => e.sentence));
  assert.equal(exported.stepUp, sharing.export.stepUp.sentence);
  assert.equal(sharing.export.stepUp.passportHasOne, false);

  const ticked = h.gateway.exportRecord(s.patientSession, { format: 'fhir-bundle', sealedCategories: ['maternal-health'] });
  assert.ok(ticked.ok);
  const tickedIds = ticked.bundle.entry.map(e => e.resource.id);
  assert.ok(tickedIds.includes(s.ids.maternal));
  assert.equal(tickedIds.includes(s.ids.privateVitals), false);

  for (const format of sharing.export.formats.filter(f => !f.built).map(f => f.id)) refused(h.gateway.exportRecord(s.patientSession, { format }), 'export-format-not-built');
  refused(h.gateway.exportRecord(s.patientSession, { format: 'fhir-bundle', sealedCategories: ['vitals'] }), 'sealed-tick-names-nothing');
  refused(h.gateway.exportRecord(s.patientSession, { format: 'fhir-bundle', sealedCategories: ['nonsense'] }), 'unknown-category');
  refused(h.gateway.exportRecord('', { format: 'fhir-bundle' }), 'patient-session-required');
 });
});

describe('every link made, opened, refused and revoked, and every export, is in the patient\'s own log', () => {
 test('read at /audit/mine, with the reason the chain carries and never the secret', () => {
  const h = harness();
  const w = world(h);
  const l = w.made({ scope: ['allergy'] });
  assert.ok(w.open(l.linkSecret).ok);
  for (let i = 1; i < defaults.linkMaxUses; i++) assert.ok(w.open(l.linkSecret).ok);
  refused(w.open(l.linkSecret), 'link-used-up');
  refused(w.link({ recipientRole: 'employer' }), 'link-to-a-payer');
  assert.ok(h.gateway.revokeLink(w.s.patientSession, l.linkRef).ok);
  assert.ok(h.gateway.exportRecord(w.s.patientSession, { format: 'fhir-bundle' }).ok);

  const mine = h.gateway.auditMine(w.s.patientSession);
  assert.ok(mine.ok);
  assert.equal(mine.chain.intact, true);
  const entries = mine.entries as { type: { code: string }; outcome: string; outcomeDesc: string; agent: { type: { text: string }; who?: { identifier: { value: string } } }[]; purposeOfEvent: { text: string }[] }[];
  const of = (code: string) => entries.filter(e => e.type.code === code);
  assert.equal(of('share.link.create').filter(e => e.outcome === '0').length, 1);
  assert.ok(of('share.link.create').some(e => e.outcome === '4' && e.outcomeDesc === sentence('link-to-a-payer')));
  const uses = of('share.link.use');
  assert.equal(uses.filter(e => e.outcome === '0').length, defaults.linkMaxUses);
  assert.ok(uses.filter(e => e.outcome === '0').every(e => e.outcomeDesc === statementOf('linkUsed') && e.agent[0]!.type.text === 'doctor-assigned' && e.agent[0]!.who?.identifier.value === l.linkRef && e.purposeOfEvent[0]?.text === w.g.grant.purpose));
  assert.ok(uses.some(e => e.outcome === '4' && e.outcomeDesc === sentence('link-used-up')));
  assert.equal(of('share.link.revoke').length, 1);
  assert.ok(of('export').some(e => e.outcome === '0' && e.outcomeDesc === statementOf('exported')));
  assert.equal(JSON.stringify(h.auditRows()).includes(l.linkSecret.split('.')[1]!), false, 'the link secret was written into the chain');
 });
});
