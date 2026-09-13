import { CommerceError, type CommerceErrorCode, type Shopper, type State } from './types.ts';
import { refusal } from './contract.ts';

export function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new CommerceError('invalid', message); }

/** Every refusal a person reads comes out of the contract, in the contract's own words. A sentence
 *  typed into this package would be a second copy of something the three platforms must say
 *  identically, and the one that drifts is always the one nobody is looking at. */
export function refuse(code: CommerceErrorCode, id: string): never {
 throw new CommerceError(code, refusal(id));
}

export function shopperIn(state: State, id: string): Shopper {
 const shopper = state.shoppers.find(s => s.id === id);
 if (!shopper) throw new CommerceError('not-found', 'That account is not in this shop sandbox.');
 return shopper;
}

/** Eighteen is asserted by the host. A minor may hold a health record here under a guardian;
 *  letting that record hold a spendable balance would aim an incentive scheme at a child. */
export function adultOnly(shopper: Shopper) {
 if (!shopper.adult) refuse('forbidden', 'no-minor-account');
}

export function basketOf(state: State, shopperId: string) {
 let basket = state.baskets.find(b => b.shopperId === shopperId);
 if (!basket) { basket = { shopperId, lines: [] }; state.baskets.push(basket); }
 return basket;
}
