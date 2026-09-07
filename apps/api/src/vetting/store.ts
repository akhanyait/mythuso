/**
 * Where the vetting evidence lives.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────────────────────
 *
 * A party, one evidence record per check the party's role owes, and a version per file uploaded
 * against it. That shape is borrowed from a sibling project's compliance vault, where it earned its
 * keep — but MyThuso's contract is richer and the schema follows the contract rather than the
 * borrowing. A check here has an authority, an evidence requirement, a renewal cadence and a risk
 * level, and a high-risk one is not verified until a second, different reviewer agrees. The sibling
 * had a three-state approval with no second-reviewer concept at all. That rule is the one thing in
 * this file most worth not losing, so it is a pair of columns and a store that refuses rather than a
 * convention somebody remembers.
 *
 * ── One evidence record per check, versions beneath it ───────────────────────────────────────
 *
 * Renewing a clearance adds version 2 and moves the dates; it does not open a second record. Two
 * records for one check would be two answers to "is her clearance in date", and the wrong one would
 * be the one somebody read. Old versions stay, because "what did we actually hold on the day we sent
 * her" is a question asked after something has gone wrong, and an answer that was overwritten is not
 * an answer.
 *
 * ── The sealed column, and the version beside it ─────────────────────────────────────────────
 *
 * `document` holds what the protection module produced and nothing this file can read. `key_version`
 * sits beside it, indexed, so a rotation can select the values still on an old key rather than
 * decoding the table to find out. It is denormalised — the version is inside the blob too — and the
 * rotation recomputes it from the bytes on every rewrite, so it can be behind but never wrong for
 * long.
 *
 * ── What is not here ─────────────────────────────────────────────────────────────────────────
 *
 * No health information of any kind. This is workforce data: who may work, on what evidence.
 * scripts/check-boundaries.mjs still fails the build if a clinical table appears in this service and
 * nothing below goes near that line.
 */
import { randomUUID } from 'node:crypto';
import catalogue from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import type { ActorVetting, CheckRecord, SealedColumn } from '../protection/index.ts';
import type { Evidence, EvidenceVersion, Party, Risk, StoredState } from './contract.ts';

/* Structural, exactly as the audit store is: this file imports no database driver, and a test can
   hand it anything answering the same two calls. node:sqlite's DatabaseSync fits as it stands. */
type SqlValue = string | number | bigint | Uint8Array | null;
export type Database = {
 exec(sql: string): void;
 prepare(sql: string): { run(...params: SqlValue[]): unknown; all(...params: SqlValue[]): unknown[] };
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vetting_parties (
 id TEXT PRIMARY KEY, role_id TEXT NOT NULL, reference TEXT,
 suspended_at INTEGER, suspended_reason TEXT, declined_at INTEGER, declined_reason TEXT,
 created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vetting_evidence (
 id TEXT PRIMARY KEY, party_id TEXT NOT NULL, role_id TEXT NOT NULL, check_id TEXT NOT NULL,
 authority TEXT NOT NULL, risk TEXT NOT NULL, renew_months INTEGER,
 state TEXT NOT NULL, issued_on TEXT, expires_on TEXT,
 decided_at INTEGER, decided_by TEXT, seconded_at INTEGER, seconded_by TEXT, declined_reason TEXT,
 bootstrapped_at INTEGER,
 created_at INTEGER NOT NULL,
 UNIQUE (party_id, check_id));
CREATE INDEX IF NOT EXISTS vetting_evidence_bootstrapped ON vetting_evidence (bootstrapped_at);
CREATE INDEX IF NOT EXISTS vetting_evidence_party ON vetting_evidence (party_id);
CREATE INDEX IF NOT EXISTS vetting_evidence_expiry ON vetting_evidence (expires_on);
CREATE TABLE IF NOT EXISTS vetting_evidence_versions (
 id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL, version_number INTEGER NOT NULL,
 filename TEXT NOT NULL, bytes INTEGER NOT NULL, content_hash TEXT NOT NULL,
 document BLOB NOT NULL, key_version INTEGER NOT NULL,
 uploaded_by TEXT NOT NULL, uploaded_at INTEGER NOT NULL,
 UNIQUE (evidence_id, version_number));
CREATE INDEX IF NOT EXISTS vetting_evidence_versions_evidence ON vetting_evidence_versions (evidence_id);
CREATE INDEX IF NOT EXISTS vetting_evidence_versions_key ON vetting_evidence_versions (key_version);
CREATE TABLE IF NOT EXISTS vetting_renewal_notices (
 dedupe_key TEXT PRIMARY KEY, evidence_id TEXT NOT NULL, milestone_days INTEGER NOT NULL,
 at INTEGER NOT NULL, delivered INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS vetting_renewal_notices_evidence ON vetting_renewal_notices (evidence_id);
/* Every bootstrap authorisation that has ever been spent on this database, by the sixteen characters
   that identify it and never by the token itself. The primary key is what makes an authorisation
   single-use: spending one is an insert, and the second attempt collides. It survives a restart,
   which an in-memory set would not — and "it worked after I restarted the service" is exactly how a
   one-shot control becomes a standing one. */
CREATE TABLE IF NOT EXISTS vetting_bootstrap_ceremonies (
 fingerprint TEXT PRIMARY KEY, opened_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 decided_by TEXT NOT NULL, seconded_by TEXT NOT NULL, parties TEXT NOT NULL);
`;

/**
 * What the rotation is told about this module's tables.
 *
 * Declared here, by the module that owns the table, and handed to the protection module at
 * composition. The alternative — a list of tables inside the rotation — is a list that stops being
 * complete the first time somebody adds a sealed column somewhere else.
 */
export const SEALED_COLUMNS: readonly SealedColumn[] = [
 {
  label: 'Vetting evidence documents',
  table: 'vetting_evidence_versions',
  idColumn: 'id',
  blobColumn: 'document',
  versionColumn: 'key_version'
 }
];

/* The catalogue, indexed. Read, never restated: a check added to packages/catalog/vetting.json is a
   check this module owes the moment it is added. */
type CatalogueCheck = { id: string; name: string; authority: string; renewMonths: number | null; risk: string; evidence: string };
type CatalogueRole = { id: string; name: string; checks: readonly CatalogueCheck[] };
const ROLES = new Map<string, CatalogueRole>((catalogue.roles as readonly CatalogueRole[]).map(role => [role.id, role] as const));
export const roleChecks = (roleId: string): readonly CatalogueCheck[] => ROLES.get(roleId)?.checks ?? [];
export const catalogueCheck = (roleId: string, checkId: string): CatalogueCheck | undefined =>
 roleChecks(roleId).find(check => check.id === checkId);
export const roleName = (roleId: string): string => ROLES.get(roleId)?.name ?? roleId;

/** One founding ceremony, as it can be asked about afterwards. Never the token, only its fingerprint. */
export type BootstrapCeremonyRecord = {
 fingerprint: string;
 openedAt: number;
 expiresAt: number;
 decidedBy: string;
 secondedBy: string;
 parties: string[];
};

export type VettingStore = {
 putParty(party: Party): void;
 findParty(id: string): Party | null;
 suspend(partyId: string, at: number, reason: string): void;
 restore(partyId: string): void;
 decline(partyId: string, at: number, reason: string): void;
 /** Creates the record the catalogue says the role owes, or hands back the one that is already there. */
 openEvidence(partyId: string, checkId: string, at: number): Evidence;
 findEvidence(id: string): Evidence | null;
 findEvidenceFor(partyId: string, checkId: string): Evidence | null;
 evidenceForParty(partyId: string): Evidence[];
 /** Every verified record carrying an expiry, oldest expiry first. What the nightly sweep walks. */
 expiring(): Evidence[];
 saveEvidence(evidence: Evidence): void;
 addVersion(version: EvidenceVersion, document: Uint8Array): void;
 versions(evidenceId: string): EvidenceVersion[];
 findVersion(evidenceId: string, versionNumber: number): { version: EvidenceVersion; document: Uint8Array } | null;
 countVersions(evidenceId: string): number;
 noticesSent(evidenceId: string): Set<string>;
 recordNotice(dedupeKey: string, evidenceId: string, milestoneDays: number, at: number, delivered: boolean): void;
 /** Everything held about one party, for the erasure answer and for the subject's own copy. */
 partiesCount(): number;
 /** Spend a bootstrap authorisation. False where this one has already been spent — see the schema. */
 spendBootstrap(ceremony: BootstrapCeremonyRecord): boolean;
 /** Every founding ceremony this database has seen, newest first. Short by construction. */
 ceremonies(): BootstrapCeremonyRecord[];
 /** Checks still standing on a decision nobody reviewed. The question an auditor asks. */
 bootstrapped(): Evidence[];
};

const asNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const asText = (value: unknown): string | null => value === null || value === undefined ? null : String(value);

function toParty(raw: unknown): Party {
 const row = raw as Record<string, unknown>;
 return {
  id: String(row.id), roleId: String(row.role_id), reference: asText(row.reference),
  suspendedAt: asNumber(row.suspended_at), suspendedReason: asText(row.suspended_reason),
  declinedAt: asNumber(row.declined_at), declinedReason: asText(row.declined_reason),
  createdAt: Number(row.created_at)
 };
}
function toEvidence(raw: unknown): Evidence {
 const row = raw as Record<string, unknown>;
 return {
  id: String(row.id), partyId: String(row.party_id), roleId: String(row.role_id), checkId: String(row.check_id),
  authority: String(row.authority), risk: String(row.risk) as Risk, renewMonths: asNumber(row.renew_months),
  state: String(row.state) as StoredState, issuedOn: asText(row.issued_on), expiresOn: asText(row.expires_on),
  decidedAt: asNumber(row.decided_at), decidedBy: asText(row.decided_by),
  secondedAt: asNumber(row.seconded_at), secondedBy: asText(row.seconded_by),
  declinedReason: asText(row.declined_reason), bootstrappedAt: asNumber(row.bootstrapped_at),
  createdAt: Number(row.created_at)
 };
}
function toVersion(raw: unknown): EvidenceVersion {
 const row = raw as Record<string, unknown>;
 return {
  id: String(row.id), evidenceId: String(row.evidence_id), versionNumber: Number(row.version_number),
  filename: String(row.filename), bytes: Number(row.bytes), contentHash: String(row.content_hash),
  keyVersion: Number(row.key_version), uploadedBy: String(row.uploaded_by), uploadedAt: Number(row.uploaded_at)
 };
}
const EVIDENCE_COLUMNS = 'id, party_id, role_id, check_id, authority, risk, renew_months, state, issued_on, expires_on, decided_at, decided_by, seconded_at, seconded_by, declined_reason, bootstrapped_at, created_at';
const VERSION_COLUMNS = 'id, evidence_id, version_number, filename, bytes, content_hash, key_version, uploaded_by, uploaded_at';

export function openVettingStore(db: Database): VettingStore {
 db.exec(SCHEMA);
 /* A database created before the bootstrap was made accountable has the evidence table without its
    bootstrapped_at column, and CREATE TABLE IF NOT EXISTS will not add one. Adding it here means an
    existing register gains the column on the next start rather than on the next hand-written
    migration — and the rows already in it read as null, which is the truthful answer: nothing knows
    whether they were bootstrapped, and a column that guessed would be worse than one that admits it. */
 const columns = db.prepare('PRAGMA table_info(vetting_evidence)').all() as { name: string }[];
 if (!columns.some(column => String(column.name) === 'bootstrapped_at')) {
  db.exec('ALTER TABLE vetting_evidence ADD COLUMN bootstrapped_at INTEGER');
 }
 const first = <T>(rows: unknown[], map: (raw: unknown) => T): T | null => rows.length ? map(rows[0]) : null;
 const findParty = (id: string): Party | null => first(db.prepare('SELECT * FROM vetting_parties WHERE id = ?').all(id), toParty);
 const findEvidenceFor = (partyId: string, checkId: string): Evidence | null =>
  first(db.prepare(`SELECT ${EVIDENCE_COLUMNS} FROM vetting_evidence WHERE party_id = ? AND check_id = ?`).all(partyId, checkId), toEvidence);
 return {
  putParty(party) {
   db.prepare(`INSERT INTO vetting_parties (id, role_id, reference, suspended_at, suspended_reason, declined_at, declined_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET role_id = excluded.role_id, reference = excluded.reference`)
    .run(party.id, party.roleId, party.reference, party.suspendedAt, party.suspendedReason, party.declinedAt, party.declinedReason, party.createdAt);
  },
  findParty,
  suspend(partyId, at, reason) {
   db.prepare('UPDATE vetting_parties SET suspended_at = ?, suspended_reason = ? WHERE id = ?').run(at, reason, partyId);
  },
  restore(partyId) {
   db.prepare('UPDATE vetting_parties SET suspended_at = NULL, suspended_reason = NULL WHERE id = ?').run(partyId);
  },
  decline(partyId, at, reason) {
   db.prepare('UPDATE vetting_parties SET declined_at = ?, declined_reason = ? WHERE id = ?').run(at, reason, partyId);
  },
  openEvidence(partyId, checkId, at) {
   const party = findParty(partyId);
   if (!party) throw new Error(`No party ${partyId} is being vetted, so there is no check to open against them.`);
   const existing = findEvidenceFor(partyId, checkId);
   if (existing) return existing;
   /* The catalogue decides what a check is. A check nobody defined is not a check somebody typed
      wrong — it is a hole in the gate the whole marketplace rests on, so it refuses. */
   const check = catalogueCheck(party.roleId, checkId);
   if (!check) throw new Error(`packages/catalog/vetting.json does not say that a ${roleName(party.roleId)} owes a "${checkId}" check.`);
   const evidence: Evidence = {
    id: randomUUID(), partyId, roleId: party.roleId, checkId,
    authority: check.authority, risk: check.risk === 'high' ? 'high' : 'standard',
    renewMonths: check.renewMonths, state: 'outstanding',
    issuedOn: null, expiresOn: null, decidedAt: null, decidedBy: null,
    secondedAt: null, secondedBy: null, declinedReason: null, bootstrappedAt: null, createdAt: at
   };
   db.prepare(`INSERT INTO vetting_evidence (${EVIDENCE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(evidence.id, evidence.partyId, evidence.roleId, evidence.checkId, evidence.authority, evidence.risk,
     evidence.renewMonths, evidence.state, evidence.issuedOn, evidence.expiresOn, evidence.decidedAt,
     evidence.decidedBy, evidence.secondedAt, evidence.secondedBy, evidence.declinedReason,
     evidence.bootstrappedAt, evidence.createdAt);
   return evidence;
  },
  findEvidence(id) {
   return first(db.prepare(`SELECT ${EVIDENCE_COLUMNS} FROM vetting_evidence WHERE id = ?`).all(id), toEvidence);
  },
  findEvidenceFor,
  evidenceForParty(partyId) {
   return db.prepare(`SELECT ${EVIDENCE_COLUMNS} FROM vetting_evidence WHERE party_id = ? ORDER BY check_id`).all(partyId).map(toEvidence);
  },
  expiring() {
   return db.prepare(`SELECT ${EVIDENCE_COLUMNS} FROM vetting_evidence WHERE state = 'verified' AND expires_on IS NOT NULL ORDER BY expires_on, id`).all().map(toEvidence);
  },
  saveEvidence(evidence) {
   db.prepare(`UPDATE vetting_evidence SET state = ?, issued_on = ?, expires_on = ?, decided_at = ?, decided_by = ?,
    seconded_at = ?, seconded_by = ?, declined_reason = ?, bootstrapped_at = ? WHERE id = ?`)
    .run(evidence.state, evidence.issuedOn, evidence.expiresOn, evidence.decidedAt, evidence.decidedBy,
     evidence.secondedAt, evidence.secondedBy, evidence.declinedReason, evidence.bootstrappedAt, evidence.id);
  },
  addVersion(version, document) {
   db.prepare(`INSERT INTO vetting_evidence_versions
    (id, evidence_id, version_number, filename, bytes, content_hash, document, key_version, uploaded_by, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(version.id, version.evidenceId, version.versionNumber, version.filename, version.bytes,
     version.contentHash, document, version.keyVersion, version.uploadedBy, version.uploadedAt);
  },
  versions(evidenceId) {
   return db.prepare(`SELECT ${VERSION_COLUMNS} FROM vetting_evidence_versions WHERE evidence_id = ? ORDER BY version_number`).all(evidenceId).map(toVersion);
  },
  findVersion(evidenceId, versionNumber) {
   const rows = db.prepare(`SELECT ${VERSION_COLUMNS}, document FROM vetting_evidence_versions WHERE evidence_id = ? AND version_number = ?`).all(evidenceId, versionNumber);
   if (!rows.length) return null;
   const raw = rows[0] as Record<string, unknown>;
   return { version: toVersion(raw), document: raw.document as Uint8Array };
  },
  countVersions(evidenceId) {
   const row = db.prepare('SELECT COUNT(*) AS n FROM vetting_evidence_versions WHERE evidence_id = ?').all(evidenceId)[0] as { n: number | bigint };
   return Number(row.n);
  },
  noticesSent(evidenceId) {
   const rows = db.prepare('SELECT dedupe_key FROM vetting_renewal_notices WHERE evidence_id = ?').all(evidenceId) as { dedupe_key: string }[];
   return new Set(rows.map(row => row.dedupe_key));
  },
  recordNotice(key, evidenceId, milestoneDays, at, delivered) {
   /* The insert is the dedupe. Two sweeps racing on the same evening both compute the same key, and
      the second one loses rather than sending a second notification. */
   db.prepare('INSERT OR IGNORE INTO vetting_renewal_notices (dedupe_key, evidence_id, milestone_days, at, delivered) VALUES (?, ?, ?, ?, ?)')
    .run(key, evidenceId, milestoneDays, at, delivered ? 1 : 0);
  },
  partiesCount() {
   const row = db.prepare('SELECT COUNT(*) AS n FROM vetting_parties').all()[0] as { n: number | bigint };
   return Number(row.n);
  },
  spendBootstrap(ceremony) {
   /* The insert is the control. A plain INSERT rather than INSERT OR IGNORE, because a second
      attempt on the same authorisation is not a duplicate to be tidied away — it is the thing this
      table exists to refuse, and it should be impossible to write it and carry on. */
   if (db.prepare('SELECT fingerprint FROM vetting_bootstrap_ceremonies WHERE fingerprint = ?').all(ceremony.fingerprint).length) return false;
   db.prepare('INSERT INTO vetting_bootstrap_ceremonies (fingerprint, opened_at, expires_at, decided_by, seconded_by, parties) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ceremony.fingerprint, ceremony.openedAt, ceremony.expiresAt, ceremony.decidedBy, ceremony.secondedBy, ceremony.parties.join(', '));
   return true;
  },
  ceremonies() {
   return db.prepare('SELECT * FROM vetting_bootstrap_ceremonies ORDER BY opened_at DESC').all().map(raw => {
    const row = raw as Record<string, unknown>;
    return {
     fingerprint: String(row.fingerprint), openedAt: Number(row.opened_at), expiresAt: Number(row.expires_at),
     decidedBy: String(row.decided_by), secondedBy: String(row.seconded_by),
     parties: String(row.parties).split(',').map(part => part.trim()).filter(Boolean)
    };
   });
  },
  bootstrapped() {
   return db.prepare(`SELECT ${EVIDENCE_COLUMNS} FROM vetting_evidence WHERE bootstrapped_at IS NOT NULL ORDER BY bootstrapped_at, party_id, check_id`).all().map(toEvidence);
  }
 };
}

/**
 * The gate's view of a party, read out of this store.
 *
 * This is the join that makes the whole thing real. Until now the service handed the gate a source
 * that answered "nobody" to every question, because there was no workforce to answer about. Now a
 * nurse's standing at the moment somebody tries to open a record is computed from the evidence
 * actually on file — and the gate resolves the expiry itself, so a police clearance that ran out
 * last night withdraws her capabilities this morning with nobody having to notice.
 */
export function vettingSource(store: VettingStore): { find(actorId: string): ActorVetting | null } {
 return {
  find(actorId) {
   const party = store.findParty(actorId);
   if (!party) return null;
   const records: CheckRecord[] = store.evidenceForParty(actorId).map(evidence => ({
    checkId: evidence.checkId,
    state: evidence.state,
    ...(evidence.expiresOn ? { expiresOn: evidence.expiresOn } : {}),
    ...(evidence.secondedBy ? { secondedBy: evidence.secondedBy } : {})
   }));
   return {
    actorId: party.id, roleId: party.roleId, records,
    ...(party.suspendedAt ? { suspended: true, suspendedReason: party.suspendedReason ?? undefined } : {}),
    ...(party.declinedAt ? { declined: true, declinedReason: party.declinedReason ?? undefined } : {})
   };
  }
 };
}
