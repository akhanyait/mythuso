/**
 * Every access to the Passport, granted or refused, in a chain the patient can read.
 *
 * ── Why a chain, and what it is worth ────────────────────────────────────────────────────────
 *
 * §22: "append-only, hash-chained log … every read and write; patient-visible". Each entry carries an
 * HMAC over its own contents and over the hash of the entry before it, keyed by the Passport's audit
 * key — which is derived from the Passport's master key and from nothing the identity service holds.
 * Alter an entry, remove one from the middle or swap two, and every hash from there on stops
 * following; `verify()` names the first entry that does not.
 *
 * Tamper-evident, not tamper-proof, and the gaps are stated rather than discovered:
 *   · truncation from the end leaves a shorter chain that still verifies. Anchoring the head
 *     somewhere this database cannot reach (§22's "daily anchoring") is what closes that, and it is
 *     not built;
 *   · somebody holding both the file and the master key can rewrite the whole chain;
 *   · it proves the entries are the entries that were written, not that what was written was true.
 *
 * ── What an entry may hold ───────────────────────────────────────────────────────────────────
 *
 * Who asked, in which role, what they did, to which kind of resource, for what purpose, whether they
 * were allowed and the sentence either way. Never the content that was read: an audit log carrying the
 * record is a second copy of the record with weaker protection. A break-glass entry carries the
 * justification, because the justification is what the review reads, and its review due time.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { PassportKeys } from './keys.ts';

export type AuditEntry = {
 at: number;
 subject: string | null;
 requesterRole: string;
 requesterRef: string | null;
 action: string;
 resourceType: string | null;
 purpose: string | null;
 outcome: 'granted' | 'refused';
 reason: string;
 breakGlass: boolean;
 reviewDueAt: number | null;
};

type AuditRow = {
 seq: number; at: number; subject: string | null; requester_role: string; requester_ref: string | null;
 action: string; resource_type: string | null; purpose: string | null; outcome: string; reason: string;
 break_glass: number; review_due_at: number | null; prev_hash: string; hash: string;
};

const GENESIS = '0'.repeat(64);

/* The bytes the HMAC is taken over: every field, in a fixed order, as JSON. A JSON array rather than a
   joined string, so that no value can contain a separator that makes two entries hash alike. */
const canonical = (seq: number, e: AuditEntry): string => JSON.stringify([
 seq, e.at, e.subject, e.requesterRole, e.requesterRef, e.action, e.resourceType, e.purpose, e.outcome, e.reason, e.breakGlass ? 1 : 0, e.reviewDueAt
]);
const entryOf = (r: AuditRow): AuditEntry => ({
 at: r.at, subject: r.subject, requesterRole: r.requester_role, requesterRef: r.requester_ref, action: r.action,
 resourceType: r.resource_type, purpose: r.purpose, outcome: r.outcome as AuditEntry['outcome'], reason: r.reason,
 breakGlass: r.break_glass === 1, reviewDueAt: r.review_due_at
});

export class AuditLog {
 #db: DatabaseSync;
 #keys: PassportKeys;

 constructor(db: DatabaseSync, keys: PassportKeys) {
  this.#db = db;
  this.#keys = keys;
 }

 append(entry: AuditEntry): { seq: number; hash: string } {
  const last = this.#db.prepare('SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1').get() as { seq: number; hash: string } | undefined;
  const seq = (last?.seq ?? 0) + 1;
  const previous = last?.hash ?? GENESIS;
  const hash = this.#keys.chain(previous, canonical(seq, entry));
  this.#db.prepare('INSERT INTO audit_events (seq, at, subject, requester_role, requester_ref, action, resource_type, purpose, outcome, reason, break_glass, review_due_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
   .run(seq, entry.at, entry.subject, entry.requesterRole, entry.requesterRef, entry.action, entry.resourceType, entry.purpose, entry.outcome, entry.reason, entry.breakGlass ? 1 : 0, entry.reviewDueAt, previous, hash);
  return { seq, hash };
 }

 /** Walk the whole chain. The first entry that does not follow is named; nothing is repaired. */
 verify(): { intact: boolean; entries: number; firstBroken: number | null } {
  const all = this.#db.prepare('SELECT * FROM audit_events ORDER BY seq').all() as unknown as AuditRow[];
  let previous = GENESIS;
  let expected = 1;
  for (const r of all) {
   if (r.seq !== expected || r.prev_hash !== previous || this.#keys.chain(previous, canonical(r.seq, entryOf(r))) !== r.hash) {
    return { intact: false, entries: all.length, firstBroken: Math.min(r.seq, expected) };
   }
   previous = r.hash;
   expected++;
  }
  return { intact: true, entries: all.length, firstBroken: null };
 }

 /** One patient's history, as FHIR AuditEvent-shaped entries — the "who looked at my record" screen. */
 forSubject(subject: string): Record<string, unknown>[] {
  const mine = this.#db.prepare('SELECT * FROM audit_events WHERE subject = ? ORDER BY seq').all(subject) as unknown as AuditRow[];
  return mine.map(r => ({
   resourceType: 'AuditEvent',
   id: `audit-${r.seq}`,
   type: { code: r.action },
   recorded: new Date(r.at).toISOString(),
   outcome: r.outcome === 'granted' ? '0' : '4',
   outcomeDesc: r.reason,
   purposeOfEvent: r.purpose ? [{ text: r.purpose }] : [],
   agent: [{ type: { text: r.requester_role }, requestor: true, ...(r.requester_ref ? { who: { identifier: { value: r.requester_ref } } } : {}) }],
   entity: r.resource_type ? [{ what: { type: r.resource_type } }] : [],
   breakGlass: r.break_glass === 1,
   ...(r.review_due_at ? { reviewDueBy: new Date(r.review_due_at).toISOString() } : {})
  }));
 }

 /** Break-glass entries awaiting the governance review, each with its due time and whether it is overdue. */
 breakGlassReviews(now: number): { seq: number; requesterRole: string; reviewDueBy: string; overdue: boolean }[] {
  const pending = this.#db.prepare('SELECT * FROM audit_events WHERE break_glass = 1 AND outcome = ? ORDER BY seq').all('granted') as unknown as AuditRow[];
  return pending.map(r => ({ seq: r.seq, requesterRole: r.requester_role, reviewDueBy: new Date(r.review_due_at ?? r.at).toISOString(), overdue: (r.review_due_at ?? r.at) < now }));
 }
}
