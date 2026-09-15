/* Safety bound to the runtime: the panic route answers, refuses with the contract's own sentences,
   never shares one panic between two nurses, folds a repeat press by the same nurse for the same visit
   into the open panic rather than refusing it, publishes panic.raised@1 without a position, and a
   matched visit code reaches the engine. Every call names its caller, because since 72390a1 the
   runtime refuses an idempotent write from a caller it cannot identify.

   And the field-safety settings an admin changes: refused out of range, without a reason, on a stale
   version and for anybody but an admin; recorded with who, when, from, to and why; published once, and
   replayed rather than repeated under the same key; and never reaching back into a visit or a panic that
   started before the change. The visit is read back from Safety's own store after the runtime closes,
   through packages/engines/src/runtime/store.ts, because no route reads a visit under way yet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MEMORY, createClock, createRuntime, defineEngine, type EngineModule } from '../runtime/index.ts';
import { openDatabase } from '../runtime/store.ts';
import { engine } from './engine.ts';
import { MINUTE } from './domain/rules.ts';
import { defaultTimings, timingRows } from './domain/settings.ts';

const START = '2026-09-14T09:00:00+02:00';
const ROUTE = 'POST /v1/safety/panics@1';
const READ = 'GET /v1/safety/settings@1';
const CHANGE = 'POST /v1/safety/setting-changes@1';
const panicWindowMinutes = defaultTimings.panicWindowMinutes;
const api = JSON.parse(readFileSync(new URL('../../../catalog/apis/safety.json', import.meta.url), 'utf8')) as { routes: { method: string; path: string; refusals: { id: string; statement: string }[] }[] };
const apis = JSON.parse(readFileSync(new URL('../../../catalog/apis.json', import.meta.url), 'utf8')) as { sharedRefusals: { id: string; statement: string }[] };
const statement = (id: string) => api.routes.find(r => r.path === '/v1/safety/panics')!.refusals.find(r => r.id === id)!.statement;
const changeStatement = (id: string) => api.routes.find(r => r.path === '/v1/safety/setting-changes')!.refusals.find(r => r.id === id)!.statement;
const runtimeWith = (extra: EngineModule[] = [], dataDirectory: string = MEMORY) =>
 createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, ...extra], dataDirectory, clock: createClock(START) });
const press = (fields: Record<string, unknown>, who: { role?: string; ref?: string } = {}) => ({
 role: who.role ?? 'nurse', ref: who.ref ?? 'party-synthetic-205', purpose: 'emergency',
 fields: { idempotencyKey: 'press-1', locationShareMinutes: panicWindowMinutes, ...fields }
});
const change = (fields: Record<string, unknown>, who: { role?: string; ref?: string } = {}) => ({
 role: who.role ?? 'admin', ref: who.ref ?? 'party-synthetic-901', purpose: 'audit',
 fields: { idempotencyKey: 'change-1', timing: 'grace', minutes: 45, reason: 'Long dressings were paging the desk.', expectedVersion: 1, ...fields }
});
const readSettings = (runtime: ReturnType<typeof runtimeWith>) => runtime.call(READ, { role: 'admin', ref: 'party-synthetic-901', purpose: 'audit', fields: {} });
const published = (runtime: ReturnType<typeof runtimeWith>, key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key);
const raised = (runtime: ReturnType<typeof runtimeWith>) => published(runtime, 'panic.raised@1');
const row = (id: string) => timingRows.find(r => r.id === id)!;

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

test('Safety hears a visit under way', () => {
 const care = defineEngine({ id: 'care', routes: {}, subscriptions: {}, store: { schema: '' },
  tick: ctx => { ctx.publish('appointment.in_progress@1', { appointmentRef: 'appointment-synthetic-2', visitCodeMatched: true }, { subjectRef: 'subject-synthetic-2', purposeOfUse: 'treatment' }); } });
 const runtime = runtimeWith([care]);
 runtime.advance(1);
 const delivered = runtime.trail.all().filter(entry => entry.kind === 'delivered' && entry.engine === 'safety');
 assert.equal(delivered.length, 1);
 assert.equal(delivered[0].eventKey, 'appointment.in_progress@1');
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
 const settings = answer.body.settings as { timing: string; inForce: unknown; default: unknown; lowest: number; highest: number; unit: string }[];
 assert.deepEqual(settings.map(s => s.timing), timingRows.map(r => r.id));
 for (const s of settings) {
  assert.deepEqual(s.inForce, s.default, `${s.timing} is at its default`);
  assert.deepEqual([s.lowest, s.highest, s.unit], [row(s.timing).lowest.value, row(s.timing).highest.value, row(s.timing).unit]);
 }
 for (const role of ['nurse', 'ops-desk']) assert.equal(runtime.call(READ, { role, ref: 'party-synthetic-1', purpose: 'audit', fields: {} }).body.error, 'caller-not-allowed', role);
 runtime.close();
});

test('a change is refused out of range, without a reason, on a stale version and for anybody but an admin, and nothing is recorded or published', () => {
 const runtime = runtimeWith();
 const refused = (answer: { status: number; body: Record<string, unknown> }, id: string) => {
  assert.equal(answer.body.error, id, JSON.stringify(answer.body));
  assert.equal(answer.body.message, changeStatement(id));
 };
 refused(runtime.call(CHANGE, change({ idempotencyKey: 'low', minutes: row('grace').lowest.value - 1 })), 'setting-out-of-range');
 refused(runtime.call(CHANGE, change({ idempotencyKey: 'high', minutes: row('grace').highest.value + 1 })), 'setting-out-of-range');
 refused(runtime.call(CHANGE, change({ idempotencyKey: 'zero', timing: 'panic-window', minutes: 0 })), 'setting-not-above-zero');
 refused(runtime.call(CHANGE, change({ idempotencyKey: 'no-reason', reason: undefined })), 'setting-change-without-reason');
 refused(runtime.call(CHANGE, change({ idempotencyKey: 'blank-reason', reason: '   ' })), 'setting-change-without-reason');
 refused(runtime.call(CHANGE, change({ idempotencyKey: 'stale', expectedVersion: 2 })), 'settings-version-stale');
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
 const reused = runtime.call(CHANGE, change({ minutes: 90 }));
 assert.equal(reused.body.error, 'idempotency-key-reused', 'a reused key with a different change is refused rather than replayed');

 const read = readSettings(runtime).body;
 assert.equal(read.settingsVersion, 2);
 assert.deepEqual(read.history, [{ settingsVersion: 2, timing: 'grace', from: defaultTimings.graceMinutes, to: 45, reason: 'Long dressings were paging the desk.', byRole: 'admin', byRef: 'party-synthetic-901', at }]);
 assert.equal((read.settings as { timing: string; inForce: number }[]).find(s => s.timing === 'grace')!.inForce, 45);

 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published').length, 0, 'a change is the row in the history and nothing on the bus: no engine acts on one');
 const second = runtime.call(CHANGE, change({ idempotencyKey: 'change-2', expectedVersion: 1, minutes: 30 }));
 assert.equal(second.body.error, 'settings-version-stale', 'a second admin working from version 1 is told it has moved');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a visit that started before a change keeps the grace its deadline is counted from', () => {
 const directory = mkdtempSync(join(tmpdir(), 'mythuso-safety-settings-'));
 try {
  const pending: string[] = [];
  const care = defineEngine({ id: 'care', routes: {}, subscriptions: {}, store: { schema: '' },
   tick: ctx => { for (const appointmentRef of pending.splice(0)) ctx.publish('appointment.in_progress@1', { appointmentRef, visitCodeMatched: true }, { subjectRef: `subject-${appointmentRef}`, purposeOfUse: 'treatment' }); } });
  const runtime = runtimeWith([care], directory);
  pending.push('appointment-before');
  runtime.advance(MINUTE);
  const shorter = row('grace').lowest.value;
  assert.equal(runtime.call(CHANGE, change({ minutes: shorter })).status, 200);
  pending.push('appointment-after', 'appointment-before');
  runtime.advance(MINUTE);
  assert.deepEqual(runtime.faults(), []);
  runtime.close();

  const store = openDatabase(directory, 'safety');
  const rows = store.prepare('SELECT appointment_ref, settings_version, grace_minutes, max_extension_minutes FROM visits_under_way ORDER BY appointment_ref').all() as { appointment_ref: string; settings_version: number; grace_minutes: number; max_extension_minutes: number }[];
  store.close();
  assert.deepEqual(rows.map(r => ({ ...r })), [
   { appointment_ref: 'appointment-after', settings_version: 2, grace_minutes: shorter, max_extension_minutes: defaultTimings.maxExtensionMinutes },
   { appointment_ref: 'appointment-before', settings_version: 1, grace_minutes: defaultTimings.graceMinutes, max_extension_minutes: defaultTimings.maxExtensionMinutes }
  ], 'the visit heard before the change, even when heard again after it, keeps version 1 and the grace it started with');
 } finally {
  rmSync(directory, { recursive: true, force: true });
 }
});

test('a panic open before a change keeps its window, and a phone that read the old window is given the new one', () => {
 const runtime = runtimeWith();
 const first = runtime.call(ROUTE, press({ idempotencyKey: 'before', appointmentRef: 'appointment-synthetic-1' }));
 const end = Date.parse(String(first.body.locationShareEndsAt));
 assert.equal(end, Date.parse(START) + panicWindowMinutes * MINUTE);
 const longer = row('panic-window').highest.value;
 assert.equal(runtime.call(CHANGE, change({ timing: 'panic-window', minutes: longer })).status, 200);
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
