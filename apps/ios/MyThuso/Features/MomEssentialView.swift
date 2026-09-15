import SwiftUI

/* MyThuso for Mom Essential on iOS, as the two people it is between.
 *
 * The reader is usually the son or daughter far away, and what they opened this for is a yes: will a nurse start going
 * to their mother. So the screen leads with the state of that yes, in the contract's words, and under it only the next
 * step. The parent's side is a different perspective on the same screen, named at the top, because the preview has no
 * second phone and a reader who lost track of whose screen this is could agree as the wrong person.
 *
 * A sponsor is shown no control for agreeing: the route's refusal is said where the button would have been. Nothing is
 * charged — this app runs no payment provider, and the pay step says so in the contract's sentence — so a plan never
 * starts here, and the sponsor's view shows what they would see and never see, and whether she has shared her visit
 * summaries. Every word is generated; every figure is PlansData's. Stacked, full-width rows throughout, so the
 * accessibility text sizes reflow rather than clip. */
struct MomEssentialView: View {
    @State private var journey = MomEssentialJourney(sponsor: "Lerato Molefe", parent: "Nomsa Molefe")
    @State private var refused: String?
    private typealias W = MomEssentialData.Words

    private func say(_ text: String, _ extra: [String: String] = [:]) -> String {
        var values = ["plan": MomEssential.planName, "parent": MomEssential.first(journey.parent), "sponsor": MomEssential.first(journey.sponsor)]
        extra.forEach { values[$0.key] = $0.value }
        return MomEssential.fill(text, values)
    }
    private func day(_ date: Date) -> String { date.formatted(date: .long, time: .omitted) }
    private func switchTo(_ acting: MomEssentialJourney.Acting) { journey.acting = acting; refused = nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                CareHeading(eyebrow: say(journey.acting == .sponsor ? W.actingSponsor : W.actingParent), title: say(W.sponsorHeading), subtitle: W.previewNote)
                if let state = journey.state {
                    CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space8) {
                        Text(state.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        Text(say(journey.acting == .sponsor ? state.sponsorWords : state.parentWords))
                            .font(.body).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("mom-essential-state")
                }
                if let refused { ruled(refused).accessibilityIdentifier("mom-essential-refused") }
                content
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(MomEssential.planName)
    }

    @ViewBuilder private var content: some View {
        switch (journey.stage, journey.acting) {
        case (0, _): asking
        case (1, .sponsor): waitingForHer
        case (1, .parent): herAgreement
        case (_, .sponsor): firstMonth
        default: herMedicine
        }
    }

    private var asking: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            if let tier = MomEssential.tier {
                CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space8) {
                    Text(MomEssential.planName).font(.headline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    Text("\(Earnings.rand(tier.price)) / month").font(.callout.weight(.medium)).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
                    Text(tier.cadence).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                    ForEach(tier.includes) { item in
                        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                            Text("•").accessibilityHidden(true)
                            Text(item.text).fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    }
                }
            }
            CapabilityNotice(of: "payments")
            ruled(Plans.refusal("paying-is-not-seeing"))
            ruled(W.guardian)
            action(say(W.ask), prominent: true) { journey.ask(); refused = nil }
        }
    }

    private var waitingForHer: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            muted(W.onlyTheParentAgrees)
            action(say(W.openAsParent)) { switchTo(.parent) }
        }
    }

    private var herAgreement: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(say(W.parentHeading)).font(.headline).foregroundStyle(ThusoTheme.charcoal).accessibilityAddTraits(.isHeader)
            Text(say(W.lineDetailLegend)).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Programmes.lineDetailChoices) { choice in
                choiceRow(title: choice.name, detail: choice.detail, selected: journey.lineDetail == choice.id) { journey.lineDetail = choice.id }
            }
            Toggle(isOn: $journey.shareSummaries) {
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(say(W.summariesLabel)).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                    Text(say(W.summariesDetail, ["until": day(Calendar.current.date(byAdding: .day, value: MomEssentialData.summaryDays, to: Date()) ?? Date())]))
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(ThusoTheme.charcoal)
            .frame(minHeight: 44)
            action(say(W.agree), prominent: true) { refused = journey.agree() }
            action(say(W.backToSponsor)) { switchTo(.sponsor) }
        }
    }

    private var firstMonth: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            CapabilityNotice(of: "payments")
            action(W.pay, prominent: true) { journey.pay() }
            if journey.paymentTried { ruled(W.nothingCharged).accessibilityIdentifier("mom-essential-nothing-charged") }
            Text(say(W.view)).font(.headline).foregroundStyle(ThusoTheme.charcoal).accessibilityAddTraits(.isHeader)
            muted(journey.sharedUntil.map { say(W.summariesShared, ["until": day($0)]) } ?? say(W.summariesNone))
            disclosures(W.seesHeading, Programmes.sponsorSees)
            disclosures(W.neverSeesHeading, Programmes.sponsorNeverSees)
            muted(W.notBuilt)
            action(say(W.openAsParent)) { switchTo(.parent) }
        }
    }

    private var herMedicine: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            Text(W.medicineHeading).font(.headline).foregroundStyle(ThusoTheme.charcoal).accessibilityAddTraits(.isHeader)
            Text(say(W.medicine)).font(.body).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            muted(W.delegate)
            CapabilityNotice(of: "medicine-collection")
            action(say(W.backToSponsor)) { switchTo(.sponsor) }
        }
    }

    /* ---- Parts ---- */

    private func action(_ title: String, prominent: Bool = false, perform: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return Button(action: perform) {
            Text(title).font(.body.weight(.semibold)).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(prominent ? ThusoTheme.surface : ThusoTheme.charcoal)
                .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(prominent ? ThusoTheme.charcoal : ThusoTheme.surface, in: shape)
                .overlay(shape.stroke(ThusoTheme.charcoal, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func choiceRow(title: String, detail: String, selected: Bool, choose: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return Button(action: choose) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(title).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                Text(detail).font(.footnote).foregroundStyle(selected ? ThusoTheme.charcoal : ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(ThusoTheme.charcoal)
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(selected ? ThusoTheme.studioLilac : ThusoTheme.surface, in: shape)
            .overlay(shape.stroke(selected ? ThusoTheme.charcoal : ThusoTheme.studioLine, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func disclosures(_ heading: String, _ items: [Disclosure]) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(heading).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal).accessibilityAddTraits(.isHeader)
            ForEach(items) { item in
                Text(item.what).font(.subheadline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func ruled(_ text: String) -> some View {
        Text(text).font(.subheadline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            .padding(.leading, ThusoSpacing.space12)
            .overlay(alignment: .leading) { Rectangle().fill(ThusoTheme.charcoal).frame(width: 2) }
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
    }
}
