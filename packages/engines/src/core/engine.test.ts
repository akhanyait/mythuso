/**
 * Core on the runtime, end to end: concerns and alerts opened by an engine, moved by the clock to their
 * fallback and then up the escalation rota they were opened under, a post nobody is on skipped and written
 * down, refused in the contract's words, changed by an admin without reaching a concern already open, and
 * read by the Control Tower.
 *
 * The rota, its posts and its minutes are read from Core's settings through the settings code, never typed
 * here, so a changed default moves these journeys with it. The event that announces an exhausted concern,
 * loop.exhausted@1, is not in packages/catalog/events.json yet. Against the real contract the journeys
 * prove the concern stays exhausted while the bus refuses the announcement; one journey adds the
 * declaration closed-loop.json asks for to a copy of the loaded contract, and proves the announcement is
 * made once, at the highest severity. Nothing in this file is written into packages/catalog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import coreApi from '../../../catalog/apis/core.json' with { type: 'json' };
import settingsContract from '../../../catalog/settings.json' with { type: 'json' };
import { loadRuntimeContract, type RuntimeContract } from '../runtime/contract.ts';
import { MEMORY, createClock, createRuntime, instant, type RouteKey } from '../runtime/index.ts';
import { snapshotOf } from '../settings/shape.ts';
import { engine } from './engine.ts';
import { EXHAUSTED, contract, highestSeverity, spanForRung } from './domain/contract.ts';
import { MINUTE_MS } from './domain/loops.ts';
import { coreBlock, rotaOf } from './domain/settings.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
/* A Tuesday morning, when every post a role holds is on duty; and the small hours, when the desk is not. */
const START = '2026-09-15T09:00:00+02:00';
const NIGHT = '2026-09-15T01:20:00+02:00';
const DAY = 86_400_000;
/* The deadline a caller chose for its own concern. It is Safety's to work out, not Core's. */
const SPAN = 20 * 60_000;

const TOWER = 'GET /v1/core/loops@2';
const ACKNOWLEDGE = 'POST /v1/core/loops/{loopRef}/acknowledge@3';
const ESCALATE = 'POST /v1/core/loops/{loopRef}/escalate@3';
const CLOSE = 'POST /v1/core/loops/{loopRef}/close@2';
const SETTINGS = 'GET /v1/core/settings@1';
const CHANGE = 'POST /v1/core/setting-changes@1';

const ROTA = rotaOf(snapshotOf(coreBlock, []));
/* The posts a role holds, in order, and the time each holds a concern: its minutes, or the concern's own
   span for the last post, which has nobody after it. */
const HELD = ROTA.posts.filter(post => post.role !== null);
const holds = (post: (typeof ROTA.posts)[number]) => ROTA.stepsMs[ROTA.posts.indexOf(post)] ?? SPAN;
const [DESK, LEAD] = ROTA.posts;
const rotaSetting = coreBlock.items.find(s => s.key === contract.escalation.rotaSetting)!;

const liveRoutes = coreApi.routes.filter(r => !(r as { withdrawn?: unknown }).withdrawn);
const sentence = (id: string) => {
 const found = [...liveRoutes.flatMap(r => r.refusals), ...coreApi.refusals].find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/apis/core.json declares no live refusal ${id}.`);
 return found.statement;
};
const settingSentence = (id: string) => settingsContract.refusals.find(r => r.route === 'change' && r.id === id)!.statement;

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

function world(options: { contract?: RuntimeContract; start?: string } = {}) {
 const runtime = createRuntime({ env: FLAG, engines: [engine], dataDirectory: MEMORY, clock: createClock(options.start ?? START), ...(options.contract ? { contract: options.contract } : {}) });
 const entries = (kind: string, key: string) => runtime.trail.all().filter(e => e.kind === kind && e.eventKey === key);
 const payloads = (key: string) => entries('published', key).map(e => (JSON.parse(e.body) as { payload: Record<string, unknown> }).payload);
 const now = () => runtime.clock.now().getTime();
 const inTime = (ms: number) => instant(new Date(now() + ms));
 let keys = 0;
 const as = (role: string, ref: string | null, purpose: string) => (route: RouteKey, fields: Record<string, unknown>) =>
  runtime.call(route, { role, ref, purpose, fields: { idempotencyKey: `key-${++keys}`, ...fields } });
 const safety = as('engine:safety', null, 'emergency');
 const desk = as('ops-desk', 'desk-synthetic-1', 'emergency');
 const nurse = as('nurse', 'N-205', 'emergency');
 const operator = as('operator', 'O-801', 'emergency');
 const admin = as('admin', 'A-901', 'audit');
 const open = (fields: Record<string, unknown> = {}) => safety('POST /v1/core/loops@1', { sourceEngine: 'safety', ownerRole: 'nurse', fallbackRole: 'ops-desk', dueBy: inTime(SPAN), ...fields });
 const tower = (fields: Record<string, unknown> = {}) => runtime.call(TOWER, { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'emergency', fields });
 const raise = (fields: Record<string, unknown>, role = 'engine:safety') => runtime.call('POST /v1/core/alerts@2', {
  role, purpose: 'treatment', fields: { sourceEngine: 'safety', rung: 2, ownerRole: 'nurse', fallbackRole: 'doctor', dedupeKey: 'concern-synthetic-1', ...fields }
 });
 return { runtime, entries, payloads, now, inTime, safety, desk, nurse, operator, admin, open, tower, raise };
}

type TowerItem = {
 loopRef: string; sourceEngine: string; ownerRole: string; stateCode: string; dueBy: string; holder: string; rotaRungs: number; rotaVersion: number;
 rotaRung?: number; postId?: string; movesUpAt?: string; lastRung?: boolean; alertedPosts?: string[]; skipped?: { post: string; because: string; at: string }[];
 exhaustedAt?: string; alertRef?: string;
};
const itemsOf = (answer: { body: Record<string, unknown> }) => answer.body['loops'] as TowerItem[];
const itemFor = (answer: { body: Record<string, unknown> }, loopRef: string) => itemsOf(answer).find(item => item.loopRef === loopRef)!;

test('an unacknowledged concern goes to its fallback at its deadline, then up the rota post by post, runs out of people after the last, and stays open, first, until it is closed with an outcome', () => {
 assert.ok(HELD.length >= 3 && HELD.length === ROTA.posts.length, 'this journey expects every post of the rota held by a role on the register, the Head of Operations last, on duty on a Tuesday morning');
 const { runtime, entries, payloads, now, inTime, desk, open, tower } = world();
 const opened = open();
 assert.equal(opened.status, 200, JSON.stringify(opened.body));
 const loopRef = String(opened.body['loopRef']);
 assert.equal(payloads('loop.opened@1').length, 1);
 assert.deepEqual([itemsOf(tower())[0]!.holder, itemsOf(tower())[0]!.rotaVersion], ['owner', 1]);

 runtime.advance(SPAN - 1000);
 assert.equal(payloads('loop.escalated@1').length, 0, 'moved before its deadline');
 runtime.advance(1000);
 assert.deepEqual(payloads('loop.escalated@1'), [{ loopRef, reasonCode: contract.escalationReasons.deadlinePassed, ownerRole: 'ops-desk', dueBy: inTime(SPAN) }], 'the fallback is given the time the owner had');
 assert.equal(itemsOf(tower())[0]!.holder, 'fallback', 'the fallback is a rung of its own before the rota, not the rota’s first rung');
 runtime.advance(SPAN);

 HELD.forEach((post, index) => {
  const item = itemsOf(tower())[0]!;
  assert.deepEqual([item.holder, item.rotaRung, item.rotaRungs, item.postId, item.ownerRole], ['post', ROTA.posts.indexOf(post) + 1, ROTA.posts.length, post.id, post.role], `rung ${index + 1}`);
  assert.equal(Date.parse(item.dueBy), now() + holds(post), `${post.id} holds it for its own minutes`);
  if (index < HELD.length - 1) assert.equal(item.movesUpAt, item.dueBy);
  else assert.deepEqual([item.movesUpAt, item.lastRung], [undefined, true], 'nobody on duty comes after the last post a role holds');
  runtime.advance(holds(post));
 });
 assert.deepEqual(payloads('loop.escalated@1').map(p => p['ownerRole']), ['ops-desk', ...HELD.map(post => post.role)]);

 const exhaustedAt = runtime.clock.iso();
 const [first] = itemsOf(tower());
 assert.deepEqual([first!.loopRef, first!.stateCode, first!.exhaustedAt, first!.dueBy], [loopRef, 'exhausted', exhaustedAt, exhaustedAt]);
 assert.equal(first!.skipped, undefined, 'every post was held and on duty on a Tuesday morning, so nothing was skipped on the way to the last');
 assert.equal(first!.ownerRole, HELD.at(-1)!.role, 'the concern ran out of people with the Head of Operations, who holds the last post');
 assert.equal(tower().body['exhaustedCount'], 1);
 /* The announcement is not declared yet: refused by the bus, and the concern is exhausted all the same. */
 assert.equal(entries('published', EXHAUSTED).length, 0);
 assert.ok(entries('refused', EXHAUSTED).length >= 1, 'the refused announcement is not on the trail');

 /* Days pass. Nothing closes it, moves it or quietens it. */
 runtime.advance(DAY);
 runtime.advance(DAY);
 assert.deepEqual(itemsOf(tower())[0], first);
 assert.equal(payloads('loop.escalated@1').length, 1 + HELD.length);
 assert.equal(payloads('loop.closed@1').length, 0);
 assert.ok(entries('refused', EXHAUSTED).length >= 3, 'the announcement is tried again on every tick');

 /* A caller asking for somebody further is told there is nobody, in words that no longer name a missing
    rota. A refusal that recorded a write its route did not keep would be a fault, so a 409 here is the
    audit row of the refused escalation surviving the refusal. */
 const further = desk(ESCALATE, { loopRef, reasonCode: 'owner-not-answering' });
 assert.deepEqual([further.status, further.body], [409, { error: 'no-fallback-left', message: sentence('no-fallback-left') }]);
 assert.doesNotMatch(String(further.body['message']), /no rota|rota exists/);

 const outcome = contract.outcomes.value[0]!.id;
 assert.equal(desk(CLOSE, { loopRef, outcomeCode: '   ', outcomeRef: 'entry-synthetic-outcome' }).body['error'], 'no-outcome', 'a reference is not an outcome: an exhausted concern closes with a code');
 const closed = desk(CLOSE, { loopRef, outcomeCode: outcome, outcomeRef: 'entry-synthetic-outcome' });
 assert.equal(closed.status, 200, JSON.stringify(closed.body));
 assert.deepEqual(payloads('loop.closed@1'), [{ loopRef, outcomeRef: 'entry-synthetic-outcome', closedByRole: 'ops-desk' }]);
 assert.deepEqual(tower().body, { loops: [], exhaustedCount: 0 });
 assert.equal(desk(CLOSE, { loopRef, outcomeCode: outcome }).body['error'], 'loop-closed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a post not on duty when a concern reaches it is skipped, the skip is written down, and the concern goes to the next post that is', () => {
 const { runtime, now, open, tower } = world({ start: NIGHT });
 const loopRef = String(open().body['loopRef']);
 runtime.advance(SPAN);
 runtime.advance(SPAN);
 const reachedAt = runtime.clock.iso();
 const item = itemFor(tower(), loopRef);
 assert.deepEqual([item.holder, item.postId, item.rotaRung, item.ownerRole], ['post', LEAD!.id, 2, LEAD!.role], 'the desk is not on at two in the morning, so the nurse lead is asked');
 assert.deepEqual(item.skipped, [{ post: DESK!.id, because: 'off-duty', at: reachedAt }]);
 assert.equal(Date.parse(item.dueBy), now() + holds(LEAD!), 'the post it went to holds it for its own minutes');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a concern keeps the rota it was opened under when an admin changes it, and the next concern reads the change', () => {
 const { runtime, now, admin, open, tower } = world();
 const before = String(open().body['loopRef']);
 const changed = admin(CHANGE, { setting: contract.escalation.minutesSetting, items: [1, ...ROTA.stepsMs.slice(1).map(ms => ms / MINUTE_MS)], reason: 'The desk answers inside a minute on this shift.', expectedVersion: 1 });
 assert.equal(changed.status, 200, JSON.stringify(changed.body));
 assert.equal(changed.body['settingsVersion'], 2);
 const after = String(open().body['loopRef']);

 runtime.advance(SPAN);
 runtime.advance(SPAN);
 const kept = itemFor(tower(), before);
 const read = itemFor(tower(), after);
 assert.deepEqual([kept.postId, kept.rotaVersion, Date.parse(kept.dueBy) - now()], [DESK!.id, 1, ROTA.stepsMs[0]], 'opened before the change, it keeps the minutes it was opened with');
 assert.deepEqual([read.postId, read.rotaVersion, Date.parse(read.dueBy) - now()], [DESK!.id, 2, MINUTE_MS], 'opened after it, it reads the new ones');

 runtime.advance(MINUTE_MS);
 assert.equal(itemFor(tower(), after).postId, LEAD!.id, 'the new concern moved up after its one minute');
 assert.equal(itemFor(tower(), before).postId, DESK!.id, 'the old concern did not');

 const settings = runtime.call(SETTINGS, { role: 'admin', ref: 'A-901', purpose: 'audit', fields: {} }).body;
 assert.equal(settings['settingsVersion'], 2);
 assert.deepEqual((settings['history'] as { setting: string; byRef: string }[]).map(h => [h.setting, h.byRef]), [[contract.escalation.minutesSetting, 'A-901']]);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a rota with a gap, a window for a post that is not on the rota, and a list of minutes of the wrong length are refused in the contract’s words, and nothing is changed', () => {
 const { runtime, admin } = world();
 const refused = (answer: { body: Record<string, unknown> }, id: string, why: string) => assert.deepEqual([answer.body['error'], answer.body['message']], [id, settingSentence(id)], why);
 const change = (fields: Record<string, unknown>) => admin(CHANGE, { reason: 'Trying a rota the rules must refuse.', expectedVersion: 1, ...fields });
 const rota = contract.escalation.rotaSetting;
 for (const gapped of rotaSetting.guardrail!.forbids) refused(change({ setting: rota, windows: gapped }), 'setting-schedule-leaves-a-gap', `a rota with a gap: ${JSON.stringify(gapped)}`);
 refused(change({ setting: rota, windows: [...ROTA.windows, { post: 'post-not-on-the-rota', days: [...settingsContract.days], from: '08:00', to: '17:00' }] }), 'setting-value-wrong-type', 'hours for a post that is not on the rota');
 refused(change({ setting: rota, windows: [...ROTA.windows, { post: DESK!.id, days: [...settingsContract.days], from: '06:00', to: '22:00', name: 'Kagiso Molefe' }] }), 'setting-value-wrong-type', 'a rota names posts, never people');
 const minutes = contract.escalation.minutesSetting;
 const one = ROTA.stepsMs.map(ms => ms / MINUTE_MS);
 refused(change({ setting: minutes, items: one.slice(1) }), 'setting-out-of-range', 'fewer times than there are posts after the first');
 refused(change({ setting: minutes, items: [...one, one.at(-1)!] }), 'setting-out-of-range', 'a time for the last post, which has nobody after it');
 refused(change({ setting: minutes, items: one.map(() => 0) }), 'setting-not-above-zero', 'a post that holds a concern for nothing');
 assert.equal(runtime.call(SETTINGS, { role: 'admin', ref: 'A-901', purpose: 'audit', fields: {} }).body['settingsVersion'], 1);
 assert.equal(admin(CHANGE, { setting: minutes, items: one, reason: 'x', expectedVersion: 1 }).body['error'], 'setting-unchanged');
 assert.equal(runtime.call(CHANGE, { role: 'operator', ref: 'O-801', purpose: 'audit', fields: { idempotencyKey: 'op', setting: minutes, items: [1, 1], reason: 'x', expectedVersion: 1 } }).body['error'], 'caller-not-allowed', 'the operator reads the rota on the tower and does not change it');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('once the announcement is declared, an exhausted concern is announced once, at the highest severity the contract allows, however often the clock moves', () => {
 const { runtime, entries, payloads, open } = world({ contract: withExhaustedEvent() });
 const loopRef = String(open().body['loopRef']);
 const exhaustedAt = instant(new Date(Date.parse(START) + 2 * SPAN + HELD.reduce((sum, post) => sum + holds(post), 0)));
 for (let i = 0; i < 4; i++) runtime.advance(DAY);
 assert.equal(highestSeverity, contract.severities.ids[contract.severities.ids.length - 1]);
 assert.deepEqual(payloads(EXHAUSTED), [{ loopRef, sourceEngine: 'safety', ownerRole: HELD.at(-1)!.role, exhaustedAt, severityCode: highestSeverity }], 'each deadline is acted on at its own moment, however far the clock jumped');
 assert.equal(entries('refused', EXHAUSTED).length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('only the holder takes a concern on, a concern taken on does not move by itself, and a concern moved by hand goes to its fallback and then up the rota', () => {
 const { runtime, payloads, now, safety, desk, nurse, operator, open } = world();
 const loopRef = String(open().body['loopRef']);
 const doctor = runtime.call(ACKNOWLEDGE, { role: 'doctor', ref: 'D-401', purpose: 'emergency', fields: { idempotencyKey: 'doctor-ack', loopRef } });
 assert.deepEqual(doctor.body, { error: 'not-this-loops-owner', message: sentence('not-this-loops-owner') });
 const care = runtime.call(ACKNOWLEDGE, { role: 'engine:care', purpose: 'emergency', fields: { idempotencyKey: 'care-ack', loopRef } });
 assert.equal(care.body['error'], 'not-this-loops-owner', 'an engine acknowledged a concern that did not come from it');
 const taken = nurse(ACKNOWLEDGE, { loopRef });
 assert.deepEqual(taken.body, { acknowledgedAt: runtime.clock.iso() });

 runtime.advance(SPAN * 3);
 assert.equal(payloads('loop.escalated@1').length, 0, 'an acknowledged concern moved by itself');

 assert.equal(desk(ESCALATE, { loopRef, reasonCode: 'because the desk said so' }).body['error'], 'reason-not-a-code');
 const byEngine = runtime.call(ESCALATE, { role: 'engine:safety', purpose: 'emergency', fields: { idempotencyKey: 'safety-move', loopRef, reasonCode: 'needs-more-authority' } });
 assert.equal(byEngine.status, 200, 'the engine the concern came from may move it');
 assert.deepEqual(byEngine.body, { ownerRole: 'ops-desk', dueBy: instant(new Date(now() + SPAN)) });
 const upTheRota = safety(ESCALATE, { loopRef, reasonCode: 'owner-not-answering' });
 assert.deepEqual(upTheRota.body, { ownerRole: DESK!.role, dueBy: instant(new Date(now() + holds(DESK!))) }, 'after the fallback, the first post of the rota on duty');
 assert.deepEqual(payloads('loop.escalated@1').map(p => p['reasonCode']), ['needs-more-authority', 'owner-not-answering']);

 assert.equal(nurse(ACKNOWLEDGE, { loopRef }).body['error'], 'not-this-loops-owner', 'the owner it had is not the post that holds it now');
 assert.equal(operator(ACKNOWLEDGE, { loopRef }).status, 200, 'the Control Tower operator holds the desk’s post and takes it on');
 assert.deepEqual(payloads('loop.acknowledged@1').map(p => p['acknowledgedByRole']), ['nurse', DESK!.role]);
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
 assert.deepEqual(desk(ACKNOWLEDGE, { loopRef: 'loop-nobody-issued' }).body, { error: 'no-such-loop', message: sentence('no-such-loop') });
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
 runtime.advance(DAY);
 const exhausted = itemsOf(tower())[0]!;
 assert.equal(exhausted.stateCode, 'exhausted');
 assert.deepEqual(payloads('alert.escalated@1').map(p => p['ownerRole']), ['doctor', ...HELD.map(post => post.role)], 'up the rota after its fallback, and no further');

 assert.deepEqual(raise({ rung: 3, snoozeReasonCode: contract.snooze.reasons.value[0]!.id }).body, { error: 'exhausted-not-snoozed', message: sentence('exhausted-not-snoozed') });
 assert.deepEqual(raise({ rung: 1 }).body, { alertRef, suppressed: true });
 runtime.advance(DAY);
 assert.deepEqual(itemsOf(tower())[0], exhausted, 'the clock or a calmer sender changed an exhausted alert');
 assert.equal(payloads('alert.escalated@1').length, 1 + HELD.length);

 assert.deepEqual(itemsOf(tower({ sourceEngine: 'care' })).map(i => i.alertRef), [alertRef], 'a filter hid a concern with nobody left');
 assert.equal(tower({ sourceEngine: 'nobody' }).body['error'], 'unknown-source-engine');

 const close = (outcomeCode: string) => runtime.call(CLOSE, { role: 'doctor', ref: 'D-401', purpose: 'treatment', fields: { idempotencyKey: `close-${outcomeCode.length}`, loopRef: exhausted.loopRef, outcomeCode, outcomeRef: 'entry-synthetic-outcome' } });
 assert.equal(close('  ').body['error'], 'no-outcome');
 assert.equal(close(contract.outcomes.value[0]!.id).status, 200);
 assert.deepEqual(payloads('alert.closed@1'), [{ alertRef, outcomeRef: 'entry-synthetic-outcome', closedByRole: 'doctor' }]);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

/* The Head of Operations joined the vetting register on 15 September 2026 and holds the last post of the rota.
   A concern nobody took on walks to that post in office hours, is held there by the role and nobody else, is
   taken on by the Head of Operations, and cannot be moved further; out of hours the post is skipped and the
   skip says so. The post and its role are read from the rota, never typed. */
test('a concern walks to the Head of Operations post, held by the Head of Operations, who takes it on; out of hours the post is skipped', () => {
 const last = ROTA.posts.at(-1)!;
 assert.ok(last.role !== null, 'the last post of the rota is held by a role on the register');
 const { runtime, now, open, tower, nurse, operator } = world();
 const loopRef = String(open().body['loopRef']);
 runtime.advance(SPAN);
 runtime.advance(SPAN);
 for (const post of ROTA.posts.slice(0, -1)) runtime.advance(holds(post));
 const item = itemFor(tower(), loopRef);
 assert.deepEqual([item.holder, item.postId, item.rotaRung, item.ownerRole, item.lastRung], ['post', last.id, ROTA.posts.length, last.role, true], 'the last post holds it, and nobody comes after it');
 assert.equal(Date.parse(item.dueBy), now() + SPAN, 'the last post is given the concern’s own span');

 const asHead = (route: RouteKey, fields: Record<string, unknown>) => runtime.call(route, { role: last.role!, ref: 'party-synthetic-head', purpose: 'emergency', fields: { idempotencyKey: `head-${route}`, ...fields } });
 assert.equal(nurse(ACKNOWLEDGE, { loopRef }).body['error'], 'not-this-loops-owner');
 assert.equal(operator(ACKNOWLEDGE, { loopRef }).body['error'], 'not-this-loops-owner', 'the desk it passed does not hold it any more');
 const further = asHead(ESCALATE, { loopRef, reasonCode: 'needs-more-authority' });
 assert.deepEqual([further.status, further.body['error']], [409, 'no-fallback-left'], 'there is nobody after the Head of Operations');
 const taken = asHead(ACKNOWLEDGE, { loopRef });
 assert.equal(taken.status, 200, JSON.stringify(taken.body));
 assert.deepEqual(itemFor(tower(), loopRef).stateCode, 'acknowledged');
 runtime.advance(DAY);
 assert.equal(itemFor(tower(), loopRef).exhaustedAt, undefined, 'a concern the Head of Operations took on waits for its outcome');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();

 /* At night the concern reaches the nurse lead after the desk is skipped, and after her the Head of
    Operations is off duty, so it runs out of people with the skip written down. */
 const night = world({ start: NIGHT });
 const late = String(night.open().body['loopRef']);
 night.runtime.advance(SPAN);
 night.runtime.advance(SPAN);
 night.runtime.advance(holds(LEAD!));
 const exhausted = itemFor(night.tower(), late);
 assert.equal(exhausted.stateCode, 'exhausted');
 assert.ok(exhausted.skipped?.some(skip => skip.post === last.id && skip.because === 'off-duty'), 'the Head of Operations was not on duty at night, and the skip is written down');
 night.runtime.close();
});

test('the Control Tower operator closes a concern only with one of the outcomes the closed loop lists, and the events name where it is recorded', () => {
 const { runtime, payloads, open, operator, tower } = world();
 const loopRef = String(open().body['loopRef']);
 assert.deepEqual(operator(CLOSE, { loopRef, outcomeCode: '   ' }).body, { error: 'no-outcome', message: sentence('no-outcome') }, 'a blank code is no outcome');
 assert.deepEqual(operator(CLOSE, { loopRef, outcomeCode: 'sorted it out on the phone' }).body, { error: 'outcome-not-a-code', message: sentence('outcome-not-a-code') });
 assert.equal(runtime.call(CLOSE, { role: 'operator', ref: 'O-801', purpose: 'emergency', fields: { idempotencyKey: 'no-code', loopRef } }).body['error'], 'required-field-missing', 'an outcome code is a field the route needs');
 assert.equal(itemsOf(tower()).length, 1, 'a refused close changed nothing');
 assert.equal(runtime.call(CLOSE, { role: 'carer', ref: 'party-synthetic-carer', purpose: 'emergency', fields: { idempotencyKey: 'carer-close', loopRef, outcomeCode: contract.outcomes.value[0]!.id } }).body['error'], 'caller-not-allowed', 'a carer closes no concern');

 const outcome = contract.outcomes.value[0]!.id;
 const closed = operator(CLOSE, { loopRef, outcomeCode: outcome });
 assert.equal(closed.status, 200, JSON.stringify(closed.body));
 assert.deepEqual(payloads('loop.closed@1'), [{ loopRef, outcomeRef: loopRef, closedByRole: 'operator' }], 'with no reference given, the concern itself is where its outcome is recorded');
 assert.deepEqual(tower().body, { loops: [], exhaustedCount: 0 });
 assert.equal(operator(CLOSE, { loopRef, outcomeCode: outcome }).body['error'], 'loop-closed');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
