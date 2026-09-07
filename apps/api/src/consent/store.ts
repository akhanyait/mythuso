/**
 * Two ledgers: what somebody decided about a purpose, and who opened whose record.
 *
 * ── Both are append-only, and neither has an UPDATE ──────────────────────────────────────────
 *
 * A withdrawal is a new row, not an edit of the row that gave it. "They never consented" and "they
 * consented and then stopped" are different facts, and a table that overwrote the first with the
 * second could not tell them apart afterwards — which is exactly the question an Information
 * Regulator asks. So the current standing is *derived* on every read from the decisions in order,
 * the way the gate derives a vetting standing from evidence rather than trusting a stored word.
 *
 * There is no UPDATE and no DELETE in this file against either table, and
 * `scripts/check-boundaries.mjs` fails the build if one appears — the same guard the auth `audit`
 * table has had since it was written.
 *
 * ── Why `record_access_log` is not the `audit` table ─────────────────────────────────────────
 *
 * `audit` answers "who signed in, from where, and was the code right". This answers "who opened
 * whose record, when, under what lawful basis and what capability, and were they allowed to". They
 * are different questions with different retentions and different audiences: the first is read by an
 * operator investigating an account takeover, and the second is read by the person whose record it
 * is. Folding them together would mean one retention period for two questions that have different
 * answers, and a person opening "who has looked at my record" being shown a list of their own failed
 * sign-ins. It is the same reasoning `protection/audit.ts` gives for keeping the gate's hash chain
 * out of `audit`, applied one level further out.
 *
 * ── And why it is not the hash chain either ──────────────────────────────────────────────────
 *
 * It is not a second copy of the chain: it is the projection of the same decision that the data
 * subject is entitled to read, and it carries `audit_id` — the identifier of the chain entry the
 * gate wrote for that very decision, so the two can be read side by side.
 *
 * That used to be the whole of the answer, and it was not enough. An id correlates two rows; it does
 * not detect one of them being rewritten, because a pointer survives the row it points from being
 * altered — and the entries most worth altering are the ones refused before the gate was ever
 * consulted, which carry no id at all. So each row now also carries `previous_hash` and `hash`, a
 * plain SHA-256 chain over its own contents, and the *head* of that chain is committed into the
 * gate's keyed chain by `apps/api/src/protection/seal.ts`.
 *
 * The division is the point. A plain digest chain proves nothing by itself — anybody can recompute
 * it — and this module still holds no key, still cannot compute an HMAC, and is handed a `LogSeal`
 * whose whole vocabulary is "commit this head". It cannot write an access entry into the chain and
 * it cannot forge a seal. What it can do is produce a head that stops matching the moment a row is
 * touched. See `integrity.ts` for the digest and `protection/seal.ts` for the key and the window.
 *
 * ── What is not in here ──────────────────────────────────────────────────────────────────────
 *
 * Nothing that was read. There is no column for a reading, a finding or anything a clinician wrote,
 * and `packages/catalog/consent.json` names the column words that may never appear so the check is
 * against the contract rather than against somebody's memory of it.
 *
 * Structural, as the audit store and the vetting store are: this file imports no database driver,
 * and a test can hand it anything answering the same two calls.
 */
import { randomUUID } from 'node:crypto';
import { ACCESS_GENESIS, accessDigest, accessLinks, type AccessLink } from './integrity.ts';
import type { Decision, PurposeKind } from './contract.ts';

type SqlValue = string | number | bigint | Uint8Array | null;
export type Database = {
 exec(sql: string): void;
 prepare(sql: string): { run(...params: SqlValue[]): unknown; all(...params: SqlValue[]): unknown[] };
};

/* One row per decision, keyed by its own id rather than by (subject, purpose): the whole point is
   that a person may decide about the same purpose more than once, and the second decision must not
   land on top of the first. `seq` is the order decisions were taken in, so two decisions inside the
   same millisecond still resolve to one answer rather than to whichever the database returns first. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS consent_decisions (
 id TEXT PRIMARY KEY, seq INTEGER NOT NULL,
 subject_id TEXT NOT NULL, purpose_id TEXT NOT NULL, purpose_kind TEXT NOT NULL,
 version INTEGER NOT NULL, decision TEXT NOT NULL,
 wording_hash TEXT NOT NULL, route TEXT NOT NULL, locale TEXT NOT NULL,
 recorded_by TEXT NOT NULL, recorded_as TEXT NOT NULL,
 at INTEGER NOT NULL, given_reason TEXT);
CREATE INDEX IF NOT EXISTS consent_decisions_subject ON consent_decisions (subject_id, purpose_id, seq);
CREATE INDEX IF NOT EXISTS consent_decisions_seq ON consent_decisions (seq);
CREATE TABLE IF NOT EXISTS record_access_log (
 id TEXT PRIMARY KEY, seq INTEGER NOT NULL, at INTEGER NOT NULL,
 actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, actor_label TEXT,
 capability TEXT NOT NULL, processing_purpose TEXT NOT NULL, lawful_basis TEXT NOT NULL,
 record_type TEXT NOT NULL, record_id TEXT NOT NULL, subject_id TEXT NOT NULL,
 outcome TEXT NOT NULL, refused_by TEXT, reason TEXT,
 consent_purpose TEXT, consent_version INTEGER, audit_id TEXT,
 previous_hash TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS record_access_log_subject ON record_access_log (subject_id, seq);
CREATE INDEX IF NOT EXISTS record_access_log_actor ON record_access_log (actor_id, seq);
`;

export type DecisionRow = {
 id: string;
 seq: number;
 subjectId: string;
 purposeId: string;
 purposeKind: PurposeKind;
 version: number;
 decision: Decision;
 /** SHA-256 of the exact wording and withdrawal sentence that were shown. See contract.ts. */
 wordingHash: string;
 route: string;
 locale: string;
 /** Who put it on the ledger — the person themselves, a nurse reading it aloud, or a guardian. */
 recordedBy: string;
 /** 'self' | 'nurse' | 'guardian' | … — the capacity they acted in, never inferred from the id. */
 recordedAs: string;
 at: number;
 /** Only ever a reason somebody chose to give. A withdrawal never requires one. */
 givenReason: string | null;
};

export type AccessOutcome = 'granted' | 'refused';

export type AccessRow = {
 id: string;
 seq: number;
 at: number;
 actorId: string;
 actorRole: string;
 /** How the person should be named to the data subject, where the platform knows. Never a record. */
 actorLabel: string | null;
 capability: string;
 processingPurpose: string;
 lawfulBasis: string;
 recordType: string;
 recordId: string;
 subjectId: string;
 outcome: AccessOutcome;
 /** The stage that refused, as the gate names it. Null on a granted access. */
 refusedBy: string | null;
 reason: string | null;
 /** Which consent was relied on, where the basis was consent. Null otherwise. */
 consentPurpose: string | null;
 consentVersion: number | null;
 /** The gate's own chain entry for the same decision, so the two can be compared. */
 auditId: string | null;
 /* The row's place in the log's own links. Computed by the store on the way in and never by a
    caller, which is the only reason they mean anything: a hash a caller supplies is a hash the
    caller chose. See integrity.ts for what they are worth without the seal, which is nothing. */
 previousHash: string;
 hash: string;
};

/** What a caller supplies. The sequence and the links are the store's to work out, not theirs. */
export type NewAccessRow = Omit<AccessRow, 'seq' | 'previousHash' | 'hash'>;

export type ConsentStore = {
 /** Appends a decision. There is no way to change one that is already there. */
 record(row: Omit<DecisionRow, 'seq'>): DecisionRow;
 /** Every decision this person has taken, oldest first. The standing is derived from it. */
 decisionsFor(subjectId: string): DecisionRow[];
 /** Every decision about one purpose, oldest first. */
 decisionsForPurpose(subjectId: string, purposeId: string): DecisionRow[];
 /** Whether this person has any consent record at all — asked by the erasure register. */
 hasDecisions(subjectId: string): boolean;
 countDecisions(): number;

 /** Appends an access entry, granted or refused. */
 recordAccess(row: NewAccessRow): AccessRow;
 /** The log's head: how many entries it holds and what the last one hashes to. One query. */
 accessHead(): { length: number; head: string };
 /** Every entry as a link, each recomputed from the row as it stands on disk. For the verifier. */
 accessLinks(): AccessLink[];
 /** The log the person whose record it is reads, newest first. */
 accessesFor(subjectId: string, limit: number): AccessRow[];
 /** Everything, oldest first. For tests and for an operator, never for a route. */
 allAccesses(): AccessRow[];
 countAccesses(): number;
};

const asDecision = (raw: unknown): DecisionRow => {
 const row = raw as Record<string, unknown>;
 return {
  id: String(row.id), seq: Number(row.seq), subjectId: String(row.subject_id),
  purposeId: String(row.purpose_id), purposeKind: String(row.purpose_kind) as PurposeKind,
  version: Number(row.version), decision: String(row.decision) as Decision,
  wordingHash: String(row.wording_hash), route: String(row.route), locale: String(row.locale),
  recordedBy: String(row.recorded_by), recordedAs: String(row.recorded_as),
  at: Number(row.at), givenReason: row.given_reason === null || row.given_reason === undefined ? null : String(row.given_reason)
 };
};

const asAccess = (raw: unknown): AccessRow => {
 const row = raw as Record<string, unknown>;
 const optional = (value: unknown): string | null => value === null || value === undefined ? null : String(value);
 return {
  id: String(row.id), seq: Number(row.seq), at: Number(row.at),
  actorId: String(row.actor_id), actorRole: String(row.actor_role), actorLabel: optional(row.actor_label),
  capability: String(row.capability), processingPurpose: String(row.processing_purpose),
  lawfulBasis: String(row.lawful_basis), recordType: String(row.record_type),
  recordId: String(row.record_id), subjectId: String(row.subject_id),
  outcome: String(row.outcome) as AccessOutcome,
  refusedBy: optional(row.refused_by), reason: optional(row.reason),
  consentPurpose: optional(row.consent_purpose),
  consentVersion: row.consent_version === null || row.consent_version === undefined ? null : Number(row.consent_version),
  auditId: optional(row.audit_id),
  previousHash: optional(row.previous_hash) ?? '', hash: optional(row.hash) ?? ''
 };
};

export function openConsentStore(db: Database): ConsentStore {
 db.exec(SCHEMA);
 /* A register written before the log carried links gains the two columns on the next start rather
    than on a hand-written migration, the same way vetting/store.ts adds `bootstrapped_at`. The rows
    already in it read as empty, and the verifier reports them as vouched for by nothing — which is
    the truthful answer. Backfilling them would be this module writing hashes over rows it cannot
    know were not already altered, which is a chain that certifies whatever it finds. */
 const columns = new Set((db.prepare('PRAGMA table_info(record_access_log)').all() as { name: string }[]).map(column => column.name));
 if (!columns.has('previous_hash')) db.exec("ALTER TABLE record_access_log ADD COLUMN previous_hash TEXT NOT NULL DEFAULT ''");
 if (!columns.has('hash')) db.exec("ALTER TABLE record_access_log ADD COLUMN hash TEXT NOT NULL DEFAULT ''");
 const insertDecision = db.prepare(`INSERT INTO consent_decisions
  (id, seq, subject_id, purpose_id, purpose_kind, version, decision, wording_hash, route, locale, recorded_by, recorded_as, at, given_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
 const insertAccess = db.prepare(`INSERT INTO record_access_log
  (id, seq, at, actor_id, actor_role, actor_label, capability, processing_purpose, lawful_basis,
   record_type, record_id, subject_id, outcome, refused_by, reason, consent_purpose, consent_version, audit_id,
   previous_hash, hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
 const topDecision = db.prepare('SELECT MAX(seq) AS seq FROM consent_decisions');
 const topAccess = db.prepare('SELECT MAX(seq) AS seq FROM record_access_log');
 const bySubject = db.prepare('SELECT * FROM consent_decisions WHERE subject_id = ? ORDER BY seq');
 const bySubjectPurpose = db.prepare('SELECT * FROM consent_decisions WHERE subject_id = ? AND purpose_id = ? ORDER BY seq');
 const anyFor = db.prepare('SELECT COUNT(*) AS n FROM consent_decisions WHERE subject_id = ?');
 const countDecisions = db.prepare('SELECT COUNT(*) AS n FROM consent_decisions');
 const accessBySubject = db.prepare('SELECT * FROM record_access_log WHERE subject_id = ? ORDER BY seq DESC LIMIT ?');
 const allAccess = db.prepare('SELECT * FROM record_access_log ORDER BY seq');
 const lastAccess = db.prepare('SELECT hash FROM record_access_log ORDER BY seq DESC LIMIT 1');
 const countAccess = db.prepare('SELECT COUNT(*) AS n FROM record_access_log');
 const next = (statement: { all(...params: SqlValue[]): unknown[] }): number =>
  Number((statement.all()[0] as { seq: number | bigint | null } | undefined)?.seq ?? 0) + 1;
 const count = (statement: { all(...params: SqlValue[]): unknown[] }, ...params: SqlValue[]): number =>
  Number((statement.all(...params)[0] as { n: number | bigint }).n);

 return {
  record(row) {
   const complete: DecisionRow = { ...row, seq: next(topDecision) };
   insertDecision.run(complete.id, complete.seq, complete.subjectId, complete.purposeId, complete.purposeKind,
    complete.version, complete.decision, complete.wordingHash, complete.route, complete.locale,
    complete.recordedBy, complete.recordedAs, complete.at, complete.givenReason);
   return complete;
  },
  decisionsFor(subjectId) { return bySubject.all(subjectId).map(asDecision); },
  decisionsForPurpose(subjectId, purposeId) { return bySubjectPurpose.all(subjectId, purposeId).map(asDecision); },
  hasDecisions(subjectId) { return count(anyFor, subjectId) > 0; },
  countDecisions() { return count(countDecisions); },

  recordAccess(row) {
   /* The previous hash is read out of the table rather than remembered in a field: two processes
      writing to the same database file would otherwise each chain onto their own last write and
      produce two forks that both look intact. */
   const previousHash = (lastAccess.all()[0] as { hash?: string } | undefined)?.hash || ACCESS_GENESIS;
   const complete: AccessRow = { ...row, seq: next(topAccess), previousHash, hash: '' };
   complete.hash = accessDigest(complete, previousHash);
   insertAccess.run(complete.id, complete.seq, complete.at, complete.actorId, complete.actorRole,
    complete.actorLabel, complete.capability, complete.processingPurpose, complete.lawfulBasis,
    complete.recordType, complete.recordId, complete.subjectId, complete.outcome,
    complete.refusedBy, complete.reason, complete.consentPurpose, complete.consentVersion, complete.auditId,
    complete.previousHash, complete.hash);
   return complete;
  },
  accessHead() {
   const last = lastAccess.all()[0] as { hash?: string } | undefined;
   return { length: count(countAccess), head: last?.hash || ACCESS_GENESIS };
  },
  accessLinks() { return accessLinks(allAccess.all().map(asAccess)); },
  accessesFor(subjectId, limit) { return accessBySubject.all(subjectId, limit).map(asAccess); },
  allAccesses() { return allAccess.all().map(asAccess); },
  countAccesses() { return count(countAccess); }
 };
}

export const decisionId = (): string => randomUUID();
