/**
 * Encryption at rest for the few values that would matter if the database file were carried away.
 *
 * ── Why this exists before there is any health information ───────────────────────────────────
 *
 * The service holds a name and a mobile number, and now a second-factor secret. None of that is
 * special personal information, so none of it forces this — but the SQLite file sits on a server
 * shared with other sites, and POPIA section 19 asks for "appropriate, reasonable technical and
 * organisational measures" against unlawful access to personal information. A readable file is not
 * that. Building the envelope now, while the contents are ordinary, means the control is proven and
 * tested before anything arrives that could not survive being read.
 *
 * ── The envelope ─────────────────────────────────────────────────────────────────────────────
 *
 *   magic "MT1\0" | 12-byte IV | 16-byte GCM tag | ciphertext
 *
 * AES-256-GCM authenticates as well as encrypts. A row altered in the file fails to open rather
 * than opening as different text, which for a second-factor secret is the difference between a
 * refusal and an account somebody else can mint codes for.
 *
 * The magic prefix is what makes this deployable over a database that already exists. A value
 * written before this file existed has no prefix, so `open` hands it back unchanged instead of
 * failing. Nobody's account goes dark on the day the key is introduced, and every new write is
 * sealed.
 *
 * ── Where the key lives ──────────────────────────────────────────────────────────────────────
 *
 * `MYTHUSO_ENCRYPTION_KEY`, 32 bytes as hex or base64, in the service's environment and nowhere
 * near the database it protects. Losing it loses every sealed value — that is the honest cost of
 * holding your own key rather than handing it to whoever holds the disk.
 *
 * There is no key rotation. Re-sealing every row under a new key is a migration this service does
 * not have, and saying "rotation" when what exists is one environment variable would be the kind of
 * claim docs/PRIVACY-AND-SECURITY.md is written to avoid.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.ts';

const MAGIC = Buffer.from('MT1\0', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A sealed value is bytes; one written before this file existed is text. Both come back. */
export type Stored = Uint8Array | string;

/** Refusal to write a value this server cannot protect. Carries a status the routes can use. */
export class EncryptionUnavailable extends Error {
 readonly status = 503;
}
/** The stored bytes did not authenticate: the wrong key, or somebody edited the file. */
export class DecryptionFailed extends Error {
 readonly status = 500;
}

/* Parsed once and remembered, keyed on the raw value so a test that swaps the environment is not
   served a stale key. */
let cached: { raw: string; key: Buffer } | null = null;

/** The key, or null when none is configured. */
export function encryptionKey(config: Config): Buffer | null {
 const raw = config.encryptionKey.trim();
 if (!raw) return null;
 if (cached?.raw === raw) return cached.key;
 const key = parseKey(raw);
 cached = { raw, key };
 return key;
}

/** Also used by loadConfig, so a malformed key is a refusal to start rather than a first-write surprise. */
export function parseKey(raw: string): Buffer {
 const bytes = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
 if (bytes.length !== 32) {
  throw new Error(`MYTHUSO_ENCRYPTION_KEY must be 32 bytes — 64 hex characters, or base64 of 32 bytes. Got ${bytes.length}. Generate one with: openssl rand -hex 32`);
 }
 return bytes;
}

/** Test seam: forget the parsed key so a changed environment is read again. */
export function resetEncryptionKey(): void { cached = null; }

export function isSealed(value: Stored): boolean {
 if (typeof value === 'string') return false;
 const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
 return bytes.length >= MAGIC.length && timingSafeEqual(bytes.subarray(0, MAGIC.length), MAGIC);
}

export function sealBytes(plain: Buffer, key: Buffer): Buffer {
 /* A fresh IV for every record. Reusing one under GCM does not weaken it, it breaks it: two values
    under the same key and IV give away their XOR. */
 const iv = randomBytes(IV_BYTES);
 const cipher = createCipheriv('aes-256-gcm', key, iv);
 const body = Buffer.concat([cipher.update(plain), cipher.final()]);
 return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function openBytes(envelope: Buffer, key: Buffer): Buffer {
 const iv = envelope.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
 const tag = envelope.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
 const body = envelope.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
 const decipher = createDecipheriv('aes-256-gcm', key, iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * Seal a value for storage.
 *
 * `required` is the difference between a name and a second-factor secret. A name may fall back to
 * plaintext on a developer's laptop, loudly, because a developer without the key still has to be
 * able to run the thing. A secret that lets somebody mint valid codes for ever may not: storing it
 * readable would be a second factor in name only, and refusing is the honest answer in every
 * environment.
 *
 * In production nothing falls back. Accepting a value onto a server that cannot protect it, and
 * saying nothing, leaves the person believing it is protected — which is worse than the refusal.
 */
export function seal(plain: string, config: Config, options: { required?: boolean; label?: string } = {}): Stored {
 const key = encryptionKey(config);
 if (key) return sealBytes(Buffer.from(plain, 'utf8'), key);
 if (options.required || config.environment === 'production') {
  throw new EncryptionUnavailable(`MYTHUSO_ENCRYPTION_KEY is not set, so this server cannot store ${options.label ?? 'this value'}. The write has been refused rather than stored unprotected.`);
 }
 console.warn(`[security] MYTHUSO_ENCRYPTION_KEY is unset — storing ${options.label ?? 'a value'} unencrypted. This is refused in production.`);
 return plain;
}

/**
 * Read a value back.
 *
 * Three cases, and the middle one is why this can be deployed over a database that already exists:
 * a sealed value with a key opens, a value written before the envelope existed comes back
 * unchanged, and a sealed value with no key is an error that says which of the two is missing
 * rather than handing ciphertext to a browser as though it were a name.
 */
export function open(stored: Stored | null, config: Config): string | null {
 if (stored === null || stored === undefined) return null;
 if (!isSealed(stored)) return typeof stored === 'string' ? stored : Buffer.from(stored).toString('utf8');
 const key = encryptionKey(config);
 if (!key) throw new EncryptionUnavailable('That value is encrypted and this server has no MYTHUSO_ENCRYPTION_KEY. The record is intact; the key is missing.');
 try {
  return openBytes(Buffer.from(stored as Uint8Array), key).toString('utf8');
 } catch {
  /* GCM authentication failed: either the key has changed or the stored bytes were altered. Both
     are worth refusing out loud — quietly returning damaged bytes is how a corrupted secret becomes
     an account nobody can sign in to and nobody can explain. */
  throw new DecryptionFailed('That value could not be decrypted. Either the encryption key has changed, or the stored record has been altered since it was written.');
 }
}
