import { allow, consentFor, itemFor, patientIn, requireThat, textRequired } from './guards.ts';
import { bounds, grouped } from './contract.ts';
import type { Actor, Command, State } from './types.ts';
export function dispensary(state: State, command: Command, actor: Actor, now: string) {
 consentFor(state, command.patientId);
 if (command.type === 'dispensary.request') {
  allow(actor, 'doctor');
  const record = itemFor(state.consultations, command.consultationId, command.patientId);
  requireThat(record.status === 'signed', 'unsigned-consultation-on-request');
  textRequired(command.item, 'prescription-item'); textRequired(command.directions, 'prescriber-directions');
  requireThat(Number.isInteger(command.quantity) && command.quantity >= bounds.quantity.min && command.quantity <= bounds.quantity.max, 'quantity-out-of-bounds', { min: bounds.quantity.min, max: grouped(bounds.quantity.max) });
  state.medicationRequests.push({ id: `RX-${state.revision + 1}`, patientId: command.patientId, consultationId: record.id, item: command.item, directions: command.directions, quantity: command.quantity, status: 'requested', prescriberId: actor.id }); return;
 }
 if (!('requestId' in command)) return;
 /* The person who prescribes is never the person who checks the prescription. Both are fictional
    here and the separation survives anyway, because it is the shape the screens teach. */
 allow(actor, 'pharmacist');
 const request = itemFor(state.medicationRequests, command.requestId, command.patientId);
 requireThat(request.status !== 'dispensed', 'already-dispensed');
 if (command.type === 'dispensary.hold') {
  textRequired(command.reason, 'hold-reason'); request.status = 'held'; request.reason = command.reason; request.batchId = undefined; return;
 }
 if (command.type === 'dispensary.verify') {
  /* Three things at once, and the third is the one that matters: the allergy record on the patient
     must itself be reconciled. A tick a pharmacist can supply alone is a tick that means nothing. */
  requireThat(command.originalChecked && command.allergyChecked && patientIn(state, command.patientId).allergiesReviewed, 'checks-outstanding');
  const batch = state.stock.find(b => b.id === command.batchId && b.item === request.item);
  requireThat(batch && Date.parse(batch.expiresAt) > Date.parse(now), 'batch-unusable');
  requireThat(batch.quantity >= request.quantity, 'batch-short');
  request.status = 'verified'; request.batchId = batch.id; request.pharmacistId = actor.id; request.reason = undefined;
 } else if (command.type === 'dispensary.release') {
  requireThat(request.status === 'verified' && command.recipientChecked, 'recipient-unchecked');
  /* Checked again rather than trusted from the verification: time passes between the two acts, and
     a batch can expire inside it. */
  const batch = state.stock.find(b => b.id === request.batchId);
  requireThat(batch && batch.quantity >= request.quantity && Date.parse(batch.expiresAt) > Date.parse(now), 'batch-short-at-release');
  batch.quantity -= request.quantity; request.status = 'dispensed'; request.pharmacistId = actor.id;
 }
}
