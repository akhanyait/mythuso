/**
 * The composition root of the data protection module, and the only door into it.
 *
 * Everything outside this directory imports from here. scripts/check-boundaries.mjs fails the build
 * if anything outside apps/api/src/protection imports the crypto directly, because a module that can
 * open a sealed value can decide for itself who may read a record — which is the hole the gate
 * exists to close, and the hole all three sibling projects turned out to have.
 */
import { createProtection, parseRootKeys } from './crypto.ts';
import { AccessGate, type ReleaseRegister, type VettingSource } from './gate.ts';
import { HashChainAudit, sqliteAuditStore, type Database } from './audit.ts';
export type { AccessRequest, AccessOutcome, Gate, AuditChain, AuditLink, Purpose, Binding, Sealed } from './contract.ts';

export type { ProtectionConfig } from './crypto.ts';
import type { ProtectionConfig } from './crypto.ts';

/* Validated at start-up rather than at the first write, so a typo in the environment is a service
   that will not start instead of one that turns out, hours later, to hold nothing it can read. */
export function validateProtectionConfig(config: ProtectionConfig): void {
 if (!config.protectionKeys) return;                       // absence refuses at first use, loudly
 parseRootKeys(config.protectionKeys, { current: config.protectionKeyCurrent });
}
export { createProtection };

/* Assembled once, at start-up. The crypto is constructed here and handed to the gate; nothing else
   is given a reference to it, which is what makes "the gate is the only way in" true rather than
   agreed. Absent keys mean no module: the caller gets null and refuses, rather than a gate that
   opens because it has nothing to check with. */
export function createProtectionModule(config: ProtectionConfig, db: Database, sources: {
 vetting: VettingSource; releases: ReleaseRegister; now?: () => number;
}) {
 if (!config.protectionKeys) return null;
 const { keys, records } = createProtection(config);
 const audit = new HashChainAudit(sqliteAuditStore(db), keys.derive('audit'), sources.now);
 const gate = new AccessGate({ crypto: records, audit, vetting: sources.vetting, releases: sources.releases, now: sources.now });
 return { gate, audit, keyVersions: keys.versions, currentKeyVersion: keys.current };
}
export type ProtectionModule = NonNullable<ReturnType<typeof createProtectionModule>>;
