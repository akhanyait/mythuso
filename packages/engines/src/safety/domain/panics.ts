/* Panic: the desk sees where a nurse is, for a window that always ends.
 *
 * A nurse, locum, responder or courier presses panic. panic.raised goes on the bus carrying who
 * pressed it by role and when sharing ends — never the position, which the event contract names as
 * the field it does not carry. The position goes to the desk and nowhere else, and only while the
 * window is open.
 *
 * SHARING ENDS AT WHICHEVER COMES FIRST: the window running out, or the desk resolving the panic.
 * That is one function, sharingEndsAt, and every read of a position goes through it — so there is
 * no screen or route that can be persuaded to show a position after either.
 *
 * NOTHING IS KEPT. A panic holds the latest position and no other. When sharing stops the position
 * is gone: resolve() drops it, sweep() drops it once the window passes, and positionFor() refuses
 * after the window whether or not anybody swept. geography.json's no-history-drawn, applied to the
 * one feature that most wants a trail.
 *
 * NOBODY IS SENT WITHOUT A PERSON. There is no dispatch here at all. The desk acknowledges and
 * resolves, and an engine asking to do either is refused with the route's own sentence: §13 allows
 * dispatch without a human for an unresponsive patient or an SOS, and a nurse's panic is neither.
 *
 * The window does not stretch. A nurse who still needs help presses again and gets a new panic with
 * a new window, which leaves the desk a record of both rather than one share quietly made longer.
 */
import { MINUTE, clockOf, done, instant, outcomes, panicWindowMinutes, positionDecimals, refuse, type Refused, type Result } from './rules.ts';

export type Position = { readonly lat: number; readonly lng: number; readonly at: number };
export type DeskActor =
 | { readonly kind: 'person'; readonly role: 'ops-desk'; readonly ref: string }
 | { readonly kind: 'engine'; readonly engine: string };
export type Panic = {
 readonly panicRef: string;
 readonly raisedByRole: string;
 readonly nurseRef: string;
 readonly appointmentRef: string | null;
 readonly raisedAt: number;
 readonly locationShareEndsAt: number;
 readonly acknowledged: { readonly at: number; readonly by: string } | null;
 readonly resolved: { readonly at: number; readonly by: string; readonly outcomeId: string } | null;
 /** The latest position, while sharing. Never a list. */
 readonly position: Position | null;
};
export type PanicStanding = 'raised' | 'acknowledged' | 'resolved';

export function raisePanic(input: {
 readonly panicRef: string; readonly raisedByRole: string; readonly nurseRef: string;
 readonly appointmentRef?: string | null; readonly locationShareMinutes?: number | null;
}, now: number): Result<Panic> {
 const minutes = input.locationShareMinutes;
 if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return refuse('share-without-end');
 if (minutes !== panicWindowMinutes) return refuse('window-not-the-declared-one');
 const locationShareEndsAt = now + minutes * MINUTE;
 return done({
  panicRef: input.panicRef, raisedByRole: input.raisedByRole, nurseRef: input.nurseRef, appointmentRef: input.appointmentRef ?? null,
  raisedAt: now, locationShareEndsAt, acknowledged: null, resolved: null, position: null
 }, [{ type: 'panic.raised', version: 1, payload: { panicRef: input.panicRef, raisedByRole: input.raisedByRole, locationShareEndsAt: instant(locationShareEndsAt) } }]);
}

export const standingOf = (panic: Panic): PanicStanding => panic.resolved ? 'resolved' : panic.acknowledged ? 'acknowledged' : 'raised';
export const sharingEndsAt = (panic: Panic) => Math.min(panic.locationShareEndsAt, panic.resolved?.at ?? Number.POSITIVE_INFINITY);
export const isSharing = (panic: Panic, now: number) => now < sharingEndsAt(panic);
const afterTheWindow = (panic: Panic): Refused => refuse('position-after-the-window', { ended: clockOf(sharingEndsAt(panic)) });

/* To the declared precision and no finer. A preview has no business being precise about where a
   person is standing, and a live feed that arrives with nine decimals is not an instruction to show
   nine. */
const rounded = (value: number) => Number(value.toFixed(positionDecimals));

/** One position from the feed. Kept only while sharing, and only as the latest. */
export function receivePosition(panic: Panic, sample: { readonly lat: number; readonly lng: number }, now: number): Result<Panic> {
 if (!isSharing(panic, now)) return afterTheWindow(panic);
 return done({ ...panic, position: { lat: rounded(sample.lat), lng: rounded(sample.lng), at: now } });
}

/** What the desk may see now: the position, nothing yet, or the refusal that says when sharing ended. */
export function positionFor(panic: Panic, now: number): Result<Position | null> {
 if (!isSharing(panic, now)) return afterTheWindow(panic);
 return done(panic.position);
}

/** Forget the position once sharing has stopped. Safe to call on every tick. */
export const sweep = (panic: Panic, now: number): Panic =>
 panic.position && !isSharing(panic, now) ? { ...panic, position: null } : panic;

/** There is no way to make a window longer. This exists so the refusal has a caller and a test. */
export const stretchWindow = (): Refused => refuse('window-does-not-stretch');

const isDeskPerson = (actor: DeskActor): actor is Extract<DeskActor, { kind: 'person' }> => actor.kind === 'person' && actor.role === 'ops-desk';

export function acknowledge(panic: Panic, actor: DeskActor, now: number): Result<Panic> {
 if (!isDeskPerson(actor)) return refuse('dispatch-from-a-panic-without-a-person');
 if (panic.resolved) return refuse('panic-already-resolved');
 if (panic.acknowledged) return done(panic);
 return done({ ...panic, acknowledged: { at: now, by: actor.ref } });
}

export function resolve(panic: Panic, request: { readonly outcomeId?: string | null; readonly actor: DeskActor }, now: number): Result<Panic> {
 if (!isDeskPerson(request.actor)) return refuse('dispatch-from-a-panic-without-a-person');
 if (panic.resolved) return refuse('panic-already-resolved');
 const outcome = outcomes.find(entry => entry.id === request.outcomeId);
 if (!outcome) return refuse('panic-resolved-without-outcome');
 if (!panic.acknowledged) return refuse('panic-resolved-before-acknowledged');
 /* Resolving stops sharing in the same instant, so the position goes with it rather than waiting for
    a sweep that might be an hour away. */
 return done({ ...panic, resolved: { at: now, by: request.actor.ref, outcomeId: outcome.id }, position: null });
}
