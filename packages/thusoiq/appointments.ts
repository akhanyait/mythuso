import { allow, itemFor, requireThat, textRequired } from './guards.ts';
import { bounds, transitionsFrom, visitModes } from './contract.ts';
import type { Actor, Command, State } from './types.ts';
export function appointments(state: State, command: Command, actor: Actor, now: string) {
 allow(actor, 'doctor', 'nurse');
 if (command.type === 'appointment.transition') {
  const item = itemFor(state.appointments, command.appointmentId, command.patientId);
  /* The table is packages/catalog/thusoiq.json's now. Neither terminal state has a way out of it:
     a visit that can be un-completed is a signed record that can be reopened afterwards. */
  requireThat(transitionsFrom(item.status).includes(command.status), 'transition-not-allowed');
  if (command.status === 'cancelled') textRequired(command.reason ?? '', 'cancellation-reason');
  if (command.status === 'completed') requireThat(state.consultations.some(c => c.appointmentId === item.id && c.status === 'signed'), 'unsigned-consultation-on-completion');
  item.status = command.status; item.reason = command.reason; return;
 }
 if (command.type !== 'appointment.schedule' && command.type !== 'appointment.reschedule') return;
 const previous = command.type === 'appointment.reschedule' ? itemFor(state.appointments, command.appointmentId, command.patientId) : null;
 if (previous) requireThat(previous.status === 'scheduled', 'only-scheduled-moves');
 const minutes = command.type === 'appointment.schedule' ? command.minutes : previous!.minutes;
 const clinicianId = command.type === 'appointment.schedule' ? command.clinicianId : previous!.clinicianId;
 textRequired(clinicianId, 'clinician');
 const start = Date.parse(command.startsAt), end = start + minutes * 60_000;
 requireThat(Number.isFinite(start) && start > Date.parse(now), 'appointment-in-the-past');
 requireThat(Number.isInteger(minutes) && minutes >= bounds.appointmentMinutes.min && minutes <= bounds.appointmentMinutes.max, 'duration-out-of-bounds', { min: bounds.appointmentMinutes.min, max: bounds.appointmentMinutes.max });
 requireThat(visitModes.includes(command.mode), 'mode-required');
 /* Both directions. A double-booked clinician is a late visit; a double-booked patient is two
    clinicians in one house discussing the same medicine without seeing each other. */
 requireThat(!state.appointments.some(a => a.id !== previous?.id && a.status !== 'cancelled' && (a.clinicianId === clinicianId || a.patientId === command.patientId) && start < Date.parse(a.startsAt) + a.minutes * 60_000 && end > Date.parse(a.startsAt)), 'overlapping-appointment');
 if (previous) { previous.startsAt = command.startsAt; previous.mode = command.mode; }
 else state.appointments.push({ id: `AP-${state.revision + 1}`, patientId: command.patientId, clinicianId, startsAt: command.startsAt, minutes, mode: command.mode, status: 'scheduled' });
}
