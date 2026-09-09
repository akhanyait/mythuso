package za.co.mythuso.model

import za.co.mythuso.ui.Observation
import za.co.mythuso.ui.observations
import java.time.LocalDate

/* The account holder's own health record, in one place — the Kotlin half of
 * apps/web/src/lib/passport.ts, and the same shape for the same reasons.
 *
 * The Android passport drew three charts out of three literal arrays typed into AccountScreens.kt,
 * dated "12 Aug" through "4 Sep". Those labels were right the week somebody typed them and would
 * have been a year wrong by the next winter, and the past visit that produced them had no screen at
 * all — so nothing connected a visit to what was measured at it, and the two could not have
 * disagreed because they never met.
 *
 * Everything here is dated in day offsets from today, the way every other contract in this
 * repository is, so the preview cannot go stale.
 *
 * WHERE THE RANGES COME FROM. Not one range is typed here. Every label, unit and indicative
 * reference range is read from `observations` in ui/ClinicalScreens.kt, which is the single copy
 * this app holds and the one scripts/check-boundaries.mjs compares against the web's and iOS's. A
 * model importing from ui is the wrong way round, and it is still better than a second copy — the
 * web module says the same thing about importing features/Clinical into lib/passport. The right home
 * for these seven ranges is packages/catalog/records.json, beside the observation section that
 * already calls them indicative; until they are there, this reads the one copy rather than making a
 * second.
 *
 * WHAT IS NOT DERIVED, AND IS REPORTED RATHER THAN HIDDEN. The four reading sets, the note against
 * the third of them, the reviewing doctor and the three sentences of the last review are fictional
 * material that exists in apps/web/src/lib/passport.ts and in no contract file, so there is no
 * generator to emit it and this file types it a second time. That is a drift risk with nothing
 * watching it. It belongs in packages/catalog as a passport fixture with an emit-passport.mjs beside
 * it, which is outside what this change was allowed to touch.
 *
 * Fictional patient, invented readings, nothing stored and nothing sent.
 */

data class PassportHolder(val name: String, val passportId: String, val issuedBy: String)
val passportHolder = PassportHolder("Lerato Molefe", "TH-2048-3920", "Akhanya IT Innovations")

/** The clinician who reviews what a nurse records for this account. One name, read everywhere. */
data class Reviewer(val name: String, val registration: String)
val passportReviewer = Reviewer("Dr N. Khumalo", "MP 0741225")
val reviewedBy = "${passportReviewer.name} · ${passportReviewer.registration}"

/** One set of observations, taken at one visit, on one day. */
data class ReadingSet(
    /** Days before today. Negative. The date and every label are derived from it. */
    val dayOffset: Long,
    val values: Map<String, Double>,
    /** Why a reading sat where it did, when somebody said so at the visit. */
    val note: String? = null
)

/* Four home visits over three months. The third is the one worth opening: a systolic of 141 against
   an upper reference of 140, with the reason the person gave for it. */
val readingSets = listOf(
    ReadingSet(-87, mapOf("systolic" to 128.0, "diastolic" to 82.0, "pulse" to 76.0, "respiratory" to 16.0, "temperature" to 36.7, "oxygen" to 98.0, "glucose" to 5.6)),
    ReadingSet(-59, mapOf("systolic" to 134.0, "diastolic" to 86.0, "pulse" to 74.0, "respiratory" to 16.0, "temperature" to 36.6, "oxygen" to 98.0, "glucose" to 6.1)),
    ReadingSet(-31, mapOf("systolic" to 141.0, "diastolic" to 90.0, "pulse" to 80.0, "respiratory" to 18.0, "temperature" to 37.0, "oxygen" to 97.0, "glucose" to 5.4), "Missed medication"),
    ReadingSet(-3, mapOf("systolic" to 136.0, "diastolic" to 85.0, "pulse" to 72.0, "respiratory" to 16.0, "temperature" to 36.8, "oxygen" to 98.0, "glucose" to 5.2))
)

object Passport {
    fun dateOf(dayOffset: Long): LocalDate = Scheduling.today().plusDays(dayOffset)
    fun shortLabel(dayOffset: Long): String = Scheduling.format(dateOf(dayOffset), "d MMM")

    /** The visit the last set of readings was taken at. */
    val latestSet: ReadingSet get() = readingSets.last()
    fun setOnDay(dayOffset: Long): ReadingSet? = readingSets.firstOrNull { it.dayOffset == dayOffset }

    fun spec(id: String): Observation? = observations.firstOrNull { it.id == id }

    /** Every measure that has a value in a set, in the order the assessment collects them. */
    fun measuredIn(set: ReadingSet): List<Observation> = observations.filter { set.values.containsKey(it.id) }

    /* Where a value sits against its own reference range. Asked of the range, never stored beside
       the value — a flag that is written down is a flag that can disagree with the number it is
       about. */
    fun flagOf(observation: Observation, value: Double): String = when {
        value < observation.low -> "low"
        value > observation.high -> "high"
        else -> "normal"
    }
    fun chipFor(observation: Observation, value: Double): String = when (flagOf(observation, value)) {
        "high" -> "Above range"
        "low" -> "Below range"
        else -> "In range"
    }
    fun rangeText(observation: Observation): String =
        "${format(observation, observation.low)}–${format(observation, observation.high)} ${observation.unit}"

    /* A temperature is 36.8 and a pulse is 72. Which of the two a measure is comes from its own
       reference range rather than from a list somebody maintains beside this function: a range
       written to a tenth — 36.1 to 37.5, or up to 7.8 — is a measure read to a tenth, and one whose
       bounds are whole numbers is not. The web asks the same question of `step`, which is the same
       fact declared a different way; Android's observation carries the range and nothing else. */
    private fun isDecimal(observation: Observation) =
        observation.low % 1.0 != 0.0 || observation.high % 1.0 != 0.0
    fun format(observation: Observation, value: Double): String =
        if (isDecimal(observation)) "%.1f".format(value) else "%.0f".format(value)

    fun outsideRange(set: ReadingSet): List<Observation> =
        measuredIn(set).filter { flagOf(it, set.values.getValue(it.id)) != "normal" }

    /** A measure's readings over time, oldest first, for a chart. Only the sets that carry it. */
    fun seriesFor(observation: Observation): List<Pair<ReadingSet, Double>> =
        readingSets.filter { it.values.containsKey(observation.id) }.map { it to it.values.getValue(observation.id) }

    /* The four the trends screen leads with. Seven charts on one phone is a wall; these are the four
       a person with a blood-pressure diagnosis actually watches, and the rest are one tap below in
       the same shape. */
    val headlineMeasures: List<Observation> get() = observations.filter { it.id in listOf("systolic", "diastolic", "pulse", "glucose") }
    val otherMeasures: List<Observation> get() = observations.filter { it !in headlineMeasures }

    /** How many months of visits this record covers, worked out rather than written down. */
    val monthsCovered: Long get() = Math.round(Math.abs(readingSets.first().dayOffset) / 30.0)

    /* ---- What a device would and would not be allowed to hand over ----------------------------
       Both halves are derived. What a reading type IS comes from the assessment's own observation
       list, because MyThuso does not ask for a category it has nowhere to file. What is never read
       comes from the record contract's protected categories, which are released by the patient entry
       by entry and are not a thing an operating system's permission sheet can grant on her behalf. */
    val readableMeasures: List<Observation> get() = observations
    val neverRead: List<String> get() = recordSensitivities.first { it.id == "protected" }.categories
}

/* ---- What the doctor said about the last visit --------------------------------------------------
   A nurse records; a doctor reviews. They are two acts with two names on them, and the visit summary
   shows both rather than presenting a nurse's observation as a clinical conclusion. */
data class VisitReview(val assessment: String, val plan: String, val next: String, val reviewedDayOffset: Long)
val lastReview = VisitReview(
    "Blood pressure is coming down again. The reading a month ago was above the reference range on the day a dose was missed; this one is inside it. Nothing here needs an urgent appointment.",
    "Keep taking the medicine at the same time each morning. Bring the boxes to the next visit so the nurse can check what is left.",
    "A nurse visit in about four weeks, or sooner if you feel unwell.",
    -2
)
