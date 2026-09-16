/* Somebody paying for somebody else's care, as Access holds it: a reference to a household membership, a
   reference to the payer, the state the recipient put it in, and the line detail she chose. No amount of its
   own, no name, and nothing a visit produced.

   ── Why it names a membership rather than a person ───────────────────────────────────────────────

   Version one of the sponsors route took a subject reference and nothing else, so a sponsorship could be
   opened against any string a caller typed — the same fault packages/catalog/programmes.json's statement
   still has, where the recipient is a name rather than a reference. Version two names a household and a
   member of it, and the domain checks the membership before anything is written, so the link is to a roster
   line somebody actually made.

   ── Why it starts offered ────────────────────────────────────────────────────────────────────────

   packages/catalog/programmes.json says it plainly: a sponsorship does not start because somebody offered to
   pay, it starts when the person being paid for says yes, from her own account. So an offer writes a
   sponsorship in the offered state, which pays for nothing, and only her answer moves it. She stops it the
   same way and is asked for no reason, because the contract says she owes none.

   ── Where the refusal is arithmetic rather than manners ──────────────────────────────────────────

   `statementFor` is the whole of what a sponsor may read. It takes the lines a payment produced — a day, an
   amount, and the service where anything knows it — and returns them with the service removed unless the
   recipient's line detail in force is programmes.json's service-named. A screen never sees a field it is
   meant to hide, because the field is not in what it was handed. The route's response shape has no place for
   a reason, a finding or a follow-up at all, so there is nothing further to remove.

   ── What this engine cannot tell, and does not guess ─────────────────────────────────────────────

   payment.succeeded@1 carries the payment, the payable, the amount and the method, and names no payer. So a
   payment is attributed to a sponsorship only when the person it was for has exactly one agreed sponsorship;
   where she has two, no line is attributed to either, because the alternative is showing one sponsor what the
   other paid. Closing that needs a payer on the event, which is a new version of somebody else's event and
   not this engine's to declare.

   Zero dependencies, so the web preview runs this as the tests do. */
import household from '../../../../catalog/household.json' with { type: 'json' };
import programmes from '../../../../catalog/programmes.json' with { type: 'json' };
import { accept, isoIn, routeRefusal, simulatedRef, type Outcome } from './contract.ts';
import { householdByRef, isMember, type HouseholdLedger } from './household.ts';

export const SPONSOR_ROUTES = {
 offer: 'POST /v1/access/sponsors@2',
 answer: 'POST /v1/access/sponsors/{sponsorshipRef}/answer@1',
 read: 'GET /v1/access/sponsors@1'
} as const;

type LineDetail = { id: string; name: string; detail: string; isDefault: boolean };
const LINE_DETAILS = programmes.sponsor.lineDetail as LineDetail[];
const fallback = LINE_DETAILS.find(d => d.isDefault);
if (!fallback) throw new Error('packages/catalog/programmes.json no longer marks one sponsor line detail as the default, so a new sponsorship would have no setting to start at.');
/** An amount and a date: what a statement says until the recipient says otherwise. */
export const DEFAULT_LINE_DETAIL: string = fallback.id;
/** The one line detail that names the service. Read from the contract, never typed. */
export const SERVICE_NAMED: string = household.sponsorship.billingLine.serviceNamedBy;
export const lineDetailIds: readonly string[] = LINE_DETAILS.map(d => d.id);
if (!lineDetailIds.includes(SERVICE_NAMED)) throw new Error(`packages/catalog/household.json says a service is named by the line detail "${SERVICE_NAMED}", which packages/catalog/programmes.json does not offer.`);

export type SponsorshipState = 'offered' | 'agreed' | 'stopped';
export const sponsorshipStates = household.sponsorship.states as { id: SponsorshipState; name: string; recipientWords: string; sponsorWords: string }[];
export const sponsorshipStateOf = (id: string) => sponsorshipStates.find(s => s.id === id);

export type Sponsorship = {
 readonly sponsorshipRef: string;
 readonly householdRef: string;
 readonly sponsoredSubjectRef: string;
 readonly payerSubjectRef: string;
 readonly stateCode: SponsorshipState;
 readonly lineDetailId: string;
 readonly offeredOnDay: string;
 readonly answeredOnDay: string | null;
};
/** One payment Access heard about, held as a reference and two figures. Never a reason, never a finding. */
export type SponsoredPayment = {
 readonly paymentRef: string;
 readonly subjectRef: string;
 readonly paidOnDay: string;
 readonly amountCents: number;
 /** Null wherever nothing told this engine which service it was, which is every payment the bus carries. */
 readonly serviceId: string | null;
};
export type StatementLine = { readonly paidOnDay: string; readonly amountCents: number; readonly serviceId?: string };
export type SponsorshipLedger = { readonly sponsorships: readonly Sponsorship[]; readonly payments: readonly SponsoredPayment[] };

/* ---- Words in what a request sends ------------------------------------------------------------ */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const CARE_WORDS = household.sponsorship.careFieldWords as readonly string[];
/** Whether a request asks to be told what the care was. */
export const asksAboutCare = (sent: readonly string[]): boolean =>
 sent.some(name => wordsOf(name).some(word => CARE_WORDS.includes(word)));

/* ---- What a sponsor may read ------------------------------------------------------------------ */
/**
 * The statement lines for a sponsorship: a day and an amount each, and the service only where the
 * recipient's line detail in force names it. This is the refusal, done as arithmetic — a caller is never
 * handed a service to leave out.
 */
export const statementFor = (sponsorship: Sponsorship, lines: readonly StatementLine[]): readonly StatementLine[] =>
 lines.map(line => (sponsorship.lineDetailId === SERVICE_NAMED && line.serviceId
  ? { paidOnDay: line.paidOnDay, amountCents: line.amountCents, serviceId: line.serviceId }
  : { paidOnDay: line.paidOnDay, amountCents: line.amountCents }));

export const paidCents = (lines: readonly StatementLine[]) => lines.reduce((total, line) => total + line.amountCents, 0);

/**
 * The payments this sponsorship may be read as having paid for. Empty unless the person it names has
 * exactly one agreed sponsorship: the bus carries no payer, and attributing a payment to one of two
 * sponsors would show each of them what the other paid.
 */
export function linesOf(ledger: SponsorshipLedger, sponsorship: Sponsorship): readonly StatementLine[] {
 if (sponsorship.stateCode !== 'agreed') return [];
 const agreed = ledger.sponsorships.filter(s => s.sponsoredSubjectRef === sponsorship.sponsoredSubjectRef && s.stateCode === 'agreed');
 if (agreed.length !== 1) return [];
 return ledger.payments.filter(p => p.subjectRef === sponsorship.sponsoredSubjectRef)
  .map(p => (p.serviceId ? { paidOnDay: p.paidOnDay, amountCents: p.amountCents, serviceId: p.serviceId } : { paidOnDay: p.paidOnDay, amountCents: p.amountCents }));
}

/* ---- The three acts ---------------------------------------------------------------------------- */

/** A sponsor offers to pay for somebody on a household's roster. Nothing is paid, and nothing is shared. */
export function offerSponsorship(
 ledger: SponsorshipLedger,
 households: HouseholdLedger,
 input: { readonly idempotencyKey: string; readonly householdRef: string; readonly sponsoredSubjectRef: string; readonly payerSubjectRef: string; readonly sent: readonly string[]; readonly now: Date }
): Outcome<{ readonly sponsorship: Sponsorship }> {
 if (asksAboutCare(input.sent)) return routeRefusal(SPONSOR_ROUTES.offer, 'sponsor-reads-nothing');
 if (!input.payerSubjectRef) return routeRefusal(SPONSOR_ROUTES.offer, 'required-field-missing');
 if (!isMember(householdByRef(households, input.householdRef), input.sponsoredSubjectRef)) return routeRefusal(SPONSOR_ROUTES.offer, 'not-a-household-member');
 const sponsorshipRef = simulatedRef('SP', input.idempotencyKey);
 const standing = ledger.sponsorships.find(s => s.sponsorshipRef === sponsorshipRef);
 if (standing) return accept({ sponsorship: standing });
 return accept({
  sponsorship: {
   sponsorshipRef, householdRef: input.householdRef, sponsoredSubjectRef: input.sponsoredSubjectRef,
   payerSubjectRef: input.payerSubjectRef, stateCode: 'offered', lineDetailId: DEFAULT_LINE_DETAIL,
   offeredOnDay: isoIn(input.now), answeredOnDay: null
  }
 });
}

/** She agrees, or she stops it. Nobody else answers, and stopping needs no reason. */
export function answerSponsorship(
 ledger: SponsorshipLedger,
 input: { readonly sponsorshipRef: string; readonly answerCode: string; readonly bySubjectRef: string; readonly now: Date }
): Outcome<{ readonly sponsorship: Sponsorship }> {
 const standing = ledger.sponsorships.find(s => s.sponsorshipRef === input.sponsorshipRef);
 if (!standing || !input.bySubjectRef || standing.sponsoredSubjectRef !== input.bySubjectRef) return routeRefusal(SPONSOR_ROUTES.answer, 'only-the-recipient-answers');
 if (input.answerCode !== 'agree' && input.answerCode !== 'stop') return routeRefusal(SPONSOR_ROUTES.answer, 'answer-not-offered');
 const stateCode: SponsorshipState = input.answerCode === 'agree' ? 'agreed' : 'stopped';
 return accept({ sponsorship: { ...standing, stateCode, answeredOnDay: isoIn(input.now) } });
}

/** The sponsorships one person is on a side of: the payer's, and the recipient's own. */
export function statementsFor(
 ledger: SponsorshipLedger,
 input: { readonly subjectRef: string; readonly sponsorshipRef: string | null; readonly sent: readonly string[] }
): Outcome<{ readonly statements: readonly { readonly sponsorship: Sponsorship; readonly lines: readonly StatementLine[] }[] }> {
 if (asksAboutCare(input.sent)) return routeRefusal(SPONSOR_ROUTES.read, 'sponsor-reads-nothing');
 const mine = (s: Sponsorship) => !!input.subjectRef && (s.payerSubjectRef === input.subjectRef || s.sponsoredSubjectRef === input.subjectRef);
 if (input.sponsorshipRef) {
  const one = ledger.sponsorships.find(s => s.sponsorshipRef === input.sponsorshipRef);
  if (!one || !mine(one)) return routeRefusal(SPONSOR_ROUTES.read, 'sponsorship-not-yours');
  return accept({ statements: [{ sponsorship: one, lines: statementFor(one, linesOf(ledger, one)) }] });
 }
 return accept({ statements: ledger.sponsorships.filter(mine).map(s => ({ sponsorship: s, lines: statementFor(s, linesOf(ledger, s)) })) });
}
