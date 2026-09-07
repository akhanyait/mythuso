import { createProtectionModule } from './protection/index.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { loadConfig, limits, type Config } from './config.ts';
import { openStore, type Store } from './store.ts';
import { Identity, type Caller, type PublicPerson } from './identity.ts';
import { TwoFactor } from './twoFactor.ts';
import { Erasure } from './erasure.ts';
import { decideStepUp, SECOND_FACTOR_CAPABILITIES, SECOND_FACTOR_REASONS, type StepUpAction } from './stepUp.ts';
import { RESPONSE_DAYS, SCOPE_STATEMENT, clinicalRetentionRules } from './personalData.ts';
import { SEALED_COLUMNS, VettingVault, openVettingStore, vettingSource } from './vetting/index.ts';

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

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
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

export function createApp(config: Config, store: Store, now = () => Date.now()) {
  const twoFactor = new TwoFactor(store, config, now);
  const identity = new Identity(store, config, now, twoFactor);
  const routes = new Map<string, Handler>();

  /* The vetting module's own tables, in the same database and owned by that module. The store is
     opened before the protection module because the gate reads a party's standing out of it: a
     nurse whose police clearance ran out last night is refused this morning by arithmetic, and that
     only works if the gate is asking the register rather than a stub that answers "nobody". */
  const vettingStore = openVettingStore(store.database);

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
  const vetting = protection ? new VettingVault({ gate: protection.gate, audit: protection.audit, store: vettingStore, now }) : null;
  /* What an erasure cannot reach, asked rather than assumed. With no protection keys there is no
     vault, so there is nothing it could be holding and nothing to say about it. */
  const erasure = new Erasure(store, now, vetting ? [{ retainedFor: personId => vetting.retainedFor(personId) }] : []);

  /* Every route below this line is about somebody's own account, so each one starts by resolving
     the cookie rather than trusting an id in the body. */
  const signedIn = (req: IncomingMessage, res: ServerResponse): PublicPerson | null => {
    const resolved = identity.resolve(readCookie(req.headers.cookie, COOKIE));
    if (!resolved) { send(res, 401, { error: 'no-session' }); return null; }
    return resolved.person;
  };

  /**
   * The rule from the incident report, in the one place it can be got wrong.
   *
   * A demand is only ever made where a second factor exists to answer it. An account with none
   * enrolled passes straight through — it has already proved possession of its mobile number, and
   * asking it for something it cannot produce would not be strict, it would be a locked-out person
   * with a support ticket. What comes back for that account is a nudge to enrol, never a refusal.
   */
  const stepUp = (personId: string, action: StepUpAction, code: string, caller: Caller, res: ServerResponse): boolean => {
    const decision = decideStepUp({ action, enrolled: twoFactor.confirmed(personId) });
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

  routes.set('POST /auth/logout', (req, res, _body, caller) => {
    identity.logout(readCookie(req.headers.cookie, COOKIE), caller);
    send(res, 200, { ok: true }, { 'set-cookie': clearCookie(config) });
  });

  /* What it holds, said in one phrase by the thing that is actually running rather than only by a
     document. It is no longer "identity only" — the vetting module holds workforce evidence — and it
     is still no health information, which is the half that decides which controls apply. */
  routes.set('GET /health', (_req, res) => send(res, 200, { ok: true, environment: config.environment, holds: 'identity and workforce vetting, no health information' }));
  /* The audit chain's own integrity, for the health check that runs every five minutes. It returns
     whether the chain follows and where it stops following — never an entry, and never a value. */
  routes.set('GET /health/audit', (_req, res) => {
    if (!protection) return send(res, 200, { configured: false, note: 'No protection keys are configured, so there is no chain to verify.' });
    send(res, 200, { configured: true, ...protection.audit.verify() });
  });

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    const allowed = origin !== undefined && config.allowedOrigins.includes(origin);
    if (allowed) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!allowed) return send(res, 403, { error: 'origin-not-allowed' });
      res.writeHead(204, { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
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
    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      handler(req, res, body, caller);
    } catch (error) {
      send(res, 400, { error: error instanceof Error && error.message === 'body too large' ? 'body-too-large' : 'invalid-request' });
    }
  };
}
export function start(config = loadConfig()) {
  const store = openStore(config.databasePath);
  const server = createServer(createApp(config, store));
  server.listen(config.port, () => {
    console.log(`MyThuso identity and vetting service on :${config.port} (${config.environment}) — holds no health information`);
    if (config.returnCodesInResponse) console.log('Development mode: one-time codes are returned in the response. This is refused in production.');
  });
  return { server, store };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) start();
