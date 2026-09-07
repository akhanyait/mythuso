/**
 * Time-based one-time passwords (RFC 6238), which is what the second factor actually is.
 *
 * ── Why not another SMS ──────────────────────────────────────────────────────────────────────
 *
 * MyThuso's only factor today is a one-time code sent to a mobile number, and in South Africa that
 * number can be moved to somebody else's SIM with a forged affidavit and a helpful branch. SIM-swap
 * fraud here is routine enough to have its own banking-industry response. A second SMS to the same
 * number is not a second factor: it is the same factor twice, and a swapped SIM answers both.
 *
 * The stakes are also not a stolen shopping account. A doctor signing a clinical decision, a
 * pharmacist dispensing, a laboratory releasing a result — each of those is an act attributed to a
 * named professional, and the attribution is the whole point of vetting them.
 *
 * TOTP is a shared secret and a clock. It works in any authenticator app, costs nothing per
 * sign-in, involves no network MyThuso does not control, and cannot be intercepted on the way
 * because nothing travels.
 *
 * ── Why it is written here rather than installed ─────────────────────────────────────────────
 *
 * The service has no dependencies at all, and the authentication path is the last place to accept
 * the first one. This is HMAC and base32, both fully specified, and it would still need the tests
 * below to be trustworthy — the RFC's own vectors are what make it so, not the package name.
 *
 * Pure: no clock, no database, no I/O. The time is always passed in, which is what makes the drift
 * window testable.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Thirty seconds, six digits: what every authenticator app assumes without being told. */
export const STEP_SECONDS = 30;
export const DIGITS = 6;
/**
 * How many steps either side of now are accepted. One, so a code lives at most ninety seconds.
 * Phone clocks drift and people type slowly; a window of zero refuses honest users. A wider one
 * multiplies what an attacker may guess at any moment, for a convenience nobody notices.
 */
export const DRIFT_STEPS = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, which is the alphabet authenticator apps read. */
export function base32Encode(bytes: Buffer): string {
 let bits = 0, value = 0, out = '';
 for (const byte of bytes) {
  value = (value << 8) | byte;
  bits += 8;
  while (bits >= 5) {
   out += BASE32[(value >>> (bits - 5)) & 31];
   bits -= 5;
  }
 }
 if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
 return out;
}

export function base32Decode(input: string): Buffer {
 /* Padding and spacing are stripped: apps show a secret in groups of four and people paste it back
    with the spaces still in it. */
 const clean = input.toUpperCase().replace(/[\s=]/g, '');
 let bits = 0, value = 0;
 const out: number[] = [];
 for (const character of clean) {
  const index = BASE32.indexOf(character);
  if (index < 0) throw new Error('That is not a valid authenticator secret.');
  value = (value << 5) | index;
  bits += 5;
  if (bits >= 8) {
   out.push((value >>> (bits - 8)) & 255);
   bits -= 8;
  }
 }
 return Buffer.from(out);
}

/** A fresh secret. Twenty bytes is the RFC's recommendation for HMAC-SHA1. */
export function generateSecret(): string {
 return base32Encode(randomBytes(20));
}

/**
 * The code for one counter value, RFC 4226.
 *
 * `digits` is a parameter only so the RFC 6238 test vectors — which are eight digits — can be run
 * against this function as they are written. Everything MyThuso issues is six.
 */
export function hotp(secret: Buffer, counter: number, digits: number = DIGITS): string {
 const counterBytes = Buffer.alloc(8);
 /* Two 32-bit halves: the counter passes 2^32 in the year 6053, and this avoids depending on a
    64-bit write being present in every Node this runs on. */
 counterBytes.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
 counterBytes.writeUInt32BE(counter >>> 0, 4);
 const digest = createHmac('sha1', secret).update(counterBytes).digest();
 /* Dynamic truncation, RFC 4226 §5.3. */
 const offset = digest[digest.length - 1]! & 0x0f;
 const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16)
  | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
 return String(binary % 10 ** digits).padStart(digits, '0');
}

export function counterFor(at: number): number {
 return Math.floor(at / 1000 / STEP_SECONDS);
}

/** The code an authenticator would be showing at this moment. */
export function totp(secret: string, at: number): string {
 return hotp(base32Decode(secret), counterFor(at));
}

export type TotpCheck = { ok: true; step: number } | { ok: false; step: number | null; reason: string };

/**
 * Check a code, and say which step it came from.
 *
 * The step goes back to the caller so the same code cannot be spent twice. Without that, a code
 * read over somebody's shoulder — or shouted across a ward — keeps working for another ninety
 * seconds, which is the entire window an attacker needs.
 *
 * Compared with timingSafeEqual, because a character-by-character comparison leaks how much of a
 * guess was right, and six digits is a small enough space to walk with that.
 */
export function verifyTotp(secret: string, code: string, at: number, lastUsedStep: number | null = null): TotpCheck {
 const cleaned = (code ?? '').replace(/\s/g, '');
 if (!/^\d{6}$/.test(cleaned)) return { ok: false, step: null, reason: 'Enter the six digits from your authenticator app.' };
 const bytes = base32Decode(secret);
 const current = counterFor(at);
 const supplied = Buffer.from(cleaned);
 for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
  const step = current + drift;
  const candidate = Buffer.from(hotp(bytes, step));
  if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) {
   if (lastUsedStep !== null && step <= lastUsedStep) {
    return { ok: false, step, reason: 'That code has already been used. Wait for your app to show the next one.' };
   }
   return { ok: true, step };
  }
 }
 return { ok: false, step: null, reason: 'That code is not right. Check your app and try again.' };
}

/**
 * The URI an authenticator app scans.
 *
 * The issuer appears twice on purpose — once in the label, once as a parameter — because apps
 * disagree about which one they read, and the one that gets it wrong shows a person six digits they
 * cannot attribute to anything.
 */
export function otpauthUri(secret: string, account: string, issuer = 'MyThuso'): string {
 const label = encodeURIComponent(`${issuer}:${account}`);
 const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
 return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Recovery codes, for the phone that was lost, sold, reset or stolen with the bag.
 *
 * Without these, turning on a second factor is a way to be locked out of your own account for good,
 * and the support path for "prove you are you" is exactly the social-engineering hole the second
 * factor was added to close. Ten of them, shown once, grouped so they can be read down a phone
 * line, and stored hashed — a leaked copy of the table must not be a set of working second factors.
 */
export function generateRecoveryCodes(count: number): string[] {
 return Array.from({ length: count }, () => {
  const raw = randomBytes(5).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
 });
}

/** Codes are typed back with or without the dash, and in either case. */
export const normaliseRecoveryCode = (supplied: string): string | null => {
 const cleaned = (supplied ?? '').replace(/[\s-]/g, '').toUpperCase();
 return /^[0-9A-F]{10}$/.test(cleaned) ? cleaned : null;
};
