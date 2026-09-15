import SwiftUI

/* MyThuso for Mom on iOS: three prices, what each would bring, and what is not real yet.
 *
 * The web draws the three tiers as one row of choices. A phone at the accessibility text sizes cannot
 * hold "R 1 299 / month" in a third of its width, so here the three are stacked rows — the same choice,
 * the same words, and one tier's inclusions shown beneath it.
 *
 * Every number and sentence is generated into PlansData.swift. Each group of inclusions ends with
 * CapabilityNotice for the capability it waits on, so the sentence is the contract's and disappears
 * the day that capability is connected. There is no button that joins: nothing can be bought, and the
 * payments notice sits above the prices rather than under them. The heading says "would bring" rather
 * than "includes" because a plan does not include a device that has not been built.
 *
 * The names, "Everything in Essential", Plus's call-outs, the report's wording and what priority SOS
 * means are Money's settings. This app has no admin surface, so it shows their defaults as generated,
 * and the two questions this screen used to list as not decided are those settings. */
struct MomPlansView: View {
    @State private var chosen = Plans.mom.tiers.first?.id ?? ""
    private var tier: MomTier { Plans.mom.tiers.first { $0.id == chosen } ?? Plans.mom.tiers[0] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                CareHeading(eyebrow: Plans.mom.payerHeadline, title: Plans.mom.name, subtitle: Plans.mom.payerStatement)
                CapabilityNotice(of: "payments")
                tierChoice
                CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space16) {
                    Text("What \(tier.name) would bring · Phase \(tier.phase)")
                        .font(.headline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let inherits = tier.inherits {
                        Text(inherits).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("mom-inherits")
                    }
                    ForEach(Plans.groups(tier)) { group in
                        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                            ForEach(group.items) { item in inclusionRow(item) }
                            CapabilityNotice(of: group.capability)
                        }
                    }
                }
                section("What no plan does") {
                    ForEach(Plans.mom.refusals) { refusal in
                        Text(refusal.sentence).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.leading, ThusoSpacing.space12)
                            .overlay(alignment: .leading) { Rectangle().fill(ThusoTheme.charcoal).frame(width: 2) }
                    }
                }
                section("Add-ons") {
                    muted(Plans.mom.addOnsStatement)
                    ForEach(Plans.mom.addOns) { addOn in
                        Text(addOn.name).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    }
                }
                section("Sharing the cost") { muted(Plans.mom.splittingStatement) }
                /* The way into the Essential journey, under everything the plan says it will not do, so the refusals
                   are read first. A preview: it charges nothing, and its own screen says so. */
                NavigationLink { MomEssentialView() } label: {
                    Text(MomEssential.fill(MomEssentialData.Words.open, ["plan": MomEssential.planName]))
                        .font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoTheme.charcoal, lineWidth: 1))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("mom-essential-open")
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(Plans.mom.name)
    }

    /* Selected by a lilac ground and a charcoal border together, and announced as selected — never by
       the fill alone. Each row is one element for VoiceOver: name, cadence and price in one breath. */
    private var tierChoice: some View {
        VStack(spacing: ThusoSpacing.space8) {
            ForEach(Plans.mom.tiers) { option in
                let selected = option.id == chosen
                let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                Button { chosen = option.id } label: {
                    HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.name).font(.subheadline.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true)
                            Text(option.cadence).thusoFont(ThusoType.caption)
                                .foregroundStyle(selected ? ThusoTheme.charcoal : ThusoTheme.studioInkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: ThusoSpacing.space8)
                        Text("\(Earnings.rand(option.price)) / month").font(.callout.weight(.medium)).monospacedDigit()
                            .multilineTextAlignment(.trailing)
                            .fixedSize(horizontal: false, vertical: true)
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
                .accessibilityIdentifier("mom-tier-\(option.id)")
            }
        }
    }

    private func inclusionRow(_ item: MomInclusion) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Text("•").font(.subheadline).foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(item.text).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = item.detail { muted(detail) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("mom-inclusion-\(item.id)")
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(title).font(.headline).foregroundStyle(ThusoTheme.charcoal).accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
