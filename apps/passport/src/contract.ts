/**
 * What the gateway reads out of the catalogue, typed, in one place.
 *
 * Record categories are packages/catalog/records.json's, so a grant's scope is never a free-text
 * promise and "protected" means the same thing here as it does on every screen. The resource set,
 * the sealed rule, break-glass and every sentence are packages/catalog/passport-gateway.json's. The
 * eight recipient roles, what each may do here, how long a grant to each may run and which purposes
 * it may name are packages/catalog/consent.json's `grants` — the same list a grant sheet offers, so
 * the gateway cannot honour a role, a purpose or a length the patient was never shown.
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
 defaultScope: readonly string[];
 defaultPurpose: string | null;
 allowedPurposes: readonly string[];
 maxExpiryDays: number;
 boundTo: string | null;
};

const GRANT_ROLES: readonly GrantRole[] = consent.grants.recipientRoles.map(role => ({
 id: role.id, ...role.gateway,
 defaultScope: role.defaultScope, defaultPurpose: role.defaultPurpose, allowedPurposes: role.allowedPurposes,
 maxExpiryDays: role.maxExpiryDays, boundTo: role.boundTo
}) as GrantRole);

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
export const grantRoles = (): readonly GrantRole[] => GRANT_ROLES;
export const statement = (id: StatementId): string => gateway.statements[id];

export type ScopeRefusalId = 'aggregate-only' | 'unknown-category' | 'emergency-only' | 'clinical-detail' | 'sealed-never' | 'sealed-tick-names-nothing' | 'sealed-not-ticked';

/**
 * Whether a scope, with or without the sealed tick, may be granted to a role — and if not, which
 * refusal. One function, read by the gateway when a grant is made and by scripts/check-boundaries.mjs
 * against every role's default scope, so a grant sheet can never start from a scope the gateway refuses.
 *
 * The sealed tick is not a switch. It opens the sealed categories the scope names, so a tick that
 * names none is refused — otherwise it would open whatever sealed thing happened to sit behind an
 * ordinary category, which is how a caregiver's grant for vital signs came to open a reading the
 * patient had marked private.
 */
export function grantScopeRefusal(role: GrantRole, scope: readonly string[], sealedIncluded: boolean): ScopeRefusalId | null {
 if (role.reads === 'aggregate') return 'aggregate-only';
 if (!scope.length || !scope.every(knownCategory)) return 'unknown-category';
 if (role.reads === 'emergency-summary' && !scope.every(category => role.defaultScope.includes(category))) return 'emergency-only';
 if (role.reads === 'routine' && scope.some(category => sensitivityOf(category) !== 'routine')) return 'clinical-detail';
 const sealedNamed = scope.filter(isProtectedCategory);
 if (sealedIncluded && !role.sealedMayBeIncluded) return 'sealed-never';
 if (sealedIncluded && !sealedNamed.length) return 'sealed-tick-names-nothing';
 if (!sealedIncluded && sealedNamed.length) return 'sealed-not-ticked';
 return null;
}
