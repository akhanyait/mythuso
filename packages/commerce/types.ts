/* The shop and the points are one kernel and not two, because the single most dangerous moment in
   this feature is the one where points are spent and stock is taken at the same instant. Two
   engines with two revisions could take the points and fail the reservation, or reserve goods
   against points that were already spent elsewhere. There is one revision here and one commit. */

export type Track = 'household' | 'recognition';
/** Supplied by an authenticated host. `adult` is asserted by the host, never inferred from a basket. */
export type Shopper = { id: string; adult: boolean; suburb: string };

export type LineItem = { productId: string; quantity: number };
export type Basket = { shopperId: string; lines: LineItem[] };

export type Order = {
 id: string; shopperId: string; lines: LineItem[];
 status: 'reserved' | 'quoted' | 'cancelled';
 goodsCents: number; deliveryCents: number; pointsApplied: number; totalCents: number;
 placedAt: string;
};

/** A ledger row is the whole POPIA surface of this feature. `reason` is an id from
 *  rewards.json and `note` is that reason's own `discloses` sentence — never a free string a
 *  caller passed in, because a free string is where a diagnosis would eventually be written. */
export type LedgerEntry = {
 sequence: number; shopperId: string; track: Track;
 reason: string; note: string; points: number; at: string; expiresAt?: string;
 /** Set on the negative row that cancels an expired one, so a sweep can never run twice. */
 expiredFrom?: number;
};

export type Balance = { track: Track; points: number; tier: string; expiringSoon: number };

export type State = {
 revision: number;
 stock: Record<string, number>;
 baskets: Basket[];
 orders: Order[];
 ledger: LedgerEntry[];
 shoppers: Shopper[];
};

export type Command =
 | { type: 'basket.add'; shopperId: string; productId: string; quantity: number }
 | { type: 'basket.set'; shopperId: string; productId: string; quantity: number }
 | { type: 'basket.remove'; shopperId: string; productId: string }
 | { type: 'basket.clear'; shopperId: string }
 | { type: 'order.reserve'; shopperId: string; spendPoints: number }
 | { type: 'order.cancel'; shopperId: string; orderId: string }
 | { type: 'rewards.accrue'; shopperId: string; reason: string }
 | { type: 'rewards.expire'; shopperId: string };

export type Receipt = { state: State; replayed: boolean };

/** A host implements nothing here beyond resolving the shopper. There is deliberately no
 *  `rewards.withdraw`, no `rewards.transfer` and no `order.pay`: a command that does not exist
 *  cannot be called by mistake, and the absence is the enforcement. */
export interface CommercePort {
 readonly mode: 'sandbox' | 'connected';
 snapshot(): State;
 balance(shopperId: string, track: Track): Balance;
 execute(command: Command, options: { expectedRevision: number; idempotencyKey: string }): Receipt;
 subscribe(listener: () => void): () => void;
}

export const PROTOCOL_VERSION = '1.0';

/* Declared rather than a constructor parameter property: Node strips types instead of compiling
   them, so a parameter property would not survive to runtime. Same rule as apps/api. */
export type CommerceErrorCode = 'forbidden' | 'conflict' | 'invalid' | 'not-found' | 'out-of-stock' | 'refused';
export class CommerceError extends Error {
 code: CommerceErrorCode;
 constructor(code: CommerceErrorCode, message: string) { super(message); this.code = code; this.name = 'CommerceError'; }
}
