package za.co.mythuso.model

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/* LIVE WELL — the reasoning. The words are in WellbeingData.kt beside this file, generated from
   packages/catalog/wellbeing.json; this is the little arithmetic the feature has, which is a date
   and a sort and nothing else.

   THE ARITHMETIC IS THE PLACE THIS FEATURE WOULD GO WRONG. Every harmful version of a healthy-living
   screen is a calculation: a count of consecutive days, a proportion of a week, an average of a
   month, a figure with an arrow beside it. None of those are difficult to write, which is exactly
   why the contract forbids them by name and the build fails on them. What is left is a list in the
   order it happened, and a word for which day that was.

   SO THERE IS NO GAP ARITHMETIC EITHER. day() answers what to call a day that has something on it.
   Nothing asks it about a day that has not, because the timeline draws what is there and says
   nothing at all about what is not — a row reading "nothing written" is a reproach with a neutral
   face on, and this product is for people who are ill.

   WHAT A PERSON WRITES LIVES IN MEMORY AND DIES WITH THE APP. It is deliberately not in either of
   the two FileBook ledgers this app keeps on the phone: the contract's no-sharing-by-default
   refusal says what somebody writes here is not added to their record and is not sent to anybody,
   and a diary quietly persisted beside a nurse's captured work is the first half of sending it. */

/**
 * Something a person wrote down, and the day they wrote it.
 *
 * No field takes a number, which is the one decision the safety of this whole feature rests on:
 * [dayOffset] is not something anybody types, it is which day this is.
 */
data class WellbeingEntry(
    /** An id in [wellbeingHabits]. */
    val habit: String,
    /** Days from today. Never positive — nobody writes down a day they have not had. */
    val dayOffset: Int,
    val text: String,
    /** Identity, so two identical sentences on one day stay two entries in a list. */
    val id: Long = nextId++
) {
    companion object { private var nextId = 0L }
}

object Wellbeing {
    /* The preview's fictional entries, newest first. They come from the contract rather than from
       here, so the one place a sample sentence could acquire a number is the one place the
       generator refuses it. */
    fun seed(): List<WellbeingEntry> =
        ordered(wellbeingSamples.map { WellbeingEntry(it.habit, it.dayOffset, it.text) })

    /* Newest first, and stable within a day: two things written on one morning stay in the order
       they were written rather than swapping about every time the list is redrawn. */
    fun ordered(entries: List<WellbeingEntry>): List<WellbeingEntry> =
        entries.withIndex().sortedWith(
            compareByDescending<IndexedValue<WellbeingEntry>> { it.value.dayOffset }.thenBy { it.index }
        ).map { it.value }

    /* What to call the day an entry was written on. A name for the last week, then a date — never an
       interval, because "four days ago" is a measurement of a gap and the gaps are not this
       feature's business. */
    fun day(offset: Int, today: LocalDate = LocalDate.now()): String = when {
        offset == 0 -> "Today"
        offset == -1 -> "Yesterday"
        offset > -7 -> today.plusDays(offset.toLong()).format(DateTimeFormatter.ofPattern("EEEE", Locale.UK))
        else -> today.plusDays(offset.toLong()).format(DateTimeFormatter.ofPattern("d MMMM", Locale.UK))
    }

    /** What a person has just typed, ready to go on the front of the list. */
    fun written(habit: String, text: String) = WellbeingEntry(habit, 0, text.trim())
}
