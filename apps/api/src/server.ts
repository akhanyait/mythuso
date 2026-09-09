import { createProtectionModule } from './protection/index.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { loadConfig, limits, type Config } from './config.ts';
import { openStore, type Store } from './store.ts';
import { Identity, type Caller, type PublicPerson } from './identity.ts';
import { TwoFactor } from './twoFactor.ts';
import { Erasure } from './erasure.ts';
import { decideStepUp, SECOND_FACTOR_CAPABILITIES, SECOND_FACTOR_REASONS, type StepUpAction } from './stepUp.ts';
import { RESPONSE_DAYS, SCOPE_STATEMENT, clinicalRetentionRules } from './personalData.ts';
import { openCaptureStore } from './capture/index.ts';
import { NOT_A_PARTY, resolveActor, type ResolvedActor } from './actor.ts';
import { EXPORT_REFUSALS, EXPORT_SCOPE, NEVER_EXPORTED } from './subjectExport.ts';
import {
  OUTCOMES, REFUSALS as REQUEST_REFUSALS, openCorrection, openSubjectRequestStore, overdueCount,
  queue as subjectQueue, type Outcome, type RequestKind
} from './subjectRequests.ts';
import {
  INCIDENT_KINDS, NOTIFICATION_RULE, REFUSALS as INCIDENT_REFUSALS, close as closeIncident,
  daysSinceDiscovery, openIncidentStore, report as reportIncident, standing as incidentStanding
} from './incidents.ts';
import {
  ACCESS_LOG, ACCESS_LOG_ID, ConsentRegister, LAWFUL_BASES, NOT_ADVICE, RULES as CONSENT_RULES, RecordAccessLog,
  ROUTES as CONSENT_ROUTES, WHY as CONSENT_WHY, currentVersion, openConsentStore, optionalPurposes, requiredPurposes
} from './consent/index.ts';

import { SEALED_COLUMNS, VettingVault, authorityVerifiers, createIdentityProvider, openVettingStore, roleName, vettingSource } from './vetting/index.ts';

const COOKIE = 'mythuso_session';
type Handler = (req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>, caller: Caller) => void;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
function sessionCookie(token: string, config: Config): string {
  /* SameSite=Strict is the CSRF defence: the browser will not attach this cookie to a request the
     patient did not start on our own site. HttpOnly keeps it out of reach of any script, which is
     also why no token is ever put in browser storage. */
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${limits.sessionIdleSeconds}`];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}
const clearCookie = (config: Config) =>
  [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0', ...(config.cookieSecure ? ['Secure'] : [])].join('; ');

/* ---- What every answer carries, whatever it says --------------------------------------------
 *
 * docs/PRIVACY-AND-SECURITY.md used to say that "production must supply HTTP security headers … at
 * the hosting layer". That is a control described in a document and owned by nobody: a service that
 * is only safe behind a particular nginx is a service that is unsafe the first time it is run
 * anywhere else, and the deployment it names hosts five other sites whose config this repository is
 * forbidden to touch. So the service sets them itself. A proxy may add more; it can no longer be
 * the only thing that adds any.
 *
 * Every one of these is about a JSON API and not about a page:
 *   - `frame-ancestors 'none'` and `x-frame-options` — nothing may frame an answer from here. This
 *     API's session cookie is SameSite=Strict, so a frame cannot spend it, but a framed error page
 *     is still a page an attacker chose to show somebody.
 *   - `default-src 'none'` — there is nothing to load. A JSON body that somehow reaches a browser
 *     as a document fetches nothing, runs nothing and submits nothing.
 *   - `permissions-policy` — an API needs no camera, no microphone and no geolocation, and the
 *     teleconsultation contract says in its own words that nothing here touches the first two.
 *   - `cross-origin-resource-policy: same-origin` — a `<script src>` or an `<img src>` on somebody
 *     else's page may not read what this returned to a signed-in browser.
 *   - `cross-origin-opener-policy` — a window that opened this one may not reach back into it.
 *
 * HSTS is the one that is conditional, and deliberately so. It is sent only where the cookie is
 * already `Secure`, which is production — sending it from a development server on plain http
 * teaches a developer's browser to refuse localhost over http for a year, and a header nobody can
 * turn off is worse than one nobody set. Two years, subdomains included, and no `preload`: a
 * preload entry is a submission to a list this service cannot withdraw itself from. */
const TRANSPORT_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin'
};
const HSTS = 'max-age=63072000; includeSubDomains';

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...TRANSPORT_HEADERS,
    ...headers
  });
  res.end(payload);
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 8 * 1024) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
  catch { throw new Error('invalid json'); }
}
const asString = (value: unknown): string => typeof value === 'string' ? value : '';

/* The three routes that already carry their own limiter, and are not double-counted by the caller
   limit in handle(). Each is counted against the mobile number and the address, or burnt against
   the challenge, which is tighter than a per-caller count and is the right shape for a door nobody
   has signed in through yet. Everything not on this list is limited. Nothing is exempt for being
   harmless: a route nobody has thought about is exactly the one that is not limited a year later. */
const SELF_LIMITED = new Set(['POST /auth/start', 'POST /auth/verify', 'POST /auth/second-factor']);
/* Who counts as the health check running beside the service. IPv6 loopback in both spellings,
   because Node hands back `::1` and — where the socket is v4-mapped — the address is unwrapped to
   127.0.0.1 above before it gets here. */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function createApp(config: Config, store: Store, now = () => Date.now()) {
  const twoFactor = new TwoFactor(store, config, now);
  const identity = new Identity(store, config, now, twoFactor);
  const routes = new Map<string, Handler>();

  /* The vetting module's own tables, in the same database and owned by that module. The store is
     opened before the protection module because the gate reads a party's standing out of it: a
     nurse whose police clearance ran out last night is refused this morning by arithmetic, and that
     only works if the gate is asking the register rather than a stub that answers "nobody". */
  const vettingStore = openVettingStore(store.database);

  /* The intake ledger's own tables, created here so a deployed database actually holds what
     personalData.ts tells a data subject it holds. Nothing below reaches the intake module, and that
     is still deliberate rather than unfinished — but half of the reason has now gone and the
     remaining half is the harder one. The capturer *can* be resolved: apps/api/src/actor.ts turns a
     session into a vetted party with a role, which is what the vetting routes below run on. The
     **device** cannot. An intake entry records which phone sent it, what that phone believed the
     time was and how far off the server found it, and a device id read off a request body is a
     claim — which is precisely the hole the gate exists to close, one level down. Believing it would
     make the skew arithmetic a decoration: any caller could name any phone and hand it any clock.
     Closing it needs device binding, which is a key per device and is in the list of things this
     repository cannot build without a key ceremony. The module is exercised against the real gate
     and the real chain in apps/api/test/capture.test.ts. */
  openCaptureStore(store.database);

  /* The consent register and the log of who opened a record. Both tables are opened here, together,
     because they are one question asked from two ends: a consent is a permission to process, and the
     access log is the record of the processing it permitted — which is why an access entry can name
     the consent it stood on and a withdrawal can be answered with what was already done under it. */
  const consentStore = openConsentStore(store.database);
  const consent = new ConsentRegister({ store: consentStore, now });

  /* The section 24 queue and the security compromise register. Both are tables this service owns
     rather than modules waiting for something: a correction is a right over a name this service
     actually holds, and an incident is a thing that happens to a running service whether or not
     there is a clinical record behind it yet. */
  const requests = openSubjectRequestStore(store.database);
  const incidents = openIncidentStore(store.database);

  /* The data protection module, if it is configured. The identity service holds no clinical record,
     so the gate has little to guard here yet — but the subject-access route below is a real read of
     a real person's information, and every vetting document is a real sealed value, so the
     chokepoint is exercised on every deployment rather than proved once in a test and left. */
  const protection = createProtectionModule(config, store.database, {
    vetting: vettingSource(vettingStore),
    /* Nobody has released a protected category to anybody: there are none in this service to
       release. An unknown release refuses, which is the correct answer. */
    releases: { find: () => null },
    sealedColumns: SEALED_COLUMNS,
    now
  });
  /* The vault is constructed here and no route below reaches its bootstrap. It cannot be reached
     from one either: opening the founding ceremony takes an authorisation signed from the key ring,
     and nothing arriving over HTTP has ever held key material. The command that mints one is
     src/bootstrap.ts, run at a console by two people. */
  /* The credential verification layer. The registry is the honest default — eleven authorities that
     cannot be asked at all, each carrying what a real integration would need — with the accredited
     identity provider dropped in over Home Affairs where one has been contracted. Where none has,
     `createIdentityProvider` returns null and Home Affairs keeps its not-integrated adapter, so a
     service with nothing configured reports "not integrated" rather than "sandbox". In production
     it throws instead of sandboxing, which is a service that will not start rather than a service
     recording confirmations nobody made. */
  const identityProvider = createIdentityProvider({ config, store: vettingStore });
  const vetting = protection ? new VettingVault({
    gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store: vettingStore,
    verifiers: authorityVerifiers(identityProvider ? { dha: identityProvider } : {}),
    identity: identityProvider,
    now
  }) : null;
  /* The access log needs the gate, so it exists only where the protection module does — which is
     the whole of the production refusal in config.ts: with no key ring nothing decides an access and
     nothing writes it down, and a service in that state must not be the one running in production. */
  const accessLog = protection ? new RecordAccessLog({ gate: protection.gate, store: consentStore, consent, now, seal: protection.logSeal }) : null;
  /* What an erasure cannot reach, asked rather than assumed. With no protection keys there is no
     vault, so there is nothing it could be holding and nothing to say about it. The consent register
     always has something to say, because it needs no keys to hold a decision. */
  const erasure = new Erasure(store, now, [
    ...(vetting ? [{ retainedFor: (personId: string) => vetting.retainedFor(personId) }] : []),
    { retainedFor: (personId: string) => consent.retainedFor(personId) },
    ...(accessLog ? [{ retainedFor: (personId: string) => accessLog.retainedFor(personId) }] : [])
  ]);


  /* Every route below this line is about somebody's own account, so each one starts by resolving
     the cookie rather than trusting an id in the body. */
  const signedIn = (req: IncomingMessage, res: ServerResponse): PublicPerson | null => {
    const resolved = identity.resolve(readCookie(req.headers.cookie, COOKIE));
    if (!resolved) { send(res, 401, { error: 'no-session' }); return null; }
    return resolved.person;
  };

  /**
   * The signed-in person, as a party the vetting register knows about.
   *
   * This is the whole of what was missing. The gate, the vault and the chain have been correct and
   * unreachable since they were written, and the comment beside the intake ledger said exactly why:
   * a route that took an actor id off a request body and handed it to the gate is the hole the gate
   * exists to close. So the id comes from the cookie and the role comes from `vetting_parties`, in
   * apps/api/src/actor.ts, and no route below is given either as a parameter.
   *
   * Three refusals, in order, and each is a different fact: no session, no vault, not on the
   * register. The third is not an error — it is every patient — so it says so in a sentence.
   */
  const asParty = (req: IncomingMessage, res: ServerResponse): { person: PublicPerson; actor: ResolvedActor } | null => {
    const person = signedIn(req, res);
    if (!person) return null;
    if (!vetting) { send(res, 503, { error: 'not-configured', message: 'No protection keys are configured, so there is no vault, no gate and nothing here to decide anything.' }); return null; }
    const actor = resolveActor(vettingStore, person.id);
    if (!actor) { send(res, 403, { error: 'not-on-the-vetting-register', message: NOT_A_PARTY }); return null; }
    return { person, actor };
  };

  /**
   * The rule from the incident report, in the one place it can be got wrong.
   *
   * A demand is only ever made where a second factor exists to answer it. An account with none
   * enrolled passes straight through — it has already proved possession of its mobile number, and
   * asking it for something it cannot produce would not be strict, it would be a locked-out person
   * with a support ticket. What comes back for that account is a nudge to enrol, never a refusal.
   */
  const stepUp = (personId: string, action: StepUpAction, code: string, caller: Caller, res: ServerResponse, grants: readonly string[] = []): boolean => {
    const decision = decideStepUp({ action, enrolled: twoFactor.confirmed(personId), grants });
    if (!decision.demand) return true;
    /* Six digits is a million, and a session sitting in front of this endpoint could otherwise
       work through them. The refusals are counted out of the audit log, which is already written
       and already append-only. The window expires by itself, so nobody has to ring an operator to
       be let back in — a lockout with no way out is the failure this whole file is written around. */
    const since = now() - limits.rateWindowSeconds * 1000;
    if (store.countAuditEvents('auth.step-up.refused', personId, since) >= limits.maxSecondFactorAttempts) {
      return send(res, 429, { error: 'too-many-attempts', message: 'Too many codes have been tried. Wait fifteen minutes and try again.' }), false;
    }
    const checked = twoFactor.check(personId, code);
    if (checked.ok) return true;
    store.appendAudit({
      at: now(), event: 'auth.step-up.refused', personId, phone: null, detail: action,
      address: caller.address, agentHash: createHash('sha256').update(caller.agent).digest('hex').slice(0, 16)
    });
    send(res, 401, { error: 'second-factor-required', message: code ? checked.message : decision.because });
    return false;
  };

  routes.set('POST /auth/start', (_req, res, body, caller) => {
    const result = identity.start(asString(body.phone), caller);
    if (!result.ok && result.reason === 'invalid-phone') return send(res, 400, { error: 'invalid-phone', message: 'Enter a 10-digit South African mobile number.' });
    if (!result.ok) return send(res, 429, { error: 'rate-limited', retryAfter: result.retryAfter }, { 'retry-after': String(result.retryAfter ?? 900) });
    send(res, 200, { challengeId: result.challengeId, expiresAt: result.expiresAt, ...(result.code ? { developmentCode: result.code } : {}) });
  });

  routes.set('POST /auth/verify', (_req, res, body, caller) => {
    const result = identity.verify(asString(body.challengeId), asString(body.code), caller);
    if (!result.ok) {
      const status = result.reason === 'too-many-attempts' ? 429 : 400;
      return send(res, status, { error: result.reason });
    }
    /* No cookie on this branch, deliberately. The challenge token is not a session and is not
       stored like one: it goes in the body, lives ten minutes, and buys exactly one more request. */
    if (result.step === 'second-factor') {
      return send(res, 200, { secondFactorRequired: true, challengeToken: result.challengeToken, expiresAt: result.expiresAt });
    }
    send(res, 200, { person: result.person, expiresAt: result.expiresAt }, { 'set-cookie': sessionCookie(result.token, config) });
  });

  routes.set('POST /auth/second-factor', (_req, res, body, caller) => {
    const result = identity.completeSecondFactor(asString(body.challengeToken), asString(body.code), caller);
    if (!result.ok) {
      const status = result.reason === 'too-many-attempts' ? 429 : 401;
      return send(res, status, { error: result.reason, message: result.message });
    }
    send(res, 200, { person: result.person, expiresAt: result.expiresAt }, { 'set-cookie': sessionCookie(result.token, config) });
  });

  routes.set('GET /auth/session', (req, res) => {
    const resolved = identity.resolve(readCookie(req.headers.cookie, COOKIE));
    if (!resolved) return send(res, 401, { error: 'no-session' });
    const pending = erasure.pending(resolved.person.id);
    send(res, 200, {
      person: resolved.person,
      secondFactor: twoFactor.state(resolved.person.id),
      ...(pending ? { erasure: { requestedAt: pending.requestedAt, eraseAfter: pending.eraseAfter } } : {})
    });
  });

  routes.set('POST /account/name', (req, res, body, caller) => {
    const person = signedIn(req, res);
    if (!person) return;
    const result = identity.setName(person.id, typeof body.name === 'string' ? body.name : null, caller);
    if (!result.ok) return send(res, result.reason === 'encryption-unavailable' ? 503 : 400, { error: result.reason, message: result.message });
    send(res, 200, { person: result.person });
  });

  routes.set('GET /account/second-factor', (req, res) => {
    const person = signedIn(req, res);
    if (!person) return;
    send(res, 200, {
      ...twoFactor.state(person.id),
      /* Said the same way to everyone, whether or not it applies to them yet: which work carries a
         second factor is a property of the work, not a setting on the account. */
      requiredFor: SECOND_FACTOR_CAPABILITIES.map(capability => ({ capability, because: SECOND_FACTOR_REASONS[capability] }))
    });
  });

  routes.set('POST /account/second-factor/begin', (req, res) => {
    const person = signedIn(req, res);
    if (!person) return;
    const result = twoFactor.begin(person.id, person.phone);
    if (!result.ok) return send(res, result.reason === 'encryption-unavailable' ? 503 : 409, { error: result.reason, message: result.message });
    /* Handed over once, and it does nothing until a code comes back from it. */
    send(res, 200, { secret: result.secret, uri: result.uri });
  });

  routes.set('POST /account/second-factor/confirm', (req, res, body) => {
    const person = signedIn(req, res);
    if (!person) return;
    const result = twoFactor.confirm(person.id, asString(body.code));
    if (!result.ok) return send(res, result.reason === 'encryption-unavailable' ? 503 : 400, { error: result.reason, message: result.message });
    send(res, 200, { recoveryCodes: result.recoveryCodes, shownOnce: true });
  });

  routes.set('POST /account/second-factor/disable', (req, res, body, caller) => {
    const person = signedIn(req, res);
    if (!person) return;
    if (!stepUp(person.id, 'second-factor.disable', asString(body.code), caller, res)) return;
    twoFactor.remove(person.id);
    send(res, 200, { ...twoFactor.state(person.id) });
  });

  /* The section 24 answer, as data. An operator can read it, and so can the person it is about. */
  routes.set('GET /account/data', (req, res) => {
    const person = signedIn(req, res);
    if (!person) return;
    if (protection) {
      const outcome = protection.gate.access({
        actorId: person.id, actorRole: 'subject', capability: 'view-patient-summary',
        purpose: 'subject-access', recordType: 'patient', recordId: person.id, subjectId: person.id
      });
      if (!outcome.allowed) return send(res, 403, { error: outcome.reason, audit: outcome.auditId });
      res.setHeader('x-mythuso-audit', outcome.auditId);
    }
    /* The plan, rather than the register: it is per person, so a nurse is told about her
       certificates and somebody who only uses MyThuso for their own care is not told about
       certificates they have never submitted. */
    const plan = erasure.plan(now(), person.id);
    send(res, 200, {
      holds: SCOPE_STATEMENT, holdings: plan.holdings, summary: plan.summary,
      retained: plan.retained.map(entry => ({
        label: entry.holding.label, basis: entry.basis.name, authority: entry.basis.authority,
        conflictsWithErasure: entry.basis.conflictsWithErasure, disposalOn: entry.disposalOn
      })),
      /* Named even though nothing here is held on them, because "no clinical record exists" and
         "erasure would reach a clinical record" are different statements and only one is true. */
      clinicalRetention: clinicalRetentionRules().map(basis => ({ name: basis.name, authority: basis.authority, rule: basis.rule, note: basis.note })),
      responseDays: RESPONSE_DAYS, respondBy: plan.respondBy
    });
  });

  routes.set('POST /account/erasure', (req, res, body, caller) => {
    const person = signedIn(req, res);
    if (!person) return;
    if (!stepUp(person.id, 'account.erasure', asString(body.code), caller, res)) return;
    send(res, 200, erasure.request(person.id, caller));
  });

  routes.set('POST /account/erasure/cancel', (req, res, _body, caller) => {
    const person = signedIn(req, res);
    if (!person) return;
    send(res, 200, { cancelled: erasure.cancel(person.id, caller) });
  });

  /* ---- Consent, and the log of who opened a record ------------------------------------------
     The contract itself, unauthenticated, because what MyThuso asks people to agree to is not a
     secret and a person deciding whether to sign up is entitled to read it first. It carries no
     decision by anybody: the standing is on the route below, behind a session. */
  routes.set('GET /consent/contract', (_req, res) => send(res, 200, {
    why: CONSENT_WHY, notAdvice: NOT_ADVICE, rules: CONSENT_RULES,
    bases: LAWFUL_BASES, routes: CONSENT_ROUTES,
    /* Required and optional are two lists rather than one list with a flag, because that is the
       decision the person is actually making and a flag is what lets a screen quietly blur it. */
    required: requiredPurposes().map(purpose => ({ ...purpose, current: currentVersion(purpose) })),
    optional: optionalPurposes().map(purpose => ({ ...purpose, current: currentVersion(purpose) })),
    accessLog: ACCESS_LOG,
    informationOfficer: config.informationOfficer || null
  }));

  routes.set('GET /consent', (req, res) => {
    const person = signedIn(req, res);
    if (!person) return;
    send(res, 200, {
      standing: consent.standing(person.id).map(entry => ({
        purposeId: entry.purpose.id, name: entry.purpose.name, kind: entry.purpose.kind,
        required: entry.purpose.required, state: entry.state, authorises: entry.authorises,
        heldVersion: entry.heldVersion, currentVersion: entry.current.version,
        decidedAt: entry.decidedAt, proofIntact: entry.proofIntact,
        reconsentBecause: entry.reconsentBecause,
        ifRefused: entry.purpose.ifRefused, withdrawal: entry.purpose.withdrawal,
        retainedOnWithdrawal: entry.purpose.retainedOnWithdrawal,
        /* The proof, as a person would want to see it: the words, the fingerprint of them, the date
           and the route. Never a pointer to a row somebody could edit. */
        history: entry.history.map(row => ({
          decision: row.decision, version: row.version, at: row.at, route: row.route,
          locale: row.locale, recordedAs: row.recordedAs, wordingHash: row.wordingHash
        }))
      })),
      care: consent.careStanding(person.id)
    });
  });

  /**
   * The one route a person can honestly declare about themselves.
   *
   * `packages/catalog/consent.json` describes four: ticked in the account, read aloud by a nurse at
   * the door, signed on paper at a Thuso Corner, and given by a guardian with proven authority.
   * Three of those four are somebody *else's* act — the nurse's, the Corner's, the guardian's — and
   * until now this route took whichever one the body named. docs/PRIVACY-AND-SECURITY.md called that
   * absent and was exact about why: "a signed-in person can declare the route themselves".
   *
   * A person declaring that a nurse read it to them is not the nurse having read it. It is the one
   * kind of consent record that would be relied on hardest — a spoken consent from somebody who
   * cannot read the screen — with nothing behind it at all, and the honest answer while there is no
   * care relationship and no proven guardianship is to refuse it rather than record it.
   *
   * The contract's own words for each route are handed back with the refusal, so the surface can say
   * what the route *is* rather than only that it is not available.
   */
  const DECLARABLE_ROUTE = 'web-account';
  routes.set('POST /consent/give', (req, res, body) => {
    const person = signedIn(req, res);
    if (!person) return;
    const named = asString(body.route) || DECLARABLE_ROUTE;
    if (named !== DECLARABLE_ROUTE) {
      const route = CONSENT_ROUTES.find(candidate => candidate.id === named);
      return send(res, 403, {
        error: 'route-not-yours-to-declare',
        message: `${route ? `"${route.name}" is` : 'That is'} somebody else's act, not yours, and this request is signed in as you. A consent recorded here as read aloud by a nurse, signed on paper at a Thuso Corner or given by a guardian would be a record of somebody having done something with nothing whatever behind it — and the spoken one is exactly the record that would be relied on hardest, because the person it is about could not read the screen. MyThuso will record those routes when there is a nurse's own authority, a Corner's, or a proven guardianship behind them. There is not yet.`,
        ...(route ? { route } : {})
      });
    }
    const result = consent.give(person.id, {
      purposeId: asString(body.purposeId), version: Number(body.version),
      route: DECLARABLE_ROUTE, locale: asString(body.locale) || 'en-ZA'
    });
    if (!result.ok) return send(res, 400, { error: 'consent-refused', message: result.reason });
    send(res, 200, { recorded: true, repeated: result.repeated, version: result.decision.version, wordingHash: result.decision.wordingHash, at: result.decision.at });
  });

  /* Withdrawal is a POST with a purpose and nothing else. No reason is asked for, no second factor
     is demanded and there is no confirmation endpoint: it has to be as easy as giving it was, and
     giving it was a tick. What comes back is what is kept anyway, so the surface can say it. */
  routes.set('POST /consent/withdraw', (req, res, body) => {
    const person = signedIn(req, res);
    if (!person) return;
    const result = consent.withdraw(person.id, { purposeId: asString(body.purposeId), route: DECLARABLE_ROUTE });
    if (!result.ok) return send(res, 400, { error: 'withdrawal-refused', message: result.reason });
    send(res, 200, { withdrawn: true, at: result.decision.at, retained: result.retained, alsoStops: result.alsoStops });
  });

  /* The person's own access log. It goes through the gate like every other read, and the read is
     itself written into the log — see RecordAccessLog.mine. */
  routes.set('GET /consent/access-log', (req, res) => {
    const person = signedIn(req, res);
    if (!person) return;
    if (!accessLog) return send(res, 503, { error: 'not-configured', message: 'No protection keys are configured, so nothing here decides or records an access.' });
    const result = accessLog.mine(person.id);
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, {
      entries: result.entries.map(entry => ({
        at: entry.at, actorLabel: entry.actorLabel, actorRole: entry.actorRole,
        capability: entry.capability, purpose: entry.processingPurpose, lawfulBasis: entry.lawfulBasis,
        recordType: entry.recordType, outcome: entry.outcome, refusedBy: entry.refusedBy,
        reason: entry.reason, consentPurpose: entry.consentPurpose, consentVersion: entry.consentVersion,
        auditId: entry.auditId
      })),
      /* Said on the response rather than only in a document, because the entry a person is looking
         for is usually a refusal and a list of successes would quietly reassure them. */
      refusalsIncluded: CONSENT_RULES.aRefusedAccessIsRecordedToo,
      notTheSignInLog: CONSENT_RULES.theAccessLogIsNotTheSignInLog
    });
  });

  /* ---- The gate gets routes -------------------------------------------------------------------
   *
   * docs/PRIVACY-AND-SECURITY.md put it plainly: "the gate is a library with a test suite, not a
   * running gate", and named the eight calls — enrol, submit, open, decide, second, suspend, restore
   * and standing — that were reached from the tests and from nowhere else. These are those eight.
   *
   * Not one of them takes an actor. Every one resolves the caller through `asParty`, which reads the
   * id off the session cookie and the role out of `vetting_parties`, so the only thing a request can
   * choose is which party it is acting *on* — and that choice decides the purpose rather than being
   * one. See apps/api/src/actor.ts.
   *
   * Every refusal below is the vault's or the gate's own sentence, passed through word for word. The
   * ones this file adds are about HTTP: no session, no vault, not on the register, a body that is
   * not what it says it is.
   *
   * **A note on size.** The body is capped at 8 KiB and a real certificate is not 8 KiB, so what can
   * be submitted through this route today is a small file. That is a deliberate order of operations
   * — the cap is a control and the upload is the new thing — and a real document channel streams to
   * the gate rather than base64-ing through a JSON body. It is named here rather than discovered by
   * whoever first tries to send a scan. */
  const queryOf = (req: IncomingMessage): URLSearchParams => new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
  type ResolvedCheck = NonNullable<ReturnType<VettingVault['standing']>>['checks'][number];
  const evidenceOut = (record: ResolvedCheck) => ({
    evidenceId: record.id, checkId: record.checkId, name: record.name, risk: record.risk,
    state: record.state, resolved: record.resolved, issuedOn: record.issuedOn, expiresOn: record.expiresOn,
    daysRemaining: record.daysRemaining, decidedBy: record.decidedBy, secondedBy: record.secondedBy,
    awaitingSecondReviewer: record.awaitingSecondReviewer, restingOnBootstrap: record.bootstrapped,
    versions: record.versions, declinedReason: record.declinedReason, assurance: record.assurance
  });
  const standingOut = (result: NonNullable<ReturnType<VettingVault['standing']>>) => ({
    party: {
      id: result.party.id, roleId: result.party.roleId, reference: result.party.reference,
      suspendedAt: result.party.suspendedAt, suspendedReason: result.party.suspendedReason,
      declinedAt: result.party.declinedAt, declinedReason: result.party.declinedReason
    },
    standing: result.standing, assurance: result.assurance, checks: result.checks.map(evidenceOut)
  });

  /* Your own standing. The one vetting route that demands nothing beyond being on the register: a
     nurse whose clearance lapsed last night is the person most entitled to be told so. */
  routes.set('GET /vetting/me', (req, res) => {
    const held = asParty(req, res);
    if (!held) return;
    const result = vetting!.standing(held.actor.party.id);
    if (!result) return send(res, 404, { error: 'no-standing' });
    send(res, 200, {
      ...standingOut(result),
      secondFactorRequiredFor: held.actor.secondFactorCapabilities.map(capability => ({ capability, because: SECOND_FACTOR_REASONS[capability] }))
    });
  });

  /* Somebody else's standing, which is a reviewer's work. It goes through the gate rather than
     straight to the register: `standing()` is a plain read that takes no actor, so the decision has
     to be taken here, against this reviewer's own current clearance, before the answer is built. */
  routes.set('GET /vetting/party', (req, res) => {
    const held = asParty(req, res);
    if (!held) return;
    const partyId = queryOf(req).get('id') ?? '';
    if (!partyId) return send(res, 400, { error: 'no-party', message: 'Name the party this is about.' });
    const outcome = protection!.gate.access({
      actorId: held.actor.party.id, actorRole: held.actor.party.roleId, capability: 'review-vetting',
      purpose: held.actor.actorFor(partyId).purpose, recordType: 'vetting-evidence',
      recordId: partyId, subjectId: partyId, field: 'standing'
    });
    if (!outcome.allowed) return send(res, 403, { error: 'refused', message: outcome.reason, blockedBy: outcome.blockedBy, audit: outcome.auditId });
    res.setHeader('x-mythuso-audit', outcome.auditId);
    const result = vetting!.standing(partyId);
    if (!result) return send(res, 404, { error: 'no-such-party' });
    send(res, 200, standingOut(result));
  });

  routes.set('POST /vetting/parties', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    const result = vetting!.enrol(held.actor.actorFor(asString(body.id)), {
      id: asString(body.id), roleId: asString(body.roleId),
      ...(asString(body.reference) ? { reference: asString(body.reference) } : {})
    });
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, { party: result.party });
  });

  /* A document in. The party id is on the body because a reviewer submits for somebody else and a
     nurse submits for herself, and the purpose the gate decides on follows from which of those it
     is — resolved from the session, never declared. */
  routes.set('POST /vetting/evidence', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    const partyId = asString(body.partyId) || held.actor.party.id;
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    const document = Buffer.from(asString(body.document), 'base64');
    if (!document.byteLength) return send(res, 400, { error: 'no-document', message: 'A submission has to carry the file itself, base64 encoded, in `document`. An empty file is not evidence and nothing was stored.' });
    const result = vetting!.submit({
      actor: held.actor.actorFor(partyId), partyId, checkId: asString(body.checkId),
      filename: asString(body.filename) || 'submission', document,
      ...(asString(body.issuedOn) ? { issuedOn: asString(body.issuedOn) } : {}),
      ...(asString(body.expiresOn) ? { expiresOn: asString(body.expiresOn) } : {})
    });
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, {
      evidenceId: result.evidence.id, state: result.evidence.state, expiresOn: result.evidence.expiresOn,
      version: { number: result.version.versionNumber, filename: result.version.filename, bytes: result.version.bytes, contentHash: result.version.contentHash }
    });
  });

  /* A document out. A POST rather than a GET because it demands a step-up code, and because it is
     the most sensitive read this service performs: it opens somebody's police clearance. */
  routes.set('POST /vetting/evidence/open', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    const evidenceId = asString(body.evidenceId);
    const version = Number(body.version);
    if (!evidenceId || !Number.isInteger(version) || version < 1) return send(res, 400, { error: 'no-version', message: 'Name the evidence record and which version of it.' });
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    /* Whose record it is is looked up rather than taken from the caller, so the purpose the gate
       decides on is a fact about the record and not a claim on the request. */
    const owner = vettingStore.findEvidence(evidenceId)?.partyId ?? '';
    const result = vetting!.open(held.actor.actorFor(owner), evidenceId, version);
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, {
      filename: result.version.filename, bytes: result.version.bytes, contentHash: result.version.contentHash,
      document: result.document.toString('base64')
    });
  });

  routes.set('POST /vetting/evidence/decide', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    const evidenceId = asString(body.evidenceId);
    const decision = asString(body.decision);
    if (decision !== 'verified' && decision !== 'declined' && decision !== 'in-review') {
      return send(res, 400, { error: 'no-decision', message: 'A decision is verified, declined or in-review. Nothing else is a decision.' });
    }
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    const owner = vettingStore.findEvidence(evidenceId)?.partyId ?? '';
    const result = vetting!.decide({
      actor: held.actor.actorFor(owner), evidenceId, decision,
      ...(asString(body.issuedOn) ? { issuedOn: asString(body.issuedOn) } : {}),
      ...(asString(body.expiresOn) ? { expiresOn: asString(body.expiresOn) } : {}),
      ...(asString(body.reason) ? { reason: asString(body.reason) } : {})
    });
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, { evidence: evidenceOut(result.evidence) });
  });

  routes.set('POST /vetting/evidence/second', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    const evidenceId = asString(body.evidenceId);
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    const owner = vettingStore.findEvidence(evidenceId)?.partyId ?? '';
    const result = vetting!.second(held.actor.actorFor(owner), evidenceId);
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, { evidence: evidenceOut(result.evidence) });
  });

  routes.set('POST /vetting/parties/suspend', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    const partyId = asString(body.partyId);
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    const result = vetting!.suspend(held.actor.actorFor(partyId), partyId, asString(body.reason));
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, { suspended: true });
  });

  routes.set('POST /vetting/parties/restore', (req, res, body, caller) => {
    const held = asParty(req, res);
    if (!held) return;
    const partyId = asString(body.partyId);
    if (!stepUp(held.person.id, 'capability', asString(body.code), caller, res, held.actor.grants)) return;
    const result = vetting!.restore(held.actor.actorFor(partyId), partyId);
    if (!result.ok) return send(res, 403, { error: 'refused', message: result.reason });
    send(res, 200, { suspended: false });
  });

  /* ---- The export ------------------------------------------------------------------------------
     A POST rather than a GET, because it demands a code and because the answer is not something a
     browser should be able to be talked into fetching. Scoped to the caller by construction: there
     is no id on this request, so there is no id to change. See apps/api/src/subjectExport.ts for
     what it will not carry and why each one. */
  routes.set('POST /account/export', (req, res, body, caller) => {
    const person = signedIn(req, res);
    if (!person) return;
    if (!stepUp(person.id, 'account.export', asString(body.code), caller, res)) return;
    /* Decided and written into the chain before any of it is assembled, exactly as every other
       protected read is. A refused export is in the log like a refused anything else. */
    let auditId: string | null = null;
    if (protection) {
      const outcome = protection.gate.access({
        actorId: person.id, actorRole: 'subject', capability: 'view-patient-summary',
        purpose: 'subject-access', recordType: 'patient', recordId: person.id, subjectId: person.id,
        field: 'export'
      });
      if (!outcome.allowed) return send(res, 403, { error: 'refused', message: EXPORT_REFUSALS.gateRefused, reason: outcome.reason, audit: outcome.auditId });
      auditId = outcome.auditId;
      res.setHeader('x-mythuso-audit', outcome.auditId);
    }
    const plan = erasure.plan(now(), person.id);
    const party = vetting ? vetting.standing(person.id) : null;
    const accessEntries = accessLog ? accessLog.mine(person.id) : null;
    send(res, 200, {
      scope: EXPORT_SCOPE,
      neverIncluded: NEVER_EXPORTED,
      exportedAt: new Date(now()).toISOString(),
      auditEntry: auditId,
      account: { id: person.id, phone: person.phone, name: person.name },
      secondFactor: twoFactor.state(person.id),
      consent: consent.standing(person.id).map(entry => ({
        purposeId: entry.purpose.id, name: entry.purpose.name, state: entry.state,
        heldVersion: entry.heldVersion, currentVersion: entry.current.version,
        decidedAt: entry.decidedAt, proofIntact: entry.proofIntact,
        history: entry.history.map(row => ({ decision: row.decision, version: row.version, at: row.at, route: row.route, locale: row.locale, recordedAs: row.recordedAs, wordingHash: row.wordingHash }))
      })),
      /* Their own lines out of the append-only sign-in log. This is the part of a subject access
         request somebody actually reads: it is where a sign-in they did not make would be. */
      signInLog: store.auditForPerson(person.id, person.phone, 500).map(entry => ({
        at: entry.at, event: entry.event, address: entry.address, detail: entry.detail
      })),
      recordAccessLog: accessEntries && accessEntries.ok
        ? accessEntries.entries.map(entry => ({ at: entry.at, actorLabel: entry.actorLabel, actorRole: entry.actorRole, capability: entry.capability, purpose: entry.processingPurpose, lawfulBasis: entry.lawfulBasis, outcome: entry.outcome, reason: entry.reason, auditId: entry.auditId }))
        : [],
      /* The decisions about a party's checks, never the certificates behind them. See NEVER_EXPORTED. */
      vetting: party ? standingOut(party) : null,
      corrections: requests.mine(person.id),
      answers: requests.responsesTo(person.id),
      erasure: erasure.pending(person.id),
      holdings: plan.holdings, retained: plan.retained.map(entry => ({ label: entry.holding.label, basis: entry.basis.name, authority: entry.basis.authority, disposalOn: entry.disposalOn })),
      responseDays: RESPONSE_DAYS
    });
  });

  /* ---- Correction, and the queue somebody answers ---------------------------------------------
     POPIA section 24 gives two rights in one section and this service has only ever had one of them.
     The refusals are in apps/api/src/subjectRequests.ts and are the point of the route. */
  routes.set('POST /account/correction', (req, res, body) => {
    const person = signedIn(req, res);
    if (!person) return;
    const result = openCorrection(requests, {
      personId: person.id, field: asString(body.field),
      shouldSay: asString(body.shouldSay), because: asString(body.because)
    }, now());
    if (!result.ok) return send(res, 400, { error: 'correction-refused', message: result.reason, ...(result.noteOffered ? { noteOffered: true } : {}) });
    send(res, 200, {
      requestId: result.request.id, field: result.request.field,
      requestedAt: result.request.requestedAt, respondBy: result.request.dueAt, responseDays: RESPONSE_DAYS
    });
  });

  routes.set('GET /account/correction', (req, res) => {
    const person = signedIn(req, res);
    if (!person) return;
    send(res, 200, {
      requests: requests.mine(person.id),
      answers: requests.responsesTo(person.id),
      correctableFields: ['name'],
      /* Said whether or not it applies yet, because the person most likely to ask is the one whose
         number is wrong, and finding out after typing it is worse than being told first. */
      whatCannotBeCorrected: [REQUEST_REFUSALS.phoneIsIdentity, REQUEST_REFUSALS.logsAreNotCorrected],
      responseDays: RESPONSE_DAYS
    });
  });

  /**
   * Who works the queue, and why this is a standing check rather than a gate decision.
   *
   * The gate decides about *records* — a capability, a record type, a purpose and a patient's own
   * release. A section 24 request is none of those: it is the responsible party's own compliance
   * duty, and `packages/catalog/vetting.json` has no capability for one, because the contract
   * describes clinical and operational work rather than what MyThuso owes about itself. Inventing a
   * record type to run this through the gate would have been a lie in a hash chain.
   *
   * So it is decided on the half of the gate that does apply, using the gate's own arithmetic: the
   * caller is a party, the party's role is granted `review-vetting` — which is the one capability the
   * catalogue gives MyThuso's own cleared staff — and the party's standing is resolved out of stored
   * evidence on every single read, so a reviewer whose police clearance ran out last night loses the
   * queue this morning without anybody noticing first. The decision is written into the chain either
   * way. A capability of its own is the right fix and is named as outstanding in
   * docs/PRIVACY-AND-SECURITY.md.
   */
  const asOperator = (req: IncomingMessage, res: ServerResponse, what: string): { person: PublicPerson; actor: ResolvedActor } | null => {
    const held = asParty(req, res);
    if (!held) return null;
    const refuse = (reason: string) => {
      protection!.audit.append({
        event: 'operator.refused', actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
        capability: 'review-vetting', purpose: 'vetting', recordType: what, recordId: what,
        subjectId: held.actor.party.id, field: 'queue', allowed: false, reason
      });
      send(res, 403, { error: 'refused', message: reason });
      return null;
    };
    if (!held.actor.grants.includes('review-vetting')) {
      return refuse(`A ${roleName(held.actor.party.roleId)} does not answer requests made under POPIA section 24. That is MyThuso's own compliance work, and the register grants it to the staff it vets to review everybody else.`);
    }
    /* In the gate's own order, and for the gate's own reason. A declining and a suspension are one
       person's decision about another; the standing underneath is arithmetic on the certificates. The
       three are asked separately because `standingOf` deliberately answers only the third — a
       suspended party's *checks* still pass, and folding the two together would make a suspension
       look like a failed police clearance to everybody reading a screen. */
    const standing = vetting!.standing(held.actor.party.id);
    if (!standing) return refuse('There is no vetting record for this account any more, so there is no standing to decide on.');
    if (standing.party.declinedAt !== null) return refuse(standing.party.declinedReason ?? 'This account was declined.');
    if (standing.party.suspendedAt !== null) return refuse(standing.party.suspendedReason ?? 'This account is suspended.');
    if (!standing.standing.cleared) {
      const blocking = [...standing.standing.lapsed, ...standing.standing.blocking, ...standing.standing.awaitingSecond];
      return refuse(`Your own vetting is not currently clear${blocking.length ? `: ${blocking.join(', ')}` : ''}. It is resolved from the evidence on file every time it is read, so a certificate that ran out overnight withdraws this without anybody having to act.`);
    }
    return held;
  };

  /* The queue itself: what is outstanding, when it arrived, when it is due, and how much of it is
     late. No name and no number — ids, dates and a field name. A queue that could be read as a list
     of people is a list of people. */
  routes.set('GET /operator/requests', (req, res) => {
    const held = asOperator(req, res, 'subject-request');
    if (!held) return;
    const at = now();
    const entries = subjectQueue(requests.outstandingCorrections(), erasure.outstanding(), at);
    protection!.audit.append({
      event: 'operator.queue.opened', actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
      capability: 'review-vetting', purpose: 'vetting', recordType: 'subject-request',
      recordId: 'queue', subjectId: held.actor.party.id, field: 'queue', allowed: true,
      reason: `${entries.length} outstanding, ${overdueCount(entries)} of them past thirty days`
    });
    send(res, 200, {
      entries, outstanding: entries.length, overdue: overdueCount(entries), responseDays: RESPONSE_DAYS,
      /* Said on the response, because a queue that implied it alerted somebody would be worse than
         no queue at all. */
      nobodyIsPaged: 'Nothing here notifies anybody. There is no messaging provider on this platform, so this is a list that exists and an overdue count that is arithmetic — it is not an escalation, and a request goes unanswered unless a person opens this.'
    });
  });

  /* The proof of response: who answered, when, what they decided and what they said. Written once
     and never edited, and the audit entry is made before the row so the two cannot come apart. */
  routes.set('POST /operator/requests/respond', (req, res, body) => {
    const held = asOperator(req, res, 'subject-request');
    if (!held) return;
    const kind = asString(body.kind) as RequestKind;
    const requestId = asString(body.requestId);
    const outcome = asString(body.outcome) as Outcome;
    const response = asString(body.response);
    if (kind !== 'correction' && kind !== 'erasure') return send(res, 400, { error: 'no-kind', message: 'A response answers a correction or an erasure. Those are the two rights section 24 gives.' });
    if (!(OUTCOMES as readonly string[]).includes(outcome)) return send(res, 400, { error: 'no-outcome', message: 'An answer is corrected, refused, or noted — the record left as it was with the person\'s own account of it attached, which is what section 24(2)(c) offers where MyThuso will not amend.' });
    if (!response.trim()) return send(res, 400, { error: 'no-response', message: 'The answer has to carry what was said to the person. A recorded response with nothing in it proves a date and nothing else.' });
    const request = kind === 'correction' ? requests.find(requestId) : null;
    const personId = kind === 'correction' ? request?.personId ?? '' : requestId;
    if (kind === 'correction' && !request) return send(res, 404, { error: 'no-such-request' });
    if (kind === 'correction' && request!.answeredAt !== null) return send(res, 409, { error: 'already-answered', message: REQUEST_REFUSALS.alreadyAnswered });
    if (personId === held.person.id) return send(res, 403, { error: 'not-your-own', message: REQUEST_REFUSALS.notYourOwn });
    const at = now();
    const link = protection!.audit.append({
      event: `subject-request.${outcome}`, actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
      capability: 'review-vetting', purpose: 'vetting', recordType: 'subject-request',
      recordId: requestId, subjectId: personId, field: kind, allowed: true,
      reason: `Answered as ${outcome}${outcome === 'noted' ? ', with the person\'s own account attached to the record' : ''}`
    });
    requests.recordResponse({
      id: randomUUID(), kind, requestId, personId, outcome, response: response.trim(),
      noteAttached: outcome === 'noted', answeredBy: held.actor.party.id, answeredAt: at, auditId: link.id
    });
    if (kind === 'correction') requests.markAnswered(requestId, at);
    send(res, 200, { recorded: true, at, outcome, noteAttached: outcome === 'noted', audit: link.id });
  });

  /* ---- The security compromise register --------------------------------------------------------
     POPIA section 22. See apps/api/src/incidents.ts for why it has no severity ladder, why it holds
     no names, and what it still does not do — which is detection, paging and delivery, all three. */
  routes.set('GET /incidents/kinds', (_req, res) => send(res, 200, { kinds: INCIDENT_KINDS, notificationRule: NOTIFICATION_RULE }));

  /* Any party MyThuso vets may open one, cleared or not. That is deliberate and it is the one place
     in this service where standing is not asked for: the incidents that matter are reported by the
     person who thinks they might have caused it, and a report you have to be in good standing to
     file is a report that does not get filed on the worst day. */
  routes.set('POST /incidents', (req, res, body) => {
    const held = asParty(req, res);
    if (!held) return;
    const result = reportIncident(incidents, {
      kind: asString(body.kind), whatHappened: asString(body.whatHappened),
      informationReached: body.informationReached === true,
      peopleAffected: typeof body.peopleAffected === 'number' ? body.peopleAffected : null,
      ...(typeof body.discoveredAt === 'number' ? { discoveredAt: body.discoveredAt } : {}),
      openedBy: held.actor.party.id
    }, now());
    if (!result.ok) return send(res, 400, { error: 'incident-refused', message: result.reason });
    /* The kind and the reference go into the chain; what somebody typed does not. An audit entry
       that carried the free text would be an audit entry carrying whatever was in it. */
    protection!.audit.append({
      event: 'incident.opened', actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
      capability: 'review-vetting', purpose: 'vetting', recordType: 'incident',
      recordId: result.incident.id, subjectId: held.actor.party.id, field: result.incident.kind,
      allowed: true, reason: result.incident.informationReached ? 'Recorded as having reached personal information: section 22 notification is owed' : 'Recorded as not having reached personal information'
    });
    send(res, 200, {
      incidentId: result.incident.id, discoveredAt: result.incident.discoveredAt,
      notificationOwed: result.incident.informationReached, notificationRule: NOTIFICATION_RULE
    });
  });

  routes.set('POST /incidents/contain', (req, res, body) => {
    const held = asParty(req, res);
    if (!held) return;
    const id = asString(body.incidentId);
    const containment = asString(body.containment);
    if (!incidents.find(id)) return send(res, 404, { error: 'no-such-incident', message: INCIDENT_REFUSALS.noSuchIncident });
    if (!containment.trim()) return send(res, 400, { error: 'no-containment', message: 'Say what stopped it. "Contained" on its own is a tick rather than a record.' });
    incidents.contain(id, now(), containment.trim());
    protection!.audit.append({
      event: 'incident.contained', actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
      capability: 'review-vetting', purpose: 'vetting', recordType: 'incident', recordId: id,
      subjectId: held.actor.party.id, field: 'containment', allowed: true, reason: 'Containment recorded'
    });
    send(res, 200, { contained: true });
  });

  /* Recorded, not sent. Nothing here notifies the Regulator or anybody else — there is no provider
     — so this is one person's word that it was done, with their name on it and a date. */
  routes.set('POST /incidents/notified', (req, res, body) => {
    const held = asOperator(req, res, 'incident');
    if (!held) return;
    const id = asString(body.incidentId);
    const who = asString(body.who);
    if (who !== 'regulator' && who !== 'subjects') return send(res, 400, { error: 'no-audience', message: 'Section 22 names two: the Information Regulator, and the people affected. Say which of them was told.' });
    if (!incidents.find(id)) return send(res, 404, { error: 'no-such-incident', message: INCIDENT_REFUSALS.noSuchIncident });
    incidents.recordNotification(id, who, now());
    protection!.audit.append({
      event: 'incident.notified', actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
      capability: 'review-vetting', purpose: 'vetting', recordType: 'incident', recordId: id,
      subjectId: held.actor.party.id, field: who, allowed: true,
      reason: `Recorded as told: ${who === 'regulator' ? 'the Information Regulator' : 'the people affected'}. Recorded, never sent — this service notifies nobody.`
    });
    send(res, 200, { recorded: true, who });
  });

  routes.set('POST /incidents/close', (req, res, body) => {
    const held = asOperator(req, res, 'incident');
    if (!held) return;
    const result = closeIncident(incidents, asString(body.incidentId), held.actor.party.id, now());
    if (!result.ok) return send(res, 409, { error: 'close-refused', message: result.reason });
    protection!.audit.append({
      event: 'incident.closed', actorId: held.actor.party.id, actorRole: held.actor.party.roleId,
      capability: 'review-vetting', purpose: 'vetting', recordType: 'incident', recordId: result.incident.id,
      subjectId: held.actor.party.id, field: 'closure', allowed: true,
      reason: `Closed after ${daysSinceDiscovery(result.incident, now())} days`
    });
    send(res, 200, { closed: true, at: result.incident.closedAt });
  });

  routes.set('GET /incidents', (req, res) => {
    const held = asOperator(req, res, 'incident');
    if (!held) return;
    const at = now();
    const all = incidents.all();
    send(res, 200, {
      ...incidentStanding(all, at),
      incidents: all.map(incident => ({ ...incident, daysSinceDiscovery: daysSinceDiscovery(incident, at) }))
    });
  });

  routes.set('POST /auth/logout', (req, res, _body, caller) => {
    identity.logout(readCookie(req.headers.cookie, COOKIE), caller);
    send(res, 200, { ok: true }, { 'set-cookie': clearCookie(config) });
  });

  /* What it holds, said in one phrase by the thing that is actually running rather than only by a
     document. It is no longer "identity only" — the vetting module holds workforce evidence — and it
     is still no health information, which is the half that decides which controls apply. */
  routes.set('GET /health', (_req, res) => send(res, 200, { ok: true, environment: config.environment, holds: 'identity and workforce vetting, no health information' }));
  /* The audit chain's own integrity, for the health check that runs every five minutes. It returns
     whether the chain follows and where it stops following — never an entry, and never a value.

     Beside it, the bootstrap: how many founding ceremonies this register has ever seen, when the
     last one was, and how many checks are still standing on one. A broken chain is woken for
     because somebody may be editing the record of who read what; a *new* bootstrap ceremony on a
     running server deserves the same attention, because it is the one decision on the platform with
     nobody checking it. Counts and a date only — no party, no name, no fingerprint: this endpoint
     answers on the loopback to a script, and what it is for is noticing, not reading. */
  routes.set('GET /health/audit', (_req, res) => {
    if (!protection) return send(res, 200, { configured: false, note: 'No protection keys are configured, so there is no chain to verify.' });
    send(res, 200, {
      configured: true, ...protection.audit.verify(),
      ...(vetting ? { bootstrap: vetting.bootstrapStanding() } : {})
    });
  });
  /* Whether the log of who opened whose record still says what it said when it was written.
     Separate from /health/audit because the two answer different questions and can fail
     independently: that one asks whether the gate's own chain follows, this one asks whether the
     table the data subject reads has been rewritten behind it. It reports the window as well as the
     verdict — how many entries have been appended since the last seal, and how many predate the
     links entirely — because "intact" over a log that is mostly unsealed is a reassuring answer to
     a question nobody asked. Counts and a verdict; no entry, no actor, no subject.

     It does not seal before it verifies. Sealing first would commit whatever it found, which is a
     verification that certifies the tampering it was looking for. */
  routes.set('GET /health/access-log', (_req, res) => {
    if (!protection || !accessLog) return send(res, 200, { configured: false, note: 'No protection keys are configured, so nothing decides an access, nothing is written down and there is no log to verify.' });
    send(res, 200, { configured: true, ...protection.verifySealedLog(ACCESS_LOG_ID, accessLog.links()) });
  });
  /* How much of the credential verification layer is actually wired, counted by the running service
     rather than claimed by a document. It is the number this repository is most likely to be wrong
     about in a year's time — "we integrated with SANC" is the sort of thing that gets written down
     before it is true — so the count comes from the adapters that exist. Names of authorities only;
     no party, no credential, nothing about anybody. */
  routes.set('GET /health/verification', (_req, res) => {
    if (!vetting) return send(res, 200, { configured: false, note: 'No protection keys are configured, so there is no vault and no verification layer.' });
    send(res, 200, { configured: true, ...vetting.verificationStanding() });
  });

  /**
   * The accredited identity provider's callback.
   *
   * The only route in this service that is not about the caller. It carries no session and cannot:
   * it arrives from the provider's servers, and what authenticates it is the HMAC signature over
   * the payload, checked against the partner key, in constant time, inside a fifteen-minute window
   * — see `apps/api/src/vetting/identityProvider.ts`. A callback that does not verify is refused
   * and written into the same hash chain the gate writes to, because a forged callback against a
   * real session reference is somebody trying to mark a person identity-confirmed and it is
   * discovered by nobody unless it is in the log.
   *
   * It answers 200 to a repeat rather than re-recording it. A provider retries, and a retry that
   * produced a second authority answer would be one enquiry with two entries on the register.
   */
  routes.set('POST /vetting/identity/callback', (_req, res, body) => {
    if (!vetting) return send(res, 503, { error: 'not-configured' });
    const verdict = vetting.acceptIdentityCallback(body);
    if (!verdict.ok) return send(res, 401, { error: 'callback-refused' });
    send(res, 200, { ok: true, repeated: verdict.repeated });
  });

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    /* Sent once here rather than folded into send(), because it is the one header that depends on
       how the service is deployed rather than on what it is answering. `cookieSecure` is production,
       and production is the only place this is over TLS. */
    if (config.cookieSecure) res.setHeader('strict-transport-security', HSTS);
    const origin = req.headers.origin;
    const allowed = origin !== undefined && config.allowedOrigins.includes(origin);
    if (allowed) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!allowed) return send(res, 403, { error: 'origin-not-allowed' });
      res.writeHead(204, { ...TRANSPORT_HEADERS, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
      return res.end();
    }
    const route = `${req.method} ${(req.url ?? '/').split('?')[0]}`;
    const handler = routes.get(route);
    if (!handler) return send(res, 404, { error: 'not-found' });
    /* A cross-site page must not be able to spend a session. SameSite=Strict already stops the
       cookie travelling; refusing an unknown Origin on writes is the belt to that pair of braces. */
    if (req.method !== 'GET' && origin !== undefined && !allowed) return send(res, 403, { error: 'origin-not-allowed' });

    const caller: Caller = {
      address: (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, ''),
      agent: String(req.headers['user-agent'] ?? 'unknown')
    };

    /* ---- The health routes answer on the loopback, and now only there ------------------------
       The comment beside them has always said they "answer on the loopback to a script"; nothing in
       the code said so, and they were reachable from wherever the service listens. Each of them
       runs work — /health/audit walks the whole hash chain — so an open one is both a small
       disclosure and a cheap way to make the service do something expensive. The counts they return
       are about nobody in particular, which is why this is a refusal rather than a session: a health
       check is a script on the box, and a script on the box has a loopback address. */
    if (route.startsWith('GET /health/') && !LOOPBACK.has(caller.address)) {
      return send(res, 403, { error: 'loopback-only', message: 'The integrity and verification counts are answered on the loopback, to the health check running beside the service. They say nothing about anybody, and they are not a public statement about how sound this service is.' });
    }

    /* ---- What a legitimate caller may do -----------------------------------------------------
       Everything the document listed as unlimited, limited: every write, and the four health routes.
       Not the three sign-in routes, which carry their own and tighter limits counted against the
       number and the address — two limiters on one door is one limiter and one thing to get wrong.

       The key is the account where a session resolves and the caller's address where it does not, so
       signing out is not a way past it and an unauthenticated route is still held. The count comes
       out of `write_attempts`, which is spent material the sweep clears, and the window is the same
       fifteen minutes the sign-in limits use. `limits.writesPerCallerPerWindow` carries the
       reasoning, and says plainly that the number is a proposal. */
    const limited = req.method !== 'GET' ? !SELF_LIMITED.has(route) : route.startsWith('GET /health');
    if (limited) {
      const subject = identity.resolve(readCookie(req.headers.cookie, COOKIE))?.person.id ?? `address:${caller.address}`;
      const at = now();
      if (store.countWrites(subject, at - limits.rateWindowSeconds * 1000) >= limits.writesPerCallerPerWindow) {
        return send(res, 429, {
          error: 'too-many-requests',
          message: `That is more than ${limits.writesPerCallerPerWindow} requests in fifteen minutes from one caller, which is more than anything this service does honestly. Wait, and try again. Nothing has been lost.`
        }, { 'retry-after': String(limits.rateWindowSeconds) });
      }
      store.recordWrite(at, subject, route);
    }

    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      handler(req, res, body, caller);
    } catch (error) {
      send(res, 400, { error: error instanceof Error && error.message === 'body too large' ? 'body-too-large' : 'invalid-request' });
    }
  };
}
/* ---- How long a request may take, and how much of it may be headers -------------------------
 *
 * The body has been capped at 8 KiB since this service was written. Time was not capped at all, so
 * the service inherited Node's defaults — a 300-second request timeout and no header cap of its
 * own. A connection that opens, sends one header byte a minute and never finishes costs nothing to
 * make and holds a socket for five minutes, and a few thousand of them are the whole of a slowloris.
 * Nothing here needs five minutes: the slowest thing this service does is one AES-GCM unwrap and
 * one SQLite transaction.
 *
 * These are set on the listening server rather than inside a handler because they are properties of
 * the connection, and a handler does not run until the headers are already in. */
export const serverTimeouts = {
  /* From the first byte of the request to the last byte of the body. */
  requestMs: 15_000,
  /* From the first byte to the end of the headers. Deliberately below requestMs — a client that
     cannot finish its headers in five seconds is not a client with a slow connection, it is a
     client that has stopped. */
  headersMs: 5_000,
  /* How long an idle keep-alive connection is held open afterwards. */
  keepAliveMs: 5_000,
  /* Node counts headers, not bytes, and 8 KiB of body against an unbounded header set is a cap on
     the wrong half of the request. */
  maxHeaders: 40
};

export function start(config = loadConfig()) {
  const store = openStore(config.databasePath);
  const server = createServer(createApp(config, store));
  server.requestTimeout = serverTimeouts.requestMs;
  server.headersTimeout = serverTimeouts.headersMs;
  server.keepAliveTimeout = serverTimeouts.keepAliveMs;
  server.maxHeadersCount = serverTimeouts.maxHeaders;
  server.listen(config.port, () => {
    console.log(`MyThuso identity and vetting service on :${config.port} (${config.environment}) — holds no health information`);
    if (config.returnCodesInResponse) console.log('Development mode: one-time codes are returned in the response. This is refused in production.');
  });
  return { server, store };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) start();
