/* A booking: who asked, for what, with whom, at which offered hour — and the three states it can be in.

   ── What Access does, and where it stops ─────────────────────────────────────────────────────────

   Access takes the request and publishes booking.requested, booking.confirmed and booking.cancelled.
   It does not decide which nurse drives to which door or whether she accepts: Care's engine hears
   booking.requested and answers with offers and appointment events of its own. So nothing here routes
   a nurse, and the acceptance below is a function somebody calls when Care has accepted — in this
   preview, the simulated roster, which says that it did.

   What Care is told is what it needs to offer the visit and no more: the suburb, by its zone id in
   geography.json, never the street or a coordinate, because every subscriber keeps what it hears; and,
   for a nurse asked for by name, who and what happens if she cannot take it.

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
import geography from '../../../../catalog/geography.json' with { type: 'json' };
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
/** What happens to a visit asked of one nurse by name when she cannot take it: it waits for her, or the soonest nurse takes it. */
export type FallbackCode = 'wait' | 'soonest';

export type Slot = {
 /** Opaque to a client. It says which hour, on which day, with whom — and nothing else, and nothing a client can invent. */
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
 /** The zone id in geography.json the visit is in. */
 readonly zoneId: string;
 /** For a nurse asked for by name, what happens if she cannot take it, kept whatever the setting says afterwards. Null for whoever is nearest. */
 readonly namedNurseFallback: FallbackCode | null;
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

/* ---- When a nurse asked for by name cannot take it ---------------------------------------------- */

/* Which rule is in force is Access's setting named-nurse-fallback, handed in by whoever holds the
   history. The rules and their sentences are packages/catalog/booking.json's, and a setting value with no
   rule there throws rather than offering a slot nobody can explain: a booking with no nurse and no
   message is the one thing this setting may never produce. */
type FallbackRule = { readonly setting: string; readonly offersAsap: boolean; readonly asksPatient: boolean; readonly resolvesTo: FallbackCode | null; readonly sentence: string };
const FALLBACK_RULES = contract.person.fallback.rules as readonly FallbackRule[];
const FALLBACK_CODES = contract.person.fallback.choices.map(c => c.id) as FallbackCode[];

export function fallbackRuleOf(setting: string): FallbackRule {
 const rule = FALLBACK_RULES.find(r => r.setting === setting);
 if (!rule || (!rule.asksPatient && !FALLBACK_CODES.includes(rule.resolvesTo!))) throw new Error(`packages/catalog/booking.json has no rule for the named-nurse fallback "${setting}", so no booking may be offered under it.`);
 return rule;
}
/** The answers a patient may give for a named nurse: both when the patient is asked, or the one the setting gives. */
export const fallbacksOffered = (setting: string): FallbackCode[] => {
 const rule = fallbackRuleOf(setting);
 return rule.asksPatient ? [...FALLBACK_CODES] : [rule.resolvesTo!];
};

/* What happens if the nurse asked for by name cannot take the visit, as POST /v1/access/bookings@2's own field
   says it. The answers that may be sent are the setting's in force; an answer left out is the one the setting
   gives — its own, or waiting for her when the patient is asked, because the contract lists waiting first and
   she is who they asked for. For whoever is nearest there is nobody to wait for, so an answer is refused rather
   than kept as an instruction about a nurse nobody named. */
export function fallbackAnswer(setting: string, nurseRef: string | null, sent: string | null | undefined): Outcome<FallbackCode | null> {
 const given = sent === undefined || sent === null || sent === '' ? null : sent;
 if (nurseRef === null) return given === null ? accept(null) : routeRefusal(ROUTES.book, 'fallback-not-offered');
 const offered = fallbacksOffered(setting);
 if (given === null) return accept(fallbackRuleOf(setting).asksPatient ? FALLBACK_CODES[0]! : offered[0]!);
 return offered.includes(given as FallbackCode) ? accept(given as FallbackCode) : routeRefusal(ROUTES.book, 'fallback-not-offered');
}

/* A slot reference says which hour, on which day, with whom — and nothing else. Until 15 September it also
   carried what happens if a nurse asked for by name cannot take the visit, because the frozen booking route had
   no field for the answer and a reference was the one string that went through; that put an instruction where
   nobody reading the contract could see it. POST /v1/access/bookings@2 carries the answer in namedNurseFallback,
   so a reference with anything after the nurse was never offered and claims nothing. */
const slotRefOf = (date: string | null, start: string | null, nurseRef: string | null) =>
 `${date === null ? 'asap' : `${date}T${start}`}~${nurseRef === null ? 'nearest' : nurseRef}`;

export type OfferInput = {
 readonly now: Date; readonly serviceId: string; readonly kind: Kind; readonly choice: PersonChoice; readonly holds: readonly Hold[];
 /** Access's setting named-nurse-fallback, as it stands when the slots are offered. */
 readonly namedNurseFallback: string;
};

/**
 * Every slot that may be booked, and only those.
 *
 * As soon as possible is whoever is nearest, or a nurse asked for by name when the fallback in force can
 * send somebody else if she cannot take it. A rule that waits for her takes it away: waiting for one
 * nurse is not as soon as possible, and pretending otherwise would promise her at an hour nobody offered.
 * A named nurse's hours are the day's hours less the ones already held against her.
 */
export function offeredSlots({ now, serviceId, kind, choice, holds, namedNurseFallback }: OfferInput): Slot[] {
 const service = serviceById(serviceId);
 if (!service) return [];
 const nurseRef = choice.kind === 'nearest' ? null : choice.nurseRef;
 if (kind === 'asap') {
  if (nurseRef !== null && !fallbackRuleOf(namedNurseFallback).offersAsap) return [];
  return [{ slotRef: slotRefOf(null, null, nurseRef), kind: 'asap', date: null, start: null, nurseRef }];
 }
 /* Asked of the rule for a named nurse even when as soon as possible is not on the table, so a setting value
    with no rule offers no hour either. */
 if (nurseRef !== null) fallbackRuleOf(namedNurseFallback);
 return offeredDays(now).flatMap(date => scheduling.offer.slots
  .filter(start => fitsTheShift(start, service.duration))
  .filter(start => nurseRef === null || !holds.some(h => h.nurseRef === nurseRef && h.date === date && overlaps(start, service.duration, h)))
  .map(start => ({ slotRef: slotRefOf(date, start, nurseRef), kind: 'scheduled' as const, date, start, nurseRef })));
}

/** What a slot reference claims, read back: an hour or as soon as possible, and whoever is nearest or one nurse. A reference in any other shape — one with anything after the nurse among them — claims nothing. */
export function readSlotRef(slotRef: string): { kind: Kind; date: string | null; start: string | null; choice: PersonChoice } | null {
 const match = slotRef.match(/^(?:asap|(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}))~(?:(nearest)|([^~]+))$/);
 if (!match) return null;
 const kind: Kind = match[1] ? 'scheduled' : 'asap';
 return { kind, date: match[1] ?? null, start: match[2] ?? null, choice: match[3] ? { kind: 'nearest' } : { kind: 'named', nurseRef: match[4]! } };
}

/* ---- The three acts ----------------------------------------------------------------------------- */

export type BookingRequest = {
 readonly idempotencyKey: string;
 readonly subjectRef: string;
 readonly serviceId: string;
 readonly mode: 'home';
 readonly slotRef: string;
 /** The zone id in geography.json the visit is in. One geography.json does not hold is a suburb dispatch does not reach. */
 readonly zoneId: string;
 /** The route's namedNurseFallback, as sent: wait, soonest, or nothing for the setting's own answer. */
 readonly namedNurseFallback?: string | null;
 readonly actorRole: string;
};
export type BookingContext = {
 readonly now: Date;
 readonly candidates: readonly Candidate[];
 /** Hours held against named nurses that this ledger does not hold, such as a screen's visits already booked. */
 readonly held?: readonly Hold[];
 /** Access's setting named-nurse-fallback as it stands when the booking is asked for. The booking keeps the answer afterwards. */
 readonly namedNurseFallback: string;
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
 /* Where the visit is, by its zone id and nothing finer. A zone geography.json does not hold is a suburb
    dispatch does not reach, and it is refused here rather than handed to Care to refuse later. */
 const zone = geography.zones.find(z => z.id === request.zoneId);
 if (!service || service.phase !== 1 || !zone) return routeRefusal(ROUTES.book, 'service-not-here');
 const claimed = readSlotRef(request.slotRef);
 if (!claimed) return routeRefusal(ROUTES.book, 'slot-not-offered');
 const refusedPerson = refuseChoice(context.candidates, claimed.choice);
 if (refusedPerson) return refusedPerson;
 const offered = offeredSlots({ now: context.now, serviceId: service.id, kind: claimed.kind, choice: claimed.choice, holds: [...holdsOf(ledger), ...(context.held ?? [])], namedNurseFallback: context.namedNurseFallback });
 const slot = offered.find(s => s.slotRef === request.slotRef);
 if (!slot) return routeRefusal(ROUTES.book, 'slot-not-offered');
 const answered = fallbackAnswer(context.namedNurseFallback, slot.nurseRef, request.namedNurseFallback);
 if (answered.refused) return answered;

 const at = nowInstant(context.now);
 /* An as-soon-as-possible request has no hour to name, and booking.requested requires one. The moment
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
  zoneId: zone.id,
  namedNurseFallback: answered.value,
  requestedFor,
  state: 'requested',
  scheduledFor: null,
  cancellation: null,
  history: [{ state: 'requested', at }]
 };
 const event: AccessEvent = {
  type: 'booking.requested', version: 2, actorRole: request.actorRole, subjectRef: request.subjectRef, occurredAt: at,
  payload: {
   bookingRef: booking.bookingRef, serviceId: booking.serviceId, mode: booking.mode, requestedFor, zoneId: booking.zoneId,
   ...(slot.nurseRef !== null && answered.value !== null ? { namedClinicianRef: slot.nurseRef, namedNurseFallback: answered.value } : {})
  }
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
  type: 'booking.confirmed', version: 2, actorRole: 'system', subjectRef: found.subjectRef, occurredAt: at,
  payload: { bookingRef, scheduledFor: found.requestedFor, serviceId: found.serviceId }
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
