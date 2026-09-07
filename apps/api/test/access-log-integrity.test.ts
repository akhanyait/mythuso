/**
 * Whether the log of who opened whose record still says what it said when it was written.
 *
 * ── Why this file writes to the database file directly ───────────────────────────────────────
 *
 * The claim being tested is not "the verifier agrees with the writer". It is "somebody with the
 * database file cannot change what the log says without the service noticing", and the only way to
 * test that honestly is to be that somebody. So every tampering test below closes the service's
 * connection, opens the SQLite file as a second connection, runs an `UPDATE` or a `DELETE` the
 * service has no code path for, and then asks the verifier what it thinks. A test that reached in
 * through the module's own methods would be testing a module against itself.
 *
 * The database is a real file on disk for the same reason. `:memory:` cannot be reopened, and being
 * able to close the service, alter the file and start again is exactly the attack.
 *
 * ── And the one test that proves nothing was closed ──────────────────────────────────────────
 *
 * `a row appended after the last seal is not covered, and the verifier says so` is deliberately an
 * assertion that the tampering is *not* caught. The seal is periodic, so there is a window, and a
 * test suite that only demonstrated the successes would leave somebody reading the file believing
 * the window was closed. It is not. Its size is in the verdict, on the health route, and in
 * docs/PRIVACY-AND-SECURITY.md.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import vetting from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { AuditEntryRefused } from '../src/protection/audit.ts';
import {
 SEAL_EVENT, createProtectionModule, type ActorVetting, type CheckRecord, type LogSeal
} from '../src/protection/index.ts';
import {
 ACCESS_GENESIS, ACCESS_LOG_ID, ConsentRegister, RecordAccessLog, accessDigest,
 currentVersion, openConsentStore, purposeById,
 type AccessAttempt, type AccessRow
} from '../src/consent/index.ts';

const NOW = Date.UTC(2026, 8, 6, 9, 0, 0);
const IN_DATE = '2027-06-01';
const PATIENT = 'patient-1';

const workspace = mkdtempSync(join(tmpdir(), 'mythuso-access-log-'));
after(() => rmSync(workspace, { recursive: true, force: true }));

function cleared(roleId: string): CheckRecord[] {
 const role = vetting.roles.find(candidate => candidate.id === roleId)!;
 return role.checks.map(check => ({
  checkId: check.id, state: 'verified' as const, expiresOn: IN_DATE,
  ...(check.risk === 'high' ? { secondedBy: 'reviewer-2' } : {})
 }));
}

/**
 * A service on a real file, closeable and reopenable under the same key ring.
 *
 * `seal` is injected so a test can watch the window open and close in three entries rather than in
 * fifty; the defaults in seal.ts are what actually runs, and one test below checks them.
 */
function service(options: { path?: string; keys?: string; every?: number; afterMs?: number } = {}) {
 const path = options.path ?? join(workspace, `${randomUUID()}.db`);
 const keys = options.keys ?? `1:${randomBytes(32).toString('hex')}`;
 let clock = NOW;
 const now = () => clock;
 const db = new DatabaseSync(path);
 const actors: ActorVetting[] = [
  { actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse') },
  { actorId: 'doctor-1', roleId: 'doctor', records: cleared('doctor') }
 ];
 const protection = createProtectionModule(
  { environment: 'development', protectionKeys: keys },
  db,
  {
   vetting: { find: actorId => actors.find(actor => actor.actorId === actorId) ?? null },
   releases: { find: () => null }, now,
   seal: { every: options.every ?? 3, afterMs: options.afterMs ?? 60 * 60_000 }
  }
 )!;
 const store = openConsentStore(db);
 const consent = new ConsentRegister({ store, now });
 const log = new RecordAccessLog({ gate: protection.gate, store, consent, now, seal: protection.logSeal });
 const purpose = purposeById('care-delivery')!;
 consent.give(PATIENT, { purposeId: purpose.id, version: currentVersion(purpose).version, route: 'web-account', locale: 'en-ZA' });
 return {
  path, keys, db, store, consent, log, protection, now,
  advance: (ms: number) => { clock += ms; },
  verify: () => protection.verifySealedLog(ACCESS_LOG_ID, log.links()),
  seals: () => protection.sealsFor(ACCESS_LOG_ID),
  rows: () => db.prepare('SELECT * FROM record_access_log ORDER BY seq').all() as unknown as Record<string, unknown>[],
  close: () => db.close()
 };
}

const read = (over: Partial<AccessAttempt> = {}): AccessAttempt => ({
 actorId: 'nurse-1', actorRole: 'nurse', actorLabel: 'Sister Naledi Mokoena · SANC 21847',
 capability: 'view-clinical-record', purpose: 'treatment',
 lawfulBasis: 's11a-consent', consentPurpose: 'care-delivery',
 recordType: 'vitals', recordId: 'V-1', subjectId: PATIENT, field: 'reading-1',
 ...over
});

/** Somebody with the database file, and nothing else. */
function tamper(path: string, work: (db: DatabaseSync) => void) {
 const db = new DatabaseSync(path);
 try { work(db); } finally { db.close(); }
}

/** Reopen the file and ask the verifier, without writing anything of our own first. */
function inspect(path: string, keys: string) {
 const reopened = service({ path, keys });
 const verdict = reopened.verify();
 const seals = reopened.seals();
 reopened.close();
 return { verdict, seals };
}

/* ---- The links themselves ---------------------------------------------------------------------- */

describe('the access log carries its own links', () => {
 test('every entry hashes its own contents onto the one before it, from a written-out genesis', () => {
  const h = service();
  for (let at = 0; at < 4; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const links = h.log.links();
  assert.equal(links.length, 4);
  assert.equal(links[0]!.previousHash, ACCESS_GENESIS, 'the first entry chains onto a fixed value, not onto silence');
  for (let at = 0; at < links.length; at += 1) {
   assert.match(links[at]!.hash, /^[0-9a-f]{64}$/);
   assert.equal(links[at]!.recomputed, links[at]!.hash, `entry ${at} does not hash to what it says`);
   if (at) assert.equal(links[at]!.previousHash, links[at - 1]!.hash);
  }
  h.close();
 });

 test('a refusal that never reached the gate is chained like everything else', () => {
  /* The rows that were worst off before: refused before the gate, so `audit_id` is null and the
     old design had nothing on the other side to line them up against. */
  const h = service();
  const refused = h.log.open(read({ lawfulBasis: 'because-i-am-a-nurse' }));
  assert.equal(refused.ok, false);
  const row = h.rows()[0]!;
  assert.equal(row.audit_id, null, 'nothing decided it, so there is no chain entry to point at');
  assert.match(String(row.hash), /^[0-9a-f]{64}$/, 'and it is chained anyway');
  assert.equal(h.verify().intact, true);
  h.close();
 });

 test('two entries in the same millisecond still chain in one order', () => {
  const h = service();
  h.log.open(read({ recordId: 'V-1' }));
  h.log.open(read({ recordId: 'V-2' }));
  const links = h.log.links();
  assert.equal(links[1]!.previousHash, links[0]!.hash);
  assert.notEqual(links[0]!.hash, links[1]!.hash, 'two entries at the same instant are still two entries');
  h.close();
 });

 test('the digest covers every column of the row, so no field is free to change', () => {
  /* Asserted against the function rather than through the database: a column left out of the digest
     is a column somebody can edit for nothing, and that is a mistake made once and found years
     later. */
  const base: AccessRow = {
   id: 'a', seq: 1, at: NOW, actorId: 'nurse-1', actorRole: 'nurse', actorLabel: 'Sister N',
   capability: 'view-clinical-record', processingPurpose: 'treatment', lawfulBasis: 's11a-consent',
   recordType: 'vitals', recordId: 'V-1', subjectId: PATIENT, outcome: 'granted',
   refusedBy: null, reason: null, consentPurpose: 'care-delivery', consentVersion: 1,
   auditId: 'audit-1', previousHash: ACCESS_GENESIS, hash: ''
  };
  const original = accessDigest(base, ACCESS_GENESIS);
  const changes: Partial<AccessRow>[] = [
   { id: 'b' }, { seq: 2 }, { at: NOW + 1 }, { actorId: 'nurse-2' }, { actorRole: 'doctor' },
   { actorLabel: 'Somebody else' }, { capability: 'view-billing' }, { processingPurpose: 'billing' },
   { lawfulBasis: 's11d-obligation' }, { recordType: 'consultation' }, { recordId: 'V-2' },
   { subjectId: 'patient-2' }, { outcome: 'refused' }, { refusedBy: 'gate' }, { reason: 'because' },
   { consentPurpose: 'research' }, { consentVersion: 2 }, { auditId: 'audit-2' }
  ];
  for (const change of changes) {
   const field = Object.keys(change)[0]!;
   assert.notEqual(accessDigest({ ...base, ...change }, ACCESS_GENESIS), original, `${field} is not under the digest`);
  }
  assert.notEqual(accessDigest(base, 'f'.repeat(64)), original, 'the place in the chain is not under the digest');
 });
});

/* ---- The seal ---------------------------------------------------------------------------------- */

describe('the seal, and what crosses the boundary to get it', () => {
 test('the head is committed into the gate\'s own chain, under an event of its own', () => {
  const h = service();
  h.log.open(read());
  const seals = h.seals();
  assert.equal(seals.length, 1);
  assert.match(seals[0]!.head, /^[0-9a-f]{64}$/);
  assert.equal(seals[0]!.head, h.log.links()[0]!.hash, 'what was sealed is the head the log actually had');
  const entry = (h.db.prepare(`SELECT * FROM protected_access_log WHERE event = '${SEAL_EVENT}'`).all() as unknown as Record<string, unknown>[])[0]!;
  assert.equal(entry.seal_of, ACCESS_LOG_ID);
  h.close();
 });

 test('a seal names nobody: no actor, no subject, no record, no reason', () => {
  /* An entry in this chain may hold who, what, when, which record and why. A seal is about a table
     rather than about a person, and it carries none of those. */
  const h = service();
  h.log.open(read());
  const entry = (h.db.prepare(`SELECT * FROM protected_access_log WHERE event = '${SEAL_EVENT}'`).all() as unknown as Record<string, unknown>[])[0]!;
  for (const column of ['actor_id', 'actor_role', 'capability', 'purpose', 'record_type', 'record_id', 'subject_id', 'field', 'reason', 'allowed', 'blocked_by']) {
   assert.equal(entry[column], null, `a seal carried ${column}`);
  }
  h.close();
 });

 test('the chain refuses a seal head that is not a digest', () => {
  /* The narrowest field in the audit vocabulary, and the reason it is narrow: a free-text field
     nobody constrained is how an audit entry becomes a second copy of the record. */
  const h = service();
  assert.throws(
   () => h.protection.audit.append({ event: SEAL_EVENT, sealOf: ACCESS_LOG_ID, sealHead: 'BP 148/96, seen by Sister Mokoena' }),
   (error: unknown) => error instanceof AuditEntryRefused && /sixty-four lowercase hex/.test(error.message)
  );
  assert.throws(() => h.protection.audit.append({ event: SEAL_EVENT, sealHead: 'ABCDEF'.repeat(10) + 'abcd' }), AuditEntryRefused);
  h.close();
 });

 test('what the consent module is handed is two methods and no way past them', () => {
  const h = service();
  const seal: LogSeal = h.protection.logSeal;
  assert.deepEqual(Object.keys(seal).sort(), ['appended', 'sealNow']);
  /* Not "it does not append access entries" but "it has no method that could". The gate is still
     the only thing that decides an access, and this is a strictly smaller capability. */
  const reachable = seal as unknown as Record<string, unknown>;
  assert.equal(typeof reachable.append, 'undefined');
  assert.equal(typeof reachable.verify, 'undefined');
  h.close();
 });

 test('sealing happens on a cadence, and never twice over the same head', () => {
  const h = service({ every: 3, afterMs: 60 * 60_000 });
  h.log.open(read({ recordId: 'V-1' }));
  assert.equal(h.seals().length, 1, 'the first append after start-up is a fence');
  h.log.open(read({ recordId: 'V-2' }));
  h.log.open(read({ recordId: 'V-3' }));
  assert.equal(h.seals().length, 1, 'two more is not three');
  h.log.open(read({ recordId: 'V-4' }));
  assert.equal(h.seals().length, 2);
  const before = h.seals().length;
  h.log.sealNow();
  assert.equal(h.seals().length, before, 'nothing has been appended, so there is no new head to commit to');
  h.close();
 });

 test('time closes the window as well as volume', () => {
  const h = service({ every: 1000, afterMs: 60_000 });
  h.log.open(read({ recordId: 'V-1' }));
  h.log.open(read({ recordId: 'V-2' }));
  assert.equal(h.seals().length, 1, 'nowhere near a thousand entries');
  h.advance(61_000);
  h.log.open(read({ recordId: 'V-3' }));
  assert.equal(h.seals().length, 2, 'and a minute is a minute');
  h.close();
 });

 test('sealNow commits whatever is outstanding, for an operator about to copy the database', () => {
  const h = service({ every: 1000, afterMs: 60 * 60_000 });
  for (let at = 0; at < 5; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const before = h.verify();
  assert.equal(before.intact, true);
  assert.ok(before.intact && before.unsealed > 0, 'four of the five are in the window');
  h.log.sealNow();
  const after = h.verify();
  assert.ok(after.intact && after.unsealed === 0, 'and nothing is after the fence');
  h.close();
 });

 test('a restart is a fence: the first append after start-up seals', () => {
  const h = service({ every: 1000, afterMs: 60 * 60_000 });
  h.log.open(read({ recordId: 'V-1' }));
  assert.equal(h.seals().length, 1);
  h.close();
  const again = service({ path: h.path, keys: h.keys, every: 1000, afterMs: 60 * 60_000 });
  again.log.open(read({ recordId: 'V-2' }));
  assert.equal(again.seals().length, 2, 'a service that came back up is a service somebody touched');
  again.close();
 });
});

/* ---- Somebody with the database file ------------------------------------------------------------ */

describe('a row altered behind the service\'s back', () => {
 test('editing one column is caught, and the verifier names that entry and no other', () => {
  const h = service();
  for (let at = 0; at < 5; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const target = h.log.links()[2]!;
  h.close();
  tamper(h.path, db => {
   db.prepare('UPDATE record_access_log SET actor_id = ? WHERE id = ?').run('nurse-9', target.id);
  });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
  assert.equal(verdict.intact === false && verdict.brokenAt, target.id, 'the one row somebody touched, not the four after it');
  assert.match(verdict.intact === false ? verdict.because : '', /no longer hashes to what it says/);
 });

 test('so is quietly changing a refusal into a grant', () => {
  /* The edit somebody would actually make. A refused access rewritten as a granted one is the log
     saying an intrusion was authorised. */
  const h = service();
  h.log.open(read({ actorId: 'stranger-1', actorRole: 'nurse' }));
  const target = h.log.links()[0]!;
  h.close();
  tamper(h.path, db => {
   db.prepare("UPDATE record_access_log SET outcome = 'granted', refused_by = NULL, reason = NULL WHERE id = ?").run(target.id);
  });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
  assert.equal(verdict.intact === false && verdict.brokenAt, target.id);
 });

 test('deleting an entry from the middle is caught by the entry that followed it', () => {
  const h = service();
  for (let at = 0; at < 5; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const links = h.log.links();
  h.close();
  tamper(h.path, db => { db.prepare('DELETE FROM record_access_log WHERE id = ?').run(links[2]!.id); });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
  assert.equal(verdict.intact === false && verdict.brokenAt, links[3]!.id, 'the gap shows up at the entry that pointed into it');
  assert.match(verdict.intact === false ? verdict.because : '', /removed or moved/);
 });

 test('swapping two entries round is caught, because the order is under the digest', () => {
  const h = service();
  for (let at = 0; at < 4; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const links = h.log.links();
  h.close();
  tamper(h.path, db => {
   db.prepare('UPDATE record_access_log SET seq = 99 WHERE id = ?').run(links[1]!.id);
   db.prepare('UPDATE record_access_log SET seq = 2 WHERE id = ?').run(links[3]!.id);
  });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
 });

 /**
  * The one that decides whether any of this was worth building.
  *
  * A plain SHA-256 chain is a function anybody can compute, so the obvious attack is to edit a row
  * and recompute every link from there to the end. The links then follow perfectly and the log
  * verifies against itself. What it does not do is match a head that was committed into a chain
  * keyed by material the consent module — and the person holding the database file — has never had.
  */
 test('recomputing the whole chain after an edit is caught by the seal, which is the point', () => {
  const h = service({ every: 100, afterMs: 60 * 60_000 });
  for (let at = 0; at < 4; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  h.log.sealNow();
  const target = h.log.links()[1]!.id;
  h.close();

  tamper(h.path, db => {
   db.prepare('UPDATE record_access_log SET subject_id = ? WHERE id = ?').run('patient-9', target);
   /* And now the part a naive chain has no answer to: re-link everything from genesis, using the
      service's own digest function, so the log is internally perfect again. */
   const rows = db.prepare('SELECT * FROM record_access_log ORDER BY seq').all() as unknown as Record<string, unknown>[];
   let previous = ACCESS_GENESIS;
   for (const raw of rows) {
    const row: AccessRow = {
     id: String(raw.id), seq: Number(raw.seq), at: Number(raw.at),
     actorId: String(raw.actor_id), actorRole: String(raw.actor_role),
     actorLabel: raw.actor_label === null ? null : String(raw.actor_label),
     capability: String(raw.capability), processingPurpose: String(raw.processing_purpose),
     lawfulBasis: String(raw.lawful_basis), recordType: String(raw.record_type),
     recordId: String(raw.record_id), subjectId: String(raw.subject_id),
     outcome: String(raw.outcome) as AccessRow['outcome'],
     refusedBy: raw.refused_by === null ? null : String(raw.refused_by),
     reason: raw.reason === null ? null : String(raw.reason),
     consentPurpose: raw.consent_purpose === null ? null : String(raw.consent_purpose),
     consentVersion: raw.consent_version === null ? null : Number(raw.consent_version),
     auditId: raw.audit_id === null ? null : String(raw.audit_id),
     previousHash: previous, hash: ''
    };
    const hash = accessDigest(row, previous);
    db.prepare('UPDATE record_access_log SET previous_hash = ?, hash = ? WHERE id = ?').run(previous, hash, row.id);
    previous = hash;
   }
  });

  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false, 'a re-linked log must not verify');
  assert.equal(verdict.intact === false && verdict.brokenAt, null, 'nothing in the log itself is out of step — that is why the seal is needed');
  assert.match(verdict.intact === false ? verdict.because : '', /committed to a head this log no longer has/);
 });

 test('truncating the log to nothing does not verify, because the seals outlive it', () => {
  /* The gap protection/audit.ts states for its own chain — an empty log verifies, because there is
     nothing left to contradict — does not apply on this side. The seals are in the other chain. */
  const h = service();
  for (let at = 0; at < 4; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  h.log.sealNow();
  h.close();
  tamper(h.path, db => { db.exec('DELETE FROM record_access_log'); });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
  assert.equal(verdict.length, 0);
  assert.match(verdict.intact === false ? verdict.because : '', /no longer has/);
 });

 test('removing the last entries after they were sealed is caught', () => {
  const h = service();
  for (let at = 0; at < 4; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  h.log.sealNow();
  const links = h.log.links();
  h.close();
  tamper(h.path, db => { db.prepare('DELETE FROM record_access_log WHERE id = ?').run(links[3]!.id); });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
 });

 test('a row appended after the last seal is not covered, and the verifier says so', () => {
  /* The window, demonstrated rather than described. This is what "narrowed" would look like if the
     rest of the file did not hold — and it is the residual that remains after it does. */
  const h = service({ every: 100, afterMs: 60 * 60_000 });
  for (let at = 0; at < 3; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  h.log.sealNow();
  h.close();
  tamper(h.path, db => {
   const rows = db.prepare('SELECT * FROM record_access_log ORDER BY seq DESC LIMIT 1').all() as unknown as Record<string, unknown>[];
   const previous = String(rows[0]!.hash);
   const forged: AccessRow = {
    id: 'forged-1', seq: 99, at: NOW, actorId: 'stranger-1', actorRole: 'nurse', actorLabel: null,
    capability: 'view-clinical-record', processingPurpose: 'treatment', lawfulBasis: 's11a-consent',
    recordType: 'vitals', recordId: 'V-9', subjectId: PATIENT, outcome: 'granted',
    refusedBy: null, reason: null, consentPurpose: 'care-delivery', consentVersion: 1,
    auditId: null, previousHash: previous, hash: ''
   };
   db.prepare(`INSERT INTO record_access_log
    (id, seq, at, actor_id, actor_role, actor_label, capability, processing_purpose, lawful_basis,
     record_type, record_id, subject_id, outcome, refused_by, reason, consent_purpose, consent_version,
     audit_id, previous_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    forged.id, forged.seq, forged.at, forged.actorId, forged.actorRole, forged.actorLabel,
    forged.capability, forged.processingPurpose, forged.lawfulBasis, forged.recordType,
    forged.recordId, forged.subjectId, forged.outcome, forged.refusedBy, forged.reason,
    forged.consentPurpose, forged.consentVersion, forged.auditId, previous, accessDigest(forged, previous));
  });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, true, 'a row after the last seal is inside the window, and the window is real');
  assert.ok(verdict.intact && verdict.unsealed >= 1, 'and the verdict says how many entries are in it');
  assert.ok(verdict.intact && verdict.sealedThrough < verdict.length);
 });
});

/* ---- The chain the seals live in ---------------------------------------------------------------- */

describe('the chain the seals live in', () => {
 test('a broken audit chain is reported before the log, because it decides what the seals are worth', () => {
  const h = service();
  for (let at = 0; at < 3; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  h.close();
  tamper(h.path, db => {
   db.prepare("UPDATE protected_access_log SET reason = 'edited' WHERE seq = 1").run();
  });
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
  assert.match(verdict.intact === false ? verdict.because : '', /audit chain the seals live in is broken/);
  assert.match(verdict.intact === false ? verdict.because : '', /nothing sealed into it means anything/);
 });

 test('a seal cannot be forged without the audit key, which is the whole of the arrangement', () => {
  /* Two services, two key rings, one file. The seal written under the second ring does not verify
     under the first, so a seal an attacker computed themselves is worse than useless to them. */
  const h = service();
  h.log.open(read());
  h.close();
  const wrongKey = service({ path: h.path, keys: `1:${randomBytes(32).toString('hex')}` });
  wrongKey.log.open(read({ recordId: 'V-2' }));
  wrongKey.close();
  const { verdict } = inspect(h.path, h.keys);
  assert.equal(verdict.intact, false);
  assert.match(verdict.intact === false ? verdict.because : '', /audit chain the seals live in is broken/);
 });
});

/* ---- A register that predates the links --------------------------------------------------------- */

describe('a database written before any of this existed', () => {
 test('gains the columns on the next start rather than on a hand-written migration', () => {
  const path = join(workspace, `${randomUUID()}.db`);
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE record_access_log (
   id TEXT PRIMARY KEY, seq INTEGER NOT NULL, at INTEGER NOT NULL,
   actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, actor_label TEXT,
   capability TEXT NOT NULL, processing_purpose TEXT NOT NULL, lawful_basis TEXT NOT NULL,
   record_type TEXT NOT NULL, record_id TEXT NOT NULL, subject_id TEXT NOT NULL,
   outcome TEXT NOT NULL, refused_by TEXT, reason TEXT,
   consent_purpose TEXT, consent_version INTEGER, audit_id TEXT)`);
  old.exec(`INSERT INTO record_access_log
   (id, seq, at, actor_id, actor_role, capability, processing_purpose, lawful_basis, record_type, record_id, subject_id, outcome)
   VALUES ('older-1', 1, 0, 'nurse-1', 'nurse', 'view-clinical-record', 'treatment', 's11a-consent', 'vitals', 'V-0', '${PATIENT}', 'granted')`);
  old.close();

  const h = service({ path });
  const columns = new Set((h.db.prepare('PRAGMA table_info(record_access_log)').all() as { name: string }[]).map(column => column.name));
  assert.ok(columns.has('previous_hash') && columns.has('hash'));
  h.close();
 });

 test('and its existing rows are reported as vouched for by nothing, not as tampering', () => {
  /* A row nobody could have hashed at the time is not evidence that somebody edited it. A verifier
     that cried wolf over an upgrade would be switched off in a week, and then it would be there for
     the real thing and nobody would be reading it. */
  const path = join(workspace, `${randomUUID()}.db`);
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE record_access_log (
   id TEXT PRIMARY KEY, seq INTEGER NOT NULL, at INTEGER NOT NULL,
   actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, actor_label TEXT,
   capability TEXT NOT NULL, processing_purpose TEXT NOT NULL, lawful_basis TEXT NOT NULL,
   record_type TEXT NOT NULL, record_id TEXT NOT NULL, subject_id TEXT NOT NULL,
   outcome TEXT NOT NULL, refused_by TEXT, reason TEXT,
   consent_purpose TEXT, consent_version INTEGER, audit_id TEXT)`);
  for (const seq of [1, 2]) {
   old.exec(`INSERT INTO record_access_log
    (id, seq, at, actor_id, actor_role, capability, processing_purpose, lawful_basis, record_type, record_id, subject_id, outcome)
    VALUES ('older-${seq}', ${seq}, 0, 'nurse-1', 'nurse', 'view-clinical-record', 'treatment', 's11a-consent', 'vitals', 'V-${seq}', '${PATIENT}', 'granted')`);
  }
  old.close();

  const h = service({ path });
  h.log.open(read({ recordId: 'V-new' }));
  const verdict = h.verify();
  assert.equal(verdict.intact, true, 'an upgrade is not a break-in');
  assert.equal(verdict.intact && verdict.unchained, 2, 'and the two rows nothing can vouch for are counted, not hidden');
  const links = h.log.links();
  assert.equal(links[0]!.chained, false);
  assert.equal(links[2]!.chained, true);
  assert.equal(links[2]!.previousHash, ACCESS_GENESIS, 'the first entry that could be chained starts the chain');
  h.close();
 });

 test('and an old row edited afterwards is still not caught, which is why nothing is backfilled', () => {
  /* Said as a test rather than in a comment. Backfilling hashes over rows the service cannot know
     were not already altered would produce a chain that certifies whatever it found — a worse
     answer than a count of rows nothing vouches for. */
  const path = join(workspace, `${randomUUID()}.db`);
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE record_access_log (
   id TEXT PRIMARY KEY, seq INTEGER NOT NULL, at INTEGER NOT NULL,
   actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, actor_label TEXT,
   capability TEXT NOT NULL, processing_purpose TEXT NOT NULL, lawful_basis TEXT NOT NULL,
   record_type TEXT NOT NULL, record_id TEXT NOT NULL, subject_id TEXT NOT NULL,
   outcome TEXT NOT NULL, refused_by TEXT, reason TEXT,
   consent_purpose TEXT, consent_version INTEGER, audit_id TEXT)`);
  old.exec(`INSERT INTO record_access_log
   (id, seq, at, actor_id, actor_role, capability, processing_purpose, lawful_basis, record_type, record_id, subject_id, outcome)
   VALUES ('older-1', 1, 0, 'nurse-1', 'nurse', 'view-clinical-record', 'treatment', 's11a-consent', 'vitals', 'V-0', '${PATIENT}', 'granted')`);
  old.close();
  const h = service({ path });
  const keys = h.keys;
  h.log.open(read());
  h.close();
  tamper(path, db => { db.prepare("UPDATE record_access_log SET actor_id = 'nurse-9' WHERE id = 'older-1'").run(); });
  const { verdict } = inspect(path, keys);
  assert.equal(verdict.intact, true, 'nothing ever vouched for that row, and the verdict has never said it did');
  assert.equal(verdict.intact && verdict.unchained, 1, 'which is exactly what the count is for');
 });
});

/* ---- The verdict an operator reads --------------------------------------------------------------- */

describe('what the verdict says', () => {
 test('an intact log reports how far the seals reach and how much is still in the window', () => {
  const h = service({ every: 100, afterMs: 60 * 60_000 });
  for (let at = 0; at < 6; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const verdict = h.verify();
  assert.equal(verdict.intact, true);
  assert.ok(verdict.intact && verdict.length === 6);
  assert.ok(verdict.intact && verdict.seals === 1, 'the start-up fence');
  assert.ok(verdict.intact && verdict.sealedThrough === 1);
  assert.ok(verdict.intact && verdict.unsealed === 5, 'and it does not round the window away');
  assert.equal(verdict.logId, ACCESS_LOG_ID);
  h.close();
 });

 test('an empty log is intact and says nothing more than that', () => {
  const h = service();
  const verdict = h.verify();
  assert.equal(verdict.intact, true);
  assert.ok(verdict.intact && verdict.length === 0 && verdict.seals === 0 && verdict.unsealed === 0);
  h.close();
 });

 test('verifying does not seal, so a verifier never certifies what it was asked to look at', () => {
  const h = service({ every: 100, afterMs: 60 * 60_000 });
  for (let at = 0; at < 4; at += 1) h.log.open(read({ recordId: `V-${at}` }));
  const before = h.seals().length;
  h.verify();
  h.verify();
  assert.equal(h.seals().length, before);
  h.close();
 });

 test('the verdict names counts and a verdict, and never an entry or a person', () => {
  /* The health route hands this straight out. A verdict that carried an actor or a subject would be
     a route publishing the access log to whoever can reach the loopback. */
  const h = service();
  h.log.open(read());
  const words = JSON.stringify(h.verify());
  for (const secret of ['nurse-1', PATIENT, 'Naledi', 'V-1', 'view-clinical-record']) {
   assert.equal(words.includes(secret), false, `the verdict named ${secret}`);
  }
  h.close();
 });
});
