import { allow, completeNotes, consentFor, itemFor, requireThat, textRequired } from './guards.ts';
import { bounds, grouped, soapKeys } from './contract.ts';
import type { Actor, Command, State } from './types.ts';
export function consultations(state: State, command: Command, actor: Actor, now: string) {
 allow(actor, 'doctor', 'nurse'); consentFor(state, command.patientId);
 if (command.type === 'consultation.open') {
  const appointment = itemFor(state.appointments, command.appointmentId, command.patientId);
  requireThat(appointment.status === 'arrived', 'not-arrived');
  requireThat(!state.consultations.some(c => c.appointmentId === appointment.id), 'consultation-exists');
  state.consultations.push({ id: `CO-${state.revision + 1}`, appointmentId: appointment.id, patientId: command.patientId, status: 'draft', notes: { subjective: '', objective: '', assessment: '', plan: '' } }); return;
 }
 if (!('consultationId' in command)) return;
 const record = itemFor(state.consultations, command.consultationId, command.patientId);
 requireThat(record.status !== 'signed', 'signed-is-immutable');
 if (command.type === 'consultation.save') {
  /* The four headings come from packages/catalog/records.json, which the consultation form in all
     three apps already renders. A draft may be empty; it may not be unbounded. */
  for (const key of soapKeys) requireThat(typeof command.notes[key] === 'string' && command.notes[key].length <= bounds.noteCharacters.max, 'note-too-long', { max: grouped(bounds.noteCharacters.max) });
  record.notes = { ...command.notes }; record.status = 'draft';
 } else if (command.type === 'consultation.submit') {
  requireThat(completeNotes(record.notes), 'incomplete-soap-submit'); record.status = 'awaiting-doctor';
 } else if (command.type === 'consultation.sign') {
  allow(actor, 'doctor');
  /* Checked again at signing rather than trusted from the submission: the note can be edited in
     between, and the signature is a statement about what the record carries afterwards. */
  requireThat(completeNotes(record.notes), 'incomplete-soap-sign');
  for (const value of Object.values(record.notes)) textRequired(value, 'clinical-note');
  requireThat(state.assessments.some(a => a.consultationId === record.id && a.status === 'confirmed'), 'unconfirmed-assessment');
  record.status = 'signed'; record.signedBy = actor.id; record.signedAt = now;
 }
}
