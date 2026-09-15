/* Safety bound to the runtime: the panic route answers, refuses with the contract's own sentences,
   never shares one panic between two nurses, folds a repeat press by the same nurse for the same visit
   into the open panic rather than refusing it, publishes panic.raised@1 without a position, and a
   matched visit code reaches the engine. Every call names its caller, because since 72390a1 the
   runtime refuses an idempotent write from a caller it cannot identify. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEMORY, createClock, createRuntime, defineEngine, type EngineModule } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { MINUTE, panicWindowMinutes } from './domain/rules.ts';

const START = '2026-09-14T09:00:00+02:00';
const ROUTE = 'POST /v1/safety/panics@1';
const api = JSON.parse(readFileSync(new URL('../../../catalog/apis/safety.json', import.meta.url), 'utf8')) as { routes: { method: string; path: string; refusals: { id: string; statement: string }[] }[] };
const statement = (id: string) => api.routes.find(r => r.path === '/v1/safety/panics')!.refusals.find(r => r.id === id)!.statement;
const runtimeWith = (extra: EngineModule[] = []) =>
 createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, ...extra], dataDirectory: MEMORY, clock: createClock(START) });
const press = (fields: Record<string, unknown>, who: { role?: string; ref?: string } = {}) => ({
 role: who.role ?? 'nurse', ref: who.ref ?? 'party-synthetic-205', purpose: 'emergency',
 fields: { idempotencyKey: 'press-1', locationShareMinutes: panicWindowMinutes, ...fields }
});
const raised = (runtime: ReturnType<typeof runtimeWith>) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === 'panic.raised@1');

test('pressing panic opens the declared window and publishes panic.raised@1, never a position', () => {
 const runtime = runtimeWith();
 const answer = runtime.call(ROUTE, press({ appointmentRef: 'appointment-synthetic-1' }));
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 assert.equal(answer.answeredBy, 'engine');
 assert.equal(Date.parse(String(answer.body.locationShareEndsAt)), Date.parse(START) + panicWindowMinutes * MINUTE);
 const published = raised(runtime);
 assert.equal(published.length, 1);
 const body = JSON.parse(published[0].body) as { payload: Record<string, unknown>; purposeOfUse: string; subjectRef: string };
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
 const published = raised(runtime).map(entry => JSON.parse(entry.body) as { subjectRef: string });
 assert.deepEqual(published.map(event => event.subjectRef).sort(), ['party-synthetic-205', 'party-synthetic-206']);
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
