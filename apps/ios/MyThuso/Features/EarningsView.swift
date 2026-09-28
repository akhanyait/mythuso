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
                deck
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
                .font(.thuso(.title3)).foregroundStyle(allowed ? DeckInk.sheetInk : ThusoRole.warningInk)
            VStack(alignment: .leading, spacing: 5) {
                Text(allowed ? "Cleared for visits" : "You will not be sent new visits")
                    .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                Text(allowed ? "Every check is verified and in date. Visits can be sent to you."
                             : (decision?.reason ?? ""))
                    .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                if !allowed {
                    Text(Earnings.rule("suspension-is-not-confiscation").sentence)
                        .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetInk)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /* THE MONEY IS THE DECK, AND THE STANDING STANDS ON IT.
       Three cards of equal weight used to hold this week, what is owed and the tax year, so the figure
       a nurse opens this screen for was the size of the two she reads once a month. This week is the
       lead now, on glass, with the completed weeks drawn behind it; what is owed is the pale panel, its
       columns the weeks themselves, lit where a week is neither settled nor still accruing — which is
       Earnings.owedNotYetPaid's own filter, so the drawing and the figure cannot disagree; and the tax
       year is the night card crossing the panel's edge. The banner that reads the vetting register is
       the sheet on the canvas's edge, mango when it refuses. Switching the nurse on the canvas changes
       the banner and not one figure, which is the rule made visible rather than asserted. */
    private var deck: some View {
        let chronological = Earnings.weeks.sorted { $0.ends < $1.ends }
        let allowed = nurse.map { can($0, "take-visit").allowed } ?? false
        return DeckHero(sheetFill: allowed ? ThusoRole.surface : DeckInk.attentionWash) {
            DeckPreviewMark()
            DeckHeadline(eyebrow: "Nurse workspace", words: [.text("Earnings"), .glyph("creditcard"), .text("& payouts")],
                         tail: "Fictional visits, a fictional bank, and nothing transferred.")
            DeckPills(label: "Preview this screen as", selection: $who,
                      options: payPreviewNurses.map { ($0, vetting.subject($0)?.name ?? $0) })
            Text("The same earnings, seen by a cleared nurse and by one whose police clearance lapsed nine days ago. Only the banner changes — which is the rule.")
                .font(.thuso(.footnote)).foregroundStyle(DeckInk.quiet)
                .fixedSize(horizontal: false, vertical: true)
            DeckGlass {
                DeckFigure(value: Earnings.randDigits(Earnings.currentWeek.total), prefix: "R ", label: "This week so far",
                           chip: "\(Earnings.currentWeek.visits) visits · closes \(Earnings.cycle.closesOn), pays \(Earnings.cycle.paysOn)",
                           shape: .spark(weeks: chronological.filter { $0.state != "accruing" }.map(\.total)))
            }
            DeckPanel {
                DeckFigure(value: Earnings.randDigits(Earnings.owedNotYetPaid), prefix: "R ", label: "Owed, not yet in your account",
                           chip: "On its way, or waiting on a bank",
                           shape: .columns(values: chronological.map(\.total),
                                           lit: chronological.map { !Earnings.state($0.state).settled && $0.state != "accruing" }),
                           ground: .panel)
            } float: {
                DeckFigure(value: Earnings.randDigits(Earnings.paidThisTaxYear), prefix: "R ", label: "Reached your account this tax year",
                           chip: "Since \(Earnings.taxYear.startsOn) · \(Earnings.taxYear.label)", ground: .night)
            }
        } sheet: {
            standing
        }
    }

    // MARK: - The split

    private var split: some View {
        let parts = Earnings.split(service)
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: "Where the money goes")
            CareCard {
                DeckPills(label: "Show the split for", selection: $serviceId,
                          options: Earnings.pricedServices.map { ($0.id, $0.name) }, onNight: false)
                GeometryReader { geometry in
                    HStack(spacing: 3) {
                        bar(DeckInk.sheetInk, parts.nurse, parts.price, geometry.size.width)
                        bar(ThusoRole.warning, parts.payment, parts.price, geometry.size.width)
                        bar(ThusoRole.accent, parts.platform, parts.price, geometry.size.width)
                    }
                }
                .frame(height: 16)
                .studioChartEntrance(identity: serviceId)
                .accessibilityLabel("Of \(rand(parts.price)), \(rand(parts.nurse)) is yours, \(rand(parts.payment)) is the card fee and \(rand(parts.platform)) is what MyThuso keeps")
                legend(DeckInk.sheetInk, rand(parts.nurse), "Yours · \(Int((parts.nurseShareOfPrice * 100).rounded()))% of the price")
                legend(ThusoRole.warning, rand(parts.payment), "The card fee, paid by MyThuso")
                legend(ThusoRole.accent, rand(parts.platform), "What MyThuso keeps")
                /* Opened by what the share is, in Money's setting as generated, which never states a fraction:
                   the share above it is not the same part of every visit. */
                Text("\(Money.nurseShareSentence) \(Earnings.rule("share-is-not-reduced").sentence)")
                    .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                Text("Across the nine services at launch that is \(rand(Earnings.shareRange.low)) to \(rand(Earnings.shareRange.high)) a visit — the same range the public page advertises, read from the same catalogue.")
                    .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
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
                Text(amount).font(.thuso(.callout, weight: .semibold)).monospacedDigit().foregroundStyle(DeckInk.sheetInk)
                Text(note).font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
            }
        }
    }

    // MARK: - Weeks

    private var weeks: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: "Your weeks", count: "\(Earnings.weeks.count)", note: Earnings.cycle.note)
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
                        Text(rand(week.total)).font(.thuso(.title3, weight: .bold)).monospacedDigit()
                            .foregroundStyle(DeckInk.sheetInk)
                        Text("Week to \(week.ends.formatted(payDay)) · \(week.visits) visits")
                            .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                    }
                    Spacer(minLength: 8)
                    StatusPill(text: state.name, tone: week.state == "paid" ? "teal" : week.state == "failed" ? "danger" : week.state == "in-transit" ? "sky" : "amber")
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(open ? "Collapse the week" : "Show every line in the week")

            if open {
                Text(state.detail).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                if let paidOn = week.paidOn {
                    Text("Paid into \(Earnings.account.maskedNumber) on \(paidOn.formatted(payFullDay)).")
                        .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                }
                if let failure = week.failure {
                    Text(failure).font(.thuso(.caption)).foregroundStyle(ThusoRole.dangerInk)
                        .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(ThusoRole.dangerTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                }
                ForEach(week.lines) { line in payLine(line) }
                Divider()
                HStack {
                    Text("Total for the week").font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                    Spacer()
                    Text(rand(week.total)).font(.thuso(.subheadline, weight: .semibold)).monospacedDigit()
                }
                if week.hasDeduction {
                    Text(Earnings.rule("every-deduction-is-named").sentence)
                        .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                }
            }
        }
    }

    private func payLine(_ line: PayLine) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(line.service ?? Earnings.lineKind(line.kind).name)
                    .font(.thuso(.footnote, weight: .medium)).foregroundStyle(DeckInk.sheetInk)
                Spacer(minLength: 8)
                Text(line.amount < 0 ? "− \(rand(line.amount))" : rand(line.amount))
                    .font(.thuso(.footnote, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(line.amount < 0 ? ThusoRole.dangerInk : DeckInk.sheetInk)
            }
            Text("\(line.reference) · \(line.patient) · \(line.on.formatted(payDay))")
                .font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            if let plan = line.plan {
                Text(plan).font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetInk)
            }
            if let reason = line.reason {
                Text(reason).font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Tax and the account

    private var tax: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: "Tax")
            CareCard {
                row("Reached your account since \(Earnings.taxYear.startsOn)", rand(Earnings.paidThisTaxYear))
                row("Tax withheld by MyThuso", rand(0))
                Text(Earnings.taxYear.note).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                Text(Earnings.rule("no-tax-withheld").sentence).font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                refusal(Earnings.refusal("advise-on-tax"))
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
            Spacer(minLength: 8)
            Text(value).font(.thuso(.subheadline, weight: .semibold)).monospacedDigit().foregroundStyle(DeckInk.sheetInk)
        }
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: "Where you are paid")
            CareCard {
                HStack(spacing: ThusoSpacing.space12) {
                    TileIcon(symbol: "building.columns", size: 38)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(Earnings.account.bank) · \(Earnings.account.maskedNumber)")
                            .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                        Text(Earnings.account.holder).font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                    }
                }
                Text(Earnings.account.note).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                if accountStage == "settled" {
                    Button("Change account") { accountStage = "verifying" }.buttonStyle(QuietButton())
                    Text(Earnings.rule("account-change-waits").sentence)
                        .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                } else if accountStage == "verifying" {
                    Text("Before anything changes, we check it is you. Nothing here is sent.")
                        .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                    ForEach(Earnings.account.reverify, id: \.self) { step in
                        Label(step, systemImage: "lock").font(.thuso(.caption)).foregroundStyle(DeckInk.sheetInk)
                    }
                    TextField("One-time code", text: $code).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    Button("Verify and start the wait") { accountStage = "pending" }
                        .buttonStyle(CareButton()).disabled(code.count != 6)
                    Button("Cancel") { accountStage = "settled"; code = "" }.buttonStyle(QuietButton())
                } else {
                    Text("Waiting \(Earnings.account.coolingOffHours) hours")
                        .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                    Text(Earnings.rule("account-change-waits").sentence)
                        .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                    Button("Cancel the change") { accountStage = "settled"; code = "" }.buttonStyle(QuietButton())
                }
            }
        }
    }

    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: "What this screen will not do", count: "\(Earnings.refusals.filter { $0.id != "advise-on-tax" }.count)")
            ForEach(Earnings.refusals.filter { $0.id != "advise-on-tax" }) { item in
                CareCard { refusal(item) }
            }
            Text("No money moves in this preview. Payment runs, bank verification and a real ledger arrive with the payment provider, and every amount above is arithmetic on the demo catalogue.")
                .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
        }
    }

    private func refusal(_ item: PayRefusal) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "nosign").font(.thuso(.callout)).foregroundStyle(ThusoRole.dangerInk)
            Text(item.sentence).font(.thuso(.caption)).foregroundStyle(DeckInk.sheetInk)
        }
    }

    private func rule(_ id: String) -> some View {
        Text(Earnings.rule(id).sentence).font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
    }
}
