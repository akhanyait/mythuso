/**
 * The cash code: random, and kept only as a salted hash.
 *
 * ── Why it is not derived from anything ──────────────────────────────────────────────────────
 *
 * The first cash code was seeded from the payment's own reference, with the same public seed function
 * the simulated provider uses for its deterministic answers. Determinism is right for a simulated bank
 * and wrong for a secret: anybody holding the reference — which travels on the bus in payment events —
 * could compute the code the patient was told to keep, and a reviewer did, first time. So the code comes
 * from the platform's cryptographic random source and from nothing a person could see.
 *
 * ── Why only a hash is kept ──────────────────────────────────────────────────────────────────
 *
 * A code that is stored can be read back by whoever reads the store. What Money keeps is a random salt
 * and the SHA-256 of salt and code, which is enough to check the nurse's entry and useless for printing
 * the code again. Six digits are a small space, so the hash is not the defence against guessing — the
 * attempt limit in the ledger is.
 *
 * ── Why SHA-256 is written out here ──────────────────────────────────────────────────────────
 *
 * The ledger runs in the engine and in the browser preview, synchronously, and node:crypto is in only
 * one of them while the Web Crypto digest is asynchronous. `globalThis.crypto.getRandomValues` is the
 * same cryptographic source in both. The digest below is the standard's own construction, and
 * secrets.test.ts holds it to node:crypto's output byte for byte.
 */

/* The one method used, typed here because the engines compile without the DOM library. */
type RandomSource = { getRandomValues<T extends Uint8Array | Uint32Array>(array: T): T };

const random = (): RandomSource => {
 const source = (globalThis as { crypto?: RandomSource }).crypto;
 if (!source?.getRandomValues) throw new Error('No cryptographic random source is available, so no cash code can be issued. A code from Math.random would be a code somebody can predict.');
 return source;
};

/** `length` decimal digits, each uniform, by rejection sampling from 32-bit values. */
export function randomDigits(length: number): string {
 const out: string[] = [];
 const buffer = new Uint32Array(1);
 const limit = Math.floor(0x100000000 / 10) * 10;
 while (out.length < length) {
  random().getRandomValues(buffer);
  if (buffer[0]! < limit) out.push(String(buffer[0]! % 10));
 }
 return out.join('');
}

export function randomSalt(bytes = 16): string {
 const buffer = new Uint8Array(bytes);
 random().getRandomValues(buffer);
 return [...buffer].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* The first 32 bits of the fractional parts of the square roots of the first eight primes, and of the
   cube roots of the first sixty-four — the standard's constants, computed rather than transcribed. */
const PRIMES = (() => { const found: number[] = []; for (let n = 2; found.length < 64; n += 1) if (found.every(p => n % p)) found.push(n); return found; })();
const fraction = (x: number) => Math.floor((x - Math.floor(x)) * 0x100000000) >>> 0;
const INITIAL = PRIMES.slice(0, 8).map(p => fraction(Math.sqrt(p)));
const ROUND = PRIMES.map(p => fraction(Math.cbrt(p)));

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

export function sha256Hex(message: string): string {
 const bytes = new TextEncoder().encode(message);
 const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
 padded.set(bytes);
 padded[bytes.length] = 0x80;
 const view = new DataView(padded.buffer);
 const bits = bytes.length * 8;
 view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
 view.setUint32(padded.length - 4, bits >>> 0);
 const h = [...INITIAL];
 const w = new Uint32Array(64);
 for (let offset = 0; offset < padded.length; offset += 64) {
  for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
  for (let i = 16; i < 64; i += 1) {
   const a = w[i - 15]!, b = w[i - 2]!;
   const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
   const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
   w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
  for (let i = 0; i < 64; i += 1) {
   const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + ROUND[i]! + w[i]!) >>> 0;
   const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
   hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i]! + v) >>> 0; });
 }
 return h.map(v => v.toString(16).padStart(8, '0')).join('');
}

/** What Money keeps for a cash code: the salt and the digest, never the code. */
export const cashCodeDigest = (salt: string, code: string) => sha256Hex(`${salt}:${code}`);

/** Constant-time comparison of two hex digests of equal length. */
export function sameDigest(left: string, right: string): boolean {
 if (left.length !== right.length) return false;
 let difference = 0;
 for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
 return difference === 0;
}
