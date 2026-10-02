import shop from '../../../../packages/catalog/shop.json';
import { devices as captureDevices } from '../../../../packages/catalog/capture.json';
import { observations } from '../../../../packages/catalog/records.json';
import { measures as explainedMeasures, farOutside } from '../../../../packages/catalog/reading-questions.json';
import { readings as caseReadings } from '../../../../packages/catalog/case.json';
import { streams as liveStreams } from '../../../../packages/catalog/live-vitals.json';
import { marks as deviceMarks } from '../../../../packages/catalog/devices.json';

/* What a listing says about a reading, worked out from the contracts that own each fact.

   A product names the instrument it is (`captureKind`, an id in capture.json) and nothing about what
   that instrument measures: the measures are capture.json's, their labels, units and indicative
   ranges are records.json's, whether GilbertOne explains one is reading-questions.json's, whether it
   goes into a case is case.json's and whether the doctor's live panel streams it is live-vitals.json's.
   So a range moved in the record moves on the shelf, and a measure the record stops holding stops
   being promised to a doctor. Named imports, so the storefront's bundle carries the sections it reads
   and not the record's explanations or the case's pathway.

   The same derivation runs in scripts/emit-shop.mjs for the two phones, and scripts/check-boundaries.mjs
   holds every product's `sees` lines to it. */

export type Product = (typeof shop.products)[number];
export type Kit = (typeof shop.kits)[number];
export type Audience = 'patient' | 'nurse' | 'doctor';
type Line = { audience: string; status: string; text: string; needs?: string; evidence?: string };

export const catalogue = shop;
export const productById = (id: string) => shop.products.find(p => p.id === id);
export const kitById = (id: string) => shop.kits.find(k => k.id === id);
export const categoryName = (id: string) => shop.categories.find(c => c.id === id)?.name ?? id;

/** Whole rands as the shelf shows them; cents only when there are some. */
export const rands = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/** A kit costs what its items cost. It has no price of its own, and the build fails if it ever gets one. */
export const kitCents = (kit: Kit, only?: readonly string[]) =>
 kit.items.filter(id => !only || only.includes(id)).reduce((sum, id) => sum + (productById(id)?.price ?? 0) * 100, 0);
export const kitsWith = (productId: string) => shop.kits.filter(k => k.items.includes(productId));

export const imageFor = (id: string) => ({
 src: `${shop.images.dir}${id}.webp`,
 small: `${shop.images.dir}${id}${shop.images.small.suffix}.webp`,
 srcSet: `${shop.images.dir}${id}${shop.images.small.suffix}.webp ${shop.images.small.width}w, ${shop.images.dir}${id}.webp ${shop.images.width}w`,
 width: shop.images.width, height: shop.images.height
});

const instrument = (p: Product) => ('captureKind' in p && p.captureKind ? captureDevices.find(d => d.id === p.captureKind) : undefined);
/** The record measures a product takes: its instrument's, or the ones it is typed into. */
export const measuresOf = (p: Product): string[] =>
 instrument(p)?.measures ?? ('typedMeasures' in p && p.typedMeasures ? p.typedMeasures : []);
export const connection = (p: Product): 'bluetooth' | 'typed' | null =>
 instrument(p) ? 'bluetooth' : measuresOf(p).length ? 'typed' : null;
export const calibrationMonths = (p: Product) => instrument(p)?.calibrateEveryMonths;

const recordMeasure = (id: string) => observations.measures.find(m => m.id === id);
const notInRecord = shop.notInRecord as unknown as Record<string, { name: string; sentence: string }>;

export type Chip = { id: string; label: string; unit?: string; range?: string; inRecord: boolean };
/** One chip per thing a person names — blood pressure is two observations in the record and one word
    in a kitchen, so the pair reads as one chip, named the way reading-questions.json names it. */
export function readingChips(p: Product): Chip[] {
 const ids = measuresOf(p);
 const chips: Chip[] = [];
 for (const id of ids) {
  const pair = explainedMeasures.find(m => 'pairOfNumbers' in m && m.pairOfNumbers && m.explains.includes(id));
  if (pair) {
   if (chips.some(c => c.id === pair.id)) continue;
   const parts = pair.explains.map(recordMeasure).filter(Boolean) as NonNullable<ReturnType<typeof recordMeasure>>[];
   chips.push({ id: pair.id, label: 'name' in pair && pair.name ? pair.name : parts[0].label, unit: parts[0].unit, inRecord: true,
    range: `${parts.map(m => m.high).join('/')} and ${parts.map(m => m.low).join('/')} ${parts[0].unit}` });
   continue;
  }
  const m = recordMeasure(id);
  if (m) chips.push({ id, label: m.label, unit: m.unit, inRecord: true, range: `${m.low}–${m.high} ${m.unit}` });
  else chips.push({ id, label: notInRecord[id]?.name ?? id, inRecord: false });
 }
 return chips;
}
/** The indicative range in words, from records.json's low and high. Never a grade. */
export const rangeSentence = (c: Chip) => {
 if (!c.inRecord) return notInRecord[c.id]?.sentence ?? '';
 if (c.id === 'blood-pressure') {
  const [s, d] = ['systolic', 'diastolic'].map(id => recordMeasure(id)!);
  return `Indicative adult range in your record: ${s.low}–${s.high} over ${d.low}–${d.high} ${s.unit}. A doctor may work to different numbers for you.`;
 }
 const m = recordMeasure(c.id)!;
 return `Indicative adult range in your record: ${m.low}–${m.high} ${m.unit}. A doctor may work to different numbers for you.`;
};

/* Whether a line's condition holds for a product — the same five tests the build runs. */
const holds = (p: Product, needs: string | undefined) => {
 const ids = measuresOf(p);
 switch (needs) {
  case undefined: return true;
  case 'explained': return ids.some(id => explainedMeasures.some(m => m.explains.includes(id)));
  case 'far-outside': return ids.some(id => id in farOutside.bounds);
  case 'case': return ids.some(id => caseReadings.measureIds.includes(id));
  case 'live': return ids.some(id => liveStreams.some(s => s.measure === id));
  case 'paired': return connection(p) === 'bluetooth';
  case 'typed': return connection(p) === 'typed';
  default: return false;
 }
};
const lines = shop.seenLines as unknown as Record<string, Line>;
export function seen(p: Product, audience: Audience) {
 const ids = ('sees' in p && p.sees ? (p.sees as Record<Audience, string[]>)[audience] : []) ?? [];
 return ids.map(id => lines[id]).filter(l => l && holds(p, l.needs)).map(l => ({
  text: l.text.replace('{trendNeeds}', String(caseReadings.trendNeeds)),
  planned: l.status !== 'in-preview'
 }));
}

/** How the record treats a reading from a device the household bought: devices.json's own mark. */
export const ownDeviceMark = deviceMarks.find(m => m.id === 'consumer-device')!;
export const regulatoryClass = (id: string) => shop.regulatory.classes.find(c => c.id === id);
export const validationOf = (p: Product) => ('validation' in p && p.validation ? shop.validations.find(v => v.id === p.validation) : undefined);
export const caveatsOf = (p: Product) => ('caveats' in p && p.caveats ? shop.caveats.filter(c => (p.caveats as string[]).includes(c.id)) : []);
export const welcome = shop.welcome;
export const welcomeProduct = productById(shop.welcome.productId)!;
