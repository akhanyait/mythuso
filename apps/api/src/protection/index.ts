/**
 * The composition root of the data protection module, and the only door into it.
 *
 * Everything outside this directory imports from here. scripts/check-boundaries.mjs fails the build
 * if anything outside apps/api/src/protection imports the crypto directly, because a module that can
 * open a sealed value can decide for itself who may read a record — which is the hole the gate
 * exists to close, and the hole all three sibling projects turned out to have.
 */
import { createProtection, parseRootKeys } from './crypto.ts';
import { createBootstrapAuthority } from './bootstrap.ts';
import { AccessGate, type ReleaseRegister, type VettingSource } from './gate.ts';
import { HashChainAudit, sqliteAuditStore, type Database } from './audit.ts';
import { createLogSeal, type LogLink, type LogSeal, type SealedLogVerdict } from './seal.ts';
import { createRotation, type SealedColumn } from './rotation.ts';
import { statement, stillExtends, type Witness, type WitnessVerdict } from './witness.ts';

/* Which chain a witness statement is about. The gate's own log is the one that would be published;
   the consent module's is already sealed into it, so a head over this one covers both. */
export const WITNESS_LOG = 'protected_access_log';
export type { AccessOperation, AccessRequest, AccessOutcome, Gate, AuditChain, AuditLink, Purpose, Binding, Sealed, KeyVersion } from './contract.ts';
export type { Database } from './audit.ts';

/* The lifecycle arithmetic, re-exported rather than reimplemented. EXPIRY_WARNING_DAYS already
   exists in four places — the gate, apps/web, iOS and Android — and scripts/check-boundaries.mjs
   guards all four. Anything on this side of the wall that needs the number takes it from here, so
   there is no fifth copy to drift. */
export { EXPIRY_WARNING_DAYS, resolveState, standingOf, neverGranted, daysUntil, dayIn } from './gate.ts';
export type { CheckState, CheckRecord, ActorVetting, VettingSource, ReleaseRegister, Standing } from './gate.ts';
export type { SealedColumn, Rotation, RotationReport, RotationStanding, ColumnStanding } from './rotation.ts';
/* The seal, and only the seal. A module outside this directory gets a `LogSeal` — commit my head,
   and nothing else — which is what lets a log this module does not own rest on a key it has never
   held. See seal.ts for what that is worth and for the window it leaves. */
export { SEAL_EVENT, SEAL_EVERY, SEAL_AFTER_MS } from './seal.ts';
export type { LogSeal, LogHead, LogLink, SealedLogVerdict, SealRecord } from './seal.ts';
/* The checking half of publishing a chain head. The publishing half needs a second organisation and
   is still absent — see the header of witness.ts, which says what this is not. */
export { EMPTY_HEAD, parse as parseWitness, render as renderWitness, statement as witnessStatement, stillExtends } from './witness.ts';
export type { Witness, WitnessVerdict } from './witness.ts';
export { printRotation } from './rotation.ts';

/* The one authorisation in the service that is produced by a person at a console rather than by a
   request. Minting takes the key ring, so it happens here, on this side of the wall; what the
   vetting module is handed is the verifier, which can check a signature and do nothing else. */
export { mintBootstrapAuthorisation, bootstrapFingerprint, BOOTSTRAP_MINUTES, BOOTSTRAP_MINUTES_MAX } from './bootstrap.ts';
export type { BootstrapAuthority, BootstrapAuthorisation, BootstrapGrant, BootstrapVerdict } from './bootstrap.ts';

export type { ProtectionConfig } from './crypto.ts';
import type { ProtectionConfig } from './crypto.ts';

/* Validated at start-up rather than at the first write, so a typo in the environment is a service
   that will not start instead of one that turns out, hours later, to hold nothing it can read. */
export function validateProtectionConfig(config: ProtectionConfig): void {
 if (!config.protectionKeys) return;                       // absence refuses at first use, loudly
 parseRootKeys(config.protectionKeys, { current: config.protectionKeyCurrent });
}
export { createProtection };

/* The wire format of a sealed value, so a module that owns a table can put one in a column and take
   it back out again. Encoding is not opening: nothing here holds a key, and the binding a decoded
   value carries is the one the caller supplies from the row it was read from — which is exactly what
   makes moving a ciphertext between rows fail rather than succeed quietly. */
export { encodeSealed as encodeSealedValue, decodeSealed as decodeSealedValue, isProtected, sealedKeyVersion } from './crypto.ts';

/* Assembled once, at start-up. The crypto is constructed here and handed to the gate; nothing else
   is given a reference to it, which is what makes "the gate is the only way in" true rather than
   agreed. Absent keys mean no module: the caller gets null and refuses, rather than a gate that
   opens because it has nothing to check with. */
export function createProtectionModule(config: ProtectionConfig, db: Database, sources: {
 vetting: VettingSource; releases: ReleaseRegister; now?: () => number;
 /* Which columns hold sealed values, declared by whichever module owns the table. A rotation that
    has to be told about a new table in a file belonging to somebody else is a rotation that quietly
    skips it, and a skipped table is one nobody notices until the old key is destroyed. */
 sealedColumns?: readonly SealedColumn[];
 /* How often a sealed log is fenced. Injected only so a test can watch the window open and close;
    the defaults in seal.ts are what runs. */
 seal?: { every?: number; afterMs?: number };
}) {
 if (!config.protectionKeys) return null;
 const { keys, records } = createProtection(config);
 /* The audit key is pinned to the oldest version configured, and it is the same reasoning
    crypto.ts gives for pinning the blind index — found the hard way, by building the rotation and
    watching the chain break.

    An audit entry is chained under the key it was written with, and it can never be re-chained:
    rewriting the log to a new key would recompute every hash from the row you changed onwards, which
    is precisely the operation the chain exists to make impossible. So if the audit key followed the
    current version, step 4 of the rotation procedure — one line, reversible, meant to change nothing
    — would make every entry ever written fail to verify, and the health check that asks every five
    minutes would start reporting a tampered log on the evening of a routine key rotation.

    The trap in this default, said out loud because it costs evidence: removing the oldest root key
    from the environment moves the audit key to the next one and the whole chain stops verifying.
    Old versions are kept for ever, which is what makes that safe, and which is why a rotation here
    retires nothing. */
 const auditVersion = Math.min(...keys.versions);
 /* One store, handed to both: the chain appends through it and the sealer reads the seals back out
    of it. Two stores over the same table would work and would be a second place to get the ordering
    wrong. */
 const auditStore = sqliteAuditStore(db);
 const audit = new HashChainAudit(auditStore, keys.derive('audit', auditVersion), sources.now);
 const gate = new AccessGate({ crypto: records, audit, vetting: sources.vetting, releases: sources.releases, now: sources.now });
 /* The rotation gets the ring, not the record crypto: it re-wraps data keys and never opens a
    payload, so the job that rotates the database is not a job that can read the database. */
 const rotation = createRotation(keys, db, sources.sealedColumns ?? []);
 /* The bootstrap verifier, built here from the ring and handed out. It holds a derived key for one
    purpose and exposes no way to reach it, which is what lets the vetting module check an operator's
    authorisation without becoming a module that can open a sealed value. */
 const bootstrap = createBootstrapAuthority(keys);
 /* The sealer. It is built here for the same reason the bootstrap verifier is: assembling it needs
    the chain, and the chain needs the key. What is handed out is `logSeal` — two methods, neither of
    which can write an access entry — and `verifySealedLog`, which needs the key to be worth running
    and so cannot live on the other side either. */
 const seal = createLogSeal({ audit, store: auditStore, now: sources.now, ...(sources.seal ?? {}) });
 const logSeal: LogSeal = { appended: seal.appended, sealNow: seal.sealNow };
 /* The witness. It reads one hash by position out of the store and never the entries, which is
    deliberately the smallest thing that answers the question — a caller who can ask "what did entry
    four hundred hash to" cannot read what entry four hundred said. Nothing here publishes anything:
    what is absent is a recipient, and a recipient is an agreement rather than a function. */
 const hashAt = (position: number): string | null => auditStore.all()[position - 1]?.hash ?? null;
 return {
  gate, audit, rotation, bootstrap, logSeal,
  sealsFor: (logId: string) => seal.sealsFor(logId),
  verifySealedLog: (logId: string, links: readonly LogLink[]): SealedLogVerdict => seal.verify(logId, links),
  /** The chain as it stands, as a block of text meant to leave this machine. It is not published. */
  witness: (at: string): Witness => {
   const verified = audit.verify();
   return statement(WITNESS_LOG, { length: verified.length, head: verified.intact ? verified.head : audit.head() }, at);
  },
  /** Whether this chain is still the chain a statement from the past was made about. */
  witnessCheck: (previous: Witness): WitnessVerdict => {
   const verified = audit.verify();
   return stillExtends(
    { intact: verified.intact, length: verified.length, head: verified.intact ? verified.head : audit.head() },
    hashAt, previous
   );
  },
  keyVersions: keys.versions, currentKeyVersion: keys.current
 };
}
export type ProtectionModule = NonNullable<ReturnType<typeof createProtectionModule>>;
