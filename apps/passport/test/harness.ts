/**
 * A Passport with a synthetic record in it, and nothing real anywhere near it.
 *
 * Every value written here says it is synthetic, the subject is a token the gateway mints, and no
 * identity number, name or phone number appears — scripts/check-boundaries.mjs reads apps/passport
 * for a thirteen-digit run and fails the build on one. The clock is the harness's, so a grant can be
 * allowed to expire without waiting a day.
 */
import { randomBytes } from 'node:crypto';
import contract from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };
import { PassportGateway, type GrantFields, type Requester } from '../src/gateway.ts';
import { PassportKeys } from '../src/keys.ts';
import { PassportStore } from '../src/store.ts';

export const START = Date.UTC(2026, 8, 14, 9, 0, 0);
export const HOUR = 3_600_000;
export const PROVENANCE = { activity: 'self-reported', sourceSystem: 'synthetic-test-fixture' };

export const sentence = (id: string): string => {
 const found = contract.refusals.find(refusal => refusal.id === id);
 if (!found) throw new Error(`No refusal "${id}" in packages/catalog/passport-gateway.json`);
 return found.sentence;
};
export const statementOf = (id: keyof typeof contract.statements): string => contract.statements[id];

export function harness() {
 let clock = START;
 const store = new PassportStore(':memory:');
 const keys = new PassportKeys(randomBytes(32));
 const gateway = new PassportGateway({ store, keys, now: () => clock });
 return { store, keys, gateway, advance: (ms: number) => { clock += ms; }, at: () => clock };
}
export type Harness = ReturnType<typeof harness>;

/** One synthetic subject with an allergy, a vital sign, a sealed maternal-health reading, a medicine and a reading the patient marked private. */
export function seed(h: Harness) {
 const { subject, patientSession } = h.gateway.createSubject();
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
  privateVitals: put('Observation', 'vitals', { code: { text: 'Synthetic private reading' } }, true)
 };
 const grant = (fields: Partial<GrantFields> & Pick<GrantFields, 'recipientRole' | 'scope'>) => {
  const issued = h.gateway.grant(patientSession, { subject, purpose: 'treatment', expiresAt: new Date(h.at() + 24 * HOUR).toISOString(), ...fields });
  if (!issued.ok) throw new Error(issued.reason);
  return issued;
 };
 const as = (artefact: string, purpose = 'treatment'): Requester => ({ kind: 'grant', artefact, purpose });
 return { subject, patientSession, me, ids, grant, as };
}
