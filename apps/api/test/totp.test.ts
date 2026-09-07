import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode, base32Encode, counterFor, DRIFT_STEPS, generateRecoveryCodes, generateSecret,
  hotp, normaliseRecoveryCode, otpauthUri, STEP_SECONDS, totp, verifyTotp
} from '../src/totp.ts';

/* "12345678901234567890" — the seed both RFCs publish their vectors against. Hand-rolled
   arithmetic on the authentication path is only worth trusting because of these. */
const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('RFC 4226, the HOTP vectors', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  test('all ten counters', () => {
    const secret = base32Decode(SEED);
    expected.forEach((code, counter) => assert.equal(hotp(secret, counter), code, `counter ${counter}`));
  });
});

describe('RFC 6238, the TOTP vectors', () => {
  /* Eight digits and SHA-1, exactly as the RFC prints them. Six is what MyThuso issues; the
     parameter exists so these can be run as written rather than transcribed into something else. */
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130']
  ];
  test('every published time step', () => {
    const secret = base32Decode(SEED);
    for (const [seconds, code] of vectors) {
      assert.equal(hotp(secret, Math.floor(seconds / STEP_SECONDS), 8), code, `T=${seconds}`);
    }
  });
  test('the counter is the time divided by the step', () => {
    assert.equal(counterFor(59_000), 1);
    assert.equal(counterFor(1111111109_000), 37037036);
  });
});

describe('base32', () => {
  test('round-trips', () => {
    for (let length = 1; length <= 24; length++) {
      const bytes = Buffer.alloc(length, length);
      assert.deepEqual(base32Decode(base32Encode(bytes)), bytes, `${length} bytes`);
    }
  });
  test('reads a secret back the way an app displays it', () => {
    assert.deepEqual(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq='), base32Decode(SEED));
  });
  test('refuses what is not base32', () => {
    assert.throws(() => base32Decode('not-a-secret!'), /not a valid authenticator secret/);
  });
  test('a fresh secret is twenty bytes, as the RFC recommends', () => {
    assert.equal(base32Decode(generateSecret()).length, 20);
  });
});

describe('checking a code', () => {
  const at = 1_800_000_000_000;
  test('the code the app is showing is accepted', () => {
    const result = verifyTotp(SEED, totp(SEED, at), at);
    assert.ok(result.ok);
    assert.equal(result.step, counterFor(at));
  });
  test('one step of drift either way, and no more', () => {
    const step = STEP_SECONDS * 1000;
    for (const drift of [-DRIFT_STEPS, 0, DRIFT_STEPS]) {
      assert.ok(verifyTotp(SEED, totp(SEED, at + drift * step), at).ok, `drift ${drift}`);
    }
    assert.equal(verifyTotp(SEED, totp(SEED, at - 2 * step), at).ok, false, 'a code from two minutes ago is over');
    assert.equal(verifyTotp(SEED, totp(SEED, at + 2 * step), at).ok, false);
  });
  test('a code cannot be spent twice', () => {
    const code = totp(SEED, at);
    const first = verifyTotp(SEED, code, at);
    assert.ok(first.ok);
    const second = verifyTotp(SEED, code, at, first.step);
    assert.equal(second.ok, false);
    assert.match((second as { reason: string }).reason, /already been used/);
  });
  test('what is not six digits is refused with something a person can act on', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 34 56']) {
      const result = verifyTotp(SEED, code, at);
      assert.equal(result.ok, false, code);
      assert.match((result as { reason: string }).reason, /six digits|not right/);
    }
  });
});

describe('what an authenticator app is handed', () => {
  test('the issuer is in the label and in the parameters', () => {
    const uri = otpauthUri(SEED, '+27821234567');
    assert.match(uri, /^otpauth:\/\/totp\/MyThuso%3A%2B27821234567\?/);
    const params = new URL(uri).searchParams;
    assert.equal(params.get('secret'), SEED);
    assert.equal(params.get('issuer'), 'MyThuso');
    assert.equal(params.get('digits'), '6');
    assert.equal(params.get('period'), '30');
  });
});

describe('recovery codes', () => {
  test('ten of them, unique, and readable down a phone line', () => {
    const codes = generateRecoveryCodes(10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(code, /^[0-9A-F]{5}-[0-9A-F]{5}$/);
  });
  test('typed back with or without the dash, in either case', () => {
    assert.equal(normaliseRecoveryCode('a1b2c-3d4e5'), 'A1B2C3D4E5');
    assert.equal(normaliseRecoveryCode('A1B2C3D4E5'), 'A1B2C3D4E5');
    assert.equal(normaliseRecoveryCode('nope'), null);
  });
});
