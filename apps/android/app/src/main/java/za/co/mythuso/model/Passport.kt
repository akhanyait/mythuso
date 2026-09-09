package za.co.mythuso.model

import za.co.mythuso.ui.Observation
import za.co.mythuso.ui.observations
import java.time.LocalDate

/* The account holder's own health record, in one place — the reasoning half of the passport, beside
 * the generated PassportData.kt.
 *
 * WHAT MOVED, AND WHY IT MATTERS. The holder, the reviewing doctor, the four reading sets, the note
 * against the third of them and the three sentences of the last review used to be typed here as
 * well as in apps/web/src/lib/passport.ts — a second copy of fictional material with nothing
 * watching the two. packages/catalog/passport.json holds them now and scripts/emit-passport.mjs
 * writes them into PassportData.kt, so this file has deleted its copies and reads that one. Nothing
 * below is a value; everything below is a decision about values that live elsewhere.
 *
 * Everything is dated in day offsets from today, the way every other contract in this repository is,
 * so the preview cannot go stale.
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
 * Fictional patient, invented readings, nothing stored and nothing sent.
 */

/* The names the screens already read, pointed at the generated contract rather than at a second
   copy of it. Kept as aliases rather than rewritten at every call site: the fixture moved house, and
   which file a screen imports a doctor's name from is not a design decision worth a diff. */
val passportHolder = PassportData.holder
val passportReviewer = PassportData.reviewer
val reviewedBy = "${passportReviewer.name} · ${passportReviewer.registration}"
val readingSets = PassportData.readingSets
val lastReview = PassportData.lastReview

object Passport {
    fun dateOf(dayOffset: Long): LocalDate = Scheduling.today().plusDays(dayOffset)
    fun shortLabel(dayOffset: Long): String = Scheduling.format(dateOf(dayOffset), "d MMM")

    /** The visit the last set of readings was taken at. */
    val latestSet: PassportData.Readings get() = readingSets.last()
    fun setOnDay(dayOffset: Long): PassportData.Readings? = readingSets.firstOrNull { it.dayOffset == dayOffset }

    fun spec(id: String): Observation? = observations.firstOrNull { it.id == id }

    /** Every measure that has a value in a set, in the order the assessment collects them. */
    fun measuredIn(set: PassportData.Readings): List<Observation> = observations.filter { set.values.containsKey(it.id) }

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

    fun outsideRange(set: PassportData.Readings): List<Observation> =
        measuredIn(set).filter { flagOf(it, set.values.getValue(it.id)) != "normal" }

    /** A measure's readings over time, oldest first, for a chart. Only the sets that carry it. */
    fun seriesFor(observation: Observation): List<Pair<PassportData.Readings, Double>> =
        readingSets.filter { it.values.containsKey(observation.id) }.map { it to it.values.getValue(observation.id) }

    /* The four the trends screen leads with. Seven charts on one phone is a wall; these are the four
       a person with a blood-pressure diagnosis actually watches, and the rest are one tap below in
       the same shape. */
    val headlineMeasures: List<Observation> get() = observations.filter { it.id in PassportData.headlineMeasures }
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

/* What the doctor said about the last visit is packages/catalog/passport.json's now, and reaches
   this app as PassportData.lastReview. The three sentences were typed here and in the web module
   until the contract existed; a nurse records and a doctor reviews, they are two acts with two names
   on them, and the visit summary shows both rather than presenting a nurse's observation as a
   clinical conclusion. See the alias at the top of this file. */
