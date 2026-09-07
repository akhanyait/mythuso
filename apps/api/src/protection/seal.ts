/**
 * The half of the access log's integrity that holds a key.
 *
 * ── The problem, stated the way it was left ──────────────────────────────────────────────────
 *
 * `record_access_log` — who opened whose record — is owned by `apps/api/src/consent`, and that
 * module must never hold key material. The boundary is not decoration: a module that can compute
 * the chain is a module that can forge the chain it is supposed to be evidence of, and
 * `scripts/check-boundaries.mjs` fails the build on any import of the crypto from outside this
 * directory. So the log could not be an HMAC chain of its own, and it was left append-only with
 * each row carrying `audit_id`, the id of the gate's chain entry for the same decision.
 *
 * That correlates the two. It does not detect anything. An id is a pointer; rewriting the row it
 * points from leaves the pointer valid, and nothing was walking the two logs against each other
 * anyway. And the rows most worth altering — a reading refused before the gate was ever consulted —
 * carried no id at all.
 *
 * ── What closes it, without moving the boundary ──────────────────────────────────────────────
 *
 * A seal. The consent module hashes its own rows into a plain SHA-256 chain, which anybody can
 * recompute and which is therefore worth nothing on its own. Then it hands the *head* of that chain
 * — sixty-four hex characters, and nothing else — to this file, which commits it into the gate's
 * keyed chain as an entry of its own. Afterwards:
 *
 *  · Editing a row changes its digest, so the head recomputed from the log no longer matches the
 *    head that was sealed.
 *  · Recomputing the whole plain chain from the edited row onwards — the attack a plain digest
 *    chain has no answer to — changes the head as well, and the sealed one is in a chain the
 *    attacker cannot rewrite without the audit key.
 *  · Deleting rows, reordering them, or truncating the log removes a head that was sealed.
 *
 * The key never leaves this directory. What crosses the boundary is a `LogSeal` with two methods,
 * neither of which can write an access entry: the consent module can ask for its own head to be
 * committed and can do nothing else with the chain. That is a strictly smaller capability than the
 * gate already exercises on its behalf.
 *
 * ── The window, said out loud ────────────────────────────────────────────────────────────────
 *
 * A seal covers the log as it stood when the seal was written. Rows appended since the last seal
 * are vouched for by nothing but their own recomputable digest, exactly as the whole log was
 * before. Sealing on every write would close that and double the chain; sealing on a cadence leaves
 * a window whose size is `every` rows or `afterMs` milliseconds, whichever comes first, and the
 * verifier reports how many rows are currently in it rather than rounding it away. A start-up
 * always seals on the first append, so a restart is a fence as well.
 *
 * And the limits `audit.ts` states for its own chain apply here unchanged and are not restated
 * except for the one that changes shape: truncating the log to nothing does not verify here, because
 * the seals remain in the chain and name heads that no longer exist. Truncating the *chain* to
 * nothing still does, which is what `head()` and a head written down somewhere the database cannot
 * reach are for.
 */
import type { AuditChain } from './contract.ts';
import type { AuditRow, AuditStore } from './audit.ts';

/** The event a seal is written under. One value, so the verifier and the writer cannot drift. */
export const SEAL_EVENT = 'access-log.sealed';

/** How many appends, and how long, before the next seal. Both, whichever comes first. */
export const SEAL_EVERY = 50;
export const SEAL_AFTER_MS = 5 * 60_000;

/** What a log offers up to be sealed: how long it is, and what its last entry hashes to. */
export type LogHead = { length: number; head: string };

export type SealRecord = { id: string; at: string; logId: string; head: string };

/**
 * What the consent module is given. Two methods, and no way to reach the chain past them.
 *
 * `appended` takes the head as a function rather than a value so a log that is nowhere near due
 * does not pay for a query on every write.
 */
export interface LogSeal {
 appended(logId: string, head: () => LogHead, at?: number): SealRecord | null;
 /**
  * Seal now, whatever the cadence says. Null for an empty log — there is nothing to commit to — and
  * null for one that has not grown since the last seal, because a second seal over the same head
  * commits to nothing the first one did not.
  */
 sealNow(logId: string, head: LogHead): SealRecord | null;
}

/** One row of the log, as the verifier needs to see it. Shaped by whoever owns the log. */
export type LogLink = {
 id: string;
 previousHash: string;
 hash: string;
 /** What the row hashes to now, recomputed from the row as it stands. */
 recomputed: string;
 /** False for a row written before the log carried links at all. */
 chained: boolean;
};

export type SealedLogVerdict =
 | {
    intact: true; logId: string; length: number; head: string;
    /** How many seals this chain holds for the log, and how far the last of them reaches. */
    seals: number; sealedThrough: number;
    /** Rows appended since the last seal. Vouched for by nothing but a recomputable digest. */
    unsealed: number;
    /** Rows written before the log carried links. Vouched for by nothing at all. */
    unchained: number;
   }
 | {
    intact: false; logId: string; length: number; seals: number;
    /** What is wrong, in the words an operator reading a health check needs. */
    because: string;
    /** The first row that does not follow, where the failure is in the log rather than the chain. */
    brokenAt: string | null;
   };

const isHead = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/**
 * Build the sealer. It is handed the chain and the chain's store — the chain to append with, the
 * store to read the seals back out of — and holds no key itself.
 */
export function createLogSeal(deps: {
 audit: AuditChain; store: AuditStore; now?: () => number;
 every?: number; afterMs?: number;
}): LogSeal & { sealsFor(logId: string): SealRecord[]; verify(logId: string, links: readonly LogLink[]): SealedLogVerdict } {
 const now = deps.now ?? (() => Date.now());
 const every = deps.every ?? SEAL_EVERY;
 const afterMs = deps.afterMs ?? SEAL_AFTER_MS;
 /* Per-log cadence, in memory and deliberately not persisted. A restart forgets it and seals on the
    first append after start-up, which is the behaviour worth having: a service that came back up is
    a service somebody touched. */
 const since = new Map<string, { at: number; length: number }>();

 const sealsFor = (logId: string): SealRecord[] =>
  deps.store.all()
   .filter((row: AuditRow) => row.event === SEAL_EVENT && (row as Record<string, unknown>).sealOf === logId)
   .map((row: AuditRow) => ({ id: row.id, at: row.at, logId, head: String((row as Record<string, unknown>).sealHead ?? '') }));

 const write = (logId: string, head: LogHead): SealRecord | null => {
  if (!head.length || !isHead(head.head)) return null;
  /* One guard, here rather than in each caller: a seal that repeats the last head is an entry in
     the chain that says nothing, and an operator counting seals would read it as coverage. */
  const sealed = since.get(logId);
  if (sealed && head.length <= sealed.length) return null;
  const link = deps.audit.append({ event: SEAL_EVENT, sealOf: logId, sealHead: head.head });
  since.set(logId, { at: now(), length: head.length });
  return { id: link.id, at: link.at, logId, head: head.head };
 };

 return {
  appended(logId, head, at = now()) {
   const last = since.get(logId);
   /* Nothing sealed yet in this process, so seal: a service that has just come back up is a service
      somebody touched, and a fence there is worth more than one five minutes later. */
   if (!last) return write(logId, head());
   const current = head();
   /* Whichever limit arrives first. A log that has not grown is turned away by `write`. */
   if (at - last.at < afterMs && current.length - last.length < every) return null;
   return write(logId, current);
  },
  sealNow(logId, head) { return write(logId, head); },

  sealsFor,

  /**
   * Walk the log against the seals, and name the first thing that does not follow.
   *
   * The order matters. The keyed chain is checked first, because if it has been rewritten then the
   * seals in it prove nothing and reporting a "sealed and intact" log would be the worst possible
   * answer. Then the log's own links, which catch a careless edit. Then the seals, which catch a
   * careful one.
   */
  verify(logId, links) {
   const chain = deps.audit.verify();
   const seals = sealsFor(logId);
   if (!chain.intact) {
    return {
     intact: false, logId, length: links.length, seals: seals.length, brokenAt: null,
     because: `The audit chain the seals live in is broken at entry ${chain.brokenAt}. Until that is explained, nothing sealed into it means anything and this log cannot be vouched for either.`
    };
   }
   /* Where each prefix of the log ends up, so a sealed head can be looked up rather than searched
      for. The first occurrence wins: two identical heads would mean two identical rows, which the
      row id and the sequence number make impossible. */
   const positionOf = new Map<string, number>();
   let expected = '';
   let unchained = 0;
   for (let at = 0; at < links.length; at += 1) {
    const link = links[at]!;
    if (!link.chained) { unchained += 1; continue; }
    if (expected !== '' && link.previousHash !== expected) {
     return {
      intact: false, logId, length: links.length, seals: seals.length, brokenAt: link.id,
      because: 'A row before this one was removed or moved: this entry names a previous entry that is no longer where it says it is.'
     };
    }
    if (link.recomputed !== link.hash) {
     return {
      intact: false, logId, length: links.length, seals: seals.length, brokenAt: link.id,
      because: 'This entry no longer hashes to what it says it hashes to. Something in the row was changed after it was written.'
     };
    }
    expected = link.hash;
    positionOf.set(link.hash, at + 1);
   }
   /* And the half that needs the key. Every seal named a head the log had at the time; each of them
      must still be somewhere in the log, and in the order they were sealed. This is what an attacker
      who recomputed the whole plain chain from the row they edited runs into. */
   let reached = 0;
   for (const seal of seals) {
    const position = positionOf.get(seal.head);
    if (position === undefined) {
     return {
      intact: false, logId, length: links.length, seals: seals.length, brokenAt: null,
      because: `Seal ${seal.id}, written at ${seal.at}, committed to a head this log no longer has. Entries have been rewritten, removed or reordered, and the chain they were re-signed into is not one this service holds the key to.`
     };
    }
    if (position < reached) {
     return {
      intact: false, logId, length: links.length, seals: seals.length, brokenAt: null,
      because: `Seal ${seal.id} reaches fewer entries than the seal before it. The log has been reordered.`
     };
    }
    reached = position;
   }
   return {
    intact: true, logId, length: links.length,
    head: links.length ? links[links.length - 1]!.hash : '',
    seals: seals.length, sealedThrough: reached,
    unsealed: links.length - reached, unchained
   };
  }
 };
}
