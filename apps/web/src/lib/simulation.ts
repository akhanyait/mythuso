import { isRefusal } from '../../../api/src/simulation/index.ts';
import {
 bankPayouts, cardAndEft, codeFor, signInCodes, verify, verifyAccount,
 type DeliveryStatus, type PaymentOutcome, type PayoutOutcome
} from '../../../api/src/simulation/suppliers.ts';
/* The web's door onto the simulated suppliers.
 *
 * ── Why this imports the service's code rather than restating it ─────────────────────────────
 *
 * The simulators live in `apps/api/src/simulation` because that is where the registry, the seed and
 * the wall are, and because they are the shape a real adapter will one day replace. They are not
 * reachable over HTTP and they never will be — `scripts/check-boundaries.mjs` fails the build if
 * anything a request can reach imports them. This is not that. It is the browser importing a pure
 * module out of the same repository, the way every screen here already imports `packages/geo`, and
 * it is the only arrangement in which the code somebody is shown and the code the tests hold are
 * the same code. The alternative was a second implementation of a payment result in TypeScript,
 * agreeing with the first until the afternoon it did not.
 *
 * What it costs is that the feed contract travels into the bundle behind them. That is a real cost
 * and it is paid deliberately: a simulator that produces a shape its own seam would refuse is worth
 * less than nothing, so it reads the seam.
 *
 * ── What a screen gets from here ─────────────────────────────────────────────────────────────
 *
 * The events the simulators produce are supplier payloads: a delivery receipt, a payment result, a
 * payout advice. A screen needs slightly less than that and one thing more — whether the answer was
 * a refusal, and in which words. So each function below returns one of two shapes, and every screen
 * that calls one has somewhere for the refusal to go. That is the whole discipline: a caller who
 * cannot render the refusal has no business asking.
 *
 * Nothing here decides what a screen says about being simulated. That sentence comes from
 * `noticeFor()` in lib/capabilities.ts, out of the contract, on every platform at once.
 */

/** A refusal, in the capability's own words. Never assembled here. */
export type Refused = { refused: string };
export const wasRefused = (answer: { refused?: string }): answer is Refused => typeof answer.refused === 'string';

/* ---- Signing in ------------------------------------------------------------------------------
 *
 * The mobile number a person types never reaches the simulator. It is theirs, it stays in the tab,
 * and what goes across is the ordinal of the attempt — because the office refuses to be told where
 * to send anything, and a preview that handed it a number would be a preview whose refusals were
 * decoration. The consequence is worth stating plainly on the screen: nothing can leave, because
 * nothing here knows anywhere to leave for. */

export type CodeAsk = Refused | {
 refused?: undefined;
 /** The challenge this code belongs to. The simulator's own reference; not ours to invent. */
 challenge: string;
 status: DeliveryStatus;
 /** Shown only when the message arrived. A person whose code did not arrive does not have one. */
 code: string | null;
 failureReason: string | null;
};

export function askForCode(attempt: number, at?: Date): CodeAsk {
 const answer = signInCodes.produce({ subject: `attempt-${attempt}`, at });
 if (isRefusal(answer)) return { refused: answer.refused };
 return {
  challenge: answer.reference,
  status: answer.payload['status'] as DeliveryStatus,
  code: codeFor(answer.reference),
  failureReason: (answer.payload['failureReason'] as string | undefined) ?? null
 };
}

export function checkCode(challenge: string, code: string): Refused | { refused?: undefined; verified: true } {
 const answer = verify(challenge, code);
 return 'refused' in answer ? { refused: answer.refused } : { verified: true };
}

/* ---- Paying for a visit ---------------------------------------------------------------------- */

export type PaymentResult = Refused | {
 refused?: undefined;
 outcome: PaymentOutcome;
 /** In rand, because that is what every screen in this app renders. Cents are the seam's unit. */
 amount: number;
 /** The provider's own handle for the transaction. Every one of them begins SIM-. */
 receipt: string;
 declineReason: string | null;
};

/**
 * A reference for one visit, worked out from the visit rather than issued by a counter.
 *
 * It has to be stable: the seed is what makes the same visit produce the same result on every
 * machine, so a reference that changed on every render would make the answer change with it.
 */
export const visitReference = (visit: { service: { id: string }; person: string; date?: string; start?: string }): string =>
 `MT-${visit.service.id}-${visit.date ?? 'asap'}-${(visit.start ?? '').replace(':', '')}-${visit.person.split(' ')[0]}`.toUpperCase();

export function payForVisit(reference: string, serviceId: string, attempt = 1, at?: Date): PaymentResult {
 const answer = cardAndEft.produce({ subject: reference, at, detail: { service: serviceId, attempt } });
 if (isRefusal(answer)) return { refused: answer.refused };
 return {
  outcome: answer.payload['outcome'] as PaymentOutcome,
  amount: (answer.payload['amountCents'] as number) / 100,
  receipt: answer.payload['providerReference'] as string,
  declineReason: (answer.payload['declineReason'] as string | undefined) ?? null
 };
}

/* ---- Paying a nurse -------------------------------------------------------------------------- */

export type PayoutAdvice = Refused | {
 refused?: undefined;
 outcome: PayoutOutcome;
 amount: number;
 failureReason: string | null;
};

export function runPayout(weekId: string, partyId: string, amount: number, was: string, at?: Date): PayoutAdvice {
 const answer = bankPayouts.produce({ subject: weekId, at, detail: { partyId, amountCents: Math.round(amount * 100), was } });
 if (isRefusal(answer)) return { refused: answer.refused };
 return {
  outcome: answer.payload['outcome'] as PayoutOutcome,
  amount: (answer.payload['amountCents'] as number) / 100,
  failureReason: (answer.payload['failureReason'] as string | undefined) ?? null
 };
}

/** Asking the channel to confirm an account. It cannot, and this is the sentence it answers with. */
export function askToVerifyAccount(partyId: string): string {
 const answer = verifyAccount({ subject: partyId });
 /* `verifyAccount` has no branch that succeeds, so a non-refusal here is a contradiction rather
    than a case to handle — and one worth being loud about, because it would mean something in the
    payout channel had grown a way to say yes. */
 if (!isRefusal(answer)) throw new Error('The simulated payout channel answered a request to verify a bank account with something other than a refusal.');
 return answer.refused;
}
