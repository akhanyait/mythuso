/* A booking: who asked, for what, with whom, at which offered hour — and the three states it can be in.

   ── What Access does, and where it stops ─────────────────────────────────────────────────────────

   Access takes the request and publishes booking.requested, booking.confirmed and booking.cancelled.
   It does not decide which nurse drives to which door or whether she accepts: Care's engine hears
   booking.requested and answers with offers and appointment events of its own. So nothing here routes
   a nurse, and the acceptance below is a function somebody calls when Care has accepted — in this
   preview, the simulated roster, which says that it did.

   ── The four refusals that are the point of it ───────────────────────────────────────────────────

   A booking is made only against an hour that was offered. The offer is worked out here from
   packages/catalog/scheduling.json's days and hours, the shift arithmetic in roster.json and the
   hours already held — so a slot reference that was never offered, or an hour a named nurse has
   already been booked for, is refused rather than trusted because a client sent it.

   A nurse is offered only while her badge is current. Continuity is a preference and never an
   override: a patient asking for the nurse they saw last time does not get somebody whose clearance
   lapsed last night. Whether a badge is current is the vetting gate's answer, which each platform
   works out from its own register and hands in; this file refuses on it and never guesses it.

   Nothing moves backwards. A cancelled booking is not confirmed afterwards, and a visit that has
   started is not cancelled from a booking screen — cancellation.json's in-progress state refuses it.

   The same idempotency key twice is the same act once: no second booking, no second event. */
import cancellation from '../../../../catalog/cancellation.json' with { type: 'json' };
import contract from '../../../../catalog/booking.json' with { type: 'json' };
import roster from '../../../../catalog/roster.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import { ROUTES, accept, bookingRefusal, instantOf, isoIn, nowInstant, routeRefusal, simulatedRef, type AccessEvent, type Outcome } from './contract.ts';

export { instantOf, nowInstant };

export type BookingState = 'requested' | 'confirmed' | 'cancelled';
export type Kind = 'scheduled' | 'asap';
export type WindowCode = 'before-window' | 'inside-window' | 'in-progress';

/** A nurse as the platform's own vetting register sees her today. */
export type Candidate = {
 readonly nurseRef: string;
 readonly name: string;
 /** Her working suburb as the roster writes it, which is not always one dispatch reaches. */
 readonly zone: string;
 /** Whether packages/catalog/geography.json covers that suburb. */
 readonly covered: boolean;
 /** The take-visit gate's answer today. */
 readonly badgeCurrent: boolean;
 /** The sentence the roster refuses her with, or null when she is offered. */
 readonly notOfferedBecause: string | null;
 /** Straight-line distance between suburb centres, for ordering only. Null when she is outside coverage. */
 readonly distanceKm: number | null;
};

export type PersonChoice = { readonly kind: 'nearest' } | { readonly kind: 'previous' | 'named'; readonly nurseRef: string };

export type Slot = {
 /** Opaque to a client. It says which hour, on which day, with whom — and nothing a client can invent. */
 readonly slotRef: string;
 readonly kind: Kind;
 readonly date: string | null;
 readonly start: string | null;
 readonly nurseRef: string | null;
};

export type Cancellation = { readonly windowCode: Exclude<WindowCode, 'in-progress'>; readonly reasonCode: string; readonly byRole: string; readonly at: string };

export type Booking = {
 readonly bookingRef: string;
 readonly idempotencyKey: string;
 readonly subjectRef: string;
 readonly serviceId: string;
 readonly mode: 'home';
 readonly slot: Slot;
 readonly requestedFor: string;
 readonly state: BookingState;
 readonly scheduledFor: string | null;
 readonly cancellation: Cancellation | null;
 readonly history: readonly { readonly state: BookingState; readonly at: string }[];
};

export type Ledger = { readonly bookings: readonly Booking[] };
export const emptyLedger: Ledger = { bookings: [] };

/* ---- Time, in the one timezone the product names ------------------------------------------------ */

const DAY = 86_400_000;
const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h! * 60 + m!; };

/** The days on offer, from tomorrow, as ISO dates in Johannesburg. */
export const offeredDays = (now: Date): string[] =>
 Array.from({ length: scheduling.offer.days }, (_, i) => isoIn(new Date(now.getTime() + (scheduling.offer.firstDayOffset + i) * DAY)));

/* A shift opens half an hour before the first slot and closes half an hour after the last slot plus
   the longest visit the catalogue sells — roster.json's arithmetic, not a pair of times. An hour whose
   visit would run past the close is not offered, so that nobody books a nurse into the minutes after
   she has gone home. With today's catalogue every hour fits, and the check is here for the day a
   longer visit or a later slot makes that untrue. */
const longestVisit = Math.max(...services.map(s => s.duration));
const firstSlot = minutesOf(scheduling.offer.slots[0]!);
const lastSlot = minutesOf(scheduling.offer.slots[scheduling.offer.slots.length - 1]!);
const shiftOpens = firstSlot - roster.shift.startsBeforeFirstSlotMinutes;
const shiftCloses = lastSlot + longestVisit + roster.shift.endsAfterLastVisitMinutes;
export const fitsTheShift = (start: string, minutes: number) => minutesOf(start) >= shiftOpens && minutesOf(start) + minutes <= shiftCloses;

/* ---- Who may be asked for ----------------------------------------------------------------------- */

export type PersonOptions = {
 readonly offered: readonly Candidate[];
 readonly notOffered: readonly Candidate[];
 /** The nurse this person saw last, and whether she may be asked for today. Null when there was nobody. */
 readonly previous: { readonly candidate: Candidate; readonly offered: boolean } | null;
};

const mayBeOffered = (c: Candidate) => c.covered && c.badgeCurrent && c.notOfferedBecause === null;

/** Everybody who may be asked for, nearest first, and everybody who may not, with the reason beside them. */
export function personOptions(candidates: readonly Candidate[], previousNurseRef: string | null): PersonOptions {
 const offered = candidates.filter(mayBeOffered)
  .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.nurseRef.localeCompare(b.nurseRef));
 const notOffered = candidates.filter(c => !mayBeOffered(c));
 const seen = previousNurseRef === null ? undefined : candidates.find(c => c.nurseRef === previousNurseRef);
 return { offered, notOffered, previous: seen ? { candidate: seen, offered: mayBeOffered(seen) } : null };
}

/** Null when the choice may be booked against; otherwise the refusal a screen shows instead of her name. */
export function refuseChoice(candidates: readonly Candidate[], choice: PersonChoice) {
 if (choice.kind === 'nearest') return null;
 const nurse = candidates.find(c => c.nurseRef === choice.nurseRef);
 if (!nurse) return routeRefusal(ROUTES.book, 'slot-not-offered');
 if (!nurse.badgeCurrent) return bookingRefusal('nurse-badge-not-current');
 return mayBeOffered(nurse) ? null : routeRefusal(ROUTES.book, 'slot-not-offered');
}

/* ---- The offer ---------------------------------------------------------------------------------- */

export type Hold = { readonly nurseRef: string; readonly date: string; readonly start: string; readonly minutes: number };

/** The hours already held against a named nurse. A nearest-nurse booking holds nobody until Care assigns one. */
export const holdsOf = (ledger: Ledger): Hold[] => ledger.bookings
 .filter(b => b.state !== 'cancelled' && b.slot.nurseRef !== null && b.slot.date !== null && b.slot.start !== null)
 .map(b => ({ nurseRef: b.slot.nurseRef!, date: b.slot.date!, start: b.slot.start!, minutes: serviceById(b.serviceId)?.duration ?? longestVisit }));

const overlaps = (start: string, minutes: number, hold: Hold) =>
 minutesOf(start) < minutesOf(hold.start) + hold.minutes && minutesOf(hold.start) < minutesOf(start) + minutes;

export const serviceById = (id: string) => services.find(s => s.id === id);
const slotRefOf = (date: string, start: string, nurseRef: string | null) => `${date}T${start}~${nurseRef ?? 'nearest'}`;
const ASAP_REF = 'asap~nearest';

export type OfferInput = { readonly now: Date; readonly serviceId: string; readonly kind: Kind; readonly choice: PersonChoice; readonly holds: readonly Hold[] };

/**
 * Every slot that may be booked, and only those.
 *
 * As soon as possible belongs to whoever is nearest: asking for one nurse and for the first person
 * free are two different requests, and pretending otherwise would promise a named nurse at an hour
 * nobody offered. A named nurse's hours are the day's hours less the ones already held against her.
 */
export function offeredSlots({ now, serviceId, kind, choice, holds }: OfferInput): Slot[] {
 const service = serviceById(serviceId);
 if (!service) return [];
 if (kind === 'asap') return choice.kind === 'nearest' ? [{ slotRef: ASAP_REF, kind: 'asap', date: null, start: null, nurseRef: null }] : [];
 const nurseRef = choice.kind === 'nearest' ? null : choice.nurseRef;
 return offeredDays(now).flatMap(date => scheduling.offer.slots
  .filter(start => fitsTheShift(start, service.duration))
  .filter(start => nurseRef === null || !holds.some(h => h.nurseRef === nurseRef && h.date === date && overlaps(start, service.duration, h)))
  .map(start => ({ slotRef: slotRefOf(date, start, nurseRef), kind: 'scheduled' as const, date, start, nurseRef })));
}

/** What a slot reference claims, read back. A reference in any other shape claims nothing. */
export function readSlotRef(slotRef: string): { kind: Kind; date: string | null; start: string | null; choice: PersonChoice } | null {
 if (slotRef === ASAP_REF) return { kind: 'asap', date: null, start: null, choice: { kind: 'nearest' } };
 const match = slotRef.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})~(.+)$/);
 if (!match) return null;
 const who = match[3]!;
 return { kind: 'scheduled', date: match[1]!, start: match[2]!, choice: who === 'nearest' ? { kind: 'nearest' } : { kind: 'named', nurseRef: who } };
}

/* ---- The three acts ----------------------------------------------------------------------------- */

export type BookingRequest = {
 readonly idempotencyKey: string;
 readonly subjectRef: string;
 readonly serviceId: string;
 readonly mode: 'home';
 readonly slotRef: string;
 readonly actorRole: string;
};
export type BookingContext = {
 readonly now: Date;
 readonly candidates: readonly Candidate[];
 /** Whether packages/catalog/geography.json covers the suburb the visit would be in. */
 readonly visitCovered: boolean;
 /** Hours held against named nurses that this ledger does not hold, such as a screen's visits already booked. */
 readonly held?: readonly Hold[];
};

const replace = (ledger: Ledger, next: Booking): Ledger => ({ bookings: ledger.bookings.map(b => (b.bookingRef === next.bookingRef ? next : b)) });

export function requestBooking(ledger: Ledger, request: BookingRequest, context: BookingContext): Outcome<{ ledger: Ledger; booking: Booking }> {
 if (!request.idempotencyKey) return routeRefusal(ROUTES.book, 'idempotency-key-required');
 if (!request.subjectRef || !request.serviceId || !request.slotRef || !request.mode) return routeRefusal(ROUTES.book, 'required-field-missing');
 /* The same act once. The key is the caller's, so it is looked up with the subject beside it: one
    family's retry must never return another family's booking. */
 const again = ledger.bookings.find(b => b.idempotencyKey === request.idempotencyKey && b.subjectRef === request.subjectRef);
 if (again) return accept({ ledger, booking: again });

 const service = serviceById(request.serviceId);
 if (!service || service.phase !== 1 || !context.visitCovered) return routeRefusal(ROUTES.book, 'service-not-here');
 const claimed = readSlotRef(request.slotRef);
 if (!claimed) return routeRefusal(ROUTES.book, 'slot-not-offered');
 const refusedPerson = refuseChoice(context.candidates, claimed.choice);
 if (refusedPerson) return refusedPerson;
 const offered = offeredSlots({ now: context.now, serviceId: service.id, kind: claimed.kind, choice: claimed.choice, holds: [...holdsOf(ledger), ...(context.held ?? [])] });
 const slot = offered.find(s => s.slotRef === request.slotRef);
 if (!slot) return routeRefusal(ROUTES.book, 'slot-not-offered');

 const at = nowInstant(context.now);
 /* An as-soon-as-possible request has no hour to name, and booking.requested@1 requires one. The moment
    it was asked is the only true instant there is; a slot picked on the patient's behalf would be the
    invented slot this file exists to refuse. Recorded as a contract question for the lead. */
 const requestedFor = slot.kind === 'asap' ? at : instantOf(slot.date!, slot.start!, context.now);
 const booking: Booking = {
  bookingRef: simulatedRef('BKG', `${request.subjectRef}|${request.idempotencyKey}`),
  idempotencyKey: request.idempotencyKey,
  subjectRef: request.subjectRef,
  serviceId: service.id,
  mode: request.mode,
  slot,
  requestedFor,
  state: 'requested',
  scheduledFor: null,
  cancellation: null,
  history: [{ state: 'requested', at }]
 };
 const event: AccessEvent = {
  type: 'booking.requested', version: 1, actorRole: request.actorRole, subjectRef: request.subjectRef, occurredAt: at,
  payload: { bookingRef: booking.bookingRef, serviceId: booking.serviceId, mode: booking.mode, requestedFor }
 };
 return accept({ ledger: { bookings: [...ledger.bookings, booking] }, booking }, [event]);
}

/** Care accepted. In this preview the simulated roster calls this, and the screen says so. */
export function confirmBooking(ledger: Ledger, bookingRef: string, now: Date): Outcome<{ ledger: Ledger; booking: Booking }> {
 const found = ledger.bookings.find(b => b.bookingRef === bookingRef);
 if (!found) return routeRefusal(ROUTES.read, 'booking-not-found');
 if (found.state === 'cancelled') return bookingRefusal('confirm-after-cancel');
 if (found.state === 'confirmed') return accept({ ledger, booking: found });
 if (found.slot.kind === 'asap') return bookingRefusal('confirm-without-a-time');
 const at = nowInstant(now);
 const booking: Booking = { ...found, state: 'confirmed', scheduledFor: found.requestedFor, history: [...found.history, { state: 'confirmed', at }] };
 const event: AccessEvent = {
  type: 'booking.confirmed', version: 1, actorRole: 'system', subjectRef: found.subjectRef, occurredAt: at,
  payload: { bookingRef, scheduledFor: found.requestedFor }
 };
 return accept({ ledger: replace(ledger, booking), booking }, [event]);
}

/** Which side of cancellation.json's window an instant is on, at a given moment. */
export function windowOf(heldFor: string | null, now: Date): WindowCode {
 if (heldFor === null) return 'before-window';
 const hoursAway = (Date.parse(heldFor) - now.getTime()) / 3_600_000;
 if (hoursAway <= 0) return 'in-progress';
 return hoursAway < cancellation.window.hoursBefore ? 'inside-window' : 'before-window';
}

export type CancelRequest = {
 readonly idempotencyKey: string;
 readonly bookingRef: string;
 readonly subjectRef: string;
 readonly reasonCode: string;
 readonly actorRole: string;
};

export function cancelBooking(ledger: Ledger, request: CancelRequest, now: Date): Outcome<{ ledger: Ledger; booking: Booking }> {
 if (!request.idempotencyKey) return routeRefusal(ROUTES.cancel, 'idempotency-key-required');
 const found = ledger.bookings.find(b => b.bookingRef === request.bookingRef && b.subjectRef === request.subjectRef);
 if (!found) return routeRefusal(ROUTES.cancel, 'booking-not-found');
 if (found.state === 'cancelled') return accept({ ledger, booking: found });
 if (!cancellation.reasons.some(r => r.id === request.reasonCode)) return routeRefusal(ROUTES.cancel, 'reason-not-listed');
 /* The window is worked out from the hour held, or the hour asked for when nothing is held yet, at the
    moment the call arrives — and recorded, because it is only true while the clock has not moved. */
 const heldFor = found.scheduledFor ?? (found.slot.kind === 'scheduled' ? found.requestedFor : null);
 const windowCode = windowOf(heldFor, now);
 if (windowCode === 'in-progress') return routeRefusal(ROUTES.cancel, 'cancel-after-arrival');
 const at = nowInstant(now);
 const booking: Booking = {
  ...found, state: 'cancelled',
  cancellation: { windowCode, reasonCode: request.reasonCode, byRole: request.actorRole, at },
  history: [...found.history, { state: 'cancelled', at }]
 };
 const event: AccessEvent = {
  type: 'booking.cancelled', version: 1, actorRole: request.actorRole, subjectRef: found.subjectRef, occurredAt: at,
  payload: { bookingRef: found.bookingRef, cancelledByRole: request.actorRole, reasonCode: request.reasonCode }
 };
 return accept({ ledger: replace(ledger, booking), booking }, [event]);
}

/** GET /v1/access/bookings/{bookingRef}: never says whether a booking exists for somebody else. */
export function readBooking(ledger: Ledger, bookingRef: string, subjectRef: string): Outcome<{ bookingRef: string; stateCode: BookingState; scheduledFor?: string }> {
 const found = ledger.bookings.find(b => b.bookingRef === bookingRef && b.subjectRef === subjectRef);
 if (!found) return routeRefusal(ROUTES.read, 'booking-not-found');
 return accept(found.scheduledFor ? { bookingRef, stateCode: found.state, scheduledFor: found.scheduledFor } : { bookingRef, stateCode: found.state });
}

/* ---- State from events -------------------------------------------------------------------------- */

const allowed = new Set(contract.transitions.map(t => `${t.from ?? ''}>${t.to}`));
export const mayMove = (from: BookingState | null, to: BookingState) => allowed.has(`${from ?? ''}>${to}`);

/** Where a booking stands, folded from its own events in order. An arrow the contract does not draw is ignored. */
export function stateFromEvents(events: readonly AccessEvent[], bookingRef: string): BookingState | null {
 let state: BookingState | null = null;
 for (const event of events) {
  if (!('bookingRef' in event.payload) || event.payload.bookingRef !== bookingRef) continue;
  const to: BookingState | null = event.type === 'booking.requested' ? 'requested' : event.type === 'booking.confirmed' ? 'confirmed' : event.type === 'booking.cancelled' ? 'cancelled' : null;
  if (to && mayMove(state, to)) state = to;
 }
 return state;
}

export const stateWords = (id: BookingState) => contract.states.find(s => s.id === id)!;
