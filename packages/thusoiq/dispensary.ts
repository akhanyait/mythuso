import { allow, consentFor, itemFor, patientIn, requireThat, textRequired } from './guards.ts';
import type { Actor, Command, State } from './types.ts';
export function dispensary(state: State, command: Command, actor: Actor, now: string) {
 consentFor(state, command.patientId);
 if (command.type === 'dispensary.request') {
  allow(actor, 'doctor');
  const record = itemFor(state.consultations, command.consultationId, command.patientId);
  requireThat(record.status === 'signed', 'A signed consultation is required before requesting medicine.');
  textRequired(command.item, 'Prescription item'); textRequired(command.directions, 'Prescriber directions');
  requireThat(Number.isInteger(command.quantity) && command.quantity > 0 && command.quantity <= 1000, 'Quantity must be a whole number between 1 and 1,000.');
  state.medicationRequests.push({ id: `RX-${state.revision + 1}`, patientId: command.patientId, consultationId: record.id, item: command.item, directions: command.directions, quantity: command.quantity, status: 'requested', prescriberId: actor.id }); return;
 }
 if (!('requestId' in command)) return;
 allow(actor, 'pharmacist');
 const request = itemFor(state.medicationRequests, command.requestId, command.patientId);
 requireThat(request.status !== 'dispensed', 'This request has already been dispensed.');
 if (command.type === 'dispensary.hold') {
  textRequired(command.reason, 'Hold reason'); request.status = 'held'; request.reason = command.reason; request.batchId = undefined; return;
 }
 if (command.type === 'dispensary.verify') {
  requireThat(command.originalChecked && command.allergyChecked && patientIn(state, command.patientId).allergiesReviewed, 'Verify the original prescription and reconcile the allergy record first.');
  const batch = state.stock.find(b => b.id === command.batchId && b.item === request.item);
  requireThat(batch && Date.parse(batch.expiresAt) > Date.parse(now), 'Choose a matching, unexpired stock batch.');
  requireThat(batch.quantity >= request.quantity, 'There is not enough stock in this batch.');
  request.status = 'verified'; request.batchId = batch.id; request.pharmacistId = actor.id; request.reason = undefined;
 } else if (command.type === 'dispensary.release') {
  requireThat(request.status === 'verified' && command.recipientChecked, 'Verify the prescription and recipient before release.');
  const batch = state.stock.find(b => b.id === request.batchId);
  requireThat(batch && batch.quantity >= request.quantity && Date.parse(batch.expiresAt) > Date.parse(now), 'Stock is insufficient or expired. Verify a new batch.');
  batch.quantity -= request.quantity; request.status = 'dispensed'; request.pharmacistId = actor.id;
 }
}
