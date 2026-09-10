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
        val row = workspaceUrgency(role, store).firstOrNull { it.first == label }
            ?: throw AssertionError("The $role strip has no figure labelled \"$label\". It carries: ${workspaceUrgency(role, store).map { it.first }}")
        return row.second to row.third
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
        val (waiting, longest) = figure("Doctor", "Awaiting review")
        assertEquals("The strip must say how many cases are in the queue below it",
            "${doctorReviewQueue.size}", waiting)
        /* The longest wait is on the row as well as in the figure, so a reader can find it. */
        val worst = doctorReviewQueue.maxByOrNull { it.waitingMinutes }!!
        assertTrue("The longest wait must be the queue's own: $longest",
            longest.contains("${worst.waitingMinutes / 60} h") || worst.waitingMinutes < 60)

        val (flagged, _) = figure("Doctor", "Flagged out of range")
        assertEquals("Flagged must be counted, not asserted",
            "${doctorReviewQueue.count { it.flagged }}", flagged)

        val (overAnHour, oldest) = figure("Doctor", "Waiting over an hour")
        assertEquals("Waiting over an hour must be counted from the same minutes the rows show",
            "${doctorReviewQueue.count { it.waitingMinutes >= 60 }}", overAnHour)
        assertTrue("The oldest named must be the oldest in the queue: $oldest",
            oldest.contains(worst.reference))
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
            "${nurseToday.size}", figure("Nurse", "Visits today").first)

        /* The money comes off the pay contract rather than out of this file, and so does the day it
           pays: a figure typed here would be a second answer to a question earnings already answers,
           and the two would disagree the moment somebody edited a pay line. */
        val (amount, pays) = figure("Nurse", "This week so far")
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
            "Doctor" to setOf(
                "${doctorReviewQueue.size}",
                "${doctorReviewQueue.count { it.flagged }}",
                "${doctorReviewQueue.count { it.waitingMinutes >= 60 }}"
            ),
            "Partner" to setOf(
                "${partnerOrders.size}",
                "${partnerOrders.count { it.waitingFor.contains("pharmacist", true) }}",
                "${partnerOrders.count { it.waitingFor.contains("courier", true) }}"
            )
        )
        counted.forEach { (role, expected) ->
            val shown = workspaceUrgency(role, store).map { it.second }.toSet()
            assertEquals("Every figure in the $role strip must be one its own board produced", expected, shown)
        }
    }
}
