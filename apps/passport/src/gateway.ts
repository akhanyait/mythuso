/**
 * The consent gateway: the only way into the store, and deny by default.
 *
 * ── The rule every method keeps ──────────────────────────────────────────────────────────────
 *
 * §16: "There is no code path that reads a record without a consent grant, a break-glass
 * justification, or the patient's own session." So there are three requesters and no fourth. A read
 * arriving with none of them is refused with a sentence, and the refusal is written into the audit
 * chain exactly as a granted read is — a log that only records successes cannot show a patient that
 * somebody tried.
 *
 * A grant is the artefact the patient signed through their session: subject, recipientRole, scope,
 * purpose, expiresAt, sealedIncluded — exactly the fields packages/catalog/consent.json's `grants`
 * will hold, and no more. It is checked on every call, in this order, and refused at the first
 * failure: signed by this Passport, still on the register, not revoked, not expired, for this
 * subject, for a role that may read this way, for this purpose, and covering this category. Every
 * sentence is packages/catalog/passport-gateway.json's.
 *
 * ── Sealed categories ────────────────────────────────────────────────────────────────────────
 *
 * A category records.json marks protected, or an entry the patient marks private, is sealed. It is
 * encrypted under a data key of its own, and it is excluded from every read under a grant unless that
 * grant says sealedIncluded and names the category in its scope. A clinician whose read excluded
 * sealed content is told that sealed content exists — "the existence is visible, the content is not"
 * (§20) — so they can ask. Anybody else is told nothing, because a caregiver learning that a record
 * has a sealed entry has learned something the patient did not choose to tell them.
 *
 * ── Break-glass ──────────────────────────────────────────────────────────────────────────────
 *
 * Opens the emergency summary and nothing else: no grant is issued, no session is opened, and the
 * next request from the same caller is refused like any other. It needs a justification before
 * anything is opened, is logged as break-glass, and carries the time its governance review is due.
 *
 * ── What is absent ───────────────────────────────────────────────────────────────────────────
 *
 * Authentication of the requester. A grant is a bearer artefact for its role, and a patient session
 * is a development token this service mints. OIDC for people and mutual TLS for systems (§22) need a
 * provider and certificates that do not exist, which is one of the reasons this service runs in
 * development only. The gateway is written so that swapping those in changes who a requester is, and
 * not what a requester may do.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditLog, type AuditEntry } from './audit.ts';
import { GATEWAY, isProtectedCategory, knownCategory, refusalOf, resourceRule, roleRule, sensitivityOf, statement, type GrantRole } from './contract.ts';
import { PassportKeys, openBytes, sealBytes } from './keys.ts';
import type { PassportStore, ResourceRow } from './store.ts';

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

/** Who is asking. There is no third kind and no field a caller can set to become one. */
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

const TOKEN = /^pp_[0-9a-f]{32}$/;
const GENERAL_SCOPE = 'general';
const HOUR = 3_600_000;

type Held = { subject: string; role: GrantRole; grant: GrantArtefact } ;

export class PassportGateway {
 #store: PassportStore;
 #keys: PassportKeys;
 #audit: AuditLog;
 #now: () => number;

 constructor(deps: { store: PassportStore; keys: PassportKeys; now?: () => number }) {
  this.#store = deps.store;
  this.#keys = deps.keys;
  this.#audit = new AuditLog(deps.store.database, deps.keys);
  this.#now = deps.now ?? Date.now;
 }

 get audit(): AuditLog { return this.#audit; }

 /* ---- Subjects and the development session ---------------------------------------------------- */

 /**
  * A synthetic subject and a patient session for it. The token is minted here and nowhere else, so a
  * subject can never be an identity number somebody typed. The session is the development stand-in
  * for an OIDC patient login that does not exist; it is the reason this method exists only in a
  * service that refuses to run outside development.
  */
 createSubject(): { subject: string; patientSession: string } {
  const subject = `pp_${randomBytes(16).toString('hex')}`;
  this.#store.addSubject(subject, this.#now());
  const payload = Buffer.from(JSON.stringify({ kind: 'patient-session', subject }), 'utf8').toString('base64url');
  return { subject, patientSession: `${payload}.${this.#keys.sign('session', payload)}` };
 }

 #sessionSubject(session: string): string | null {
  const [payload, signature] = session.split('.');
  if (!payload || !signature || !this.#keys.verify('session', payload, signature)) return null;
  try {
   const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { kind?: string; subject?: string };
   return parsed.kind === 'patient-session' && typeof parsed.subject === 'string' && this.#store.hasSubject(parsed.subject) ? parsed.subject : null;
  } catch { return null; }
 }

 /* ---- Grants ----------------------------------------------------------------------------------- */

 grant(session: string, fields: GrantFields): Answer<{ grantId: string; artefact: string; grant: GrantArtefact }> {
  const subject = this.#sessionSubject(session);
  const log = (outcome: AuditEntry['outcome'], reason: string) => this.#log({ subject, requesterRole: 'patient', requesterRef: subject, action: 'consent.grant', purpose: typeof fields.purpose === 'string' ? fields.purpose : null, outcome, reason });
  const refuse = (status: number, id: string): Refused => { const reason = refusalOf(id); log('refused', reason); return { ok: false, status, reason }; };
  if (!subject) return refuse(401, 'patient-session-required');
  if (fields.subject !== subject) return refuse(403, 'wrong-subject');
  const role = roleRule(String(fields.recipientRole));
  if (!role) return refuse(400, 'unknown-role');
  if (!Array.isArray(fields.scope) || !fields.scope.length || !fields.scope.every(category => typeof category === 'string' && knownCategory(category))) return refuse(400, 'unknown-category');
  if (typeof fields.purpose !== 'string' || !fields.purpose.trim()) return refuse(400, 'wrong-purpose');
  const expiresAt = Date.parse(String(fields.expiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) return refuse(400, 'expired');
  if (role.reads === 'aggregate') return refuse(403, 'aggregate-only');
  if (role.reads === 'emergency-summary' && fields.scope.some(category => category !== GATEWAY.emergencySummary.openedBy)) return refuse(403, 'emergency-only');
  if (role.reads === 'routine' && fields.scope.some(category => sensitivityOf(category) !== 'routine')) return refuse(403, 'clinical-detail');
  if (fields.sealedIncluded === true && !role.sealedMayBeIncluded) return refuse(403, 'sealed-never');

  const grant: GrantArtefact = {
   id: `grant_${randomUUID()}`, subject, recipientRole: role.id, scope: [...fields.scope], purpose: fields.purpose,
   expiresAt: new Date(expiresAt).toISOString(), sealedIncluded: fields.sealedIncluded === true, issuedAt: new Date(this.#now()).toISOString()
  };
  const payload = Buffer.from(JSON.stringify(grant), 'utf8').toString('base64url');
  const artefact = `${payload}.${this.#keys.sign('grant', payload)}`;
  this.#store.putGrant({ id: grant.id, subject, expires_at: expiresAt, revoked_at: null, artefact_hash: createHash('sha256').update(artefact).digest('hex'), created_at: this.#now() });
  log('granted', statement('patientSession'));
  return { ok: true, grantId: grant.id, artefact, grant };
 }

 revoke(session: string, grantId: string): Answer<{ revoked: string }> {
  const subject = this.#sessionSubject(session);
  const row = this.#store.grant(grantId);
  if (!subject || !row || row.subject !== subject) {
   const reason = refusalOf(subject ? 'not-found' : 'patient-session-required');
   this.#log({ subject, requesterRole: 'patient', requesterRef: subject, action: 'consent.revoke', outcome: 'refused', reason });
   return { ok: false, status: subject ? 404 : 401, reason };
  }
  this.#store.revokeGrant(grantId, this.#now());
  this.#log({ subject, requesterRole: 'patient', requesterRef: subject, action: 'consent.revoke', outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, revoked: grantId };
 }

 /**
  * The grant, verified, or the sentence it is refused with. Order matters and is the order a person
  * can act on: an altered artefact is not "expired", and an expired grant is not "the wrong purpose".
  */
 #hold(artefact: string, purpose: string): { ok: true; held: Held } | { ok: false; status: number; id: string; role: string; ref: string | null; subject: string | null } {
  const [payload, signature] = artefact.split('.');
  if (!payload || !signature || !this.#keys.verify('grant', payload, signature)) return { ok: false, status: 401, id: 'bad-grant', role: 'unknown', ref: null, subject: null };
  let grant: GrantArtefact;
  try { grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GrantArtefact; }
  catch { return { ok: false, status: 401, id: 'bad-grant', role: 'unknown', ref: null, subject: null }; }
  const who = { role: grant.recipientRole, ref: grant.id, subject: this.#store.hasSubject(grant.subject) ? grant.subject : null };
  const row = this.#store.grant(grant.id);
  if (!row || row.artefact_hash !== createHash('sha256').update(artefact).digest('hex')) return { ok: false, status: 401, id: 'bad-grant', ...who };
  if (row.revoked_at !== null) return { ok: false, status: 403, id: 'revoked', ...who };
  if (row.expires_at <= this.#now()) return { ok: false, status: 403, id: 'expired', ...who };
  const role = roleRule(grant.recipientRole);
  if (!role) return { ok: false, status: 403, id: 'unknown-role', ...who };
  if (role.reads === 'aggregate') return { ok: false, status: 403, id: 'aggregate-only', ...who };
  if (purpose !== grant.purpose) return { ok: false, status: 403, id: 'wrong-purpose', ...who };
  return { ok: true, held: { subject: grant.subject, role, grant } };
 }

 /** A grant artefact checked against one category and purpose, without opening anything. Audited all the same. */
 check(artefact: string, purpose: string, category: string): Answer<{ allowed: true; sealed: boolean }> {
  const held = this.#hold(artefact, purpose);
  if (!held.ok) return this.#refuse(held.status, held.id, { subject: held.subject, requesterRole: held.role, requesterRef: held.ref, action: 'consent.check', purpose });
  const { grant, role, subject } = held.held;
  const who = { subject, requesterRole: role.id, requesterRef: grant.id, action: 'consent.check', purpose };
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
  const purpose = requester.kind === 'grant' ? requester.purpose : null;
  const base = { subject: null as string | null, requesterRole: requester.kind === 'patient' ? 'patient' : 'unknown', requesterRef: null as string | null, action: 'write', resourceType: String(input.resourceType), purpose };

  let authorRole: string;
  let authorRef: string;
  let sealedAllowed: boolean;
  let scope: readonly string[] | null = null;
  if (requester.kind === 'patient') {
   const subject = this.#sessionSubject(requester.session);
   if (!subject) return this.#refuse(401, 'no-grant', base);
   Object.assign(base, { subject, requesterRef: subject });
   if (input.subject !== subject) return this.#refuse(403, 'wrong-subject', base);
   authorRole = 'patient';
   authorRef = subject;
   sealedAllowed = true;
  } else {
   const held = this.#hold(requester.artefact, requester.purpose);
   if (!held.ok) return this.#refuse(held.status, held.id, { ...base, subject: held.subject, requesterRole: held.role, requesterRef: held.ref });
   const { grant, role, subject } = held.held;
   Object.assign(base, { subject, requesterRole: role.id, requesterRef: grant.id });
   if (role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', base);
   if (!role.writes) return this.#refuse(403, 'write-not-permitted', base);
   if (input.subject !== subject) return this.#refuse(403, 'wrong-subject', base);
   authorRole = role.id;
   authorRef = grant.id;
   sealedAllowed = grant.sealedIncluded;
   scope = grant.scope;
  }

  const subject = base.subject!;
  const rule = resourceRule(String(input.resourceType));
  if (!rule || !rule.writable) return this.#refuse(400, 'not-stored-here', base);
  if (!knownCategory(String(input.category))) return this.#refuse(400, 'unknown-category', base);
  if (!rule.categories.includes(input.category)) return this.#refuse(400, 'wrong-category', base);
  const sealed = isProtectedCategory(input.category) || input.markedPrivate === true;
  if (scope && (!scope.includes(input.category) || (sealed && !sealedAllowed))) return this.#refuse(403, 'out-of-scope', base);
  const body = input.resource && typeof input.resource === 'object' ? input.resource : {};
  if (input.resourceType === 'Patient' && GATEWAY.patientFieldsRefused.some(field => field in body)) return this.#refuse(400, 'identity-on-patient', base);
  const activity = input.provenance?.activity;
  const sourceSystem = input.provenance?.sourceSystem;
  if (typeof activity !== 'string' || !activity.trim() || typeof sourceSystem !== 'string' || !sourceSystem.trim()) return this.#refuse(400, 'no-provenance', base);

  const id = `res_${randomUUID()}`;
  const tag = this.#keys.categoryTag(subject, input.category);
  const keyScope = sealed ? `sealed:${tag}` : GENERAL_SCOPE;
  const version = 1;
  const { id: _ignoredId, meta: _ignoredMeta, subject: _ignoredSubject, resourceType: _ignoredType, ...rest } = body as Record<string, unknown>;
  const resource = {
   resourceType: input.resourceType, id,
   meta: { versionId: String(version), lastUpdated: new Date(at).toISOString() },
   ...(input.resourceType === 'Patient' ? {} : { subject: { reference: `Patient/${subject}` } }),
   category: input.category,
   ...(input.markedPrivate === true ? { markedPrivate: true } : {}),
   ...rest
  };
  const key = this.#dataKey(subject, keyScope);
  this.#store.putResource({
   id, subject, resource_type: input.resourceType, category_tag: tag, key_scope: keyScope, sealed: sealed ? 1 : 0, version,
   sealed_body: sealBytes(key, Buffer.from(JSON.stringify(resource), 'utf8'), `${subject}|${id}|${keyScope}|${version}`), written_at: at
  });
  const provenance = `prov_${randomUUID()}`;
  this.#store.putProvenance({ id: provenance, target: id, author_role: authorRole, author_ref: authorRef, source_system: sourceSystem.trim(), activity: activity.trim(), recorded_at: at });
  this.#log({ ...base, outcome: 'granted', reason: statement('written') });
  return { ok: true, id, version, provenance };
 }

 /* ---- Reads ------------------------------------------------------------------------------------ */

 read(requester: Requester, resourceType: string, id: string): Answer<{ resource: Record<string, unknown> | null; provenance: Record<string, unknown>[]; sealedContentExists?: true; notice?: string }> {
  const purpose = requester.kind === 'grant' ? requester.purpose : null;
  const base = { subject: null as string | null, requesterRole: requester.kind === 'patient' ? 'patient' : 'unknown', requesterRef: null as string | null, action: 'read', resourceType, purpose };
  if (requester.kind === 'patient') {
   const subject = this.#sessionSubject(requester.session);
   if (!subject) return this.#refuse(401, 'no-grant', base);
   Object.assign(base, { subject, requesterRef: subject });
   const row = this.#store.resource(id);
   if (!row || row.subject !== subject || row.resource_type !== resourceType) return this.#refuse(404, 'not-found', base);
   this.#log({ ...base, outcome: 'granted', reason: statement('patientSession') });
   return { ok: true, resource: this.#open(row), provenance: this.#provenance(row.id) };
  }
  const held = this.#hold(requester.artefact, requester.purpose);
  if (!held.ok) return this.#refuse(held.status, held.id, { ...base, subject: held.subject, requesterRole: held.role, requesterRef: held.ref });
  const { grant, role, subject } = held.held;
  Object.assign(base, { subject, requesterRole: role.id, requesterRef: grant.id });
  if (role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', base);
  const row = this.#store.resource(id);
  if (!row || row.subject !== subject || row.resource_type !== resourceType) return this.#refuse(404, 'not-found', base);
  const category = grant.scope.find(candidate => this.#keys.categoryTag(subject, candidate) === row.category_tag) ?? null;
  const sealedOut = row.sealed === 1 && !grant.sealedIncluded;
  if (!category || sealedOut) {
   if (row.sealed === 1 && role.clinician) {
    this.#log({ ...base, outcome: 'refused', reason: statement('sealedExists') });
    return { ok: true, resource: null, provenance: [], sealedContentExists: true, notice: statement('sealedExists') };
   }
   return this.#refuse(403, 'out-of-scope', base);
  }
  if (role.reads === 'routine' && sensitivityOf(category) !== 'routine') return this.#refuse(403, 'clinical-detail', base);
  this.#log({ ...base, outcome: 'granted', reason: statement('granted') });
  return { ok: true, resource: this.#open(row), provenance: this.#provenance(row.id) };
 }

 /** Every resource of one type for one subject that the requester may open, and — for a clinician — whether sealed content was left out. */
 search(requester: Requester, resourceType: string, subjectAsked: string): Answer<{ entries: Record<string, unknown>[]; sealedContentExists?: true; notice?: string }> {
  const purpose = requester.kind === 'grant' ? requester.purpose : null;
  const base = { subject: null as string | null, requesterRole: requester.kind === 'patient' ? 'patient' : 'unknown', requesterRef: null as string | null, action: 'search', resourceType, purpose };
  if (!TOKEN.test(subjectAsked)) return this.#refuse(400, 'not-a-token', base);
  const rule = resourceRule(resourceType);
  if (!rule) return this.#refuse(400, 'not-stored-here', base);
  if (requester.kind === 'patient') {
   const subject = this.#sessionSubject(requester.session);
   if (!subject) return this.#refuse(401, 'no-grant', base);
   Object.assign(base, { subject, requesterRef: subject });
   if (subject !== subjectAsked) return this.#refuse(403, 'wrong-subject', base);
   this.#log({ ...base, outcome: 'granted', reason: statement('patientSession') });
   return { ok: true, entries: this.#store.resourcesOf(subject, resourceType).map(row => this.#open(row)) };
  }
  const held = this.#hold(requester.artefact, requester.purpose);
  if (!held.ok) return this.#refuse(held.status, held.id, { ...base, subject: held.subject, requesterRole: held.role, requesterRef: held.ref });
  const { grant, role, subject } = held.held;
  Object.assign(base, { subject, requesterRole: role.id, requesterRef: grant.id });
  if (role.reads === 'emergency-summary') return this.#refuse(403, 'emergency-only', base);
  if (subject !== subjectAsked) return this.#refuse(403, 'wrong-subject', base);
  const categories = grant.scope.filter(category => rule.categories.includes(category));
  if (!categories.length) return this.#refuse(403, 'out-of-scope', base);
  const tags = new Set(categories.map(category => this.#keys.categoryTag(subject, category)));
  const inScope = this.#store.resourcesOf(subject, resourceType).filter(row => tags.has(row.category_tag));
  const visible = inScope.filter(row => row.sealed === 0 || grant.sealedIncluded);
  const leftOut = this.#store.resourcesOf(subject, resourceType).some(row => row.sealed === 1 && !visible.includes(row));
  this.#log({ ...base, outcome: 'granted', reason: statement('granted') });
  return {
   ok: true,
   entries: visible.map(row => this.#open(row)),
   ...(leftOut && role.clinician ? { sealedContentExists: true as const, notice: statement('sealedExists') } : {})
  };
 }

 /* ---- The emergency summary and break-glass ---------------------------------------------------- */

 emergencySummary(requester: Requester, subjectAsked: string): Answer<{ summary: Record<string, Record<string, unknown>[]> }> {
  const purpose = requester.kind === 'grant' ? requester.purpose : null;
  const base = { subject: null as string | null, requesterRole: requester.kind === 'patient' ? 'patient' : 'unknown', requesterRef: null as string | null, action: 'summary.emergency', resourceType: null, purpose };
  if (!TOKEN.test(subjectAsked)) return this.#refuse(400, 'not-a-token', base);
  if (requester.kind === 'patient') {
   const subject = this.#sessionSubject(requester.session);
   if (!subject) return this.#refuse(401, 'no-grant', base);
   Object.assign(base, { subject, requesterRef: subject });
   if (subject !== subjectAsked) return this.#refuse(403, 'wrong-subject', base);
   this.#log({ ...base, outcome: 'granted', reason: statement('patientSession') });
   return { ok: true, summary: this.#summary(subject) };
  }
  const held = this.#hold(requester.artefact, requester.purpose);
  if (!held.ok) return this.#refuse(held.status, held.id, { ...base, subject: held.subject, requesterRole: held.role, requesterRef: held.ref });
  const { grant, role, subject } = held.held;
  Object.assign(base, { subject, requesterRole: role.id, requesterRef: grant.id });
  if (subject !== subjectAsked) return this.#refuse(403, 'wrong-subject', base);
  if (!grant.scope.includes(GATEWAY.emergencySummary.openedBy)) return this.#refuse(403, 'out-of-scope', base);
  this.#log({ ...base, outcome: 'granted', reason: statement('granted') });
  return { ok: true, summary: this.#summary(subject) };
 }

 breakGlass(request: { subject: string; justification: string; requesterRole: string; requesterRef: string }): Answer<{ summary: Record<string, Record<string, unknown>[]>; notice: string; reviewDueBy: string }> {
  const at = this.#now();
  const base = {
   subject: this.#store.hasSubject(String(request.subject)) ? request.subject : null,
   requesterRole: String(request.requesterRole || 'unknown'), requesterRef: typeof request.requesterRef === 'string' ? request.requesterRef : null,
   action: 'breakglass', resourceType: null, purpose: 'emergency'
  };
  if (!GATEWAY.breakGlass.roles.includes(request.requesterRole)) return this.#refuse(403, 'breakglass-role', base);
  const words = typeof request.justification === 'string' ? request.justification.trim().split(/\s+/).filter(Boolean).length : 0;
  if (words < GATEWAY.breakGlass.justificationMinimumWords) return this.#refuse(400, 'breakglass-justification', base);
  if (!TOKEN.test(String(request.subject))) return this.#refuse(400, 'not-a-token', base);
  if (!base.subject) return this.#refuse(404, 'not-found', base);
  const reviewDueAt = at + GATEWAY.breakGlass.reviewWithinHours * HOUR;
  this.#log({ ...base, outcome: 'granted', reason: request.justification.trim(), breakGlass: true, reviewDueAt });
  return {
   ok: true,
   summary: this.#summary(request.subject),
   notice: statement('breakGlassOpened').replace('{hours}', String(GATEWAY.breakGlass.reviewWithinHours)),
   reviewDueBy: new Date(reviewDueAt).toISOString()
  };
 }

 /* ---- The patient's own audit ------------------------------------------------------------------ */

 auditMine(session: string): Answer<{ entries: Record<string, unknown>[]; chain: { intact: boolean; entries: number; firstBroken: number | null } }> {
  const subject = this.#sessionSubject(session);
  if (!subject) return this.#refuse(401, 'patient-session-required', { subject: null, requesterRole: 'patient', requesterRef: null, action: 'audit.read', resourceType: null, purpose: null });
  this.#log({ subject, requesterRole: 'patient', requesterRef: subject, action: 'audit.read', outcome: 'granted', reason: statement('patientSession') });
  return { ok: true, entries: this.#audit.forSubject(subject), chain: this.#audit.verify() };
 }

 /* ---- Inside ----------------------------------------------------------------------------------- */

 #summary(subject: string): Record<string, Record<string, unknown>[]> {
  const summary: Record<string, Record<string, unknown>[]> = {};
  for (const category of GATEWAY.emergencySummary.categories) {
   const tag = this.#keys.categoryTag(subject, category);
   summary[category] = this.#store.resourcesOf(subject).filter(row => row.category_tag === tag && row.sealed === 0).map(row => this.#open(row));
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

 #provenance(target: string): Record<string, unknown>[] {
  return this.#store.provenanceFor(target).map(p => ({
   resourceType: 'Provenance', id: p.id, target: [{ reference: target }], recorded: new Date(p.recorded_at).toISOString(),
   activity: { text: p.activity }, agent: [{ type: { text: p.author_role }, who: { identifier: { value: p.author_ref } } }],
   entity: [{ role: 'source', what: { display: p.source_system } }]
  }));
 }

 #log(entry: Partial<AuditEntry> & Pick<AuditEntry, 'requesterRole' | 'action' | 'outcome' | 'reason'>): void {
  this.#audit.append({
   at: this.#now(), subject: entry.subject ?? null, requesterRole: entry.requesterRole, requesterRef: entry.requesterRef ?? null,
   action: entry.action, resourceType: entry.resourceType ?? null, purpose: entry.purpose ?? null, outcome: entry.outcome,
   reason: entry.reason, breakGlass: entry.breakGlass ?? false, reviewDueAt: entry.reviewDueAt ?? null
  });
 }

 #refuse(status: number, id: string, who: Partial<AuditEntry> & Pick<AuditEntry, 'requesterRole' | 'action'>): Refused {
  const reason = refusalOf(id);
  this.#log({ ...who, outcome: 'refused', reason });
  return { ok: false, status, reason };
 }
}
