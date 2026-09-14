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
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

 constructor(deps: { config: PassportConfig; store: PassportStore; now?: () => number }) {
  /* A gateway built from a configuration nobody loaded would skip every start-up refusal — the
     development flag, the key separation, the separate database. So it is not built. */
  if (!wasLoaded(deps.config)) throw new PassportRefusedToStart(refusalOf('not-development'));
  this.#store = deps.store;
  this.#keys = new PassportKeys(deps.config.masterKey);
  this.#audit = new AuditLog(deps.store.database, this.#keys);
  this.#now = deps.now ?? Date.now;
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
