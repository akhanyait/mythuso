/**
 * The consent gateway: the only way into the store, and deny by default.
 *
 * ── The rule every method keeps ──────────────────────────────────────────────────────────────
 *
 * §16: "There is no code path that reads a record without a consent grant, a break-glass
 * justification, or the patient's own session." So there are three requesters and no fourth. A read
 * arriving with none of them is refused with a sentence, and the refusal is written into the audit
 * chain exactly as a granted read is — a log that only records successes cannot show a patient that
 * somebody tried. That includes the refusals the HTTP layer decides before a requester is known
 * (`refuseRequest`), written under a descriptor that identifies nobody, and it includes a probe of
 * somebody else's record: a grant holder asking for patient B's entry with patient A's grant is
 * logged under A, and logged again under B — without the grant's reference, because B has no business
 * learning A's grant id — so that B's "who looked at my record" shows that somebody tried.
 *
 * A grant is the artefact the patient signed through their session: subject, recipientRole, scope,
 * purpose, expiresAt, sealedIncluded — exactly the fields packages/catalog/consent.json's `grants`
 * holds. When it is made, the role must exist, the purpose must be one the role may name, the end date
 * must fall inside the role's ceiling, and the scope must pass `grantScopeRefusal`. On every call it is
 * checked again, in this order, and refused at the first failure: signed by this Passport, still on
 * the register, not revoked, not expired, for this subject, for a role that may read this way, for
 * this purpose, and covering this category. Every sentence is packages/catalog/passport-gateway.json's.
 *
 * ── Sealed and private ───────────────────────────────────────────────────────────────────────
 *
 * A category records.json marks protected is sealed: encrypted under a data key of its own, and
 * opened under a grant only when the sealed tick is set and the scope names that category. The tick
 * names what it opens — a tick with no sealed category in the scope is refused when the grant is
 * made. An entry the patient marks private is sealed under a key of its own too, and in P0 no grant
 * opens it at all: before this was fixed, a caregiver's grant for vital signs with the tick set
 * returned a vital-sign reading the patient had marked private, because the tick was one boolean
 * that opened everything sealed behind any category in scope. A clinician whose read left sealed or
 * private content out is told that sealed content exists — "the existence is visible, the content is
 * not" (§20) — and anybody else is told nothing.
 *
 * ── Break-glass ──────────────────────────────────────────────────────────────────────────────
 *
 * Opens the emergency summary and nothing else. Who is breaking the glass comes from an operator
 * credential (src/operator.ts), never from the body. The reason is one from the contract's list, and
 * its sentence is what goes into the patient-visible chain; the note is screened for phone numbers,
 * identity numbers and email addresses, refused if it carries one, and stored sealed under the
 * patient's key beside the entry for the review — never in the chain, which the patient reads and
 * which is kept for the life of the record, and which is exactly where a name written under pressure
 * would otherwise end up.
 *
 * ── What is absent ───────────────────────────────────────────────────────────────────────────
 *
 * Real authentication. A grant is a bearer artefact for its role, a patient session is a development
 * token this service mints, and an operator credential is a development token minted at the console.
 * OIDC for people and mutual TLS for systems (§22) need a provider and certificates that do not exist,
 * which is one of the reasons this service runs in development only.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import sharing from '../../../packages/catalog/passport-sharing.json' with { type: 'json' };
/* The Record engine's settings and link rules are pure arithmetic over contracts, shared with the web preview so
   the two cannot disagree about a rule. They import no store, no key and nothing from apps/api. */
import { sharingInForce, type SharingInForce } from '../../../packages/engines/src/record/domain/settings.ts';
import { linkTermsFor, payerRefusal, statusOf, useRefusal, type GrantTerms } from '../../../packages/engines/src/record/domain/links.ts';
import { AuditLog, type AuditEntry } from './audit.ts';
import { PassportRefusedToStart, wasLoaded, type PassportConfig } from './config.ts';
import { GATEWAY, expiryCeilingDays, grantScopeRefusal, isProtectedCategory, knownCategory, refusalOf, resourceRule, roleRule, sensitivityOf, statement, type GrantRole } from './contract.ts';
import { PassportKeys, openBytes, readToken, sealBytes, signToken } from './keys.ts';
import { developerOf, operatorOf } from './operator.ts';
import { identityShaped } from './screen.ts';
import { OPEN, PRIVATE, SEALED, type PassportStore, type ResourceRow } from './store.ts';

export type Refused = { ok: false; status: number; reason: string };
export type Answer<T> = ({ ok: true } & T) | Refused;

export type GrantFields = {
 subject: string;
 recipientRole: string;
 scope: string[];
 purpose: string;
 expiresAt: string;
 sealedIncluded?: boolean;
};
export type GrantArtefact = Required<GrantFields> & { id: string; issuedAt: string };

/** Who is asking. There is no fourth kind and no field a caller can set to become one. */
export type Requester =
 | { kind: 'patient'; session: string }
 | { kind: 'grant'; artefact: string; purpose: string };

export type WriteInput = {
 subject: string;
 resourceType: string;
 category: string;
 resource: Record<string, unknown>;
 provenance?: { activity?: unknown; sourceSystem?: unknown };
 markedPrivate?: boolean;
};

export type BreakGlassRequest = { credential: string; subject: string; reasonCode: string; note: string };

const TOKEN = /^pp_[0-9a-f]{32}$/;
const GENERAL_SCOPE = 'general';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/* Who the audit chain says asked, when nothing on the request has identified anybody yet. */
const UNAUTHENTICATED = 'unauthenticated';

type Held = { subject: string; role: GrantRole; grant: GrantArtefact };
type Who = Partial<AuditEntry> & Pick<AuditEntry, 'requesterRole' | 'action'>;

export class PassportGateway {
 #store: PassportStore;
 #keys: PassportKeys;
 #audit: AuditLog;
 #now: () => number;
 #settings: () => SharingInForce;

 constructor(deps: { config: PassportConfig; store: PassportStore; now?: () => number; settings?: () => SharingInForce }) {
  /* A gateway built from a configuration nobody loaded would skip every start-up refusal — the
     development flag, the key separation, the separate database. So it is not built. */
  if (!wasLoaded(deps.config)) throw new PassportRefusedToStart(refusalOf('not-development'));
  this.#store = deps.store;
  this.#keys = new PassportKeys(deps.config.masterKey);
  this.#audit = new AuditLog(deps.store.database, this.#keys);
  this.#now = deps.now ?? Date.now;
  /* The Record settings in force, asked once when a link is made. The process has no authenticated way to
     read the engine runtime's history, so it reads the contract's defaults; a test hands it a history. */
  this.#settings = deps.settings ?? (() => sharingInForce([]));
 }

 get audit(): AuditLog { return this.#audit; }

 /** A refusal the HTTP layer decided before any requester was known, written down all the same. */
 refuseRequest(status: number, id: string, action: string): Refused {
  return this.#refuse(status, id, { subject: null, requesterRole: UNAUTHENTICATED, requesterRef: null, action });
 }

 /* ---- Subjects and the development session ---------------------------------------------------- */

 /**
  * A synthetic subject and a patient session for it. The token is minted here and nowhere else, so a
  * subject can never be an identity number somebody typed. The session is the development stand-in
  * for an OIDC patient login: it expires, it can be ended, and it is registered, so a token that was
  * signed but never issued is not a session.
  */
 createSubject(credential: string): Answer<{ subject: string; patientSession: string }> {
  const at = this.#now();
  const developer = developerOf(this.#keys, String(credential ?? ''), at);
  if (!developer) return this.#refuse(401, 'developer-credential-required', { subject: null, requesterRole: UNAUTHENTICATED, requesterRef: null, action: 'dev.subjects' });
  const subject = `pp_${randomBytes(16).toString('hex')}`;
  this.#store.addSubject(subject, at);
  const id = `sess_${randomBytes(16).toString('hex')}`;
  const expiresAt = at + GATEWAY.patientSession.lifetimeMinutes * MINUTE;
  this.#store.putSession({ id, subject, expires_at: expiresAt, revoked_at: null, created_at: at });
  this.#log({ subject, requesterRole: 'developer', requesterRef: developer.ref, action: 'dev.subjects', outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, subject, patientSession: signToken(this.#keys, 'session', { kind: 'patient-session', id, subject, expiresAt }) };
 }

 #session(token: string): { ok: true; subject: string; id: string } | { ok: false; id: 'patient-session-required' | 'session-ended' } {
  const read = readToken(this.#keys, 'session', token);
  const { kind, id, subject } = read?.body ?? {};
  if (kind !== 'patient-session' || typeof id !== 'string' || typeof subject !== 'string') return { ok: false, id: 'patient-session-required' };
  const row = this.#store.session(id);
  if (!row || row.subject !== subject) return { ok: false, id: 'patient-session-required' };
  if (row.revoked_at !== null || row.expires_at <= this.#now()) return { ok: false, id: 'session-ended' };
  return { ok: true, subject, id };
 }

 endSession(token: string): Answer<{ ended: true }> {
  const session = this.#session(token);
  const who = { subject: session.ok ? session.subject : null, requesterRole: 'patient', requesterRef: session.ok ? session.subject : null, action: 'session.end' };
  if (!session.ok) return this.#refuse(401, session.id, who);
  this.#store.endSession(session.id, this.#now());
  this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, ended: true };
 }

 /* ---- Grants ----------------------------------------------------------------------------------- */

 grant(token: string, fields: GrantFields): Answer<{ grantId: string; artefact: string; grant: GrantArtefact }> {
  const session = this.#session(token);
  const purpose = typeof fields.purpose === 'string' ? fields.purpose : null;
  const who: Who = { subject: session.ok ? session.subject : null, requesterRole: 'patient', requesterRef: session.ok ? session.subject : null, action: 'consent.grant', purpose };
  if (!session.ok) return this.#refuse(401, session.id, who);
  const subject = session.subject;
  if (fields.subject !== subject) { this.#probe(fields.subject, who); return this.#refuse(403, 'wrong-subject', who); }
  const role = roleRule(String(fields.recipientRole));
  if (!role) return this.#refuse(400, 'unknown-role', who);
  if (role.reads === 'aggregate') return this.#refuse(403, 'aggregate-only', who);
  if (!Array.isArray(fields.scope) || !fields.scope.every(category => typeof category === 'string' && knownCategory(category))) return this.#refuse(400, 'unknown-category', who);
  if (!purpose || !role.allowedPurposes.includes(purpose)) return this.#refuse(403, 'purpose-not-allowed', who);
  const expiresAt = Date.parse(String(fields.expiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) return this.#refuse(400, 'expired', who);
  /* The shorter of the role's own ceiling and the founder's contract-wide one. */
  if (expiresAt > this.#now() + expiryCeilingDays(role) * DAY) return this.#refuse(403, 'expiry-too-long', who);
  const sealedIncluded = fields.sealedIncluded === true;
  const scopeRefusal = grantScopeRefusal(role, fields.scope, sealedIncluded);
  if (scopeRefusal) return this.#refuse(scopeRefusal === 'unknown-category' ? 400 : 403, scopeRefusal, who);

  const grant: GrantArtefact = {
   id: `grant_${randomUUID()}`, subject, recipientRole: role.id, scope: [...fields.scope], purpose,
   expiresAt: new Date(expiresAt).toISOString(), sealedIncluded, issuedAt: new Date(this.#now()).toISOString()
  };
  const artefact = signToken(this.#keys, 'grant', grant);
  this.#store.putGrant({ id: grant.id, subject, expires_at: expiresAt, revoked_at: null, artefact_hash: createHash('sha256').update(artefact).digest('hex'), created_at: this.#now() });
  /* The terms a share link is later held to, kept sealed beside the grant: the artefact is the recipient's,
     and a link is made by the patient, who should not have to hand the gateway back what it already signed. */
  const terms = { recipientRole: grant.recipientRole, scope: grant.scope, purpose: grant.purpose, sealedIncluded: grant.sealedIncluded };
  this.#store.putGrantTerms(grant.id, subject, sealBytes(this.#dataKey(subject, GENERAL_SCOPE), Buffer.from(JSON.stringify(terms), 'utf8'), `grant-terms|${subject}|${grant.id}`), this.#now());
  this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, grantId: grant.id, artefact, grant };
 }

 revoke(token: string, grantId: string): Answer<{ revoked: string }> {
  const session = this.#session(token);
  const who: Who = { subject: session.ok ? session.subject : null, requesterRole: 'patient', requesterRef: session.ok ? session.subject : null, action: 'consent.revoke' };
  if (!session.ok) return this.#refuse(401, session.id, who);
  const row = this.#store.grant(grantId);
  if (!row || row.subject !== session.subject) {
   if (row) this.#probe(row.subject, who);
   return this.#refuse(404, 'not-found', who);
  }
  this.#store.revokeGrant(grantId, this.#now());
  this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, revoked: grantId };
 }

 /**
  * The grant, verified, or the sentence it is refused with. Order matters and is the order a person
  * can act on: an altered artefact is not "expired", and an expired grant is not "the wrong purpose".
  */
 #hold(artefact: string, purpose: string): { ok: true; held: Held } | { ok: false; status: number; id: string; role: string; ref: string | null; subject: string | null } {
  const read = readToken(this.#keys, 'grant', artefact);
  if (!read) return { ok: false, status: 401, id: 'bad-grant', role: UNAUTHENTICATED, ref: null, subject: null };
  const grant = read.body as unknown as GrantArtefact;
  const who = { role: String(grant.recipientRole), ref: String(grant.id), subject: this.#store.hasSubject(String(grant.subject)) ? grant.subject : null };
  const row = this.#store.grant(String(grant.id));
  if (!row || row.artefact_hash !== createHash('sha256').update(artefact).digest('hex')) return { ok: false, status: 401, id: 'bad-grant', ...who };
  if (row.revoked_at !== null) return { ok: false, status: 403, id: 'revoked', ...who };
  if (row.expires_at <= this.#now()) return { ok: false, status: 403, id: 'expired', ...who };
  const role = roleRule(grant.recipientRole);
  if (!role) return { ok: false, status: 403, id: 'unknown-role', ...who };
  if (role.reads === 'aggregate') return { ok: false, status: 403, id: 'aggregate-only', ...who };
  if (purpose !== grant.purpose) return { ok: false, status: 403, id: 'wrong-purpose', ...who };
  return { ok: true, held: { subject: grant.subject, role, grant } };
 }

 #refuseHold(held: { status: number; id: string; role: string; ref: string | null; subject: string | null }, who: Who): Refused {
  return this.#refuse(held.status, held.id, { ...who, subject: held.subject, requesterRole: held.role, requesterRef: held.ref });
 }

 /** A grant artefact checked against one category and purpose, without opening anything. Audited all the same. */
 check(artefact: string, purpose: string, category: string): Answer<{ allowed: true; sealed: boolean }> {
  const base: Who = { requesterRole: UNAUTHENTICATED, action: 'consent.check', purpose };
  const held = this.#hold(artefact, purpose);
  if (!held.ok) return this.#refuseHold(held, base);
  const { grant, role, subject } = held.held;
  const who: Who = { ...base, subject, requesterRole: role.id, requesterRef: grant.id };
  if (role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', who);
  if (!grant.scope.includes(category)) return this.#refuse(403, 'out-of-scope', who);
  const sealed = isProtectedCategory(category);
  if (sealed && !grant.sealedIncluded) return this.#refuse(403, 'out-of-scope', who);
  this.#log({ ...who, outcome: 'granted', reason: statement('granted') });
  return { ok: true, allowed: true, sealed };
 }

 /* ---- Writes ----------------------------------------------------------------------------------- */

 write(requester: Requester, input: WriteInput): Answer<{ id: string; version: number; provenance: string }> {
  const at = this.#now();
  const who: Who = { subject: null, requesterRole: requester.kind === 'patient' ? 'patient' : UNAUTHENTICATED, requesterRef: null, action: 'write', resourceType: String(input.resourceType), purpose: requester.kind === 'grant' ? requester.purpose : null };

  let authorRole: string;
  let authorRef: string;
  let grant: GrantArtefact | null = null;
  if (requester.kind === 'patient') {
   const session = this.#session(requester.session);
   if (!session.ok) return this.#refuse(401, session.id === 'session-ended' ? 'session-ended' : 'no-grant', who);
   Object.assign(who, { subject: session.subject, requesterRef: session.subject });
   authorRole = 'patient';
   authorRef = session.subject;
  } else {
   const held = this.#hold(requester.artefact, requester.purpose);
   if (!held.ok) return this.#refuseHold(held, who);
   Object.assign(who, { subject: held.held.subject, requesterRole: held.held.role.id, requesterRef: held.held.grant.id });
   if (held.held.role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', who);
   if (!held.held.role.writes) return this.#refuse(403, 'write-not-permitted', who);
   authorRole = held.held.role.id;
   authorRef = held.held.grant.id;
   grant = held.held.grant;
  }
  const subject = who.subject!;
  if (input.subject !== subject) { this.#probe(input.subject, who); return this.#refuse(403, 'wrong-subject', who); }

  const rule = resourceRule(String(input.resourceType));
  if (!rule || !rule.writable) return this.#refuse(400, 'not-stored-here', who);
  const category = String(input.category);
  if (!knownCategory(category)) return this.#refuse(400, 'unknown-category', who);
  if (!rule.categories.includes(category)) return this.#refuse(400, 'wrong-category', who);
  const markedPrivate = input.markedPrivate === true;
  const kind = markedPrivate ? PRIVATE : isProtectedCategory(category) ? SEALED : OPEN;
  /* A grant writes only inside what it opens: its own scope, a sealed category only with the tick, and
     never a private entry — marking something private is the patient's act, not a clinician's. */
  if (grant && (!grant.scope.includes(category) || (kind === SEALED && !grant.sealedIncluded) || kind === PRIVATE)) return this.#refuse(403, 'out-of-scope', who);

  const body = input.resource && typeof input.resource === 'object' && !Array.isArray(input.resource) ? input.resource : {};
  const { id: _id, meta: _meta, subject: _subject, resourceType: _type, category: _category, markedPrivate: _private, ...rest } = body as Record<string, unknown>;
  const activity = input.provenance?.activity;
  const sourceSystem = input.provenance?.sourceSystem;
  if (typeof activity !== 'string' || !activity.trim() || typeof sourceSystem !== 'string' || !sourceSystem.trim()) return this.#refuse(400, 'no-provenance', who);
  if (identityShaped(rest) || identityShaped(activity) || identityShaped(sourceSystem)) return this.#refuse(400, 'identity-in-resource', who);

  const id = `res_${randomUUID()}`;
  const tag = this.#keys.categoryTag(subject, category);
  const keyScope = kind === OPEN ? GENERAL_SCOPE : `${kind === SEALED ? 'sealed' : 'private'}:${tag}`;
  const version = 1;
  /* What the caller sent goes in first, and what the gateway decided goes on top of it, so a body
     cannot overwrite the category or the private mark that decides who may read the entry. */
  const resource = {
   ...rest,
   resourceType: input.resourceType, id,
   meta: { versionId: String(version), lastUpdated: new Date(at).toISOString() },
   ...(input.resourceType === 'Patient' ? {} : { subject: { reference: `Patient/${subject}` } }),
   category,
   markedPrivate
  };
  const key = this.#dataKey(subject, keyScope);
  this.#store.putResource({
   id, subject, resource_type: input.resourceType, category_tag: tag, key_scope: keyScope, sealed: kind, version,
   sealed_body: sealBytes(key, Buffer.from(JSON.stringify(resource), 'utf8'), `${subject}|${id}|${keyScope}|${version}`), written_at: at
  });
  const provenance = `prov_${randomUUID()}`;
  this.#store.putProvenance({
   id: provenance, subject, target: id, key_scope: keyScope, recorded_at: at,
   sealed_body: sealBytes(key, Buffer.from(JSON.stringify({ authorRole, authorRef, sourceSystem: sourceSystem.trim(), activity: activity.trim() }), 'utf8'), `provenance|${subject}|${provenance}|${id}|${keyScope}`)
  });
  this.#log({ ...who, outcome: 'granted', reason: statement('written') });
  return { ok: true, id, version, provenance };
 }

 /* ---- Reads ------------------------------------------------------------------------------------ */

 read(requester: Requester, resourceType: string, id: string): Answer<{ resource: Record<string, unknown> | null; provenance: Record<string, unknown>[]; sealedContentExists?: true; notice?: string }> {
  const who: Who = { subject: null, requesterRole: requester.kind === 'patient' ? 'patient' : UNAUTHENTICATED, requesterRef: null, action: 'read', resourceType, purpose: requester.kind === 'grant' ? requester.purpose : null };
  const row = this.#store.resource(id);
  const found = row && row.resource_type === resourceType ? row : null;
  if (requester.kind === 'patient') {
   const session = this.#session(requester.session);
   if (!session.ok) return this.#refuse(401, session.id === 'session-ended' ? 'session-ended' : 'no-grant', who);
   Object.assign(who, { subject: session.subject, requesterRef: session.subject });
   if (!found) return this.#refuse(404, 'not-found', who);
   if (found.subject !== session.subject) { this.#probe(found.subject, who); return this.#refuse(404, 'not-found', who); }
   this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
   return { ok: true, resource: this.#open(found), provenance: this.#provenance(found) };
  }
  const held = this.#hold(requester.artefact, requester.purpose);
  if (!held.ok) return this.#refuseHold(held, who);
  const { grant, role, subject } = held.held;
  Object.assign(who, { subject, requesterRole: role.id, requesterRef: grant.id });
  if (!found) return this.#refuse(404, 'not-found', who);
  if (found.subject !== subject) { this.#probe(found.subject, who); return this.#refuse(404, 'not-found', who); }
  if (role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', who);
  const category = grant.scope.find(candidate => this.#keys.categoryTag(subject, candidate) === found.category_tag);
  if (!category || !this.#opens(found, grant)) {
   if (found.sealed !== OPEN && role.clinician) {
    this.#log({ ...who, outcome: 'refused', reason: statement('sealedExists') });
    return { ok: true, resource: null, provenance: [], sealedContentExists: true, notice: statement('sealedExists') };
   }
   return this.#refuse(403, 'out-of-scope', who);
  }
  if (role.reads === 'routine' && sensitivityOf(category) !== 'routine') return this.#refuse(403, 'clinical-detail', who);
  this.#log({ ...who, outcome: 'granted', reason: statement('granted') });
  return { ok: true, resource: this.#open(found), provenance: this.#provenance(found) };
 }

 /** Every resource of one type for one subject that the requester may open, and — for a clinician — whether sealed content was left out. */
 search(requester: Requester, resourceType: string, subjectAsked: string): Answer<{ entries: Record<string, unknown>[]; sealedContentExists?: true; notice?: string }> {
  const who: Who = { subject: null, requesterRole: requester.kind === 'patient' ? 'patient' : UNAUTHENTICATED, requesterRef: null, action: 'search', resourceType, purpose: requester.kind === 'grant' ? requester.purpose : null };
  if (!TOKEN.test(subjectAsked)) return this.#refuse(400, 'not-a-token', who);
  const rule = resourceRule(resourceType);
  if (!rule) return this.#refuse(400, 'not-stored-here', who);
  if (requester.kind === 'patient') {
   const session = this.#session(requester.session);
   if (!session.ok) return this.#refuse(401, session.id === 'session-ended' ? 'session-ended' : 'no-grant', who);
   Object.assign(who, { subject: session.subject, requesterRef: session.subject });
   if (session.subject !== subjectAsked) { this.#probe(subjectAsked, who); return this.#refuse(403, 'wrong-subject', who); }
   this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
   return { ok: true, entries: this.#store.resourcesOf(session.subject, resourceType).map(row => this.#open(row)) };
  }
  const held = this.#hold(requester.artefact, requester.purpose);
  if (!held.ok) return this.#refuseHold(held, who);
  const { grant, role, subject } = held.held;
  Object.assign(who, { subject, requesterRole: role.id, requesterRef: grant.id });
  if (subject !== subjectAsked) { this.#probe(subjectAsked, who); return this.#refuse(403, 'wrong-subject', who); }
  if (role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', who);
  const categories = grant.scope.filter(category => rule.categories.includes(category));
  if (!categories.length) return this.#refuse(403, 'out-of-scope', who);
  const tags = new Set(categories.map(category => this.#keys.categoryTag(subject, category)));
  const all = this.#store.resourcesOf(subject, resourceType);
  const visible = all.filter(row => tags.has(row.category_tag) && this.#opens(row, grant));
  /* Compared by id. The rows come from two reads of the table, so two objects for the same entry are
     never the same object, and comparing the objects said "sealed content exists" about entries that
     had just been shown. */
  const shown = new Set(visible.map(row => row.id));
  const leftOut = all.some(row => row.sealed !== OPEN && !shown.has(row.id));
  this.#log({ ...who, outcome: 'granted', reason: statement('granted') });
  return {
   ok: true,
   entries: visible.map(row => this.#open(row)),
   ...(leftOut && role.clinician ? { sealedContentExists: true as const, notice: statement('sealedExists') } : {})
  };
 }

 /* ---- The emergency summary and break-glass ---------------------------------------------------- */

 emergencySummary(requester: Requester, subjectAsked: string): Answer<{ summary: Record<string, Record<string, unknown>[]> }> {
  const who: Who = { subject: null, requesterRole: requester.kind === 'patient' ? 'patient' : UNAUTHENTICATED, requesterRef: null, action: 'summary.emergency', purpose: requester.kind === 'grant' ? requester.purpose : null };
  if (!TOKEN.test(subjectAsked)) return this.#refuse(400, 'not-a-token', who);
  if (requester.kind === 'patient') {
   const session = this.#session(requester.session);
   if (!session.ok) return this.#refuse(401, session.id === 'session-ended' ? 'session-ended' : 'no-grant', who);
   Object.assign(who, { subject: session.subject, requesterRef: session.subject });
   if (session.subject !== subjectAsked) { this.#probe(subjectAsked, who); return this.#refuse(403, 'wrong-subject', who); }
   this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
   return { ok: true, summary: this.#summary(session.subject) };
  }
  const held = this.#hold(requester.artefact, requester.purpose);
  if (!held.ok) return this.#refuseHold(held, who);
  const { grant, role, subject } = held.held;
  Object.assign(who, { subject, requesterRole: role.id, requesterRef: grant.id });
  if (subject !== subjectAsked) { this.#probe(subjectAsked, who); return this.#refuse(403, 'wrong-subject', who); }
  if (!grant.scope.includes(GATEWAY.emergencySummary.openedBy)) return this.#refuse(403, 'out-of-scope', who);
  this.#log({ ...who, outcome: 'granted', reason: statement('granted') });
  return { ok: true, summary: this.#summary(subject) };
 }

 breakGlass(request: BreakGlassRequest): Answer<{ summary: Record<string, Record<string, unknown>[]>; notice: string; reviewDueBy: string; auditSeq: number }> {
  const at = this.#now();
  const operator = operatorOf(this.#keys, String(request.credential ?? ''), at);
  const subjectAsked = String(request.subject ?? '');
  const who: Who = {
   subject: TOKEN.test(subjectAsked) && this.#store.hasSubject(subjectAsked) ? subjectAsked : null,
   requesterRole: operator?.role ?? UNAUTHENTICATED, requesterRef: operator?.ref ?? null, action: 'breakglass', purpose: 'emergency'
  };
  if (!operator) return this.#refuse(401, 'breakglass-role', who);
  const reason = GATEWAY.breakGlass.reasons.find(candidate => candidate.id === request.reasonCode);
  const note = typeof request.note === 'string' ? request.note.trim() : '';
  const words = note.split(/\s+/).filter(Boolean).length;
  if (!reason || words < GATEWAY.breakGlass.noteMinimumWords || note.length > GATEWAY.breakGlass.noteMaximumCharacters) return this.#refuse(400, 'breakglass-justification', who);
  if (identityShaped(note)) return this.#refuse(400, 'breakglass-note-identifying', who);
  if (!TOKEN.test(subjectAsked)) return this.#refuse(400, 'not-a-token', who);
  if (!who.subject) return this.#refuse(404, 'not-found', who);
  const reviewDueAt = at + GATEWAY.breakGlass.reviewWithinHours * HOUR;
  const seq = this.#log({ ...who, outcome: 'granted', reason: reason.sentence, breakGlass: true, reviewDueAt });
  this.#store.putBreakGlassNote(seq, subjectAsked, sealBytes(this.#dataKey(subjectAsked, GENERAL_SCOPE), Buffer.from(note, 'utf8'), `breakglass-note|${subjectAsked}|${seq}`), at);
  return {
   ok: true,
   summary: this.#summary(subjectAsked),
   notice: statement('breakGlassOpened').replace('{hours}', String(GATEWAY.breakGlass.reviewWithinHours)),
   reviewDueBy: new Date(reviewDueAt).toISOString(),
   auditSeq: seq
  };
 }

 /* ---- The patient's own audit ------------------------------------------------------------------ */

 auditMine(token: string): Answer<{ entries: Record<string, unknown>[]; chain: { intact: boolean; entries: number; firstBroken: number | null } }> {
  const session = this.#session(token);
  if (!session.ok) return this.#refuse(401, session.id, { subject: null, requesterRole: 'patient', requesterRef: null, action: 'audit.read' });
  this.#log({ subject: session.subject, requesterRole: 'patient', requesterRef: session.subject, action: 'audit.read', outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, entries: this.#audit.forSubject(session.subject), chain: this.#audit.verify() };
 }

 /* ---- Share links (Passport P1) ---------------------------------------------------------------

    A share link is a grant the patient made, made narrower. packages/engines/src/record/domain/links.ts
    decides what a link may be, from the grant's sealed terms and the Record settings in force when it is
    made, and the web preview asks the same function, so the two cannot disagree about a rule. This stores
    what it decided, opens only what it decided, and writes every attempt — made, opened, refused, revoked —
    into the patient's chain. The secret is kept as a digest and never written into the chain, which names
    the link by its reference; whoever opens a link is written down as the role of the grant it rides on,
    because that is who the patient made it for, and the chain cannot know more about a bearer than that. */

 createLink(token: string, fields: { grantId?: unknown; recipientRole?: unknown; kindCode?: unknown; scope?: unknown; sealedIncluded?: unknown; expiresAt?: unknown }): Answer<{ linkRef: string; linkSecret: string; kindCode: string; scope: string[]; expiresAt: string; usesAllowed: number; settingsVersion: number }> {
  const at = this.#now();
  const session = this.#session(token);
  const who: Who = { subject: session.ok ? session.subject : null, requesterRole: 'patient', requesterRef: session.ok ? session.subject : null, action: 'share.link.create' };
  if (!session.ok) return this.#refuse(401, session.id, who);
  const body = fields && typeof fields === 'object' ? fields : {};
  /* A payer before any grant is looked at, so the refusal says nothing about which grants this patient holds. */
  if (payerRefusal(body.recipientRole)) return this.#refuse(403, 'link-to-a-payer', who);
  const row = this.#store.grant(String(body.grantId ?? ''));
  if (!row || row.subject !== session.subject) {
   if (row) this.#probe(row.subject, who);
   return this.#refuse(404, 'not-found', who);
  }
  const grant = this.#grantTerms(row);
  if (!grant) return this.#refuse(404, 'not-found', who);
  who.purpose = grant.purpose;
  const decided = linkTermsFor(body, grant, this.#settings(), at);
  if (!decided.ok) return this.#refuse(statusOf(decided.refusal), decided.refusal, who);
  const terms = decided.value;
  const id = `lnk_${randomUUID()}`;
  const linkSecret = `${id}.${randomBytes(24).toString('base64url')}`;
  const kept = { recipientRole: terms.recipientRole, purpose: terms.purpose, scope: terms.scope, sealedIncluded: terms.sealedIncluded };
  this.#store.putLink({
   id, subject: session.subject, grant_id: row.id, kind: terms.kindCode, secret_hash: createHash('sha256').update(linkSecret).digest('hex'),
   sealed_body: sealBytes(this.#dataKey(session.subject, GENERAL_SCOPE), Buffer.from(JSON.stringify(kept), 'utf8'), `share-link|${session.subject}|${id}`),
   expires_at: terms.expiresAt, uses_allowed: terms.usesAllowed, settings_version: terms.settingsVersion, revoked_at: null, created_at: at
  });
  this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, linkRef: id, linkSecret, kindCode: terms.kindCode, scope: [...terms.scope], expiresAt: new Date(terms.expiresAt).toISOString(), usesAllowed: terms.usesAllowed, settingsVersion: terms.settingsVersion };
 }

 /**
  * A use of a link: a read through the gateway. Its own revocation and end first, then its grant's, then its
  * uses — and a retry with a key already counted is the same use, so a clinic on a bad connection does not
  * use up the patient's link. Refused uses are written into the patient's chain as surely as granted ones.
  */
 openLink(secret: string, idempotencyKey: string): Answer<{ opened: { category: string; resources: Record<string, unknown>[] }[]; purpose: string; usesLeft: number; expiresAt: string }> {
  const at = this.#now();
  const who: Who = { subject: null, requesterRole: UNAUTHENTICATED, requesterRef: null, action: 'share.link.use' };
  const presented = typeof secret === 'string' ? secret : '';
  const shaped = /^(lnk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[A-Za-z0-9_-]{32}$/.exec(presented);
  const row = shaped ? this.#store.link(shaped[1]!) : null;
  const given = Buffer.from(createHash('sha256').update(presented).digest('hex'), 'utf8');
  if (!row || !timingSafeEqual(Buffer.from(row.secret_hash, 'utf8'), given)) return this.#refuse(401, 'link-not-recognised', who);
  const link = this.#linkTerms(row);
  Object.assign(who, { subject: row.subject, requesterRole: link.recipientRole, requesterRef: row.id, purpose: link.purpose });
  const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!key) return this.#refuse(400, 'idempotency-key-required', who);
  const useKey = createHash('sha256').update(`${row.id}|${key}`).digest('hex');
  const counted = this.#store.linkUseCounted(row.id, useKey);
  const grant = this.#store.grant(row.grant_id);
  const refusal = useRefusal({ revokedAt: row.revoked_at, expiresAt: row.expires_at, usesAllowed: row.uses_allowed }, this.#store.linkUseCount(row.id), grant && { revokedAt: grant.revoked_at, expiresAt: grant.expires_at }, at, counted);
  if (refusal) return this.#refuse(statusOf(refusal), refusal, who);
  if (!counted) this.#store.putLinkUse(row.id, useKey, at);
  const opened = link.scope.map(category => ({ category, resources: this.#linkResources(row.subject, category, link.sealedIncluded) }));
  this.#log({ ...who, outcome: 'granted', reason: statement('linkUsed') });
  return { ok: true, opened, purpose: link.purpose, usesLeft: row.uses_allowed - this.#store.linkUseCount(row.id), expiresAt: new Date(row.expires_at).toISOString() };
 }

 revokeLink(token: string, linkRef: string): Answer<{ revoked: true; revokedAt: string }> {
  const session = this.#session(token);
  const who: Who = { subject: session.ok ? session.subject : null, requesterRole: 'patient', requesterRef: session.ok ? session.subject : null, action: 'share.link.revoke' };
  if (!session.ok) return this.#refuse(401, session.id, who);
  const row = this.#store.link(String(linkRef ?? ''));
  if (!row || row.subject !== session.subject) {
   if (row) this.#probe(row.subject, who);
   return this.#refuse(404, 'not-found', who);
  }
  /* Revoked once. A second revocation changes nothing and says when the first one happened. */
  this.#store.revokeLink(row.id, this.#now());
  const revokedAt = this.#store.link(row.id)?.revoked_at ?? this.#now();
  this.#log({ ...who, outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, revoked: true, revokedAt: new Date(revokedAt).toISOString() };
 }

 /* ---- The export (Passport P1) -------------------------------------------------------------------

    The patient's own record as a FHIR R4 Bundle, in their own session. There is no step-up, because the
    Passport has no second factor, and the answer says so in packages/catalog/passport-sharing.json's
    sentence rather than implying one. A sealed category goes in only when the patient names it; a private
    entry never does in P0. Nothing is kept for collection: the bundle is this answer and nowhere else, and
    the export is written into the chain like any other access. */

 exportRecord(token: string, fields: { format?: unknown; sealedCategories?: unknown }): Answer<{ exportRef: string; bundle: { resourceType: 'Bundle'; id: string; type: 'collection'; timestamp: string; entry: { fullUrl: string; resource: Record<string, unknown> }[] }; exclusions: { excludedCode: string; statement: string }[]; stepUp: string }> {
  const at = this.#now();
  const session = this.#session(token);
  const who: Who = { subject: session.ok ? session.subject : null, requesterRole: 'patient', requesterRef: session.ok ? session.subject : null, action: 'export' };
  if (!session.ok) return this.#refuse(401, session.id, who);
  const body = fields && typeof fields === 'object' ? fields : {};
  if (!sharing.export.formats.some(format => format.built && format.id === body.format)) return this.#refuse(422, 'export-format-not-built', who);
  const ticked: unknown[] = body.sealedCategories === undefined ? [] : Array.isArray(body.sealedCategories) ? body.sealedCategories : [null];
  if (!ticked.every(category => typeof category === 'string' && knownCategory(category))) return this.#refuse(400, 'unknown-category', who);
  const named = ticked as string[];
  if (!named.every(isProtectedCategory)) return this.#refuse(403, 'sealed-tick-names-nothing', who);
  const subject = session.subject;
  const tags = new Set(named.map(category => this.#keys.categoryTag(subject, category)));
  const rows = this.#store.resourcesOf(subject).filter(row => row.sealed === OPEN || (row.sealed === SEALED && tags.has(row.category_tag)));
  const exportRef = `export_${randomUUID()}`;
  const entry = rows.flatMap(row => [
   { fullUrl: `urn:mythuso:passport:${row.id}`, resource: this.#open(row) },
   ...this.#provenance(row).map(provenance => ({ fullUrl: `urn:mythuso:passport:${String(provenance.id)}`, resource: provenance }))
  ]);
  this.#log({ ...who, outcome: 'granted', reason: statement('exported') });
  return {
   ok: true, exportRef,
   bundle: { resourceType: 'Bundle', id: exportRef, type: 'collection', timestamp: new Date(at).toISOString(), entry },
   exclusions: sharing.export.exclusions.map(exclusion => ({ excludedCode: exclusion.id, statement: exclusion.sentence })),
   stepUp: sharing.export.stepUp.sentence
  };
 }

 /* A grant's terms as the grant was made, or null for a grant that has none kept — one made before P1 — which a
    link cannot ride on, because nothing would say what it may open. */
 #grantTerms(row: { id: string; subject: string; expires_at: number; revoked_at: number | null }): GrantTerms | null {
  const kept = this.#store.grantTerms(row.id);
  if (!kept || kept.subject !== row.subject) return null;
  const terms = JSON.parse(openBytes(this.#dataKey(row.subject, GENERAL_SCOPE), kept.sealed_body, `grant-terms|${row.subject}|${row.id}`).toString('utf8')) as { recipientRole: string; scope: string[]; purpose: string; sealedIncluded: boolean };
  return { ...terms, expiresAt: row.expires_at, revokedAt: row.revoked_at };
 }

 #linkTerms(row: { id: string; subject: string; sealed_body: Uint8Array }): { recipientRole: string; purpose: string; scope: string[]; sealedIncluded: boolean } {
  return JSON.parse(openBytes(this.#dataKey(row.subject, GENERAL_SCOPE), row.sealed_body, `share-link|${row.subject}|${row.id}`).toString('utf8')) as { recipientRole: string; purpose: string; scope: string[]; sealedIncluded: boolean };
 }

 /* What one category of a link opens: the emergency summary for the card's category, which holds open entries
    only; otherwise the entries filed under it that are open, or sealed where the link ticked a sealed category
    in by name. Never a private entry, as for every grant in P0. */
 #linkResources(subject: string, category: string, sealedIncluded: boolean): Record<string, unknown>[] {
  if (category === GATEWAY.emergencySummary.openedBy) return Object.values(this.#summary(subject)).flat();
  const tag = this.#keys.categoryTag(subject, category);
  const opensSealed = sealedIncluded && isProtectedCategory(category);
  return this.#store.resourcesOf(subject).filter(row => row.category_tag === tag && (row.sealed === OPEN || (row.sealed === SEALED && opensSealed))).map(row => this.#open(row));
 }

 /* ---- Inside ----------------------------------------------------------------------------------- */

 /* Whether a grant opens a row it already has in scope: an open row always, a sealed row only with the
    tick (the scope naming the category is checked by the caller), and a private row never. */
 #opens(row: ResourceRow, grant: GrantArtefact): boolean {
  return row.sealed === OPEN || (row.sealed === SEALED && grant.sealedIncluded);
 }

 #summary(subject: string): Record<string, Record<string, unknown>[]> {
  const summary: Record<string, Record<string, unknown>[]> = {};
  for (const category of GATEWAY.emergencySummary.categories) {
   const tag = this.#keys.categoryTag(subject, category);
   summary[category] = this.#store.resourcesOf(subject).filter(row => row.category_tag === tag && row.sealed === OPEN).map(row => this.#open(row));
  }
  return summary;
 }

 #dataKey(subject: string, scope: string): Buffer {
  const wrapped = this.#store.dataKey(subject, scope);
  if (wrapped) return this.#keys.unwrapDataKey(subject, scope, wrapped);
  const fresh = this.#keys.newDataKey(subject, scope);
  this.#store.putDataKey(subject, scope, fresh.wrapped, this.#now());
  return fresh.key;
 }

 #open(row: ResourceRow): Record<string, unknown> {
  const key = this.#dataKey(row.subject, row.key_scope);
  return JSON.parse(openBytes(key, row.sealed_body, `${row.subject}|${row.id}|${row.key_scope}|${row.version}`).toString('utf8')) as Record<string, unknown>;
 }

 #provenance(target: ResourceRow): Record<string, unknown>[] {
  const key = this.#dataKey(target.subject, target.key_scope);
  return this.#store.provenanceFor(target.id).map(p => {
   const body = JSON.parse(openBytes(key, p.sealed_body, `provenance|${p.subject}|${p.id}|${p.target}|${p.key_scope}`).toString('utf8')) as { authorRole: string; authorRef: string; sourceSystem: string; activity: string };
   return {
    resourceType: 'Provenance', id: p.id, target: [{ reference: p.target }], recorded: new Date(p.recorded_at).toISOString(),
    activity: { text: body.activity }, agent: [{ type: { text: body.authorRole }, who: { identifier: { value: body.authorRef } } }],
    entity: [{ role: 'source', what: { display: body.sourceSystem } }]
   };
  });
 }

 /* A request that named somebody else's record is written into that person's history too — under the
    requester's role only, with no reference, because the grant id belongs to the patient who issued
    it, not to the one it was used against. Only for a subject that exists: a probe for a token that
    was never issued has nobody to tell. */
 #probe(probed: unknown, who: Who): void {
  if (typeof probed !== 'string' || !TOKEN.test(probed) || probed === who.subject || !this.#store.hasSubject(probed)) return;
  this.#log({ ...who, subject: probed, requesterRef: null, action: `${who.action}.probe`, outcome: 'refused', reason: refusalOf('wrong-subject') });
 }

 #log(entry: Partial<AuditEntry> & Pick<AuditEntry, 'requesterRole' | 'action' | 'outcome' | 'reason'>): number {
  return this.#audit.append({
   at: this.#now(), subject: entry.subject ?? null, requesterRole: entry.requesterRole, requesterRef: entry.requesterRef ?? null,
   action: entry.action, resourceType: entry.resourceType ?? null, purpose: entry.purpose ?? null, outcome: entry.outcome,
   reason: entry.reason, breakGlass: entry.breakGlass ?? false, reviewDueAt: entry.reviewDueAt ?? null
  }).seq;
 }

 #refuse(status: number, id: string, who: Who): Refused {
  const reason = refusalOf(id);
  this.#log({ ...who, outcome: 'refused', reason });
  return { ok: false, status, reason };
 }
}
