import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import catalogue from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { createProtectionModule, EXPIRY_WARNING_DAYS } from '../src/protection/index.ts';
import {
 VettingVault, dedupeKey, documentField, expiryFrom, hashOf, noticesFor,
 openVettingStore, roleChecks, vettingSource, type Actor
} from '../src/vetting/index.ts';

const DAY = 86_400_000;
/* A fixed Monday, so "in forty-five days" is a date rather than a mood. */
const START = Date.UTC(2026, 8, 7, 8, 0, 0);
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);
/* The sentinel is deliberately a string nothing else in the repository contains, so "the document is
   not in here" is a claim about the document and not about a phrase the catalogue also uses. */
const SENTINEL = 'no-conviction-recorded-8f42ac';
const PDF = Buffer.from(`%PDF-1.4 clearance certificate ZA20260114772, fictional. ${SENTINEL}`);

/**
 * The whole module, wired the way server.ts wires it: a real key, a real gate, a real database.
 * Nothing here stubs the crypto — the point of most of these tests is that a document really did go
 * through the envelope and really did come back.
 */
function harness(options: { keys?: string; current?: string } = {}) {
 let clock = START;
 const now = () => clock;
 const db = new DatabaseSync(':memory:');
 const store = openVettingStore(db);
 const protection = createProtectionModule({
  environment: 'development',
  protectionKeys: options.keys ?? `1:${randomBytes(32).toString('hex')}`,
  ...(options.current ? { protectionKeyCurrent: options.current } : {}),
  protectionIndexVersion: '1'
 }, db, { vetting: vettingSource(store), releases: { find: () => null }, now })!;
 const vault = new VettingVault({ gate: protection.gate, audit: protection.audit, store, now });
 return {
  db, store, vault, protection, now,
  advance: (ms: number) => { clock += ms; },
  at: () => clock
 };
}

const reviewer = (id: string): Actor => ({ id, role: 'admin', purpose: 'vetting' });
const themselves = (id: string, role: string): Actor => ({ id, role, purpose: 'subject-access' });

/**
 * The seeded pair, exactly as an operator would perform it: two reviewers, each submitting their own
 * documents through the gate (subject access needs no standing, which is what makes that possible),
 * and the decision on those first checks taken by hand by two named people who are not yet parties
 * themselves. Everything after this goes through the gate.
 */
function reviewers(h: ReturnType<typeof harness>) {
 h.vault.bootstrap({ id: 'admin-1', roleId: 'admin' });
 h.vault.bootstrap({ id: 'admin-2', roleId: 'admin' });
 for (const id of ['admin-1', 'admin-2']) {
  for (const check of roleChecks('admin')) {
   const submitted = h.vault.submit({
    actor: themselves(id, 'admin'), partyId: id, checkId: check.id,
    filename: `${check.id}.pdf`, document: PDF, issuedOn: iso(START - 30 * DAY)
   });
   assert.ok(submitted.ok, submitted.ok ? '' : submitted.reason);
   h.vault.bootstrapDecision(id, check.id, {
    decidedBy: 'founder', ...(check.risk === 'high' ? { secondedBy: 'director' } : {}),
    issuedOn: iso(START - 30 * DAY)
   });
  }
 }
 return h;
}

/** A nurse, enrolled and cleared through the gate by two different reviewers. */
function clearedNurse(h: ReturnType<typeof harness>, id = 'nurse-1', overrides: Record<string, { issuedOn?: string; expiresOn?: string }> = {}) {
 const enrolled = h.vault.enrol(reviewer('admin-1'), { id, roleId: 'nurse', reference: 'SANC 20014477' });
 assert.ok(enrolled.ok, enrolled.ok ? '' : enrolled.reason);
 for (const check of roleChecks('nurse')) {
  h.vault.submit({ actor: themselves(id, 'nurse'), partyId: id, checkId: check.id, filename: `${check.id}.pdf`, document: PDF });
  const evidence = h.store.findEvidenceFor(id, check.id)!;
  const override = overrides[check.id] ?? {};
  const decided = h.vault.decide({
   actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'verified',
   issuedOn: override.issuedOn ?? iso(START - 30 * DAY),
   ...(override.expiresOn ? { expiresOn: override.expiresOn } : {})
  });
  assert.ok(decided.ok, decided.ok ? '' : decided.reason);
  if (check.risk === 'high') {
   const seconded = h.vault.second(reviewer('admin-2'), evidence.id);
   assert.ok(seconded.ok, seconded.ok ? '' : seconded.reason);
  }
 }
 return id;
}

/* ---- The vault: a document goes in sealed and comes out through the gate --------------------- */

describe('a certificate in the vault', () => {
 test('round-trips through the gate and is never in the database in the clear', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;

  const opened = h.vault.open(reviewer('admin-1'), evidence.id, 1);
  assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  assert.equal(opened.document.toString('utf8'), PDF.toString('utf8'));
  assert.equal(opened.version.contentHash, hashOf(PDF));

  /* And the bytes on disk are not the bytes that went in. Read straight out of the column, past
     every layer that might be being polite about it. */
  const raw = h.db.prepare('SELECT document FROM vetting_evidence_versions WHERE evidence_id = ?').get(evidence.id) as { document: Uint8Array };
  const stored = Buffer.from(raw.document);
  assert.ok(!stored.includes(SENTINEL), 'a certificate must not be sitting in the column in the clear');
  assert.equal(stored.subarray(0, 4).toString('ascii'), 'MT2\0');
 });

 test('the nurse can read her own, and a stranger cannot read anybody\'s', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;

  const hers = h.vault.open(themselves('nurse-1', 'nurse'), evidence.id, 1);
  assert.ok(hers.ok, hers.ok ? '' : hers.reason);

  /* Another nurse, fully cleared, with no vetting role at all. Her own clearance says nothing about
     whether she may read somebody else's. */
  clearedNurse(h, 'nurse-2');
  const other = h.vault.open({ id: 'nurse-2', role: 'nurse', purpose: 'vetting' }, evidence.id, 1);
  assert.equal(other.ok, false);
  assert.ok(!other.ok && /never granted/.test(other.reason), other.ok ? '' : other.reason);

  /* And somebody nobody has vetted at all. */
  const nobody = h.vault.open({ id: 'ghost', role: 'admin', purpose: 'vetting' }, evidence.id, 1);
  assert.equal(nobody.ok, false);
  assert.ok(!nobody.ok && /Nobody by that name has been vetted/.test(nobody.reason));
 });

 test('a reviewer whose own police clearance lapsed cannot open anybody\'s evidence', () => {
  /* The property that makes the gate worth routing through: the reviewer is vetted too. */
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;
  assert.ok(h.vault.open(reviewer('admin-1'), evidence.id, 1).ok);

  const own = h.store.findEvidenceFor('admin-1', 'police-clearance')!;
  h.store.saveEvidence({ ...own, expiresOn: iso(START - DAY) });
  const refused = h.vault.open(reviewer('admin-1'), evidence.id, 1);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && /Police clearance lapsed/.test(refused.reason), refused.ok ? '' : refused.reason);
 });

 test('every read and every refusal is in the chain before the bytes exist', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const before = h.protection.audit.verify();
  assert.ok(before.intact);

  h.vault.open(reviewer('admin-1'), evidence.id, 1);
  h.vault.open({ id: 'ghost', role: 'admin', purpose: 'vetting' }, evidence.id, 1);
  const after = h.protection.audit.verify();
  assert.ok(after.intact);
  assert.equal(after.length, before.length + 2, 'the yes and the no are both written down');
 });

 test('the audit trail never carries the document', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;
  h.vault.open(reviewer('admin-1'), evidence.id, 1);
  const rows = h.db.prepare('SELECT * FROM protected_access_log').all();
  const written = JSON.stringify(rows);
  assert.ok(!written.includes(SENTINEL), 'an audit log holding the document is a second copy with weaker protection');
  assert.ok(written.includes('vetting-evidence'));
  assert.ok(written.includes(documentField(1)));
 });
});

/* ---- Substitution ---------------------------------------------------------------------------- */

describe('a substituted document', () => {
 test('is refused by the digest even when it opens', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;

  /* The strongest attacker this can be tested against: somebody with write access to the database
     *and* the service's own authority to seal. They produce a genuinely valid envelope, under the
     right binding, holding a different certificate — so nothing about the cryptography objects. */
  const forged = h.protection.gate.protect({
   actorId: 'admin-1', actorRole: 'admin', capability: 'review-vetting', purpose: 'vetting',
   recordType: 'vetting-evidence', recordId: evidence.id, subjectId: 'nurse-1', field: documentField(1)
  }, Buffer.from('%PDF-1.4 a different clearance entirely'));
  assert.ok(forged.ok);
  const bytes = Buffer.concat([
   Buffer.from('MT2\0', 'ascii'),
   (() => { const header = Buffer.alloc(4); header.writeUInt8(1, 0); header.writeUInt16BE(forged.sealed.version, 1); header.writeUInt8(60, 3); return header; })(),
   forged.sealed.wrappedKey, forged.sealed.iv, forged.sealed.tag, forged.sealed.ciphertext
  ]);
  h.db.prepare('UPDATE vetting_evidence_versions SET document = ? WHERE evidence_id = ? AND version_number = 1').run(bytes, evidence.id);

  const opened = h.vault.open(reviewer('admin-1'), evidence.id, 1);
  assert.equal(opened.ok, false);
  assert.ok(!opened.ok && /not the one that was submitted/.test(opened.reason));
  const log = JSON.stringify(h.db.prepare('SELECT * FROM protected_access_log').all());
  assert.ok(log.includes('vetting.substituted'), 'a substitution is an event, not a silent refusal');
 });

 test('another record\'s bytes do not open at all, because the binding is not theirs', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const clearance = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;
  const identity = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const lifted = h.db.prepare('SELECT document FROM vetting_evidence_versions WHERE evidence_id = ?').get(identity.id) as { document: Uint8Array };
  h.db.prepare('UPDATE vetting_evidence_versions SET document = ? WHERE evidence_id = ?').run(lifted.document, clearance.id);

  const opened = h.vault.open(reviewer('admin-1'), clearance.id, 1);
  assert.equal(opened.ok, false);
  assert.ok(!opened.ok && /altered, or they belong to a different row/.test(opened.reason));
 });

 test('the digest is one anybody holding the original can compute', () => {
  /* Deliberately not keyed. A nurse who still has her own PDF can check what MyThuso says it holds,
     without MyThuso's cooperation, which a keyed fingerprint would have taken away from her. */
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'qualifications')!;
  const version = h.store.versions(evidence.id)[0]!;
  assert.equal(version.contentHash, hashOf(PDF));
  assert.equal(version.contentHash.length, 64);
 });
});

/* ---- Expiry, resolved on read ---------------------------------------------------------------- */

describe('expiry across the boundary', () => {
 test('the same forty-five days the console uses, and not a fifth copy of the number', () => {
  assert.equal(EXPIRY_WARNING_DAYS, 45);
 });

 test('past expiry is lapsed, within forty-five days is expiring and still passes', () => {
  const h = reviewers(harness());
  clearedNurse(h, 'nurse-1', {
   'police-clearance': { expiresOn: iso(START + (EXPIRY_WARNING_DAYS + 1) * DAY) }
  });
  const clearance = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;

  const before = h.vault.standing('nurse-1')!;
  assert.equal(before.checks.find(c => c.checkId === 'police-clearance')!.resolved, 'verified');
  assert.ok(before.standing.cleared);

  /* One day into the warning window. Still dispatchable, and now saying so. */
  h.advance(2 * DAY);
  const warning = h.vault.standing('nurse-1', h.at())!;
  assert.equal(warning.checks.find(c => c.checkId === 'police-clearance')!.resolved, 'expiring');
  assert.ok(warning.standing.cleared, 'expiring still passes — a nurse whose clearance runs out in three weeks works today');

  /* Past it. Nobody has touched a row; the stored state still reads "verified". */
  h.advance((EXPIRY_WARNING_DAYS + 2) * DAY);
  assert.equal(h.store.findEvidence(clearance.id)!.state, 'verified');
  const lapsed = h.vault.standing('nurse-1', h.at())!;
  assert.equal(lapsed.checks.find(c => c.checkId === 'police-clearance')!.resolved, 'lapsed');
  assert.equal(lapsed.standing.cleared, false);
  assert.deepEqual(lapsed.standing.lapsed, ['Police clearance']);
 });

 test('a lapsed clearance withdraws the nurse\'s access to a patient record, with nobody noticing first', () => {
  /* The whole argument for resolving on read, end to end: no sweep ran, no row changed, and the
     gate refuses a consultation because a date passed in the night. */
  const h = reviewers(harness());
  clearedNurse(h, 'nurse-1', { 'police-clearance': { expiresOn: iso(START + 3 * DAY) } });
  const visit = {
   actorId: 'nurse-1', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment' as const,
   recordType: 'consultation', recordId: 'C-1', subjectId: 'patient-1', field: 'notes'
  };
  assert.ok(h.protection.gate.access(visit).allowed);
  h.advance(4 * DAY);
  const refused = h.protection.gate.access(visit);
  assert.equal(refused.allowed, false);
  assert.ok(!refused.allowed && /Police clearance lapsed/.test(refused.reason));
 });

 test('an expiry is arithmetic from the check\'s own cadence', () => {
  /* Police clearance renews every 24 months in the catalogue; the module does not invent a date. */
  const check = catalogue.roles.find(role => role.id === 'nurse')!.checks.find(c => c.id === 'police-clearance')!;
  assert.equal(check.renewMonths, 24);
  assert.equal(expiryFrom('2026-03-01', 24), '2028-03-01');
  assert.equal(expiryFrom('2026-03-01', null), null, 'a check that does not renew has no expiry');
 });

 test('an expiry nobody can read is treated as lapsed rather than as absent', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const clearance = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;
  h.store.saveEvidence({ ...clearance, expiresOn: 'sometime next year' });
  const standing = h.vault.standing('nurse-1')!;
  assert.equal(standing.checks.find(c => c.checkId === 'police-clearance')!.resolved, 'lapsed');
 });
});

/* ---- The second reviewer ---------------------------------------------------------------------- */

describe('the second-reviewer rule', () => {
 const highRisk = () => catalogue.roles.find(role => role.id === 'nurse')!.checks.filter(c => c.risk === 'high').map(c => c.id);

 test('a high-risk check verified by one person does not clear the party', () => {
  const h = reviewers(harness());
  h.vault.enrol(reviewer('admin-1'), { id: 'nurse-9', roleId: 'nurse' });
  for (const check of roleChecks('nurse')) {
   h.vault.submit({ actor: themselves('nurse-9', 'nurse'), partyId: 'nurse-9', checkId: check.id, filename: 'x.pdf', document: PDF });
   const evidence = h.store.findEvidenceFor('nurse-9', check.id)!;
   h.vault.decide({ actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'verified', issuedOn: iso(START - DAY) });
  }
  const standing = h.vault.standing('nurse-9')!;
  assert.equal(standing.standing.cleared, false);
  assert.deepEqual(standing.standing.awaitingSecond.sort(), ['Identity', 'Police clearance', 'SANC registration'].sort());
  assert.equal(standing.standing.lapsed.length, 0, 'nothing has lapsed — it is unseconded, which is a different sentence');

  const refused = h.protection.gate.access({
   actorId: 'nurse-9', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment',
   recordType: 'consultation', recordId: 'C-1', subjectId: 'patient-1', field: 'notes'
  });
  assert.equal(refused.allowed, false);
  assert.ok(!refused.allowed && /still needs a second reviewer/.test(refused.reason));
 });

 test('the same person cannot be both reviewers', () => {
  const h = reviewers(harness());
  h.vault.enrol(reviewer('admin-1'), { id: 'nurse-9', roleId: 'nurse' });
  h.vault.submit({ actor: themselves('nurse-9', 'nurse'), partyId: 'nurse-9', checkId: 'identity', filename: 'id.pdf', document: PDF });
  const evidence = h.store.findEvidenceFor('nurse-9', 'identity')!;
  h.vault.decide({ actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'verified', issuedOn: iso(START - DAY) });

  const itself = h.vault.second(reviewer('admin-1'), evidence.id);
  assert.equal(itself.ok, false);
  assert.ok(!itself.ok && /a different person/.test(itself.reason));

  const subject = h.vault.second(themselves('nurse-9', 'nurse'), evidence.id);
  assert.equal(subject.ok, false);

  const proper = h.vault.second(reviewer('admin-2'), evidence.id);
  assert.ok(proper.ok, proper.ok ? '' : proper.reason);
  assert.equal(h.store.findEvidence(evidence.id)!.secondedBy, 'admin-2');
 });

 test('a standard-risk check refuses a second reviewer rather than accepting a decorative one', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const references = h.store.findEvidenceFor('nurse-1', 'references')!;
  const outcome = h.vault.second(reviewer('admin-2'), references.id);
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /standard-risk/.test(outcome.reason));
 });

 test('a new document drops the previous second, because they never saw this one', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const clearance = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;
  assert.equal(h.store.findEvidence(clearance.id)!.secondedBy, 'admin-2');

  h.vault.submit({ actor: themselves('nurse-1', 'nurse'), partyId: 'nurse-1', checkId: 'police-clearance', filename: 'renewed.pdf', document: Buffer.from('%PDF renewed clearance') });
  const after = h.store.findEvidence(clearance.id)!;
  assert.equal(after.state, 'submitted');
  assert.equal(after.secondedBy, null);
  assert.equal(after.decidedBy, null);
  assert.equal(h.store.countVersions(clearance.id), 2, 'the old version stays — what we held in March is a question somebody asks');
  assert.equal(h.vault.standing('nurse-1')!.standing.cleared, false);
 });

 test('every high-risk check the catalogue has is one this rule reaches', () => {
  assert.ok(highRisk().length >= 3);
 });
});

/* ---- Deciding ---------------------------------------------------------------------------------- */

describe('deciding a check', () => {
 test('nothing is verified against no document at all', () => {
  const h = reviewers(harness());
  h.vault.enrol(reviewer('admin-1'), { id: 'nurse-9', roleId: 'nurse' });
  const evidence = h.store.findEvidenceFor('nurse-9', 'identity')!;
  const outcome = h.vault.decide({ actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'verified' });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /no document on file/.test(outcome.reason));
 });

 test('nobody decides their own', () => {
  const h = reviewers(harness());
  h.vault.enrol(reviewer('admin-1'), { id: 'admin-3', roleId: 'admin' });
  h.vault.submit({ actor: themselves('admin-3', 'admin'), partyId: 'admin-3', checkId: 'identity', filename: 'id.pdf', document: PDF });
  const evidence = h.store.findEvidenceFor('admin-3', 'identity')!;
  const outcome = h.vault.decide({ actor: { id: 'admin-3', role: 'admin', purpose: 'subject-access' }, evidenceId: evidence.id, decision: 'verified' });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /Nobody decides their own vetting/.test(outcome.reason));
 });

 test('a decline has to say why, because a refusal with no reason cannot be appealed', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'references')!;
  const silent = h.vault.decide({ actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'declined' });
  assert.equal(silent.ok, false);
  const spoken = h.vault.decide({ actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'declined', reason: 'Neither referee could confirm the placement.' });
  assert.ok(spoken.ok, spoken.ok ? '' : spoken.reason);
  assert.equal(h.vault.standing('nurse-1')!.standing.cleared, false);
 });

 test('a party whose own clearance lapsed can still upload the replacement', () => {
  /* The one path that must stay open through the gate. Subject access needs no standing, or a nurse
     with a lapsed clearance could never get back to work without somebody doing it for her. */
  const h = reviewers(harness());
  clearedNurse(h, 'nurse-1', { 'police-clearance': { expiresOn: iso(START - DAY) } });
  assert.equal(h.vault.standing('nurse-1')!.standing.cleared, false);
  const submitted = h.vault.submit({
   actor: themselves('nurse-1', 'nurse'), partyId: 'nurse-1', checkId: 'police-clearance',
   filename: 'renewed.pdf', document: Buffer.from('%PDF a fresh clearance')
  });
  assert.ok(submitted.ok, submitted.ok ? '' : submitted.reason);
 });

 test('a suspension refuses at the gate and lifting it restores the party', () => {
  const h = reviewers(harness());
  clearedNurse(h);
  assert.ok(h.vault.standing('nurse-1')!.standing.cleared);
  const suspended = h.vault.suspend(reviewer('admin-1'), 'nurse-1', 'Complaint under investigation.');
  assert.ok(suspended.ok, suspended.ok ? '' : suspended.reason);
  const refused = h.protection.gate.access({
   actorId: 'nurse-1', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment',
   recordType: 'consultation', recordId: 'C-1', subjectId: 'patient-1', field: 'notes'
  });
  assert.equal(refused.allowed, false);
  assert.ok(!refused.allowed && /Complaint under investigation/.test(refused.reason));
  assert.ok(h.vault.restore(reviewer('admin-1'), 'nurse-1').ok);
  assert.ok(h.protection.gate.access({
   actorId: 'nurse-1', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment',
   recordType: 'consultation', recordId: 'C-1', subjectId: 'patient-1', field: 'notes'
  }).allowed);
 });

 test('a check the catalogue does not ask this role for has nowhere to go', () => {
  const h = reviewers(harness());
  h.vault.enrol(reviewer('admin-1'), { id: 'nurse-9', roleId: 'nurse' });
  const outcome = h.vault.submit({ actor: themselves('nurse-9', 'nurse'), partyId: 'nurse-9', checkId: 'iso-15189', filename: 'x.pdf', document: PDF });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /not asked for/.test(outcome.reason));
 });

 test('the bootstrap closes behind itself', () => {
  const h = reviewers(harness());
  assert.throws(() => h.vault.bootstrap({ id: 'admin-9', roleId: 'admin' }), /no longer a bootstrap/);
  /* Still open for the pair itself — a decision on their own checks is what a bootstrap is for. */
  assert.ok(h.vault.bootstrapDecision('admin-1', 'identity', { decidedBy: 'founder', secondedBy: 'director' }));
  /* And closed the moment a third party exists, which is the moment the pair could have done it. */
  h.vault.enrol(reviewer('admin-1'), { id: 'nurse-9', roleId: 'nurse' });
  assert.throws(() => h.vault.bootstrapDecision('admin-1', 'identity', { decidedBy: 'founder', secondedBy: 'director' }), /no longer a bootstrap/);
 });
});

/* ---- Renewal milestones ------------------------------------------------------------------------ */

describe('renewal warnings', () => {
 test('a missed run does not lose the warning, and a nightly run does not repeat it', () => {
  const h = reviewers(harness());
  clearedNurse(h, 'nurse-1', { 'police-clearance': { expiresOn: iso(START + 60 * DAY) } });

  /* Sixty days out: nothing is due. */
  assert.deepEqual(h.vault.renewalsDue(h.at()).map(entry => entry.notice.checkId), []);

  /* Nothing runs for a fortnight. The forty-five-day milestone passed on day fifteen and the sweep
     was not running; it is still owed on day twenty. */
  h.advance(40 * DAY);
  const late = h.vault.renewalsDue(h.at());
  const clearance = late.find(entry => entry.notice.checkId === 'police-clearance');
  assert.ok(clearance, 'a milestone passed while nothing was running is still owed');
  assert.equal(clearance.notice.milestoneDays, EXPIRY_WARNING_DAYS);
  assert.equal(clearance.notice.daysRemaining, 20);
  assert.match(clearance.notice.headline, /expires in 20 days/);

  /* Sent. Now the same sweep, run again tonight and tomorrow night, says nothing. */
  h.vault.recordNotice(clearance.notice, clearance.superseded, h.at());
  assert.equal(h.vault.renewalsDue(h.at()).some(entry => entry.notice.checkId === 'police-clearance'), false);
  h.advance(DAY);
  assert.equal(h.vault.renewalsDue(h.at()).some(entry => entry.notice.checkId === 'police-clearance'), false);

  /* Until the next milestone arrives, which is a different message. */
  h.advance(8 * DAY);
  const urgent = h.vault.renewalsDue(h.at()).find(entry => entry.notice.checkId === 'police-clearance');
  assert.ok(urgent);
  assert.equal(urgent.notice.milestoneDays, 14);
  assert.equal(urgent.notice.severity, 'urgent');
 });

 test('one warning at a time, and the ones it overtook are recorded rather than sent', () => {
  /* A certificate added to the vault nineteen days before it expires has passed forty-five and
     fourteen on the same morning. An alert headed "45 days" about it would simply be wrong. */
  const h = reviewers(harness());
  clearedNurse(h, 'nurse-1', { 'police-clearance': { expiresOn: iso(START + 10 * DAY) } });
  const due = h.vault.renewalsDue(h.at()).filter(entry => entry.notice.checkId === 'police-clearance');
  assert.equal(due.length, 1);
  assert.equal(due[0]!.notice.milestoneDays, 14, 'the smallest passed milestone is the one that describes where it is');
  assert.deepEqual(due[0]!.superseded, [dedupeKey(due[0]!.notice.evidenceId, EXPIRY_WARNING_DAYS)]);

  h.vault.recordNotice(due[0]!.notice, due[0]!.superseded, h.at());
  assert.equal(h.vault.renewalsDue(h.at()).some(entry => entry.notice.checkId === 'police-clearance'), false,
   'the superseded milestone must not surface tomorrow as though it were new');
 });

 test('a lapsed check says it has already happened rather than warning that it will', () => {
  const h = reviewers(harness());
  clearedNurse(h, 'nurse-1', { 'police-clearance': { expiresOn: iso(START - 3 * DAY) } });
  const due = h.vault.renewalsDue(h.at()).find(entry => entry.notice.checkId === 'police-clearance')!;
  assert.equal(due.notice.severity, 'lapsed');
  assert.match(due.notice.headline, /lapsed 3 days ago/);
  assert.match(due.notice.body, /already withheld/);
 });

 test('an outstanding check is missing rather than expiring, and is not warned about', () => {
  const h = reviewers(harness());
  h.vault.enrol(reviewer('admin-1'), { id: 'nurse-9', roleId: 'nurse' });
  assert.deepEqual(h.vault.renewalsDue(h.at()).filter(entry => entry.notice.partyId === 'nurse-9'), []);
 });

 test('the arithmetic is pure and testable without a database at all', () => {
  const evidence = {
   id: 'E-1', partyId: 'P-1', roleId: 'nurse', checkId: 'police-clearance', authority: 'saps',
   risk: 'high' as const, renewMonths: 24, state: 'verified' as const, issuedOn: null,
   expiresOn: iso(START + 5 * DAY), decidedAt: null, decidedBy: null, secondedAt: null,
   secondedBy: null, declinedReason: null, createdAt: START
  };
  const { send, superseded } = noticesFor(evidence, 'Police clearance', START, new Set());
  assert.equal(send?.milestoneDays, 14);
  assert.equal(superseded.length, 1);
  const already = new Set([send!.dedupeKey, ...superseded]);
  assert.equal(noticesFor(evidence, 'Police clearance', START, already).send, null);
 });
});
