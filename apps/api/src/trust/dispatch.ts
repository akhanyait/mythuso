/**
 * "No Trust Score, no dispatch", as the ranking itself.
 *
 * The master document is specific about the order: eligible responders ranked by proximity first,
 * then by Trust Score. And it is specific about who is eligible: nobody without a current score, and
 * nobody whose score is 0. The tempting place for that rule is a check a controller runs before
 * pressing assign — which is exactly the arrangement the master document rejects, "rejected by Core,
 * not by a human remembering to check". So the rule is the ranker: a candidate without a current,
 * online score never enters the ranked list, and comes back beside it with the contract's sentence.
 *
 * What a ranked entry carries is the badge and the distance. Not the score's value and not its
 * reasons: a dispatch desk is told who to send, and the reasons name credentials and background,
 * which are vetting data and do not leave Verify.
 *
 * Pure: the clock is passed in.
 */
import { TRUST, dayOf, refusal, type RefusalId, type TierId, type TrustContract } from './contract.ts';
import type { TrustScore } from './score.ts';

export type Candidate = { partyId: string; km: number | null; score: TrustScore | null };
export type Ranked = { partyId: string; km: number | null; tier: string };
export type Withheld = { partyId: string; refusalId: RefusalId; refused: string };
export type Eligibility = { eligible: true; score: TrustScore } | { eligible: false; refusalId: RefusalId; refused: string };

/**
 * Whether a score lets a person be dispatched at `at`, and the sentence where it does not.
 *
 * Three answers, because they are three situations: nobody has scored this person; somebody did,
 * on another day; or the score is 0 because a hard gate is failing. A controller does something
 * different about each.
 */
export function eligibility(score: TrustScore | null, at: number, contract: TrustContract = TRUST): Eligibility {
 if (!score) return { eligible: false, refusalId: 'no-score', refused: refusal('no-score', contract) };
 if (score.computedOn !== dayOf(at)) return { eligible: false, refusalId: 'stale-score', refused: refusal('stale-score', contract) };
 if (!score.online || score.value === 0) return { eligible: false, refusalId: 'offline', refused: refusal('offline', contract) };
 return { eligible: true, score };
}

/** Proximity first, then tier, then the register's id so the same inputs give the same order on every machine. */
export function rankForDispatch(candidates: readonly Candidate[], at: number, contract: TrustContract = TRUST): { ranked: Ranked[]; withheld: Withheld[] } {
 const tierOrder = (id: TierId | null) => contract.tiers.find(tier => tier.id === id)?.order ?? 0;
 const tierName = (id: TierId | null) => contract.tiers.find(tier => tier.id === id)?.name ?? '';
 const withheld: Withheld[] = [];
 const eligible: { candidate: Candidate; score: TrustScore }[] = [];
 for (const candidate of candidates) {
  const answer = eligibility(candidate.score, at, contract);
  if (answer.eligible) eligible.push({ candidate, score: answer.score });
  else withheld.push({ partyId: candidate.partyId, refusalId: answer.refusalId, refused: answer.refused });
 }
 const ranked = eligible
  .sort((a, b) =>
   (a.candidate.km ?? Infinity) - (b.candidate.km ?? Infinity)
   || tierOrder(b.score.tier) - tierOrder(a.score.tier)
   || a.candidate.partyId.localeCompare(b.candidate.partyId))
  .map(({ candidate, score }) => ({ partyId: candidate.partyId, km: candidate.km, tier: tierName(score.tier) }));
 return { ranked, withheld };
}
