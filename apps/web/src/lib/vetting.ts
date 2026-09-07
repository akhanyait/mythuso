import schema from '../../../../packages/catalog/vetting.json';
import { validateSaId } from './identity';

/* Vetting is the gate the whole marketplace rests on. Thirteen parties are vetted — not only nurses —
   and every one of them is refused something specific until their checks pass. The roles, the
   checks, the issuing authorities and the renewal cadences are data in
   packages/catalog/vetting.json so that web, iOS and Android cannot quietly disagree about who is
   allowed to do what. scripts/check-boundaries.mjs fails the build if they do.

   Nothing here is a compliance control. It is the design of one, held as data so the three apps
   describe the same gate. No credential is verified, stored or transmitted anywhere. */

export type Authority = typeof schema.authorities[number];
export type Capability = typeof schema.capabilities[number];
export type VettingCheck = typeof schema.roles[number]['checks'][number];
export type VettingRole = typeof schema.roles[number];
export type Grant = VettingRole['grants'][number];

export const authorities: Authority[] = schema.authorities;
export const capabilities: Capability[] = schema.capabilities;
export const roles: VettingRole[] = schema.roles;

export const roleById = (id: string) => roles.find(r => r.id === id);
export const authorityById = (id: string) => authorities.find(a => a.id === id);
export const capabilityById = (id: string) => capabilities.find(c => c.id === id);
/* Scope of practice is part of the gate, not decoration: a nurse is only ever dispatched inside it,
   and a laboratory only offers what its accreditation schedule covers. It lives in the contract
   because three apps offering three different scope lists is the same drift as three reference
   ranges, and harder to notice. */
export type Scope = NonNullable<typeof schema.roles[number]['scope']>;
export const scopeFor = (roleId: string): Scope | undefined => (roleById(roleId) as { scope?: Scope } | undefined)?.scope;
export const checkById = (roleId: string, checkId: string) => roleById(roleId)?.checks.find(c => c.id === checkId);

/* ---- Credential formats ----------------------------------------------------------------
   A real "that is not a SANC number" answer, given locally, without sending anything anywhere.
   The formats are the ones the issuing bodies actually use; the numbers entered are fictional. */
export function validateCredential(authorityId: string, value: string): { ok: boolean; reason?: string } {
 const authority = authorityById(authorityId);
 if (!authority) return { ok: false, reason: 'Unknown issuing authority.' };
 const entry = value.trim();
 if (!authority.pattern) return { ok: true };                       // MyThuso-held checks have nothing to type
 if (!entry) return { ok: false, reason: authority.hint };
 if (authority.pattern === 'sa-id') {
  const result = validateSaId(entry);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
 }
 return new RegExp(authority.pattern).test(entry) ? { ok: true } : { ok: false, reason: authority.hint };
}

/* ---- The state of one check ------------------------------------------------------------ */
export const checkStates = ['outstanding', 'submitted', 'in-review', 'verified', 'expiring', 'lapsed', 'declined'] as const;
export type CheckState = typeof checkStates[number];
export const checkStateLabels: Record<CheckState, string> = {
 outstanding: 'Outstanding', submitted: 'Submitted', 'in-review': 'In review',
 verified: 'Verified', expiring: 'Expiring', lapsed: 'Lapsed', declined: 'Declined'
};
/* Which states let the capability through. "Expiring" still passes — a nurse whose clearance runs
   out in three weeks is dispatchable today, and is told about it. */
export const passingStates: CheckState[] = ['verified', 'expiring'];

export type CheckRecord = {
 checkId: string;
 state: CheckState;
 /* ISO dates. A preview has no clock of its own, so fixtures are written relative to today. */
 decidedOn?: string;
 expiresOn?: string;
 decidedBy?: string;
 /* High-risk checks need a second, different reviewer before they count as verified. */
 secondedBy?: string;
 evidence?: string;
 note?: string;
};

export type VettingSubject = {
 id: string;
 name: string;
 roleId: string;
 reference: string;               // the credential the role hangs on, e.g. a SANC number
 zone?: string;
 scope?: string[];
 records: CheckRecord[];
 suspended?: boolean;
 suspendedReason?: string;
 declined?: boolean;
 declinedReason?: string;
 appealed?: boolean;
};

export const EXPIRY_WARNING_DAYS = 45;
export const today = () => new Date();
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
/* Fixtures say "three weeks from now" rather than a date, so the preview never goes stale. */
export const inDays = (days: number) => isoDate(new Date(Date.now() + days * 86_400_000));
export const inMonths = (months: number) => inDays(Math.round(months * 30.44));
export function daysUntil(iso?: string): number | null {
 if (!iso) return null;
 return Math.ceil((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}
export const formatDate = (iso?: string) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* A stored "verified" is only true until its expiry date. Resolving the state here — rather than
   trusting what was written down — is what makes the scheduled re-vetting real rather than a claim
   in a paragraph of copy. */
export function resolveState(record: CheckRecord): CheckState {
 if (record.state !== 'verified') return record.state;
 const days = daysUntil(record.expiresOn);
 if (days === null) return 'verified';
 if (days < 0) return 'lapsed';
 if (days <= EXPIRY_WARNING_DAYS) return 'expiring';
 return 'verified';
}
export function recordFor(subject: VettingSubject, checkId: string): CheckRecord {
 return subject.records.find(r => r.checkId === checkId) ?? { checkId, state: 'outstanding' };
}
export function stateOf(subject: VettingSubject, checkId: string): CheckState {
 return resolveState(recordFor(subject, checkId));
}
/* A high-risk check is not verified on one person's say-so. */
export function needsSecondReviewer(subject: VettingSubject, checkId: string): boolean {
 const check = checkById(subject.roleId, checkId);
 const record = recordFor(subject, checkId);
 return check?.risk === 'high' && passingStates.includes(resolveState(record)) && !record.secondedBy;
}

/* ---- The state of a whole party -------------------------------------------------------- */
export type SubjectStatus = 'cleared' | 'expiring' | 'suspended' | 'declined' | 'in-progress';
export const subjectStatusLabels: Record<SubjectStatus, string> = {
 cleared: 'Cleared', expiring: 'Renewal due', suspended: 'Suspended', declined: 'Declined', 'in-progress': 'In progress'
};
export function summarise(subject: VettingSubject) {
 const checks = roleById(subject.roleId)?.checks ?? [];
 const states = checks.map(c => ({ check: c, state: stateOf(subject, c.id) }));
 const passing = states.filter(s => passingStates.includes(s.state));
 const lapsed = states.filter(s => s.state === 'lapsed');
 const declined = states.filter(s => s.state === 'declined');
 const expiring = states.filter(s => s.state === 'expiring');
 const awaitingSecond = states.filter(s => needsSecondReviewer(subject, s.check.id));
 const blocking = states.filter(s => !passingStates.includes(s.state)).map(s => s.check);
 const status: SubjectStatus =
  subject.declined || declined.length ? 'declined'
   : subject.suspended || lapsed.length ? 'suspended'
    : blocking.length || awaitingSecond.length ? 'in-progress'
     : expiring.length ? 'expiring' : 'cleared';
 /* The soonest renewal, which is what a dashboard should count down to. */
 const nextDue = states
  .map(s => ({ check: s.check, days: daysUntil(recordFor(subject, s.check.id).expiresOn) }))
  .filter((s): s is { check: VettingCheck; days: number } => s.days !== null)
  .sort((a, b) => a.days - b.days)[0];
 return {
  checks, states, status, blocking, lapsed, expiring, awaitingSecond, nextDue,
  passed: passing.length, total: checks.length,
  progress: checks.length ? passing.length / checks.length : 0,
  cleared: status === 'cleared' || status === 'expiring'
 };
}

/* ---- The blocking matrix ---------------------------------------------------------------
   This is the whole point of the module: not a list of documents, but a refusal with a reason
   attached to it, that other screens can ask about before offering an action. */
/* Role names are written for people, so "Internal admin staff" is plural and "Employer" takes "an".
   A refusal that reads "A internal admin staff is never granted this" is a refusal nobody trusts. */
const PLURAL_ROLE_NAMES = /staff$/i;
export function neverGranted(role?: VettingRole): string {
 if (!role) return 'This party is never granted that.';
 if (PLURAL_ROLE_NAMES.test(role.name)) return `${role.name} are never granted this.`;
 /* The name is used as written: lowercasing it would turn "Thuso Corner site" into "thuso corner
    site" and "B2B" into "b2b", and a refusal that misspells the reader's own role is not trusted. */
 return `${/^[AEIOU]/i.test(role.name) ? 'An' : 'A'} ${role.name} is never granted this.`;
}
export type Decision = { allowed: boolean; reason?: string; blockedBy: VettingCheck[] };
export function can(subject: VettingSubject, capabilityId: string): Decision {
 const role = roleById(subject.roleId);
 const grant = role?.grants.find(g => g.capability === capabilityId);
 if (!grant) return { allowed: false, reason: neverGranted(role), blockedBy: [] };
 const summary = summarise(subject);
 if (subject.declined) return { allowed: false, reason: subject.declinedReason ?? grant.refusal, blockedBy: summary.blocking };
 if (subject.suspended) return { allowed: false, reason: subject.suspendedReason ?? grant.refusal, blockedBy: summary.blocking };
 if (summary.lapsed.length) return { allowed: false, reason: `${summary.lapsed.map(l => l.check.name).join(' and ')} lapsed. ${grant.refusal}`, blockedBy: summary.lapsed.map(l => l.check) };
 if (summary.awaitingSecond.length) return { allowed: false, reason: `${summary.awaitingSecond.map(a => a.check.name).join(' and ')} still needs a second reviewer. ${grant.refusal}`, blockedBy: summary.awaitingSecond.map(a => a.check) };
 if (summary.blocking.length) return { allowed: false, reason: grant.refusal, blockedBy: summary.blocking };
 return { allowed: true, blockedBy: [] };
}
/* Every capability the role could hold, with the answer for this party. Drives the matrix view. */
export function decisions(subject: VettingSubject) {
 return (roleById(subject.roleId)?.grants ?? []).map(g => ({
  capability: capabilityById(g.capability)!, grant: g, decision: can(subject, g.capability)
 }));
}

/* ---- Append-only decision audit --------------------------------------------------------
   docs/PRIVACY-AND-SECURITY.md lists an append-only audit as not built. This is the design of one:
   entries are only ever added, and the helper returns a new array rather than mutating, so nothing
   in the UI can quietly rewrite a decision that was already taken. */
export type VettingEventKind = 'submitted' | 'verified' | 'seconded' | 'declined' | 'suspended' | 'restored' | 'appealed' | 'renewed' | 'lapsed';
export type VettingEvent = {
 id: string;
 at: string;                      // ISO timestamp
 subjectId: string;
 subjectName: string;
 roleId: string;
 checkId?: string;
 kind: VettingEventKind;
 actor: string;
 evidence?: string;
 note?: string;
};
export const eventLabels: Record<VettingEventKind, string> = {
 submitted: 'Evidence submitted', verified: 'Check verified', seconded: 'Second reviewer agreed',
 declined: 'Declined', suspended: 'Suspended', restored: 'Restored', appealed: 'Appeal lodged',
 renewed: 'Renewed', lapsed: 'Lapsed automatically'
};
let sequence = 0;
export function recordEvent(log: VettingEvent[], event: Omit<VettingEvent, 'id' | 'at'> & { at?: string }): VettingEvent[] {
 return [{ ...event, at: event.at ?? new Date().toISOString(), id: `VE-${String(++sequence).padStart(5, '0')}` }, ...log];
}
export const formatEventTime = (iso: string) => new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
