import { test, describe, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { openStore } from '../src/store.ts';
import { loadConfig } from '../src/config.ts';
import { STEP_SECONDS, totp } from '../src/totp.ts';
import { GRACE_DAYS } from '../src/erasure.ts';

const ORIGIN = 'http://localhost:5173';
const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'a'.repeat(40),
  MYTHUSO_ENCRYPTION_KEY: randomBytes(32).toString('hex')
} as NodeJS.ProcessEnv);

/** A whole service, its own database, and a clock the test can move. */
async function service(t: TestContext) {
  let clock = Date.UTC(2026, 8, 6, 9, 0, 0);
  const store = openStore(':memory:');
  const server = createServer(createApp(config, store, () => clock));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const call = async (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers ?? {}) }
    });
    return { status: response.status, headers: response.headers, body: await response.json() as Record<string, string & Record<string, unknown>> };
  };
  const post = (path: string, body: unknown, cookie?: string) => call(path, { method: 'POST', body: JSON.stringify(body ?? {}), cookie });
  const signIn = async (phone = '0821234567') => {
    const started = await post('/auth/start', { phone });
    const verified = await post('/auth/verify', { challengeId: started.body.challengeId, code: started.body.developmentCode });
    return { verified, cookie: (verified.headers.get('set-cookie') ?? '').split(';')[0]! };
  };
  /* Registered with the test rather than called at the end of it, so a failed assertion does not
     leave a listening server behind — and closeAllConnections first, because fetch keeps its
     sockets alive and a server waiting politely for them is a run that never finishes. */
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); });
  return { base, call, post, signIn, store, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

/** Enrol as a person would: ask for a secret, then prove the app is showing the right code. */
async function enrol(s: Awaited<ReturnType<typeof service>>, cookie: string) {
  const begun = await s.post('/account/second-factor/begin', {}, cookie);
  assert.equal(begun.status, 200);
  const secret = begun.body.secret as unknown as string;
  const confirmed = await s.post('/account/second-factor/confirm', { code: totp(secret, s.now()) }, cookie);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  s.advance(STEP_SECONDS * 1000);                       // that code is spent, as every code is
  return { secret, recoveryCodes: confirmed.body.recoveryCodes as unknown as string[] };
}

describe('the name', () => {
  test('is set through the session and comes back readable', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const set = await s.post('/account/name', { name: 'Nomsa Dlamini' }, cookie);
    assert.equal(set.status, 200);
    assert.equal(set.body.person.name, 'Nomsa Dlamini');
    const session = await s.call('/auth/session', { cookie });
    assert.equal(session.body.person.name, 'Nomsa Dlamini');
  });
  test('cannot be set without a session', async t => {
    const s = await service(t);
    assert.equal((await s.post('/account/name', { name: 'Somebody Else' })).status, 401);
  });
});

describe('what MyThuso says it holds', () => {
  test('the register and the thirty-day clock are readable by the person they are about', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const answer = await s.call('/account/data', { cookie });
    assert.equal(answer.status, 200);
    assert.match(answer.body.holds as unknown as string, /holds no health information/);
    assert.equal(answer.body.responseDays as unknown as number, 30);
    assert.ok((answer.body.holdings as unknown as unknown[]).length > 0);
  });
});

describe('signing in when a second factor is enrolled', () => {
  test('the one-time code alone does not set a session cookie', async t => {
    const s = await service(t);
    const first = await s.signIn();
    const { secret } = await enrol(s, first.cookie);
    const started = await s.post('/auth/start', { phone: '0821234567' });
    const verified = await s.post('/auth/verify', { challengeId: started.body.challengeId, code: started.body.developmentCode });
    assert.equal(verified.status, 200);
    assert.equal(verified.headers.get('set-cookie'), null, 'a half-finished sign-in must not carry a session');
    assert.equal(verified.body.secondFactorRequired as unknown as boolean, true);
    assert.equal(verified.body.person, undefined);

    const completed = await s.post('/auth/second-factor', { challengeToken: verified.body.challengeToken, code: totp(secret, s.now()) });
    assert.equal(completed.status, 200);
    const cookie = (completed.headers.get('set-cookie') ?? '').split(';')[0]!;
    assert.match(cookie, /^mythuso_session=/);
    assert.equal((await s.call('/auth/session', { cookie })).status, 200);
  });
  test('the wrong code is refused and the challenge token is not a session', async t => {
    const s = await service(t);
    const first = await s.signIn();
    await enrol(s, first.cookie);
    const started = await s.post('/auth/start', { phone: '0821234567' });
    const verified = await s.post('/auth/verify', { challengeId: started.body.challengeId, code: started.body.developmentCode });
    const refused = await s.post('/auth/second-factor', { challengeToken: verified.body.challengeToken, code: '000000' });
    assert.equal(refused.status, 401);
    assert.equal((await s.call('/auth/session', { cookie: `mythuso_session=${verified.body.challengeToken}` })).status, 401);
  });
});

describe('never demand what cannot be answered', () => {
  /* The 2026-08-29 lockout in BIDZA-TEST-LOGINS.txt: step-up was demanded from an account with no
     second factor enrolled, and the account bricked itself after a correct sign-in. */
  test('an account with no second factor is not asked for a code it does not have', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const requested = await s.post('/account/erasure', {}, cookie);
    assert.equal(requested.status, 200, 'an unanswerable demand is an outage, not a control');
    assert.equal(requested.body.eraseAfter as unknown as number, (requested.body.requestedAt as unknown as number) + GRACE_DAYS * 86_400_000);
  });
  test('turning off a second factor nobody has is not a lockout either', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const response = await s.post('/account/second-factor/disable', {}, cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.confirmed as unknown as boolean, false);
  });
  test('an account that does have one is asked, and told why', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const { secret } = await enrol(s, cookie);
    const withoutCode = await s.post('/account/erasure', {}, cookie);
    assert.equal(withoutCode.status, 401);
    assert.equal(withoutCode.body.error, 'second-factor-required');
    assert.match(withoutCode.body.message as unknown as string, /picked up your signed-in phone/);

    const withCode = await s.post('/account/erasure', { code: totp(secret, s.now()) }, cookie);
    assert.equal(withCode.status, 200);
  });
  test('guessing at a step-up is stopped, and stops by itself', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const { secret } = await enrol(s, cookie);
    for (let attempt = 0; attempt < 6; attempt++) {
      assert.equal((await s.post('/account/erasure', { code: '000000' }, cookie)).status, 401, `attempt ${attempt}`);
    }
    const burned = await s.post('/account/erasure', { code: totp(secret, s.now()) }, cookie);
    assert.equal(burned.status, 429, 'a million six-digit codes must not be walkable from one session');
    /* Fifteen minutes, and then the account is its own way back in. Nobody has to ring anyone. */
    s.advance(16 * 60 * 1000);
    assert.equal((await s.post('/account/erasure', { code: totp(secret, s.now()) }, cookie)).status, 200);
  });
  test('a second factor cannot be removed without one', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    const { secret } = await enrol(s, cookie);
    assert.equal((await s.post('/account/second-factor/disable', { code: '000000' }, cookie)).status, 401);
    assert.equal((await s.call('/account/second-factor', { cookie })).body.confirmed as unknown as boolean, true);
    const removed = await s.post('/account/second-factor/disable', { code: totp(secret, s.now()) }, cookie);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.enrolled as unknown as boolean, false);
  });
});

describe('erasure over the wire', () => {
  test('the request signs every device out, and can be undone by signing in again', async t => {
    const s = await service(t);
    const { cookie } = await s.signIn();
    await s.post('/account/erasure', {}, cookie);
    assert.equal((await s.call('/auth/session', { cookie })).status, 401, 'asking to be erased signs you out');
    const back = await s.signIn();
    const session = await s.call('/auth/session', { cookie: back.cookie });
    assert.equal((session.body.erasure as unknown as { eraseAfter: number }).eraseAfter > 0, true, 'the pending erasure is visible');
    assert.equal((await s.post('/account/erasure/cancel', {}, back.cookie)).body.cancelled as unknown as boolean, true);
    assert.equal((await s.call('/auth/session', { cookie: back.cookie })).body.erasure, undefined);
  });
});
