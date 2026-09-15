/* A reading, asked for by everything but its value, and the arithmetic that decides whether it may carry
 * clinical weight.
 *
 * WHERE THE VALUE IS. Not here. packages/catalog/devices.json whereValuesLive: the capturer asks Devices
 * first, every refusal is decided before anything is written, and then the capturer writes the value to
 * the Health Passport through its consent gateway under their own grant and tells Devices where it went.
 * A Reading below has no field a value could be put in, and scripts/check-boundaries.mjs holds the
 * engine's store to the same.
 *
 * A CONSUMER DEVICE NEVER CARRIES CLINICAL WEIGHT, AND IT IS ARITHMETIC. carriesWeight() is the one place
 * the question is answered, and it asks five things, every one of them from the contract: the device's
 * class carries weight, the source is not simulated, the sample's quality carries weight, the device was
 * not recalled when the reading was taken, and the capturer meant it for the record. A consumer class is
 * declared carriesClinicalWeight: false, so no combination of the other four can give a consumer reading
 * weight. And a reading without weight is never published: link() answers publish only when
 * carriesWeight() is true, because reading.ingested@1 is heard by engines that raise, review and escalate
 * and carries nothing that would let one of them tell the difference. A consumer reading asked for as
 * clinical is refused outright, rather than quietly filed as guidance, so the capturer is told.
 *
 * WHAT A MARK IS. packages/catalog/devices.json marksMean. A mark is added beside a reading and never
 * removed; nothing about the reading is changed to make room for it. The marks a reading is asked with are
 * decided from the device and the moment it was taken, never from a setting, so a settings change cannot
 * mark or unmark one. A recall adds the recalled mark to readings taken at or after its effective point.
 */
import {
 accept, classOf, consentStates, intendedUses, qualityOf, refuse, sourceOf, unitOf,
 type DeviceClassId, type MarkId, type Result
} from './contract.ts';
import { calibrationOf, recalledAt, type Device } from './registry.ts';
import type { DevicesInForce } from './settings.ts';

export type ClinicalUseCode = 'clinical' | 'guidance-only';
export type Reading = {
 readonly readingRef: string;
 readonly subjectRef: string;
 readonly deviceRef: string;
 readonly deviceClass: DeviceClassId;
 readonly metric: string;
 readonly unit: string;
 readonly takenAt: number;
 readonly source: string;
 readonly quality: string;
 readonly consentState: string;
 readonly intendedUse: string;
 readonly simulated: boolean;
 readonly askedAt: number;
 readonly askedByRole: string;
 readonly askedByRef: string | null;
 readonly settingsVersion: number;
 readonly marks: readonly MarkId[];
 readonly observationRef: string | null;
 readonly linkedAt: number | null;
 readonly published: boolean;
};

export type AskInput = {
 readonly readingRef: string; readonly subjectRef: string; readonly deviceRef: string;
 readonly metric: unknown; readonly unit: unknown; readonly takenAt: unknown;
 readonly source: unknown; readonly quality: unknown; readonly consentState: unknown; readonly intendedUse: unknown;
 readonly simulated: unknown; readonly askedByRole: string; readonly askedByRef: string | null;
};
export type AskContext = {
 readonly device: Device | undefined;
 /** Whether the subject has withdrawn consent to readings from their own devices, on Devices' own record. */
 readonly withdrawnForSubject: boolean;
 readonly now: number;
 readonly settings: DevicesInForce;
};

/** The one answer to whether a reading may carry clinical weight. Five questions, each from the contract. */
export function carriesWeight(reading: Pick<Reading, 'deviceClass' | 'source' | 'quality' | 'intendedUse' | 'marks'>): boolean {
 return classOf(reading.deviceClass)?.carriesClinicalWeight === true
  && sourceOf(reading.source)?.simulated === false
  && qualityOf(reading.quality)?.carriesClinicalWeight === true
  && !reading.marks.includes('recalled')
  && reading.intendedUse === 'clinical';
}
export const clinicalUseOf = (reading: Parameters<typeof carriesWeight>[0]): ClinicalUseCode => carriesWeight(reading) ? 'clinical' : 'guidance-only';

/* The order a reading is refused in, and why this order. What the reading is — its source and quality,
   its consent, what it is for — is asked before the device is looked up, because a reading that cannot say
   where it came from or whether consent stands is refused whatever device it names. Withdrawal is asked as
   soon as it can be answered. Then whether the device could have produced it at all, then the measure and
   its unit, and last whether what the capturer meant it for is something it can be. */
export function ask(input: AskInput, ctx: AskContext): Result<Reading> {
 const source = sourceOf(input.source);
 const quality = qualityOf(input.quality);
 if (!source || !quality) return refuse('reading-without-source-and-quality');
 if (!consentStates.some(c => c.id === input.consentState)) return refuse('consent-state-not-declared');
 if (!intendedUses.some(u => u.id === input.intendedUse)) return refuse('intended-use-not-declared');
 if (input.consentState === 'withdrawn') return refuse('ingestion-after-withdrawal');
 const device = ctx.device;
 if (!device) return refuse('device-not-registered');
 /* A withdrawal on Devices' own record covers the patient's own devices: packages/catalog/consent.json's
    wearable-readings purpose. A kit instrument's reading at a visit rests on the visit's consent, which the
    nurse sends as consentState. */
 if (ctx.withdrawnForSubject && device.deviceClass === 'consumer') return refuse('ingestion-after-withdrawal');
 const simulated = input.simulated === true;
 if ((source.simulated || device.deviceClass === 'simulator') && !simulated) return refuse('simulator-as-real');
 if (!source.classes.includes(device.deviceClass) || (simulated && !source.simulated)) return refuse('source-not-this-devices');
 const unit = unitOf(input.metric);
 if (unit === null) return refuse('metric-not-declared');
 if (input.unit !== unit) return refuse('unit-not-the-metrics-unit');
 const takenAt = typeof input.takenAt === 'string' ? Date.parse(input.takenAt) : Number.NaN;
 const clinical = input.intendedUse === 'clinical';
 /* Presented as real is asking for clinical use: a simulated reading is kept as what it is, guidance, and
    one asked for as clinical is refused in the words that say why. */
 if (clinical && simulated) return refuse('simulator-as-real');
 if (clinical && recalledAt(device, takenAt)) return refuse('recalled-device-clinical-weight');
 if (clinical && device.deviceClass === 'consumer') return refuse('consumer-device-clinical-weight');

 const marks: MarkId[] = [];
 if (simulated) marks.push('simulated');
 if (device.deviceClass === 'consumer') marks.push('consumer-device');
 if (quality.carriesClinicalWeight === false) marks.push('poor-sample');
 if (recalledAt(device, takenAt)) marks.push('recalled');
 /* The instrument's cadence against the day it was taken. The due window is a setting and plays no part:
    a reading's marks never depend on one. */
 if (calibrationOf(device, takenAt, 0).stateCode === 'overdue') marks.push('calibration-overdue');
 if (!clinical) marks.push('guidance-only');

 return accept({
  readingRef: input.readingRef, subjectRef: input.subjectRef, deviceRef: device.deviceRef, deviceClass: device.deviceClass,
  metric: String(input.metric), unit, takenAt: Number.isNaN(takenAt) ? ctx.now : takenAt,
  source: source.id, quality: quality.id, consentState: String(input.consentState), intendedUse: String(input.intendedUse), simulated,
  askedAt: ctx.now, askedByRole: input.askedByRole, askedByRef: input.askedByRef, settingsVersion: ctx.settings.settingsVersion,
  marks, observationRef: null, linkedAt: null, published: false
 });
}

export type LinkInput = { readonly observationRef: string; readonly byRef: string | null; readonly withdrawnForSubject: boolean };

/* Where the value went. Published only when the reading carries clinical weight as it stands now: a recall
   recorded between asking and linking has already marked it, and a mark is never read around. */
export function link(reading: Reading, input: LinkInput, now: number): Result<{ readonly reading: Reading; readonly publish: boolean }> {
 if (reading.observationRef !== null) return refuse('observation-already-linked');
 if (reading.askedByRef !== null && reading.askedByRef !== input.byRef) return refuse('linked-by-another');
 if (input.withdrawnForSubject && reading.deviceClass === 'consumer') return refuse('ingestion-after-withdrawal');
 const publish = carriesWeight(reading);
 return accept({ reading: { ...reading, observationRef: input.observationRef, linkedAt: now, published: publish }, publish });
}

/** The readings a recall marks: this device's, taken at or after the moment it took effect, not marked already. */
export const readingsToMarkForRecall = (readings: readonly Reading[], device: Device): Reading[] =>
 device.recall === null ? [] : readings.filter(r => r.deviceRef === device.deviceRef && r.takenAt >= device.recall!.effectiveFrom && !r.marks.includes('recalled'));

export const withMark = (reading: Reading, mark: MarkId): Reading => reading.marks.includes(mark) ? reading : { ...reading, marks: [...reading.marks, mark] };
