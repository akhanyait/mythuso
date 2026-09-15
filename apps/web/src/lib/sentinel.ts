import { useSyncExternalStore } from 'react';
import {
 baselineOf, heard, leaveByRecall, openBaseline, raiseByHand, recordReport, reportsForDesk, resumeFor, stateFor, suspendFor,
 type Baseline, type Deviation, type HeardReading, type Report, type ReportRow, type Result
} from '../../../../packages/engines/src/safety/domain/sentinel.ts';
import { MINUTE } from '../../../../packages/engines/src/safety/domain/rules.ts';
import {
 safeguardingFallbackRole, safeguardingOwnerRole, safeguardingSpanMs, sentinelFallbackRole, sentinelOpensAtRung, sentinelOwnerRole, spanForRung
} from '../../../../packages/engines/src/core/domain/contract.ts';
import { kit as kitInstruments } from './capture';
import { openConcern } from './closed-loop';
import { deviceBySerial, readingsOf } from './devices';
import { devicesSettingsNow, sentinelSettingsNow, useSettingsHistories } from './settings';

/* Sentinel and safeguarding reports in the web preview: one store, in this tab's memory and nowhere else.
 *
 * Every rule is the engine's. This file holds the readings Sentinel heard, the baselines, the tiers raised and the
 * reports, and hands every act to packages/engines/src/safety/domain/sentinel.ts. Nothing is written to the browser's
 * storage, so a reload forgets a tier raised and a report recorded, and the screens say so in the contract's sentence.
 *
 * SENTINEL HEARS WHAT DEVICES PUBLISHED, AND NOTHING ELSE. The baselines are seeded from the Devices preview's own
 * registry: a reading enters only when Devices linked it and published it, which Devices does only when carriesWeight()
 * says yes. The thermometer's poor sample is on the kit screen and in no baseline; the glucometer the kit screen shows
 * as stale suspends its baseline from the moment Devices would have announced it, under Devices' interval in force;
 * and every reading from the recalled oximeter has left. None of it is a flag typed onto a row: each is what the domain
 * answers for what the Devices preview holds, so the kit screen and Sentinel cannot disagree.
 *
 * NOTHING IS EVALUATED. The state is stateFor()'s, whose evaluation is not evaluated, and a tier is raised only by a
 * person on this screen. A tier at or above the rung Core opens a concern from reaches the Control Tower's board through
 * lib/closed-loop.ts, owned and timed as packages/engines/src/core/domain/contract.ts says, and a safeguarding report
 * opens the desk's concern the same way. No window, minimum or rung is typed here.
 *
 * Nothing crosses tabs or devices, nobody is told anything, no patient is monitored and no report reaches anybody. */

export type SentinelStore = {
 readonly readings: readonly HeardReading[];
 readonly baselines: readonly Baseline[];
 readonly deviations: readonly Deviation[];
 readonly reports: readonly Report[];
};

let serial = 0;
const nextRef = (prefix: string) => `${prefix}-${String(++serial).padStart(4, '0')}`;

function seed(now: number): SentinelStore {
 const settings = sentinelSettingsNow();
 const devices = kitInstruments.map(item => deviceBySerial(item.serial)).filter(d => d !== undefined);
 let readings: HeardReading[] = [];
 let baselines: Baseline[] = [];
 /* Every reading Devices published, heard at the moment it was linked, oldest first. */
 const published = devices.flatMap(device => readingsOf(device.deviceRef)).filter(r => r.published && r.observationRef !== null && r.linkedAt !== null).sort((a, b) => a.linkedAt! - b.linkedAt!);
 for (const r of published) {
  const reading = heard({ readingRef: r.readingRef, deviceRef: r.deviceRef, metric: r.metric, qualityCode: r.quality, observationRef: r.observationRef }, r.subjectRef, r.linkedAt!);
  if (!reading) continue;
  readings = [...readings, reading];
  if (!baselines.some(b => b.subjectRef === reading.subjectRef && b.metric === reading.metric)) baselines = [...baselines, openBaseline(reading.subjectRef, reading.metric, settings, reading.heardAt)];
  const lifted = resumeFor(baselines, reading.deviceRef, reading.heardAt);
  baselines = baselines.map(b => lifted.find(l => l.subjectRef === b.subjectRef && l.metric === b.metric) ?? b);
 }
 /* A certified device silent for longer than Devices' interval in force was announced stale when that interval passed. */
 const staleAfter = devicesSettingsNow().staleAfterMinutes * MINUTE;
 for (const device of devices) {
  if (device.deviceClass !== 'certified' || device.recall !== null || device.lastSyncAt === null || now - device.lastSyncAt <= staleAfter) continue;
  const suspended = suspendFor(baselines, readings, device.deviceRef, device.lastSyncAt + staleAfter);
  baselines = baselines.map(b => suspended.find(s => s.subjectRef === b.subjectRef && s.metric === b.metric) ?? b);
 }
 /* A recall recorded takes every reading from the device out, at the moment it was recorded. */
 for (const device of devices) {
  if (device.recall === null) continue;
  const left = leaveByRecall(readings, baselines, device.deviceRef, device.recall.recordedAt);
  readings = readings.map(r => left.readings.find(l => l.readingRef === r.readingRef) ?? r);
  baselines = baselines.map(b => left.baselines.find(l => l.subjectRef === b.subjectRef && l.metric === b.metric) ?? b);
 }
 return { readings, baselines, deviations: [], reports: [] };
}

let state: SentinelStore | undefined;
const listeners = new Set<() => void>();
const current = (): SentinelStore => (state ??= seed(Date.now()));
const commit = (next: SentinelStore) => { state = next; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The store, re-read when it changes or when an admin changes a setting. */
export function useSentinel(): SentinelStore {
 useSettingsHistories();
 return useSyncExternalStore(subscribe, current, current);
}

/** The patient whose kit readings the preview heard: the one the nurse's visit is with. */
export const sentinelPatient = (): string | null => current().readings[0]?.subjectRef ?? null;

export const sentinelStateNow = (subjectRef: string) => stateFor(subjectRef, current().baselines, current().readings, current().deviations, Date.now());
export const baselineViewsNow = (subjectRef: string) => current().baselines.filter(b => b.subjectRef === subjectRef).map(b => baselineOf(b, current().readings, Date.now()));

/** The readings a tier may be raised on: heard for this patient and not taken out by a recall. */
export const entriesFor = (subjectRef: string) => current().readings.filter(r => r.subjectRef === subjectRef && r.leftByRecallAt === null);

/* A tier raised by the person on this screen. At or above the rung Core opens a concern from, the board is handed the
   concern Core would open, with the ladder's time for the rung raised. */
export function raiseTier(subjectRef: string, recordEntryRef: string, rung: number, byRole: string, byRef: string): Result<Deviation> {
 const s = current();
 const raised = raiseByHand({ deviationRef: nextRef('DEV'), subjectRef, recordEntryRef, rung, byRole, byRef, undeclared: [] }, s.readings, Date.now());
 if (!raised.ok) return raised;
 commit({ ...s, deviations: [...s.deviations, raised.value] });
 const span = spanForRung(raised.value.rung);
 if (raised.value.rung >= sentinelOpensAtRung && span !== undefined) {
  openConcern({
   loopRef: nextRef('LOOP-SEN'), sourceEngine: 'safety', purpose: 'treatment', ownerRole: sentinelOwnerRole, fallbackRole: sentinelFallbackRole, spanMs: span,
   dedupeKey: raised.value.deviationRef, alert: { alertRef: nextRef('ALERT-SEN'), rung: raised.value.rung, recordEntryRef: raised.value.recordEntryRef }
  });
 }
 return raised;
}

/** A safeguarding concern recorded by the person on this screen: open, held for the officer, not sent, and the desk's concern opened. */
export function recordSafeguarding(subjectRef: string, groupCode: string, categoryCode: string, byRole: string, byRef: string): Result<Report> {
 const s = current();
 const recorded = recordReport({ reportRef: nextRef('SG'), subjectRef, groupCode, categoryCode, byRole, byRef, undeclared: [] }, Date.now());
 if (!recorded.ok) return recorded;
 commit({ ...s, reports: [...s.reports, recorded.value] });
 openConcern({
  loopRef: nextRef('LOOP-SG'), sourceEngine: 'safety', purpose: 'audit', ownerRole: safeguardingOwnerRole, fallbackRole: safeguardingFallbackRole,
  spanMs: safeguardingSpanMs, dedupeKey: recorded.value.reportRef
 });
 return recorded;
}

export const safeguardingRowsNow = (): ReportRow[] => reportsForDesk(current().reports, Date.now());
