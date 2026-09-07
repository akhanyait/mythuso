import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hkdfSync, randomBytes } from 'node:crypto';
import {
 canonicalBytes, createKeyRing, createProtection, createRecordCrypto, decodeSealed, encodeSealed,
 isProtected, needsRotation, normaliseForIndex, ProtectionFailure, ProtectionUnavailable,
 rotateSealedBytes, sealedKeyVersion, type ProtectionConfig
} from '../src/protection/crypto.ts';
import type { Binding, KeyPurpose } from '../src/protection/contract.ts';
import { isSealed, sealBytes } from '../src/sensitive.ts';

/* Fixed keys, not random ones. Half of what is worth testing here is that a value sealed today
   still opens after somebody refactors the derivation, and that cannot be tested against a key
   generated in the same run. */
const ROOT_1 = '11'.repeat(32);
const ROOT_2 = '22'.repeat(32);
const ROOT_3 = '33'.repeat(32);

function config(over: Partial<ProtectionConfig> = {}): ProtectionConfig {
 return { environment: 'development', protectionKeys: `1:${ROOT_1},2:${ROOT_2}`, ...over };
}
/* A visit note rather than a name: this module only ever sees the information sensitive.ts was
   built too early to be trusted with. */
const binding: Binding = { recordType: 'visit-note', recordId: 'visit-9', field: 'summary', subjectId: 'person-3' };
const NOTE = 'Patient reports chest pain on exertion.';

describe('the key ring', () => {
 test('the root key is never one of the keys that does any work', () => {
  const keys = createKeyRing(config());
  const root = Buffer.from(ROOT_1, 'hex');
  for (const purpose of ['record', 'index', 'audit', 'share'] as KeyPurpose[]) {
   assert.notDeepEqual(keys.derive(purpose, 1), root, `${purpose} was handed the root key itself`);
  }
 });
 test('every purpose and every version is a different key', () => {
  const keys = createKeyRing(config());
  const seen = new Map<string, string>();
  for (const purpose of ['record', 'index', 'audit', 'share'] as KeyPurpose[]) {
   for (const version of keys.versions) {
    const key = keys.derive(purpose, version).toString('hex');
    assert.equal(key.length, 64);
    assert.equal(seen.has(key), false, `${purpose}/${version} collides with ${seen.get(key)}`);
    seen.set(key, `${purpose}/${version}`);
   }
  }
  assert.equal(seen.size, 8);
 });
 test('the current version is the newest key, unless it is told otherwise', () => {
  assert.equal(createKeyRing(config()).current, 2);
  assert.deepEqual(createKeyRing(config()).versions, [1, 2]);
  /* A new key can be present and not yet in use: that is what the first half of a rotation is. */
  assert.equal(createKeyRing(config({ protectionKeyCurrent: '1' })).current, 1);
 });
 test('a version this server does not hold is a refusal, not a guess', () => {
  const keys = createKeyRing(config());
  assert.throws(() => keys.derive('record', 7), ProtectionUnavailable);
 });
 test('a bare key with no version is version one, so a first deployment need not understand rotation', () => {
  const keys = createKeyRing(config({ protectionKeys: ROOT_1 }));
  assert.deepEqual(keys.versions, [1]);
  assert.deepEqual(keys.derive('record', 1), createKeyRing(config()).derive('record', 1));
 });
 test('base64 and hex are the same key', () => {
  const asBase64 = Buffer.from(ROOT_1, 'hex').toString('base64');
  assert.deepEqual(
   createKeyRing(config({ protectionKeys: `1:${asBase64}` })).derive('record', 1),
   createKeyRing(config()).derive('record', 1)
  );
 });
});

describe('a server with no usable key does not start', () => {
 /* Both environments, on purpose. sensitive.ts will hold a name unencrypted on a laptop and say so
    in the log; there is nothing that passes through here that has a version of that. */
 for (const environment of ['development', 'production'] as const) {
  test(`nothing configured is refused in ${environment}`, () => {
   assert.throws(() => createKeyRing(config({ environment, protectionKeys: '' })), ProtectionUnavailable);
   assert.throws(() => createKeyRing(config({ environment, protectionKeys: '   ' })), ProtectionUnavailable);
  });
  test(`a malformed key is refused in ${environment}`, () => {
   for (const broken of ['1:nonsense', '1:', `1:${'11'.repeat(16)}`, `1:${ROOT_1}zz`, `x:${ROOT_1}`, `0:${ROOT_1}`, `-1:${ROOT_1}`]) {
    assert.throws(() => createKeyRing(config({ environment, protectionKeys: broken })), ProtectionUnavailable, broken);
   }
  });
 }
 test('the same version twice is refused rather than resolved by ordering', () => {
  assert.throws(() => createKeyRing(config({ protectionKeys: `1:${ROOT_1},1:${ROOT_2}` })), ProtectionUnavailable);
 });
 test('rotating to the same key material is refused, because it rotates nothing', () => {
  assert.throws(() => createKeyRing(config({ protectionKeys: `1:${ROOT_1},2:${ROOT_1}` })), ProtectionUnavailable);
 });
 test('being told to write under a key that is not here is refused', () => {
  assert.throws(() => createKeyRing(config({ protectionKeyCurrent: '3' })), ProtectionUnavailable);
 });
 test('indexing under a version that is not here is refused, because every index would stop matching', () => {
  assert.throws(() => createProtection(config({ protectionIndexVersion: '9' })), ProtectionUnavailable);
 });
});

describe('the envelope', () => {
 const { records } = createProtection(config());
 test('what goes in comes back out, under every version', () => {
  for (const current of ['1', '2']) {
   const under = createProtection(config({ protectionKeyCurrent: current })).records;
   for (const plain of [NOTE, '', 'Ané van der Merwe', '한글', 'a'.repeat(5000)]) {
    const sealed = under.seal(plain, binding);
    assert.equal(sealed.version, Number(current));
    assert.equal(under.open(sealed, binding).toString('utf8'), plain);
    /* Sealed under one version, opened by a ring that holds both: this is what "older versions stay
       readable" has to mean in practice. */
    assert.equal(records.open(sealed, binding).toString('utf8'), plain);
   }
  }
 });
 test('bytes go in and the same bytes come back', () => {
  const raw = randomBytes(64);
  assert.deepEqual(records.open(records.seal(raw, binding), binding), raw);
 });
 test('the same value sealed twice shares nothing', () => {
  const first = records.seal(NOTE, binding);
  const second = records.seal(NOTE, binding);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
  assert.notDeepEqual(first.wrappedKey, second.wrappedKey, 'a data key reused across values is not a data key');
  assert.notDeepEqual(first.iv, second.iv);
 });
 test('the plaintext is nowhere in the stored bytes', () => {
  const stored = encodeSealed(records.seal(NOTE, binding));
  assert.ok(!stored.toString('latin1').includes('chest pain'));
  assert.equal(stored.length, 96 + Buffer.byteLength(NOTE), 'the wire format has moved');
 });
 test('a value written for another server does not open here', () => {
  const elsewhere = createProtection(config({ protectionKeys: `1:${ROOT_3}` })).records;
  assert.throws(() => records.open(elsewhere.seal(NOTE, binding), binding), ProtectionFailure);
 });
});

describe('canonical bytes, which is what stops a binding being ambiguous', () => {
 test('a separator in a field cannot be used to fake another binding', () => {
  /* Joined with colons, both of these are "visit:a:b:notes". Length-prefixed, they cannot be. */
  assert.notDeepEqual(canonicalBytes(['visit', 'a:b', 'notes']), canonicalBytes(['visit', 'a', 'b:notes']));
 });
 test('no two different lists of parts share an encoding', () => {
  const lists = [
   ['a', 'b'], ['ab'], ['a', '', 'b'], ['', 'a', 'b'], ['a', 'b', ''], ['a:b', 'c'], ['a', 'b:c'],
   ['a\0b'], ['a', 'b\0'], ['\0', 'ab'], ['a', 'b', 'c'], ['aa', 'b'], ['a', 'ab']
  ];
  const seen = new Map<string, string>();
  for (const list of lists) {
   const encoded = canonicalBytes(list).toString('hex');
   assert.equal(seen.has(encoded), false, `${JSON.stringify(list)} encodes the same as ${seen.get(encoded)}`);
   seen.set(encoded, JSON.stringify(list));
  }
 });
});

describe('binding: a sealed value belongs to its row', () => {
 const { records } = createProtection(config());
 const moves: [string, Binding][] = [
  ['another patient', { ...binding, subjectId: 'person-4' }],
  ['another record', { ...binding, recordId: 'visit-10' }],
  ['another field', { ...binding, field: 'diagnosis' }],
  ['another record type', { ...binding, recordType: 'dispatch-note' }]
 ];
 for (const [what, moved] of moves) {
  test(`lifting it into ${what} fails to open`, () => {
   const sealed = records.seal(NOTE, binding);
   /* Exactly the move an attacker with write access to the database would make: the ciphertext is
      untouched, only the row it sits in has changed. It must fail, not open as the new subject. */
   assert.throws(() => records.open({ ...sealed, binding: moved }, moved), ProtectionFailure);
   /* And through the store, where the binding is whatever the row says it is. */
   const stored = encodeSealed(sealed);
   assert.throws(() => records.open(decodeSealed(stored, moved), moved), ProtectionFailure);
  });
 }
 test('a record id containing the separator a naive encoding would use cannot borrow another binding', () => {
  const colonInId: Binding = { recordType: 'visit-note', recordId: 'visit:9', field: 'summary', subjectId: 'person-3' };
  const colonInField: Binding = { recordType: 'visit-note', recordId: 'visit', field: '9:summary', subjectId: 'person-3' };
  const sealed = records.seal(NOTE, colonInId);
  assert.equal(records.open(sealed, colonInId).toString('utf8'), NOTE);
  assert.throws(() => records.open({ ...sealed, binding: colonInField }, colonInField), ProtectionFailure);
  const other = records.seal(NOTE, colonInField);
  assert.throws(() => records.open({ ...other, binding: colonInId }, colonInId), ProtectionFailure);
 });
 test('an empty field and a missing one are not the same binding', () => {
  const empty: Binding = { ...binding, field: '' };
  const sealed = records.seal(NOTE, empty);
  assert.throws(() => records.open({ ...sealed, binding }, binding), ProtectionFailure);
 });
 test('a binding argument that disagrees with the value is refused before any key is touched', () => {
  const sealed = records.seal(NOTE, binding);
  assert.throws(() => records.open(sealed, { ...binding, subjectId: 'person-4' }), ProtectionFailure);
 });
});

describe('tampering', () => {
 const { records } = createProtection(config());
 test('a single flipped bit anywhere fails, and never comes back as different text', () => {
  const original = encodeSealed(records.seal(NOTE, binding));
  let failures = 0;
  for (let byte = 0; byte < original.length; byte++) {
   for (const bit of [0x01, 0x40]) {
    const altered = Buffer.from(original);
    altered[byte] ^= bit;
    try {
     const opened = records.open(decodeSealed(altered, binding), binding).toString('utf8');
     assert.fail(`byte ${byte} bit ${bit} opened as ${JSON.stringify(opened)}`);
    } catch (error) {
     assert.ok(error instanceof ProtectionFailure || error instanceof ProtectionUnavailable,
      `byte ${byte} bit ${bit} failed with something other than a refusal: ${error}`);
     failures++;
    }
   }
  }
  assert.equal(failures, original.length * 2);
 });
 test('a truncated value is refused rather than opened as far as it goes', () => {
  const original = encodeSealed(records.seal(NOTE, binding));
  for (const length of [0, 4, 8, 68, 95, original.length - 1]) {
   assert.throws(() => records.open(decodeSealed(original.subarray(0, length), binding), binding));
  }
 });
 test('bytes from somewhere else are not read as an envelope', () => {
  assert.throws(() => decodeSealed(Buffer.from('Nomsa Dlamini', 'utf8'), binding), ProtectionFailure);
  assert.throws(() => decodeSealed(randomBytes(200), binding), ProtectionFailure);
 });
});

describe('coexisting with sensitive.ts', () => {
 test('MT1 and MT2 are told apart, in both directions', () => {
  const { records } = createProtection(config());
  const mt2 = encodeSealed(records.seal(NOTE, binding));
  const mt1 = sealBytes(Buffer.from('Nomsa Dlamini', 'utf8'), randomBytes(32));
  assert.equal(isProtected(mt2), true);
  assert.equal(isSealed(mt2), false, 'sensitive.ts would read this as text written before it existed');
  assert.equal(isProtected(mt1), false);
  assert.equal(isSealed(mt1), true);
  assert.equal(isProtected('Nomsa Dlamini'), false);
 });
});

describe('rotation', () => {
 const v1 = createProtection(config({ protectionKeys: `1:${ROOT_1}` }));
 const both = createProtection(config());
 test('a value sealed under the old key opens under a ring that holds both', () => {
  const sealed = v1.records.seal(NOTE, binding);
  assert.equal(sealed.version, 1);
  assert.equal(both.records.open(sealed, binding).toString('utf8'), NOTE);
 });
 test('re-wrapping moves the key version and leaves the ciphertext alone', () => {
  const sealed = v1.records.seal(NOTE, binding);
  const rewrapped = both.records.rewrap(sealed);
  assert.equal(rewrapped.version, 2);
  assert.deepEqual(rewrapped.ciphertext, sealed.ciphertext, 'rotation must not re-encrypt the payload');
  assert.deepEqual(rewrapped.iv, sealed.iv);
  assert.deepEqual(rewrapped.tag, sealed.tag);
  assert.notDeepEqual(rewrapped.wrappedKey, sealed.wrappedKey);
  assert.equal(both.records.open(rewrapped, binding).toString('utf8'), NOTE);
 });
 test('re-wrapping something already current does nothing at all', () => {
  const once = both.records.rewrap(v1.records.seal(NOTE, binding));
  assert.equal(both.records.rewrap(once), once, 'a second pass must not churn the value');
 });
 test('the old key alone no longer opens a re-wrapped value, and the new key alone never opened the old one', () => {
  const sealed = v1.records.seal(NOTE, binding);
  const rewrapped = both.records.rewrap(sealed);
  const v2only = createProtection(config({ protectionKeys: `2:${ROOT_2}` })).records;
  assert.equal(v2only.open(rewrapped, binding).toString('utf8'), NOTE);
  assert.throws(() => v2only.open(sealed, binding), ProtectionUnavailable);
  assert.throws(() => v1.records.open(rewrapped, binding), ProtectionUnavailable);
 });

 test('a rotation interrupted halfway is safe to run again', () => {
  /* The store is not here, so it is stood in for by an array of blobs — which is all the rotation
     ever asks of it: read bytes, write bytes back, one row at a time. */
  const rows = Array.from({ length: 6 }, (_, i) => {
   const rowBinding = { ...binding, recordId: `visit-${i}` };
   return { binding: rowBinding, bytes: encodeSealed(v1.records.seal(`note ${i}`, rowBinding)) };
  });
  const sweep = (upTo: number) => {
   let changed = 0;
   for (const row of rows.slice(0, upTo)) {
    const step = rotateSealedBytes(both.keys, row.bytes);
    if (step.changed) changed++;
    row.bytes = step.bytes;       // the write the store would do
   }
   return changed;
  };
  assert.equal(sweep(3), 3);      // and here the process is killed
  /* Halfway through, every row still opens: that is what makes the interruption survivable rather
     than an outage with a database of mixed versions in it. */
  for (const row of rows) assert.ok(both.records.open(decodeSealed(row.bytes, row.binding), row.binding).length > 0);
  assert.deepEqual(rows.map(r => sealedKeyVersion(r.bytes)), [2, 2, 2, 1, 1, 1]);
  assert.equal(sweep(6), 3, 'the second run must only touch what the first one missed');
  assert.equal(sweep(6), 0, 'a third run has nothing to do');
  assert.deepEqual(rows.map(r => sealedKeyVersion(r.bytes)), [2, 2, 2, 2, 2, 2]);
  rows.forEach((row, i) => assert.equal(both.records.open(decodeSealed(row.bytes, row.binding), row.binding).toString('utf8'), `note ${i}`));
 });
 test('the rotation can pick its work without holding a key', () => {
  const stored = encodeSealed(v1.records.seal(NOTE, binding));
  assert.equal(sealedKeyVersion(stored), 1);
  assert.equal(needsRotation(stored, 2), true);
  assert.equal(needsRotation(rotateSealedBytes(both.keys, stored).bytes, 2), false);
  assert.equal(sealedKeyVersion(Buffer.from('Nomsa Dlamini', 'utf8')), null);
 });
 test('re-wrapping does not disturb the binding', () => {
  const stored = rotateSealedBytes(both.keys, encodeSealed(v1.records.seal(NOTE, binding))).bytes;
  const moved = { ...binding, subjectId: 'person-4' };
  assert.throws(() => both.records.open(decodeSealed(stored, moved), moved), ProtectionFailure);
 });
});

describe('the blind index', () => {
 const { records } = createProtection(config());
 test('equal values match and different ones do not', () => {
  assert.equal(records.blindIndex('072 555 0142', 'phone'), records.blindIndex('072 555 0142', 'phone'));
  assert.notEqual(records.blindIndex('072 555 0142', 'phone'), records.blindIndex('072 555 0143', 'phone'));
 });
 test('the same value in two fields does not join the two tables', () => {
  assert.notEqual(records.blindIndex('072 555 0142', 'phone'), records.blindIndex('072 555 0142', 'next-of-kin-phone'));
 });
 test('it is six hex characters and none of them came from the value', () => {
  const index = records.blindIndex('Nomsa Dlamini', 'name');
  assert.match(index, /^[0-9a-f]{6}$/);
  assert.ok(!Buffer.from(index, 'hex').toString('latin1').includes('Nomsa'));
  /* A value one character away is not an index one character away. */
  assert.notEqual(index.slice(0, 4), records.blindIndex('Nomsa Dlaminj', 'name').slice(0, 4));
 });
 test('the truncation is real: distinct values do share an index', () => {
  /* Three bytes is 2^24 buckets, so forty thousand distinct values are expected to produce about
     40000^2 / 2^25 ≈ 48 colliding pairs. If this ever finds none, the index has quietly become a
     fingerprint of every value in the database and the comment on BLIND_INDEX_BYTES is a story.
     Nothing here is random, so this either passes always or fails always. */
  const seen = new Map<string, number>();
  let collisions = 0;
  for (let i = 0; i < 40000; i++) {
   const index = records.blindIndex(`+2782${String(i).padStart(7, '0')}`, 'phone');
   if (seen.has(index)) collisions++;
   seen.set(index, i);
  }
  assert.ok(collisions > 0, `no two of forty thousand values shared an index — the truncation is not doing its work`);
 });
 test('another server holding another key computes another index', () => {
  const elsewhere = createProtection(config({ protectionKeys: `1:${ROOT_3}` })).records;
  assert.notEqual(records.blindIndex('072 555 0142', 'phone'), elsewhere.blindIndex('072 555 0142', 'phone'));
 });
 test('the index key is not the record key', () => {
  /* Not a claim about the output, a claim about the derivation: the search service can be handed
     the index key without being handed the ability to open anything. */
  const keys = createKeyRing(config());
  assert.notDeepEqual(keys.derive('index', 1), keys.derive('record', 1));
 });
 test('searching is not defeated by capitals and spacing', () => {
  assert.equal(records.blindIndex('  Nomsa   Dlamini ', 'name'), records.blindIndex('nomsa dlamini', 'name'));
  assert.equal(normaliseForIndex('  Nomsa   Dlamini '), 'nomsa dlamini');
 });
 test('an index does not move when the record keys rotate', () => {
  /* The whole point of pinning it: rotating record keys must not require the plaintext of every
     indexed value, which is the migration envelope encryption exists to avoid. */
  const afterRotation = createProtection(config({ protectionKeys: `1:${ROOT_1},2:${ROOT_2},3:${ROOT_3}` })).records;
  assert.equal(records.blindIndex('072 555 0142', 'phone'), afterRotation.blindIndex('072 555 0142', 'phone'));
 });
 test('pinning it elsewhere is deliberate and visible', () => {
  const keys = createKeyRing(config());
  const underTwo = createRecordCrypto(keys, { indexVersion: 2 });
  assert.notEqual(records.blindIndex('072 555 0142', 'phone'), underTwo.blindIndex('072 555 0142', 'phone'));
 });
});

describe('RFC 5869, the HKDF vectors', () => {
 /* Node's hkdfSync is what derives every key in this module. These are the RFC's own SHA-256 cases,
    so a change in Node, in OpenSSL or in how this file calls either of them is caught here rather
    than by a database nobody can open. */
 const cases: [string, string, string, number, string][] = [
  ['0b'.repeat(22), '000102030405060708090a0b0c', 'f0f1f2f3f4f5f6f7f8f9', 42,
   '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'],
  [Array.from({ length: 80 }, (_, i) => i.toString(16).padStart(2, '0')).join(''),
   Array.from({ length: 80 }, (_, i) => (0x60 + i).toString(16).padStart(2, '0')).join(''),
   Array.from({ length: 80 }, (_, i) => (0xb0 + i).toString(16).padStart(2, '0')).join(''), 82,
   'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87'],
  ['0b'.repeat(22), '', '', 42,
   '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8']
 ];
 cases.forEach(([ikm, salt, info, length, expected], index) => {
  test(`test case ${index + 1}`, () => {
   const okm = Buffer.from(hkdfSync('sha256', Buffer.from(ikm, 'hex'), Buffer.from(salt, 'hex'), Buffer.from(info, 'hex'), length));
   assert.equal(okm.toString('hex'), expected);
  });
 });
});

describe('what must not change without a migration', () => {
 /* Golden values. If a refactor changes any of them it has changed what every stored record is
    sealed under, and the records in the field will not say so until somebody tries to read one. */
 test('the derived keys are what they were', () => {
  const keys = createKeyRing(config());
  const expected: Record<string, string> = {
   'record/1': '4e433e8e35541de0de0d79514f14d867f56dca04dde63329a9e2a28d19b053fa',
   'record/2': 'b9c9474e1ce4e02da0ab7e025ff63b5d7a9adef6238befecca0df60764dbce55',
   'index/1': '549651c51278600e95bbcbe51aa2612679617b24ff0d05a869b28842c3c79f90',
   'index/2': '9a281a4ef1ec6fe5f902f5b0b3d50f66e52686795a471c10ab8919cbf0e976c3',
   'audit/1': '845062c6940d9ec9a0689e507cbce7b54ab1bdb75ce9b10a07b714ecaf2cb7cf',
   'audit/2': '37d4f4da718eeb655acebb1736d954a4da0a021543bf6c799ac8b5767c7f2b93',
   'share/1': '733ab1cd173153561a6411bcd8e3bb9b952aeb578686777f1fde840dcafe0f01',
   'share/2': '14b66d6899a4993a0f8f5a0ac315e65861deb3994f429acf095dd231eafbaa3d'
  };
  for (const [at, hex] of Object.entries(expected)) {
   const [purpose, version] = at.split('/');
   assert.equal(keys.derive(purpose as KeyPurpose, Number(version)).toString('hex'), hex, at);
  }
 });
 test('a value sealed before this test was written still opens', () => {
  /* Sealed under version 1 with the fixed keys above, on the day the module was written, and
     pasted here as bytes. It exercises the wire format, the derivation and the associated data at
     once — which is the only test that a stored record actually survives a refactor. */
  const stored = Buffer.from(
   '4d5432000100013c3c8142418088e9961e243ac41b826b699ce7b84af51159dd840d23915cef6259c3e7b08ea8caeb3e05f' +
   '9c6d212ef44d723533817ed6351c724a5fead92322c57f36279198c62c48d6a107b64b0c10e4c09a9b5ee72bde27ae5929' +
   '383697aa5f5e8db2bfb0f3c97c3c46610ca918e299ced0e5f963d76b74edf0360f21787a3', 'hex');
  const { records } = createProtection(config());
  assert.equal(sealedKeyVersion(stored), 1);
  assert.equal(records.open(decodeSealed(stored, binding), binding).toString('utf8'), NOTE);
 });
 test('the blind index is what it was', () => {
  assert.equal(createProtection(config()).records.blindIndex('072 555 0142', 'phone'), '6d31b1');
 });
});
