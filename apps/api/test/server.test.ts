import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { openStore, type Store } from '../src/store.ts';
import { ConfigError, loadConfig } from '../src/config.ts';

const ORIGIN = 'http://localhost:5173';
const config = loadConfig({ MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'y'.repeat(40) } as NodeJS.ProcessEnv);
let server: Server, store: Store, base: string;
before(async () => {
  store = openStore(':memory:');
  server = createServer(createApp(config, store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(() => { server.close(); store.close(); });

const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'content-type': 'application/json', origin: ORIGIN, ...(init.headers ?? {}) }
});
async function signIn() {
  const started = await call('/auth/start', { method: 'POST', body: JSON.stringify({ phone: '0821112222' }) });
  const { challengeId, developmentCode } = await started.json() as { challengeId: string; developmentCode: string };
  const verified = await call('/auth/verify', { method: 'POST', body: JSON.stringify({ challengeId, code: developmentCode }) });
  const cookie = verified.headers.get('set-cookie') ?? '';
  return { verified, cookie, token: cookie.split(';')[0] };
}

describe('the endpoint surface', () => {
  test('health says what the service holds', async () => {
    const body = await (await call('/health')).json();
    assert.deepEqual(body, { ok: true, environment: 'development', holds: 'identity and workforce vetting, no health information' });
  });
  test('an unknown route is a 404, not a stack trace', async () => {
    const response = await call('/admin/secrets');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not-found' });
  });
  test('a malformed body is refused cleanly', async () => {
    const response = await call('/auth/start', { method: 'POST', body: '{not json' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid-request' });
  });
  test('an oversized body is refused rather than buffered', async () => {
    const response = await call('/auth/start', { method: 'POST', body: JSON.stringify({ phone: 'x'.repeat(20000) }) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'body-too-large' });
  });
  test('a bad number gets a message a person can act on', async () => {
    const response = await call('/auth/start', { method: 'POST', body: JSON.stringify({ phone: '123' }) });
    assert.equal(response.status, 400);
    const body = await response.json() as { message: string };
    assert.match(body.message, /10-digit South African mobile number/);
  });
});

describe('the session cookie', () => {
  test('signing in sets an HttpOnly, SameSite=Strict cookie and returns the person', async () => {
    const { verified, cookie } = await signIn();
    assert.equal(verified.status, 200);
    assert.match(cookie, /^mythuso_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    const body = await verified.json() as { person: { phone: string } };
    assert.equal(body.person.phone, '+27821112222');
  });
  test('the token is never in the body, only in the cookie', async () => {
    const { verified, token } = await signIn();
    const raw = JSON.stringify(await verified.json());
    assert.ok(!raw.includes(token.split('=')[1]), 'a token in the body would be readable by any script');
  });
  test('the cookie identifies the person on the next request', async () => {
    const { token } = await signIn();
    const response = await call('/auth/session', { headers: { cookie: token } });
    assert.equal(response.status, 200);
    const body = await response.json() as { person: { phone: string } };
    assert.equal(body.person.phone, '+27821112222');
  });
  test('without a cookie there is no session', async () => {
    assert.equal((await call('/auth/session')).status, 401);
  });
  test('logging out clears the cookie and the session', async () => {
    const { token } = await signIn();
    const out = await call('/auth/logout', { method: 'POST', headers: { cookie: token } });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal((await call('/auth/session', { headers: { cookie: token } })).status, 401);
  });
});

describe('cross-site requests', () => {
  test('another site cannot spend a session', async () => {
    const { token } = await signIn();
    const response = await fetch(`${base}/auth/logout`, {
      method: 'POST', headers: { origin: 'https://not-mythuso.example', cookie: token }
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'origin-not-allowed' });
    assert.equal((await call('/auth/session', { headers: { cookie: token } })).status, 200, 'the session survived the attempt');
  });
  test('a preflight from an unknown origin is refused', async () => {
    const response = await fetch(`${base}/auth/start`, { method: 'OPTIONS', headers: { origin: 'https://not-mythuso.example' } });
    assert.equal(response.status, 403);
  });
  test('our own origin is allowed with credentials', async () => {
    const response = await fetch(`${base}/auth/start`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  });
});

describe('responses do not leak', () => {
  test('nothing is cached or sniffed', async () => {
    const response = await call('/health');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });
});

describe('what production refuses to start with', () => {
  const base = { MYTHUSO_ENV: 'production', MYTHUSO_AUTH_PEPPER: 'z'.repeat(40), MYTHUSO_SMS_PROVIDER: 'clickatell', MYTHUSO_ALLOWED_ORIGINS: 'https://app.mythuso.co.za' };
  const refuses = (env: Record<string, string | undefined>, expected: RegExp) =>
    assert.throws(() => loadConfig({ ...base, ...env } as NodeJS.ProcessEnv), (error: unknown) => error instanceof ConfigError && expected.test(error.message));
  test('a weak or missing pepper', () => refuses({ MYTHUSO_AUTH_PEPPER: 'short' }, /PEPPER/));
  test('handing out one-time codes in the response', () => refuses({ MYTHUSO_RETURN_CODES: 'true' }, /one-time codes/));
  test('no way to actually deliver a code', () => refuses({ MYTHUSO_SMS_PROVIDER: undefined }, /SMS_PROVIDER/));
  test('an origin served over http', () => refuses({ MYTHUSO_ALLOWED_ORIGINS: 'http://app.mythuso.co.za' }, /https/));
  test('a correctly configured production starts, and will not echo codes', () => {
    const config = loadConfig(base as NodeJS.ProcessEnv);
    assert.equal(config.returnCodesInResponse, false);
    assert.equal(config.cookieSecure, true);
  });
});
