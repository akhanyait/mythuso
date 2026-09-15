/**
 * A panic pressed on Safety reaches Core over the bus, and Core alerts every post on duty in the rota in
 * force at once: nobody after anybody else, no minute of the rota read, and exhausted rather than walked
 * when nobody it alerted takes it on.
 *
 * It is a rule in packages/catalog/closed-loop.json and not a setting, so this journey changes the minutes
 * an admin may change before a panic is pressed and proves that nothing about the panic moves with them.
 *
 * This file sits beside the engines rather than inside either, because it binds both, and an engine's own
 * directory reaches no other engine. Nothing here is a real service: nobody is paged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime } from './runtime/index.ts';
import { snapshotOf } from './settings/shape.ts';
import { engine as core } from './core/engine.ts';
import { engine as safety } from './safety/engine.ts';
import { contract, panicSpanMs } from './core/domain/contract.ts';
import { everyPostOnDuty } from './core/domain/loops.ts';
import { coreBlock, rotaOf } from './core/domain/settings.ts';
import { panicWindowOf } from './safety/domain/settings.ts';

const MORNING = '2026-09-15T09:00:00+02:00';
const NIGHT = '2026-09-15T02:00:00+02:00';
const DAY = 86_400_000;
const ROTA = rotaOf(snapshotOf(coreBlock, []));

type TowerItem = { loopRef: string; holder: string; ownerRole: string; stateCode: string; dueBy: string; alertedPosts?: string[]; skipped?: { post: string; because: string }[]; movesUpAt?: string; lastRung?: boolean };

function world(start: string) {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [safety, core], dataDirectory: MEMORY, clock: createClock(start) });
 const press = (ref: string, appointmentRef: string, key: string) => runtime.call('POST /v1/safety/panics@1', {
  role: 'nurse', ref, purpose: 'emergency', fields: { idempotencyKey: key, appointmentRef, locationShareMinutes: panicWindowOf([]).minutes }
 });
 const tower = () => runtime.call('GET /v1/core/loops@2', { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'emergency', fields: {} }).body['loops'] as TowerItem[];
 const published = (key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key);
 return { runtime, press, tower, published };
}

test('a panic alerts every post on duty at once, is one concern however often it is pressed, and is exhausted rather than walked when nobody takes it on', () => {
 const { runtime, press, tower, published } = world(MORNING);
 const expected = everyPostOnDuty(ROTA, Date.parse(MORNING));
 assert.ok(expected.alerted.length >= 2, 'more than one post is on duty on a Tuesday morning, so at once is something this journey can see');

 /* Minutes an admin may change, changed before the panic: a panic reads none of them. */
 const changed = runtime.call('POST /v1/core/setting-changes@1', { role: 'admin', ref: 'A-901', purpose: 'audit', fields: {
  idempotencyKey: 'longer', setting: contract.escalation.minutesSetting, items: ROTA.stepsMs.map(() => 60), reason: 'Seeing whether a panic waits on the rota’s minutes.', expectedVersion: 1
 } });
 assert.equal(changed.status, 200, JSON.stringify(changed.body));

 const pressed = press('party-synthetic-205', 'appointment-synthetic-1', 'press-1');
 assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
 assert.equal(press('party-synthetic-205', 'appointment-synthetic-1', 'press-2').status, 200, 'the same nurse pressing again for the same visit');
 const [item, ...others] = tower();
 assert.deepEqual(others, [], 'one panic is one concern');
 assert.deepEqual([item!.holder, item!.alertedPosts, item!.ownerRole], ['every-post', expected.alerted.map(post => post.id), expected.alerted[0]!.role], 'every post on duty, at once');
 assert.deepEqual(item!.skipped?.map(s => [s.post, s.because]) ?? [], expected.skipped.map(s => [s.post, s.because]), 'a post nobody holds or nobody is on is written down, not paged, and a list with nothing skipped says nothing');
 assert.equal(Date.parse(item!.dueBy) - Date.parse(MORNING), panicSpanMs, 'the ladder rung the contract names for a panic, not the minutes an admin changed');
 assert.deepEqual([item!.movesUpAt, item!.lastRung], [undefined, true], 'nobody comes after every post');

 runtime.advance(DAY);
 assert.equal(published('loop.escalated@1').length, 0, 'a panic was walked up the rota');
 assert.equal(tower()[0]!.stateCode, 'exhausted');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a panic at two in the morning alerts the posts on duty then, and any post it alerted takes it on', () => {
 const { runtime, press, tower } = world(NIGHT);
 const expected = everyPostOnDuty(ROTA, Date.parse(NIGHT));
 assert.ok(expected.skipped.some(s => s.because === 'off-duty'), 'a post is off duty at two in the morning');
 press('party-synthetic-205', 'appointment-synthetic-2', 'press-night');
 const [item] = tower();
 assert.deepEqual(item!.alertedPosts, expected.alerted.map(post => post.id));
 assert.deepEqual(item!.skipped?.filter(s => s.because === 'off-duty').map(s => s.post), expected.skipped.filter(s => s.because === 'off-duty').map(s => s.post));
 const holder = expected.alerted[0]!.role!;
 const taken = runtime.call('POST /v1/core/loops/{loopRef}/acknowledge@3', { role: holder, ref: 'party-synthetic-lead', purpose: 'emergency', fields: { idempotencyKey: 'take', loopRef: item!.loopRef } });
 assert.equal(taken.status, 200, JSON.stringify(taken.body));
 runtime.advance(DAY);
 assert.equal(tower()[0]!.stateCode, 'acknowledged', 'a panic somebody took on waits for its outcome');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
