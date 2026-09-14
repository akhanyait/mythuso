/**
 * Thuso Money's ledger: payables, payments, cash, payouts and doctors' fees, in memory.
 *
 * ── What it is, and what it is not ───────────────────────────────────────────────────────────
 *
 * Pure, zero-dependency and synchronous, so the same code runs under node:test, in the engine's
 * handlers and in the web preview. It holds no card number, contacts no bank and moves no money. A
 * payment's result arrives only through the payment-result door and a payout's through the
 * payout-advice door; both are locked, and in development the simulated provider in provider.ts
 * stands behind them in process. `simulation: false` is what a deployed engine would run with today,
 * and in it nothing is ever paid, because nothing can arrive.
 *
 * ── The refusals, in the order they are asked ────────────────────────────────────────────────
 *
 * A card number is refused before anything else looks at the request, so it is never stored under
 * an idempotency key or echoed in a refusal. Then the key: nothing is charged without one, the same
 * key with the same payment is the same answer, and the same key with a different payment is
 * refused rather than guessed at. Only then the payable — whose amount is the catalogue's, whose
 * owner is somebody, and which is not paid twice.
 *
 * A scheme or an employer asking for a person's payments is refused. Money hears only the events on
 * its list, and an event carrying a reference into the record is refused even when its type is
 * listed. A suspension is not something Money hears at all.
 */
import {
 canonical, cardSpellings, currency, doorIsLocked, doorOf, earningsContract, feeByCode, heardEvent, isRecordReference,
 isRefusal, methodById, outcomeOf, planPriceRand, refusal, serviceById, stateOf,
 type DoctorFee, type MethodId, type PayableKind, type PaymentStateId, type Published, type Refusal
} from './contract.ts';
import { advise, attempt, reversal, seeded, type PaymentResultPayload, type PayoutAdvicePayload } from './provider.ts';
import { isoDateInSouthAfrica, recompute, totalCents, type PayoutLine, type RecomputeReason } from './payouts.ts';
import { doctorOwedCents, type DoctorCase } from './fees.ts';

export type Actor = { role: string; subjectRef: string };

export type Payable = {
 payableRef: string; kind: PayableKind; amountCents: number; subjectRef: string; payers: string[];
 serviceId?: string; planId?: string; tierId?: string; appointmentRef?: string; bookingRef?: string; cancelled: boolean;
};

export type Payment = {
 paymentRef: string; payableRef: string; method: MethodId; amountCents: number; stateCode: PaymentStateId;
 settled: boolean; attempt: number; declineReason?: string; providerReference?: string;
};

export type Receipt = {
 paymentRef: string; payableRef: string; stateCode: PaymentStateId; method: MethodId; amountCents: number;
 attempt: number; replayed: boolean; declineReason?: string; providerReference?: string;
 /** Shown to the person who pays in cash, and to nobody else. */
 cashCode?: string;
};

export type PayoutState = 'closed' | 'in-transit' | 'paid' | 'failed';
export type Payout = { payoutRef: string; partyRef: string; periodEnd: string; lines: PayoutLine[]; totalCents: number; state: PayoutState; failureReason?: string };

export type Emitted = { type: string; version: number; payload: Record<string, unknown> };
export type HeardEnvelope = { type: string; version: number; occurredAt?: string; payload: Record<string, unknown> };
export type Origin = 'simulated-provider' | 'network';

export type MoneyOptions = {
 clock?: () => Date;
 /** Whether the simulated provider stands behind the doors. Development only. */
 simulation?: boolean;
 /** The doctors' fees, when a test needs to prove the decided path. Otherwise the contract. */
 doctorFees?: readonly DoctorFee[];
};

const PAYMENT_CALLERS = ['patient', 'caregiver', 'sponsor'];
const PAYOUT_CALLERS = ['nurse', 'locum', 'doctor'];
/* The roles served in aggregate. A person's payment is never theirs to read. */
const AGGREGATE_ROLES = ['scheme', 'employer', 'medical-scheme', 'insurer'];

/* A card number is the digits, not the field name: thirteen to nineteen of them in a row. */
const PAN = /(?:\d[ -]?){13,19}/;
function carriesACard(value: unknown, depth = 0): boolean {
 if (depth > 4 || value === null || value === undefined) return false;
 if (typeof value === 'string') return PAN.test(value.replace(/[^\d -]/g, ''));
 if (typeof value !== 'object') return false;
 return Object.entries(value as Record<string, unknown>).some(([k, v]) => cardSpellings.has(canonical(k)) || carriesACard(v, depth + 1));
}

/* The same act, by content. Keys sorted so field order is not a different payment. */
const fingerprint = (request: Record<string, unknown>) =>
 JSON.stringify({ payableRef: request['payableRef'], method: request['method'], amountCents: request['amountCents'] });

export function createMoney(options: MoneyOptions = {}) {
 const clock = options.clock ?? (() => new Date());
 const simulation = options.simulation ?? false;
 const fees = options.doctorFees;

 const payables = new Map<string, Payable>();
 const payments = new Map<string, Payment>();
 const cashCodes = new Map<string, string>();
 const attempts = new Map<string, number>();
 const keys = new Map<string, { print: string; receipt: Receipt }>();
 const billable = new Map<string, { serviceId: string; clinicianRef: string; on: string }>();
 const earned = new Map<string, { line: PayoutLine; on: string; payoutRef?: string }[]>();
 const cases = new Map<string, DoctorCase[]>();
 const payouts = new Map<string, Payout>();
 const suspendedPartners = new Set<string>();
 const outbox: Emitted[] = [];

 const emit = (key: Published, payload: Record<string, unknown>) => {
  const [type, version] = key.split('@');
  outbox.push({ type: type!, version: Number(version), payload });
 };

 /* ---- Payables ---------------------------------------------------------------------------- */

 function openVisitPayable(input: { payableRef: string; serviceId: string; subjectRef: string; payers?: string[]; appointmentRef?: string; bookingRef?: string }): Payable {
  const existing = payables.get(input.payableRef);
  if (existing) return existing;
  const payable: Payable = {
   payableRef: input.payableRef, kind: 'visit', amountCents: serviceById(input.serviceId).price * 100,
   subjectRef: input.subjectRef, payers: input.payers ?? [], serviceId: input.serviceId,
   appointmentRef: input.appointmentRef, bookingRef: input.bookingRef, cancelled: false
  };
  payables.set(payable.payableRef, payable);
  return payable;
 }

 function openPlanPayable(input: { payableRef: string; planId: string; tierId?: string; subjectRef: string; payers?: string[] }): Payable | Refusal {
  const existing = payables.get(input.payableRef);
  if (existing) return existing;
  /* A plan with no price — Thuso Recover, or a tier nobody named — is not something anybody owes. */
  const price = planPriceRand(input.planId, input.tierId);
  if (price === null) return refusal('payable-not-found');
  const payable: Payable = { payableRef: input.payableRef, kind: 'plan', amountCents: price * 100, subjectRef: input.subjectRef, payers: input.payers ?? [], planId: input.planId, tierId: input.tierId, cancelled: false };
  payables.set(payable.payableRef, payable);
  return payable;
 }

 /* ---- Paying ------------------------------------------------------------------------------ */

 function pay(actor: Actor, request: Record<string, unknown>): Receipt | Refusal {
  /* First, before the request is stored, keyed, compared or echoed anywhere. */
  if (carriesACard(request)) return refusal('card-number-sent');
  if (!PAYMENT_CALLERS.includes(actor.role)) return refusal('caller-not-allowed');
  const idempotencyKey = request['idempotencyKey'];
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return refusal('charge-without-a-key');
  const { payableRef, method, amountCents } = request;
  if (typeof payableRef !== 'string' || typeof method !== 'string' || typeof amountCents !== 'number') return refusal('required-field-missing');

  /* Keyed per caller, so one person's key can never replay another person's payment. */
  const scoped = `${actor.subjectRef}:${idempotencyKey}`;
  const prior = keys.get(scoped);
  if (prior) return prior.print === fingerprint(request) ? { ...prior.receipt, replayed: true } : refusal('idempotency-key-reused');

  const payable = payables.get(payableRef);
  if (!payable || payable.cancelled) return refusal('payable-not-found');
  if (payable.subjectRef !== actor.subjectRef && !payable.payers.includes(actor.subjectRef)) return refusal('someone-elses-payable');
  const chosen = methodById(method);
  if (!chosen || !chosen.offered || !chosen.for.includes(payable.kind)) return refusal('method-not-offered');
  if (!Number.isInteger(amountCents) || amountCents !== payable.amountCents) return refusal('amount-mismatch');
  if ([...payments.values()].some(p => p.payableRef === payableRef && p.stateCode === 'succeeded')) return refusal('already-paid');
  /* A cash payment already waiting on its code is the same payment, not a second one. */
  const waitingCash = [...payments.values()].find(p => p.payableRef === payableRef && p.method === 'cash-otp' && p.stateCode === 'pending');
  if (waitingCash && method === 'cash-otp') return refusal('already-paid');

  const n = (attempts.get(payableRef) ?? 0) + 1;
  attempts.set(payableRef, n);
  const payment: Payment = { paymentRef: `PAY-${payableRef}-${n}`, payableRef, method: chosen.id, amountCents, stateCode: 'pending', settled: false, attempt: n };
  payments.set(payment.paymentRef, payment);

  let cashCode: string | undefined;
  if (chosen.id === 'cash-otp') {
   const rand = seeded(`cash:${payment.paymentRef}`);
   cashCode = Array.from({ length: 6 }, () => Math.floor(rand() * 10)).join('');
   cashCodes.set(payment.paymentRef, cashCode);
  } else if (simulation) {
   /* The provider answers through the door like any supplier would; nothing here sets a state. */
   acceptPaymentResult(attempt(payableRef, n, payment.paymentRef, amountCents, clock()), 'simulated-provider');
  }
  const receipt: Receipt = {
   paymentRef: payment.paymentRef, payableRef, stateCode: payment.stateCode, method: payment.method, amountCents,
   attempt: n, replayed: false, declineReason: payment.declineReason, providerReference: payment.providerReference, cashCode
  };
  keys.set(scoped, { print: fingerprint(request), receipt });
  return receipt;
 }

 /* ---- The payment-result door ------------------------------------------------------------- */

 function acceptPaymentResult(payload: Record<string, unknown>, origin: Origin): Payment | Refusal {
  if (origin === 'network' ? doorIsLocked('payment-result') : !simulation) return refusal('door-locked');
  const refusedField = refusedFieldIn('payment-result', payload);
  if (refusedField) return refusedField;
  for (const field of doorOf('payment-result').accepts) if (field.required && payload[field.field] === undefined) return refusal('required-field-missing');
  const result = payload as unknown as PaymentResultPayload | (Omit<PaymentResultPayload, 'outcome'> & { outcome: 'settled' });
  const payment = payments.get(result.reference);
  if (!payment) return refusal('payable-not-found');
  const payable = payables.get(payment.payableRef)!;
  /* Reconciled, not believed: the door's own the-amount-is-reconciled-rather-than-believed. */
  if (result.currency !== currency || result.amountCents !== payable.amountCents) return refusal('amount-mismatch');
  const mapped = outcomeOf(result.outcome);
  if (!mapped) return refusal('required-field-missing');
  const was = payment.stateCode;
  payment.providerReference = result.providerReference ?? payment.providerReference;
  if (mapped.state === 'refunded') {
   /* A reversal names what it reverses, and only money that arrived can go back. */
   if (was !== 'succeeded') return payment;
   payment.stateCode = 'refunded';
   return payment;
  }
  if (was === 'refunded' || was === 'failed' && mapped.state === 'succeeded') return payment;
  payment.stateCode = mapped.state as PaymentStateId;
  payment.settled = payment.settled || mapped.settled;
  if (mapped.state === 'failed' && was !== 'failed') {
   payment.declineReason = 'declineReason' in result ? result.declineReason : undefined;
   emit('payment.failed@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, reasonCode: 'declined' });
  }
  if (mapped.state === 'succeeded' && was !== 'succeeded') {
   emit('payment.succeeded@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, amountCents: payment.amountCents, method: payment.method });
  }
  return payment;
 }

 function refusedFieldIn(door: 'payment-result' | 'payout-advice', payload: Record<string, unknown>): Refusal | null {
  const keysIn = Object.keys(payload).map(canonical);
  for (const never of doorOf(door).neverAccepts) {
   const spellings = [never.field, ...never.also].map(canonical);
   if (keysIn.some(k => spellings.includes(k))) return { refused: true, id: `door-refuses-${never.field}`, status: 422, statement: never.refusal };
  }
  return null;
 }

 /* ---- Cash -------------------------------------------------------------------------------- */

 function enterCashCode(actor: Actor, input: { paymentRef: string; code: string }): Payment | Refusal {
  const payment = payments.get(input.paymentRef);
  if (!payment || payment.method !== 'cash-otp') return refusal('payable-not-found');
  const payable = payables.get(payment.payableRef)!;
  const visit = payable.appointmentRef ? billable.get(payable.appointmentRef) : undefined;
  /* Against a finished visit only, which Money learns from visit.billable and nowhere else. */
  if (!visit) return refusal('cash-before-the-visit-finished');
  if (actor.role !== 'nurse' || actor.subjectRef !== visit.clinicianRef) return refusal('caller-not-allowed');
  if (payment.stateCode !== 'pending') return payment;
  if (cashCodes.get(payment.paymentRef) !== input.code) return refusal('cash-without-otp');
  payment.stateCode = 'succeeded';
  emit('payment.succeeded@1', { paymentRef: payment.paymentRef, payableRef: payment.payableRef, amountCents: payment.amountCents, method: payment.method });
  return payment;
 }

 /* ---- Hearing ----------------------------------------------------------------------------- */

 function hear(envelope: HeardEnvelope): { heard: string } | Refusal {
  const declared = heardEvent(envelope.type, envelope.version);
  if (!declared) return refusal('hears-only-its-list');
  const allowed = new Set(declared.payload.map(f => f.field));
  /* Refused whole rather than stripped: a publisher that put a record reference on a billing event
     has a defect worth hearing about, and silently dropping the field would hide it. */
  if (Object.keys(envelope.payload).some(field => isRecordReference(field) || !allowed.has(field))) return refusal('hears-only-its-list');
  const on = isoDateInSouthAfrica(envelope.occurredAt ? new Date(envelope.occurredAt) : clock());
  const p = envelope.payload;

  if (envelope.type === 'visit.billable') {
   const appointmentRef = String(p['appointmentRef']), serviceId = String(p['serviceId']), clinicianRef = String(p['clinicianRef']);
   serviceById(serviceId);
   if (!billable.has(appointmentRef)) {
    billable.set(appointmentRef, { serviceId, clinicianRef, on });
    const planned = [...payables.values()].some(x => x.appointmentRef === appointmentRef && x.kind === 'plan');
    const lines = earned.get(clinicianRef) ?? [];
    lines.push({ line: { kind: planned ? 'plan-visit' : 'visit', reference: appointmentRef, serviceId }, on });
    earned.set(clinicianRef, lines);
   }
  } else if (envelope.type === 'review.billable') {
   const feeCode = String(p['feeCode']);
   if (!(fees ?? []).some(f => f.feeCode === feeCode) && !feeByCode(feeCode)) return refusal('hears-only-its-list');
   const doctor = String(p['reviewedByRef']);
   const signed = cases.get(doctor) ?? [];
   if (!signed.some(c => c.reviewRef === p['reviewRef'])) signed.push({ reviewRef: String(p['reviewRef']), feeCode, on });
   cases.set(doctor, signed);
  } else if (envelope.type === 'booking.cancelled') {
   for (const payable of payables.values()) {
    if (payable.bookingRef !== p['bookingRef']) continue;
    payable.cancelled = true;
    for (const payment of payments.values()) {
     if (payment.payableRef !== payable.payableRef) continue;
     if (payment.stateCode === 'succeeded' && payment.method !== 'cash-otp' && simulation) {
      acceptPaymentResult(reversal(payable.payableRef, payment.paymentRef, payment.amountCents, clock()), 'simulated-provider');
     }
    }
   }
  } else if (envelope.type === 'partner.suspended') {
   /* Recorded, and nothing else. A suspended partner takes no new orders; what it earned stays. */
   suspendedPartners.add(`${String(p['partnerKind'])}:${on}`);
  }
  return { heard: `${envelope.type}@${envelope.version}` };
 }

 /* ---- Payouts ----------------------------------------------------------------------------- */

 function previousDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
 }

 /** Close a week: one payout per party with unscheduled lines in it. The same week twice is one. */
 function schedulePayouts(periodEnd: string): Payout[] {
  const starts = previousDay(periodEnd, 7);
  const out: Payout[] = [];
  for (const [partyRef, lines] of earned) {
   const payoutRef = `PO-${partyRef}-${periodEnd}`;
   const existing = payouts.get(payoutRef);
   const fresh = lines.filter(l => !l.payoutRef && l.on > starts && l.on <= periodEnd);
   if (!fresh.length) { if (existing) out.push(existing); continue; }
   const payout: Payout = existing ?? { payoutRef, partyRef, periodEnd, lines: [], totalCents: 0, state: 'closed' };
   for (const l of fresh) { l.payoutRef = payoutRef; payout.lines.push(l.line); }
   payout.totalCents = totalCents(payout.lines);
   payouts.set(payoutRef, payout);
   emit('payout.scheduled@1', { payoutRef, periodEnd, lineCount: payout.lines.length });
   out.push(payout);
  }
  return out;
 }

 /** One of the sample weeks a screen draws, entered into the ledger so its figure is the ledger's. */
 function importWeek(input: { weekId: string; partyRef: string; periodEnd: string; lines: PayoutLine[]; state: string; failureReason?: string }): Payout {
  const state: PayoutState = input.state === 'accruing' ? 'closed' : input.state as PayoutState;
  const payout: Payout = { payoutRef: input.weekId, partyRef: input.partyRef, periodEnd: input.periodEnd, lines: [...input.lines], totalCents: totalCents(input.lines), state, failureReason: input.failureReason };
  payouts.set(`${input.weekId}:${input.partyRef}`, payout);
  return payout;
 }

 const payoutByRef = (payoutRef: string, partyRef?: string) => payouts.get(payoutRef) ?? (partyRef ? payouts.get(`${payoutRef}:${partyRef}`) : undefined);

 function recomputePayout(payoutRef: string, lines: PayoutLine[], reason: RecomputeReason, partyRef?: string): Payout | Refusal {
  const payout = payoutByRef(payoutRef, partyRef);
  if (!payout) return refusal('payable-not-found');
  const next = recompute(payout.lines, lines, reason);
  if (isRefusal(next)) return next;
  payout.lines = next;
  payout.totalCents = totalCents(next);
  return payout;
 }

 /* ---- The payout-advice door -------------------------------------------------------------- */

 function acceptPayoutAdvice(payload: Record<string, unknown>, origin: Origin): Payout | Refusal {
  if (origin === 'network' ? doorIsLocked('payout-advice') : !simulation) return refusal('door-locked');
  const refusedField = refusedFieldIn('payout-advice', payload);
  if (refusedField) return refusedField;
  for (const field of doorOf('payout-advice').accepts) if (field.required && payload[field.field] === undefined) return refusal('required-field-missing');
  const advice = payload as unknown as PayoutAdvicePayload;
  const payout = payoutByRef(advice.weekId, advice.partyId);
  if (!payout || payout.partyRef !== advice.partyId) return refusal('someone-elses-payout');
  if (advice.amountCents !== payout.totalCents) return refusal('amount-mismatch');
  /* A failed run is still owed. It goes out again before it can be paid, never straight to paid. */
  if (payout.state === 'failed' && advice.outcome === 'paid') return payout;
  const was = payout.state;
  payout.state = advice.outcome;
  payout.failureReason = advice.outcome === 'failed' ? advice.failureReason : undefined;
  if (advice.outcome === 'paid' && was !== 'paid') emit('payout.paid@1', { payoutRef: payout.payoutRef });
  return payout;
 }

 const failedWords = earningsContract.states.find(s => s.id === 'failed')!.detail;

 /** Send a payout to the simulated bank, whose answer comes back through the door. */
 function runPayout(payoutRef: string, partyRef?: string): Payout | Refusal {
  const payout = payoutByRef(payoutRef, partyRef);
  if (!payout) return refusal('payable-not-found');
  if (!simulation) return refusal('door-locked');
  return acceptPayoutAdvice(advise(payout.payoutRef, payout.partyRef, payout.totalCents, payout.state, failedWords, clock()), 'simulated-provider');
 }

 /* ---- Doctors' fees ----------------------------------------------------------------------- */

 function scheduleDoctorPayout(doctorRef: string, periodEnd: string): Payout | Refusal {
  const signed = (cases.get(doctorRef) ?? []).filter(c => c.on <= periodEnd);
  const owed = doctorOwedCents(signed, fees);
  if (isRefusal(owed)) return owed;
  const payoutRef = `PO-${doctorRef}-${periodEnd}`;
  /* A doctor's line is a case, not a visit, and carries no amount: the fee is the contract's. */
  const payout: Payout = { payoutRef, partyRef: doctorRef, periodEnd, lines: [], totalCents: owed, state: 'closed' };
  payouts.set(payoutRef, payout);
  emit('payout.scheduled@1', { payoutRef, periodEnd, lineCount: signed.length });
  return payout;
 }

 /* ---- Reading ----------------------------------------------------------------------------- */

 function payoutsFor(actor: Actor, periodEnd?: string): Payout[] | Refusal {
  if (AGGREGATE_ROLES.includes(actor.role)) return refusal('scheme-sees-a-payment');
  if (!PAYOUT_CALLERS.includes(actor.role)) return refusal('caller-not-allowed');
  return [...payouts.values()].filter(p => p.partyRef === actor.subjectRef && (!periodEnd || p.periodEnd === periodEnd));
 }

 function paymentsFor(actor: Actor): Payment[] | Refusal {
  if (AGGREGATE_ROLES.includes(actor.role)) return refusal('scheme-sees-a-payment');
  if (!PAYMENT_CALLERS.includes(actor.role)) return refusal('caller-not-allowed');
  return [...payments.values()].filter(p => { const x = payables.get(p.payableRef)!; return x.subjectRef === actor.subjectRef || x.payers.includes(actor.subjectRef); });
 }

 return {
  openVisitPayable, openPlanPayable, pay, acceptPaymentResult, enterCashCode, hear,
  schedulePayouts, importWeek, recomputePayout, acceptPayoutAdvice, runPayout, scheduleDoctorPayout,
  payoutsFor, paymentsFor,
  casesFor: (doctorRef: string) => [...(cases.get(doctorRef) ?? [])],
  earnedLinesFor: (partyRef: string) => (earned.get(partyRef) ?? []).map(l => l.line),
  payment: (paymentRef: string) => payments.get(paymentRef),
  payable: (payableRef: string) => payables.get(payableRef),
  outbox: () => outbox.map(e => ({ ...e, payload: { ...e.payload } })),
  wordsFor: (state: PaymentStateId) => stateOf(state)
 };
}

export type Money = ReturnType<typeof createMoney>;
