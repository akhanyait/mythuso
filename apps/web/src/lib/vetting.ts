import schema from '../../../../packages/catalog/vetting.json';
import { validateSaId } from './identity';
import { isoIn, timezone } from './scheduling';

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
/* ---- One calendar for the whole gate ----------------------------------------------------------
   An expiry is a calendar date rather than an instant, so every day count here is a calendar-day
   count in the one zone the contract names — packages/catalog/scheduling.json's `timezone`, taken
   through lib/scheduling's isoIn. Both phones count the same way: Vetting.swift resolves against
   `Calendar.current.startOfDay` and Vetting.kt against `LocalDate.now()`.

   Counting against a UTC instant instead made the gate open on its own. Between midnight and two in
   the morning in Johannesburg the UTC day is still yesterday, so `Math.ceil` returned negative zero
   for a clearance that expired the day before, and `-0 < 0` is false — a lapsed police clearance
   resolved to "expiring", which passingStates lets through, so she stayed dispatchable and the
   dispatch board kept offering her. The server's gate did the same thing (apps/api's
   protection/gate.ts, fixed beside this). It fails open, and it fails open every night.

   `isoDate` moved with `daysUntil` because they are two halves of one calendar: a fixture that says
   "today" through `inDays(0)` and then counts the days to it must get zero back. Every other caller
   of `isoDate` anchors its date at UTC midnight before asking, so a two-hour shift cannot move it. */
export const isoDate = (d: Date) => isoIn(d);
/* Fixtures say "three weeks from now" rather than a date, so the preview never goes stale. */
export const inDays = (days: number) => isoDate(new Date(Date.now() + days * 86_400_000));
export const inMonths = (months: number) => inDays(Math.round(months * 30.44));
/**
 * Whole calendar days from today in Johannesburg to an ISO date. Negative once it has passed.
 *
 * Null means no expiry was given. NaN means one was given and cannot be read, and `resolveState`
 * treats that as lapsed: an expiry nobody can read has not passed the test. Both dates are anchored
 * at noon so the difference is a whole number of days with no fraction left to round away.
 */
export function daysUntil(iso?: string): number | null {
 if (!iso) return null;
 const target = Date.parse(`${iso}T12:00:00Z`);
 if (Number.isNaN(target)) return Number.NaN;
 return Math.round((target - Date.parse(`${isoDate(today())}T12:00:00Z`)) / 86_400_000);
}
/* The day printed beside a countdown, in the same zone the countdown was counted in. Without the
   zone this renders UTC midnight in the device's own, so a handset set anywhere west of it reads
   out the day before the date it is describing — the same defect scheduling.ts's isoIn exists to
   prevent, in the sentence next to the number. */
export const formatDate = (iso?: string) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-ZA', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* A stored "verified" is only true until its expiry date. Resolving the state here — rather than
   trusting what was written down — is what makes the scheduled re-vetting real rather than a claim
   in a paragraph of copy.

   An expiry nobody can read is not an expiry that has passed the test, so it resolves to lapsed and
   not to verified. This is the gate's own rule (apps/api/src/protection/gate.ts's resolveState, and
   apps/api/src/vetting/expiry.ts beside it): a nurse's clearance whose date cannot be parsed is
   refused by the server, and a console that called her verified would be telling a different story
   about the same record. The two phones cannot carry this case at all — theirs is a Date and a
   LocalDate, so there is no malformed string to resolve. */
export function resolveState(record: CheckRecord): CheckState {
 if (record.state !== 'verified') return record.state;
 /* An expiry that is absent is a check that does not expire. One that is present but cannot be read
    is not an expiry that has passed the test, and it is not one to keep trusting. */
 if (record.expiresOn === undefined) return 'verified';
 const days = daysUntil(record.expiresOn);
 if (days === null || Number.isNaN(days)) return 'lapsed';
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

/* ---- The seven gates ------------------------------------------------------------------
   Apply, identity, credentials, background, assess, train, activate. Every check in the contract
   names its gate, and where the party stands is worked out from the checks every time it is asked,
   never written down: a stored "gate 3" stops being true the night a clearance lapses. The same
   arithmetic lives in apps/api/src/vetting/gates.ts and in Vetting.swift and Vetting.kt, and every
   sentence below comes out of packages/catalog/vetting.json — the fail rules are rendered word for
   word, never paraphrased.

   A declined check at a hard-stop gate stops the party there and outranks anything still pending
   earlier: a background bar is not hidden behind an identity check nobody has finished. A lapsed
   check holds the party at its gate with the lapse sentence rather than the gate's fail rule,
   because a clearance that ran out is not a listing on a register. */
export type VettingGate = typeof schema.gates[number];
export type GateState = 'passed' | 'not-checked' | 'pending' | 'held' | 'failed' | 'not-reached';
export type GateOutcome = 'activated' | 'in-progress' | 'held' | 'failed' | 'stopped' | 'suspended' | 'declined';
export const gates: VettingGate[] = [...schema.gates].sort((a, b) => a.order - b.order);
export const gateRules = schema.gateRules;
type GateNote = { kind: string; sentence: string };
export const gateStatus = (gate: { order: number; name: string }) =>
 gateRules.status.replace('{order}', String(gate.order)).replace('{total}', String(gates.length)).replace('{name}', gate.name);
export function gateProgress(subject: VettingSubject) {
 const role = roleById(subject.roleId);
 const checks = role?.checks ?? [];
 const notes = ((role as { gateNotes?: Record<string, GateNote> } | undefined)?.gateNotes) ?? {};
 const standings = gates.map(gate => {
  const evidencedBy = (gate as { evidencedBy?: string }).evidencedBy;
  const base = { gate, note: null as GateNote | null, outstanding: [] as VettingCheck[] };
  if (evidencedBy === 'enrolment') return { ...base, state: 'passed' as GateState };
  if (evidencedBy === 'gates') return { ...base, state: 'pending' as GateState };
  const here = checks.filter(check => check.gate === gate.id);
  if (!here.length) return { ...base, state: 'not-checked' as GateState, note: notes[gate.id] ?? null };
  const states = here.map(check => stateOf(subject, check.id));
  for (const check of here) {
   const record = recordFor(subject, check.id);
   const passing = passingStates.includes(resolveState(record)) && (check.risk !== 'high' || Boolean(record.secondedBy));
   if (!passing) base.outstanding.push(check);
  }
  const state: GateState = states.includes('declined') ? 'failed' : states.includes('lapsed') ? 'held' : base.outstanding.length ? 'pending' : 'passed';
  return { ...base, state };
 });
 const through = (s: { state: GateState }) => s.state === 'passed' || s.state === 'not-checked';
 const activate = standings.find(s => s.gate.id === 'activate')!;
 const finish = (at: typeof activate, outcome: GateOutcome, sentence: string | null) => {
  const suspended = subject.suspended && outcome === 'in-progress';
  return {
   gates: standings, at: at.gate, status: gateStatus(at.gate),
   outcome: suspended ? 'suspended' as GateOutcome : outcome,
   sentence: suspended ? subject.suspendedReason ?? gateRules.suspended : sentence,
   activated: outcome === 'activated'
  };
 };
 const stop = standings.find(s => s.gate.hardStop && s.state === 'failed');
 if (stop) {
  for (const s of standings) if (s.gate.order > stop.gate.order) s.state = 'not-reached';
  return finish(stop, 'stopped', stop.gate.failRule);
 }
 const first = standings.filter(s => s !== activate).find(s => !through(s));
 if (first) {
  const outcome: GateOutcome = first.state === 'failed' ? 'failed' : first.state === 'held' ? 'held' : 'in-progress';
  return finish(first, outcome, outcome === 'failed' ? first.gate.failRule : outcome === 'held' ? gateRules.lapse : null);
 }
 if (subject.declined) return finish(activate, 'declined', subject.declinedReason ?? gateRules.declined);
 if (subject.suspended) return finish(activate, 'suspended', subject.suspendedReason ?? gateRules.suspended);
 activate.state = 'passed';
 return finish(activate, 'activated', null);
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
