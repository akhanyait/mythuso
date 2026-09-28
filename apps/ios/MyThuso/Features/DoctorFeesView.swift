import SwiftUI

/* What a doctor is paid for reviewing a case, and whether it may be paid yet.
 *
 * The documents give a range for a doctor's per-case review and no price. The fee is Money's setting,
 * and this app has no admin surface, so it shows the default as generated: a proposal inside that range,
 * which nobody has confirmed. A proposal pays nobody, so the screen shows the fee beside the contract's
 * sentence saying it is not confirmed; the range is shown as a range and labelled as one, from the
 * setting's bounds; and the one button asks to schedule the payout and shows the refusal, word for word,
 * rather than being disabled with no reason given.
 *
 * The cases carry a reference and a date and nothing else. Money hears review.billable, which names the
 * review, the doctor and a fee code, and never the patient or why the review was needed — so this screen
 * has nobody to name, which is the design rather than a gap in it. */
struct DoctorFeesView: View {
    @State private var answer: String?
    private let fee = Money.reviewFee
    private let cases = Money.sampleCases

    private var feeText: String { Money.randCents(fee.amountCents) + (fee.confirmed ? "" : " · not confirmed") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                CareHeading(eyebrow: "Doctor", title: "Per-case fees", subtitle: fee.name)
                CapabilityNotice(of: "payouts")
                CareCard(padding: ThusoSpacing.space16) {
                    LabeledContent(fee.name, value: Money.randCents(fee.amountCents))
                    LabeledContent("The range the documents give", value: "\(Money.randCents(fee.rangeLowCents)) to \(Money.randCents(fee.rangeHighCents))")
                    muted(fee.confirmed ? fee.confirmedWords : fee.unconfirmedWords)
                    muted("\(fee.source) \(fee.whoSets)")
                }
                Text("Cases recorded").font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
                CareCard(padding: ThusoSpacing.space16) {
                    ForEach(cases) { signed in
                        LabeledContent(signed.reviewRef, value: "\(signed.date.formatted(.dateTime.weekday(.abbreviated).day().month(.wide))) · \(feeText)")
                    }
                    muted(Money.casesWords)
                }
                CareCard(padding: ThusoSpacing.space16) {
                    LabeledContent("Owed for \(cases.count) cases", value: Money.owed(for: cases, fee: fee).map(Money.randCents) ?? "Not worked out")
                    if let answer {
                        Text(answer).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("doctor-fee-refusal")
                    } else {
                        /* The phone cannot schedule anything; the engine refuses at a fee nobody has
                           confirmed, and this shows that refusal in its words rather than a figure. */
                        Button("Schedule this week’s payout") {
                            answer = fee.isPayable ? nil : Money.refusal("doctor-fee-undecided")
                        }.buttonStyle(QuietButton())
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Per-case fees")
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
    }
}
