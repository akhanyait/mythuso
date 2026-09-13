import { CENTS_PER_POINT, productById } from './contract.ts';
import { deliveryCentsFor } from './basket.ts';
import { adultOnly, basketOf, refuse, requireThat, shopperIn } from './guards.ts';
import { balanceOf, pointsForLines, spend, write } from './rewards.ts';
import type { Command, State } from './types.ts';

/* Delivery is held to the coverage areas a home visit is held to. A shop that quietly accepts an
   order it cannot reach has sold somebody a wait. The zone list is passed in by the host from
   packages/catalog/geography.json rather than restated here. */
export function reserve(state: State, command: Extract<Command, { type: 'order.reserve' }>, now: string, zones: string[]) {
 const shopper = shopperIn(state, command.shopperId);
 adultOnly(shopper);
 if (!zones.includes(shopper.suburb)) refuse('refused', 'outside-coverage');

 const basket = basketOf(state, shopper.id);
 requireThat(basket.lines.length > 0, 'There is nothing in this basket yet.');

 /* Stock is checked and taken in one pass over a cloned state, so a basket that is short on its
    third line does not leave the first two already deducted. The kernel discards the clone. */
 for (const line of basket.lines) {
  const product = productById(line.productId);
  if ((state.stock[product.id] ?? 0) < line.quantity) refuse('out-of-stock', 'stock-held-once');
 }
 for (const line of basket.lines) state.stock[line.productId] -= line.quantity;

 const goodsCents = basket.lines.reduce((sum, l) => sum + productById(l.productId).price * 100 * l.quantity, 0);
 const tier = balanceOf(state, shopper.id, 'household', now).tier;
 const freeDelivery = tier !== 'green';
 const deliveryCents = deliveryCentsFor(goodsCents, freeDelivery);
 const pointsApplied = spend(state, shopper.id, command.spendPoints, basket.lines, now);

 const order = {
  id: `ORD-${state.orders.length + 1}`, shopperId: shopper.id, lines: [...basket.lines],
  status: 'quoted' as const, goodsCents, deliveryCents, pointsApplied,
  /* Never below zero, and the delivery fee is outside what points may touch. */
  totalCents: Math.max(0, goodsCents - pointsApplied) + deliveryCents,
  placedAt: now
 };
 state.orders.push(order);

 /* Earned on what was paid for in rand, not on what points covered — otherwise a redemption
    would mint the points that paid for it. A medicine earns nothing here by arithmetic. */
 const earned = pointsForLines(order.lines);
 if (earned > 0) write(state, shopper.id, 'goods-purchased', earned, now, true);

 basket.lines.length = 0;
 return order;
}

export function cancel(state: State, command: Extract<Command, { type: 'order.cancel' }>, now: string) {
 const order = state.orders.find(o => o.id === command.orderId && o.shopperId === command.shopperId);
 requireThat(!!order, 'That order does not belong to this account.');
 requireThat(order.status !== 'cancelled', 'That order is already cancelled.');
 for (const line of order.lines) state.stock[line.productId] += line.quantity;
 /* Points held against a cancelled order come back unspent. Points already earned do not come
    back off — the same principle as a suspension never touching money already earned. */
 if (order.pointsApplied > 0) write(state, order.shopperId, 'goods-purchased', order.pointsApplied / CENTS_PER_POINT, now, true);
 order.status = 'cancelled';
}
