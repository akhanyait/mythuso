/**
 * Health Passport P0 — its own service, its own database, its own keys. DEVELOPMENT ONLY.
 *
 * ── Why this refuses to run anywhere real ────────────────────────────────────────────────────
 *
 * The master document is plain about the order: Verify and Passport foundations go live before the
 * first patient visit, and Passport P0's exit criteria include a signed DPIA and a governance board
 * sign-off. docs/PRIVACY-AND-SECURITY.md records that none of the controls that would let this hold a
 * real person's record exist: there is no data protection impact assessment, no registered
 * Information Officer, no decision on where the data may reside, no HSM or KMS behind the keys, no
 * OIDC or mutual TLS in front of the gateway, and no penetration test. A health record breach cannot
 * be undone — "you can re-issue a card number, you cannot re-issue someone's HIV status" (§16).
 *
 * So, until those exist:
 *   · the service refuses to start unless MYTHUSO_PASSPORT_DEVELOPMENT is set to synthetic-data-only,
 *     and refuses where the environment says production (src/config.ts);
 *   · it binds to the loopback and refuses any request that did not arrive on it;
 *   · it accepts no name, identity number, phone number or address, and mints its own subject tokens;
 *   · scripts/check-boundaries.mjs fails the build if deploy/ — nginx, systemd, deploy.sh — names this
 *     service or its port, so there is no deployment path to take by accident.
 * When the DPIA is signed, that last check is the one to change, deliberately, with the reason.
 *
 * ── What it is ───────────────────────────────────────────────────────────────────────────────
 *
 * Separate from apps/api in every way the master document asks (§16, §19): no import in either
 * direction, a different database file, a different key variable checked at start-up. A FHIR-R4-shaped
 * store for Patient (a token), Observation, AllergyIntolerance, MedicationStatement and Consent, with
 * Provenance on every write and AuditEvent on every access. Envelope encryption with per-subject data
 * keys and separate keys per sealed category. A consent gateway in front of every read, a hash-chained
 * audit log the patient can read, and break-glass that opens the emergency summary and nothing else.
 *
 * Zero dependencies: node:http, node:crypto, node:sqlite, node:test. Node's type-stripping, so no
 * constructor parameter properties, no enums and no namespaces.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { PassportRefusedToStart, loadPassportConfig, refusalOf, type PassportConfig } from './config.ts';
import { GATEWAY } from './contract.ts';
import { PassportGateway, type Answer, type Requester } from './gateway.ts';
import { PassportKeys } from './keys.ts';
import { PassportStore } from './store.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HEADERS = {
 'content-type': 'application/json; charset=utf-8',
 'cache-control': 'no-store',
 'x-content-type-options': 'nosniff',
 'referrer-policy': 'no-referrer',
 'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
};

const send = (res: ServerResponse, status: number, body: unknown) => {
 res.writeHead(status, HEADERS);
 res.end(JSON.stringify(body));
};
const answer = <T>(res: ServerResponse, result: Answer<T>, okStatus = 200) => {
 if (!result.ok) return send(res, result.status, { error: 'refused', message: result.reason });
 const { ok: _ok, ...rest } = result as { ok: true } & T;
 return send(res, okStatus, rest);
};

async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown> | null> {
 const chunks: Buffer[] = [];
 let size = 0;
 for await (const chunk of req) {
  size += (chunk as Buffer).length;
  if (size > GATEWAY.service.maxBodyBytes) return null;
  chunks.push(chunk as Buffer);
 }
 if (!chunks.length) return {};
 try {
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
 } catch { return null; }
}

/* Who is asking comes off the Authorization header and nowhere else: "Patient <session>" or
   "Grant <artefact>", with the purpose of use in its own header. A body can name a subject; it can
   never name a requester. */
function requesterOf(req: IncomingMessage): Requester | null {
 const header = req.headers.authorization ?? '';
 const [scheme, token] = header.split(' ');
 if (scheme === 'Patient' && token) return { kind: 'patient', session: token };
 if (scheme === 'Grant' && token) return { kind: 'grant', artefact: token, purpose: String(req.headers['x-purpose-of-use'] ?? '') };
 return null;
}
const sessionOf = (req: IncomingMessage): string => {
 const requester = requesterOf(req);
 return requester?.kind === 'patient' ? requester.session : '';
};

export function createPassport(config: Pick<PassportConfig, 'databasePath' | 'masterKey'>, now?: () => number) {
 const store = new PassportStore(config.databasePath);
 const keys = new PassportKeys(config.masterKey);
 const gateway = new PassportGateway({ store, keys, ...(now ? { now } : {}) });
 const noGrant = (res: ServerResponse) => send(res, 401, { error: 'refused', message: refusalOf('no-grant') });

 async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return send(res, 403, { error: 'refused', message: refusalOf('not-loopback') });
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method ?? 'GET';
  const body = method === 'POST' ? await bodyOf(req) : {};
  if (body === null) return send(res, 400, { error: 'unreadable', message: 'The body is not a JSON object this service will read.' });

  if (method === 'POST' && url.pathname === '/dev/subjects') return send(res, 201, gateway.createSubject());
  if (method === 'POST' && url.pathname === '/consent/grant') {
   return answer(res, gateway.grant(sessionOf(req), body as never), 201);
  }
  if (method === 'POST' && url.pathname === '/consent/revoke') return answer(res, gateway.revoke(sessionOf(req), String(body.grantId ?? '')));
  if (method === 'POST' && url.pathname === '/consent/check') {
   const requester = requesterOf(req);
   if (requester?.kind !== 'grant') return noGrant(res);
   return answer(res, gateway.check(requester.artefact, requester.purpose, String(body.category ?? '')));
  }
  if (method === 'GET' && url.pathname === '/audit/mine') return answer(res, gateway.auditMine(sessionOf(req)));
  if (method === 'POST' && url.pathname === '/breakglass') {
   return answer(res, gateway.breakGlass({
    subject: String(body.subject ?? ''), justification: String(body.justification ?? ''),
    requesterRole: String(body.requesterRole ?? ''), requesterRef: String(body.requesterRef ?? '')
   }));
  }
  if (parts[0] === 'fhir' || url.pathname === '/summary/emergency') {
   const requester = requesterOf(req);
   if (!requester) return noGrant(res);
   if (url.pathname === '/summary/emergency' && method === 'GET') return answer(res, gateway.emergencySummary(requester, url.searchParams.get('subject') ?? ''));
   if (method === 'POST' && parts.length === 2) {
    return answer(res, gateway.write(requester, {
     subject: String(body.subject ?? ''), resourceType: parts[1]!, category: String(body.category ?? ''),
     resource: (body.resource ?? {}) as Record<string, unknown>,
     provenance: (body.provenance ?? {}) as { activity?: unknown; sourceSystem?: unknown },
     markedPrivate: body.markedPrivate === true
    }), 201);
   }
   if (method === 'GET' && parts.length === 3) return answer(res, gateway.read(requester, parts[1]!, parts[2]!));
   if (method === 'GET' && parts.length === 2) return answer(res, gateway.search(requester, parts[1]!, url.searchParams.get('subject') ?? ''));
  }
  return send(res, 404, { error: 'no-route' });
 }

 return {
  store, gateway,
  handle: (req: IncomingMessage, res: ServerResponse) => { handle(req, res).catch(() => send(res, 500, { error: 'failed' })); },
  close: () => store.close()
 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 let config: PassportConfig;
 try {
  config = loadPassportConfig();
 } catch (error) {
  if (error instanceof PassportRefusedToStart) {
   process.stderr.write(`${error.message}\n`);
   process.exit(1);
  }
  throw error;
 }
 const passport = createPassport(config);
 const server = createServer(passport.handle);
 server.requestTimeout = 10_000;
 server.headersTimeout = 5_000;
 server.listen(config.port, config.host, () => {
  process.stdout.write(`Health Passport P0 on http://${config.host}:${config.port} — development only, synthetic data only.\n`);
 });
}
