/**
 * The vetting evidence vault: where a SANC certificate actually goes.
 *
 * ── What was missing ─────────────────────────────────────────────────────────────────────────
 *
 * apps/web/src/lib/vetting.ts says it plainly in its own header: "Nothing here is a compliance
 * control. It is the design of one… No credential is verified, stored or transmitted anywhere." The
 * state of every check lived in fixtures, and there was nowhere to put the certificate a nurse
 * actually holds. The console could refuse a dispatch beautifully and had never seen a document.
 *
 * This is the second module of the modular monolith docs/ARCHITECTURE.md describes, not an extension
 * of identity. Identity establishes who somebody is. Vetting establishes what they are cleared to
 * do, on what evidence, verified by whom, and until when — a different question with a different
 * lifecycle, a different retention argument and a different set of people allowed near it.
 *
 * ── Workforce, not clinical ──────────────────────────────────────────────────────────────────
 *
 * Nothing here is health information. A police clearance, a SANC receipt and a diploma are
 * information about a person who provides care, not about a person receiving it, and
 * scripts/check-boundaries.mjs still fails the build if a clinical table appears in this service.
 * That guard is not being lifted and this module does not go near it.
 *
 * It is still special in the ordinary sense of the word. A criminal record clearance is a document
 * about somebody's history that would do them real harm in the wrong hands, and an identity document
 * is the raw material of impersonation. So it is sealed, gated and audited on exactly the same terms
 * as a patient record — which is the whole reason the protection module was built as a module rather
 * than as a helper for one table.
 *
 * ── The three rules that shape the schema ────────────────────────────────────────────────────
 *
 *  1. **A document is never held in the clear.** Every uploaded file goes through the gate's
 *     `protect()`, which builds the binding from the request rather than accepting one, so a
 *     certificate cannot be sealed against a party the uploader has no authority over.
 *  2. **A substituted document is detectable.** Each version carries the SHA-256 of its plaintext.
 *     Swapping the sealed bytes for another record's fails to open at all — the binding sees to
 *     that. Swapping them for a *differently sealed version of the same field*, which needs the key,
 *     is what the hash is for. It is a plain digest rather than a keyed one on purpose: a person
 *     holding the original PDF must be able to check it against what we say we hold, without us.
 *  3. **Expiry is resolved on every read.** A stored "verified" is a claim about a date, and the
 *     date is checked when the claim is used rather than when it was made. That is what makes a
 *     lapsed police clearance suspend a nurse with nobody having to notice first.
 *
 * ── What is designed rather than built ───────────────────────────────────────────────────────
 *
 * No credential is verified against an issuing authority. Nothing here calls SANC, HPCSA, SAPS or
 * Home Affairs; there is no accredited verification provider and no integration to one. What is
 * built is the vault, the lifecycle, the second-reviewer rule and the refusals — a reviewer still
 * looks at the certificate and decides, and the platform records what they decided and on what.
 * "Verified" in this module means "a named reviewer said so, against a document we can still show",
 * and never "the register confirmed it".
 */
import type { CheckState } from '../protection/index.ts';

/**
 * The states a decision can be *stored* in.
 *
 * `expiring` and `lapsed` are deliberately not among them. They are what a date does to a decision,
 * not decisions anyone takes, and a state somebody can write down is a state that stops being true
 * without changing. They are computed on read; see resolveState.
 */
export const STORED_STATES = ['outstanding', 'submitted', 'in-review', 'verified', 'declined'] as const;
export type StoredState = typeof STORED_STATES[number];

/** The role's own risk level for this check, copied from the catalogue when the record is made. */
export type Risk = 'standard' | 'high';

/**
 * A party being vetted: a nurse, a pharmacy, a courier, a site. The role is the catalogue's, and it
 * is what decides which checks the party owes — the module never invents a check of its own.
 */
export type Party = {
 id: string;
 roleId: string;
 /** The credential the role hangs on, as entered — a SANC number, a CIPC registration. Not a secret. */
 reference: string | null;
 suspendedAt: number | null;
 suspendedReason: string | null;
 declinedAt: number | null;
 declinedReason: string | null;
 createdAt: number;
};

/**
 * One check, for one party. There is exactly one of these per party per check in the catalogue —
 * renewing a certificate adds a version and moves the dates, rather than starting a second record
 * that would leave two answers to "is her clearance in date".
 */
export type Evidence = {
 id: string;
 partyId: string;
 roleId: string;
 checkId: string;
 /** Copied from the catalogue at creation, so a later catalogue edit does not rewrite history. */
 authority: string;
 risk: Risk;
 renewMonths: number | null;
 state: StoredState;
 issuedOn: string | null;          // ISO date
 expiresOn: string | null;         // ISO date
 decidedAt: number | null;
 decidedBy: string | null;
 /** A high-risk check is not verified on one person's say-so, and the second one must be somebody else. */
 secondedAt: number | null;
 secondedBy: string | null;
 declinedReason: string | null;
 createdAt: number;
};

/** Evidence with the date applied to it. This is what every read hands back. */
export type ResolvedEvidence = Evidence & {
 /** The catalogue's own name for the check, so a refusal reads the way the console reads. */
 name: string;
 state: StoredState;
 /** verified, expiring, lapsed or whatever was stored, resolved against expiresOn at the moment of reading. */
 resolved: CheckState;
 daysRemaining: number | null;
 /** True where the check is high-risk, otherwise passing, and nobody has agreed with the first reviewer yet. */
 awaitingSecondReviewer: boolean;
 versions: number;
};

/**
 * One uploaded file. Versions are added and never replaced: a renewed clearance is version 2, and
 * version 1 stays where it is, because "what did we hold when we dispatched her in March" is a
 * question that gets asked after something has gone wrong.
 */
export type EvidenceVersion = {
 id: string;
 evidenceId: string;
 versionNumber: number;
 filename: string;
 bytes: number;
 /** SHA-256 of the plaintext, hex. See rule 2 above. */
 contentHash: string;
 /** Beside the sealed blob, and indexed, so a rotation selects rather than scans. */
 keyVersion: number;
 uploadedBy: string;
 uploadedAt: number;
};

/** Who is asking, and under which of the two purposes that reach this record. */
export type Actor = {
 id: string;
 role: string;
 /** 'vetting' for a reviewer; 'subject-access' for the party reading or submitting their own. */
 purpose: 'vetting' | 'subject-access';
};

export type Refusal = { ok: false; reason: string };
export type Sent<T> = { ok: true } & T;
export type Answer<T> = Sent<T> | Refusal;
