/* A complaint about a visit, from arriving to decided.
 *
 * A COMPLAINT NEVER MOVES A SCORE. The complaint rate is one of the Trust Score's soft inputs and its weight is
 * null in packages/catalog/trust.json: nobody has decided how much a complaint should count. So nothing in this
 * file reads or writes a score, a weight, a tier or a suspension, and a complaint, or a decision about one, that
 * arrives carrying anything beside what the route declares is refused unread — a score change riding along on a
 * complaint is the weight nobody decided, chosen by whoever sent it. The event a complaint publishes carries the
 * review deadline and nothing about the nurse, and an upheld decision publishes nothing at all.
 *
 * WHAT THE NURSE IS TOLD, AND WHAT SHE IS NOT. That a complaint about her exists, its kind, its state and its
 * outcome, and no more: never who made it, which visit, what was written or when it arrived. The contract says
 * complainantShownToNurse: false and says why. A reviewer who is the person complained about is refused the
 * complaint and its decision, because reading it is reading who complained.
 *
 * THE WINDOW IS THE ONE IT ARRIVED UNDER. reviewBy is worked out from complaint-review-hours in force when the
 * complaint arrives and kept on it, so the queue's age is measured against the window a complaint was promised,
 * and a window made longer later never makes a late review on time.
 *
 * NO HEADER CARRIES A PROTECTED CATEGORY. A queue row and a notice carry a category id from a closed list, none of
 * which is a protected category in packages/catalog/records.json, and never the account, which is where a
 * condition would be written.
 */
import { HOUR, categoryIds, complaintMaxCharacters, done, instant, outcomeIds, refused, type Result } from './contract.ts';
import type { Standing } from './register.ts';
import type { TrustInForce } from './settings.ts';

export type Decision = { readonly outcomeCode: string; readonly reason: string; readonly byRef: string; readonly at: number };
export type Complaint = {
 readonly complaintRef: string;
 readonly partyRef: string;
 readonly appointmentRef: string;
 readonly categoryCode: string;
 readonly whatHappened: string;
 readonly complainantRole: string;
 readonly complainantRef: string | null;
 readonly receivedAt: number;
 readonly reviewBy: number;
 readonly reviewWithinHours: number;
 readonly settingsVersion: number;
 readonly decision: Decision | null;
};

export function receiveComplaint(
 input: { complaintRef: string; partyRef: string; appointmentRef: string; categoryCode: unknown; whatHappened: unknown; undeclared: readonly string[]; complainantRole: string; complainantRef: string | null },
 standing: Standing | null, settings: TrustInForce, now: number
): Result<Complaint> {
 if (input.undeclared.length) return refused('complaint-carries-no-weight');
 if (!standing) return refused('unknown-party');
 if (input.complainantRef !== null && input.complainantRef === input.partyRef) return refused('complaint-about-yourself');
 if (typeof input.categoryCode !== 'string' || !categoryIds.has(input.categoryCode)) return refused('complaint-category-unknown');
 const account = typeof input.whatHappened === 'string' ? input.whatHappened.trim() : '';
 if (!account || account.length > complaintMaxCharacters) return refused('complaint-account-empty-or-long');
 const complaint: Complaint = {
  complaintRef: input.complaintRef, partyRef: input.partyRef, appointmentRef: input.appointmentRef, categoryCode: input.categoryCode,
  whatHappened: account, complainantRole: input.complainantRole, complainantRef: input.complainantRef,
  receivedAt: now, reviewBy: now + settings.complaintReviewHours * HOUR, reviewWithinHours: settings.complaintReviewHours,
  settingsVersion: settings.settingsVersion, decision: null
 };
 return done(complaint, [{ type: 'trust.complaint.received', version: 1, payload: { complaintRef: complaint.complaintRef, reviewBy: instant(complaint.reviewBy) } }]);
}

/** A reviewer opening one complaint. */
export function openComplaint(complaint: Complaint | undefined, byRef: string | null): Result<Complaint> {
 if (!complaint) return refused('no-such-complaint');
 if (byRef !== null && byRef === complaint.partyRef) return refused('complaint-about-you');
 return done(complaint);
}

export function decideComplaint(complaint: Complaint | undefined, input: { outcomeCode: unknown; reason: unknown; byRef: string | null; undeclared: readonly string[] }, now: number): Result<Complaint> {
 const opened = openComplaint(complaint, input.byRef);
 if (!opened.ok) return opened;
 if (input.undeclared.length) return refused('complaint-decision-carries-no-weight');
 if (opened.value.decision) return refused('complaint-already-decided');
 if (typeof input.outcomeCode !== 'string' || !outcomeIds.has(input.outcomeCode)) return refused('complaint-outcome-unknown');
 const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
 if (!reason) return refused('complaint-decision-without-reason');
 return done({ ...opened.value, decision: { outcomeCode: input.outcomeCode, reason, byRef: input.byRef ?? '', at: now } });
}

export type QueueRow = {
 readonly complaintRef: string; readonly partyRef: string; readonly categoryCode: string; readonly state: 'awaiting-review' | 'decided';
 readonly receivedAt: string; readonly reviewBy: string; readonly reviewWithinHours: number; readonly ageHours: number; readonly overdue: boolean; readonly settingsVersion: number;
};
/* The header a reviewer's queue carries, and nothing else: no account, no complainant, no visit. */
export const queueRow = (c: Complaint, now: number): QueueRow => ({
 complaintRef: c.complaintRef, partyRef: c.partyRef, categoryCode: c.categoryCode, state: c.decision ? 'decided' : 'awaiting-review',
 receivedAt: instant(c.receivedAt), reviewBy: instant(c.reviewBy), reviewWithinHours: c.reviewWithinHours,
 ageHours: Math.floor(((c.decision?.at ?? now) - c.receivedAt) / HOUR), overdue: !c.decision && now > c.reviewBy, settingsVersion: c.settingsVersion
});
export const complaintQueue = (all: readonly Complaint[], now: number): QueueRow[] =>
 [...all].sort((a, b) => a.receivedAt - b.receivedAt).map(c => queueRow(c, now));

export type Notice = { readonly complaintRef: string; readonly categoryCode: string; readonly state: 'awaiting-review' | 'decided'; readonly outcomeCode: string | null };
/* What the nurse a complaint is about is told: the contract's nurseSees, and not a field more. */
export const noticesFor = (all: readonly Complaint[], partyRef: string): Notice[] => all.filter(c => c.partyRef === partyRef)
 .map(c => ({ complaintRef: c.complaintRef, categoryCode: c.categoryCode, state: c.decision ? 'decided' : 'awaiting-review', outcomeCode: c.decision?.outcomeCode ?? null }));
