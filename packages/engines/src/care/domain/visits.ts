/* A visit, from the door to the doctor's queue to Money.
 *
 * THE CODE OPENS IT AND THE CODE CLOSES IT. The patient's six digits are the proof that the right
 * nurse is at the right door, so a visit starts only when they match and completes only when they
 * match again at the end. A code that does not match refuses the act and changes nothing: there is
 * no half-started visit, no count of attempts that quietly unlocks it, and no in-progress event for
 * a door the code did not open. The code is held here beside the visit and never leaves — no event
 * carries it, because a code on the bus proves nothing at the next door.
 *
 * The day is checked before the code, so a wrong-day attempt learns nothing about whether its code
 * was right.
 *
 * WHAT CARE DOES NOT HOLD. The encounter. Whether it is complete and whether it is signed are
 * questions for the record, asked through the `RecordPort` handed in, because a Care store that kept
 * its own copy of what the nurse found would be a second clinical record with no consent gate in
 * front of it. Care keeps references: the observation entries attached, the encounter handed over.
 *
 * COMPLETION IS TWO EVENTS FOR TWO AUDIENCES. appointment.completed tells Core, the record and Verify
 * that the visit is done and where its encounter is. visit.billable tells Money that a service was
 * delivered and by whom, and carries no encounter reference at all: Money needs that it happened,
 * never what happened. */
import { answer, type Answer, type CareEvent } from './outcome.ts';
import { purposeOf, refuse, ROUTES, type CareContract } from './contract.ts';
import { sameDay } from './clock.ts';
import { checklistFor, protocolAt } from './checklist.ts';
import type { Booking, Caller } from './offers.ts';

export interface RecordPort {
 encounterComplete(encounterRef: string): boolean;
 encounterSigned(encounterRef: string): boolean;
}

export type VisitState = 'booked' | 'in-progress' | 'completed';
export type Visit = Booking & {
 state: VisitState;
 startedAt: string | null;
 checklistRecordedAt: string | null;
 observationRefs: string[];
 handover: { encounterRef: string; submittedAt: string } | null;
 completedAt: string | null;
};

export class VisitDesk {
 #contract: CareContract;
 #record: RecordPort;
 #visits = new Map<string, Visit>();
 #codes = new Map<string, string>();

 constructor(options: { contract: CareContract; record: RecordPort; held?: readonly { visit: Visit; visitCode: string }[] }) {
  this.#contract = options.contract;
  this.#record = options.record;
  for (const { visit, visitCode } of options.held ?? []) {
   this.#visits.set(visit.appointmentRef, structuredClone(visit));
   this.#codes.set(visit.appointmentRef, visitCode);
  }
 }

 /** What a store keeps. The code travels beside the visit and never inside it, so a visit document can be read without reading a secret. */
 state(): { visit: Visit; visitCode: string }[] {
  return [...this.#visits.values()].map(visit => ({ visit: structuredClone(visit), visitCode: this.#codes.get(visit.appointmentRef)! }));
 }

 /** A booked visit and the patient's code for it. The code arrives from whoever issued it to the patient, never from an event. */
 hold(booking: Booking, visitCode: string): void {
  if (this.#visits.has(booking.appointmentRef)) return;
  this.#visits.set(booking.appointmentRef, {
   ...booking, state: 'booked', startedAt: null, checklistRecordedAt: null, observationRefs: [], handover: null, completedAt: null
  });
  this.#codes.set(booking.appointmentRef, visitCode);
 }

 visit(appointmentRef: string): Visit | null { return this.#visits.get(appointmentRef) ?? null; }

 start(request: { appointmentRef: string; visitCode: string }, caller: Caller, now: Date): Answer<{ startedAt: string }> {
  const visit = this.#mine(request.appointmentRef, caller);
  if (!visit) return refuse(this.#contract, ROUTES.start, 'caller-not-allowed');
  if (visit.state !== 'booked') return answer({ startedAt: visit.startedAt! });
  if (!sameDay(new Date(visit.scheduledFor), now, this.#contract.timezone)) return refuse(this.#contract, ROUTES.start, 'not-today');
  if (!this.#matches(visit, request.visitCode)) return refuse(this.#contract, ROUTES.start, 'visit-code-wrong');
  visit.state = 'in-progress';
  visit.startedAt = now.toISOString();
  return answer({ startedAt: visit.startedAt }, [this.#event(visit, 'appointment.in_progress', ROUTES.start, { appointmentRef: visit.appointmentRef, visitCodeMatched: true })]);
 }

 checklist(request: { appointmentRef: string; protocolVersionId: string; completedItems: readonly string[] }, caller: Caller, now: Date): Answer<{ recordedAt: string }> {
  const visit = this.#mine(request.appointmentRef, caller);
  if (!visit) return refuse(this.#contract, ROUTES.checklist, 'caller-not-allowed');
  if (visit.state !== 'in-progress') return refuse(this.#contract, ROUTES.checklist, 'checklist-without-visit');
  /* The version must be one the register holds, one this service names, and ratified. Any of the
     three failing is the same answer: this is not a ratified protocol for this visit. */
  const protocol = protocolAt(this.#contract, request.protocolVersionId);
  const named = checklistFor(this.#contract, visit.serviceId).protocols.some(p => p.reference === request.protocolVersionId);
  if (!protocol || !named || protocol.status !== 'ratified') return refuse(this.#contract, ROUTES.checklist, 'protocol-not-ratified');
  visit.checklistRecordedAt = now.toISOString();
  return answer({ recordedAt: visit.checklistRecordedAt });
 }

 capture(request: { appointmentRef: string; observationRefs: readonly string[] }, caller: Caller): Answer<{ attachedCount: number }> {
  const visit = this.#mine(request.appointmentRef, caller);
  if (!visit) return refuse(this.#contract, ROUTES.capture, 'caller-not-allowed');
  if (visit.state !== 'in-progress') return refuse(this.#contract, ROUTES.capture, 'capture-without-visit');
  const fresh = [...new Set(request.observationRefs)].filter(ref => !visit.observationRefs.includes(ref));
  visit.observationRefs.push(...fresh);
  return answer({ attachedCount: fresh.length });
 }

 handover(request: { appointmentRef: string; encounterRef: string }, caller: Caller, now: Date): Answer<{ reviewQueued: boolean }> {
  const visit = this.#mine(request.appointmentRef, caller);
  if (!visit) return refuse(this.#contract, ROUTES.handover, 'caller-not-allowed');
  if (visit.state === 'booked') return refuse(this.#contract, ROUTES.handover, 'handover-without-visit');
  if (visit.handover?.encounterRef === request.encounterRef) return answer({ reviewQueued: true });
  if (!this.#record.encounterComplete(request.encounterRef)) return refuse(this.#contract, ROUTES.handover, 'encounter-incomplete');
  visit.handover = { encounterRef: request.encounterRef, submittedAt: now.toISOString() };
  return answer({ reviewQueued: true }, [this.#event(visit, 'visit.handover.submitted', ROUTES.handover, { appointmentRef: visit.appointmentRef, encounterRef: request.encounterRef })]);
 }

 complete(request: { appointmentRef: string; visitCode: string; encounterRef: string }, caller: Caller, now: Date): Answer<{ completedAt: string }> {
  const visit = this.#mine(request.appointmentRef, caller);
  if (!visit) return refuse(this.#contract, ROUTES.complete, 'caller-not-allowed');
  if (visit.state === 'completed') return answer({ completedAt: visit.completedAt! });
  if (visit.state !== 'in-progress') return refuse(this.#contract, ROUTES.complete, 'complete-without-start');
  if (!this.#matches(visit, request.visitCode)) return refuse(this.#contract, ROUTES.complete, 'visit-code-wrong');
  if (!this.#record.encounterSigned(request.encounterRef)) return refuse(this.#contract, ROUTES.complete, 'encounter-unsigned');
  visit.state = 'completed';
  visit.completedAt = now.toISOString();
  return answer({ completedAt: visit.completedAt }, [
   this.#event(visit, 'appointment.completed', ROUTES.complete, { appointmentRef: visit.appointmentRef, encounterRef: request.encounterRef, serviceId: visit.serviceId }),
   this.#event(visit, 'visit.billable', ROUTES.complete, { appointmentRef: visit.appointmentRef, serviceId: visit.serviceId, clinicianRef: visit.clinicianRef })
  ]);
 }

 /* Unknown and not-yours are one answer, so a visit reference cannot be probed for existence. */
 #mine(appointmentRef: string, caller: Caller): Visit | null {
  const visit = this.#visits.get(appointmentRef);
  return visit && visit.clinicianRef === caller.clinicianRef ? visit : null;
 }

 #matches(visit: Visit, offered: string): boolean {
  const held = this.#codes.get(visit.appointmentRef) ?? '';
  /* Compared across the whole length whatever the first difference, so the time a refusal takes does
     not say how many leading digits were right. */
  let difference = held.length ^ offered.length;
  for (let i = 0; i < Math.max(held.length, offered.length); i += 1) difference |= (held.charCodeAt(i) || 0) ^ (offered.charCodeAt(i) || 0);
  return held.length > 0 && difference === 0;
 }

 #event(visit: Visit, type: string, path: typeof ROUTES[keyof typeof ROUTES], payload: Record<string, string | boolean>): CareEvent {
  return { type, version: 1, subjectRef: visit.subjectRef, actorRole: 'nurse', purposeOfUse: purposeOf(this.#contract, path), payload };
 }
}
