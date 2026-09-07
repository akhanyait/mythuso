/**
 * The access log the gate writes to, and the chain that makes rewriting it show up.
 *
 * ── What this is honestly worth ──────────────────────────────────────────────────────────────
 *
 * docs/PRIVACY-AND-SECURITY.md lists "append-only access/decision logs with integrity" as not
 * built, and the reason it gave was the true one: a table is append-only only by grant, and the
 * person who can drop the grant is the person you most want the log to be about. Nothing in this
 * file changes that. Somebody with the database file can still delete a row, edit a row, or put the
 * rows back in a different order.
 *
 * What changes is that they cannot do it quietly. Every entry carries an HMAC over its own contents
 * and over the hash of the entry before it, so the log is a chain: remove a link, alter a link, or
 * swap two links, and every hash from that point stops following. `verify()` walks it and names the
 * first entry that does not follow.
 *
 * The key is the one derived for the `audit` purpose from the key ring, and it lives in the
 * service's environment rather than in the database. That is the part that matters: a plain SHA-256
 * chain is one an attacker with write access simply recomputes from the row they changed onwards.
 * With an HMAC they would have to hold the key as well as the file, which are deliberately two
 * different things to steal.
 *
 * ── What it still does not prove ─────────────────────────────────────────────────────────────
 *
 *  · Truncation to nothing. An empty log verifies, because there is nothing left to contradict.
 *    `head()` exists so the current head can be copied somewhere the database cannot reach — a
 *    second machine, a printout, a witness — which is the only thing that closes that gap.
 *  · That the entries are true. It proves they are the entries that were written, not that what was
 *    written was honest.
 *  · Anything at all against somebody holding both the file and the key.
 *
 * Tamper-evident, not tamper-proof. That is the most a single database can offer, and saying more
 * than that is the sort of claim this repository is written to avoid.
 *
 * ── What an entry may hold ───────────────────────────────────────────────────────────────────
 *
 * Who, what, when, which record, which purpose, allowed or refused, and why. Never the value that
 * was read. An audit log that records the contents of what was opened is a second copy of the
 * record with weaker protection and a longer retention, and it is the ordinary way a protection
 * module becomes the breach it was built to prevent. That is not left to whoever writes the next
 * caller: `append` takes an allowlist and throws on any field outside it.
 */
import { createHmac, randomUUID } from 'node:crypto';
import type { AuditChain, AuditLink } from './contract.ts';

/** Refusal to write an entry that carries something an audit entry may not carry. */
export class AuditEntryRefused extends Error {
 readonly status = 500;
}

/* The whole vocabulary of an access entry, and its storage shape. Nothing else may be written, so
   there is no field a later caller can quietly widen into a copy of the record. */
const FIELDS = {
 event: 'text',        // access.allowed | access.refused | access.break-glass | reveal.failed …
 actorId: 'text',
 actorRole: 'text',
 capability: 'text',
 purpose: 'text',
 recordType: 'text',
 recordId: 'text',
 subjectId: 'text',
 field: 'text',        // which field of the record — the name of it, never the contents
 allowed: 'bool',
 broke: 'bool',        // this went through the break-glass route
 reason: 'text',       // the refusal sentence, or the reason typed to break the glass
 blockedBy: 'list',    // the stage that refused, then whatever it named
 /* And the two an access entry never carries, because they belong to a different kind of entry: a
    seal. `seal.ts` commits the head of a log this module does not own — the consent module's record
    of who opened whose record — into this chain, so that log's integrity can rest on a key the
    module holding it has never seen. `sealHead` is a `hash` rather than a `text` on purpose: the
    one way to widen an audit entry into a copy of a record is a free-text field nobody constrained,
    and a field that will hold nothing but sixty-four hex characters cannot hold a reading. */
 sealOf: 'text',       // which log was sealed
 sealHead: 'hash'      // what its last entry hashed to, and nothing else
} as const;
type FieldName = keyof typeof FIELDS;
const FIELD_NAMES = Object.keys(FIELDS) as FieldName[];
const COLUMN: Record<FieldName, string> = FIELD_NAMES.reduce((columns, name) => {
 columns[name] = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
 return columns;
}, {} as Record<FieldName, string>);

export type AuditEntry = {
 event?: string; actorId?: string; actorRole?: string; capability?: string; purpose?: string;
 recordType?: string; recordId?: string; subjectId?: string; field?: string;
 allowed?: boolean; broke?: boolean; reason?: string; blockedBy?: string[];
 sealOf?: string; sealHead?: string;
};
/** One row: the entry, its identity, and its place in the chain. */
export type AuditRow = AuditEntry & AuditLink;

/**
 * The narrow storage the chain needs, injected. It is deliberately three methods: a log whose store
 * offers an update or a delete is a log with an update and a delete in it before long.
 */
export interface AuditStore {
 append(row: AuditRow): void;
 /** Every row, in the order it was written. The order is part of what is checked. */
 all(): AuditRow[];
 last(): AuditRow | null;
}

/* The first entry has nothing before it, so it chains onto a fixed value rather than onto silence.
   Written out rather than derived from the key: a genesis nobody can compute without the key would
   make an empty log indistinguishable from a log with the wrong key, and those are different
   problems that deserve different answers. */
export const GENESIS = '0'.repeat(64);

/* Sorted keys, absent fields dropped, booleans as booleans. Two entries that differ anywhere
   serialise differently, which is the only property the hash needs from it. */
function canonical(row: AuditRow): string {
 const body: Record<string, unknown> = { id: row.id, at: row.at, previousHash: row.previousHash };
 for (const name of FIELD_NAMES) if (row[name] !== undefined) body[name] = row[name];
 return JSON.stringify(Object.keys(body).sort().map(key => [key, body[key]]));
}

function digest(key: Buffer, row: AuditRow): string {
 return createHmac('sha256', key).update(canonical(row)).digest('hex');
}

/** Normalise an entry, refusing anything outside the vocabulary. */
function accept(entry: Record<string, unknown>): AuditEntry {
 const clean: Record<string, unknown> = {};
 for (const [key, value] of Object.entries(entry)) {
  if (value === undefined || value === null) continue;
  const kind = FIELDS[key as FieldName];
  if (!kind) {
   /* The message names the field but never its value: a refusal that quotes what it refused is a
      copy of the thing it was refusing to copy. */
   throw new AuditEntryRefused(`An access audit entry may not carry "${key}". An audit entry holds who, what, when, which record and why — never the value that was read.`);
  }
  if (kind === 'bool' && typeof value !== 'boolean') throw new AuditEntryRefused(`Audit field "${key}" must be true or false.`);
  if (kind === 'text' && typeof value !== 'string') throw new AuditEntryRefused(`Audit field "${key}" must be text.`);
  /* The narrowest field in the vocabulary, and the refusal is the point of it: sixty-four lowercase
     hex characters is a digest and cannot be anything a person wrote down. */
  if (kind === 'hash' && !(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))) {
   throw new AuditEntryRefused(`Audit field "${key}" must be a SHA-256 digest: sixty-four lowercase hex characters. It is the only shape a seal has, and a field that accepted anything else would be a place a record could be copied into.`);
  }
  if (kind === 'list' && !(Array.isArray(value) && value.every(item => typeof item === 'string'))) throw new AuditEntryRefused(`Audit field "${key}" must be a list of text.`);
  clean[key] = value;
 }
 return clean as AuditEntry;
}

/**
 * The chain. `now` is injected for the same reason the rest of this service injects it: a test that
 * cannot say when something happened cannot test what happens when it expires.
 */
export class HashChainAudit implements AuditChain {
 readonly #key: Buffer;
 readonly #store: AuditStore;
 readonly #now: () => number;
 constructor(store: AuditStore, key: Buffer, now: () => number = () => Date.now()) {
  /* HMAC-SHA256 takes any key length, which is exactly why this refuses a short one: a key ring
     handing over eight bytes by accident would otherwise produce a chain that verifies and proves
     nothing. */
  if (key.length < 32) throw new Error('The audit chain key must be at least 32 bytes. Derive it from the key ring\'s "audit" purpose.');
  this.#key = key;
  this.#store = store;
  this.#now = now;
 }

 append(entry: Record<string, unknown>): AuditLink {
  const previousHash = this.#store.last()?.hash ?? GENESIS;
  const row: AuditRow = { ...accept(entry), id: randomUUID(), at: new Date(this.#now()).toISOString(), previousHash, hash: '' };
  row.hash = digest(this.#key, row);
  this.#store.append(row);
  return { id: row.id, at: row.at, previousHash: row.previousHash, hash: row.hash };
 }

 /**
  * Walk the whole chain and name the first entry that does not follow. It is the first, not all of
  * them: once a link is broken every link after it fails too, and a report of four hundred broken
  * entries hides the one place somebody actually touched.
  */
 verify(): { intact: true; length: number; head: string } | { intact: false; brokenAt: string; length: number } {
  const rows = this.#store.all();
  let expected = GENESIS;
  for (const row of rows) {
   /* Two different failures, one answer. The previous hash not matching means a row was removed or
      moved; the row's own hash not matching means it was edited, or written by somebody who did not
      hold the key. Either way this entry is where the log stopped being trustworthy. */
   if (row.previousHash !== expected || digest(this.#key, row) !== row.hash) {
    return { intact: false, brokenAt: row.id, length: rows.length };
   }
   expected = row.hash;
  }
  return { intact: true, length: rows.length, head: expected };
 }

 head(): string {
  return this.#store.last()?.hash ?? GENESIS;
 }
}

/* ---- Storage --------------------------------------------------------------------------------
   Two implementations, and neither offers a way to change a row that is already written. */

/** In memory, for tests and for a service that has not been given a database yet. */
export function memoryAuditStore(): AuditStore & { rows: AuditRow[] } {
 const rows: AuditRow[] = [];
 return {
  rows,
  append(row) { rows.push({ ...row }); },
  all() { return rows.map(row => ({ ...row })); },
  last() { return rows.length ? { ...rows[rows.length - 1]! } : null; }
 };
}

/* Structural, so this file imports no database driver and a test can hand it anything that answers
   the same three calls. node:sqlite's DatabaseSync fits it as it stands. */
type SqlValue = string | number | bigint | Uint8Array | null;
export type Database = {
 exec(sql: string): void;
 prepare(sql: string): { run(...params: SqlValue[]): unknown; all(...params: SqlValue[]): unknown[] };
};

/* A new table beside the existing `audit` one rather than a column added to it. The auth log holds
   sign-ins and has its own shape and its own retention; folding two logs together would mean one
   answer to "how long do we keep this" for two questions that have different answers. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS protected_access_log (
 id TEXT PRIMARY KEY, at TEXT NOT NULL, event TEXT, actor_id TEXT, actor_role TEXT,
 capability TEXT, purpose TEXT, record_type TEXT, record_id TEXT, subject_id TEXT,
 field TEXT, allowed INTEGER, broke INTEGER, reason TEXT, blocked_by TEXT,
 seal_of TEXT, seal_head TEXT,
 previous_hash TEXT NOT NULL, hash TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS protected_access_log_seq ON protected_access_log (seq);
CREATE INDEX IF NOT EXISTS protected_access_log_subject ON protected_access_log (subject_id, at);
`;

/**
 * The SQLite store. Every column the entry is made of is under the HMAC, so editing a reason breaks
 * the row's own hash; `seq` is not, because it does not need to be — moving a row only changes the
 * order rows come back in, and an order that has changed is exactly what the previous-hash check
 * is looking at. There is no update and no delete in this file, and scripts/check-boundaries.mjs is
 * what keeps it that way.
 */
export function sqliteAuditStore(db: Database): AuditStore {
 db.exec(SCHEMA);
 /* An existing chain gains the two seal columns on the next start, the way vetting/store.ts adds a
    column it did not used to have. Nothing is backfilled: entries written before seals existed are
    access entries and never were seals, so null is the truthful value and the hash over them is
    unchanged — which matters more here than anywhere else in this service, because a migration that
    altered an entry would break every hash after it and read exactly like tampering. */
 const columns = new Set((db.prepare('PRAGMA table_info(protected_access_log)').all() as { name: string }[]).map(column => column.name));
 if (!columns.has('seal_of')) db.exec('ALTER TABLE protected_access_log ADD COLUMN seal_of TEXT');
 if (!columns.has('seal_head')) db.exec('ALTER TABLE protected_access_log ADD COLUMN seal_head TEXT');
 const insert = db.prepare(`INSERT INTO protected_access_log
  (id, at, event, actor_id, actor_role, capability, purpose, record_type, record_id, subject_id,
   field, allowed, broke, reason, blocked_by, seal_of, seal_head, previous_hash, hash, seq)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
 const selectAll = db.prepare('SELECT * FROM protected_access_log ORDER BY seq');
 const selectLast = db.prepare('SELECT * FROM protected_access_log ORDER BY seq DESC LIMIT 1');
 const highest = db.prepare('SELECT MAX(seq) AS seq FROM protected_access_log');
 const toRow = (raw: unknown): AuditRow => {
  const source = raw as Record<string, unknown>;
  const row: AuditRow = {
   id: String(source.id), at: String(source.at),
   previousHash: String(source.previous_hash), hash: String(source.hash)
  };
  for (const name of FIELD_NAMES) {
   const value = source[COLUMN[name]];
   if (value === null || value === undefined) continue;
   if (FIELDS[name] === 'bool') (row as Record<string, unknown>)[name] = Number(value) === 1;
   else if (FIELDS[name] === 'list') (row as Record<string, unknown>)[name] = JSON.parse(String(value)) as string[];
   else (row as Record<string, unknown>)[name] = String(value);
  }
  return row;
 };
 return {
  append(row) {
   const top = (highest.all()[0] as { seq: number | bigint | null } | undefined)?.seq ?? 0;
   const next = Number(top) + 1;
   const cell = (name: FieldName): SqlValue => {
    const value = row[name];
    if (value === undefined) return null;
    if (FIELDS[name] === 'bool') return value ? 1 : 0;
    if (FIELDS[name] === 'list') return JSON.stringify(value);
    return String(value);
   };
   insert.run(row.id, row.at, cell('event'), cell('actorId'), cell('actorRole'), cell('capability'),
    cell('purpose'), cell('recordType'), cell('recordId'), cell('subjectId'), cell('field'),
    cell('allowed'), cell('broke'), cell('reason'), cell('blockedBy'), cell('sealOf'), cell('sealHead'),
    row.previousHash, row.hash, next);
  },
  all() { return selectAll.all().map(toRow); },
  last() { const rows = selectLast.all(); return rows.length ? toRow(rows[0]) : null; }
 };
}
