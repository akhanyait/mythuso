/**
 * ThusoIQ Verify's Trust Score: one door.
 *
 * The score is computed from where a party stands among the seven gates (apps/api/src/vetting/gates.ts)
 * and from packages/catalog/trust.json, and it is consumed by the one thing the master document says
 * must consume it — the ranking a dispatch decision is taken from. Nothing here is stored and nothing
 * is reachable over HTTP: a score is worked out when it is needed, from checks resolved that day.
 */
export { TRUST, dayOf, reason, refusal, weightsDecided } from './contract.ts';
export type { HardGate, ReasonId, RefusalId, SoftInput, Tier, TierId, TrustContract } from './contract.ts';
export { forPatient, noScoreReason, trustScore } from './score.ts';
export type { TrustScore } from './score.ts';
export { eligibility, rankForDispatch } from './dispatch.ts';
export type { Candidate, Eligibility, Ranked, Withheld } from './dispatch.ts';
