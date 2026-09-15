package za.co.mythuso

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.ui.ThusoTheme
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/* Booking a visit, end to end, and then reading back what came out of it.
 *
 * This is the journey with real arithmetic behind it, and the arithmetic had a defect. Android
 * carried a strip of five hand-typed date chips beginning Triple("FRI", "12", "SEP") that had not
 * matched the calendar since the day somebody typed it; every booked visit was given that same
 * Friday whatever day it was booked for; and a visit ended a flat hour after it started whatever
 * the service's own length was. It was fixed in f0b34df, in Kotlin, Swift and TypeScript at once.
 * The Playwright specs stop it coming back on the web and BookingJourneyTests.swift stops it on
 * iOS. This stops it on Android.
 *
 * Nothing below is checked against a second copy of the app's own arithmetic. The test reads what
 * the screens say — a weekday, a date, a start, an end, a length in minutes — parses it with
 * java.time, and asks the calendar whether it is true. In particular the chosen day is not taken
 * from `Scheduling.offeredDays()`; it is parsed out of the chip's own label and its weekday is
 * checked against the calendar before anything downstream is allowed to agree with it. A test that
 * recomputed the answer the way the app does would agree with the app about a wrong answer.
 */
@RunWith(AndroidJUnit4::class)
class BookingJourneyTests {

    @get:Rule val rule = createComposeRule()

    private val zone = ZoneId.of("Africa/Johannesburg")
    private val uk = Locale.UK
    private val density =
        InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density

    private fun pattern(format: String) = DateTimeFormatter.ofPattern(format, uk)

    /** "Friday, 11 September 2026" → the weekday word it claims, and the date it names. */
    private fun split(longDate: String): Pair<String, LocalDate>? {
        val pieces = longDate.split(",", limit = 2).map(String::trim)
        if (pieces.size != 2) return null
        return runCatching { pieces[0] to LocalDate.parse(pieces[1], pattern("d MMMM yyyy")) }.getOrNull()
    }

    private fun minutesBetween(start: String, end: String): Long =
        Duration.between(LocalTime.parse(start), LocalTime.parse(end)).toMinutes()

    @Test fun aBookedVisitCarriesItsOwnDateAndItsServicesOwnLength() {
        allowForASlowEmulator()
        rule.setContent { ThusoTheme { MyThusoApp() } }
        settle()

        /* How long a blood test takes, taken from the screen that offers it rather than written
           down here. The home says it in the row it books from; everything after this has to agree
           with it, and a flat hour would disagree with it by thirty-five minutes. */
        val shortcut = rule.onAllNodes(describedStartingWith("Blood tests") and hasClickAction())
            .fetchSemanticsNodes().firstOrNull()
        assertTrue("the home does not offer Blood tests", shortcut != null)
        val offered = shortcut!!.spoken()
        val declaredMinutes = Regex("(\\d+) minutes").find(offered)?.groupValues?.get(1)?.toInt()
        assertTrue("the home's Blood tests row does not say how long the visit takes: “$offered”",
            declaredMinutes != null)
        assertNotEquals(
            "this test needs a service that is not an hour long, or it cannot tell the fix from the defect",
            60, declaredMinutes
        )

        rule.onAllNodes(describedStartingWith("Blood tests") and hasClickAction())
            .onFirst().performScrollTo().performClick()
        settle()
        tap("Continue")                                            // who → where
        tap("Continue")                                            // where → nurse
        tap("Continue")                                            // nurse → when, asking for whoever is nearest

        // MARK: Every chip's weekday belongs to the date on it
        val chips = rule.onAllNodes(hasClickAction() and describedLikeALongDate())
            .fetchSemanticsNodes().sortedBy { it.positionInRoot.x }
        assertTrue("the date strip offers ${chips.size} day(s), which is fewer than a strip is for",
            chips.size >= 3)

        val today = LocalDate.now(zone)
        val dates = mutableListOf<LocalDate>()
        for (chip in chips) {
            val label = chip.spoken()
            val parsed = split(label)
            assertTrue("a date chip is labelled “$label”, which is not a date", parsed != null)
            val (weekday, date) = parsed!!
            /* The defect, asked directly. The weekday on the chip has to be the weekday its own date
               falls on, worked out here by java.time rather than by the app. */
            assertEquals(
                "the chip labelled “$label” names a weekday its date does not fall on",
                date.format(pattern("EEEE")), weekday
            )
            assertTrue("the strip offers “$label”, which is not in the future", date.isAfter(today))
            dates += date
        }
        for ((earlier, later) in dates.zipWithNext()) {
            assertEquals(
                "the strip skips from ${earlier.format(pattern("d MMMM"))} to ${later.format(pattern("d MMMM"))}",
                1L, ChronoUnit.DAYS.between(earlier, later)
            )
        }

        // MARK: Pick a date and a time
        val chosenLongDate = chips[2].spoken()
        val chosenDate = split(chosenLongDate)!!.second
        rule.onAllNodes(hasClickAction() and describedExactly(chosenLongDate)).onFirst()
            .performScrollTo().performClick()
        val start = "10:00"
        rule.onAllNodes(hasText(start) and hasClickAction()).onFirst().performScrollTo().performClick()
        settle()

        /* What the screen promises before anything is confirmed: this date, this hour, and an end
           that is the service's own length after the start. */
        val footer = texts().map { it.second }.firstOrNull { it.contains(chosenLongDate) && it != chosenLongDate }
        assertTrue("the When step does not print the date and time it is about to book", footer != null)
        assertTrue(
            "the When step says “$footer” rather than the $declaredMinutes minutes the catalogue " +
                "gives a blood test",
            footer!!.contains("($declaredMinutes minutes)")
        )
        val end = Regex("\\d{2}:\\d{2}").findAll(footer).map { it.value }.firstOrNull { it != start }
        assertTrue("the When step does not say when the visit ends: “$footer”", end != null)
        assertEquals(
            "the visit runs $start–$end, which is not the $declaredMinutes minutes the service takes",
            declaredMinutes!!.toLong(), minutesBetween(start, end!!)
        )
        assertNotEquals(
            "the visit ends a flat hour after it starts, which is the defect f0b34df fixed",
            60L, minutesBetween(start, end)
        )

        // MARK: The review says the same thing
        tap("Continue")                                            // when → payment
        tap("Continue")                                            // payment → review
        assertTrue("the review's Date row does not read “$chosenLongDate”, which is what was chosen " +
            "two steps ago", rowShows("Date", chosenLongDate))
        assertTrue("the review's Time row does not read “$start – $end”, which is what the previous " +
            "step promised", rowShows("Time", "$start – $end"))

        // MARK: Confirm
        rule.onAllNodes(isToggleable()).onFirst().performScrollTo().performClick()
        tap("Confirm & book")
        assertTrue(
            "the booking did not confirm",
            texts().any { it.second.startsWith("No nurse has been dispatched") }
        )
        tap("Done")

        // MARK: What came out of it, on the visit list
        rule.onAllNodes(isTab() and hasText("Visits")).onFirst().performClick()
        settle()
        val listed = "$start – $end"
        assertTrue("the visit list does not carry the hours the visit was booked for",
            texts().any { it.second == listed })
        /* The date block beside the row is the surface that used to be typed. It is bound to this
           row by position — the three strings stacked to the left of this row's hours — so a
           different row's block cannot answer for it. */
        assertEquals(
            "the visit list's date block is not the day this visit was booked for",
            listOf(
                chosenDate.format(pattern("EEE")).uppercase(uk),
                chosenDate.format(pattern("d")),
                chosenDate.format(pattern("MMM")).uppercase(uk)
            ),
            dateBlockLeftOf(listed)
        )

        // MARK: And on the visit that the home now leads with
        rule.onAllNodes(isTab() and hasText("Home")).onFirst().performClick()
        settle()
        val shortDate = "${chosenDate.format(pattern("EEE d MMM"))} · $start"
        val card = rule.onAllNodes(describedStartingWith("Blood tests") and hasClickAction())
            .fetchSemanticsNodes().map { it.spoken() }.firstOrNull { it.contains(shortDate) }
        assertTrue(
            "the home does not lead with the visit that was just booked, carrying “$shortDate” and " +
                "its $declaredMinutes minutes. It says: " +
                rule.onAllNodes(describedStartingWith("Blood tests")).fetchSemanticsNodes()
                    .joinToString(" / ") { it.spoken() },
            card != null && card.contains("$declaredMinutes minutes")
        )
    }

    // MARK: - Reading things back off a screen

    private fun tap(label: String) {
        rule.onAllNodes(hasText(label) and hasClickAction()).onFirst().performClick()
        settle()
    }

    private fun settle() = rule.waitForIdle()

    /* Positions are taken unclipped — `positionInRoot` and `size` rather than `boundsInRoot` —
       because a row below the fold of a scrolling dialog has a clipped rectangle of nothing, and
       two nothings sit at the same place and would match each other. */
    private fun bounds(node: SemanticsNode) =
        Rect(node.positionInRoot, Size(node.size.width.toFloat(), node.size.height.toFloat()))

    private fun texts(): List<Pair<Rect, String>> =
        rule.onAllNodes(SemanticsMatcher("every node") { true }, useUnmergedTree = true)
            .fetchSemanticsNodes()
            .flatMap { node ->
                node.config.getOrNull(SemanticsProperties.Text)?.map { bounds(node) to it.text }.orEmpty()
            }

    /* A ReviewLine is a Row of two Texts and not a semantics node of its own, so a row is asked for
       by its field name and its value sitting on the same line. That also stops the assertion
       passing on a date that happens to appear somewhere else on the screen. */
    private fun rowShows(field: String, value: String): Boolean {
        val all = texts()
        val label = all.firstOrNull { it.second == field } ?: return false
        return all.any { it.second == value && kotlin.math.abs(it.first.center.y - label.first.center.y) < 8 * density }
    }

    /** The weekday, day and month stacked to the left of a row, read in the order they are drawn. */
    private fun dateBlockLeftOf(time: String): List<String> {
        val anchor = texts().firstOrNull { it.second == time }?.first ?: return emptyList()
        return texts()
            .filter { it.first.right <= anchor.left && kotlin.math.abs(it.first.center.y - anchor.center.y) < 70 * density }
            .sortedBy { it.first.top }
            .map { it.second }
    }
}

private val LONG_DATE = Regex("^[A-Za-z]+, \\d{1,2} [A-Za-z]+ \\d{4}$")

internal fun describedLikeALongDate() =
    SemanticsMatcher("is described as a long date") { node ->
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.any { LONG_DATE.matches(it) } == true
    }

internal fun describedExactly(description: String) =
    SemanticsMatcher("is described as “$description”") { node ->
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.contains(description) == true
    }
