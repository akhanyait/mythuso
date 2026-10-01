/**
 * The vetting module: the vault, the lifecycle, and the second reviewer.
 *
 * ── One door, and it is somebody else's ──────────────────────────────────────────────────────
 *
 * Nothing in this file can seal a value or open one. It holds a `Gate`, an `AuditChain` and a
 * verifier for one operator authorisation — no key ring, no record crypto, no import of
 * protection/crypto, which scripts/check-boundaries.mjs fails the build over. Every document goes in
 * through `gate.protect()` and comes out through `gate.reveal()`, both of which build the binding
 * from the request rather than accepting one, decide before they act, and write the audit entry
 * before any plaintext exists. The verifier is the third thing and the smallest: it checks a
 * signature and can do nothing else — not derive a key, not open a value, not mint the authorisation
 * it checks.
 *
 * That is deliberate to the point of being inconvenient. It would have been a shorter file if this
 * module held its own sealer for "just the evidence table" — and that is exactly the shape the three
 * sibling projects had when the survey found the hole in all of them. A second way in is not a
 * shortcut, it is a second thing to remember, and a rule remembered on some of the routes is not a
 * rule.
 *
 * ── What is real here, and what is not ───────────────────────────────────────────────────────
 *
 * Real: the documents are sealed, the reads are gated and audited, the expiry is arithmetic resolved
 * on every read, a high-risk check needs two different people, a substituted file is detected, a
 * renewal warning survives a night the sweep did not run, and the one decision nobody reviews — the
 * bootstrap — takes an authorisation somebody minted at a console, is spent once, and leaves every
 * check it decided marked as standing on it until a real reviewer looks again.
 *
 * Not real: no credential is confirmed by an issuing authority. Every authority in
 * packages/catalog/vetting.json but one cannot be asked at all — no API exists, or one exists behind an
 * agreement or an accreditation MyThuso does not hold — and the one that could be, Home Affairs through an
 * accredited provider, has an adapter built and no contract behind it. "Verified" means a named
 * reviewer looked at a document the platform can still produce and said so. That is a workflow, and
 * it is worth having — but it is not the register confirming anything, and this module never says
 * that it is.
 *
 * What is new is that the module can now say which of the two it means. authority.ts holds one
 * adapter per authority, each carrying what a real integration would still need; every answer is
 * recorded in its own table, never in the evidence row; and a party's standing composes a sentence
 * that distinguishes "cleared by review, no authority confirmation" from "confirmed against the
 * SANC register". Today every party is the first of those. The platform is now able to notice when
 * one of them stops being.
 *
 * And underneath the bootstrap there is a floor no code reaches: the first two people are trusted
 * because somebody outside this system trusts them. What is here makes that act deliberate, bounded,
 * single-use and loud in the log. It does not make it checked.
 */
import { createHash, randomUUID } from 'node:crypto';
import vettingCatalogue from '../../../../packages/catalog/vetting.json' with { type: 'json' };
/* The envelope encoding is reached through the same door as everything else. This file knows that a
   sealed value has a shape and that the database wants one blob; it knows nothing about what is in
   it, and it cannot open one. */
import { decodeSealedValue, encodeSealedValue, standingOf, type AccessOperation, type AccessRequest, type AuditChain, type BootstrapAuthorisation, type BootstrapAuthority, type Gate, type Standing } from '../protection/index.ts';
import type { Actor, Answer, AuthorityStanding, Evidence, EvidenceVersion, Party, ResolvedEvidence } from './contract.ts';
import { authorityVerifiers, integrationSummary, isConfirmation, type AuthorityAnswer, type AuthorityOutcome, type AuthorityVerifier, type Credential } from './authority.ts';
import { authorityAnswerDueAt, daysUntil, expiryFrom, noticesFor, resolve, type RenewalNotice } from './expiry.ts';
import type { IdentityCallback, IdentityProvider } from './identityProvider.ts';
import { catalogueCheck, roleChecks, roleName, type AuthorityAnswerRow, type VettingStore } from './store.ts';
import { GATE_RULES, gateProgress, type GateProgress } from './gates.ts';

export { openVettingStore, vettingSource, SEALED_COLUMNS, roleChecks, roleGrants, roleName, knownRole } from './store.ts';
export type { VettingStore, BootstrapCeremonyRecord, AuthorityAnswerRow } from './store.ts';
export * from './contract.ts';
/* The seven gates: where a party stands, computed from its checks on every read. */
export { GATES, GATE_RULES, gateProgress, statusFor } from './gates.ts';
export type { GateOutcome, GateProgress, GateStanding, GateState } from './gates.ts';
export { RENEWAL_MILESTONES, AUTHORITY_ANSWER_MONTHS, authorityAnswerDueAt, daysUntil, expiryFrom, noticesFor, resolve, severityFor, dedupeKey } from './expiry.ts';
export type { RenewalNotice, NoticeSeverity } from './expiry.ts';
/* The verification layer. Exported from here rather than reached into, the same way everything else
   about vetting is: one door per module, so a caller cannot assemble a registry of its own with an
   adapter nobody registered. */
export { AUTHORITY_OUTCOMES, authorityVerifiers, integrationSummary, isConfirmation, answer as authorityAnswerOf, enquiryReference } from './authority.ts';
export type { AuthorityAnswer, AuthorityOutcome, AuthorityVerifier, Credential, IntegrationStanding } from './authority.ts';
export { createIdentityProvider, signIdentityRequest, signatureMatches, outcomeFor, IdentityProviderRefused, CALLBACK_WINDOW_MS } from './identityProvider.ts';
export type { IdentityProvider, IdentityCallback, IdentityMode, IdentitySession, CallbackVerdict } from './identityProvider.ts';

/** The record type the gate knows this by, and the one capability that opens it. */
const RECORD_TYPE = 'vetting-evidence';
/* What a party is refused in when they act on their own register entry. The contract's sentences. */
export const SELF_REFUSALS = vettingCatalogue.selfActionRefusals;
const CAPABILITY = 'review-vetting';
/* How many parties the bootstrap may seed. Two, because one reviewer cannot satisfy a rule that
   requires two different ones — see openBootstrap(). */
const BOOTSTRAP_PARTIES = 2;
/** A version's field name. Each version is its own field, so version 1's bytes cannot open as version 2's. */
export const documentField = (versionNumber: number): string => `document.v${versionNumber}`;

export type Deps = {
 gate: Gate; audit: AuditChain; store: VettingStore;
 /* Required rather than optional, and required for the same reason everything else here refuses by
    default: a vault assembled without a verifier would be a vault that cannot check an
    authorisation, and the tempting thing to do with one of those is let the bootstrap through. */
 bootstrap: BootstrapAuthority;
 /* One adapter per issuing authority. Optional only in the sense that leaving it out gives the
    honest default — the registry from authority.ts, in which eleven of twelve answer
    not-integrated and the twelfth does too until a provider is contracted. It is never a vault
    with no verification layer at all: a check nobody can even ask about must still be able to say
    that it is one. */
 verifiers?: Map<string, AuthorityVerifier>;
 /* The accredited identity provider, where one is configured. Held separately from the registry
    because it is the only adapter with a flow rather than a question: a session is opened, a person
    completes it, and the answer arrives on a callback. */
 identity?: IdentityProvider | null;
 now?: () => number;
};

/** Refusal of a bootstrap. Its own type, because it is the one refusal that is never a mistake by a user. */
export class BootstrapRefused extends Error {}

/** Asking an authority about one check. The credential is passed through and never written down. */
export type AuthorityRequest = {
 actor: Actor;
 evidenceId: string;
 /** The credential to ask about, where it is not the party's own reference. Not stored. */
 reference?: string;
 /** The name on the certificate, where the authority needs one to answer at all. Not stored. */
 subjectName?: string;
};

/** One check whose authority answer is missing or has gone stale. What the sweep walks. */
export type ReverificationDue = {
 evidenceId: string;
 partyId: string;
 checkId: string;
 checkName: string;
 authority: string;
 /** Never asked, the answer has aged past the cadence, or the answer stated its own expiry. */
 why: 'never-asked' | 'stale' | 'expired';
 lastAskedAt: number | null;
 lastOutcome: AuthorityOutcome | null;
 /** False where the authority cannot be asked at all, which is the usual case and is not a fault. */
 askable: boolean;
};

/**
 * The founding ceremony, once an authorisation has opened it.
 *
 * It exists as an object rather than as two methods on the vault so that "a bootstrap" is one thing
 * with a beginning and an end — opened by one authorisation, spent when it is opened, closed by the
 * clock, by `close()`, or by a third party appearing in the register. Two methods anybody could call
 * are a door standing open; this is a door somebody has to be let through.
 */
export type BootstrapCeremony = {
 /** Sixteen characters identifying the authorisation this was opened with. For the register entry. */
 readonly fingerprint: string;
 readonly decidedBy: string;
 readonly secondedBy: string;
 readonly expiresAt: number;
 /** Seed one of the parties the authorisation names, and nobody else. */
 seed(party: { id: string; roleId: string; reference?: string }): Party;
 /** Verify one of their own checks, by the two people the authorisation names, and nobody else. */
 decide(partyId: string, checkId: string, dates?: { issuedOn?: string; expiresOn?: string }): Evidence;
 close(): void;
};

export type SubmitRequest = {
 actor: Actor;
 partyId: string;
 checkId: string;
 filename: string;
 document: Uint8Array;
 /** The date on the certificate. The expiry is worked out from the check's own cadence. */
 issuedOn?: string;
 /** Where an authority prints its own expiry rather than a cadence, it wins over the arithmetic. */
 expiresOn?: string;
};

export type Decision = {
 actor: Actor;
 evidenceId: string;
 decision: 'verified' | 'declined' | 'in-review';
 issuedOn?: string;
 expiresOn?: string;
 reason?: string;
};

export class VettingVault {
 readonly #gate: Gate;
 readonly #audit: AuditChain;
 readonly #store: VettingStore;
 readonly #bootstrap: BootstrapAuthority;
 readonly #verifiers: Map<string, AuthorityVerifier>;
 readonly #identity: IdentityProvider | null;
 readonly #now: () => number;
 constructor(deps: Deps) {
  this.#gate = deps.gate;
  this.#audit = deps.audit;
  this.#store = deps.store;
  this.#bootstrap = deps.bootstrap;
  this.#verifiers = deps.verifiers ?? authorityVerifiers();
  this.#identity = deps.identity ?? null;
  this.#now = deps.now ?? (() => Date.now());
 }

 /** How much of the verification layer is real, counted rather than claimed. For the health check. */
 verificationStanding(): ReturnType<typeof integrationSummary> {
  return integrationSummary(this.#verifiers);
 }

 /**
  * The founding ceremony: the first two parties, and their own first checks.
  *
  * Somebody has to be in the register before the gate can check anybody against it, and somebody has
  * to clear the first person who can clear anybody. There is no arrangement of code that closes that
  * circle by itself, and the honest name for the way out of it is a bootstrap rather than an
  * ordinary call that happens to skip the check.
  *
  * What *can* be done is to make it small, deliberate and impossible to reach by accident:
  *
  *  · **It takes an authorisation somebody minted at a console.** A signed, single-use, time-boxed
  *    token from the key ring — see protection/bootstrap.ts. Without one, this refuses. A route, a
  *    job, a stray script or a compromised request has nothing to present, because nothing that
  *    arrives over HTTP has ever held key material.
  *  · **The names come out of the authorisation, never off the call.** Whoever minted it stated
  *    which parties are being seeded and which two people are deciding; the ceremony will accept no
  *    others, so what ends up in the audit chain is what somebody committed to beforehand.
  *  · **Two parties, and not one.** A register seeded with one person is a register one person can
  *    clear everybody in. Seeding the pair makes the second-reviewer rule true from the first
  *    decision taken through the gate rather than from the second.
  *  · **Every check still needs a document.** The pair submit their own certificates through the
  *    gate like anybody else — subject access needs no standing, which is what lets a person whose
  *    clearance has lapsed upload the new one — and only the decision is taken by hand.
  *  · **It closes and does not re-open.** When the token expires, when `close()` is called, when the
  *    register holds a third party — which is the moment the pair could have done it through the
  *    gate — and permanently for that authorisation, which is spent at the door rather than on the
  *    way out, so a ceremony that fails half-way through does not hand it back.
  *
  * What none of that reaches is the floor underneath it: the two people at the console are trusted
  * because somebody outside this system trusts them, and no code changes that. docs/DATA-PROTECTION.md
  * says who they are, what they must record, and what an auditor should ask them for.
  */
 openBootstrap(authorisation: string): BootstrapCeremony {
  const at = this.#now();
  const fingerprint = this.#bootstrap.fingerprint(authorisation);
  const refuse: (reason: string, actorId?: string) => never = (reason, actorId) => {
   /* A refused bootstrap is written down as loudly as a performed one. Somebody presenting a token
      this server did not sign, or one that was spent last March, is either an operator with the
      wrong terminal or the beginning of an incident, and neither is discovered by nobody looking. */
   this.#audit.append({
    event: 'vetting.bootstrap.refused', ...(actorId ? { actorId } : {}), capability: CAPABILITY,
    purpose: 'vetting', recordType: RECORD_TYPE, recordId: fingerprint, field: 'authorisation',
    allowed: false, reason
   });
   throw new BootstrapRefused(reason);
  };

  if (this.#store.partiesCount() > BOOTSTRAP_PARTIES) {
   refuse(`The vetting register holds more than ${BOOTSTRAP_PARTIES} parties, so there are real reviewers and this is no longer a bootstrap. Enrol through enrol() and decide through decide(), both of which the gate decides about.`);
  }
  const verdict = this.#bootstrap.verify(authorisation, at);
  if (!verdict.ok) refuse(verdict.reason);
  const grant = verdict.authorisation;
  /* Spent here, at the door, rather than on the first thing the ceremony does. An authorisation that
     is only consumed once it has succeeded is one a failed ceremony hands back to whoever is
     holding it. */
  if (!this.#store.spendBootstrap({
   fingerprint, openedAt: at, expiresAt: grant.expiresAt,
   decidedBy: grant.decidedBy, secondedBy: grant.secondedBy, parties: grant.parties.map(party => party.id)
  })) {
   refuse('This bootstrap authorisation has already been spent on this register. An authorisation opens one ceremony, once. Mint another, with the second person present.', grant.decidedBy);
  }
  this.#audit.append({
   event: 'vetting.bootstrap.opened', actorId: grant.decidedBy, capability: CAPABILITY, purpose: 'vetting',
   recordType: RECORD_TYPE, recordId: fingerprint, field: 'authorisation', allowed: true,
   reason: `Bootstrap ceremony opened outside the gate by ${grant.decidedBy} and ${grant.secondedBy}, to seed ${grant.parties.map(party => `${party.id} as ${roleName(party.roleId)}`).join(' and ')}. Authorisation ${fingerprint}, good until ${new Date(grant.expiresAt).toISOString()}.`
  });
  return this.#ceremony(grant);
 }

 /**
  * What is still standing on the escape hatch.
  *
  * A party cleared during the bootstrap and never looked at since is a fact somebody should be able
  * to ask about — an auditor, the Information Officer, or the pair themselves once there are enough
  * real reviewers to re-check each other's founding checks. It is not a refusal and it does not
  * withdraw anything: it is the list that should be getting shorter.
  */
 restingOnBootstrap(at: number = this.#now()): ResolvedEvidence[] {
  return this.#store.bootstrapped().map(evidence => this.#resolve(evidence, at));
 }

 /** The same question in numbers, for the health check. Counts and dates only — never a name. */
 bootstrapStanding(): { ceremonies: number; lastCeremonyAt: string | null; restingOnBootstrap: number } {
  const ceremonies = this.#store.ceremonies();
  return {
   ceremonies: ceremonies.length,
   lastCeremonyAt: ceremonies.length ? new Date(ceremonies[0]!.openedAt).toISOString() : null,
   restingOnBootstrap: this.#store.bootstrapped().length
  };
 }

 /** Enrolling somebody is a vetting decision, so it goes through the gate like every other one. */
 enrol(actor: Actor, party: { id: string; roleId: string; reference?: string }): Answer<{ party: Party }> {
  /* Nobody enrols themselves, and nobody changes their own role by enrolling again. Refused before
     the gate is asked, whatever purpose the actor arrived with, so a gate that ever again let a
     subject through on their own record would still meet this. */
  if (actor.id === party.id) return this.#refuseSelf(actor, party.id, 'enrolment', SELF_REFUSALS.enrol);
  if (!roleChecks(party.roleId).length) {
   return { ok: false, reason: `packages/catalog/vetting.json has no role "${party.roleId}", so there is no set of checks to hold this party to.` };
  }
  /* Decided against the party being created, which is the record about to exist. A reviewer who may
     not open this party's evidence may not create them either. */
  const outcome = this.#gate.access(this.#request(actor, party.id, party.id, 'enrolment', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  /* Enrolment creates a party and does nothing else. A second enrolment of somebody already on the
     register used to rewrite their role through the store's upsert; there is no role-change route,
     so a changed role is refused rather than smuggled in as a re-enrolment. */
  if (this.#store.findParty(party.id)) return this.#refuseSelf(actor, party.id, 'enrolment', SELF_REFUSALS.alreadyEnrolled, 'vetting.enrol.refused');
  const created = this.#put(party);
  this.#log('vetting.enrolled', actor, party.id, party.id, 'enrolment', `Enrolled as ${roleName(party.roleId)}`);
  return { ok: true, party: created };
 }

 #put(party: { id: string; roleId: string; reference?: string }): Party {
  const at = this.#now();
  const row: Party = {
   id: party.id, roleId: party.roleId, reference: party.reference ?? null,
   suspendedAt: null, suspendedReason: null, declinedAt: null, declinedReason: null, createdAt: at
  };
  this.#store.putParty(row);
  /* Every check the catalogue says the role owes is opened as outstanding, immediately. A party
     whose missing checks are absent rows rather than outstanding ones looks cleared until somebody
     counts, and counting is exactly what nobody does at half past four on a Friday. */
  for (const check of roleChecks(party.roleId)) this.#store.openEvidence(party.id, check.id, at);
  return row;
 }

 /**
  * Put a document in.
  *
  * The file is sealed by the gate against this evidence record and this version and nothing else,
  * and its SHA-256 is stored beside it in the clear. The hash is what turns "we hold her clearance"
  * into a claim somebody can check: hand the nurse's own PDF to anybody and they can compute the
  * same digest without holding a key, which a keyed fingerprint would have taken away.
  */
 submit(request: SubmitRequest): Answer<{ evidence: Evidence; version: EvidenceVersion }> {
  const party = this.#store.findParty(request.partyId);
  if (!party) return { ok: false, reason: 'Nobody by that name is being vetted, so there is nothing to submit evidence against.' };
  const check = catalogueCheck(party.roleId, request.checkId);
  if (!check) return { ok: false, reason: `A ${roleName(party.roleId)} is not asked for a "${request.checkId}" check, so there is nowhere to file this.` };
  if (!request.document.byteLength) return { ok: false, reason: 'An empty file is not evidence. Nothing was stored.' };
  /* A view over the same bytes rather than a copy of them: a certificate scan is not a thing to
     duplicate in memory on its way past. */
  const document = Buffer.from(request.document.buffer, request.document.byteOffset, request.document.byteLength);

  const at = this.#now();
  const evidence = this.#store.openEvidence(party.id, request.checkId, at);
  const versionNumber = this.#store.countVersions(evidence.id) + 1;
  const field = documentField(versionNumber);

  const sealed = this.#gate.protect(this.#request(request.actor, evidence.id, party.id, field, 'self-service'), document);
  if (!sealed.ok) return { ok: false, reason: sealed.reason };

  const version: EvidenceVersion = {
   id: randomUUID(), evidenceId: evidence.id, versionNumber,
   filename: request.filename, bytes: document.byteLength,
   contentHash: hashOf(document), keyVersion: sealed.sealed.version,
   uploadedBy: request.actor.id, uploadedAt: at
  };
  this.#store.addVersion(version, encodeSealedValue(sealed.sealed));

  /* A new document reopens the decision. Evidence that arrives against a check somebody already
     verified is a renewal or a correction, and either way the previous reviewer did not look at
     this file — so the second reviewer goes with it. Leaving the old "verified" in place is how a
     substituted certificate would inherit somebody else's approval. */
  const next: Evidence = {
   ...evidence,
   state: 'submitted',
   issuedOn: request.issuedOn ?? evidence.issuedOn,
   expiresOn: request.expiresOn ?? (request.issuedOn ? expiryFrom(request.issuedOn, evidence.renewMonths) : evidence.expiresOn),
   decidedAt: null, decidedBy: null, secondedAt: null, secondedBy: null, declinedReason: null,
   /* A new document clears the bootstrap mark with the decision it belonged to. Nothing is standing
      on the escape hatch any more once the decision it took has been dropped. */
   bootstrappedAt: null
  };
  this.#store.saveEvidence(next);
  this.#log('vetting.submitted', request.actor, evidence.id, party.id, field, `${check.name}: ${check.evidence}, version ${versionNumber}`);
  return { ok: true, evidence: next, version };
 }

 /**
  * Take a document out.
  *
  * Two ways this refuses that a plain read would not. The gate refuses anybody without the
  * capability, the standing and the purpose — and then the hash is checked against what was stored,
  * so bytes that open but are not the bytes that were verified come back as a refusal rather than as
  * evidence. A document nobody can vouch for is worse than no document: it is a document somebody
  * would rely on.
  */
 open(actor: Actor, evidenceId: string, versionNumber: number): Answer<{ document: Buffer; version: EvidenceVersion }> {
  const evidence = this.#store.findEvidence(evidenceId);
  if (!evidence) return { ok: false, reason: 'There is no such evidence record.' };
  const stored = this.#store.findVersion(evidenceId, versionNumber);
  if (!stored) return { ok: false, reason: `There is no version ${versionNumber} of that evidence.` };

  const field = documentField(versionNumber);
  const revealed = this.#gate.reveal(
   this.#request(actor, evidence.id, evidence.partyId, field, 'read'),
   decodeSealedValue(stored.document, { recordType: RECORD_TYPE, recordId: evidence.id, field, subjectId: evidence.partyId })
  );
  if (!revealed.ok) return { ok: false, reason: revealed.reason };

  const seen = hashOf(revealed.value);
  if (seen !== stored.version.contentHash) {
   /* It opened, so whoever wrote it held the key and the right binding. That narrows it to somebody
      who could write to this database with the service's own key — which is not a corruption, it is
      a substitution, and it is written down as one. */
   this.#log('vetting.substituted', actor, evidence.id, evidence.partyId, field,
    'The stored document no longer matches the digest recorded when it was submitted.');
   return { ok: false, reason: 'This document is not the one that was submitted: it no longer matches the digest recorded at the time. It has been recorded as a substitution and is not being handed over.' };
  }
  return { ok: true, document: revealed.value, version: stored.version };
 }

 /**
  * Decide a check.
  *
  * A high-risk check reaches 'verified' here and still does not count: the gate's standing resolves
  * a high-risk record with no second reviewer as one that has not cleared, so the party's capability
  * stays withheld until somebody else agrees. That is deliberately not modelled as a fourth state —
  * a state called "verified but not really" is one somebody eventually reads as verified.
  */
 decide(request: Decision): Answer<{ evidence: ResolvedEvidence }> {
  const evidence = this.#store.findEvidence(request.evidenceId);
  if (!evidence) return { ok: false, reason: 'There is no such evidence record.' };
  /* The person the evidence is about does not decide about it. Subject access is a right to read
     your own file, and it has never been a right to mark it verified. Asked before the gate, like
     enrol() and restore(), so the party is told the vault's sentence whatever their standing. */
  if (request.actor.id === evidence.partyId) {
   return { ok: false, reason: 'Nobody decides their own vetting. A check is verified by a reviewer, and you are the party it is about.' };
  }
  const outcome = this.#gate.access(this.#request(request.actor, evidence.id, evidence.partyId, 'state', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  if (request.decision === 'verified' && !this.#store.countVersions(evidence.id)) {
   return { ok: false, reason: 'There is no document on file for this check. Verifying against nothing is the failure this vault exists to make impossible.' };
  }
  if (request.decision === 'declined' && !request.reason?.trim()) {
   return { ok: false, reason: 'A decline has to say why, in words the party will read. A refusal with no reason cannot be appealed, and an appeal is the only protection somebody has against a mistake here.' };
  }

  const at = this.#now();
  const issuedOn = request.issuedOn ?? evidence.issuedOn;
  const next: Evidence = {
   ...evidence,
   state: request.decision,
   issuedOn,
   expiresOn: request.expiresOn ?? (issuedOn ? expiryFrom(issuedOn, evidence.renewMonths) : evidence.expiresOn),
   decidedAt: at,
   decidedBy: request.actor.id,
   /* A fresh decision drops the previous second. The second reviewer agreed with a decision that no
      longer stands, and carrying their name forward would be attributing a view to them they never
      expressed about the thing in front of them now. */
   secondedAt: null,
   secondedBy: null,
   declinedReason: request.decision === 'declined' ? (request.reason ?? null) : null,
   /* The re-review. A decision taken here went through the gate, was decided against the reviewer's
      own current standing, and is now an ordinary decision — so the mark comes off, and the list of
      what still rests on the bootstrap gets one shorter. Seconding does not do this and should not:
      agreeing with a decision is not taking it again, and the decision is what was never reviewed. */
   bootstrappedAt: null
  };
  this.#store.saveEvidence(next);
  if (request.decision === 'declined') this.#store.decline(evidence.partyId, at, request.reason ?? 'Declined.');
  this.#log(`vetting.${request.decision}`, request.actor, evidence.id, evidence.partyId, 'state',
   request.reason ?? `${this.#checkName(next)} recorded as ${request.decision}`);
  return { ok: true, evidence: this.#resolve(next, at) };
 }

 /**
  * The second reviewer.
  *
  * Two rules, and both of them are the point. It must be somebody, and it must not be the same
  * somebody: a control where one person can sign twice is a control that has been described rather
  * than built, and the console already refuses to let one name do both. This is the server saying
  * the same thing, which is the half that matters.
  */
 second(actor: Actor, evidenceId: string): Answer<{ evidence: ResolvedEvidence }> {
  const evidence = this.#store.findEvidence(evidenceId);
  if (!evidence) return { ok: false, reason: 'There is no such evidence record.' };
  const outcome = this.#gate.access(this.#request(actor, evidence.id, evidence.partyId, 'state', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  if (evidence.risk !== 'high') {
   return { ok: false, reason: `${this.#checkName(evidence)} is a standard-risk check. It does not take a second reviewer, and recording one would suggest the ones that do are optional.` };
  }
  if (evidence.state !== 'verified') {
   return { ok: false, reason: `${this.#checkName(evidence)} has not been verified by anybody yet, so there is nothing to agree with.` };
  }
  if (actor.id === evidence.partyId) {
   return { ok: false, reason: 'Nobody seconds their own vetting.' };
  }
  if (actor.id === evidence.decidedBy) {
   return { ok: false, reason: 'A second reviewer is a different person. You verified this check yourself, and one person agreeing with themselves is the thing the second-reviewer rule exists to prevent.' };
  }
  const at = this.#now();
  const next: Evidence = { ...evidence, secondedAt: at, secondedBy: actor.id };
  this.#store.saveEvidence(next);
  this.#log('vetting.seconded', actor, evidence.id, evidence.partyId, 'state', `${this.#checkName(next)} agreed by a second reviewer`);
  return { ok: true, evidence: this.#resolve(next, at) };
 }

 /**
  * Suspend a party, and lift it.
  *
  * A suspension is a human decision — a complaint, an investigation, a pending review — and it sits
  * beside the arithmetic rather than replacing it. A lapsed clearance suspends somebody without
  * anybody acting; this is the other direction, where somebody acts without a date having passed.
  * Both refuse at the gate's vetting-standing stage, and neither can be overridden by break-glass.
  */
 suspend(actor: Actor, partyId: string, reason: string): Answer<{ suspended?: true }> {
  if (!reason.trim()) return { ok: false, reason: 'A suspension has to say why. Somebody\'s work has just stopped, and they are owed the sentence that explains it.' };
  const outcome = this.#gate.access(this.#request(actor, partyId, partyId, 'suspension', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  if (actor.id === partyId) return { ok: false, reason: 'Nobody suspends themselves through this route. Ask a reviewer.' };
  this.#store.suspend(partyId, this.#now(), reason);
  this.#log('vetting.suspended', actor, partyId, partyId, 'suspension', reason);
  return { ok: true };
 }

 restore(actor: Actor, partyId: string): Answer<{ suspended?: true }> {
  /* The mirror of suspend(), and checked before the gate for the same reason enrol() is. */
  if (actor.id === partyId) return this.#refuseSelf(actor, partyId, 'suspension', SELF_REFUSALS.restore);
  const outcome = this.#gate.access(this.#request(actor, partyId, partyId, 'suspension', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  this.#store.restore(partyId);
  this.#log('vetting.restored', actor, partyId, partyId, 'suspension', 'Suspension lifted');
  return { ok: true };
 }

 /**
  * Where a party stands, right now.
  *
  * The standing is the gate's own, computed from the same records the gate would read, so what the
  * console shows and what the server enforces cannot disagree. Everything else here is the detail a
  * person needs in order to do something about it.
  *
  * `assurance` is beside it and is a different question. `standing` says whether the platform will
  * dispatch this party; `assurance` says on whose word. Today every party on the platform is cleared
  * by review with no authority confirmation behind any of it, and the sentence says exactly that
  * rather than letting the green tick do the talking.
  */
 standing(partyId: string, at: number = this.#now()): { party: Party; checks: ResolvedEvidence[]; standing: Standing; assurance: PartyAssurance; gates: GateProgress } | null {
  const party = this.#store.findParty(partyId);
  if (!party) return null;
  const evidence = this.#store.evidenceForParty(partyId);
  const known = new Map(evidence.map(record => [record.checkId, record] as const));
  const checks = roleChecks(party.roleId).map(check => {
   const record = known.get(check.id);
   return this.#resolve(record ?? {
    id: '', partyId, roleId: party.roleId, checkId: check.id, authority: check.authority,
    risk: check.risk === 'high' ? 'high' : 'standard', renewMonths: check.renewMonths,
    state: 'outstanding', issuedOn: null, expiresOn: null, decidedAt: null, decidedBy: null,
    secondedAt: null, secondedBy: null, declinedReason: null, bootstrappedAt: null, createdAt: party.createdAt
   }, at);
  });
  /* One description of the party feeds both answers, so the gate a person is told they are at and
     the clearance the access gate enforces are arithmetic over the same rows and cannot disagree. */
  const actor = {
   actorId: party.id, roleId: party.roleId,
   records: evidence.map(record => ({
    checkId: record.checkId, state: record.state,
    ...(record.expiresOn ? { expiresOn: record.expiresOn } : {}),
    ...(record.secondedBy ? { secondedBy: record.secondedBy } : {})
   })),
   ...(party.suspendedAt ? { suspended: true, ...(party.suspendedReason ? { suspendedReason: party.suspendedReason } : {}) } : {}),
   ...(party.declinedAt ? { declined: true, ...(party.declinedReason ? { declinedReason: party.declinedReason } : {}) } : {})
  };
  return {
   party,
   checks,
   assurance: partyAssurance(checks),
   standing: standingOf(actor, at),
   gates: gateProgress(actor, at)
  };
 }

 /**
  * Whether a party may be activated, and the sentence they are refused with where not.
  *
  * Activation is gate 7, and it is refused until gates 1 to 6 have passed — each in its own right,
  * resolved now. There is no switch here that activates somebody, and deliberately so: activation is
  * what the checks add up to, and a method that set it would be a second answer to the same question
  * that could be written down once and then disagree with the checks for ever. A declined check at a
  * hard-stop gate refuses with that gate's fail rule, however many later gates are green.
  */
 activation(partyId: string, at: number = this.#now()): Answer<{ gates: GateProgress }> {
  const held = this.standing(partyId, at);
  if (!held) return { ok: false, reason: GATE_RULES.notActivated };
  if (held.gates.activated) return { ok: true, gates: held.gates };
  return { ok: false, reason: held.gates.sentence ?? GATE_RULES.notActivated };
 }

 /**
  * The nightly sweep's answer: which warnings are owed, once each.
  *
  * Nothing is sent from here. It returns what is due and records it as dealt with only when told to,
  * so a sweep can be rehearsed the same way the retention sweep can — and so a notification that
  * failed to send is not silently marked as sent.
  */
 renewalsDue(at: number = this.#now()): { notice: RenewalNotice; superseded: string[] }[] {
  const due: { notice: RenewalNotice; superseded: string[] }[] = [];
  for (const evidence of this.#store.expiring()) {
   const already = this.#store.noticesSent(evidence.id);
   const { send, superseded } = noticesFor(evidence, this.#checkName(evidence), at, already);
   if (send) due.push({ notice: send, superseded });
  }
  return due;
 }

 /** Mark a warning as dealt with — delivered, or overtaken and never delivered. */
 recordNotice(notice: RenewalNotice, superseded: string[] = [], at: number = this.#now()): void {
  this.#store.recordNotice(notice.dedupeKey, notice.evidenceId, notice.milestoneDays, at, true);
  for (const key of superseded) {
   const milestone = Number(key.split(':').pop());
   this.#store.recordNotice(key, notice.evidenceId, Number.isFinite(milestone) ? milestone : notice.milestoneDays, at, false);
  }
 }

 /**
  * What an erasure request runs into here, in the words the person reads.
  *
  * A nurse asking to be erased is asking for something this module cannot fully give her while she
  * is still on the platform, and pretending otherwise would be the dishonest answer. See
  * personalData.ts for the register this feeds, and be clear about what it is not: a decision about
  * how long, which is a question for the Information Officer and counsel, not for this file.
  */
 retainedFor(partyId: string): { what: string; because: string }[] {
  const party = this.#store.findParty(partyId);
  if (!party) return [];
  const decided = this.#store.evidenceForParty(partyId).filter(evidence => evidence.decidedAt !== null);
  if (!decided.length) return [];
  return [{
   what: `The vetting evidence held about you as ${roleName(party.roleId)}`,
   because: 'MyThuso has to be able to show who was cleared to attend a visit, on what evidence, and who agreed to it — including afterwards, if somebody questions the care they were given. Deleting it on request would remove the proof that the check was ever done, which protects you as much as anybody. It is kept sealed, it is opened only through a check that is written down every time, and it is disposed of on the date the register gives.'
  }];
 }


 /* ---- The verification layer ------------------------------------------------------------------
    Everything below asks an authority, or reports what one said. None of it decides anything: a
    reviewer's decision and an authority's answer are two facts about one check, they are recorded
    in two tables, and no method here writes to the evidence row. That separation is the whole of
    the point, and it is structural rather than a convention — saveEvidence is never called from
    this section, so an authority answer cannot become a verification by accident. */

 /**
  * Ask an issuing authority about one check.
  *
  * The gate decides first, as it does about every other read of a vetting record: a reviewer whose
  * own police clearance lapsed last night does not get to run enquiries against a nurse's identity
  * number. Then the adapter is asked, and whatever it says — including "there is nothing to ask" —
  * is recorded and lands in the hash chain.
  *
  * Three refusals worth naming, because each of them is a way this could have quietly gone wrong:
  *
  *  · **An adapter that throws is `unavailable`, never a crash and never a confirmation.** A
  *    provider's client library that dies on a malformed response must not take a sweep down with
  *    it, and must not leave the check looking as though nobody got round to it.
  *  · **The credential is passed through and never stored.** See the note on Credential in
  *    authority.ts. What is written down is the authority, the outcome, the moment and the enquiry
  *    reference.
  *  · **A confirmation does not verify anything.** It is recorded beside the reviewer's decision.
  *    The gate's standing is untouched by it, which is deliberate: an authority answer arriving on
  *    a webhook must never be able to clear a check that no person has looked at.
  */
 async checkWithAuthority(request: AuthorityRequest): Promise<Answer<{ answer: AuthorityAnswer; recorded: boolean; contradicts: boolean }>> {
  const evidence = this.#store.findEvidence(request.evidenceId);
  if (!evidence) return { ok: false, reason: 'There is no such evidence record.' };
  const outcome = this.#gate.access(this.#request(request.actor, evidence.id, evidence.partyId, 'authority', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };

  const verifier = this.#verifiers.get(evidence.authority);
  if (!verifier) {
   /* Unreachable while authorityVerifiers() refuses to be built with a gap in it, and kept because
      the day it becomes reachable is the day somebody added an authority to the catalogue against
      a running service. Refusing is the answer; guessing is not. */
   return { ok: false, reason: `There is no adapter for the ${evidence.authority} authority, so this check cannot be asked about at all.` };
  }
  const party = this.#store.findParty(evidence.partyId);
  const credential: Credential = {
   evidenceId: evidence.id, partyId: evidence.partyId, checkId: evidence.checkId, authority: evidence.authority,
   reference: request.reference ?? party?.reference ?? null,
   subjectName: request.subjectName ?? null,
   issuedOn: evidence.issuedOn, expiresOn: evidence.expiresOn
  };
  const at = this.#now();
  let answer: AuthorityAnswer;
  try {
   answer = await verifier.check(credential, at);
  } catch (error) {
   answer = {
    authority: evidence.authority, outcome: 'unavailable', checkedAt: at,
    reference: `${evidence.authority}:failed:${evidence.id}:${at}`,
    detail: `The adapter for this authority failed: ${error instanceof Error ? error.message : 'the enquiry threw'}. Nothing has been confirmed.`,
    expiresOn: null
   };
  }
  const recorded = this.#recordAnswer(evidence, answer, request.actor.id);
  const contradicts = this.#contradicts(evidence, answer.outcome, at);
  return { ok: true, answer, recorded, contradicts };
 }

 /**
  * Open an identity verification session with the accredited provider.
  *
  * The one authority with a flow rather than a question. Nothing is confirmed here: a session is
  * opened, the person is sent to the provider, and the answer arrives on a callback — which is why
  * this returns a URL and no outcome.
  */
 async openIdentitySession(actor: Actor, evidenceId: string): Promise<Answer<{ reference: string; url: string; mode: string }>> {
  const evidence = this.#store.findEvidence(evidenceId);
  if (!evidence) return { ok: false, reason: 'There is no such evidence record.' };
  const outcome = this.#gate.access(this.#request(actor, evidence.id, evidence.partyId, 'authority', 'administrative'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  if (evidence.authority !== 'dha') {
   return { ok: false, reason: `${this.#checkName(evidence)} is verified by ${evidence.authority}, not by the identity provider. Opening an identity session against it would record an answer about the wrong thing.` };
  }
  if (!this.#identity) {
   this.#audit.append({
    event: 'vetting.authority.refused', actorId: actor.id, actorRole: actor.role, capability: CAPABILITY,
    purpose: actor.purpose, recordType: RECORD_TYPE, recordId: evidence.id, subjectId: evidence.partyId,
    field: 'authority', allowed: false,
    reason: 'No accredited identity provider is configured, so no session can be opened. Home Affairs is not integrated on this service.'
   });
   return { ok: false, reason: 'No accredited identity provider is configured on this service. Identity is not confirmed against Home Affairs here, and a session cannot be opened without a contracted provider.' };
  }
  const at = this.#now();
  const opened = await this.#identity.openSession({ evidenceId: evidence.id, partyId: evidence.partyId }, at);
  if (!opened.ok) {
   this.#audit.append({
    event: 'vetting.identity.session.refused', actorId: actor.id, actorRole: actor.role, capability: CAPABILITY,
    purpose: actor.purpose, recordType: RECORD_TYPE, recordId: evidence.id, subjectId: evidence.partyId,
    field: 'authority', allowed: false, reason: opened.reason
   });
   return { ok: false, reason: opened.reason };
  }
  /* The mode is in the log line rather than only in the row. A sandbox session and a live one are
     indistinguishable in their consequences afterwards, and the chain is where somebody looking at
     a confirmation months later would have to be able to tell which one produced it. */
  this.#log('vetting.identity.session.opened', actor, evidence.id, evidence.partyId, 'authority',
   `Identity verification session ${opened.reference} opened with the accredited provider in ${opened.mode} mode.${opened.mode === 'sandbox' ? ' A sandbox session confirms nothing: Home Affairs has not been asked.' : ''}`);
  return { ok: true, reference: opened.reference, url: opened.url, mode: opened.mode };
 }

 /**
  * Take the provider's callback.
  *
  * There is no actor and there cannot be one: this arrives from the provider's servers, carrying no
  * session and no person. So it does not go through the gate, which decides about actors — and it
  * does not need to, because it opens nothing and reads nothing protected. It writes one authority
  * answer, under a reference this service minted, for a session this service opened, and every
  * outcome including every refusal is an entry in the same chain the gate writes to.
  *
  * The signature check, the replay window and the idempotency guard are the adapter's — see
  * identityProvider.ts. What is here is the recording and the log.
  */
 acceptIdentityCallback(payload: IdentityCallback): Answer<{ outcome: AuthorityOutcome; repeated: boolean; contradicts: boolean }> {
  if (!this.#identity) {
   this.#audit.append({
    event: 'vetting.identity.callback.refused', capability: CAPABILITY, purpose: 'vetting',
    recordType: RECORD_TYPE, recordId: 'identity-callback', field: 'authority', allowed: false,
    reason: 'A verification callback arrived and no identity provider is configured on this service. Nothing opened a session here, so nothing can be answering one.'
   });
   return { ok: false, reason: 'No identity provider is configured on this service.' };
  }
  const at = this.#now();
  const verdict = this.#identity.acceptCallback(payload, at);
  if (!verdict.ok) {
   /* A refused callback is written down as loudly as an accepted one, and it is the more
      interesting entry: a forged signature against a real session reference is somebody trying to
      mark a person identity-confirmed, and it is discovered by nobody unless it is in the log. */
   this.#audit.append({
    /* A sandbox session found where there should be none is its own event, so it can be found
       among the ordinary refusals by name rather than by reading every reason. */
    event: verdict.flagged ? 'vetting.identity.sandbox.flagged' : 'vetting.identity.callback.refused', capability: CAPABILITY, purpose: 'vetting',
    recordType: RECORD_TYPE, recordId: verdict.reference ?? 'identity-callback', field: 'authority',
    allowed: false, reason: verdict.reason
   });
   return { ok: false, reason: verdict.reason };
  }
  const evidence = this.#store.findEvidence(verdict.session.evidenceId);
  if (!evidence) return { ok: false, reason: 'The session this callback answers is against an evidence record that no longer exists.' };
  if (verdict.repeated) {
   this.#audit.append({
    event: 'vetting.identity.callback.repeated', capability: CAPABILITY, purpose: 'vetting',
    recordType: RECORD_TYPE, recordId: evidence.id, subjectId: evidence.partyId, field: 'authority',
    allowed: true, reason: `Session ${verdict.session.reference} had already been answered as ${verdict.outcome}. The repeat was acknowledged and changed nothing.`
   });
   return { ok: true, outcome: verdict.outcome, repeated: true, contradicts: false };
  }
  const answer: AuthorityAnswer = {
   authority: 'dha', outcome: verdict.outcome, checkedAt: at,
   reference: verdict.session.reference, detail: verdict.detail, expiresOn: null
  };
  this.#recordAnswer(evidence, answer, `provider:${verdict.session.mode}`);
  return { ok: true, outcome: verdict.outcome, repeated: false, contradicts: this.#contradicts(evidence, verdict.outcome, at) };
 }

 /**
  * Which checks are owed an authority answer, and why.
  *
 * Three reasons, kept apart because they call for different things. Nobody has ever asked, which
 * for every authority but the one with an adapter is permanent and honest. The last answer has aged past the
  * check's own renewal cadence, which is the case a lapsed registration hides in. And the answer
  * stated an expiry that has now passed, which is the authority itself having said when it would
  * stop being true.
  */
 reverificationDue(at: number = this.#now()): ReverificationDue[] {
  const latest = new Map(this.#store.latestAuthorityAnswers().map(row => [row.evidenceId, row] as const));
  const due: ReverificationDue[] = [];
  for (const evidence of this.#store.evidenceOwedAuthority()) {
   const answer = latest.get(evidence.id) ?? null;
   const askable = this.#verifiers.get(evidence.authority)?.standing.integrated ?? false;
   const common = {
    evidenceId: evidence.id, partyId: evidence.partyId, checkId: evidence.checkId,
    checkName: this.#checkName(evidence), authority: evidence.authority,
    lastAskedAt: answer?.checkedAt ?? null, lastOutcome: answer?.outcome ?? null, askable
   };
   if (!answer) { due.push({ ...common, why: 'never-asked' }); continue; }
   if (answer.expiresOn && (daysUntil(answer.expiresOn, at) ?? -1) < 0) { due.push({ ...common, why: 'expired' }); continue; }
   if (at >= authorityAnswerDueAt(answer.checkedAt, evidence.renewMonths)) due.push({ ...common, why: 'stale' });
  }
  return due;
 }

 /**
  * Where an authority has said something a reviewer's verification cannot survive.
  *
  * This lists rather than acts, and the choice is deliberate. Making a register's "no such
  * registration" suspend somebody automatically would mean a register that was briefly wrong, or an
  * adapter that misread a response, striking nurses off the roster at three in the morning with
  * nobody in the loop — and the same route would be the one an attacker reached for. So a
  * contradiction is loud, is in the chain, and is a reviewer's decision to act on through suspend(),
  * which is a decision with a name on it. The honest cost of that choice: between the answer and
  * the reviewer reading it, the party keeps their capabilities.
  */
 contradictions(at: number = this.#now()): { evidence: ResolvedEvidence; answer: AuthorityAnswerRow }[] {
  const found: { evidence: ResolvedEvidence; answer: AuthorityAnswerRow }[] = [];
  for (const answer of this.#store.latestAuthorityAnswers()) {
   const evidence = this.#store.findEvidence(answer.evidenceId);
   if (!evidence) continue;
   if (this.#contradicts(evidence, answer.outcome, at, false)) found.push({ evidence: this.#resolve(evidence, at), answer });
  }
  return found;
 }

 /** Every answer this platform has ever had about one check, newest first. What a regulator asks for. */
 authorityHistory(evidenceId: string): AuthorityAnswerRow[] {
  return this.#store.authorityAnswers(evidenceId);
 }

 /* ---- Internals ------------------------------------------------------------------------------ */

 /* One writer for every authority answer, so there is no path that records one without logging it.
    `allowed` is about the gate and nothing else: the enquiry was permitted and was made. What the
    authority said is in the reason, and `not-integrated` is an answer rather than a refusal. */
 #recordAnswer(evidence: Evidence, answer: AuthorityAnswer, askedBy: string): boolean {
  const recorded = this.#store.recordAuthorityAnswer({
   reference: answer.reference, evidenceId: evidence.id, partyId: evidence.partyId,
   checkId: evidence.checkId, authority: answer.authority, outcome: answer.outcome,
   detail: answer.detail, checkedAt: answer.checkedAt, expiresOn: answer.expiresOn, askedBy
  });
  this.#audit.append({
   event: 'vetting.authority.answered', actorId: askedBy, capability: CAPABILITY, purpose: 'vetting',
   recordType: RECORD_TYPE, recordId: evidence.id, subjectId: evidence.partyId, field: 'authority',
   allowed: true,
   reason: `${this.#checkName(evidence)}: ${answer.authority} answered ${answer.outcome} (enquiry ${answer.reference}). ${answer.detail}${recorded ? '' : ' This answer was already on file and has not been recorded twice.'}`
  });
  return recorded;
 }

 /* A reviewer says one thing and the authority says another. Written into the chain the first time
    it is seen, and reported by contradictions() every time it is asked about — hence the flag: the
    report must not append an entry each time somebody opens the console. */
 #contradicts(evidence: Evidence, outcome: AuthorityOutcome, at: number, log = true): boolean {
  const reviewed = resolve(evidence, at);
  const contradicts = (reviewed === 'verified' || reviewed === 'expiring')
   && (outcome === 'not-found' || outcome === 'mismatch' || outcome === 'expired');
  if (contradicts && log) {
   this.#audit.append({
    event: 'vetting.authority.contradiction', capability: CAPABILITY, purpose: 'vetting',
    recordType: RECORD_TYPE, recordId: evidence.id, subjectId: evidence.partyId, field: 'authority',
    allowed: false,
    reason: `${this.#checkName(evidence)} was verified by a reviewer and ${evidence.authority} answered ${outcome}. Nothing has been withdrawn automatically: a reviewer decides what to do about it, through suspend(), with their name on the decision.`
   });
  }
  return contradicts;
 }

 /* What an authority has said about one check, resolved now. The sentence is composed here, once,
    so a console and a report cannot describe the same record in two different registers of
    confidence. */
 #assure(evidence: Evidence, at: number): AuthorityStanding {
  const integrated = this.#verifiers.get(evidence.authority)?.standing.integrated ?? false;
  const name = catalogueCheck(evidence.roleId, evidence.checkId)?.name ?? evidence.checkId;
  const row = evidence.id ? this.#store.latestAuthorityAnswer(evidence.id) : null;
  if (!row) {
   return {
    answer: null, confirmed: false, stale: false, contradicts: false, integrated,
    sentence: integrated
     ? `${name} has not been put to ${evidence.authority}. Nobody has asked, so nothing has been confirmed.`
     : `${name} cannot be confirmed with ${evidence.authority}: there is no integration with that authority. This check rests on a reviewer having read a document.`
   };
  }
  const expired = Boolean(row.expiresOn) && (daysUntil(row.expiresOn, at) ?? -1) < 0;
  const stale = expired || at >= authorityAnswerDueAt(row.checkedAt, evidence.renewMonths);
  const asked = new Date(row.checkedAt).toISOString().slice(0, 10);
  /* An answer recorded from an identity session that was not live is a rehearsal, and it never reads
     as a confirmation — not "confirmed against dha", not counted as confirmed. Anything the provider
     answered under a mode other than live is treated so, including a mode nobody can read. */
  if (row.askedBy.startsWith('provider:') && row.askedBy !== 'provider:live') {
   return {
    answer: { outcome: row.outcome, checkedAt: row.checkedAt, reference: row.reference, detail: row.detail, expiresOn: row.expiresOn },
    confirmed: false, stale, contradicts: false, integrated,
    sentence: `${name} was answered by a sandbox identity session on ${asked}, with the outcome ${row.outcome}. That was a rehearsal: Home Affairs was not asked, and nothing about this check has been confirmed.`
   };
  }
  const confirmed = isConfirmation(row.outcome) && !stale;
  const sentence = row.outcome === 'not-integrated'
   ? `${name} was put to ${evidence.authority} on ${asked} and there is no integration with that authority to answer it. This check rests on a reviewer having read a document.`
   : confirmed ? `${name} was confirmed against ${evidence.authority} on ${asked}.`
   : isConfirmation(row.outcome) ? `${name} was confirmed against ${evidence.authority} on ${asked}, and that answer is now older than the check's own renewal cadence. It is not a current confirmation.`
   : `${name} was put to ${evidence.authority} on ${asked} and the answer was ${row.outcome}. ${row.detail}`;
  return {
   answer: { outcome: row.outcome, checkedAt: row.checkedAt, reference: row.reference, detail: row.detail, expiresOn: row.expiresOn },
   confirmed, stale, contradicts: this.#contradicts(evidence, row.outcome, at, false), integrated, sentence
  };
 }


 /* The ceremony itself. Everything it can do is checked twice: once at the door, against the
    authorisation, and again on every call, against the clock and the register — because a ceremony
    opened legitimately at 22:05 must not still be seeding parties at midnight. */
 #ceremony(grant: BootstrapAuthorisation): BootstrapCeremony {
  let open = true;
  const refuse: (reason: string) => never = reason => {
   this.#audit.append({
    event: 'vetting.bootstrap.refused', actorId: grant.decidedBy, capability: CAPABILITY, purpose: 'vetting',
    recordType: RECORD_TYPE, recordId: grant.fingerprint, field: 'authorisation', allowed: false, reason
   });
   throw new BootstrapRefused(reason);
  };
  const guard = (): void => {
   if (!open) refuse('This bootstrap ceremony has been closed. An authorisation opens one ceremony, once.');
   if (this.#now() >= grant.expiresAt) {
    open = false;
    refuse(`This bootstrap authorisation expired at ${new Date(grant.expiresAt).toISOString()}, part-way through the ceremony. What was done before then stands and is in the log; the rest needs a fresh authorisation.`);
   }
  };
  const covers = (partyId: string): void => {
   if (!grant.parties.some(party => party.id === partyId)) {
    refuse(`This authorisation covers ${grant.parties.map(party => party.id).join(' and ')}, and not ${partyId}. The parties are named when the authorisation is minted, so that the ceremony cannot quietly seed somebody else.`);
   }
  };
  return {
   fingerprint: grant.fingerprint,
   decidedBy: grant.decidedBy,
   secondedBy: grant.secondedBy,
   expiresAt: grant.expiresAt,
   seed: party => {
    guard();
    covers(party.id);
    if (!grant.parties.some(named => named.id === party.id && named.roleId === party.roleId)) {
     refuse(`This authorisation seeds ${party.id} as ${roleName(grant.parties.find(named => named.id === party.id)!.roleId)}, not as ${roleName(party.roleId)}. The role decides which checks the party owes, so it is part of what was authorised.`);
    }
    if (this.#store.partiesCount() >= BOOTSTRAP_PARTIES) {
     refuse(`The vetting register already holds ${BOOTSTRAP_PARTIES} parties, which is a pair who can review each other's work. This is no longer a bootstrap: enrol through enrol(), which the gate decides about.`);
    }
    /* The same refusal enrol() gives. A role the catalogue has never heard of owes no checks, and a
       party owing no checks is a party who is cleared for everything the moment they exist. */
    if (!roleChecks(party.roleId).length) {
     refuse(`packages/catalog/vetting.json has no role "${party.roleId}", so there is no set of checks to hold this party to.`);
    }
    const created = this.#put(party);
    this.#audit.append({
     event: 'vetting.bootstrap.enrolled', actorId: grant.decidedBy, capability: CAPABILITY, purpose: 'vetting',
     recordType: RECORD_TYPE, recordId: party.id, subjectId: party.id, field: 'enrolment', allowed: true,
     reason: `Seeded as ${roleName(party.roleId)} during the bootstrap, outside the gate, by ${grant.decidedBy} and ${grant.secondedBy} under authorisation ${grant.fingerprint}`
    });
    return created;
   },
   decide: (partyId, checkId, dates = {}) => {
    guard();
    covers(partyId);
    if (this.#store.partiesCount() > BOOTSTRAP_PARTIES) {
     refuse(`The vetting register holds more than ${BOOTSTRAP_PARTIES} parties, so this is no longer a bootstrap. Decide through decide(), which the gate decides about.`);
    }
    const evidence = this.#store.findEvidenceFor(partyId, checkId);
    if (!evidence) refuse(`No ${checkId} check is open against ${partyId}.`);
    if (!this.#store.countVersions(evidence.id)) {
     refuse(`There is no document on file for ${checkId}. A bootstrap is allowed to skip the reviewer; it is not allowed to skip the evidence.`);
    }
    const at = this.#now();
    const issuedOn = dates.issuedOn ?? evidence.issuedOn;
    /* Both names go on it, whatever the risk level. Two people are in the room by the terms of the
       authorisation, both of them looked at the certificate, and recording only one of them would
       understate who is accountable for the one decision nobody else reviewed. */
    const next: Evidence = {
     ...evidence, state: 'verified', issuedOn,
     expiresOn: dates.expiresOn ?? (issuedOn ? expiryFrom(issuedOn, evidence.renewMonths) : evidence.expiresOn),
     decidedAt: at, decidedBy: grant.decidedBy,
     secondedAt: at, secondedBy: grant.secondedBy, declinedReason: null,
     bootstrappedAt: at
    };
    this.#store.saveEvidence(next);
    this.#audit.append({
     event: 'vetting.bootstrap.verified', actorId: grant.decidedBy, capability: CAPABILITY, purpose: 'vetting',
     recordType: RECORD_TYPE, recordId: evidence.id, subjectId: partyId, field: 'state', allowed: true,
     reason: `${this.#checkName(next)} verified during the bootstrap, outside the gate, by ${grant.decidedBy} and ${grant.secondedBy} under authorisation ${grant.fingerprint}. Nobody reviewed this decision.`
    });
    return next;
   },
   close: () => {
    if (!open) return;
    open = false;
    this.#audit.append({
     event: 'vetting.bootstrap.closed', actorId: grant.decidedBy, capability: CAPABILITY, purpose: 'vetting',
     recordType: RECORD_TYPE, recordId: grant.fingerprint, field: 'authorisation', allowed: true,
     reason: `Bootstrap ceremony under authorisation ${grant.fingerprint} closed. ${this.#store.bootstrapped().length} checks now stand on it and are owed a re-review.`
    });
   }
  };
 }

 /* A refusal about acting on the vetting register, written into the chain before the caller is told. */
 #refuseSelf(actor: Actor, partyId: string, field: string, reason: string, event = 'vetting.self.refused'): { ok: false; reason: string } {
  this.#audit.append({
   event, actorId: actor.id, actorRole: actor.role, capability: CAPABILITY, purpose: actor.purpose,
   recordType: RECORD_TYPE, recordId: partyId, subjectId: partyId, field, allowed: false, reason
  });
  return { ok: false, reason };
 }

 /* The operation kind is required and named at every call, never inferred from whose record it is:
    only a read or a self-service act lets the party it is about past the gate on identity alone. */
 #request(actor: Actor, recordId: string, subjectId: string, field: string, operation: AccessOperation): AccessRequest {
  /* The capability is fixed. There is exactly one that opens this record type, so accepting one
     from the caller would only ever be accepting a wrong one. */
  return {
   actorId: actor.id, actorRole: actor.role, capability: CAPABILITY,
   purpose: actor.purpose, recordType: RECORD_TYPE, recordId, subjectId, field, operation
  };
 }

 #resolve(evidence: Evidence, at: number): ResolvedEvidence {
  const resolved = resolve(evidence, at);
  return {
   ...evidence,
   name: this.#checkName(evidence),
   resolved,
   daysRemaining: daysUntil(evidence.expiresOn, at),
   awaitingSecondReviewer: evidence.risk === 'high' && (resolved === 'verified' || resolved === 'expiring') && !evidence.secondedBy,
   bootstrapped: evidence.bootstrappedAt !== null,
   versions: evidence.id ? this.#store.countVersions(evidence.id) : 0,
   assurance: this.#assure(evidence, at)
  };
 }

 #checkName(evidence: Evidence): string {
  return catalogueCheck(evidence.roleId, evidence.checkId)?.name ?? evidence.checkId;
 }

 /* The decision log. It is the same hash chain the gate writes to rather than a second log beside
    it: two append-only logs is one append-only log and one table somebody eventually tidies. */
 #log(event: string, actor: Actor, recordId: string, subjectId: string, field: string, reason: string): void {
  this.#audit.append({
   event, actorId: actor.id, actorRole: actor.role, capability: CAPABILITY,
   purpose: actor.purpose, recordType: RECORD_TYPE, recordId, subjectId, field,
   allowed: true, reason
  });
 }
}

/**
 * A party's standing, said in the register of confidence it has actually earned.
 *
 * The two sentences the brief for this layer turned on are both in here, and they are different
 * sentences: "cleared by review, no authority confirmation" and "confirmed against the SANC
 * register". A patient, a regulator and an investor are all entitled to the second one meaning
 * something, and the only way it can mean something is if the first one is said out loud on the
 * days it is true. Today it is true of every party on this platform.
 */
export type PartyAssurance = {
 checks: number;
 /** Confirmed by an issuing authority, and the confirmation is current. */
 confirmed: number;
 /** Asked, and the authority said something other than yes, or the answer has gone stale. */
 unconfirmed: number;
 /** The authority cannot be asked at all. Eleven of the twelve, today. */
 notIntegrated: number;
 /** A reviewer verified it and the authority disagreed. Loud, and never silently withdrawn. */
 contradicted: number;
 sentence: string;
};

export function partyAssurance(checks: readonly ResolvedEvidence[]): PartyAssurance {
 let confirmed = 0, unconfirmed = 0, notIntegrated = 0, contradicted = 0;
 const registers: string[] = [];
 for (const check of checks) {
  if (check.assurance.contradicts) contradicted += 1;
  if (check.assurance.confirmed) { confirmed += 1; if (!registers.includes(check.authority)) registers.push(check.authority); }
  else if (!check.assurance.integrated) notIntegrated += 1;
  else unconfirmed += 1;
 }
 const total = checks.length;
 /* Composed in one place and in one order: what is wrong first, then what is confirmed, then what
    is resting on a reviewer. A sentence that leads with the good half is a sentence people quote
    the first half of. */
 const parts: string[] = [];
 if (contradicted) parts.push(`${contradicted} of ${total} checks were verified by a reviewer and contradicted by the issuing authority. That has withdrawn nothing automatically and needs a reviewer to look at it.`);
 if (!confirmed) {
  parts.push(`Cleared by review, with no authority confirmation: all ${total} checks rest on a named reviewer having read a document the platform can still produce, and no issuing authority has confirmed any of them.`);
 } else if (confirmed === total) {
  parts.push(`All ${total} checks are confirmed against their issuing authorities (${registers.join(', ')}).`);
 } else {
  parts.push(`${confirmed} of ${total} checks are confirmed against their issuing authorities (${registers.join(', ')}). The other ${total - confirmed} rest on a named reviewer having read a document.`);
 }
 if (notIntegrated) parts.push(`${notIntegrated} of them are with authorities MyThuso cannot ask at all: there is no integration, so no confirmation is possible today by any means.`);
 return { checks: total, confirmed, unconfirmed, notIntegrated, contradicted, sentence: parts.join(' ') };
}

/** SHA-256 of the plaintext, hex. Plain rather than keyed — see the note on submit(). */
export const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
