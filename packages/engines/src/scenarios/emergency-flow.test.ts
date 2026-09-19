/**
 * The emergency path end to end, on one bus: GilbertOne reads a message as an emergency, the press that
 * follows reaches Core as a concern owned by the desk and Care as an urgent visit, and a stand-down closes
 * what was opened. Then the quieter half of the same duty: a visit under way is timed by Safety from
 * appointment.in_progress@2, and when its service's duration and the grace in force run out the timer goes
 * overdue to the desk — while no engine is asked for a concern, because nothing on this bus binds
 * checkin.overdue@1 and the desk queue is where an overdue lives.
 *
 * The classifier is the real one, packages/gilbertone/src/engine.ts, imported by path the way the apps
 * import it, and the term is held to packages/catalog/gilbert-emergency-terms.json — the versioned list
 * CLAUDE.md says is the only place an emergency term changes. This file sits beside the engines rather
 * than inside one, because it binds four. Nothing here is a real service: no message is sent, nobody is
 * dispatched and no visit happens.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gilbertEmergencies from '../../../catalog/gilbert-emergency-terms.json' with { type: 'json' };
import roster from '../../../catalog/roster.json' with { type: 'json' };
import services from '../../../catalog/services.json' with { type: 'json' };
import careContract from '../../../catalog/care.json' with { type: 'json' };
import clinicalContract from '../../../catalog/clinical.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, ok, type EngineContext, type RouteKey } from '../runtime/index.ts';
import { buildResponse } from '../../../gilbertone/src/engine.ts';
import { engine as care } from '../care/engine.ts';
import { engine as safety } from '../safety/engine.ts';
import { engine as core } from '../core/engine.ts';
import { sosFallbackRole, sosOutcomes, sosOwnerRole, sosSpanMs } from '../core/domain/contract.ts';
import { SOS_ROUTES, standDownReasons } from '../safety/domain/sos.ts';
import { MINUTE } from '../safety/domain/rules.ts';
import { defaultTimings } from '../safety/domain/settings.ts';

const SOS_MORNING = '2026-09-15T09:00:00+02:00';
const CARE_MORNING = '2026-09-14T09:00:00+02:00';
const PATIENT = { role: 'patient', ref: 'subject-synthetic-301', purpose: 'emergency' };
const P = careContract.preview;
const DISPATCHER = 'dispatcher-synthetic-1';
const DESK = { role: 'operator', ref: 'party-synthetic-801', purpose: 'emergency' };
const WOUND = roster.nurses.filter(n => n.scope.includes('Wound care')).map(n => n.id);
type TowerItem = { loopRef: string; sourceEngine: string; ownerRole: string; stateCode: string; dueBy: string; holder: string };

/* Safety, Core and Care as they run: the SOS world of src/sos-reaches-core-and-care.test.ts, kept here so the
   classifier's answer and the press that follows it are one story. */
function sosWorld() {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [safety, core, care], dataDirectory: MEMORY, clock: createClock(SOS_MORNING) });
 const press = (key: string, fields: Record<string, unknown> = {}) => runtime.call(SOS_ROUTES.raise, { ...PATIENT, fields: { idempotencyKey: key, channel: 'app', conditionTicked: false, zoneId: 'rosebank', callbackAvailable: true, ...fields } });
 const tower = () => runtime.call('GET /v1/core/loops@2', { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'emergency', fields: {} }).body['loops'] as TowerItem[];
 const trail = (kind: string, key: string, engine?: string) => runtime.trail.all().filter(e => e.kind === kind && e.eventKey === key && (engine === undefined || e.engine === engine));
 return { runtime, press, tower, trail };
}

/* Care, Safety and Core together with Verify, the record and Access stood in for the way Care's own suite stands
   them in, so a visit is offered, accepted and started through the real chain and Safety hears it on the bus. */
function visitWorld() {
 const queues: Record<string, ((ctx: EngineContext) => void)[]> = { trust: [], record: [], access: [] };
 const publisher = (id: string) => defineEngine({ id, routes: {}, subscriptions: {}, store: { schema: '' }, tick: (ctx: EngineContext) => {
  const due = queues[id]!;
  queues[id] = [];
  for (const act of due) act(ctx);
 } });
 const clinical = defineEngine({
  id: 'clinical', subscriptions: {}, store: { schema: '' },
  routes: { 'GET /v1/clinical/review-confirmers@2': () => ok({ settingsVersion: 1, confirmers: [...clinicalContract.settings.items.find(s => s.key === clinicalContract.reviews.confirmerSetting)!.default.value] }) }
 });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [care, safety, core, clinical, publisher('trust'), publisher('record'), publisher('access')], dataDirectory: MEMORY, clock: createClock(CARE_MORNING) });
 const as = (id: 'trust' | 'record' | 'access', act: (ctx: EngineContext) => void) => { queues[id]!.push(act); runtime.advance(1); };
 /* Verify, standing in: every wound-care nurse holds a current badge, and nothing says which one else. */
 as('trust', ctx => { for (const ref of WOUND) ctx.publish('person.trust_updated@2', { badgeTier: 'verified', hardGatesPassed: true }, { subjectRef: ref, purposeOfUse: 'dispatch' }); });

 const nurse = (route: RouteKey, ref: string, purpose: string, fields: Record<string, unknown>) => runtime.call(route, { role: 'nurse', ref, purpose, fields });
 const startVisit = () => {
  const offered = runtime.call('POST /v1/care/offers@2', { role: 'dispatcher', ref: DISPATCHER, purpose: 'dispatch', fields: { idempotencyKey: 'offer-1', appointmentRef: P.appointmentRef, serviceId: P.serviceId } });
  assert.equal(offered.status, 200, JSON.stringify(offered.body));
  const accepted = nurse('POST /v1/care/offers/{offerRef}/accept@1', P.clinicianRef, 'dispatch', { idempotencyKey: 'accept-1', offerRef: String(offered.body['offerRef']) });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const started = nurse('POST /v1/care/visits/{appointmentRef}/start@1', P.clinicianRef, 'treatment', { appointmentRef: P.appointmentRef, visitCode: P.visitCode });
  assert.equal(started.status, 200, JSON.stringify(started.body));
 };
 const published = (key: string) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === key);
 const timer = () => runtime.call('GET /v1/safety/checkins@1', { role: 'nurse', ref: P.clinicianRef, purpose: 'dispatch', fields: { appointmentRef: P.appointmentRef } }).body as { checkinRef: string; stateCode: string; dueAt: string };
 const queue = () => runtime.call('GET /v1/safety/desk-queue@1', { ...DESK, fields: {} }).body['items'] as Record<string, unknown>[];
 const tower = () => runtime.call('GET /v1/core/loops@2', { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'emergency', fields: {} }).body['loops'] as TowerItem[];
 return { runtime, nurse, startVisit, published, timer, queue, tower };
}

test('a chest-pain message is classified an emergency, and the press that follows opens one concern for the desk that a stand-down closes', () => {
 const read = buildResponse('chest pain');
 assert.deepEqual([read.classification, read.route, read.requiresConfirmation], ['emergency', 'emergency', false]);
 assert.deepEqual(read.suggestedActions, ['call_emergency_services', 'seek_urgent_help']);
 const group = gilbertEmergencies.groups.find(g => g.id === 'chest-pain');
 assert.ok(group, 'the versioned list still holds the chest-pain group the classifier reads');
 assert.ok(group.words.includes('chest pain'), 'and the term inside it');

 const { runtime, press, tower, trail } = sosWorld();
 const pressed = press('press-1');
 assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
 assert.equal(press('press-1').status, 200, 'the same press retried');

 const [concern, ...others] = tower();
 assert.deepEqual(others, [], 'one SOS is one concern, however often it is pressed under one key');
 assert.deepEqual([concern!.sourceEngine, concern!.ownerRole, concern!.holder], ['safety', sosOwnerRole, 'owner']);
 assert.equal(Date.parse(concern!.dueBy) - Date.parse(SOS_MORNING), sosSpanMs, 'the ladder rung closed-loop.json names for an SOS');
 assert.equal(trail('published', 'loop.opened@1').length, 1);
 assert.equal(trail('delivered', 'sos.raised@2', 'core').length, 1, 'Core heard it');
 assert.equal(trail('delivered', 'sos.raised@2', 'care').length, 1, 'Care heard it');
 assert.equal(trail('delivery-failed', 'sos.raised@2').length, 0);
 assert.equal(trail('published', 'appointment.offered@1').length, 0, 'the seed phase does not sell Thuso SOS, so the offer desk offers nobody');

 const sosRef = String(pressed.body['sosRef']);
 const reason = standDownReasons[0]!;
 runtime.advance(2 * MINUTE);
 const stood = runtime.call(SOS_ROUTES.standDown, { ...PATIENT, fields: { idempotencyKey: 'stand-down', sosRef, reasonCode: reason.id } });
 assert.equal(stood.status, 200, JSON.stringify(stood.body));
 const closed = trail('published', 'loop.closed@1').map(e => (JSON.parse(e.body) as { payload: Record<string, unknown> }).payload);
 assert.deepEqual(closed, [{ loopRef: concern!.loopRef, outcomeRef: sosRef, closedByRole: 'patient' }]);
 assert.ok(sosOutcomes.has(reason.id), 'every stand-down reason is mapped');
 assert.deepEqual(tower(), [], 'the concern no longer waits in the Control Tower');
 assert.equal(trail('delivered', 'sos.stood_down@1', 'care').length, 1, 'Care heard the stand-down');
 assert.ok(sosFallbackRole, 'the desk has a fallback behind it');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a visit under way is timed by its own service and goes overdue to the desk, and no engine is asked for a concern', () => {
 const { runtime, startVisit, published, timer, queue, tower } = visitWorld();
 const startedAt = runtime.clock.now().getTime();
 startVisit();
 assert.equal(published('appointment.in_progress@2').length, 1, 'Care announced the visit under way');

 const watch = timer();
 assert.equal(watch.stateCode, 'running', 'Safety heard it on the bus and started the timer');
 const duration = services.find(s => s.id === P.serviceId)!.duration;
 assert.equal(Date.parse(watch.dueAt), startedAt + (duration + defaultTimings.graceMinutes) * MINUTE, 'the service\'s duration and the grace in force');

 runtime.advance(Date.parse(watch.dueAt) - runtime.clock.now().getTime());
 const overdue = published('checkin.overdue@1').map(e => (JSON.parse(e.body) as { payload: Record<string, unknown> }).payload);
 assert.deepEqual(overdue, [{ checkinRef: watch.checkinRef, appointmentRef: P.appointmentRef, overdueSince: watch.dueAt }]);

 const [waiting] = queue();
 assert.deepEqual([waiting!['kind'], waiting!['reference'], waiting!['open']], ['overdue', watch.checkinRef, true], 'the desk queue holds the overdue');
 assert.deepEqual(tower(), [], 'nothing on this bus binds checkin.overdue@1, so an overdue pages no concern: the desk queue is where it lives');
 assert.equal(runtime.trail.all().filter(e => e.kind === 'delivered' && e.eventKey === 'checkin.overdue@1').length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
