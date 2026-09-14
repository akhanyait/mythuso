/* The contract, read once and checked on the way in. No sentence a person reads is typed into this
   package: every refusal comes out of packages/catalog/thusoiq.json by id, so the web app, the iOS
   app and the Android app refuse the same thing in the same words. A patient told two different
   stories about why their medicine was held is a patient who believes neither. */
import contract from '../catalog/thusoiq.json' with { type: 'json' };
import records from '../catalog/records.json' with { type: 'json' };
import { EngineError, type Appointment, type Notes, type WearableSample } from './types.ts';

export const thusoiq = contract;
export const bounds = contract.bounds;

/* The four SOAP headings are records.json's and are derived rather than restated — they are already
   on the consultation form in all three apps, and a second list would be the copy that drifts. The
   cast is the one place the derivation meets the Notes type; thusoiq.json's `soap.mustBe` and the
   generator hold the two to the same length, because two refusals say the word "four" out loud. */
export const soapKeys = records.consultation.soap.map(s => s.name.toLowerCase()) as (keyof Notes)[];

/** Grouped by hand rather than by toLocaleString. A sentence a patient reads must not change shape
 *  because the host it rendered on shipped different ICU data. */
export const grouped = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type Fills = Record<string, string | number>;

export const refusal = (id: string, fills: Fills = {}): string => {
 const found = contract.refusals.find(r => r.id === id);
 /* A refusal rendered from a missing id would show somebody an empty sentence at the exact moment
    the kernel is telling them no. Louder to fail here. */
 if (!found) throw new EngineError('invalid', `No refusal in thusoiq.json is called "${id}".`);
 return found.sentence.replace(/\{(\w+)\}/g, (_, token: string) => {
  const value = fills[token];
  if (value === undefined) throw new EngineError('invalid', `The refusal "${id}" needs a ${token}.`);
  return String(value);
 });
};

/** A field's label is half of its refusal — "Hold reason is required" is the whole sentence — so the
 *  labels are contract too rather than concatenated differently on three platforms. */
export const label = (id: string): string => {
 const found = contract.fieldLabels.find(f => f.id === id);
 if (!found) throw new EngineError('invalid', `No field label in thusoiq.json is called "${id}".`);
 return found.label;
};

/* The transition table and the unit map are objects keyed by state and metric. Widened once, here,
   so the engines index them with the runtime values they already hold. */
const transitions = contract.appointments.transitions as Record<string, string[]>;
const units = contract.wearables.units as Record<string, string>;

export const transitionsFrom = (status: Appointment['status']): string[] => transitions[status] ?? [];
export const unitFor = (metric: WearableSample['metric']): string | null => units[metric] ?? null;
export const visitModes: string[] = contract.appointments.modes.map(m => m.id);
export const sampleQualities: string[] = contract.wearables.qualities.map(q => q.id);
export const sampleSources: string[] = contract.wearables.sources;
