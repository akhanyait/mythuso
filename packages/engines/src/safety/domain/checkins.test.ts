/* Visit timers on a simulated clock: start, extend, overdue, close, and the desk closing an overdue.
   Every expected minute is read from the contracts, so a changed grace or duration moves the test
   with it rather than making it lie. A timer is started with the defaults in force; what happens to one
   when an admin changes a setting is settings.test.ts's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINUTE, extensionReasons, serviceMinutes } from './rules.ts';
import { defaultTimings, defaultsInForce } from './settings.ts';
import { acknowledgeOverdue, checkIn, close, completeVisit, extend, silenceOverdue, standingOf, startTimer, stepsOffered, tick, type Timer } from './checkins.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const services = json('../../../../catalog/services.json') as { id: string; duration: number }[];
const events = json('../../../../catalog/events.json') as { events: { type: string; version: number; payload: { field: string }[]; neverCarries: { field: string }[] }[] };
const api = json('../../../../catalog/apis/safety.json') as { routes: { method: string; path: string; refusals: { id: string; statement: string }[] }[] };
const routeStatement = (path: string, id: string) => api.routes.find(r => r.path === path)!.refusals.find(r => r.id === id)!.statement;

const { graceMinutes, extensionSteps, maxExtensionMinutes } = defaultTimings;
const T0 = Date.UTC(2026, 8, 14, 7, 0);
const service = services.find(s => s.id === 'wound')!;
const reason = extensionReasons[0].id;
const started = (): Timer => {
 const result = startTimer({ checkinRef: 'CHK-1', event: { appointmentRef: 'APT-1', visitCodeMatched: true }, serviceId: service.id, nurseRef: 'N-205' }, T0, defaultsInForce);
 assert.ok(result.ok);
 return result.value;
};
const value = <T>(result: { ok: true; value: T } | { ok: false; refusal: { id: string } }): T => {
 if (!result.ok) assert.fail(`refused: ${result.refusal.id}`);
 return result.value;
};

test('a timer starts from the visit and is due at the service duration plus the grace', () => {
 const result = startTimer({ checkinRef: 'CHK-1', event: { appointmentRef: 'APT-1', visitCodeMatched: true }, serviceId: service.id, nurseRef: 'N-205' }, T0, defaultsInForce);
 assert.ok(result.ok);
 assert.equal(result.value.expectedMinutes, serviceMinutes(service.id));
 assert.equal(result.value.dueAt, T0 + (service.duration + graceMinutes) * MINUTE);
 assert.equal(result.value.settingsVersion, defaultsInForce.settingsVersion);
 assert.deepEqual(result.emits, [], 'a timer emits when it runs out, not when it starts');
 assert.equal(standingOf(result.value, T0), 'running');
});

test('a visit whose code did not match, an unknown service and a typed duration are refused', () => {
 const unmatched = startTimer({ checkinRef: 'C', event: { appointmentRef: 'A', visitCodeMatched: false }, serviceId: service.id, nurseRef: 'N' }, T0, defaultsInForce);
 assert.equal(!unmatched.ok && unmatched.refusal.id, 'timer-without-a-matched-code');
 const unknown = startTimer({ checkinRef: 'C', event: { appointmentRef: 'A', visitCodeMatched: true }, serviceId: 'not-a-service', nurseRef: 'N' }, T0, defaultsInForce);
 assert.equal(!unknown.ok && unknown.refusal.id, 'timer-for-an-unknown-service');
 const typed = startTimer({ checkinRef: 'C', event: { appointmentRef: 'A', visitCodeMatched: true }, serviceId: service.id, nurseRef: 'N', expectedMinutes: service.duration + 90 }, T0, defaultsInForce);
 assert.ok(!typed.ok);
 assert.equal(typed.refusal.statement, routeStatement('/v1/safety/checkins', 'expected-minutes-not-the-service'));
 const agreeing = startTimer({ checkinRef: 'C', event: { appointmentRef: 'A', visitCodeMatched: true }, serviceId: service.id, nurseRef: 'N', expectedMinutes: service.duration }, T0, defaultsInForce);
 assert.ok(agreeing.ok, 'a duration that agrees with the catalogue is not refused');
});

test('the deadline passing emits checkin.overdue once, with exactly the payload events.json declares', () => {
 let timer = started();
 const before = tick(timer, timer.dueAt - 1);
 assert.ok(before.ok); assert.deepEqual(before.emits, []);
 const at = tick(timer, timer.dueAt);
 assert.ok(at.ok);
 assert.equal(at.emits.length, 1);
 const [emitted] = at.emits;
 const declared = events.events.find(e => e.type === 'checkin.overdue' && e.version === emitted.version)!;
 assert.deepEqual(Object.keys(emitted.payload).sort(), declared.payload.map(p => p.field).sort());
 for (const never of declared.neverCarries) assert.ok(!(never.field in emitted.payload), `checkin.overdue never carries ${never.field}`);
 assert.equal((emitted.payload as { overdueSince: string }).overdueSince, new Date(timer.dueAt).toISOString());
 timer = at.value;
 assert.equal(standingOf(timer, timer.dueAt), 'overdue');
 const again = tick(timer, timer.dueAt + 5 * MINUTE);
 assert.ok(again.ok); assert.deepEqual(again.emits, [], 'a deadline is announced once');
});

test('extending needs a reason and an offered step, and stops at the ceiling with the route’s sentence', () => {
 const timer = started();
 const noReason = extend(timer, { minutes: extensionSteps[0] }, T0);
 assert.equal(!noReason.ok && noReason.refusal.id, 'extension-without-reason');
 const odd = extend(timer, { minutes: extensionSteps[0] + 1, reasonId: reason }, T0);
 assert.equal(!odd.ok && odd.refusal.id, 'extension-not-offered');
 let current = timer;
 const biggest = Math.max(...extensionSteps);
 while (stepsOffered(current).length) current = value(extend(current, { minutes: stepsOffered(current).at(-1)!, reasonId: reason }, T0));
 const over = extend(current, { minutes: biggest, reasonId: reason }, T0);
 assert.ok(!over.ok);
 assert.equal(over.refusal.id, 'extension-limit');
 assert.equal(over.refusal.statement, routeStatement('/v1/safety/checkins/{checkinRef}/extend', 'extension-limit'));
 assert.ok(current.extensions.reduce((t, e) => t + e.minutes, 0) <= maxExtensionMinutes);
});

test('extending while overdue counts from now, answers the episode, and a new deadline can go overdue again', () => {
 let timer = value(tick(started(), started().dueAt + 20 * MINUTE));
 const now = timer.dueAt + 20 * MINUTE;
 timer = value(extend(timer, { minutes: extensionSteps[0], reasonId: reason }, now));
 assert.equal(timer.dueAt, now + extensionSteps[0] * MINUTE);
 assert.equal(timer.overdue?.answeredAt, now);
 assert.equal(standingOf(timer, now), 'running');
 const second = tick(timer, timer.dueAt);
 assert.ok(second.ok);
 assert.equal(second.emits.length, 1, 'the new deadline is announced');
 assert.equal(second.value.overdue?.answeredAt, null, 'and it is a new episode');
});

test('a check-in answers an overdue but never moves the deadline', () => {
 const overdue = value(tick(started(), started().dueAt));
 const later = overdue.dueAt + 3 * MINUTE;
 const checked = value(checkIn(overdue, later));
 assert.equal(checked.dueAt, overdue.dueAt);
 assert.equal(checked.overdue?.answeredAt, later);
 assert.equal(standingOf(checked, later), 'overdue', 'she said she is safe; she is still past check-out');
});

test('closing checks out once, and a closed timer never goes overdue', () => {
 const timer = started();
 const closed = value(close(timer, 'nurse', T0 + 10 * MINUTE));
 assert.equal(standingOf(closed, closed.dueAt + MINUTE), 'closed');
 const late = tick(closed, closed.dueAt + 60 * MINUTE);
 assert.ok(late.ok); assert.deepEqual(late.emits, []);
 const twice = close(closed, 'nurse', T0 + 11 * MINUTE);
 assert.ok(!twice.ok);
 assert.equal(twice.refusal.statement, routeStatement('/v1/safety/checkins/{checkinRef}/close', 'already-closed'));
 const extendClosed = extend(closed, { minutes: extensionSteps[0], reasonId: reason }, T0 + 12 * MINUTE);
 assert.equal(!extendClosed.ok && extendClosed.refusal.id, 'checkin-after-close');
 const completed = value(completeVisit(timer, T0 + 20 * MINUTE));
 assert.equal(completed.closedBy, 'visit-completed');
 assert.equal(value(completeVisit(completed, T0 + 21 * MINUTE)).closedAt, T0 + 20 * MINUTE, 'appointment.completed twice closes once');
});

test('the desk closes an overdue with a true reason, after picking it up, or not at all', () => {
 const running = started();
 assert.equal((() => { const r = silenceOverdue(running, { reasonId: 'reached-by-phone', by: 'O-801' }, T0); return !r.ok && r.refusal.id; })(), 'nothing-to-silence');
 const overdue = value(tick(running, running.dueAt));
 const noReason = silenceOverdue(overdue, { by: 'O-801' }, overdue.dueAt);
 assert.equal(!noReason.ok && noReason.refusal.id, 'overdue-silenced-without-reason');
 const unacknowledged = silenceOverdue(overdue, { reasonId: 'reached-by-phone', by: 'O-801' }, overdue.dueAt);
 assert.equal(!unacknowledged.ok && unacknowledged.refusal.id, 'overdue-acknowledged-first');
 const picked = value(acknowledgeOverdue(overdue, 'O-801', overdue.dueAt + MINUTE));
 const untrue = silenceOverdue(picked, { reasonId: 'nurse-answered', by: 'O-801' }, overdue.dueAt + 2 * MINUTE);
 assert.equal(!untrue.ok && untrue.refusal.id, 'silence-reason-untrue');
 const closed = value(silenceOverdue(picked, { reasonId: 'reached-by-phone', by: 'O-801' }, overdue.dueAt + 2 * MINUTE));
 assert.equal(closed.overdue?.silenced?.reasonId, 'reached-by-phone');
 const answered = value(checkIn(picked, overdue.dueAt + 3 * MINUTE));
 assert.ok(value(silenceOverdue(answered, { reasonId: 'nurse-answered', by: 'O-801' }, overdue.dueAt + 4 * MINUTE)).overdue?.silenced);
});
