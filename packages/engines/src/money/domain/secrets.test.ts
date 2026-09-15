import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cashCodeDigest, randomDigits, randomSalt, sameDigest, sha256Hex } from './secrets.ts';

/* The digest is written out so the browser preview can run the same ledger synchronously, and so it is
   held to node:crypto's SHA-256 here, across the padding boundaries where a hand-written one goes wrong. */
test('sha256Hex is SHA-256, byte for byte, across every padding boundary', () => {
 const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(119), 'x'.repeat(1000), 'Thuso ✓ ünïcode · ٤٢'];
 for (const input of inputs) assert.equal(sha256Hex(input), createHash('sha256').update(input, 'utf8').digest('hex'), JSON.stringify(input.slice(0, 20)));
});

test('a cash code is decimal digits from the random source, and codes do not repeat in practice', () => {
 const codes = Array.from({ length: 500 }, () => randomDigits(6));
 for (const code of codes) assert.match(code, /^\d{6}$/);
 assert.ok(new Set(codes).size > 490, 'five hundred codes from a million should almost never collide');
 const counts = new Array(10).fill(0);
 for (const code of codes) for (const c of code) counts[Number(c)] += 1;
 for (const n of counts) assert.ok(n > 200 && n < 400, `each digit about 300 times in 3000, got ${counts.join(',')}`);
});

test('a digest is salted, compares in constant time, and says nothing about the code', () => {
 const code = randomDigits(6);
 const [a, b] = [randomSalt(), randomSalt()];
 assert.notEqual(a, b);
 assert.notEqual(cashCodeDigest(a, code), cashCodeDigest(b, code), 'the same code under two salts is two digests');
 assert.equal(sameDigest(cashCodeDigest(a, code), cashCodeDigest(a, code)), true);
 assert.equal(sameDigest(cashCodeDigest(a, code), cashCodeDigest(a, code === '000000' ? '111111' : '000000')), false);
 assert.ok(!cashCodeDigest(a, code).includes(code));
});
