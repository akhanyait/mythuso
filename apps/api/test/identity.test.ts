import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Identity, normalisePhone } from '../src/identity.ts';
import { openStore } from '../src/store.ts';
import { loadConfig, limits } from '../src/config.ts';

const config = loadConfig({ MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'x'.repeat(40) } as NodeJS.ProcessEnv);
const caller = { address: '10.0.0.1', agent: 'test' };
function harness() {
  let clock = Date.UTC(2026, 8, 6, 9, 0, 0);
  const store = openStore(':memory:');
  return { store, identity: new Identity(store, config, () => clock), advance: (ms: number) => { clock += ms; }, at: () => clock };
}
async function signIn(h: ReturnType<typeof harness>, phone = '0821234567') {
  const started = h.identity.start(phone, caller);
  assert.ok(started.ok && started.code);
  const verified = h.identity.verify(started.challengeId, started.code!, caller);
  /* Every account in this file signs in with the one-time code alone. The accounts that owe a
     second factor are exercised in two-factor.test.ts, where the challenge is the point. */
  assert.ok(verified.ok && verified.step === 'signed-in');
  return verified;
}

describe('phone numbers', () => {
  test('accepts the ways South Africans actually type a number', () => {
    for (const input of ['0821234567', '082 123 4567', '+27 82 123 4567', '2782 123 4567', '082-123-4567']) {
      assert.equal(normalisePhone(input), '+27821234567', input);
    }
  });
  test('refuses what is not a mobile number', () => {
    for (const input of ['012 345 6789', '08212345', '0821234567890', 'not a number', '']) {
      assert.equal(normalisePhone(input), null, input);
    }
  });
});

describe('signing in', () => {
  test('a correct code creates the person and a session', async () => {
    const h = harness();
    const result = await signIn(h);
    assert.ok(result.ok);
    assert.equal(result.person.phone, '+27821234567');
    assert.deepEqual(h.identity.resolve(result.token)?.person.id, result.person.id);
  });
  test('signing in twice reuses the same person', async () => {
    const h = harness();
    const first = await signIn(h);
    const second = await signIn(h);
    assert.ok(first.ok && second.ok);
    assert.equal(first.person.id, second.person.id);
  });
  test('a wrong code is refused and counted', () => {
    const h = harness();
    const started = h.identity.start('0821234567', caller);
    assert.ok(started.ok);
    const wrong = h.identity.verify(started.challengeId, '000000', caller);
    assert.deepEqual(wrong, { ok: false, reason: 'wrong-code' });
    assert.equal(h.store.findChallenge(started.challengeId)?.attempts, 1);
  });
  test('the challenge burns after too many attempts, even if the next code is right', () => {
    const h = harness();
    const started = h.identity.start('0821234567', caller);
    assert.ok(started.ok && started.code);
    for (let i = 0; i < limits.maxCodeAttempts; i++) h.identity.verify(started.challengeId, '000001', caller);
    const withRightCode = h.identity.verify(started.challengeId, started.code!, caller);
    assert.deepEqual(withRightCode, { ok: false, reason: 'too-many-attempts' });
  });
  test('a code expires', () => {
    const h = harness();
    const started = h.identity.start('0821234567', caller);
    assert.ok(started.ok && started.code);
    h.advance((limits.codeTtlSeconds + 1) * 1000);
    assert.deepEqual(h.identity.verify(started.challengeId, started.code!, caller), { ok: false, reason: 'expired' });
  });
  test('a code cannot be spent twice', async () => {
    const h = harness();
    const started = h.identity.start('0821234567', caller);
    assert.ok(started.ok && started.code);
    assert.ok(h.identity.verify(started.challengeId, started.code!, caller).ok);
    assert.deepEqual(h.identity.verify(started.challengeId, started.code!, caller), { ok: false, reason: 'unknown-challenge' });
  });
});

describe('resisting abuse', () => {
  test('one number cannot be flooded with codes', () => {
    const h = harness();
    for (let i = 0; i < limits.startsPerPhonePerWindow; i++) assert.ok(h.identity.start('0821234567', caller).ok);
    const blocked = h.identity.start('0821234567', caller);
    assert.deepEqual(blocked, { ok: false, reason: 'rate-limited', retryAfter: limits.rateWindowSeconds });
  });
  test('the limit lifts once the window passes', () => {
    const h = harness();
    for (let i = 0; i < limits.startsPerPhonePerWindow; i++) h.identity.start('0821234567', caller);
    h.advance((limits.rateWindowSeconds + 1) * 1000);
    assert.ok(h.identity.start('0821234567', caller).ok);
  });
  test('one address cannot walk through a list of numbers', () => {
    const h = harness();
    for (let i = 0; i < limits.startsPerAddressPerWindow; i++) {
      h.identity.start(`08212${String(i).padStart(5, '0')}`, caller);
    }
    assert.equal(h.identity.start('0839999999', caller).ok, false);
  });
  test('a known and an unknown number are answered identically', async () => {
    const h = harness();
    await signIn(h, '0821234567');
    const known = h.identity.start('0821234567', { address: '10.0.0.2', agent: 'test' });
    const unknown = h.identity.start('0839876543', { address: '10.0.0.3', agent: 'test' });
    assert.ok(known.ok && unknown.ok);
    assert.deepEqual(Object.keys(known).sort(), Object.keys(unknown).sort());
  });
});

describe('sessions', () => {
  test('an unknown token resolves to nobody', () => {
    const h = harness();
    assert.equal(h.identity.resolve('not-a-real-token'), null);
    assert.equal(h.identity.resolve(null), null);
  });
  test('logging out invalidates the session immediately', async () => {
    const h = harness();
    const result = await signIn(h);
    assert.ok(result.ok);
    assert.equal(h.identity.logout(result.token, caller), true);
    assert.equal(h.identity.resolve(result.token), null);
  });
  test('sitting idle expires the session', async () => {
    const h = harness();
    const result = await signIn(h);
    assert.ok(result.ok);
    h.advance((limits.sessionIdleSeconds + 1) * 1000);
    assert.equal(h.identity.resolve(result.token), null);
  });
  test('staying active slides the idle window but not past the absolute limit', async () => {
    const h = harness();
    const result = await signIn(h);
    assert.ok(result.ok);
    for (let i = 0; i < 20; i++) {                       // active every 20 minutes for over 6 hours
      h.advance(20 * 60 * 1000);
      assert.ok(h.identity.resolve(result.token), `still signed in at step ${i}`);
    }
    h.advance(limits.sessionAbsoluteSeconds * 1000);
    assert.equal(h.identity.resolve(result.token), null, 'the absolute limit ends it regardless of activity');
  });
});

describe('what is written down', () => {
  test('neither the code nor the session token is stored in the clear', () => {
    const database = new DatabaseSync(':memory:');
    database.close();
    const h = harness();
    const started = h.identity.start('0821234567', caller);
    assert.ok(started.ok && started.code);
    const stored = h.store.findChallenge(started.challengeId);
    assert.ok(stored);
    assert.notEqual(stored.codeHash, started.code);
    assert.ok(!stored.codeHash.includes(started.code!), 'the code must not be recoverable from the row');
    const verified = h.identity.verify(started.challengeId, started.code!, caller);
    assert.ok(verified.ok && verified.step === 'signed-in');
    assert.equal(h.store.findSessionByTokenHash(verified.token), null, 'the raw token is not a key into the table');
  });
  test('every step leaves an audit trail', async () => {
    const h = harness();
    const result = await signIn(h);
    assert.ok(result.ok);
    h.identity.logout(result.token, caller);
    const events = h.store.recentAudit(20).map(e => e.event);
    for (const expected of ['auth.start', 'person.created', 'auth.verify.success', 'auth.logout']) {
      assert.ok(events.includes(expected), `expected ${expected} in ${events.join(', ')}`);
    }
  });
  test('the audit keeps who and from where, but hashes the user agent', async () => {
    const h = harness();
    await signIn(h);
    const start = h.store.recentAudit(20).find(e => e.event === 'auth.start');
    assert.equal(start?.address, '10.0.0.1');
    assert.equal(start?.agentHash?.length, 16);
    assert.notEqual(start?.agentHash, 'test');
  });
});
