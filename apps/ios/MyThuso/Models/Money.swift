import Foundation

/* Thuso Money, as far as a phone with no provider can honestly go.

   The tables — the ways to pay, the payment states and their words, the cash code's length, the
   doctor's per-case fee and the three signed sample cases — are generated into MoneyData.swift from
   packages/catalog/money.json. What is here is the types and the two decisions a screen asks:

   Which ways to pay a visit are offered. A wallet is named and not offered, because a balance that
   nothing holds cannot pay for anything.

   What a doctor is owed. Nothing, while the fee is undecided — not zero, which would be a figure,
   but nil, which the fee screen renders as the contract's own sentence. The range the documents give
   is shown beside it as a range, never as the price, and it was read from the funding proposal's
   model when this was generated rather than typed here.

   The engine in packages/engines/src/money refuses to schedule a doctor's payout while the fee is
   null. This file cannot schedule anything, so it only refuses to show a figure. */

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
    /// nil until somebody named decides it. There is no default.
    let amount: Int?
    let decidedBy: String?
    let decidedOn: String?
    let rangeLow: Int
    let rangeHigh: Int
    let source: String
    let undecided: String
    let whoDecides: String

    var isDecided: Bool {
        guard let amount, decidedBy != nil, decidedOn != nil else { return false }
        return amount >= rangeLow && amount <= rangeHigh
    }
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

    /// What a doctor is owed for these cases, or nil while the fee is undecided.
    static func owed(for cases: [SignedCase], fee: DoctorFee = reviewFee) -> Int? {
        guard fee.isDecided, let amount = fee.amount else { return nil }
        return amount * cases.count
    }

    /// What the payment step says once a visit is booked on a phone with no provider.
    static func afterBooking(methodName: String) -> String {
        method(named: methodName)?.id == "cash-otp" ? cashPendingWords : providerlessWords
    }
}
