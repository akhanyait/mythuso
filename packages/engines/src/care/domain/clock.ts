/* The one question Care asks of a clock: is this instant on the same day as that one, in the
 * timezone the contract names.
 *
 * Asked of the named zone rather than of UTC or of the machine. A visit at 00:30 on a Tuesday in
 * Johannesburg is a Monday in UTC, and a nurse whose visit code was refused as "not today" at half
 * past midnight would be standing at the right door on the right day being told otherwise. */

export const dayIn = (at: Date, timezone: string): string =>
 new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export const sameDay = (a: Date, b: Date, timezone: string): boolean => dayIn(a, timezone) === dayIn(b, timezone);

export const addMinutes = (at: Date, minutes: number): Date => new Date(at.getTime() + minutes * 60_000);
