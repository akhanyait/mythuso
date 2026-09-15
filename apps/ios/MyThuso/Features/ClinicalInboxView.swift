import SwiftUI

/* The clinical inbox on a phone: the visits nurses handed over, each signed by the doctor's own press, and what she is
 * told when she starts triage or Home Guidance.
 *
 * Each review shows the protocol version its visit named and whether the register holds it as ratified, and whether
 * its record is complete. There are two buttons rather than a picker with one chosen already: how a review is signed
 * is the doctor's choice, and a control that arrives set to "signed under a ratified protocol" is a choice made for
 * her. A press that is refused shows the refusal word for word, in the route's sentence, rather than a button greyed
 * out with no reason.
 *
 * Triage and guidance are started from here too, because a doctor reviewing a visit is where one would begin. No
 * triage protocol is ratified and no script exists, so each is answered with its refusal, "not triaged" and who
 * decides instead, and nothing is guessed. Nothing on this screen reaches anybody. */
struct ClinicalInboxView: View {
    @ObservedObject private var inbox = ClinicalInbox.shared
    @ObservedObject private var vetting = VettingStore.shared
    @State private var answers: [String: String] = [:]
    @State private var triage: ClinicalData.Refusal?
    @State private var guidance: [String: String] = [:]
    /* The doctor's workspace opens as this party, as the review queue beside it does. */
    private let signerId = "D-401"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                CareHeading(eyebrow: "Doctor", title: ClinicalData.InboxText.heading, subtitle: ClinicalData.InboxText.intro)
                CapabilityNotice(of: "doctor-review")
                muted(ClinicalData.InboxText.preview)
                muted(ClinicalData.InboxText.confirmers.replacingOccurrences(of: "{roles}", with: Clinical.roles(ClinicalData.confirmers)))
                ForEach(inbox.reviews) { review in reviewCard(review) }
                triageCard
                guidanceCard
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(ClinicalData.InboxText.heading)
    }

    private func reviewCard(_ review: ClinicalReview) -> some View {
        CareCard(padding: ThusoSpacing.space16) {
            Text(review.id).font(.headline).foregroundStyle(ThusoTheme.charcoal)
            muted(ClinicalData.InboxText.patient.replacingOccurrences(of: "{subject}", with: review.subjectRef))
            muted(protocolLine(review))
            muted(review.recordComplete ? ClinicalData.InboxText.recordComplete : ClinicalData.InboxText.recordIncomplete)
            if let mode = review.signingMode {
                Text(Clinical.signedSentence(mode: mode, visitProtocol: review.protocolVersionId))
                    .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                muted(ClinicalData.PromText.schedule.replacingOccurrences(of: "{days}", with: ClinicalData.promDays.map(String.init).joined(separator: " and ")))
            } else {
                Text(ClinicalData.InboxText.mode).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                ForEach(ClinicalData.modes) { mode in
                    Button("\(ClinicalData.InboxText.sign): \(mode.label)") {
                        answers[review.id] = inbox.sign(review.id, mode: mode.id, signer: vetting.subject(signerId))?.statement
                    }
                    .buttonStyle(QuietButton())
                }
                if let answer = answers[review.id] {
                    Text(answer).font(.footnote).foregroundStyle(ThusoTheme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("clinical-sign-refusal")
                }
            }
        }
    }

    private func protocolLine(_ review: ClinicalReview) -> String {
        guard let named = review.protocolVersionId else { return ClinicalData.InboxText.namedNone }
        let line = ClinicalData.InboxText.named.replacingOccurrences(of: "{protocol}", with: "\(Clinical.protocolName(named)) (\(named))")
        return "\(line) · \(Clinical.ratified(named) ? ClinicalData.InboxText.ratified : ClinicalData.InboxText.draft)"
    }

    private var triageCard: some View {
        CareCard(padding: ThusoSpacing.space16) {
            Text(ClinicalData.TriageText.heading).font(.headline).foregroundStyle(ThusoTheme.charcoal)
            muted(ClinicalData.TriageText.intro)
            if let triage {
                Text(ClinicalData.TriageText.notTriaged).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(triage.statement).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                muted(ClinicalData.TriageText.human)
                muted(ClinicalData.TriageText.emergencyFirst)
                muted(ClinicalData.TriageText.routedTo.replacingOccurrences(of: "{roles}", with: Clinical.roles(ClinicalData.triageRoutesTo)))
            } else {
                Button(ClinicalData.TriageText.start) { triage = Clinical.startTriage() }.buttonStyle(QuietButton())
            }
        }
    }

    private var guidanceCard: some View {
        CareCard(padding: ThusoSpacing.space16) {
            Text(ClinicalData.GuidanceText.heading).font(.headline).foregroundStyle(ThusoTheme.charcoal)
            muted(ClinicalData.GuidanceText.intro)
            ForEach(ClinicalData.outcomes) { outcome in
                if let answer = guidance[outcome.id] {
                    Text("\(outcome.label) · \(ClinicalData.GuidanceText.noScript)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    muted(answer)
                } else {
                    Button(ClinicalData.GuidanceText.give.replacingOccurrences(of: "{outcome}", with: outcome.label)) {
                        guidance[outcome.id] = Clinical.giveGuidance(outcome.id).statement
                    }
                    .buttonStyle(QuietButton())
                }
            }
        }
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
