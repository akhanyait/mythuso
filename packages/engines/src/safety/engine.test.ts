/* Safety bound to the runtime: the panic route answers, refuses with the contract's own sentences,
   replays, publishes panic.raised@1 without a position, and a matched visit code reaches the engine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEMORY, createClock, createRuntime, defineEngine, type EngineModule } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { MINUTE, panicWindowMinutes } from './domain/rules.ts';

const START = '2026-09-14T09:00:00+02:00';
const api = JSON.parse(readFileSync(new URL('../../../catalog/apis/safety.json', import.meta.url), 'utf8')) as { routes: { method: string; path: string; refusals: { id: string; statement: string }[] }[] };
const statement = (id: string) => api.routes.find(r => r.path === '/v1/safety/panics')!.refusals.find(r => r.id === id)!.statement;
const runtimeWith = (extra: EngineModule[] = []) =>
 createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, ...extra], dataDirectory: MEMORY, clock: createClock(START) });
const press = (fields: Record<string, unknown>, role = 'nurse') =>
 ({ role, ref: 'party-synthetic-205', purpose: 'emergency', fields: { idempotencyKey: 'press-1', locationShareMinutes: panicWindowMinutes, ...fields } });

test('pressing panic opens the declared window and publishes panic.raised@1, never a position', () => {
 const runtime = runtimeWith();
 const answer = runtime.call('POST /v1/safety/panics@1', press({ appointmentRef: 'appointment-synthetic-1' }));
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 assert.equal(answer.answeredBy, 'engine');
 assert.equal(Date.parse(String(answer.body.locationShareEndsAt)), Date.parse(START) + panicWindowMinutes * MINUTE);
 const published = runtime.trail.all().filter(entry => entry.kind === 'published');
 assert.equal(published.length, 1);
 assert.equal(published[0].eventKey, 'panic.raised@1');
 const body = JSON.parse(published[0].body) as { payload: Record<string, unknown>; purposeOfUse: string };
 assert.deepEqual(Object.keys(body.payload).sort(), ['locationShareEndsAt', 'panicRef', 'raisedByRole']);
 assert.equal(body.payload.raisedByRole, 'nurse');
 assert.equal(body.purposeOfUse, 'emergency');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a window with no end, or one the phone chose, is refused in the route’s own words, and nothing is published', () => {
 const runtime = runtimeWith();
 const zero = runtime.call('POST /v1/safety/panics@1', press({ idempotencyKey: 'k-0', locationShareMinutes: 0 }));
 assert.deepEqual([zero.status, zero.body.error, zero.body.message], [422, 'share-without-end', statement('share-without-end')]);
 const longer = runtime.call('POST /v1/safety/panics@1', press({ idempotencyKey: 'k-1', locationShareMinutes: panicWindowMinutes * 24 }));
 assert.deepEqual([longer.status, longer.body.error, longer.body.message], [422, 'window-not-the-declared-one', statement('window-not-the-declared-one')]);
 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published').length, 0);
 runtime.close();
});

test('the same press twice is one panic, and a patient cannot press a nurse’s panic', () => {
 const runtime = runtimeWith();
 const first = runtime.call('POST /v1/safety/panics@1', press({}));
 const second = runtime.call('POST /v1/safety/panics@1', press({}));
 assert.deepEqual(second.body, first.body);
 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published').length, 1);
 assert.equal(runtime.call('POST /v1/safety/panics@1', press({ idempotencyKey: 'k-p' }, 'patient')).body.error, 'caller-not-allowed');
 runtime.close();
});

test('an unknown visit never stops a panic', () => {
 const runtime = runtimeWith();
 const answer = runtime.call('POST /v1/safety/panics@1', press({ idempotencyKey: 'k-u', appointmentRef: 'appointment-nobody-heard-of' }));
 assert.equal(answer.status, 200);
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
