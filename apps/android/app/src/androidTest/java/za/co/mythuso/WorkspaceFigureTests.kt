package za.co.mythuso

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import za.co.mythuso.ui.*

/*
 * Every figure in a workspace's urgency strip, against the board directly underneath it.
 *
 * All twelve were literals. Four of them contradicted the list on the same screen: the Control
 * Tower said twenty-four active visits over a board of three, eighteen available nurses over a
 * roster of five, four off duty when not one nurse is, and "1 severity high" when the worst open
 * incident is critical. The doctor's said twelve cases waiting over a queue of three.
 *
 * A metric that disagrees with the list beneath it is worse than no metric. On a dispatch board the
 * strip is the thing you glance at when you have no time to read the rows — and a controller who
 * notices once that it says twenty-four over three has learnt not to believe the number, so the
 * number they will not believe next is the one that mattered.
 *
 * The figures are counted now. These are the assertions that stop a literal coming back: each one
 * compares what the strip says with what the array the rows are drawn from actually holds, so a
 * figure typed in again fails here rather than on somebody's screen.
 */
@RunWith(AndroidJUnit4::class)
class WorkspaceFigureTests {

    private val store = PreviewStore()
    private fun figure(role: String, label: String): Pair<String, String> {
        val row = workspaceUrgency(role, store).firstOrNull { it.label == label }
            ?: throw AssertionError("The $role strip has no figure labelled \"$label\". It carries: ${workspaceUrgency(role, store).map { it.label }}")
        return row.value to row.note
    }

    @Test fun theControlTowerStripCountsItsOwnBoard() {
        val (visits, urgentNote) = figure("Control Tower", "Awaiting assignment")
        assertEquals("The strip must say what the dispatch board holds",
            "${DispatchBoard.awaitingAssignment.size}", visits)
        val urgent = DispatchBoard.awaitingAssignment.count { it.priority == "Urgent" }
        assertTrue("The sub-line must name the urgent count the board can show: $urgentNote",
            urgentNote.contains("$urgent") || urgent == 0)

        /* Available means available *and* cleared. The board refuses the nearest nurse to the Soweto
           visit because her SAPS clearance lapsed, so a strip counting her has offered an operator
           somebody the next screen will not let them send. */
        val (nurses, nurseNote) = figure("Control Tower", "Nurses available")
        assertEquals("The strip must count only nurses the board would actually dispatch",
            "${DispatchBoard.available(store.vetting)}", nurses)
        assertTrue("At least one nurse in the fixture is refused by vetting, so the sub-line must say so: $nurseNote",
            DispatchBoard.refusedByVetting(store.vetting) == 0 || nurseNote.contains("refused by vetting"))
        assertTrue("No nurse in the roster is off duty, so nothing may say any is: $nurseNote",
            !nurseNote.contains("off duty"))

        val open = incidents.filter { it.status != "Closed" }
        val (incidentCount, severity) = figure("Control Tower", "Open incidents")
        assertEquals("The strip must count the incidents on the board", "${open.size}", incidentCount)
        /* The sub-line names the worst severity that is on the board. It used to say "1 severity
           high" while a critical one sat in the list, which sends a reader to the wrong row first. */
        if (open.any { it.severity == "Critical" })
            assertTrue("A critical incident is open, so the sub-line must say critical: $severity",
                severity.contains("critical"))
    }

    @Test fun theDoctorStripCountsItsOwnQueue() {
        val (waiting, ranges) = figure("Doctor", "Awaiting review")
        assertEquals("The strip must say how many cases are in the queue below it",
            "${doctorReviewQueue.size}", waiting)
        val flaggedCount = doctorReviewQueue.count { it.flagged }
        assertTrue("The chip must count the flagged rows rather than describe them: $ranges",
            ranges.contains("$flaggedCount") || flaggedCount == 0)

        val (flagged, _) = figure("Doctor", "Priority reviews")
        assertEquals("Flagged must be counted, not asserted", "$flaggedCount", flagged)

        /* The longest wait replaced "Reviewed today 18" and its "Median 4 m 10 s", which were typed
           over a queue that could count neither. It is the same queue sorted, so a reader can see
           which row it names. */
        val worst = doctorReviewQueue.maxByOrNull { it.waitingMinutes }!!
        val (longest, _) = figure("Doctor", "Longest wait")
        assertTrue("The longest wait must be the queue's own: $longest",
            longest.contains("${worst.waitingMinutes / 60} h") || worst.waitingMinutes < 60)
    }

    /* Every mark is the same arithmetic as the numeral beside it, off the same rows. A drawing a
       reader cannot check against the list underneath is the typed-figure problem wearing a nicer
       coat: three arcs, three rows, and the bright ones are the rows carrying a badge. */
    @Test fun everyDrawingOnTheDeckIsCountedFromTheSameRows() {
        val doctor = workspaceUrgency("Doctor", store).associateBy { it.label }
        assertEquals("One arc per case on the queue, flagged where the row is flagged",
            DeckShape.Ring(doctorReviewQueue.map { it.flagged }), doctor["Awaiting review"]!!.shape)
        assertEquals("The dial is the flagged count out of the queue length",
            DeckShape.Gauge(doctorReviewQueue.count { it.flagged }, doctorReviewQueue.size),
            doctor["Priority reviews"]!!.shape)
        assertEquals("One bar per case, as long as that case has waited",
            DeckShape.Bars(doctorReviewQueue.map { it.waitingMinutes }),
            doctor["Longest wait"]!!.shape)

        val nurse = workspaceUrgency("Nurse", store).associateBy { it.label }
        val day = nurse["Next visit"]!!.shape as DeckShape.Day
        assertEquals("One block per visit on the day below", nurseToday.size, day.visits.size)
        assertEquals("The day starts where the first visit starts", nurseToday.first().from, day.from)
        assertEquals("And ends when the last one ends, at its own service's duration",
            nurseToday.last().to, day.to)
        nurseToday.forEachIndexed { index, visit ->
            assertEquals("Visit ${visit.at} is as long as its service takes",
                visit.minutes, day.visits[index].to - day.visits[index].from)
        }
        assertEquals("One arc per visit on the day below",
            nurseToday.size, (nurse["Today’s visits"]!!.shape as DeckShape.Ring).segments.size)
        /* The week in progress is the figure above the line and never a point on it: a week still
           being added to, drawn as the end of a series, reads as a fall. */
        val spark = nurse["This week"]!!.shape as DeckShape.Spark
        assertEquals("The line is the completed weeks and only those",
            payWeeks.count { it.state != "accruing" }, spark.weeks.size)
        assertEquals("Oldest first, so a line drawn from them runs the way time does",
            payWeeks.filter { it.state != "accruing" }.sortedBy { it.ends }.map { it.total },
            spark.weeks)
    }

    @Test fun thePartnerStripCountsItsOwnCounter() {
        val (orders, items) = figure("Partner", "Open orders")
        assertEquals("The strip must say how many prescriptions are on the counter",
            "${partnerOrders.size}", orders)
        assertTrue("The sub-line must count the items across them: $items",
            items.contains("${partnerOrders.sumOf { it.items }}"))
        assertEquals("Awaiting a pharmacist must be counted",
            "${partnerOrders.count { it.waitingFor.contains("pharmacist", true) }}",
            figure("Partner", "Awaiting a pharmacist").first)
        assertEquals("Awaiting a courier must be counted",
            "${partnerOrders.count { it.waitingFor.contains("courier", true) }}",
            figure("Partner", "Awaiting a courier").first)
    }

    @Test fun theNurseStripCountsHerOwnDayAndHerOwnWeek() {
        val (next, where) = figure("Nurse", "Next visit")
        assertEquals("The lead must be the first visit of the day, from the same list the card shows",
            nurseToday.first().at, next)
        assertTrue("And it must say where that visit is: $where", where.contains(nurseToday.first().area))

        assertEquals("Visits today must be counted from the day, not typed beside it",
            "${nurseToday.size}", figure("Nurse", "Today’s visits").first)

        /* The money comes off the pay contract rather than out of this file, and so does the day it
           pays: a figure typed here would be a second answer to a question earnings already answers,
           and the two would disagree the moment somebody edited a pay line. */
        val (amount, pays) = figure("Nurse", "This week")
        assertTrue("The week's figure must contain the accruing week's own total: $amount",
            amount.replace(" ", "").contains("${Earnings.currentWeek.total}"))
        assertTrue("The pay day must be the cycle's own: $pays", pays.contains(payCycle.paysOn))
    }

    /** The defect in one sentence: no figure in any strip may be a literal nothing counts. */
    @Test fun noStripCarriesAFigureItsOwnBoardCannotProduce() {
        val counted = mapOf(
            "Control Tower" to setOf(
                "${DispatchBoard.awaitingAssignment.size}",
                "${DispatchBoard.available(store.vetting)}",
                "${incidents.count { it.status != "Closed" }}"
            ),
            /* The doctor's third figure is the longest wait rather than a count, and it is the
               same queue sorted — so it is written the way the row underneath writes it. */
            "Doctor" to setOf(
                "${doctorReviewQueue.size}",
                "${doctorReviewQueue.count { it.flagged }}",
                waitedText(doctorReviewQueue.maxOf { it.waitingMinutes })
            ),
            "Partner" to setOf(
                "${partnerOrders.size}",
                "${partnerOrders.count { it.waitingFor.contains("pharmacist", true) }}",
                "${partnerOrders.count { it.waitingFor.contains("courier", true) }}"
            )
        )
        counted.forEach { (role, expected) ->
            val shown = workspaceUrgency(role, store).map { it.value }.toSet()
            assertEquals("Every figure in the $role strip must be one its own board produced", expected, shown)
        }
    }
}
