import { useEffect, useState } from 'react';
import { createCommerce, type Command, type Track } from '../../../../packages/commerce/index.ts';
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
 return { state, execute, shopperId: SHOPPER, balance: (track: Track) => engine.balance(SHOPPER, track) };
}
