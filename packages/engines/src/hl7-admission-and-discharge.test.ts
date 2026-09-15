/**
 * What the two engines that hear the HL7 v2 bridge's events do with them, and nothing more (Wave 5).
 *
 * passport.admission.detected@1 reaches Care alone, and Care withdraws every offer still open for the admitted
 * patient's visits, so no nurse accepts a drive to an empty house; a visit already accepted is left for a person.
 * passport.discharge.received@1 reaches Core alone, and Core opens one follow-up concern per discharge, owned by the
 * role closed-loop.json proposes, pointing at the encounter, on the rung's time, however often the bus delivers it.
 * Record is stood in for by a synthetic publisher, because the Passport that writes the Encounter is its own service
 * and is not on this runtime. Nothing here is a real service.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import care from '../../catalog/care.json' with { type: 'json' };
import roster from '../../catalog/roster.json' with { type: 'json' };
import events from '../../catalog/events.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EngineContext, type RouteKey } from './runtime/index.ts';
import { engine as careEngine } from './care/engine.ts';
import { engine as coreEngine } from './core/engine.ts';
import { dischargeFallbackRole, dischargeOwnerRole, dischargeSpanMs } from './core/domain/contract.ts';

const START = '2026-09-14T09:00:00+02:00';
const P = care.preview;
const WOUND = roster.nurses.filter(n => n.scope.includes('Wound care')).map(n => n.id);
const ADMISSION = 'passport.admission.detected@1';
const DISCHARGE = 'passport.discharge.received@1';
type TowerItem = { loopRef: string; sourceEngine: string; ownerRole: string; stateCode: string; dueBy: string };

function world() {
 const queues: Record<string, ((ctx: EngineContext) => void)[]> = { trust: [], record: [] };
 const publisher = (id: 'trust' | 'record') => defineEngine({ id, routes: {}, subscriptions: {}, store: { schema: '' }, tick: (ctx: EngineContext) => {
  const due = queues[id]!;
  queues[id] = [];
  for (const act of due) act(ctx);
 } });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [careEngine, coreEngine, publisher('trust'), publisher('record')], dataDirectory: MEMORY, clock: createClock(START) });
 const as = (id: 'trust' | 'record', act: (ctx: EngineContext) => void) => { queues[id]!.push(act); runtime.advance(1); };
 as('trust', ctx => { for (const ref of WOUND) ctx.publish('person.trust_updated@2', { badgeTier: 'verified', hardGatesPassed: true }, { subjectRef: ref, purposeOfUse: 'dispatch' }); });
 const record = (key: typeof ADMISSION | typeof DISCHARGE, subjectRef: string, encounterRef: string) =>
  as('record', ctx => { ctx.publish(key, { encounterRef, facilityRef: 'synthetic-general-hospital' }, { subjectRef, purposeOfUse: 'treatment' }); });
 const trail = (kind: string, key: string, engine?: string) => runtime.trail.all().filter(e => e.kind === kind && e.eventKey === key && (engine === undefined || e.engine === engine));
 const tower = () => runtime.call('GET /v1/core/loops@2' as RouteKey, { role: 'ops-desk', ref: 'desk-synthetic-1', purpose: 'treatment', fields: {} }).body['loops'] as TowerItem[];
 return { runtime, record, trail, tower };
}

test('the events name exactly the engines that act on them', () => {
 const subscribers = (type: string) => events.events.find(e => e.type === type && e.version === 1)!.subscribers;
 assert.deepEqual(subscribers('passport.admission.detected'), ['care']);
 assert.deepEqual(subscribers('passport.discharge.received'), ['core']);
});

test('an admission withdraws the offer nobody accepted for the patient\'s visit, and leaves another patient\'s alone', () => {
 const { runtime, record, trail } = world();
 const offered = runtime.call('POST /v1/care/offers@2' as RouteKey, { role: 'dispatcher', ref: 'dispatcher-synthetic-1', purpose: 'dispatch', fields: { idempotencyKey: 'offer-hl7-1', appointmentRef: P.appointmentRef, serviceId: P.serviceId } });
 assert.equal(offered.status, 200, JSON.stringify(offered.body));
 const offerRef = String(offered.body['offerRef']);

 record(ADMISSION, 'subject-somebody-else', 'enc-synthetic-other');
 assert.equal(trail('delivered', ADMISSION, 'care').length, 1);
 const stillOpen = runtime.call('POST /v1/care/offers/{offerRef}/accept@1' as RouteKey, { role: 'nurse', ref: 'N-206', purpose: 'dispatch', fields: { idempotencyKey: 'accept-probe', offerRef } });
 assert.notEqual(stillOpen.body['error'], undefined, 'another nurse is still refused, which says nothing yet');

 record(ADMISSION, P.subjectRef, 'enc-synthetic-admitted');
 assert.equal(trail('delivered', ADMISSION, 'care').length, 2);
 assert.equal(trail('delivery-failed', ADMISSION).length, 0);
 const accepted = runtime.call('POST /v1/care/offers/{offerRef}/accept@1' as RouteKey, { role: 'nurse', ref: P.clinicianRef, purpose: 'dispatch', fields: { idempotencyKey: 'accept-after-admission', offerRef } });
 assert.notEqual(accepted.status, 200, 'the nurse cannot accept a visit to a patient a hospital admitted');
 assert.equal(trail('published', 'appointment.booked@2').length, 0);
 assert.equal(trail('delivered', ADMISSION, 'core').length, 0, 'Core does not hear an admission');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a discharge opens one follow-up concern, owned as closed-loop.json proposes and pointing at the encounter, however often it is delivered', () => {
 const { runtime, record, trail, tower } = world();
 record(DISCHARGE, P.subjectRef, 'enc-synthetic-discharged');
 record(DISCHARGE, P.subjectRef, 'enc-synthetic-discharged');
 const concerns = tower().filter(loop => loop.sourceEngine === 'record');
 assert.equal(concerns.length, 1, 'one discharge is one concern');
 assert.equal(concerns[0]!.ownerRole, dischargeOwnerRole);
 assert.equal(trail('published', 'loop.opened@1').length, 1);
 assert.equal(trail('delivered', DISCHARGE, 'care').length, 0, 'Care does not hear a discharge');

 record(DISCHARGE, P.subjectRef, 'enc-synthetic-second');
 assert.equal(tower().filter(loop => loop.sourceEngine === 'record').length, 2, 'a second discharge is a second concern');

 runtime.advance(dischargeSpanMs);
 assert.ok(tower().some(loop => loop.sourceEngine === 'record' && loop.ownerRole === dischargeFallbackRole), 'a follow-up nobody took on goes to its fallback');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
