import { allow, itemFor, requireThat, textRequired } from './guards.ts';
import type { Actor, Appointment, Command, State } from './types.ts';
export function appointments(state: State, command: Command, actor: Actor, now: string) {
 allow(actor, 'doctor', 'nurse');
 if (command.type === 'appointment.transition') {
  const item = itemFor(state.appointments, command.appointmentId, command.patientId);
  const transitions: Record<Appointment['status'], Appointment['status'][]> = { scheduled: ['arrived', 'cancelled'], arrived: ['completed', 'cancelled'], completed: [], cancelled: [] };
  requireThat(transitions[item.status].includes(command.status), 'That appointment status change is not allowed.');
  if (command.status === 'cancelled') textRequired(command.reason ?? '', 'Cancellation reason');
  if (command.status === 'completed') requireThat(state.consultations.some(c => c.appointmentId === item.id && c.status === 'signed'), 'The consultation must be signed before completing this appointment.');
  item.status = command.status; item.reason = command.reason; return;
 }
 if (command.type !== 'appointment.schedule' && command.type !== 'appointment.reschedule') return;
 const previous = command.type === 'appointment.reschedule' ? itemFor(state.appointments, command.appointmentId, command.patientId) : null;
 if (previous) requireThat(previous.status === 'scheduled', 'Only a scheduled appointment can be moved.');
 const minutes = command.type === 'appointment.schedule' ? command.minutes : previous!.minutes;
 const clinicianId = command.type === 'appointment.schedule' ? command.clinicianId : previous!.clinicianId;
 textRequired(clinicianId, 'Clinician');
 const start = Date.parse(command.startsAt), end = start + minutes * 60_000;
 requireThat(Number.isFinite(start) && start > Date.parse(now), 'Choose a future appointment time.');
 requireThat(Number.isInteger(minutes) && minutes >= 10 && minutes <= 180, 'Duration must be between 10 and 180 minutes.');
 requireThat(command.mode === 'home' || command.mode === 'video', 'Choose home or video.');
 requireThat(!state.appointments.some(a => a.id !== previous?.id && a.status !== 'cancelled' && (a.clinicianId === clinicianId || a.patientId === command.patientId) && start < Date.parse(a.startsAt) + a.minutes * 60_000 && end > Date.parse(a.startsAt)), 'This patient or clinician already has an overlapping appointment.');
 if (previous) { previous.startsAt = command.startsAt; previous.mode = command.mode; }
 else state.appointments.push({ id: `AP-${state.revision + 1}`, patientId: command.patientId, clinicianId, startsAt: command.startsAt, minutes, mode: command.mode, status: 'scheduled' });
}
