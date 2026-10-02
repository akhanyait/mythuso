/* The shop, written out for two native apps by a machine.

   packages/catalog/shop.json is the feature. Twelve things a household buys between visits, five
   categories, seven refusals — and one absence that matters more than any of them: there is no
   medicine in it, and there is no field in which a medicine could describe itself.

   WHAT THIS GENERATOR REFUSES TO EMIT. A product may carry `does` and may not carry `treats`,
   `claims`, `indication`, `schedule` or `prescription`. Those five names are checked here and the
   generator throws, because the sentence that sells a device and the sentence that makes a medical
   claim about it are one word apart, and the person reading it is alone with a card in their hand.
   The `neverSold` vocabulary is applied to every id, name and `does` sentence for the same reason:
   the shop cannot grow into a pharmacy by increments if each increment fails the build.

   Prices are emitted as integer cents. A rand in a Double is a rounding error waiting for a
   checkout screen, and the one place it is allowed to be a rand is the contract a human reads.

   Escaping: Swift needs its quotes escaped; Kotlin needs backslash, quote and dollar, because a
   lone $ starts a template. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'packages/catalog/shop.json';

/* What a listing says about a reading, worked out from the contracts that own each fact — the same
   derivation apps/web/src/lib/shop-catalogue.ts runs in the browser, written once more here because
   the phones cannot read JSON at runtime and scripts/check-boundaries.mjs holds every listing to it.
   A product names its instrument (capture.json); the measures are that instrument's; labels, units
   and ranges are records.json's; whether a measure is explained, far-outside-bounded, put in a case
   or streamed live is reading-questions.json's, case.json's and live-vitals.json's. A `sees` line whose
   condition does not hold for a product is not emitted, and the check fails the build for naming it. */
export function shopDerivation(root = '') {
 const read = f => JSON.parse(readFileSync(root + f, 'utf8'));
 const shop = read(SOURCE);
 const capture = read('packages/catalog/capture.json');
 const records = read('packages/catalog/records.json');
 const questions = read('packages/catalog/reading-questions.json');
 const kase = read('packages/catalog/case.json');
 const live = read('packages/catalog/live-vitals.json');
 const instrument = p => (p.captureKind ? capture.devices.find(d => d.id === p.captureKind) : undefined);
 const measuresOf = p => instrument(p)?.measures ?? p.typedMeasures ?? [];
 const connection = p => (instrument(p) ? 'bluetooth' : measuresOf(p).length ? 'typed' : '');
 const recordMeasure = id => records.observations.measures.find(m => m.id === id);
 const holds = (p, needs) => {
  const ids = measuresOf(p);
  switch (needs) {
   case undefined: return true;
   case 'explained': return ids.some(id => questions.measures.some(m => m.explains.includes(id)));
   case 'far-outside': return ids.some(id => id in questions.farOutside.bounds);
   case 'case': return ids.some(id => kase.readings.measureIds.includes(id));
   case 'live': return ids.some(id => live.streams.some(s => s.measure === id));
   case 'paired': return connection(p) === 'bluetooth' && ids.some(id => recordMeasure(id));
   case 'typed': return connection(p) === 'typed';
   default: throw new Error(`A seenLines entry needs "${needs}", which shop.json's own note does not define.`);
  }
 };
 const chips = p => {
  const out = [];
  for (const id of measuresOf(p)) {
   const pair = questions.measures.find(m => m.pairOfNumbers && m.explains.includes(id));
   if (pair) { if (!out.some(c => c.id === pair.id)) out.push({ id: pair.id, label: pair.name, inRecord: true }); continue; }
   const m = recordMeasure(id);
   out.push(m ? { id, label: m.label, inRecord: true } : { id, label: shop.notInRecord[id]?.name ?? id, inRecord: false, sentence: shop.notInRecord[id]?.sentence });
  }
  return out;
 };
 const seen = (p, audience) => (p.sees?.[audience] ?? []).map(id => ({ id, line: shop.seenLines[id] }))
  .filter(({ line }) => line && holds(p, line.needs))
  .map(({ id, line }) => ({ id, text: line.text.replace('{trendNeeds}', String(kase.readings.trendNeeds)), planned: line.status !== 'in-preview' }));
 const kitCents = kit => kit.items.reduce((sum, id) => sum + shop.products.find(p => p.id === id).price * 100, 0);
 /* The indicative range in words, from records.json's low and high. Never a grade. */
 const rangeSentence = chip => {
  if (!chip.inRecord) return chip.sentence;
  const parts = (questions.measures.find(m => m.id === chip.id)?.explains ?? [chip.id]).map(recordMeasure);
  const span = parts.map(m => `${m.low}–${m.high}`).join(' over ');
  return `Indicative adult range in your record: ${span} ${parts[0].unit}. A doctor may work to different numbers for you.`;
 };
 const unitOf = chip => (chip.inRecord ? recordMeasure(questions.measures.find(m => m.id === chip.id)?.explains[0] ?? chip.id).unit : undefined);
 const ownDeviceMark = read('packages/catalog/devices.json').marks.find(m => m.id === 'consumer-device').sentence;
 return { shop, capture, records, questions, kase, live, instrument, measuresOf, connection, recordMeasure, holds, chips, seen, kitCents, rangeSentence, unitOf, ownDeviceMark };
}
const FORBIDDEN_FIELDS = ['treats', 'claims', 'indication', 'schedule', 'prescription'];

const swift = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
const wrap = (text, width = 94) => text.match(new RegExp(`.{1,${width}}(\\s|$)`, 'g')).map(line => line.trim());

export function emitShop(root = '') {
 const contract = JSON.parse(readFileSync(root + SOURCE, 'utf8'));
 const d = shopDerivation(root);

 if (!contract.refusals?.length) throw new Error('packages/catalog/shop.json declares no refusals, and the refusals are the feature.');
 const categories = new Set(contract.categories.map(c => c.id));
 for (const product of contract.products) {
  for (const field of FORBIDDEN_FIELDS) {
   if (field in product) throw new Error(`Product "${product.id}" carries a "${field}" field. A shop listing states what a thing does and never what it treats — see the generator.`);
  }
  if (!categories.has(product.category)) throw new Error(`Product "${product.id}" is in the category "${product.category}", which shop.json has not got.`);
  if (!Number.isInteger(product.price) || product.price <= 0) throw new Error(`Product "${product.id}" has no whole-rand price.`);
  const haystack = `${product.id} ${product.name} ${product.does}`.toLowerCase();
  const hit = contract.neverSold.find(word => haystack.includes(word.toLowerCase()));
  if (hit) throw new Error(`Product "${product.id}" matches the never-sold word "${hit}". This shop does not sell medicine, and the check is what keeps that true.`);
  if (!product.does.trim().endsWith('.')) throw new Error(`Product "${product.id}" has a "does" that is not a sentence.`);
 }
 for (const refusal of contract.refusals) {
  if (!refusal.sentence || !refusal.why) throw new Error(`Refusal "${refusal.id}" is missing its sentence or its reasoning. The sentence is what a person reads; the reasoning is what stops the next person deleting it.`);
 }

 /* The pictures, as each phone names them: an imageset per product in the iOS asset catalogue and a
    drawable per product on Android, both 480×360 copies of the web's picture. A generated reference to
    a drawable that does not exist fails the Android compile, which is the check the phones get for free. */
 const imageName = id => `Shop-${id}`;
 const drawableName = id => `shop_${id.replace(/-/g, '_')}`;
 const regulatory = p => {
  const c = contract.regulatory.classes.find(x => x.id === p.sahpra);
  if (!c) throw new Error(`Product "${p.id}" names the regulatory class "${p.sahpra}", which shop.json's regulatory section has not got.`);
  return `${c.label}. ${c.meaning}`;
 };

 const banner = () => [
  `Generated by scripts/emit-shop.mjs from ${SOURCE}.`,
  'Do not edit by hand — run `npm run shop`. The build fails if this file and the source',
  'disagree, so an edit here is lost rather than merely wrong.',
  '',
  'The MyThuso shop. Devices, consumables and wellness goods — and no medicine, at all, of any',
  'schedule. Supplying medicine is a licensed activity under the Medicines and Related Substances',
  'Act 101 of 1965, and a shop that sells a monitor today and a painkiller tomorrow has become a',
  'pharmacy without a licence. A listing says what a thing does and never what it treats.',
  '',
  'Prices are integer cents, and a kit has none of its own. Nothing here is a real service: no card is charged, no order is',
  'placed and nothing is delivered.'
 ].map(line => (line ? `// ${line}` : '//')).join('\n');

 const swiftFile = `${banner()}

import Foundation

enum ShopData {
    /// A thing a household can buy. \`does\` is what the object physically does; there is no field
    /// for what it treats, and the generator throws if one is added — see scripts/emit-shop.mjs.
    struct Product: Identifiable, Hashable {
        let id: String; let name: String; let category: String
        let priceCents: Int; let stock: Int; let does: String; let needsReading: Bool
        /// The storefront's own detail, derived where the contract derives it — see the generator.
        var detail: Detail = .none
    }
    /// One line of "what you, your nurse and your doctor see". \`planned\` is drawn as planned.
    struct Seen: Hashable { let text: String; let planned: Bool }
    struct Detail: Hashable {
        let image: String; let alt: String; let readings: [String]; let outsideRecord: [String]
        let connection: String; let forWhom: String; let features: [String]; let whatItIsNot: [String]
        let patient: [Seen]; let nurse: [Seen]; let doctor: [Seen]
        let regulatory: String; let referenceLowCents: Int; let referenceHighCents: Int
        let referenceChecked: String; let referenceFrom: String
        static let none = Detail(image: "", alt: "", readings: [], outsideRecord: [], connection: "", forWhom: "", features: [], whatItIsNot: [],
                                 patient: [], nurse: [], doctor: [], regulatory: "", referenceLowCents: 0, referenceHighCents: 0, referenceChecked: "", referenceFrom: "")
    }
    /// A kit is a list of products. Its price is the sum of theirs — \`priceCents(of:)\` — and is never stored.
    struct Kit: Identifiable, Hashable { let id: String; let name: String; let items: [String]; let does: String; let forWhom: String; let image: String; let alt: String }
    struct Category: Identifiable, Hashable { let id: String; let name: String; let blurb: String; let pointsEligible: Bool }
    /// Something the shop will not do, in the words a person reads.
    struct Refusal: Identifiable, Hashable { let id: String; let sentence: String }

    static let currency = ${swift(contract.currency)}
    static let deliveryFeeCents = ${contract.delivery.fee * 100}
    static let deliveryFreeAboveCents = ${contract.delivery.freeAbove * 100}
    static let deliveryStandardDays = ${contract.delivery.standardDays}

    static let categories: [Category] = [
${contract.categories.map(c => `        .init(id: ${swift(c.id)}, name: ${swift(c.name)},
              blurb: ${swift(c.blurb)}, pointsEligible: ${c.pointsEligible})`).join(',\n')}
    ]

    static let products: [Product] = [
${contract.products.map(p => `        .init(id: ${swift(p.id)}, name: ${swift(p.name)}, category: ${swift(p.category)},
              priceCents: ${p.price * 100}, stock: ${p.stock},
              does: ${swift(p.does)}, needsReading: ${p.needsReading},
              detail: .init(image: ${swift(imageName(p.id))}, alt: ${swift(p.image.alt)},
                            readings: [${d.chips(p).filter(c => c.inRecord).map(c => swift(c.label)).join(', ')}],
                            outsideRecord: [${d.chips(p).filter(c => !c.inRecord).map(c => swift(`${c.label}. ${c.sentence}`)).join(', ')}],
                            connection: ${swift(d.connection(p))}, forWhom: ${swift(p.forWhom)},
                            features: [${p.features.map(swift).join(', ')}],
                            whatItIsNot: [${p.whatItIsNot.map(swift).join(', ')}],
                            patient: [${d.seen(p, 'patient').map(l => `.init(text: ${swift(l.text)}, planned: ${l.planned})`).join(', ')}],
                            nurse: [${d.seen(p, 'nurse').map(l => `.init(text: ${swift(l.text)}, planned: ${l.planned})`).join(', ')}],
                            doctor: [${d.seen(p, 'doctor').map(l => `.init(text: ${swift(l.text)}, planned: ${l.planned})`).join(', ')}],
                            regulatory: ${swift(regulatory(p))},
                            referenceLowCents: ${p.reference.low * 100}, referenceHighCents: ${p.reference.high * 100},
                            referenceChecked: ${swift(p.reference.checked)}, referenceFrom: ${swift(p.reference.from)}))`).join(',\n')}
    ]

    static let kits: [Kit] = [
${contract.kits.map(k => `        .init(id: ${swift(k.id)}, name: ${swift(k.name)}, items: [${k.items.map(swift).join(', ')}],
              does: ${swift(k.does)}, forWhom: ${swift(k.forWhom)}, image: ${swift(imageName(k.id))}, alt: ${swift(k.image.alt)})`).join(',\n')}
    ]

    /// Every picture is generated, and says so wherever it is drawn.
    static let imageLabel = ${swift(contract.images.label)}

    /// The welcome monitor — a planned launch offer, drawn as one. Sign-up is not live.
    enum Welcome {
        static let productId = ${swift(contract.welcome.productId)}
        static let label = ${swift(contract.welcome.label)}
        static let headline = ${swift(contract.welcome.headline)}
        static let intro = ${swift(contract.welcome.intro)}
        static let covers: [String] = [${contract.welcome.covers.map(c => swift(c.text)).join(', ')}]
        static let conditions: [String] = [${contract.welcome.conditions.map(c => swift(c.text)).join(', ')}]
    }

${wrap(contract._neverSoldNote).map(line => `    // ${line}`).join('\n')}
    static let neverSold: [String] = [${contract.neverSold.map(swift).join(', ')}]

    static let refusals: [Refusal] = [
${contract.refusals.map(r => `        .init(id: ${swift(r.id)}, sentence: ${swift(r.sentence)})`).join(',\n')}
    ]

    static func product(_ id: String) -> Product? { products.first { $0.id == id } }
    static func priceCents(of kit: Kit) -> Int { kit.items.compactMap { product($0)?.priceCents }.reduce(0, +) }
    static func category(_ id: String) -> Category? { categories.first { $0.id == id } }
    static func refusal(_ id: String) -> Refusal? { refusals.first { $0.id == id } }
}
`;

 const kotlinFile = `${banner()}

package za.co.mythuso.model

import za.co.mythuso.R

data class ShopProduct(
    val id: String, val name: String, val category: String,
    val priceCents: Int, val stock: Int, val does: String, val needsReading: Boolean,
    /** The storefront's own detail, derived where the contract derives it — see the generator. */
    val detail: ShopDetail? = null
)
/** One line of "what you, your nurse and your doctor see". \`planned\` is drawn as planned. */
data class ShopSeen(val text: String, val planned: Boolean)
data class ShopDetail(
    val image: Int, val alt: String, val readings: List<String>, val outsideRecord: List<String>,
    val connection: String, val forWhom: String, val features: List<String>, val whatItIsNot: List<String>,
    val patient: List<ShopSeen>, val nurse: List<ShopSeen>, val doctor: List<ShopSeen>,
    val regulatory: String, val referenceLowCents: Int, val referenceHighCents: Int,
    val referenceChecked: String, val referenceFrom: String
)
/** A kit is a list of products. Its price is the sum of theirs — \`ShopData.priceCents(kit)\` — and is never stored. */
data class ShopKit(val id: String, val name: String, val items: List<String>, val does: String, val forWhom: String, val image: Int, val alt: String)
data class ShopCategory(val id: String, val name: String, val blurb: String, val pointsEligible: Boolean)
data class ShopRefusal(val id: String, val sentence: String)

val shopCategories = listOf(
${contract.categories.map(c => `    ShopCategory(${kotlin(c.id)}, ${kotlin(c.name)}, ${kotlin(c.blurb)}, ${c.pointsEligible})`).join(',\n')}
)

val shopProducts = listOf(
${contract.products.map(p => `    ShopProduct(${kotlin(p.id)}, ${kotlin(p.name)}, ${kotlin(p.category)}, ${p.price * 100}, ${p.stock}, ${kotlin(p.does)}, ${p.needsReading},
        ShopDetail(R.drawable.${drawableName(p.id)}, ${kotlin(p.image.alt)},
            listOf(${d.chips(p).filter(c => c.inRecord).map(c => kotlin(c.label)).join(', ')}),
            listOf(${d.chips(p).filter(c => !c.inRecord).map(c => kotlin(`${c.label}. ${c.sentence}`)).join(', ')}),
            ${kotlin(d.connection(p))}, ${kotlin(p.forWhom)},
            listOf(${p.features.map(kotlin).join(', ')}),
            listOf(${p.whatItIsNot.map(kotlin).join(', ')}),
            listOf(${d.seen(p, 'patient').map(l => `ShopSeen(${kotlin(l.text)}, ${l.planned})`).join(', ')}),
            listOf(${d.seen(p, 'nurse').map(l => `ShopSeen(${kotlin(l.text)}, ${l.planned})`).join(', ')}),
            listOf(${d.seen(p, 'doctor').map(l => `ShopSeen(${kotlin(l.text)}, ${l.planned})`).join(', ')}),
            ${kotlin(regulatory(p))}, ${p.reference.low * 100}, ${p.reference.high * 100}, ${kotlin(p.reference.checked)}, ${kotlin(p.reference.from)}))`).join(',\n')}
)

val shopKits = listOf(
${contract.kits.map(k => `    ShopKit(${kotlin(k.id)}, ${kotlin(k.name)}, listOf(${k.items.map(kotlin).join(', ')}), ${kotlin(k.does)}, ${kotlin(k.forWhom)}, R.drawable.${drawableName(k.id)}, ${kotlin(k.image.alt)})`).join(',\n')}
)

/** The welcome monitor — a planned launch offer, drawn as one. Sign-up is not live. */
object ShopWelcome {
    const val productId = ${kotlin(contract.welcome.productId)}
    const val label = ${kotlin(contract.welcome.label)}
    const val headline = ${kotlin(contract.welcome.headline)}
    const val intro = ${kotlin(contract.welcome.intro)}
    val covers = listOf(${contract.welcome.covers.map(c => kotlin(c.text)).join(', ')})
    val conditions = listOf(${contract.welcome.conditions.map(c => kotlin(c.text)).join(', ')})
}

val shopNeverSold = listOf(${contract.neverSold.map(kotlin).join(', ')})

val shopRefusals = listOf(
${contract.refusals.map(r => `    ShopRefusal(${kotlin(r.id)}, ${kotlin(r.sentence)})`).join(',\n')}
)

object ShopData {
    const val currency = ${kotlin(contract.currency)}
    const val deliveryFeeCents = ${contract.delivery.fee * 100}
    const val deliveryFreeAboveCents = ${contract.delivery.freeAbove * 100}
    const val deliveryStandardDays = ${contract.delivery.standardDays}

    /** Every picture is generated, and says so wherever it is drawn. */
    const val imageLabel = ${kotlin(contract.images.label)}

    fun product(id: String) = shopProducts.firstOrNull { it.id == id }
    fun priceCents(kit: ShopKit) = kit.items.sumOf { product(it)?.priceCents ?: 0 }
    fun category(id: String) = shopCategories.firstOrNull { it.id == id }
    fun refusal(id: String) = shopRefusals.firstOrNull { it.id == id }
}
`;

 /* The web's copy. The storefront is its own entry, and every contract it reads that the patient app also
    reads statically — capture.json, records.json — makes Rollup split a chunk the patient's first view then
    downloads in more pieces: measured at +0.8 kB on 2 October 2026. So the storefront reads this projection
    instead of the contracts, and the derivation stays in one place, here. */
 const webDerived = Object.fromEntries(contract.products.map(p => [p.id, {
  connection: d.connection(p),
  calibrationMonths: d.instrument(p)?.calibrateEveryMonths ?? null,
  chips: d.chips(p).map(c => ({ id: c.id, label: c.label, unit: d.unitOf(c) ?? null, inRecord: c.inRecord, range: d.rangeSentence(c) })),
  patient: d.seen(p, 'patient').map(({ text, planned }) => ({ text, planned })),
  nurse: d.seen(p, 'nurse').map(({ text, planned }) => ({ text, planned })),
  doctor: d.seen(p, 'doctor').map(({ text, planned }) => ({ text, planned }))
 }]));
 const webFile = `${banner()}
//
// The storefront's projection: for each product, how a reading reaches the app, the readings it takes with
// their indicative range in words, and the who-sees-what lines that hold for it — worked out from
// capture.json, records.json, reading-questions.json, case.json and live-vitals.json by the same code that
// writes the phones' copies, so the shop entry reads none of those contracts itself.

export type ShopChip = { readonly id: string; readonly label: string; readonly unit: string | null; readonly inRecord: boolean; readonly range: string };
export type ShopSeen = { readonly text: string; readonly planned: boolean };
export type ShopDerived = {
 readonly connection: '' | 'bluetooth' | 'typed';
 readonly calibrationMonths: number | null;
 readonly chips: readonly ShopChip[];
 readonly patient: readonly ShopSeen[]; readonly nurse: readonly ShopSeen[]; readonly doctor: readonly ShopSeen[];
};

/** devices.json's own mark for a reading from a device MyThuso did not issue. */
export const ownDeviceMark = ${JSON.stringify(d.ownDeviceMark)};

export const derived: Readonly<Record<string, ShopDerived>> = ${JSON.stringify(webDerived, null, 1)};
`;

 return [
  { path: 'apps/web/src/lib/shop-derived.generated.ts', content: webFile },
  { path: 'apps/ios/MyThuso/Models/ShopData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/ShopData.kt', content: kotlinFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitShop()) {
  writeFileSync(file.path, file.content);
  console.log(`shop → ${file.path}`);
 }
}
