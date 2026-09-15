/**
 * Core on the runtime, end to end: concerns and alerts opened by an engine, moved by the clock to their
 * fallback and no further, refused in the contract's words, and read by the Control Tower.
 *
 * The event that announces an exhausted concern, loop.exhausted@1, is not in packages/catalog/events.json
 * yet. Against the real contract the journeys prove the concern stays exhausted while the bus refuses the
 * announcement; one journey adds the declaration closed-loop.json asks for to a copy of the loaded
 * contract, and proves the announcement is made once, at the highest severity. Nothing in this file is
 * written into packages/catalog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import coreApi from '../../../catalog/apis/core.json' with { type: 'json' };
import { loadRuntimeContract, type RuntimeContract } from '../runtime/contract.ts';
import { MEMORY, createClock, createRuntime, instant, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { EXHAUSTED, contract, highestSeverity, spanForRung } from './domain/contract.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-15T09:00:00+02:00';
const DAY = 86_400_000;
/* The deadline a caller chose for its own concern. It is Safety's to work out, not Core's. */
const SPAN = 20 * 60_000;

const sentence = (id: string) => {
 const found = [...coreApi.routes.flatMap(r => r.refusals), ...coreApi.refusals].find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/apis/core.json declares no refusal ${id}.`);
 return found.statement;
};

function withExhaustedEvent(): RuntimeContract {
 const base = loadRuntimeContract();
 const [type, version] = EXHAUSTED.split('@') as [string, string];
 const events = new Map(base.events);
 events.set(EXHAUSTED, {
  type, version: Number(version), owner: 'core', alert: true, subscribers: ['safety', 'care', 'access'], source: 'packages/engines/src/core/engine.test.ts',
  payload: [
   { field: 'loopRef', type: 'string', required: true }, { field: 'sourceEngine', type: 'string', required: true }, { field: 'ownerRole', type: 'string', required: true },
   { field: 'exhaustedAt', type: 'instant', required: true }, { field: 'severityCode', type: 'string', required: true }, { field: 'alertRef', type: 'string', required: false }
  ]
 });
 return { ...base, events };
}

function world(options: { contract?: RuntimeContract } = {}) {
 const runtime = createRuntime({ env: FLAG, engines: [engine], dataDirectory: MEMORY, clock: createClock(START), ...options });
 const entries = (kind: string, key: string) => runtime.trail.all().filter(e => e.kind === kind && e.eventKey === key);
 const payloads = (key: string) => entries('published', key).map(e => (JSON.parse(e.body) as { payload: Record<string, unknown> }).payload);
 const inTime = (ms: number) => instant(new Date(runtime.clock.now().getTime() + ms));
 let keys = 0;
 const as = (role: string, ref: string | null, purpose: string) => (route: RouteKey, fields: Record<string, unknown>) =>
  runtime.call(route, { role, ref, purpose, fields: { idempotencyKey: `key-${++keys}`, ...fields } });
 const safety = as('engine:safety', null, 'emergency');
 const desk = as('ops-desk', 'desk-synthetic-1', 'emergency');
 const nurse = as('nurse', 'N-205', 'emergency');
 const open = (fields: Record<string, unknown> = {}) => safety('POST /v1/core/loops@1', { sourceEngine: 'safety', ownerRole: 'nurse', fallbackRole: 'ops-desk', dueBy: inTime(SPAN), ...fields });
 const tower = (fields: Record<string, unknown> = {}) => runtime.call('GET /v1/core/loops@1', { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'emergency', fields });
 const raise = (fields: Record<string, unknown>, role = 'engine:safety') => runtime.call('POST /v1/core/alerts@2', {
  role, purpose: 'treatment', fields: { sourceEngine: 'safety', rung: 2, ownerRole: 'nurse', fallbackRole: 'doctor', dedupeKey: 'concern-synthetic-1', ...fields }
 });
 return { runtime, entries, payloads, inTime, safety, desk, nurse, open, tower, raise };
}

type TowerItem = { loopRef: string; sourceEngine: string; ownerRole: string; stateCode: string; dueBy: string; exhaustedAt?: string; alertRef?: string };
const itemsOf = (answer: { body: Record<string, unknown> }) => answer.body['loops'] as TowerItem[];

test('an unacknowledged concern moves to its fallback at its deadline, runs out of people, and stays open, first, until it is closed with an outcome', () => {
 const { runtime, entries, payloads, desk, open, tower } = world();
 const opened = open();
 assert.equal(opened.status, 200, JSON.stringify(opened.body));
 const loopRef = String(opened.body['loopRef']);
 assert.equal(payloads('loop.opened@1').length, 1);

 runtime.advance(SPAN - 1000);
 assert.equal(payloads('loop.escalated@1').length, 0, 'moved before its deadline');
 runtime.advance(1000);
 assert.deepEqual(payloads('loop.escalated@1'), [{ loopRef, reasonCode: contract.escalationReasons.deadlinePassed, ownerRole: 'ops-desk', dueBy: instant(new Date(runtime.clock.now().getTime() + SPAN)) }], 'the fallback is given the time the owner had');

 runtime.advance(SPAN);
 const exhaustedAt = runtime.clock.iso();
 const [first] = itemsOf(tower());
 assert.deepEqual(first, { loopRef, sourceEngine: 'safety', ownerRole: 'ops-desk', stateCode: 'exhausted', dueBy: exhaustedAt, exhaustedAt });
 assert.equal(tower().body['exhaustedCount'], 1);
 /* The announcement is not declared yet: refused by the bus, and the concern is exhausted all the same. */
 assert.equal(entries('published', EXHAUSTED).length, 0);
 assert.ok(entries('refused', EXHAUSTED).length >= 1, 'the refused announcement is not on the trail');

 /* Days pass. Nothing closes it, moves it or quietens it. */
 runtime.advance(DAY);
 runtime.advance(DAY);
 assert.deepEqual(itemsOf(tower())[0], first);
 assert.equal(payloads('loop.escalated@1').length, 1);
 assert.equal(payloads('loop.closed@1').length, 0);
 assert.ok(entries('refused', EXHAUSTED).length >= 3, 'the announcement is tried again on every tick');

 /* A caller asking for somebody further is told there is nobody, in words that name the missing rota. A
    refusal that recorded a write its route did not keep would be a fault, so a 409 here is the audit row
    of the refused escalation surviving the refusal. */
 const further = desk(`POST /v1/core/loops/{loopRef}/escalate@1`, { loopRef, reasonCode: 'owner-not-answering' });
 assert.deepEqual([further.status, further.body], [409, { error: 'no-fallback-left', message: sentence('no-fallback-left') }]);
 assert.match(String(further.body['message']), /rota/);

 assert.equal(desk('POST /v1/core/loops/{loopRef}/close@1', { loopRef, outcomeRef: '   ' }).body['error'], 'no-outcome');
 const closed = desk('POST /v1/core/loops/{loopRef}/close@1', { loopRef, outcomeRef: 'entry-synthetic-outcome' });
 assert.equal(closed.status, 200, JSON.stringify(closed.body));
 assert.deepEqual(payloads('loop.closed@1'), [{ loopRef, outcomeRef: 'entry-synthetic-outcome', closedByRole: 'ops-desk' }]);
 assert.deepEqual(tower().body, { loops: [], exhaustedCount: 0 });
 assert.equal(desk('POST /v1/core/loops/{loopRef}/close@1', { loopRef, outcomeRef: 'entry-synthetic-again' }).body['error'], 'loop-closed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('once the announcement is declared, an exhausted concern is announced once, at the highest severity the contract allows, however often the clock moves', () => {
 const { runtime, entries, payloads, open } = world({ contract: withExhaustedEvent() });
 const loopRef = String(open().body['loopRef']);
 runtime.advance(SPAN);
 runtime.advance(SPAN);
 const exhaustedAt = runtime.clock.iso();
 for (let i = 0; i < 4; i++) runtime.advance(DAY);
 assert.equal(highestSeverity, contract.severities.ids[contract.severities.ids.length - 1]);
 assert.deepEqual(payloads(EXHAUSTED), [{ loopRef, sourceEngine: 'safety', ownerRole: 'ops-desk', exhaustedAt, severityCode: highestSeverity }]);
 assert.equal(entries('refused', EXHAUSTED).length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('only the owner takes a concern on, a concern taken on does not move by itself, and the desk can move it by hand once', () => {
 const { runtime, payloads, safety, desk, nurse, open } = world();
 const loopRef = String(open().body['loopRef']);
 const doctor = runtime.call('POST /v1/core/loops/{loopRef}/acknowledge@1', { role: 'doctor', ref: 'D-401', purpose: 'emergency', fields: { idempotencyKey: 'doctor-ack', loopRef } });
 assert.deepEqual(doctor.body, { error: 'not-this-loops-owner', message: sentence('not-this-loops-owner') });
 const care = runtime.call('POST /v1/core/loops/{loopRef}/acknowledge@1', { role: 'engine:care', purpose: 'emergency', fields: { idempotencyKey: 'care-ack', loopRef } });
 assert.equal(care.body['error'], 'not-this-loops-owner', 'an engine acknowledged a concern that did not come from it');
 const taken = nurse('POST /v1/core/loops/{loopRef}/acknowledge@1', { loopRef });
 assert.deepEqual(taken.body, { acknowledgedAt: runtime.clock.iso() });
 assert.deepEqual(payloads('loop.acknowledged@1'), [{ loopRef, acknowledgedByRole: 'nurse' }]);

 runtime.advance(SPAN * 3);
 assert.equal(payloads('loop.escalated@1').length, 0, 'an acknowledged concern moved by itself');

 assert.equal(desk('POST /v1/core/loops/{loopRef}/escalate@1', { loopRef, reasonCode: 'because the desk said so' }).body['error'], 'reason-not-a-code');
 const byEngine = runtime.call('POST /v1/core/loops/{loopRef}/escalate@1', { role: 'engine:safety', purpose: 'emergency', fields: { idempotencyKey: 'safety-move', loopRef, reasonCode: 'needs-more-authority' } });
 assert.equal(byEngine.status, 200, 'the engine the concern came from may move it');
 assert.deepEqual(byEngine.body, { ownerRole: 'ops-desk', dueBy: instant(new Date(runtime.clock.now().getTime() + SPAN)) });
 assert.deepEqual(payloads('loop.escalated@1').map(p => p['reasonCode']), ['needs-more-authority']);
 assert.equal(safety('POST /v1/core/loops/{loopRef}/escalate@1', { loopRef, reasonCode: 'owner-not-answering' }).body['error'], 'no-fallback-left');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a concern is refused without a real owner, a real fallback, a deadline still to come, or its own engine as the caller', () => {
 const { runtime, desk, open, inTime } = world();
 assert.equal(open({ ownerRole: 'somebody' }).body['error'], 'no-owner');
 assert.equal(open({ ownerRole: 'anonymous' }).body['error'], 'no-owner', 'nobody is waiting on anonymous');
 assert.equal(open({ fallbackRole: 'nurse' }).body['error'], 'no-fallback', 'the owner again is no fallback');
 assert.equal(open({ dueBy: inTime(-1000) }).body['error'], 'deadline-in-the-past');
 assert.equal(open({ sourceEngine: 'care' }).body['error'], 'not-your-concern');
 assert.deepEqual(desk('POST /v1/core/loops/{loopRef}/acknowledge@1', { loopRef: 'loop-nobody-issued' }).body, { error: 'no-such-loop', message: sentence('no-such-loop') });
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an alert is given its rung’s time, is one alert per engine and key while open, goes up a rung but never down, and is snoozed only with a listed reason', () => {
 const { runtime, payloads, raise, tower } = world();
 const first = raise({ recordEntryRef: 'entry-synthetic-1' });
 assert.equal(first.status, 200, JSON.stringify(first.body));
 const alertRef = String(first.body['alertRef']);
 assert.equal(first.body['suppressed'], false);
 const rungTwo = spanForRung(2)!;
 assert.deepEqual(payloads('alert.raised@1'), [{ alertRef, tier: 2, sourceEngine: 'safety', ownerRole: 'nurse', acknowledgeBy: instant(new Date(runtime.clock.now().getTime() + rungTwo)), recordEntryRef: 'entry-synthetic-1' }]);

 assert.deepEqual(raise({}).body, { alertRef, suppressed: true });
 assert.deepEqual(raise({ rung: 1 }).body, { alertRef, suppressed: true });
 assert.equal(payloads('alert.escalated@1').length, 0, 'raised again lower moved the alert');
 assert.deepEqual(raise({ rung: 3 }).body, { alertRef, suppressed: true });
 assert.deepEqual(payloads('alert.escalated@1').map(p => [p['fromTier'], p['toTier'], p['reasonCode']]), [[2, 3, contract.escalationReasons.raisedAgainHigher]]);
 assert.equal(payloads('alert.raised@1').length, 1);

 assert.equal(raise({ snoozeReasonCode: 'busy' }).body['error'], 'snooze-without-reason');
 runtime.advance(60_000);
 assert.deepEqual(raise({ snoozeReasonCode: contract.snooze.reasons.value[0]!.id }).body, { alertRef, suppressed: true });
 const [item] = itemsOf(tower());
 assert.equal(item!.alertRef, alertRef);
 assert.equal(item!.dueBy, instant(new Date(runtime.clock.now().getTime() + Math.min(rungTwo, spanForRung(3)!))), 'a snooze buys one more span of the alert’s own rung');

 assert.equal(raise({ dedupeKey: 'concern-nobody-raised', snoozeReasonCode: contract.snooze.reasons.value[0]!.id }).body['error'], 'nothing-to-snooze');
 assert.equal(raise({ dedupeKey: 'concern-synthetic-2', systolic: 180 }).body['error'], 'reading-in-alert');
 assert.equal(raise({ dedupeKey: 'concern-synthetic-2', rung: contract.ladder.rungs.length + 1 }).body['error'], 'unknown-rung');
 assert.equal(raise({ sourceEngine: 'devices' }, 'engine:devices').body['suppressed'], false, 'another engine’s key is another concern');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an alert that runs out of people is never snoozed, lowered or closed by the clock, is never hidden by a filter, and still needs an outcome to close', () => {
 const { runtime, payloads, raise, tower } = world();
 const alertRef = String(raise({ rung: 3 }).body['alertRef']);
 const span = spanForRung(3)!;
 runtime.advance(span);
 assert.deepEqual(payloads('alert.escalated@1').map(p => [p['ownerRole'], p['reasonCode'], p['fromTier'], p['toTier']]), [['doctor', contract.escalationReasons.deadlinePassed, 3, 3]]);
 runtime.advance(span);
 const exhausted = itemsOf(tower())[0]!;
 assert.equal(exhausted.stateCode, 'exhausted');

 assert.deepEqual(raise({ rung: 3, snoozeReasonCode: contract.snooze.reasons.value[0]!.id }).body, { error: 'exhausted-not-snoozed', message: sentence('exhausted-not-snoozed') });
 assert.deepEqual(raise({ rung: 1 }).body, { alertRef, suppressed: true });
 runtime.advance(DAY);
 assert.deepEqual(itemsOf(tower())[0], exhausted, 'the clock or a calmer sender changed an exhausted alert');
 assert.equal(payloads('alert.escalated@1').length, 1);

 assert.deepEqual(itemsOf(tower({ sourceEngine: 'care' })).map(i => i.alertRef), [alertRef], 'a filter hid a concern with nobody left');
 assert.equal(tower({ sourceEngine: 'nobody' }).body['error'], 'unknown-source-engine');

 const close = (outcomeRef: string) => runtime.call('POST /v1/core/loops/{loopRef}/close@1', { role: 'doctor', ref: 'D-401', purpose: 'treatment', fields: { idempotencyKey: `close-${outcomeRef.length}`, loopRef: exhausted.loopRef, outcomeRef } });
 assert.equal(close('  ').body['error'], 'no-outcome');
 assert.equal(close('entry-synthetic-outcome').status, 200);
 assert.deepEqual(payloads('alert.closed@1'), [{ alertRef, outcomeRef: 'entry-synthetic-outcome', closedByRole: 'doctor' }]);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
