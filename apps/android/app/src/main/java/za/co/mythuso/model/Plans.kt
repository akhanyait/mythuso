package za.co.mythuso.model

/*
 * The care plans, and the arithmetic a plans screen needs.
 *
 * The data is generated into PlansData.kt from packages/catalog/business-model.json and
 * packages/catalog/mom-plans.json. This screen typed five prices until 14 September 2026, and the day
 * the founder replaced the R249 Thuso Mom with three MyThuso for Mom tiers is the day a typed copy
 * would have gone on saying R249 on a phone while the web said R399.
 *
 * Nothing here decides what is real. An inclusion names a capability, and the screen asks
 * `Capabilities` for the sentence to show beside it.
 */

/** `price` is null for a plan sold per package, and for a plan priced by its tiers. */
data class PlanSubscription(
    val id: String, val name: String, val price: Int?, val phase: Int, val includes: String, val tiered: Boolean
)

/** `capability` is an id in packages/catalog/capabilities.json; `device` is set for MyThuso's own
 *  hardware, none of which has been built; `detail` is a sentence saying what the inclusion means, such
 *  as priority SOS's wording, which is a Money setting. */
data class MomInclusion(
    val id: String, val text: String, val capability: String, val device: String?, val detail: String?
)

/** `inherits` is "Everything in Essential" when Money's setting says tiers stack, and null otherwise. */
data class MomTier(val id: String, val name: String, val price: Int, val phase: Int, val cadence: String, val inherits: String?, val includes: List<MomInclusion>)
data class MomAddOn(val id: String, val name: String)
data class MomRefusal(val id: String, val sentence: String)

data class MomPlan(
    val id: String,
    val name: String,
    val payerHeadline: String,
    val payerStatement: String,
    val tiers: List<MomTier>,
    val addOnsStatement: String,
    val addOns: List<MomAddOn>,
    val splittingStatement: String,
    val splittingCapability: String,
    val refusals: List<MomRefusal>
)

data class MomInclusionGroup(val capability: String, val items: List<MomInclusion>)

/* Grouped rather than one notice per row. Plus names two visits and a screening that all wait on
   booking, and three copies of one sentence down a phone screen is the stacked-notice defect the
   capabilities contract exists to end. */
fun momGroups(tier: MomTier): List<MomInclusionGroup> {
    val groups = mutableListOf<MomInclusionGroup>()
    for (item in tier.includes) {
        val last = groups.lastOrNull()
        if (last != null && last.capability == item.capability) groups[groups.lastIndex] = last.copy(items = last.items + item)
        else groups += MomInclusionGroup(item.capability, listOf(item))
    }
    return groups
}

val momPrices: List<Int> get() = momPlan.tiers.map { it.price }

fun momRefusal(id: String): String =
    momPlan.refusals.firstOrNull { it.id == id }?.sentence ?: error("No refusal $id in packages/catalog/mom-plans.json")
