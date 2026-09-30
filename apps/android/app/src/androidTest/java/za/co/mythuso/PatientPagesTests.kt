package za.co.mythuso

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import za.co.mythuso.model.PatientPagesData.Activity as Moving
import za.co.mythuso.model.PatientPagesData.MentalHealth as Mental
import za.co.mythuso.ui.*

/* Mental health and Activity on the phone, held to what the web's journey (tests/patient-export-screens.spec.ts)
 * asserts and refuses: the emergency screen before the crisis lines, no session to book and no mood scale,
 * doors only to screens this app has, and the activity page's one figure being the count of the rows under it.
 * Every sentence is looked up in the generated contract rather than typed here, so a reworded contract moves
 * the test with it and a screen that stopped reading the contract fails. */
@RunWith(AndroidJUnit4::class)
class PatientPagesTests {
    @get:Rule val rule = createComposeRule()

    @Test fun mentalHealthPutsTheEmergencyScreenFirstAndDrawsNoDoorToNowhere() {
        allowForASlowEmulator()
        var opened = ""
        rule.setContent { ThusoTheme { MentalHealthScreen { opened = it } } }
        rule.onNodeWithText(Mental.heading).assertExists()
        rule.onNodeWithText(PatientPagesData.Review.notice).assertExists()

        /* The emergency door is above the first crisis line on the screen, and every line is there. */
        val action = rule.onNodeWithText(Mental.Crisis.action).performScrollTo().fetchSemanticsNode().boundsInRoot
        CrisisLinesData.lines.forEach { line ->
            val shown = rule.onNodeWithContentDescription("${line.name}, ${line.spoken}.", substring = true).performScrollTo().fetchSemanticsNode().boundsInRoot
            assertTrue("${line.name} is drawn above the door to the emergency screen", shown.top > action.bottom)
        }
        rule.onNodeWithText(Mental.Crisis.nothingDials).assertExists()

        /* What the export drew and this page refuses. */
        rule.onAllNodesWithText("Available now", substring = true, ignoreCase = true).assertCountEquals(0)
        rule.onAllNodesWithText("Book a session", substring = true, ignoreCase = true).assertCountEquals(0)
        listOf("Great", "Good", "Okay", "Low", "Struggling").forEach { face ->
            rule.onAllNodes(hasText(face) and hasClickAction()).assertCountEquals(0)
        }
        rule.onNodeWithText(PatientPages.moodRefusal).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(Mental.Mood.why).assertExists()

        /* No catalogue screen exists on this phone, so the button gives way to the entry's own name and phase. */
        rule.onAllNodesWithText(Mental.Session.action).assertCountEquals(0)
        rule.onNodeWithText(Mental.Session.catalogueEntry).assertExists()

        /* A door is drawn only when this app has its screen: the library and community support are web pages. */
        Mental.doors.forEach { door ->
            val drawn = door.kind == "anchor" || PatientPages.routeFor(door.target) != null
            if (drawn) rule.onNodeWithText(door.title).assertExists()
            else rule.onAllNodesWithText(door.title).assertCountEquals(0)
        }
        val journal = Mental.doors.first { it.target == "Live well" }
        rule.onNodeWithText(journal.title).performScrollTo().performClick()
        rule.runOnIdle { assertEquals("Live well", opened) }
        rule.onNodeWithText(Mental.Crisis.action).performScrollTo().performClick()
        rule.runOnIdle { assertEquals("Emergency & urgent care", opened) }
    }

    @Test fun activityCountsTheMovingEntriesItListsAndMeasuresNothing() {
        allowForASlowEmulator()
        val store = PreviewStore()
        var opened = ""
        rule.setContent { ThusoTheme { ActivityScreen(store) { opened = it } } }
        rule.onNodeWithText(PatientPages.noDevice).assertExists()
        val counted = Moving.tiles.first { it.value == Moving.COUNTED }

        fun countShown() = rule.onNodeWithContentDescription("${counted.label}:", substring = true).fetchSemanticsNode()
            .config[SemanticsProperties.ContentDescription].first()

        val before = PatientPages.moving(store.wellbeing).size
        assertTrue("the preview's journal has a Moving entry to list", before > 0)
        assertTrue(countShown().startsWith("${counted.label}: $before."))
        Moving.tiles.filter { it.value != Moving.COUNTED }.forEach { tile ->
            rule.onNodeWithContentDescription("${tile.label}: ${tile.value}.", substring = true).assertExists()
        }

        /* Writing a Moving entry in the journal adds a row and moves the count by exactly one. */
        rule.runOnIdle { store.wellbeing.add(0, Wellbeing.written("moving", "Took the stairs at the clinic.")) }
        rule.onNodeWithText("Took the stairs at the clinic.").assertExists()
        assertTrue(countShown().startsWith("${counted.label}: ${before + 1}."))

        /* No figure anybody measured: no step count and no minutes. */
        val measured = Regex("\\d[\\d ]* steps|\\d+ min\\b", RegexOption.IGNORE_CASE)
        rule.onAllNodes(SemanticsMatcher("shows a measured figure") { node ->
            node.config.getOrNull(SemanticsProperties.Text).orEmpty().any { measured.containsMatchIn(it.text) }
        }).assertCountEquals(0)

        rule.onNodeWithText(Moving.Wearable.action).performScrollTo().performClick()
        rule.runOnIdle { assertEquals("Health Connect", opened) }
    }

    @Test fun activityWithNothingWrittenSaysSoAndCountsNought() {
        allowForASlowEmulator()
        val store = PreviewStore().apply { wellbeing.removeAll { it.habit == PatientPagesData.Activity.habit } }
        rule.setContent { ThusoTheme { ActivityScreen(store) {} } }
        rule.onNodeWithText(Moving.emptyTitle).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(Moving.emptyDetail).assertExists()
        val counted = Moving.tiles.first { it.value == Moving.COUNTED }
        rule.onNodeWithContentDescription("${counted.label}: 0.", substring = true).assertExists()
    }
}
