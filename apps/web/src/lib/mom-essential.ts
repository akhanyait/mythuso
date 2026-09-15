import contract from '../../../../packages/catalog/mom-essential.json' with { type: 'json' };
import moneyApi from '../../../../packages/catalog/apis/money.json' with { type: 'json' };
import { createMoney, type Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { isRefusal, methods, stateOf as paymentStateOf } from '../../../../packages/engines/src/money/domain/contract.ts';
import type { LineDetail, SubscriptionView } from '../../../../packages/engines/src/money/domain/subscriptions.ts';
import { SUMMARY_DAYS_ALLOWED, grantSummaries, summariesShared, type SummaryGrant } from '../../../../packages/engines/src/access/domain/sharing.ts';
import { confirmBooking, emptyLedger, offeredSlots, requestBooking } from '../../../../packages/engines/src/access/domain/booking.ts';
import { zoneInAddress } from './booking';
import { nurseFor } from './arrival';
/* MyThuso for Mom Essential in the web preview: one journey, in the tab's memory, and every rule an engine's.
 *
 * The plan is asked for, agreed to and paid for through packages/engines/src/money/domain — the same ledger the Money
 * engine binds to POST /v1/money/plan-subscriptions@1 and the routes beside it — with the simulated provider standing
 * behind the payment-result door. The visit it includes is booked through packages/engines/src/access/domain/booking.ts,
 * accepted by the simulated roster, and heard by the ledger as Care's appointment.booked@2 would be. Whether the person
 * who pays reads the parent's visit summaries is packages/engines/src/access/domain/sharing.ts's, on a grant only she makes.
 *
 * BOTH PHONES ARE THIS TAB. The preview has no second device, so the reader acts as the son or daughter who pays and
 * then as the parent, and the screen says which. What each may do is still decided by who they are acting as: the
 * ledger refuses a sponsor who agrees, and the screen draws no control that would ask it to.
 *
 * Nothing is kept past the tab and nothing is real: no plan is sold, no debit order runs, no nurse is sent.
 */
export const essential = contract;
export const summaryDays = SUMMARY_DAYS_ALLOWED;
/** The ways a plan may be paid, by the name a person reads: packages/catalog/money.json's methods for a plan. */
export const planMethods = methods.filter(m => m.offered && m.for.includes('plan'));
export const stateWords = (id: string) => contract.states.find(s => s.id === id)!;
export const fill = (text: string, values: Readonly<Record<string, string>>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/** A route's refusal in its own words, for a screen that says why a control is not there. */
export function routeSentence(route: string, id: string): string {
 const found = moneyApi.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)?.refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/apis/money.json declares no refusal "${id}" on ${route}.`);
 return found.statement;
}

export type Who = { readonly role: 'sponsor' | 'patient'; readonly ref: string };
export type Journey = { ledger: Money; subscriptionRef: string | null; grants: SummaryGrant[]; attempt: number; bookings: number; planVoucher: string | null };
type Refused = { refused: string };

const PREVIEW_SHOP = 'party-preview-corner-shop';
const includedVisit = contract.included.find(i => i.heardOn === 'appointment.booked@2')!;

export const newJourney = (voucherExpiryYears: () => number): Journey =>
 ({ ledger: createMoney({ simulation: true, voucherExpiryYears }), subscriptionRef: null, grants: [], attempt: 0, bookings: 0, planVoucher: null });

export function view(j: Journey, who: Who): SubscriptionView | null {
 if (!j.subscriptionRef) return null;
 const answer = j.ledger.subscriptionFor({ role: who.role, subjectRef: who.ref }, j.subscriptionRef);
 return isRefusal(answer) ? null : answer;
}

export function ask(j: Journey, sponsorRef: string, parentRef: string): Refused | { refused?: undefined } {
 const answer = j.ledger.subscribe({ role: 'sponsor', subjectRef: sponsorRef }, { idempotencyKey: `ask:${parentRef}`, subjectRef: parentRef, planCode: contract.planCode });
 if (isRefusal(answer)) return { refused: answer.statement };
 j.subscriptionRef = answer.subscriptionRef;
 return {};
}

/** She agrees, says how his statement reads, and — only if she chooses — lets him read her visit summaries. */
export function agree(j: Journey, input: { parentRef: string; sponsorRef: string; lineDetail: LineDetail; shareSummaries: boolean; now?: Date }): Refused | { refused?: undefined } {
 if (!j.subscriptionRef) return { refused: routeSentence('POST /v1/money/plan-subscriptions/{subscriptionRef}/accept@1', 'subscription-not-found') };
 j.attempt += 1;
 const answer = j.ledger.acceptSubscription({ role: 'patient', subjectRef: input.parentRef }, { idempotencyKey: `agree:${j.attempt}`, subscriptionRef: j.subscriptionRef, lineDetail: input.lineDetail });
 if (isRefusal(answer)) return { refused: answer.statement };
 if (input.shareSummaries && !summariesShared(j.grants, input.parentRef, input.sponsorRef, input.now ?? new Date()).shared) {
  const given = grantSummaries({ byRef: input.parentRef, parentRef: input.parentRef, sponsorRef: input.sponsorRef, days: SUMMARY_DAYS_ALLOWED, now: input.now ?? new Date() });
  if (given.ok) j.grants = [...j.grants, given.grant];
 }
 return {};
}

export const summariesFor = (j: Journey, parentRef: string, sponsorRef: string, now = new Date()) => summariesShared(j.grants, parentRef, sponsorRef, now);

export type MonthPaid = Refused | { refused?: undefined; state: string; name: string; words: string; declineReason: string | null };

/** The first month, paid by the sponsor through the simulated provider, for what is still owed. */
export function payMonth(j: Journey, sponsorRef: string, methodId: string): MonthPaid {
 const v = view(j, { role: 'sponsor', ref: sponsorRef });
 if (!v?.payableRef) return { refused: routeSentence('POST /v1/money/payments@2', 'payable-not-found') };
 j.attempt += 1;
 const owed = j.ledger.owed(v.payableRef) ?? v.amountCents;
 const answer = j.ledger.pay({ role: 'sponsor', subjectRef: sponsorRef }, { idempotencyKey: `month:${j.attempt}`, payableRef: v.payableRef, method: methodId, amountCents: owed });
 if (isRefusal(answer)) return { refused: answer.statement };
 const state = paymentStateOf(answer.stateCode);
 return { state: answer.stateCode, name: state.name, words: state.words, declineReason: answer.declineReason ?? null };
}

/** The voucher a simulated shop issued towards this plan, issuing it the first time it is asked for. Its code, shown once. */
export function planVoucher(j: Journey): Refused | { refused?: undefined; code: string; expiresOn: string } {
 if (j.planVoucher) return { code: j.planVoucher, expiresOn: j.ledger.voucherHeld(j.planVoucher)?.expiresOn ?? '' };
 const issued = j.ledger.issueVoucher({ role: 'corner', subjectRef: PREVIEW_SHOP }, { idempotencyKey: 'preview-plan-voucher', towardsKind: 'plan', planCode: contract.planCode });
 if (isRefusal(issued)) return { refused: issued.statement };
 j.planVoucher = issued.voucherCode ?? null;
 return { code: issued.voucherCode ?? '', expiresOn: issued.expiresOn };
}

/** The first month, paid by the sponsor with the plan voucher: as much as it holds, up to what is owed. */
export function payWithPlanVoucher(j: Journey, sponsorRef: string): Refused | { refused?: undefined; owedCents: number } {
 const v = view(j, { role: 'sponsor', ref: sponsorRef });
 const voucher = planVoucher(j);
 if (voucher.refused !== undefined) return voucher;
 if (!v?.payableRef) return { refused: routeSentence('POST /v1/money/voucher-redemptions@1', 'payable-not-found') };
 j.attempt += 1;
 const owed = j.ledger.owed(v.payableRef) ?? 0;
 const held = j.ledger.voucherHeld(voucher.code);
 const answer = j.ledger.redeemVoucher({ role: 'sponsor', subjectRef: sponsorRef }, { idempotencyKey: `month-voucher:${j.attempt}`, voucherCode: voucher.code, payableRef: v.payableRef, amountCents: Math.min(held?.remainingCents ?? owed, owed) });
 return isRefusal(answer) ? { refused: answer.statement } : { owedCents: answer.owedCents };
}

/**
 * The month's included visit, as the parent: the first hour the booking rules offer for the included service, for
 * whoever is nearest, in her suburb. The simulated roster accepts it, and the ledger hears the appointment Care would
 * then hold — which is where Money decides it is the plan's visit rather than one owed at its own price.
 */
export function bookIncludedVisit(j: Journey, input: { parentRef: string; address: string; namedNurseFallback: string; now?: Date }): Refused | { refused?: undefined; date: string; start: string } {
 const now = input.now ?? new Date();
 const serviceId = includedVisit.serviceId!;
 const slot = offeredSlots({ now, serviceId, kind: 'scheduled', choice: { kind: 'nearest' }, holds: [], namedNurseFallback: input.namedNurseFallback })[0];
 const requested = requestBooking(emptyLedger,
  { idempotencyKey: `essential:${j.subscriptionRef}:${j.bookings}`, subjectRef: input.parentRef, serviceId, mode: 'home', slotRef: slot?.slotRef ?? 'never-offered', zoneId: zoneInAddress(input.address)?.id ?? '', actorRole: 'patient' },
  { now, candidates: [], namedNurseFallback: input.namedNurseFallback });
 if (requested.refused) return { refused: requested.statement };
 const accepted = confirmBooking(requested.value.ledger, requested.value.booking.bookingRef, now);
 if (accepted.refused) return { refused: accepted.statement };
 const heard = j.ledger.hear({
  type: 'appointment.booked', version: 2, occurredAt: now.toISOString(), subjectRef: input.parentRef,
  payload: { appointmentRef: `apt-${accepted.value.booking.bookingRef}`, clinicianRef: nurseFor(input.address).id, scheduledFor: accepted.value.booking.scheduledFor!, serviceId }
 });
 if (isRefusal(heard)) return { refused: heard.statement };
 j.bookings += 1;
 return { date: slot!.date!, start: slot!.start! };
}
