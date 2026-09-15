/* The Devices domain without the runtime: the order a reading is refused in, the arithmetic that decides
   clinical weight, what a recall marks, how health is worked out from the settings in force, and a kit's
   deposit and audit. Every expected sentence is read from packages/catalog/apis/devices.json through
   refusal(), so a reworded refusal moves the test with it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, MINUTE, deviceClasses, marks, refusal, type Result } from './contract.ts';
import { calibrationOf, healthOf, recall, register, staleToAnnounce, synced, type Device } from './registry.ts';
import { ask, carriesWeight, clinicalUseOf, link, readingsToMarkForRecall, type AskInput } from './readings.ts';
import { requestLink, withdrawLink, withdrawnFor } from './links.ts';
import { issueKit, reportLoss, returnKit } from './kits.ts';
import { devicesByDefault, devicesInForceOf } from './settings.ts';
import { snapshotOf, type Snapshot } from '../../settings/shape.ts';
import { devicesBlock } from './settings.ts';

const NOW = Date.parse('2026-09-15T09:00:00+02:00');
const iso = (at: number) => new Date(at).toISOString();
const value = <T>(r: Result<T>): T => { if (!r.ok) throw new Error(r.refusal.statement); return r.value; };
const refusedWith = (r: Result<unknown>, id: string) => { assert.equal(r.ok, false); if (!r.ok) assert.deepEqual(r.refusal, refusal(id)); };

const instrument = (over: Partial<Parameters<typeof register>[0]> = {}): Device => value(register({
 deviceRef: 'device-bp', serial: 'MT-BP-4471', model: 'Cuff', firmware: '2.1.0', deviceClass: 'certified', instrumentKind: 'bp-cuff', calibratedOn: '2026-04-01', ...over
}, false, NOW));
const watch = (): Device => value(register({ deviceRef: 'device-watch', serial: 'W-1', model: 'Watch', firmware: '9', deviceClass: 'consumer' }, false, NOW));
const reading = (device: Device, over: Partial<AskInput> = {}): AskInput => ({
 readingRef: 'reading-1', subjectRef: 'subject-synthetic-1', deviceRef: device.deviceRef, metric: 'systolic', unit: 'mmHg',
 takenAt: iso(NOW - 10 * MINUTE), source: device.deviceClass === 'consumer' ? 'own-device' : device.deviceClass === 'simulator' ? 'simulator' : 'kit-instrument',
 quality: 'good', consentState: 'granted', intendedUse: 'clinical', simulated: device.deviceClass === 'simulator', askedByRole: 'nurse', askedByRef: 'party-synthetic-205', ...over
});
const context = (device: Device | undefined, over: { withdrawn?: boolean } = {}) => ({ device, withdrawnForSubject: over.withdrawn ?? false, now: NOW, settings: devicesByDefault });

test('a consumer class is declared without clinical weight, and no combination of the other questions gives a consumer reading weight', () => {
 assert.equal(deviceClasses.find(c => c.id === 'consumer')!.carriesClinicalWeight, false);
 assert.equal(deviceClasses.find(c => c.id === 'simulator')!.carriesClinicalWeight, false);
 for (const source of ['kit-instrument', 'own-device', 'simulator']) for (const quality of ['good', 'acceptable', 'poor']) for (const intendedUse of ['clinical', 'guidance']) {
  assert.equal(carriesWeight({ deviceClass: 'consumer', source, quality, intendedUse, marks: [] }), false);
 }
 assert.equal(carriesWeight({ deviceClass: 'certified', source: 'kit-instrument', quality: 'good', intendedUse: 'clinical', marks: [] }), true);
 assert.equal(carriesWeight({ deviceClass: 'certified', source: 'kit-instrument', quality: 'good', intendedUse: 'clinical', marks: ['recalled'] }), false);
 assert.equal(carriesWeight({ deviceClass: 'certified', source: 'kit-instrument', quality: 'poor', intendedUse: 'clinical', marks: [] }), false);
 assert.equal(carriesWeight({ deviceClass: 'certified', source: 'kit-instrument', quality: 'good', intendedUse: 'guidance', marks: [] }), false);
});

test('a reading is refused without source and quality, after withdrawal, from an unregistered device, as a simulator presented as real, and in the wrong unit', () => {
 const cuff = instrument();
 refusedWith(ask(reading(cuff, { source: undefined }), context(cuff)), 'reading-without-source-and-quality');
 refusedWith(ask(reading(cuff, { quality: 'shaky' }), context(cuff)), 'reading-without-source-and-quality');
 refusedWith(ask(reading(cuff, { consentState: 'withdrawn' }), context(cuff)), 'ingestion-after-withdrawal');
 refusedWith(ask(reading(cuff), context(undefined)), 'device-not-registered');
 const sim = value(register({ deviceRef: 'device-sim', serial: 'SIM-1', model: 'Sim', firmware: '0', deviceClass: 'simulator', instrumentKind: 'thermometer' }, false, NOW));
 refusedWith(ask(reading(sim, { simulated: false, intendedUse: 'guidance' }), context(sim)), 'simulator-as-real');
 refusedWith(ask(reading(sim, { intendedUse: 'clinical' }), context(sim)), 'simulator-as-real');
 assert.deepEqual(value(ask(reading(sim, { intendedUse: 'guidance', metric: 'temperature', unit: '°C' }), context(sim))).marks, ['simulated', 'guidance-only']);
 refusedWith(ask(reading(cuff, { unit: 'kPa' }), context(cuff)), 'unit-not-the-metrics-unit');
 refusedWith(ask(reading(cuff, { metric: 'weight', unit: 'kg' }), context(cuff)), 'metric-not-declared');
 refusedWith(ask(reading(cuff, { source: 'own-device' }), context(cuff)), 'source-not-this-devices');
});

test('a consumer reading meant for the record is refused, and one meant as guidance is kept, marked and never published', () => {
 const mine = watch();
 refusedWith(ask(reading(mine, { metric: 'pulse', unit: 'bpm' }), context(mine)), 'consumer-device-clinical-weight');
 const kept = value(ask(reading(mine, { metric: 'pulse', unit: 'bpm', intendedUse: 'guidance' }), context(mine)));
 assert.deepEqual(kept.marks, ['consumer-device', 'guidance-only']);
 assert.equal(clinicalUseOf(kept), 'guidance-only');
 const linked = value(link(kept, { observationRef: 'Observation/synthetic-1', byRef: 'party-synthetic-205', withdrawnForSubject: false }, NOW));
 assert.equal(linked.publish, false);
 assert.equal(staleToAnnounce(synced(mine, NOW - 2 * DAY), NOW, devicesByDefault.staleAfterMinutes, null), false);
 refusedWith(ask(reading(mine, { metric: 'pulse', unit: 'bpm', intendedUse: 'guidance' }), context(mine, { withdrawn: true })), 'ingestion-after-withdrawal');
});

test('a recall marks every reading taken at or after it took effect, and none before', () => {
 const cuff = instrument();
 const before = value(ask(reading(cuff, { readingRef: 'r-before', takenAt: iso(NOW - 3 * 60 * MINUTE) }), context(cuff)));
 const after = value(ask(reading(cuff, { readingRef: 'r-after', takenAt: iso(NOW - 60 * MINUTE) }), context(cuff)));
 const recalled = value(recall(cuff, { reasonCode: 'manufacturer-notice', effectiveFrom: iso(NOW - 2 * 60 * MINUTE) }, NOW));
 assert.deepEqual(readingsToMarkForRecall([before, after], recalled).map(r => r.readingRef), ['r-after']);
 refusedWith(recall(recalled, { reasonCode: 'damaged', effectiveFrom: iso(NOW) }, NOW), 'already-recalled');
 refusedWith(recall(cuff, { reasonCode: 'it felt wrong', effectiveFrom: iso(NOW) }, NOW), 'recall-reason-not-declared');
 refusedWith(recall(cuff, { reasonCode: 'damaged', effectiveFrom: iso(NOW + MINUTE) }, NOW), 'recall-effective-in-the-future');
 refusedWith(ask(reading(recalled, { takenAt: iso(NOW - MINUTE) }), context(recalled)), 'recalled-device-clinical-weight');
 assert.ok(value(ask(reading(recalled, { takenAt: iso(NOW - MINUTE), intendedUse: 'guidance' }), context(recalled))).marks.includes('recalled'));
 assert.ok(marks.some(m => m.id === 'recalled'));
});

test('health is worked out from the settings in force, and a settings change never marks a reading', () => {
 const cuff = synced(instrument({ calibratedOn: '2025-08-01' }), NOW - 90 * MINUTE, 64);
 const asked = (settings = devicesByDefault) => value(ask(reading(cuff, { takenAt: iso(NOW - 90 * MINUTE) }), { device: cuff, withdrawnForSubject: false, now: NOW, settings }));
 const underDefaults = asked();
 assert.ok(underDefaults.marks.includes('calibration-overdue'));
 const changed: Snapshot = { ...snapshotOf(devicesBlock, []), settingsVersion: 2, values: { ...snapshotOf(devicesBlock, []).values, 'stale-after-minutes': 60, 'calibration-due-days': 90 } };
 const settings = devicesInForceOf(changed);
 assert.deepEqual(asked(settings).marks, underDefaults.marks);
 assert.equal(healthOf(cuff, NOW, devicesByDefault).stateCode, 'reporting');
 assert.equal(healthOf(cuff, NOW, settings).stateCode, 'stale');
 assert.equal(healthOf(cuff, NOW, settings).batteryPercent, 64);
 assert.equal(calibrationOf(instrument({ calibratedOn: '2026-08-01' }), NOW, 30).stateCode, 'in-date');
 assert.equal(calibrationOf(instrument({ calibratedOn: '2025-10-01' }), NOW, 30).stateCode, 'due');
 assert.equal(calibrationOf(watch(), NOW, 30).stateCode, 'not-tracked');
});

test('a wearable link is recorded with its consent and scope and never connects, and a withdrawal stops the patient\'s own readings', () => {
 const asked = value(requestLink({ linkRef: 'link-1', subjectRef: 'subject-synthetic-1', platform: 'apple-health', consentVersion: 1, metrics: ['pulse', 'oxygen'] }, [], NOW));
 refusedWith(requestLink({ linkRef: 'link-2', subjectRef: 'subject-synthetic-1', platform: 'apple-health', consentVersion: 1, metrics: ['pulse'] }, [asked], NOW), 'link-already-requested');
 refusedWith(requestLink({ linkRef: 'link-3', subjectRef: null, platform: 'apple-health', consentVersion: 1, metrics: ['pulse'] }, [], NOW), 'consent-missing');
 refusedWith(requestLink({ linkRef: 'link-4', subjectRef: 'subject-synthetic-1', platform: 'fitbit', consentVersion: 1, metrics: ['pulse'] }, [], NOW), 'platform-not-declared');
 refusedWith(requestLink({ linkRef: 'link-5', subjectRef: 'subject-synthetic-1', platform: 'health-connect', consentVersion: 1, metrics: ['steps'] }, [], NOW), 'metric-not-in-the-scope');
 refusedWith(withdrawLink(asked, 'subject-synthetic-2', NOW), 'link-held-by-another');
 const withdrawn = value(withdrawLink(asked, 'subject-synthetic-1', NOW));
 assert.equal(withdrawnFor([withdrawn], 'subject-synthetic-1', NOW), true);
 refusedWith(withdrawLink(withdrawn, 'subject-synthetic-1', NOW), 'link-already-withdrawn');
});

test('a kit records the deposit in force, refuses a recalled device, and a loss is audited and charges nobody', () => {
 const cuff = instrument();
 const recalled = value(recall(instrument({ deviceRef: 'device-ox', serial: 'MT-OX-2210', instrumentKind: 'pulse-oximeter' }), { reasonCode: 'damaged', effectiveFrom: iso(NOW) }, NOW));
 const deviceOf = (ref: string) => [cuff, recalled].find(d => d.deviceRef === ref);
 refusedWith(issueKit({ kitRef: 'kit-1', kitSerial: 'KIT-1', holderRef: 'party-synthetic-205', deviceRefs: ['device-ox'] }, { deviceOf, openKits: [], settings: devicesByDefault, now: NOW }), 'recalled-device-not-issued');
 const kit = value(issueKit({ kitRef: 'kit-1', kitSerial: 'KIT-1', holderRef: 'party-synthetic-205', deviceRefs: ['device-bp'] }, { deviceOf, openKits: [], settings: devicesByDefault, now: NOW }));
 assert.equal(kit.depositCents, devicesByDefault.kitDepositCents);
 refusedWith(issueKit({ kitRef: 'kit-2', kitSerial: 'KIT-2', holderRef: 'party-synthetic-201', deviceRefs: ['device-bp'] }, { deviceOf, openKits: [kit], settings: devicesByDefault, now: NOW }), 'device-already-in-a-kit');
 refusedWith(reportLoss(kit, { reasonCode: 'stolen', byRole: 'nurse', byRef: 'party-synthetic-201' }, NOW), 'loss-reported-by-another-nurse');
 refusedWith(reportLoss(kit, { reasonCode: undefined, byRole: 'operator', byRef: 'party-synthetic-801' }, NOW), 'loss-without-reason');
 const lost = value(reportLoss(kit, { reasonCode: 'stolen', byRole: 'nurse', byRef: 'party-synthetic-205' }, NOW));
 assert.deepEqual(lost.closed, { code: 'lost', at: NOW, reasonCode: 'stolen' });
 assert.equal(lost.depositCents, kit.depositCents);
 refusedWith(returnKit(lost, NOW), 'kit-already-closed');
 refusedWith(returnKit(undefined, NOW), 'kit-not-issued');
});
