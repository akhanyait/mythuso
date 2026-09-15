/* A structured consultation: its entry in the Health Passport, which headings of the frame it holds, and a
 * sign-off refused until every required heading is written.
 *
 * WHAT IS HERE AND WHAT IS NOT. The writer puts the words in the Passport through its consent gateway under their
 * own grant, and tells Clinical the entry and the headings they wrote under. Clinical keeps the reference, the
 * headings by code, who wrote it and when it was signed off. It never sees what was written, so it cannot judge
 * whether a heading was written well; it can refuse a sign-off with a heading left empty, which is §5.2's rule.
 *
 * ONCE SIGNED, NEVER REWRITTEN. A signed-off consultation refuses another write under the same entry: a correction
 * is a new entry, as it is in the Passport, so a signature never ends up under words its signer did not read. A
 * sign-off with nobody's reference behind it is an automatic one and is refused as that.
 */
import { done, frame, refused, requiredHeadings, type Result } from './contract.ts';

export type Consultation = {
 readonly consultationRef: string; readonly subjectRef: string; readonly encounterRef: string; readonly consultationEntryRef: string;
 readonly writtenByRef: string | null; readonly sectionsWritten: readonly string[]; readonly writtenAt: number; readonly signedOffAt: number | null;
};

/** The required headings not written yet, by code, in the frame's order. */
export const missingOf = (sectionsWritten: readonly string[]): string[] => requiredHeadings.filter(code => !sectionsWritten.includes(code));

export type ConsultationInput = {
 readonly consultationRef: string; readonly subjectRef: string; readonly encounterRef: string; readonly consultationEntryRef: string;
 readonly sectionsWritten: readonly unknown[]; readonly signOff: boolean;
};

export function record(existing: Consultation | undefined, input: ConsultationInput, writer: { readonly ref: string | null }, now: number): Result<Consultation> {
 if (existing?.signedOffAt != null) return refused('consultation-already-signed-off');
 if (input.sectionsWritten.some(code => typeof code !== 'string' || !frame.some(heading => heading.code === code))) return refused('section-not-in-the-frame');
 const sectionsWritten = frame.map(heading => heading.code).filter(code => input.sectionsWritten.includes(code));
 if (input.signOff && !writer.ref) return refused('auto-signed-note');
 if (input.signOff && missingOf(sectionsWritten).length) return refused('required-sections-missing');
 return done({
  consultationRef: existing?.consultationRef ?? input.consultationRef, subjectRef: input.subjectRef, encounterRef: input.encounterRef,
  consultationEntryRef: input.consultationEntryRef, writtenByRef: writer.ref, sectionsWritten, writtenAt: now, signedOffAt: input.signOff ? now : null
 });
}

/** Whether an encounter's record is complete: a consultation for it signed off with every required heading written. */
export const recordComplete = (consultations: readonly Consultation[], encounterRef: string): boolean =>
 consultations.some(c => c.encounterRef === encounterRef && c.signedOffAt !== null && missingOf(c.sectionsWritten).length === 0);
