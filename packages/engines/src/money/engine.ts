/**
 * Thuso Money on the engine runtime.
 *
 * ── What is bound, and what is left to the mock ──────────────────────────────────────────────
 *
 * Wave 3 builds payments, payouts and doctors' fees. Wave 5 builds vouchers, groups and claims. Wave 6 builds
 * gifts and Thuso Market orders. Wallets stay proposed and are answered by packages/mock-api. Every rule lives
 * in ./domain — this file only opens the ledger over the engine's own store, hands it the bus and the simulated
 * clock, and turns its answers into ok and refuse.
 *
 * ── The cash code, on the runtime ────────────────────────────────────────────────────────────
 *
 * A wrong code is refused, and a refusal rolls back everything its handler did. So the entry route opens
 * the ledger with its writes to cash_codes and cash_audit recorded through ctx.recordRefusal instead of
 * run: the runtime keeps them after the rollback for the two refusals the route's keptOnRefusal names, and
 * with everything else when the code is right. Without that, the count of wrong codes would be rolled back
 * with each one and the attempt limit would never bite. The code itself is compared with a salted digest
 * and goes nowhere: not into the audit, not onto the bus, and — because the route declares it a secret
 * request field — not into the digest of the request the runtime keeps for replays either.
 *
 * The desk's release is an ordinary write: it resets the hold and appends the audit row saying who, when
 * and why, and a refused release keeps nothing.
 *
 * ── A refund ─────────────────────────────────────────────────────────────────────────────────
 *
 * Money hears appointment.cancelled@1 and booking.cancelled@1 and sends a succeeded payment back through
 * the payment-result door; the reversal's answer publishes payment.refunded@1 once. There is no refund
 * route: nobody asks for a refund, a cancellation causes one.
 *
 * ── Why a payment has two versions ───────────────────────────────────────────────────────────
 *
 * Version one answers a payment reference and a state, which is all a card or EFT payment needs, and it
 * stays for them: nothing is wrong with it for the payments it can finish. Cash is different — the
 * patient needs the code the nurse will ask for, and version one has nowhere to carry it — so version
 * one refuses cash and names version two, whose answer carries the code to the caller who paid and to
 * nobody else. Answering cash on version one would book money owed with no way for the patient ever to
 * pay it.
 *
 * ── The week ─────────────────────────────────────────────────────────────────────────────────
 *
 * `tick` runs whenever the simulated clock moves. It closes every week that has ended and still has
 * unscheduled lines — not only the last one, so a week the runtime slept through is still paid — sends
 * a closed week to the simulated bank on its paysOn, and sends a returned week again with the next run.
 * It never schedules a doctor's payout. That is asked of the ledger, which refuses it at a fee nobody
 * has confirmed.
 *
 * ── Settings ─────────────────────────────────────────────────────────────────────────────────
 *
 * GET /v1/money/settings@1 and POST /v1/money/setting-changes@1, through packages/engines/src/settings,
 * with the history in this store's settings_history: MyThuso for Mom's names and terms, the doctor's fee
 * and whether it is confirmed, and a nurse's share sentence. The ledger is handed the fee in force from
 * that history whenever it hears a signed case or is asked for a payout, and writes it onto the case, so
 * a change reaches cases signed after it and never one already signed. No Money setting waits on a
 * clinical review, so no review route is bound.
 */
import {
 defineEngine, ok, refuse,
 type EngineContext, type EngineStore, type EventKey, type HandlerRequest, type SubscriptionHandler
} from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { canonical, cardSpellings, isRefusal } from './domain/contract.ts';
import { createMoney, TABLE_NAMES, type MoneyTables, type Payout, type Table } from './domain/ledger.ts';
import { isoDateInSouthAfrica, paysOnFor } from './domain/payouts.ts';
import { claimConsentDaysOf, doctorFeeOf, groupMemberCapOf, groupMemberMonthlyLimitCentsOf, moneySettings, voucherExpiryYearsOf } from './domain/settings.ts';

const SQL_NAME: Record<typeof TABLE_NAMES[number], string> = {
 payables: 'payables', payments: 'payments', cashCodes: 'cash_codes', cashAudit: 'cash_audit', attempts: 'payment_attempts', keys: 'payment_keys',
 billable: 'billable_visits', earned: 'earned_lines', cases: 'signed_cases', payouts: 'payouts', suspensions: 'partner_suspensions',
 vouchers: 'vouchers', redemptions: 'voucher_redemptions', subscriptions: 'plan_subscriptions', acts: 'act_keys',
 groups: 'payer_groups', memberships: 'group_memberships', groupCharges: 'group_charges', reviews: 'heard_reviews', claims: 'claims',
 gifts: 'gifts', marketOrders: 'market_orders'
};

/* Every table is a reference and a document. Money's rows are billing facts — a payable, an attempt,
   a week — and none of them is health information; the names above are the whole schema. The cash
   code table holds a salt and a digest, never a code. */
const schema = [...TABLE_NAMES.map(name => `CREATE TABLE IF NOT EXISTS ${SQL_NAME[name]} (ref TEXT PRIMARY KEY, doc TEXT NOT NULL);`), SETTINGS_SCHEMA].join('\n');

/* The two tables a refused cash-code entry keeps, and the only two the entry route's keptOnRefusal names. */
const KEPT_ON_A_WRONG_CODE = new Set([SQL_NAME.cashCodes, SQL_NAME.cashAudit]);

/* `record`, when given, is where a put into a kept table goes instead of the store. See the header. */
function storeTables(store: EngineStore, record?: EngineContext['recordRefusal']): MoneyTables {
 const table = <T,>(name: string): Table<T> => ({
  get: key => { const row = store.prepare(`SELECT doc FROM ${name} WHERE ref = ?`).get(key) as { doc: string } | undefined; return row ? JSON.parse(row.doc) as T : undefined; },
  put: (key, value) => {
   const sql = `INSERT INTO ${name} (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc`;
   if (record && KEPT_ON_A_WRONG_CODE.has(name)) record(sql, key, JSON.stringify(value));
   else store.prepare(sql).run(key, JSON.stringify(value));
  },
  all: () => (store.prepare(`SELECT doc FROM ${name} ORDER BY rowid`).all() as { doc: string }[]).map(row => JSON.parse(row.doc) as T)
 });
 return Object.fromEntries(TABLE_NAMES.map(name => [name, table(SQL_NAME[name])])) as unknown as MoneyTables;
}

/* Everything Money publishes is billing, whoever or whatever caused it. */
const ledgerFor = (ctx: EngineContext, keepsAttempts = false) => createMoney({
 tables: storeTables(ctx.store, keepsAttempts ? (sql, ...params) => ctx.recordRefusal(sql, ...params) : undefined),
 clock: () => ctx.clock.now(),
 simulation: true,
 doctorFee: () => doctorFeeOf(settingsIn(moneySettings, ctx.store)),
 voucherExpiryYears: () => voucherExpiryYearsOf(settingsIn(moneySettings, ctx.store)),
 groupMemberMonthlyLimitCents: () => groupMemberMonthlyLimitCentsOf(settingsIn(moneySettings, ctx.store)),
 groupMemberCap: () => groupMemberCapOf(settingsIn(moneySettings, ctx.store)),
 claimConsentDays: () => claimConsentDaysOf(settingsIn(moneySettings, ctx.store)),
 publish: (key, payload, subjectRef) => { ctx.publish(key as EventKey, payload, { subjectRef, purposeOfUse: 'billing' }); }
});

/* A payout as the route answers it: a visit line names its service and never an amount. */
const shown = (payout: Payout) => ({
 payoutRef: payout.payoutRef, periodEnd: payout.periodEnd, state: payout.state, totalCents: payout.totalCents,
 lineCount: payout.lines.length,
 lines: payout.lines.map(line => 'serviceId' in line
  ? { kind: line.kind, reference: line.reference, serviceId: line.serviceId }
  : { kind: line.kind, reference: line.reference, amountCents: line.amountCents, reason: line.reason }),
 ...(payout.failureReason ? { failureReason: payout.failureReason } : {})
});

/* The billable state changes Money needs for Wave 3, each on its moneyHears list. A refusal from the
   ledger is thrown, so the runtime rolls the delivery back and writes it to the trail by name. */
export const HEARD: readonly EventKey[] = ['appointment.booked@2', 'visit.billable@1', 'review.billable@1', 'booking.confirmed@2', 'booking.cancelled@1', 'appointment.cancelled@1', 'partner.suspended@1', 'delivery.handed_over@1'];

/* The caller as the ledger knows one: a role and the reference the runtime admitted, never a field. */
const actorOf = (ctx: EngineContext) => ({ role: ctx.caller.role, subjectRef: ctx.caller.ref ?? '' });
const onEvent: SubscriptionHandler = (event, ctx) => {
 const heard = ledgerFor(ctx).hear({ type: event.type, version: event.version, occurredAt: event.occurredAt, subjectRef: event.subjectRef, payload: { ...event.payload } });
 if (isRefusal(heard)) throw new Error(`${heard.id}: ${heard.statement}`);
};

/* The part both versions share. `withCode` is version two's: the code travels only in that answer, and
   only to the caller who made the payment. */
function takePayment(request: HandlerRequest, ctx: EngineContext, withCode: boolean) {
 if (request.undeclared.some(name => cardSpellings.has(canonical(name)))) return refuse('card-number-sent');
 if (!withCode && request.fields['method'] === 'cash-otp') return refuse('cash-needs-version-2');
 const payer = ctx.caller.ref ?? '';
 const answer = ledgerFor(ctx).pay({ role: ctx.caller.role, subjectRef: payer }, { ...request.fields });
 if (isRefusal(answer)) return refuse(answer.id);
 const body: Record<string, unknown> = { paymentRef: answer.paymentRef, stateCode: answer.stateCode };
 if (withCode && answer.cashCode !== undefined && payer) body['cashCode'] = answer.cashCode;
 return ok(body);
}

export const engine = defineEngine({
 id: 'money',
 store: { schema },
 routes: {
  'POST /v1/money/payments@1': (request, ctx) => takePayment(request, ctx, false),
  'POST /v1/money/payments@2': (request, ctx) => takePayment(request, ctx, true),
  'GET /v1/money/payouts@1': (request, ctx) => {
   const periodEnd = typeof request.fields['periodEnd'] === 'string' ? request.fields['periodEnd'] : undefined;
   const answer = ledgerFor(ctx).payoutsFor({ role: ctx.caller.role, subjectRef: ctx.caller.ref ?? '' }, periodEnd);
   if (isRefusal(answer)) return refuse(answer.id);
   return ok({ payouts: answer.map(shown) });
  },
  'POST /v1/money/payments/{paymentRef}/cash-code@2': (request, ctx) => {
   const answer = ledgerFor(ctx, true).enterCashCode({ role: ctx.caller.role, subjectRef: ctx.caller.ref ?? '' }, { paymentRef: String(request.fields['paymentRef']), code: String(request.fields['code']) });
   return isRefusal(answer) ? refuse(answer.id) : ok({ stateCode: answer.stateCode });
  },
  'POST /v1/money/payments/{paymentRef}/release@2': (request, ctx) => {
   const reasonCode = typeof request.fields['reasonCode'] === 'string' ? request.fields['reasonCode'] : undefined;
   const answer = ledgerFor(ctx).releaseCashCode({ role: ctx.caller.role, subjectRef: ctx.caller.ref ?? '' }, { paymentRef: String(request.fields['paymentRef']), reasonCode });
   return isRefusal(answer) ? refuse(answer.id) : ok({ stateCode: answer.stateCode });
  },
  /* Vouchers. The code is in the issuing answer only; the route declares it a secret response field, so the
     runtime's replay table never holds it, and a redemption's code is a secret request field for the same reason.
     The names of undeclared fields are handed to the ledger, which refuses a request tied to a medicine or asking
     for cash by them rather than dropping them. */
  'POST /v1/money/vouchers@2': (request, ctx) => {
   const answer = ledgerFor(ctx).issueVoucher(actorOf(ctx), { ...request.fields }, request.undeclared);
   if (isRefusal(answer)) return refuse(answer.id);
   return ok({ voucherRef: answer.voucherRef, voucherCode: answer.voucherCode, issuedCents: answer.issuedCents, expiresOn: answer.expiresOn });
  },
  'POST /v1/money/voucher-redemptions@1': (request, ctx) => {
   const answer = ledgerFor(ctx).redeemVoucher(actorOf(ctx), { ...request.fields }, request.undeclared);
   if (isRefusal(answer)) return refuse(answer.id);
   return ok({ redemptionRef: answer.redemptionRef, redeemedCents: answer.redeemedCents, remainingCents: answer.remainingCents, owedCents: answer.owedCents, expiresOn: answer.expiresOn });
  },

  /* Gifts. Made out to one named beneficiary from the moment they are given, never a bearer code, so there is no
     redemption route: the names of undeclared fields go to the ledger, which refuses an appointment, a booking or
     her agreement sent in the same breath as the gift, rather than dropping them. */
  'POST /v1/money/gifts@1': (request, ctx) => {
   const answer = ledgerFor(ctx).giftAVisit(actorOf(ctx), { ...request.fields }, request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ giftRef: answer.giftRef });
  },

  /* Thuso Market orders. Refused as medicine-in-shop on a scheduled or a listed product before anything is keyed;
     paid for through the existing payments route, against the payable this opens. */
  'POST /v1/money/market-orders@1': (request, ctx) => {
   const answer = ledgerFor(ctx).placeMarketOrder(actorOf(ctx), { ...request.fields });
   return isRefusal(answer) ? refuse(answer.id) : ok({ marketOrderRef: answer.marketOrderRef, totalCents: answer.totalCents });
  },

  /* MyThuso for Mom Essential. Asked for, agreed to by the person it is for, read by her and by whoever asked. */
  'POST /v1/money/plan-subscriptions@1': (request, ctx) => {
   const answer = ledgerFor(ctx).subscribe(actorOf(ctx), { ...request.fields }, request.undeclared);
   if (isRefusal(answer)) return refuse(answer.id);
   return ok({ subscriptionRef: answer.subscriptionRef, stateCode: answer.stateCode, amountCents: answer.amountCents });
  },
  'POST /v1/money/plan-subscriptions/{subscriptionRef}/accept@1': (request, ctx) => {
   const answer = ledgerFor(ctx).acceptSubscription(actorOf(ctx), { ...request.fields });
   if (isRefusal(answer)) return refuse(answer.id);
   return ok({ stateCode: answer.stateCode, payableRef: answer.payableRef, lineDetail: answer.lineDetail });
  },
  'GET /v1/money/plan-subscriptions/{subscriptionRef}@1': (request, ctx) => {
   const answer = ledgerFor(ctx).subscriptionFor(actorOf(ctx), String(request.fields['subscriptionRef']));
   if (isRefusal(answer)) return refuse(answer.id);
   /* What has not happened yet is left out rather than sent as null: the payable before she agrees, the month before
      it is paid, and her choice before she makes it. The route declares them optional for that reason. */
   const { payableRef, startedOn, monthEndsOn, lineDetail, ...always } = answer;
   return ok({
    ...always, included: answer.included.map(i => ({ ...i })), lines: answer.lines.map(l => ({ ...l })),
    ...(payableRef ? { payableRef } : {}), ...(startedOn ? { startedOn } : {}), ...(monthEndsOn ? { monthEndsOn } : {}), ...(lineDetail ? { lineDetail } : {})
   });
  },

  /* Group payers. A group is opened, invites, and is charged for one member's payable when she asks; it holds nothing.
     The names of undeclared fields go to the ledger, which refuses a pool, a deposit or an agreement made for somebody
     by them rather than dropping them. A card number is refused by name before the ledger sees the request, as a
     payment is. */
  'POST /v1/money/groups@2': (request, ctx) => {
   const answer = ledgerFor(ctx).openGroup(actorOf(ctx), { ...request.fields }, request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ groupRef: answer.groupRef, groupKind: answer.groupKind });
  },
  'POST /v1/money/group-memberships@1': (request, ctx) => {
   const answer = ledgerFor(ctx).inviteMember(actorOf(ctx), { ...request.fields }, request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ membershipRef: answer.membershipRef, stateCode: answer.stateCode });
  },
  'POST /v1/money/group-memberships/{membershipRef}/accept@1': (request, ctx) => {
   const answer = ledgerFor(ctx).acceptMembership(actorOf(ctx), { ...request.fields });
   return isRefusal(answer) ? refuse(answer.id) : ok({ stateCode: answer.stateCode, lineDetail: answer.lineDetail });
  },
  'POST /v1/money/group-memberships/{membershipRef}/leave@1': (request, ctx) => {
   const answer = ledgerFor(ctx).leaveGroup(actorOf(ctx), { ...request.fields });
   return isRefusal(answer) ? refuse(answer.id) : ok({ stateCode: answer.stateCode });
  },
  'POST /v1/money/group-payments@1': (request, ctx) => {
   if (request.undeclared.some(name => cardSpellings.has(canonical(name)))) return refuse('card-number-sent');
   const answer = ledgerFor(ctx).payFromGroup(actorOf(ctx), { ...request.fields }, request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ paymentRef: answer.paymentRef, stateCode: answer.stateCode });
  },
  /* What an employer is not shown is left out rather than sent as null: the route declares the three figures optional
     for exactly that reason, and members is empty for an employer always. */
  'GET /v1/money/groups/{groupRef}@1': (request, ctx) => {
   const answer = ledgerFor(ctx).groupFor(actorOf(ctx), String(request.fields['groupRef']), request.undeclared);
   if (isRefusal(answer)) return refuse(answer.id);
   const { membersAgreed, invitationsWaiting, monthTotalCents } = answer;
   return ok({
    groupKind: answer.groupKind, members: answer.members.map(m => ({ ...m, lines: m.lines.map(l => ({ ...l })) })),
    ...(membersAgreed !== null ? { membersAgreed } : {}), ...(invitationsWaiting !== null ? { invitationsWaiting } : {}), ...(monthTotalCents !== null ? { monthTotalCents } : {})
   });
  },
  'GET /v1/money/group-memberships@1': (request, ctx) => {
   const answer = ledgerFor(ctx).membershipsFor(actorOf(ctx), request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ memberships: answer.map(m => ({ ...m })) });
  },

  /* Claims. Drafted by the doctor who signed, agreed to by the patient, and stopped at the switching partner: the submit
     route has no answer but a refusal while no partner is connected, and no code set is adopted. */
  'POST /v1/money/claims@3': (request, ctx) => {
   const answer = ledgerFor(ctx).draftClaim(actorOf(ctx), { ...request.fields }, request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ claimRef: answer.claimRef, stateCode: answer.stateCode, codeSetAdopted: answer.codeSetAdopted });
  },
  'POST /v1/money/claims/{claimRef}/consent@1': (request, ctx) => {
   const answer = ledgerFor(ctx).consentToClaim(actorOf(ctx), { ...request.fields }, request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ stateCode: answer.stateCode, consentExpiresOn: answer.consentExpiresOn });
  },
  'POST /v1/money/claims/{claimRef}/submit@1': (request, ctx) => refuse(ledgerFor(ctx).submitClaim(actorOf(ctx), { ...request.fields }).id),
  'GET /v1/money/claims@1': (request, ctx) => {
   const answer = ledgerFor(ctx).claimsFor(actorOf(ctx), request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ claims: answer.map(c => ({ ...c })) });
  },

  /* The desk's list of held cash payments, which the web desk has drawn from its own ledger since Wave 3. */
  'GET /v1/money/held-cash-payments@1': (request, ctx) => {
   const answer = ledgerFor(ctx).heldCashList(actorOf(ctx), request.undeclared);
   return isRefusal(answer) ? refuse(answer.id) : ok({ payments: answer.map(p => ({ ...p })) });
  },

  ...settingsRoutes(moneySettings, { read: 'GET /v1/money/settings@1', change: 'POST /v1/money/setting-changes@1' })
 },
 subscriptions: Object.fromEntries(HEARD.map(key => [key, onEvent])),
 tick: ctx => {
  const money = ledgerFor(ctx);
  const now = ctx.clock.now();
  const today = isoDateInSouthAfrica(now);
  money.scheduleClosedWeeks(now);
  for (const payout of money.allPayouts()) {
   const due = payout.state === 'closed' ? paysOnFor(payout.periodEnd) <= today
    : payout.state === 'failed' ? paysOnFor(payout.ranOn ?? payout.periodEnd) <= today
     : payout.state === 'in-transit' ? (payout.ranOn ?? '') < today : false;
   if (due) money.runPayout(payout.payoutRef, payout.partyRef);
  }
 }
});
