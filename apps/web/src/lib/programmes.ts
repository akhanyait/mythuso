import contract from '../../../../packages/catalog/programmes.json';
import { services } from './catalog';
import { inDays } from './vetting';
/* An employer runs a wellness programme; a sponsor pays for somebody's care.
 *
 * Both are vetted parties already, and both have a hard refusal attached in
 * packages/catalog/vetting.json — an employer may pay for care and still never see who used it; a
 * sponsorship is a payment and not a permission. Those two sentences are the feature, and this
 * module is what makes them arithmetic rather than assurance.
 *
 * The whole of it is `suppress()`. An employer is shown counts of people, and a count of people is
 * a disclosure about every one of them, so which counts may be published at all is decided here
 * rather than by whoever is drawing the table:
 *
 *   The floor. Nothing is reported about a group of fewer than twelve. A department of four is not
 *   anonymous, and rounding it does not make it so.
 *
 *   Dominance. A group of fourteen in which thirteen answered the same way tells the employer there
 *   is exactly one person who did not. Suppressed whichever way round it falls, because "almost
 *   nobody" identifies as surely as "almost everybody".
 *
 *   Secondary suppression, which is the rule everybody leaves out. If the floor and dominance hide
 *   only one group, that group is the total minus the ones that were published — so a second group
 *   is hidden as well, the smallest that was going to be reported, and the subtraction stops
 *   working. Without this step the other two are decorative.
 *
 *   Rounding, to the nearest five. Two reports a month apart are the easiest thing in the world to
 *   lay side by side, and a figure that moves by one names the person who moved it.
 *
 * The counts in the contract are unsuppressed on purpose. The suppression is done here, in
 * Programmes.swift and in Programmes.kt from the same numbers — because a pre-suppressed table in
 * the contract would mean the rule lived in a generator, and the unsuppressed version would be one
 * request away.
 *
 * Nothing here reports anything. No employer is contacted, no payment is taken, and every company,
 * cohort and person below is fictional. */

export const floor = contract.floor;
export const employer = contract.employer;
export const sponsor = contract.sponsor;
export const rules = contract.rules;
export const refusals = contract.refusals;
export const suppressionReasons = contract.suppressionReasons;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
export const suppressionReasonById = (id: string) => suppressionReasons.find(r => r.id === id)!;

export type Cohort = { id: string; name: string; eligible: number; tookPart: number; advisedToSeeADoctor: number };
export type Programme = { id: string; name: string; employer: string; startedInDays: number; note: string; cohorts: Cohort[] };
export const programmes: Programme[] = contract.programmes;
export const programmeById = (id: string) => programmes.find(p => p.id === id)!;

export type SuppressionReasonId = 'below-floor' | 'dominated' | 'secondary';
export type ReportedCohort = {
 cohort: Cohort;
 /* undefined means the row is published. Anything else is the reason it is not, said in the
    contract's own words rather than left as a blank somebody will go and ask about. */
 suppressedBy?: SuppressionReasonId;
 eligible: number; tookPart: number; advisedToSeeADoctor: number; uptake: number;
};

/* To the nearest five, always in the same direction, so the same cohort reported twice gives the
   same answer. */
export const roundOff = (n: number) => Math.round(n / floor.roundTo) * floor.roundTo;
/* One answer covering four fifths of the group, whichever answer it is. */
export const isDominated = (c: Cohort) =>
 c.tookPart > 0 && Math.max(c.advisedToSeeADoctor, c.tookPart - c.advisedToSeeADoctor) / c.tookPart >= floor.dominanceCeiling;

export type Report = {
 programme: Programme;
 rows: ReportedCohort[];
 /* The whole-programme figures, which are reportable when the programme as a whole clears the
    floor even where several of its groups do not. */
 total: { eligible: number; tookPart: number; advisedToSeeADoctor: number; uptake: number };
 suppressed: ReportedCohort[];
 /* Deliberately not equal to the total. If it were, the suppressed rows could be had by
    subtracting, and every rule above would be decorative. */
 publishedTookPart: number;
 reconciles: boolean;
};

export function suppress(programme: Programme): Report {
 const rows: ReportedCohort[] = programme.cohorts.map(cohort => ({
  cohort,
  suppressedBy: cohort.tookPart < floor.minimumCohort || cohort.eligible < floor.minimumCohort ? 'below-floor'
   : isDominated(cohort) ? 'dominated' : undefined,
  eligible: roundOff(cohort.eligible), tookPart: roundOff(cohort.tookPart),
  advisedToSeeADoctor: roundOff(cohort.advisedToSeeADoctor),
  uptake: cohort.eligible ? cohort.tookPart / cohort.eligible : 0
 }));
 /* Secondary suppression. One hidden row is a subtraction away from being visible, so the smallest
    row that was going to be published is withheld with it — smallest, because withholding the
    largest costs the report the most and protects nobody more. */
 while (rows.filter(r => r.suppressedBy).length > 0 && rows.filter(r => r.suppressedBy).length < floor.minimumSuppressed) {
  const next = rows.filter(r => !r.suppressedBy).sort((a, b) => a.cohort.tookPart - b.cohort.tookPart)[0];
  if (!next) break;
  next.suppressedBy = 'secondary';
 }
 const sum = (pick: (c: Cohort) => number) => programme.cohorts.reduce((t, c) => t + pick(c), 0);
 const eligible = sum(c => c.eligible), tookPart = sum(c => c.tookPart);
 const publishedTookPart = rows.filter(r => !r.suppressedBy).reduce((t, r) => t + r.tookPart, 0);
 return {
  programme, rows,
  total: {
   eligible: roundOff(eligible), tookPart: roundOff(tookPart),
   advisedToSeeADoctor: roundOff(sum(c => c.advisedToSeeADoctor)),
   uptake: eligible ? tookPart / eligible : 0
  },
  suppressed: rows.filter(r => r.suppressedBy),
  publishedTookPart,
  reconciles: publishedTookPart === roundOff(tookPart)
 };
}

/* ---- The sponsor's statement ----------------------------------------------------------------
   A line names a service; what it cost is that service's price in packages/catalog/services.json —
   the same row the recipient would have been quoted from if she were paying herself, because a
   sponsored visit is not a different visit. There is nowhere in the contract to type an amount.

   Whether the service is named at all is the recipient's switch, not the sponsor's. The default is
   an amount and a date, because a line reading "sexual health screening" discloses more than most
   diagnoses do. */
export type StatementLine = { on: string; amount: number; service: string };
const priceOf = (id: string) => {
 const service = services.find(s => s.id === id);
 if (!service) throw new Error(`A sponsor statement line names a service that is not in the catalogue: ${id}`);
 return service;
};
export const statement = {
 ...contract.statement,
 lines: contract.statement.lines.map(line => {
  const service = priceOf(line.service);
  return { on: inDays(line.onDays), amount: service.price, service: service.name } as StatementLine;
 })
};
export const spent = statement.lines.reduce((total, line) => total + line.amount, 0);
export const remaining = statement.setAside - spent;

export const startedOn = (p: Programme) => inDays(p.startedInDays);
export const formatDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
export const percent = (n: number) => `${Math.round(n * 100)}%`;
