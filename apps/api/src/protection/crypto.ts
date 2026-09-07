/**
 * The cryptographic core of the data protection module: keys, envelopes, binding and blind indexes.
 *
 * contract.ts says what this is for; this file is how. Nothing here is new. AES-256-GCM,
 * HKDF-SHA256 and HMAC-SHA256, each used the way its own specification describes, because a
 * hand-rolled construction is the one part of a system that fails silently and fails years later —
 * long after the person who wrote it has left and the records it was protecting have been read.
 *
 * ── One root key, never used ─────────────────────────────────────────────────────────────────
 *
 * The root key in the environment encrypts nothing. HKDF derives a separate key per purpose and per
 * version, with both written into the HKDF `info`, so the key that seals a diagnosis is not the key
 * that indexes it and not the key that chains the audit trail. A blind index key handed to a search
 * service is then exactly that and nothing more: it cannot open a record.
 *
 * ── An envelope per value ────────────────────────────────────────────────────────────────────
 *
 * Every sealed value gets its own random 32-byte data key. The value is encrypted under the data
 * key; only the data key is wrapped under the derived record key. Rotation then re-wraps sixty
 * bytes per record instead of re-encrypting every record — which is the whole difference between a
 * rotation that happens on a Tuesday and a rotation that stays in a document. It also means the
 * rotation job never holds a record key long enough to read anything: `rotateSealedBytes` unwraps
 * and re-wraps a data key and never touches a ciphertext.
 *
 * ── The wire format ──────────────────────────────────────────────────────────────────────────
 *
 *   offset  bytes  what
 *        0      4  magic "MT2\0"
 *        4      1  format version, 0x01
 *        5      2  key version, uint16 big-endian
 *        7      1  length of the wrapped-key block, always 60
 *        8     12  wrap IV
 *       20     16  wrap GCM tag
 *       36     32  the data key, encrypted under the derived record key
 *       68     12  payload IV
 *       80     16  payload GCM tag
 *       96      n  the value, encrypted under the data key
 *
 * The binding is deliberately *not* in the blob. It is asserted by the row the blob was read from,
 * and if the row disagrees with the row it was written to, the value does not open. Storing it would
 * mean the ciphertext carried its own alibi around with it.
 *
 * sensitive.ts writes "MT1\0" and this writes "MT2\0", so the two are told apart by their second
 * byte and can sit in one database. They may not sit in one *column*: sensitive.ts's `open` treats
 * anything that is not MT1 as text written before it existed and hands it back unchanged, so an MT2
 * blob passed to it comes back as mojibake rather than an error. Nothing sealed here goes anywhere
 * near a column sensitive.ts reads.
 *
 * ── Where the keys live ──────────────────────────────────────────────────────────────────────
 *
 * `MYTHUSO_PROTECTION_KEYS`, as `1:<32 bytes>,2:<32 bytes>` — hex or base64 — in the service's
 * environment and nowhere near the database. More than one version is normal rather than
 * exceptional: during a rotation the old key must still be present or the old records do not open.
 *
 * Unlike sensitive.ts, which will store a name unencrypted on a developer's laptop and say so,
 * there is no fallback here in any environment. Everything that reaches this module is special
 * personal information under POPIA section 26, and a laptop that cannot protect it should not be
 * holding it.
 *
 * ── What this does not do ────────────────────────────────────────────────────────────────────
 *
 * It does not protect a running server. Anything that can call `open` with the right binding gets
 * plaintext, which is why the gate and not this file is what decides who may. It does not hide that
 * a record exists, how large it is, or when it was written. Rotation re-wraps data keys but does not
 * re-key ciphertexts, so a data key that leaked stays good for its own record for ever — a key
 * compromise is a re-encryption, not a rotation. And the root key is the whole of it: lose it and
 * every sealed value is gone, which is the honest cost of holding your own key.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Binding, KeyPurpose, KeyRing, KeyVersion, RecordCrypto, Sealed, WrappedKey } from './contract.ts';

/** Refusal to seal or open, because this server does not hold the key that would. */
export class ProtectionUnavailable extends Error {
 readonly status = 503;
}
/** The bytes did not authenticate: a wrong key, an altered record, or a value lifted from another row. */
export class ProtectionFailure extends Error {
 readonly status = 500;
}

export const PROTECTION_MAGIC = Buffer.from('MT2\0', 'ascii');
const FORMAT = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
/** wrap IV, wrap tag and the encrypted data key: fixed at 60, but written down so a reader is not counting. */
const WRAP_BYTES = IV_BYTES + TAG_BYTES + KEY_BYTES;
const HEADER_BYTES = PROTECTION_MAGIC.length + 1 + 2 + 1;
const WRAP_AT = HEADER_BYTES;
const IV_AT = WRAP_AT + WRAP_BYTES;
const TAG_AT = IV_AT + IV_BYTES;
const BODY_AT = TAG_AT + TAG_BYTES;

/**
 * Truncated to three bytes. The reasoning, and the arithmetic, since a number chosen by feel in a
 * file like this is a number nobody can argue with later:
 *
 * A blind index that is the full 32 bytes of HMAC-SHA256 is a perfect fingerprint. Every distinct
 * value in the database gets its own, for ever, and anyone who later obtains the index key can walk
 * the column and confirm each value exactly. Truncation is what makes a hit ambiguous.
 *
 * Three bytes is 16 777 216 buckets. At a million indexed values in one field — well past what
 * MyThuso plans for, and the point at which this decision would have to be revisited — a lookup
 * returns on average 1 + 10^6/2^24 ≈ 1.06 rows, so equality search stays a single row nearly always
 * and the candidates that do collide are settled by opening them. By the birthday count,
 * 10^12/2^25 ≈ 29 800 colliding pairs exist at that scale, so the column demonstrably is not a
 * bijection. Against the other direction — somebody holding the index key who wants to know whether
 * a particular person is on the platform — a South African mobile number is drawn from a space of
 * roughly 10^8, which leaves about six numbers per bucket, and a national identity number from
 * about 6 × 10^7, which leaves three or four. A hit narrows; it does not confirm.
 *
 * Be honest about the size of that: at today's scale, thousands of rows against sixteen million
 * buckets, a hit is very nearly conclusive. Truncation is not the protection. The protection is that
 * the index key is derived, is not the record key, is separate per field, and never leaves this
 * module — truncation only means that if it ever does leave, what it buys is a shortlist rather than
 * an answer.
 */
const BLIND_INDEX_BYTES = 3;

/**
 * What this module needs from config.ts. Narrow on purpose: the crypto should not be able to reach
 * for anything else in there, and config.ts should not have to know what a key ring is.
 */
export type ProtectionConfig = {
 environment: 'development' | 'production';
 /** MYTHUSO_PROTECTION_KEYS: "1:<key>,2:<key>", each key 32 bytes as hex or base64. */
 protectionKeys: string;
 /** MYTHUSO_PROTECTION_KEY_CURRENT: the version new writes are sealed under. Defaults to the highest present. */
 protectionKeyCurrent?: string;
 /** MYTHUSO_PROTECTION_INDEX_VERSION: the version blind indexes are computed under. See below. */
 protectionIndexVersion?: string;
};

export type RootKeys = { current: KeyVersion; versions: KeyVersion[]; roots: Map<KeyVersion, Buffer> };

/**
 * Parse the environment into root keys. Called by loadConfig as well, so a typo is a service that
 * refuses to start rather than a service that turns out to hold records nobody can open.
 */
export function parseRootKeys(raw: string, options: { current?: string } = {}): RootKeys {
 const entries = raw.split(',').map(entry => entry.trim()).filter(Boolean);
 if (!entries.length) {
  throw new ProtectionUnavailable('MYTHUSO_PROTECTION_KEYS is not set, so this server cannot protect anything it is given. Generate one with: printf "1:%s" "$(openssl rand -hex 32)"');
 }
 const roots = new Map<KeyVersion, Buffer>();
 for (const entry of entries) {
  /* A version prefix is how two keys coexist during a rotation. A bare key is read as version 1, so
     the first deployment does not have to understand rotation to happen. Split on the first colon
     only: hex and base64 never contain one, and a key that did would otherwise be silently cut. */
  const colon = entry.indexOf(':');
  const version = colon === -1 ? 1 : Number(entry.slice(0, colon));
  const material = colon === -1 ? entry : entry.slice(colon + 1).trim();
  if (!Number.isInteger(version) || version < 1 || version > 65535) {
   throw new ProtectionUnavailable(`MYTHUSO_PROTECTION_KEYS has a key numbered "${entry.slice(0, colon)}". Versions are whole numbers from 1 to 65535, as in "1:<key>,2:<key>".`);
  }
  if (roots.has(version)) throw new ProtectionUnavailable(`MYTHUSO_PROTECTION_KEYS lists version ${version} twice. Which one seals is not something to leave to ordering.`);
  roots.set(version, parseRootKey(material, version));
 }
 /* Two versions holding the same bytes is a rotation that rotated nothing. HKDF would still derive
    different keys for them — the version is in the info — but the secret an attacker would have to
    obtain has not changed, and calling that a rotation is the kind of claim
    docs/PRIVACY-AND-SECURITY.md exists to keep out. */
 const seen = new Set<string>();
 for (const [version, key] of roots) {
  const fingerprint = key.toString('base64');
  if (seen.has(fingerprint)) throw new ProtectionUnavailable(`MYTHUSO_PROTECTION_KEYS gives version ${version} the same key material as an earlier version. Rotating to the same secret rotates nothing.`);
  seen.add(fingerprint);
 }
 const versions = [...roots.keys()].sort((a, b) => a - b);
 const current = options.current === undefined || options.current.trim() === ''
  ? versions[versions.length - 1]!
  : Number(options.current.trim());
 if (!roots.has(current)) {
  throw new ProtectionUnavailable(`MYTHUSO_PROTECTION_KEY_CURRENT is ${options.current}, and no key of that version is configured. New writes would be sealed under a key this server does not hold.`);
 }
 return { current, versions, roots };
}

function parseRootKey(raw: string, version: KeyVersion): Buffer {
 const bytes = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
 if (bytes.length !== KEY_BYTES) {
  throw new ProtectionUnavailable(`The protection key for version ${version} must be 32 bytes — 64 hex characters, or base64 of 32 bytes. Got ${bytes.length}. Generate one with: openssl rand -hex 32`);
 }
 return bytes;
}

/* ---- Canonical bytes -------------------------------------------------------------------------
   Everything that goes into an HKDF info, a GCM associated-data block or an HMAC message is written
   through here first, and the reason is an attack that a `join(':')` walks straight into.

   Take a binding of recordType "visit", recordId "a:b", field "notes". Joined with colons that is
   "visit:a:b:notes" — and so is a binding of recordType "visit", recordId "a", field "b:notes". Two
   different rows, one associated-data block, and a ciphertext that moves between them and opens.
   Record ids, field names and subject ids all come from data at some point, so "a separator that
   cannot appear in the fields" is a promise this module is not in a position to keep.

   So: no separator at all. Each part is written as its own length followed by its bytes, and the
   number of parts is written first. That encoding is injective — one byte string can be read back
   as exactly one list of parts — so two different bindings cannot share an associated-data block,
   whatever anybody puts in a record id. */
export function canonicalBytes(parts: readonly string[]): Buffer {
 const count = Buffer.alloc(4);
 count.writeUInt32BE(parts.length, 0);
 const pieces: Buffer[] = [count];
 for (const part of parts) {
  const bytes = Buffer.from(part, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length, 0);
  pieces.push(length, bytes);
 }
 return Buffer.concat(pieces);
}

/* A fixed, public salt. HKDF wants a salt that is not secret and does not repeat across
   applications; it does not want a random one per call, which would have to be stored alongside
   every derivation to be usable again. The string is the domain, and it is versioned because
   changing it would change every key this service has ever derived. */
const HKDF_SALT = Buffer.from('mythuso/protection/hkdf/v1', 'utf8');

/**
 * The key ring. The root keys stay in this closure: `derive` is the only way out of it, and what it
 * hands back is a key for one purpose under one version.
 */
export function createKeyRing(config: ProtectionConfig): KeyRing {
 let roots: RootKeys;
 try {
  roots = parseRootKeys(config.protectionKeys ?? '', { current: config.protectionKeyCurrent });
 } catch (error) {
  /* Refused in development too. sensitive.ts may fall back to plaintext for a name so that a
     developer without a key can still run the thing; nothing that passes through here is a name. */
  const hint = config.environment === 'production' ? '' : ' A development key is one line: export MYTHUSO_PROTECTION_KEYS="1:$(openssl rand -hex 32)".';
  throw new ProtectionUnavailable(`${error instanceof Error ? error.message : 'MYTHUSO_PROTECTION_KEYS is unusable'}${hint}`);
 }
 /* Derivation is deterministic, so it is done once per purpose and version and kept. The cache
    belongs to this ring rather than to the module: a test that builds a ring with different keys
    must not be served a key derived from the last one. */
 const derived = new Map<string, Buffer>();
 return {
  current: roots.current,
  versions: roots.versions,
  derive(purpose: KeyPurpose, version: KeyVersion = roots.current): Buffer {
   const root = roots.roots.get(version);
   if (!root) {
    throw new ProtectionUnavailable(`No protection key of version ${version} is configured on this server. The record is intact; the key that opens it is not here. Configured versions: ${roots.versions.join(', ')}.`);
   }
   const at = `${purpose}/${version}`;
   /* A copy on the way out. The ring hands the same key to the record crypto, the blind index and
      the audit chain, and one caller wiping or padding a buffer it did not allocate would take the
      other two with it — silently, and only for values written after that moment. */
   const already = derived.get(at);
   if (already) return Buffer.from(already);
   /* Purpose and version are both in the info, so 'record' under v1 and 'index' under v1 are
      unrelated keys and neither is the root. The canonical encoding is what stops a purpose named
      like a version, or the other way round, colliding. */
   const info = canonicalBytes(['mythuso.protection.key.v1', purpose, String(version)]);
   const key = Buffer.from(hkdfSync('sha256', root, HKDF_SALT, info, KEY_BYTES));
   derived.set(at, key);
   return Buffer.from(key);
  }
 };
}

/* ---- Binding ---------------------------------------------------------------------------------
   The associated data is not encrypted and is not secret. It is authenticated, and that is the
   point: GCM will only open a ciphertext against the same associated data it was sealed with, so a
   sealed value carries the identity of its row whether anybody copied that row or not. Lift a
   diagnosis from one patient's row into another's and it fails to open, rather than opening as the
   second patient's diagnosis — which is the failure that matters, because it is silent. */
function bindingAad(binding: Binding): Buffer {
 return canonicalBytes([
  'mythuso.protection.record.v1', binding.recordType, binding.recordId, binding.field, binding.subjectId
 ]);
}

/* The wrapped data key is bound to its key version and format, and to nothing else. Deliberately:
   the rotation job re-wraps data keys without knowing which row they came from, which is what lets
   it run without the authority to read a single record. */
function wrapAad(version: KeyVersion): Buffer {
 return canonicalBytes(['mythuso.protection.wrap.v1', String(FORMAT), String(version)]);
}

function wrapDataKey(keys: KeyRing, version: KeyVersion, dataKey: Buffer): WrappedKey {
 const iv = randomBytes(IV_BYTES);
 const cipher = createCipheriv('aes-256-gcm', keys.derive('record', version), iv);
 cipher.setAAD(wrapAad(version));
 const body = Buffer.concat([cipher.update(dataKey), cipher.final()]);
 return { version, wrapped: Buffer.concat([iv, cipher.getAuthTag(), body]) };
}

function unwrapDataKey(keys: KeyRing, version: KeyVersion, block: Buffer): Buffer {
 if (block.length !== WRAP_BYTES) {
  throw new ProtectionFailure(`The wrapped key is ${block.length} bytes where it should be ${WRAP_BYTES}. This value has been damaged or was not written by this module.`);
 }
 const decipher = createDecipheriv('aes-256-gcm', keys.derive('record', version), block.subarray(0, IV_BYTES));
 decipher.setAAD(wrapAad(version));
 decipher.setAuthTag(block.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
 try {
  return Buffer.concat([decipher.update(block.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
 } catch {
  throw new ProtectionFailure('The wrapped data key did not authenticate. Either the protection key has changed, or the stored value has been altered since it was written.');
 }
}

export function createRecordCrypto(keys: KeyRing, options: { indexVersion?: KeyVersion } = {}): RecordCrypto {
 /* Blind indexes do not rotate with records. Re-computing them needs the plaintext of every value,
    which is the expensive migration envelope encryption exists to avoid — so adding a root key for
    a record rotation must not silently change every index and break every search. The index key is
    therefore pinned: to the version given, or to the oldest one configured, which is the one that
    was there when the indexes were first written.

    The trap in that default, said out loud because it costs data: removing the oldest root key from
    the environment moves the index key to the next one, and every stored index stops matching. Keep
    old versions configured, or set MYTHUSO_PROTECTION_INDEX_VERSION explicitly and rebuild the
    indexes deliberately when it changes. Searching across an index rotation is two of these — one
    built for each version — rather than a version argument, so no caller can compute an index under
    a version it did not think about. */
 const indexVersion = options.indexVersion ?? Math.min(...keys.versions);
 if (!keys.versions.includes(indexVersion)) {
  throw new ProtectionUnavailable(`Blind indexes are computed under protection key version ${indexVersion}, which is not configured. Every existing index would stop matching.`);
 }
 return {
  seal(plaintext: string | Buffer, binding: Binding): Sealed {
   const plain = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
   /* One data key per value, never reused, never derived from the plaintext. Two identical
      diagnoses under two different data keys look nothing like each other, which is the difference
      between a database that hides values and one that hides values but announces which rows share
      them. */
   const dataKey = randomBytes(KEY_BYTES);
   const iv = randomBytes(IV_BYTES);
   const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
   cipher.setAAD(bindingAad(binding));
   const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
   const tag = cipher.getAuthTag();
   const wrapped = wrapDataKey(keys, keys.current, dataKey);
   dataKey.fill(0);
   return { version: wrapped.version, wrappedKey: wrapped.wrapped, iv, tag, ciphertext, binding };
  },

  open(sealed: Sealed, binding: Binding): Buffer {
   /* Two bindings in play: the one the value was decoded with and the one the caller is asking
      about. They should be the same object read off the same row, and if they are not, something
      upstream is confused about whose record this is. Refuse before touching a key. */
   if (!sameBinding(sealed.binding, binding)) {
    throw new ProtectionFailure('This value is bound to a different record than the one it is being opened for. Nothing has been decrypted.');
   }
   if (sealed.iv.length !== IV_BYTES || sealed.tag.length !== TAG_BYTES) {
    throw new ProtectionFailure('This sealed value is malformed. It has not been decrypted.');
   }
   const dataKey = unwrapDataKey(keys, sealed.version, sealed.wrappedKey);
   const decipher = createDecipheriv('aes-256-gcm', dataKey, sealed.iv);
   decipher.setAAD(bindingAad(binding));
   decipher.setAuthTag(sealed.tag);
   /* GCM in Node hands back plaintext from update() before final() has checked the tag, so the
      unauthenticated bytes exist in memory for a moment. They are wiped rather than dropped for the
      collector to find, and nothing is returned until final() has agreed. */
   let partial: Buffer | null = null;
   try {
    partial = decipher.update(sealed.ciphertext);
    const rest = decipher.final();
    return Buffer.concat([partial, rest]);
   } catch {
    partial?.fill(0);
    throw new ProtectionFailure('That value could not be opened. Either the protection key has changed, the stored record has been altered, or it belongs to a different record than the one asking for it.');
   } finally {
    dataKey.fill(0);
   }
  },

  rewrap(sealed: Sealed): Sealed {
   /* Idempotent by construction: a value already under the current version comes back as itself,
      not re-wrapped, so a rotation that was interrupted is run again over everything rather than
      from a remembered position. */
   if (sealed.version === keys.current) return sealed;
   const dataKey = unwrapDataKey(keys, sealed.version, sealed.wrappedKey);
   const wrapped = wrapDataKey(keys, keys.current, dataKey);
   dataKey.fill(0);
   /* The ciphertext, IV, tag and binding are untouched — this is sixty bytes of work per record,
      and that is the point. It also means rotation does not re-key the payload: a data key that has
      leaked is still good for its own record afterwards. */
   return { ...sealed, version: wrapped.version, wrappedKey: wrapped.wrapped };
  },

  blindIndex(value: string, field: string): string {
   /* The field name is part of the message, so the same mobile number indexed as a patient's and as
      a next of kin's produces two unrelated indexes. Without it, one HMAC would join every table in
      the database on equal values, which is a relationship nobody asked to publish. */
   const message = canonicalBytes(['mythuso.protection.index.v1', field, normaliseForIndex(value)]);
   return createHmac('sha256', keys.derive('index', indexVersion)).update(message).digest('hex').slice(0, BLIND_INDEX_BYTES * 2);
  }
 };
}

/**
 * What "equal" means for a search. Case and spacing are folded because a person typing a name into
 * a search box is not typing the capitalisation the clerk used, and because widening the index only
 * ever widens the candidate set — the answer is settled by opening a candidate, never by the index
 * alone. NFKC first, so the same name typed on two keyboards is the same bytes.
 */
export function normaliseForIndex(value: string): string {
 return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sameBinding(a: Binding, b: Binding): boolean {
 return a.recordType === b.recordType && a.recordId === b.recordId && a.field === b.field && a.subjectId === b.subjectId;
}

/* ---- Storage ---------------------------------------------------------------------------------
   One blob per sealed value, because a store that has to keep five columns in step has five ways to
   lose one of them. The binding is not in it: it is supplied on the way back in, from the row. */

export type Envelope = { version: KeyVersion; wrappedKey: Buffer; iv: Buffer; tag: Buffer; ciphertext: Buffer };

export function encodeSealed(sealed: Envelope): Buffer {
 if (sealed.wrappedKey.length !== WRAP_BYTES || sealed.iv.length !== IV_BYTES || sealed.tag.length !== TAG_BYTES) {
  throw new ProtectionFailure('Refusing to write a malformed envelope.');
 }
 if (!Number.isInteger(sealed.version) || sealed.version < 1 || sealed.version > 65535) {
  throw new ProtectionFailure(`Refusing to write key version ${sealed.version}.`);
 }
 const header = Buffer.alloc(HEADER_BYTES);
 PROTECTION_MAGIC.copy(header, 0);
 header.writeUInt8(FORMAT, PROTECTION_MAGIC.length);
 header.writeUInt16BE(sealed.version, PROTECTION_MAGIC.length + 1);
 header.writeUInt8(WRAP_BYTES, PROTECTION_MAGIC.length + 3);
 return Buffer.concat([header, sealed.wrappedKey, sealed.iv, sealed.tag, sealed.ciphertext]);
}

function decodeEnvelope(stored: Uint8Array): Envelope {
 const bytes = Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength);
 if (!isProtected(bytes)) throw new ProtectionFailure('These bytes were not written by the protection module.');
 if (bytes.length < BODY_AT) throw new ProtectionFailure('This sealed value is truncated. It has not been decrypted.');
 const format = bytes.readUInt8(PROTECTION_MAGIC.length);
 if (format !== FORMAT) throw new ProtectionFailure(`This value is in protection format ${format}; this server writes format ${FORMAT} and will not guess at the difference.`);
 if (bytes.readUInt8(PROTECTION_MAGIC.length + 3) !== WRAP_BYTES) throw new ProtectionFailure('This sealed value declares a wrapped key of the wrong size.');
 return {
  version: bytes.readUInt16BE(PROTECTION_MAGIC.length + 1),
  wrappedKey: bytes.subarray(WRAP_AT, IV_AT),
  iv: bytes.subarray(IV_AT, TAG_AT),
  tag: bytes.subarray(TAG_AT, BODY_AT),
  ciphertext: bytes.subarray(BODY_AT)
 };
}

/** Read a stored blob back. The binding comes from the row, which is exactly what makes moving it fail. */
export function decodeSealed(stored: Uint8Array, binding: Binding): Sealed {
 return { ...decodeEnvelope(stored), binding };
}

/** True for what this module wrote. False for sensitive.ts's "MT1\0", for text, and for anything else. */
export function isProtected(value: Uint8Array | string): boolean {
 if (typeof value === 'string') return false;
 const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
 return bytes.length >= PROTECTION_MAGIC.length && timingSafeEqual(bytes.subarray(0, PROTECTION_MAGIC.length), PROTECTION_MAGIC);
}

/**
 * Which key version a stored value is under, without holding any key at all. This is what lets a
 * rotation pick its work — and what lets an operator answer "how much is left" honestly.
 */
export function sealedKeyVersion(stored: Uint8Array): KeyVersion | null {
 if (!isProtected(stored) || stored.byteLength < HEADER_BYTES) return null;
 return Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength).readUInt16BE(PROTECTION_MAGIC.length + 1);
}

/* ---- Rotation --------------------------------------------------------------------------------
   Pure, one value at a time, and blind: it re-wraps a data key and never decrypts a payload, so the
   job that rotates the database cannot read the database. The store passes bytes in and writes bytes
   back; what it must provide is described in docs/DATA-PROTECTION.md.

   Resumable and idempotent fall out of that. Each value is rewritten independently, a value already
   under the current version is returned unchanged, and both versions stay readable throughout — so a
   rotation killed halfway leaves a database of mixed versions that works, and running it again picks
   up exactly the ones that were missed. There is no cursor to lose. */
export type Rotation = { changed: boolean; bytes: Buffer; from: KeyVersion; to: KeyVersion };

export function rotateSealedBytes(keys: KeyRing, stored: Uint8Array): Rotation {
 const envelope = decodeEnvelope(stored);
 if (envelope.version === keys.current) {
  return { changed: false, bytes: Buffer.from(stored), from: envelope.version, to: keys.current };
 }
 const dataKey = unwrapDataKey(keys, envelope.version, envelope.wrappedKey);
 const wrapped = wrapDataKey(keys, keys.current, dataKey);
 dataKey.fill(0);
 const bytes = encodeSealed({ ...envelope, version: wrapped.version, wrappedKey: wrapped.wrapped });
 return { changed: true, bytes, from: envelope.version, to: keys.current };
}

/** Cheap enough to run over a whole table before deciding to rotate it: no key, no decryption. */
export function needsRotation(stored: Uint8Array, current: KeyVersion): boolean {
 const version = sealedKeyVersion(stored);
 return version !== null && version !== current;
}

/** One call for the gate to make: the ring and the crypto that hangs off it. */
export function createProtection(config: ProtectionConfig): { keys: KeyRing; records: RecordCrypto } {
 const keys = createKeyRing(config);
 const indexVersion = config.protectionIndexVersion?.trim() ? Number(config.protectionIndexVersion.trim()) : undefined;
 return { keys, records: createRecordCrypto(keys, { indexVersion }) };
}
