/* A prescription from prescribed to dispensed, and the interaction check each end of it stands on.
 *
 * REFERENCES, NEVER CONTENT. A prescription here is a MedicationRequest's reference in the Health Passport, who
 * wrote it, the pharmacy it went to, the schedule and the state. The medicine and the dose are in the Passport,
 * where the prescriber wrote them through the consent gateway and where a pharmacist reads them under a grant
 * the patient can see (medicines.json whereContentLives). Nothing here could be handed either, because no type
 * in this file has a field for one.
 *
 * NOT CHECKED IS AN ANSWER, AND IT IS NEVER "NOTHING FOUND". A check with no licensed source answers not-checked
 * with the contract's reason, and an act that stands on it is refused until the person doing it says they read
 * why. A check is cited once, by one act, for the patient and the stage it was run for.
 *
 * SEPARATION OF DUTIES IS ARITHMETIC ON PARTIES. The reference that prescribed never verifies, whatever role it
 * calls in; a screen that hid the button would be a hint, and this is the refusal. Who may act at all is
 * ./standing.ts's, asked by the caller, which hands the answer in.
 *
 * In order, and no other: prescribed, verified, dispensed. Collection and hand-over are ./collections.ts's.
 */
import { NOT_CHECKED, done, refused, scheduleOf, stages, type Result } from './contract.ts';

export type Check = {
 readonly checkRef: string; readonly subjectRef: string; readonly stageCode: string; readonly outcomeCode: string;
 readonly ranByRef: string | null; readonly ranAt: number; readonly citedBy: string | null;
};
export type Prescription = {
 readonly prescriptionRef: string; readonly subjectRef: string; readonly medicationRequestRef: string;
 readonly prescriberRef: string; readonly pharmacyRef: string; readonly scheduleCode: string;
 readonly prescribeCheckRef: string; readonly prescribeCheckOutcomeCode: string; readonly prescribedAt: number;
 readonly verifiedByRef: string | null; readonly verifiedAt: number | null;
 readonly dispensedByRef: string | null; readonly dispensedAt: number | null; readonly dispenseEntryRef: string | null;
 readonly dispenseCheckRef: string | null; readonly sealRef: string | null;
 readonly collectedAt: number | null; readonly deliveredAt: number | null;
};

/** Where a prescription has got to, as a state code packages/catalog/medicines.json lists. */
export const stateOf = (p: Prescription): string =>
 p.deliveredAt !== null ? 'delivered' : p.collectedAt !== null ? 'collected' : p.dispensedAt !== null ? 'dispensed' : p.verifiedAt !== null ? 'verified' : 'prescribed';

export function runCheck(input: { checkRef: string; subjectRef: string; stageCode: string; byRef: string | null }, now: number): Result<Check> {
 if (!stages.includes(input.stageCode)) return refused('stage-not-known');
 /* No licensed source is named, so nothing is compared and the outcome says so. */
 return done({ checkRef: input.checkRef, subjectRef: input.subjectRef, stageCode: input.stageCode, outcomeCode: NOT_CHECKED.code, ranByRef: input.byRef, ranAt: now, citedBy: null });
}

/* The refusal an act citing this check is given, or null. A check Medicines never ran is answered by the act's own
   missing-check sentence: at prescribe that is no-interaction-check, and at dispense, which has no such sentence,
   it is a check not run for this patient at this stage, which is true of it. */
function citation(check: Check | undefined, subjectRef: string, stageCode: string, notCheckedRead: boolean, missing: string): string | null {
 if (!check) return missing;
 if (check.subjectRef !== subjectRef || check.stageCode !== stageCode) return 'check-not-for-this';
 if (check.citedBy !== null) return 'check-already-cited';
 if (check.outcomeCode === NOT_CHECKED.code && !notCheckedRead) return 'not-checked-not-read';
 return null;
}
const cite = (check: Check, by: string): Check => ({ ...check, citedBy: by });

export type PrescribeInput = {
 readonly prescriptionRef: string; readonly subjectRef: string; readonly medicationRequestRef: string; readonly checkRef: string;
 readonly scheduleCode: string; readonly pharmacyRef: string; readonly notCheckedRead: boolean;
};
export type Asked = { readonly ref: string | null; readonly cleared: boolean };

export function prescribe(input: PrescribeInput, who: Asked & { readonly pharmacyCleared: boolean; readonly check: Check | undefined }, now: number): Result<{ readonly prescription: Prescription; readonly check: Check }> {
 if (!who.ref) return refused('unnamed-caller');
 if (!who.cleared) return refused('not-vetted-for-this');
 if (!scheduleOf(input.scheduleCode)) return refused('schedule-not-handled');
 if (!who.pharmacyCleared) return refused('pharmacy-not-verified');
 const cited = citation(who.check, input.subjectRef, 'prescribe', input.notCheckedRead, 'no-interaction-check');
 if (cited) return refused(cited);
 const check = who.check!;
 const prescription: Prescription = {
  prescriptionRef: input.prescriptionRef, subjectRef: input.subjectRef, medicationRequestRef: input.medicationRequestRef,
  prescriberRef: who.ref, pharmacyRef: input.pharmacyRef, scheduleCode: input.scheduleCode,
  prescribeCheckRef: check.checkRef, prescribeCheckOutcomeCode: check.outcomeCode, prescribedAt: now,
  verifiedByRef: null, verifiedAt: null, dispensedByRef: null, dispensedAt: null, dispenseEntryRef: null, dispenseCheckRef: null, sealRef: null,
  collectedAt: null, deliveredAt: null
 };
 return done({ prescription, check: cite(check, prescription.prescriptionRef) }, [
  { key: 'prescription.prescribed@1', payload: { prescriptionRef: prescription.prescriptionRef, medicationRequestRef: prescription.medicationRequestRef, prescriberRef: prescription.prescriberRef } }
 ]);
}

export function verify(p: Prescription, who: Asked, now: number): Result<Prescription> {
 if (!who.ref) return refused('unnamed-caller');
 /* Before anything about the verifier's standing: whoever prescribed it is refused even when fully cleared. */
 if (who.ref === p.prescriberRef) return refused('prescriber-verifies-own-script');
 if (!who.cleared) return refused('not-vetted-for-this');
 if (p.verifiedAt !== null) return refused('already-verified');
 const verified: Prescription = { ...p, verifiedByRef: who.ref, verifiedAt: now };
 return done(verified, [{ key: 'prescription.verified@1', payload: { prescriptionRef: p.prescriptionRef, verifiedByRef: who.ref } }]);
}

export type DispenseInput = { readonly dispenseEntryRef: string; readonly checkRef: string; readonly sealRef: string; readonly notCheckedRead: boolean };

export function dispense(p: Prescription, input: DispenseInput, who: Asked & { readonly pharmacyCleared: boolean; readonly check: Check | undefined }, now: number): Result<{ readonly prescription: Prescription; readonly check: Check }> {
 if (!who.ref) return refused('unnamed-caller');
 if (!who.pharmacyCleared) return refused('unlicensed-pharmacy');
 if (!who.cleared) return refused('not-vetted-for-this');
 if (p.dispensedAt !== null) return refused('already-dispensed');
 if (p.verifiedAt === null) return refused('not-verified');
 const cited = citation(who.check, p.subjectRef, 'dispense', input.notCheckedRead, 'check-not-for-this');
 if (cited) return refused(cited);
 const dispensed: Prescription = { ...p, dispensedByRef: who.ref, dispensedAt: now, dispenseEntryRef: input.dispenseEntryRef, dispenseCheckRef: input.checkRef, sealRef: input.sealRef };
 return done({ prescription: dispensed, check: cite(who.check!, p.prescriptionRef) }, [
  { key: 'dispense.completed@1', payload: { prescriptionRef: p.prescriptionRef, dispenseEntryRef: input.dispenseEntryRef } }
 ]);
}

/** A pharmacy's queue: what it must still verify or dispense, or has dispensed and not yet seen collected, with exactly the fields medicines.json partnerQueue.carries. */
export const queueRowOf = (p: Prescription) => ({
 prescriptionRef: p.prescriptionRef, medicationRequestRef: p.medicationRequestRef, scheduleCode: p.scheduleCode, stateCode: stateOf(p),
 prescribeCheckOutcomeCode: p.prescribeCheckOutcomeCode, prescribedAt: p.prescribedAt, verifiedAt: p.verifiedAt, dispensedAt: p.dispensedAt
});
export const queueFor = (all: readonly Prescription[], pharmacyRef: string) =>
 all.filter(p => p.pharmacyRef === pharmacyRef && p.collectedAt === null).sort((a, b) => a.prescribedAt - b.prescribedAt).map(queueRowOf);
