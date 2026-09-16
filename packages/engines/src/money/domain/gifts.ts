/**
 * Gifts: a caregiver or a sponsor names one visit, for one named person, and pays nothing towards anybody else's.
 *
 * ── Why a gift is not a voucher with a name on it ────────────────────────────────────────────
 *
 * A voucher is a bearer code: whoever holds it spends it. A gift is made out to one person, by the account she
 * already holds, from the moment it is given — there is no code, because there is nothing to bear. So this is its
 * own thin module rather than a widened Voucher, and it reuses only what genuinely carries over from
 * ./vouchers.ts by import: the catalogue price a visit is issued at (through the same lookup, so a gift and a
 * voucher towards the same visit are issued at the same amount by the same code) and how many years an unused
 * one lasts, both packages/catalog/vouchers.json's own numbers. Nothing here restates either.
 *
 * ── The refusal that is the point of it ──────────────────────────────────────────────────────
 *
 * Paying is not deciding when somebody is visited, and it is not deciding who is. A request that carries an
 * appointment, a booking, or the beneficiary's agreement in the same breath as the gift is refused as
 * gift-books-for-them before anything is keyed — the giver names who and what; only she books it, and only in
 * her own account. The same words, from the same list, refuse anybody but the beneficiary from booking it.
 *
 * ── Why booking has no route of its own ──────────────────────────────────────────────────────
 *
 * Money's contract declares one route for a gift: issuing it. Booking a visit is Care's act, not Money's, and in
 * the full build the gift is spent the moment appointment.booked@2 names the beneficiary and the gifted service —
 * the same moment a plan's included visit is priced at nought. This preview has no Care engine standing behind a
 * booking, so bookGiftedVisit stands in for that step exactly as lib/money.ts's payForVisit already stands in for
 * a visit nobody has actually booked: it opens the payable Care would have opened, and credits it from the gift.
 * It carries no route because nothing calls it over one; the engine tests and the web preview call it directly, the
 * way they already call openVisitPayable, owed and voucherHeld.
 */
import contract from '../../../../catalog/gifts.json' with { type: 'json' };
import { expiryOn, issuedCentsFor, MINIMUM_YEARS } from './vouchers.ts';

export const giftsContract = contract;
export { MINIMUM_YEARS };

export type GiftStateId = 'given' | 'booked';
export type Gift = {
 giftRef: string;
 beneficiarySubjectRef: string; serviceId: string;
 issuedCents: number;
 issuedOn: string; expiresOn: string; expiryYears: number;
 givenByRole: string; givenByRef: string;
 stateCode: GiftStateId;
 /** Set only once she books it. */
 payableRef: string | null;
};

/** What a gift towards this service is issued at, in cents, or null when the catalogue does not sell it as a
    visit today. The same lookup a voucher towards a visit uses, so the two numbers can never disagree. */
export const giftCentsFor = (serviceId: unknown): number | null => issuedCentsFor('service', serviceId, undefined);
export const giftExpiryOn = (issuedOn: string, years: number): string => expiryOn(issuedOn, years);

/* ---- Words in what a request sends ------------------------------------------------------------------
   The same scanning ./vouchers.ts and ./groups.ts use: a field name is read as words, so appointmentRef
   is an appointment and description is not a booking. */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const names = (sent: readonly string[], list: readonly string[]) => sent.some(name => wordsOf(name).some(word => list.includes(word)));

/** Whether a request carries an appointment, a booking, or an agreement made for the beneficiary. */
export const booksForThem = (sent: readonly string[]) => names(sent, contract.bookingFieldWords);

export const stateOf = (id: GiftStateId) => contract.states.find(s => s.id === id)!;
