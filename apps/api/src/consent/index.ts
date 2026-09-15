/**
 * Consent, and the log of who opened a record.
 *
 * ── Two things, and why they are one module ──────────────────────────────────────────────────
 *
 * A consent is a permission to process. An access log is the record of the processing that
 * permission allowed. Splitting them across two modules would mean an access entry that could not
 * name the consent it stood on, and a withdrawal that could not say what had already been done
 * under it — which is precisely the pair of questions a person asks when they open either screen.
 * So the access log records the lawful basis, and where that basis is consent it records *which*
 * consent, by purpose and version.
 *
 * ── Consent is to a version, and the version does not carry ──────────────────────────────────
 *
 * `give()` will only record a decision about the version currently in force. A person holding
 * version 1 of a purpose whose wording is now version 2 does not hold version 2, is not treated as
 * holding it, and their standing says `held-on-superseded-version` rather than `held` — which means
 * the required-consent check refuses care until they are asked again. Their version 1 decision is
 * not deleted, corrected or migrated: it was a valid consent to those words and it stays exactly
 * that. The contract says what changed and why they are being asked again, in
 * `packages/catalog/consent.json`, and the screen shows it.
 *
 * ── Withdrawal ───────────────────────────────────────────────────────────────────────────────
 *
 * One call, no reason required, no second confirmation demanded of anybody, and it is recorded as a
 * decision of its own. What it returns is the list of things that are kept anyway, with the ground
 * for each — because the honest half of a withdrawal is the half that says what it did not undo, and
 * a person told only "done" has been told the pleasant part.
 *
 * ── The one thing this module cannot do ──────────────────────────────────────────────────────
 *
 * Nothing here opens a sealed value or decides an access on its own. `RecordAccessLog` holds a
 * `Gate` and a `LogSeal` and nothing else from the protection module — no key ring, no crypto —
 * exactly as the vetting and intake modules do. The gate decides; this records what was decided, in
 * the words the data subject reads, and cross-references the gate's own tamper-evident chain entry
 * by id.
 *
 * The seal is the narrower of the two, and it is what makes the log evidence rather than a table:
 * this module hashes its own rows into a chain it could recompute and anybody else could too, and
 * hands the head of it to a module that has the key to commit it somewhere neither of them can
 * rewrite. "Commit this head" is the entire capability. It cannot write an access entry, cannot read
 * one, and cannot make a tampered log verify. See apps/api/src/protection/seal.ts.
 *
 * And it holds no clinical information. The log says that a record was opened and by whom; it has
 * no column that could hold what was in it, and `scripts/check-boundaries.mjs` fails the build if
 * one appears.
 */
import { randomUUID } from 'node:crypto';
import type { AccessRequest, Gate, LogSeal, Purpose } from '../protection/index.ts';
import {
 ACCESS_BASES, PURPOSES, RULES, basisById, currentVersion, isLawfulBasis, isRoute,
 purposeById, requiredPurposes, verifyProof, versionOf, wordingHash,
 type ConsentPurpose, type ConsentVersion, type Decision, type RetainedStatement
} from './contract.ts';
import { decisionId, type AccessOutcome, type AccessRow, type ConsentStore, type DecisionRow } from './store.ts';
import { type AccessLink } from './integrity.ts';

export * from './contract.ts';
export { openConsentStore } from './store.ts';
export type { AccessOutcome, AccessRow, ConsentStore, DecisionRow, NewAccessRow } from './store.ts';
export { ACCESS_GENESIS, accessDigest, accessLinks } from './integrity.ts';
export type { AccessLink } from './integrity.ts';

/** An answer, shaped the way the vetting and intake modules shape one. */
export type Refusal = { ok: false; reason: string };
export type Answer<T> = ({ ok: true } & T) | Refusal;

/** Where a person stands on one purpose, resolved on every read rather than stored. */
export type PurposeState = 'never-asked' | 'held' | 'held-on-superseded-version' | 'withdrawn' | 'refused';

export type PurposeStanding = {
 purpose: ConsentPurpose;
 /** The version in force today. */
 current: ConsentVersion;
 state: PurposeState;
 /** True only where the decision on file is `given` and is about the version in force. */
 authorises: boolean;
 /** The version they actually decided about, where they decided at all. */
 heldVersion: number | null;
 decidedAt: number | null;
 /** The whole history for this purpose, oldest first. A withdrawal is in here, not an absence. */
 history: DecisionRow[];
 /** Does the stored fingerprint still match the words the contract holds? See contract.ts. */
 proofIntact: boolean | null;
 /** Set where the wording has moved on under a consent that was given. */
 reconsentBecause: string | null;
};

export type CareStanding = {
 /** Whether every required purpose is held on its current version. */
 mayReceiveCare: boolean;
 missing: { purpose: ConsentPurpose; state: PurposeState; because: string }[];
 sentence: string;
};

export type GiveRequest = {
 purposeId: string;
 /** The version the screen actually showed. Refused unless it is the one in force. */
 version: number;
 route: string;
 locale: string;
 /** Who put it on the ledger. Defaults to the subject themselves. */
 recordedBy?: string;
 recordedAs?: string;
 reason?: string;
};

export type WithdrawRequest = { purposeId: string; route: string; reason?: string };

export type ConsentDeps = { store: ConsentStore; now?: () => number };

const asHistory = (rows: readonly DecisionRow[]): DecisionRow[] => rows.slice();

export class ConsentRegister {
 /* Written out rather than constructor parameter properties: this service runs on Node's
    type-stripping, which cannot rewrite a parameter property into a field. */
 readonly #store: ConsentStore;
 readonly #now: () => number;
 constructor(deps: ConsentDeps) {
  this.#store = deps.store;
  this.#now = deps.now ?? (() => Date.now());
 }

 /**
  * Record a decision to give.
  *
  * The version is taken from the caller rather than filled in here, and then checked against the one
  * in force. That is deliberate: a screen that showed version 1 and a server that recorded version 2
  * would produce a consent nobody gave, and the mismatch is exactly the bug that a version field
  * quietly defaulted on the server hides for ever.
  */
 give(subjectId: string, request: GiveRequest): Answer<{ decision: DecisionRow; repeated: boolean }> {
  return this.#decide(subjectId, request, 'given');
 }

 /**
  * Record that somebody was asked and said no.
  *
  * Worth a row of its own. "Never asked" and "asked and declined" are different facts about a
  * person, and a platform that records only the yeses will keep asking the second group as though
  * they were the first.
  */
 refuse(subjectId: string, request: GiveRequest): Answer<{ decision: DecisionRow; repeated: boolean }> {
  return this.#decide(subjectId, request, 'refused');
 }

 /**
  * Withdraw. One call, no reason required, and it says what is kept anyway.
  *
  * There is no confirmation step here and no second factor: withdrawal has to be at least as easy as
  * giving it was, and giving it was a tick. What the caller is handed back is the retention
  * statement, so the surface can show it — before the confirmation on a screen, and after the fact
  * in the answer.
  */
 withdraw(subjectId: string, request: WithdrawRequest): Answer<{ decision: DecisionRow; retained: RetainedStatement[]; alsoStops: string }> {
  const purpose = purposeById(request.purposeId);
  if (!purpose) return { ok: false, reason: `There is no consent purpose "${request.purposeId}" in the contract.` };
  if (!isRoute(request.route)) return { ok: false, reason: `"${request.route}" is not a route consent may be recorded through.` };
  /* An acknowledgement is a record that somebody was told something, and it is not withdrawable
     because a person cannot un-read a notice. Recording that they had is MyThuso's obligation under
     section 18 rather than a permission they granted, and allowing it to be "withdrawn" would let
     the platform's own obligation be deleted at the person's request, which helps nobody. */
  if (purpose.withdrawable === false || purpose.kind === 'acknowledgement') {
   return { ok: false, reason: `${purpose.name} is a record that you were told something, not a permission you gave. ${purpose.withdrawal}` };
  }
  const standing = this.standingFor(subjectId, purpose.id);
  if (standing.state === 'never-asked') {
   return { ok: false, reason: 'There is nothing on the register to withdraw. Nothing has been recorded about this purpose for you, and MyThuso will not write a withdrawal of a consent that was never given — it would read afterwards as though you had once agreed.' };
  }
  if (standing.state === 'withdrawn' || standing.state === 'refused') {
   return { ok: false, reason: 'This is already withdrawn. The date it was withdrawn is on your record and nothing is being processed under it.' };
  }
  /* Withdrawal is recorded against the version that was actually being relied on, not the current
     one. Somebody withdrawing a consent given to version 1 is withdrawing version 1. */
  const version = versionOf(purpose, standing.heldVersion ?? currentVersion(purpose).version) ?? currentVersion(purpose);
  const decision = this.#append(subjectId, purpose, version, 'withdrawn', {
   route: request.route, locale: standing.history[standing.history.length - 1]?.locale ?? 'en-ZA',
   recordedBy: subjectId, recordedAs: 'self', reason: request.reason
  });
  return {
   ok: true, decision,
   retained: purpose.retainedOnWithdrawal.slice(),
   alsoStops: RULES.withdrawalIsNotDeletion
  };
 }

 /** Where this person stands on every purpose in the contract. */
 standing(subjectId: string): PurposeStanding[] {
  return PURPOSES.map(purpose => this.standingFor(subjectId, purpose.id));
 }

 standingFor(subjectId: string, purposeId: string): PurposeStanding {
  const purpose = purposeById(purposeId);
  if (!purpose) throw new Error(`There is no consent purpose "${purposeId}" in packages/catalog/consent.json.`);
  const current = currentVersion(purpose);
  const history = asHistory(this.#store.decisionsForPurpose(subjectId, purposeId));
  const last = history[history.length - 1];
  if (!last) {
   return { purpose, current, state: 'never-asked', authorises: false, heldVersion: null, decidedAt: null, history, proofIntact: null, reconsentBecause: null };
  }
  const superseded = last.decision === 'given' && last.version !== current.version;
  const state: PurposeState =
   last.decision === 'withdrawn' ? 'withdrawn'
   : last.decision === 'refused' ? 'refused'
   : superseded ? 'held-on-superseded-version'
   : 'held';
  return {
   purpose, current, state,
   authorises: state === 'held',
   heldVersion: last.version,
   decidedAt: last.at,
   history,
   proofIntact: verifyProof(purposeId, last.version, last.wordingHash),
   reconsentBecause: superseded ? (current.reconsent ?? RULES.newWordingDoesNotCarryOver) : null
  };
 }

 /** Does this person's record authorise processing for this purpose, right now? */
 authorises(subjectId: string, purposeId: string): boolean {
  return this.standingFor(subjectId, purposeId).authorises;
 }

 /**
  * Whether care can be delivered at all, and what is missing if it cannot.
  *
  * Only the required purposes are ever consulted. An optional consent has no way of reaching this
  * answer — not "is not consulted today" but has no route to it at all — which is what
  * `optionalNeverDegradesCare` means in code rather than in a sentence.
  */
 careStanding(subjectId: string): CareStanding {
  const missing = requiredPurposes()
   .map(purpose => this.standingFor(subjectId, purpose.id))
   .filter(standing => !standing.authorises)
   .map(standing => ({
    purpose: standing.purpose,
    state: standing.state,
    because: standing.state === 'held-on-superseded-version'
     ? (standing.reconsentBecause ?? RULES.newWordingDoesNotCarryOver)
     : standing.purpose.requiredBecause ?? standing.purpose.ifRefused
   }));
  return {
   mayReceiveCare: !missing.length,
   missing,
   sentence: missing.length
    ? `MyThuso cannot arrange care until ${missing.map(entry => entry.purpose.name.toLowerCase()).join(' and ')} ${missing.length === 1 ? 'is' : 'are'} settled. Nothing optional is being asked for here.`
    : 'Everything MyThuso needs to arrange care is on your record, on the wording currently in force.'
  };
 }

 /** What an erasure runs into here, in the words the person reads. See erasure.ts. */
 retainedFor(subjectId: string): { what: string; because: string }[] {
  if (!this.#store.hasDecisions(subjectId)) return [];
  return [{
   what: 'The record of what you agreed to, and what you withdrew',
   because: 'For every choice you were offered: which purpose, which version of the wording, the fingerprint of the exact words you were shown, the date, and the route it was taken by — and the same for every withdrawal. It is the only thing that can show MyThuso had your permission while it was processing, and that it stopped when you asked. Deleting it would leave the platform unable to demonstrate either, which is the first thing the Information Regulator asks for.'
  }];
 }

 /* ---- Internals -------------------------------------------------------------------------------- */

 #decide(subjectId: string, request: GiveRequest, decision: Extract<Decision, 'given' | 'refused'>): Answer<{ decision: DecisionRow; repeated: boolean }> {
  if (!subjectId?.trim()) return { ok: false, reason: 'A consent has to be about somebody. Nothing is recorded against an empty identity.' };
  const purpose = purposeById(request.purposeId);
  if (!purpose) return { ok: false, reason: `There is no consent purpose "${request.purposeId}" in the contract, and this service will not invent one to record a decision against.` };
  if (!isRoute(request.route)) return { ok: false, reason: `"${request.route}" is not a route consent may be recorded through. The four are in packages/catalog/consent.json, and how it was taken is part of what makes it proof.` };
  if (!request.locale?.trim()) return { ok: false, reason: 'A consent has to record which language it was shown in. A person who agreed to a sentence they could not read did not agree to it.' };
  const current = currentVersion(purpose);
  const asked = versionOf(purpose, request.version);
  if (!asked) return { ok: false, reason: `${purpose.name} has no version ${request.version}.` };
  /* The refusal that makes versioning real. Recording a decision against wording that is no longer
     the wording in force would be recording somebody's agreement to a screen they were never shown
     — which is the same failure as carrying an old consent forward, arrived at from the other end. */
  if (asked.version !== current.version) {
   return { ok: false, reason: `${purpose.name} is now on version ${current.version} and this decision names version ${asked.version}. ${current.change} ${RULES.newWordingDoesNotCarryOver}` };
  }
  const standing = this.standingFor(subjectId, purpose.id);
  if (standing.state === 'held' && decision === 'given') {
   /* A repeat is acknowledged and changes nothing, the way a replayed intake batch is. A second row
      would make it look as though the person had been asked twice, which is a fact about the
      interface rather than about them. */
   return { ok: true, decision: standing.history[standing.history.length - 1]!, repeated: true };
  }
  return {
   ok: true, repeated: false,
   decision: this.#append(subjectId, purpose, current, decision, {
    route: request.route, locale: request.locale,
    recordedBy: request.recordedBy ?? subjectId,
    recordedAs: request.recordedAs ?? 'self',
    reason: request.reason
   })
  };
 }

 #append(
  subjectId: string, purpose: ConsentPurpose, version: ConsentVersion, decision: Decision,
  detail: { route: string; locale: string; recordedBy: string; recordedAs: string; reason?: string }
 ): DecisionRow {
  return this.#store.record({
   id: decisionId(), subjectId, purposeId: purpose.id, purposeKind: purpose.kind,
   version: version.version, decision,
   /* The proof. Not a pointer to the wording — the fingerprint of it, so the words cannot be edited
      out from under this row afterwards. */
   wordingHash: wordingHash(purpose.id, version),
   route: detail.route, locale: detail.locale,
   recordedBy: detail.recordedBy, recordedAs: detail.recordedAs,
   at: this.#now(),
   givenReason: detail.reason?.trim() ? detail.reason.trim() : null
  });
 }
}

/* ---- The access log ---------------------------------------------------------------------------- */

export type AccessAttempt = {
 actorId: string;
 actorRole: string;
 /** How to name the reader to the data subject. A name, a role and a registration — never a record. */
 actorLabel?: string;
 capability: string;
 /** The processing purpose the gate decides against. */
 purpose: Purpose;
 /** The POPIA basis this reading is made under. One of `accessLog.bases` in the contract. */
 lawfulBasis: string;
 /** Where the basis is consent, which consent. Refused without it. */
 consentPurpose?: string;
 recordType: string;
 recordId: string;
 subjectId: string;
 field?: string;
 /** Required by the gate for the emergency route. */
 reason?: string;
};

export type AccessDeps = {
 gate: Gate; store: ConsentStore; consent: ConsentRegister; now?: () => number;
 /* Required, not optional. A log whose head nothing commits to is a log anybody with the database
    file can rewrite quietly, and making the seal something a caller could forget to pass would mean
    exactly one caller forgetting. It is a `LogSeal` and never the chain: this module can ask for its
    own head to be committed and has no other way to reach the chain, which is the whole reason the
    boundary survives this. See apps/api/src/protection/seal.ts. */
 seal: LogSeal;
};

/** How many entries a person's own log hands back in one read. */
export const ACCESS_LOG_PAGE = 200;

/** What the log is called in a seal. One value, because a seal that named it differently after a
    rename would be a seal the verifier could no longer find. */
export const ACCESS_LOG_ID = 'record_access_log';

export class RecordAccessLog {
 readonly #gate: Gate;
 readonly #store: ConsentStore;
 readonly #consent: ConsentRegister;
 readonly #seal: LogSeal;
 readonly #now: () => number;
 constructor(deps: AccessDeps) {
  this.#gate = deps.gate;
  this.#store = deps.store;
  this.#consent = deps.consent;
  this.#seal = deps.seal;
  this.#now = deps.now ?? (() => Date.now());
 }

 /**
  * Somebody opens somebody's record.
  *
  * Three stages, and every one of them writes an entry whichever way it goes.
  *
  *  1. The lawful basis. A reading with no stated basis is processing with no stated basis, and
  *     POPIA section 11 is the whole of why that is refused rather than defaulted.
  *  2. Where the basis is consent, the consent itself — held, on the version in force, by this
  *     person. An old version does not do, which is the point of versioning it.
  *  3. The gate, which decides capability, standing, purpose, protected category and break-glass,
  *     and writes its own tamper-evident chain entry. Its id is kept here so the two line up.
  */
 open(attempt: AccessAttempt): Answer<{ entry: AccessRow; auditId: string | null }> {
  if (!isLawfulBasis(attempt.lawfulBasis) || !ACCESS_BASES.includes(attempt.lawfulBasis)) {
   return this.#refuse(attempt, 'lawful-basis', `"${attempt.lawfulBasis}" is not a basis a record may be opened under. Reading somebody's record without being able to name why it is lawful is the thing POPIA section 11 exists to stop, and a default here would be that with a friendlier name.`, null);
  }
  if (attempt.lawfulBasis === 's11a-consent') {
   const purposeId = attempt.consentPurpose ?? '';
   const purpose = purposeById(purposeId);
   if (!purpose) {
    return this.#refuse(attempt, 'consent', `A reading made on consent has to name which consent. "${purposeId || 'nothing'}" is not a purpose in the contract.`, null);
   }
   const standing = this.#consent.standingFor(attempt.subjectId, purpose.id);
   if (!standing.authorises) {
    const because = standing.state === 'held-on-superseded-version'
     ? `${standing.purpose.name} is held on version ${standing.heldVersion}, and the wording in force is version ${standing.current.version}. ${RULES.newWordingDoesNotCarryOver}`
     : standing.state === 'withdrawn' ? `${standing.purpose.name} was withdrawn on ${new Date(standing.decidedAt!).toISOString().slice(0, 10)}. ${RULES.withdrawalIsNotDeletion}`
     : standing.state === 'refused' ? `${standing.purpose.name} was offered and declined. ${standing.purpose.ifRefused}`
     : `Nothing has been recorded about ${standing.purpose.name.toLowerCase()} for this person, and a consent nobody gave is not one the platform may act on.`;
    return this.#refuse(attempt, 'consent', because, purpose.id);
   }
  }
  const outcome = this.#gate.access(this.#request(attempt));
  if (!outcome.allowed) {
   return this.#refuse(attempt, outcome.blockedBy[0] ?? 'gate', outcome.reason, attempt.consentPurpose ?? null, outcome.auditId);
  }
  const entry = this.#write(attempt, 'granted', null, null, attempt.consentPurpose ?? null, outcome.auditId);
  return { ok: true, entry, auditId: outcome.auditId };
 }

 /**
  * The person reading their own log.
  *
  * It goes through the gate like everything else — the gate satisfies the capability stage for a
  * data subject by identity, which is section 23 rather than a grant — and the read is itself
  * written into the log. That is deliberate and it is the useful part: somebody who has signed in as
  * you and read your access history appears in your access history.
  */
 mine(personId: string, limit: number = ACCESS_LOG_PAGE): Answer<{ entries: AccessRow[]; auditId: string | null }> {
  const attempt: AccessAttempt = {
   actorId: personId, actorRole: 'subject', capability: 'view-billing',
   purpose: 'subject-access', lawfulBasis: 's23-subject-access',
   recordType: 'audit', recordId: `access-log:${personId}`, subjectId: personId, field: 'access-log'
  };
  const opened = this.open(attempt);
  if (!opened.ok) return opened;
  return { ok: true, entries: this.#store.accessesFor(personId, limit), auditId: opened.auditId };
 }

 /** Everything, in order. For a test and for an operator; there is no route to it. */
 all(): AccessRow[] { return this.#store.allAccesses(); }

 /** Every entry as a link, recomputed from the row as it stands on disk. What the verifier walks. */
 links(): AccessLink[] { return this.#store.accessLinks(); }

 /**
  * Commit the log's head into the gate's chain now, whatever the cadence says.
  *
  * Called at a point where the window matters more than the cost of an entry — before a shutdown,
  * or by an operator about to take a copy of the database. It is deliberately *not* called by the
  * verification route: sealing a log and then verifying it would seal whatever it found, which is a
  * verifier that certifies the tampering it was asked to look for.
  */
 sealNow(): void { this.#seal.sealNow(ACCESS_LOG_ID, this.#store.accessHead()); }

 /** What an erasure runs into here. The log is the evidence, so it is the thing that cannot go. */
 retainedFor(subjectId: string): { what: string; because: string }[] {
  if (!this.#store.accessesFor(subjectId, 1).length) return [];
  return [{
   what: 'The log of who opened your record',
   because: 'A line every time anybody asked to open something of yours, whether they were allowed to or not: who asked, in what role, under which law, which entry, and the answer. It never holds what was read. It is kept because it is the only evidence of what was done with your information, and because deleting it on request would mean anybody who obtained your account could also erase the record of having used it.'
  }];
 }

 /* ---- Internals -------------------------------------------------------------------------------- */

 #request(attempt: AccessAttempt): AccessRequest {
  /* Built from the attempt rather than accepted as one, the way intake builds the gate's request.
     The capability is the reader's own claim about which grant they are exercising; the gate checks
     it against records.json and against the role's grants, so a wrong one is a refusal. */
  return {
   actorId: attempt.actorId, actorRole: attempt.actorRole, capability: attempt.capability,
   purpose: attempt.purpose, recordType: attempt.recordType, recordId: attempt.recordId,
   subjectId: attempt.subjectId, field: attempt.field,
   /* Every reading made through the log is a read — including a person reading their own log. */
   operation: 'read',
   ...(attempt.reason ? { reason: attempt.reason } : {})
  };
 }

 #refuse(attempt: AccessAttempt, stage: string, reason: string, consentPurpose: string | null, auditId: string | null = null): Refusal & { entry: AccessRow } {
  /* One writer for every refusal, so there is no branch that turns somebody away without leaving a
     trace. `aRefusedAccessIsRecordedToo` is the whole reason this is not an early return. */
  return { ok: false, reason, entry: this.#write(attempt, 'refused', stage, reason, consentPurpose, auditId) };
 }

 #write(attempt: AccessAttempt, outcome: AccessOutcome, refusedBy: string | null, reason: string | null, consentPurpose: string | null, auditId: string | null): AccessRow {
  const version = consentPurpose ? this.#consent.standingFor(attempt.subjectId, consentPurpose).heldVersion : null;
  const entry = this.#store.recordAccess({
   id: randomUUID(), at: this.#now(),
   actorId: attempt.actorId || 'unstated', actorRole: attempt.actorRole || 'unstated',
   actorLabel: attempt.actorLabel ?? null,
   capability: attempt.capability || 'unstated', processingPurpose: attempt.purpose,
   lawfulBasis: attempt.lawfulBasis,
   recordType: attempt.recordType || 'unstated', recordId: attempt.recordId || 'unstated',
   subjectId: attempt.subjectId || 'unstated',
   outcome, refusedBy, reason,
   consentPurpose, consentVersion: version,
   auditId
  });
  /* One writer, so there is no branch that appends an entry without offering the new head to be
     sealed. The head is passed as a function because most appends are nowhere near due and a query
     per write would be paid on every refusal as well as every grant. */
  this.#seal.appended(ACCESS_LOG_ID, () => this.#store.accessHead(), this.#now());
  return entry;
 }
}

/** The basis, named for a person rather than by its section number. */
export const basisName = (id: string): string => basisById(id)?.name ?? id;
