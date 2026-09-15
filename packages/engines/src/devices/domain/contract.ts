/* Devices' contracts, read from where they live and typed nowhere else.
 *
 * The kinds, marks and words are packages/catalog/devices.json's; the refusal sentences are
 * packages/catalog/apis/devices.json's, so the sentence a route answers with and the sentence a screen
 * shows are one string; a measure's unit is packages/catalog/records.json's; an instrument's calibration
 * cadence is packages/catalog/capture.json's; the wearable consent's versions are
 * packages/catalog/consent.json's. The engine runtime, the web preview and the tests read all of it
 * through this file, so none of them keeps a copy that could drift.
 *
 * WHAT IS NOT READ. The reference ranges beside each measure in records.json. Whether a reading is
 * concerning is clinical content, and only the clinical governance board decides it; Devices asks a
 * measure for its unit and nothing else.
 *
 * Zero dependencies and apps/api's type-stripping rules: no enums, no namespaces, no constructor
 * parameter properties.
 */
import devices from '../../../../catalog/devices.json' with { type: 'json' };
import api from '../../../../catalog/apis/devices.json' with { type: 'json' };
import records from '../../../../catalog/records.json' with { type: 'json' };
import capture from '../../../../catalog/capture.json' with { type: 'json' };
import consent from '../../../../catalog/consent.json' with { type: 'json' };

export const devicesContract = devices;
export const MINUTE = 60_000;
export const DAY = 86_400_000;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: Refusal };

type Declared = { id: string; status: number; statement: string };
/* Every refusal the engine or a live route declares, once by id. A refusal two routes share — the device
   nobody registered, the kit never issued — is declared on each in the same words, and the build holds
   each route to its own line in apis.refusals.lock. */
const declared = new Map<string, Refusal>();
for (const r of [...(api.refusals as Declared[]), ...(api.routes as { withdrawn?: unknown; refusals: Declared[] }[]).filter(r => !r.withdrawn).flatMap(r => r.refusals)]) {
 const seen = declared.get(r.id);
 if (seen && seen.statement !== r.statement) throw new Error(`packages/catalog/apis/devices.json declares "${r.id}" in two different sentences. One refusal is one sentence.`);
 declared.set(r.id, { id: r.id, status: r.status, statement: r.statement });
}
export function refusal(id: string): Refusal {
 const found = declared.get(id);
 if (!found) throw new Error(`packages/catalog/apis/devices.json declares no refusal "${id}".`);
 return found;
}
export const refuse = <T>(id: string): Result<T> => ({ ok: false, refusal: refusal(id) });
export const accept = <T>(value: T): Result<T> => ({ ok: true, value });

export type DeviceClassId = 'certified' | 'consumer' | 'simulator';
export type MarkId = 'recalled' | 'calibration-overdue' | 'poor-sample' | 'simulated' | 'consumer-device' | 'guidance-only';
export type Choice = { readonly id: string; readonly label: string };

export const deviceClasses = devices.deviceClasses as (Choice & { id: DeviceClassId; carriesClinicalWeight: boolean; why: string })[];
export const sources = devices.sources as (Choice & { simulated: boolean; classes: DeviceClassId[] })[];
export const qualities = devices.qualities as (Choice & { carriesClinicalWeight: boolean })[];
export const consentStates = devices.consentStates as Choice[];
export const intendedUses = devices.intendedUses as Choice[];
export const marks = devices.marks as (Choice & { id: MarkId; sentence: string })[];
export const healthStates = devices.health.states as Choice[];
export const calibrationStates = devices.health.calibration as Choice[];
export const recallReasons = devices.recall.reasons as Choice[];
export const lossReasons = devices.kits.lossReasons as Choice[];
export const kitStates = devices.kits.states as Choice[];
export const platforms = devices.wearableLinks.platforms as (Choice & { name: string; phone: string })[];

export const classOf = (id: unknown) => deviceClasses.find(c => c.id === id);
export const sourceOf = (id: unknown) => sources.find(s => s.id === id);
export const qualityOf = (id: unknown) => qualities.find(q => q.id === id);
export const markOf = (id: MarkId) => marks.find(m => m.id === id)!;
export const labelIn = (list: readonly Choice[], id: string) => list.find(c => c.id === id)?.label ?? id;

/* The measures a reading may be of, and the unit each is recorded in. */
export const measures = (records.observations.measures as { id: string; label: string; unit: string }[]).map(m => ({ id: m.id, label: m.label, unit: m.unit }));
export const unitOf = (metric: unknown): string | null => measures.find(m => m.id === metric)?.unit ?? null;

/* The instruments the kit holds and how often each is calibrated. */
export const instrumentKinds = (capture.devices as { id: string; name: string; calibrateEveryMonths: number }[]).map(d => ({ id: d.id, name: d.name, calibrateEveryMonths: d.calibrateEveryMonths }));
export const instrumentKindOf = (id: unknown) => instrumentKinds.find(k => k.id === id);

/* The wearable-readings consent and the version in force. */
const wearable = (consent.purposes as { id: string; name: string; withdrawal: string; versions: { version: number; wording: string }[] }[]).find(p => p.id === devices.wearableLinks.consentPurpose);
if (!wearable) throw new Error(`packages/catalog/consent.json has no purpose "${devices.wearableLinks.consentPurpose}", which a wearable link asks for.`);
export const wearableConsentVersions: readonly number[] = wearable.versions.map(v => v.version);
export const wearableConsentInForce = Math.max(...wearableConsentVersions);
/** The wording a patient agrees to, at the version in force, and what withdrawing does, word for word. */
export const wearableConsentWording = wearable.versions.find(v => v.version === wearableConsentInForce)!.wording;
export const wearableConsentWithdrawal = wearable.withdrawal;

export const isoDayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
export const instant = (at: number) => new Date(at).toISOString();
