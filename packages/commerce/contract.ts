/* The contracts, read once and checked on the way in. Everything downstream derives from these
   two files: no price, no points rate and no refusal sentence is typed into this package. */
import shopContract from '../catalog/shop.json' with { type: 'json' };
import rewardsContract from '../catalog/rewards.json' with { type: 'json' };
import { CommerceError } from './types.ts';

export const shop = shopContract;
export const rewards = rewardsContract;

export type Product = (typeof shopContract)['products'][number];

/** Money is integer cents everywhere inside this kernel. Rands enter once, here. */
export const centsOf = (rand: number) => Math.round(rand * 100);
/** What one point takes off a bill, derived from randPerPoint rather than restated. */
export const CENTS_PER_POINT = centsOf(rewards.randPerPoint);

export const productById = (id: string): Product => {
 const product = shop.products.find(p => p.id === id);
 if (!product) throw new CommerceError('not-found', 'That item is not in the shop.');
 return product;
};

export const refusal = (id: string): string => {
 const found = [...shop.refusals, ...rewards.refusals].find(r => r.id === id);
 /* A refusal rendered from a missing id would show a person an empty sentence at the exact moment
    the product is telling them no. Louder to fail here. */
 if (!found) throw new CommerceError('invalid', `No refusal in either contract is called "${id}".`);
 return found.sentence;
};

export const earnReason = (id: string) => {
 const found = rewards.earnReasons.find(r => r.id === id);
 if (!found) throw new CommerceError('invalid', `No earning reason in rewards.json is called "${id}".`);
 return found;
};

/* Section 18A, as arithmetic. Nothing in shop.json is a medicine — scripts/check-boundaries.mjs
   fails the build if one appears — but the kernel does not take that on trust, because the check
   guards the contract and this guards the kernel. Anything that looks like a medicine earns zero
   and redeems zero, so the day a listing slips through, it slips through inert. */
export const isMedicine = (product: Product): boolean => {
 const haystack = `${product.id} ${product.name} ${product.does}`.toLowerCase();
 return shop.neverSold.some(word => haystack.includes(word.toLowerCase()));
};

export const categoryOf = (product: Product) => shop.categories.find(c => c.id === product.category);

/** Points are earned on a line only where the category says so and the item is not a medicine. */
export const pointsEligible = (product: Product): boolean =>
 !isMedicine(product) && categoryOf(product)?.pointsEligible === true;

export const tierFor = (points: number) =>
 [...rewards.tiers].sort((a, b) => b.from - a.from).find(t => points >= t.from) ?? rewards.tiers[0];
