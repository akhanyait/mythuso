/* Guardian consent for minors: the frame, refusing until proof of authority can be verified.
 *
 * All functions refuse by default — the framework validates what it is handed, but the integration
 * that would verify a guardian's proof of authority against Home Affairs does not exist, so nothing
 * here can make a guardian consent real. The age threshold, the proof types and the refusal ids are
 * the contract's — packages/catalog/consent.json's guardianConsent — and this file holds no sentence
 * of its own: it answers with the contract's ids and the caller reads the statement there.
 *
 * The web preview runs this directory in the browser, so time is handed in as ISO strings: an
 * evaluation names the day it was made on, and the day defaults to now only for a caller with none.
 */
import consent from '../../../../catalog/consent.json' with { type: 'json' };

/** What a guardian's consent would carry. Proof of authority is one of the contract's proof types. */
export interface GuardianConsent {
  minorRef: string;
  guardianRef: string;
  proofType: 'birth-certificate' | 'court-order' | 'legal-guardianship';
  proofVerifiedAt: string | null;
  expiresAt: string | null;
}

/** The answer: allowed, or refused with one of the contract's guardian refusal ids. */
export interface GuardianEvaluation {
  allowed: boolean;
  refusalId?: string;
}

/** The age under which a person may not consent to their own care. consent.json's, read not restated. */
const AGE_THRESHOLD: number = consent.guardianConsent.ageThreshold;

/** Calculate age in whole years from a date-of-birth ISO string. */
export function ageAt(dateOfBirth: string, asOf: string): number {
  const dob = new Date(dateOfBirth);
  const ref = new Date(asOf);
  let age = ref.getFullYear() - dob.getFullYear();
  const monthDiff = ref.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Returns true when the person is under the contract's age threshold at the given date. */
export function isMinor(dateOfBirth: string, asOf: string): boolean {
  return ageAt(dateOfBirth, asOf) < AGE_THRESHOLD;
}

/** Evaluate whether guardian consent is sufficient for a minor. */
export function evaluateGuardianConsent(
  minorAge: number,
  consentRecord: GuardianConsent | null,
  asOf: string = new Date().toISOString()
): GuardianEvaluation {
  if (minorAge >= AGE_THRESHOLD) {
    return { allowed: true }; // Not a minor — guardian consent not needed
  }
  if (!consentRecord) {
    return { allowed: false, refusalId: 'minor-without-guardian' };
  }
  if (!consentRecord.proofVerifiedAt) {
    return { allowed: false, refusalId: 'no-proof-of-authority' };
  }
  if (consentRecord.expiresAt && new Date(consentRecord.expiresAt) < new Date(asOf)) {
    return { allowed: false, refusalId: 'expired-authority-document' };
  }
  return { allowed: true };
}
