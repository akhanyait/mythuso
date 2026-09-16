/**
 * Group payers as Money holds them: a stokvel, a church or an employer, the people it invited, who agreed and how,
 * and what it paid — never what for, and never a balance.
 *
 * ── Why a group has no money in it ───────────────────────────────────────────────────────────
 *
 * Holding money for other people is taking deposits, which only a bank may do (packages/catalog/groups.json
 * noPooledMoney). So a Group is a reference, a kind and who opened it, and nothing that could hold an amount: no
 * balance, no contribution, no float. A group is charged through the payment provider for one member's payable, when
 * the member asks, and what it paid is a list of those payments, which is the only arithmetic this file does. A
 * request carrying a field that sounds like a pool is refused by the words of its name before anything is keyed.
 *
 * ── Why a member is never added ──────────────────────────────────────────────────────────────
 *
 * A group invites. The person invited agrees in her own account, choosing how the group's screen reads what it paid
 * for her, and until she does the group can pay for nothing of hers. A request inviting somebody that carries an
 * agreement on her behalf is refused rather than recorded, for the same reason a sponsor may not agree for a parent.
 *
 * ── What a group's screen is handed ──────────────────────────────────────────────────────────
 *
 * Worked out here rather than filtered afterwards. A stokvel or a church is handed each member's state and, only for a
 * member who chose amount-and-day, the day and the amount of each payment — never the service, never why. An employer
 * is handed no member rows at all, and the month's total and the number who agreed only when at least as many agreed
 * as packages/catalog/programmes.json's suppression floor: a payment names the day a person was seen, and a total for a
 * handful of people names who.
 */
import contract from '../../../../catalog/groups.json' with { type: 'json' };
import programmes from '../../../../catalog/programmes.json' with { type: 'json' };

export const groupsContract = contract;
export type GroupKind = 'stokvel' | 'church' | 'employer';
export type GroupLineDetail = 'amount-and-day' | 'month-total-only';
export type MembershipState = 'invited' | 'member' | 'left';

/** A group: a reference, its kind and who opened it. Nothing in it can hold an amount. */
export type Group = { groupRef: string; groupKind: GroupKind; adminRef: string; adminRole: string; openedOn: string };

export type Membership = {
 membershipRef: string; groupRef: string; subjectRef: string; stateCode: MembershipState;
 /** Hers to choose when she agrees, from what her group's kind offers. Null until she does. */
 lineDetail: GroupLineDetail | null;
 invitedOn: string; agreedOn: string | null; leftOn: string | null;
};

/** One payment a group's own account was charged for one member's payable. The payment's state is the ledger's. */
export type GroupCharge = { paymentRef: string; groupRef: string; membershipRef: string; payableRef: string; amountCents: number; on: string };

type Kind = { id: GroupKind; name: string; openedBy: string; lineDetails: GroupLineDetail[] };
const KINDS = contract.kinds as Kind[];
export const groupKindOf = (id: string): Kind | undefined => KINDS.find(k => k.id === id);
/** The roles that open a group, and so administer one: each kind's openedBy. */
export const GROUP_ADMIN_ROLES: readonly string[] = [...new Set(KINDS.map(k => k.openedBy))];
export const lineDetailIds = contract.lineDetails.map(d => d.id) as GroupLineDetail[];
/** The fewest members an employer's total is shown for: the employer programmes' floor, read where it lives. */
export const EMPLOYER_FLOOR: number = programmes.floor.minimumCohort;
export const groupPays = contract.pays as { payableKinds: string[]; methods: string[] };

/* ---- Words in what a request sends ------------------------------------------------------------------ */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const names = (sent: readonly string[], list: readonly string[]) => sent.some(name => wordsOf(name).some(word => list.includes(word)));
/** Whether a request carries a field that would have MyThuso hold a group's money. */
export const holdsMoney = (sent: readonly string[]) => names(sent, contract.noPooledMoney.fieldWords);
/** Whether a request inviting somebody carries an agreement made for her. */
export const agreesForMember = (sent: readonly string[]) => names(sent, contract.memberFieldWords);

/** A Johannesburg date's calendar month, which is the month a limit and a total are counted over. */
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/* ---- What a group's screen is handed --------------------------------------------------------------- */

export type GroupView = {
 groupKind: GroupKind;
 /** How many agreed and how many are still invited; null for an employer below the floor. */
 membersAgreed: number | null;
 invitationsWaiting: number | null;
 /** What the group paid this month for everybody together; null for an employer below the floor. */
 monthTotalCents: number | null;
 /** Each member's state and, only where she chose amount-and-day, the day and amount of each payment. None for an employer. */
 members: { membershipRef: string; stateCode: MembershipState; lineDetail: GroupLineDetail | null; lines: { on: string; amountCents: number }[] }[];
};

/**
 * A group as its administrator may see it this month. `paid` is the group's charges whose payments succeeded,
 * worked out by the ledger, and `month` the calendar month the total is for.
 */
export function groupViewOf(group: Group, memberships: readonly Membership[], paid: readonly GroupCharge[], month: string): GroupView {
 const own = memberships.filter(m => m.groupRef === group.groupRef);
 const agreed = own.filter(m => m.stateCode === 'member').length;
 const waiting = own.filter(m => m.stateCode === 'invited').length;
 const monthTotalCents = paid.filter(c => c.groupRef === group.groupRef && monthOf(c.on) === month).reduce((sum, c) => sum + c.amountCents, 0);
 if (group.groupKind === 'employer') {
  const shown = agreed >= EMPLOYER_FLOOR;
  return { groupKind: group.groupKind, membersAgreed: shown ? agreed : null, invitationsWaiting: shown ? waiting : null, monthTotalCents: shown ? monthTotalCents : null, members: [] };
 }
 return {
  groupKind: group.groupKind, membersAgreed: agreed, invitationsWaiting: waiting, monthTotalCents,
  members: own.map(m => ({
   membershipRef: m.membershipRef, stateCode: m.stateCode, lineDetail: m.lineDetail,
   lines: m.lineDetail === 'amount-and-day' ? paid.filter(c => c.membershipRef === m.membershipRef).map(c => ({ on: c.on, amountCents: c.amountCents })) : []
  }))
 };
}
