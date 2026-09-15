/**
 * Thuso Money on the engine runtime.
 *
 * ── What is bound, and what is left to the mock ──────────────────────────────────────────────
 *
 * Wave 3 builds payments, payouts and doctors' fees. Three routes are answered here: taking a payment
 * at versions one and two, and reading your payouts. Wallets, vouchers, gifts, groups, claims, Market
 * orders, the nurse's cash-code entry and the desk's release stay proposed and are answered by
 * packages/mock-api. Every rule lives in ./domain — this file only opens the ledger over the engine's
 * own store, hands it the bus and the simulated clock, and turns its answers into ok and refuse.
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
 * It never schedules a doctor's payout: the fee is undecided and the ledger refuses.
 */
import {
 defineEngine, ok, refuse,
 type EngineContext, type EngineStore, type EventKey, type HandlerRequest, type SubscriptionHandler
} from '../runtime/index.ts';
import { canonical, cardSpellings, isRefusal } from './domain/contract.ts';
import { createMoney, TABLE_NAMES, type MoneyTables, type Payout, type Table } from './domain/ledger.ts';
import { isoDateInSouthAfrica, paysOnFor } from './domain/payouts.ts';

const SQL_NAME: Record<typeof TABLE_NAMES[number], string> = {
 payables: 'payables', payments: 'payments', cashCodes: 'cash_codes', cashAudit: 'cash_audit', attempts: 'payment_attempts', keys: 'payment_keys',
 billable: 'billable_visits', earned: 'earned_lines', cases: 'signed_cases', payouts: 'payouts', suspensions: 'partner_suspensions'
};

/* Every table is a reference and a document. Money's rows are billing facts — a payable, an attempt,
   a week — and none of them is health information; the names above are the whole schema. The cash
   code table holds a salt and a digest, never a code. */
const schema = TABLE_NAMES.map(name => `CREATE TABLE IF NOT EXISTS ${SQL_NAME[name]} (ref TEXT PRIMARY KEY, doc TEXT NOT NULL);`).join('\n');

function storeTables(store: EngineStore): MoneyTables {
 const table = <T,>(name: string): Table<T> => ({
  get: key => { const row = store.prepare(`SELECT doc FROM ${name} WHERE ref = ?`).get(key) as { doc: string } | undefined; return row ? JSON.parse(row.doc) as T : undefined; },
  put: (key, value) => { store.prepare(`INSERT INTO ${name} (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc`).run(key, JSON.stringify(value)); },
  all: () => (store.prepare(`SELECT doc FROM ${name} ORDER BY rowid`).all() as { doc: string }[]).map(row => JSON.parse(row.doc) as T)
 });
 return Object.fromEntries(TABLE_NAMES.map(name => [name, table(SQL_NAME[name])])) as unknown as MoneyTables;
}

/* Everything Money publishes is billing, whoever or whatever caused it. */
const ledgerFor = (ctx: EngineContext) => createMoney({
 tables: storeTables(ctx.store),
 clock: () => ctx.clock.now(),
 simulation: true,
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
export const HEARD: readonly EventKey[] = ['appointment.booked@1', 'visit.billable@1', 'review.billable@1', 'booking.cancelled@1', 'appointment.cancelled@1', 'partner.suspended@1'];
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
  }
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
