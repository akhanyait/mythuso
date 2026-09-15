/**
 * A patient's SOS pressed on Safety reaches Core and Care over the bus, and a stand-down reaches both again.
 *
 * Core opens one concern for the SOS, owned by the desk with a nurse behind it, for every door; Care registers the
 * urgent visit and asks its offer desk, with every gate in place, only for a door that offers one. On this runtime
 * the offer desk refuses the service, because packages/catalog/services.json places Thuso SOS in a later phase than
 * Care's seed phase — so no appointment.offered is published, and the offer itself is proven against a contract with
 * the phase moved, in packages/engines/src/care/domain/sos.test.ts. Standing the SOS down closes Core's concern with
 * the outcome closed-loop.json maps the reason to.
 *
 * This file sits beside the engines rather than inside one, because it binds three. Nothing here is a real service.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime } from './runtime/index.ts';
import { engine as safety } from './safety/engine.ts';
import { engine as core } from './core/engine.ts';
import { engine as care } from './care/engine.ts';
import { sosFallbackRole, sosOutcomes, sosOwnerRole, sosSpanMs } from './core/domain/contract.ts';
import { SOS_ROUTES, standDownReasons } from './safety/domain/sos.ts';

const MORNING = '2026-09-15T09:00:00+02:00';
const PATIENT = { role: 'patient', ref: 'subject-synthetic-301', purpose: 'emergency' };
type TowerItem = { loopRef: string; sourceEngine: string; ownerRole: string; stateCode: string; dueBy: string; holder: string };

function world() {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [safety, core, care], dataDirectory: MEMORY, clock: createClock(MORNING) });
 const press = (key: string, fields: Record<string, unknown> = {}) => runtime.call(SOS_ROUTES.raise, { ...PATIENT, fields: { idempotencyKey: key, channel: 'app', conditionTicked: false, zoneId: 'rosebank', callbackAvailable: true, ...fields } });
 const tower = () => runtime.call('GET /v1/core/loops@2', { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'emergency', fields: {} }).body['loops'] as TowerItem[];
 const trail = (kind: string, key: string, engine?: string) => runtime.trail.all().filter(e => e.kind === kind && e.eventKey === key && (engine === undefined || e.engine === engine));
 return { runtime, press, tower, trail };
}

test('an SOS reaches Core as one concern owned by the desk, and Care as an urgent visit asked of its offer desk', () => {
 const { runtime, press, tower, trail } = world();
 const pressed = press('press-1');
 assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
 assert.equal(press('press-1').status, 200, 'the same press retried');

 const [concern, ...others] = tower();
 assert.deepEqual(others, [], 'one SOS is one concern, however often it is pressed under one key');
 assert.deepEqual([concern!.sourceEngine, concern!.ownerRole, concern!.holder], ['safety', sosOwnerRole, 'owner']);
 assert.equal(Date.parse(concern!.dueBy) - Date.parse(MORNING), sosSpanMs, 'the ladder rung closed-loop.json names for an SOS');
 assert.equal(trail('published', 'loop.opened@1').length, 1);

 assert.equal(trail('delivered', 'sos.raised@2', 'care').length, 1, 'Care heard it');
 assert.equal(trail('delivered', 'sos.raised@2', 'core').length, 1, 'Core heard it');
 assert.equal(trail('delivery-failed', 'sos.raised@2').length, 0);
 assert.equal(trail('published', 'appointment.offered@1').length, 0, 'the seed phase does not sell Thuso SOS, so the offer desk offers nobody — and says so in Care\'s store rather than inventing a nurse');

 /* Once the desk has not taken it on, it goes to its fallback, as any concern does. */
 runtime.advance(sosSpanMs);
 assert.equal(tower()[0]!.ownerRole, sosFallbackRole);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a door that sends nobody still opens a concern for the desk, and Care opens nothing for it', () => {
 const { runtime, press, tower, trail } = world();
 press('emergency', { conditionTicked: true });
 assert.equal(tower().length, 1, 'the desk is told somebody was pointed at emergency services');
 assert.equal(trail('delivered', 'sos.raised@2', 'care').length, 1);
 assert.equal(trail('published', 'appointment.offered@1').length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a stand-down closes the desk\'s concern with the outcome its reason maps to, and reaches Care', () => {
 const { runtime, press, tower, trail } = world();
 const sosRef = String(press('press-1').body['sosRef']);
 const [concern] = tower();
 const reason = standDownReasons[0]!;
 runtime.advance(2 * 60_000);
 const stood = runtime.call(SOS_ROUTES.standDown, { ...PATIENT, fields: { idempotencyKey: 'stand-down', sosRef, reasonCode: reason.id } });
 assert.equal(stood.status, 200, JSON.stringify(stood.body));

 const closed = trail('published', 'loop.closed@1').map(e => (JSON.parse(e.body) as { payload: Record<string, unknown> }).payload);
 assert.deepEqual(closed, [{ loopRef: concern!.loopRef, outcomeRef: sosRef, closedByRole: 'patient' }]);
 assert.ok(sosOutcomes.has(reason.id), 'every stand-down reason is mapped');
 assert.deepEqual(tower(), [], 'the concern no longer waits in the Control Tower');
 assert.equal(trail('delivered', 'sos.stood_down@1', 'care').length, 1, 'Care heard it');
 assert.equal(trail('delivery-failed', 'sos.stood_down@1').length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
