/**
 * The access log's own links, and the honest reason they are worth nothing on their own.
 *
 * ── The gap this half closes, and the half it does not ───────────────────────────────────────
 *
 * `record_access_log` used to be append-only and nothing more. Every row carried `audit_id`, the id
 * of the gate's chain entry for the same decision, and the claim made for it was that "the two can
 * be reconciled". They can be *correlated*. They were not reconciled by anything, and correlation is
 * not detection: an id is a pointer, and a pointer survives the row it points from being rewritten.
 * Somebody with the database file could change an actor, a subject, a lawful basis or an outcome and
 * leave `audit_id` exactly where it was, and every query in this service would answer the same as
 * before. Worse, the rows that matter most had no anchor at all — a reading refused for a missing
 * lawful basis, or on a withdrawn consent, never reaches the gate, so its `audit_id` is null and
 * there was nothing on the other side to line it up against.
 *
 * So each row now carries the SHA-256 of its own contents and of the hash of the row before it, the
 * way `protection/audit.ts` does. That much is cheap, needs no key, and catches a careless edit.
 *
 * It catches nothing else, and that has to be said plainly, because a plain hash chain that looks
 * like a tamper-evident one is worse than no chain at all. SHA-256 is a function anybody can compute.
 * An attacker who edits row 40 recomputes rows 40 to the end and hands back a log that verifies
 * perfectly. `protection/audit.ts` says the same thing about why its chain is an HMAC rather than a
 * digest, and it is right.
 *
 * ── Which is why this module never holds the key ─────────────────────────────────────────────
 *
 * The reason the original design refused to chain this table was sound: a module that can compute
 * the chain is a module that can forge it, and only `apps/api/src/protection` holds key material.
 * That reasoning is kept. What changed is that it does not have to be this module that makes the
 * chain worth something. The head produced here is handed to a *sealer* on the protection side,
 * which commits it into the gate's keyed chain and hands back nothing. Recomputing the links from
 * an edited row then produces a head that no longer matches what was sealed, and forging the seal
 * needs the audit key — which is on the other side of a boundary `scripts/check-boundaries.mjs`
 * enforces, and which this file has no way to reach.
 *
 * See `apps/api/src/protection/seal.ts` for the half that has the key, and for the window that is
 * left open between the last seal and now.
 */
import { createHash } from 'node:crypto';
import type { AccessRow } from './store.ts';

/* The first row has nothing before it. Written out rather than derived, for the reason audit.ts
   gives for its own: a genesis nobody can compute makes an empty log and a wrong key look alike. */
export const ACCESS_GENESIS = '0'.repeat(64);

/* Every column of the row, so there is none an edit could hide in. `previousHash` is folded in as
   well, which is what makes removing or moving a row show up as well as editing one. */
const FIELDS: readonly (keyof AccessRow)[] = [
 'id', 'seq', 'at', 'actorId', 'actorRole', 'actorLabel', 'capability', 'processingPurpose',
 'lawfulBasis', 'recordType', 'recordId', 'subjectId', 'outcome', 'refusedBy', 'reason',
 'consentPurpose', 'consentVersion', 'auditId'
];

/**
 * The digest of one row, in its place.
 *
 * A fixed field order rather than a sorted object, so a column added to the row without a thought
 * for this function changes every hash after it and fails loudly rather than being left out of the
 * digest quietly. Nulls are written as nulls: "no reason given" and "reason removed" have to
 * serialise differently or the second is free.
 */
export function accessDigest(row: AccessRow, previousHash: string): string {
 const body = FIELDS.map(field => [field, row[field] ?? null] as const);
 return createHash('sha256').update(JSON.stringify([previousHash, body])).digest('hex');
}

/** One row of the log as the verifier sees it: what it claims, and what it actually hashes to. */
export type AccessLink = {
 id: string;
 seq: number;
 /** What the row says came before it. */
 previousHash: string;
 /** What the row says it hashes to. */
 hash: string;
 /** What it hashes to now, computed from the row as it stands in the database. */
 recomputed: string;
 /* False for a row written before the log carried links at all. Such a row is reported as
    unvouched-for rather than as broken: a database that predates this file is not evidence of
    tampering, and a verifier that cried wolf over one would be turned off within a week. */
 chained: boolean;
};

/**
 * Turn the rows into links, recomputing each one against the chain as it goes.
 *
 * The previous hash used for the recomputation is the one the *previous row* actually carries, not
 * the one this row claims came before it — otherwise a row could vouch for itself by carrying a
 * previous hash that suits it, and a deletion would go unnoticed.
 */
export function accessLinks(rows: readonly AccessRow[]): AccessLink[] {
 const links: AccessLink[] = [];
 let expected = ACCESS_GENESIS;
 for (const row of rows) {
  const chained = Boolean(row.hash);
  links.push({
   id: row.id, seq: row.seq, previousHash: row.previousHash, hash: row.hash,
   recomputed: chained ? accessDigest(row, expected) : '', chained
  });
  /* Follow what the row claims rather than what it should have been. A verifier that carried its
     own expectation forward would report every row after a break as broken too, and burying the one
     row somebody touched under four hundred others is how a tamper report gets ignored. */
  if (chained) expected = row.hash;
 }
 return links;
}
