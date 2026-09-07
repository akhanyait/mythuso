/**
 * The data protection module: one gate every piece of protected information passes through.
 *
 * ── Why a module and not a function ──────────────────────────────────────────────────────────
 *
 * MyThuso already knows who may do what: packages/catalog/vetting.json holds twelve roles and
 * twenty capabilities, and `can()` answers in one call. What it has never had is a single place
 * that *enforces* the answer. A survey of the sibling projects found the same hole in all three of
 * them, and one of them had already paid for it — its own comment reads "a hundred and sixty-seven
 * mutating routes and a check remembered on some of them". A rule remembered on some of them is not
 * a rule.
 *
 * So: nothing reads or writes protected information by touching the store. It asks the gate, the
 * gate decides, the gate writes the audit entry, and only then does plaintext exist.
 *
 * ── What this is not ─────────────────────────────────────────────────────────────────────────
 *
 * It is not a new cipher. Every primitive here is a standard one used the ordinary way: AES-256-GCM
 * for confidentiality and authentication, HKDF-SHA256 for deriving one key per job, HMAC-SHA256 for
 * blind indexes and for the audit chain. A hand-rolled cipher is the one component of a system that
 * fails silently and fails late; the sophistication belongs in key handling, binding and
 * enforcement, which is where every real breach of a system like this actually happens.
 */

/* ---- Keys ------------------------------------------------------------------------------------
   One root key, and never used directly. HKDF derives a separate key per job, so the key that seals
   a record cannot also generate the index that finds it — a compromise of one purpose does not hand
   over the others. Versioned, because rotation that cannot be described is rotation nobody does. */
export type KeyPurpose = 'record' | 'index' | 'audit' | 'share' | 'bootstrap';
export type KeyVersion = number;
export type KeyRing = {
 /** The version new writes are sealed under. Older versions stay readable until re-wrapped. */
 current: KeyVersion;
 versions: KeyVersion[];
 /** Derived per purpose and version. The root never leaves this module. */
 derive(purpose: KeyPurpose, version?: KeyVersion): Buffer;
};

/* ---- Envelope encryption ---------------------------------------------------------------------
   Each record gets its own random data key, and only that data key is wrapped under the root. A key
   rotation re-wraps data keys — a few hundred bytes each — instead of re-encrypting every record,
   which is the difference between a rotation that happens and one that stays in a document. */
export type WrappedKey = { version: KeyVersion; wrapped: Buffer };

/* Associated data is what stops a ciphertext being moved. A sealed value carries the identity of
   the row it belongs to, so lifting patient A's diagnosis into patient B's row makes it fail to
   open rather than open as B's. Nothing in the envelope is secret; all of it is authenticated. */
export type Binding = {
 recordType: string;      // the record type from packages/catalog/records.json
 recordId: string;
 field: string;
 subjectId: string;       // whose information this is
};

export type Sealed = {
 version: KeyVersion;
 wrappedKey: Buffer;
 iv: Buffer;
 tag: Buffer;
 ciphertext: Buffer;
 binding: Binding;
};

export interface RecordCrypto {
 seal(plaintext: string | Buffer, binding: Binding): Sealed;
 /** Throws rather than returning altered bytes. A binding mismatch is a failure, not a warning. */
 open(sealed: Sealed, binding: Binding): Buffer;
 /** Re-wrap under the current key version. The ciphertext itself is untouched. */
 rewrap(sealed: Sealed): Sealed;
 /** Equality search over sealed values without opening them. Deliberately truncated, so the index
     is not a lookup table of every distinct value in the database. */
 blindIndex(value: string, field: string): string;
}

/* ---- The gate --------------------------------------------------------------------------------
   Access is not a boolean. POPIA section 13 limits processing to the purpose it was collected for,
   so the gate asks what the reader is doing as well as who they are. */
export type Purpose =
 | 'treatment'          // the clinician in front of the patient
 | 'dispensing'
 | 'diagnostics'
 | 'dispatch'
 | 'vetting'            // deciding whether a party may be dispatched, and reading the evidence for it
 | 'billing'
 | 'subject-access'     // the patient reading their own record
 | 'audit'
 | 'emergency';         // break-glass: allowed, loud, and reviewed

export type AccessRequest = {
 actorId: string;
 actorRole: string;
 capability: string;      // from packages/catalog/vetting.json
 purpose: Purpose;
 recordType: string;
 recordId: string;
 subjectId: string;
 field?: string;
 /** Required for 'emergency'. A break-glass with no reason is a back door with a label on it. */
 reason?: string;
};

export type AccessOutcome =
 | { allowed: true; auditId: string; broke: boolean }
 | { allowed: false; reason: string; auditId: string; blockedBy: string[] };

export interface Gate {
 /** Decides, writes the audit entry, and only then permits the caller to open anything. The audit
     entry is written for a refusal too — a refused attempt is the more interesting one. */
 access(request: AccessRequest): AccessOutcome;
 /** Reveal is the only route to plaintext. It calls access() itself; there is no way to open a
     sealed value while skipping the gate, because the crypto is not exported past this module. */
 reveal(request: AccessRequest, sealed: Sealed): { ok: true; value: Buffer } | { ok: false; reason: string };
 /** And the only route in. The binding is built from the request rather than supplied, so a caller
     cannot seal a document against a record it does not have the authority to write to — which is
     the write-side of the same hole reveal() closes on the read side. */
 protect(request: AccessRequest, plaintext: string | Buffer): { ok: true; sealed: Sealed } | { ok: false; reason: string };
}

/* ---- Tamper-evident audit --------------------------------------------------------------------
   docs/PRIVACY-AND-SECURITY.md lists "an append-only record with integrity, that a person with
   database access still cannot rewrite" as not built, and the honest reason was that a table is
   append-only only by grant. A hash chain makes it checkable instead: every entry carries the hash
   of the one before it, so a deleted or edited row breaks the chain from that point on and the
   break can be found. It does not prevent tampering. It makes tampering discoverable, which is the
   most a single database can honestly offer. */
export type AuditLink = {
 id: string;
 at: string;
 previousHash: string;
 hash: string;
};
export interface AuditChain {
 append(entry: Record<string, unknown>): AuditLink;
 /** Walks the chain and names the first entry whose hash does not follow. */
 verify(): { intact: true; length: number; head: string } | { intact: false; brokenAt: string; length: number };
 head(): string;
}
