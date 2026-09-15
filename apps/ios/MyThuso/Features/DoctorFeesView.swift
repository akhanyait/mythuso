import SwiftUI

/* What a doctor is paid for reviewing a case, which is: not decided.
 *
 * The documents give a range for a doctor's per-case review and no price. A screen like this is where a
 * made-up number would be most tempting and do the most harm — a figure a doctor reads as her rate,
 * which nobody agreed to. So the fee is the contract's nil, rendered as the contract's sentence; the
 * range is shown as a range and labelled as one, read from the funding proposal's model when MoneyData
 * was generated; and the one button asks to schedule the payout and shows the refusal, word for word,
 * rather than being disabled with no reason given.
 *
 * The cases carry a reference and a date and nothing else. Money hears review.billable, which names the
 * review, the doctor and a fee code, and never the patient or why the review was needed — so this screen
 * has nobody to name, which is the design rather than a gap in it. */
struct DoctorFeesView: View {
    @State private var answer: String?
    private let fee = Money.reviewFee
    private let cases = Money.sampleCases

    private var feeText: String { fee.amount.map { Earnings.rand($0) } ?? "Not decided" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                CareHeading(eyebrow: "Doctor", title: "Per-case fees", subtitle: fee.name)
                CapabilityNotice(of: "payouts")
                CareCard(padding: ThusoSpacing.space16) {
                    LabeledContent(fee.name, value: feeText)
                    LabeledContent("The range the documents give", value: "\(Earnings.rand(fee.rangeLow)) to \(Earnings.rand(fee.rangeHigh))")
                    muted(fee.undecided)
                    muted("\(fee.source) Who decides it: \(fee.whoDecides)")
                }
                Text("Cases recorded").font(.headline).foregroundStyle(ThusoTheme.charcoal).accessibilityAddTraits(.isHeader)
                CareCard(padding: ThusoSpacing.space16) {
                    ForEach(cases) { signed in
                        LabeledContent(signed.reviewRef, value: "\(signed.date.formatted(.dateTime.weekday(.abbreviated).day().month(.wide))) · \(feeText)")
                    }
                    muted(Money.casesWords)
                }
                CareCard(padding: ThusoSpacing.space16) {
                    LabeledContent("Owed for \(cases.count) cases", value: Money.owed(for: cases, fee: fee).map { Earnings.rand($0) } ?? "Not worked out")
                    if let answer {
                        Text(answer).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("doctor-fee-refusal")
                    } else {
                        /* The phone cannot schedule anything; the engine refuses while the fee is nil,
                           and this shows that refusal in its words rather than a figure. */
                        Button("Schedule this week’s payout") {
                            answer = fee.isDecided ? nil : Money.refusal("doctor-fee-undecided")
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
        Text(text).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
