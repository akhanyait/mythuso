import SwiftUI

/* Earnings and payouts, for the nurse.

   The public page tells South Africa that a MyThuso nurse keeps three quarters of every visit and
   is paid weekly. This is where that promise has to survive contact with a real week: a payout that
   the bank sent back, a visit refunded to the patient after it was counted, and a police clearance
   that lapsed on Tuesday.

   Four numbers in a card would have been the easy version. The parts that matter are the ones a
   payout screen has to refuse:

     Nothing comes off the nurse's share. The card fee comes out of MyThuso's quarter, and the whole
     split is shown — including what MyThuso keeps — because a marketplace that hides its own cut is
     asking to be guessed at.

     A suspension is not a confiscation. The banner at the top reads the same vetting record that
     stops dispatch, so the two can never disagree, and the money for work already done is untouched
     by it. The picker under the banner switches between a cleared nurse and one whose clearance
     lapsed nine days ago: the banner changes and not one figure moves, which is the rule made
     visible rather than asserted.

     Nothing is money until it says paid. One of the four weeks below did not go through.

     No tax is withheld, and MyThuso will not advise on it. Both said out loud.

     Changing where you are paid waits 48 hours, because account takeover is how a stolen sign-in
     becomes a stolen payout.

   Nothing is transferred. No bank is contacted and every visit, patient and account number is
   fictional. */

private let payPreviewNurses = ["N-205", "N-204"]

/// The contract's own formatter, kept under the name this file's sixty call sites already use.
/// It moved to Models/Earnings.swift when the nurse's deck needed the same figure without the R.
private func rand(_ amount: Int) -> String { Earnings.rand(amount) }
private let payDay = Date.FormatStyle().day().month(.abbreviated)
private let payFullDay = Date.FormatStyle().weekday(.abbreviated).day().month(.wide)

struct EarningsView: View {
    @ObservedObject private var vetting = VettingStore.shared
    @State private var who = payPreviewNurses[0]
    @State private var serviceId = "wound"
    @State private var openWeek: String? = Earnings.weeks.count > 1 ? Earnings.weeks[1].id : nil
    @State private var accountStage = "settled"
    @State private var code = ""

    private var nurse: VettingSubject? { vetting.subject(who) }
    private var service: CareService { CareService.all.first { $0.id == serviceId } ?? CareService.all[0] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Nurse workspace", title: "Earnings & payouts",
                            subtitle: "Fictional visits, a fictional bank, and nothing transferred.")
                standing
                nursePicker
                totals
                rule("accrued-is-not-paid")
                split
                weeks
                tax
                account
                refusals
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Earnings & payouts").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Standing

    /* Read from the vetting register, not from a flag on the payout. If the two could be set
       separately, a nurse could be told she is cleared on one screen and refused on another. */
    @ViewBuilder private var standing: some View {
        let decision = nurse.map { can($0, "take-visit") }
        let allowed = decision?.allowed ?? false
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: allowed ? "checkmark.seal.fill" : "exclamationmark.shield.fill")
                .font(.title3).foregroundStyle(allowed ? ThusoTheme.charcoal : ThusoTheme.mangoInk)
            VStack(alignment: .leading, spacing: 5) {
                Text(allowed ? "Cleared for visits" : "You will not be sent new visits")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(allowed ? "Every check is verified and in date. Visits can be sent to you."
                             : (decision?.reason ?? ""))
                    .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                if !allowed {
                    Text(Earnings.rule("suspension-is-not-confiscation").sentence)
                        .font(.caption).foregroundStyle(ThusoTheme.charcoal)
                }
            }
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(allowed ? ThusoTheme.studioLilac : ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }

    private var nursePicker: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Picker("Preview this screen as", selection: $who) {
                ForEach(payPreviewNurses, id: \.self) { id in
                    Text(vetting.subject(id)?.name ?? id).tag(id)
                }
            }
            .pickerStyle(.segmented)
            Text("The same earnings, seen by a cleared nurse and by one whose police clearance lapsed nine days ago. Only the banner changes — which is the rule.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    // MARK: - Totals

    private var totals: some View {
        VStack(spacing: ThusoSpacing.space12) {
            metric("This week so far", rand(Earnings.currentWeek.total),
                   "\(Earnings.currentWeek.visits) visits · closes \(Earnings.cycle.closesOn), pays \(Earnings.cycle.paysOn)",
                   weight: .lead, size: .largeTitle)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: ThusoSpacing.space12) { secondaryTotals }
                VStack(spacing: ThusoSpacing.space12) { secondaryTotals }
            }
        }
    }

    @ViewBuilder private var secondaryTotals: some View {
        metric("Owed, not yet in your account", rand(Earnings.owedNotYetPaid), "On its way, or waiting on a bank")
        metric("Reached your account this tax year", rand(Earnings.paidThisTaxYear),
               "Since \(Earnings.taxYear.startsOn) · \(Earnings.taxYear.label)")
    }

    private func metric(_ label: String, _ value: String, _ note: String,
                        weight: CardWeight = .plain, size: Font = .title2) -> some View {
        CareCard(weight: weight, spacing: ThusoSpacing.space4) {
            Text(label).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            Text(value).font(size.weight(.bold)).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
                .minimumScaleFactor(0.7).lineLimit(1)
            Text(note).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - The split

    private var split: some View {
        let parts = Earnings.split(service)
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Where the money goes").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                Picker("Show the split for", selection: $serviceId) {
                    ForEach(Earnings.pricedServices) { Text($0.name).tag($0.id) }
                }
                GeometryReader { geometry in
                    HStack(spacing: 3) {
                        bar(ThusoTheme.charcoal, parts.nurse, parts.price, geometry.size.width)
                        bar(ThusoTheme.mango, parts.payment, parts.price, geometry.size.width)
                        bar(ThusoTheme.teal, parts.platform, parts.price, geometry.size.width)
                    }
                }
                .frame(height: 16)
                .studioChartEntrance(identity: serviceId)
                .accessibilityLabel("Of \(rand(parts.price)), \(rand(parts.nurse)) is yours, \(rand(parts.payment)) is the card fee and \(rand(parts.platform)) is what MyThuso keeps")
                legend(ThusoTheme.charcoal, rand(parts.nurse), "Yours · \(Int((parts.nurseShareOfPrice * 100).rounded()))% of the price")
                legend(ThusoTheme.mango, rand(parts.payment), "The card fee, paid by MyThuso")
                legend(ThusoTheme.teal, rand(parts.platform), "What MyThuso keeps")
                Text(Earnings.rule("share-is-not-reduced").sentence)
                    .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                Text("Across the nine services at launch that is \(rand(Earnings.shareRange.low)) to \(rand(Earnings.shareRange.high)) a visit — the same range the public page advertises, read from the same catalogue.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
    }

    private func bar(_ colour: Color, _ part: Int, _ whole: Int, _ width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4).fill(colour)
            .frame(width: max(6, width * CGFloat(part) / CGFloat(whole)))
    }

    private func legend(_ colour: Color, _ amount: String, _ note: String) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space8) {
            RoundedRectangle(cornerRadius: 3).fill(colour).frame(width: 11, height: 11).padding(.top, 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(amount).font(.callout.weight(.semibold)).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
                Text(note).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
    }

    // MARK: - Weeks

    private var weeks: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Your weeks").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(Earnings.cycle.note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            ForEach(Earnings.weeks) { entry in weekCard(entry) }
        }
    }

    private func weekCard(_ week: PayWeek) -> some View {
        let state = Earnings.state(week.state)
        let open = openWeek == week.id
        return CareCard {
            Button {
                withAnimation(.easeOut(duration: 0.22)) { openWeek = open ? nil : week.id }
            } label: {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(rand(week.total)).font(.title3.weight(.bold)).monospacedDigit()
                            .foregroundStyle(ThusoTheme.charcoal)
                        Text("Week to \(week.ends.formatted(payDay)) · \(week.visits) visits")
                            .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                    Spacer(minLength: 8)
                    StatusPill(text: state.name, tone: week.state == "paid" ? "teal" : week.state == "failed" ? "danger" : week.state == "in-transit" ? "sky" : "amber")
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(open ? "Collapse the week" : "Show every line in the week")

            if open {
                Text(state.detail).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                if let paidOn = week.paidOn {
                    Text("Paid into \(Earnings.account.maskedNumber) on \(paidOn.formatted(payFullDay)).")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                if let failure = week.failure {
                    Text(failure).font(.caption).foregroundStyle(ThusoTheme.danger)
                        .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                }
                ForEach(week.lines) { line in payLine(line) }
                Divider()
                HStack {
                    Text("Total for the week").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    Spacer()
                    Text(rand(week.total)).font(.subheadline.weight(.semibold)).monospacedDigit()
                }
                if week.hasDeduction {
                    Text(Earnings.rule("every-deduction-is-named").sentence)
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                }
            }
        }
    }

    private func payLine(_ line: PayLine) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(line.service ?? Earnings.lineKind(line.kind).name)
                    .font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                Text(line.amount < 0 ? "− \(rand(line.amount))" : rand(line.amount))
                    .font(.footnote.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(line.amount < 0 ? ThusoTheme.danger : ThusoTheme.charcoal)
            }
            Text("\(line.reference) · \(line.patient) · \(line.on.formatted(payDay))")
                .font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
            if let plan = line.plan {
                Text(plan).font(.caption2).foregroundStyle(ThusoTheme.charcoal)
            }
            if let reason = line.reason {
                Text(reason).font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Tax and the account

    private var tax: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Tax").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                row("Reached your account since \(Earnings.taxYear.startsOn)", rand(Earnings.paidThisTaxYear))
                row("Tax withheld by MyThuso", rand(0))
                Text(Earnings.taxYear.note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text(Earnings.rule("no-tax-withheld").sentence).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                refusal(Earnings.refusal("advise-on-tax"))
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Spacer(minLength: 8)
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
        }
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Where you are paid").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                HStack(spacing: ThusoSpacing.space12) {
                    TileIcon(symbol: "building.columns", size: 38)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(Earnings.account.bank) · \(Earnings.account.maskedNumber)")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        Text(Earnings.account.holder).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                }
                Text(Earnings.account.note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                if accountStage == "settled" {
                    Button("Change account") { accountStage = "verifying" }.buttonStyle(QuietButton())
                    Text(Earnings.rule("account-change-waits").sentence)
                        .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                } else if accountStage == "verifying" {
                    Text("Before anything changes, we check it is you. Nothing here is sent.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    ForEach(Earnings.account.reverify, id: \.self) { step in
                        Label(step, systemImage: "lock").font(.caption).foregroundStyle(ThusoTheme.charcoal)
                    }
                    TextField("One-time code", text: $code).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    Button("Verify and start the wait") { accountStage = "pending" }
                        .buttonStyle(CareButton()).disabled(code.count != 6)
                    Button("Cancel") { accountStage = "settled"; code = "" }.buttonStyle(QuietButton())
                } else {
                    Text("Waiting \(Earnings.account.coolingOffHours) hours")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(Earnings.rule("account-change-waits").sentence)
                        .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    Button("Cancel the change") { accountStage = "settled"; code = "" }.buttonStyle(QuietButton())
                }
            }
        }
    }

    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("What this screen will not do").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Earnings.refusals.filter { $0.id != "advise-on-tax" }) { item in
                CareCard { refusal(item) }
            }
            Text("No money moves in this preview. Payment runs, bank verification and a real ledger arrive with the payment provider, and every amount above is arithmetic on the demo catalogue.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    private func refusal(_ item: PayRefusal) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "nosign").font(.callout).foregroundStyle(ThusoTheme.danger)
            Text(item.sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal)
        }
    }

    private func rule(_ id: String) -> some View {
        Text(Earnings.rule(id).sentence).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
    }
}
