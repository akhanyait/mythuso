/**
 * The simulated provider and the simulated bank, standing behind the two locked doors.
 *
 * ── The same answers as apps/api, by contract ────────────────────────────────────────────────
 *
 * apps/api/src/simulation/payments.ts and payouts.ts are the simulators the preview already walks.
 * The engine does not import them — an engine that imports the identity service is deployed with it —
 * so it reproduces them from what they are built on: the mulberry32 seed, the seed strings, the one in
 * five that declines or is returned, and the decline sentences, which are packages/catalog/money.json's.
 * scripts/check-boundaries.mjs runs both over the same references and fails the build the day one of
 * them answers differently, so a patient walking the web preview and a test holding the engine are
 * told the same thing.
 *
 * ── What neither will do ─────────────────────────────────────────────────────────────────────
 *
 * Hold a card number, settle, or pay anybody. The provider is never told what was paid with, and it
 * produces a door payload rather than a state: the engine still has to accept it through the door,
 * where the amount is reconciled rather than believed.
 */
import { currency, money } from './contract.ts';

/** mulberry32, seeded from a string — the same function as apps/api/src/simulation/index.ts. */
export function seeded(seed: string): () => number {
 let state = 0;
 for (let i = 0; i < seed.length; i += 1) state = (Math.imul(state ^ seed.charCodeAt(i), 2654435761) >>> 0);
 return () => {
  state = (state + 0x6D2B79F5) >>> 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}

const pick = <T,>(rand: () => number, options: readonly T[]): T => options[Math.floor(rand() * options.length)]!;

export type PaymentResultPayload = {
 reference: string; outcome: 'authorised' | 'declined' | 'reversed'; amountCents: number; currency: string; at: string;
 declineReason?: string; providerReference: string;
};

/**
 * One attempt to take money for one payable. `subject` is what the simulator is seeded on — the
 * payable's reference — and `reference` is the payment the door result will name.
 */
export function attempt(subject: string, attemptNumber: number, reference: string, amountCents: number, at: Date): PaymentResultPayload {
 const rand = seeded(`payment:${subject}:${attemptNumber}`);
 /* Four in five authorise. A decline is not an edge case in South Africa, and a flow that has only
    seen the happy path has no screen for the other one. */
 const declined = rand() >= 0.8;
 return {
  reference, outcome: declined ? 'declined' : 'authorised', amountCents, currency, at: at.toISOString(),
  ...(declined ? { declineReason: pick(rand, money.declines) } : {}),
  providerReference: `SIM-PAY-${Math.floor(rand() * 900000 + 100000)}`
 };
}

/** Money going back, naming the payment it reverses. A separate call, never a random outcome. */
export function reversal(subject: string, reference: string, amountCents: number, at: Date): PaymentResultPayload {
 const rand = seeded(`reversal:${subject}`);
 return { reference, outcome: 'reversed', amountCents, currency, at: at.toISOString(), providerReference: `SIM-PAY-${Math.floor(rand() * 900000 + 100000)}` };
}

export type PayoutAdvicePayload = { weekId: string; partyId: string; outcome: 'in-transit' | 'paid' | 'failed'; amountCents: number; at: string; failureReason?: string };

/**
 * What one week's run did for one party. A run that already came back failed goes out again rather
 * than clearing — the door's own a-failure-never-clears-the-week condition.
 */
export function advise(weekId: string, partyId: string, amountCents: number, was: string | undefined, failureReason: string, at: Date): PayoutAdvicePayload {
 const rand = seeded(`payout:${weekId}:${partyId}`);
 const outcome = was === 'failed' ? 'in-transit' : rand() < 0.8 ? 'paid' : 'failed';
 return { weekId, partyId, outcome, amountCents, at: at.toISOString(), ...(outcome === 'failed' ? { failureReason } : {}) };
}
