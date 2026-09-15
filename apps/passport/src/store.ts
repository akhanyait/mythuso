/**
 * The Passport's own store: one SQLite file nothing else opens.
 *
 * ── What a row may hold ──────────────────────────────────────────────────────────────────────
 *
 * Opaque tokens, blinded tags, wrapped keys and ciphertext. There is no column for a name, an identity
 * number, a phone number, an address or a date of birth, and scripts/check-boundaries.mjs fails the
 * build if one appears: who a person is lives in the identity service, and the Passport knows them
 * only as a token it minted itself. The category a resource is filed under is a per-subject HMAC
 * rather than the word, so the table does not say which people have a maternal-health entry to anybody
 * who opens the file without the index key.
 *
 * Provenance is ciphertext too. It used to be four columns in the clear, which meant an activity like
 * "HIV viral load at an antenatal visit" was readable with the sqlite shell for an entry whose content
 * was sealed under its own key. It is now sealed under the same data key as the entry it describes,
 * so a sealed entry's provenance is exactly as sealed as the entry. The same is true of a break-glass
 * note, which is sealed under the patient's own key and never written into the audit chain.
 *
 * What is in the clear, and why: the resource type (a reader asks for Observations, not for
 * ciphertext), whether a row is open, sealed or private (so that "sealed content exists" can be
 * answered without opening anything), which data-key scope a row is under, which resource a provenance
 * row belongs to, and times. That is metadata about a record, and it is the least a store can hold and
 * still answer a request without decrypting everything it has. The audit chain is also in the clear by
 * design — the patient reads it — and so it holds sentences from the contract and tokens, never a
 * free-text note and never what was read.
 *
 * ── Append-only where it matters ─────────────────────────────────────────────────────────────
 *
 * The audit table has no UPDATE and no DELETE anywhere in this service, and the boundary check reads
 * for both. Resources are written once per version; P0 has no supersede, so it has no update either.
 * The UPDATEs are a grant's revoked_at and a session's revoked_at, which are the patient ending
 * something, and both are audited.
 */
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
 token TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
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
 subject TEXT NOT NULL,
 target TEXT NOT NULL,
 key_scope TEXT NOT NULL,
 sealed_body BLOB NOT NULL,
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
CREATE TABLE IF NOT EXISTS breakglass_notes (
 audit_seq INTEGER PRIMARY KEY,
 subject TEXT NOT NULL,
 sealed_body BLOB NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grant_terms (
 grant_id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 sealed_body BLOB NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS share_links (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 grant_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 secret_hash TEXT NOT NULL,
 sealed_body BLOB NOT NULL,
 expires_at INTEGER NOT NULL,
 uses_allowed INTEGER NOT NULL,
 settings_version INTEGER NOT NULL,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS share_link_uses (
 link_id TEXT NOT NULL,
 use_key TEXT NOT NULL,
 used_at INTEGER NOT NULL,
 PRIMARY KEY (link_id, use_key)
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

/** Open, under a sealed category's key, or marked private by the patient under its own. */
export const OPEN = 0;
export const SEALED = 1;
export const PRIVATE = 2;

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
export type ProvenanceRow = { id: string; subject: string; target: string; key_scope: string; sealed_body: Uint8Array; recorded_at: number };
export type GrantRow = { id: string; subject: string; expires_at: number; revoked_at: number | null; artefact_hash: string; created_at: number };
export type SessionRow = { id: string; subject: string; expires_at: number; revoked_at: number | null; created_at: number };
export type LinkRow = {
 id: string; subject: string; grant_id: string; kind: string; secret_hash: string; sealed_body: Uint8Array;
 expires_at: number; uses_allowed: number; settings_version: number; revoked_at: number | null; created_at: number;
};

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

 putSession(session: SessionRow): void {
  this.#db.prepare('INSERT INTO sessions (id, subject, expires_at, revoked_at, created_at) VALUES (?, ?, ?, NULL, ?)').run(session.id, session.subject, session.expires_at, session.created_at);
 }
 session(id: string): SessionRow | null {
  return row<SessionRow>(this.#db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
 }
 endSession(id: string, at: number): void {
  this.#db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id);
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

 putProvenance(provenance: ProvenanceRow): void {
  this.#db.prepare('INSERT INTO provenance (id, subject, target, key_scope, sealed_body, recorded_at) VALUES (?, ?, ?, ?, ?, ?)')
   .run(provenance.id, provenance.subject, provenance.target, provenance.key_scope, provenance.sealed_body, provenance.recorded_at);
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

 /* A grant's terms — its recipient, scope, purpose and sealed tick — sealed under the subject's own key, so a
    share link can be held to the grant it rides on without the scope, which can name a sealed category, sitting
    in the clear. Written once when the grant is made. */
 putGrantTerms(grantId: string, subject: string, sealed: Buffer, at: number): void {
  this.#db.prepare('INSERT INTO grant_terms (grant_id, subject, sealed_body, created_at) VALUES (?, ?, ?, ?)').run(grantId, subject, sealed, at);
 }
 grantTerms(grantId: string): { subject: string; sealed_body: Uint8Array } | null {
  return row(this.#db.prepare('SELECT subject, sealed_body FROM grant_terms WHERE grant_id = ?').get(grantId));
 }

 /* A share link: its kind, end, uses and settings version in the clear, because the gateway refuses on them
    before opening anything; its terms sealed like a grant's; its secret only as a digest. The one UPDATE is a
    revocation, which is the patient ending something, and is audited. Uses are rows, one per idempotency key,
    so a retry is never a second use and nothing is counted by editing a number. */
 putLink(link: LinkRow): void {
  this.#db.prepare('INSERT INTO share_links (id, subject, grant_id, kind, secret_hash, sealed_body, expires_at, uses_allowed, settings_version, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)')
   .run(link.id, link.subject, link.grant_id, link.kind, link.secret_hash, link.sealed_body, link.expires_at, link.uses_allowed, link.settings_version, link.created_at);
 }
 link(id: string): LinkRow | null {
  return row<LinkRow>(this.#db.prepare('SELECT * FROM share_links WHERE id = ?').get(id));
 }
 revokeLink(id: string, at: number): void {
  this.#db.prepare('UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id);
 }
 putLinkUse(linkId: string, useKey: string, at: number): void {
  this.#db.prepare('INSERT INTO share_link_uses (link_id, use_key, used_at) VALUES (?, ?, ?)').run(linkId, useKey, at);
 }
 linkUseCounted(linkId: string, useKey: string): boolean {
  return row(this.#db.prepare('SELECT use_key FROM share_link_uses WHERE link_id = ? AND use_key = ?').get(linkId, useKey)) !== null;
 }
 linkUseCount(linkId: string): number {
  return (this.#db.prepare('SELECT COUNT(*) AS uses FROM share_link_uses WHERE link_id = ?').get(linkId) as { uses: number }).uses;
 }

 putBreakGlassNote(auditSeq: number, subject: string, sealed: Buffer, at: number): void {
  this.#db.prepare('INSERT INTO breakglass_notes (audit_seq, subject, sealed_body, created_at) VALUES (?, ?, ?, ?)').run(auditSeq, subject, sealed, at);
 }
 breakGlassNote(auditSeq: number): { subject: string; sealed_body: Uint8Array } | null {
  return row(this.#db.prepare('SELECT subject, sealed_body FROM breakglass_notes WHERE audit_seq = ?').get(auditSeq));
 }

 close(): void { this.#db.close(); }
}
