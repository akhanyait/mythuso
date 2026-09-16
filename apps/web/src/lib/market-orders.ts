import { createMoney, type Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { isRefusal } from '../../../../packages/engines/src/money/domain/contract.ts';
import type { MethodId } from '../../../../packages/engines/src/money/domain/methods.ts';

/* A real Thuso Market order, placed through Money's own ledger, from the shop's own entry.
 *
 * Everything else on this page — the basket, the points, the "hold stock and quote me" step — is
 * packages/commerce's own kernel, which stops at a quote on purpose: nobody sold the reader anything and
 * packages/commerce/contract.ts's own no-payment refusal says so. This module is the one place on the page that
 * calls Money: placing an order opens a payable at the catalogue's total, exactly as a visit does, and refuses
 * medicine-in-shop on a product Money's own reading of the catalogue says is one — the same refusal packages/
 * commerce's isMedicine defends against, read independently rather than trusted from there.
 *
 * One ledger for the shop's own session, in memory only: a reload opens the preview afresh, no order exists and
 * nothing is charged.
 */

const SHOPPER = 'demo-lerato';
const ledger: Money = createMoney({ simulation: true });
let attempt = 0;

/* One shape with nullable fields rather than a union: a screen reading `refused` first, before it ever reads
   `marketOrderRef`, needs no type guard to do it — the two are never both meaningful at once, and never both
   absent either. */
export type OrderPlaced = { refused: string | null; marketOrderRef: string | null; totalCents: number | null };

/** Place an order for these products (repeat an id for more than one), to this delivery zone. */
export function placeRealOrder(productIds: readonly string[], deliveryZone: string): OrderPlaced {
 attempt += 1;
 const answer = ledger.placeMarketOrder({ role: 'patient', subjectRef: SHOPPER }, { idempotencyKey: `shop-order-${attempt}`, productIds: [...productIds], deliveryZone });
 return isRefusal(answer)
  ? { refused: answer.statement, marketOrderRef: null, totalCents: null }
  : { refused: null, marketOrderRef: answer.marketOrderRef, totalCents: answer.totalCents };
}

export type OrderPaid = { refused: string | null; stateCode: string | null; cashCode: string | null };

/** Pay for a placed order, the same way a visit is paid for. */
export function payForRealOrder(marketOrderRef: string, totalCents: number, method: MethodId): OrderPaid {
 attempt += 1;
 const answer = ledger.pay({ role: 'patient', subjectRef: SHOPPER }, { idempotencyKey: `shop-order-pay-${attempt}`, payableRef: `PB-${marketOrderRef}`, method, amountCents: totalCents });
 return isRefusal(answer)
  ? { refused: answer.statement, stateCode: null, cashCode: null }
  : { refused: null, stateCode: answer.stateCode, cashCode: answer.cashCode ?? null };
}
