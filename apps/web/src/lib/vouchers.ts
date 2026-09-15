import contract from '../../../../packages/catalog/vouchers.json' with { type: 'json' };
import services from '../../../../packages/catalog/services.json' with { type: 'json' };
import { isRefusal } from '../../../../packages/engines/src/money/domain/contract.ts';
import type { Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { PREVIEW_PAYER } from './money';
/* A voucher at the web checkout, through Thuso Money's own ledger.
 *
 * Nobody sold the reader a voucher, so a simulated corner shop issues one into the booking's ledger the first time
 * somebody asks to use a voucher, and the screen shows its code beside a sentence saying that is what happened. It is
 * redeemed with packages/engines/src/money/domain's rules, the same ones POST /v1/money/voucher-redemptions@1 binds: no
 * more than it holds, no more than is owed, never after it expires, never as cash. Every refusal is the route's sentence.
 *
 * Arrives on a dynamic import from the booking's review step, so a patient who never asks about a voucher downloads
 * none of this, and the ledger is the booking's own: the payment that follows is taken for what is still owed.
 */
export const voucherWords = contract.screen;

/* The preview shop's party. Not a person, and never shown. */
const PREVIEW_SHOP = 'party-preview-corner-shop';
const issued = new WeakMap<Money, { code: string; expiresOn: string; service: string }>();

/** The voucher the simulated shop issued into this ledger, issuing it the first time it is asked for. */
export function previewVoucher(ledger: Money): { code: string; expiresOn: string; service: string } | { refused: string } {
 const kept = issued.get(ledger);
 if (kept) return kept;
 const towards = contract.preview.towards;
 const answer = ledger.issueVoucher({ role: contract.preview.issuedBy, subjectRef: PREVIEW_SHOP }, { idempotencyKey: 'preview-voucher', towardsKind: towards.kind, serviceId: towards.serviceId });
 if (isRefusal(answer)) return { refused: answer.statement };
 const shown = { code: answer.voucherCode ?? '', expiresOn: answer.expiresOn, service: services.find(s => s.id === towards.serviceId)?.name ?? towards.serviceId };
 issued.set(ledger, shown);
 return shown;
}

export type Redeemed = { refused: string } | { refused?: undefined; redeemedCents: number; remainingCents: number; owedCents: number; expiresOn: string };

/**
 * Pay towards this visit with a typed code: as much as the voucher holds, up to what is owed. A code that opens nothing is
 * still sent, so it is refused in the route's own sentence rather than one written here.
 */
export function redeemAtCheckout(ledger: Money, input: { reference: string; serviceId: string; code: string; attempt: number }): Redeemed {
 const payable = ledger.openVisitPayable({ payableRef: input.reference, serviceId: input.serviceId, subjectRef: PREVIEW_PAYER });
 const owed = ledger.owed(payable.payableRef) ?? 0;
 const held = ledger.voucherHeld(input.code);
 const amountCents = held ? Math.min(held.remainingCents, owed) : owed;
 const answer = ledger.redeemVoucher({ role: 'patient', subjectRef: PREVIEW_PAYER }, { idempotencyKey: `${input.reference}:voucher:${input.attempt}`, voucherCode: input.code, payableRef: payable.payableRef, amountCents });
 return isRefusal(answer) ? { refused: answer.statement } : { redeemedCents: answer.redeemedCents, remainingCents: answer.remainingCents, owedCents: answer.owedCents, expiresOn: answer.expiresOn };
}
