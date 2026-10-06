/**
 * The gate. One chokepoint, and every access to protected information goes through it.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────────────
 *
 * MyThuso has known who may do what since packages/catalog/vetting.json was written: the roles, the
 * declared capabilities, and `can()` answering with the refusal sentence already composed. What it
 * has never had is one place that enforces the answer. The sibling project that counted found "a
 * hundred and sixty-seven mutating routes and a check remembered on some of them", and a rule
 * remembered on some of them is not a rule — it is a habit, and habits are what a tired person on a
 * Friday afternoon skips.
 *
 * So the answer is not another helper the routes may call. It is that plaintext has exactly one
 * door, `reveal()`, and that door decides before it opens.
 *
 * ── The order the checks run in, and why that order ──────────────────────────────────────────
 *
 *  1. Capability — does this role hold it, and does it open this kind of record.
 *  2. Vetting standing — is the actor cleared today, resolved against expiry rather than trusted.
 *  3. Purpose — POPIA section 13 limits processing to the purpose it was collected for.
 *  4. Protected category — released by the patient, entry by entry, or not at all.
 *  5. Break-glass — the emergency route, which overrides one of the five and nothing else.
 *
 * Cheapest and most specific first, so the refusal a person is shown names the thing they can
 * actually do something about. A nurse whose police clearance has lapsed should be told that, not
 * told her purpose was wrong.
 *
 * Everything unknown refuses. An unknown record type, an unknown purpose, an actor nobody has
 * vetted, a capability that is not in the catalogue, a release register that has never heard of the
 * entry: all of them are refusals. A gate that opens when it is confused is not a gate, and the only
 * way to keep that true is to have no branch that falls through to "allowed".
 */
import records from '../../../../packages/catalog/records.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import type { AccessOutcome, AccessRequest, AuditChain, Gate, Purpose, RecordCrypto, Sealed } from './contract.ts';

/* ---- The catalogue, indexed ----------------------------------------------------------------
   Read, never restated. A record type added to packages/catalog/records.json is gated the moment
   it is added; a purpose that no longer matches anything fails this file's start-up check rather
   than quietly letting everything through. */
type CatalogueRecord = {
 id: string; name: string; area: string; sensitivity: string;
 gatedBy: readonly string[]; writtenBy?: readonly string[];
};
const RECORDS = new Map<string, CatalogueRecord>(
 (records.records as readonly CatalogueRecord[]).map(record => [record.id, record] as const)
);

const AREA_NAMES = new Map(records.areas.map(area => [area.id, area.name] as const));
/* Ordered as records.json orders it: routine, then clinical, then protected. The ceiling below is
   an index into this list rather than a rank typed out here, so re-ordering the catalogue re-orders
   the gate with it instead of leaving the two disagreeing. */
const SENSITIVITY = records.sensitivity.map(level => level.id);
const SENSITIVITY_NAMES = new Map(records.sensitivity.map(level => [level.id, level.name] as const));
const PROTECTED = SENSITIVITY[SENSITIVITY.length - 1]!;
const CAPABILITIES = new Set(vetting.capabilities.map(capability => capability.id));
type CatalogueRole = typeof vetting.roles[number];
const ROLES = new Map<string, CatalogueRole>(vetting.roles.map(role => [role.id, role] as const));

/* The sentence for a protected category is the catalogue's own, looked up rather than copied. It is
   the sentence a nurse already sees in the console, and a refusal worded two ways is a refusal
   somebody argues with. */
function catalogueRefusal(roleId: string, capability: string): string {
 const refusal = ROLES.get(roleId)?.grants.find(grant => grant.capability === capability)?.refusal;
 if (!refusal) throw new Error(`packages/catalog/vetting.json no longer says what ${roleId} is refused for ${capability}. The gate will not start without that sentence.`);
 return refusal;
}
const PROTECTED_REFUSAL = catalogueRefusal('nurse', 'view-protected-record');

/* ---- The purpose matrix --------------------------------------------------------------------
   POPIA section 13: information may be processed for the purpose it was collected for and not for
   another one. The gate therefore asks what the reader is doing as well as who they are, and the
   two limits are independent — a pharmacy is narrow because of its role, and a dispensing purpose
   is narrow because of what dispensing is. Passing one does not excuse the other.

   What is written out here is the smallest possible part: which capabilities a purpose exercises,
   which areas of the catalogue it reaches, and how sensitive a record it may touch. The record
   types themselves are never listed — they fall out of records.json's own `gatedBy`, `area` and
   `sensitivity`. Add a record to the catalogue and it lands in the right purposes without anybody
   editing this file, which is the whole reason the catalogue exists.

   The honest limit of that: records.json describes a diagnosis and a prescription identically —
   clinical area, clinical sensitivity, opened by view-clinical-record. So a purpose cannot separate
   them, and this matrix is exactly as fine-grained as the catalogue is. Where a narrower limit is
   needed today it comes from the role's grants, which are per-capability. If the catalogue ever
   gains a field that distinguishes them, this matrix gets finer for free. */
type PurposeRule = { capabilities: readonly string[]; areas: readonly string[]; ceiling: string; why: string };
const PURPOSE_RULES: Record<Purpose, PurposeRule> = {
 treatment: {
  capabilities: ['view-patient-summary', 'view-clinical-record', 'view-results', 'view-protected-record'],
  areas: ['patients', 'clinical', 'care-network', 'operations', 'governance'],
  ceiling: 'protected',
  why: 'The clinician in front of the patient, which is the purpose the record was collected for.'
 },
 dispensing: {
  capabilities: ['view-patient-summary', 'view-clinical-record'],
  areas: ['patients', 'clinical'],
  ceiling: 'clinical',
  why: 'What is being handed over and what would make handing it over dangerous. No results, no operations, no finance.'
 },
 diagnostics: {
  capabilities: ['view-patient-summary', 'view-results'],
  areas: ['patients', 'clinical'],
  ceiling: 'clinical',
  why: 'The order and what came back from it.'
 },
 dispatch: {
  capabilities: ['view-patient-summary'],
  areas: ['patients', 'care-network', 'operations'],
  ceiling: 'routine',
  why: 'An address, a service and a window. The Control Tower sends a named person to a named door and needs nothing clinical to do it.'
 },
 billing: {
  capabilities: ['view-billing'],
  areas: ['finance', 'governance'],
  ceiling: 'routine',
  why: 'A service code and an amount. Finance never sees why the service was needed, and the ceiling says so rather than the invoice template saying so.'
 },
 vetting: {
  capabilities: ['review-vetting'],
  areas: ['care-network'],
  ceiling: 'routine',
  why: 'Deciding whether a party may be dispatched, and reading the certificate the decision was taken against. It reaches the workforce evidence and nothing about a patient: a reviewer opening a SANC certificate has no business in a record.'
 },
 'subject-access': {
  /* Including view-billing, because a person asking for their own record is asking for what was
     charged as well as what was found. Section 23 does not stop at the clinical pages. And
     review-vetting, because a nurse's own police clearance is her personal information before it is
     the platform's evidence. The capability list here only decides which records the purpose can
     reach; what satisfies the capability stage for a data subject is their identity, never a grant,
     so naming it does not hand anybody the power to decide a vetting case. */
  capabilities: ['view-patient-summary', 'view-clinical-record', 'view-results', 'view-protected-record', 'view-billing', 'review-vetting'],
  areas: ['patients', 'clinical', 'care-network', 'operations', 'finance', 'governance'],
  ceiling: 'protected',
  why: 'The person reading their own record. Section 23 is a right, so the limit is identity, not scope.'
 },
 audit: {
  capabilities: ['view-billing'],
  areas: ['governance'],
  ceiling: 'routine',
  why: 'Who opened what. The audit record is opened by view-billing because that is what records.json says opens it.'
 },
 emergency: {
  capabilities: ['view-patient-summary'],
  areas: ['patients', 'care-network'],
  ceiling: 'clinical',
  why: 'Blood group, allergies, critical conditions, current medicine and one contact. Somebody unconscious needs that; nobody needs anything wider to resuscitate them.'
 }
};

/* Built once at start-up, and checked while it is built. A rule naming a capability or an area the
   catalogue no longer has is a hole in the gate rather than a typo, so it stops the service. */
function buildMatrix(): Record<Purpose, Set<string>> {
 const matrix = {} as Record<Purpose, Set<string>>;
 for (const [purpose, rule] of Object.entries(PURPOSE_RULES) as [Purpose, PurposeRule][]) {
  for (const capability of rule.capabilities) if (!CAPABILITIES.has(capability)) throw new Error(`The ${purpose} purpose exercises unknown capability ${capability}.`);
  for (const area of rule.areas) if (!AREA_NAMES.has(area)) throw new Error(`The ${purpose} purpose reaches unknown area ${area}.`);
  const ceiling = SENSITIVITY.indexOf(rule.ceiling);
  if (ceiling < 0) throw new Error(`The ${purpose} purpose has unknown sensitivity ceiling ${rule.ceiling}.`);
  const reachable = new Set<string>();
  for (const record of RECORDS.values()) {
   if (!rule.areas.includes(record.area)) continue;
   if (SENSITIVITY.indexOf(record.sensitivity) > ceiling) continue;
   if (!opensRecord(record).some(capability => rule.capabilities.includes(capability))) continue;
   reachable.add(record.id);
  }
  if (!reachable.size) throw new Error(`The ${purpose} purpose reaches no record type at all, so it is a purpose for nothing.`);
  matrix[purpose] = reachable;
 }
 return matrix;
}
/* Reading is what records.json describes, and `writtenBy` is on the one record type that has been
   given it. A capability that appears in neither does not open the record, which means writes that
   the catalogue has not yet described are refused. Fail closed: the catalogue gets the field, and
   the write passes. Nothing here guesses. */
function opensRecord(record: CatalogueRecord): string[] {
 return [...record.gatedBy, ...(record.writtenBy ?? [])];
}
export const purposeMatrix: Record<Purpose, Set<string>> = buildMatrix();
export const purposeReaches = (purpose: Purpose, recordType: string): boolean => purposeMatrix[purpose]?.has(recordType) ?? false;

/* ---- Vetting standing ----------------------------------------------------------------------
   Reimplemented here rather than imported: apps/web is a browser bundle and the server may not
   depend on it. What is reimplemented is only the arithmetic — the roles, the checks, the risk
   levels and every refusal sentence still come from packages/catalog/vetting.json, so there is one
   table and two readers of it rather than two tables.

   The part that matters is that a stored "verified" is resolved against its own expiry on every
   single read. A lapsed police clearance suspends a nurse without anybody noticing first, which is
   what makes the re-vetting schedule real rather than a claim in a paragraph of copy. */
export const EXPIRY_WARNING_DAYS = 45;
export const CHECK_STATES = ['outstanding', 'submitted', 'in-review', 'verified', 'expiring', 'lapsed', 'declined'] as const;
export type CheckState = typeof CHECK_STATES[number];
const PASSING: readonly CheckState[] = ['verified', 'expiring'];

export type CheckRecord = {
 checkId: string;
 state: CheckState;
 expiresOn?: string;              // ISO date
 /** A high-risk check is not verified on one person's say-so. */
 secondedBy?: string;
};
/** What the gate needs to know about a party. Whoever stores it is somebody else's problem. */
export type ActorVetting = {
 actorId: string;
 roleId: string;
 records: CheckRecord[];
 suspended?: boolean;
 suspendedReason?: string;
 declined?: boolean;
 declinedReason?: string;
};
/** Injected. The gate resolves the lifecycle itself; the source only has to remember the rows. */
export interface VettingSource {
 find(actorId: string): ActorVetting | null;
}

/* ---- Calendar days, in the one timezone the contract names ------------------------------------
   An expiry is a calendar date rather than an instant, so it is counted in calendar days — in the
   zone packages/catalog/scheduling.json names, which is the same zone both phones count in:
   Vetting.swift resolves against `Calendar.current.startOfDay` and Vetting.kt against
   `LocalDate.now()`. apps/web/src/lib/arrival.ts counts the same way for the arrival view.

   Counting against a UTC instant instead was a gate that opened on its own. Between midnight and
   two in the morning in Johannesburg the UTC day is still yesterday, so `Math.ceil` returned
   negative zero for a clearance that expired the day before — and `-0 < 0` is false, which is how
   a lapsed police clearance resolved to "expiring". "Expiring" is a passing state, so she was
   dispatchable, and the audit trail recorded the dispatch as allowed. The direction is what makes
   it worth fixing here rather than as a cosmetic drift between the three apps: it fails open, and
   it fails open every night.

   Both dates are anchored at noon so the difference is a whole number of days with no fraction to
   round away. South Africa has one offset and does not move it, which is exactly the circumstance
   in which a hard-coded +02:00 goes unnoticed until something runs on UTC and every shift ends
   two hours early — so the offset is asked of the zone, as scheduling.ts and roster.ts both do. */
const ZONE = scheduling.timezone;

/** The ISO calendar date a moment falls on in Johannesburg, not in whatever zone the server runs. */
export const dayIn = (at: number): string =>
 new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));

/**
 * Whole calendar days from today in Johannesburg to an ISO date. Negative once it has passed.
 *
 * Null means the date is absent — a check that does not expire. An expiry that is present but
 * cannot be parsed comes back NaN, and every caller resolves that to lapsed: a date nobody can read
 * has not passed the test. Both answers are deliberate, and neither one is an absent date.
 */
export const daysUntil = (iso: string | null | undefined, now: number): number | null => {
 if (!iso) return null;
 if (Number.isNaN(now)) return Number.NaN;
 const target = Date.parse(`${iso}T12:00:00Z`);
 if (Number.isNaN(target)) return Number.NaN;
 return Math.round((target - Date.parse(`${dayIn(now)}T12:00:00Z`)) / 86_400_000);
};

export function resolveState(record: CheckRecord, now: number): CheckState {
 if (record.state !== 'verified') return record.state;
 const days = daysUntil(record.expiresOn, now);
 if (days === null) return 'verified';
 if (Number.isNaN(days)) return 'lapsed';     // an expiry nobody can read is not an expiry that has passed the test
 if (days < 0) return 'lapsed';
 return days <= EXPIRY_WARNING_DAYS ? 'expiring' : 'verified';
}

export type Standing = { cleared: boolean; lapsed: string[]; awaitingSecond: string[]; blocking: string[] };
/** Every check the role carries, resolved now. A check with no record at all is outstanding. */
export function standingOf(actor: ActorVetting, now: number): Standing {
 const role = ROLES.get(actor.roleId);
 const lapsed: string[] = [];
 const awaitingSecond: string[] = [];
 const blocking: string[] = [];
 for (const check of role?.checks ?? []) {
  const record = actor.records.find(candidate => candidate.checkId === check.id) ?? { checkId: check.id, state: 'outstanding' as CheckState };
  const state = resolveState(record, now);
  if (state === 'lapsed') lapsed.push(check.name);
  else if (!PASSING.includes(state)) blocking.push(check.name);
  else if (check.risk === 'high' && !record.secondedBy) awaitingSecond.push(check.name);
 }
 return { cleared: !lapsed.length && !awaitingSecond.length && !blocking.length, lapsed, awaitingSecond, blocking };
}

/* ---- Releases -------------------------------------------------------------------------------
   A protected category opens for one patient, one entry, one person, and for as long as the patient
   said. It is never opened by a role and never by a scope. The register is injected because where
   consent is stored is a consent problem; whether it currently holds is the gate's problem, and the
   gate resolves it on every read the same way it resolves a vetting expiry. */
export type ReleaseRecord = {
 subjectId: string;
 recordType: string;
 recordId: string;
 grantedTo: string;               // the actor the patient named. Not a role.
 expiresOn?: string;              // ISO date
 withdrawnAt?: string | null;
};
export interface ReleaseRegister {
 find(query: { subjectId: string; recordType: string; recordId: string; actorId: string }): ReleaseRecord | null;
}

/* ---- Refusal sentences ----------------------------------------------------------------------
   Written the way apps/web writes them, because the person reading the refusal is the same person.
   "A internal admin staff is never granted this" is a refusal nobody trusts. */
const PLURAL_ROLE_NAMES = /staff$/i;
export function neverGranted(role: CatalogueRole | undefined): string {
 if (!role) return 'This party is never granted that.';
 if (PLURAL_ROLE_NAMES.test(role.name)) return `${role.name} are never granted this.`;
 return `${/^[AEIOU]/i.test(role.name) ? 'An' : 'A'} ${role.name} is never granted this.`;
}

/* ---- The gate -------------------------------------------------------------------------------- */

export type GateDependencies = {
 /** Injected, and never handed back out. See the note on reveal(). */
 crypto: RecordCrypto;
 audit: AuditChain;
 vetting: VettingSource;
 releases: ReleaseRegister;
 now?: () => number;
};

/* Each stage names itself in blockedBy, first element, so a refusal can be counted and charted
   without anybody parsing the sentence a person reads. */
type Stage = 'break-glass' | 'capability' | 'vetting-standing' | 'purpose' | 'protected-category' | 'reveal' | 'seal';

/* Reading and writing are decided by the same five stages and differ in two places only: what the
   audit entry is called afterwards, and that nothing is ever sealed through the emergency route. The
   distinction is a parameter rather than a second copy of the decision, because a second copy is
   where the two quietly stop agreeing. */
type Intent = 'read' | 'write';

/* The two operation kinds a data subject may perform on their own record by identity alone. */
const SELF_OPERATIONS: ReadonlySet<string> = new Set(['read', 'self-service']);

export class AccessGate implements Gate {
 /* Written out rather than constructor parameter properties: Node runs these files by stripping
    types, and stripping cannot rewrite a parameter property into a field. */
 readonly #crypto: RecordCrypto;
 readonly #audit: AuditChain;
 readonly #vetting: VettingSource;
 readonly #releases: ReleaseRegister;
 readonly #now: () => number;
 constructor(dependencies: GateDependencies) {
  this.#crypto = dependencies.crypto;
  this.#audit = dependencies.audit;
  this.#vetting = dependencies.vetting;
  this.#releases = dependencies.releases;
  this.#now = dependencies.now ?? (() => Date.now());
 }

 /**
  * Decide, write the audit entry, and only then say yes.
  *
  * The entry is written for a refusal too, and the refused attempt is the more interesting one: a
  * nurse who opened a record she was allowed to open is a Tuesday, and someone trying four patients
  * she has no visit for is the thing an investigation is actually looking for.
  *
  * The outcome is deliberately not a ticket. It carries an audit id and a decision, no key material
  * and nothing `reveal()` will accept as proof — so a caller cannot ask a cheap question, keep the
  * yes, and spend it on an expensive one. reveal() asks again, every time.
  */
 access(request: AccessRequest): AccessOutcome {
  return this.#decide(request, 'read');
 }

 /**
  * The only route in, as reveal() is the only route out.
  *
  * A sealed value that some other module produced is a value the gate never decided about and never
  * wrote down, and a module that can seal can choose its own binding — which is how a certificate
  * ends up sealed against the wrong party and opening for them ever afterwards. So the binding is
  * built here, from the same request the decision was taken on, exactly as reveal() builds it.
  *
  * The refusals are the read refusals, with two differences. Break-glass cannot write: the emergency
  * route exists so that somebody unconscious can be helped, and nothing about that involves adding a
  * document. And the capability has to be one records.json says *opens* the record — which is
  * `writtenBy` where the catalogue has been given it, and `gatedBy` where it has not. Fail closed:
  * the catalogue gets the field, and the write passes.
  */
 protect(request: AccessRequest, plaintext: string | Buffer): { ok: true; sealed: Sealed } | { ok: false; reason: string } {
  if (!request.field?.trim()) {
   const reason = 'Sealing a value has to name the field being sealed. Without it there is no binding, and a value with no binding is one that can be moved into somebody else\'s record.';
   this.#refuse(request, 'seal', reason, []);
   return { ok: false, reason };
  }
  const outcome = this.#decide(request, 'write');
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  return { ok: true, sealed: this.#crypto.seal(plaintext, {
   recordType: request.recordType, recordId: request.recordId,
   field: request.field, subjectId: request.subjectId
  }) };
 }

 #decide(request: AccessRequest, intent: Intent): AccessOutcome {
  const record = RECORDS.get(request.recordType);
  const role = ROLES.get(request.actorRole);
  const rule = PURPOSE_RULES[request.purpose] as PurposeRule | undefined;
  const breakGlass = request.purpose === 'emergency';

  /* Nothing to decide about. A request naming a record type, a purpose or a capability the
     catalogue has never heard of is refused before any of the five stages, because there is no
     rule that could apply to it and "no rule applies" must never mean "allowed". */
  if (!request.actorId?.trim() || !request.subjectId?.trim() || !request.recordId?.trim()) {
   return this.#refuse(request, 'capability', 'A request has to say who is asking, whose information it is, and which entry.', []);
  }
  if (!rule) return this.#refuse(request, 'purpose', `There is no such purpose as "${request.purpose}", and processing without a purpose is what POPIA section 13 exists to stop.`, []);
  if (!record) return this.#refuse(request, 'capability', `There is no record type "${request.recordType}" in the catalogue, so nothing here knows how to protect it.`, []);
  if (!CAPABILITIES.has(request.capability)) return this.#refuse(request, 'capability', `There is no capability "${request.capability}" in the vetting catalogue.`, []);

  /* Break-glass first, and only its precondition. A request that names the emergency purpose and
     gives no reason is not an emergency the platform can review afterwards — it is a back door with
     a label on it — so it is refused before it is allowed to override anything. */
  if (breakGlass && !request.reason?.trim()) {
   return this.#refuse(request, 'break-glass', 'Break-glass needs a reason, typed at the time, by the person breaking it. A break-glass with no reason is a back door with a label on it.', []);
  }
  /* Break-glass reads. It does not write. The emergency route is a way to help somebody unconscious,
     and nothing about that involves adding a document to their record under an override nobody
     reviewed until afterwards. */
  if (breakGlass && intent === 'write') {
   return this.#refuse(request, 'break-glass', 'Break-glass is a way to read what is already there. Nothing is ever written through it, because a record created under an override is a record with no accountable author.', []);
  }

  /* 1. Capability. Two questions: does this capability open this kind of record, and does this role
        hold it. The second is the catalogue's own sentence, used as written. */
  const opens = opensRecord(record);
  if (!opens.includes(request.capability)) {
   return this.#refuse(request, 'capability', `${record.name} is opened by ${opens.join(' or ')}. ${request.capability} does not open it.`, [request.capability]);
  }
  /* The data subject reading their own record is the one actor who is not a vetted party and never
     will be. Their right of access is section 23; it is not a grant somebody hands them, so the
     capability stage is satisfied by identity here and by nothing else. Anyone else asking on their
     behalf — a guardian, a sponsor, a relative — falls through to the ordinary grants, which is
     where a guardian's proven authority is meant to be checked. */
  /* And only for reading or self-service. The shortcut used to apply to anything a subject did to
     their own record, so a nurse on the register could enrol herself as an admin and a suspended
     party could lift their own suspension: both were "subject access" by the only test the gate had,
     which was whose record it was. An administrative write passes the capability and standing stages
     or it does not pass, whoever it is about, and an operation nobody named is administrative. */
  const actingOnSelf = request.purpose === 'subject-access' && request.actorId === request.subjectId;
  const isSubjectThemselves = actingOnSelf && SELF_OPERATIONS.has(request.operation ?? 'administrative');
  const grant = role?.grants.find(candidate => candidate.capability === request.capability);
  if (!isSubjectThemselves && !grant) {
   if (actingOnSelf) return this.#refuse(request, 'capability', vetting.selfActionRefusals.administrativeOnSelf, []);
   if (request.purpose === 'subject-access') {
    return this.#refuse(request, 'capability', 'Subject access is the person reading their own record. Reading somebody else\'s is a different request, under a different purpose, with the authority for it proven.', []);
   }
   /* The one thing break-glass overrides, and the reason it exists: the person who reaches an
      unconscious stranger is frequently not the person the roster expected. */
   if (!breakGlass) return this.#refuse(request, 'capability', neverGranted(role), []);
  }

  /* 2. Vetting standing. Break-glass does not override this and must not: a nurse whose SANC
        registration has lapsed is not the person to hand an emergency card to, and an emergency is
        exactly the moment somebody would try. A patient reading their own record is not vetted. */
  if (!isSubjectThemselves) {
   const actor = this.#vetting.find(request.actorId);
   if (!actor) return this.#refuse(request, 'vetting-standing', 'Nobody by that name has been vetted, so there is no standing to check. The gate refuses rather than assumes.', []);
   if (actor.roleId !== request.actorRole) {
    return this.#refuse(request, 'vetting-standing', `That party is vetted as ${ROLES.get(actor.roleId)?.name ?? actor.roleId}, and this request was made as ${role?.name ?? request.actorRole}. A role is what was vetted, not what was claimed.`, [actor.roleId]);
   }
   if (actor.declined) return this.#refuse(request, 'vetting-standing', actor.declinedReason ?? grant?.refusal ?? 'That party was declined.', []);
   if (actor.suspended) return this.#refuse(request, 'vetting-standing', actor.suspendedReason ?? grant?.refusal ?? 'That party is suspended.', []);
   const standing = standingOf(actor, this.#now());
   if (standing.lapsed.length) return this.#refuse(request, 'vetting-standing', `${standing.lapsed.join(' and ')} lapsed. ${grant?.refusal ?? 'The capability is withheld until it is back in date.'}`, standing.lapsed);
   if (standing.awaitingSecond.length) return this.#refuse(request, 'vetting-standing', `${standing.awaitingSecond.join(' and ')} still needs a second reviewer. ${grant?.refusal ?? 'One reviewer alone does not clear a high-risk check.'}`, standing.awaitingSecond);
   if (standing.blocking.length) return this.#refuse(request, 'vetting-standing', grant?.refusal ?? `${standing.blocking.join(' and ')} has not been verified.`, standing.blocking);
  }

  /* The emergency route and a protected category, said before the purpose stage gets to it. The
     emergency matrix already stops at clinical, so this record would be refused a line further down
     either way — but it would be refused with a sentence about a matrix, and this is the one door
     where that data would actually be taken from. It deserves the sentence that says so. */
  if (breakGlass && record.sensitivity === PROTECTED) {
   return this.#refuse(request, 'protected-category', 'Break-glass reaches the emergency card and stops there. Somebody unconscious needs their blood group and their allergies; nobody needs a protected category to resuscitate them, and the emergency route is exactly where that information would be taken from.', [record.sensitivity]);
  }

  /* 3. Purpose. Independent of the role: passing one does not excuse the other. */
  if (!purposeReaches(request.purpose, record.id)) {
   const area = AREA_NAMES.get(record.area) ?? record.area;
   const level = (SENSITIVITY_NAMES.get(record.sensitivity) ?? record.sensitivity).toLowerCase();
   return this.#refuse(request, 'purpose', `A ${request.purpose} purpose does not reach ${record.name}. ${rule.why} ${record.name} is ${level} information in ${area}, and POPIA section 13 limits processing to the purpose the information was collected for.`, [record.sensitivity, record.area]);
  }

  /* 4. Protected categories. Never a role, never a scope, and — checked above — never the emergency
        route. The one person who does not need a release is the person the release protects: their
        own protected category is theirs to read, and section 23 is a right rather than a grant. */
  if (record.sensitivity === PROTECTED && !isSubjectThemselves && !this.#released(request)) {
   return this.#refuse(request, 'protected-category', PROTECTED_REFUSAL, [record.sensitivity, request.recordId]);
  }

  /* Allowed. The entry is written before the caller is told, so there is no window in which an
     access happened and the log had not heard about it yet. */
  const link = this.#audit.append({
   event: breakGlass ? 'access.break-glass' : intent === 'write' ? 'record.sealed' : 'access.allowed',
   actorId: request.actorId, actorRole: request.actorRole, capability: request.capability,
   purpose: request.purpose, recordType: request.recordType, recordId: request.recordId,
   subjectId: request.subjectId, field: request.field, allowed: true, broke: breakGlass,
   reason: breakGlass ? request.reason : undefined
  });
  return { allowed: true, auditId: link.id, broke: breakGlass };
 }

 /**
  * The only route to plaintext.
  *
  * Three things make skipping it structural rather than a convention the next caller has to
  * remember:
  *
  *  · The RecordCrypto is a private field. It is passed to the constructor and never handed back —
  *    there is no getter, no property, and nothing on the outcome that carries key material.
  *  · The binding is built from the request, not read off the ciphertext. A caller cannot ask for
  *    patient A's allergy and be given the bytes from patient B's row, because those bytes will
  *    fail to authenticate against the binding the gate decided about. The AEAD does the enforcing;
  *    this file only has to refuse to trust the label on the envelope.
  *  · The decision is taken again here. reveal() calls access() rather than accepting an outcome, so
  *    a yes obtained for one thing cannot be spent on another.
  *
  * What is left, honestly: whoever wires the service holds the RecordCrypto in order to hand it to
  * the constructor, and could hold onto it. Closing that means the composition root constructing it
  * and exporting only the gate, plus a boundary check that nothing outside src/protection imports
  * the crypto module. Neither is in this file's gift.
  */
 reveal(request: AccessRequest, sealed: Sealed): { ok: true; value: Buffer } | { ok: false; reason: string } {
  /* Opening a value without naming which field is being opened means trusting the ciphertext's own
     account of what it is, and the point of the binding is not to. */
  if (!request.field?.trim()) {
   const reason = 'Opening a sealed value has to name the field being opened. The gate will not take the ciphertext\'s word for what it is.';
   this.#refuse(request, 'reveal', reason, []);
   return { ok: false, reason };
  }
  const outcome = this.access(request);
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  try {
   return { ok: true, value: this.#crypto.open(sealed, {
    recordType: request.recordType, recordId: request.recordId,
    field: request.field, subjectId: request.subjectId
   }) };
  } catch (error) {
   /* Either the bytes were altered or they belong to a different row. Both are worth a second
      entry: the gate said yes and the record did not open, which is a different event from a
      refusal and is the shape a moved ciphertext leaves behind. */
   const reason = 'That value did not open against the record it was asked for. Either the stored bytes were altered, or they belong to a different row.';
   this.#audit.append({
    event: 'reveal.failed', actorId: request.actorId, actorRole: request.actorRole,
    capability: request.capability, purpose: request.purpose, recordType: request.recordType,
    recordId: request.recordId, subjectId: request.subjectId, field: request.field,
    allowed: false, blockedBy: ['reveal', error instanceof Error ? error.name : 'unknown'], reason
   });
   return { ok: false, reason };
  }
 }

 /** Resolved on every read, the way an expiry has to be. A withdrawal is an event, not a deletion. */
 #released(request: AccessRequest): boolean {
  const release = this.#releases.find({
   subjectId: request.subjectId, recordType: request.recordType,
   recordId: request.recordId, actorId: request.actorId
  });
  if (!release) return false;
  if (release.withdrawnAt) return false;
  /* Belt and braces against a register that answers a question it was not asked. */
  if (release.subjectId !== request.subjectId || release.recordType !== request.recordType) return false;
  if (release.recordId !== request.recordId || release.grantedTo !== request.actorId) return false;
  const days = daysUntil(release.expiresOn, this.#now());
  if (days === null) return true;
  return !Number.isNaN(days) && days >= 0;
 }

 /** One writer for every refusal, so there is no branch that returns "no" without leaving a trace. */
 #refuse(request: AccessRequest, stage: Stage, reason: string, named: string[]): { allowed: false; reason: string; auditId: string; blockedBy: string[] } {
  const blockedBy = [stage, ...named];
  const link = this.#audit.append({
   event: stage === 'reveal' ? 'reveal.refused' : stage === 'seal' ? 'seal.refused' : request.purpose === 'emergency' ? 'access.break-glass.refused' : 'access.refused',
   actorId: request.actorId, actorRole: request.actorRole, capability: request.capability,
   purpose: request.purpose, recordType: request.recordType, recordId: request.recordId,
   subjectId: request.subjectId, field: request.field, allowed: false,
   broke: request.purpose === 'emergency' ? true : undefined,
   reason, blockedBy
  });
  return { allowed: false, reason, auditId: link.id, blockedBy };
 }
}
