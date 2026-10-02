import shop from '../../../../packages/catalog/shop.json';
import { derived, ownDeviceMark as mark } from './shop-derived.generated';

/* What a listing says about a reading — read from the projection scripts/emit-shop.mjs writes, never
   worked out here.

   A product names the instrument it is (`captureKind`, an id in capture.json) and nothing about what
   that instrument measures: the measures are capture.json's, their labels, units and indicative ranges
   are records.json's, whether GilbertOne explains one is reading-questions.json's, whether it goes into a
   case is case.json's and whether the doctor's live panel streams it is live-vitals.json's. The generator
   works all of that out once, for both phones and for this file, and scripts/check-boundaries.mjs holds
   every product's `sees` lines to it. The storefront reads the projection rather than those contracts
   because the patient app reads two of them on its first view, and an entry that shares a module with it
   reshapes the chunks the patient downloads. */

export type Product = (typeof shop.products)[number];
export type Kit = (typeof shop.kits)[number];
export type Audience = 'patient' | 'nurse' | 'doctor';

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

const of = (p: Product) => derived[p.id];
export const connection = (p: Product) => of(p).connection || null;
export const calibrationMonths = (p: Product) => of(p).calibrationMonths ?? undefined;
export type Chip = (typeof derived)[string]['chips'][number];
/** One chip per thing a person names — blood pressure is two observations in the record and one word in a kitchen. */
export const readingChips = (p: Product) => of(p).chips;
/** The indicative range in words, from records.json's low and high, or the sentence saying the record does not hold it. */
export const rangeSentence = (c: Chip) => c.range;
export const seen = (p: Product, audience: Audience) => of(p)[audience];

/** How the record treats a reading from a device the household bought: devices.json's own mark. */
export const ownDeviceMark = { sentence: mark };
export const regulatoryClass = (id: string) => shop.regulatory.classes.find(c => c.id === id);
export const validationOf = (p: Product) => ('validation' in p && p.validation ? shop.validations.find(v => v.id === p.validation) : undefined);
export const caveatsOf = (p: Product) => ('caveats' in p && p.caveats ? shop.caveats.filter(c => (p.caveats as string[]).includes(c.id)) : []);
export const welcome = shop.welcome;
export const welcomeProduct = productById(shop.welcome.productId)!;
