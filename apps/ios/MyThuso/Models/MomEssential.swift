import Foundation

/* MyThuso for Mom Essential on a phone: the journey as far as a phone can honestly walk it.
 *
 * A son or daughter asks for the plan for a parent, the parent agrees as herself and chooses what they see, and the
 * first month is paid. Every word is generated into MomEssentialData.swift from packages/catalog/mom-essential.json;
 * the tier's name, price and inclusions are PlansData's; what a statement line may say and what a sponsor sees are
 * ProgrammesData's. This file is the arithmetic, and it is apps/web/src/lib/mom-essential.ts's reasoning rather than a
 * second one.
 *
 * WHAT A PHONE DOES NOT DO. Run the simulated provider. The web's ledger answers a payment through the payment-result
 * door; this app has none, so the pay step says nothing was charged, in packages/catalog/money.json's providerless
 * sentence, and the plan stays agreed and unpaid here. A plan that started on a phone with nobody paying would be the
 * one screen in the app claiming money moved.
 *
 * WHO AGREES. Only the parent. `agree()` refuses when the journey is acting as the sponsor, in the route's own
 * sentence, and the sponsor's screen draws no control that calls it. The states are the contract's, in its order —
 * waiting for her, agreed and unpaid, started — so a stage is a position in that list rather than a word typed here. */
struct MomEssentialState: Identifiable, Hashable {
    let id: String
    let name: String
    let sponsorWords: String
    let parentWords: String
}

struct MomEssentialJourney: Equatable {
    enum Acting: Equatable { case sponsor, parent }
    let sponsor: String
    var parent: String
    private(set) var stateId: String?
    var acting: Acting = .sponsor
    var lineDetail: String = Programmes.lineDetailChoices.first { $0.isDefault }?.id ?? ""
    var shareSummaries = false
    private(set) var sharedUntil: Date?
    private(set) var paymentTried = false

    init(sponsor: String, parent: String) {
        self.sponsor = sponsor
        self.parent = parent
    }

    var state: MomEssentialState? { MomEssentialData.states.first { $0.id == stateId } }
    /// 0 before anything is asked, then the state's position in the contract counting from 1.
    var stage: Int { stateId.flatMap { id in MomEssentialData.states.firstIndex { $0.id == id } }.map { $0 + 1 } ?? 0 }

    mutating func ask() {
        guard stage == 0, acting == .sponsor, let first = MomEssentialData.states.first else { return }
        stateId = first.id
    }

    /// The parent agrees. Refused, in the route's own words, when the journey is acting as the sponsor.
    mutating func agree(now: Date = Date()) -> String? {
        guard acting == .parent else { return MomEssentialData.Words.onlyTheParentAgrees }
        guard stage == 1, MomEssentialData.states.count > 1 else { return nil }
        stateId = MomEssentialData.states[1].id
        sharedUntil = shareSummaries ? Calendar.current.date(byAdding: .day, value: MomEssentialData.summaryDays, to: now) : nil
        return nil
    }

    /// A phone takes no payment. It says so, and the plan does not start.
    mutating func pay() { paymentTried = true }
}

enum MomEssential {
    static var tier: MomTier? { Plans.mom.tiers.first { $0.id == MomEssentialData.planCode } }
    static var planName: String { [Plans.mom.name, tier?.name].compactMap { $0 }.joined(separator: " ") }
    static func first(_ name: String) -> String { name.split(separator: " ").first.map(String.init) ?? name }
    static func fill(_ text: String, _ values: [String: String]) -> String {
        values.reduce(text) { partial, pair in partial.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }
}
