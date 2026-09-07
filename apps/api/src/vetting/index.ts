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
 * Not real: no credential is checked against an issuing authority. There is no SANC integration, no
 * accredited Home Affairs provider, no SAPS lookup. "Verified" means a named reviewer looked at a
 * document the platform can still produce and said so. That is a workflow, and it is worth having —
 * but it is not the register confirming anything, and this module never says that it is.
 *
 * And underneath the bootstrap there is a floor no code reaches: the first two people are trusted
 * because somebody outside this system trusts them. What is here makes that act deliberate, bounded,
 * single-use and loud in the log. It does not make it checked.
 */
import { createHash, randomUUID } from 'node:crypto';
/* The envelope encoding is reached through the same door as everything else. This file knows that a
   sealed value has a shape and that the database wants one blob; it knows nothing about what is in
   it, and it cannot open one. */
import { decodeSealedValue, encodeSealedValue, standingOf, type AccessRequest, type AuditChain, type BootstrapAuthorisation, type BootstrapAuthority, type Gate, type Standing } from '../protection/index.ts';
import type { Actor, Answer, Evidence, EvidenceVersion, Party, ResolvedEvidence } from './contract.ts';
import { daysUntil, expiryFrom, noticesFor, resolve, type RenewalNotice } from './expiry.ts';
import { catalogueCheck, roleChecks, roleName, type VettingStore } from './store.ts';

export { openVettingStore, vettingSource, SEALED_COLUMNS, roleChecks, roleName } from './store.ts';
export type { VettingStore, BootstrapCeremonyRecord } from './store.ts';
export * from './contract.ts';
export { RENEWAL_MILESTONES, daysUntil, expiryFrom, noticesFor, resolve, severityFor, dedupeKey } from './expiry.ts';
export type { RenewalNotice, NoticeSeverity } from './expiry.ts';

/** The record type the gate knows this by, and the one capability that opens it. */
const RECORD_TYPE = 'vetting-evidence';
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
 now?: () => number;
};

/** Refusal of a bootstrap. Its own type, because it is the one refusal that is never a mistake by a user. */
export class BootstrapRefused extends Error {}

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
 readonly #now: () => number;
 constructor(deps: Deps) {
  this.#gate = deps.gate;
  this.#audit = deps.audit;
  this.#store = deps.store;
  this.#bootstrap = deps.bootstrap;
  this.#now = deps.now ?? (() => Date.now());
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
  if (!roleChecks(party.roleId).length) {
   return { ok: false, reason: `packages/catalog/vetting.json has no role "${party.roleId}", so there is no set of checks to hold this party to.` };
  }
  /* Decided against the party being created, which is the record about to exist. A reviewer who may
     not open this party's evidence may not create them either. */
  const outcome = this.#gate.access(this.#request(actor, party.id, party.id, 'enrolment'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
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

  const sealed = this.#gate.protect(this.#request(request.actor, evidence.id, party.id, field), document);
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
   this.#request(actor, evidence.id, evidence.partyId, field),
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
  const outcome = this.#gate.access(this.#request(request.actor, evidence.id, evidence.partyId, 'state'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  /* The person the evidence is about does not decide about it. Subject access is a right to read
     your own file, and it has never been a right to mark it verified. */
  if (request.actor.id === evidence.partyId) {
   return { ok: false, reason: 'Nobody decides their own vetting. A check is verified by a reviewer, and you are the party it is about.' };
  }
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
  const outcome = this.#gate.access(this.#request(actor, evidence.id, evidence.partyId, 'state'));
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
  const outcome = this.#gate.access(this.#request(actor, partyId, partyId, 'suspension'));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };
  if (actor.id === partyId) return { ok: false, reason: 'Nobody suspends themselves through this route. Ask a reviewer.' };
  this.#store.suspend(partyId, this.#now(), reason);
  this.#log('vetting.suspended', actor, partyId, partyId, 'suspension', reason);
  return { ok: true };
 }

 restore(actor: Actor, partyId: string): Answer<{ suspended?: true }> {
  const outcome = this.#gate.access(this.#request(actor, partyId, partyId, 'suspension'));
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
  */
 standing(partyId: string, at: number = this.#now()): { party: Party; checks: ResolvedEvidence[]; standing: Standing } | null {
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
  return {
   party,
   checks,
   standing: standingOf({
    actorId: party.id, roleId: party.roleId,
    records: evidence.map(record => ({
     checkId: record.checkId, state: record.state,
     ...(record.expiresOn ? { expiresOn: record.expiresOn } : {}),
     ...(record.secondedBy ? { secondedBy: record.secondedBy } : {})
    })),
    ...(party.suspendedAt ? { suspended: true } : {}),
    ...(party.declinedAt ? { declined: true } : {})
   }, at)
  };
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

 /* ---- Internals ------------------------------------------------------------------------------ */

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

 #request(actor: Actor, recordId: string, subjectId: string, field: string): AccessRequest {
  /* The capability is fixed. There is exactly one that opens this record type, so accepting one
     from the caller would only ever be accepting a wrong one. */
  return {
   actorId: actor.id, actorRole: actor.role, capability: CAPABILITY,
   purpose: actor.purpose, recordType: RECORD_TYPE, recordId, subjectId, field
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
   versions: evidence.id ? this.#store.countVersions(evidence.id) : 0
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

/** SHA-256 of the plaintext, hex. Plain rather than keyed — see the note on submit(). */
export const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
