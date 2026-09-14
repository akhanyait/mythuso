/**
 * What a nurse is owed for a week, worked out rather than written down.
 *
 * ── A visit line has no amount, by type ──────────────────────────────────────────────────────
 *
 * The public page promises three quarters of every visit, and packages/catalog/services.json is
 * where that becomes a number: each service's nurseShare. A payout line for a visit names the
 * service and nothing else, so there is no field on it where a different figure could be typed —
 * and a line that arrives with one anyway is refused rather than trusted, in
 * packages/catalog/apis/money.json's words. Only a reversal and a correction carry an amount,
 * because neither is derived from anything, and each must say what it is for.
 *
 * ── A suspension is not a recomputation ──────────────────────────────────────────────────────
 *
 * Money does not subscribe to a suspension, and nothing here takes a nurse's standing as an input.
 * The one way a suspension could reach earned money is somebody recomputing a payout "because she
 * was suspended", so `recompute` refuses exactly that, and refuses any recomputation that drops a
 * line she has earned without a reversal naming the visit and the reason.
 */
import { earningsContract, refusal, serviceById, type Refusal } from './contract.ts';

export type VisitKind = 'visit' | 'plan-visit';
export type AdjustmentKind = 'reversal' | 'correction';
export type VisitLine = { kind: VisitKind; reference: string; serviceId: string };
export type AdjustmentLine = { kind: AdjustmentKind; reference: string; amountCents: number; reason: string };
export type PayoutLine = VisitLine | AdjustmentLine;

const kinds = new Map(earningsContract.lineKinds.map(k => [k.id, k]));

const isVisitKind = (kind: string): kind is VisitKind => kind === 'visit' || kind === 'plan-visit';

/** A line from outside, accepted only in the shape above. */
export function acceptLine(raw: Record<string, unknown>): PayoutLine | Refusal {
 const kind = String(raw['kind']);
 if (!kinds.has(kind)) throw new Error(`A payout line has the kind "${kind}", which packages/catalog/earnings.json does not define.`);
 const reference = String(raw['reference'] ?? '');
 if (isVisitKind(kind)) {
  /* The whole design of the feature: a visit is worth the nurse's share of its catalogue price. */
  if ('amountCents' in raw || 'amount' in raw) return refusal('payout-line-names-its-amount');
  const serviceId = String(raw['serviceId'] ?? raw['service'] ?? '');
  serviceById(serviceId);
  return { kind, reference, serviceId };
 }
 const reason = typeof raw['reason'] === 'string' ? raw['reason'].trim() : '';
 const amountCents = raw['amountCents'];
 if (!reason) return refusal('deduction-without-a-reason');
 if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) throw new Error(`The ${kind} ${reference} needs a positive amount in whole cents; its sign comes from its kind.`);
 return { kind: kind as AdjustmentKind, reference, amountCents, reason };
}

/** A line's signed worth in cents. */
export function lineCents(line: PayoutLine): number {
 const sign = kinds.get(line.kind)!.sign;
 const base = isVisitKind(line.kind) ? serviceById((line as VisitLine).serviceId).nurseShare * 100 : (line as AdjustmentLine).amountCents;
 return sign * base;
}

export const totalCents = (lines: readonly PayoutLine[]) => lines.reduce((sum, line) => sum + lineCents(line), 0);

/** One of earnings.json's sample weeks, as payout lines. Rand there, cents here. */
export function linesFromEarningsWeek(week: { lines: { kind: string; service?: string; reference: string; amount?: number; reason?: string }[] }): PayoutLine[] {
 return week.lines.map(raw => {
  const accepted = acceptLine(isVisitKind(raw.kind)
   ? { kind: raw.kind, reference: raw.reference, serviceId: raw.service }
   : { kind: raw.kind, reference: raw.reference, amountCents: Math.round((raw.amount ?? 0) * 100), reason: raw.reason });
  if ('refused' in accepted) throw new Error(`earnings.json line ${raw.reference} is refused by the ledger: ${accepted.statement}`);
  return accepted;
 });
}

/* ---- The week ------------------------------------------------------------------------------- */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* South Africa keeps one offset all year, so a date here is the date on a Johannesburg calendar. */
const SAST_MS = 2 * 60 * 60 * 1000;
export const isoDateInSouthAfrica = (at: Date) => new Date(at.getTime() + SAST_MS).toISOString().slice(0, 10);

/** The last day of the pay week a moment falls in: the next weekEndsOn on or after it. */
export function periodEndFor(at: Date): string {
 const local = new Date(`${isoDateInSouthAfrica(at)}T00:00:00Z`);
 const target = DAYS.indexOf(earningsContract.cycle.weekEndsOn);
 local.setUTCDate(local.getUTCDate() + ((target - local.getUTCDay() + 7) % 7));
 return local.toISOString().slice(0, 10);
}

/* ---- Recomputing ---------------------------------------------------------------------------- */

export type RecomputeReason = 'reversal' | 'correction' | 'suspension';
const key = (line: PayoutLine) => `${line.kind}:${line.reference}`;

/**
 * A payout's lines replaced by another set. Allowed only when every earned line is still there and
 * whatever was added is a reversal or a correction naming the visit and the reason.
 */
export function recompute(previous: readonly PayoutLine[], next: readonly PayoutLine[], reason: RecomputeReason): PayoutLine[] | Refusal {
 /* Refused on its reason alone when it would take anything away. A suspension that happened to leave
    the total unchanged changes nothing, which is the one thing a suspension may do to a payout. */
 if (reason === 'suspension' && totalCents(next) < totalCents(previous)) return refusal('suspension-touches-earned-money');
 if (reason === 'suspension') return [...previous];
 const kept = new Set(next.map(key));
 if (previous.some(line => !kept.has(key(line)))) return refusal('deduction-without-a-reason');
 const before = new Set(previous.map(key));
 for (const line of next) {
  if (before.has(key(line))) continue;
  if (isVisitKind(line.kind)) continue;
  if (!(line as AdjustmentLine).reason?.trim()) return refusal('deduction-without-a-reason');
 }
 return [...next];
}
