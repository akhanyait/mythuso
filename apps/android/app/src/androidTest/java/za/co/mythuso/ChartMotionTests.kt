package za.co.mythuso

import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.ui.*

@RunWith(AndroidJUnit4::class)
class ChartMotionTests {
    @get:Rule val rule = createComposeRule()

    @Test fun plottedReadingsRevealThenStayStillAndTheirTableRemainsAccessible() {
        allowForASlowEmulator()
        rule.mainClock.autoAdvance = false
        rule.setContent { ThusoTheme {
            ClinicalChart("Systolic pressure", "mmHg", listOf(
                Reading("Monday", 128.0), Reading("Tuesday", 134.0),
                Reading("Wednesday", 141.0), Reading("Thursday", 136.0)
            ), 90.0..140.0)
        } }
        rule.mainClock.advanceTimeBy(48)
        val plot = rule.onNode(hasContentDescription("Systolic pressure. Latest sample", substring = true))
        val first = plot.captureToImage().toPixelMap()
        rule.mainClock.advanceTimeBy(1000)
        val finished = plot.captureToImage().toPixelMap()
        fun differs(a: androidx.compose.ui.graphics.PixelMap, b: androidx.compose.ui.graphics.PixelMap): Boolean {
            for (y in 0 until a.height) for (x in 0 until a.width) if (a[x, y] != b[x, y]) return true
            return false
        }
        assertTrue("The recorded line should reveal", differs(first, finished))
        rule.mainClock.advanceTimeBy(2000)
        assertFalse("A finished record must not oscillate", differs(finished, plot.captureToImage().toPixelMap()))
        rule.mainClock.autoAdvance = true
        rule.onNodeWithText("Show readings as a table").performClick()
        rule.onNodeWithText("136 mmHg").assertExists()
    }
}
