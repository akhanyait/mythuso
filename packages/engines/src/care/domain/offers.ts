/* Offers: made to one eligible clinician at a time, answered or lapsed, and passed on.
 *
 * AN OFFER IS PERSONAL AND IT EXPIRES. It names one clinician, and only she may accept or decline
 * it; anybody else asking is told it was made to somebody else, whether or not it exists, so an
 * offer reference guessed from a neighbour's cannot confirm there is a visit to be had. It lapses at
 * the time appointment.offered carried, and a lapsed offer cannot be accepted however close to the
 * line the tap was — the patient's visit has already gone to the next person, and two nurses holding
 * one door is the failure an expiry exists to prevent.
 *
 * A DECLINE AND A LAPSE CASCADE. Either one asks the matcher again with everybody already asked
 * left out, and offers the visit to whoever is first now. The next offer is made through the offers
 * route, which is the route that emits appointment.offered — decline emits nothing of its own, as
 * packages/catalog/apis/care.json says. When nobody eligible is left the answer is the refusal that
 * sends the visit to a dispatcher; it is never an offer to somebody a gate withheld.
 *
 * THE SAME KEY TWICE IS THE SAME ACT ONCE. Offering, accepting and declining are dispatch writes, so
 * each carries the caller's idempotency key and a repeat returns the first answer with no events —
 * a retry on a bad connection must not become a second nurse driving to the same house.
 *
 * Nothing here reads a clock. Every act is handed `now`, which is what lets the lapse be tested at
 * the minute it happens rather than by waiting for it. */
import { answer, type Answer, type CareEvent } from './outcome.ts';
import { purposeOf, refuse, ROUTES, type CareContract } from './contract.ts';
import { addMinutes } from './clock.ts';
import { match, type AppointmentToFill, type Candidate, type Continuity, type Withheld } from './matching.ts';
import type { TrustReader } from './trust.ts';

export type OfferState = 'open' | 'accepted' | 'declined' | 'lapsed';
export type Offer = {
 readonly offerRef: string;
 readonly appointmentRef: string;
 readonly serviceId: string;
 readonly clinicianRef: string;
 readonly offeredAt: string;
 readonly expiresAt: string;
 readonly continuity: Continuity;
 readonly distanceKm: number;
 state: OfferState;
};
export type Booking = {
 readonly appointmentRef: string;
 readonly subjectRef: string;
 readonly serviceId: string;
 readonly clinicianRef: string;
 readonly scheduledFor: string;
};
export type Caller = { readonly clinicianRef: string };

type Made = { offerRef: string; offerExpiresAt: string };
export type Cascade = { readonly declined: true; readonly next: Answer<Made> };

export class OfferDesk {
 #contract: CareContract;
 #trust: TrustReader;
 #candidates: () => readonly Candidate[];
 #appointments = new Map<string, AppointmentToFill>();
 #offers = new Map<string, Offer>();
 #asked = new Map<string, Set<string>>();
 #keys = new Map<string, Answer<unknown>>();
 #bookings = new Map<string, Booking>();
 #withheld = new Map<string, readonly Withheld[]>();
 #sequence = 0;

 constructor(options: { contract: CareContract; trust: TrustReader; candidates: () => readonly Candidate[] }) {
  this.#contract = options.contract;
  this.#trust = options.trust;
  this.#candidates = options.candidates;
 }

 /** The visit to be filled, as the booking that asked for it described it. */
 register(appointment: AppointmentToFill): void {
  if (!this.#appointments.has(appointment.appointmentRef)) this.#appointments.set(appointment.appointmentRef, appointment);
 }

 offer(request: { idempotencyKey: string; appointmentRef: string; serviceId: string }, now: Date): Answer<Made> {
  const seen = this.#keys.get(request.idempotencyKey) as Answer<Made> | undefined;
  if (seen) return seen.ok ? answer(seen.value) : seen;
  const result = this.#make(request.appointmentRef, request.serviceId, now);
  this.#keys.set(request.idempotencyKey, result);
  return result;
 }

 accept(request: { idempotencyKey: string; offerRef: string }, caller: Caller, now: Date): Answer<{ appointmentRef: string; scheduledFor: string }> {
  const seen = this.#keys.get(request.idempotencyKey) as Answer<{ appointmentRef: string; scheduledFor: string }> | undefined;
  if (seen) return seen.ok ? answer(seen.value) : seen;
  const result = this.#accept(request.offerRef, caller, now);
  /* A refusal for lapsing is not remembered against the key: the same key after a later offer is a
     different question. Everything else is. */
  if (result.ok || result.id !== 'offer-expired') this.#keys.set(request.idempotencyKey, result);
  return result;
 }

 decline(request: { idempotencyKey: string; offerRef: string }, caller: Caller, now: Date): Answer<Cascade> {
  const seen = this.#keys.get(request.idempotencyKey) as Answer<Cascade> | undefined;
  if (seen) return seen.ok ? answer(seen.value) : seen;
  const offer = this.#offers.get(request.offerRef);
  let result: Answer<Cascade>;
  if (!offer || offer.clinicianRef !== caller.clinicianRef) result = refuse(this.#contract, ROUTES.decline, 'not-your-offer');
  else if (offer.state !== 'open' || this.#lapsedAt(offer, now)) result = refuse(this.#contract, ROUTES.decline, 'offer-expired');
  else {
   offer.state = 'declined';
   result = answer({ declined: true as const, next: this.#make(offer.appointmentRef, offer.serviceId, now) });
  }
  this.#keys.set(request.idempotencyKey, result);
  return result;
 }

 /** Every open offer past its expiry lapses, and each one is passed on. */
 lapse(now: Date): readonly { offerRef: string; next: Answer<Made> }[] {
  const lapsed: { offerRef: string; next: Answer<Made> }[] = [];
  for (const offer of [...this.#offers.values()]) {
   if (offer.state !== 'open' || !this.#lapsedAt(offer, now)) continue;
   offer.state = 'lapsed';
   lapsed.push({ offerRef: offer.offerRef, next: this.#make(offer.appointmentRef, offer.serviceId, now) });
  }
  return lapsed;
 }

 offerRef(ref: string): Offer | null { return this.#offers.get(ref) ?? null; }
 /** The newest offer made to one clinician, in whatever state it is now. */
 latestFor(clinicianRef: string): Offer | null {
  return [...this.#offers.values()].filter(o => o.clinicianRef === clinicianRef).at(-1) ?? null;
 }
 offersFor(appointmentRef: string): readonly Offer[] { return [...this.#offers.values()].filter(o => o.appointmentRef === appointmentRef); }
 booking(appointmentRef: string): Booking | null { return this.#bookings.get(appointmentRef) ?? null; }
 /** Who the last match withheld for this appointment, and why. A dispatcher's view; never a nurse's. */
 withheldFor(appointmentRef: string): readonly Withheld[] { return this.#withheld.get(appointmentRef) ?? []; }

 #lapsedAt = (offer: Offer, now: Date) => now.getTime() >= Date.parse(offer.expiresAt);

 #make(appointmentRef: string, serviceId: string, now: Date): Answer<Made> {
  const appointment = this.#appointments.get(appointmentRef);
  if (!appointment || appointment.serviceId !== serviceId) return refuse(this.#contract, ROUTES.offer, 'required-field-missing');
  if (this.#bookings.has(appointmentRef)) return refuse(this.#contract, ROUTES.offer, 'no-eligible-clinician');
  const asked = this.#asked.get(appointmentRef) ?? new Set<string>();
  const found = match(appointment, this.#candidates(), this.#trust, this.#contract, asked);
  if (found.kind === 'service-not-offered') return refuse(this.#contract, ROUTES.offer, 'service-not-offered');
  if (found.kind === 'carer-without-rn') return refuse(this.#contract, ROUTES.offer, 'carer-without-rn');
  this.#withheld.set(appointmentRef, found.withheld);
  const first = found.ranked[0];
  if (!first) {
   /* Nobody ranked. If the only thing standing between this visit and every otherwise-eligible
      candidate is the badge, the contract's sentence for that is the true one; otherwise the visit
      has simply run out of people and goes to a dispatcher. */
   const onlyTrust = found.withheld.length > 0 && asked.size === 0 && found.withheld.every(w => w.reason === 'no-current-trust-score');
   return refuse(this.#contract, ROUTES.offer, onlyTrust ? 'no-current-trust-score' : 'no-eligible-clinician');
  }
  this.#sequence += 1;
  const offer: Offer = {
   offerRef: `ofr-${appointmentRef}-${this.#sequence}`,
   appointmentRef, serviceId,
   clinicianRef: first.candidate.clinicianRef,
   offeredAt: now.toISOString(),
   expiresAt: addMinutes(now, this.#contract.offerExpiresAfterMinutes).toISOString(),
   continuity: first.continuity,
   distanceKm: first.distanceKm,
   state: 'open'
  };
  this.#offers.set(offer.offerRef, offer);
  asked.add(offer.clinicianRef);
  this.#asked.set(appointmentRef, asked);
  /* appointment.offered carries who and until when, and never where the patient is: the suburb is
     released to the nurse who accepts, not to everybody who was asked. */
  const event: CareEvent = {
   type: 'appointment.offered', version: 1,
   subjectRef: appointment.subjectRef, actorRole: 'system', purposeOfUse: purposeOf(this.#contract, ROUTES.offer),
   payload: { appointmentRef, clinicianRef: offer.clinicianRef, offerExpiresAt: offer.expiresAt }
  };
  return answer({ offerRef: offer.offerRef, offerExpiresAt: offer.expiresAt }, [event]);
 }

 #accept(offerRef: string, caller: Caller, now: Date): Answer<{ appointmentRef: string; scheduledFor: string }> {
  const offer = this.#offers.get(offerRef);
  if (!offer || offer.clinicianRef !== caller.clinicianRef) return refuse(this.#contract, ROUTES.accept, 'not-your-offer');
  if (offer.state === 'accepted') {
   const held = this.#bookings.get(offer.appointmentRef)!;
   return answer({ appointmentRef: held.appointmentRef, scheduledFor: held.scheduledFor });
  }
  if (offer.state !== 'open' || this.#lapsedAt(offer, now)) return refuse(this.#contract, ROUTES.accept, 'offer-expired');
  const appointment = this.#appointments.get(offer.appointmentRef)!;
  offer.state = 'accepted';
  const booking: Booking = {
   appointmentRef: appointment.appointmentRef, subjectRef: appointment.subjectRef,
   serviceId: appointment.serviceId, clinicianRef: offer.clinicianRef, scheduledFor: appointment.scheduledFor
  };
  this.#bookings.set(appointment.appointmentRef, booking);
  const event: CareEvent = {
   type: 'appointment.booked', version: 1,
   subjectRef: appointment.subjectRef, actorRole: 'nurse', purposeOfUse: purposeOf(this.#contract, ROUTES.accept),
   payload: { appointmentRef: appointment.appointmentRef, clinicianRef: offer.clinicianRef, scheduledFor: appointment.scheduledFor }
  };
  return answer({ appointmentRef: booking.appointmentRef, scheduledFor: booking.scheduledFor }, [event]);
 }
}
