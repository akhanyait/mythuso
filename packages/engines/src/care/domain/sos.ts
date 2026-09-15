/* An SOS heard from Safety, as Care acts on it: an urgent visit registered for a door that offers one, offered
 * through the same offer desk and the same gates as any other visit, and withdrawn when the person stands it down.
 *
 * WHICH SOS OPENS AN OFFER is the door's, and nothing else's: packages/catalog/sos.json outcomes says which door
 * offers a visit, and sos.raised@2 carries the door. Not the plan the person holds, not who pressed, and not the
 * area: the area is where the nurse is measured from, never a reason to offer or not.
 *
 * THE GATES ARE NOT LIFTED FOR URGENCY. The visit is the catalogue's `sos` service, scheduled for the moment it was
 * heard, and the offer desk asks scope, supervision, a place to measure from and a current badge exactly as it does
 * for a booked visit. It also refuses a service the catalogue places in a later phase than Care's seed phase, and
 * that is what happens on this runtime today: packages/catalog/services.json gives `sos` phase two and
 * packages/catalog/care.json seedPhase is one, so Care hears the SOS, registers the urgent visit, is refused
 * service-not-offered, and keeps that answer beside the SOS rather than offering a visit the seed scope does not
 * sell. Whether Thuso SOS joins the seed phase is somebody's decision, not this file's.
 *
 * A STAND-DOWN WITHDRAWS WHAT NOBODY HAS ACCEPTED. An open offer for a stood-down SOS is withdrawn, so no nurse
 * accepts a visit nobody needs and the tick never passes it on. A visit a nurse has already accepted is left for a
 * person: packages/catalog/sos.json standDown says she is told not to travel, and no event carries that to her yet. */
import sosContract from '../../../../catalog/sos.json' with { type: 'json' };
import type { LatLng } from './geo.ts';
import type { AppointmentToFill } from './matching.ts';
import type { Offer } from './offers.ts';

/** The catalogue's Thuso SOS urgent visit, the row packages/catalog/services.json prices and times. */
export const SOS_SERVICE_ID = 'sos';

/** Whether a door sends anybody, as packages/catalog/sos.json outcomes says. */
export const opensAnUrgentVisit = (routedTo: unknown): boolean => sosContract.outcomes.some(o => o.id === routedTo && o.offersVisit === true);

/** The urgent visit an SOS opens, one per SOS however often the bus delivers it. */
export const urgentAppointmentRef = (sosRef: string): string => `apt-sos-${sosRef}`;

export function urgentVisitFor(heard: { readonly sosRef: string; readonly subjectRef: string; readonly zone: LatLng | null }, now: Date): AppointmentToFill {
 return {
  appointmentRef: urgentAppointmentRef(heard.sosRef), subjectRef: heard.subjectRef, serviceId: SOS_SERVICE_ID, zone: heard.zone,
  scheduledFor: now.toISOString(), namedClinicianRef: null, previousClinicianRefs: [], bookingRef: null, namedNurseFallback: null
 };
}

/** The offers a stand-down withdraws: every one still open for the SOS's urgent visit, and none a nurse accepted. */
export const withdrawnOnStandDown = (offers: readonly Offer[], sosRef: string): Offer[] =>
 offers.filter(offer => offer.appointmentRef === urgentAppointmentRef(sosRef) && offer.state === 'open');
