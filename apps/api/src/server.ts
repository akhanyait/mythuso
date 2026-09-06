import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig, limits, type Config } from './config.ts';
import { openStore, type Store } from './store.ts';
import { Identity, type Caller } from './identity.ts';

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
  const identity = new Identity(store, config, now);
  const routes = new Map<string, Handler>();

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
    send(res, 200, { person: result.person, expiresAt: result.expiresAt }, { 'set-cookie': sessionCookie(result.token, config) });
  });

  routes.set('GET /auth/session', (req, res) => {
    const resolved = identity.resolve(readCookie(req.headers.cookie, COOKIE));
    if (!resolved) return send(res, 401, { error: 'no-session' });
    send(res, 200, { person: resolved.person });
  });

  routes.set('POST /auth/logout', (req, res, _body, caller) => {
    identity.logout(readCookie(req.headers.cookie, COOKIE), caller);
    send(res, 200, { ok: true }, { 'set-cookie': clearCookie(config) });
  });

  routes.set('GET /health', (_req, res) => send(res, 200, { ok: true, environment: config.environment, holds: 'identity only' }));

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
    console.log(`MyThuso identity service on :${config.port} (${config.environment}) — holds identity only, no health information`);
    if (config.returnCodesInResponse) console.log('Development mode: one-time codes are returned in the response. This is refused in production.');
  });
  return { server, store };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) start();
