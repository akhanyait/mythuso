import contract from '../../../../packages/catalog/scheduling.json';
import type { Service } from './catalog';
/* When a visit happens.
 *
 * Every platform used to carry a hand-typed strip of five days beginning "Fri 12 Sep". It was
 * wrong the day after it was typed; by the time this was written the chip said Friday and the date
 * beside it was a Saturday. Nothing here is typed. The five days are computed from today in
 * Africa/Johannesburg, and a weekday is asked of its own date.
 *
 * The other half of the defect was that a booking threw away what it had collected: the confirmed
 * visit kept a time and lost the date entirely, and ended an hour after it started whatever the
 * service catalogue said its duration was. A Visit here carries the whole choice, and its end is
 * arithmetic on the service. */
export const timezone = contract.timezone;
export const slots = contract.offer.slots;
export const kinds = contract.kinds;
export const labels = contract.labels;
export const rules = contract.rules;
export const kindById = (id: string) => kinds.find(k => k.id === id)!;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;

/** A day the app is offering, identified by its ISO date rather than by its position in a list. */
export type OfferedDay = { iso: string; weekday: string; day: string; month: string };

const parts = (date: Date, options: Intl.DateTimeFormatOptions) =>
 new Intl.DateTimeFormat('en-ZA', { timeZone: timezone, ...options }).format(date);

/* The ISO date of a moment *in Johannesburg*, not in whatever zone the device is set to. Booking a
   visit for "tomorrow" from a laptop still on European time must not offer yesterday. */
export const isoIn = (date: Date) =>
 new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export function offeredDays(from: Date = new Date()): OfferedDay[] {
 const first = contract.offer.firstDayOffset;
 return Array.from({ length: contract.offer.days }, (_, index) => {
  const date = new Date(from.getTime() + (first + index) * 86_400_000);
  return {
   iso: isoIn(date),
   weekday: parts(date, { weekday: 'short' }),
   day: parts(date, { day: 'numeric' }),
   month: parts(date, { month: 'short' })
  };
 });
}

/* The moment a slot actually is, with the offset asked of the timezone rather than assumed.
   South Africa has one offset and does not move it, which is exactly the circumstance in which a
   hard-coded +02:00 is never noticed — until a device set to another zone shifts a nurse's arrival
   by two hours for the person waiting at home. `new Date('2026-03-04T09:00')` would read the
   device's own zone, which is the same defect with fewer characters. */
export const offsetIn = (at: Date = new Date()): string => {
 const named = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'longOffset' })
  .formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
 return named.replace('GMT', '') || '+00:00';
};
export const instantOf = (iso: string, hhmm: string, at: Date = new Date()) =>
 new Date(`${iso}T${hhmm}:00${offsetIn(at)}`);

/** The weekday a date actually falls on. Asked of the date; never stored beside it. */
export const weekdayOf = (iso: string) => parts(new Date(`${iso}T12:00:00Z`), { weekday: 'short' });
export const longDateOf = (iso: string) =>
 parts(new Date(`${iso}T12:00:00Z`), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDateOf = (iso: string) =>
 parts(new Date(`${iso}T12:00:00Z`), { day: 'numeric', month: 'short' });

/** The end of a visit is its own duration after the start, from the catalogue — never a flat hour. */
export function endTime(start: string, minutes: number): string {
 const [hour, minute] = start.split(':').map(Number);
 const total = hour * 60 + minute + minutes;
 return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* Everything a person chose, carried whole. A booking that reaches the confirmation without its
   date is a confirmation of something nobody agreed to, which is what this type exists to prevent:
   there is no way to construct one without saying when, for whom and where. */
export type Visit = {
 service: Service;
 person: string;
 address: string;
 /** 'scheduled' carries a date and a slot. 'asap' carries neither, and says so. */
 kind: 'scheduled' | 'asap';
 date?: string;
 start?: string;
 payment: string;
 /* "Held for an interpreter" is the third status and it is not a confirmation. It is the word in
    packages/catalog/interpreting.json, checked against it, because a visit the account required an
    interpreter for and has not got one is not dispatched — it waits. */
 status: 'Confirmed' | 'Looking for a nurse' | 'Held for an interpreter';
 /** Set when the account records the SASL requirement: which interpreter, or the fact that nobody
     within the offered window is free. Resolved in lib/interpreting.ts, never typed on a screen. */
 interpreter?: { mode: string; name?: string; iso?: string; slot?: string };
 /** The nurse asked for by name at booking. Absent means whoever is nearest, which is an answer rather than a gap. */
 nurse?: { id: string; name: string };
 /** The booking behind the visit as packages/engines' Access domain answered it: where it stands and when each state was reached. */
 booking?: {
  bookingRef: string; asap: boolean; history: readonly { state: 'requested' | 'confirmed' | 'cancelled'; at: string }[];
  /** What happens if the nurse asked for by name cannot take it, as the booking keeps it. Null for whoever is nearest. */
  namedNurseFallback: 'wait' | 'soonest' | null;
  /** What Care's matching tells the patient about the nurse they named, in packages/catalog/care.json's words. Absent when there is nothing to tell. */
  careTold?: string;
 };
};

export const visitEnds = (visit: Visit) => (visit.start ? endTime(visit.start, visit.service.duration) : undefined);
/** One line describing when, in the words the kind deserves. */
export function whenText(visit: Visit): string {
 if (visit.kind === 'asap' || !visit.date || !visit.start) return labels.asapPending;
 return `${longDateOf(visit.date)} · ${visit.start}–${visitEnds(visit)}`;
}
export function shortWhenText(visit: Visit): string {
 if (visit.kind === 'asap' || !visit.date || !visit.start) return labels.asapPending;
 return `${weekdayOf(visit.date)} ${shortDateOf(visit.date)} · ${visit.start}`;
}
