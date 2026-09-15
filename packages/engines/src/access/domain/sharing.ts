/* Whether the son or daughter who pays for a parent's plan may read her visit summaries: only under a grant she made
   herself, for no longer than the caregiver role's ceiling, and never because they pay.

   ── Why this is Access's and not Money's ─────────────────────────────────────────────────────────

   A visit summary is health information, special personal information under POPIA. Money bills the plan and is
   never told what a visit found, so Money's plan read carries no summary for anybody, with or without a grant. The
   grant is the consent contract's (packages/catalog/consent.json): the caregiver recipient role, whose serving
   engine is Access, narrowed by packages/catalog/mom-essential.json to the home-visit record. A sponsor with a grant
   reads a summary through the Passport's consent gateway, where the parent can see that they did; this file decides
   only whether a grant stands, for the screens that say so and for the tests that hold them to it.

   ── What it refuses ──────────────────────────────────────────────────────────────────────────────

   A grant made by anybody but the parent: a sponsor cannot give themselves one, and neither can a guardian, whose
   authority to act for another adult is not proven (docs/governance/INFORMATION-OFFICER.md D-10). A grant longer
   than the caregiver role's ceiling or the founder's ninety-day maximum, whichever is shorter. A grant that has ended
   or been stopped, which shares nothing from the moment it ends. Zero dependencies, so the web preview runs it as the
   tests do. */
import consent from '../../../../catalog/consent.json' with { type: 'json' };
import essential from '../../../../catalog/mom-essential.json' with { type: 'json' };

const summaries = essential.sharing.summaries;
const role = consent.grants.recipientRoles.find(r => r.id === summaries.recipientRole);
if (!role) throw new Error(`packages/catalog/mom-essential.json shares summaries with the recipient role "${summaries.recipientRole}", which packages/catalog/consent.json does not declare.`);
if (role.gateway.reads !== 'records') throw new Error('The caregiver role no longer reads records through the gateway, so no summary grant could be read.');

/** The longest a summary grant may run: the caregiver role's ceiling, never past the founder's maximum. */
export const SUMMARY_DAYS_ALLOWED: number = Math.min(role.maxExpiryDays, consent.grants.maximumExpiryDays);

export type SummaryGrant = {
 readonly subject: string;
 readonly recipientRef: string;
 readonly recipientRole: string;
 readonly scope: readonly string[];
 readonly purpose: string;
 readonly expiresAt: string;
 readonly sealedIncluded: false;
 readonly stoppedAt: string | null;
};
export type GrantAnswer = { readonly ok: true; readonly grant: SummaryGrant } | { readonly ok: false; readonly reason: 'only-the-parent-grants' | 'longer-than-allowed' | 'no-days' };

const DAY = 86_400_000;

/** The parent lets the person who pays read her visit summaries, for a number of days she chooses. */
export function grantSummaries(input: { readonly byRef: string; readonly parentRef: string; readonly sponsorRef: string; readonly days: number; readonly now: Date }): GrantAnswer {
 if (!input.byRef || input.byRef !== input.parentRef) return { ok: false, reason: 'only-the-parent-grants' };
 if (!Number.isInteger(input.days) || input.days < 1) return { ok: false, reason: 'no-days' };
 if (input.days > SUMMARY_DAYS_ALLOWED) return { ok: false, reason: 'longer-than-allowed' };
 return {
  ok: true,
  grant: {
   subject: input.parentRef, recipientRef: input.sponsorRef, recipientRole: role!.id, scope: [...summaries.scope], purpose: summaries.purpose,
   expiresAt: new Date(input.now.getTime() + input.days * DAY).toISOString(), sealedIncluded: false, stoppedAt: null
  }
 };
}

/** She stops it. From that moment it shares nothing; what was read before cannot be unread. */
export const stopGrant = (grant: SummaryGrant, now: Date): SummaryGrant => grant.stoppedAt ? grant : { ...grant, stoppedAt: now.toISOString() };

/** Whether this sponsor may read this parent's visit summaries now, and until when. */
export function summariesShared(grants: readonly SummaryGrant[], parentRef: string, sponsorRef: string, now: Date): { readonly shared: false } | { readonly shared: true; readonly until: string } {
 const standing = grants.find(g => g.subject === parentRef && g.recipientRef === sponsorRef && g.stoppedAt === null && Date.parse(g.expiresAt) > now.getTime() && summaries.scope.every(id => g.scope.includes(id)));
 return standing ? { shared: true, until: standing.expiresAt } : { shared: false };
}
