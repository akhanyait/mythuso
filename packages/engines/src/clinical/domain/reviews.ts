/* The clinical inbox, and a review signed by a clinician's own action.
 *
 * WHERE A REVIEW COMES FROM. Care publishes visit.handover.submitted@1 when a nurse hands a visit over, and
 * Clinical opens a review for its encounter. The protocol version the visit named travels on that event's
 * envelope, where it was carried out under one; a visit that named none opens a review that names none.
 *
 * WHAT A SIGNATURE ASKS, IN ORDER. Who, before anything about what: a signature nobody's reference stands behind is
 * an automatic one and is refused as that; a role the settings in force do not name as a confirmer, or a person
 * Trust has not confirmed today, is refused before learning whether the review exists. Then the review, under
 * that encounter; whether it was already signed; whether the signer wrote the record; whether the record is
 * complete; and last what the signature follows. A visit under a ratified protocol is signed under that protocol
 * and no other version; a visit under a draft, or under none, is signed only as reviewed outside any protocol, and
 * the signature says so in clinical.json's sentence. Nothing here can say a draft was followed.
 *
 * WHAT IS PUBLISHED. review.signed@1: the review, the encounter and who signed. The envelope names the protocol
 * version only when the signature follows a ratified one; for a review outside any protocol it names nothing.
 *
 * There is no path that signs without a request from a named person: no timer, no subscription and no default
 * calls sign(), and scripts/check-boundaries.mjs holds the engine and the web preview to that.
 */
import { OUTSIDE_PROTOCOL, SIGNED, UNDER_PROTOCOL, WAITING, clinicalRoles, done, isRatified, refused, register, signingModes, type Register, type Result } from './contract.ts';

export type Review = {
 readonly reviewRef: string; readonly appointmentRef: string; readonly encounterRef: string; readonly subjectRef: string;
 /** The protocol version the visit named, or null. Never changed by a signature. */
 readonly protocolVersionId: string | null;
 readonly submittedAt: number; readonly stateCode: string;
 readonly signingModeCode: string | null; readonly signedAt: number | null; readonly signedByRef: string | null;
 /** The ratified protocol the signature follows, or null for a review signed outside any protocol. */
 readonly followsProtocolVersionId: string | null;
 readonly episodeRef: string | null;
};

export function openReview(input: { reviewRef: string; appointmentRef: string; encounterRef: string; subjectRef: string; protocolVersionId: string | null }, now: number): Review {
 return { ...input, submittedAt: now, stateCode: WAITING, signingModeCode: null, signedAt: null, signedByRef: null, followsProtocolVersionId: null, episodeRef: null };
}

/** Whether a role may confirm a review under the settings in force: named there, and a clinical role on the register. */
export const mayConfirm = (role: string, confirmers: readonly string[]): boolean => confirmers.includes(role) && clinicalRoles.includes(role);

export type Signer = { readonly ref: string | null; readonly role: string; readonly cleared: boolean };
export type SignRequest = { readonly encounterRef: unknown; readonly signingModeCode: unknown; readonly protocolVersionId?: unknown };
export type SignContext = {
 readonly confirmers: readonly string[];
 /** Whether a consultation for the encounter was signed off with every required heading written. */
 readonly recordComplete: boolean;
 /** Everybody who wrote the encounter's record: its entry's author and every consultation's writer. */
 readonly authors: readonly string[];
 readonly episodeRef: string;
 readonly register?: Register;
};

export function sign(review: Review | undefined, request: SignRequest, signer: Signer, context: SignContext, now: number): Result<Review> {
 if (!signer.ref) return refused('auto-signed-note');
 if (!mayConfirm(signer.role, context.confirmers) || !signer.cleared) return refused('not-a-confirmer');
 if (!review || review.encounterRef !== request.encounterRef) return refused('no-such-review');
 if (review.stateCode === SIGNED) return refused('review-already-signed');
 if (context.authors.includes(signer.ref)) return refused('own-record');
 if (!context.recordComplete) return refused('record-incomplete');
 if (!signingModes.some(mode => mode.code === request.signingModeCode)) return refused('signing-mode-not-declared');
 const ratified = isRatified(review.protocolVersionId, context.register ?? register);
 let follows: string | null = null;
 if (request.signingModeCode === UNDER_PROTOCOL) {
  if (!ratified) return refused('protocol-not-ratified');
  if (request.protocolVersionId !== review.protocolVersionId) return refused('protocol-not-the-visits');
  follows = review.protocolVersionId;
 } else if (request.signingModeCode === OUTSIDE_PROTOCOL && ratified) return refused('sign-under-the-ratified-protocol');
 const signed: Review = {
  ...review, stateCode: SIGNED, signingModeCode: request.signingModeCode as string, signedAt: now, signedByRef: signer.ref,
  followsProtocolVersionId: follows, episodeRef: context.episodeRef
 };
 return done(signed, [{
  key: 'review.signed@1',
  payload: { reviewRef: review.reviewRef, encounterRef: review.encounterRef, signedByRef: signer.ref },
  ...(follows ? { protocolVersion: follows } : {})
 }]);
}
