import { productById, shop } from './contract.ts';
import { basketOf, refuse, requireThat, shopperIn } from './guards.ts';
import type { Command, State } from './types.ts';

/* A basket holds nothing and owes nothing. Stock is not touched until it is reserved, which is why
   two people may both have the last grab rail in a basket and only one of them may reserve it. */
export function basket(state: State, command: Command) {
 const shopper = shopperIn(state, command.shopperId);
 const lines = basketOf(state, shopper.id).lines;
 if (command.type === 'basket.add') {
  const product = productById(command.productId);
  requireThat(Number.isInteger(command.quantity) && command.quantity > 0 && command.quantity <= 10, 'Choose between 1 and 10 of an item.');
  const held = state.stock[product.id] ?? 0;
  const existing = lines.find(l => l.productId === product.id);
  const wanted = (existing?.quantity ?? 0) + command.quantity;
  /* Checked against stock on the way into the basket as well as on the way out of it — not because
     the basket reserves anything, but so a person is told now rather than at the end. */
  if (wanted > held) refuse('out-of-stock', 'stock-held-once');
  if (existing) existing.quantity = wanted; else lines.push({ productId: product.id, quantity: command.quantity });
 } else if (command.type === 'basket.set') {
  /* A quantity a person typed or dragged, rather than a delta. Zero removes the line — the
     alternative is a basket that holds nought of something, which reads as a bug to everyone. */
  const product = productById(command.productId);
  requireThat(Number.isInteger(command.quantity) && command.quantity >= 0 && command.quantity <= 10, 'Choose between 0 and 10 of an item.');
  const at = lines.findIndex(l => l.productId === product.id);
  requireThat(at >= 0, 'That item is not in this basket.');
  if (command.quantity === 0) { lines.splice(at, 1); return; }
  if (command.quantity > (state.stock[product.id] ?? 0)) refuse('out-of-stock', 'stock-held-once');
  lines[at].quantity = command.quantity;
 } else if (command.type === 'basket.remove') {
  const at = lines.findIndex(l => l.productId === command.productId);
  requireThat(at >= 0, 'That item is not in this basket.');
  lines.splice(at, 1);
 } else if (command.type === 'basket.clear') {
  lines.length = 0;
 }
}

/** Delivery is one fee and one threshold, both out of the contract, both stated before a basket
 *  is opened. A fee that appears at the final step is a fee a person never agreed to. */
export function deliveryCentsFor(goodsCents: number, freeDelivery: boolean): number {
 if (freeDelivery || goodsCents >= shop.delivery.freeAbove * 100) return 0;
 return shop.delivery.fee * 100;
}
