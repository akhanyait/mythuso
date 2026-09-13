import { basket } from './basket.ts';
import { cancel, reserve } from './order.ts';
import { accrue, balanceOf, expire } from './rewards.ts';
import { adultOnly, shopperIn } from './guards.ts';
import { CommerceError, type Command, type CommercePort, type State, type Track } from './types.ts';
export * from './types.ts';
export { CENTS_PER_POINT, isMedicine, pointsEligible, productById, refusal, rewards, shop, tierFor } from './contract.ts';
export { balanceOf, liveEntries, pointsForLines } from './rewards.ts';

/** One in-memory kernel per host session. The shop and the points commit through a single seam and
 *  a single revision, because a redemption that succeeded while its reservation failed would take
 *  a person's points and give them nothing. The actor resolver belongs to the host; a real adapter
 *  must authenticate and authorise before calling in. No payment provider is reachable from here,
 *  and there is no command that would ask one for anything. */
export function createCommerce(initial: State, shopperId: () => string, zones: string[], clock: () => string = () => new Date().toISOString()): CommercePort {
 let state = structuredClone(initial);
 const listeners = new Set<() => void>();
 const receipts = new Map<string, string>();
 return {
  mode: 'sandbox',
  snapshot: () => structuredClone(state),
  balance: (id: string, track: Track) => balanceOf(state, id, track, clock()),
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  execute(command: Command, options) {
   const who = shopperId();
   if (command.shopperId !== who) throw new CommerceError('forbidden', 'This basket belongs to another account.');
   const key = `${who}:${options.idempotencyKey}`;
   const fingerprint = JSON.stringify({ who, command });
   const prior = receipts.get(key);
   if (prior) {
    if (prior !== fingerprint) throw new CommerceError('conflict', 'This idempotency key was used for a different command.');
    return { state: structuredClone(state), replayed: true };
   }
   if (state.revision !== options.expectedRevision) throw new CommerceError('conflict', 'The shop changed. Refresh before trying again.');

   const next = structuredClone(state), now = clock();
   shopperIn(next, command.shopperId);
   if (command.type.startsWith('basket.')) basket(next, command);
   else if (command.type === 'order.reserve') reserve(next, command, now, zones);
   else if (command.type === 'order.cancel') cancel(next, command, now);
   else if (command.type === 'rewards.accrue') { adultOnly(shopperIn(next, command.shopperId)); accrue(next, command.shopperId, command.reason, now); }
   else if (command.type === 'rewards.expire') expire(next, command.shopperId, now);
   else throw new CommerceError('invalid', 'Unknown commerce command.');

   next.revision += 1;
   state = next;
   const receipt = { state: structuredClone(state), replayed: false };
   receipts.set(key, fingerprint);
   // A listener cannot roll back an accepted command or make it look as though it failed.
   for (const listener of listeners) { try { listener(); } catch { /* the host owns its UI errors */ } }
   return receipt;
  }
 };
}
