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
import { EXPIRY_WARNING_DAYS, resolveState, type CheckState } from '../protection/index.ts';
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

const DAY = 86_400_000;

/** Whole days, from the start of today to the expiry date. Negative once it has passed. */
export function daysUntil(iso: string | null | undefined, now: number): number | null {
 if (!iso) return null;
 const at = new Date(`${iso}T00:00:00Z`).getTime();
 if (Number.isNaN(at)) return null;
 return Math.ceil((at - now) / DAY);
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
