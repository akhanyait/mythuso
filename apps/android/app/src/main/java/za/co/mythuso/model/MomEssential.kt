package za.co.mythuso.model

import java.time.LocalDate

/*
 * MyThuso for Mom Essential on a phone: the journey as far as a phone can honestly walk it.
 *
 * A son or daughter asks for the plan for a parent, the parent agrees as herself and chooses what they see, and the
 * first month is paid. Every word is generated into MomEssentialData.kt from packages/catalog/mom-essential.json; the
 * tier's name, price and inclusions are PlansData's; what a statement line may say and what a sponsor sees are
 * ProgrammesData's. This file is the arithmetic, and it is apps/web/src/lib/mom-essential.ts's reasoning rather than a
 * second one.
 *
 * WHAT A PHONE DOES NOT DO. Run the simulated provider. This app has no payment-result door, so the pay step says
 * nothing was charged, in packages/catalog/money.json's providerless sentence, and the plan stays agreed and unpaid
 * here. A plan that started on a phone with nobody paying would be the one screen claiming money moved.
 *
 * WHO AGREES. Only the parent: agree() refuses, in the route's own sentence, when the journey is acting as the sponsor,
 * and the sponsor's screen draws no control that calls it. A stage is a state's position in the contract's list —
 * waiting for her, agreed and unpaid, started — rather than a word typed here.
 */
data class MomEssentialState(val id: String, val name: String, val sponsorWords: String, val parentWords: String)

data class MomEssentialJourney(
    val sponsor: String = "Lerato Molefe",
    val parent: String = "Nomsa Molefe",
    val stateId: String? = null,
    val actingAsParent: Boolean = false,
    val lineDetail: String = lineDetailChoices.firstOrNull { it.isDefault }?.id ?: "",
    val shareSummaries: Boolean = false,
    val sharedUntil: LocalDate? = null,
    val paymentTried: Boolean = false
) {
    val state: MomEssentialState? get() = MomEssentialData.states.firstOrNull { it.id == stateId }
    /** 0 before anything is asked, then the state's position in the contract counting from 1. */
    val stage: Int get() = if (stateId == null) 0 else MomEssentialData.states.indexOfFirst { it.id == stateId } + 1

    fun ask(): MomEssentialJourney = if (stage == 0 && !actingAsParent) copy(stateId = MomEssentialData.states.first().id) else this

    /** The parent agrees. Refused, in the route's own words, when the journey is acting as the sponsor. */
    fun agree(today: LocalDate = LocalDate.now()): Pair<MomEssentialJourney, String?> = when {
        !actingAsParent -> this to MomEssentialData.Words.onlyTheParentAgrees
        stage != 1 || MomEssentialData.states.size < 2 -> this to null
        else -> copy(
            stateId = MomEssentialData.states[1].id,
            sharedUntil = if (shareSummaries) today.plusDays(MomEssentialData.summaryDays.toLong()) else null
        ) to null
    }

    /** A phone takes no payment. It says so, and the plan does not start. */
    fun pay(): MomEssentialJourney = copy(paymentTried = true)
}

val momEssentialTier: MomTier? get() = momPlan.tiers.firstOrNull { it.id == MomEssentialData.planCode }
val momEssentialPlanName: String get() = listOfNotNull(momPlan.name, momEssentialTier?.name).joinToString(" ")
/** The journey's title, which is also how the account screens route to it. */
fun momEssentialTitle(): String = MomEssentialData.Words.open.replace("{plan}", momEssentialPlanName)
fun momFirstName(name: String): String = name.split(" ").firstOrNull() ?: name
fun momFill(text: String, values: Map<String, String>): String = values.entries.fold(text) { acc, entry -> acc.replace("{" + entry.key + "}", entry.value) }
