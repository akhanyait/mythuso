/**
 * The Passport's own store: one SQLite file nothing else opens.
 *
 * ── What a row may hold ──────────────────────────────────────────────────────────────────────
 *
 * Opaque tokens, blinded tags, wrapped keys and ciphertext. There is no column for a name, an identity
 * number, a phone number, an address or a date of birth, and scripts/check-boundaries.mjs fails the
 * build if one appears: who a person is lives in the identity service, and the Passport knows them
 * only as a token it minted itself. The category a resource is filed under is a per-subject HMAC
 * rather than the word, so the table does not say which people have a mental-health entry to anybody
 * who opens the file without the index key.
 *
 * What is in the clear, and why: the resource type (a reader asks for Observations, not for
 * ciphertext), whether a row is sealed (so that "sealed content exists" can be answered without
 * opening anything), and times. That is metadata about a record, and it is the least a store can hold
 * and still answer a request without decrypting everything it has.
 *
 * ── Append-only where it matters ─────────────────────────────────────────────────────────────
 *
 * The audit table has no UPDATE and no DELETE anywhere in this service, and the boundary check reads
 * for both. Resources are written once per version; P0 has no supersede, so it has no update either.
 * The one UPDATE is a grant's revoked_at, which is the patient's revocation and is itself audited.
 */
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
 token TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS data_keys (
 subject TEXT NOT NULL,
 key_scope TEXT NOT NULL,
 wrapped BLOB NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (subject, key_scope)
);
CREATE TABLE IF NOT EXISTS resources (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 resource_type TEXT NOT NULL,
 category_tag TEXT NOT NULL,
 key_scope TEXT NOT NULL,
 sealed INTEGER NOT NULL,
 version INTEGER NOT NULL,
 sealed_body BLOB NOT NULL,
 written_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS resources_by_subject ON resources (subject, resource_type);
CREATE TABLE IF NOT EXISTS provenance (
 id TEXT PRIMARY KEY,
 target TEXT NOT NULL,
 author_role TEXT NOT NULL,
 author_ref TEXT NOT NULL,
 source_system TEXT NOT NULL,
 activity TEXT NOT NULL,
 recorded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grants (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 artefact_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
 seq INTEGER PRIMARY KEY,
 at INTEGER NOT NULL,
 subject TEXT,
 requester_role TEXT NOT NULL,
 requester_ref TEXT,
 action TEXT NOT NULL,
 resource_type TEXT,
 purpose TEXT,
 outcome TEXT NOT NULL,
 reason TEXT NOT NULL,
 break_glass INTEGER NOT NULL,
 review_due_at INTEGER,
 prev_hash TEXT NOT NULL,
 hash TEXT NOT NULL
);
`;

export type ResourceRow = {
 id: string;
 subject: string;
 resource_type: string;
 category_tag: string;
 key_scope: string;
 sealed: number;
 version: number;
 sealed_body: Uint8Array;
 written_at: number;
};
export type ProvenanceRow = { id: string; target: string; author_role: string; author_ref: string; source_system: string; activity: string; recorded_at: number };
export type GrantRow = { id: string; subject: string; expires_at: number; revoked_at: number | null; artefact_hash: string; created_at: number };

const rows = <T>(value: unknown): T[] => value as T[];
const row = <T>(value: unknown): T | null => (value as T | undefined) ?? null;

export class PassportStore {
 #db: DatabaseSync;

 constructor(path: string) {
  this.#db = new DatabaseSync(path);
  this.#db.exec(SCHEMA);
 }

 /** Exposed for the audit log, which owns its own table in this same file, and for tests that tamper. */
 get database(): DatabaseSync { return this.#db; }

 addSubject(token: string, at: number): void {
  this.#db.prepare('INSERT INTO subjects (token, created_at) VALUES (?, ?)').run(token, at);
 }
 hasSubject(token: string): boolean {
  return row(this.#db.prepare('SELECT token FROM subjects WHERE token = ?').get(token)) !== null;
 }

 dataKey(subject: string, scope: string): Uint8Array | null {
  return row<{ wrapped: Uint8Array }>(this.#db.prepare('SELECT wrapped FROM data_keys WHERE subject = ? AND key_scope = ?').get(subject, scope))?.wrapped ?? null;
 }
 putDataKey(subject: string, scope: string, wrapped: Buffer, at: number): void {
  this.#db.prepare('INSERT INTO data_keys (subject, key_scope, wrapped, created_at) VALUES (?, ?, ?, ?)').run(subject, scope, wrapped, at);
 }
 keyScopesFor(subject: string): string[] {
  return rows<{ key_scope: string }>(this.#db.prepare('SELECT key_scope FROM data_keys WHERE subject = ? ORDER BY key_scope').all(subject)).map(r => r.key_scope);
 }

 putResource(resource: ResourceRow): void {
  this.#db.prepare('INSERT INTO resources (id, subject, resource_type, category_tag, key_scope, sealed, version, sealed_body, written_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
   .run(resource.id, resource.subject, resource.resource_type, resource.category_tag, resource.key_scope, resource.sealed, resource.version, resource.sealed_body, resource.written_at);
 }
 resource(id: string): ResourceRow | null {
  return row<ResourceRow>(this.#db.prepare('SELECT * FROM resources WHERE id = ?').get(id));
 }
 resourcesOf(subject: string, resourceType: string | null = null): ResourceRow[] {
  return resourceType
   ? rows<ResourceRow>(this.#db.prepare('SELECT * FROM resources WHERE subject = ? AND resource_type = ? ORDER BY written_at, id').all(subject, resourceType))
   : rows<ResourceRow>(this.#db.prepare('SELECT * FROM resources WHERE subject = ? ORDER BY written_at, id').all(subject));
 }
 sealedExists(subject: string): boolean {
  return row(this.#db.prepare('SELECT id FROM resources WHERE subject = ? AND sealed = 1 LIMIT 1').get(subject)) !== null;
 }

 putProvenance(provenance: ProvenanceRow): void {
  this.#db.prepare('INSERT INTO provenance (id, target, author_role, author_ref, source_system, activity, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
   .run(provenance.id, provenance.target, provenance.author_role, provenance.author_ref, provenance.source_system, provenance.activity, provenance.recorded_at);
 }
 provenanceFor(target: string): ProvenanceRow[] {
  return rows<ProvenanceRow>(this.#db.prepare('SELECT * FROM provenance WHERE target = ? ORDER BY recorded_at').all(target));
 }

 putGrant(grant: GrantRow): void {
  this.#db.prepare('INSERT INTO grants (id, subject, expires_at, revoked_at, artefact_hash, created_at) VALUES (?, ?, ?, NULL, ?, ?)')
   .run(grant.id, grant.subject, grant.expires_at, grant.artefact_hash, grant.created_at);
 }
 grant(id: string): GrantRow | null {
  return row<GrantRow>(this.#db.prepare('SELECT * FROM grants WHERE id = ?').get(id));
 }
 revokeGrant(id: string, at: number): void {
  this.#db.prepare('UPDATE grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id);
 }

 close(): void { this.#db.close(); }
}
