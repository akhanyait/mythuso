import SwiftUI

/* What you are paying for, and what paying for it does not buy you.
 *
 * "Sponsored care" has been a word under a family member's name since the family screens were
 * written, and there has never been anything behind it. A reviewer could see a sponsor's statement
 * in the programmes screen; the person actually paying could not see what they had bought, what was
 * left, or — the part this screen exists for — where the line is between the two.
 *
 * The design decision worth defending is that the refusal is not a footnote. Two lists, equal
 * weight, one after the other: what you see, and what you never see. A screen that lists the three
 * things a sponsor is shown and then mentions in grey underneath that the clinical record is off
 * limits has ordered those two facts by how comfortable they are, and the second one is the one
 * somebody is going to test.
 *
 * The recipient's switch is here as a fact and not as a control. Whether the statement names the
 * service is hers to decide, per sponsor, from her own account — "a line reading sexual health
 * screening discloses more than most diagnoses do" — so this screen shows which way it is set and
 * offers no way to change it. A disabled toggle would have been worse than none: it tells a sponsor
 * they are the sort of person who might be allowed to turn it on.
 *
 * Every sentence is packages/catalog/programmes.json's. Every amount is a service's own price out
 * of the catalogue, because a sponsored visit is not a different visit and there is nowhere in the
 * contract to type a figure. Nothing is paid, no statement is issued, and no sponsorship exists. */

/// Thousands are spaced rather than comma'd, which is how an amount is written in South Africa. The
/// figure and its symbol are separated so a metric can set the R small and leading — R 598, never
/// 598 R, and never a 40-point currency symbol beside a 40-point number.
private func sponsorFigure(_ amount: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = "\u{00A0}"
    return formatter.string(from: NSNumber(value: amount)) ?? String(amount)
}
private func sponsorAmount(_ amount: Int) -> String { "R \(sponsorFigure(amount))" }
private let sponsorDay = Date.FormatStyle().day().month(.wide).year()

struct SponsoredCareView: View {
    /// The family member this account pays for. The household's, not the contract's — see the note
    /// in Models/Sponsorship.swift about the two names that ought to be one.
    var person = "Nomsa Molefe"
    var relation = "Mother"
    private var first: String { person.split(separator: " ").first.map(String.init) ?? person }
    private var initials: String {
        person.split(separator: " ").compactMap(\.first).prefix(2).map(String.init).joined()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Thuso Family", title: "Care you pay for.",
                               subtitle: "What has been used, what it cost, and what paying for it does and does not let you see.")
                CapabilityNotice(of: "payments")
                lead
                drawn
                twoLists
                SurfacePanel(tone: .quiet) {
                    Label(Sponsorship.cannotRequireDetail.sentence, systemImage: "nosign")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                whereTheLineIs
                howItStarts
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Care you pay for").navigationBarTitleDisplayMode(.inline)
    }

    /// Who, and the three figures a person opening a statement is looking for.
    private var lead: some View {
        SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Monogram(text: initials, diameter: 44, background: ThusoRole.surface)
                VStack(alignment: .leading, spacing: 2) {
                    Text(person).thusoFont(ThusoType.cardTitle, weight: .semibold)
                        .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    Text(relation).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                MetricChip(text: "Sponsored care")
            }
            ThusoMetrics {
                ThusoMetric(value: sponsorFigure(Sponsorship.setAside), prefix: "R",
                            label: "You set aside", chip: "For her care")
                ThusoMetric(value: sponsorFigure(Sponsorship.used), prefix: "R", label: "Used so far",
                            chip: "\(Sponsorship.visitsPaidFor) \(Sponsorship.visitsPaidFor == 1 ? "visit" : "visits")")
                ThusoMetric(value: sponsorFigure(Sponsorship.left), prefix: "R", label: "Left to draw on",
                            chip: Sponsorship.left > 0 ? "Available" : "Nothing left")
            }
        }
    }

    /// An amount and a date on every line, and the service only because she has switched that on.
    private var drawn: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("What has been drawn")
            SurfacePanel(spacing: ThusoSpacing.space12) {
                ForEach(Sponsorship.lines) { line in
                    /* A date, what it was, and an amount, in that order and in three columns rather
                       than a table — a two-column FactRow would have put the amount under the date
                       at the accessibility sizes, and the amount is the column a payer reads down. */
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                            Text(line.on.formatted(sponsorDay)).font(.thuso(.footnote))
                                .foregroundStyle(ThusoRole.mutedForeground)
                            Spacer(minLength: ThusoSpacing.space8)
                            Text(sponsorAmount(line.amount)).font(.thuso(.subheadline, weight: .semibold))
                                .monospacedDigit().foregroundStyle(ThusoRole.foreground)
                        }
                        Text(Sponsorship.lineName(line)).font(.thuso(.subheadline))
                            .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    Hairline()
                }
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    Text("Drawn from what you set aside").font(.thuso(.footnote, weight: .semibold))
                        .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: ThusoSpacing.space8)
                    Text(sponsorAmount(Sponsorship.used)).font(.thuso(.subheadline, weight: .semibold))
                        .monospacedDigit().foregroundStyle(ThusoRole.foreground)
                }
                .accessibilityElement(children: .combine)
            }
            /* Not a control. Which of the two settings is on belongs to her, and a switch here —
               even a disabled one — implies it is a thing a sponsor could be given. */
            SurfacePanel(tone: .quiet, spacing: ThusoSpacing.space8) {
                Label(Sponsorship.currentDetail.name, systemImage: "eye.slash")
                    .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Sponsorship.currentDetail.detail).font(.thuso(.footnote))
                    .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                Text("\(first) decides this, in her own account. It is not a setting on this screen and there is no way to ask for it.")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                if Sponsorship.serviceIsNamed {
                    Text(Sponsorship.namingNote).font(.thuso(.footnote))
                        .foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// The two lists, one after the other and the same size. This is the screen.
    private var twoLists: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("What a sponsor sees, and what a sponsor never sees")
            SurfacePanel(spacing: ThusoSpacing.space16) {
                Text("What you see").thusoFont(ThusoType.cardTitle, weight: .semibold)
                    .foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
                ForEach(Sponsorship.sees) { item in
                    StatedFact(term: item.what, statement: item.why)
                }
            }
            SurfacePanel(tone: .quiet, spacing: ThusoSpacing.space16) {
                Text("What you never see").thusoFont(ThusoType.cardTitle, weight: .semibold)
                    .foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
                ForEach(Sponsorship.neverSees) { item in
                    StatedFact(term: item.what, statement: item.why)
                }
            }
        }
    }

    /* Where the line actually is, joined to the model that draws it. The least MyThuso can grant
       anybody is bookings and payments, and a sponsorship is not even that — it grants nothing, and
       granting something is a decision made by her, on her side, with a scope and an end date. */
    private var whereTheLineIs: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("Paying for care is not access to it")
            SurfacePanel(spacing: ThusoSpacing.space16) {
                StatedFact(term: Sponsorship.payingIsNotPermission.title,
                           statement: Sponsorship.payingIsNotPermission.sentence)
                Hairline()
                StatedFact(term: "The least anybody can be given is more than this",
                           /* One sentence out of two, so the sentence reads as one: "Bookings and
                              payments only — They can arrange" was a capital in the middle. */
                           statement: "\(GuardianScope.least.title) — \(GuardianScope.least.body.prefix(1).lowercased())\(GuardianScope.least.body.dropFirst())",
                           footnote: "And that is granted by \(first), from her own account, with an end date on it. A sponsorship grants nothing at all, so there is nothing here to widen.")
            }
            NavigationLink { HouseholdView() } label: {
                Label("See what you may see of \(first)", systemImage: "lock")
                    .frame(maxWidth: .infinity)
            }.buttonStyle(QuietButton())
        }
    }

    private var howItStarts: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("How it starts, and how she stops it")
            SurfacePanel(spacing: ThusoSpacing.space12) {
                StatedFact(term: Sponsorship.consent.headline, statement: Sponsorship.consent.detail,
                           footnote: Sponsorship.consent.withdrawal)
            }
        }
    }
}
