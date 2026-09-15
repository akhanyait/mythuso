/* An admission request at level one: requested, answered by a facility, arrived and handed over — and a pending
 * bed never shown as booked.
 *
 * PENDING IS A STATE'S, AND IT IS READ IN ONE PLACE. packages/catalog/movement.json gives every admission state
 * whether it is pending and whether it confirms a destination. presentationOf() below is the only reader, the
 * engine's read route answers with what it says, and both screens draw from it. A pending state that confirms a
 * destination, or whose words say a bed is booked, reserved, secured or confirmed, stops this module loading: a
 * contract that could say it would be the defect, so it is refused before any screen can draw it.
 *
 * A FACILITY'S ANSWER IS SIMULATED OR REFUSED. No facility is connected, and a facility's answer arrives only
 * through the facility-decision door, which refuses every payload. So every answer recorded here — a decision, a
 * request for more, an arrival and a hand-over — must say it is simulated, and one that does not is refused before
 * anything about it is read.
 *
 * THE STATE MACHINE IS FOLLOWED, NOT SKIPPED. A decision only while pending; an arrival only once accepted; a
 * hand-over only once arrived.
 *
 * Movement keeps references and codes. Why the patient needs admitting is in the Health Passport.
 */
import {
 accept, admissionStates, bedCategories, declineReasons, decisions, facilityOf, informationAsked, instantOf, isDeclared, pendingNeverSays,
 priorityOf, receivingPoints, receivingRoles, refuse, type AdmissionStateSpec, type Result
} from './contract.ts';

export type AdmissionState = 'requesting' | 'more-information-requested' | 'waitlisted' | 'declined' | 'alternative-offered' | 'accepted' | 'arrived' | 'handed-over';
export type Admission = {
 readonly admissionRef: string;
 readonly subjectRef: string;
 readonly facilityRef: string;
 readonly bedCategory: string;
 readonly priorityCode: 'P2' | 'P3';
 readonly arrivalWindowStart: number;
 readonly requestedByRole: string;
 readonly requestedAt: number;
 readonly stateCode: AdmissionState;
 readonly receivingPoint: string | null;
 readonly reasonCode: string | null;
 readonly alternativeOffered: boolean;
 readonly informationCode: string | null;
 readonly decisionSimulated: boolean;
 readonly decidedAt: number | null;
 readonly arrivedAt: number | null;
 readonly agreedWithPretriage: boolean | null;
 readonly handedOverAt: number | null;
 readonly receivingRole: string | null;
 readonly encounterRef: string | null;
};

const saysBooked = (words: string): string | undefined => {
 const lower = words.toLowerCase();
 return pendingNeverSays.find(word => new RegExp(`\\b${word.toLowerCase()}\\b`).test(lower));
};
for (const state of admissionStates) {
 if (state.pending && state.destinationConfirmed) throw new Error(`packages/catalog/movement.json says the pending admission state "${state.id}" confirms a destination. A pending bed is never shown as booked.`);
 const said = state.pending ? saysBooked(`${state.label} ${state.sentence}`) : undefined;
 if (said) throw new Error(`packages/catalog/movement.json says "${said}" about the pending admission state "${state.id}". A pending bed is never shown as booked.`);
}

/** How an admission state is shown, everywhere: its words, whether it is pending and whether a destination is confirmed. */
export function presentationOf(stateCode: string): AdmissionStateSpec {
 const found = admissionStates.find(s => s.id === stateCode);
 if (!found) throw new Error(`packages/catalog/movement.json has no admission state "${stateCode}".`);
 return found;
}
export const isPending = (stateCode: string): boolean => presentationOf(stateCode).pending;
export { saysBooked };

export type AdmissionRequest = {
 readonly admissionRef: string; readonly subjectRef: unknown; readonly facilityRef: unknown; readonly bedCategory: unknown;
 readonly priorityCode: unknown; readonly arrivalWindowStart: unknown; readonly byRole: string;
};

export function requestAdmission(input: AdmissionRequest, now: number): Result<Admission> {
 const priority = priorityOf(input.priorityCode);
 if (priority && !priority.takenByThusoRide) return refuse('p1-refused-no-ambulance-partner');
 if (!priority) return refuse('priority-not-offered');
 const facility = facilityOf(input.facilityRef);
 if (!facility) return refuse('facility-not-in-directory');
 if (!isDeclared(bedCategories, input.bedCategory)) return refuse('bed-category-not-declared');
 if (!facility.bedCategories.includes(input.bedCategory)) return refuse('bed-category-not-offered');
 const arrivalWindowStart = instantOf(input.arrivalWindowStart);
 if (!Number.isFinite(arrivalWindowStart) || arrivalWindowStart <= now) return refuse('arrival-window-passed');
 return accept(Object.freeze({
  admissionRef: input.admissionRef, subjectRef: String(input.subjectRef), facilityRef: facility.ref, bedCategory: input.bedCategory,
  priorityCode: priority.id as 'P2' | 'P3', arrivalWindowStart, requestedByRole: input.byRole, requestedAt: now,
  stateCode: 'requesting' as const, receivingPoint: null, reasonCode: null, alternativeOffered: false, informationCode: null, decisionSimulated: false,
  decidedAt: null, arrivedAt: null, agreedWithPretriage: null, handedOverAt: null, receivingRole: null, encounterRef: null
 }));
}

export type Announcement =
 | { readonly key: 'admission.accepted@1'; readonly payload: { readonly admissionRef: string; readonly receivingPoint: string } }
 | { readonly key: 'admission.waitlisted@1'; readonly payload: { readonly admissionRef: string } }
 | { readonly key: 'admission.declined@1'; readonly payload: { readonly admissionRef: string; readonly reasonCode: string; readonly alternativeOffered: boolean } };

export type Decision = { readonly decisionCode: unknown; readonly receivingPoint?: unknown; readonly alternativeOffered: unknown; readonly reasonCode?: unknown; readonly simulated: unknown };

export function decide(admission: Admission | undefined, input: Decision, now: number): Result<{ readonly admission: Admission; readonly announce: Announcement }> {
 if (!admission) return refuse('not-found');
 if (input.simulated !== true) return refuse('facility-not-connected');
 if (!isPending(admission.stateCode)) return refuse('decision-not-pending');
 if (!isDeclared(decisions, input.decisionCode)) return refuse('decision-not-declared');
 const alternativeOffered = input.alternativeOffered === true;
 const base = { ...admission, decisionSimulated: true, decidedAt: now, alternativeOffered };
 if (input.decisionCode === 'accepted') {
  if (!isDeclared(receivingPoints, input.receivingPoint)) return refuse('acceptance-without-receiving-point');
  return accept({ admission: Object.freeze({ ...base, stateCode: 'accepted' as const, receivingPoint: input.receivingPoint }), announce: { key: 'admission.accepted@1', payload: { admissionRef: admission.admissionRef, receivingPoint: input.receivingPoint } } });
 }
 if (input.decisionCode === 'declined') {
  if (!isDeclared(declineReasons, input.reasonCode)) return refuse('decline-without-reason');
  const stateCode = alternativeOffered ? 'alternative-offered' as const : 'declined' as const;
  return accept({ admission: Object.freeze({ ...base, stateCode, reasonCode: input.reasonCode }), announce: { key: 'admission.declined@1', payload: { admissionRef: admission.admissionRef, reasonCode: input.reasonCode, alternativeOffered } } });
 }
 return accept({ admission: Object.freeze({ ...base, stateCode: 'waitlisted' as const }), announce: { key: 'admission.waitlisted@1', payload: { admissionRef: admission.admissionRef } } });
}

export function askForMore(admission: Admission | undefined, input: { readonly informationCode: unknown; readonly simulated: unknown }): Result<Admission> {
 if (!admission) return refuse('not-found');
 if (input.simulated !== true) return refuse('facility-not-connected');
 if (!isPending(admission.stateCode)) return refuse('decision-not-pending');
 if (!isDeclared(informationAsked, input.informationCode)) return refuse('information-not-declared');
 return accept(Object.freeze({ ...admission, stateCode: 'more-information-requested' as const, informationCode: input.informationCode, decisionSimulated: true }));
}

export function arrive(admission: Admission | undefined, input: { readonly receivingPoint: unknown; readonly agreedWithPretriage: unknown; readonly simulated: unknown }, now: number): Result<Admission> {
 if (!admission) return refuse('not-found');
 if (input.simulated !== true) return refuse('facility-not-connected');
 if (admission.stateCode !== 'accepted') return refuse('arrival-before-acceptance');
 if (!isDeclared(receivingPoints, input.receivingPoint)) return refuse('receiving-point-not-declared');
 return accept(Object.freeze({ ...admission, stateCode: 'arrived' as const, arrivedAt: now, receivingPoint: input.receivingPoint, agreedWithPretriage: input.agreedWithPretriage === true }));
}

export function handOver(admission: Admission | undefined, input: { readonly receivingRole: unknown; readonly encounterRef: unknown; readonly simulated: unknown }, now: number): Result<Admission> {
 if (!admission) return refuse('not-found');
 if (input.simulated !== true) return refuse('facility-not-connected');
 if (admission.stateCode !== 'arrived') return refuse('handover-before-arrival');
 if (!isDeclared(receivingRoles, input.receivingRole) || typeof input.encounterRef !== 'string' || !input.encounterRef.trim()) return refuse('receiver-not-named');
 return accept(Object.freeze({ ...admission, stateCode: 'handed-over' as const, handedOverAt: now, receivingRole: input.receivingRole, encounterRef: input.encounterRef }));
}
