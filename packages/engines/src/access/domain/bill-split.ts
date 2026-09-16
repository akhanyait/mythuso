/* One payable, cut into shares each payer accepts for themselves.

   ── Why this holds a reference to Money's payable and nothing of Money's ─────────────────────────

   A payable is Money's: its kind, its method, its price out of packages/catalog/services.json and its state
   are all decided in packages/engines/src/money/domain, and an engine never reads another engine's store or
   imports its code. So a split holds the payable's reference and the amount in cents the caller was told it
   owes, and nothing else — no kind, no method, no service and no price. The shares are added up against that
   amount, and Money charges each accepted share through its own payment route, where the money actually
   moves. Nothing here takes a payment.

   ── Why the shares must total, in cents ──────────────────────────────────────────────────────────

   A split that is short leaves somebody owing an amount nobody agreed; one that is over charges a family more
   than the visit cost. Both are refused rather than tidied, and both are compared in cents, so there is no
   rounding for anybody to argue about later. A preview split is written as parts rather than amounts —
   `sharesFromParts` divides the payable and gives the remainder to the first share — because the price of a
   visit lives in packages/catalog/services.json and there is nowhere in this product to type a rand.

   ── Why acceptance is the point ──────────────────────────────────────────────────────────────────

   Two adult children splitting a parent's bill are dividing each other's money. So a share is owed only once
   the person who owes it has accepted it, in their own session, at the amount they were shown — and
   `payableShares` returns the accepted ones and nothing else, which is the rule as arithmetic rather than as
   a disabled button on one screen. A split becomes payable only when no share is still waiting.

   ── What a payer never learns ────────────────────────────────────────────────────────────────────

   The shape carries payer references, amounts and states. It has no field for a service, a subject or
   anything a visit produced, so paying a share tells the payer nothing about the care — and a request that
   asks is refused in the route's own words rather than answered with a shape that leaves it out.

   Zero dependencies, so the web preview runs this as the tests do. */
import contract from '../../../../catalog/household.json' with { type: 'json' };
import { accept, isoIn, routeRefusal, simulatedRef, type Outcome } from './contract.ts';

export const SPLIT_ROUTES = {
 propose: 'POST /v1/access/bill-splits@2',
 accept: 'POST /v1/access/bill-splits/{splitRef}/accept@1'
} as const;

export type ShareState = 'waiting' | 'accepted';
export type SplitState = 'proposed' | 'payable';
export const splitStates = contract.split.states as { id: SplitState; name: string; words: string }[];
export const shareStates = contract.split.shareStates as { id: ShareState; name: string; words: string }[];
export const splitStateOf = (id: string) => splitStates.find(s => s.id === id);
export const shareStateOf = (id: string) => shareStates.find(s => s.id === id);

export type Share = { readonly payerSubjectRef: string; readonly amountCents: number; readonly stateCode: ShareState; readonly acceptedOnDay: string | null };
export type Split = {
 readonly splitRef: string;
 readonly payableRef: string;
 readonly amountCents: number;
 readonly proposedBySubjectRef: string;
 readonly proposedOnDay: string;
 readonly shares: readonly Share[];
};
export type SplitLedger = { readonly splits: readonly Split[] };

/* ---- Words in what a request sends ------------------------------------------------------------- */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const CARE_WORDS = contract.sponsorship.careFieldWords as readonly string[];
/** Whether a request asks what the amount was for. The same words a sponsor is refused for asking. */
export const asksAboutCare = (sent: readonly string[]): boolean =>
 sent.some(name => wordsOf(name).some(word => CARE_WORDS.includes(word)));

/* ---- Arithmetic --------------------------------------------------------------------------------- */
export const sharesTotal = (shares: readonly { amountCents: number }[]) => shares.reduce((total, s) => total + s.amountCents, 0);
/** proposed while any share is still waiting; payable once none is. A split with no shares is never payable. */
export const splitState = (split: Split): SplitState => (split.shares.length && split.shares.every(s => s.stateCode === 'accepted') ? 'payable' : 'proposed');
/**
 * The shares a split offers for payment: the accepted ones, and only those. An unaccepted share is not owed,
 * so there is nothing to charge for it, and this is where that is decided rather than on a screen.
 */
export const payableShares = (split: Split): readonly Share[] => split.shares.filter(s => s.stateCode === 'accepted');

/**
 * A whole cut into parts, in cents, with the remainder on the first share. Used to seed a preview and to
 * offer a family an even split; every amount comes from the payable, and no rand is typed anywhere.
 */
export function sharesFromParts(amountCents: number, parts: readonly { readonly payerSubjectRef: string; readonly parts: number }[]): readonly { readonly payerSubjectRef: string; readonly amountCents: number }[] {
 const whole = parts.reduce((total, p) => total + p.parts, 0);
 if (whole <= 0) return [];
 const each = parts.map(p => ({ payerSubjectRef: p.payerSubjectRef, amountCents: Math.floor((amountCents * p.parts) / whole) }));
 const remainder = amountCents - each.reduce((total, s) => total + s.amountCents, 0);
 return each.map((s, i) => (i === 0 ? { ...s, amountCents: s.amountCents + remainder } : s));
}

/* ---- The two acts ------------------------------------------------------------------------------- */

/** A split is proposed. Nobody owes anything by it until they accept their own share. */
export function proposeSplit(
 ledger: SplitLedger,
 input: {
  readonly idempotencyKey: string; readonly payableRef: string; readonly amountCents: number;
  readonly shares: readonly { readonly payerSubjectRef: string; readonly amountCents: number }[];
  readonly proposedBySubjectRef: string; readonly sent: readonly string[]; readonly now: Date;
 }
): Outcome<{ readonly split: Split }> {
 if (asksAboutCare(input.sent)) return routeRefusal(SPLIT_ROUTES.propose, 'split-shows-no-care');
 if (!input.proposedBySubjectRef || !input.payableRef) return routeRefusal(SPLIT_ROUTES.propose, 'required-field-missing');
 const named = input.shares.map(s => s.payerSubjectRef);
 if (!input.shares.length || named.some(ref => !ref) || new Set(named).size !== named.length
  || input.shares.some(s => !Number.isInteger(s.amountCents) || s.amountCents <= 0)) return routeRefusal(SPLIT_ROUTES.propose, 'one-share-each');
 if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || sharesTotal(input.shares) !== input.amountCents) return routeRefusal(SPLIT_ROUTES.propose, 'shares-must-total');
 const splitRef = simulatedRef('BS', input.idempotencyKey);
 const standing = ledger.splits.find(s => s.splitRef === splitRef);
 if (standing) return accept({ split: standing });
 return accept({
  split: {
   splitRef, payableRef: input.payableRef, amountCents: input.amountCents,
   proposedBySubjectRef: input.proposedBySubjectRef, proposedOnDay: isoIn(input.now),
   shares: input.shares.map(s => ({ payerSubjectRef: s.payerSubjectRef, amountCents: s.amountCents, stateCode: 'waiting' as ShareState, acceptedOnDay: null }))
  }
 });
}

/** One payer accepts their own share, at the amount they were shown. */
export function acceptShare(
 ledger: SplitLedger,
 input: { readonly splitRef: string; readonly amountCents: number; readonly bySubjectRef: string; readonly sent: readonly string[]; readonly now: Date }
): Outcome<{ readonly split: Split; readonly share: Share }> {
 if (asksAboutCare(input.sent)) return routeRefusal(SPLIT_ROUTES.accept, 'split-shows-no-care');
 const split = ledger.splits.find(s => s.splitRef === input.splitRef);
 const share = split?.shares.find(s => !!input.bySubjectRef && s.payerSubjectRef === input.bySubjectRef);
 if (!split || !share) return routeRefusal(SPLIT_ROUTES.accept, 'not-your-share');
 if (share.amountCents !== input.amountCents) return routeRefusal(SPLIT_ROUTES.accept, 'share-amount-differs');
 const accepted: Share = share.stateCode === 'accepted' ? share : { ...share, stateCode: 'accepted', acceptedOnDay: isoIn(input.now) };
 return accept({ split: { ...split, shares: split.shares.map(s => (s.payerSubjectRef === accepted.payerSubjectRef ? accepted : s)) }, share: accepted });
}
