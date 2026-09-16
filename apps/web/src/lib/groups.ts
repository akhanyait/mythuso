import { useSyncExternalStore } from 'react';
import { createMoney, type Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { isRefusal, serviceById } from '../../../../packages/engines/src/money/domain/contract.ts';
import { EMPLOYER_FLOOR, groupsContract, lineDetailIds, type GroupLineDetail, type GroupView, type MembershipState } from '../../../../packages/engines/src/money/domain/groups.ts';
import { money } from './catalog';
import { groupMemberCapNow, groupMemberMonthlyLimitCentsNow } from './settings';

/* Group payers in the web preview: a stokvel's treasurer reading what her group paid, and a member agreeing to let it pay
 * for her — both driven by Money's own ledger in the browser, as lib/cash-codes.ts drives the cash desk.
 *
 * ── Why the ledger, and not a copy of its rules ───────────────────────────────────────────────
 *
 * Who may be charged for, the limit, what a treasurer is shown and the nothing an employer is shown are the ledger's
 * and ./groups.ts's, and the engine binds the same functions to its routes. A screen that filtered a member's lines
 * itself would be a second rule about somebody's privacy that could disagree with the first.
 *
 * ── What the preview opens ────────────────────────────────────────────────────────────────────
 *
 * packages/catalog/groups.json preview: a stokvel with three members, two of whom agreed and had a visit paid for, and
 * the preview's patient, who is invited and has not agreed — she is asked on her own screen, and when she agrees the
 * treasurer's screen in the same tab says so. Beside it an employer's group with fewer agreed employees than the floor,
 * for the treasurer's "see it as an employer" view. Every amount is a service's price from packages/catalog/services.json
 * through the ledger; the limit and the cap are Money's settings in force, read from lib/settings.ts.
 *
 * ── Module-level and in memory ────────────────────────────────────────────────────────────────
 *
 * Nothing in apps/web/src writes to the browser's storage, and a reload opens the preview afresh. No group exists, nobody
 * is invited and no account is charged. */

export const groupWords = groupsContract.screen;
export const noPooledMoney = groupsContract.noPooledMoney.statement;
export const employerWords = groupsContract.employer;
export const lineDetails = groupsContract.lineDetails;
const preview = groupsContract.preview;

const TREASURER = { role: 'sponsor', subjectRef: preview.adminRef };
const EMPLOYER = { role: 'employer', subjectRef: 'party-preview-employer' };
const MEMBER = preview.members.find(m => m.subjectRef === 'subj-preview-patient')!;
const PATIENT = { role: 'patient', subjectRef: MEMBER.subjectRef };
let keys = 0;
const key = () => `preview-group-${++keys}`;

type World = { ledger: Money; groupRef: string; employerGroupRef: string; names: Map<string, string>; membershipRef: string; payableRef: string | null; said: string | null; version: number };

/* Opens the preview through the same calls the routes make. A preview member who agrees has her visit charged to the
   group; the simulated provider may decline one, and the treasurer's screen then shows what the ledger says was paid. */
function open(): World {
 const ledger = createMoney({ simulation: true, groupMemberCap: groupMemberCapNow, groupMemberMonthlyLimitCents: groupMemberMonthlyLimitCentsNow });
 const opened = ledger.openGroup(TREASURER, { idempotencyKey: key(), groupKind: preview.groupKind });
 if (isRefusal(opened)) throw new Error(opened.statement);
 const names = new Map<string, string>();
 let membershipRef = '';
 let payableRef: string | null = null;
 for (const member of preview.members) {
  const invited = ledger.inviteMember(TREASURER, { idempotencyKey: key(), groupRef: opened.groupRef, subjectRef: member.subjectRef });
  if (isRefusal(invited)) throw new Error(invited.statement);
  names.set(invited.membershipRef, member.name);
  const payable = member.visitServiceId ? ledger.openVisitPayable({ payableRef: `PB-PREVIEW-GROUP-${member.name.toUpperCase()}`, serviceId: member.visitServiceId, subjectRef: member.subjectRef }) : null;
  if (member.subjectRef === MEMBER.subjectRef) { membershipRef = invited.membershipRef; payableRef = payable?.payableRef ?? null; continue; }
  if (!member.agrees || !member.lineDetail) continue;
  const who = { role: 'patient', subjectRef: member.subjectRef };
  ledger.acceptMembership(who, { idempotencyKey: key(), membershipRef: invited.membershipRef, lineDetail: member.lineDetail });
  if (payable) ledger.payFromGroup(who, { idempotencyKey: key(), groupRef: opened.groupRef, payableRef: payable.payableRef, method: groupsContract.pays.methods[0], amountCents: ledger.owed(payable.payableRef) });
 }
 const employer = ledger.openGroup(EMPLOYER, { idempotencyKey: key(), groupKind: 'employer' });
 if (isRefusal(employer)) throw new Error(employer.statement);
 for (let i = 0; i < groupsContract.preview.employerPreview.employees; i++) {
  const subjectRef = `subj-preview-employee-${i}`;
  const invited = ledger.inviteMember(EMPLOYER, { idempotencyKey: key(), groupRef: employer.groupRef, subjectRef });
  if (!isRefusal(invited)) ledger.acceptMembership({ role: 'patient', subjectRef }, { idempotencyKey: key(), membershipRef: invited.membershipRef, lineDetail: 'month-total-only' });
 }
 return { ledger, groupRef: opened.groupRef, employerGroupRef: employer.groupRef, names, membershipRef, payableRef, said: null, version: 0 };
}

let world: World | null = null;
const current = () => (world ??= open());
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const told = () => { const w = current(); world = { ...w, version: w.version + 1 }; for (const listener of listeners) listener(); };
const snapshot = () => current().version;

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
const stateOf = (id: MembershipState) => groupsContract.states.find(s => s.id === id)!;
const detailOf = (id: GroupLineDetail | null) => (id ? lineDetails.find(d => d.id === id)! : null);
const rand = (cents: number) => money(cents / 100);
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00+02:00`));

/* ---- The treasurer's screen ------------------------------------------------------------------ */

export type AdminRow = { membershipRef: string; name: string; stateName: string; stateWords: string; detail: string | null; detailId: GroupLineDetail | null; lines: { day: string; amount: string }[] };
export type AdminScreen = {
 employer: boolean; kindName: string;
 agreed: string | null; waiting: string | null; monthTotal: string | null;
 rows: AdminRow[];
};

function adminScreen(asEmployer: boolean): AdminScreen {
 const w = current();
 const actor = asEmployer ? EMPLOYER : TREASURER;
 const view = w.ledger.groupFor(actor, asEmployer ? w.employerGroupRef : w.groupRef);
 if (isRefusal(view)) throw new Error(view.statement);
 const shown = view as GroupView;
 return {
  employer: shown.groupKind === 'employer',
  kindName: groupsContract.kinds.find(k => k.id === shown.groupKind)!.name,
  agreed: shown.membersAgreed === null ? null : fill(groupWords.admin.agreed, { count: String(shown.membersAgreed) }),
  waiting: shown.invitationsWaiting === null ? null : fill(groupWords.admin.waiting, { count: String(shown.invitationsWaiting) }),
  monthTotal: shown.monthTotalCents === null ? null : rand(shown.monthTotalCents),
  rows: shown.members.map(m => ({
   membershipRef: m.membershipRef, name: w.names.get(m.membershipRef) ?? m.membershipRef,
   stateName: stateOf(m.stateCode).name, stateWords: stateOf(m.stateCode).adminWords,
   detail: detailOf(m.lineDetail)?.name ?? null, detailId: m.lineDetail,
   lines: m.lines.map(l => ({ day: dayOf(l.on), amount: rand(l.amountCents) }))
  }))
 };
}

export const useGroupAdmin = (asEmployer: boolean): AdminScreen => { useSyncExternalStore(subscribe, snapshot, snapshot); return adminScreen(asEmployer); };
/** The fewest agreed members an employer's figures are shown for, for the sentence beside a withheld total. */
export const employerFloor = EMPLOYER_FLOOR;

/* ---- The member's screen ----------------------------------------------------------------------- */

export type MemberScreen = {
 groupName: string; stateCode: MembershipState; words: string;
 offered: typeof lineDetails; chosen: GroupLineDetail | null;
 limit: string; owed: { service: string; amount: string } | null; said: string | null;
};

function memberScreen(): MemberScreen {
 const w = current();
 const mine = w.ledger.membershipsFor(PATIENT);
 if (isRefusal(mine)) throw new Error(mine.statement);
 const membership = mine.find(m => m.membershipRef === w.membershipRef)!;
 const kind = groupsContract.kinds.find(k => k.id === membership.groupKind)!;
 const owedCents = w.payableRef ? w.ledger.owed(w.payableRef) ?? 0 : 0;
 const values = { group: preview.groupName, limit: rand(membership.limitCents) };
 return {
  groupName: preview.groupName, stateCode: membership.stateCode, words: fill(stateOf(membership.stateCode).memberWords, values),
  offered: lineDetails.filter(d => kind.lineDetails.includes(d.id as GroupLineDetail) && lineDetailIds.includes(d.id as GroupLineDetail)),
  chosen: membership.lineDetail,
  limit: fill(groupWords.member.limit, values),
  owed: w.payableRef && owedCents > 0 ? { service: serviceById(MEMBER.visitServiceId!).name, amount: rand(owedCents) } : null,
  said: w.said
 };
}

export const useMembership = (): MemberScreen => { useSyncExternalStore(subscribe, snapshot, snapshot); return memberScreen(); };
export const groupName = preview.groupName;
export const say = (text: string) => fill(text, { group: preview.groupName });

/** She agrees, as herself, choosing how the treasurer's screen reads what the group pays for her. */
export function agree(lineDetail: GroupLineDetail) {
 const w = current();
 const answer = w.ledger.acceptMembership(PATIENT, { idempotencyKey: key(), membershipRef: w.membershipRef, lineDetail });
 world = { ...w, said: isRefusal(answer) ? answer.statement : null };
 told();
}

/** She asks the group to pay for the visit she owes, and is told what the ledger answered, in its words. */
export function payThroughGroup() {
 const w = current();
 if (!w.payableRef) return;
 const answer = w.ledger.payFromGroup(PATIENT, { idempotencyKey: key(), groupRef: w.groupRef, payableRef: w.payableRef, method: groupsContract.pays.methods[0], amountCents: w.ledger.owed(w.payableRef) ?? 0 });
 world = { ...w, said: isRefusal(answer) ? answer.statement : answer.stateCode === 'succeeded' ? say(groupWords.member.paid) : w.ledger.wordsFor(answer.stateCode).words };
 told();
}

export function leave() {
 const w = current();
 const answer = w.ledger.leaveGroup(PATIENT, { idempotencyKey: key(), membershipRef: w.membershipRef });
 world = { ...w, said: isRefusal(answer) ? answer.statement : null };
 told();
}
