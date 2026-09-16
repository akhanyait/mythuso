import contract from '../../../../packages/catalog/household.json';
import { addMember, householdContract, namesAGrant, openHousehold, readHousehold, type Household, type Membership } from '../../../../packages/engines/src/access/domain/household.ts';
import { acceptShare, payableShares, proposeSplit, sharesFromParts, splitState, type Share, type Split } from '../../../../packages/engines/src/access/domain/bill-split.ts';
import { DEFAULT_LINE_DETAIL, SERVICE_NAMED, statementFor, type Sponsorship, type StatementLine } from '../../../../packages/engines/src/access/domain/sponsorship.ts';
import { services } from './catalog';
import { inDays } from './vetting';

/* The three family arrangements, as the patient application reads them.
 *
 * WHY THIS IMPORTS THE ENGINE'S DOMAIN RATHER THAN COPYING IT. The reasoning behind the routes is pure
 * functions over plain data with no dependencies, exactly as the booking domain is, so the browser runs the
 * same arithmetic the runtime does and the same node:test suite covers both. A screen here never decides
 * whether a roster grants anything, whether shares add up or whether a service may be named: it asks, and
 * renders the answer. Nothing is stored or sent — the ledger below lives in a React state hook for as long
 * as the page is open, which is what "nothing typed here is stored" has always meant on these screens.
 *
 * WHAT IS STILL OPEN, AND IS NOT PAPERED OVER. packages/catalog/programmes.json's statement names its
 * recipient in words ("Grace Mokoena") while the household names hers by reference. This module closes the
 * half it can — the sponsorship is a link between a household reference, a member reference and a payer
 * reference, and whether the service is named is read from the statement rather than from a hardcoded
 * boolean — and leaves the naming join open rather than adding a second name to hide it. docs/FEATURE-MAP.md
 * carries the gap.
 *
 * No household exists, nobody is added to one, no sponsorship is agreed and nothing is charged. */

export const householdWords = contract.screen.household;
export const sponsorWords = contract.screen.sponsor;
export const splitWords = contract.screen.split;
export const neverHolds = contract.membership.neverHolds;
export const sponsorshipStates = contract.sponsorship.states;
export const splitStates = contract.split.states;
export const shareStates = contract.split.shareStates;
export { householdContract, namesAGrant, payableShares, sharesFromParts, splitState, statementFor, SERVICE_NAMED };
export type { Household, Membership, Share, Split, Sponsorship, StatementLine };

const preview = contract.preview;
/** The preview roster's first names, by the reference the domain holds. The roster itself carries none. */
export const nameOf = (subjectRef: string) => preview.members.find(m => m.subjectRef === subjectRef)?.name ?? subjectRef;
export const memberIdOf = (subjectRef: string) => preview.members.find(m => m.subjectRef === subjectRef)?.memberId ?? null;
export const refOfMember = (memberId: string) => preview.members.find(m => m.memberId === memberId)?.subjectRef ?? null;

/* ---- The preview household, built by the domain rather than written out ----------------------- */
/** Who the preview is signed in as: the household's own organiser, so the roster is hers to read and add to. */
export const PREVIEW_VIEWER = preview.openedBy;

export function previewHousehold(now = new Date()): Household {
 const opened = openHousehold({ households: [] }, {
  openedBySubjectRef: preview.openedBy,
  memberSubjectRefs: preview.members.map(m => m.subjectRef),
  sent: [], now
 });
 if (opened.refused) throw new Error(`packages/catalog/household.json's preview household is refused by the domain: ${opened.id}`);
 /* Each line keeps the day the contract gives it, as an offset from today, so the preview never goes stale. */
 const members: Membership[] = opened.value.household.members.map(m => {
  const seeded = preview.members.find(p => p.subjectRef === m.memberSubjectRef);
  return seeded ? { ...m, addedBySubjectRef: seeded.addedBy, addedOnDay: inDays(seeded.addedOnDays) } : m;
 });
 return { ...opened.value.household, members };
}

/** Adding a member, through the domain that answers the route. Returns the refusal id, or the new roster. */
export function addToRoster(household: Household, input: { memberSubjectRef: string; addedBySubjectRef: string; attachment?: string; now?: Date }) {
 const sent = input.attachment ? [input.attachment] : [];
 const outcome = addMember({ households: [household] },
  { householdRef: household.householdRef, memberSubjectRef: input.memberSubjectRef, addedBySubjectRef: input.addedBySubjectRef, sent, now: input.now ?? new Date() });
 return outcome.refused ? { refused: true as const, id: outcome.id, statement: outcome.statement } : { refused: false as const, household: outcome.value.household };
}

/** The roster as somebody sees it: refused in the route's own words to anybody not on it. */
export function rosterFor(household: Household, subjectRef: string) {
 const outcome = readHousehold({ households: [household] }, household.householdRef, subjectRef);
 return outcome.refused ? { refused: true as const, statement: outcome.statement } : { refused: false as const, members: outcome.value.household.members };
}

/* ---- The sponsorship, by reference ------------------------------------------------------------- */
const priceOf = (id: string) => {
 const service = services.find(s => s.id === id);
 if (!service) throw new Error(`packages/catalog/household.json names a service that is not in the catalogue: ${id}`);
 return service;
};

/**
 * The preview sponsorship as a link: a household, a member of it and a payer, none of them typed as a name.
 * The line detail in force is worked out from programmes.json's statement rather than declared a second
 * time — every line of that statement names a service, which is what the recipient switching service-named
 * on looks like, and its note says so in her own words.
 */
export function previewSponsorship(statementNamesEachService: boolean, householdRef: string): Sponsorship {
 return {
  sponsorshipRef: preview.sponsorship.sponsorshipRef,
  householdRef,
  sponsoredSubjectRef: preview.sponsorship.sponsoredSubjectRef,
  payerSubjectRef: preview.sponsorship.payerSubjectRef,
  stateCode: preview.sponsorship.stateCode as Sponsorship['stateCode'],
  lineDetailId: statementNamesEachService ? SERVICE_NAMED : DEFAULT_LINE_DETAIL,
  offeredOnDay: inDays(-120),
  answeredOnDay: inDays(-119)
 };
}

/* ---- The split ---------------------------------------------------------------------------------- */
/** What the preview's visit owes, in cents. The price is the catalogue's; nothing here types a rand. */
export const previewPayableCents = () => priceOf(preview.split.serviceId).price * 100;
export const previewPayableRef = preview.split.payableRef;
export const previewSplitFor = preview.split.forMemberRef;
/** An even split of that payable between the two payers the contract names, worked out by the domain. */
export const previewShares = () => sharesFromParts(previewPayableCents(), preview.split.shares.map(s => ({ payerSubjectRef: s.payerSubjectRef, parts: s.parts })));

export function proposePreviewSplit(shares: readonly { payerSubjectRef: string; amountCents: number }[], input: { attachment?: string; now?: Date } = {}) {
 const outcome = proposeSplit({ splits: [] }, {
  idempotencyKey: `preview-${previewPayableRef}`, payableRef: previewPayableRef, amountCents: previewPayableCents(),
  shares, proposedBySubjectRef: PREVIEW_VIEWER, sent: input.attachment ? [input.attachment] : [], now: input.now ?? new Date()
 });
 return outcome.refused ? { refused: true as const, id: outcome.id, statement: outcome.statement } : { refused: false as const, split: outcome.value.split };
}

export function acceptPreviewShare(split: Split, input: { bySubjectRef: string; amountCents: number; now?: Date }) {
 const outcome = acceptShare({ splits: [split] }, { splitRef: split.splitRef, amountCents: input.amountCents, bySubjectRef: input.bySubjectRef, sent: [], now: input.now ?? new Date() });
 return outcome.refused ? { refused: true as const, id: outcome.id, statement: outcome.statement } : { refused: false as const, split: outcome.value.split };
}

/** Rands from cents, for the one place a screen shows an amount the split worked out. */
export const randOf = (cents: number) => cents / 100;
