/**
 * Thuso Money's ledger: payables, payments, cash, payouts and doctors' fees.
 *
 * ── What it is, and what it is not ───────────────────────────────────────────────────────────
 *
 * Pure, zero-dependency and synchronous, over a storage port: memory tables for node:test and the
 * web preview, and the engine's own SQLite store on the runtime (engine.ts). Every row goes through
 * `put` as a whole document, so the two stores behave the same way — nothing mutated in place
 * survives unless it was written, which is what a rolled-back transaction needs to be true.
 *
 * It holds no card number, contacts no bank and moves no money. A payment's result arrives only
 * through the payment-result door and a payout's through the payout-advice door; both are locked, and
 * in development the simulated provider in provider.ts stands behind them in process. `simulation:
 * false` is what a deployed engine would run with today, and in it nothing is ever paid, because
 * nothing can arrive.
 *
 * ── The refusals, in the order they are asked ────────────────────────────────────────────────
 *
 * A card number is refused before anything else looks at the request, so it is never stored under
 * an idempotency key or echoed in a refusal. Then the key: nothing is charged without one, the same
 * key with the same payment is the same answer, and the same key with a different payment is
 * refused rather than guessed at. Only then the payable — whose amount is the catalogue's, whose
 * owner is somebody, which has a price at all, and which is not paid twice.
 *
 * A scheme or an employer asking for a person's payments is refused. Money hears only the events on
 * its list, and an event carrying a reference into the record is refused even when its type is
 * listed. A suspension is not something Money hears at all.
 */
import {
 canonical, currency, doorIsLocked, doorOf, earningsContract, feeByCode, heardEvent, isRecordReference,
 isRefusal, methodById, money, outcomeOf, planPriceRand, refusal, serviceById, stateOf,
 type MethodId, type PayableKind, type PaymentStateId, type Published, type Refusal
} from './contract.ts';
import { advise, attempt, reversal, type PaymentResultPayload, type PayoutAdvicePayload } from './provider.ts';
import { isoDateInSouthAfrica, periodEndFor, recompute, totalCents, type PayoutLine, type RecomputeReason } from './payouts.ts';
import { doctorOwedCents, type DoctorCase, type FeeInForce } from './fees.ts';
import { carriesACard } from './cards.ts';
import { cashCodeDigest, randomDigits, randomSalt, sameDigest } from './secrets.ts';

export { carriesACard };

export type Actor = { role: string; subjectRef: string };

export type Payable = {
 payableRef: string; kind: PayableKind;
 /** The catalogue's price for the service, from the moment appointment.booked@2 opens the payable. Null only for a payable a store opened under the booked event's first version, which named no service and is withdrawn, until visit.billable@1 names the service. */
 amountCents: number | null;
 subjectRef: string; payers: string[];
 serviceId?: string; planId?: string; tierId?: string; appointmentRef?: string; bookingRef?: string; cancelled: boolean;
};

export type Payment = {
 paymentRef: string; payableRef: string; method: MethodId; amountCents: number; stateCode: PaymentStateId;
 settled: boolean; attempt: number; declineReason?: string; providerReference?: string;
 /** Who made the payment: the one caller a cash code is ever shown to. */
 paidByRef?: string;
};

export type Receipt = {
 paymentRef: string; payableRef: string; stateCode: PaymentStateId; method: MethodId; amountCents: number;
 attempt: number; replayed: boolean; declineReason?: string; providerReference?: string;
 /** On the first answer only, to the person who pays in cash, and to nobody else. */
 cashCode?: string;
 /** On a replayed cash payment: the code was shown with the first answer and is not kept to show again. */
 cashCodeAlreadyShown?: boolean;
};

export type PayoutState = 'closed' | 'in-transit' | 'paid' | 'failed';
export type Payout = {
 payoutRef: string; partyRef: string; periodEnd: string; lines: PayoutLine[]; totalCents: number; state: PayoutState;
 failureReason?: string; ranOn?: string;
};

export type EarnedLine = { line: PayoutLine; on: string; payoutRef?: string };
export type Emitted = { type: string; version: number; payload: Record<string, unknown> };
export type HeardEnvelope = { type: string; version: number; occurredAt?: string; subjectRef?: string; payload: Record<string, unknown> };
export type Origin = 'simulated-provider' | 'network';

/** What Money keeps for a cash code: never the code. */
export type CashCodeRow = { salt: string; digest: string; wrongAttempts: number; held: boolean };
/** One line of the cash audit: who tried, when, and what happened — never what was entered. A release also says why, as one of money.json's reason codes. */
export type CashAuditRow = { paymentRef: string; at: string; actorRole: string; actorRef: string; outcome: 'wrong' | 'held' | 'refused-while-held' | 'accepted' | 'released'; reasonCode?: string };

/* ---- The storage port ----------------------------------------------------------------------- */

export type Table<T> = { get(key: string): T | undefined; put(key: string, value: T): void; all(): T[] };
export type MoneyTables = {
 payables: Table<Payable>;
 payments: Table<Payment>;
 cashCodes: Table<CashCodeRow>;
 cashAudit: Table<CashAuditRow>;
 attempts: Table<{ n: number }>;
 keys: Table<{ print: string; receipt: Receipt }>;
 billable: Table<{ appointmentRef: string; serviceId: string; clinicianRef: string; on: string }>;
 earned: Table<{ partyRef: string; lines: EarnedLine[] }>;
 cases: Table<{ doctorRef: string; cases: DoctorCase[] }>;
 payouts: Table<Payout>;
 suspensions: Table<{ partnerKind: string; reasonCode: string; on: string }>;
};
export const TABLE_NAMES = ['payables', 'payments', 'cashCodes', 'cashAudit', 'attempts', 'keys', 'billable', 'earned', 'cases', 'payouts', 'suspensions'] as const;

/** Tables in memory, written as JSON so they behave as a store does: a row is what was last put. */
export function memoryTables(): MoneyTables {
 const table = <T,>(): Table<T> => {
  const rows = new Map<string, string>();
  return {
   get: key => { const row = rows.get(key); return row === undefined ? undefined : JSON.parse(row) as T; },
   put: (key, value) => { rows.set(key, JSON.stringify(value)); },
   all: () => [...rows.values()].map(row => JSON.parse(row) as T)
  };
 };
 return Object.fromEntries(TABLE_NAMES.map(name => [name, table()])) as unknown as MoneyTables;
}

export type MoneyOptions = {
 clock?: () => Date;
 /** Whether the simulated provider stands behind the doors. Development only. */
 simulation?: boolean;
 /* The doctor's fee in force, asked when a case is heard and when a payout is scheduled. Handed in by
    whoever holds Money's settings history — the engine's store, or the web preview's memory — rather than
    imported, so this file never holds a settings history of its own and a patient's payment step, which
    runs this ledger too, carries no settings code. Without one, no fee is in force and none is paid. */
 doctorFee?: () => FeeInForce;
 tables?: MoneyTables;
 /** Where an event goes. The engine hands in the bus; without it, events wait in outbox(). */
 publish?: (key: Published, payload: Record<string, unknown>, subjectRef: string) => void;
};

const PAYMENT_CALLERS = ['patient', 'caregiver', 'sponsor'];
const PAYOUT_CALLERS = ['nurse', 'locum', 'doctor'];
/* The roles served in aggregate. A person's payment is never theirs to read. */
const AGGREGATE_ROLES = ['scheme', 'employer', 'medical-scheme', 'insurer'];
/* The desk that releases a cash payment held for too many wrong codes: the ops-desk caller packages/catalog/apis.json
   names. The vetting register holds no capability for releasing a hold, so none is asked and no other role is
   widened to stand in for the desk. */
const CASH_DESK_ROLES = ['ops-desk'];
/* The only reasons a hold is lifted for, from packages/catalog/money.json. */
const releaseReasonIds = new Set(money.cash.releaseReasons.map(r => r.id));

/* The same act, by content: the payable, the method and the amount. */
const fingerprint = (request: Record<string, unknown>) =>
 JSON.stringify({ payableRef: request['payableRef'], method: request['method'], amountCents: request['amountCents'] });

/** Money's own payable for a booked visit. The appointment is Care's; the payable is Money's. */
export const payableRefFor = (appointmentRef: string) => `PB-${appointmentRef}`;

/* The day a line's date falls on, at noon in Johannesburg, so its week is the week it happened in. */
const weekOf = (isoDate: string) => periodEndFor(new Date(`${isoDate}T12:00:00+02:00`));

export function createMoney(options: MoneyOptions = {}) {
 const clock = options.clock ?? (() => new Date());
 const simulation = options.simulation ?? false;
 const feeNow = (): FeeInForce | null => options.doctorFee?.() ?? null;
 const t = options.tables ?? memoryTables();
 const outbox: Emitted[] = [];

 const emit = (key: Published, payload: Record<string, unknown>, subjectRef: string) => {
  if (options.publish) return options.publish(key, payload, subjectRef);
  const [type, version] = key.split('@');
  outbox.push({ type: type!, version: Number(version), payload });
 };
 const today = () => isoDateInSouthAfrica(clock());

 /* ---- Payables ---------------------------------------------------------------------------- */

 function openVisitPayable(input: { payableRef: string; serviceId: string; subjectRef: string; payers?: string[]; appointmentRef?: string; bookingRef?: string }): Payable {
  const existing = t.payables.get(input.payableRef);
  if (existing) return existing;
  const payable: Payable = {
   payableRef: input.payableRef, kind: 'visit', amountCents: serviceById(input.serviceId).price * 100,
   subjectRef: input.subjectRef, payers: input.payers ?? [], serviceId: input.serviceId,
   appointmentRef: input.appointmentRef, bookingRef: input.bookingRef, cancelled: false
  };
  t.payables.put(payable.payableRef, payable);
  return payable;
 }

 function openPlanPayable(input: { payableRef: string; planId: string; tierId?: string; subjectRef: string; payers?: string[] }): Payable | Refusal {
  const existing = t.payables.get(input.payableRef);
  if (existing) return existing;
  /* A plan with no price — Thuso Recover, or a tier nobody named — is not something anybody owes. */
  const price = planPriceRand(input.planId, input.tierId);
  if (price === null) return refusal('payable-not-found');
  const payable: Payable = { payableRef: input.payableRef, kind: 'plan', amountCents: price * 100, subjectRef: input.subjectRef, payers: input.payers ?? [], planId: input.planId, tierId: input.tierId, cancelled: false };
  t.payables.put(payable.payableRef, payable);
  return payable;
 }

 /* ---- Paying ------------------------------------------------------------------------------ */

 function pay(actor: Actor, request: Record<string, unknown>): Receipt | Refusal {
  /* First, before the request is stored, keyed, compared or echoed anywhere. */
  if (carriesACard(request)) return refusal('card-number-sent');
  if (!PAYMENT_CALLERS.includes(actor.role) || !actor.subjectRef) return refusal('caller-not-allowed');
  const idempotencyKey = request['idempotencyKey'];
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return refusal('charge-without-a-key');
  const { payableRef, method, amountCents } = request;
  if (typeof payableRef !== 'string' || typeof method !== 'string' || typeof amountCents !== 'number') return refusal('required-field-missing');

  /* Keyed per caller, so one person's key can never replay another person's payment. A replayed cash
     payment does not show its code again: the code was shown with the first answer, and showing it
     twice would mean keeping it. */
  const scoped = `${actor.subjectRef}:${idempotencyKey}`;
  const prior = t.keys.get(scoped);
  if (prior) {
   if (prior.print !== fingerprint(request)) return refusal('idempotency-key-reused');
   return { ...prior.receipt, replayed: true, ...(prior.receipt.method === 'cash-otp' ? { cashCodeAlreadyShown: true } : {}) };
  }

  const payable = t.payables.get(payableRef);
  if (!payable || payable.cancelled) return refusal('payable-not-found');
  if (payable.subjectRef !== actor.subjectRef && !payable.payers.includes(actor.subjectRef)) return refusal('someone-elses-payable');
  if (payable.amountCents === null) return refusal('payable-not-priced');
  const chosen = methodById(method);
  if (!chosen || !chosen.offered || !chosen.for.includes(payable.kind)) return refusal('method-not-offered');
  if (!Number.isInteger(amountCents) || amountCents !== payable.amountCents) return refusal('amount-mismatch');
  const onThisPayable = t.payments.all().filter(p => p.payableRef === payableRef);
  if (onThisPayable.some(p => p.stateCode === 'succeeded')) return refusal('already-paid');
  /* A cash payment already waiting on its code is the same payment, not a second one. */
  if (method === 'cash-otp' && onThisPayable.some(p => p.method === 'cash-otp' && p.stateCode === 'pending')) return refusal('already-paid');

  const n = (t.attempts.get(payableRef)?.n ?? 0) + 1;
  t.attempts.put(payableRef, { n });
  let payment: Payment = { paymentRef: `PAY-${payableRef}-${n}`, payableRef, method: chosen.id, amountCents, stateCode: 'pending', settled: false, attempt: n, paidByRef: actor.subjectRef };
  t.payments.put(payment.paymentRef, payment);

  let cashCode: string | undefined;
  if (chosen.id === 'cash-otp') {
   /* Random, and derived from nothing a person can see. Only the salt and the digest are kept. */
   cashCode = randomDigits(money.cash.codeLength);
   const salt = randomSalt();
   t.cashCodes.put(payment.paymentRef, { salt, digest: cashCodeDigest(salt, cashCode), wrongAttempts: 0, held: false });
  } else if (simulation) {
   /* The provider answers through the door like any supplier would; nothing here sets a state. */
   acceptPaymentResult(attempt(payableRef, n, payment.paymentRef, amountCents, clock()), 'simulated-provider');
   payment = t.payments.get(payment.paymentRef)!;
  }
  const receipt: Receipt = {
   paymentRef: payment.paymentRef, payableRef, stateCode: payment.stateCode, method: payment.method, amountCents,
   attempt: n, replayed: false, declineReason: payment.declineReason, providerReference: payment.providerReference
  };
  t.keys.put(scoped, { print: fingerprint(request), receipt });
  return cashCode === undefined ? receipt : { ...receipt, cashCode };
 }

 /* ---- The payment-result door ------------------------------------------------------------- */

 function refusedFieldIn(door: 'payment-result' | 'payout-advice', payload: Record<string, unknown>): Refusal | null {
  const keysIn = Object.keys(payload).map(canonical);
  for (const never of doorOf(door).neverAccepts) {
   const spellings = [never.field, ...never.also].map(canonical);
   if (keysIn.some(k => spellings.includes(k))) return { refused: true, id: `door-refuses-${never.field}`, status: 422, statement: never.refusal };
  }
  return null;
 }

 function acceptPaymentResult(payload: Record<string, unknown>, origin: Origin): Payment | Refusal {
  if (origin === 'network' ? doorIsLocked('payment-result') : !simulation) return refusal('door-locked');
  const refusedField = refusedFieldIn('payment-result', payload);
  if (refusedField) return refusedField;
  for (const field of doorOf('payment-result').accepts) if (field.required && payload[field.field] === undefined) return refusal('required-field-missing');
  const result = payload as unknown as Omit<PaymentResultPayload, 'outcome'> & { outcome: string };
  const payment = t.payments.get(result.reference);
  if (!payment) return refusal('payable-not-found');
  const payable = t.payables.get(payment.payableRef)!;
  /* Reconciled, not believed: the door's own the-amount-is-reconciled-rather-than-believed. */
  if (result.currency !== currency || result.amountCents !== payable.amountCents) return refusal('amount-mismatch');
  const mapped = outcomeOf(result.outcome);
  if (!mapped) return refusal('required-field-missing');
  const was = payment.stateCode;
  payment.providerReference = result.providerReference ?? payment.providerReference;
  if (mapped.state === 'refunded') {
   /* A reversal names what it reverses, and only money that arrived can go back. payment.refunded@1 is published
      on the one step from succeeded to refunded and never again: a cancellation delivered twice, or the same
      reversal sent twice, finds the payment refunded already and tells nobody a second time. It carries
      references and the amount and nothing else — no card, no cash code, nothing about the care — and the
      booking only when the payable was opened against one, so Access marks its own booking by its own reference. */
   t.payments.put(payment.paymentRef, { ...payment, stateCode: was === 'succeeded' ? 'refunded' : was });
   if (was === 'succeeded') {
    emit('payment.refunded@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, amountCents: payment.amountCents, ...(payable.bookingRef ? { bookingRef: payable.bookingRef } : {}) }, payable.subjectRef);
   }
   return t.payments.get(payment.paymentRef)!;
  }
  if (was === 'refunded' || (was === 'failed' && mapped.state === 'succeeded')) return payment;
  payment.stateCode = mapped.state as PaymentStateId;
  payment.settled = payment.settled || mapped.settled;
  if (mapped.state === 'failed' && was !== 'failed') payment.declineReason = typeof result.declineReason === 'string' ? result.declineReason : undefined;
  t.payments.put(payment.paymentRef, payment);
  if (mapped.state === 'failed' && was !== 'failed') {
   emit('payment.failed@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, reasonCode: 'declined' }, payable.subjectRef);
  }
  if (mapped.state === 'succeeded' && was !== 'succeeded') {
   emit('payment.succeeded@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, amountCents: payment.amountCents, method: payment.method }, payable.subjectRef);
  }
  return payment;
 }

 /* ---- Cash -------------------------------------------------------------------------------- */

 /* Who, when and what happened, and for a release why. Never the code that was entered, right or wrong. */
 const audit = (paymentRef: string, actor: Actor, outcome: CashAuditRow['outcome'], reasonCode?: string) => {
  const at = clock().toISOString();
  const seq = t.cashAudit.all().filter(r => r.paymentRef === paymentRef).length + 1;
  t.cashAudit.put(`${paymentRef}:${seq}`, { paymentRef, at, actorRole: actor.role, actorRef: actor.subjectRef, outcome, ...(reasonCode ? { reasonCode } : {}) });
 };

 /**
  * The nurse enters the patient's code after the visit. Every wrong entry is written down with who made
  * it and when, and the attempt limit holds the payment for the desk: after it, the right code is refused
  * too, because a limit that the right guess can walk through is not a limit.
  *
  * Every wrong entry counts, whatever idempotency key it came with. A refused entry is never replayed, and
  * one that was not counted because its key had been seen would let one key try every code there is.
  */
 function enterCashCode(actor: Actor, input: { paymentRef: string; code: string }): Payment | Refusal {
  const payment = t.payments.get(input.paymentRef);
  /* Only a cash payment has a code. Anything else is refused before a code is compared, so it counts nothing. */
  if (!payment || payment.method !== 'cash-otp') return refusal('payable-not-found');
  const payable = t.payables.get(payment.payableRef)!;
  const visit = payable.appointmentRef ? t.billable.get(payable.appointmentRef) : undefined;
  /* Against a finished visit only, which Money learns from visit.billable and nowhere else. */
  if (!visit) return refusal('cash-before-the-visit-finished');
  if (actor.role !== 'nurse') return refusal('caller-not-allowed');
  /* Another nurse is refused before the code is compared: she can neither record the cash nor use up the
     attempts of the nurse who was at the door. */
  if (actor.subjectRef !== visit.clinicianRef) return refusal('cash-code-not-your-visit');
  if (payment.stateCode !== 'pending') return payment;
  const row = t.cashCodes.get(payment.paymentRef)!;
  if (row.held) {
   audit(payment.paymentRef, actor, 'refused-while-held');
   return refusal('cash-code-held');
  }
  if (!sameDigest(row.digest, cashCodeDigest(row.salt, String(input.code)))) {
   const wrongAttempts = row.wrongAttempts + 1;
   const held = wrongAttempts >= money.cash.attemptLimit;
   t.cashCodes.put(payment.paymentRef, { ...row, wrongAttempts, held });
   audit(payment.paymentRef, actor, held ? 'held' : 'wrong');
   return refusal(held ? 'cash-code-held' : 'cash-without-otp');
  }
  audit(payment.paymentRef, actor, 'accepted');
  payment.stateCode = 'succeeded';
  t.payments.put(payment.paymentRef, payment);
  emit('payment.succeeded@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, amountCents: payment.amountCents, method: payment.method }, payable.subjectRef);
  return payment;
 }

 /**
  * The desk releases a held cash payment after speaking to the patient. The code is unchanged and nothing is
  * paid: the count of wrong codes starts again, so the nurse may enter it, and the audit says who, when and why.
  */
 function releaseCashCode(actor: Actor, input: { paymentRef: string; reasonCode?: string }): Payment | Refusal {
  if (!CASH_DESK_ROLES.includes(actor.role) || !actor.subjectRef) return refusal('caller-not-allowed');
  const payment = t.payments.get(input.paymentRef);
  const row = t.cashCodes.get(input.paymentRef);
  if (!payment || !row) return refusal('payable-not-found');
  /* The hold is what stops a six-digit code being walked. It is lifted only for a reason somebody agreed, and
     the reason is written down, or a desk that spoke to the patient and one that pressed a button look alike. */
  if (typeof input.reasonCode !== 'string' || !input.reasonCode.trim()) return refusal('release-without-a-reason');
  if (!releaseReasonIds.has(input.reasonCode)) return refusal('release-reason-not-known');
  /* Resetting the count on a payment that is not held would hand whoever is trying a fresh set of attempts. */
  if (!row.held) return refusal('cash-code-not-held');
  t.cashCodes.put(input.paymentRef, { ...row, wrongAttempts: 0, held: false });
  audit(input.paymentRef, actor, 'released', input.reasonCode);
  return payment;
 }

 /* ---- Hearing ----------------------------------------------------------------------------- */

 /* A cancelled visit's payable is closed, and what was paid for it goes back through the payment-result door.
    Under packages/catalog/cancellation.json the whole payment goes back, inside the window or outside it:
    its late-cancellation charge is a pendingDecision nobody has made, and a refund that kept something back
    would be that decision made here without anybody deciding it. Cash is not reversed through a card provider,
    and a visit paid in cash at the door was already billable, so it is not a visit that is cancelled. */
 function refundWhere(matches: (payable: Payable) => boolean) {
  for (const payable of t.payables.all().filter(matches)) {
   t.payables.put(payable.payableRef, { ...payable, cancelled: true });
   for (const payment of t.payments.all().filter(p => p.payableRef === payable.payableRef)) {
    if (payment.stateCode === 'succeeded' && payment.method !== 'cash-otp' && simulation && payable.amountCents !== null) {
     acceptPaymentResult(reversal(payable.payableRef, payment.paymentRef, payable.amountCents, clock()), 'simulated-provider');
    }
   }
  }
 }

 function hear(envelope: HeardEnvelope): { heard: string } | Refusal {
  const declared = heardEvent(envelope.type, envelope.version);
  if (!declared) return refusal('hears-only-its-list');
  const allowed = new Set(declared.payload.map(f => f.field));
  /* Refused whole rather than stripped: a publisher that put a record reference on a billing event
     has a defect worth hearing about, and silently dropping the field would hide it. */
  if (Object.keys(envelope.payload).some(field => isRecordReference(field) || !allowed.has(field))) return refusal('hears-only-its-list');
  const on = isoDateInSouthAfrica(envelope.occurredAt ? new Date(envelope.occurredAt) : clock());
  const p = envelope.payload;

  if (envelope.type === 'appointment.booked') {
   /* A held visit becomes a payable, priced as it opens from the service appointment.booked@2 names, at the
      price packages/catalog/services.json holds for it — never from a number on the event, which carries none
      and refuses one. serviceById is loud about a service the catalogue does not sell, so the delivery is
      rolled back and no payable opens at a price nobody set. */
   const appointmentRef = String(p['appointmentRef']);
   const service = serviceById(String(p['serviceId']));
   const payableRef = payableRefFor(appointmentRef);
   if (!t.payables.get(payableRef) && envelope.subjectRef) {
    t.payables.put(payableRef, { payableRef, kind: 'visit', amountCents: service.price * 100, subjectRef: envelope.subjectRef, payers: [], serviceId: service.id, appointmentRef, cancelled: false });
   }
  } else if (envelope.type === 'visit.billable') {
   const appointmentRef = String(p['appointmentRef']), serviceId = String(p['serviceId']), clinicianRef = String(p['clinicianRef']);
   const service = serviceById(serviceId);
   if (!t.billable.get(appointmentRef)) {
    t.billable.put(appointmentRef, { appointmentRef, serviceId, clinicianRef, on });
    const payables = t.payables.all().filter(x => x.appointmentRef === appointmentRef);
    for (const payable of payables) if (payable.amountCents === null) t.payables.put(payable.payableRef, { ...payable, serviceId, amountCents: service.price * 100 });
    const planned = payables.some(x => x.kind === 'plan');
    const row = t.earned.get(clinicianRef) ?? { partyRef: clinicianRef, lines: [] };
    row.lines.push({ line: { kind: planned ? 'plan-visit' : 'visit', reference: appointmentRef, serviceId }, on });
    t.earned.put(clinicianRef, row);
   }
  } else if (envelope.type === 'review.billable') {
   const feeCode = String(p['feeCode']);
   if (!feeByCode(feeCode)) return refusal('hears-only-its-list');
   const doctorRef = String(p['reviewedByRef']);
   const row = t.cases.get(doctorRef) ?? { doctorRef, cases: [] };
   /* The fee in force today goes onto the case and is never asked again for it: a later change to the
      fee, or to whether it is confirmed, reaches cases signed after it and not this one. A redelivery
      keeps the fee the first delivery recorded. */
   if (!row.cases.some(c => c.reviewRef === p['reviewRef'])) row.cases.push({ reviewRef: String(p['reviewRef']), feeCode, on, fee: feeNow() });
   t.cases.put(doctorRef, row);
  } else if (envelope.type === 'booking.confirmed') {
   /* A confirmed booking names its service, and its price is the catalogue's for that service. It opens no payable
      of its own: the payable is the visit Care holds, opened and priced by appointment.booked@2, and no event Money
      hears names a booking and its appointment together, so a second payable here would be one visit owed twice
      with nothing to tell the two apart. What is read is that the service is one packages/catalog/services.json
      sells: serviceById is loud about one it does not, and the delivery is rolled back rather than a booking being
      confirmed for a price nobody set. */
   serviceById(String(p['serviceId']));
  } else if (envelope.type === 'booking.cancelled') {
   refundWhere(payable => payable.bookingRef === p['bookingRef']);
  } else if (envelope.type === 'appointment.cancelled') {
   refundWhere(payable => payable.appointmentRef === p['appointmentRef']);
  } else if (envelope.type === 'partner.suspended') {
   /* Recorded, and nothing else. A suspended partner takes no new orders; what it earned stays. */
   t.suspensions.put(`${String(p['partnerKind'])}:${on}`, { partnerKind: String(p['partnerKind']), reasonCode: String(p['reasonCode']), on });
  }
  return { heard: `${envelope.type}@${envelope.version}` };
 }

 /* ---- Payouts ----------------------------------------------------------------------------- */

 /* One party's unscheduled lines for one week, into that week's payout. The same week and party is one
    payout however many times it is asked, and a line once scheduled is never scheduled again. */
 function scheduleWeek(row: { partyRef: string; lines: EarnedLine[] }, periodEnd: string): Payout | null {
  const payoutRef = `PO-${row.partyRef}-${periodEnd}`;
  const existing = t.payouts.get(payoutRef);
  const fresh = row.lines.filter(l => !l.payoutRef && weekOf(l.on) === periodEnd);
  if (!fresh.length) return existing ?? null;
  const payout: Payout = existing ?? { payoutRef, partyRef: row.partyRef, periodEnd, lines: [], totalCents: 0, state: 'closed' };
  for (const l of fresh) { l.payoutRef = payoutRef; payout.lines.push(l.line); }
  payout.totalCents = totalCents(payout.lines);
  t.earned.put(row.partyRef, row);
  t.payouts.put(payoutRef, payout);
  emit('payout.scheduled@1', { payoutRef, periodEnd, lineCount: payout.lines.length }, row.partyRef);
  return payout;
 }

 /** Close one named week: one payout per party with unscheduled lines in it. */
 function schedulePayouts(periodEnd: string): Payout[] {
  return t.earned.all().map(row => scheduleWeek(row, periodEnd)).filter((p): p is Payout => p !== null);
 }

 /**
  * Close every week that has ended and still has unscheduled lines, each into its own week's payout.
  * The tick used to close only the week before now, so a week the runtime slept through — or a line
  * that arrived late for a week already past — was never scheduled and never paid. Work done is work
  * paid, whenever the ledger next looks.
  */
 function scheduleClosedWeeks(now: Date = clock()): Payout[] {
  const todayHere = isoDateInSouthAfrica(now);
  const out: Payout[] = [];
  for (const row of t.earned.all()) {
   const weeks = [...new Set(row.lines.filter(l => !l.payoutRef).map(l => weekOf(l.on)))].filter(end => end < todayHere).sort();
   for (const periodEnd of weeks) {
    const current = t.earned.get(row.partyRef)!;
    const payout = scheduleWeek(current, periodEnd);
    if (payout) out.push(payout);
   }
  }
  return out;
 }

 /** Lines whose week has ended and that no payout carries — which must be none after a tick. */
 function unscheduledClosedLines(now: Date = clock()): { partyRef: string; reference: string; periodEnd: string }[] {
  const todayHere = isoDateInSouthAfrica(now);
  return t.earned.all().flatMap(row => row.lines.filter(l => !l.payoutRef && weekOf(l.on) < todayHere)
   .map(l => ({ partyRef: row.partyRef, reference: l.line.reference, periodEnd: weekOf(l.on) })));
 }

 /** One of the sample weeks a screen draws, entered into the ledger so its figure is the ledger's. */
 function importWeek(input: { weekId: string; partyRef: string; periodEnd: string; lines: PayoutLine[]; state: string; failureReason?: string }): Payout {
  const state: PayoutState = input.state === 'accruing' ? 'closed' : input.state as PayoutState;
  const payout: Payout = { payoutRef: input.weekId, partyRef: input.partyRef, periodEnd: input.periodEnd, lines: [...input.lines], totalCents: totalCents(input.lines), state, failureReason: input.failureReason };
  t.payouts.put(`${input.weekId}:${input.partyRef}`, payout);
  return payout;
 }

 const storedKey = (payoutRef: string, partyRef?: string) =>
  t.payouts.get(payoutRef) ? payoutRef : partyRef && t.payouts.get(`${payoutRef}:${partyRef}`) ? `${payoutRef}:${partyRef}` : null;

 function recomputePayout(payoutRef: string, lines: PayoutLine[], reason: RecomputeReason, partyRef?: string): Payout | Refusal {
  const key = storedKey(payoutRef, partyRef);
  if (!key) return refusal('payable-not-found');
  const payout = t.payouts.get(key)!;
  const next = recompute(payout.lines, lines, reason);
  if (isRefusal(next)) return next;
  const updated: Payout = { ...payout, lines: next, totalCents: totalCents(next) };
  t.payouts.put(key, updated);
  return updated;
 }

 /* ---- The payout-advice door -------------------------------------------------------------- */

 function acceptPayoutAdvice(payload: Record<string, unknown>, origin: Origin): Payout | Refusal {
  if (origin === 'network' ? doorIsLocked('payout-advice') : !simulation) return refusal('door-locked');
  const refusedField = refusedFieldIn('payout-advice', payload);
  if (refusedField) return refusedField;
  for (const field of doorOf('payout-advice').accepts) if (field.required && payload[field.field] === undefined) return refusal('required-field-missing');
  const advice = payload as unknown as PayoutAdvicePayload;
  const key = storedKey(advice.weekId, advice.partyId);
  const payout = key ? t.payouts.get(key) : undefined;
  if (!key || !payout || payout.partyRef !== advice.partyId) return refusal('someone-elses-payout');
  if (advice.amountCents !== payout.totalCents) return refusal('amount-mismatch');
  /* A failed run is still owed. It goes out again before it can be paid, never straight to paid. */
  if (payout.state === 'failed' && advice.outcome === 'paid') return payout;
  const was = payout.state;
  const updated: Payout = { ...payout, state: advice.outcome, failureReason: advice.outcome === 'failed' ? advice.failureReason : undefined, ranOn: today() };
  t.payouts.put(key, updated);
  if (advice.outcome === 'paid' && was !== 'paid') emit('payout.paid@1', { payoutRef: updated.payoutRef }, updated.partyRef);
  return updated;
 }

 const failedWords = earningsContract.states.find(s => s.id === 'failed')!.detail;

 /** Send a payout to the simulated bank, whose answer comes back through the door. */
 function runPayout(payoutRef: string, partyRef?: string): Payout | Refusal {
  const key = storedKey(payoutRef, partyRef);
  if (!key) return refusal('payable-not-found');
  if (!simulation) return refusal('door-locked');
  const payout = t.payouts.get(key)!;
  return acceptPayoutAdvice(advise(payout.payoutRef, payout.partyRef, payout.totalCents, payout.state, failedWords, clock()), 'simulated-provider');
 }

 /* ---- Doctors' fees ----------------------------------------------------------------------- */

 function scheduleDoctorPayout(doctorRef: string, periodEnd: string): Payout | Refusal {
  const signed = (t.cases.get(doctorRef)?.cases ?? []).filter(c => c.on <= periodEnd);
  const owed = doctorOwedCents(signed, feeNow());
  if (isRefusal(owed)) return owed;
  const payoutRef = `PO-${doctorRef}-${periodEnd}`;
  /* A doctor's line is a case, not a visit, and carries no amount: each case's fee is the one it was signed under, or the one confirmed now. */
  const payout: Payout = { payoutRef, partyRef: doctorRef, periodEnd, lines: [], totalCents: owed, state: 'closed' };
  t.payouts.put(payoutRef, payout);
  emit('payout.scheduled@1', { payoutRef, periodEnd, lineCount: signed.length }, doctorRef);
  return payout;
 }

 /* ---- Reading ----------------------------------------------------------------------------- */

 function payoutsFor(actor: Actor, periodEnd?: string): Payout[] | Refusal {
  if (AGGREGATE_ROLES.includes(actor.role)) return refusal('scheme-sees-a-payment');
  if (!PAYOUT_CALLERS.includes(actor.role)) return refusal('caller-not-allowed');
  return t.payouts.all().filter(p => p.partyRef === actor.subjectRef && (!periodEnd || p.periodEnd === periodEnd));
 }

 function paymentsFor(actor: Actor): Payment[] | Refusal {
  if (AGGREGATE_ROLES.includes(actor.role)) return refusal('scheme-sees-a-payment');
  if (!PAYMENT_CALLERS.includes(actor.role)) return refusal('caller-not-allowed');
  return t.payments.all().filter(p => { const x = t.payables.get(p.payableRef)!; return x.subjectRef === actor.subjectRef || x.payers.includes(actor.subjectRef); });
 }

 return {
  openVisitPayable, openPlanPayable, pay, acceptPaymentResult, enterCashCode, releaseCashCode, hear,
  schedulePayouts, scheduleClosedWeeks, unscheduledClosedLines, importWeek, recomputePayout, acceptPayoutAdvice, runPayout, scheduleDoctorPayout,
  payoutsFor, paymentsFor,
  allPayouts: () => t.payouts.all(),
  casesFor: (doctorRef: string) => [...(t.cases.get(doctorRef)?.cases ?? [])],
  earnedLinesFor: (partyRef: string) => (t.earned.get(partyRef)?.lines ?? []).map(l => l.line),
  payment: (paymentRef: string) => t.payments.get(paymentRef),
  payable: (payableRef: string) => t.payables.get(payableRef),
  cashAuditFor: (paymentRef: string) => t.cashAudit.all().filter(r => r.paymentRef === paymentRef),
  /* How many wrong codes a cash payment has had and whether it is held. Never the salt or the digest. */
  cashStanding: (paymentRef: string) => { const row = t.cashCodes.get(paymentRef); return row ? { wrongAttempts: row.wrongAttempts, held: row.held } : undefined; },
  heldCashPayments: () => t.payments.all().filter(p => p.method === 'cash-otp' && t.cashCodes.get(p.paymentRef)?.held === true),
  outbox: () => outbox.map(e => ({ ...e, payload: { ...e.payload } })),
  wordsFor: (state: PaymentStateId) => stateOf(state)
 };
}

export type Money = ReturnType<typeof createMoney>;
