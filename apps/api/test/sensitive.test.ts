import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DecryptionFailed, EncryptionUnavailable, isSealed, open, resetEncryptionKey, seal } from '../src/sensitive.ts';
import { ConfigError, loadConfig } from '../src/config.ts';
import { openStore } from '../src/store.ts';
import { Identity } from '../src/identity.ts';

const key = randomBytes(32).toString('hex');
const base = { MYTHUSO_AUTH_PEPPER: 'k'.repeat(40) };
const withKey = loadConfig({ ...base, MYTHUSO_ENV: 'development', MYTHUSO_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv);
const noKey = loadConfig({ ...base, MYTHUSO_ENV: 'development' } as NodeJS.ProcessEnv);
const production = loadConfig({
  ...base, MYTHUSO_ENV: 'production', MYTHUSO_SMS_PROVIDER: 'clickatell',
  MYTHUSO_ALLOWED_ORIGINS: 'https://app.mythuso.co.za',
  /* A production service also has to name an accountable Information Officer and hold the key ring
     the gate is built from — see the consent refusals in config.ts. Neither has anything to do with
     the envelope this file is about; they are here because a production config is a production
     config, and a test that quietly ran an incompletely configured one would be testing nothing. */
  MYTHUSO_INFORMATION_OFFICER: 'Information Officer, Akhanya IT Innovations',
  MYTHUSO_PROTECTION_KEYS: `1:${randomBytes(32).toString('hex')}`
} as NodeJS.ProcessEnv);

describe('the envelope', () => {
  test('what goes in comes back out', () => {
    for (const plain of ['Nomsa Dlamini', 'Ané van der Merwe', 'Sibongile', '한글', '']) {
      const sealed = seal(plain || 'x', withKey);
      assert.equal(open(sealed, withKey), plain || 'x');
    }
  });
  test('the same value sealed twice looks nothing like itself', () => {
    const first = seal('Nomsa Dlamini', withKey) as Uint8Array;
    const second = seal('Nomsa Dlamini', withKey) as Uint8Array;
    assert.notDeepEqual(Buffer.from(first), Buffer.from(second), 'a repeated IV under GCM gives away the plaintext');
    assert.equal(open(first, withKey), open(second, withKey));
  });
  test('the plaintext is nowhere in the stored bytes', () => {
    const sealed = Buffer.from(seal('Nomsa Dlamini', withKey) as Uint8Array);
    assert.ok(!sealed.toString('latin1').includes('Nomsa'));
    assert.ok(isSealed(sealed));
  });
  test('altered bytes fail to open rather than opening as something else', () => {
    const sealed = Buffer.from(seal('Nomsa Dlamini', withKey) as Uint8Array);
    sealed[sealed.length - 1] ^= 0x01;
    assert.throws(() => open(sealed, withKey), DecryptionFailed);
  });
  test('another key does not open it', () => {
    const sealed = seal('Nomsa Dlamini', withKey);
    const other = loadConfig({ ...base, MYTHUSO_ENV: 'development', MYTHUSO_ENCRYPTION_KEY: randomBytes(32).toString('hex') } as NodeJS.ProcessEnv);
    assert.throws(() => open(sealed, other), DecryptionFailed);
  });
});

describe('a database that existed before encryption did', () => {
  test('a value written as plain text still reads back unchanged', () => {
    /* The whole point of the magic prefix: introducing the key must not take anybody's account
       with it. */
    assert.equal(open('Nomsa Dlamini', withKey), 'Nomsa Dlamini');
    assert.equal(open(Buffer.from('Nomsa Dlamini', 'utf8'), withKey), 'Nomsa Dlamini');
    assert.equal(isSealed('Nomsa Dlamini'), false);
  });
  test('a plain value reads back even when there is no key at all', () => {
    assert.equal(open('Nomsa Dlamini', noKey), 'Nomsa Dlamini');
  });
  test('nothing is there when nothing was stored', () => {
    assert.equal(open(null, withKey), null);
  });
});

describe('when the key is missing', () => {
  test('production refuses the write rather than storing it in the clear', () => {
    assert.throws(() => seal('Nomsa Dlamini', production), EncryptionUnavailable);
  });
  test('a development laptop may store it, loudly', () => {
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
    try { assert.equal(seal('Nomsa Dlamini', noKey), 'Nomsa Dlamini'); }
    finally { console.warn = warn; }
    assert.match(warnings.join(' '), /refused in production/);
  });
  test('a required value is refused even on a laptop', () => {
    /* A second-factor secret. Storing one readable is a second factor in name only. */
    assert.throws(() => seal('JBSWY3DPEHPK3PXP', noKey, { required: true, label: 'a second-factor secret' }), EncryptionUnavailable);
  });
  test('a sealed value with no key says which of the two is missing', () => {
    const sealed = seal('Nomsa Dlamini', withKey);
    resetEncryptionKey();
    assert.throws(() => open(sealed, noKey), (error: unknown) =>
      error instanceof EncryptionUnavailable && /the key is missing/.test(error.message));
  });
});

describe('the key itself', () => {
  test('hex and base64 are both accepted', () => {
    const raw = randomBytes(32);
    for (const encoded of [raw.toString('hex'), raw.toString('base64')]) {
      const config = loadConfig({ ...base, MYTHUSO_ENV: 'development', MYTHUSO_ENCRYPTION_KEY: encoded } as NodeJS.ProcessEnv);
      assert.equal(open(seal('Nomsa', config), config), 'Nomsa');
    }
  });
  test('a key of the wrong size is a service that will not start', () => {
    assert.throws(() => loadConfig({ ...base, MYTHUSO_ENV: 'development', MYTHUSO_ENCRYPTION_KEY: 'abcd' } as NodeJS.ProcessEnv), ConfigError);
  });
});

describe('the name on a real account', () => {
  const signIn = (config = withKey) => {
    const store = openStore(':memory:');
    const identity = new Identity(store, config);
    const started = identity.start('0821234567', { address: '10.0.0.1', agent: 'test' });
    assert.ok(started.ok && started.code);
    const verified = identity.verify(started.challengeId, started.code, { address: '10.0.0.1', agent: 'test' });
    assert.ok(verified.ok && verified.step === 'signed-in');
    return { store, identity, personId: verified.person.id };
  };

  test('it is sealed in the row and plain in the response', () => {
    const { store, identity, personId } = signIn();
    const set = identity.setName(personId, 'Nomsa Dlamini');
    assert.ok(set.ok);
    assert.equal(set.person.name, 'Nomsa Dlamini');
    const row = store.findPersonById(personId);
    assert.ok(row && row.name instanceof Uint8Array, 'the name must not be sitting in the file as text');
    assert.ok(!Buffer.from(row.name as Uint8Array).toString('latin1').includes('Nomsa'));
    assert.equal(identity.resolve(null), null);
    store.close();
  });
  test('a name written before the key existed still reads back', () => {
    const { store, identity, personId } = signIn();
    store.setPersonName(personId, 'Nomsa Dlamini');            // exactly what an older row holds
    const started = identity.start('0821234567', { address: '10.0.0.1', agent: 'test' });
    assert.ok(started.ok && started.code);
    const again = identity.verify(started.challengeId, started.code, { address: '10.0.0.1', agent: 'test' });
    assert.ok(again.ok && again.step === 'signed-in');
    assert.equal(again.person.name, 'Nomsa Dlamini');
    store.close();
  });
  test('a name that cannot be opened does not lock the person out of their account', () => {
    const { store, identity, personId } = signIn();
    identity.setName(personId, 'Nomsa Dlamini');
    const row = store.findPersonById(personId)!;
    const damaged = Buffer.from(row.name as Uint8Array);
    damaged[damaged.length - 1] ^= 0x01;
    store.setPersonName(personId, damaged);
    const error = console.error;
    console.error = () => {};
    try {
      const started = identity.start('0821234567', { address: '10.0.0.1', agent: 'test' });
      assert.ok(started.ok && started.code);
      const again = identity.verify(started.challengeId, started.code, { address: '10.0.0.1', agent: 'test' });
      assert.ok(again.ok && again.step === 'signed-in', 'a damaged display name must not cost somebody their account');
      assert.equal(again.person.name, null);
    } finally { console.error = error; }
    store.close();
  });
});
