/* The device registry: a device, its health, and its recall.
 *
 * A DEVICE'S CLASS IS FIXED WHEN IT IS REGISTERED. certified, consumer or simulator, from
 * packages/catalog/devices.json, and nothing afterwards changes it. The class is what decides, by
 * arithmetic in ./readings.ts, whether a reading from the device may carry clinical weight; a class that
 * could be edited later would be a consumer watch promoted to an instrument by a form.
 *
 * HEALTH IS WORKED OUT, NEVER STORED. Whether a device is stale and whether its calibration is due are
 * answered from its last sync and last calibration against the settings in force, at the moment somebody
 * asks. A stored "stale" is only true until the clock moves.
 *
 * A RECALL NAMES THE MOMENT IT TAKES EFFECT FROM, which may be before the day it is recorded, and is made
 * once. A device recalled is never un-recalled here: one found sound is registered again under a new
 * reference, so the marks on the old one stay true about what was known.
 *
 * Nothing here is a real service. No instrument is contacted, and every device is fictional.
 */
import {
 DAY, MINUTE, accept, classOf, instrumentKindOf, isoDayOf, recallReasons, refuse,
 type DeviceClassId, type Result
} from './contract.ts';
import type { DevicesInForce } from './settings.ts';

export type Recall = { readonly reasonCode: string; readonly effectiveFrom: number; readonly recordedAt: number };
export type Device = {
 readonly deviceRef: string;
 readonly serial: string;
 readonly model: string;
 readonly firmware: string;
 readonly deviceClass: DeviceClassId;
 readonly instrumentKind: string | null;
 readonly calibratedOn: string | null;
 readonly batteryPercent: number | null;
 readonly lastSyncAt: number | null;
 readonly registeredAt: number;
 readonly recall: Recall | null;
};

export type RegisterInput = {
 readonly deviceRef: string; readonly serial: string; readonly model: string; readonly firmware: string;
 readonly deviceClass: unknown; readonly instrumentKind?: unknown; readonly calibratedOn?: unknown;
};

export function register(input: RegisterInput, serialTaken: boolean, now: number): Result<Device> {
 if (serialTaken) return refuse('duplicate-serial');
 const cls = classOf(input.deviceClass);
 if (!cls) return refuse('device-class-not-declared');
 /* A certified instrument's calibration runs out on its kind's cadence, and a simulated one stands in for a
    kind. A consumer device's calibration is not MyThuso's to track, so a kind sent with one is not kept. */
 const tracksCalibration = cls.id !== 'consumer';
 const kind = tracksCalibration ? instrumentKindOf(input.instrumentKind) : undefined;
 if (tracksCalibration && !kind) return refuse('instrument-kind-not-in-the-kit');
 const calibratedOn = tracksCalibration && typeof input.calibratedOn === 'string' ? input.calibratedOn : null;
 if (calibratedOn !== null && calibratedOn > isoDayOf(now)) return refuse('calibration-in-the-future');
 return accept({
  deviceRef: input.deviceRef, serial: input.serial, model: input.model, firmware: input.firmware,
  deviceClass: cls.id, instrumentKind: kind?.id ?? null, calibratedOn,
  batteryPercent: null, lastSyncAt: null, registeredAt: now, recall: null
 });
}

/** A reading received from the device: it has synced, and reported its battery if it reports one. */
export const synced = (device: Device, at: number, batteryPercent?: unknown): Device => ({
 ...device,
 lastSyncAt: device.lastSyncAt === null ? at : Math.max(device.lastSyncAt, at),
 batteryPercent: Number.isInteger(batteryPercent) && (batteryPercent as number) >= 0 && (batteryPercent as number) <= 100 ? batteryPercent as number : device.batteryPercent
});

export type CalibrationStateId = 'in-date' | 'due' | 'overdue' | 'not-tracked';
export type Calibration = { readonly stateCode: CalibrationStateId; readonly dueOn: string | null };

/* When a calibration runs out: the day it was last calibrated plus its kind's cadence in months. Due is
   dueDays or fewer before that day; overdue is after it. Worked out on whole days, so the state a nurse reads
   in the morning is the state she reads in the afternoon. */
export function calibrationOf(device: Device, at: number, dueDays: number): Calibration {
 const kind = instrumentKindOf(device.instrumentKind);
 if (device.deviceClass === 'consumer' || !kind || device.calibratedOn === null) return { stateCode: 'not-tracked', dueOn: null };
 const due = new Date(`${device.calibratedOn}T00:00:00Z`);
 due.setUTCMonth(due.getUTCMonth() + kind.calibrateEveryMonths);
 const dueOn = isoDayOf(due.getTime());
 const today = Date.parse(`${isoDayOf(at)}T00:00:00Z`);
 const daysLeft = Math.round((due.getTime() - today) / DAY);
 return { stateCode: daysLeft < 0 ? 'overdue' : daysLeft <= dueDays ? 'due' : 'in-date', dueOn };
}

/** Whether a moment falls inside the device's recall: at or after the moment it took effect. */
export const recalledAt = (device: Device, at: number): boolean => device.recall !== null && at >= device.recall.effectiveFrom;

export const isStale = (device: Device, now: number, staleAfterMinutes: number): boolean =>
 device.lastSyncAt !== null && now - device.lastSyncAt > staleAfterMinutes * MINUTE;

export type HealthStateId = 'reporting' | 'stale' | 'recalled' | 'never-synced';
export type Health = {
 readonly stateCode: HealthStateId;
 readonly deviceClass: DeviceClassId;
 readonly lastSyncAt: number | null;
 readonly stale: boolean;
 readonly recalled: boolean;
 readonly recalledFrom: number | null;
 readonly calibration: Calibration;
 readonly batteryPercent: number | null;
 readonly firmware: string;
 readonly settingsVersion: number;
};

export function healthOf(device: Device, now: number, settings: DevicesInForce): Health {
 const stale = isStale(device, now, settings.staleAfterMinutes);
 const recalled = device.recall !== null;
 return {
  stateCode: recalled ? 'recalled' : device.lastSyncAt === null ? 'never-synced' : stale ? 'stale' : 'reporting',
  deviceClass: device.deviceClass, lastSyncAt: device.lastSyncAt, stale, recalled,
  recalledFrom: device.recall?.effectiveFrom ?? null,
  calibration: calibrationOf(device, now, settings.calibrationDueDays),
  batteryPercent: device.batteryPercent, firmware: device.firmware, settingsVersion: settings.settingsVersion
 };
}

/* Only a certified device that nobody recalled is announced as stale, once for each silence: device.stale@1
   justifies an alert, and a consumer device or a simulator never raises one (devices.json clinicalWeight). A
   recalled device is not in use, so its silence is expected. */
export const staleToAnnounce = (device: Device, now: number, staleAfterMinutes: number, announcedFor: number | null): boolean =>
 device.deviceClass === 'certified' && device.recall === null && isStale(device, now, staleAfterMinutes) && announcedFor !== device.lastSyncAt;

export type RecallInput = { readonly reasonCode: unknown; readonly effectiveFrom: unknown };

export function recall(device: Device, input: RecallInput, now: number): Result<Device> {
 if (typeof input.reasonCode !== 'string' || !input.reasonCode.trim()) return refuse('recall-without-reason');
 if (!recallReasons.some(r => r.id === input.reasonCode)) return refuse('recall-reason-not-declared');
 const effectiveFrom = typeof input.effectiveFrom === 'string' ? Date.parse(input.effectiveFrom) : Number.NaN;
 if (Number.isNaN(effectiveFrom) || effectiveFrom > now) return refuse('recall-effective-in-the-future');
 if (device.recall !== null) return refuse('already-recalled');
 return accept({ ...device, recall: { reasonCode: input.reasonCode, effectiveFrom, recordedAt: now } });
}
