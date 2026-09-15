package za.co.mythuso.model

import androidx.compose.runtime.mutableStateListOf

/* The clinical inbox on Android: a doctor signing a nurse's visit by her own action, and the answers a clinician is
 * given when she starts triage or Home Guidance.
 *
 * ClinicalData.kt is written by scripts/emit-clinical.mjs from packages/catalog/clinical.json, records.json and
 * apis/clinical.json: the signing modes and the sentence each signature carries, who may confirm, the required
 * headings, the preview's reviews and every refusal sentence. This file is the arithmetic of
 * packages/engines/src/clinical/domain/reviews.ts, hand-written because a phone cannot run the engine, and it asks
 * the engine's questions in the engine's order, so the sentence a doctor reads here is the sentence the route would
 * answer with.
 *
 * WHO. The roles that may confirm are the generated default, a proposal an admin may change on the web; whether this
 * person may act today is the vetting register's answer on this phone, for every capability a clinical role must
 * hold. A signature nobody stands behind is an automatic one and is refused as that.
 *
 * WHAT IS NEVER HERE. A red flag, a priority, a script's words or a question. No triage protocol is ratified and no
 * script or instrument exists, so starting triage or guidance is answered with the refusal, and nothing is guessed.
 */
data class ClinicalReview(
    val appointmentRef: String,
    val encounterRef: String,
    val subjectRef: String,
    val protocolVersionId: String?,
    val recordComplete: Boolean,
    val signingMode: String? = null,
    val signedBy: String? = null
) {
    val signed get() = signingMode != null
}

object Clinical {
    /* A refusal is looked up by id and never typed. An id the contract does not declare stops the app in development
       rather than drawing a blank where a refusal should be. */
    fun refusal(id: String): ClinicalData.Refusal =
        ClinicalData.refusals.firstOrNull { it.id == id } ?: error("packages/catalog/apis/clinical.json declares no refusal $id for a phone.")

    fun ratified(versionId: String?): Boolean =
        versionId != null && ProtocolsData.protocols.firstOrNull { it.reference == versionId }?.ratified == true

    fun protocolName(versionId: String): String = ProtocolsData.protocols.firstOrNull { it.reference == versionId }?.name ?: versionId

    fun recordComplete(seed: ClinicalData.PreviewReview): Boolean =
        seed.signedOff && ClinicalData.requiredHeadings.all { it in seed.sectionsWritten }

    fun roles(ids: List<String>): String = ids.joinToString(", ") { ClinicalData.roleNames[it] ?: it }

    /** A role the settings name, which the register grants every clinical capability, to a person it lets act on each today. */
    fun mayConfirm(subject: VettingSubject?): Boolean =
        subject != null && subject.roleId in ClinicalData.confirmers && ClinicalData.roleNames.containsKey(subject.roleId) &&
            ClinicalData.clinicalRoleHolds.all { can(subject, it).allowed }

    /** The sentence a signature carries: the ratified protocol it follows, or that it follows none and why. */
    fun signedSentence(mode: String, visitProtocol: String?): String {
        val found = ClinicalData.modes.firstOrNull { it.id == mode } ?: return mode
        if (visitProtocol == null) return found.noProtocolSentence ?: found.sentence
        return found.sentence.replace("{protocol}", "${protocolName(visitProtocol)} ($visitProtocol)")
    }

    /** The engine's order: who, the review, already signed, own record, complete, the mode, and what it follows. */
    fun refusalToSign(review: ClinicalReview?, mode: String, protocolVersionId: String?, signer: VettingSubject?): ClinicalData.Refusal? {
        if (signer == null) return refusal("auto-signed-note")
        if (!mayConfirm(signer)) return refusal("not-a-confirmer")
        if (review == null) return refusal("no-such-review")
        if (review.signed) return refusal("review-already-signed")
        if (signer.id == ClinicalData.previewWrittenBy) return refusal("own-record")
        if (!review.recordComplete) return refusal("record-incomplete")
        if (ClinicalData.modes.none { it.id == mode }) return refusal("signing-mode-not-declared")
        val isRatified = ratified(review.protocolVersionId)
        if (mode == ClinicalData.underProtocol) {
            if (!isRatified) return refusal("protocol-not-ratified")
            if (protocolVersionId != review.protocolVersionId) return refusal("protocol-not-the-visits")
        } else if (isRatified) {
            return refusal("sign-under-the-ratified-protocol")
        }
        return null
    }

    /** Starting triage on a phone. Without a ratified triage protocol nothing is triaged; with one, its rules are not on a phone. */
    fun startTriage(): ClinicalData.Refusal =
        if (ClinicalData.triageProtocols.any { id -> ProtocolsData.protocols.any { it.id == id && it.ratified } }) refusal("protocol-content-not-in-this-build")
        else refusal("triage-without-ratified-protocol")

    /** Giving guidance on a phone. No script's words are on a phone, whether or not one is ratified. */
    @Suppress("UNUSED_PARAMETER")
    fun giveGuidance(outcome: String): ClinicalData.Refusal = refusal("script-not-ratified")
}

/** The preview's inbox, held for as long as the app runs. Nothing on it reaches anybody. */
object ClinicalInbox {
    val reviews = mutableStateListOf(*ClinicalData.previewReviews.map {
        ClinicalReview(it.appointmentRef, it.encounterRef, it.subjectRef, it.protocolVersionId, Clinical.recordComplete(it))
    }.toTypedArray())

    /** Signs by the person's own action, or answers with the refusal. Nothing else calls this. */
    fun sign(appointmentRef: String, mode: String, signer: VettingSubject?): ClinicalData.Refusal? {
        val index = reviews.indexOfFirst { it.appointmentRef == appointmentRef }
        val review = reviews.getOrNull(index)
        Clinical.refusalToSign(review, mode, review?.protocolVersionId, signer)?.let { return it }
        if (review != null && signer != null) reviews[index] = review.copy(signingMode = mode, signedBy = signer.id)
        return null
    }
}
