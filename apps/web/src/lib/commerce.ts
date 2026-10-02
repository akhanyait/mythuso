import { useEffect, useState } from 'react';
import { createCommerce, refusal, type Command, type Track } from '../../../../packages/commerce/index.ts';
import { SANDBOX_ZONES, sandboxState } from '../../../../packages/commerce/fixtures.ts';

/* One fictional shopper for the whole preview session. Never written to browser storage — the
   repository forbids it and a basket is exactly the kind of thing a shop would persist by reflex.
   Refreshing the page empties it, which is the honest behaviour for something that is not a shop. */
const SHOPPER = 'demo-lerato';
const engine = createCommerce(sandboxState(), () => SHOPPER, SANDBOX_ZONES);

export function useCommerce() {
 const [state, setState] = useState(engine.snapshot);
 useEffect(() => engine.subscribe(() => setState(engine.snapshot())), []);
 const execute = (command: Command) => engine.execute(command, { expectedRevision: state.revision, idempotencyKey: crypto.randomUUID() });
 /* A kit is several commands. Each is checked against the revision the previous one left, not the
    one this render saw — otherwise the second line of a kit is refused as a stale write. Every line
    is checked for stock before any is added, so a kit never lands half in the basket. */
 const executeAll = (commands: Extract<Command, { type: 'basket.add' }>[]) => {
  const now = engine.snapshot();
  const held = (id: string) => (now.baskets.find(b => b.shopperId === SHOPPER)?.lines.find(l => l.productId === id)?.quantity ?? 0);
  const short = commands.find(c => (now.stock[c.productId] ?? 0) < held(c.productId) + c.quantity);
  if (short) throw new Error(refusal('stock-held-once'));
  for (const command of commands) engine.execute(command, { expectedRevision: engine.snapshot().revision, idempotencyKey: crypto.randomUUID() });
 };
 return { state, execute, executeAll, shopperId: SHOPPER, balance: (track: Track) => engine.balance(SHOPPER, track) };
}
