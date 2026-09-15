/**
 * The ways to pay and the payment states, from packages/catalog/money.json and nothing else.
 *
 * A module of its own because the patient's booking screen needs to draw these the moment it opens,
 * and everything else Money reads — the API and event contracts, the doors, the plans — is not the
 * patient's to download before they have booked anything. contract.ts re-exports these, so there is one
 * definition of a way to pay, and the ledger that takes the payment is loaded only when somebody pays.
 */
import moneyContract from '../../../../catalog/money.json' with { type: 'json' };

export type MethodId = 'card' | 'eft' | 'debit-order' | 'cash-otp' | 'wallet';
export type PayableKind = 'visit' | 'plan';
export type PaymentStateId = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type Method = { id: MethodId; name: string; detail: string; for: PayableKind[]; offered: boolean; settledBy?: string; notOfferedBecause?: string };

export const methods = moneyContract.methods as Method[];

export function methodById(id: string): Method | undefined {
 return methods.find(m => m.id === id);
}
