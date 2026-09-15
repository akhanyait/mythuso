import Foundation

/* The clinical inbox on iOS: a doctor signing a nurse's visit by her own action, and the answers a clinician is
 * given when she starts triage or Home Guidance.
 *
 * ClinicalData.swift is written by scripts/emit-clinical.mjs from packages/catalog/clinical.json, records.json and
 * apis/clinical.json: the signing modes and the sentence each signature carries, who may confirm, the required
 * headings, the preview's reviews and every refusal sentence. This file is the arithmetic of
 * packages/engines/src/clinical/domain/reviews.ts, hand-written because a phone cannot run the engine, and it asks
 * the engine's questions in the engine's order, so the sentence a doctor reads here is the sentence the route would
 * answer with.
 *
 * WHO. The roles that may confirm are the generated default, a proposal an admin may change on the web; whether this
 * person may act today is the vetting register's answer on this phone, for every capability a clinical role must
 * hold. A signature nobody's reference stands behind is an automatic one and is refused as that.
 *
 * WHAT IS NEVER HERE. A red flag, a priority, a script's words or a question. No triage protocol is ratified and no
 * script or instrument exists, so starting triage or guidance is answered with the refusal, and nothing is guessed.
 */
struct ClinicalReview: Identifiable, Hashable {
    /// The appointment reference the review queue shows.
    let id: String
    let encounterRef: String
    let subjectRef: String
    let protocolVersionId: String?
    let recordComplete: Bool
    var signingMode: String?
    var signedBy: String?
    var signedAt: Date?
    var signed: Bool { signingMode != nil }
}

enum Clinical {
    /* A refusal is looked up by id and never typed. An id the contract does not declare stops the app in development
       rather than drawing a blank where a refusal should be. */
    static func refusal(_ id: String) -> ClinicalData.Refusal {
        guard let found = ClinicalData.refusals.first(where: { $0.id == id }) else {
            preconditionFailure("packages/catalog/apis/clinical.json declares no refusal \(id) for a phone.")
        }
        return found
    }

    static func ratified(_ versionId: String?) -> Bool {
        guard let versionId else { return false }
        return ProtocolsData.protocols.first { $0.reference == versionId }?.ratified ?? false
    }

    static func protocolName(_ versionId: String) -> String {
        ProtocolsData.protocols.first { $0.reference == versionId }?.name ?? versionId
    }

    static func recordComplete(_ seed: ClinicalData.PreviewReview) -> Bool {
        seed.signedOff && ClinicalData.requiredHeadings.allSatisfy(seed.sectionsWritten.contains)
    }

    static func roles(_ ids: [String]) -> String {
        ids.map { ClinicalData.roleNames[$0] ?? $0 }.joined(separator: ", ")
    }

    /// A role the settings name, which the register grants every clinical capability, to a person it lets act on each today.
    static func mayConfirm(_ subject: VettingSubject?) -> Bool {
        guard let subject, ClinicalData.confirmers.contains(subject.roleId), ClinicalData.roleNames[subject.roleId] != nil else { return false }
        return ClinicalData.clinicalRoleHolds.allSatisfy { can(subject, $0).allowed }
    }

    /// The sentence a signature carries: the ratified protocol it follows, or that it follows none and why.
    static func signedSentence(mode: String, visitProtocol: String?) -> String {
        guard let found = ClinicalData.modes.first(where: { $0.id == mode }) else { return mode }
        guard let visitProtocol else { return found.noProtocolSentence ?? found.sentence }
        return found.sentence.replacingOccurrences(of: "{protocol}", with: "\(protocolName(visitProtocol)) (\(visitProtocol))")
    }

    /// The engine's order: who, the review, already signed, own record, complete, the mode, and what it follows.
    static func refusalToSign(_ review: ClinicalReview?, mode: String, protocolVersionId: String?, signer: VettingSubject?) -> ClinicalData.Refusal? {
        guard let signer else { return refusal("auto-signed-note") }
        guard mayConfirm(signer) else { return refusal("not-a-confirmer") }
        guard let review else { return refusal("no-such-review") }
        if review.signed { return refusal("review-already-signed") }
        if signer.id == ClinicalData.previewWrittenBy { return refusal("own-record") }
        if !review.recordComplete { return refusal("record-incomplete") }
        guard ClinicalData.modes.contains(where: { $0.id == mode }) else { return refusal("signing-mode-not-declared") }
        let isRatified = ratified(review.protocolVersionId)
        if mode == ClinicalData.underProtocol {
            if !isRatified { return refusal("protocol-not-ratified") }
            if protocolVersionId != review.protocolVersionId { return refusal("protocol-not-the-visits") }
        } else if isRatified {
            return refusal("sign-under-the-ratified-protocol")
        }
        return nil
    }

    /// Starting triage on a phone. Without a ratified triage protocol nothing is triaged; with one, its rules are not on a phone.
    static func startTriage() -> ClinicalData.Refusal {
        ClinicalData.triageProtocols.contains(where: { id in ProtocolsData.protocols.contains { $0.id == id && $0.ratified } })
            ? refusal("protocol-content-not-in-this-build")
            : refusal("triage-without-ratified-protocol")
    }

    /// Giving guidance on a phone. No script's words are on a phone, whether or not one is ratified.
    static func giveGuidance(_ outcome: String) -> ClinicalData.Refusal { refusal("script-not-ratified") }
}

@MainActor final class ClinicalInbox: ObservableObject {
    static let shared = ClinicalInbox()

    @Published private(set) var reviews: [ClinicalReview] = ClinicalData.previewReviews.map {
        ClinicalReview(id: $0.id, encounterRef: $0.encounterRef, subjectRef: $0.subjectRef,
                       protocolVersionId: $0.protocolVersionId, recordComplete: Clinical.recordComplete($0))
    }

    /// Signs by the person's own action, or answers with the refusal. Nothing else calls this.
    func sign(_ reviewId: String, mode: String, signer: VettingSubject?) -> ClinicalData.Refusal? {
        let index = reviews.firstIndex { $0.id == reviewId }
        let review = index.map { reviews[$0] }
        if let refused = Clinical.refusalToSign(review, mode: mode, protocolVersionId: review?.protocolVersionId, signer: signer) { return refused }
        guard let index, let signer else { return nil }
        reviews[index].signingMode = mode
        reviews[index].signedBy = signer.id
        reviews[index].signedAt = Date()
        return nil
    }
}
