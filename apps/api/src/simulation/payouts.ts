/**
 * A simulated bank payout channel: what happened to one week of one nurse's work.
 *
 * ── The state the earnings screen already had, and nothing behind it ─────────────────────────
 *
 * `packages/catalog/earnings.json` has carried five week states since long before this file: one of
 * the four sample weeks failed, and it says, in words somebody wrote for a person who is short of
 * money this week, that the bank sent it back and the money is still owed. That state was drawn and
 * never reached. This is what reaches it — a channel that answers a payment run with `in-transit`,
 * `paid` or `failed`, deterministically, so a nurse's screen can be walked through a payout that
 * moved and a payout that did not.
 *
 * The failure sentence is not written here. It is `earnings.json`'s own `failed` state detail, read
 * rather than restated, because it is already rendered on three platforms and a second copy of it
 * would be a second promise about somebody's wages.
 *
 * ── The three things it will not do ──────────────────────────────────────────────────────────
 *
 * **Pay anybody.** Enforced by refusing to be handed the means: an account number, a branch code, an
 * IBAN. The feed refuses all of them at the door and the reason it gives is that an advice log
 * restating them would be the whole workforce's bankable details in a callback log. A simulator
 * that accepted them would be that log's first row, and it would be justified by nothing.
 *
 * **Verify a real bank account.** `verifyAccount` exists and its whole body is a refusal. The
 * earnings screen has a change-of-account flow with a cooling-off period, and the honest thing for
 * it to call is something that says no in the contract's words — rather than a screen quietly
 * proceeding as though a bank had confirmed anything.
 *
 * **Reverse a payout that never left.** Unconditional, and true by arithmetic rather than by policy:
 * no simulated payout has ever left this machine, so there is no payout to pull back. Money
 * genuinely going the other way is a `payment-result` reversal against a visit, which is where the
 * earnings ledger's own reversal line comes from.
 */
import { canonical, feedById, type Feed } from '../feeds/index.ts';
import {
 produced, refuse, register, seeded,
 type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';
import { flatten, refusalSaying, simulationOf } from './contract.ts';
import earnings from '../../../../packages/catalog/earnings.json' with { type: 'json' };

const feed: Feed = feedById('payout-advice')!;

/** earnings.json's own settled states, so a provider's vocabulary is translated at the door. */
export type PayoutOutcome = 'in-transit' | 'paid' | 'failed';

/* The sentence a nurse reads when a run comes back, in the words the contract already renders on
   three platforms. Read rather than typed: it is about somebody's wages, and there is one writer. */
const RETURNED = (earnings.states as ReadonlyArray<{ id: string; detail: string }>).find(state => state.id === 'failed')!.detail;

/* Every spelling of a bank instruction this seam knows, off the feed's own refusals. */
const BANK_SPELLINGS = new Set<string>(
 feed.neverAccepts
  .filter(never => never.field === 'accountNumber' || never.field === 'branchCode')
  .flatMap(never => [never.field, ...never.also])
  .map(canonical)
);

/* And by shape, because the disclosure is the digits. A South African account number is nine to
   eleven digits and a branch code is six; taken together with the names above that is enough to
   catch a fixture somebody thought was harmless. */
const ACCOUNT_SHAPED = /\b\d{9,11}\b/;

function carryingBankDetails(request: SimulationRequest): boolean {
 /* The amount is the one field here that is legitimately a long run of digits, so it is taken out
    before the shape check rather than excused afterwards — a rule with an exception written into
    its own error path is a rule somebody widens the next time it fires on something innocent. */
 const { amountCents: _amount, ...rest } = { amountCents: 0, ...(request.detail ?? {}) };
 const { keys, values } = flatten({ subject: request.subject, ...rest });
 if (keys.some(key => BANK_SPELLINGS.has(canonical(key)))) return true;
 return values.some(value => ACCOUNT_SHAPED.test(value));
}

/**
 * What one week's payment run did.
 *
 * `subject` is the earnings week — a payout is a week, not a visit — and the party being paid comes
 * in beside it. The amount is what MyThuso instructed, because that is the direction the number
 * travels: the ledger works out what is owed and the bank is told it. A bank that decided the
 * amount would not be a bank.
 *
 * A week that came back failed is advised `in-transit` when it is asked again, never `paid`: the
 * feed's own `a-failure-never-clears-the-week` condition, and the sentence on the screen already
 * promises it goes out with the next run.
 */
export const bankPayouts: Simulator = {
 id: 'bank-payouts',
 feed: feed.id,
 capability: 'payouts',
 supplier: simulationOf('payouts').supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  if (carryingBankDetails(request)) return refuse(bankPayouts, request, refusalSaying('payouts', /^Pay anybody/));

  const detail = request.detail ?? {};
  const partyId = detail['partyId'];
  const amountCents = detail['amountCents'];
  if (typeof partyId !== 'string') throw new Error('A simulated payout advice needs the vetted party being paid. The account is the means; the party is the payee, and only one of the two belongs in a message this service receives.');
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) throw new Error('A simulated payout advice needs the amount in whole cents, worked out by the ledger that knows what the week is worth.');

  const was = detail['was'];
  const rand = seeded(`payout:${request.subject}:${partyId}`);
  /* A run that already came back failed goes out again rather than clearing. Everything else is the
     bank's answer: four runs in five reach the account and the fifth is returned, which is roughly
     what a workforce paid into accounts opened at branches all over the country actually sees. */
  const outcome: PayoutOutcome = was === 'failed' ? 'in-transit' : rand() < 0.8 ? 'paid' : 'failed';
  return produced(bankPayouts, request, {
   weekId: request.subject,
   partyId,
   outcome,
   amountCents,
   at: (request.at ?? new Date()).toISOString(),
   ...(outcome === 'failed' ? { failureReason: RETURNED } : {})
  });
 }
};
register(bankPayouts);

/**
 * Asked to check that an account is real and belongs to the person named. It cannot, and says so.
 *
 * A function whose entire body is a refusal looks like a stub and is the opposite of one. The
 * alternative is the change-of-account screen calling nothing at all, which reads to whoever walks
 * the preview as though a bank had confirmed something.
 */
export const verifyAccount = (request: SimulationRequest): SimulatorAnswer =>
 refuse(bankPayouts, request, refusalSaying('payouts', /Verify a real bank account/));

/**
 * Asked to pull a payout back. There is nothing to pull back.
 *
 * Unconditional because it is arithmetic rather than policy: nothing this channel advises has ever
 * left the machine it runs on. A visit refunded to a patient after it was counted to a nurse is a
 * reversal against the payment, and the earnings ledger already carries it as a line of its own.
 */
export const reverse = (request: SimulationRequest): SimulatorAnswer =>
 refuse(bankPayouts, request, refusalSaying('payouts', /Reverse a payout that never left/));
