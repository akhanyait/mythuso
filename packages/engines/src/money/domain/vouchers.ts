/**
 * Vouchers: a prepaid amount towards a visit or a plan, and the four things one is never allowed to become.
 *
 * ── What this file decides, and what the ledger does with it ─────────────────────────────────
 *
 * The words, the lists and the law are packages/catalog/vouchers.json's; this file reads them into the
 * arithmetic the ledger asks — what a voucher is issued at, when it expires, whether a request is tied to a
 * medicine or asks for cash — and holds no voucher. The ledger in ./ledger.ts stores them, because a voucher
 * pays towards a payable and the payable is the ledger's.
 *
 * ── The four refusals that are the point of it ───────────────────────────────────────────────
 *
 * A voucher is never cash. It is issued towards a visit or a plan and redeemed against a payable, and a request
 * that asks for a cash, wallet, bank or airtime outcome — by what it is towards or by a field it sends — is
 * refused rather than ignored, because a field that is ignored is a field somebody believes worked.
 *
 * A voucher never pays more than it holds, or more than is owed: change from a voucher is cash.
 *
 * A voucher never outlives its expiry, and its expiry is never sooner than section 63 of the Consumer
 * Protection Act allows. The setting's lowest bound is read from the same entry this file reads, and the
 * ledger refuses to issue at fewer years whatever the setting says, so a bound set wrongly cannot shorten one.
 *
 * A voucher is never tied to a medicine (Medicines and Related Substances Act, section 18A), by what it is
 * towards or by any field a request names.
 *
 * ── Why the code is random and kept as a digest ──────────────────────────────────────────────
 *
 * A voucher's code is a bearer credential. It comes from the platform's cryptographic source, from an
 * alphabet with no pair a till operator can misread, and Money keeps a salt and a SHA-256 digest of it — the
 * same construction as the cash code in ./secrets.ts, which runs unchanged in the engine and the browser.
 */
import contract from '../../../../catalog/vouchers.json' with { type: 'json' };
import momPlans from '../../../../catalog/mom-plans.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import { sha256Hex } from './secrets.ts';

export const vouchersContract = contract;
export type VoucherTowards = 'service' | 'plan';

export type Voucher = {
 voucherRef: string; salt: string; digest: string;
 towardsKind: VoucherTowards; serviceId?: string; planCode?: string;
 issuedCents: number; remainingCents: number;
 /** Johannesburg dates, as the expiry is read and shown. */
 issuedOn: string; expiresOn: string;
 /** The setting in force when it was issued, kept with it. */
 expiryYears: number;
 issuedByRole: string; issuedByRef: string;
};
export type Redemption = { redemptionRef: string; voucherRef: string; payableRef: string; amountCents: number; at: string; restored: boolean };
export type VoucherReceipt = { voucherRef: string; issuedCents: number; expiresOn: string; replayed: boolean; voucherCode?: string; codeAlreadyShown?: boolean };
export type RedemptionReceipt = { redemptionRef: string; redeemedCents: number; remainingCents: number; owedCents: number; expiresOn: string; replayed: boolean };

/** The fewest years a voucher lasts, from the law entry the setting's lowest bound is held to. */
export const MINIMUM_YEARS: number = contract.expiry.law.minimumYears;

/* ---- Words in what a request sends ------------------------------------------------------------------
   A field name or a towards kind is read as words, the way the event contract reads a field, so
   prescriptionRef is a prescription and description is not a script. */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const names = (sent: readonly string[], list: readonly string[]) => sent.some(name => wordsOf(name).some(word => list.some(term => word.startsWith(term))));

/** Whether anything a request names is tied to a medicine: what it is towards, or a field it sends. */
export const tiedToAMedicine = (sent: readonly string[]) => names(sent, contract.neverTowards);
/** Whether a request asks for a voucher to become cash, a balance or a transfer. */
export const asksForCash = (fieldNames: readonly string[], towardsKind = '') =>
 contract.cashOut.towardsKinds.includes(towardsKind) || names(fieldNames, contract.cashOut.fieldWords);

/** What a payable of which kind a voucher towards this redeems against: visit or plan. */
export const redeemsAgainst = (kind: VoucherTowards): string => contract.towards.find(t => t.kind === kind)!.redeemsAgainst;

/**
 * What a voucher is issued at, in cents, or null when it is towards nothing the catalogue sells today. A visit is
 * one a nurse can be sent for now — phase one, as the booking rules refuse anything later — and a plan is a
 * MyThuso for Mom tier with a price. Nothing a caller sends is an amount.
 */
export function issuedCentsFor(towardsKind: string, serviceId: unknown, planCode: unknown): number | null {
 if (towardsKind === 'service') {
  const service = services.find(s => s.id === serviceId);
  return service && service.phase === 1 ? service.price * 100 : null;
 }
 if (towardsKind === 'plan') {
  const tier = momPlans.tiers.find(t => t.id === planCode);
  return tier ? tier.price * 100 : null;
 }
 return null;
}

/* ---- The code ------------------------------------------------------------------------------------- */

type RandomSource = { getRandomValues<T extends Uint32Array>(array: T): T };
const ALPHABET = contract.codes.alphabet;
const LENGTH = contract.codes.length.value;

/** A code from the platform's cryptographic source, each character uniform, by rejection sampling. */
export function newVoucherCode(): string {
 const source = (globalThis as { crypto?: RandomSource }).crypto;
 if (!source?.getRandomValues) throw new Error('No cryptographic random source is available, so no voucher can be issued. A code from Math.random is a code somebody can predict.');
 const buffer = new Uint32Array(1);
 const limit = Math.floor(0x100000000 / ALPHABET.length) * ALPHABET.length;
 let code = '';
 while (code.length < LENGTH) {
  source.getRandomValues(buffer);
  if (buffer[0]! < limit) code += ALPHABET[buffer[0]! % ALPHABET.length];
 }
 return code;
}

/** A typed code as it is compared: upper case, with spaces and dashes a till receipt adds dropped. */
export const normalisedCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** A code in groups of four, as it is read aloud and printed. */
export const groupedCode = (code: string) => (normalisedCode(code).match(/.{1,4}/g) ?? []).join('-');
export const codeDigest = (salt: string, code: string) => sha256Hex(`${salt}:${normalisedCode(code)}`);

/* ---- Dates ---------------------------------------------------------------------------------------- */

/**
 * The last day a voucher issued on `issuedOn` may be redeemed, `years` later. A voucher issued on 29 February
 * lasts to 28 February, never to a day that does not exist. Refused below the law's minimum, whatever is handed
 * in: the setting's bounds are proposals and could be set wrongly, and the three years are not.
 */
export function expiryOn(issuedOn: string, years: number): string {
 if (!Number.isInteger(years) || years < MINIMUM_YEARS) throw new Error(`A voucher cannot be issued to last ${years} years: packages/catalog/vouchers.json's ${contract.expiry.law.act} section ${contract.expiry.law.section} gives at least ${MINIMUM_YEARS}.`);
 const [y, m, d] = issuedOn.split('-').map(Number) as [number, number, number];
 const lastDayOfMonth = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
 return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth)).padStart(2, '0')}`;
}
