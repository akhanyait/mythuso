/**
 * The Passport's key material: one master key, and everything else wrapped under it.
 *
 * ── The envelope, as the master document describes it ───────────────────────────────────────
 *
 * §22: "per-patient data-encryption keys wrapped by a master key in an HSM-backed KMS; sealed
 * categories under separate keys". This is that shape without the HSM:
 *
 *   master key (MYTHUSO_PASSPORT_MASTER_KEY)
 *     ├─ HKDF → wrapping key ─┬─ wraps each subject's general data key          (AES-256-GCM)
 *     │                       └─ wraps each subject's key per sealed category    (AES-256-GCM)
 *     ├─ HKDF → grant-signing key     signs consent artefacts                     (HMAC-SHA-256)
 *     ├─ HKDF → session-signing key   signs the development patient session       (HMAC-SHA-256)
 *     ├─ HKDF → audit key             chains the audit log                        (HMAC-SHA-256)
 *     └─ HKDF → index key             blinds which category a row is filed under  (HMAC-SHA-256)
 *
 * A data key is random, 32 bytes, generated per subject per scope, and stored only wrapped: the
 * wrapped bytes are bound to the subject and scope as associated data, so a wrapped key copied onto
 * another subject's row does not unwrap. A sealed category's key is a different key from the
 * subject's general one, so a reader holding the general key — a bug, a grant path, a future cache —
 * holds nothing that opens sealed content.
 *
 * ── What it is not ───────────────────────────────────────────────────────────────────────────
 *
 * Not HSM- or KMS-backed. The master key is an environment variable in the same process as the data
 * it protects, which is the arrangement a KMS exists to end. There is no rotation, no split-knowledge
 * custody and no key ceremony. The envelope is built so that moving the master key into a KMS
 * changes `wrap` and `unwrap` and nothing else — that is the whole of what can honestly be claimed.
 *
 * No constructor parameter properties and no enums: this runs on Node's type-stripping.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const derive = (master: Buffer, label: string): Buffer => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), `mythuso/passport/${label}/v1`, KEY_BYTES));

/** AES-256-GCM, iv ‖ tag ‖ ciphertext, with the binding as associated data. */
export function sealBytes(key: Buffer, plaintext: Buffer, binding: string): Buffer {
 const iv = randomBytes(IV_BYTES);
 const cipher = createCipheriv('aes-256-gcm', key, iv);
 cipher.setAAD(Buffer.from(binding, 'utf8'));
 const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
 return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/** The inverse, which throws on a wrong key, a wrong binding or a single altered byte. */
export function openBytes(key: Buffer, sealed: Uint8Array, binding: string): Buffer {
 const bytes = Buffer.from(sealed);
 const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, IV_BYTES));
 decipher.setAAD(Buffer.from(binding, 'utf8'));
 decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
 return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

export class PassportKeys {
 #wrap: Buffer;
 #grant: Buffer;
 #session: Buffer;
 #audit: Buffer;
 #index: Buffer;

 constructor(master: Buffer) {
  if (master.length !== KEY_BYTES) throw new Error('The Passport master key must be 32 bytes.');
  this.#wrap = derive(master, 'wrap');
  this.#grant = derive(master, 'grant');
  this.#session = derive(master, 'session');
  this.#audit = derive(master, 'audit');
  this.#index = derive(master, 'index');
 }

 /** A fresh data key, returned in the clear for immediate use and wrapped for storage. */
 newDataKey(subject: string, scope: string): { key: Buffer; wrapped: Buffer } {
  const key = randomBytes(KEY_BYTES);
  return { key, wrapped: sealBytes(this.#wrap, key, `data-key|${subject}|${scope}`) };
 }

 unwrapDataKey(subject: string, scope: string, wrapped: Uint8Array): Buffer {
  return openBytes(this.#wrap, wrapped, `data-key|${subject}|${scope}`);
 }

 sign(kind: 'grant' | 'session', payload: string): string {
  return createHmac('sha256', kind === 'grant' ? this.#grant : this.#session).update(payload).digest('base64url');
 }

 verify(kind: 'grant' | 'session', payload: string, signature: string): boolean {
  const expected = Buffer.from(this.sign(kind, payload), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
 }

 chain(previous: string, body: string): string {
  return createHmac('sha256', this.#audit).update(previous).update('\n').update(body).digest('hex');
 }

 /** Which category a row is filed under, blinded per subject, so the table does not say "HIV" in the clear. */
 categoryTag(subject: string, category: string): string {
  return createHmac('sha256', this.#index).update(`${subject}|${category}`).digest('hex');
 }
}
