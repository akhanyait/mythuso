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
import { createRotation, type SealedColumn } from './rotation.ts';
export type { AccessRequest, AccessOutcome, Gate, AuditChain, AuditLink, Purpose, Binding, Sealed, KeyVersion } from './contract.ts';
export type { Database } from './audit.ts';

/* The lifecycle arithmetic, re-exported rather than reimplemented. EXPIRY_WARNING_DAYS already
   exists in four places — the gate, apps/web, iOS and Android — and scripts/check-boundaries.mjs
   guards all four. Anything on this side of the wall that needs the number takes it from here, so
   there is no fifth copy to drift. */
export { EXPIRY_WARNING_DAYS, resolveState, standingOf, neverGranted } from './gate.ts';
export type { CheckState, CheckRecord, ActorVetting, VettingSource, ReleaseRegister, Standing } from './gate.ts';
export type { SealedColumn, Rotation, RotationReport, RotationStanding, ColumnStanding } from './rotation.ts';
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
 const audit = new HashChainAudit(sqliteAuditStore(db), keys.derive('audit', auditVersion), sources.now);
 const gate = new AccessGate({ crypto: records, audit, vetting: sources.vetting, releases: sources.releases, now: sources.now });
 /* The rotation gets the ring, not the record crypto: it re-wraps data keys and never opens a
    payload, so the job that rotates the database is not a job that can read the database. */
 const rotation = createRotation(keys, db, sources.sealedColumns ?? []);
 /* The bootstrap verifier, built here from the ring and handed out. It holds a derived key for one
    purpose and exposes no way to reach it, which is what lets the vetting module check an operator's
    authorisation without becoming a module that can open a sealed value. */
 const bootstrap = createBootstrapAuthority(keys);
 return { gate, audit, rotation, bootstrap, keyVersions: keys.versions, currentKeyVersion: keys.current };
}
export type ProtectionModule = NonNullable<ReturnType<typeof createProtectionModule>>;
