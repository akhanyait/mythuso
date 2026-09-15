/**
 * A doctor's per-case fee, and the refusal to pay one nobody has decided.
 *
 * The documents give a range for reviewing a case and no price. The easy thing — the thing a demo
 * wants — is the middle of the range, and it would be a figure on a doctor's screen that the founder
 * never agreed to and a panel lead never saw. So packages/catalog/money.json holds the fee as null
 * with nobody's name beside it, and until both are filled in the engine records every signed case
 * and schedules no payout for any of them. What the doctor reads is the contract's sentence saying
 * so, rather than a zero or a dash.
 */
import { doctorFees, rangeOf, refusal, type DoctorFee, type Refusal } from './contract.ts';

export type DoctorCase = { reviewRef: string; feeCode: string; on: string };

/** Whether a fee has been decided: an amount, a person and a day, and inside the cited range. */
export function isDecided(fee: DoctorFee): fee is DoctorFee & { amount: number; decidedBy: string; decidedOn: string } {
 if (fee.amount === null) return false;
 const [low, high] = rangeOf(fee);
 return Boolean(fee.decidedBy && fee.decidedOn) && fee.amount >= low && fee.amount <= high;
}

/**
 * What a doctor is owed for a set of signed cases, or the refusal. `fees` is the contract unless a
 * caller hands in another — which only a test does, to prove the decided path is arithmetic on the
 * decided amount rather than on anything this file knows.
 */
export function doctorOwedCents(cases: readonly DoctorCase[], fees: readonly DoctorFee[] = doctorFees): number | Refusal {
 /* Refused before the cases are counted. A doctor with no signed case this week, under a fee nobody has
    decided, used to be owed R0 — and a zero payout is still a payout, scheduled and published, about a
    fee that does not exist. */
 if (fees.some(fee => !isDecided(fee))) return refusal('doctor-fee-undecided');
 let total = 0;
 for (const signed of cases) {
  const fee = fees.find(f => f.feeCode === signed.feeCode);
  if (!fee) return refusal('hears-only-its-list');
  if (!isDecided(fee)) return refusal('doctor-fee-undecided');
  total += fee.amount * 100;
 }
 return total;
}
