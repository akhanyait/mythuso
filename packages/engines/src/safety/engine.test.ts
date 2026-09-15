/* Safety bound to the runtime: the panic route answers, refuses with the contract's own sentences,
   never shares one panic between two nurses, folds a repeat press by the same nurse for the same visit
   into the open panic rather than refusing it, publishes panic.raised@1 without a position, and a
   matched visit code reaches the engine. Every call names its caller, because since 72390a1 the
   runtime refuses an idempotent write from a caller it cannot identify.

   The visit timer on the runtime: started by appointment.in_progress@2 and timed by its service, closed by
   appointment.completed@2, extended only with a reason in a step it offers up to its own ceiling, told "I am
   safe" without its deadline moving, overdue on the clock, and worked by the desk — picked up before it is
   closed with a true reason. The desk's position read answers only inside the window, and its queue never
   carries what a visit was for.

   And the field-safety settings an admin changes: refused out of range, without a reason, on a stale
   version and for anybody but an admin; recorded with who, when, from, to and why; published once, and
   replayed rather than repeated under the same key; and never reaching back into a visit or a panic that
   started before the change. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEMORY, createClock, createRuntime, defineEngine, type EngineModule, type EventKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { MINUTE, fieldSafety, outcomes, refusal } from './domain/rules.ts';
import { defaultTimings, safetyBlock } from './domain/settings.ts';
import type { Bound } from '../settings/shape.ts';

const START = '2026-09-14T09:00:00+02:00';
const ROUTE = 'POST /v1/safety/panics@1';
const READ = 'GET /v1/safety/settings@4';
const CHANGE = 'POST /v1/safety/setting-changes@2';
const CHECKINS = 'GET /v1/safety/checkins@1';
const EXTEND = 'POST /v1/safety/checkins/{checkinRef}/extend@2';
const SAFE = 'POST /v1/safety/checkins/{checkinRef}/safe@1';
const CHECK_OUT = 'POST /v1/safety/checkins/{checkinRef}/close@2';
const OVERDUE_PICK_UP = 'POST /v1/safety/overdue-checkins/{checkinRef}/pick-up@1';
const OVERDUE_CLOSE = 'POST /v1/safety/overdue-checkins/{checkinRef}/close@1';
const PANIC_PICK_UP = 'POST /v1/safety/panics/{panicRef}/pick-up@1';
const RESOLVE = 'POST /v1/safety/panics/{panicRef}/resolve@1';
const POSITION = 'GET /v1/safety/panics/{panicRef}/position@1';
const QUEUE = 'GET /v1/safety/desk-queue@1';
const panicWindowMinutes = defaultTimings.panicWindowMinutes;
const api = JSON.parse(readFileSync(new URL('../../../catalog/apis/safety.json', import.meta.url), 'utf8')) as { routes: { method: string; path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const apis = JSON.parse(readFileSync(new URL('../../../catalog/apis.json', import.meta.url), 'utf8')) as { sharedRefusals: { id: string; statement: string }[] };
const services = JSON.parse(readFileSync(new URL('../../../catalog/services.json', import.meta.url), 'utf8')) as { id: string; name: string; duration: number }[];
const statement = (id: string) => api.routes.find(r => r.path === '/v1/safety/panics')!.refusals.find(r => r.id === id)!.statement;
const changeStatement = (id: string) => api.routes.find(r => r.path === '/v1/safety/setting-changes' && r.version === 2)!.refusals.find(r => r.id === id)!.statement;
const runtimeWith = (extra: EngineModule[] = [], dataDirectory: string = MEMORY) =>
 createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, ...extra], dataDirectory, clock: createClock(START) });
const press = (fields: Record<string, unknown>, who: { role?: string; ref?: string } = {}) => ({
 role: who.role ?? 'nurse', ref: who.ref ?? 'party-synthetic-205', purpose: 'emergency',
 fields: { idempotencyKey: 'press-1', locationShareMinutes: panicWindowMinutes, ...fields }
});
const change = (fields: Record<string, unknown>, who: { role?: string; ref?: string } = {}) => ({
 role: who.role ?? 'admin', ref: who.ref ?? 'party-synthetic-901', purpose: 'audit',
 fields: { idempotencyKey: 'change-1', setting: 'grace', wholeNumber: 45, reason: 'Long dressings were paging the desk.', expectedVersion: 1, ...fields }
});
const readSettings = (runtime: ReturnType<typeof runtimeWith>) => runtime.call(READ, { role: 'admin', ref: 'party-synthetic-901', purpose: 'audit', fields: {} });
const published = (runtime: ReturnType<typeof runtimeWith>, key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key);
const raised = (runtime: ReturnType<typeof runtimeWith>) => published(runtime, 'panic.raised@1');
/* A setting's bounds and unit, read from the contract, so a new bound moves the test with it. */
const row = (key: string) => {
 const s = safetyBlock.items.find(r => r.key === key)!;
 const bounds = s.bounds as { lowest: Bound; highest: Bound } | undefined;
 return { key: s.key, unit: s.unit, lowest: bounds?.lowest as Bound, highest: bounds?.highest as Bound };
};
/* Every refusal is held to the sentence the contract gives it, wherever it is declared. */
const refused = (answer: { status: number; body: Record<string, unknown> }, id: string) => {
 assert.equal(answer.body.error, id, JSON.stringify(answer.body));
 assert.equal(answer.body.message, refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};

/* A Care that publishes the visit events it is told to, on the next tick, so a timer is started and closed by
   the event and nothing else. */
function visits(extra: EngineModule[] = []) {
 const pending: { key: EventKey; payload: Record<string, unknown> }[] = [];
 const care = defineEngine({ id: 'care', routes: {}, subscriptions: {}, store: { schema: '' },
  tick: ctx => { for (const event of pending.splice(0)) ctx.publish(event.key, event.payload, { subjectRef: 'subject-synthetic-2', purposeOfUse: 'treatment' }); } });
 const runtime = runtimeWith([care, ...extra]);
 const start = (appointmentRef: string, serviceId = 'wound') => { pending.push({ key: 'appointment.in_progress@2', payload: { appointmentRef, visitCodeMatched: true, serviceId } }); runtime.advance(0); };
 const complete = (appointmentRef: string, serviceId = 'wound') => { pending.push({ key: 'appointment.completed@2', payload: { appointmentRef, encounterRef: `encounter-${appointmentRef}`, serviceId } }); runtime.advance(0); };
 const nurse = (route: Parameters<typeof runtime.call>[0], fields: Record<string, unknown>, ref = 'party-synthetic-205') => runtime.call(route, { role: 'nurse', ref, purpose: 'dispatch', fields });
 const operator = (route: Parameters<typeof runtime.call>[0], fields: Record<string, unknown>, purpose = 'dispatch') => runtime.call(route, { role: 'operator', ref: 'party-synthetic-801', purpose, fields });
 const timer = (appointmentRef: string) => nurse(CHECKINS, { appointmentRef }).body as { checkinRef: string; stateCode: string; dueAt: string; settingsVersion: number; extensionMinutesLeft: number; extensionStepsOffered: number[]; saidSafeAt?: string };
 const queue = () => operator(QUEUE, {}, 'emergency').body.items as Record<string, unknown>[];
 return { runtime, start, complete, nurse, operator, timer, queue };
}
const minutesOf = (serviceId: string) => services.find(s => s.id === serviceId)!.duration;

test('pressing panic opens the declared window and publishes panic.raised@1, never a position', () => {
 const runtime = runtimeWith();
 const answer = runtime.call(ROUTE, press({ appointmentRef: 'appointment-synthetic-1' }));
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 assert.equal(answer.answeredBy, 'engine');
 assert.equal(Date.parse(String(answer.body.locationShareEndsAt)), Date.parse(START) + panicWindowMinutes * MINUTE);
 const events = raised(runtime);
 assert.equal(events.length, 1);
 const body = JSON.parse(events[0].body) as { payload: Record<string, unknown>; purposeOfUse: string; subjectRef: string };
 assert.deepEqual(Object.keys(body.payload).sort(), ['locationShareEndsAt', 'panicRef', 'raisedByRole']);
 assert.equal(body.payload.raisedByRole, 'nurse');
 assert.equal(body.purposeOfUse, 'emergency');
 assert.equal(body.subjectRef, 'party-synthetic-205', 'the subject is the caller the runtime identified');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a window with no end, or one the phone chose, is refused in the route’s own words, and nothing is published', () => {
 const runtime = runtimeWith();
 const zero = runtime.call(ROUTE, press({ idempotencyKey: 'k-0', locationShareMinutes: 0 }));
 assert.deepEqual([zero.status, zero.body.error, zero.body.message], [422, 'share-without-end', statement('share-without-end')]);
 const longer = runtime.call(ROUTE, press({ idempotencyKey: 'k-1', locationShareMinutes: panicWindowMinutes * 24 }));
 assert.deepEqual([longer.status, longer.body.error, longer.body.message], [422, 'window-not-the-declared-one', statement('window-not-the-declared-one')]);
 assert.equal(raised(runtime).length, 0);
 runtime.close();
});

test('two nurses whose phones chose the same key are two panics, and the desk hears both', () => {
 const runtime = runtimeWith();
 const first = runtime.call(ROUTE, press({ idempotencyKey: 'same-key', appointmentRef: 'appointment-synthetic-1' }, { ref: 'party-synthetic-205' }));
 const second = runtime.call(ROUTE, press({ idempotencyKey: 'same-key', appointmentRef: 'appointment-synthetic-1' }, { ref: 'party-synthetic-206' }));
 assert.equal(first.status, 200, JSON.stringify(first.body));
 assert.equal(second.status, 200, JSON.stringify(second.body));
 assert.notEqual(second.body.panicRef, first.body.panicRef, 'one nurse’s panic is never answered with another’s');
 const events = raised(runtime).map(entry => JSON.parse(entry.body) as { subjectRef: string });
 assert.deepEqual(events.map(event => event.subjectRef).sort(), ['party-synthetic-205', 'party-synthetic-206']);
 runtime.close();
});

test('the same nurse pressing again for the same visit inside the window is the same panic, answered and not refused', () => {
 const runtime = runtimeWith();
 const first = runtime.call(ROUTE, press({ idempotencyKey: 'press-a', appointmentRef: 'appointment-synthetic-1' }));
 runtime.advance(2 * MINUTE);
 const again = runtime.call(ROUTE, press({ idempotencyKey: 'press-b', appointmentRef: 'appointment-synthetic-1' }));
 assert.equal(again.status, 200, JSON.stringify(again.body));
 assert.deepEqual(again.body, first.body);
 const replay = runtime.call(ROUTE, press({ idempotencyKey: 'press-a', appointmentRef: 'appointment-synthetic-1' }));
 assert.deepEqual(replay.body, first.body, 'the same key from the same nurse is the same act once');
 assert.equal(raised(runtime).length, 1);
 runtime.close();
});

test('a different visit, or the same visit once the window has closed, is a new panic', () => {
 const runtime = runtimeWith();
 const first = runtime.call(ROUTE, press({ idempotencyKey: 'press-a', appointmentRef: 'appointment-synthetic-1' }));
 const otherVisit = runtime.call(ROUTE, press({ idempotencyKey: 'press-b', appointmentRef: 'appointment-synthetic-2' }));
 assert.notEqual(otherVisit.body.panicRef, first.body.panicRef);
 runtime.advance(panicWindowMinutes * MINUTE);
 const afterWindow = runtime.call(ROUTE, press({ idempotencyKey: 'press-c', appointmentRef: 'appointment-synthetic-1' }));
 assert.equal(afterWindow.status, 200);
 assert.notEqual(afterWindow.body.panicRef, first.body.panicRef, 'the window does not stretch; a new press starts a new one');
 assert.equal(raised(runtime).length, 3);
 runtime.close();
});

test('a patient cannot press a nurse’s panic, and an unknown visit never stops one', () => {
 const runtime = runtimeWith();
 assert.equal(runtime.call(ROUTE, press({ idempotencyKey: 'k-p' }, { role: 'patient', ref: 'person-synthetic-1' })).body.error, 'caller-not-allowed');
 const unknown = runtime.call(ROUTE, press({ idempotencyKey: 'k-u', appointmentRef: 'appointment-nobody-heard-of' }));
 assert.equal(unknown.status, 200);
 runtime.close();
});

/* ---- The visit timer ----------------------------------------------------------------------------- */

test('a visit under way is timed by its own service from appointment.in_progress@2, and its completion closes the timer', () => {
 const { runtime, start, complete, nurse, timer } = visits();
 start('appointment-synthetic-7', 'wound');
 start('appointment-synthetic-8', 'senior');
 const wound = timer('appointment-synthetic-7');
 assert.equal(Date.parse(wound.dueAt), Date.parse(START) + (minutesOf('wound') + defaultTimings.graceMinutes) * MINUTE, 'the service’s duration and the grace in force');
 assert.deepEqual([wound.stateCode, wound.settingsVersion, wound.extensionMinutesLeft, wound.extensionStepsOffered], ['running', 1, defaultTimings.maxExtensionMinutes, [...defaultTimings.extensionSteps]]);
 assert.equal(Date.parse(timer('appointment-synthetic-8').dueAt), Date.parse(START) + (minutesOf('senior') + defaultTimings.graceMinutes) * MINUTE, 'another service is timed by its own duration');
 refused(nurse(CHECKINS, { appointmentRef: 'appointment-nobody-started' }), 'no-timer-for-that-visit');

 runtime.advance(5 * MINUTE);
 start('appointment-synthetic-7', 'wound');
 assert.equal(timer('appointment-synthetic-7').dueAt, wound.dueAt, 'the same visit heard again keeps the timer it has');

 complete('appointment-synthetic-7');
 assert.equal(timer('appointment-synthetic-7').stateCode, 'closed', 'a completed visit closes its timer');
 refused(nurse(CHECK_OUT, { idempotencyKey: 'out', checkinRef: wound.checkinRef }), 'already-closed');
 runtime.advance(24 * 60 * MINUTE);
 assert.equal(published(runtime, 'checkin.overdue@1').length, 1, 'the closed visit never went overdue; the open one did');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an extension says why, in a step the timer offers, up to the ceiling it started with, and only the nurse holding it extends it', () => {
 const { runtime, start, nurse, timer } = visits();
 start('appointment-synthetic-7');
 const { checkinRef, dueAt } = timer('appointment-synthetic-7');
 const [step] = defaultTimings.extensionSteps;
 const reasonCode = fieldSafety.extensionReasons[0].id;
 const first = nurse(EXTEND, { idempotencyKey: 'x-0', checkinRef, extraMinutes: step, reasonCode });
 assert.equal(first.status, 200, JSON.stringify(first.body));
 assert.deepEqual(first.body, { dueAt: new Date(Date.parse(dueAt) + step * MINUTE).toISOString(), extensionMinutesLeft: defaultTimings.maxExtensionMinutes - step });

 refused(nurse(EXTEND, { idempotencyKey: 'x-none', checkinRef, extraMinutes: step }), 'extension-without-reason');
 refused(nurse(EXTEND, { idempotencyKey: 'x-free', checkinRef, extraMinutes: step + 1, reasonCode }), 'extension-not-offered');
 refused(nurse(EXTEND, { idempotencyKey: 'x-other', checkinRef, extraMinutes: step, reasonCode }, 'party-synthetic-206'), 'checkin-held-by-another');
 refused(nurse(EXTEND, { idempotencyKey: 'x-nobody', checkinRef: 'checkin-nobody-started', extraMinutes: step, reasonCode }), 'no-such-checkin');

 let taken = step;
 for (let i = 1; taken + step <= defaultTimings.maxExtensionMinutes; i++, taken += step) assert.equal(nurse(EXTEND, { idempotencyKey: `x-${i}`, checkinRef, extraMinutes: step, reasonCode }).status, 200);
 assert.equal(timer('appointment-synthetic-7').extensionMinutesLeft, defaultTimings.maxExtensionMinutes - taken);
 refused(nurse(EXTEND, { idempotencyKey: 'x-past', checkinRef, extraMinutes: step, reasonCode }), 'extension-limit');
 assert.equal(Date.parse(timer('appointment-synthetic-7').dueAt), Date.parse(dueAt) + taken * MINUTE, 'to the ceiling and no further');
 assert.equal(nurse(EXTEND, { idempotencyKey: 'x-0', checkinRef, extraMinutes: step, reasonCode }).status, 200, 'the same key is the same extension once');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('"I am safe" is recorded and never moves the deadline, never closes an overdue, and carries nothing that could', () => {
 const { runtime, start, nurse, timer, queue } = visits();
 start('appointment-synthetic-7');
 const { checkinRef, dueAt } = timer('appointment-synthetic-7');
 const said = nurse(SAFE, { idempotencyKey: 's-1', checkinRef });
 assert.deepEqual(said.body, { saidSafeAt: new Date(Date.parse(START)).toISOString(), dueAt });
 assert.equal(timer('appointment-synthetic-7').dueAt, dueAt);
 refused(nurse(SAFE, { idempotencyKey: 's-more', checkinRef, extraMinutes: defaultTimings.extensionSteps[0] }), 'safe-is-not-an-extension');
 refused(nurse(SAFE, { idempotencyKey: 's-other', checkinRef }, 'party-synthetic-206'), 'checkin-held-by-another');

 runtime.advance(Date.parse(dueAt) - Date.parse(START));
 assert.equal(timer('appointment-synthetic-7').stateCode, 'overdue');
 runtime.advance(3 * MINUTE);
 assert.equal(nurse(SAFE, { idempotencyKey: 's-2', checkinRef }).status, 200);
 const after = timer('appointment-synthetic-7');
 assert.deepEqual([after.stateCode, after.dueAt], ['overdue', dueAt], 'she said she is safe; she is still past check-out');
 const [item] = queue();
 assert.deepEqual([item!.kind, item!.open, item!.answeredAt, item!.nurse], ['overdue', true, new Date(Date.parse(dueAt) + 3 * MINUTE).toISOString(), 'party-synthetic-205'], 'the desk sees her answer and still has the overdue to close');
 runtime.advance(60 * MINUTE);
 assert.equal(published(runtime, 'checkin.overdue@1').length, 1, 'her word neither silenced the overdue nor made a new one');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('overdue on the clock, then picked up, then closed with a true reason; closing before a pick-up is refused first', () => {
 const { runtime, start, nurse, operator, timer, queue } = visits();
 start('appointment-synthetic-7', 'mental');
 const { checkinRef, dueAt } = timer('appointment-synthetic-7');
 runtime.advance(Date.parse(dueAt) - Date.parse(START) + MINUTE);
 const overdue = published(runtime, 'checkin.overdue@1').map(entry => JSON.parse(entry.body) as { payload: Record<string, unknown> });
 assert.deepEqual(overdue.map(e => e.payload), [{ checkinRef, appointmentRef: 'appointment-synthetic-7', overdueSince: dueAt }]);

 const [waiting] = queue();
 assert.deepEqual(Object.keys(waiting!), [...fieldSafety.desk.carries]);
 assert.deepEqual([waiting!.kind, waiting!.reference, waiting!.nurse, waiting!.suburb, waiting!.acknowledgement, waiting!.open], ['overdue', checkinRef, null, null, null, true]);
 const mentalHealth = services.find(s => s.id === 'mental')!.name;
 assert.ok(!JSON.stringify(queue()).includes(mentalHealth) && !JSON.stringify(queue()).includes('mental'), 'the desk never learns what the visit was for');
 refused(operator(QUEUE, { serviceId: 'mental' }, 'emergency'), 'desk-queue-takes-no-filter');

 const reached = fieldSafety.silenceReasons.find(r => !r.needsNurseAnswer)!.id;
 const nurseAnswered = fieldSafety.silenceReasons.find(r => r.needsNurseAnswer)!.id;
 refused(operator(OVERDUE_CLOSE, { idempotencyKey: 'c-early', checkinRef }), 'overdue-acknowledged-first');
 refused(operator(OVERDUE_CLOSE, { idempotencyKey: 'c-early-reason', checkinRef, reasonCode: reached }), 'overdue-acknowledged-first');
 assert.equal(nurse(OVERDUE_PICK_UP, { idempotencyKey: 'p-nurse', checkinRef }).body.error, 'caller-not-allowed', 'a nurse is not the desk');

 const picked = operator(OVERDUE_PICK_UP, { idempotencyKey: 'p-1', checkinRef });
 assert.equal(picked.status, 200, JSON.stringify(picked.body));
 assert.deepEqual(operator(OVERDUE_PICK_UP, { idempotencyKey: 'p-2', checkinRef }).body, picked.body, 'picked up once');
 refused(operator(OVERDUE_CLOSE, { idempotencyKey: 'c-none', checkinRef }), 'overdue-silenced-without-reason');
 refused(operator(OVERDUE_CLOSE, { idempotencyKey: 'c-untrue', checkinRef, reasonCode: nurseAnswered }), 'silence-reason-untrue');
 const closed = operator(OVERDUE_CLOSE, { idempotencyKey: 'c-1', checkinRef, reasonCode: reached });
 assert.equal(closed.status, 200, JSON.stringify(closed.body));
 const [done] = queue();
 assert.deepEqual([done!.open, done!.outcome, (done!.acknowledgement as { by: string }).by], [false, fieldSafety.silenceReasons.find(r => r.id === reached)!.label, 'party-synthetic-801']);
 refused(operator(OVERDUE_PICK_UP, { idempotencyKey: 'p-3', checkinRef }), 'nothing-to-pick-up');
 refused(operator(OVERDUE_CLOSE, { idempotencyKey: 'c-2', checkinRef, reasonCode: reached }), 'nothing-to-silence');
 refused(operator(OVERDUE_PICK_UP, { idempotencyKey: 'p-4', checkinRef: 'checkin-nobody-started' }), 'no-such-checkin');
 assert.deepEqual(runtime.trail.all().filter(entry => entry.kind === 'published').map(entry => entry.eventKey), ['appointment.in_progress@2', 'checkin.overdue@1'], 'closing an overdue tells no engine anything');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a panic is picked up before it is resolved, the resolution publishes no position, and the desk reads a position only inside the window', () => {
 const runtime = runtimeWith();
 const operator = (route: Parameters<typeof runtime.call>[0], fields: Record<string, unknown>) => runtime.call(route, { role: 'operator', ref: 'party-synthetic-801', purpose: 'emergency', fields });
 const panicRef = String(runtime.call(ROUTE, press({ idempotencyKey: 'p-1', appointmentRef: 'appointment-synthetic-1' })).body.panicRef);
 const reading = operator(POSITION, { panicRef });
 assert.deepEqual(reading.body, { sharingEndsAt: new Date(Date.parse(START) + panicWindowMinutes * MINUTE).toISOString() }, 'inside the window the desk is told when sharing ends; no device reports where she is');

 refused(operator(RESOLVE, { idempotencyKey: 'r-early', panicRef, outcomeCode: outcomes[0].id }), 'panic-resolved-before-acknowledged');
 refused(operator(RESOLVE, { idempotencyKey: 'r-early-none', panicRef }), 'panic-resolved-before-acknowledged');
 assert.equal(operator(PANIC_PICK_UP, { idempotencyKey: 'u-1', panicRef }).status, 200);
 refused(operator(RESOLVE, { idempotencyKey: 'r-none', panicRef }), 'panic-resolved-without-outcome');
 runtime.advance(2 * MINUTE);
 const resolved = operator(RESOLVE, { idempotencyKey: 'r-1', panicRef, outcomeCode: outcomes[0].id });
 const at = new Date(Date.parse(START) + 2 * MINUTE).toISOString();
 assert.deepEqual(resolved.body, { resolvedAt: at, sharingEndedAt: at });
 const events = published(runtime, 'panic.resolved@1').map(entry => JSON.parse(entry.body) as { payload: Record<string, unknown>; actorRole: string; subjectRef: string });
 assert.deepEqual(events.map(e => [e.payload, e.actorRole, e.subjectRef]), [[{ panicRef, outcomeCode: outcomes[0].id, sharingEndedAt: at }, 'operator', 'party-synthetic-205']]);
 refused(operator(POSITION, { panicRef }), 'position-no-longer-shared');
 refused(operator(RESOLVE, { idempotencyKey: 'r-2', panicRef, outcomeCode: outcomes[0].id }), 'panic-already-resolved');
 refused(operator(PANIC_PICK_UP, { idempotencyKey: 'u-2', panicRef }), 'panic-resolved-nothing-to-pick-up');
 const pressedAgain = runtime.call(ROUTE, press({ idempotencyKey: 'p-2', appointmentRef: 'appointment-synthetic-1' }));
 assert.notEqual(pressedAgain.body.panicRef, panicRef, 'a press after the desk resolved her panic is a new panic, inside the old window or not');

 const open = String(pressedAgain.body.panicRef);
 assert.equal(operator(POSITION, { panicRef: open }).status, 200);
 runtime.advance(panicWindowMinutes * MINUTE);
 refused(operator(POSITION, { panicRef: open }), 'position-no-longer-shared');
 refused(operator(POSITION, { panicRef: 'panic-nobody-pressed' }), 'no-such-panic');
 assert.equal(runtime.call(POSITION, { role: 'nurse', ref: 'party-synthetic-206', purpose: 'emergency', fields: { panicRef: open } }).body.error, 'caller-not-allowed', 'only the desk reads where a nurse is');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

/* ---- Settings ---------------------------------------------------------------------------------- */

test('an admin reads the timings in force with their ranges and an empty history, and nobody else reads them', () => {
 const runtime = runtimeWith();
 const answer = readSettings(runtime);
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 assert.equal(answer.body.settingsVersion, 1);
 assert.deepEqual(answer.body.history, []);
 const settings = answer.body.settings as { setting: string; inForce: unknown; default: unknown; unit: string; setAtVersion: number; limits: { bounds: { lowest: Bound; highest: Bound } } }[];
 assert.deepEqual(settings.map(s => s.setting), safetyBlock.items.map(r => r.key));
 for (const s of settings) assert.deepEqual(s.inForce, s.default, `${s.setting} is at its default`);
 for (const s of settings.filter(s => s.limits.bounds)) {
  assert.equal(s.setAtVersion, 1, `${s.setting} was set by the contract`);
  assert.deepEqual([s.limits.bounds.lowest.value, s.limits.bounds.highest.value, s.unit], [row(s.setting).lowest.value, row(s.setting).highest.value, row(s.setting).unit]);
 }
 /* The nurse is a caller of the read route since Sentinel's settings began waiting on a clinical review (Wave 5): an
    admin may name her on Clinical's review-confirmer setting, and somebody who confirms a value reads what she is
    confirming. She is refused here all the same, by the handler rather than by the runtime, because reading who
    changed these settings is for the roles that may change them. The desk is not a caller at all. */
 assert.equal(runtime.call(READ, { role: 'nurse', ref: 'party-synthetic-1', purpose: 'audit', fields: {} }).body.error, 'settings-read-not-permitted', 'nurse');
 assert.equal(runtime.call(READ, { role: 'ops-desk', ref: 'party-synthetic-1', purpose: 'audit', fields: {} }).body.error, 'caller-not-allowed', 'ops-desk');
 runtime.close();
});

test('a change is refused out of range, without a reason, on a stale version and for anybody but an admin, and nothing is recorded or published', () => {
 const runtime = runtimeWith();
 const refusedChange = (answer: { status: number; body: Record<string, unknown> }, id: string) => {
  assert.equal(answer.body.error, id, JSON.stringify(answer.body));
  assert.equal(answer.body.message, changeStatement(id));
 };
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'low', wholeNumber: row('grace').lowest.value - 1 })), 'setting-out-of-range');
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'high', wholeNumber: row('grace').highest.value + 1 })), 'setting-out-of-range');
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'zero', setting: 'panic-window', wholeNumber: 0 })), 'setting-not-above-zero');
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'no-reason', reason: undefined })), 'setting-change-without-reason');
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'blank-reason', reason: '   ' })), 'setting-change-without-reason');
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'stale', expectedVersion: 2 })), 'settings-version-stale');
 /* A nurse or the desk is refused by the binder before the handler runs, with the shared sentence: the
    route names its callers, and a caller it does not name never reaches the rule that would refuse it. */
 const callerNotAllowed = apis.sharedRefusals.find(r => r.id === 'caller-not-allowed')!.statement;
 for (const role of ['nurse', 'ops-desk', 'engine:core']) {
  const answer = runtime.call(CHANGE, change({ idempotencyKey: `as-${role}` }, { role, ref: 'party-synthetic-205' }));
  assert.deepEqual([answer.body.error, answer.body.message], ['caller-not-allowed', callerNotAllowed], role);
 }
 assert.equal(runtime.call(CHANGE, { ...change({ idempotencyKey: 'nobody' }), ref: null }).body.error, 'caller-unidentified', 'an admin nobody can name is not recorded as having changed anything');
 assert.deepEqual(readSettings(runtime).body.history, []);
 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published').length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an accepted change records who, when, from, to and why, publishes nothing, and the same key is the same change', () => {
 const runtime = runtimeWith();
 runtime.advance(5 * MINUTE);
 const at = new Date(Date.parse(START) + 5 * MINUTE).toISOString();
 const first = runtime.call(CHANGE, change({}));
 assert.equal(first.status, 200, JSON.stringify(first.body));
 assert.deepEqual(first.body, { settingsVersion: 2, appliesFrom: at });
 const replay = runtime.call(CHANGE, change({}));
 assert.deepEqual(replay.body, first.body, 'the same key and the same request is answered, not applied again');
 const reused = runtime.call(CHANGE, change({ wholeNumber: 90 }));
 assert.equal(reused.body.error, 'idempotency-key-reused', 'a reused key with a different change is refused rather than replayed');

 const read = readSettings(runtime).body;
 assert.equal(read.settingsVersion, 2);
 assert.deepEqual(read.history, [{ settingsVersion: 2, setting: 'grace', from: defaultTimings.graceMinutes, to: 45, reason: 'Long dressings were paging the desk.', byRole: 'admin', byRef: 'party-synthetic-901', at }]);
 assert.equal((read.settings as { setting: string; inForce: number }[]).find(s => s.setting === 'grace')!.inForce, 45);

 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published').length, 0, 'a change is the row in the history and nothing on the bus: no engine acts on one');
 const second = runtime.call(CHANGE, change({ idempotencyKey: 'change-2', expectedVersion: 1, wholeNumber: 30 }));
 assert.equal(second.body.error, 'settings-version-stale', 'a second admin working from version 1 is told it has moved');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a settings change does not move a running timer: a visit that started before it keeps its version, grace and ceiling', () => {
 const { runtime, start, timer } = visits();
 start('appointment-before');
 const before = timer('appointment-before');
 const shorter = row('grace').lowest.value;
 assert.equal(runtime.call(CHANGE, change({ wholeNumber: shorter })).status, 200);
 const lowerCeiling = row('extension-ceiling').lowest.value;
 assert.equal(runtime.call(CHANGE, change({ idempotencyKey: 'ceiling', setting: 'extension-ceiling', wholeNumber: lowerCeiling, expectedVersion: 2 })).status, 200);
 runtime.advance(MINUTE);
 start('appointment-after');
 start('appointment-before');

 assert.deepEqual(timer('appointment-before'), before, 'heard again after the change, the visit keeps version 1, its deadline and its ceiling');
 const after = timer('appointment-after');
 assert.equal(after.settingsVersion, 3);
 assert.equal(Date.parse(after.dueAt), Date.parse(START) + MINUTE + (minutesOf('wound') + shorter) * MINUTE, 'the next visit is timed with the grace in force');
 assert.equal(after.extensionMinutesLeft, lowerCeiling);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a panic open before a change keeps its window, and a phone that read the old window is given the new one', () => {
 const runtime = runtimeWith();
 const first = runtime.call(ROUTE, press({ idempotencyKey: 'before', appointmentRef: 'appointment-synthetic-1' }));
 const end = Date.parse(String(first.body.locationShareEndsAt));
 assert.equal(end, Date.parse(START) + panicWindowMinutes * MINUTE);
 const longer = row('panic-window').highest.value;
 assert.equal(runtime.call(CHANGE, change({ setting: 'panic-window', wholeNumber: longer })).status, 200);
 runtime.advance(2 * MINUTE);

 const again = runtime.call(ROUTE, press({ idempotencyKey: 'again', appointmentRef: 'appointment-synthetic-1' }));
 assert.deepEqual(again.body, first.body, 'the open panic is answered with the end it already had: not stretched, not cut short');
 const stalePhone = runtime.call(ROUTE, press({ idempotencyKey: 'stale-phone', appointmentRef: 'appointment-synthetic-2' }));
 assert.equal(stalePhone.status, 200, 'a panic is never refused because an admin changed the window');
 assert.equal(Date.parse(String(stalePhone.body.locationShareEndsAt)), Date.parse(START) + 2 * MINUTE + longer * MINUTE, 'it opens the window in force');
 runtime.advance(panicWindowMinutes * MINUTE - 2 * MINUTE);
 const afterFirstEnded = runtime.call(ROUTE, press({ idempotencyKey: 'after', appointmentRef: 'appointment-synthetic-1', locationShareMinutes: longer }));
 assert.notEqual(afterFirstEnded.body.panicRef, first.body.panicRef, 'the first window ended when it always would have');
 assert.equal(raised(runtime).length, 3);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('who changes a field-safety setting is itself a setting only the admin changes, and it always names somebody', () => {
 const runtime = runtimeWith();
 const operator = { role: 'operator', ref: 'party-synthetic-801' };
 const refusedChange = (answer: { body: Record<string, unknown> }, id: string) => assert.deepEqual([answer.body.error, answer.body.message], [id, changeStatement(id)], JSON.stringify(answer.body));
 refusedChange(runtime.call(CHANGE, change({ idempotencyKey: 'op-early' }, operator)), 'setting-change-not-permitted');
 const roles = (fields: Record<string, unknown>, who = {}) => change({ setting: 'settings-changed-by', wholeNumber: undefined, reason: 'The Control Tower operator holds the desk overnight.', ...fields }, who);
 refusedChange(runtime.call(CHANGE, roles({ idempotencyKey: 'nobody', roles: [] })), 'setting-out-of-range');
 refusedChange(runtime.call(CHANGE, roles({ idempotencyKey: 'a-nurse', roles: ['admin', 'nurse'] })), 'setting-out-of-range');
 refusedChange(runtime.call(CHANGE, roles({ idempotencyKey: 'off-register', roles: ['admin', 'desk-lead'] })), 'setting-role-not-on-register');
 assert.equal(runtime.call(CHANGE, roles({ idempotencyKey: 'widen', roles: ['admin', 'operator'] })).status, 200);
 const byOperator = runtime.call(CHANGE, change({ idempotencyKey: 'op-grace', expectedVersion: 2 }, operator));
 assert.equal(byOperator.status, 200, JSON.stringify(byOperator.body));
 refusedChange(runtime.call(CHANGE, roles({ idempotencyKey: 'op-self', roles: ['operator'], expectedVersion: 3 }, operator)), 'setting-change-not-permitted');
 const history = readSettings(runtime).body.history as { setting: string; byRole: string }[];
 assert.deepEqual(history.map(h => [h.setting, h.byRole]), [['settings-changed-by', 'admin'], ['grace', 'operator']]);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a phone that read an older panic window is given the window it sent when the setting says so, and its panic opens either way', () => {
 const runtime = runtimeWith();
 const longer = row('panic-window').highest.value;
 assert.equal(runtime.call(CHANGE, change({ setting: 'panic-window', wholeNumber: longer })).status, 200);
 const inForce = runtime.call(ROUTE, press({ idempotencyKey: 'in-force', appointmentRef: 'appointment-synthetic-1' }));
 assert.equal(Date.parse(String(inForce.body.locationShareEndsAt)), Date.parse(START) + longer * MINUTE, 'by default the window in force');
 assert.equal(runtime.call(CHANGE, change({ idempotencyKey: 'stale', setting: 'stale-panic-window-uses-window-in-force', wholeNumber: undefined, switchedOn: false, expectedVersion: 2 })).status, 200);
 const sent = runtime.call(ROUTE, press({ idempotencyKey: 'sent', appointmentRef: 'appointment-synthetic-2' }));
 assert.equal(sent.status, 200, 'the panic opens');
 assert.equal(Date.parse(String(sent.body.locationShareEndsAt)), Date.parse(START) + panicWindowMinutes * MINUTE, 'with the window the phone sent, which a version of the settings held');
 assert.equal(runtime.call(ROUTE, press({ idempotencyKey: 'never', appointmentRef: 'appointment-synthetic-3', locationShareMinutes: longer * 24 })).body.error, 'window-not-the-declared-one', 'a window no version held is still refused');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
