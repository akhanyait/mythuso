/**
 * A simulated South African card and EFT provider.
 *
 * ── What it is standing in for, and what it will not stand in for ────────────────────────────
 *
 * One attempt to take money for one visit, answered the way an acquirer answers: authorised, or
 * declined with a sentence a person can read. Two things it will not do, and both of them are in
 * the capability contract because both of them are how a demonstration becomes a liability.
 *
 * **No card number, not even a fictional one.** feeds.json refuses six spellings of it at the door
 * and says why: this service is not in scope for PCI DSS and must never become so by accident. A
 * simulator is the likeliest place for a first one to appear — it is only a fixture, it is only a
 * test number every developer already knows by heart, and it is in the history for ever the moment
 * it is committed. So there is no card here at all, in the code or in the comments around it: the
 * simulator is never told what was paid with, and it refuses to be.
 *
 * **It does not settle.** `authorised` and `settled` are separate values in the feed for a reason
 * the payout screen already depends on: a nurse's payout is arithmetic on money that has actually
 * arrived, and settlement is a fact about a bank rather than about a payment page. Nothing in this
 * process knows that fact, so nothing here may claim it.
 *
 * ── The price comes from the catalogue, not from the caller ──────────────────────────────────
 *
 * `packages/catalog/services.json` is what the patient is quoted, what the landing page advertises
 * and what the nurse's share is worked out from. So it is what a payment is for, and a caller that
 * offers an amount of its own has it checked rather than believed — which is the seam's own
 * `the-amount-is-reconciled-rather-than-believed` condition, made true here first so that the day a
 * real provider is connected the check is already the shape of the code around it.
 *
 * Nothing here says what was bought. The feed refuses a narrative naming the service, because the
 * catalogue's names are the closest this product comes to a diagnosis and a settlement file listing
 * them against a person is health information on a bank statement.
 */
import { canonical, feedById, type Feed } from '../feeds/index.ts';
import {
 pick, produced, refuse, register, seeded,
 type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';
import { flatten, refusesTo, simulationOf } from './contract.ts';
import catalogue from '../../../../packages/catalog/services.json' with { type: 'json' };

const feed: Feed = feedById('payment-result')!;
const services = catalogue as ReadonlyArray<{ id: string; price: number }>;

/** authorised, declined, reversed or settled — and this produces three of the four. */
export type PaymentOutcome = 'authorised' | 'declined' | 'reversed' | 'settled';

/** One country, one currency, stated rather than assumed. The feed says why. */
export const CURRENCY = 'ZAR';

/* Every spelling of a card number or a security code this seam knows, taken off the feed's own
   refusals rather than listed again beside them. */
const CARD_SPELLINGS = new Set<string>(
 feed.neverAccepts
  .filter(never => never.field === 'cardNumber' || never.field === 'cvv')
  .flatMap(never => [never.field, ...never.also])
  .map(canonical)
);

/* And a card number by its shape, because the disclosure is the digits rather than the field name.
   Thirteen to nineteen of them in a row, spaces and dashes ignored, is a primary account number in
   every scheme this country issues — including one arriving in a field called `note`, which is
   where a fixture actually puts it. */
const PAN = /(?:\d[ -]?){13,19}/;

/** Was this caller carrying a card, by name or by shape? */
function carryingACard(request: SimulationRequest): boolean {
 const { keys, values } = flatten({ subject: request.subject, ...(request.detail ?? {}) });
 if (keys.some(key => CARD_SPELLINGS.has(canonical(key)))) return true;
 return values.some(value => PAN.test(value.replace(/[^\d -]/g, '')));
}

/* In words a person reads, which is the register feeds.json asks for and the register CLAUDE.md
   asks for: "Your bank sent it back. It is still owed to you", not "Payment failed". Each of these
   says what happened and, because it is the first thing anybody wants to know, that no money moved. */
const DECLINES = [
 'Your bank did not approve the payment. Nothing has been taken.',
 'There was not enough in the account. Nothing has been taken.',
 'Your bank asked you to confirm the payment and the confirmation did not come back. Nothing has been taken.'
] as const;

/** What the catalogue says a visit costs, in cents, as a whole number. */
export function priceInCents(serviceId: string): number {
 const service = services.find(entry => entry.id === serviceId);
 if (!service) throw new Error(`No service "${serviceId}" in packages/catalog/services.json. A payment for a visit nobody sells is an amount that came from somewhere else.`);
 /* Cents, because services.json quotes whole rand and a provider reporting rand as a decimal will
    disagree by one — on a payout rather than on a test. */
 return service.price * 100;
}

/**
 * The result of one attempt to take money for one visit.
 *
 * `subject` is the visit reference this service issued, and it is the seed: the same visit produces
 * the same answer on every machine, for ever, so a demonstration can be repeated in front of
 * somebody and a test can fail twice the same way.
 */
export const cardAndEft: Simulator = {
 id: 'card-and-eft',
 feed: feed.id,
 capability: 'payments',
 supplier: simulationOf('payments').supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  if (carryingACard(request)) return refuse(cardAndEft, request, refusesTo('payments', /card number/));

  const detail = request.detail ?? {};
  /* Asked to settle. The sentence is the contract's and the reason is in the header: this process
     does not know whether money reached a bank, and the one thing a nurse's payout is built on is
     that somebody only claims it when it has. */
  if (detail['outcome'] === 'settled' || detail['settle'] === true) return refuse(cardAndEft, request, refusesTo('payments', /^Settle/));
  /* And asked to stamp somebody else's number on the receipt. `providerReference` is the only field
     in this payload where a receipt says whose it is, and every one this produces begins SIM- so
     that a receipt carries its own disclosure even when it is read away from the screen. */
  if (detail['providerReference'] !== undefined) return refuse(cardAndEft, request, refusesTo('payments', /receipt/));

  const amountCents = amountFor(detail);
  /* One attempt, not one visit. A card declined is tried again — with the same card, with another
     one, on another day — and each of those is its own event at the provider. Seeding on the visit
     alone would make a declined visit undeclinable for ever, which is not a property any payment
     system has and would leave a fifth of the preview's visits unbookable. The first attempt on a
     given reference is still the same answer on every machine, which is what determinism is for. */
  const attempt = typeof detail['attempt'] === 'number' ? detail['attempt'] : 1;
  const rand = seeded(`payment:${request.subject}:${attempt}`);
  /* Four in five authorise. A decline is not an edge case in South Africa — it is a Tuesday — and a
     booking flow that has only ever seen the happy path has no screen for the other one. */
  const declined = rand() >= 0.8;
  const at = (request.at ?? new Date()).toISOString();
  return produced(cardAndEft, request, {
   reference: request.subject,
   outcome: (declined ? 'declined' : 'authorised') satisfies PaymentOutcome,
   amountCents,
   currency: CURRENCY,
   at,
   ...(declined ? { declineReason: pick(rand, DECLINES) } : {}),
   providerReference: `SIM-PAY-${Math.floor(rand() * 900000 + 100000)}`
  });
 }
};
register(cardAndEft);

/**
 * Money going back, when a visit that was paid for does not happen.
 *
 * A separate call rather than an outcome the simulator picks, because a booking that reverses
 * itself at random is a fixture nobody can walk twice. The feed's own switch-on condition says a
 * reversal must name what it reverses; here it carries the visit reference it reverses, which is
 * the same key the authorisation carried.
 */
export function reverse(request: SimulationRequest): SimulatorAnswer {
 if (carryingACard(request)) return refuse(cardAndEft, request, refusesTo('payments', /card number/));
 const detail = request.detail ?? {};
 if (detail['providerReference'] !== undefined) return refuse(cardAndEft, request, refusesTo('payments', /receipt/));
 const rand = seeded(`reversal:${request.subject}`);
 return produced(cardAndEft, request, {
  reference: request.subject,
  outcome: 'reversed' satisfies PaymentOutcome,
  amountCents: amountFor(detail),
  currency: CURRENCY,
  at: (request.at ?? new Date()).toISOString(),
  providerReference: `SIM-PAY-${Math.floor(rand() * 900000 + 100000)}`
 });
}

/**
 * The amount, reconciled rather than believed.
 *
 * A caller may say what it thinks the visit costs. It is checked against the catalogue and a
 * disagreement throws, because a provider's amount that nothing checks is a provider's amount — and
 * a mismatch is an incident rather than a rounding.
 */
function amountFor(detail: Record<string, unknown>): number {
 const service = detail['service'];
 if (typeof service !== 'string') throw new Error('A simulated payment needs the service it is for, so its amount can come from packages/catalog/services.json rather than from whoever asked.');
 const amountCents = priceInCents(service);
 const offered = detail['amountCents'];
 if (offered !== undefined && offered !== amountCents) {
  throw new Error(`A payment for "${service}" was offered ${String(offered)} cents where packages/catalog/services.json says ${amountCents}. The catalogue is the price; a disagreement is an incident rather than a rounding.`);
 }
 return amountCents;
}
