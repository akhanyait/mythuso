import contract from '../../../../packages/catalog/sos.json';
import { businessModel, services } from './catalog';
/* The emergency pathway — the reasoning, without a screen attached to it.
 *
 * This is the one place in MyThuso where being wrong is dangerous rather than inconvenient, and
 * three things about this module are the feature rather than its plumbing:
 *
 * The emergency numbers are read from the contract and are never assembled, formatted or derived.
 * 10177, 112 and 10111 are the real South African numbers; scripts/check-boundaries.mjs asserts
 * that they are still those digits on every build, on all three platforms, because a wrong digit
 * here is not a cosmetic defect.
 *
 * `route()` is routing, not triage. It does not score, weight, rank or total anything. Any ticked
 * condition returns 'emergency-services' on the first line, before the area and the callback are
 * read at all — one tick is enough, and nothing after it can downgrade the answer. There is no
 * branch in this function that forms a view about how ill anybody is, and that absence is the
 * contract: MyThuso does not decide who is sick.
 *
 * The target and the estimate are different things. `targetMinutes` is the duration of the `sos`
 * row in packages/catalog/services.json — the same row the patient is quoted R398 from — so the
 * promise on the screen is the service being sold and cannot drift from it. It is a target. The
 * arrival estimate comes from packages/geo, which says it does not know rather than guessing, and
 * the two are never rendered as one number. */

const sosService = services.find(s => s.id === 'sos')!;
const alertPlan = businessModel.subscriptions.find(s => s.id === 'alert')!;

/* The catalogue's numbers, read once. Nothing below restates any of them, and the contract has
   nowhere to type them: a sentence that needs the target writes {target} and is filled in here. */
export const targetMinutes = sosService.duration;
export const visitPrice = sosService.price;
export const visitNurseShare = sosService.nurseShare;
export const visitPhase = sosService.phase;
export const alertMonthly = alertPlan.price!;
export const alertPhase = alertPlan.phase;
const fill = (text: string) => text.replace(/\{target\}/g, String(targetMinutes));

export const emergency = contract.emergency;
export const redFlags = contract.redFlags;
export const conditions = contract.redFlags.conditions;
export const routing = contract.routing;
export const outcomes = contract.outcomes;
export const coverage = contract.coverage;
export const standDown = contract.standDown;
export const failures = contract.failures;
export const alert = contract.alert;
export const record = contract.record;
/* Filled where they are read, so no screen can render a rule with a {target} still in it. */
export const target = {
 title: fill(contract.target.title), statement: fill(contract.target.statement),
 whenItCannotBeMet: fill(contract.target.whenItCannotBeMet), arrivalUnknown: fill(contract.target.arrivalUnknown),
 estimateIsNotTheTarget: fill(contract.target.estimateIsNotTheTarget)
};
export const rules = contract.rules.map(r => ({ ...r, title: fill(r.title), sentence: fill(r.sentence) }));
export const refusals = contract.refusals;

export const numberById = (id: string) => emergency.numbers.find(n => n.id === id)!;
export const conditionById = (id: string) => conditions.find(c => c.id === id);
export const outcomeById = (id: string) => outcomes.find(o => o.id === id)!;
export const failureById = (id: string) => failures.find(f => f.id === id)!;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;

/* What the person answered. Three fields, and not one of them is a severity. */
export type Answers = { flagged: string[]; area: string | null; canAnswerAPhone: boolean | null };
export const noAnswers: Answers = { flagged: [], area: null, canAnswerAPhone: null };
/* Where an answer sends somebody. A refusal is a door too, and it carries the failure it is, so
   that "we cannot help" always arrives with the reason and the alternative attached. */
export type Door = { kind: 'emergency-services' } | { kind: 'urgent-visit' } | { kind: 'refused'; failureId: string };

/* Routing, not triage.
 *
 * Read the order. A ticked condition returns on the first line, before the area and before the
 * callback. Then the two questions that are about reach rather than about the person: can a nurse
 * get there, and is there a phone to ring. The vetting gate is last and is not a judgement about
 * the caller at all — it is the same gate that stops the dispatch board, asked again because the
 * one moment a shortcut is easiest to justify is the moment somebody is frightened. */
export function route(answers: Answers, { openNow, cleared }: { openNow: boolean; cleared: boolean }): Door {
 if (answers.flagged.length) return { kind: 'emergency-services' };
 if (!answers.area || !coverage.areas.includes(answers.area)) return { kind: 'refused', failureId: 'outside-coverage' };
 if (!openNow) return { kind: 'refused', failureId: 'outside-hours' };
 if (answers.canAnswerAPhone === false) return { kind: 'refused', failureId: 'no-callback' };
 if (!cleared) return { kind: 'refused', failureId: 'vetting' };
 return { kind: 'urgent-visit' };
}
export const outcomeFor = (door: Door) => outcomeById(door.kind === 'refused' ? 'cannot-help' : door.kind);

/* The label for the target, which is never the label for an arrival estimate. Two different things,
   never rendered as one number. */
export const targetLabel = `Under ${targetMinutes} minutes · target`;
export const isOpenAt = (hhmm: string) => hhmm >= coverage.hours.opensAt && hhmm < coverage.hours.closesAt;
