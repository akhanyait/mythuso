import { useSyncExternalStore } from 'react';
import { DAY, MINUTE, devicesContract, instrumentKindOf, type Result } from '../../../../packages/engines/src/devices/domain/contract.ts';
import { healthOf, recall, register, synced, type Device, type Health } from '../../../../packages/engines/src/devices/domain/registry.ts';
import { ask, clinicalUseOf, link, readingsToMarkForRecall, withMark, type Reading } from '../../../../packages/engines/src/devices/domain/readings.ts';
import { requestLink, withdrawLink, type Link } from '../../../../packages/engines/src/devices/domain/links.ts';
import { issueKit, type Kit } from '../../../../packages/engines/src/devices/domain/kits.ts';
import { kit as kitInstruments } from './capture';
import { devicesSettingsNow, useSettingsHistories } from './settings';

/* Thuso Kit's registry in the web preview: one store, in this tab's memory and nowhere else.
 *
 * Every rule is the engine's. This file holds the devices, the readings Devices was asked about, the kits and
 * the wearable link requests, and hands every act to packages/engines/src/devices/domain. Nothing is written
 * to the browser's storage, so a reload forgets a recall made here, and the screens say so in the contract's
 * sentence.
 *
 * THE REGISTRY IS SEEDED BY RUNNING THE ENGINE AT EARLIER TIMES. The six instruments are the kit's own from
 * lib/capture.ts, registered a month ago and synced at different moments since; a reading or two was asked
 * about and linked before one of them was recalled. The stale glucometer, the recalled oximeter and the marked
 * reading are not flags typed onto rows: each is what the domain answers for a device synced or recalled at
 * that time, so none of it can disagree with the rules.
 *
 * NO VALUE IS HELD. A Reading here is everything Devices knows about one — where it came from, the sample, its
 * marks and where in the record it went — and never the number. The numbers a nurse sees on the kit's own queue
 * are that screen's invented readings, which carry their own provenance.
 *
 * HEALTH IS WORKED OUT WHEN IT IS READ, with the settings in force from lib/settings.ts, which the Configuration
 * tab changes. So a stale interval changed in the back office moves the kit screen the next time it draws, and
 * never a reading's marks. */

export type RegistryState = { readonly devices: readonly Device[]; readonly readings: readonly Reading[]; readonly kits: readonly Kit[]; readonly links: readonly Link[] };

/** The nurse whose kit the preview draws, and the patient who asks for a wearable link. */
export const KIT_HOLDER = 'N-205';
export const LINK_PATIENT = 'PAT-LM-0001';
const PATIENT_ON_VISIT = 'PAT-TH-2048';

const HOUR = 60 * MINUTE;
const value = <T>(result: Result<T>): T => {
 if (!result.ok) throw new Error(`The seeded registry was refused by the engine: ${result.refusal.statement}`);
 return result.value;
};
const iso = (at: number) => new Date(at).toISOString();

/* When each instrument last synced, and the battery it reported. The glucometer has sent nothing for a day
   and a half, which is stale under the proposed default; the oximeter is recalled below. */
const syncs: Record<string, { hoursAgo: number; battery: number }> = {
 'bp-cuff': { hoursAgo: 0.8, battery: 82 },
 'pulse-oximeter': { hoursAgo: 2, battery: 70 },
 thermometer: { hoursAgo: 3, battery: 64 },
 glucometer: { hoursAgo: 36, battery: 18 },
 scale: { hoursAgo: 5, battery: 91 },
 ecg: { hoursAgo: 20, battery: 47 }
};

function seed(now: number): RegistryState {
 const settings = devicesSettingsNow();
 const registeredAt = now - 30 * DAY;
 let devices = kitInstruments.map(item => value(register({
  deviceRef: `DEV-${item.serial}`, serial: item.serial, model: instrumentKindOf(item.deviceId)?.name ?? item.deviceId, firmware: '2.4.1',
  deviceClass: 'certified', instrumentKind: item.deviceId, calibratedOn: item.calibratedOn
 }, false, registeredAt)));
 const kit = value(issueKit({ kitRef: 'KIT-0205', kitSerial: 'MT-KIT-0205', holderRef: KIT_HOLDER, deviceRefs: devices.map(d => d.deviceRef) }, {
  deviceOf: ref => devices.find(d => d.deviceRef === ref), openKits: [], settings, now: registeredAt
 }));
 const byKind = (kind: string) => devices.find(d => d.instrumentKind === kind)!;

 /* Readings Devices was asked about, each at the moment it was taken, and linked to the record straight after. */
 const readings: Reading[] = [];
 const taken = (kind: string, readingRef: string, metric: string, unit: string, hoursAgo: number, quality: string) => {
  const at = now - hoursAgo * HOUR;
  const device = byKind(kind);
  const asked = value(ask({
   readingRef, subjectRef: PATIENT_ON_VISIT, deviceRef: device.deviceRef, metric, unit, takenAt: iso(at), source: 'kit-instrument', quality,
   consentState: 'granted', intendedUse: 'clinical', simulated: false, askedByRole: 'nurse', askedByRef: KIT_HOLDER
  }, { device, withdrawnForSubject: false, now: at, settings }));
  readings.push(value(link(asked, { observationRef: `Observation/${readingRef}`, byRef: KIT_HOLDER, withdrawnForSubject: false }, at + MINUTE)).reading);
 };
 taken('pulse-oximeter', 'RD-0101', 'oxygen', '%', 72, 'good');
 taken('pulse-oximeter', 'RD-0102', 'pulse', 'bpm', 26, 'acceptable');
 taken('glucometer', 'RD-0103', 'glucose', 'mmol/L', 36, 'acceptable');
 taken('bp-cuff', 'RD-0104', 'systolic', 'mmHg', 0.8, 'good');
 taken('thermometer', 'RD-0105', 'temperature', '°C', 3, 'poor');

 devices = devices.map(d => synced(d, now - syncs[d.instrumentKind!]!.hoursAgo * HOUR, syncs[d.instrumentKind!]!.battery));
 /* The oximeter's maker issued a notice an hour ago about a fault that began two days ago. Its reading from
    yesterday is marked, and the one from three days ago is not. */
 const oximeter = value(recall(byKind('pulse-oximeter'), { reasonCode: 'manufacturer-notice', effectiveFrom: iso(now - 2 * DAY) }, now - HOUR));
 devices = devices.map(d => d.deviceRef === oximeter.deviceRef ? oximeter : d);
 const marked = new Set(readingsToMarkForRecall(readings, oximeter).map(r => r.readingRef));
 return { devices, readings: readings.map(r => marked.has(r.readingRef) ? withMark(r, 'recalled') : r), kits: [kit], links: [] };
}

let state: RegistryState | undefined;
const listeners = new Set<() => void>();
const current = (): RegistryState => (state ??= seed(Date.now()));
const told = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The registry, re-read when it changes or when an admin changes a Devices setting. */
export function useRegistry(): RegistryState {
 useSettingsHistories();
 return useSyncExternalStore(subscribe, current, current);
}

export const healthNow = (device: Device): Health => healthOf(device, Date.now(), devicesSettingsNow());
export const readingsOf = (deviceRef: string) => current().readings.filter(r => r.deviceRef === deviceRef).sort((a, b) => b.takenAt - a.takenAt);
export const kitOf = (holderRef: string) => current().kits.find(k => k.holderRef === holderRef && k.closed === null);
export const deviceBySerial = (serial: string) => current().devices.find(d => d.serial === serial);
export { clinicalUseOf };

/* The stale interval in force, in the words a nurse reads: whole days, whole hours, or minutes. Read from the
   settings, never typed, so the sentence and the arithmetic cannot disagree. */
export function intervalText(minutes: number): string {
 if (minutes % (24 * 60) === 0) { const days = minutes / (24 * 60); return `${days} ${days === 1 ? 'day' : 'days'}`; }
 if (minutes % 60 === 0) { const hours = minutes / 60; return `${hours} ${hours === 1 ? 'hour' : 'hours'}`; }
 return `${minutes} minutes`;
}
export const staleIntervalText = () => intervalText(devicesSettingsNow().staleAfterMinutes);

/** A recall recorded from the Control Tower: the device, and every reading from it taken since, marked. */
export function recallDevice(deviceRef: string, reasonCode: string, effectiveFrom: number): Result<{ readonly marked: number; readonly effectiveFrom: number }> {
 const s = current();
 const device = s.devices.find(d => d.deviceRef === deviceRef);
 if (!device) return { ok: false, refusal: { id: 'device-not-registered', status: 404, statement: 'That device is not registered.' } };
 const recalled = recall(device, { reasonCode, effectiveFrom: iso(effectiveFrom) }, Date.now());
 if (!recalled.ok) return recalled;
 const marked = new Set(readingsToMarkForRecall(s.readings, recalled.value).map(r => r.readingRef));
 state = { ...s, devices: s.devices.map(d => d.deviceRef === deviceRef ? recalled.value : d), readings: s.readings.map(r => marked.has(r.readingRef) ? withMark(r, 'recalled') : r) };
 told();
 return { ok: true, value: { marked: marked.size, effectiveFrom } };
}

/** The patient's request to link a platform. It is recorded, and it connects nothing. */
export function requestWearableLink(platform: string, metrics: readonly string[], consentVersion: number): Result<Link> {
 const s = current();
 const requested = requestLink({ linkRef: `LNK-${s.links.length + 1}`, subjectRef: LINK_PATIENT, platform, consentVersion, metrics }, s.links, Date.now());
 if (requested.ok) { state = { ...s, links: [...s.links, requested.value] }; told(); }
 return requested;
}
export function withdrawWearableLink(linkRef: string): Result<Link> {
 const s = current();
 const found = s.links.find(l => l.linkRef === linkRef);
 if (!found) return { ok: false, refusal: { id: 'link-not-found', status: 404, statement: 'There is no wearable link by that reference.' } };
 const withdrawn = withdrawLink(found, LINK_PATIENT, Date.now());
 if (withdrawn.ok) { state = { ...s, links: s.links.map(l => l.linkRef === linkRef ? withdrawn.value : l) }; told(); }
 return withdrawn;
}
export const openLinkFor = (platform: string) => current().links.find(l => l.platform === platform && l.withdrawnAt === null && l.subjectRef === LINK_PATIENT);
export const lastLinkFor = (platform: string) => [...current().links].reverse().find(l => l.platform === platform && l.subjectRef === LINK_PATIENT);

export const words = devicesContract;
