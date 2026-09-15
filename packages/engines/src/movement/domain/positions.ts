/* A responder's heartbeat and a trip's position: kept only during a trip the responder accepted, one at a time,
 * rounded to a suburb, and dropped when the trip's window closes.
 *
 * NEVER BETWEEN TRIPS. A heartbeat says whether a responder is online, and that is all it says between trips. A
 * position sent without a trip is refused rather than dropped, because a position filtered after it arrived was
 * still collected; the phone is told, in the contract's sentence, to stop sending one.
 *
 * NEVER AFTER THE WINDOW. A position sent after the hand-over, or after the window the trip was requested with has
 * run out, is refused. A read after the window and the trip's retention is refused too, by the same arithmetic,
 * whether or not the engine's tick has dropped the row yet — so a slow tick never becomes a longer retention.
 *
 * NEVER A TRACK. One position per trip, replaced by the next; nothing here can hold two.
 */
import { accept, refuse, roundCoordinate, type Result } from './contract.ts';
import { positionDropAt, windowClosesAt, type Trip } from './trips.ts';

export type Position = { readonly tripRef: string; readonly lat: number; readonly lng: number; readonly reportedAt: number };

export type Beat = { readonly online: unknown; readonly tripRef?: unknown; readonly lat?: unknown; readonly lng?: unknown };

export function heartbeat(input: Beat, ctx: { readonly cleared: boolean; readonly trip: Trip | undefined; readonly byRef: string | null; readonly now: number }): Result<{ readonly position: Position | null }> {
 if (!ctx.cleared) return refuse('not-verified');
 const hasLat = typeof input.lat === 'number', hasLng = typeof input.lng === 'number';
 if (hasLat !== hasLng) return refuse('half-a-position');
 if (input.tripRef === undefined) return hasLat ? refuse('position-without-a-trip') : accept({ position: null });
 const trip = ctx.trip;
 if (!trip || trip.stateCode === 'requested' || trip.responderRef === null || trip.responderRef !== ctx.byRef) return refuse('trip-not-yours');
 if (trip.stateCode === 'handed-over' || ctx.now >= windowClosesAt(trip)) return refuse('position-after-the-window');
 if (!hasLat) return accept({ position: null });
 return accept({ position: Object.freeze({ tripRef: trip.tripRef, lat: roundCoordinate(input.lat as number), lng: roundCoordinate(input.lng as number), reportedAt: ctx.now }) });
}

/** A trip's position, to a patient whose trip it is or to the desk, only until the window and its retention have passed. */
export function readPosition(trip: Trip | undefined, caller: { readonly role: string; readonly ref: string | null }, position: Position | undefined, now: number): Result<Position & { readonly windowClosesAt: number }> {
 if (!trip || (caller.role === 'patient' && caller.ref !== trip.subjectRef)) return refuse('trip-not-found');
 if (now >= positionDropAt(trip)) return refuse('position-after-the-window');
 if (!position) return refuse('no-position-yet');
 return accept({ ...position, windowClosesAt: windowClosesAt(trip) });
}

/** Whether a trip's position must be dropped now. The engine's tick asks it of every trip that holds one. */
export const mustDrop = (trip: Trip, now: number): boolean => now >= positionDropAt(trip);
