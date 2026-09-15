import Combine
import CryptoKit
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

/* The cash code at the door, for the one preview visit the nurse walks.

   A phone runs no ledger, so this holds what the ledger holds for a cash payment and nothing more: a random
   salt and the SHA-256 of salt and code, the count of wrong codes, and whether the payment is held for the
   operations desk. The code is drawn from the system's cryptographic generator, shown on the patient's
   simulated screen once, and dropped the moment the nurse enters anything. A wrong code counts; at
   Money.cashAttemptLimit the payment is held and the right code is refused too, in the contract's words. The
   phone has no desk, so a held payment stays held here: the release is the operations desk's, on the web. */
@MainActor final class CashCodeDoor: ObservableObject {
    static let shared = CashCodeDoor()

    @Published private(set) var patientCode: String?
    @Published private(set) var held = false
    @Published private(set) var recorded = false
    @Published private(set) var refusal: String?

    /// What the patient owes, from the preview visit's service in the catalogue. Nil if the catalogue has lost it.
    let amountCents: Int?
    private let salt: String
    private let digest: String
    private var wrongAttempts = 0

    private init() {
        var generator = SystemRandomNumberGenerator()
        let code = (0..<Money.cashCodeLength).map { _ in String(Int.random(in: 0...9, using: &generator)) }.joined()
        let salt = (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255, using: &generator)) }.joined()
        self.salt = salt
        digest = Self.digestOf(salt: salt, code: code)
        patientCode = code
        amountCents = CareService.all.first { $0.id == CareData.Preview.serviceId }.map { $0.price * 100 }
    }

    /// The nurse enters the code the patient gives her. The patient's screen forgets its code as she does.
    func enter(_ code: String) {
        patientCode = nil
        guard !recorded else { return }
        guard !held else { refusal = Money.refusal("cash-code-held"); return }
        guard Self.same(Self.digestOf(salt: salt, code: code), digest) else {
            wrongAttempts += 1
            held = wrongAttempts >= Money.cashAttemptLimit
            refusal = Money.refusal(held ? "cash-code-held" : "cash-without-otp")
            return
        }
        recorded = true
        refusal = nil
    }

    private static func digestOf(salt: String, code: String) -> String {
        SHA256.hash(data: Data("\(salt):\(code)".utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /* Compared across the whole length whatever the first difference, as the ledger does. */
    private static func same(_ left: String, _ right: String) -> Bool {
        let l = Array(left.utf8), r = Array(right.utf8)
        guard l.count == r.count else { return false }
        return zip(l, r).reduce(0) { $0 | ($1.0 ^ $1.1) } == 0
    }
}
