/**
 * Consent, and the log of who opened a record.
 *
 * The whole of this file runs against the real protection module — a real key ring, the real gate,
 * the real hash chain — for the same reason capture.test.ts does: the two claims worth testing are
 * that an access cannot get past the gate and that nothing written down here is a reading, and
 * neither can be tested against a stub that says yes.
 *
 * The other half is the contract. Every sentence a person is shown comes out of
 * packages/catalog/consent.json, so what is asserted below is the behaviour those sentences promise
 * — that an old consent does not become a new one, that refusing an optional consent cannot reach
 * the care decision at all, and that a refused access is written down like an allowed one.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import vetting from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { ConfigError, loadConfig } from '../src/config.ts';
import { createProtectionModule, type ActorVetting, type CheckRecord } from '../src/protection/index.ts';
import { HOLDINGS, RETENTION_BASES } from '../src/personalData.ts';
import {
 ACCESS_BASES, ConsentRegister, LAWFUL_BASES, PURPOSES, RULES, RecordAccessLog, ROUTES,
 currentVersion, openConsentStore, optionalPurposes, purposeById, requiredPurposes,
 verifyProof, versionOf, wordingHash,
 type AccessAttempt, type ConsentStore
} from '../src/consent/index.ts';

const NOW = Date.UTC(2026, 8, 6, 9, 0, 0);
const DAY = 86_400_000;
const IN_DATE = '2027-06-01';
const PATIENT = 'patient-1';

/** Every check the role carries, verified, in date, high-risk ones seconded. */
function cleared(roleId: string, overrides: Record<string, Partial<CheckRecord>> = {}): CheckRecord[] {
 const role = vetting.roles.find(candidate => candidate.id === roleId)!;
 return role.checks.map(check => ({
  checkId: check.id, state: 'verified' as const, expiresOn: IN_DATE,
  ...(check.risk === 'high' ? { secondedBy: 'reviewer-2' } : {}),
  ...overrides[check.id]
 }));
}

function harness(options: { actors?: ActorVetting[] } = {}) {
 let clock = NOW;
 const now = () => clock;
 const db = new DatabaseSync(':memory:');
 const actors = new Map((options.actors ?? [
  { actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse') },
  { actorId: 'doctor-1', roleId: 'doctor', records: cleared('doctor') }
 ]).map(actor => [actor.actorId, actor] as const));
 const protection = createProtectionModule(
  { environment: 'development', protectionKeys: `1:${randomBytes(32).toString('hex')}` },
  db,
  { vetting: { find: actorId => actors.get(actorId) ?? null }, releases: { find: () => null }, now }
 )!;
 const store: ConsentStore = openConsentStore(db);
 const consent = new ConsentRegister({ store, now });
 const log = new RecordAccessLog({ gate: protection.gate, store, consent, now });
 return {
  db, store, consent, log, actors, protection, now,
  at: (ms: number) => { clock = ms; },
  advance: (ms: number) => { clock += ms; },
  /* Straight out of the tables, so what is asserted is what is on disk rather than what a method
     chose to hand back. */
  rows: () => db.prepare('SELECT * FROM record_access_log ORDER BY seq').all() as unknown as Record<string, unknown>[],
  decisions: () => db.prepare('SELECT * FROM consent_decisions ORDER BY seq').all() as unknown as Record<string, unknown>[],
  chain: () => db.prepare('SELECT * FROM protected_access_log ORDER BY seq').all() as unknown as Record<string, unknown>[]
 };
}

const give = (purposeId: string, over: Partial<{ version: number; route: string; locale: string }> = {}) => ({
 purposeId,
 version: currentVersion(purposeById(purposeId)!).version,
 route: 'web-account',
 locale: 'en-ZA',
 ...over
});

const read = (over: Partial<AccessAttempt> = {}): AccessAttempt => ({
 actorId: 'nurse-1', actorRole: 'nurse', actorLabel: 'Sister Naledi Mokoena · SANC 21847',
 capability: 'view-clinical-record', purpose: 'treatment',
 lawfulBasis: 's11a-consent', consentPurpose: 'care-delivery',
 recordType: 'vitals', recordId: 'V-1', subjectId: PATIENT, field: 'reading-1',
 ...over
});

/* ---- The contract ----------------------------------------------------------------------------- */

describe('the consent contract', () => {
 test('every purpose names a lawful basis that is actually in the register', () => {
  const bases = new Set(LAWFUL_BASES.map(basis => basis.id));
  for (const purpose of PURPOSES) {
   assert.ok(bases.has(purpose.lawfulBasis), `${purpose.id} names "${purpose.lawfulBasis}"`);
   assert.ok(purpose.lawfulBasis.startsWith('s'), `${purpose.id} should point at a section somebody can go and read`);
  }
  for (const basis of LAWFUL_BASES) assert.ok(basis.authority.length > 40, `${basis.id} does not name the instrument it rests on`);
 });

 test('required and optional are two lists, and between them they are the whole contract', () => {
  assert.ok(requiredPurposes().length, 'a contract with nothing required cannot say what care depends on');
  assert.ok(optionalPurposes().length, 'a consent screen on which everything is compulsory is a terms-of-service page');
  assert.equal(requiredPurposes().length + optionalPurposes().length, PURPOSES.length);
  for (const purpose of requiredPurposes()) assert.ok(purpose.requiredBecause, `${purpose.id} is required and does not say why`);
 });

 test('not one optional purpose admits to degrading care, which is the whole of the split', () => {
  for (const purpose of optionalPurposes()) {
   assert.equal(purpose.degradesCare, false, purpose.id);
   assert.ok(purpose.ifRefused.length > 30, `${purpose.id} does not say what refusing it costs`);
  }
 });

 test('no version carries an earlier consent forward, and versions ascend', () => {
  for (const purpose of PURPOSES) {
   let previous = 0;
   for (const version of purpose.versions) {
    assert.ok(version.version > previous, `${purpose.id} version ${version.version} does not follow ${previous}`);
    previous = version.version;
    assert.equal(version.carriesOver, false, `${purpose.id} v${version.version}`);
    assert.ok(version.withdrawalWording.length > 10, `${purpose.id} v${version.version} does not say what could be withdrawn`);
   }
  }
 });

 test('anything kept after a withdrawal names a ground and says why, in words for the person', () => {
  const bases = new Set(LAWFUL_BASES.map(basis => basis.id));
  for (const purpose of PURPOSES) {
   for (const kept of purpose.retainedOnWithdrawal) {
    assert.ok(bases.has(kept.basis), `${purpose.id} keeps "${kept.what}" on an unknown ground`);
    assert.ok(kept.because.length > 60, `${purpose.id} keeps "${kept.what}" without explaining it`);
    assert.ok(!/\b(row|column|table|nullable|schema)\b/i.test(kept.because), `${purpose.id} explains "${kept.what}" to a developer`);
   }
  }
 });

 test('an acknowledgement is not a consent, and says so about itself', () => {
  const notice = PURPOSES.find(purpose => purpose.kind === 'acknowledgement')!;
  assert.ok(notice, 'the contract should distinguish being told something from agreeing to it');
  assert.equal(notice.withdrawable, false);
  assert.match(RULES.anAcknowledgementIsNotAConsent, /manufactured a permission/);
 });
});

/* ---- The proof --------------------------------------------------------------------------------- */

describe('the fingerprint of what was shown', () => {
 test('it is over the words, so the same purpose at two versions gives two different proofs', () => {
  const care = purposeById('care-delivery')!;
  const first = wordingHash(care.id, versionOf(care, 1)!);
  const second = wordingHash(care.id, versionOf(care, 2)!);
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
 });

 test('the same sentence under two purposes does not produce one proof that fits both', () => {
  const version = { version: 1, effectiveDays: -1, wording: 'The same words.', withdrawalWording: 'The same way out.', change: '', carriesOver: false };
  assert.notEqual(wordingHash('care-delivery', version), wordingHash('product-updates', version));
 });

 test('the withdrawal sentence is part of the proof, because it is part of being informed', () => {
  const base = { version: 1, effectiveDays: -1, wording: 'Words.', change: '', carriesOver: false };
  const told = wordingHash('x', { ...base, withdrawalWording: 'One tap, any time.' });
  const notTold = wordingHash('x', { ...base, withdrawalWording: 'Write to us.' });
  assert.notEqual(told, notTold, 'a platform that could quietly edit the way out has edited the consent');
 });

 test('a proof stops verifying if the words it was taken of are not the words on file', () => {
  const care = purposeById('care-delivery')!;
  assert.equal(verifyProof('care-delivery', 2, wordingHash(care.id, versionOf(care, 2)!)), true);
  assert.equal(verifyProof('care-delivery', 2, wordingHash(care.id, versionOf(care, 1)!)), false);
  assert.equal(verifyProof('care-delivery', 2, 'f'.repeat(64)), false);
  assert.equal(verifyProof('no-such-purpose', 1, 'f'.repeat(64)), false);
 });
});

/* ---- Giving it -------------------------------------------------------------------------------- */

describe('giving consent', () => {
 test('what is recorded is the version, the fingerprint, the route and the language', () => {
  const h = harness();
  const result = h.consent.give(PATIENT, give('care-delivery', { locale: 'zu-ZA' }));
  assert.ok(result.ok);
  assert.equal(result.repeated, false);
  assert.equal(result.decision.version, 2);
  assert.equal(result.decision.wordingHash, wordingHash('care-delivery', currentVersion(purposeById('care-delivery')!)));
  assert.equal(result.decision.route, 'web-account');
  assert.equal(result.decision.locale, 'zu-ZA');
  assert.equal(result.decision.at, NOW);
  assert.equal(h.consent.authorises(PATIENT, 'care-delivery'), true);
 });

 test('a decision naming wording that is no longer in force is refused, not silently upgraded', () => {
  const h = harness();
  const result = h.consent.give(PATIENT, give('care-delivery', { version: 1 }));
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /now on version 2 and this decision names version 1/);
  assert.match((result as { reason: string }).reason, /does not become consent to the new one/);
  assert.equal(h.decisions().length, 0, 'a consent nobody could have given is not written down');
 });

 test('a repeat changes nothing and does not look like a second asking', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('product-updates')).ok);
  h.advance(DAY);
  const again = h.consent.give(PATIENT, give('product-updates'));
  assert.ok(again.ok);
  assert.equal(again.repeated, true);
  assert.equal(again.decision.at, NOW, 'the original decision is what comes back');
  assert.equal(h.decisions().length, 1);
 });

 test('an unknown purpose, an unknown route and a missing language are all refused', () => {
  const h = harness();
  assert.match((h.consent.give(PATIENT, give('product-updates', {})) as { reason?: string }).reason ?? '', /^$/);
  const unknown = h.consent.give(PATIENT, { purposeId: 'invented', version: 1, route: 'web-account', locale: 'en-ZA' });
  assert.equal(unknown.ok, false);
  assert.match((unknown as { reason: string }).reason, /will not invent one/);
  const route = h.consent.give(PATIENT, give('wearable-readings', { route: 'shouted-across-the-street' }));
  assert.equal(route.ok, false);
  assert.match((route as { reason: string }).reason, /not a route consent may be recorded through/);
  const locale = h.consent.give(PATIENT, give('wearable-readings', { locale: '' }));
  assert.equal(locale.ok, false);
  assert.match((locale as { reason: string }).reason, /could not read did not agree/);
 });

 test('being asked and saying no is a fact of its own, not an absence', () => {
  const h = harness();
  assert.ok(h.consent.refuse(PATIENT, give('service-improvement')).ok);
  const standing = h.consent.standingFor(PATIENT, 'service-improvement');
  assert.equal(standing.state, 'refused');
  assert.equal(standing.authorises, false);
  assert.equal(standing.history.length, 1);
  assert.notEqual(h.consent.standingFor(PATIENT, 'wearable-readings').state, 'refused');
  assert.equal(h.consent.standingFor(PATIENT, 'wearable-readings').state, 'never-asked');
 });

 test('the four routes are the contract\'s, and a nurse reading it aloud is recorded as her act', () => {
  const h = harness();
  assert.deepEqual(ROUTES.map(route => route.id).sort(), ['guardian', 'paper-at-corner', 'spoken-at-visit', 'web-account']);
  const spoken = h.consent.give(PATIENT, { ...give('care-delivery'), route: 'spoken-at-visit', recordedBy: 'nurse-1', recordedAs: 'nurse' });
  assert.ok(spoken.ok);
  assert.equal(spoken.decision.recordedBy, 'nurse-1');
  assert.equal(spoken.decision.recordedAs, 'nurse');
 });
});

/* ---- The version does not carry ---------------------------------------------------------------- */

describe('when the wording changes, the old consent does not become the new one', () => {
 /* Seeded straight into the store, because that is the state this is about: somebody who agreed to
    version 1 back when version 1 was the wording in force. */
 const seedV1 = (h: ReturnType<typeof harness>, purposeId: string) => {
  const purpose = purposeById(purposeId)!;
  const version = versionOf(purpose, 1)!;
  return h.store.record({
   id: 'seeded-1', subjectId: PATIENT, purposeId, purposeKind: purpose.kind, version: 1,
   decision: 'given', wordingHash: wordingHash(purposeId, version), route: 'web-account',
   locale: 'en-ZA', recordedBy: PATIENT, recordedAs: 'self', at: NOW - 400 * DAY, givenReason: null
  });
 };

 test('the standing says so, and does not authorise anything', () => {
  const h = harness();
  seedV1(h, 'care-delivery');
  const standing = h.consent.standingFor(PATIENT, 'care-delivery');
  assert.equal(standing.state, 'held-on-superseded-version');
  assert.equal(standing.authorises, false);
  assert.equal(standing.heldVersion, 1);
  assert.equal(standing.current.version, 2);
  assert.match(standing.reconsentBecause!, /asked again/);
 });

 test('the old decision is left exactly as it was — valid, and about the old words', () => {
  const h = harness();
  seedV1(h, 'care-delivery');
  const standing = h.consent.standingFor(PATIENT, 'care-delivery');
  assert.equal(standing.proofIntact, true, 'a version 1 consent is still a real consent to version 1');
  assert.equal(h.decisions().length, 1);
  assert.equal(h.decisions()[0]!.version, 1);
  /* And giving the current one adds a line rather than correcting the old one. */
  assert.ok(h.consent.give(PATIENT, give('care-delivery')).ok);
  assert.equal(h.decisions().length, 2);
  assert.deepEqual(h.decisions().map(row => row.version), [1, 2]);
 });

 test('care is blocked until they are asked again, and the reason names the change', () => {
  const h = harness();
  seedV1(h, 'care-delivery');
  assert.ok(h.consent.give(PATIENT, give('processing-notice')).ok);
  const care = h.consent.careStanding(PATIENT);
  assert.equal(care.mayReceiveCare, false);
  assert.equal(care.missing.length, 1);
  assert.equal(care.missing[0]!.purpose.id, 'care-delivery');
  assert.match(care.missing[0]!.because, /asked again|does not become consent/);
 });

 test('an old optional consent does not keep the messages flowing either', () => {
  const h = harness();
  seedV1(h, 'product-updates');
  assert.equal(h.consent.authorises(PATIENT, 'product-updates'), false);
  assert.match(h.consent.standingFor(PATIENT, 'product-updates').reconsentBecause!, /not carried forward|does not become/);
 });
});

/* ---- Withdrawal ------------------------------------------------------------------------------- */

describe('withdrawal', () => {
 test('takes one call, no reason, and nothing else asked of anybody', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('product-updates')).ok);
  h.advance(DAY);
  const withdrawn = h.consent.withdraw(PATIENT, { purposeId: 'product-updates', route: 'web-account' });
  assert.ok(withdrawn.ok);
  assert.equal(withdrawn.decision.decision, 'withdrawn');
  assert.equal(withdrawn.decision.givenReason, null, 'a withdrawal that demands a reason is not as easy as the tick was');
  assert.equal(h.consent.authorises(PATIENT, 'product-updates'), false);
  assert.equal(h.consent.standingFor(PATIENT, 'product-updates').state, 'withdrawn');
 });

 test('it is an entry, not the deletion of one', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('wearable-readings')).ok);
  assert.ok(h.consent.withdraw(PATIENT, { purposeId: 'wearable-readings', route: 'web-account' }).ok);
  const rows = h.decisions();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.decision), ['given', 'withdrawn']);
  assert.match(RULES.withdrawalIsRecorded, /different facts/);
 });

 test('it says what is kept anyway, with the ground for each', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('care-delivery')).ok);
  const withdrawn = h.consent.withdraw(PATIENT, { purposeId: 'care-delivery', route: 'web-account' });
  assert.ok(withdrawn.ok);
  assert.ok(withdrawn.retained.length >= 2);
  assert.ok(withdrawn.retained.some(kept => /six years from the last entry/.test(kept.because)));
  assert.ok(withdrawn.retained.every(kept => kept.basis.startsWith('s')));
  assert.match(withdrawn.alsoStops, /does not delete what was lawfully processed/);
 });

 test('it is recorded against the version that was actually being relied on', () => {
  const h = harness();
  const purpose = purposeById('product-updates')!;
  h.store.record({
   id: 'old', subjectId: PATIENT, purposeId: purpose.id, purposeKind: purpose.kind, version: 1,
   decision: 'given', wordingHash: wordingHash(purpose.id, versionOf(purpose, 1)!), route: 'web-account',
   locale: 'en-ZA', recordedBy: PATIENT, recordedAs: 'self', at: NOW - 400 * DAY, givenReason: null
  });
  const withdrawn = h.consent.withdraw(PATIENT, { purposeId: 'product-updates', route: 'web-account' });
  assert.ok(withdrawn.ok);
  assert.equal(withdrawn.decision.version, 1, 'withdrawing a version 1 consent is withdrawing version 1');
 });

 test('withdrawing what was never given is refused rather than written down', () => {
  const h = harness();
  const withdrawn = h.consent.withdraw(PATIENT, { purposeId: 'wearable-readings', route: 'web-account' });
  assert.equal(withdrawn.ok, false);
  assert.match((withdrawn as { reason: string }).reason, /read afterwards as though you had once agreed/);
  assert.equal(h.decisions().length, 0);
 });

 test('withdrawing twice is refused, and the first withdrawal keeps its date', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('service-improvement')).ok);
  assert.ok(h.consent.withdraw(PATIENT, { purposeId: 'service-improvement', route: 'web-account' }).ok);
  h.advance(DAY);
  const again = h.consent.withdraw(PATIENT, { purposeId: 'service-improvement', route: 'web-account' });
  assert.equal(again.ok, false);
  assert.match((again as { reason: string }).reason, /already withdrawn/);
  assert.equal(h.decisions().length, 2);
 });

 test('an acknowledgement cannot be withdrawn, because nobody can un-read a notice', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('processing-notice')).ok);
  const withdrawn = h.consent.withdraw(PATIENT, { purposeId: 'processing-notice', route: 'web-account' });
  assert.equal(withdrawn.ok, false);
  assert.match((withdrawn as { reason: string }).reason, /not a permission you gave/);
  assert.equal(h.consent.standingFor(PATIENT, 'processing-notice').state, 'held');
 });
});

/* ---- Required and optional --------------------------------------------------------------------- */

describe('the required and the optional', () => {
 test('care is blocked until every required purpose is held on the wording in force', () => {
  const h = harness();
  assert.equal(h.consent.careStanding(PATIENT).mayReceiveCare, false);
  assert.equal(h.consent.careStanding(PATIENT).missing.length, requiredPurposes().length);
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  const care = h.consent.careStanding(PATIENT);
  assert.equal(care.mayReceiveCare, true);
  assert.match(care.sentence, /on the wording currently in force/);
 });

 /* The invariant the whole split exists for, asserted from both ends: refusing every optional
    consent leaves care untouched, and no optional purpose has any route to the care decision. */
 test('refusing every optional consent changes nothing about care', () => {
  const h = harness();
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  for (const purpose of optionalPurposes()) assert.ok(h.consent.refuse(PATIENT, give(purpose.id)).ok);
  const care = h.consent.careStanding(PATIENT);
  assert.equal(care.mayReceiveCare, true);
  assert.equal(care.missing.length, 0);
  assert.doesNotMatch(care.sentence, /tips|news|watch|band|improve/i);
 });

 test('an optional purpose cannot reach the care decision even when every one of them is missing', () => {
  const h = harness();
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  const optionalIds = new Set(optionalPurposes().map(purpose => purpose.id));
  assert.ok(h.consent.careStanding(PATIENT).mayReceiveCare);
  /* And with the required ones gone, the missing list is still only ever the required ones. */
  const empty = harness();
  for (const entry of empty.consent.careStanding(PATIENT).missing) {
   assert.equal(optionalIds.has(entry.purpose.id), false, `${entry.purpose.id} is optional and reached the care decision`);
  }
  assert.match(RULES.optionalNeverDegradesCare, /has made the consent a payment/);
 });

 test('withdrawing an optional consent does not withdraw care', () => {
  const h = harness();
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  assert.ok(h.consent.give(PATIENT, give('product-updates')).ok);
  assert.ok(h.consent.withdraw(PATIENT, { purposeId: 'product-updates', route: 'web-account' }).ok);
  assert.equal(h.consent.careStanding(PATIENT).mayReceiveCare, true);
 });
});

/* ---- The access log ---------------------------------------------------------------------------- */

describe('the log of who opened a record', () => {
 const consented = () => {
  const h = harness();
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  return h;
 };

 test('an allowed read is written down with the basis, the capability and the gate\'s own entry id', () => {
  const h = consented();
  const opened = h.log.open(read());
  assert.ok(opened.ok);
  assert.equal(opened.entry.outcome, 'granted');
  assert.equal(opened.entry.lawfulBasis, 's11a-consent');
  assert.equal(opened.entry.capability, 'view-clinical-record');
  assert.equal(opened.entry.consentPurpose, 'care-delivery');
  assert.equal(opened.entry.consentVersion, 2);
  assert.equal(opened.entry.subjectId, PATIENT);
  assert.ok(opened.auditId);
  /* And the same decision is in the tamper-evident chain, by that id, so the two line up. */
  assert.ok(h.chain().some(row => row.id === opened.auditId && row.event === 'access.allowed'));
  assert.equal(h.protection.audit.verify().intact, true);
 });

 test('a refused read is written down exactly as an allowed one', () => {
  const h = consented();
  /* A doctor is a real vetted party; billing does not reach a set of readings. */
  const refused = h.log.open(read({ actorId: 'doctor-1', actorRole: 'doctor', purpose: 'billing', capability: 'view-billing', lawfulBasis: 's11f-legitimate-interest', consentPurpose: undefined }));
  assert.equal(refused.ok, false);
  const rows = h.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.outcome, 'refused');
  assert.ok(String(rows[0]!.refused_by).length > 0);
  assert.ok(String(rows[0]!.reason).length > 20);
  assert.match(RULES.aRefusedAccessIsRecordedToo, /cannot show you an attempted intrusion/);
 });

 test('a read with no lawful basis is refused before the gate is even asked', () => {
  const h = consented();
  const chainBefore = h.chain().length;
  const refused = h.log.open(read({ lawfulBasis: 'because-i-am-a-nurse' }));
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /POPIA section 11 exists to stop/);
  assert.equal(h.rows()[0]!.refused_by, 'lawful-basis');
  assert.equal(h.chain().length, chainBefore, 'nothing was put to the gate, so nothing decided it');
 });

 test('a direct-marketing consent is not a basis for opening a record', () => {
  const h = consented();
  assert.equal(ACCESS_BASES.includes('s69-direct-marketing'), false);
  const refused = h.log.open(read({ lawfulBasis: 's69-direct-marketing' }));
  assert.equal(refused.ok, false);
 });

 test('a read on consent is refused once the consent is withdrawn, and the refusal is in the log', () => {
  const h = consented();
  assert.ok(h.log.open(read()).ok);
  assert.ok(h.consent.withdraw(PATIENT, { purposeId: 'care-delivery', route: 'web-account' }).ok);
  const refused = h.log.open(read());
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /was withdrawn on 2026-09-06/);
  const rows = h.rows();
  assert.deepEqual(rows.map(row => row.outcome), ['granted', 'refused']);
  assert.equal(rows[1]!.refused_by, 'consent');
 });

 test('a read on a consent held at superseded wording is refused, naming both versions', () => {
  const h = harness();
  const purpose = purposeById('care-delivery')!;
  h.store.record({
   id: 'seeded', subjectId: PATIENT, purposeId: purpose.id, purposeKind: purpose.kind, version: 1,
   decision: 'given', wordingHash: wordingHash(purpose.id, versionOf(purpose, 1)!), route: 'web-account',
   locale: 'en-ZA', recordedBy: PATIENT, recordedAs: 'self', at: NOW - 400 * DAY, givenReason: null
  });
  const refused = h.log.open(read());
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /held on version 1, and the wording in force is version 2/);
 });

 test('a read on consent that names no consent is refused', () => {
  const h = consented();
  const refused = h.log.open(read({ consentPurpose: undefined }));
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /has to name which consent/);
 });

 test('a nurse whose clearance lapsed is refused by the gate, and it is on the person\'s log', () => {
  const h = harness({ actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse', { 'police-clearance': { state: 'verified', expiresOn: '2026-01-01' } }) }] });
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  const refused = h.log.open(read());
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /lapsed/);
  assert.equal(h.rows()[0]!.outcome, 'refused');
  assert.equal(h.rows()[0]!.refused_by, 'vetting-standing');
 });

 test('nothing written down is a reading, and there is nowhere it could go', () => {
  const h = consented();
  assert.ok(h.log.open(read()).ok);
  assert.ok(h.log.open(read({ purpose: 'billing', capability: 'view-billing', lawfulBasis: 's11f-legitimate-interest', consentPurpose: undefined })).ok === false);
  const columns = Object.keys(h.rows()[0]!);
  for (const forbidden of ['value', 'reading', 'payload', 'content', 'plaintext', 'body', 'result', 'finding', 'note', 'summary']) {
   assert.ok(!columns.some(column => column.includes(forbidden)), `record_access_log has a "${column_of(columns, forbidden)}" column`);
  }
  /* And the field name travels, never a value: `field` is a name of a part of a record and the log
     does not carry it at all — what it carries is which record type and which entry. */
  assert.ok(columns.includes('record_type') && columns.includes('record_id'));
 });

 test('the person reads their own log, and their reading of it is in it', () => {
  const h = consented();
  assert.ok(h.log.open(read()).ok);
  h.advance(DAY);
  const mine = h.log.mine(PATIENT);
  assert.ok(mine.ok);
  assert.equal(mine.entries.length, 2, 'the read of the log is itself an access');
  assert.equal(mine.entries[0]!.lawfulBasis, 's23-subject-access', 'newest first');
  assert.equal(mine.entries[0]!.actorId, PATIENT);
  assert.equal(mine.entries[1]!.actorLabel, 'Sister Naledi Mokoena · SANC 21847');
  assert.match(RULES.theRecordHolderReadsTheirOwnLog, /without asking anybody/);
 });

 test('a person\'s log holds only their own record, never somebody else\'s', () => {
  const h = consented();
  assert.ok(h.consent.give('patient-2', give('care-delivery')).ok);
  assert.ok(h.log.open(read()).ok);
  assert.ok(h.log.open(read({ subjectId: 'patient-2', recordId: 'V-2' })).ok);
  const mine = h.log.mine(PATIENT);
  assert.ok(mine.ok);
  assert.ok(mine.entries.every(entry => entry.subjectId === PATIENT));
 });

 test('reading somebody else\'s record under subject access is refused by the gate', () => {
  const h = consented();
  const refused = h.log.open(read({
   actorId: 'someone-else', actorRole: 'subject', purpose: 'subject-access',
   capability: 'view-clinical-record', lawfulBasis: 's23-subject-access', consentPurpose: undefined
  }));
  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /Reading somebody else's is a different request/);
  assert.equal(h.rows()[0]!.outcome, 'refused');
 });

 test('break-glass is allowed, is loud, and is on the person\'s own log', () => {
  const h = consented();
  const opened = h.log.open(read({
   purpose: 'emergency', capability: 'view-patient-summary', recordType: 'emergency-card', recordId: 'EC-1',
   lawfulBasis: 's11d-vital-interest', consentPurpose: undefined,
   reason: 'Unresponsive at the door, ambulance called.'
  }));
  assert.ok(opened.ok);
  assert.equal(opened.entry.lawfulBasis, 's11d-vital-interest');
  assert.ok(h.chain().some(row => row.event === 'access.break-glass' && Number(row.broke) === 1));
 });

 test('the log is append-only: the store offers no way to change or remove an entry', () => {
  const h = consented();
  const offered = Object.keys(h.store);
  assert.deepEqual(offered.filter(name => /update|delete|remove|edit|clear/i.test(name)), []);
  assert.match(RULES.theAccessLogIsNotTheSignInLog, /two tables/);
 });

 test('the order is the server\'s own, and it survives two entries in the same millisecond', () => {
  const h = consented();
  assert.ok(h.log.open(read()).ok);
  assert.ok(h.log.open(read({ recordId: 'V-2' })).ok);
  assert.deepEqual(h.rows().map(row => Number(row.seq)), [1, 2]);
  assert.deepEqual(h.rows().map(row => row.at), [NOW, NOW]);
  assert.deepEqual(h.log.all().map(entry => entry.recordId), ['V-1', 'V-2']);
 });
});

const column_of = (columns: string[], needle: string) => columns.find(column => column.includes(needle)) ?? needle;

/* ---- What an erasure runs into ------------------------------------------------------------------ */

describe('what an erasure runs into here', () => {
 test('nothing at all for somebody the register holds nothing about', () => {
  const h = harness();
  assert.deepEqual(h.consent.retainedFor('a-stranger'), []);
  assert.deepEqual(h.log.retainedFor('a-stranger'), []);
 });

 test('the proof of consent is kept, and the reason is written for the person', () => {
  const h = harness();
  assert.ok(h.consent.give(PATIENT, give('care-delivery')).ok);
  const kept = h.consent.retainedFor(PATIENT);
  assert.equal(kept.length, 1);
  assert.match(kept[0]!.because, /show MyThuso had your permission/);
  assert.ok(!/\b(row|column|table)\b/i.test(kept[0]!.because));
 });

 test('the access log is kept, and says why deleting it on request would be the wrong favour', () => {
  const h = harness();
  for (const purpose of requiredPurposes()) assert.ok(h.consent.give(PATIENT, give(purpose.id)).ok);
  assert.ok(h.log.open(read()).ok);
  const kept = h.log.retainedFor(PATIENT);
  assert.equal(kept.length, 1);
  assert.match(kept[0]!.because, /erase the record of having used it/);
 });

 test('both tables are in the holdings register on a ground with a stated period', () => {
  const tables = new Set(HOLDINGS.map(holding => holding.table));
  assert.ok(tables.has('consent_decisions'));
  assert.ok(tables.has('record_access_log'));
  for (const id of ['consent-proof', 'access-log']) {
   const basis = RETENTION_BASES.find(candidate => candidate.id === id)!;
   assert.ok(basis, `${id} is not in the retention register`);
   assert.equal(basis.inUse, true);
   assert.equal(basis.conflictsWithErasure, true);
   assert.match(basis.note, /MyThuso's own setting/);
  }
 });
});

/* ---- What production refuses to start with ------------------------------------------------------- */

describe('what production refuses to start with, since consent', () => {
 const base = {
  MYTHUSO_ENV: 'production', MYTHUSO_AUTH_PEPPER: 'z'.repeat(40), MYTHUSO_SMS_PROVIDER: 'clickatell',
  MYTHUSO_ALLOWED_ORIGINS: 'https://app.mythuso.co.za',
  MYTHUSO_INFORMATION_OFFICER: 'Information Officer, Akhanya IT Innovations',
  MYTHUSO_PROTECTION_KEYS: `1:${'a'.repeat(64)}`
 };
 const refuses = (env: Record<string, string | undefined>, expected: RegExp) =>
  assert.throws(() => loadConfig({ ...base, ...env } as NodeJS.ProcessEnv), (error: unknown) => error instanceof ConfigError && expected.test(error.message));

 test('nobody accountable for the consents it records', () => refuses({ MYTHUSO_INFORMATION_OFFICER: undefined }, /INFORMATION_OFFICER/));
 test('a switch that would carry an old consent forward', () => refuses({ MYTHUSO_CONSENT_ASSUME_CARRIED_OVER: 'true' }, /consent to the wording in force/));
 test('no key ring, so no gate to decide an access and no chain to write it into', () => refuses({ MYTHUSO_PROTECTION_KEYS: undefined }, /PROTECTION_KEYS/));
 test('development runs without any of the three, because there is nobody to complain to', () => {
  const config = loadConfig({ MYTHUSO_ENV: 'development', MYTHUSO_CONSENT_ASSUME_CARRIED_OVER: 'true' } as NodeJS.ProcessEnv);
  assert.equal(config.informationOfficer, '');
  assert.equal(config.consentAssumeCarriedOver, true);
 });
 test('a fully configured production starts', () => {
  const config = loadConfig(base as NodeJS.ProcessEnv);
  assert.equal(config.environment, 'production');
  assert.match(config.informationOfficer, /Akhanya/);
  assert.equal(config.consentAssumeCarriedOver, false);
 });
});
