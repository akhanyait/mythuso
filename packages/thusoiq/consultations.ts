import { allow, completeNotes, consentFor, itemFor, requireThat, textRequired } from './guards.ts';
import type { Actor, Command, State } from './types.ts';
export function consultations(state: State, command: Command, actor: Actor, now: string) {
 allow(actor, 'doctor', 'nurse'); consentFor(state, command.patientId);
 if (command.type === 'consultation.open') {
  const appointment = itemFor(state.appointments, command.appointmentId, command.patientId);
  requireThat(appointment.status === 'arrived', 'Check the patient in before opening a consultation.');
  requireThat(!state.consultations.some(c => c.appointmentId === appointment.id), 'This appointment already has a consultation.');
  state.consultations.push({ id: `CO-${state.revision + 1}`, appointmentId: appointment.id, patientId: command.patientId, status: 'draft', notes: { subjective: '', objective: '', assessment: '', plan: '' } }); return;
 }
 if (!('consultationId' in command)) return;
 const record = itemFor(state.consultations, command.consultationId, command.patientId);
 requireThat(record.status !== 'signed', 'Signed consultations are immutable. Start a new encounter for further care.');
 if (command.type === 'consultation.save') {
  for (const key of ['subjective','objective','assessment','plan'] as const) requireThat(typeof command.notes[key] === 'string' && command.notes[key].length <= 5000, 'Each note must be text of at most 5,000 characters.');
  record.notes = { ...command.notes }; record.status = 'draft';
 } else if (command.type === 'consultation.submit') {
  requireThat(completeNotes(record.notes), 'Complete all four SOAP sections before requesting review.'); record.status = 'awaiting-doctor';
 } else if (command.type === 'consultation.sign') {
  allow(actor, 'doctor');
  requireThat(completeNotes(record.notes), 'Complete all four SOAP sections before signing.');
  for (const value of Object.values(record.notes)) textRequired(value, 'Clinical note');
  requireThat(state.assessments.some(a => a.consultationId === record.id && a.status === 'confirmed'), 'Review and confirm the clinical assessment before signing.');
  record.status = 'signed'; record.signedBy = actor.id; record.signedAt = now;
 }
}
