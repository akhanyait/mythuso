import Foundation

/* Thuso Money, as far as a phone with no provider can honestly go.

   The tables — the ways to pay, the payment states and their words, the cash code's length, the
   doctor's per-case fee and the three signed sample cases — are generated into MoneyData.swift from
   packages/catalog/money.json. What is here is the types and the two decisions a screen asks:

   Which ways to pay a visit are offered. A wallet is named and not offered, because a balance that
   nothing holds cannot pay for anything.

   What a doctor is owed. The fee is Money's setting, and this app has no admin surface, so it is the
   default as generated: a proposal inside the range the documents give, which nobody has confirmed. A
   proposal pays nobody, so while it is unconfirmed a doctor is owed nothing — not zero, which would be
   a figure, but nil, which the fee screen renders beside the contract's own sentence. The range is
   shown beside the fee as a range, and it is the setting's bounds, generated rather than typed here.

   The engine in packages/engines/src/money refuses to schedule a doctor's payout at a fee nobody has
   confirmed. This file cannot schedule anything, so it only refuses to work out a figure. */

enum Money {}

struct MoneyMethod: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let forVisit: Bool
    let forPlan: Bool
    let offered: Bool
}

struct MoneyPaymentState: Identifiable, Hashable {
    let id: String
    let name: String
    let words: String
}

struct DoctorFee: Identifiable, Hashable {
    var id: String { feeCode }
    let feeCode: String
    let name: String
    /// The fee in cents, as Money's setting gives it by default.
    let amountCents: Int
    /// Whether an admin has confirmed it. A proposal is shown and pays nobody.
    let confirmed: Bool
    let rangeLowCents: Int
    let rangeHighCents: Int
    let source: String
    let unconfirmedWords: String
    let confirmedWords: String
    let whoSets: String

    var isPayable: Bool { confirmed && amountCents >= rangeLowCents && amountCents <= rangeHighCents }
}

struct SignedCase: Identifiable, Hashable {
    var id: String { reviewRef }
    let reviewRef: String
    let onDays: Int
    var date: Date { Calendar.current.date(byAdding: .day, value: onDays, to: Date()) ?? Date() }
}

extension Money {
    static var visitMethods: [MoneyMethod] { methods.filter { $0.offered && $0.forVisit } }
    static func method(named name: String) -> MoneyMethod? { methods.first { $0.name == name } }
    static func state(_ id: String) -> MoneyPaymentState { states.first { $0.id == id } ?? states[0] }
    static func refusal(_ id: String) -> String { refusals[id] ?? "" }
    static var reviewFee: DoctorFee { doctorFees[0] }

    /// An amount in cents as rand, with the cents only when there are some.
    static func randCents(_ cents: Int) -> String {
        cents % 100 == 0 ? Earnings.rand(cents / 100) : "\(Earnings.rand(cents / 100)).\(String(format: "%02d", cents % 100))"
    }

    /// What a doctor is owed for these cases, in cents, or nil while the fee is not confirmed.
    static func owed(for cases: [SignedCase], fee: DoctorFee = reviewFee) -> Int? {
        guard fee.isPayable else { return nil }
        return fee.amountCents * cases.count
    }

    /// What the payment step says once a visit is booked on a phone with no provider.
    static func afterBooking(methodName: String) -> String {
        method(named: methodName)?.id == "cash-otp" ? cashPendingWords : providerlessWords
    }
}
