/* A timer on every visit.
 *
 * It starts when the visit does — appointment.in_progress, which Care publishes only once the visit
 * code has matched — and it is due at the service's booked duration plus the declared grace. The
 * nurse can say she is safe, extend with a reason, or check out; the visit being completed and
 * signed checks her out too. When the deadline passes with none of those, the timer emits
 * checkin.overdue once for that deadline. Safety only emits: raising the alert, routing it and
 * escalating it is Core's (events.json, `_alertMeans`).
 *
 * THE OVERDUE IS AN EPISODE, NOT A FLAG. A timer that goes overdue and is then extended is no
 * longer overdue, but the desk was told, and "she answered" is not the same as "somebody at the desk
 * closed it". So the episode keeps when it began, who at the desk picked it up, when the nurse
 * answered and the reason it was closed. A later deadline passing starts a new episode.
 *
 * THREE THINGS THIS WILL NOT DO, each with the contract's sentence:
 *  - time a visit by a number sent with it. The duration is the service's (expected-minutes-not-the-service).
 *  - extend without a reason, in a step the desk did not offer, or past the ceiling. An endless
 *    extension is a timer that never fires, and the ceiling's sentence is the route's own.
 *  - let the desk close an overdue without a reason, or with a reason that is not true of the timer.
 *
 * A check-in ("I am safe") never moves the deadline. If it did, pressing it every fifteen minutes
 * would be an extension with no reason and no ceiling — the exact thing extend refuses.
 */
import { MINUTE, done, extensionReasons, extensionSteps, graceMinutes, instant, maxExtensionMinutes, refuse, serviceMinutes, silenceReasons, type Result } from './rules.ts';

export type DeskHand = { readonly at: number; readonly by: string };
export type OverdueEpisode = {
 /** The deadline that passed. */
 readonly since: number;
 readonly acknowledged: DeskHand | null;
 /** When the nurse checked in, extended or checked out after it began. */
 readonly answeredAt: number | null;
 readonly silenced: (DeskHand & { readonly reasonId: string }) | null;
};
export type Extension = { readonly at: number; readonly minutes: number; readonly reasonId: string };
export type Timer = {
 readonly checkinRef: string;
 readonly appointmentRef: string;
 readonly serviceId: string;
 readonly nurseRef: string;
 readonly startedAt: number;
 readonly expectedMinutes: number;
 readonly graceMinutes: number;
 readonly dueAt: number;
 readonly extensions: readonly Extension[];
 readonly checkIns: readonly number[];
 readonly overdue: OverdueEpisode | null;
 /** The deadline checkin.overdue was last emitted for, so a deadline is announced once. */
 readonly emittedFor: number | null;
 readonly closedAt: number | null;
 readonly closedBy: 'nurse' | 'visit-completed' | null;
};
export type TimerStanding = 'running' | 'overdue' | 'closed';

export type InProgress = { readonly appointmentRef: string; readonly visitCodeMatched: boolean };

/* appointment.in_progress@1 does not carry the service, so the caller supplies it from the visit.
   That is a gap in the event, reported rather than papered over: see the Wave 3 report. */
export function startTimer(input: {
 readonly checkinRef: string; readonly event: InProgress; readonly serviceId: string; readonly nurseRef: string;
 /** Accepted only to be refused when it disagrees with the catalogue: the v1 route still sends it. */
 readonly expectedMinutes?: number;
}, now: number): Result<Timer> {
 if (input.event.visitCodeMatched !== true) return refuse('timer-without-a-matched-code');
 const minutes = serviceMinutes(input.serviceId);
 if (minutes === undefined) return refuse('timer-for-an-unknown-service');
 if (input.expectedMinutes !== undefined && input.expectedMinutes !== minutes) return refuse('expected-minutes-not-the-service');
 return done({
  checkinRef: input.checkinRef, appointmentRef: input.event.appointmentRef, serviceId: input.serviceId, nurseRef: input.nurseRef,
  startedAt: now, expectedMinutes: minutes, graceMinutes, dueAt: now + (minutes + graceMinutes) * MINUTE,
  extensions: [], checkIns: [], overdue: null, emittedFor: null, closedAt: null, closedBy: null
 });
}

export const standingOf = (timer: Timer, now: number): TimerStanding =>
 timer.closedAt !== null ? 'closed' : now >= timer.dueAt ? 'overdue' : 'running';
export const extensionUsed = (timer: Timer) => timer.extensions.reduce((total, extension) => total + extension.minutes, 0);
export const extensionLeft = (timer: Timer) => maxExtensionMinutes - extensionUsed(timer);
/** The steps still on offer: the ones that would not take the visit past the ceiling. */
export const stepsOffered = (timer: Timer) => extensionSteps.filter(step => step <= extensionLeft(timer));
/** Whole minutes until the deadline, never negative. */
export const minutesLeft = (timer: Timer, now: number) => Math.max(0, Math.ceil((timer.dueAt - now) / MINUTE));

/** The clock moving. Emits checkin.overdue once per deadline, and only for an open timer. */
export function tick(timer: Timer, now: number): Result<Timer> {
 if (standingOf(timer, now) !== 'overdue' || timer.emittedFor === timer.dueAt) return done(timer);
 const next: Timer = { ...timer, emittedFor: timer.dueAt, overdue: { since: timer.dueAt, acknowledged: null, answeredAt: null, silenced: null } };
 /* Exactly the payload events.json declares for checkin.overdue@1, and nothing else — in particular
    no lastKnownLocation, which the contract names as the field this event never carries. */
 return done(next, [{ type: 'checkin.overdue', version: 1, payload: { checkinRef: timer.checkinRef, appointmentRef: timer.appointmentRef, overdueSince: instant(timer.dueAt) } }]);
}

/* A nurse answering an open episode marks it answered. It does not close it: only the desk does
   that, with a reason, because the desk was the one paged. */
const answered = (timer: Timer, now: number): OverdueEpisode | null =>
 timer.overdue && timer.overdue.answeredAt === null && timer.overdue.silenced === null ? { ...timer.overdue, answeredAt: now } : timer.overdue;

export function checkIn(timer: Timer, now: number): Result<Timer> {
 if (timer.closedAt !== null) return refuse('checkin-after-close');
 return done({ ...timer, checkIns: [...timer.checkIns, now], overdue: answered(timer, now) });
}

export function extend(timer: Timer, request: { readonly minutes: number; readonly reasonId?: string | null }, now: number): Result<Timer> {
 if (timer.closedAt !== null) return refuse('checkin-after-close');
 if (!request.reasonId || !extensionReasons.some(reason => reason.id === request.reasonId)) return refuse('extension-without-reason');
 if (!extensionSteps.includes(request.minutes)) return refuse('extension-not-offered');
 if (extensionUsed(timer) + request.minutes > maxExtensionMinutes) return refuse('extension-limit');
 /* From now when she is already past it. Fifteen more minutes counted from a deadline twenty
    minutes ago is a deadline that has already passed, and the desk would be paged again at once. */
 const dueAt = Math.max(timer.dueAt, now) + request.minutes * MINUTE;
 return done({ ...timer, dueAt, extensions: [...timer.extensions, { at: now, minutes: request.minutes, reasonId: request.reasonId }], overdue: answered(timer, now) });
}

export function close(timer: Timer, by: 'nurse' | 'visit-completed', now: number): Result<Timer> {
 if (timer.closedAt !== null) return refuse('already-closed');
 return done({ ...timer, closedAt: now, closedBy: by, overdue: answered(timer, now) });
}

/** appointment.completed: the visit is finished and signed, so nobody is left in the house to time. */
export const completeVisit = (timer: Timer, now: number): Result<Timer> =>
 timer.closedAt !== null ? done(timer) : close(timer, 'visit-completed', now);

export function acknowledgeOverdue(timer: Timer, by: string, now: number): Result<Timer> {
 if (!timer.overdue || timer.overdue.silenced) return refuse('nothing-to-silence');
 if (timer.overdue.acknowledged) return done(timer);
 return done({ ...timer, overdue: { ...timer.overdue, acknowledged: { at: now, by } } });
}

export function silenceOverdue(timer: Timer, request: { readonly reasonId?: string | null; readonly by: string }, now: number): Result<Timer> {
 if (!timer.overdue || timer.overdue.silenced) return refuse('nothing-to-silence');
 const reason = silenceReasons.find(entry => entry.id === request.reasonId);
 if (!reason) return refuse('overdue-silenced-without-reason');
 if (!timer.overdue.acknowledged) return refuse('overdue-acknowledged-first');
 if (reason.needsNurseAnswer && timer.overdue.answeredAt === null) return refuse('silence-reason-untrue');
 return done({ ...timer, overdue: { ...timer.overdue, silenced: { at: now, by: request.by, reasonId: reason.id } } });
}
