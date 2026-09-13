import { shop } from './contract.ts';
import type { State } from './types.ts';

/* Three fictional households. Stock comes from the contract rather than a second list, so a
   product added to shop.json is in stock here without anybody remembering to say so. */
export function sandboxState(): State {
 return {
  revision: 0,
  stock: Object.fromEntries(shop.products.map(p => [p.id, p.stock])),
  baskets: [],
  orders: [],
  ledger: [],
  shoppers: [
   { id: 'demo-lerato', adult: true, suburb: 'Rosebank' },
   { id: 'demo-thabo', adult: true, suburb: 'Soweto' },
   { id: 'demo-karabo', adult: false, suburb: 'Rosebank' }
  ]
 };
}
/* The coverage areas from packages/catalog/geography.json, not a second list. A boundary check
   holds these names to that file, because delivery reaches exactly as far as a nurse does. */
export const SANDBOX_ZONES = ['Randburg', 'Rosebank', 'Parktown', 'Melville', 'Soweto'];
