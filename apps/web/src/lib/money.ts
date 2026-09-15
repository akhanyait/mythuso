import { createMoney, type Money, type Payout } from '../../../../packages/engines/src/money/domain/ledger.ts';
import {
 doctorFees, earningsContract, isRefusal, money as contract, refusal, stateOf, type MethodId, type PaymentStateId
} from '../../../../packages/engines/src/money/domain/contract.ts';
import { linesFromEarningsWeek } from '../../../../packages/engines/src/money/domain/payouts.ts';
import { doctorOwedCents, type FeeInForce } from '../../../../packages/engines/src/money/domain/fees.ts';
/* The web's door onto Thuso Money.
 *
 * ── The engine, not a second copy of it ──────────────────────────────────────────────────────
 *
 * packages/engines/src/money/domain is pure and has no dependencies, so the browser runs the same
 * ledger the engine's tests hold: the idempotency key, the card-number refusal, the amount reconciled
 * against the catalogue, the cash code and the refusal to schedule a doctor's payout while the fee
 * is undecided. What a screen gets from here is that ledger's answer in the shape a screen draws —
 * rand rather than cents, and the contract's words beside every state.
 *
 * ── Nothing is kept ──────────────────────────────────────────────────────────────────────────
 *
 * A ledger lives in memory for as long as the screen that made it. No storage of any kind, which is
 * the rule for everything in apps/web/src, and it is why a booking makes its own ledger: a visit
 * booked, left and booked again is a fresh booking rather than a payable a closed tab already paid.
 *
 * ── What the web does not pretend ────────────────────────────────────────────────────────────
 *
 * The simulated provider stands behind the payment-result door, in process. Every receipt it
 * produces begins SIM-, and the payments capability's notice is rendered beside every payment state
 * this module returns, on the screen that shows it.
 */

/** The patient the preview books as. Money keys a payable on a subject token, never a name. */
export const PREVIEW_PAYER = 'subj-preview-patient';

/* The ways to pay are drawn from their own small module, so the booking screen can show them without
   loading this one. Re-exported here so there is one list. */
export { methodByName, notOffered, visitMethods } from './money-methods';

export type Refused = { refused: string };

export type PaymentView = Refused | {
 refused?: undefined;
 paymentRef: string;
 method: MethodId;
 state: PaymentStateId;
 /** The state's name and the contract's words for it. Cash waiting on its code has its own. */
 stateName: string;
 words: string;
 /** In rand, because that is what every screen here renders. */
 amount: number;
 attempt: number;
 receipt: string | null;
 declineReason: string | null;
 /** Shown to the person paying in cash, and nowhere else. */
 cashCode: string | null;
};

/** A ledger for one booking. See the header for why it is not one per tab. A voucher's expiry is handed in by the
    screen, from apps/web/src/lib/settings.ts, for the reason the doctor's fee is: this module carries no settings code. */
export const bookingLedger = (voucherExpiryYears?: () => number): Money => createMoney({ simulation: true, ...(voucherExpiryYears ? { voucherExpiryYears } : {}) });

/**
 * Pay for one visit. The payable's reference is the visit's own, which is also what the simulated
 * provider is seeded on, so the same visit is answered the same way on every machine. The key is
 * the visit, the method and the attempt: pressing Confirm twice on one attempt is one payment.
 */
export function payForVisit(ledger: Money, reference: string, serviceId: string, method: MethodId, attempt: number): PaymentView {
 const payable = ledger.openVisitPayable({ payableRef: reference, serviceId, subjectRef: PREVIEW_PAYER });
 /* What is still owed, which is the catalogue's price less anything a voucher paid towards it at checkout. */
 const owed = ledger.owed(payable.payableRef) ?? payable.amountCents ?? 0;
 const answer = ledger.pay({ role: 'patient', subjectRef: PREVIEW_PAYER },
  { idempotencyKey: `${reference}:${method}:${attempt}`, payableRef: reference, method, amountCents: owed });
 if (isRefusal(answer)) return { refused: answer.statement };
 const state = stateOf(answer.stateCode);
 const cashWaiting = answer.method === 'cash-otp' && answer.stateCode === 'pending';
 return {
  paymentRef: answer.paymentRef, method: answer.method, state: answer.stateCode, stateName: state.name,
  words: cashWaiting ? contract.cash.pendingWords : state.words,
  amount: answer.amountCents / 100, attempt: answer.attempt,
  receipt: answer.providerReference ?? null, declineReason: answer.declineReason ?? null, cashCode: answer.cashCode ?? null
 };
}

/* ---- A nurse's weeks ------------------------------------------------------------------------- */

type RawWeek = Parameters<typeof linesFromEarningsWeek>[0];

export type PayoutAdvice = Refused | { refused?: undefined; outcome: 'in-transit' | 'paid' | 'failed'; amount: number; failureReason: string | null };

const payoutLedger = createMoney({ simulation: true });

/**
 * Send one of the sample weeks in packages/catalog/earnings.json to the simulated bank. The week is
 * entered into the ledger as the contract draws it — its lines, not a total a screen worked out — and
 * the bank's answer comes back through the payout-advice door, where an amount that is not the
 * ledger's own is refused.
 */
export function runWeek(weekId: string, partyRef: string, periodEnd: string): PayoutAdvice {
 const week = earningsContract.weeks.find(w => w.id === weekId);
 if (!week) throw new Error(`No week "${weekId}" in packages/catalog/earnings.json.`);
 const payout = payoutLedger.importWeek({ weekId: week.id, partyRef, periodEnd, lines: linesFromEarningsWeek(week as RawWeek), state: week.state });
 const answer = payoutLedger.runPayout(payout.payoutRef, partyRef);
 if (isRefusal(answer)) return { refused: answer.statement };
 const settled = answer as Payout;
 if (settled.state === 'closed') return { refused: refusal('door-locked').statement };
 return { outcome: settled.state, amount: settled.totalCents / 100, failureReason: settled.failureReason ?? null };
}

/* ---- A doctor's fees ------------------------------------------------------------------------- */

/** An amount in cents as rand, with the cents shown only when there are some: R48, R47,50. */
export const randCents = (cents: number) =>
 new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);

/** The fee in force as the settings hand it: the amount, whether it is confirmed, and the range an admin may set it within. */
export type FeeWithRange = FeeInForce & { readonly lowestCents: number; readonly highestCents: number };

export type DoctorFeesView = {
 fee: typeof doctorFees[number];
 inForce: FeeWithRange;
 /** Each case with the fee it was signed under, and whether that fee was confirmed. */
 cases: { reviewRef: string; on: string; amountCents: number; confirmed: boolean }[];
 casesWords: string;
 /** What the cases come to, or null while the ledger would refuse to pay them. */
 owedCents: number | null;
 /** What the ledger answers when asked to schedule the payout: its refusal, or what it scheduled. */
 schedule: () => { refused: string } | { refused?: undefined; amountCents: number };
};

/**
 * The doctor's per-case fees, from a ledger that has heard the contract's signed sample cases as
 * review.billable carries them — a reference, the doctor and a fee code, and nothing about anybody.
 *
 * The fee in force is handed in by the screen, from apps/web/src/lib/settings.ts, rather than imported
 * here: this module is also the patient's payment step, and a patient paying for a visit carries no
 * settings code. The preview hears its sample cases when the screen is drawn, so each is signed under
 * the fee in force at that moment; on the engine, a case is heard when it is signed.
 */
export function doctorFeesFor(doctorRef: string, feeNow: () => FeeWithRange, now = new Date()): DoctorFeesView {
 const ledger = createMoney({ simulation: true, clock: () => now, doctorFee: feeNow });
 const fee = doctorFees[0]!;
 for (const sample of contract.sampleCases) {
  const at = new Date(now.getTime() + sample.onDays * 86_400_000);
  ledger.hear({ type: 'review.billable', version: 1, occurredAt: at.toISOString(), payload: { reviewRef: sample.reviewRef, reviewedByRef: doctorRef, feeCode: fee.feeCode } });
 }
 const periodEnd = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
 const inForce = feeNow();
 const signed = ledger.casesFor(doctorRef);
 const owed = doctorOwedCents(signed, inForce);
 return {
  fee, inForce, casesWords: contract.casesWords,
  cases: signed.map(c => ({ reviewRef: c.reviewRef, on: c.on, amountCents: c.fee?.amountCents ?? inForce.amountCents, confirmed: c.fee?.confirmed === true })),
  owedCents: isRefusal(owed) ? null : owed,
  schedule: () => {
   const answer = ledger.scheduleDoctorPayout(doctorRef, periodEnd);
   return isRefusal(answer) ? { refused: answer.statement } : { amountCents: answer.totalCents };
  }
 };
}
