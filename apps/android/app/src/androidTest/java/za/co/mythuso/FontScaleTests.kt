package za.co.mythuso

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.abs

/* The screens at the largest text Android's display settings offer, and at the default.
 *
 * docs/ACCESSIBILITY.md said the Android screens had been *read* for touch targets and content
 * descriptions. This file is what reading them was standing in for.
 *
 * Both scales, and neither is optional, for the reason the iOS suite gives: the largest scale is
 * where a row grows past what holds it and where a label gets squeezed out of one; the default
 * scale is where a control is at its *smallest*, and a suite that only ran at the top of the scale
 * would pass a forty-two-dp tap target because at twice the type it had grown into a legal one.
 * Nine of the ten undersized controls the iOS suite found were visible only at the default size.
 *
 * The scale is set the hard way: `settings put system font_scale`, through the shell, with the
 * activity relaunched around it. The easy way was tried first and is wrong in a way that matters.
 * Providing `LocalDensity` over the app's composition is repeatable, leaves nothing behind and
 * needs no permissions — and a CompositionLocal cannot cross a window. `AlertDialog` opens a window
 * of its own, and the Compose view inside it publishes `LocalDensity` from that window's own
 * resources, so the override stopped at the dialog's edge. The whole booking flow is a dialog. The
 * screen with the arithmetic behind it and the consent nobody can give twice was the one screen the
 * cheap technique could not measure, and it read as sixteen frozen strings rather than as a hole in
 * the harness. Setting the real thing costs two app launches a screen and measures what a person
 * would actually get. The device's own setting is read before any of this and put back after.
 *
 * Four screens rather than all of them, chosen for what each would cost a person to lose: the home,
 * where a returning patient decides anything; the booking review, the last screen before a visit is
 * confirmed; the visit list, which is where the hand-typed date strip used to end up; and the
 * Health Passport, which holds the readings and their reference ranges. Adding a screen here is
 * four lines.
 */
@RunWith(AndroidJUnit4::class)
class FontScaleTests {

    /* Empty, because this suite launches the activity itself: the font scale has to be in place
       before the activity is created, and a rule that launches one would have created it already. */
    @get:Rule val rule = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    /** Pixel density, which the font-size setting does not touch. A measurement divided by it is dp. */
    private val density = context.resources.displayMetrics.density

    private var deviceSetting = 1f

    @Before fun rememberWhatTheDeviceWasSetTo() {
        allowForASlowEmulator()
        deviceSetting = context.resources.configuration.fontScale
    }

    @After fun putTheSettingBack() {
        runCatching { setFontScale(deviceSetting) }
    }

    /* The floor a laid-out string has to clear at the largest font scale. The smallest style in
       ui/Typography.kt is labelSmall at 13sp on a 16sp line, which measures about 25dp at the top
       of Android's font-scale curve, and every other style lands higher. A string pinned to its
       default size would come back at 16 or less. Twenty sits between the two, so it separates text
       that answered the setting from text that did not without becoming a second type scale.

       It is a floor as well as the comparison below because a string that only exists at one of the
       two scales has nothing to be compared against. */
    private val legibleAtTheLargestScale = 20f

    // MARK: - The screens

    @Test fun theHomeIsUsableAtBothFontScales() {
        auditBothScales("The home") {}
    }

    @Test fun theBookingReviewIsUsableAtBothFontScales() {
        auditBothScales("The booking review") { openBookingReview() }
    }

    @Test fun theVisitListIsUsableAtBothFontScales() {
        auditBothScales("The visit list") { openTab("Visits") }
    }

    @Test fun theHealthPassportIsUsableAtBothFontScales() {
        auditBothScales("The Health Passport") { openTab("Passport") }
    }

    /* A workspace, for the strip at the top of it. Three figures over three sub-lines in two
       half-width cards is the densest row in the app, and it is the one a controller glances at
       instead of reading the board — so a sub-line squeezed out of its card at the largest scale
       takes the reason the figure is what it is with it. The Control Tower's is the worst case: its
       sub-lines are the longest ("1 refused by vetting") and its cards are half-width. */
    @Test fun theControlTowerWorkspaceIsUsableAtBothFontScales() {
        auditBothScales("The Control Tower workspace") { openWorkspace("Control Tower workspace") }
    }

    /* The cancel dialog, at both ends of the scale. It is here rather than only in
       CancellationJourneyTests because three of the four defects this suite found were invisible at
       the default scale — a blood-pressure unit and a review's field name were each measured 0dp
       wide at 2.0 while looking perfectly correct at 1.0. A dialog is the likeliest place for that
       to happen again: it is width-constrained by the framework rather than by this layout, so a
       row that fits on the screen need not fit inside it. */
    @Test fun theCancelDialogIsUsableAtBothFontScales() {
        auditBothScales("The cancel dialog") { openCancelDialog() }
    }

    // MARK: - The journeys

    private fun openTab(label: String) {
        rule.onAllNodes(isTab() and hasText(label)).onFirst().performClick()
        rule.waitForIdle()
    }

    /** Scrolled to: the workspaces sit at the bottom of More, and at the largest scale a long way
     *  below the fold — and a click on an un-scrolled node lands nowhere silently.
     *  Matched on text rather than on a description: a MenuRow publishes its title and subtitle as
     *  two Text nodes and carries no contentDescription of its own. */
    private fun openWorkspace(name: String) {
        openTab("More")
        rule.onAllNodes(hasText(name) and hasClickAction())
            .onFirst().performScrollTo().performClick()
        rule.waitForIdle()
    }

    private fun openCancelDialog() {
        openTab("Visits")
        /* Scrolled to: at the largest font scale the first visit card's action row is already below
           the fold, and clicking an un-scrolled node lands nowhere silently. */
        rule.onAllNodes(describedStartingWith("Cancel the") and hasClickAction())
            .onFirst().performScrollTo().performClick()
        rule.waitForIdle()
    }

    private fun openBookingReview() {
        openTab("Book care")
        /* Scrolled to rather than waited for: at the largest font scale the fourth service in the
           catalogue is a long way below the fold. */
        rule.onAllNodes(describedStartingWith("Blood tests") and hasClickAction())
            .onFirst().performScrollTo().performClick()
        rule.waitForIdle()
        repeat(4) {                                   // who → where → when → payment → review
            rule.onAllNodes(hasText("Continue") and hasClickAction()).onFirst().performClick()
            rule.waitForIdle()
        }
        assertTrue(
            "the review step did not open",
            rule.onAllNodes(hasText("Confirm & book") and hasClickAction()).fetchSemanticsNodes().isNotEmpty()
        )
    }

    // MARK: - The same screen at both ends of the scale

    private fun auditBothScales(name: String, journey: () -> Unit) {
        val standard = audit("$name at the default font scale", 1f, journey)
        assertUsable(standard)

        val largest = audit("$name at font scale ${Audit.LARGEST_FONT_SCALE}", Audit.LARGEST_FONT_SCALE, journey)
        assertUsable(largest)

        val unreadable = largest.textShorterThan(legibleAtTheLargestScale)
        assertTrue(
            "${largest.name}: ${unreadable.size} string(s) are laid out under " +
                "${legibleAtTheLargestScale.toInt()}dp at the largest font scale, which is text that did " +
                "not answer the setting or a box that would not let it.\n  · " +
                unreadable.joinToString("\n  · "),
            unreadable.isEmpty()
        )

        /* Not a variation on the floor above. A string can be tall and still be gone: a `Row` hands
           its unweighted children their width first, so a weighted label beside two that have grown
           can be given nothing, and it then reports itself as zero dp wide and hundreds tall. It is
           on screen in the sense that it is in the tree, and it is not on screen in the sense that
           anybody can read it. */
        val squeezed = largest.textSqueezedToNothing()
        assertTrue(
            "${largest.name}: ${squeezed.size} string(s) were squeezed out of their row at the largest " +
                "font scale and are not drawn at all.\n  · " + squeezed.joinToString("\n  · "),
            squeezed.isEmpty()
        )

        assertNothingFroze(name, standard, largest)
    }

    /** One launch, at one setting, walked to one screen and read. */
    private fun audit(name: String, scale: Float, journey: () -> Unit): ScreenAudit {
        setFontScale(scale)
        ActivityScenario.launch(MainActivity::class.java).use {
            rule.waitForIdle()
            journey()
            return ScreenAudit(rule, name, density).read()
        }
    }

    /* A string laid out the same height at both ends of the scale did not answer the setting.
       What counts as "the same" is not obvious on Android and the first version of this file got it
       wrong. The scale is not a multiplier: at 2.0 the platform's font-scale curve grows a 13sp
       caption about 1.85 times and a 28sp headline about 1.33, because the whole point of the curve
       is that large text does not need doubling to be readable. A threshold of 1.5 — which is what
       the iOS suite can use, Dynamic Type being closer to uniform — failed three headline numbers
       on the Health Passport that had scaled exactly as the platform intended.

       So the threshold is 1.2, which is comfortably under the 1.33 the flattest part of the curve
       gives and comfortably over the 1.0 of text that ignored the setting.

       It is asked of the letters and then of the box around them, and the second question is not a
       restatement of the first. A `fontSize` written as `15.dp.toSp()` — the Compose spelling of
       "this many pixels whatever the reader asked for" — leaves the box growing, because the line
       height beside it is still the type scale's own sp; only the letters stay small. A
       `Modifier.height` around a row does the opposite: the letters are willing and the box will
       not let them. Neither question finds the other's failure, and the app was broken both ways in
       turn to check that.

       The letters are measured rather than guessed at. Width was tried first and is worthless for
       this: the tree reports the width the *layout* gave a string, so `fillMaxWidth` text is the
       width of its column at both settings and text in the rail layout at 2.0 is narrower than at
       1.0 because the rail took 110dp off the row. It flagged five strings that had scaled
       perfectly. `SemanticsActions.GetTextLayoutResult` hands back the resolved `TextStyle` and the
       density it was resolved against, which is the actual size in dp and not a proxy for it.

       Strings are paired on the whole string rather than on an opening, which iOS cannot do: a
       Compose `Text` publishes its entire string to the semantics tree whether or not it is
       visually truncated, so the same words are the same key at both scales. Strings that appear at
       one scale and not the other are not compared, because there is nothing to compare them with. */
    private fun assertNothingFroze(name: String, standard: ScreenAudit, largest: ScreenAudit) {
        val frozen = standard.textHeights.entries.sortedBy { it.key }.mapNotNull { (text, small) ->
            val big = largest.textHeights[text] ?: return@mapNotNull null
            if (small <= 0f) return@mapNotNull null
            val smallFont = standard.fontSizes[text]
            val bigFont = largest.fontSizes[text]
            when {
                smallFont != null && bigFont != null && smallFont > 0f && bigFont < smallFont * 1.2f ->
                    "“${text.take(44)}” is set in ${Math.round(smallFont)}dp of type at the default scale " +
                        "and ${Math.round(bigFont)}dp at ${Audit.LARGEST_FONT_SCALE}x — the letters ignored " +
                        "the setting, whatever the box around them did"
                big < small * 1.2f ->
                    "“${text.take(44)}” is laid out ${Math.round(small)}dp tall at the default scale and " +
                        "${Math.round(big)}dp at ${Audit.LARGEST_FONT_SCALE}x — whatever holds it will not " +
                        "let it get taller"
                else -> null
            }
        }
        assertTrue(
            "${frozen.size} string(s) on $name ignore the font scale. Every size in ui/Typography.kt " +
                "is in sp and answers it; a box drawn in dp around one does not.\n  · " +
                frozen.joinToString("\n  · "),
            frozen.isEmpty()
        )
    }

    /* Written through the shell, then waited for rather than assumed: the setting is delivered to
       the process as a configuration change and the next line of a test would otherwise run against
       whatever scale the last one left. If it never arrives the test says so, because a suite that
       silently measured the same screen twice at the same size would pass and mean nothing. */
    private fun setFontScale(scale: Float) {
        instrumentation.uiAutomation
            .executeShellCommand("settings put system font_scale $scale").close()
        val deadline = System.currentTimeMillis() + 30_000
        while (System.currentTimeMillis() < deadline) {
            instrumentation.waitForIdleSync()
            if (abs(context.resources.configuration.fontScale - scale) < 0.01f) return
            Thread.sleep(100)
        }
        throw AssertionError(
            "the device did not take font_scale $scale — it is still at " +
                "${context.resources.configuration.fontScale}, so nothing below would be measuring " +
                "what it says it is"
        )
    }
}

/** The bottom bar's items and the rail's, which are the same destinations drawn two ways. */
internal fun isTab() = SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)

/** Every card in this app names itself with a content description rather than with its own words. */
internal fun describedStartingWith(prefix: String) =
    SemanticsMatcher("has a content description beginning “$prefix”") { node ->
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.any { it.startsWith(prefix) } == true
    }
