import { formatDay, refusalById, remaining, ruleById, spent, sponsor, statement } from './programmes';
import { previewSponsorship, sponsorshipStates, statementFor, type Sponsorship, type StatementLine } from './household';

/* Somebody paying for somebody else's care, from the payer's side.
 *
 * The back office has had this for as long as the programmes contract has existed — a statement, a
 * consent, and the two lists that decide what a sponsor may know. The person actually paying had no
 * screen at all: "Sponsored care" was a word under a family member's name and there was nowhere to
 * press it. This module is the patient application's reading of the same contract.
 *
 * THE INTERESTING HALF IS THE REFUSAL, AND IT IS NOT A NEW ONE. A sponsor sees that care happened,
 * when, and what it cost. They do not see why the visit happened, what was found, or whether
 * anything needs following up — "a second visit is needed" is a finding wearing a diary entry's
 * clothes. Whether the service is even named is the recipient's switch, per sponsor, because a line
 * reading "sexual health screening" discloses more than most diagnoses do. All of that is
 * packages/catalog/programmes.json's, word for word, and none of it is written here.
 *
 * The one thing this file adds to the contract is the join to the guardian scope model: record
 * access is a separate decision, made by the recipient, in her own account, and the least scope
 * MyThuso offers — bookings and payments only — is still more than paying for care grants. A
 * sponsorship grants nothing at all. That is the sentence a sponsor is owed before they pay rather
 * than after.
 *
 * WHAT BELONGS IN A CONTRACT AND IS NOT THERE. programmes.json's statement names its recipient
 * ("Grace Mokoena") and the patient application's household names hers, and the two are different
 * people. This screen shows the account holder's own family member, because a person opening "care
 * you sponsor" in their own app is looking at their own mother — and every figure on it, what was
 * set aside and each line's service, date and amount, is still the contract's. The right fix is a
 * reference in the contract to the household rather than a second name in it; that is reported
 * rather than patched around, and there is nowhere here to type an amount.
 *
 * No payment is taken, no statement is issued and no sponsorship exists. */

export const sponsorContract = sponsor;
export const lines = statement.lines;
export const setAside = statement.setAside;
export const used = spent;
export const left = remaining;
export const namingNote = statement.note;
export const day = formatDay;

/** The rule a sponsor is owed before they pay rather than after. The guardian scope model is joined
    to it on the screen, where the components that draw a scope already live. */
export const payingIsNotPermission = ruleById('paying-is-not-permission');
export const cannotRequireDetail = refusalById('require-the-detail');

/** Whether this recipient has let this sponsor see which visit each line was. Worked out from the
    statement rather than written down: every line of it names a service, which is what her having
    switched service-named on looks like, and the statement's own note says so in her words —
    "which visit it was appears only because the recipient has switched that on for this sponsor,
    and she can switch it off again without saying why". Both branches stay live, because the
    sponsorship the domain builds from this carries whichever line detail it lands on. */
export const serviceIsNamed: boolean = statement.lines.length > 0 && statement.lines.every(line => !!line.serviceId);

/** The sponsorship as a link rather than a name: a household reference, the member being paid for and
    the payer, with the recipient's line detail in force. The statement's figures are still
    programmes.json's; what this adds is that nothing on the sponsor's screen is a person somebody
    typed into a contract twice. The naming join is not closed — see the note above. */
export const sponsorshipLink = (householdRef: string) => previewSponsorship(serviceIsNamed, householdRef);

/** The lines a sponsor may read, with the service removed unless her line detail names it. The same
    function the route answers with, so the screen is never handed a field it is meant to hide. */
export const readableLines = (link: Sponsorship): readonly StatementLine[] =>
 statementFor(link, statement.lines.map(line => ({ paidOnDay: line.on, amountCents: Math.round(line.amount * 100), serviceId: line.serviceId })));
/** What a line reads as on the screen: the catalogue's name for the service the domain let through. */
export const serviceNameOf = (serviceId: string | undefined) => statement.lines.find(line => line.serviceId === serviceId)?.service ?? null;
export const sponsorshipStateOf = (id: string) => sponsorshipStates.find(s => s.id === id)!;

/** Which of the two line-detail settings the recipient has switched on. It is read here and is
    never a control on this screen: the sponsor is not the person whose switch it is, so offering
    them one would be offering them the thing the contract refuses them. */
export const lineDetailById = (id: string) => sponsor.lineDetail.find(d => d.id === id)!;
export const namedDetail = lineDetailById('service-named');
export const amountOnlyDetail = lineDetailById('amount-only');

/** How much of what was set aside has been drawn. Used for the segments rather than a percentage:
    a sponsorship is a count of visits paid for, which is what a person is actually keeping track
    of, not a proportion of a budget. */
export const visitsPaidFor = lines.length;
