/**
 * Thuso Market orders: a household buys a device, a consumable or a wellness good between visits, and never a
 * medicine — scheduled or not, whatever it is called.
 *
 * ── Two ways in, one refusal ─────────────────────────────────────────────────────────────────
 *
 * packages/catalog/shop.json's own products can never be a medicine: scripts/check-boundaries.mjs fails the build
 * if one ever is. So the two ways a market order could still carry one are the two this file checks, exactly as
 * packages/commerce/contract.ts's isMedicine does not take the shop's own list on trust: a product id that reads,
 * by its words, as something on shop.json's neverSold list; and a product id that is really an entry in
 * packages/catalog/medicines.json's formulary, named by its code alone rather than by a word a scanner would
 * catch, whose schedule is Schedule 1 or above under the Medicines and Related Substances Act 101 of 1965. Both
 * answer the one refusal, medicine-in-shop, because a household ordering a monitor is not shown two different
 * reasons for the same door.
 *
 * ── What an order is, and is not ─────────────────────────────────────────────────────────────
 *
 * An order references the shop's product catalogue and a delivery zone, and nothing clinical — there is nothing
 * clinical to reference, because a shop product carries none. It opens a payable at the catalogue's price plus
 * delivery, the same way a visit does, and is paid for through the existing payments route: this file prices an
 * order, it does not take one.
 */
import shopContract from '../../../../catalog/shop.json' with { type: 'json' };
import medicinesContract from '../../../../catalog/medicines.json' with { type: 'json' };

export const shop = shopContract;
export type Product = (typeof shopContract)['products'][number];
type FormularyEntry = { entryCode: string; label: string; scheduleCode: string };
const formulary = medicinesContract.formulary.entries as FormularyEntry[];

export const productById = (id: string): Product | undefined => shop.products.find(p => p.id === id);
const formularyEntry = (id: string): FormularyEntry | undefined => formulary.find(e => e.entryCode === id);

/* The same word scan packages/commerce/contract.ts's isMedicine runs, kept here rather than imported so Money's
   engine carries no dependency on the shop's client-side kernel — the two answer the same law from the same list,
   read independently, which is what "the kernel does not take the contract on trust" is for. */
const haystackWords = (text: string) => text.toLowerCase();
const namesAMedicine = (haystack: string) => shop.neverSold.some(word => haystack.includes(word.toLowerCase()));

/**
 * Why a product id is refused as medicine-in-shop, or null when it is not. A real shop product is checked by its
 * own words as a matter of defence in depth, though none can ever match one — the build fails if it does. A
 * formulary entry is checked by its schedule, because its code alone carries no word a scanner would catch: "S1"
 * never appears in a name, and a caller sending SYN-0001 has sent nothing that looks like a medicine at all.
 */
export function medicineReasonFor(productId: string): string | null {
 const product = productById(productId);
 if (product && namesAMedicine(haystackWords(`${product.id} ${product.name} ${product.does}`))) return 'listed';
 const entry = formularyEntry(productId);
 if (entry && entry.scheduleCode !== 'S0') return 'scheduled';
 if (!product && !entry && namesAMedicine(haystackWords(productId))) return 'named';
 return null;
}

/** A product genuinely unknown to both the shop and the formulary: neither a real listing nor a medicine by any
    reading. The catalogue picker never sends one, so this is a loud, developer-facing fault rather than a refusal
    a person could cause — the same convention serviceById in ./contract.ts follows for a service nobody sells. */
export function shopProductOrThrow(productId: string): Product {
 const product = productById(productId);
 if (!product) throw new Error(`No product "${productId}" in packages/catalog/shop.json, and it is not a medicine either. A market order carries only what the shop's own picker offers.`);
 return product;
}

/** Delivery, from the one fee and the one threshold packages/catalog/shop.json states before a basket opens. */
export function deliveryCentsFor(goodsCents: number): number {
 return goodsCents >= shop.delivery.freeAbove * 100 ? 0 : shop.delivery.fee * 100;
}

/** How many of each id a flat list of product ids asks for, in the order first seen. */
export function quantitiesOf(productIds: readonly string[]): { productId: string; quantity: number }[] {
 const order: string[] = [];
 const counts = new Map<string, number>();
 for (const id of productIds) {
  if (!counts.has(id)) order.push(id);
  counts.set(id, (counts.get(id) ?? 0) + 1);
 }
 return order.map(productId => ({ productId, quantity: counts.get(productId)! }));
}
