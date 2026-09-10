/**
 * Every simulated supplier that exists, in one import.
 *
 * Registration happens when a simulator's module is loaded, so anything asking `coverage()` which
 * seams have a stand-in behind them has to have loaded all of them first — otherwise the answer is
 * a fact about what the caller happened to import rather than about the product. This is that
 * import, and it is the only thing in this directory that exists for tidiness rather than for a
 * refusal.
 *
 * It is not an entrance. `scripts/check-boundaries.mjs` fails the build if anything a request can
 * reach imports from this directory at all, this file included.
 */
export {
 CODE_LENGTH, CODE_LIFE_SECONDS, carriedMessage, codeFor, forgetEverything, messageChannel, send,
 signInCodes, verify, type DeliveryStatus, type MessageKind, type Verified
} from './messages.ts';
export { CURRENCY, cardAndEft, priceInCents, reverse as reversePayment, type PaymentOutcome } from './payments.ts';
export { bankPayouts, reverse as reversePayout, verifyAccount, type PayoutOutcome } from './payouts.ts';
export { refusalSaying, simulationOf, type Simulation } from './contract.ts';
