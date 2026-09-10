import contract from '../../../../packages/catalog/earnings.json' with { type: 'json' };
import { businessModel, services, type Service } from './catalog';
import { inDays, isoDate } from './vetting';
/* What a nurse is owed, worked out rather than written down.
 *
 * Not one visit amount lives in earnings.json. A line names a service; the money comes from
 * services.json, the same file that quotes the patient and the same file the landing page prices
 * from. That is the whole point: the promise made in public — three quarters of the fee, R187 to
 * R299 a visit — and the number on the nurse's own payout screen are the same arithmetic, so they
 * cannot drift apart while nobody is looking. scripts/check-boundaries.mjs holds them to it.
 *
 * Only a reversal and a correction carry an amount of their own, because neither is derived from
 * anything, and each one has to say what it is for. */
export type LineKind = 'visit' | 'plan-visit' | 'reversal' | 'correction';
export type WeekState = 'accruing' | 'closed' | 'in-transit' | 'paid' | 'failed';
type RawLine = {
 kind: string; service?: string; reference: string; onDays: number; patient: string;
 area?: string; plan?: string; amount?: number; reason?: string;
};
type RawWeek = { id: string; state: string; weeksAgo: number; paidDaysAfterPayDate?: number; failure?: string; lines: RawLine[] };

/* The two dates of a pay week, worked out from the cycle rather than read off a fixed offset.
   A day offset cannot say "the Sunday this week ends on" — it lands on the intended weekday one day
   in seven, so the contract used to be right on Mondays and wrong for the rest of the week, and on
   9 September every week ended on a Friday while the cycle above it said Sunday. */
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const onOrAfter = (from: Date, weekday: string) => {
 const target = DAYS.indexOf(weekday);
 const out = new Date(from);
 out.setDate(out.getDate() + ((target - out.getDay() + 7) % 7));
 return out;
};
const weekDates = (weeksAgo: number) => {
 const today = new Date();
 /* The week this one is: the current week's end is the next weekEndsOn, and each earlier week is
    seven days before that. */
 const ends = onOrAfter(today, cycle.weekEndsOn);
 ends.setDate(ends.getDate() - 7 * weeksAgo);
 /* It pays on the first paysOn strictly after it ends — Sunday to Wednesday, not Sunday to Sunday. */
 const pays = onOrAfter(new Date(ends.getTime() + 86_400_000), cycle.paysOn);
 return { ends: isoDate(ends), pays: isoDate(pays) };
};

export const cycle = contract.cycle;
export const account = contract.account;
export const taxYear = contract.taxYear;
export const states = contract.states;
export const lineKinds = contract.lineKinds;
export const rules = contract.rules;
export const refusals = contract.refusals;
export const stateById = (id: string) => states.find(s => s.id === id)!;
export const lineKindById = (id: string) => lineKinds.find(k => k.id === id)!;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;

export type EarningLine = {
 kind: LineKind; reference: string; on: string; patient: string; area?: string; plan?: string;
 /* Signed: a reversal is negative, so a week is the sum of its lines and nothing has to remember
    which way round to subtract. */
 amount: number; service?: Service; reason?: string;
};
export type EarningWeek = {
 id: string; state: WeekState; ends: string; pays: string; paidOn?: string; failure?: string;
 lines: EarningLine[]; total: number; visits: number;
};

const serviceById = (id: string) => services.find(s => s.id === id);

function buildLine(raw: RawLine): EarningLine {
 const kind = raw.kind as LineKind;
 const service = raw.service ? serviceById(raw.service) : undefined;
 if ((kind === 'visit' || kind === 'plan-visit') && !service) throw new Error(`Earnings line ${raw.reference} names a service that is not in the catalogue`);
 const sign = lineKindById(kind).sign;
 /* A visit is worth the nurse's share of the catalogue price. Nothing else. */
 const amount = service ? service.nurseShare : (raw.amount ?? 0);
 return { kind, reference: raw.reference, on: inDays(raw.onDays), patient: raw.patient, area: raw.area, plan: raw.plan, service, reason: raw.reason, amount: sign * amount };
}

export const weeks: EarningWeek[] = (contract.weeks as RawWeek[]).map(raw => {
 const lines = raw.lines.map(buildLine);
 const { ends, pays } = weekDates(raw.weeksAgo);
  return {
  id: raw.id, state: raw.state as WeekState, ends, pays,
  paidOn: raw.paidDaysAfterPayDate === undefined ? undefined
   : isoDate(new Date(new Date(`${pays}T00:00:00Z`).getTime() + raw.paidDaysAfterPayDate * 86_400_000)),
  failure: raw.failure, lines,
  total: lines.reduce((sum, line) => sum + line.amount, 0),
  visits: lines.filter(line => line.service).length
 };
});

export const currentWeek = weeks.find(w => w.state === 'accruing')!;
/* Received, not earned. Money still on its way is not income a nurse can spend or has to declare
   yet, so the year-to-date figure counts settled weeks only — the same distinction the tax note
   beside it makes. */
export const paidThisTaxYear = weeks.filter(w => stateById(w.state).settled).reduce((sum, w) => sum + w.total, 0);
export const owedNotYetPaid = weeks.filter(w => !stateById(w.state).settled && w.state !== 'accruing').reduce((sum, w) => sum + w.total, 0);

/* What one visit does, in full, so the split is shown once rather than asserted repeatedly. The
   payment cost is the platform's to carry: it is subtracted from what MyThuso keeps, never from
   what the nurse is paid. */
export type Split = { price: number; nurse: number; payment: number; platform: number; nurseShareOfPrice: number };
export function splitOf(service: Service): Split {
 const payment = businessModel.unitEconomics.worked.paymentCost;
 return {
  price: service.price, nurse: service.nurseShare, payment,
  platform: service.price - service.nurseShare - payment,
  nurseShareOfPrice: service.nurseShare / service.price
 };
}
/* The range the public page advertises, taken from the catalogue rather than typed beside it. */
export const phaseOneShares = services.filter(s => s.phase === 1).map(s => s.nurseShare);
export const shareRange = { low: Math.min(...phaseOneShares), high: Math.max(...phaseOneShares) };
