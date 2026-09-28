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
                        Text(state.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        Text(say(journey.acting == .sponsor ? state.sponsorWords : state.parentWords))
                            .font(.thuso(.body)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
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
                    Text(MomEssential.planName).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    Text("\(Earnings.rand(tier.price)) / month").font(.thuso(.callout, weight: .medium)).monospacedDigit().foregroundStyle(ThusoRole.foreground)
                    Text(tier.cadence).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                    ForEach(tier.includes) { item in
                        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                            Text("•").accessibilityHidden(true)
                            Text(item.text).fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
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
            Text(say(W.parentHeading)).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            Text(say(W.lineDetailLegend)).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            ForEach(Programmes.lineDetailChoices) { choice in
                choiceRow(title: choice.name, detail: choice.detail, selected: journey.lineDetail == choice.id) { journey.lineDetail = choice.id }
            }
            Toggle(isOn: $journey.shareSummaries) {
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(say(W.summariesLabel)).font(.thuso(.subheadline, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                    Text(say(W.summariesDetail, ["until": day(Calendar.current.date(byAdding: .day, value: MomEssentialData.summaryDays, to: Date()) ?? Date())]))
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(ThusoRole.foreground)
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
            Text(say(W.view)).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            muted(journey.sharedUntil.map { say(W.summariesShared, ["until": day($0)]) } ?? say(W.summariesNone))
            listed(W.seesHeading, MomEssentialData.sponsorSees)
            listed(W.neverSeesHeading, Programmes.sponsorNeverSees.map(\.what))
            muted(W.notBuilt)
            action(say(W.openAsParent)) { switchTo(.parent) }
        }
    }

    private var herMedicine: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            Text(W.medicineHeading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            Text(say(W.medicine)).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
            muted(W.delegate)
            CapabilityNotice(of: "medicine-collection")
            action(say(W.backToSponsor)) { switchTo(.sponsor) }
        }
    }

    /* ---- Parts ---- */

    private func action(_ title: String, prominent: Bool = false, perform: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return Button(action: perform) {
            Text(title).font(.thuso(.body, weight: .semibold)).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(prominent ? ThusoRole.surface : ThusoRole.foreground)
                .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(prominent ? ThusoRole.foreground : ThusoRole.surface, in: shape)
                .overlay(shape.stroke(ThusoRole.foreground, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func choiceRow(title: String, detail: String, selected: Bool, choose: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return Button(action: choose) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(title).font(.thuso(.subheadline, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                Text(detail).font(.thuso(.footnote)).foregroundStyle(selected ? ThusoRole.foreground : ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(ThusoRole.foreground)
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(selected ? ThusoRole.surfaceRaised : ThusoRole.surface, in: shape)
            .overlay(shape.stroke(selected ? ThusoRole.foreground : ThusoRole.border, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func listed(_ heading: String, _ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(heading).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            ForEach(items, id: \.self) { item in
                Text(item).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func ruled(_ text: String) -> some View {
        Text(text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
            .padding(.leading, ThusoSpacing.space12)
            .overlay(alignment: .leading) { Rectangle().fill(ThusoRole.foreground).frame(width: 2) }
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
    }
}
