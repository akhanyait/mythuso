import { allow, consentFor, itemFor, requireThat, textRequired } from './guards.ts';
import type { Actor, Command, State } from './types.ts';
/** Manages evidence and clinician review. It never infers a diagnosis from a wearable value. */
export function diagnosis(state: State, command: Command, actor: Actor) {
 allow(actor, 'doctor', 'nurse'); consentFor(state, command.patientId);
 if (command.type === 'diagnosis.propose') {
  const record = itemFor(state.consultations, command.consultationId, command.patientId);
  requireThat(record.status !== 'signed', 'encounter-signed');
  textRequired(command.impression, 'clinical-impression'); textRequired(command.evidence, 'supporting-evidence');
  /* One open assessment at a time. Two competing impressions is a doctor choosing which to answer,
     and the one not chosen stays on the record unanswered. */
  requireThat(!state.assessments.some(a => a.consultationId === record.id && a.status !== 'rejected'), 'assessment-outstanding');
  state.assessments.push({ id: `DX-${state.revision + 1}`, patientId: command.patientId, consultationId: record.id, impression: command.impression.trim(), evidence: command.evidence.trim(), status: 'proposed', origin: 'clinician' });
 } else if (command.type === 'diagnosis.review') {
  allow(actor, 'doctor');
  const assessment = itemFor(state.assessments, command.assessmentId, command.patientId);
  requireThat(assessment.status === 'proposed', 'assessment-reviewed');
  requireThat(command.decision === 'confirmed' || command.decision === 'rejected', 'decision-required');
  textRequired(command.rationale, 'review-rationale');
  assessment.status = command.decision; assessment.reviewedBy = actor.id; assessment.rationale = command.rationale.trim();
 }
}
