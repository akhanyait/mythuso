/**
 * The intake ledger: what arrived, when the server received it, and what it was told.
 *
 * ── What is in here, and what is deliberately not ────────────────────────────────────────────
 *
 * Envelopes and decisions. Who captured it, whose record it is against, which slot of it, what the
 * device believed the time was, what the server's time was, where it sits in the order, and the
 * answer it was given. There is no reading in any column of any table below, and there is no column
 * one could be put in — which is what lets this exist while `scripts/check-boundaries.mjs` still
 * fails the build on a clinical table in this service.
 *
 * `payload_digest` is a SHA-256 of the sealed envelope the gate produced, and `payload_bytes` its
 * length. A commitment, not a copy: the envelope itself went back to the device with the receipt, so
 * the key ring is in this service and the ciphertext is not.
 *
 * ── Two tables and not one ───────────────────────────────────────────────────────────────────
 *
 * An entry is a fact about a sync; a conflict is a fact about a disagreement, and one entry can be
 * in more than one at once. Folding them together would mean a `conflict_kind` column that is null
 * most of the time and holds the second-most-interesting kind the rest of it — which is the same
 * reasoning vetting/store.ts gives for keeping an authority's answer out of the evidence row.
 *
 * ── What has no UPDATE ───────────────────────────────────────────────────────────────────────
 *
 * A settlement is the only thing that ever changes a row, and it can only be written where nothing
 * is written yet — the same guarded single write the identity callback uses, so two clinicians
 * settling the same entry in the same second produce one decision rather than the last one to
 * commit. Nothing deletes an entry except disposal on the ground the register gives, and disposal
 * will not touch an entry whose conflict is still open.
 *
 * Structural, as the audit store and the vetting store are: this file imports no database driver and
 * a test can hand it anything answering the same two calls.
 */
import { randomUUID } from 'node:crypto';
import type { CaptureState, ConflictKind, Resolver, Settlement } from './contract.ts';

type SqlValue = string | number | bigint | Uint8Array | null;
export type Database = {
 exec(sql: string): void;
 prepare(sql: string): { run(...params: SqlValue[]): unknown; all(...params: SqlValue[]): unknown[] };
};

/* The device's own id for an entry is the idempotency key, and it is only unique to that device, so
   the pair is the primary key. A second device inventing the same id lands beside it rather than on
   top of it — which is the failure a bare `entry_id` primary key would produce silently, and it
   would produce it as one nurse's work overwriting another's. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS capture_entries (
 device_id TEXT NOT NULL, entry_id TEXT NOT NULL, batch_id TEXT NOT NULL, seq INTEGER NOT NULL,
 actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, purpose TEXT NOT NULL, capability TEXT NOT NULL,
 record_type TEXT NOT NULL, record_id TEXT NOT NULL, subject_id TEXT NOT NULL,
 field TEXT NOT NULL, provenance TEXT NOT NULL,
 believed_captured_at INTEGER NOT NULL, received_at INTEGER NOT NULL, skew_ms INTEGER,
 state TEXT NOT NULL, reason TEXT,
 payload_digest TEXT, payload_bytes INTEGER, key_version INTEGER,
 settled_at INTEGER, settled_by TEXT, settled_as TEXT, settled_reason TEXT,
 PRIMARY KEY (device_id, entry_id));
CREATE INDEX IF NOT EXISTS capture_entries_order ON capture_entries (record_type, record_id, seq);
CREATE INDEX IF NOT EXISTS capture_entries_slot ON capture_entries (record_type, record_id, subject_id, field);
CREATE INDEX IF NOT EXISTS capture_entries_device ON capture_entries (device_id, received_at);
CREATE TABLE IF NOT EXISTS capture_conflicts (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL, entry_id TEXT NOT NULL,
 kind TEXT NOT NULL, resolution TEXT NOT NULL, finding TEXT NOT NULL,
 record_type TEXT NOT NULL, record_id TEXT NOT NULL, subject_id TEXT NOT NULL,
 detected_at INTEGER NOT NULL,
 settled_at INTEGER, settled_by TEXT, settled_as TEXT, settled_reason TEXT);
CREATE INDEX IF NOT EXISTS capture_conflicts_entry ON capture_conflicts (device_id, entry_id);
CREATE INDEX IF NOT EXISTS capture_conflicts_open ON capture_conflicts (settled_at, detected_at);
`;

export type CaptureRow = {
 deviceId: string;
 entryId: string;
 batchId: string;
 seq: number;
 actorId: string;
 actorRole: string;
 purpose: string;
 /** Which grant the capturer said they were exercising. The gate is what decided whether it opens. */
 capability: string;
 recordType: string;
 recordId: string;
 subjectId: string;
 field: string;
 provenance: string;
 believedCapturedAt: number;
 receivedAt: number;
 /** Null where the device did not say what time it thought it was. Not the same as zero. */
 skewMs: number | null;
 state: CaptureState;
 reason: string | null;
 payloadDigest: string | null;
 payloadBytes: number | null;
 keyVersion: number | null;
 settledAt: number | null;
 settledBy: string | null;
 settledAs: Settlement | null;
 settledReason: string | null;
};

export type ConflictRow = {
 id: string;
 deviceId: string;
 entryId: string;
 kind: ConflictKind;
 resolution: Resolver;
 finding: string;
 recordType: string;
 recordId: string;
 subjectId: string;
 detectedAt: number;
 settledAt: number | null;
 settledBy: string | null;
 settledAs: Settlement | null;
 settledReason: string | null;
};

export type CaptureStore = {
 /** Records one entry's answer. Refuses to write over one already there — see idempotency. */
 record(row: CaptureRow): boolean;
 find(deviceId: string, entryId: string): CaptureRow | null;
 /** What already sits on the same slot of the same record, oldest first. Never a reading. */
 slot(query: { recordType: string; recordId: string; subjectId: string; field: string }): CaptureRow[];
 /** Every entry against one record, in the server's own order. */
 forRecord(recordType: string, recordId: string): CaptureRow[];
 /** Every entry the register holds about one person, for the subject's own answer. */
 forSubject(subjectId: string): CaptureRow[];
 /** When this device last reached the server. Null the first time it does. */
 lastContact(deviceId: string): number | null;
 /** The next place in the server's order. Monotonic across every device, so nothing ties. */
 nextSeq(): number;
 addConflict(row: ConflictRow): void;
 conflictsFor(deviceId: string, entryId: string): ConflictRow[];
 /** Everything still waiting for somebody, oldest first. What a clinician's queue is built from. */
 openConflicts(): ConflictRow[];
 /**
  * Settle every open conflict on one entry, and the entry with them. False where somebody got there
  * first: the guard is in the statement rather than around it, so two clinicians deciding at once
  * produce one decision and the second is told.
  */
 settle(deviceId: string, entryId: string, decision: { at: number; by: string; as: Settlement; reason: string; state: CaptureState }): boolean;
 count(): number;
 /** Entries past their disposal date whose conflicts are all settled. Counted before anything goes. */
 disposable(before: number): number;
 dispose(before: number): number;
};

const asNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const asText = (value: unknown): string | null => value === null || value === undefined ? null : String(value);

const ENTRY_COLUMNS = 'device_id, entry_id, batch_id, seq, actor_id, actor_role, purpose, capability, record_type, record_id, subject_id, field, provenance, believed_captured_at, received_at, skew_ms, state, reason, payload_digest, payload_bytes, key_version, settled_at, settled_by, settled_as, settled_reason';
const CONFLICT_COLUMNS = 'id, device_id, entry_id, kind, resolution, finding, record_type, record_id, subject_id, detected_at, settled_at, settled_by, settled_as, settled_reason';

/* An entry whose conflicts are all settled, or which never had one. Written once and reused, because
   "is this entry still waiting for somebody" is asked by the queue, by the escalation report and by
   the disposal sweep, and three copies of it would eventually be two rules. */
const UNSETTLED = `EXISTS (SELECT 1 FROM capture_conflicts c
 WHERE c.device_id = capture_entries.device_id AND c.entry_id = capture_entries.entry_id AND c.settled_at IS NULL)`;

function toEntry(raw: unknown): CaptureRow {
 const row = raw as Record<string, unknown>;
 return {
  deviceId: String(row.device_id), entryId: String(row.entry_id), batchId: String(row.batch_id),
  seq: Number(row.seq), actorId: String(row.actor_id), actorRole: String(row.actor_role),
  purpose: String(row.purpose), capability: String(row.capability),
  recordType: String(row.record_type), recordId: String(row.record_id),
  subjectId: String(row.subject_id), field: String(row.field), provenance: String(row.provenance),
  believedCapturedAt: Number(row.believed_captured_at), receivedAt: Number(row.received_at),
  skewMs: asNumber(row.skew_ms), state: String(row.state) as CaptureState, reason: asText(row.reason),
  payloadDigest: asText(row.payload_digest), payloadBytes: asNumber(row.payload_bytes),
  keyVersion: asNumber(row.key_version), settledAt: asNumber(row.settled_at),
  settledBy: asText(row.settled_by), settledAs: asText(row.settled_as) as Settlement | null,
  settledReason: asText(row.settled_reason)
 };
}

function toConflict(raw: unknown): ConflictRow {
 const row = raw as Record<string, unknown>;
 return {
  id: String(row.id), deviceId: String(row.device_id), entryId: String(row.entry_id),
  kind: String(row.kind) as ConflictKind, resolution: String(row.resolution) as Resolver,
  finding: String(row.finding), recordType: String(row.record_type), recordId: String(row.record_id),
  subjectId: String(row.subject_id), detectedAt: Number(row.detected_at),
  settledAt: asNumber(row.settled_at), settledBy: asText(row.settled_by),
  settledAs: asText(row.settled_as) as Settlement | null, settledReason: asText(row.settled_reason)
 };
}

export function openCaptureStore(db: Database): CaptureStore {
 db.exec(SCHEMA);
 const first = <T>(rows: unknown[], map: (raw: unknown) => T): T | null => rows.length ? map(rows[0]) : null;
 const find = (deviceId: string, entryId: string): CaptureRow | null =>
  first(db.prepare(`SELECT ${ENTRY_COLUMNS} FROM capture_entries WHERE device_id = ? AND entry_id = ?`).all(deviceId, entryId), toEntry);
 return {
  record(row) {
   /* The insert is the idempotency, exactly as it is for a bootstrap authorisation and a renewal
      notice. A retried batch after a dropped connection presents the same pair, collides, and is
      told what it was told the first time rather than being recorded a second time. */
   if (find(row.deviceId, row.entryId)) return false;
   db.prepare(`INSERT INTO capture_entries (${ENTRY_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.deviceId, row.entryId, row.batchId, row.seq, row.actorId, row.actorRole, row.purpose,
     row.capability, row.recordType, row.recordId, row.subjectId, row.field, row.provenance,
     row.believedCapturedAt, row.receivedAt, row.skewMs, row.state, row.reason,
     row.payloadDigest, row.payloadBytes, row.keyVersion,
     row.settledAt, row.settledBy, row.settledAs, row.settledReason);
   return true;
  },
  find,
  slot(query) {
   /* A refused entry is not on the slot: the server would not take it, so there is nothing for a
      later entry to disagree with. Holding one open as a duplicate would mean a nurse's corrected
      entry conflicting with the one the server had already turned away. */
   return db.prepare(`SELECT ${ENTRY_COLUMNS} FROM capture_entries
    WHERE record_type = ? AND record_id = ? AND subject_id = ? AND field = ? AND state != 'refused'
    ORDER BY seq`).all(query.recordType, query.recordId, query.subjectId, query.field).map(toEntry);
  },
  forRecord(recordType, recordId) {
   return db.prepare(`SELECT ${ENTRY_COLUMNS} FROM capture_entries WHERE record_type = ? AND record_id = ? ORDER BY seq`)
    .all(recordType, recordId).map(toEntry);
  },
  forSubject(subjectId) {
   return db.prepare(`SELECT ${ENTRY_COLUMNS} FROM capture_entries WHERE subject_id = ? ORDER BY seq`).all(subjectId).map(toEntry);
  },
  lastContact(deviceId) {
   const rows = db.prepare('SELECT MAX(received_at) AS at FROM capture_entries WHERE device_id = ?').all(deviceId) as { at: number | bigint | null }[];
   const at = rows[0]?.at;
   return at === null || at === undefined ? null : Number(at);
  },
  nextSeq() {
   const rows = db.prepare('SELECT MAX(seq) AS seq FROM capture_entries').all() as { seq: number | bigint | null }[];
   return Number(rows[0]?.seq ?? 0) + 1;
  },
  addConflict(row) {
   db.prepare(`INSERT INTO capture_conflicts (${CONFLICT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.deviceId, row.entryId, row.kind, row.resolution, row.finding,
     row.recordType, row.recordId, row.subjectId, row.detectedAt,
     row.settledAt, row.settledBy, row.settledAs, row.settledReason);
  },
  conflictsFor(deviceId, entryId) {
   return db.prepare(`SELECT ${CONFLICT_COLUMNS} FROM capture_conflicts WHERE device_id = ? AND entry_id = ? ORDER BY detected_at, id`)
    .all(deviceId, entryId).map(toConflict);
  },
  openConflicts() {
   return db.prepare(`SELECT ${CONFLICT_COLUMNS} FROM capture_conflicts WHERE settled_at IS NULL ORDER BY detected_at, id`).all().map(toConflict);
  },
  settle(deviceId, entryId, decision) {
   const changed = db.prepare(`UPDATE capture_entries SET settled_at = ?, settled_by = ?, settled_as = ?, settled_reason = ?, state = ?
    WHERE device_id = ? AND entry_id = ? AND settled_at IS NULL`)
    .run(decision.at, decision.by, decision.as, decision.reason, decision.state, deviceId, entryId) as { changes?: number | bigint } | undefined;
   if (Number(changed?.changes ?? 0) !== 1) return false;
   db.prepare(`UPDATE capture_conflicts SET settled_at = ?, settled_by = ?, settled_as = ?, settled_reason = ?
    WHERE device_id = ? AND entry_id = ? AND settled_at IS NULL`)
    .run(decision.at, decision.by, decision.as, decision.reason, deviceId, entryId);
   return true;
  },
  count() {
   const rows = db.prepare('SELECT COUNT(*) AS n FROM capture_entries').all() as { n: number | bigint }[];
   return Number(rows[0]?.n ?? 0);
  },
  disposable(before) {
   const rows = db.prepare(`SELECT COUNT(*) AS n FROM capture_entries WHERE received_at < ? AND NOT ${UNSETTLED}`).all(before) as { n: number | bigint }[];
   return Number(rows[0]?.n ?? 0);
  },
  dispose(before) {
   /* The conflicts go with their entry and never on their own, and an entry still waiting for
      somebody is never reached at all — which is the whole of the disposal rule for this ledger. An
      entry that has been conflicted for a year is a question somebody has not answered, and sweeping
      it away would answer it by deletion. */
   db.prepare(`DELETE FROM capture_conflicts WHERE (device_id, entry_id) IN
    (SELECT device_id, entry_id FROM capture_entries WHERE received_at < ? AND NOT ${UNSETTLED})`).run(before);
   const result = db.prepare(`DELETE FROM capture_entries WHERE received_at < ? AND NOT ${UNSETTLED}`).run(before) as { changes?: number | bigint } | undefined;
   return Number(result?.changes ?? 0);
  }
 };
}

export const conflictId = (): string => randomUUID();
