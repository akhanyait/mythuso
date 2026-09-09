package za.co.mythuso

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.CancellationData
import za.co.mythuso.ui.ThusoTheme

/* Cancelling a visit, end to end, and the two things the flow must refuse to do.
 *
 * The defect this closes is an absence rather than a mistake. Both native apps printed, on the
 * booking confirmation, "You can cancel or reschedule up to 2 hours before the visit" — a hand-typed
 * string with no contract behind it — and there was no cancel control anywhere in the patient app.
 * A Cancelled tab held a sample cancelled visit, so the product displayed the outcome of an action
 * it did not offer. Nothing could have caught that: a promise nobody can act on fails no assertion,
 * and a screenshot of the confirmation looks exactly the same either way.
 *
 * So the questions asked here are the ones an absence answers wrongly. Can a person actually cancel
 * a visit, and does it turn up under Cancelled afterwards carrying the reason they gave? Does the
 * one state that refuses a cancellation say so, in the contract's own words, rather than merely
 * failing to work? And does any screen along the way state a charge — which is the failure that
 * would matter most, because what a late cancellation costs is an open legal and commercial
 * question that nobody has answered yet.
 *
 * The sentences are read out of packages/catalog/cancellation.json through the generated
 * CancellationData rather than typed here. A test that retyped them would agree with the app about
 * a sentence neither of them got from the contract, which is the same class of defect as the two
 * hours it is here about.
 */
@RunWith(AndroidJUnit4::class)
class CancellationJourneyTests {

    @get:Rule val rule = createComposeRule()

    private val density =
        InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density

    /* Anything that names a price, a fee or a penalty. The words are the ones
       scripts/check-boundaries.mjs refuses in the contract itself, plus the shapes a screen could
       reach for that a JSON file would not: a rand amount, a percentage.
       "Nothing was charged" is deliberately not matched — it is the contract's own sentence for the
       early state, and it states the absence of a charge rather than one. */
    private val statesACharge = Regex(
        "cancellation fee|late fee|\\bfee\\b|\\bpenalty\\b|forfeit|non-refundable|" +
            "will be charged|you are charged|charged R|\\bR\\s?\\d|\\d\\s?%",
        RegexOption.IGNORE_CASE
    )

    @Test fun aCancelledVisitLandsUnderCancelledWithTheReasonGiven() {
        allowForASlowEmulator()
        rule.setContent { ThusoTheme { MyThusoApp() } }
        settle()
        openTab("Visits")

        val everySaidWhileCancelling = mutableListOf<String>()

        // MARK: The control exists at all, which is the thing that was missing
        val cancels = rule.onAllNodes(describedStartingWith("Cancel the ") and hasClickAction())
            .fetchSemanticsNodes().map { it.spoken() }
        assertTrue(
            "the visit list offers no way to cancel a visit, while the booking confirmation " +
                "promises one: “${CancellationData.windowSentence}”",
            cancels.isNotEmpty()
        )
        /* The visit the preview leads with — days away, so it is not the one that refuses. */
        val target = cancels.first()
        val service = target.removePrefix("Cancel the ").substringBefore(" visit,")
        tapDescribed(target)
        everySaidWhileCancelling += texts()

        // MARK: The move is offered before the reasons, not after them
        val offer = texts().indexOfFirst { it == CancellationData.rescheduleSentence }
        val firstReason = texts().indexOfFirst { it == CancellationData.reasons.first().text }
        assertTrue(
            "the cancel screen does not offer to move the visit. It says: ${texts().joinToString(" / ")}",
            offer >= 0
        )
        assertTrue(
            "the reasons are listed above the offer to move the visit. Somebody who has chosen why " +
                "they are cancelling has cancelled",
            firstReason < 0 || offer < firstReason
        )

        // MARK: Every reason the contract carries is on the screen
        for (reason in CancellationData.reasons) {
            assertTrue("the cancel screen does not offer “${reason.text}”", texts().contains(reason.text))
        }

        // MARK: The controls on it are big enough and named
        assertUsable(ScreenAudit(rule, "The cancel-a-visit screen", density).read())

        // MARK: Give a reason and cancel
        val reason = CancellationData.reasons.first { it.id == "no-longer-needed" }
        rule.onAllNodes(hasText(reason.text) and hasClickAction()).onFirst().performScrollTo().performClick()
        settle()
        everySaidWhileCancelling += texts()
        /* By its description, not its words. Every row on the list behind this dialog offers a
           control reading "Cancel this visit", and the first of those is not the one that confirms. */
        tapDialog("Confirm cancelling the $service visit")
        everySaidWhileCancelling += texts()

        /* The confirmation is the state's own words, and which state it is is arithmetic: this visit
           is days away, so it is the one that says nothing was charged. */
        val expected = CancellationData.states.first { it.id == "before-window" }
        assertTrue(
            "the confirmation does not carry the contract's words for a visit cancelled before the " +
                "window — “${expected.patientWords}”. It says: ${texts().joinToString(" / ")}",
            texts().contains(expected.patientWords)
        )
        /* And the three things cancelling does not undo are said rather than merely true. */
        for (limit in CancellationData.doesNotUndo) {
            assertTrue(
                "the confirmation does not say “${limit.statement}”",
                texts().any { it.contains(limit.statement) }
            )
        }
        tap("Done")

        // MARK: It is gone from Upcoming and kept under Cancelled, with the reason
        assertFalse(
            "the cancelled $service visit is still offered a cancel control on the Upcoming tab",
            rule.onAllNodes(describedStartingWith("Cancel the $service visit") and hasClickAction())
                .fetchSemanticsNodes().isNotEmpty()
        )
        rule.onAllNodes(isTab() and hasText("Cancelled")).onFirst().performClick()
        settle()
        assertTrue(
            "the Cancelled tab does not carry the $service visit that was just cancelled. It shows: " +
                texts().joinToString(" / "),
            texts().any { it == service }
        )
        assertTrue(
            "the Cancelled tab does not say which reason was given. A visit kept without its reason " +
                "is a visit nobody can ask about afterwards",
            texts().any { it.contains(reason.text) }
        )

        // MARK: Nothing anywhere in that flow named a charge
        assertNoCharge(everySaidWhileCancelling)
    }

    @Test fun aVisitThatHasAlreadyStartedRefusesToBeCancelled() {
        allowForASlowEmulator()
        rule.setContent { ThusoTheme { MyThusoApp() } }
        settle()
        openTab("Visits")

        val inProgress = CancellationData.states.first { it.id == "in-progress" }
        assertTrue(
            "the cancellation contract no longer refuses a visit that has begun, which is the one " +
                "refusal on this pathway",
            inProgress.refusesCancellation
        )

        /* The preview seeds a visit that began ten minutes ago, so this state is reachable by a
           person and not only by arithmetic. Its control is found by the visit it names. */
        val underWay = rule.onAllNodes(describedStartingWith("Cancel the ") and hasClickAction())
            .fetchSemanticsNodes().map { it.spoken() }
            .firstOrNull { it.contains("Elderly care") }
        assertTrue(
            "no visit in this preview has already started, so the one state that refuses a " +
                "cancellation cannot be reached from any screen",
            underWay != null
        )
        tapDescribed(underWay!!)

        assertTrue(
            "the visit that has started does not say why it cannot be cancelled here — " +
                "“${inProgress.patientWords}”. It says: ${texts().joinToString(" / ")}",
            texts().contains(inProgress.patientWords)
        )
        assertFalse(
            "a visit that has already started still offers to be cancelled. A booking screen cannot " +
                "end an encounter happening in somebody's house",
            rule.onAllNodes(describedStartingWith("Confirm cancelling") and hasClickAction())
                .fetchSemanticsNodes().isNotEmpty()
        )
        /* And it is not moved either. Rearranging an encounter that is happening is the same
           category error as ending one. */
        tap("Close")
        val moveUnderWay = rule.onAllNodes(describedStartingWith("Move the ") and hasClickAction())
            .fetchSemanticsNodes().map { it.spoken() }.first { it.contains("Elderly care") }
        tapDescribed(moveUnderWay)
        assertTrue(
            "a visit that has already started offers to be moved without saying why it cannot be. " +
                "It says: ${texts().joinToString(" / ")}",
            texts().contains(inProgress.patientWords)
        )
        assertNoCharge(texts())
    }

    @Test fun movingAVisitKeepsTheSameVisit() {
        allowForASlowEmulator()
        rule.setContent { ThusoTheme { MyThusoApp() } }
        settle()
        openTab("Visits")

        val move = rule.onAllNodes(describedStartingWith("Move the ") and hasClickAction())
            .fetchSemanticsNodes().map { it.spoken() }.firstOrNull()
        assertTrue("the visit list offers no way to move a visit", move != null)
        tapDescribed(move!!)

        val before = texts()
        val reference = before.firstOrNull { Regex("^TH-\\d+$").matches(it) }
        assertTrue("the move screen does not name the visit it is moving. It shows: ${before.joinToString(" / ")}",
            reference != null)

        /* The third day on the strip, chosen from the picker the booking screen uses — there is one
           picker in this app and this asserts that by driving it. */
        val chip = rule.onAllNodes(hasClickAction() and describedLikeALongDate())
            .fetchSemanticsNodes().sortedBy { it.positionInRoot.x }.getOrNull(2)
        assertTrue("the move screen does not offer a strip of days", chip != null)
        val chipDate = chip!!.spoken()
        rule.onAllNodes(hasClickAction() and describedExactly(chipDate)).onFirst().performScrollTo().performClick()
        rule.onAllNodes(hasText("15:00") and hasClickAction()).onFirst().performScrollTo().performClick()
        settle()
        tap("Move the visit")

        val after = texts()
        assertTrue(
            "the moved visit does not keep its reference $reference, so it is a different visit " +
                "rather than the same one at a different hour. It shows: ${after.joinToString(" / ")}",
            after.contains(reference)
        )
        assertTrue(
            "the moved visit does not say when it now is: expected $chipDate at 15:00",
            after.any { it.contains(chipDate) && it.contains("15:00") }
        )
        assertNoCharge(before + after)
    }

    // MARK: - Reading things back off a screen

    private fun assertNoCharge(said: List<String>) {
        val stated = said.distinct().filter { statesACharge.containsMatchIn(it) }
        assertTrue(
            "${stated.size} string(s) in the cancellation flow state or imply a charge. What a late " +
                "cancellation costs is an open question — section 47 of the Consumer Protection Act " +
                "68 of 2008 — recorded in packages/catalog/cancellation.json as pendingDecision, and " +
                "no screen may answer it before somebody qualified has:\n  · " +
                stated.joinToString("\n  · "),
            stated.isEmpty()
        )
    }

    private fun openTab(label: String) {
        rule.onAllNodes(isTab() and hasText(label)).onFirst().performClick()
        settle()
    }

    /* No scrolling: a dialog's confirm and dismiss buttons sit outside the scrolling column its
       content is in, and asking Compose to scroll to one fails with "no parent layout with a Scroll
       SemanticsAction" rather than with anything about the button. */
    private fun tap(label: String) {
        rule.onAllNodes(hasText(label) and hasClickAction()).onFirst().performClick()
        settle()
    }

    /* A control on the list, which may be several screenfuls down: the second visit card sits below
       the fold on a large phone, and clicking a node that has not been scrolled to lands nowhere and
       says nothing about why. */
    private fun tapDescribed(description: String) {
        rule.onAllNodes(describedExactly(description) and hasClickAction()).onFirst()
            .performScrollTo().performClick()
        settle()
    }

    /** A control in a dialog's button row, which is outside the column its content scrolls in. */
    private fun tapDialog(description: String) {
        rule.onAllNodes(describedExactly(description) and hasClickAction()).onFirst().performClick()
        settle()
    }

    private fun settle() = rule.waitForIdle()

    /** Every string on screen, dialog included, in no particular order. */
    private fun texts(): List<String> =
        rule.onAllNodes(SemanticsMatcher("every node") { true }, useUnmergedTree = true)
            .fetchSemanticsNodes()
            .flatMap { node -> node.config.getOrNull(SemanticsProperties.Text)?.map { it.text }.orEmpty() }
}
