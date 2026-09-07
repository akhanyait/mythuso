package za.co.mythuso.model

import kotlin.math.max
import kotlin.math.roundToInt

/* An employer runs a wellness programme; a sponsor pays for somebody's care.

   Both are vetted parties already, and both have a hard refusal attached in
   packages/catalog/vetting.json — an employer may pay for care and still never see who used it; a
   sponsorship is a payment, not a permission. Those two sentences are the feature, and this file is
   what makes them arithmetic rather than assurance.

   The table itself — the floor, what each party sees and never sees, joining, leaving, the seven
   rules, the six refusals, two fictional programmes and one statement — is generated into
   ProgrammesData.kt from packages/catalog/programmes.json, so nothing below is transcribed.

   What is here is `suppress`, and it is the whole of it. An employer is shown counts of people, and
   a count of people is a disclosure about every one of them:

     The floor. Nothing is reported about a group of fewer than twelve. A department of four is not
     anonymous, and rounding it does not make it so.

     Dominance. A group of fourteen in which thirteen answered the same way tells the employer there
     is exactly one person who did not. Suppressed whichever way round it falls, because "almost
     nobody" identifies as surely as "almost everybody".

     Secondary suppression, which is the rule everybody leaves out. If the first two hide only one
     group, that group is the total minus the ones published — so a second is hidden as well, the
     smallest that was going to be reported, and the subtraction stops working. Without this step the
     other two are decorative.

     Rounding, to the nearest five, because two reports laid side by side are the easiest thing in
     the world and a figure that moves by one names the person who moved it.

   The counts in the generated table are unsuppressed on purpose. Suppressing them in the generator
   would mean the rule lived there and this app drew whatever it was handed — which is exactly the
   arrangement in which somebody eventually asks for the unsuppressed version for a board pack.

   Nothing here reports anything. No employer is contacted, no payment is taken, and every company,
   cohort and person is fictional. */

data class SuppressionFloor(
    val minimumCohort: Int,
    val dominanceCeiling: Double,
    val roundTo: Int,
    /** Never one hidden row on its own: one hidden row is a subtraction away from being visible. */
    val minimumSuppressed: Int,
    val whyTwelve: String,
    val whyDominance: String,
    val whyRounding: String,
    val whySecondary: String
)

data class Disclosure(val what: String, val why: String)
data class ProgrammeStep(val label: String, val detail: String)
data class Declining(val headline: String, val detail: String, val note: String)
data class LineDetailChoice(val id: String, val name: String, val detail: String, val isDefault: Boolean)
data class SponsorConsent(val headline: String, val detail: String, val withdrawal: String)
data class ProgrammeRule(val id: String, val title: String, val sentence: String)
data class ProgrammeRefusal(val id: String, val sentence: String)
data class SuppressionReason(val id: String, val sentence: String)

data class Cohort(
    val id: String,
    val name: String,
    val eligible: Int,
    val tookPart: Int,
    val advisedToSeeADoctor: Int
)

data class Programme(
    val id: String,
    val name: String,
    val employer: String,
    val startedInDays: Int,
    val note: String,
    val cohorts: List<Cohort>
)

data class StatementLine(
    val onDays: Int,
    /** The service's price in the catalogue, resolved by the generator. Not a number anybody typed. */
    val amount: Int,
    val service: String
)

data class SponsorStatement(
    val sponsor: String,
    val recipient: String,
    val relationship: String,
    val setAside: Int,
    val note: String,
    val lines: List<StatementLine>
) {
    val spent: Int get() = lines.sumOf { it.amount }
    val remaining: Int get() = setAside - spent
}

/** A row on the report. `suppressedBy` null means it is published; anything else is why it is not,
 *  said in the contract's own words rather than left as a blank somebody will go and ask about. */
data class ReportedCohort(
    val cohort: Cohort,
    val suppressedBy: String?,
    val eligible: Int,
    val tookPart: Int,
    val advisedToSeeADoctor: Int,
    val uptake: Double
)

data class ProgrammeReport(
    val programme: Programme,
    val rows: List<ReportedCohort>,
    val totalEligible: Int,
    val totalTookPart: Int,
    val totalAdvised: Int,
    val totalUptake: Double,
    /** Deliberately not equal to the total. If it were, the suppressed rows could be had by
     *  subtracting and every rule above would be decorative. */
    val publishedTookPart: Int
) {
    val suppressed: List<ReportedCohort> get() = rows.filter { it.suppressedBy != null }
    val reconciles: Boolean get() = publishedTookPart == totalTookPart
}

object Programmes {
    fun rule(id: String) = programmeRules.firstOrNull { it.id == id } ?: programmeRules.first()
    fun refusal(id: String) = programmeRefusals.firstOrNull { it.id == id } ?: programmeRefusals.first()
    fun suppressionReason(id: String) = suppressionReasons.firstOrNull { it.id == id } ?: suppressionReasons.first()
    fun programme(id: String) = programmes.firstOrNull { it.id == id } ?: programmes.first()

    /** To the nearest five, always in the same direction, so the same cohort reported twice gives
     *  the same answer. */
    fun roundOff(n: Int) = (n.toDouble() / suppressionFloor.roundTo).roundToInt() * suppressionFloor.roundTo

    /** One answer covering four fifths of the group, whichever answer it is. */
    fun isDominated(c: Cohort): Boolean {
        if (c.tookPart <= 0) return false
        val larger = max(c.advisedToSeeADoctor, c.tookPart - c.advisedToSeeADoctor)
        return larger.toDouble() / c.tookPart.toDouble() >= suppressionFloor.dominanceCeiling
    }

    fun suppress(programme: Programme): ProgrammeReport {
        val rows = programme.cohorts.map { cohort ->
            val reason = when {
                cohort.tookPart < suppressionFloor.minimumCohort || cohort.eligible < suppressionFloor.minimumCohort -> "below-floor"
                isDominated(cohort) -> "dominated"
                else -> null
            }
            ReportedCohort(
                cohort, reason, roundOff(cohort.eligible), roundOff(cohort.tookPart),
                roundOff(cohort.advisedToSeeADoctor),
                if (cohort.eligible == 0) 0.0 else cohort.tookPart.toDouble() / cohort.eligible.toDouble()
            )
        }.toMutableList()
        /* Secondary suppression. One hidden row is a subtraction away from being visible, so the
           smallest row that was going to be published is withheld with it — smallest, because
           withholding the largest costs the report the most and protects nobody more. */
        while (rows.any { it.suppressedBy != null } &&
            rows.count { it.suppressedBy != null } < suppressionFloor.minimumSuppressed
        ) {
            val next = rows.withIndex().filter { it.value.suppressedBy == null }
                .minByOrNull { it.value.cohort.tookPart } ?: break
            rows[next.index] = next.value.copy(suppressedBy = "secondary")
        }
        val eligible = programme.cohorts.sumOf { it.eligible }
        val tookPart = programme.cohorts.sumOf { it.tookPart }
        return ProgrammeReport(
            programme, rows,
            roundOff(eligible), roundOff(tookPart),
            roundOff(programme.cohorts.sumOf { it.advisedToSeeADoctor }),
            if (eligible == 0) 0.0 else tookPart.toDouble() / eligible.toDouble(),
            rows.filter { it.suppressedBy == null }.sumOf { it.tookPart }
        )
    }
}
