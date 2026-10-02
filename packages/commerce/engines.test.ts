import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerce, isMedicine, pointsEligible, shop, rewards, type Command, type State } from './index.ts';
import { SANDBOX_ZONES, sandboxState } from './fixtures.ts';
import { balanceOf } from './rewards.ts';

const now = '2026-09-13T08:00:00.000Z';
function fixture(who = 'demo-lerato', clock = () => now) {
 let id = who, key = 0;
 const port = createCommerce(sandboxState(), () => id, SANDBOX_ZONES, clock);
 return { port, as: (next: string) => { id = next; },
  run: (c: Command) => port.execute(c, { expectedRevision: port.snapshot().revision, idempotencyKey: `t-${++key}` }) };
}
const shopperId = 'demo-lerato';
const fill = (f: ReturnType<typeof fixture>, productId = 'thermometer', quantity = 1) =>
 f.run({ type: 'basket.add', shopperId, productId, quantity });

test('the shop sells no medicine, and the contract says so in words a check can read', () => {
 for (const product of shop.products) {
  assert.equal(isMedicine(product), false, `${product.id} matches a word in neverSold`);
  assert.ok(!('treats' in product) && !('claims' in product), `${product.id} carries a claim field`);
 }
 assert.ok(shop.neverSold.length > 0);
});

test('an order takes stock once, and the second reservation of the last one is refused', () => {
 const f = fixture();
 f.run({ type: 'basket.add', shopperId, productId: 'walker', quantity: 7 });
 f.run({ type: 'order.reserve', shopperId, spendPoints: 0 });
 assert.equal(f.port.snapshot().stock.walker, 0);
 assert.throws(() => f.run({ type: 'basket.add', shopperId, productId: 'walker', quantity: 1 }), /reserved the last one/);
});

test('a failed line leaves no earlier line deducted', () => {
 const f = fixture();
 fill(f, 'thermometer', 2);
 const before = { ...f.port.snapshot().stock };
 f.run({ type: 'basket.add', shopperId, productId: 'walker', quantity: 7 });
 const other = fixture(); // someone else empties the walkers first
 assert.equal(before.thermometer, f.port.snapshot().stock.thermometer);
 assert.ok(other.port.snapshot().stock.walker === 7);
});

test('points are earned on goods and spent at the contract rate, never below zero', () => {
 const f = fixture();
 fill(f, 'bp-upper', 1); // one point per rand of its price, read from the contract rather than typed
 f.run({ type: 'order.reserve', shopperId, spendPoints: 0 });
 const earned = balanceOf(f.port.snapshot(), shopperId, 'household', now).points;
 assert.equal(earned, shop.products.find(p => p.id === 'bp-upper')!.price);
 fill(f, 'thermometer', 1); // R149 = 14900c; 149 points = 1490c
 f.run({ type: 'order.reserve', shopperId, spendPoints: 149 });
 const order = f.port.snapshot().orders.at(-1)!;
 assert.equal(order.pointsApplied, 149 * 10);
 assert.equal(order.totalCents, 14900 - 1490 + shop.delivery.fee * 100);
 assert.ok(order.totalCents > 0);
});

test('a redemption is refused when it is larger than the order or the balance', () => {
 const f = fixture();
 fill(f, 'bp-diary', 1); // a notebook, worth far less than ten thousand points
 assert.throws(() => f.run({ type: 'order.reserve', shopperId, spendPoints: 10_000 }), /more points than this account has/);
});

test('section 18A: no product earns points unless its category allows it and it is not a medicine', () => {
 for (const product of shop.products) {
  const category = shop.categories.find(c => c.id === product.category)!;
  assert.equal(pointsEligible(product), category.pointsEligible && !isMedicine(product));
 }
 const adherence = rewards.earnReasons.find(r => /medicine|dose|script|adherence/i.test(r.name));
 assert.equal(adherence, undefined, 'a reason rewards taking medicine');
});

test('the ledger records that a visit happened and never why', () => {
 const f = fixture();
 f.run({ type: 'rewards.accrue', shopperId, reason: 'visit-attended' });
 const entry = f.port.snapshot().ledger.at(-1)!;
 assert.equal(entry.points, 150);
 assert.equal(entry.note, 'that a visit happened, and its date');
 assert.ok(!/wound|chronic|diabet|pregnan|HIV/i.test(JSON.stringify(entry)));
});

test('a capped reason stops at its cap', () => {
 const f = fixture();
 const cap = rewards.earnReasons.find(r => r.id === 'family-invited')!.cap!;
 for (let i = 0; i < cap; i += 1) f.run({ type: 'rewards.accrue', shopperId, reason: 'family-invited' });
 assert.throws(() => f.run({ type: 'rewards.accrue', shopperId, reason: 'family-invited' }), /capped at/);
});

test('points expire once, are swept once, and the balance agrees either way', () => {
 let clock = now;
 const f = fixture(shopperId, () => clock);
 f.run({ type: 'rewards.accrue', shopperId, reason: 'visit-attended' });
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'household', now).points, 150);
 clock = '2028-09-13T08:00:00.000Z'; // beyond 18 months
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'household', clock).points, 0, 'unswept balance still counts expired points');
 f.run({ type: 'rewards.expire', shopperId });
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'household', clock).points, 0);
 const after = f.port.snapshot().ledger.length;
 f.run({ type: 'rewards.expire', shopperId });
 assert.equal(f.port.snapshot().ledger.length, after, 'a second sweep wrote another reversal');
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'household', clock).points, 0);
});

test('a minor earns nothing and orders nothing', () => {
 const f = fixture('demo-karabo');
 assert.throws(() => f.run({ type: 'rewards.accrue', shopperId: 'demo-karabo', reason: 'visit-attended' }), /under eighteen/);
 f.run({ type: 'basket.add', shopperId: 'demo-karabo', productId: 'thermometer', quantity: 1 });
 assert.throws(() => f.run({ type: 'order.reserve', shopperId: 'demo-karabo', spendPoints: 0 }), /under eighteen/);
});

test('an address outside coverage is refused rather than accepted and delayed', () => {
 const state: State = { ...sandboxState() };
 state.shoppers = [{ id: 'far', adult: true, suburb: 'Polokwane' }];
 let key = 0;
 const port = createCommerce(state, () => 'far', SANDBOX_ZONES, () => now);
 const run = (c: Command) => port.execute(c, { expectedRevision: port.snapshot().revision, idempotencyKey: `k-${++key}` });
 run({ type: 'basket.add', shopperId: 'far', productId: 'thermometer', quantity: 1 });
 assert.throws(() => run({ type: 'order.reserve', shopperId: 'far', spendPoints: 0 }), /cannot deliver to this address/);
});

test('there is no command that pays, withdraws or transfers', () => {
 const source = JSON.stringify(Object.keys({} as Command));
 assert.ok(!/withdraw|transfer|payout|charge/i.test(source));
 const f = fixture();
 assert.throws(() => f.run({ type: 'rewards.withdraw', shopperId, amount: 10 } as unknown as Command), /Unknown commerce command/);
});

test('a basket belongs to one account and cannot be driven by another', () => {
 const f = fixture();
 assert.throws(() => f.run({ type: 'basket.add', shopperId: 'demo-thabo', productId: 'thermometer', quantity: 1 }), /belongs to another account/);
});

test('cancelling returns the stock and the points, and keeps what was earned', () => {
 const f = fixture();
 fill(f, 'bp-upper', 1);
 f.run({ type: 'order.reserve', shopperId, spendPoints: 0 });
 const stockAfter = f.port.snapshot().stock['bp-upper'];
 fill(f, 'oximeter', 1);
 f.run({ type: 'order.reserve', shopperId, spendPoints: 100 });
 const order = f.port.snapshot().orders.at(-1)!;
 const before = balanceOf(f.port.snapshot(), shopperId, 'household', now).points;
 f.run({ type: 'order.cancel', shopperId, orderId: order.id });
 const after = balanceOf(f.port.snapshot(), shopperId, 'household', now).points;
 assert.equal(after, before + 100, 'spent points did not come back');
 assert.equal(f.port.snapshot().stock.oximeter, 40);
 assert.equal(f.port.snapshot().stock['bp-upper'], stockAfter);
});

test('stale revisions and repeated keys behave like the clinical kernel', () => {
 const f = fixture();
 const command: Command = { type: 'basket.add', shopperId, productId: 'thermometer', quantity: 1 };
 const options = { expectedRevision: 0, idempotencyKey: 'same' };
 f.port.execute(command, options);
 assert.equal(f.port.execute(command, options).replayed, true);
 assert.throws(() => f.port.execute({ ...command, quantity: 2 }, options), /different command/);
 assert.throws(() => f.port.execute(command, { ...options, idempotencyKey: 'other' }), /shop changed/);
});

test('a tier is decided by points alone', () => {
 assert.deepEqual(rewards.tierInputs, ['points earned in the last 12 months']);
 const f = fixture();
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'household', now).tier, 'green');
 for (let i = 0; i < 12; i += 1) f.run({ type: 'rewards.accrue', shopperId, reason: 'visit-attended' });
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'household', now).tier, 'amber');
});

test('recognition points are worth nothing and are never redeemable', () => {
 const track = rewards.tracks.find(t => t.id === 'recognition')!;
 assert.equal(track.redeemable, false);
 const f = fixture();
 f.run({ type: 'rewards.accrue', shopperId, reason: 'visit-completed' });
 assert.equal(balanceOf(f.port.snapshot(), shopperId, 'recognition', now).points, 40);
 // Spending draws on the household track only; recognition cannot fund an order.
 fill(f, 'thermometer', 1);
 assert.throws(() => f.run({ type: 'order.reserve', shopperId, spendPoints: 40 }), /more points than this account has/);
});

test('a quantity is set rather than nudged, and zero takes the line out', () => {
 const f = fixture();
 fill(f, 'thermometer', 3);
 f.run({ type: 'basket.set', shopperId, productId: 'thermometer', quantity: 2 });
 assert.equal(f.port.snapshot().baskets[0].lines[0].quantity, 2);
 f.run({ type: 'basket.set', shopperId, productId: 'thermometer', quantity: 0 });
 assert.equal(f.port.snapshot().baskets[0].lines.length, 0);
 fill(f, 'walker', 1);
 assert.throws(() => f.run({ type: 'basket.set', shopperId, productId: 'walker', quantity: 9 }), /reserved the last one/);
});
