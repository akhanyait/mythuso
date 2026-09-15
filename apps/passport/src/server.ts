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
 *     and refuses where the environment names anything but development (src/config.ts) — and
 *     createPassport() asks the same questions, so importing this file does not skip them;
 *   · it binds to the loopback, refuses a request that did not arrive on it, and refuses a request
 *     whose Host is not a loopback name, because a browser tricked by DNS rebinding connects from the
 *     loopback address carrying somebody else's hostname;
 *   · it accepts no name, identity number, phone number or address, and mints its own subject tokens;
 *   · scripts/check-boundaries.mjs fails the build if deploy/ — nginx, systemd, deploy.sh — names this
 *     service or its port, so there is no deployment path to take by accident.
 * When the DPIA is signed, that last check is the one to change, deliberately, with the reason.
 *
 * Every refusal this file decides — not on the loopback, a body it cannot read, no requester, no such
 * route — is written into the audit chain through the gateway, like every refusal the gateway decides.
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
import { PassportRefusedToStart, loadPassportConfig } from './config.ts';
import { GATEWAY } from './contract.ts';
import { PassportGateway, type Answer, type Requester } from './gateway.ts';
import { PassportStore } from './store.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTS = new Set(GATEWAY.service.loopbackHosts);
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

/* An HL7 answer: the acknowledgement on an acceptance, and on a refusal beside the sentence every refusal carries. */
const answerHl7 = (res: ServerResponse, result: ReturnType<PassportGateway['receiveHl7']>) => {
 if (!result.ok) return send(res, result.status, { error: 'refused', message: result.reason, acknowledgementCode: result.acknowledgementCode, acknowledgement: result.acknowledgement, replayed: result.replayed });
 return send(res, 200, { acknowledgementCode: result.acknowledgementCode, acknowledgement: result.acknowledgement, replayed: result.replayed });
};

/* The name in a Host header without its port: "[::1]:8797" is ::1, "localhost:8797" is localhost. */
export function hostName(header: string | undefined): string {
 const value = (header ?? '').trim().toLowerCase();
 if (value.startsWith('[')) return value.slice(1, value.indexOf(']') > 0 ? value.indexOf(']') : undefined);
 return value.split(':')[0] ?? '';
}

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

/* Who is asking comes off the Authorization header and nowhere else: "Patient <session>",
   "Grant <artefact>" or, for break-glass, "Operator <credential>", with the purpose of use in its own
   header. A body can name a subject; it can never name a requester. */
function authorisation(req: IncomingMessage): { scheme: string; token: string } {
 const [scheme = '', token = '', extra] = (req.headers.authorization ?? '').split(' ');
 return extra === undefined ? { scheme, token } : { scheme: '', token: '' };
}
function requesterOf(req: IncomingMessage): Requester | null {
 const { scheme, token } = authorisation(req);
 if (scheme === 'Patient' && token) return { kind: 'patient', session: token };
 if (scheme === 'Grant' && token) return { kind: 'grant', artefact: token, purpose: String(req.headers['x-purpose-of-use'] ?? '') };
 return null;
}
const tokenFor = (req: IncomingMessage, scheme: string): string => {
 const held = authorisation(req);
 return held.scheme === scheme ? held.token : '';
};

/* The route as written in the audit chain: the path's shape, never an id or a query string. */
const routeOf = (method: string, pathname: string): string =>
 `${method} ${pathname.replace(/^\/fhir\/([A-Za-z]+)\/[^/]+$/, '/fhir/$1/:id').slice(0, 64)}`;

/**
 * The service, built only from an environment that passes every start-up refusal. There is no
 * overload that takes a configuration or a key directly: a test that wants a Passport sets the
 * development flag and a key of its own, exactly as a person running it would.
 */
export function createPassport(env: NodeJS.ProcessEnv, now?: () => number) {
 const config = loadPassportConfig(env);
 const store = new PassportStore(config.databasePath);
 const gateway = new PassportGateway({ config, store, ...(now ? { now } : {}) });
 const refuse = (res: ServerResponse, status: number, id: string, route: string) => answer(res, gateway.refuseRequest(status, id, route));

 async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const route = routeOf(method, url.pathname);
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '') || !LOOPBACK_HOSTS.has(hostName(req.headers.host))) return refuse(res, 403, 'not-loopback', route);
  const parts = url.pathname.split('/').filter(Boolean);
  const body = method === 'POST' ? await bodyOf(req) : {};
  if (body === null) return refuse(res, 400, 'unreadable-body', route);

  /* Two things are required to create a synthetic subject, and they are different things: the
     development flag, which createPassport() has already demanded before this route exists at all,
     and a developer credential on the request — "Developer <token>", minted at the console with
     node apps/passport/src/operator.ts developer, a development-only stand-in for an authenticated
     person. Without the credential the request is refused and audited; the loopback alone creates
     nobody. */
  if (method === 'POST' && url.pathname === '/dev/subjects') return answer(res, gateway.createSubject(tokenFor(req, 'Developer')), 201);
  if (method === 'POST' && url.pathname === '/session/end') return answer(res, gateway.endSession(tokenFor(req, 'Patient')));
  if (method === 'POST' && url.pathname === '/consent/grant') return answer(res, gateway.grant(tokenFor(req, 'Patient'), body as never), 201);
  if (method === 'POST' && url.pathname === '/consent/revoke') return answer(res, gateway.revoke(tokenFor(req, 'Patient'), String(body.grantId ?? '')));
  if (method === 'POST' && url.pathname === '/consent/check') {
   const requester = requesterOf(req);
   if (requester?.kind !== 'grant') return refuse(res, 401, 'no-grant', route);
   return answer(res, gateway.check(requester.artefact, requester.purpose, String(body.category ?? '')));
  }
  if (method === 'GET' && url.pathname === '/audit/mine') return answer(res, gateway.auditMine(tokenFor(req, 'Patient')));
  /* Passport P1. A share link is made and revoked in the patient's own session. It is opened with
     "Link <secret>" on the Authorization header — never in the address, where a secret ends up in every
     log and history between here and the person holding it — and the idempotency key in the body, so a
     retry is the same use. The export is the patient's own record, in their own session. */
  if (method === 'POST' && url.pathname === '/share/link') return answer(res, gateway.createLink(tokenFor(req, 'Patient'), body as never), 201);
  if (method === 'POST' && url.pathname === '/share/link/open') return answer(res, gateway.openLink(tokenFor(req, 'Link'), String(body.idempotencyKey ?? '')));
  if (method === 'POST' && url.pathname === '/share/link/revoke') return answer(res, gateway.revokeLink(tokenFor(req, 'Patient'), String(body.linkRef ?? '')));
  if (method === 'POST' && url.pathname === '/export') return answer(res, gateway.exportRecord(tokenFor(req, 'Patient'), body as never));
  /* The HL7 v2 bridge, §26's POST /hl7v2/inbound, in development only. A developer holding a credential minted at
     the console sends a registered synthetic partner's message as JSON over this loopback; which partner it is comes
     from the message, never the credential. There is no MLLP listener and never a TCP socket of its own: no partner
     is connected, nothing here checks a certificate, and the Passport has no network path to be reached by. Every
     answer, refused or not, carries the HL7 acknowledgement. A patient links the hospital number a message is
     matched on in their own session, and a developer reads the quarantine, which holds nothing a message said. */
  if (method === 'POST' && url.pathname === '/hl7v2/inbound') return answerHl7(res, gateway.receiveHl7(tokenFor(req, 'Developer'), body as never));
  if (method === 'GET' && url.pathname === '/hl7v2/quarantine') return answer(res, gateway.hl7Quarantine(tokenFor(req, 'Developer')));
  if (method === 'POST' && url.pathname === '/identifiers/link') return answer(res, gateway.linkIdentifier(tokenFor(req, 'Patient'), body as never), 201);
  if (method === 'POST' && url.pathname === '/breakglass') {
   return answer(res, gateway.breakGlass({
    credential: tokenFor(req, 'Operator'), subject: String(body.subject ?? ''),
    reasonCode: String(body.reasonCode ?? ''), note: String(body.note ?? '')
   }));
  }
  if (parts[0] === 'fhir' || url.pathname === '/summary/emergency') {
   const requester = requesterOf(req);
   if (!requester) return refuse(res, 401, 'no-grant', route);
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
  return refuse(res, 404, 'no-route', route);
 }

 return {
  config, store, gateway,
  handle: (req: IncomingMessage, res: ServerResponse) => { handle(req, res).catch(() => send(res, 500, { error: 'failed' })); },
  close: () => store.close()
 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 let passport: ReturnType<typeof createPassport>;
 try {
  passport = createPassport(process.env);
 } catch (error) {
  if (error instanceof PassportRefusedToStart) {
   process.stderr.write(`${error.message}\n`);
   process.exit(1);
  }
  throw error;
 }
 const config = passport.config;
 const server = createServer(passport.handle);
 server.requestTimeout = 10_000;
 server.headersTimeout = 5_000;
 server.listen(config.port, config.host, () => {
  process.stdout.write(`Health Passport P0 on http://${config.host}:${config.port} — development only, synthetic data only.\n`);
 });
}
