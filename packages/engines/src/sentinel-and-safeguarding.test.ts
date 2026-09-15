/**
 * Sentinel and safeguarding across Devices, Safety and Core on one bus.
 *
 * A reading reaches Sentinel only when Devices publishes it, and Devices publishes only a reading carrying clinical weight:
 * so a consumer reading forms no baseline and a tier raised on it is refused, while a certified reading opens a baseline
 * that says it is not evaluated. A tier three raised by a named clinician opens one Core alert; a tier two opens nothing;
 * tier four is refused. A device Devices announces stale suspends its baselines, a newer reading lifts it, and a recall
 * takes its readings out. A safeguarding report is recorded, not sent, never closes by itself, opens the desk's concern,
 * and never shows the kind, the patient or the reporter to anybody reading the list. A settings change reaches the next
 * baseline and never one already open.
 *
 * This file sits beside the engines rather than inside one, because it binds three. Nothing here is a real service.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime, defineEngine, ok } from './runtime/index.ts';
import clinicalContract from '../../catalog/clinical.json' with { type: 'json' };
import { engine as safety } from './safety/engine.ts';
import { engine as core } from './core/engine.ts';
import { engine as devices } from './devices/engine.ts';
import { MINUTE, recallReasons } from './devices/domain/contract.ts';
import { devicesByDefault } from './devices/domain/settings.ts';
import { safeguardingOwnerRole, sentinelOwnerRole } from './core/domain/contract.ts';
import { SENTINEL_ROUTES, sentinelContract, sentinelRefusal } from './safety/domain/sentinel.ts';
import { sentinelSettingsOf } from './safety/domain/settings.ts';

const MORNING = '2026-09-15T09:00:00+02:00';
const DAY = 1440 * MINUTE;
const NURSE = { role: 'nurse', ref: 'party-synthetic-205' };
const DOCTOR = { role: 'doctor', ref: 'party-synthetic-401' };
const OPS = { role: 'operator', ref: 'party-synthetic-801' };
const ADMIN = { role: 'admin', ref: 'party-synthetic-901' };
const PATIENT = 'subject-synthetic-7';
const OTHER_PATIENT = 'subject-synthetic-8';
const defaults = sentinelSettingsOf([]);
type Who = { role: string; ref: string | null };
type TowerItem = { loopRef: string; sourceEngine: string; ownerRole: string; alertRef?: string };

/* Clinical, standing in (Wave 5): Sentinel's baseline settings wait on a clinical review, and who confirms one is
   Clinical's review-confirmer setting in force, which Safety asks Clinical for. Answered here from the contract's own
   default, so this suite holds Safety's settings routes rather than Clinical's store. */
const clinical = defineEngine({
 id: 'clinical', subscriptions: {}, store: { schema: '' },
 routes: { 'GET /v1/clinical/review-confirmers@2': () => ok({ settingsVersion: 1, confirmers: [...clinicalContract.settings.items.find(s => s.key === clinicalContract.reviews.confirmerSetting)!.default.value] }) }
});

function world() {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [devices, safety, core, clinical], dataDirectory: MEMORY, clock: createClock(MORNING) });
 const call = (route: string, who: Who, purpose: string, fields: Record<string, unknown>) =>
  runtime.call(route as Parameters<typeof runtime.call>[0], { role: who.role, ref: who.ref, purpose, fields });
 let keys = 0;
 const key = () => `key-${++keys}`;

 const register = (deviceClass: 'certified' | 'consumer', serial: string) => {
  const answer = call('POST /v1/devices/registry@2', OPS, 'treatment', deviceClass === 'certified'
   ? { serial, model: 'Oximeter', firmware: '1.0', deviceClass, instrumentKind: 'pulse-oximeter', calibratedOn: '2026-09-01' }
   : { serial, model: 'Watch', firmware: '1.0', deviceClass });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return String(answer.body['deviceRef']);
 };
 /* A reading asked for and linked to where its value went, as the capturer does. */
 const ingest = (deviceRef: string, subjectRef: string, observationRef: string, fields: Record<string, unknown> = {}) => {
  const asked = call('POST /v1/devices/readings@2', NURSE, 'treatment', {
   subjectRef, deviceRef, metric: 'pulse', unit: 'bpm', takenAt: new Date(runtime.clock.now()).toISOString(), source: 'kit-instrument', quality: 'good',
   consentState: 'granted', intendedUse: 'clinical', simulated: false, ...fields
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const linked = call('POST /v1/devices/readings/{readingRef}/observation@1', NURSE, 'treatment', { readingRef: asked.body['readingRef'], observationRef });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  return linked.body['published'] as boolean;
 };
 const state = (subjectRef = PATIENT) => call(SENTINEL_ROUTES.baselines, NURSE, 'treatment', { subjectRef });
 const raise = (recordEntryRef: string, rung: number, who: Who = NURSE, subjectRef = PATIENT, idempotencyKey = key()) =>
  call(SENTINEL_ROUTES.raise, who, 'treatment', { idempotencyKey, subjectRef, recordEntryRef, rung });
 const tower = () => call('GET /v1/core/loops@2', { role: 'ops-desk', ref: 'desk-synthetic-1' }, 'emergency', {}).body['loops'] as TowerItem[];
 return { runtime, call, key, register, ingest, state, raise, tower };
}

const refused = (answer: { status: number; body: Record<string, unknown> }, route: keyof typeof SENTINEL_ROUTES, id: string) => {
 const expected = sentinelRefusal(route, id);
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], expected.statement);
 assert.equal(answer.status, expected.status);
};

test('a baseline is made of certified readings only: a consumer reading forms nothing and raises nothing, and the baseline says it is not evaluated', () => {
 const { runtime, register, ingest, state, raise } = world();
 const watch = register('consumer', 'WATCH-1');
 assert.equal(ingest(watch, PATIENT, 'Observation/watch-1', { source: 'own-device', intendedUse: 'guidance' }), false, 'Devices publishes no consumer reading');
 refused(state(), 'baselines', 'nothing-heard-for-that-patient');
 refused(raise('Observation/watch-1', 1), 'raise', 'no-clinical-weight-behind-it');

 const oximeter = register('certified', 'MT-OX-1');
 assert.equal(ingest(oximeter, PATIENT, 'Observation/ox-1'), true);
 const read = state();
 assert.equal(read.status, 200, JSON.stringify(read.body));
 assert.equal(read.body['evaluationCode'], 'not-evaluated');
 assert.equal(read.body['notEvaluatedReasonCode'], 'no-ratified-rule');
 const [baseline, ...others] = read.body['baselines'] as Record<string, unknown>[];
 assert.deepEqual(others, []);
 assert.deepEqual([baseline!['metric'], baseline!['stateCode'], baseline!['countedSoFar'], baseline!['neededToForm'], baseline!['windowDays']], ['pulse', 'forming', 1, defaults.minimumReadings, defaults.windowDays], 'the consumer reading is in no baseline');
 for (const field of Object.keys(baseline!)) assert.doesNotMatch(field, /^(value|values|reading|readings)$/i, 'no value leaves Sentinel');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('tier four is refused in its own words, a tier off the ladder is refused, and nothing is raised without a named clinician', () => {
 const { runtime, register, ingest, raise, tower } = world();
 ingest(register('certified', 'MT-OX-2'), PATIENT, 'Observation/ox-2');
 refused(raise('Observation/ox-2', 4), 'raise', 'tier-four-not-in-this-build');
 refused(raise('Observation/ox-2', 5), 'raise', 'tier-four-not-in-this-build');
 refused(raise('Observation/ox-2', 0), 'raise', 'rung-not-on-the-sentinel-ladder');
 refused(raise('Observation/ox-2', 3, NURSE, OTHER_PATIENT), 'raise', 'not-this-patients-reading');
 assert.deepEqual(tower(), [], 'a refused tier pages nobody');
 assert.ok(sentinelContract.rungs.every(r => r.rung <= 3) && sentinelContract.tierFour.refused === true);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a tier three raised by hand opens one Core alert owned by the doctor, and a tier two opens nothing', () => {
 const { runtime, register, ingest, raise, state, tower } = world();
 ingest(register('certified', 'MT-OX-3'), PATIENT, 'Observation/ox-3');

 const two = raise('Observation/ox-3', 2);
 assert.equal(two.status, 200, JSON.stringify(two.body));
 assert.deepEqual([two.body['toldCode'], two.body['evaluationCode']], ['nurse-queue', 'not-evaluated']);
 assert.deepEqual(tower(), [], 'a tier two is the nurse\'s own queue');

 const three = raise('Observation/ox-3', 3, DOCTOR, PATIENT, 'three-once');
 assert.equal(three.status, 200, JSON.stringify(three.body));
 assert.equal(three.body['toldCode'], 'core-loop');
 assert.equal(raise('Observation/ox-3', 3, DOCTOR, PATIENT, 'three-once').status, 200, 'the same tier retried');
 const [concern, ...others] = tower();
 assert.deepEqual(others, [], 'one tier raised is one alert');
 assert.deepEqual([concern!.sourceEngine, concern!.ownerRole, Boolean(concern!.alertRef)], ['safety', sentinelOwnerRole, true]);

 const raised = state().body['raised'] as Record<string, unknown>[];
 assert.deepEqual(raised.map(r => [r['rung'], r['raisedByRole']]), [[3, 'doctor'], [2, 'nurse']], 'newest first, by role and never by name');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a device announced stale suspends its baselines until a newer reading, and a recall takes its readings out', () => {
 const { runtime, call, register, ingest, raise, state } = world();
 const oximeter = register('certified', 'MT-OX-4');
 ingest(oximeter, PATIENT, 'Observation/ox-4a');
 runtime.advance(devicesByDefault.staleAfterMinutes * MINUTE + MINUTE);
 let baseline = (state().body['baselines'] as Record<string, unknown>[])[0]!;
 assert.equal(baseline['stateCode'], 'suspended', 'Devices announced it under its own interval, and Sentinel suspended');
 assert.ok(typeof baseline['suspendedSince'] === 'string');

 ingest(oximeter, PATIENT, 'Observation/ox-4b');
 baseline = (state().body['baselines'] as Record<string, unknown>[])[0]!;
 assert.deepEqual([baseline['stateCode'], baseline['suspendedSince'], baseline['countedSoFar']], ['forming', null, 2], 'a newer reading lifts the suspension');

 const recalled = call('POST /v1/devices/registry/{deviceRef}/recall@2', OPS, 'audit', { deviceRef: oximeter, reasonCode: recallReasons[0]!.id, effectiveFrom: new Date(runtime.clock.now()).toISOString() });
 assert.equal(recalled.status, 200, JSON.stringify(recalled.body));
 baseline = (state().body['baselines'] as Record<string, unknown>[])[0]!;
 assert.deepEqual([baseline['countedSoFar'], baseline['leftByRecall']], [0, 2], 'every reading from the recalled device left, and none was deleted');
 refused(raise('Observation/ox-4a', 3), 'raise', 'reading-left-by-recall');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a safeguarding report is recorded, not sent, never closes by itself, opens the desk\'s concern, and shows nobody the kind, the patient or the reporter', () => {
 const { runtime, call, key, tower } = world();
 const report = (fields: Record<string, unknown>, who: Who = NURSE) => call(SENTINEL_ROUTES.report, who, 'treatment', { idempotencyKey: key(), subjectRef: PATIENT, ...fields });

 refused(report({ groupCode: 'child', categoryCode: 'neglect', narrative: 'what I saw' }), 'report', 'safeguarding-keeps-no-narrative');
 refused(report({ categoryCode: 'neglect' }), 'report', 'safeguarding-group-not-declared');
 refused(report({ groupCode: 'child', categoryCode: 'a bruise' }), 'report', 'safeguarding-category-not-declared');

 const recorded = report({ groupCode: 'child', categoryCode: 'neglect' });
 assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
 assert.deepEqual([recorded.body['stateCode'], recorded.body['statutoryCode'], recorded.body['statutoryReasonCode'], recorded.body['heldForCode']],
  ['open', 'not-sent', 'not-integrated', sentinelContract.safeguarding.officer.heldForCode]);

 const [concern, ...others] = tower();
 assert.deepEqual(others, []);
 assert.deepEqual([concern!.sourceEngine, concern!.ownerRole], ['safety', safeguardingOwnerRole]);

 runtime.advance(30 * DAY);
 const list = call(SENTINEL_ROUTES.reports, OPS, 'audit', {});
 assert.equal(list.status, 200, JSON.stringify(list.body));
 const [row] = list.body['items'] as Record<string, unknown>[];
 assert.deepEqual([row!['stateCode'], row!['statutoryCode']], ['open', 'not-sent'], 'a month later it is still open and still not sent');
 assert.deepEqual(Object.keys(row!).sort(), ['ageMinutes', 'groupCode', 'heldForCode', 'recordedAt', 'reportRef', 'stateCode', 'statutoryCode', 'statutoryReasonCode']);

 refused(call(SENTINEL_ROUTES.reports, { role: 'guardian', ref: 'party-synthetic-guardian' }, 'audit', {}), 'reports', 'guardian-told-nothing-of-safeguarding');
 assert.equal(call(SENTINEL_ROUTES.reports, { role: 'patient', ref: PATIENT }, 'audit', {}).body['error'], 'caller-not-allowed', 'the person a report is about reads no list of them');
 refused(call(SENTINEL_ROUTES.reports, OPS, 'audit', { subjectRef: PATIENT }), 'reports', 'safeguarding-list-takes-no-filter');

 const published = runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'safeguarding.reported@2');
 assert.equal(published.length, 1);
 assert.doesNotMatch(published[0]!.body, /neglect|child|party-synthetic-205|subject-synthetic-7/, 'the bus carries the report and nothing else');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('a settings change reaches the next baseline and never rewrites one already open, and a doctor reviews the value in force', () => {
 const { runtime, call, key, register, ingest, state } = world();
 const oximeter = register('certified', 'MT-OX-5');
 ingest(oximeter, PATIENT, 'Observation/ox-5a');
 const before = (state().body['baselines'] as Record<string, unknown>[])[0]!;

 const read = call('GET /v1/safety/settings@4', DOCTOR, 'audit', {});
 assert.equal(read.status, 200, JSON.stringify(read.body));
 const nextMinimum = defaults.minimumReadings - 1;
 const changed = call('POST /v1/safety/setting-changes@2', ADMIN, 'audit', {
  idempotencyKey: key(), setting: 'sentinel-baseline-minimum-readings', wholeNumber: nextMinimum, reason: 'A synthetic test of a change.', expectedVersion: read.body['settingsVersion']
 });
 assert.equal(changed.status, 200, JSON.stringify(changed.body));

 ingest(oximeter, PATIENT, 'Observation/ox-5b');
 ingest(oximeter, OTHER_PATIENT, 'Observation/ox-5c');
 const after = (state().body['baselines'] as Record<string, unknown>[])[0]!;
 assert.deepEqual([after['neededToForm'], after['settingsVersion']], [before['neededToForm'], before['settingsVersion']], 'the open baseline keeps what it was opened under');
 const other = (state(OTHER_PATIENT).body['baselines'] as Record<string, unknown>[])[0]!;
 assert.deepEqual([other['neededToForm'], other['settingsVersion']], [nextMinimum, changed.body['settingsVersion']]);

 const reviewed = call('POST /v1/safety/setting-reviews@2', DOCTOR, 'audit', { idempotencyKey: key(), setting: 'sentinel-baseline-window-days', settingsVersion: 1, reason: 'A synthetic test of a review.' });
 assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
