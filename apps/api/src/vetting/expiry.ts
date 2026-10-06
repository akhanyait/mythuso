/**
 * When a check runs out, and when somebody is told.
 *
 * Pure: dates in, states and warnings out. No database and no clock of its own, which is what lets a
 * test pin down the awkward days rather than discovering them on a nurse's police clearance.
 *
 * ── The rule that shapes all of it: a missed run must never lose a warning ────────────────────
 *
 * A nightly sweep will sometimes not run. The server reboots, the job overruns, somebody stops the
 * unit to take a backup and forgets to start it. If a milestone only fired on the exact day it fell
 * due, a certificate would pass its forty-five-day warning in silence and nobody would hear about it
 * until the fortnight one. So a milestone is due once the date has been *reached or passed* and it
 * has not been sent — and a dedupe key is what stops it then firing every night for six weeks, which
 * is the failure that teaches people to filter the mailbox.
 *
 * ── Why one warning at a time ────────────────────────────────────────────────────────────────
 *
 * A certificate that is added to the vault three weeks before it expires has passed forty-five days
 * and fourteen days on the same morning. Sending both would deliver two notifications about one
 * document, headed with two different numbers, one of which is wrong: it is not forty-five days out,
 * it is nineteen. The smallest passed milestone is the one that describes where the document
 * actually is, so that is the one sent. The larger ones are recorded as superseded — dealt with,
 * never delivered — so they cannot resurface tomorrow.
 */
import { daysUntil as calendarDaysUntil, EXPIRY_WARNING_DAYS, resolveState, type CheckState } from '../protection/index.ts';
import type { Evidence } from './contract.ts';

/**
 * The days out at which somebody is told.
 *
 * Forty-five is not a fifth copy of the number: it is imported from the gate, which is the same one
 * apps/web, iOS and Android carry and scripts/check-boundaries.mjs holds all four to. It is the day
 * a stored "verified" starts reading as "expiring", so it is also the day the first warning belongs.
 * Fourteen is the last point at which a SAPS clearance can plausibly be renewed in time. Zero is the
 * day it stops counting, which is a different message and not a warning at all.
 */
export const RENEWAL_MILESTONES: readonly number[] = [EXPIRY_WARNING_DAYS, 14, 0];

/**
 * How often an authority is asked again where the check itself states no cadence.
 *
 * Twelve months, and it is MyThuso's own setting rather than anything an Act says — which is
 * exactly the distinction personalData.ts makes about every retention period, and it is made here
 * for the same reason. A register's answer is a statement about one moment: a registration can be
 * withdrawn, a licence suspended and an accreditation lapsed between renewals, and none of those
 * events sends anybody a letter. An identity confirmation and a qualification have no renewal
 * cadence of their own and would otherwise be asked once and believed for ever.
 */
export const AUTHORITY_ANSWER_MONTHS = 12;

/**
 * When an authority answer stops being current.
 *
 * The check's own cadence where it has one — a SANC registration renews annually, so an answer
 * older than that is an answer about a registration that has since been renewed or has not — and
 * twelve months where it does not.
 */
export function authorityAnswerDueAt(checkedAt: number, renewMonths: number | null): number {
 const due = new Date(checkedAt);
 due.setUTCMonth(due.getUTCMonth() + (renewMonths ?? AUTHORITY_ANSWER_MONTHS));
 return due.getTime();
}

/**
 * Whole calendar days to an expiry, in the zone the contract names — the gate's arithmetic, not a
 * second copy of it. Counted this way rather than against a UTC instant because an expiry is a
 * calendar date and both phones resolve one against a calendar day; the UTC version left the server
 * gate open between midnight and two in the morning in Johannesburg (see protection/gate.ts).
 *
 * The one difference this module keeps is the answer for a date nobody can read. The gate returns
 * NaN so `resolveState` can call an unreadable expiry lapsed without mistaking it for an absent one,
 * and the same distinction matters here: `resolve()` reads a null as "unparseable, therefore lapsed"
 * while `noticesFor` reads it as "no warning to send", and every other caller fails closed through
 * `?? -1`. Collapsing NaN to null keeps both readings true rather than making each caller test twice.
 */
export function daysUntil(iso: string | null | undefined, now: number): number | null {
 const days = calendarDaysUntil(iso, now);
 return days !== null && Number.isNaN(days) ? null : days;
}

/** The expiry a check earns from its own cadence, so a renewal date is arithmetic rather than typed. */
export function expiryFrom(issuedOn: string, renewMonths: number | null): string | null {
 if (!renewMonths) return null;
 const from = new Date(`${issuedOn}T00:00:00Z`);
 if (Number.isNaN(from.getTime())) return null;
 from.setUTCMonth(from.getUTCMonth() + renewMonths);
 return from.toISOString().slice(0, 10);
}

/**
 * The state of one piece of evidence, now.
 *
 * The arithmetic itself is the gate's, imported rather than repeated, so a record the gate would
 * call lapsed cannot read as verified in the console beside it. What is added here is the awkward
 * case the gate does not need: an expiry that cannot be parsed is treated as lapsed, because an
 * expiry nobody can read has not passed the test.
 */
export function resolve(evidence: Evidence, now: number): CheckState {
 if (evidence.state === 'verified' && evidence.expiresOn && daysUntil(evidence.expiresOn, now) === null) return 'lapsed';
 return resolveState({ checkId: evidence.checkId, state: evidence.state, ...(evidence.expiresOn ? { expiresOn: evidence.expiresOn } : {}), ...(evidence.secondedBy ? { secondedBy: evidence.secondedBy } : {}) }, now);
}

export type NoticeSeverity = 'due' | 'urgent' | 'lapsed';
export type RenewalNotice = {
 /** Stable across runs, so a milestone is sent exactly once however often the sweep runs. */
 dedupeKey: string;
 evidenceId: string;
 partyId: string;
 checkId: string;
 milestoneDays: number;
 daysRemaining: number;
 severity: NoticeSeverity;
 headline: string;
 body: string;
};

export const dedupeKey = (evidenceId: string, milestoneDays: number): string => `vetting:${evidenceId}:${milestoneDays}`;

/** How loudly. A lapsed check has already suspended the party, so it is not a warning any more. */
export function severityFor(daysRemaining: number): NoticeSeverity {
 if (daysRemaining < 0) return 'lapsed';
 if (daysRemaining <= 14) return 'urgent';
 return 'due';
}

function describe(checkName: string, expiresOn: string, daysRemaining: number): { headline: string; body: string } {
 if (daysRemaining < 0) {
  /* Said as a consequence rather than as a status, because the consequence has already happened:
     the gate resolved this on its own the first time somebody tried to dispatch her. */
  return {
   headline: `${checkName} lapsed ${Math.abs(daysRemaining)} days ago`,
   body: `${checkName} expired on ${expiresOn}. The capabilities it carries are already withheld — this is not a warning that something will happen, it is a notice that it has.`
  };
 }
 if (daysRemaining === 0) {
  return { headline: `${checkName} expires today`, body: `${checkName} expires today, ${expiresOn}. After today the capabilities it carries are withheld automatically.` };
 }
 return {
  headline: daysRemaining <= 14 ? `${checkName} expires in ${daysRemaining} days` : `${checkName} expires in ${daysRemaining} days — start the renewal`,
  /* The forty-five-day message says what a South African renewal actually costs in calendar time.
     A SAPS clearance ordered in the week it is needed is a nurse who stops being dispatchable. */
  body: `${checkName} expires on ${expiresOn}. Renewals through the issuing authority routinely take longer than expected, so this is the last comfortable point to start rather than the first urgent one.`
 };
}

/**
 * Which warning is due for one piece of evidence, and which milestones it silently overtook.
 *
 * `alreadySent` is the set of dedupe keys the store has recorded — sent or superseded, both count as
 * dealt with. A milestone passed a fortnight ago while nothing was running still fires once; it
 * never fires twice.
 */
export function noticesFor(
 evidence: Evidence,
 checkName: string,
 now: number,
 alreadySent: ReadonlySet<string>
): { send: RenewalNotice | null; superseded: string[] } {
 /* Only a verified check has a renewal to warn about. An outstanding one is not expiring, it is
    missing, and the console already shows it as missing — warning about it would bury the real
    renewals under noise about people who never started. */
 if (evidence.state !== 'verified' || !evidence.expiresOn) return { send: null, superseded: [] };
 const daysRemaining = daysUntil(evidence.expiresOn, now);
 if (daysRemaining === null) return { send: null, superseded: [] };

 const passed = [...new Set(RENEWAL_MILESTONES)]
  .sort((a, b) => a - b)
  .filter(milestone => daysRemaining <= milestone)
  .map(milestone => ({ milestone, key: dedupeKey(evidence.id, milestone) }))
  .filter(entry => !alreadySent.has(entry.key));
 const first = passed[0];
 if (!first) return { send: null, superseded: [] };

 const { headline, body } = describe(checkName, evidence.expiresOn, daysRemaining);
 return {
  send: {
   dedupeKey: first.key, evidenceId: evidence.id, partyId: evidence.partyId, checkId: evidence.checkId,
   milestoneDays: first.milestone, daysRemaining, severity: severityFor(daysRemaining), headline, body
  },
  /* Everything above the one being sent is already in the past. Recorded so it cannot come back. */
  superseded: passed.slice(1).map(entry => entry.key)
 };
}
