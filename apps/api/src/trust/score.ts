/**
 * Trust Score v1: the hard gates, and nothing invented on top of them.
 *
 * ── What the master document asks for ────────────────────────────────────────────────────────
 *
 * An explainable score from 0 to 100, from two hard gates — credential validity and background
 * status — and eight soft inputs: tenure, completed jobs, rating trend, complaint rate, incident
 * severity, training currency, punctuality and protocol adherence. Any hard gate failing is a score
 * of 0 and offline. Patients see a badge tier and never a number. "No Trust Score, no dispatch."
 *
 * ── What it does not say, and what this refuses to guess ─────────────────────────────────────
 *
 * How much each soft input weighs. That is a governance decision, and nobody has taken it. So every
 * weight in packages/catalog/trust.json is null beside the name of the person who sets it, and this
 * function computes from the hard gates alone:
 *
 *   · a hard gate failing — a lapsed or declined check at identity, credentials or background — is
 *     a score of 0 and offline, with the contract's sentence for which gate;
 *   · a party suspended or declined by a reviewer is 0 and offline too;
 *   · a party who has not reached gate 7 has **no score at all**. The first score is computed at
 *     activation, and returning 0 for somebody halfway through their paperwork would say something
 *     had failed when nothing has;
 *   · an activated party with every hard gate passing is **Verified**, with a value of null — not
 *     100, not 50, not any number — because every number above 0 is made of weights nobody chose.
 *     Trusted and Senior are returned as unavailable, each with its sentence.
 *
 * And the day the weights are decided, this does not quietly start producing numbers. It throws the
 * contract's `weighted-not-built` sentence until the weighted computation has been written and
 * reviewed, because a formula nobody reviewed is the same guess as a weight nobody chose.
 *
 * ── Who may see what ─────────────────────────────────────────────────────────────────────────
 *
 * `TrustScore` is the vetting team's view: the reasons name credentials and background, which are
 * vetting data. `forPatient` is the only projection a patient-facing payload may carry, and it holds
 * the fields the contract's `patientView` lists — the badge — and nothing it was worked out from.
 *
 * Pure: the clock is passed in, and nothing is stored.
 */
import type { GateProgress } from '../vetting/gates.ts';
import { TRUST, dayOf, reason, refusal, weightsDecided, type TierId, type TrustContract } from './contract.ts';

export type TrustScore = {
 partyId: string;
 /** The day, in the scheduling timezone, this score is current for. */
 computedOn: string;
 /** 0 where a hard gate fails or a reviewer has stood the party down; null while the weights are undecided. Never guessed. */
 value: 0 | null;
 online: boolean;
 tier: TierId | null;
 basis: 'hard-gates-only';
 hardGates: { id: string; name: string; passing: boolean }[];
 /** Sentences from the contract, in the order they apply. For the vetting team, never for a patient. */
 reasons: string[];
 unavailableTiers: { tier: TierId; name: string; sentence: string }[];
};

/* A hard gate fails where a check at one of its gates has been declined or has lapsed. Still in
   review is not failing — it is not yet activated, which is a different answer with a different
   sentence. */
const FAILING = new Set(['failed', 'held']);

export function trustScore(partyId: string, progress: GateProgress, at: number, contract: TrustContract = TRUST): TrustScore | null {
 const hardGates = contract.hardGates.map(gate => ({
  id: gate.id, name: gate.name,
  passing: !progress.gates.some(standing => gate.gates.includes(standing.id) && FAILING.has(standing.state)),
  failing: gate.failing
 }));
 const base = {
  partyId, computedOn: dayOf(at), basis: 'hard-gates-only' as const,
  hardGates: hardGates.map(({ id, name, passing }) => ({ id, name, passing })), unavailableTiers: []
 };
 const failing = hardGates.filter(gate => !gate.passing);
 if (failing.length) return { ...base, value: 0, online: false, tier: null, reasons: failing.map(gate => gate.failing) };
 if (progress.outcome === 'suspended') return { ...base, value: 0, online: false, tier: null, reasons: [reason('suspended', contract)] };
 if (progress.outcome === 'declined') return { ...base, value: 0, online: false, tier: null, reasons: [reason('declined', contract)] };
 if (!progress.activated) return null;
 if (weightsDecided(contract)) throw new Error(refusal('weighted-not-built', contract));
 return {
  ...base,
  value: null,
  online: true,
  tier: 'verified',
  reasons: [reason('hardGatesPass', contract), reason('weightsUndecided', contract)],
  unavailableTiers: contract.tiers
   .filter(tier => tier.needs === 'weights')
   .map(tier => ({ tier: tier.id, name: tier.name, sentence: tier.unavailable ?? refusal('weighted-not-built', contract) }))
 };
}

/** Why a person has no score, for the one case `trustScore` answers with null. */
export const noScoreReason = (contract: TrustContract = TRUST): string => reason('notActivated', contract);

/**
 * What a patient-facing payload may carry about the person coming to the door: the badge, by name,
 * or null. Built from the contract's own list of fields, so a field added to the view is a field
 * somebody added to the contract and a boundary check read.
 */
export function forPatient(score: TrustScore | null, contract: TrustContract = TRUST): { tier: string | null } {
 const tier = score && score.online && score.tier ? contract.tiers.find(candidate => candidate.id === score.tier)?.name ?? null : null;
 const view: Record<string, string | null> = {};
 for (const field of contract.patientView.fields) if (field === 'tier') view.tier = tier;
 return view as { tier: string | null };
}
