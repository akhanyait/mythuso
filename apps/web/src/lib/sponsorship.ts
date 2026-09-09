import { formatDay, refusalById, remaining, ruleById, spent, sponsor, statement } from './programmes';

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

/** Whether this recipient has let this sponsor see which visit each line was. The statement's own
    note says she has — "which visit it was appears only because the recipient has switched that on
    for this sponsor, and she can switch it off again without saying why" — so it is her fact, read
    from the contract rather than defaulted to the friendlier answer. Typed as a boolean so the
    other branch stays live code: the day the contract carries the switch itself, this reads it. */
export const serviceIsNamed: boolean = true;

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
