/**
 * What the gateway reads out of the catalogue, typed, in one place.
 *
 * Record categories are packages/catalog/records.json's, so a grant's scope is never a free-text
 * promise and "protected" means the same thing here as it does on every screen. The resource set,
 * the sealed rule, break-glass and every sentence are packages/catalog/passport-gateway.json's. The
 * eight recipient roles, and what each may do here, are packages/catalog/consent.json's `grants` —
 * the same list a grant sheet offers, so the gateway cannot honour a role the patient was never shown.
 */
import consent from '../../../packages/catalog/consent.json' with { type: 'json' };
import gateway from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };
import records from '../../../packages/catalog/records.json' with { type: 'json' };

/* What a grant to a role can ever open, per the master document's section 21: records in its scope,
   routine records only, the emergency summary only, or aggregate figures (which P0 does not serve).
   `writes` is whether a grant to the role may write; the patient's own session always may.
   `sealedMayBeIncluded` is whether the patient can tick a sealed category in for this role at all.
   `clinician` is whether a read that excludes sealed content says that sealed content exists. */
export type GrantRole = {
 id: string;
 reads: 'records' | 'routine' | 'emergency-summary' | 'aggregate';
 writes: boolean;
 sealedMayBeIncluded: boolean;
 clinician: boolean;
};

const GRANT_ROLES: readonly GrantRole[] = consent.grants.recipientRoles.map(role => ({ id: role.id, ...role.gateway }) as GrantRole);

export { refusalOf } from './config.ts';
export const GATEWAY = gateway;

export type ResourceRule = { type: string; categories: readonly string[]; writable: boolean };
export type StatementId = keyof typeof gateway.statements;

const SENSITIVITY = new Map(records.records.map(record => [record.id, record.sensitivity] as const));

export const knownCategory = (category: string): boolean => SENSITIVITY.has(category);
export const sensitivityOf = (category: string): string | null => SENSITIVITY.get(category) ?? null;
export const isProtectedCategory = (category: string): boolean => SENSITIVITY.get(category) === gateway.sealed.sensitivity;
export const resourceRule = (type: string): ResourceRule | null => gateway.resources.find(rule => rule.type === type) ?? null;
export const roleRule = (id: string): GrantRole | null => GRANT_ROLES.find(role => role.id === id) ?? null;
export const statement = (id: StatementId): string => gateway.statements[id];
