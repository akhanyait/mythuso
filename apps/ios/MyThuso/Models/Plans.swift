import Foundation

/* The care plans, and the arithmetic a plans screen needs.
 *
 * The data is generated into PlansData.swift from packages/catalog/business-model.json and
 * packages/catalog/mom-plans.json. This screen typed five prices until 14 September 2026, and the day
 * the founder replaced the R249 Thuso Mom with three MyThuso for Mom tiers is the day a typed copy
 * would have gone on saying R249 on a phone while the web said R399.
 *
 * Nothing here decides what is real. An inclusion names a capability, and the screen asks
 * `Capabilities` for the sentence to show beside it. */
enum Plans {}

struct PlanSubscription: Identifiable, Hashable {
    let id: String
    let name: String
    /// Nil for a plan sold per package, and for a plan priced by its tiers.
    let price: Int?
    let phase: Int
    let includes: String
    let tiered: Bool
}

struct MomInclusion: Identifiable, Hashable {
    let id: String
    let text: String
    /// An id in packages/catalog/capabilities.json.
    let capability: String
    /// Set when the inclusion is one of MyThuso's own devices, none of which has been built.
    let device: String?
    /// Set when a sentence says what the inclusion means — priority SOS's wording, a Money setting.
    let detail: String?
}

struct MomTier: Identifiable, Hashable {
    let id: String
    let name: String
    let price: Int
    let phase: Int
    let cadence: String
    /// "Everything in Essential", when Money's setting says tiers stack; nil for the first tier or when they do not.
    let inherits: String?
    let includes: [MomInclusion]
}

struct MomAddOn: Identifiable, Hashable { let id: String; let name: String }
struct MomRefusal: Identifiable, Hashable { let id: String; let sentence: String }

struct MomPlan {
    let id: String
    let name: String
    let payerHeadline: String
    let payerStatement: String
    let tiers: [MomTier]
    let addOnsStatement: String
    let addOns: [MomAddOn]
    let splittingStatement: String
    let splittingCapability: String
    let refusals: [MomRefusal]
}

/// Neighbouring inclusions that wait on the same capability, so its notice is said once beside all of them.
struct MomInclusionGroup: Identifiable {
    let capability: String
    let items: [MomInclusion]
    var id: String { items.first?.id ?? capability }
}

extension Plans {
    /* Grouped rather than one notice per row. Plus names two visits and a screening that all wait on
       booking, and three copies of one sentence down a phone screen is the stacked-notice defect the
       capabilities contract exists to end. */
    static func groups(_ tier: MomTier) -> [MomInclusionGroup] {
        var groups: [MomInclusionGroup] = []
        for item in tier.includes {
            if let last = groups.last, last.capability == item.capability {
                groups[groups.count - 1] = MomInclusionGroup(capability: last.capability, items: last.items + [item])
            } else {
                groups.append(MomInclusionGroup(capability: item.capability, items: [item]))
            }
        }
        return groups
    }

    static var momPrices: [Int] { mom.tiers.map(\.price) }

    /* What a row says a plan costs each month. A tiered plan reads as its range rather than as its
       cheapest price, because "R 399 / month" beside a plan whose Premium is R 1 299 is a price a
       person would reasonably expect to pay for everything the plan names. */
    static func monthly(_ plan: PlanSubscription) -> String {
        if plan.tiered, let low = momPrices.min(), let high = momPrices.max() {
            return "\(Earnings.rand(low)) to \(Earnings.rand(high)) / month"
        }
        guard let price = plan.price else { return "Custom pricing" }
        return "\(Earnings.rand(price)) / month"
    }

    static func refusal(_ id: String) -> String {
        guard let found = mom.refusals.first(where: { $0.id == id }) else {
            preconditionFailure("No refusal \(id) in packages/catalog/mom-plans.json")
        }
        return found.sentence
    }
}
