/**
 * A doctor's per-case fee, and the refusal to pay one nobody has confirmed.
 *
 * The documents give a range for reviewing a case and no price. Since 15 September 2026 the fee is
 * Money's setting doctor-case-fee, whose default is a proposal inside that range, and whether it may be
 * paid is the setting doctor-fee-confirmed. A proposal is shown to a doctor and pays nobody: a number
 * left in force because nobody changed it must not become somebody's income, so a payout is scheduled
 * only at a fee an admin has confirmed.
 *
 * A CASE KEEPS THE FEE IN FORCE ON THE DAY IT WAS SIGNED. The ledger is handed the fee in force when it
 * hears review.billable and writes it onto the case, and never reads it again for that case. So a fee
 * changed or unconfirmed after a case was signed under a confirmed one does not reach back into it:
 * work done is paid at what was in force when it was done, as a suspension never touches money already
 * earned. A case signed before any fee was confirmed has no confirmed fee of its own, and is paid at the
 * fee confirmed when its payout is scheduled — or not at all, and refused, while none is.
 *
 * This file knows no amount. It is handed the fee by whoever holds Money's settings history — the
 * engine's store or the web preview's memory — through ./settings.ts, so a test proves the confirmed
 * path by handing in a confirmed fee rather than by editing a contract.
 */
import { feeByCode, refusal, type Refusal } from './contract.ts';

/** The fee in force at a moment: the amount, whether an admin had confirmed it, and the settings version that says so. */
export type FeeInForce = { readonly feeCode: string; readonly amountCents: number; readonly confirmed: boolean; readonly settingsVersion: number };

/** A signed case, and the fee in force on the day it was signed — null when the ledger was handed none. */
export type DoctorCase = { reviewRef: string; feeCode: string; on: string; fee?: FeeInForce | null };

/**
 * What a doctor is owed for a set of signed cases, or the refusal.
 *
 * Refused before anything is counted when a case would be paid at a fee nobody confirmed: one signed
 * under an unconfirmed fee, while the fee now is unconfirmed too. And refused with no cases at all while
 * the fee now is unconfirmed — a doctor with nothing signed this week used to be owed R0, and a zero
 * payout is still a payout, scheduled and published, about a fee nobody answers for.
 */
export function doctorOwedCents(cases: readonly DoctorCase[], now: FeeInForce | null): number | Refusal {
 const confirmedNow = now?.confirmed === true;
 if (!confirmedNow && (cases.length === 0 || cases.some(signed => signed.fee?.confirmed !== true))) return refusal('doctor-fee-undecided');
 let total = 0;
 for (const signed of cases) {
  const fee = signed.fee?.confirmed === true ? signed.fee : now!;
  if (!feeByCode(signed.feeCode) || fee.feeCode !== signed.feeCode) return refusal('hears-only-its-list');
  total += fee.amountCents;
 }
 return total;
}
