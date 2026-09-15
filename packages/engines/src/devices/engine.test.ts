/* Devices bound to the runtime, journey by journey: register, ingest and go stale; a recall marks the
   readings taken after it and deletes none; ingestion after withdrawal is refused; a consumer reading can
   raise nothing, on the bus or the tick; a unit that is not the measure's is refused; a kit is issued against
   the deposit in force, returned and lost, each in its audit and none of them charging anybody; and a settings
   change moves a device's health and never a reading's marks. Every sentence is the contract's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEMORY, createClock, createRuntime } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { MINUTE, refusal } from './domain/contract.ts';
import { devicesByDefault } from './domain/settings.ts';

const START = '2026-09-15T09:00:00+02:00';
const REGISTER = 'POST /v1/devices/registry@2';
const RECALL = 'POST /v1/devices/registry/{deviceRef}/recall@2';
const HEALTH = 'GET /v1/devices/registry/{deviceRef}/health@2';
const READINGS = 'POST /v1/devices/readings@2';
const OBSERVATION = 'POST /v1/devices/readings/{readingRef}/observation@1';
const LINKS = 'POST /v1/devices/wearable-links@2';
const WITHDRAW = 'POST /v1/devices/wearable-links/{linkRef}/withdraw@1';
const KITS = 'POST /v1/devices/kits@2';
const RETURN = 'POST /v1/devices/kits/{kitRef}/return@2';
const LOSS = 'POST /v1/devices/kits/{kitRef}/loss@2';
const CHANGE = 'POST /v1/devices/setting-changes@1';
const READ = 'GET /v1/devices/settings@1';
const NURSE = { role: 'nurse', ref: 'party-synthetic-205' };
const OPS = { role: 'operator', ref: 'party-synthetic-801' };
const PATIENT = { role: 'patient', ref: 'subject-synthetic-7' };

const runtimeWith = () => createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine], dataDirectory: MEMORY, clock: createClock(START) });
type Runtime = ReturnType<typeof runtimeWith>;
const call = (runtime: Runtime, route: string, who: { role: string; ref: string }, purpose: string, fields: Record<string, unknown>) =>
 runtime.call(route as Parameters<Runtime['call']>[0], { role: who.role, ref: who.ref, purpose, fields });
const refused = (answer: { status: number; body: Record<string, unknown> }, id: string) => {
 assert.equal(answer.body.error, id, JSON.stringify(answer.body));
 assert.equal(answer.body.message, refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const published = (runtime: Runtime, key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key);
const clockNow = (runtime: Runtime, offsetMinutes = 0) => {
 void runtime;
 return (at: number) => new Date(at + offsetMinutes * MINUTE).toISOString().replace('Z', '+00:00');
};

function registerDevice(runtime: Runtime, fields: Record<string, unknown> = {}) {
 const answer = call(runtime, REGISTER, OPS, 'treatment', { serial: 'MT-BP-4471', model: 'Cuff', firmware: '2.1.0', deviceClass: 'certified', instrumentKind: 'bp-cuff', calibratedOn: '2026-04-01', ...fields });
 assert.equal(answer.status, 200, JSON.stringify(answer.body));
 return answer.body.deviceRef as string;
}
const asking = (deviceRef: string, fields: Record<string, unknown> = {}) => ({
 subjectRef: 'subject-synthetic-7', deviceRef, metric: 'systolic', unit: 'mmHg', takenAt: START, source: 'kit-instrument', quality: 'good',
 consentState: 'granted', intendedUse: 'clinical', simulated: false, ...fields
});

test('register, ingest a certified reading through the record, then go stale once for that silence', () => {
 const runtime = runtimeWith();
 const deviceRef = registerDevice(runtime);
 refused(call(runtime, REGISTER, OPS, 'treatment', { serial: 'MT-BP-4471', model: 'Cuff', firmware: '2', deviceClass: 'certified', instrumentKind: 'bp-cuff' }), 'duplicate-serial');
 refused(call(runtime, REGISTER, OPS, 'treatment', { serial: 'X-2', model: 'Cuff', firmware: '2', deviceClass: 'wizard' }), 'device-class-not-declared');

 const asked = call(runtime, READINGS, NURSE, 'treatment', { ...asking(deviceRef), batteryPercent: 71 });
 assert.equal(asked.status, 200, JSON.stringify(asked.body));
 assert.equal(asked.body.clinicalUseCode, 'clinical');
 assert.deepEqual(asked.body.markCodes, []);
 /* Nothing is on the bus until the value is in the record. */
 assert.equal(published(runtime, 'reading.ingested@1').length, 0);
 const linked = call(runtime, OBSERVATION, NURSE, 'treatment', { readingRef: asked.body.readingRef, observationRef: 'Observation/synthetic-1' });
 assert.equal(linked.status, 200, JSON.stringify(linked.body));
 assert.equal(linked.body.published, true);
 const events = published(runtime, 'reading.ingested@1');
 assert.equal(events.length, 1);
 assert.equal(JSON.stringify(events[0]!.body).includes('"value"'), false);
 refused(call(runtime, OBSERVATION, NURSE, 'treatment', { readingRef: asked.body.readingRef, observationRef: 'Observation/synthetic-2' }), 'observation-already-linked');

 const health = call(runtime, HEALTH, NURSE, 'treatment', { deviceRef });
 assert.equal(health.body.stateCode, 'reporting');
 assert.equal(health.body.batteryPercent, 71);
 runtime.advance((devicesByDefault.staleAfterMinutes + 1) * MINUTE);
 assert.equal(call(runtime, HEALTH, OPS, 'treatment', { deviceRef }).body.stateCode, 'stale');
 assert.equal(published(runtime, 'device.stale@1').length, 1);
 runtime.advance(60 * MINUTE);
 assert.equal(published(runtime, 'device.stale@1').length, 1, 'one silence is announced once');
});

test('a recall marks the readings taken after it took effect, deletes none, and takes the weight from a later link', () => {
 const runtime = runtimeWith();
 const deviceRef = registerDevice(runtime);
 runtime.advance(180 * MINUTE);
 const ts = clockNow(runtime);
 const base = Date.parse(START);
 const early = call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { takenAt: ts(base + 30 * MINUTE) }));
 const late = call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { takenAt: ts(base + 150 * MINUTE) }));
 assert.equal(early.status, 200, JSON.stringify(early.body));
 assert.equal(late.status, 200, JSON.stringify(late.body));
 refused(call(runtime, RECALL, OPS, 'audit', { deviceRef, reasonCode: 'damaged', effectiveFrom: ts(base + 240 * MINUTE) }), 'recall-effective-in-the-future');
 const recalled = call(runtime, RECALL, OPS, 'audit', { deviceRef, reasonCode: 'manufacturer-notice', effectiveFrom: ts(base + 60 * MINUTE) });
 assert.equal(recalled.status, 200, JSON.stringify(recalled.body));
 assert.equal(recalled.body.marksAdded, 1);
 assert.equal(published(runtime, 'device.recalled@1').length, 1);
 refused(call(runtime, RECALL, OPS, 'audit', { deviceRef, reasonCode: 'damaged', effectiveFrom: ts(base) }), 'already-recalled');

 const earlyLinked = call(runtime, OBSERVATION, NURSE, 'treatment', { readingRef: early.body.readingRef, observationRef: 'Observation/early' });
 const lateLinked = call(runtime, OBSERVATION, NURSE, 'treatment', { readingRef: late.body.readingRef, observationRef: 'Observation/late' });
 assert.equal(earlyLinked.body.clinicalUseCode, 'clinical');
 assert.equal(lateLinked.status, 200, 'a marked reading is kept and linked, never refused or deleted');
 assert.equal(lateLinked.body.clinicalUseCode, 'guidance-only');
 assert.equal(lateLinked.body.published, false);
 assert.equal(published(runtime, 'reading.ingested@1').length, 1);
 refused(call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { takenAt: ts(base + 170 * MINUTE) })), 'recalled-device-clinical-weight');
 assert.equal(call(runtime, HEALTH, NURSE, 'treatment', { deviceRef }).body.stateCode, 'recalled');
});

test('ingestion after withdrawal is refused, whether the phone says so or Devices has it on record', () => {
 const runtime = runtimeWith();
 const watch = registerDevice(runtime, { serial: 'W-77', deviceClass: 'consumer', instrumentKind: undefined, calibratedOn: undefined });
 const own = (fields: Record<string, unknown> = {}) => asking(watch, { metric: 'pulse', unit: 'bpm', source: 'own-device', intendedUse: 'guidance', ...fields });
 refused(call(runtime, READINGS, PATIENT, 'treatment', own({ consentState: 'withdrawn' })), 'ingestion-after-withdrawal');
 const requested = call(runtime, LINKS, PATIENT, 'treatment', { platform: 'apple-health', consentVersion: 1, metrics: ['pulse'] });
 assert.equal(requested.status, 200, JSON.stringify(requested.body));
 assert.equal(requested.body.stateCode, 'requested-not-connected');
 const beforeWithdrawal = call(runtime, READINGS, PATIENT, 'treatment', own());
 assert.equal(beforeWithdrawal.status, 200, JSON.stringify(beforeWithdrawal.body));
 refused(call(runtime, WITHDRAW, { role: 'patient', ref: 'subject-synthetic-8' }, 'treatment', { linkRef: requested.body.linkRef }), 'link-held-by-another');
 assert.equal(call(runtime, WITHDRAW, PATIENT, 'treatment', { linkRef: requested.body.linkRef }).status, 200);
 refused(call(runtime, READINGS, PATIENT, 'treatment', own()), 'ingestion-after-withdrawal');
 refused(call(runtime, OBSERVATION, PATIENT, 'treatment', { readingRef: beforeWithdrawal.body.readingRef, observationRef: 'Observation/after' }), 'ingestion-after-withdrawal');
});

test('a consumer reading cannot raise anything: refused as clinical, never published as guidance, and its silence announces nothing', () => {
 const runtime = runtimeWith();
 const watch = registerDevice(runtime, { serial: 'W-78', deviceClass: 'consumer', instrumentKind: undefined, calibratedOn: undefined });
 const own = (fields: Record<string, unknown> = {}) => asking(watch, { metric: 'oxygen', unit: '%', source: 'own-device', ...fields });
 refused(call(runtime, READINGS, PATIENT, 'treatment', own()), 'consumer-device-clinical-weight');
 refused(call(runtime, READINGS, PATIENT, 'treatment', own({ source: 'kit-instrument', intendedUse: 'guidance' })), 'source-not-this-devices');
 const guidance = call(runtime, READINGS, PATIENT, 'treatment', own({ intendedUse: 'guidance', quality: 'good' }));
 assert.equal(guidance.status, 200, JSON.stringify(guidance.body));
 assert.deepEqual(guidance.body.markCodes, ['consumer-device', 'guidance-only']);
 const linked = call(runtime, OBSERVATION, PATIENT, 'treatment', { readingRef: guidance.body.readingRef, observationRef: 'Observation/own' });
 assert.equal(linked.body.published, false);
 runtime.advance(8 * 24 * 60 * MINUTE);
 assert.equal(call(runtime, HEALTH, NURSE, 'treatment', { deviceRef: watch }).body.stateCode, 'stale');
 for (const key of ['reading.ingested@1', 'device.stale@1']) assert.equal(published(runtime, key).length, 0, key);
 refused(call(runtime, READINGS, PATIENT, 'treatment', own({ intendedUse: 'guidance', source: undefined })), 'reading-without-source-and-quality');
});

test('a unit that is not the measure\'s, and a measure the record does not hold, are refused', () => {
 const runtime = runtimeWith();
 const deviceRef = registerDevice(runtime, { serial: 'MT-TH-0938', instrumentKind: 'thermometer' });
 refused(call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { metric: 'temperature', unit: '°F' })), 'unit-not-the-metrics-unit');
 refused(call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { metric: 'weight', unit: 'kg' })), 'metric-not-declared');
 assert.equal(call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { metric: 'temperature', unit: '°C' })).status, 200);
});

test('a kit is issued against the deposit in force, returned and lost in its audit, and charges nobody', () => {
 const runtime = runtimeWith();
 const cuff = registerDevice(runtime);
 const oximeter = registerDevice(runtime, { serial: 'MT-OX-2210', instrumentKind: 'pulse-oximeter' });
 call(runtime, RECALL, OPS, 'audit', { deviceRef: oximeter, reasonCode: 'damaged', effectiveFrom: START });
 refused(call(runtime, KITS, OPS, 'audit', { kitSerial: 'KIT-1', holderRef: NURSE.ref, deviceRefs: [cuff, oximeter] }), 'recalled-device-not-issued');
 const issued = call(runtime, KITS, OPS, 'audit', { kitSerial: 'KIT-1', holderRef: NURSE.ref, deviceRefs: [cuff] });
 assert.equal(issued.status, 200, JSON.stringify(issued.body));
 assert.equal(issued.body.depositCents, devicesByDefault.kitDepositCents);
 refused(call(runtime, KITS, OPS, 'audit', { kitSerial: 'KIT-1', holderRef: 'party-synthetic-201', deviceRefs: [cuff] }), 'kit-already-out');
 assert.equal(call(runtime, RETURN, OPS, 'audit', { kitRef: issued.body.kitRef }).status, 200);
 refused(call(runtime, RETURN, OPS, 'audit', { kitRef: issued.body.kitRef }), 'kit-already-closed');

 const again = call(runtime, KITS, OPS, 'audit', { kitSerial: 'KIT-1', holderRef: NURSE.ref, deviceRefs: [cuff] });
 assert.equal(again.status, 200, 'a returned kit may be issued again');
 refused(call(runtime, LOSS, { role: 'nurse', ref: 'party-synthetic-201' }, 'audit', { kitRef: again.body.kitRef, reasonCode: 'stolen' }), 'loss-reported-by-another-nurse');
 refused(call(runtime, LOSS, NURSE, 'audit', { kitRef: again.body.kitRef }), 'loss-without-reason');
 assert.equal(call(runtime, LOSS, NURSE, 'audit', { kitRef: again.body.kitRef, reasonCode: 'stolen' }).status, 200);
 refused(call(runtime, LOSS, NURSE, 'audit', { kitRef: 'kit-nobody-issued', reasonCode: 'stolen' }), 'kit-not-issued');
 /* A loss is audited and nothing else: no event, and the deposit recorded against the kit is untouched. */
 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published' && entry.engine === 'devices' && entry.eventKey !== 'device.recalled@1').length, 0);
});

test('a settings change moves health and never a reading\'s marks, and is refused for anybody but an admin', () => {
 const runtime = runtimeWith();
 const deviceRef = registerDevice(runtime, { serial: 'MT-GL-1157', instrumentKind: 'glucometer', calibratedOn: '2026-01-01' });
 const asked = call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { metric: 'glucose', unit: 'mmol/L' }));
 assert.equal(asked.status, 200, JSON.stringify(asked.body));
 assert.deepEqual(asked.body.markCodes, ['calibration-overdue']);
 runtime.advance(90 * MINUTE);
 assert.equal(call(runtime, HEALTH, NURSE, 'treatment', { deviceRef }).body.stateCode, 'reporting');

 const admin = { role: 'admin', ref: 'party-synthetic-901' };
 /* The binder refuses a role the change route does not name, in apis.json's shared words. */
 const notAdmin = call(runtime, CHANGE, OPS, 'audit', { idempotencyKey: 'c-0', setting: 'stale-after-minutes', wholeNumber: 60, reason: 'Home devices sync hourly.', expectedVersion: 1 });
 assert.equal(notAdmin.body.error, 'caller-not-allowed');
 assert.equal(notAdmin.status, 403);
 const changed = call(runtime, CHANGE, admin, 'audit', { idempotencyKey: 'c-1', setting: 'stale-after-minutes', wholeNumber: 60, reason: 'Home devices sync hourly.', expectedVersion: 1 });
 assert.equal(changed.status, 200, JSON.stringify(changed.body));
 const second = call(runtime, CHANGE, admin, 'audit', { idempotencyKey: 'c-2', setting: 'calibration-due-days', wholeNumber: 90, reason: 'The supplier needs a quarter.', expectedVersion: 2 });
 assert.equal(second.status, 200, JSON.stringify(second.body));
 const health = call(runtime, HEALTH, NURSE, 'treatment', { deviceRef });
 assert.equal(health.body.stateCode, 'stale');
 assert.equal(health.body.settingsVersion, 3);
 const linked = call(runtime, OBSERVATION, NURSE, 'treatment', { readingRef: asked.body.readingRef, observationRef: 'Observation/glucose' });
 assert.equal(linked.body.clinicalUseCode, 'clinical', 'an overdue calibration marks a reading and never takes its weight');
 assert.equal(linked.body.published, true, 'a change made after a reading was asked for takes nothing from it');
 /* The same moment asked about again under the changed settings carries exactly the marks the first did:
    a mark is decided by when the reading was taken and what the device was then, never by a setting. */
 const again = call(runtime, READINGS, NURSE, 'treatment', asking(deviceRef, { metric: 'glucose', unit: 'mmol/L' }));
 assert.equal(again.status, 200, JSON.stringify(again.body));
 assert.deepEqual(again.body.markCodes, asked.body.markCodes);
 assert.equal(call(runtime, READ, admin, 'audit', {}).body.settingsVersion, 3);
 refused(call(runtime, CHANGE, admin, 'audit', { idempotencyKey: 'c-3', setting: 'kit-deposit', wholeNumber: 0, reason: 'Free kits.', expectedVersion: 3 }), 'setting-not-above-zero');
});

test('the Devices store has no column a value could be written into', () => {
 const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
 const columns = [...source.matchAll(/^ ' ([a-z_]+) [A-Z]+/gm)].map(m => m[1]!);
 assert.ok(columns.length > 30);
 for (const column of columns) assert.equal(/(^|_)(value|reading|result|observation)$/.test(column), false, column);
});
