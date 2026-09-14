/**
 * TO BE REPLACED BY packages/catalog/consent.json `grants` AT INTEGRATION.
 *
 * The consent grant — subject, recipientRole, scope, purpose, expiresAt, sealedIncluded — is being
 * written into packages/catalog/consent.json by the contracts branch while this service is built.
 * Until it lands, the eight recipient roles and what each may do are held here, in the smallest shape
 * the gateway needs, so the gateway can be built against exactly those fields and nothing more.
 *
 * This is a fixture and it knows it: scripts/check-boundaries.mjs fails the build the day
 * consent.json carries `grants` and this file still exists. Deleting it then, and reading the roles
 * from the contract, is the whole of the integration.
 *
 * The rules are the master document's §21, "Roles and default scopes":
 *   · `reads` — what a grant to this role can ever open: records in its scope, routine records only,
 *     the emergency summary only, or aggregate figures (which P0 does not serve at all).
 *   · `writes` — whether a grant to this role may write. The patient's own session always may.
 *   · `sealedMayBeIncluded` — whether the patient can tick a sealed category for this role at all.
 *     Nurse and doctor "must request"; pharmacist, coordinator, responder and scheme never.
 *   · `clinician` — whether a read that excludes sealed content says that sealed content exists.
 */
export type GrantRole = {
 id: 'caregiver' | 'next-of-kin' | 'nurse-assigned' | 'doctor-assigned' | 'pharmacist' | 'care-coordinator' | 'responder-on-trip' | 'scheme-aggregate';
 reads: 'records' | 'routine' | 'emergency-summary' | 'aggregate';
 writes: boolean;
 sealedMayBeIncluded: boolean;
 clinician: boolean;
};

export const GRANT_ROLES_FIXTURE: readonly GrantRole[] = [
 { id: 'caregiver', reads: 'records', writes: false, sealedMayBeIncluded: true, clinician: false },
 { id: 'next-of-kin', reads: 'records', writes: false, sealedMayBeIncluded: true, clinician: false },
 { id: 'nurse-assigned', reads: 'records', writes: true, sealedMayBeIncluded: true, clinician: true },
 { id: 'doctor-assigned', reads: 'records', writes: true, sealedMayBeIncluded: true, clinician: true },
 { id: 'pharmacist', reads: 'records', writes: true, sealedMayBeIncluded: false, clinician: true },
 { id: 'care-coordinator', reads: 'routine', writes: false, sealedMayBeIncluded: false, clinician: false },
 { id: 'responder-on-trip', reads: 'emergency-summary', writes: false, sealedMayBeIncluded: false, clinician: false },
 { id: 'scheme-aggregate', reads: 'aggregate', writes: false, sealedMayBeIncluded: false, clinician: false }
];
