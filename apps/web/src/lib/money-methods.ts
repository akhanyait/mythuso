import { methods } from '../../../../packages/engines/src/money/domain/methods.ts';
/* What the payment step draws before anybody pays: the ways to pay, by the name a person reads.
 *
 * Separate from lib/money.ts because that module brings Thuso Money's whole ledger with it, and the
 * ledger reads the API, event and plan contracts. A patient choosing a service on a metered connection
 * should download the list of ways to pay and nothing more; the ledger arrives when they press Confirm.
 */
export const visitMethods = methods.filter(m => m.offered && m.for.includes('visit'));
/** Ways to pay for a Thuso Market order: the same list a visit offers, minus cash, which is the patient's at her
    door and never a courier's. */
export const orderMethods = methods.filter(m => m.offered && m.for.includes('order'));
export const notOffered = methods.filter(m => !m.offered);
export const methodByName = (name: string) => methods.find(m => m.name === name);
