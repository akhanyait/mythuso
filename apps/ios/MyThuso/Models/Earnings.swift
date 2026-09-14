import Foundation

/* What a nurse is paid, and what nobody is allowed to do to it.

   The public page tells South Africa that a MyThuso nurse keeps three quarters of every visit and
   is paid weekly. Until this existed, that promise had nowhere in the product to be true.

   The table itself — the cycle, the five payout states, the four kinds of line, the six rules, the
   four refusals, the account and four weeks of fictional visits — is generated into EarningsData.swift
   from packages/catalog/earnings.json, so nothing below is transcribed by hand. What is here is the
   reasoning: dates resolved from day offsets so the preview never goes stale, and the four sums a
   payout screen is allowed to show.

   The one thing worth saying twice, because it is the difference between this and a spreadsheet:
   no visit amount exists in the source at all. A line names a service; the money is that service's
   nurse share in packages/catalog/services.json — the same row the patient is quoted from. A price
   change moves the quote, the payout and the public claim in one edit, or it fails the build.

   Nothing here is transferred. No bank is contacted, no payment provider exists, and every visit,
   patient and account number below is fictional. */

struct PayCycle {
    let weekEndsOn: String
    let closesOn: String
    let paysOn: String
    let clearsInDays: ClosedRange<Int>
    let note: String
}

/* `settled` is the only bit of state that matters to the arithmetic: it is what separates money a
   nurse has received from money she has been promised. Everything else on a payout screen is
   presentation. */
struct PayoutState: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let settled: Bool
}

struct PayLineKind: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    /// −1 for a reversal. Held on the kind rather than at each site, so a week is the sum of its
    /// lines and nothing downstream has to remember which way round to subtract.
    let sign: Int
}

struct PayRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct PayRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct PayoutAccount {
    let holder: String
    let bank: String
    /// Masked, always. A full account number on a screen is a full account number in a screenshot.
    let maskedNumber: String
    let coolingOffHours: Int
    let reverify: [String]
    let note: String
}

struct TaxYear {
    let startsOn: String
    let label: String
    let note: String
}

struct PayLine: Identifiable, Hashable {
    let kind: String
    let reference: String
    let onDays: Int
    let patient: String
    let area: String?
    let plan: String?
    /// The service's name, or nil for a reversal or a correction, which are not visits.
    let service: String?
    let reason: String?
    /// Already signed by the generator.
    let amount: Int
    var id: String { "\(reference)-\(kind)" }
    var on: Date { Date().addingTimeInterval(TimeInterval(onDays) * 86_400) }
}

struct PayWeek: Identifiable, Hashable {
    let id: String
    let state: String
    let weeksAgo: Int
    /// Days after the pay date the money actually landed. A fact about a transfer, and unlike a week
    /// boundary it is not tied to a weekday, so it stays an offset.
    let paidDaysAfterPayDate: Int?
    let failure: String?
    let lines: [PayLine]

    /* Derived from the cycle rather than from a fixed offset. These used to be endsInDays and
       paysInDays, which cannot express "the Sunday this week ends on": an offset lands on the
       intended weekday one day in seven, so the contract was right on Mondays and wrong the rest of
       the week. On 9 September every week ended on a Friday while the cycle said Sunday, and the
       current one paid on a Monday while the same file said Wednesday. */
    private static func onOrAfter(_ from: Date, _ weekday: String) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Scheduling.zone
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let target = (names.firstIndex(of: weekday) ?? 0) + 1
        let start = calendar.startOfDay(for: from)
        let ahead = (target - calendar.component(.weekday, from: start) + 7) % 7
        return calendar.date(byAdding: .day, value: ahead, to: start) ?? start
    }

    var ends: Date {
        let next = PayWeek.onOrAfter(Date(), Earnings.cycle.weekEndsOn)
        return next.addingTimeInterval(TimeInterval(-7 * weeksAgo) * 86_400)
    }
    /// The first paysOn strictly after the week ends — Sunday to Wednesday, never Sunday to Sunday.
    var pays: Date { PayWeek.onOrAfter(ends.addingTimeInterval(86_400), Earnings.cycle.paysOn) }
    var paidOn: Date? { paidDaysAfterPayDate.map { pays.addingTimeInterval(TimeInterval($0) * 86_400) } }
    var total: Int { lines.reduce(0) { $0 + $1.amount } }
    /// Visits, not lines: a reversal is not a visit and counting it as one would overstate the week.
    var visits: Int { lines.filter { $0.service != nil }.count }
    var hasDeduction: Bool { lines.contains { $0.amount < 0 } }
}

enum Earnings {
    static func state(_ id: String) -> PayoutState { states.first { $0.id == id } ?? states[0] }
    static func lineKind(_ id: String) -> PayLineKind { lineKinds.first { $0.id == id } ?? lineKinds[0] }
    static func rule(_ id: String) -> PayRule { rules.first { $0.id == id } ?? rules[0] }
    static func refusal(_ id: String) -> PayRefusal { refusals.first { $0.id == id } ?? refusals[0] }

    static var currentWeek: PayWeek { weeks.first { $0.state == "accruing" } ?? weeks[0] }

    /* Received, not earned. Money still on its way is not income a nurse has had, so the tax-year
       figure counts settled weeks only — the same distinction the note beside it makes. Getting
       this the other way round would put a number on a screen that a nurse might reasonably act on
       and that SARS would not recognise. */
    static var paidThisTaxYear: Int { weeks.filter { state($0.state).settled }.reduce(0) { $0 + $1.total } }
    static var owedNotYetPaid: Int {
        weeks.filter { !state($0.state).settled && $0.state != "accruing" }.reduce(0) { $0 + $1.total }
    }

    /* One visit, taken apart. The payment cost is the platform's to carry: it comes off what
       MyThuso keeps, never off what the nurse is paid, which is the first of the six rules. */
    struct Split {
        let price: Int
        let nurse: Int
        let payment: Int
        let platform: Int
        var nurseShareOfPrice: Double { Double(nurse) / Double(price) }
    }
    /// The card fee from the proposal's worked example. Held here beside the split it belongs to.
    static let paymentCost = 9
    static func split(_ service: CareService) -> Split {
        let nurse = nurseShare(service)
        return Split(price: service.price, nurse: nurse, payment: paymentCost,
                     platform: service.price - nurse - paymentCost)
    }
    /// A dictionary lookup into the generated table, not a percentage applied to a price.
    static func nurseShare(_ service: CareService) -> Int { nurseShares[service.id] ?? 0 }
    /// The services a nurse can be paid for at launch, which is what the split picker offers.
    static var pricedServices: [CareService] { CareService.all.filter { nurseShares[$0.id] != nil } }
    static var shareRange: (low: Int, high: Int) {
        let shares = nurseShares.values
        return (shares.min() ?? 0, shares.max() ?? 0)
    }

    /* A rand amount, written the one way this product writes them: a space between the thousands, a
       leading R, and the sign never carried on the digits — a reversal is drawn as a deduction by
       the row it is on, not by a minus inside the figure.
       Split in two because one screen needs the halves apart: a metric writes the R as its own
       prefix, at its own size, so that it is R 598 and never 598 R. It lived as a private helper in
       Features/EarningsView.swift, which is the only place that could reach it; the nurse's deck
       needs the same figure, and a second formatter is how R 1 495 and R1,495 end up on two screens
       of one application. */
    static func randDigits(_ amount: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = " "
        return formatter.string(from: NSNumber(value: abs(amount))) ?? String(abs(amount))
    }
    static func rand(_ amount: Int) -> String { "R \(randDigits(amount))" }
}
