import { allow, consentFor, itemFor, requireThat, textRequired } from './guards.ts';
import type { Actor, Command, State } from './types.ts';
/** Manages evidence and clinician review. It never infers a diagnosis from a wearable value. */
export function diagnosis(state: State, command: Command, actor: Actor) {
 allow(actor, 'doctor', 'nurse'); consentFor(state, command.patientId);
 if (command.type === 'diagnosis.propose') {
  const record = itemFor(state.consultations, command.consultationId, command.patientId);
  requireThat(record.status !== 'signed', 'This encounter is already signed.');
  textRequired(command.impression, 'Clinical impression'); textRequired(command.evidence, 'Supporting evidence');
  requireThat(!state.assessments.some(a => a.consultationId === record.id && a.status !== 'rejected'), 'Review the existing assessment before creating another.');
  state.assessments.push({ id: `DX-${state.revision + 1}`, patientId: command.patientId, consultationId: record.id, impression: command.impression.trim(), evidence: command.evidence.trim(), status: 'proposed', origin: 'clinician' });
 } else if (command.type === 'diagnosis.review') {
  allow(actor, 'doctor');
  const assessment = itemFor(state.assessments, command.assessmentId, command.patientId);
  requireThat(assessment.status === 'proposed', 'This assessment has already been reviewed.');
  requireThat(command.decision === 'confirmed' || command.decision === 'rejected', 'Choose a review decision.');
  textRequired(command.rationale, 'Review rationale');
  assessment.status = command.decision; assessment.reviewedBy = actor.id; assessment.rationale = command.rationale.trim();
 }
}
