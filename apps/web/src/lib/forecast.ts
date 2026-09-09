import { currentWeek, shareRange, weeks } from './earnings';
import { offeredDays, slots, longDateOf, type OfferedDay } from './scheduling';

/* What a week looks like if she takes the shift.
 *
 * Earnings answers "what have I earned". A nurse deciding on a Tuesday whether to offer her
 * Saturday is asking a different question, and the honest answer to it is a difference rather than
 * a total: R598 means nothing without R598 *more than what*. So every figure this module produces
 * is an amount added to a week that already has an amount in it.
 *
 * Not one rand is written down here, and not one hour either. The hours are the scheduling
 * contract's own nine slots — hourly, with the hour after twelve missing because a nurse eats. The
 * money is the services catalogue's nurse share, the same rows the patient is quoted from. The week
 * a shift lands in is arithmetic on the payout cycle: a Saturday after this week's Sunday is next
 * week's money and pays seven days later, which is the single most useful thing this screen can
 * tell somebody deciding whether to work.
 *
 * WHAT IT REFUSES TO DO. It does not predict. A shift is hours offered, not visits booked, and
 * nothing in this product knows what dispatch will fill — there is no roster, and capabilities.json
 * says so. So the arithmetic is bounded rather than estimated: nothing at one end, every hour at
 * the highest share at the other, and in between the mix she has actually been doing, counted off
 * her own past weeks rather than assumed. A single confident number in the middle of that range
 * would be a forecast in the sense the word deserves to be distrusted. */

/** One visit per hourly slot. The booking offer is hourly chips and a visit's own duration decides
    when it ends, so the hour is the unit a nurse's day is actually sold in — the sixty-minute
    elderly-care visit and the twenty-minute injection both take one of them. */
export const hoursOffered = slots;

/* The mix she has actually been doing, counted rather than assumed. Reversals and corrections carry
   no service and are not visits, so they are not in it. */
const done = weeks.flatMap(week => week.lines).filter(line => line.service);
export const typicalShare = done.reduce((sum, line) => sum + line.amount, 0) / done.length;
export const typicalOver = done.length;

export type Shift = { day: OfferedDay; hours: string[] };
export type Forecast = {
 hours: number;
 /** Nobody is booked into an hour by offering it. This is the end of the range nobody shows. */
 nothing: number;
 lowest: number;
 typical: number;
 highest: number;
 /** Which week the money lands in, and the day it would reach her bank. */
 inThisWeek: boolean;
 pays: string;
 paysText: string;
 endsText: string;
 /** The week total this is a difference *from*. */
 weekSoFar: number;
 weekWithIt: number;
};

/** Seven days on from an ISO date, in ISO. The next payout run, not a second cadence. */
const aWeekOn = (iso: string) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

export function forecast(shift: Shift): Forecast {
 const hours = shift.hours.length;
 /* ISO dates compare lexically, so this is a date comparison rather than a parse. A shift after the
    Sunday this week ends on is next week's money — the cycle's own two facts, not a second rule. */
 const inThisWeek = shift.day.iso <= currentWeek.ends;
 const pays = inThisWeek ? currentWeek.pays : aWeekOn(currentWeek.pays);
 const typical = Math.round(hours * typicalShare);
 return {
  hours,
  nothing: 0,
  lowest: hours * shareRange.low,
  typical,
  highest: hours * shareRange.high,
  inThisWeek,
  pays,
  /* The weekday is asked of the date, and the cycle's own "pays on Wednesday" is not printed beside
     it. That is the scheduling contract's oldest rule and it bites here: the payout weeks in
     earnings.json are day offsets from today, so the day one of them actually falls on moves with
     the day the preview is opened, and a hand-placed "Wednesday" next to a Monday's date is the
     exact defect that rule was written for. */
  paysText: longDateOf(pays),
  endsText: longDateOf(currentWeek.ends),
  weekSoFar: inThisWeek ? currentWeek.total : 0,
  weekWithIt: (inThisWeek ? currentWeek.total : 0) + typical
 };
}

/** The five days the app actually offers, which is what a nurse can actually put hours into. */
export const days = () => offeredDays();
