package za.co.mythuso.model

/* The shop and the points, and the arithmetic that keeps them apart from medicine.
 *
 * ShopData.kt and RewardsData.kt beside this file are generated from packages/catalog/shop.json and
 * packages/catalog/rewards.json. What is here is the reasoning and the sums, hand-written:
 *
 *   - Section 18A of the Medicines and Related Substances Act 101 of 1965 prohibits supplying a
 *     medicine according to a bonus, rebate or any other incentive scheme. `isMedicine` enforces
 *     that rather than assuming it — the shop stocks none today, and one that ever appeared in the
 *     catalogue would earn nothing and redeem nothing on arrival.
 *   - What a point is worth appears nowhere below as a number. It is RewardsData.randPerPoint,
 *     multiplied, because a literal here would be a second copy of a figure from the contract.
 *   - A ledger line carries the earning reason's own `discloses` sentence and never a string built
 *     at a call site. The reason for a visit is special personal information under POPIA and a
 *     points history is read casually, shown to family and screenshotted.
 */

data class BasketLine(val productId: String, val quantity: Int)

/** A row in the points history. [note] comes from the contract, never from a caller. */
data class PointsEntry(val id: Int, val reason: String, val note: String, val points: Int)

object Commerce {
    /** Money is integer cents throughout. A rand in a Double is a rounding error waiting for a till. */
    fun goodsCents(lines: List<BasketLine>): Int =
        lines.sumOf { line -> (ShopData.product(line.productId)?.priceCents ?: 0) * line.quantity }

    /** Section 18A, as arithmetic rather than as an intention. The vocabulary is the contract's own. */
    fun isMedicine(product: ShopProduct): Boolean {
        val haystack = "${product.id} ${product.name} ${product.does}".lowercase()
        return shopNeverSold.any { haystack.contains(it.lowercase()) }
    }

    fun earnsPoints(product: ShopProduct): Boolean =
        !isMedicine(product) && ShopData.category(product.category)?.pointsEligible == true

    /** Points earned on a basket. A medicine contributes nothing, whatever its category says. */
    fun pointsEarned(lines: List<BasketLine>): Int {
        val perRand = RewardsData.reason("goods-purchased")?.perRand ?: return 0
        return lines.sumOf { line ->
            val product = ShopData.product(line.productId)
            if (product == null || !earnsPoints(product)) 0
            else ((product.priceCents / 100 * line.quantity) * perRand).toInt()
        }
    }

    /** What a redemption may take off. Never the delivery fee, and never a medicine. */
    fun redeemableCents(lines: List<BasketLine>): Int = lines.sumOf { line ->
        val product = ShopData.product(line.productId)
        if (product == null || isMedicine(product)) 0 else product.priceCents * line.quantity
    }

    fun centsPerPoint(): Int = Math.round(RewardsData.randPerPoint * 100).toInt()

    /** One fee, one threshold, both out of the contract and both stated before a basket is opened. */
    fun deliveryCents(goods: Int, freeDelivery: Boolean): Int =
        if (freeDelivery || goods >= ShopData.deliveryFreeAboveCents) 0 else ShopData.deliveryFeeCents

    fun totalCents(lines: List<BasketLine>, pointsSpent: Int, freeDelivery: Boolean): Int {
        val goods = goodsCents(lines)
        val applied = minOf(pointsSpent * centsPerPoint(), redeemableCents(lines))
        return maxOf(0, goods - applied) + deliveryCents(goods, freeDelivery)
    }

    /** Recognition is worth nothing at any rate, and saying so is why this takes a track. */
    fun randValue(points: Int, track: String): Double =
        if (track == "household") RewardsData.randValue(points) else 0.0

    fun tier(points: Int): RewardTier = RewardsData.tierForPoints(points)
}
