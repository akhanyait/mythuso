/**
 * MyThuso for Mom Essential as Money holds it: who asked, whether the parent agreed, whether the month is paid,
 * what the month includes and has used, and what a reader may see of it.
 *
 * ── The order, and why nothing is paid before she agrees ─────────────────────────────────────
 *
 * A plan is asked for, agreed to by the person it is for, and then paid for (packages/catalog/mom-essential.json
 * transitions). The first month's payable is not opened until she agrees, so there is nothing a sponsor could pay
 * for a plan the parent has not said yes to, and no refusal on the payment route is needed to stop it.
 *
 * ── What a sponsor sees, worked out rather than filtered afterwards ───────────────────────────
 *
 * A line is a day and, for the parent, what kind of care it was and which service. A sponsor is handed the day
 * alone unless she chose service-named (packages/catalog/programmes.json sponsor.lineDetail). No line ever has
 * a field for why or what was found, because Money is never told either: it hears appointment.booked@2, which
 * names a service, and delivery.handed_over@1, which names a collection and whether the seal held.
 *
 * ── Priority ─────────────────────────────────────────────────────────────────────────────────
 *
 * A subscription has no field that could rank anybody, and a request that asks for one is refused in
 * packages/catalog/mom-plans.json's own sentence. What priority SOS means is undecided, and nothing here
 * pretends otherwise.
 */
import contract from '../../../../catalog/mom-essential.json' with { type: 'json' };
import programmes from '../../../../catalog/programmes.json' with { type: 'json' };

export const essential = contract;
export type SubscriptionState = 'awaiting-parent' | 'awaiting-payment' | 'active';
export type LineDetail = 'amount-only' | 'service-named';
export type LineKind = 'visit' | 'collection';
export type PlanLine = { on: string; kindCode: LineKind; serviceId: string | null; reference: string; cancelled: boolean };

export type Subscription = {
 subscriptionRef: string;
 subjectRef: string;
 askedByRef: string; askedByRole: string; askedOn: string;
 planCode: string; amountCents: number;
 stateCode: SubscriptionState;
 lineDetail: LineDetail | null;
 payableRef: string | null;
 startedOn: string | null; monthEndsOn: string | null;
 lines: PlanLine[];
};

export type SubscriptionView = {
 stateCode: SubscriptionState; planCode: string; amountCents: number; payableRef: string | null;
 startedOn: string | null; monthEndsOn: string | null; lineDetail: LineDetail | null;
 included: { inclusionCode: string; allowed: number; used: number }[];
 lines: { on: string; kindCode: LineKind | null; serviceId: string | null }[];
};

export const lineDetails = programmes.sponsor.lineDetail.map(d => d.id) as LineDetail[];

type Included = { inclusionId: string; serviceId?: string; perPeriod: number | null; heardOn: string | null };
const INCLUDED = contract.included as Included[];
export const includedVisit = INCLUDED.find(i => i.heardOn === 'appointment.booked@2')!;
export const includedCollection = INCLUDED.find(i => i.heardOn === 'delivery.handed_over@1')!;
if (!includedVisit?.serviceId || !includedVisit.perPeriod || !includedCollection?.perPeriod) throw new Error('packages/catalog/mom-essential.json no longer says which visit and which collection a plan month includes, and how many.');

/* ---- Words in what a request sends ------------------------------------------------------------------ */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const names = (sent: readonly string[], list: readonly string[]) => sent.some(name => wordsOf(name).some(word => list.some(term => word.startsWith(term))));
/** Whether a request carries an agreement on somebody else's behalf. */
export const agreesForSomebody = (sent: readonly string[]) => names(sent, contract.agreement.fieldWords);
/** Whether a request asks for a place ahead of somebody. */
export const asksForPriority = (sent: readonly string[]) => names(sent, contract.priority.fieldWords);

/* ---- The month ------------------------------------------------------------------------------------ */

/** The last day of a plan month that started on `startedOn`: the day before the same day next month, or the last day of a shorter month. */
export function monthEndOf(startedOn: string): string {
 const [y, m, d] = startedOn.split('-').map(Number) as [number, number, number];
 const lastOfNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
 const next = new Date(Date.UTC(y, m, Math.min(d, lastOfNext)));
 next.setUTCDate(next.getUTCDate() - 1);
 return next.toISOString().slice(0, 10);
}

export const started = (sub: Subscription, on: string): Subscription => ({ ...sub, stateCode: 'active', startedOn: on, monthEndsOn: monthEndOf(on) });
const inMonth = (sub: Subscription, on: string) => sub.startedOn !== null && sub.monthEndsOn !== null && sub.startedOn <= on && on <= sub.monthEndsOn;
export const usedOf = (sub: Subscription, kind: LineKind, on: string) => sub.lines.filter(l => l.kindCode === kind && !l.cancelled && inMonth(sub, on) && inMonth(sub, l.on)).length;

/** Whether a visit of this service, on this day, is the month's included visit. */
export const includesVisit = (sub: Subscription | undefined, serviceId: string, on: string): sub is Subscription =>
 !!sub && sub.stateCode === 'active' && serviceId === includedVisit.serviceId && inMonth(sub, on) && usedOf(sub, 'visit', on) < includedVisit.perPeriod!;
/** Whether a collection handed over on this day is the month's included collection. */
export const includesCollection = (sub: Subscription | undefined, on: string): sub is Subscription =>
 !!sub && sub.stateCode === 'active' && inMonth(sub, on) && usedOf(sub, 'collection', on) < includedCollection.perPeriod!;

/**
 * A plan as one reader may see it. The parent sees every line as it happened; a sponsor sees the day, and what
 * kind of care and which service only while she has chosen service-named. `on` is today, which decides the month
 * the counts are for.
 */
export function viewOf(sub: Subscription, reader: 'parent' | 'sponsor', on: string): SubscriptionView {
 const named = reader === 'parent' || sub.lineDetail === 'service-named';
 return {
  stateCode: sub.stateCode, planCode: sub.planCode, amountCents: sub.amountCents, payableRef: sub.payableRef,
  startedOn: sub.startedOn, monthEndsOn: sub.monthEndsOn, lineDetail: sub.lineDetail,
  included: [
   { inclusionCode: includedVisit.inclusionId, allowed: includedVisit.perPeriod!, used: usedOf(sub, 'visit', on) },
   { inclusionCode: includedCollection.inclusionId, allowed: includedCollection.perPeriod!, used: usedOf(sub, 'collection', on) }
  ],
  lines: sub.lines.filter(l => !l.cancelled).map(l => ({ on: l.on, kindCode: named ? l.kindCode : null, serviceId: named ? l.serviceId : null }))
 };
}
