/* A Thuso Ride trip: requested, offered, accepted or declined, and handed over. Pure arithmetic over the
 * contract and what it is handed, for the engine runtime and the web preview alike.
 *
 * THE PRIORITY IS ASKED FIRST, AND A P1 BEFORE ANYTHING ELSE. A P1 is refused before the patient, the zone or the
 * destination is read, because a P1 routed anywhere is the failure this engine exists to refuse: no licensed
 * ambulance partner is connected, and Thuso Ride is not an ambulance. There is no branch below that makes a P1 a
 * trip, and the trips table cannot hold one.
 *
 * A P2 IS A CLINICIAN'S CHOICE IN THEIR OWN NAME. No triage protocol is ratified, so nothing sets a P2 on its own.
 * The caller must be a role the contract's P2 names, must name themselves as the person who set it, must be cleared
 * by what Verify last said about them, and must give one of the reasons the contract records. A dispatcher relaying
 * somebody else's P2 is refused, because the person the trip names as having chosen it did not choose it here.
 *
 * A TRIP KEEPS WHAT IT WAS REQUESTED WITH. The offers at once, the window and the retention in force when it was
 * requested are copied onto the trip with the settings version, and nothing below reads a setting again for it.
 *
 * WHO MAY TAKE IT. A trip is offered to verified responders who are online, a few at a time, and a responder takes
 * one only from an offer. A P2 taken without an offer is a responder assigning themselves a same-day priority,
 * which is refused in the engine's own sentence.
 *
 * Time is epoch milliseconds handed in by the caller, so a test is a clock.
 */
import {
 MINUTE, SECOND, accept, facilityOf, instantOf, isDeclared, isZone, p2Reasons, priorityOf, receivingRoles, refuse, type Result
} from './contract.ts';
import type { MovementInForce } from './settings.ts';

export type TripState = 'requested' | 'accepted' | 'handed-over';
export type Trip = {
 readonly tripRef: string;
 readonly subjectRef: string;
 readonly priorityClass: 'P2' | 'P3';
 readonly priorityReasonCode: string | null;
 readonly prioritySetByRef: string | null;
 readonly pickupWindowStart: number;
 readonly zoneId: string;
 readonly facilityRef: string;
 readonly admissionRef: string | null;
 readonly requestedByRole: string;
 readonly requestedByRef: string | null;
 readonly requestedAt: number;
 readonly offersAtOnce: number;
 readonly tripWindowMinutes: number;
 readonly positionRetentionMinutes: number;
 readonly settingsVersion: number;
 readonly stateCode: TripState;
 readonly responderRef: string | null;
 readonly acceptedAt: number | null;
 readonly handedOverAt: number | null;
 readonly receivingRole: string | null;
};
export type Offer = { readonly tripRef: string; readonly responderRef: string; readonly offeredAt: number; readonly declinedAt: number | null };
export type Responder = { readonly responderRef: string; readonly online: boolean; readonly lastBeatAt: number };

export type TripRequest = {
 readonly tripRef: string;
 readonly subjectRef: unknown;
 readonly priorityClass: unknown;
 readonly pickupWindowStart: unknown;
 readonly zoneId: unknown;
 readonly facilityRef: unknown;
 readonly admissionRef?: unknown;
 readonly priorityReasonCode?: unknown;
 readonly prioritySetByRef?: unknown;
 readonly byRole: string;
 readonly byRef: string | null;
};
export type TripContext = {
 readonly now: number;
 readonly settings: MovementInForce;
 /** Whether Verify last said the caller is cleared in their own role today. Asked only for a P2. */
 readonly callerCleared: boolean;
 readonly admissionKnown: (admissionRef: string) => boolean;
};

export function requestTrip(input: TripRequest, ctx: TripContext): Result<Trip> {
 const priority = priorityOf(input.priorityClass);
 if (priority && !priority.takenByThusoRide) return refuse('p1-refused-no-ambulance-partner');
 if (!priority) return refuse('priority-not-offered');
 let priorityReasonCode: string | null = null;
 let prioritySetByRef: string | null = null;
 if (priority.setBy) {
  const inTheirOwnName = input.byRef !== null && input.prioritySetByRef === input.byRef;
  if (!priority.setBy.includes(input.byRole) || !inTheirOwnName || !ctx.callerCleared) return refuse('p2-not-set-by-a-vetted-clinician');
  if (!isDeclared(p2Reasons, input.priorityReasonCode)) return refuse('p2-without-reason');
  priorityReasonCode = input.priorityReasonCode;
  prioritySetByRef = input.byRef;
 }
 const pickupWindowStart = instantOf(input.pickupWindowStart);
 if (!Number.isFinite(pickupWindowStart) || pickupWindowStart <= ctx.now) return refuse('pickup-window-passed');
 if (!isZone(input.zoneId)) return refuse('zone-not-covered');
 const facility = facilityOf(input.facilityRef);
 if (!facility) return refuse('facility-not-in-directory');
 const admissionRef = typeof input.admissionRef === 'string' ? input.admissionRef : null;
 if (admissionRef !== null && !ctx.admissionKnown(admissionRef)) return refuse('not-found');
 return accept(Object.freeze({
  tripRef: input.tripRef, subjectRef: String(input.subjectRef), priorityClass: priority.id as 'P2' | 'P3', priorityReasonCode, prioritySetByRef,
  pickupWindowStart, zoneId: input.zoneId, facilityRef: facility.ref, admissionRef, requestedByRole: input.byRole, requestedByRef: input.byRef,
  requestedAt: ctx.now, offersAtOnce: ctx.settings.offersAtOnce, tripWindowMinutes: ctx.settings.tripWindowMinutes,
  positionRetentionMinutes: ctx.settings.positionRetentionMinutes, settingsVersion: ctx.settings.settingsVersion,
  stateCode: 'requested', responderRef: null, acceptedAt: null, handedOverAt: null, receivingRole: null
 }));
}

/* The window. It closes at the hand-over, or when the window the trip was requested with runs out from the start
   of its pick-up, whichever is first; a position is kept for the retention the trip was requested with after that,
   and not a moment longer. Both are worked out from the trip alone, never from a setting in force now. */
export const windowRunsOutAt = (trip: Trip): number => trip.pickupWindowStart + trip.tripWindowMinutes * MINUTE;
export const windowClosesAt = (trip: Trip): number => Math.min(windowRunsOutAt(trip), trip.handedOverAt ?? Number.POSITIVE_INFINITY);
export const positionDropAt = (trip: Trip): number => windowClosesAt(trip) + trip.positionRetentionMinutes * MINUTE;

/* Online is a heartbeat that said so, heard within the missed heartbeats in force. A phone that died mid-shift
   stops being offered trips on arithmetic, not on somebody noticing. */
export const isOnline = (responder: Responder, now: number, settings: MovementInForce): boolean =>
 responder.online && now - responder.lastBeatAt <= settings.heartbeatIntervalSeconds * SECOND * settings.offlineAfterMissedBeats;

/** The responders to offer a requested trip to now: cleared and online, never asked before, up to the offers the trip keeps. */
export function offersToMake(trip: Trip, offers: readonly Offer[], candidates: readonly Responder[]): string[] {
 if (trip.stateCode !== 'requested') return [];
 const own = offers.filter(o => o.tripRef === trip.tripRef);
 const room = trip.offersAtOnce - own.filter(o => o.declinedAt === null).length;
 if (room <= 0) return [];
 const asked = new Set(own.map(o => o.responderRef));
 return candidates.filter(c => !asked.has(c.responderRef))
  .sort((a, b) => b.lastBeatAt - a.lastBeatAt || (a.responderRef < b.responderRef ? -1 : 1))
  .slice(0, room).map(c => c.responderRef);
}

export function acceptTrip(trip: Trip | undefined, offer: Offer | undefined, responder: { readonly ref: string; readonly cleared: boolean }, now: number): Result<Trip> {
 if (!responder.cleared) return refuse('not-verified');
 if (!trip) return refuse('trip-not-offered');
 if (trip.stateCode === 'handed-over' || now >= windowRunsOutAt(trip)) return refuse('trip-closed');
 if (trip.stateCode === 'accepted') return trip.responderRef === responder.ref ? accept(trip) : refuse('trip-taken');
 if (!offer || offer.declinedAt !== null) return refuse(trip.priorityClass === 'P2' ? 'self-assigned-p2' : 'trip-not-offered');
 return accept(Object.freeze({ ...trip, stateCode: 'accepted' as const, responderRef: responder.ref, acceptedAt: now }));
}

export function declineTrip(trip: Trip | undefined, offer: Offer | undefined, now: number): Result<Offer> {
 if (!trip || !offer || offer.declinedAt !== null || trip.stateCode !== 'requested') return refuse('trip-not-offered');
 return accept(Object.freeze({ ...offer, declinedAt: now }));
}

export function handOverTrip(trip: Trip | undefined, input: { readonly byRef: string | null; readonly receivingRole: unknown; readonly checklistComplete: unknown }, now: number): Result<Trip> {
 if (!trip || trip.stateCode === 'requested' || trip.responderRef === null || trip.responderRef !== input.byRef) return refuse('trip-not-yours');
 if (trip.stateCode === 'handed-over' || now >= windowClosesAt(trip)) return refuse('trip-closed');
 if (!isDeclared(receivingRoles, input.receivingRole)) return refuse('unnamed-receiver');
 if (input.checklistComplete !== true) return refuse('checklist-not-followed');
 return accept(Object.freeze({ ...trip, stateCode: 'handed-over' as const, handedOverAt: now, receivingRole: input.receivingRole }));
}
