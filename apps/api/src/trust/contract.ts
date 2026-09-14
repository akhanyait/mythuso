/**
 * The Trust Score contract, typed, and the one way a sentence leaves it.
 *
 * packages/catalog/trust.json holds the inputs, the tiers, the reasons and the refusals. Nothing in
 * apps/api/src/trust types a sentence of its own: every one is looked up here by id, and a lookup
 * that finds nothing throws, so rewording a refusal in the contract fails the tests that assert it
 * rather than leaving the service refusing in words no screen renders.
 *
 * Pure: no clock of its own, no store, no HTTP.
 */
import trust from '../../../../packages/catalog/trust.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };

export type TierId = 'verified' | 'trusted' | 'senior';
export type RefusalId = 'no-score' | 'stale-score' | 'offline' | 'weighted-not-built';
export type ReasonId = 'hardGatesPass' | 'weightsUndecided' | 'notActivated' | 'suspended' | 'declined';

export type SoftInput = {
 id: string;
 name: string;
 measures: string;
 /** Null until a governance decision records it. A number here without a decision fails the build. */
 weight: number | null;
 setBy: string;
 decision: null | { decidedBy: string; decidedOn: string; minute: string };
};
export type HardGate = { id: string; name: string; gates: readonly string[]; failing: string };
export type Tier = { id: TierId; name: string; order: number; needs: 'hard-gates' | 'weights'; unavailable: string | null };
export type TrustContract = {
 hardGates: readonly HardGate[];
 softInputs: readonly SoftInput[];
 tiers: readonly Tier[];
 reasons: Record<ReasonId, string>;
 refusals: readonly { id: RefusalId; sentence: string; why: string }[];
 patientView: { fields: readonly string[]; never: readonly string[] };
};

export const TRUST = trust as unknown as TrustContract;

/** One of the contract's refusal sentences, by id. Throws rather than returning a sentence typed here. */
export function refusal(id: RefusalId, contract: TrustContract = TRUST): string {
 const found = contract.refusals.find(candidate => candidate.id === id);
 if (!found) throw new Error(`packages/catalog/trust.json has no refusal "${id}". A refusal the service enforces and the contract does not hold is a sentence no screen can render.`);
 return found.sentence;
}

export const reason = (id: ReasonId, contract: TrustContract = TRUST): string => contract.reasons[id];

/**
 * Whether every weight has been decided. While any one has not, the score is the hard gates alone —
 * a half-decided set of weights is not a formula, it is two guesses and a decision.
 */
export const weightsDecided = (contract: TrustContract = TRUST): boolean =>
 contract.softInputs.every(input => input.weight !== null && input.decision !== null);

/* The day a score belongs to is the scheduling contract's day, for the same reason the roster's shift
   is: a server on UTC would otherwise carry yesterday's score two hours into a South African morning. */
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: scheduling.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayOf = (at: number): string => DAY.format(new Date(at));
