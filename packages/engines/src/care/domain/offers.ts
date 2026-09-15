/* Offers: made to one eligible clinician at a time, answered or lapsed, and passed on.
 *
 * AN OFFER IS PERSONAL AND IT EXPIRES. It names one clinician, and only she may accept or decline
 * it; anybody else asking is told it was made to somebody else, whether or not it exists, so an
 * offer reference guessed from a neighbour's cannot confirm there is a visit to be had. It lapses at
 * the time appointment.offered carried, and a lapsed offer cannot be accepted however close to the
 * line the tap was — the patient's visit has already gone to the next person, and two nurses holding
 * one door is the failure an expiry exists to prevent.
 *
 * THE EXPIRY IS THE ONE IN FORCE WHEN THE OFFER IS MADE, AND THE OFFER KEEPS IT. How long an offer lasts
 * is the setting offer-expiry in packages/catalog/care.json, which an admin changes. The desk is handed a
 * reader for the settings in force, asks it once as it makes an offer, matches with the scope settings'
 * roles it answered, and writes the instant the offer lapses, those roles and the settings version onto
 * the offer; nothing reads a setting again for that offer, and every lapse is decided by the instant the
 * offer carries. So a change reaches the next offer and never one a nurse is already reading: a locum
 * offered an injection before an admin narrows it to registered nurses may still accept what she was
 * offered, and the next offer goes to whoever the narrower list allows. The desk holds no default of its
 * own to fall back on.
 *
 * A DECLINE AND A LAPSE CASCADE. Either one asks the matcher again with everybody already asked
 * left out, and offers the visit to whoever is first now. Where that happens is the caller's choice:
 * the web preview passes it on at once, and the engine runtime passes it on from its tick, because
 * the decline route emits nothing of its own (packages/catalog/apis/care.json) and the next offer's
 * appointment.offered belongs to an act of offering, not to the act of saying no. When nobody eligible
 * is left the answer is the refusal that sends the visit to a dispatcher; it is never an offer to
 * somebody a gate withheld.
 *
 * THE SAME KEY TWICE IS THE SAME ACT ONCE. Offering, accepting and declining are dispatch writes, so
 * each carries the caller's idempotency key and a repeat returns the first answer with no events —
 * a retry on a bad connection must not become a second nurse driving to the same house.
 *
 * Nothing here reads a clock or a store. Every act is handed `now`, and the desk's state goes in
 * through the constructor and comes out through `state()`, which is what lets the runtime keep it in
 * its own SQLite store and roll it back with a refusal. */
import { answer, type Answer, type CareEvent } from './outcome.ts';
import { purposeOf, refuse, ROUTES, type CareContract } from './contract.ts';
import { addMinutes } from './clock.ts';
import { match, type AppointmentToFill, type Candidate, type Continuity, type Withheld } from './matching.ts';
import type { CareInForce } from './settings.ts';
import type { TrustReader } from './trust.ts';

export type OfferState = 'open' | 'accepted' | 'declined' | 'lapsed';
export type Offer = {
 readonly offerRef: string;
 readonly appointmentRef: string;
 readonly serviceId: string;
 readonly clinicianRef: string;
 readonly offeredAt: string;
 readonly expiresAt: string;
 /** The Care settings version the expiry and the roles were read under. An offer made before a change says so. */
 readonly settingsVersion: number;
 /** The roles the service could be offered to when this offer was made. The offer keeps them: a later
     change to who may be offered the service reaches the next offer, never this one. */
 readonly roles: readonly string[];
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
export type OfferBook = { readonly appointments: readonly AppointmentToFill[]; readonly offers: readonly Offer[]; readonly bookings: readonly Booking[] };

export type Made = { offerRef: string; offerExpiresAt: string };
export type Declined = { readonly declined: true; readonly next: Answer<Made> | null };
export type PassedOn = { readonly offerRef: string; readonly next: Answer<Made> };

export class OfferDesk {
 #contract: CareContract;
 #trust: TrustReader;
 #candidates: () => readonly Candidate[];
 #settings: () => CareInForce;
 #appointments = new Map<string, AppointmentToFill>();
 #offers = new Map<string, Offer>();
 #asked = new Map<string, Set<string>>();
 #keys = new Map<string, Answer<unknown>>();
 #bookings = new Map<string, Booking>();
 #withheld = new Map<string, readonly Withheld[]>();
 #sequence = 0;

 constructor(options: { contract: CareContract; trust: TrustReader; candidates: () => readonly Candidate[]; settings: () => CareInForce; book?: OfferBook }) {
  this.#contract = options.contract;
  this.#trust = options.trust;
  this.#candidates = options.candidates;
  this.#settings = options.settings;
  for (const a of options.book?.appointments ?? []) this.#appointments.set(a.appointmentRef, a);
  for (const o of options.book?.offers ?? []) {
   this.#offers.set(o.offerRef, { ...o });
   this.#asked.set(o.appointmentRef, (this.#asked.get(o.appointmentRef) ?? new Set<string>()).add(o.clinicianRef));
  }
  for (const b of options.book?.bookings ?? []) this.#bookings.set(b.appointmentRef, b);
  this.#sequence = this.#offers.size;
 }

 state(): OfferBook {
  return { appointments: [...this.#appointments.values()], offers: [...this.#offers.values()].map(o => ({ ...o })), bookings: [...this.#bookings.values()] };
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
  this.#keys.set(request.idempotencyKey, result);
  return result;
 }

 decline(request: { idempotencyKey: string; offerRef: string }, caller: Caller, now: Date, options: { passOn?: boolean } = {}): Answer<Declined> {
  const seen = this.#keys.get(request.idempotencyKey) as Answer<Declined> | undefined;
  if (seen) return seen.ok ? answer(seen.value) : seen;
  const offer = this.#offers.get(request.offerRef);
  let result: Answer<Declined>;
  if (!offer || offer.clinicianRef !== caller.clinicianRef) result = refuse(this.#contract, ROUTES.decline, 'not-your-offer');
  else if (offer.state !== 'open' || this.#lapsedAt(offer, now)) result = refuse(this.#contract, ROUTES.decline, 'offer-expired');
  else {
   offer.state = 'declined';
   result = answer({ declined: true as const, next: options.passOn === false ? null : this.#make(offer.appointmentRef, offer.serviceId, now) });
  }
  this.#keys.set(request.idempotencyKey, result);
  return result;
 }

 /** Every open offer past its expiry lapses and is passed on. */
 lapse(now: Date): readonly PassedOn[] {
  const passed: PassedOn[] = [];
  for (const offer of [...this.#offers.values()]) {
   if (offer.state !== 'open' || !this.#lapsedAt(offer, now)) continue;
   offer.state = 'lapsed';
   passed.push({ offerRef: offer.offerRef, next: this.#make(offer.appointmentRef, offer.serviceId, now) });
  }
  return passed;
 }

 /** Every unbooked visit whose newest offer was declined and not yet passed on. */
 passOnDeclined(now: Date): readonly PassedOn[] {
  const passed: PassedOn[] = [];
  for (const appointment of this.#appointments.values()) {
   if (this.#bookings.has(appointment.appointmentRef)) continue;
   const newest = this.offersFor(appointment.appointmentRef).at(-1);
   if (newest?.state !== 'declined') continue;
   passed.push({ offerRef: newest.offerRef, next: this.#make(appointment.appointmentRef, appointment.serviceId, now) });
  }
  return passed;
 }

 offerRef(ref: string): Offer | null { return this.#offers.get(ref) ?? null; }
 /** The newest offer made to one clinician, in whatever state it is now. */
 latestFor(clinicianRef: string): Offer | null {
  return [...this.#offers.values()].filter(o => o.clinicianRef === clinicianRef).at(-1) ?? null;
 }
 offersFor(appointmentRef: string): readonly Offer[] { return [...this.#offers.values()].filter(o => o.appointmentRef === appointmentRef); }
 appointment(appointmentRef: string): AppointmentToFill | null { return this.#appointments.get(appointmentRef) ?? null; }
 booking(appointmentRef: string): Booking | null { return this.#bookings.get(appointmentRef) ?? null; }
 /** Who the last match withheld for this appointment, and why. A dispatcher's view; never a nurse's. */
 withheldFor(appointmentRef: string): readonly Withheld[] { return this.#withheld.get(appointmentRef) ?? []; }

 /* Decided by the instant the offer carries, never by the setting in force now. */
 #lapsedAt = (offer: Offer, now: Date) => now.getTime() >= Date.parse(offer.expiresAt);

 #make(appointmentRef: string, serviceId: string, now: Date): Answer<Made> {
  const appointment = this.#appointments.get(appointmentRef);
  if (!appointment || appointment.serviceId !== serviceId) return refuse(this.#contract, ROUTES.offer, 'required-field-missing');
  if (this.#bookings.has(appointmentRef)) return refuse(this.#contract, ROUTES.offer, 'no-eligible-clinician');
  /* One open offer per visit. A second one while the first is still running is two nurses asked to
     hold the same door, and whichever of them answers second has been lied to. */
  const open = this.offersFor(appointmentRef).find(o => o.state === 'open' && !this.#lapsedAt(o, now));
  if (open) return answer({ offerRef: open.offerRef, offerExpiresAt: open.expiresAt });
  const asked = this.#asked.get(appointmentRef) ?? new Set<string>();
  /* The settings in force, read once for this offer: who it may go to and how long it lasts come from the
     same version, and the offer keeps both. */
  const inForce = this.#settings();
  const found = match(appointment, this.#candidates(), this.#trust, this.#contract, inForce.roles, asked);
  if (found.kind !== 'matched') return refuse(this.#contract, ROUTES.offer, found.kind);
  this.#withheld.set(appointmentRef, found.withheld);
  const first = found.ranked[0];
  if (!first) {
   /* Nobody ranked. When nobody has been asked yet and the badge is what withheld somebody whose scope
      and place would otherwise have let her be asked, the contract's Trust Score sentence is the true
      one; otherwise the visit has run out of people and goes to a dispatcher. */
   const onlyTrust = asked.size === 0 && found.withheld.some(w => w.reason === 'no-current-trust-score');
   return refuse(this.#contract, ROUTES.offer, onlyTrust ? 'no-current-trust-score' : 'no-eligible-clinician');
  }
  this.#sequence += 1;
  const offer: Offer = {
   offerRef: `ofr-${appointmentRef}-${this.#sequence}`,
   appointmentRef, serviceId,
   clinicianRef: first.candidate.clinicianRef,
   offeredAt: now.toISOString(),
   expiresAt: addMinutes(now, inForce.offerExpiryMinutes).toISOString(),
   settingsVersion: inForce.settingsVersion,
   roles: found.roles,
   continuity: first.continuity,
   distanceKm: first.distanceKm,
   state: 'open'
  };
  this.#offers.set(offer.offerRef, offer);
  this.#asked.set(appointmentRef, asked.add(offer.clinicianRef));
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
