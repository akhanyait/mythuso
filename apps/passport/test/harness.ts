/**
 * A Passport with a synthetic record in it, and nothing real anywhere near it.
 *
 * Every value written here says it is synthetic, the subject is a token the gateway mints, and no
 * identity number, name or phone number appears — scripts/check-boundaries.mjs reads apps/passport
 * for a thirteen-digit run and fails the build on a realistic one. The Passport is built the way the
 * process builds it, from an environment carrying the development flag and a key of its own, because
 * a gateway built from a configuration nobody loaded is refused. The clock is the harness's, so a
 * grant, a session or an operator credential can be allowed to expire without waiting.
 */
import { randomBytes } from 'node:crypto';
import consent from '../../../packages/catalog/consent.json' with { type: 'json' };
import contract from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };
import { loadPassportConfig } from '../src/config.ts';
import { PassportGateway, type GrantFields, type PlacedOrder, type Requester } from '../src/gateway.ts';
import type { InboundInForce } from '../../../packages/engines/src/record/domain/settings.ts';
import type { Facility } from '../../../packages/engines/src/record/domain/hl7.ts';
import { PassportKeys } from '../src/keys.ts';
import { mintDeveloperCredential, mintOperatorCredential } from '../src/operator.ts';
import { PassportStore } from '../src/store.ts';
import type { SharingInForce } from '../../../packages/engines/src/record/domain/settings.ts';

export const START = Date.UTC(2026, 8, 14, 9, 0, 0);
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const PROVENANCE = { activity: 'self-reported', sourceSystem: 'synthetic-test-fixture' };

export const developmentEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
 MYTHUSO_PASSPORT_DEVELOPMENT: 'synthetic-data-only', MYTHUSO_PASSPORT_MASTER_KEY: randomBytes(32).toString('hex'), ...extra
} as NodeJS.ProcessEnv);

export const sentence = (id: string): string => {
 const found = contract.refusals.find(refusal => refusal.id === id);
 if (!found) throw new Error(`No refusal "${id}" in packages/catalog/passport-gateway.json`);
 return found.sentence;
};
export const statementOf = (id: keyof typeof contract.statements): string => contract.statements[id];
export const roleOf = (id: string) => consent.grants.recipientRoles.find(role => role.id === id)!;

/* The Record settings in force can be handed in, so a test can change one between two links and show the first
   keeps what it was made with. Left out, the gateway reads the contract's defaults, as the process does. */
/* The HL7 bridge's settings, the lab orders Record heard placed and the registered partners can be handed in the same way:
   the process knows no placed order and reads the contract's partners, and a test says otherwise. */
export function harness(options: {
 settings?: () => SharingInForce; inbound?: () => InboundInForce; placedOrder?: (labOrderRef: string) => PlacedOrder | null; facilities?: readonly Facility[];
} = {}) {
 let clock = START;
 const config = loadPassportConfig(developmentEnv());
 const store = new PassportStore(':memory:');
 const keys = new PassportKeys(config.masterKey);
 const gateway = new PassportGateway({
  config, store, now: () => clock, ...(options.settings ? { settings: options.settings } : {}),
  ...(options.inbound ? { inbound: options.inbound } : {}), ...(options.placedOrder ? { placedOrder: options.placedOrder } : {}), ...(options.facilities ? { facilities: options.facilities } : {})
 });
 return {
  config, store, keys, gateway,
  advance: (ms: number) => { clock += ms; },
  at: () => clock,
  operator: (role = 'dispatch-desk') => mintOperatorCredential(config, role, clock),
  developer: () => mintDeveloperCredential(config, clock),
  auditRows: () => store.database.prepare('SELECT * FROM audit_events ORDER BY seq').all() as Record<string, unknown>[]
 };
}
export type Harness = ReturnType<typeof harness>;

/**
 * One synthetic subject with an allergy, a vital sign, a sealed maternal-health reading and a
 * medicine — and, unless asked not to, a vital-sign reading the patient marked private.
 */
export function seed(h: Harness, options: { withPrivate?: boolean } = {}) {
 const created = h.gateway.createSubject(h.developer());
 if (!created.ok) throw new Error(created.reason);
 const { subject, patientSession } = created;
 const me: Requester = { kind: 'patient', session: patientSession };
 const put = (resourceType: string, category: string, resource: Record<string, unknown>, markedPrivate = false): string => {
  const written = h.gateway.write(me, { subject, resourceType, category, resource, provenance: PROVENANCE, markedPrivate });
  if (!written.ok) throw new Error(written.reason);
  return written.id;
 };
 const ids = {
  allergy: put('AllergyIntolerance', 'allergy', { code: { text: 'Synthetic allergen A' } }),
  vitals: put('Observation', 'vitals', { code: { text: 'Synthetic pulse' }, valueQuantity: { value: 71, unit: '/min' } }),
  maternal: put('Observation', 'maternal-health', { code: { text: 'Synthetic antenatal reading' } }),
  medicine: put('MedicationStatement', 'prescription', { medication: { text: 'Synthetic medicine B' } }),
  privateVitals: options.withPrivate === false ? '' : put('Observation', 'vitals', { code: { text: 'Synthetic private reading' } }, true)
 };
 /* A grant on the role's own default purpose, for a day, unless the test says otherwise. */
 const grant = (fields: Partial<GrantFields> & Pick<GrantFields, 'recipientRole' | 'scope'>) => {
  const issued = h.gateway.grant(patientSession, {
   subject, purpose: roleOf(fields.recipientRole)?.defaultPurpose ?? 'treatment', expiresAt: new Date(h.at() + DAY).toISOString(), ...fields
  });
  if (!issued.ok) throw new Error(issued.reason);
  return issued;
 };
 const as = (artefact: string, purpose = 'treatment'): Requester => ({ kind: 'grant', artefact, purpose });
 return { subject, patientSession, me, ids, grant, as };
}
