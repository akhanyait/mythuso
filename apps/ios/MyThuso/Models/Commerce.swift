import Foundation

/* The shop and the points, and the arithmetic that keeps them apart from medicine.
 *
 * ShopData.swift and RewardsData.swift beside this file are generated from
 * packages/catalog/shop.json and packages/catalog/rewards.json. What is here is the reasoning and
 * the sums, hand-written, and the sums are the point:
 *
 *   - Section 18A of the Medicines and Related Substances Act 101 of 1965 prohibits supplying a
 *     medicine according to a bonus, rebate or any other incentive scheme. `isMedicine` is how
 *     that is enforced rather than assumed: the shop stocks no medicine today, and if one ever
 *     appears in the catalogue it earns nothing and redeems nothing on arrival.
 *   - What a point is worth appears nowhere below as a number. It is RewardsData.randPerPoint,
 *     multiplied. A literal here would be a second copy of a figure that lives in the contract.
 *   - A ledger line carries the earning reason's own `discloses` sentence and never a string
 *     assembled at a call site, because a points history is read casually and shown to family.
 *     The reason for a visit is special personal information under POPIA; a loyalty screen is the
 *     worst container in the product for it.
 */

struct BasketLine: Identifiable, Hashable {
    var id: String { productId }
    let productId: String
    var quantity: Int
}

/// A row in the points history. `note` comes from the contract, never from a caller.
struct PointsEntry: Identifiable, Hashable {
    let id: Int
    let reason: String
    let note: String
    let points: Int
    let at: Date
    let expiresAt: Date?
}

enum Commerce {
    /// Money is integer cents throughout. A rand in a Double is a rounding error waiting for a till.
    static func goodsCents(_ lines: [BasketLine]) -> Int {
        lines.reduce(0) { total, line in
            guard let product = ShopData.product(line.productId) else { return total }
            return total + product.priceCents * line.quantity
        }
    }

    /// Section 18A, as arithmetic rather than as an intention. The vocabulary is the contract's own.
    static func isMedicine(_ product: ShopData.Product) -> Bool {
        let haystack = "\(product.id) \(product.name) \(product.does)".lowercased()
        return ShopData.neverSold.contains { haystack.contains($0.lowercased()) }
    }

    static func earnsPoints(_ product: ShopData.Product) -> Bool {
        guard !isMedicine(product) else { return false }
        return ShopData.category(product.category)?.pointsEligible == true
    }

    /// Points earned on a basket. A medicine contributes nothing, whatever its category says.
    static func pointsEarned(_ lines: [BasketLine]) -> Int {
        guard let perRand = RewardsData.reason("goods-purchased")?.perRand else { return 0 }
        return lines.reduce(0) { total, line in
            guard let product = ShopData.product(line.productId), earnsPoints(product) else { return total }
            return total + Int(Double(product.priceCents / 100 * line.quantity) * perRand)
        }
    }

    /// What a redemption may take off. Never the delivery fee, and never a medicine — so the
    /// ceiling is the eligible goods rather than the bill.
    static func redeemableCents(_ lines: [BasketLine]) -> Int {
        lines.reduce(0) { total, line in
            guard let product = ShopData.product(line.productId), !isMedicine(product) else { return total }
            return total + product.priceCents * line.quantity
        }
    }

    static func centsPerPoint() -> Int { Int((RewardsData.randPerPoint * 100).rounded()) }

    /// One fee, one threshold, both out of the contract and both stated before a basket is opened.
    static func deliveryCents(goods: Int, freeDelivery: Bool) -> Int {
        if freeDelivery || goods >= ShopData.deliveryFreeAboveCents { return 0 }
        return ShopData.deliveryFeeCents
    }

    static func totalCents(lines: [BasketLine], pointsSpent: Int, freeDelivery: Bool) -> Int {
        let goods = goodsCents(lines)
        let applied = min(pointsSpent * centsPerPoint(), redeemableCents(lines))
        return max(0, goods - applied) + deliveryCents(goods: goods, freeDelivery: freeDelivery)
    }

    /// A balance is worth something only on the household track; recognition is worth nothing at
    /// any rate, and saying so is the whole reason this function takes a track.
    static func randValue(points: Int, track: String) -> Double {
        guard track == "household" else { return 0 }
        return RewardsData.randValue(points)
    }

    static func tier(points: Int) -> RewardsData.Tier { RewardsData.tier(forPoints: points) }
}
