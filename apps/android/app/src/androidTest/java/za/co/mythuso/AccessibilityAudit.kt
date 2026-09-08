package za.co.mythuso

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.test.espresso.IdlingPolicies
import org.junit.Assert.assertTrue
import java.util.concurrent.TimeUnit

/* What iOS already measures, measured on Android.
 *
 * apps/ios/MyThusoUITests asks four questions of a rendered iOS screen — is every control big
 * enough to hit, does every string answer the text-size setting, does a picture reach the
 * accessibility tree under its file name, and does the booking journey's arithmetic survive being
 * read back off the screen. Android had none of that. `:app:lintDebug` runs on every build and the
 * comment above it in build.gradle.kts is honest about the little it can see; everything else was
 * "read by hand", which is the same sentence iOS carried before its suite was written and found
 * eight real defects on screens that had been read, screenshotted and called verified.
 *
 * The questions are deliberately the same ones. Two of the answers are not.
 *
 * The floor is 48dp rather than 44. That is Material's `minimumInteractiveComponentSize` and the
 * number apps/android/.../ui/Theme.kt already holds in `TouchTarget`; it is the platform's own
 * figure, not a copy of a web token, and it happens to be four larger than Apple's. The AA floor
 * underneath it — 24, from WCAG 2.2 SC 2.5.8 — is the same on every platform, because that one is
 * WCAG's rather than a vendor's.
 *
 * How a target is measured took some finding out, and the obvious answer is wrong. Compose's
 * `SemanticsNode.touchBoundsInRoot` is documented as the region a pointer will be dispatched to,
 * which sounds like exactly the thing WCAG defines a target to be — and it is useless here, because
 * Compose applies a 48dp minimum touch slop to *every* pointer-input node during hit testing. A
 * `Box(Modifier.size(20.dp).clickable {})` measured in this harness reports touch bounds of 48x48.
 * A check written on that number can never fail, and a check that can never fail is worse than no
 * check because somebody will cite it. (The slop is real but it is a fallback: it only wins a hit
 * that landed on nothing else, so two 24dp controls side by side still divide the space between
 * them at the halfway line. It is not a design meeting the guideline.)
 *
 * What is measured instead is the size the layout actually gave the control, which is two numbers:
 *
 *   `SemanticsNode.size`       — the coordinator the semantics sit on. For a bare `Modifier.clickable`
 *                                this is the whole story. For a Material control it is the *drawn*
 *                                box, which is smaller: a Checkbox draws 24dp, a TextButton 40.
 *   `SemanticsNode.layoutInfo` — the layout node's own measured size, after every layout modifier on
 *                                it. `Modifier.minimumInteractiveComponentSize()` is one of those,
 *                                and it genuinely reserves 48dp of space and centres the drawing in
 *                                it, so a Checkbox's layout node measures 48 while it draws 24.
 *
 * The larger of the two per axis is the target. Measured that way a Checkbox is 48 (reserved, and
 * correctly so), an IconButton is 48, a TextButton is 48 — and the 20dp clickable Box is 20, which
 * is the answer that matters. Both numbers are unclipped, so a control below the fold measures the
 * same as one on screen and the audit needs no scrolling; `boundsInRoot` and `touchBoundsInRoot`
 * are both clipped to the window and report a row nine screenfuls down as 0x0.
 *
 * The one shape this mis-reads is `Modifier.fillMaxWidth().padding(40.dp).clickable {}`, where the
 * layout node is the padded outer box and only its middle is clickable. That pattern does not
 * appear in this app — padding is applied after `clickable` everywhere, which is what makes the
 * padding tappable — and if it ever does, this check will pass something it should not.
 *
 * One caveat that matters for reading a failure, and it is the same caveat iOS states about
 * XCUITest. Espresso and the Compose test harness walk the semantics tree, which is what TalkBack
 * is *built from* but is not what TalkBack reads: this harness cannot hear reading order, cannot
 * tell whether a merged card's sentence makes sense out loud, and cannot see focus behaviour. So
 * everything below is either something the tree can answer exactly — a measured size, a string
 * that did not change height, a description that is a file name — or it is printed as a note and
 * not asserted. Nothing here is evidence that anybody has ever listened to this app; nobody has.
 */
object Audit {

    /** Material's minimum interactive component size, and what `ui/Theme.kt` calls `TouchTarget`. */
    const val MINIMUM_TARGET = 48f

    /** WCAG 2.2 SC 2.5.8 at AA. Under this line an exemption stops being an exemption. */
    const val ABSOLUTE_MINIMUM_TARGET = 24f

    /* The top of the scale Android's own display settings offer, which is 200%. It is driven by
       overriding `LocalDensity` rather than by writing `settings put system font_scale`, so a run
       is repeatable and leaves nothing behind on the emulator for the next one to inherit — the
       same reason the iOS suite passes a launch argument instead of touching Settings.

       It is worth knowing what that does and does not reproduce, because it surprised this file
       once already. `Density(density, fontScale)` is not a linear multiplier: it builds itself a
       `FontScaleConverter`, so sp turns into dp along the same *non-linear* curve Android 14 uses,
       where small text grows nearly twice and large text grows about a third. Measured on this
       app at 2.0, a 15sp title grew 1.81 times and a 28sp headline 1.33. That is the real
       behaviour and it is why the frozen-text threshold in FontScaleTests is 1.2 rather than the
       1.5 the iOS suite can afford. What is *not* reproduced is the activity recreation a real
       font-size change causes; nothing in MainActivity depends on one. */
    const val LARGEST_FONT_SCALE = 2f

    /* Controls that Compose will not let this design make 48dp, each with what it actually measured
       and what was tried. The shape is apps/ios/MyThusoUITests/AccessibilityAudit.swift's
       `knownUndersized`, deliberately: a name, a number and a sentence, so an exemption carries its
       own evidence and can be read against a later measurement.

       An exemption is permission to be under 48. It is never permission to be under the 24 WCAG
       requires at AA, and it is never permission to have got smaller since somebody wrote the row.
       Both of those still fail. */
    data class Exemption(val control: String, val measured: Float, val note: String)

    val knownUndersized: List<Exemption> = emptyList()

    /* Every drawable this app ships, read off the generated R class rather than typed, so a
       picture added tomorrow is covered by this without anybody remembering to add it. If one of
       these names arrives in the semantics tree as a content description then nobody wrote a
       sentence and nobody hid the image, and TalkBack reads a file name to somebody who cannot see
       the picture. */
    val drawableNames: Set<String> by lazy {
        R.drawable::class.java.fields.map { it.name }.toSet()
    }

    private val FILE_SHAPED = Regex("^[a-z0-9]+([_.-][a-z0-9]+)+$")
    private val PLACEHOLDERS = setOf("image", "icon", "button", "picture", "link", "photo", "img", "logo")

    /** A description that is a file name, a resource id, or a word for the widget rather than a sentence. */
    fun meaningless(description: String): Boolean {
        val trimmed = description.trim()
        if (trimmed.isEmpty()) return true
        if (trimmed.lowercase() in PLACEHOLDERS) return true
        if (trimmed in drawableNames) return true
        return FILE_SHAPED.matches(trimmed)
    }
}

/** A control as the tree reports it: the box it drew, and the space its layout node reserved. */
private data class ControlSighting(var drawn: Pair<Float, Float>, var target: Pair<Float, Float>)

/* One screen, read once.
 *
 * There is no sweep here and there does not need to be one, which is the largest structural
 * difference from the iOS file. Every scrolling screen in this app is a `Column` with
 * `Modifier.verticalScroll` — `ScreenColumn` in CareScreens.kt — and a verticalScroll composes all
 * of its children whatever the scroll position, so the whole of a nine-screenful screen is in the
 * semantics tree at once with real sizes on it. XCUITest cannot do that and has to swipe.
 *
 * That is only true while no lazy list appears, so `read` asserts it rather than assuming it: a
 * LazyColumn or LazyVerticalGrid publishes `IndexForKey` on its scroll container, and if one turns
 * up the audit is no longer reading the whole screen and says so instead of quietly measuring the
 * first screenful.
 */
class ScreenAudit(private val rule: ComposeTestRule, val name: String, private val density: Float) {
    private val controls = linkedMapOf<String, ControlSighting>()
    private val descriptions = linkedMapOf<String, String>()   // description -> where it was seen
    private val imagesWithoutDescription = mutableListOf<String>()
    /** Text as the tree has it, against the tallest box it was laid out in, in dp. */
    val textHeights = linkedMapOf<String, Float>()

    /* And the widest. A `Row` shares its width out by measuring its unweighted children first, so a
       weighted one can be handed nothing at all: a label with `Modifier.weight(1f)` beside two
       fixed children that have grown past the row comes back zero dp wide and however many
       thousands of dp tall its own text would need. Nothing is drawn — the word is simply gone from
       the screen — and neither the semantics tree nor a screenshot of the default font scale shows
       it, because at the default font scale it fits. This is the shape of failure that belongs to
       this platform, the way clipped-but-labelled text belongs to iOS. */
    val textWidths = linkedMapOf<String, Float>()

    /* And the size its letters were set in, in dp, after the reader's setting has been applied.
       Text pinned to a size it will not move off was the finding that mattered most on iOS, and on
       Android it cannot be inferred from the box: `fontSize = 15.dp.toSp()` divides the reader's
       scale straight back out of the size, and because the line height beside it is still the type
       scale's own sp the box grows anyway. The letters do not. Nothing about the layout shows that,
       and nor does a screenshot at one setting. */
    val fontSizes = linkedMapOf<String, Float>()
    var nodesRead = 0
        private set

    private fun px(value: Float) = value / density

    fun read(): ScreenAudit {
        rule.waitForIdle()
        val everything = SemanticsMatcher("every node") { true }
        val merged = rule.onAllNodes(everything, useUnmergedTree = false).fetchSemanticsNodes()
        val unmerged = rule.onAllNodes(everything, useUnmergedTree = true).fetchSemanticsNodes()
        nodesRead = unmerged.size

        val lazy = unmerged.filter { it.config.contains(SemanticsProperties.IndexForKey) }
        assertTrue(
            "$name: a lazy list has appeared on this screen, so reading the tree once no longer " +
                "reads the whole screen — everything below the fold is uncomposed and unmeasured. " +
                "The audit has to scroll before it can be believed again.",
            lazy.isEmpty()
        )

        /* Controls come off the merged tree, because a merged node is the thing TalkBack stops on
           and the thing a thumb aims at: a card that has merged its six children is one target with
           one name, not six unnamed ones. */
        for (node in merged) {
            if (node.isRoot) continue
            if (!node.isControl()) continue
            val drawn = px(node.size.width.toFloat()) to px(node.size.height.toFloat())
            if (drawn.first <= 0f || drawn.second <= 0f) continue          // never placed
            val reserved = px(node.layoutInfo.width.toFloat()) to px(node.layoutInfo.height.toFloat())
            val target = maxOf(drawn.first, reserved.first) to maxOf(drawn.second, reserved.second)
            val key = "${node.roleName()} “${node.spoken().take(60)}”"
            val existing = controls[key]
            /* The smallest sighting wins, for the reason the iOS file gives: two controls can carry
               the same words — a section's "See all" link beside the full-width button under it —
               and letting the larger vouch for the smaller passes exactly the one a thumb misses. */
            controls[key] = if (existing == null) ControlSighting(drawn, target) else ControlSighting(
                minOf(existing.drawn.first, drawn.first) to minOf(existing.drawn.second, drawn.second),
                minOf(existing.target.first, target.first) to minOf(existing.target.second, target.second)
            )
        }

        /* Text and pictures come off the unmerged tree, because that is where they still exist as
           themselves. A `Text` inside a merged card has no node of its own in the merged tree, and
           its height is the thing the font-scale check is about. */
        for (node in unmerged) {
            node.config.getOrNull(SemanticsProperties.Text)?.forEach { annotated ->
                val string = annotated.text
                if (string.isBlank()) return@forEach
                val height = px(node.size.height.toFloat())
                val width = px(node.size.width.toFloat())
                if (height <= 0f) return@forEach
                textHeights[string] = maxOf(textHeights[string] ?: 0f, height)
                textWidths[string] = maxOf(textWidths[string] ?: 0f, width)
            }
            /* The size the letters were actually drawn at, asked of the node rather than inferred.
               `GetTextLayoutResult` is the action TalkBack uses to find out where a character is on
               screen, and the result it hands back carries the whole resolved `TextStyle` and the
               density it was resolved against — so the font size can be read in dp, after the type
               scale, the theme and the reader's setting have all had their say. Nothing else in the
               tree exposes it: two strings can be the same height and be set in different sizes,
               because the height is the line box and the line box belongs to whatever holds it. */
            val layouts = mutableListOf<TextLayoutResult>()
            if (node.config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action?.invoke(layouts) == true) {
                val input = layouts.firstOrNull()?.layoutInput
                val declared = input?.style?.fontSize
                if (input != null && declared != null && declared.isSp) {
                    val drawn = with(input.density) { declared.toDp().value }
                    node.config.getOrNull(SemanticsProperties.Text)?.forEach { annotated ->
                        if (annotated.text.isNotBlank()) {
                            fontSizes[annotated.text] = maxOf(fontSizes[annotated.text] ?: 0f, drawn)
                        }
                    }
                }
            }
            node.config.getOrNull(SemanticsProperties.ContentDescription)?.forEach { description ->
                descriptions.putIfAbsent(description, node.roleName())
            }
            if (node.config.getOrNull(SemanticsProperties.Role) == Role.Image &&
                node.config.getOrNull(SemanticsProperties.ContentDescription).isNullOrEmpty()
            ) {
                imagesWithoutDescription += "a ${px(node.size.width.toFloat()).toInt()}x" +
                    "${px(node.size.height.toFloat()).toInt()}dp image"
            }
        }
        return this
    }

    /** Strings shorter than a floor, for a reading taken at the largest font scale. */
    fun textShorterThan(floor: Float): List<String> =
        textHeights.filter { it.value < floor }.entries.sortedBy { it.key }
            .map { "“${it.key.take(44)}” is laid out ${round(it.value)}dp tall" }

    /** Strings the layout left no room for at all. */
    fun textSqueezedToNothing(): List<String> =
        textWidths.filter { it.value < 1f }.entries.sortedBy { it.key }
            .map { "“${it.key.take(44)}” is laid out ${round(it.value)}dp wide and " +
                "${round(textHeights[it.key] ?: 0f)}dp tall — the row it is in gave it no width" }

    /** Everything this screen got wrong, in sentences, so a failure says what to go and change. */
    fun failures(): List<String> {
        val found = mutableListOf<String>()
        val notes = mutableListOf<String>()

        for ((key, sighting) in controls.entries.sortedBy { it.key }) {
            val smallest = minOf(sighting.target.first, sighting.target.second)
            val target = "${round(sighting.target.first)}x${round(sighting.target.second)}dp"
            val drawn = if (sighting.drawn == sighting.target) "" else
                " (it draws ${round(sighting.drawn.first)}x${round(sighting.drawn.second)}dp inside that)"
            /* Half a dp of slack and only half, for the same reason the iOS file gives half a
               point: a control that asked for 48 comes back 47.67 when a density rounds, and a
               check that fails over a third of a dp is a check people switch off. */
            if (smallest < Audit.MINIMUM_TARGET - 0.5f) {
                val exemption = Audit.knownUndersized.firstOrNull { it.control == key }
                when {
                    exemption == null -> found += "$key is laid out $target$drawn, under the " +
                        "${Audit.MINIMUM_TARGET.toInt()}dp Material sets as the minimum and ui/Theme.kt calls " +
                        "TouchTarget. Either give it Modifier.heightIn(min = TouchTarget) or write down in " +
                        "Audit.knownUndersized what was tried and why it cannot be"
                    smallest < Audit.ABSOLUTE_MINIMUM_TARGET -> found += "$key is $target, under the " +
                        "${Audit.ABSOLUTE_MINIMUM_TARGET.toInt()}dp WCAG 2.2 SC 2.5.8 requires at AA. Its " +
                        "exemption says ${round(exemption.measured)}, so this is a defect with paperwork " +
                        "rather than an exemption"
                    smallest < exemption.measured - 1f -> found += "$key is $target and its exemption says " +
                        "${round(exemption.measured)}. It has got smaller since somebody wrote down why it " +
                        "could not be bigger"
                }
            }
            if (Audit.meaningless(key.substringAfter("“").substringBeforeLast("”"))) {
                found += "$key at $target carries nothing a person could act on — a control needs a " +
                    "name that says what it does"
            }
        }

        for ((description, where) in descriptions.entries.sortedBy { it.key }) {
            if (Audit.meaningless(description)) {
                found += "the $where described to TalkBack as “$description” is named by a file name or " +
                    "a word for the widget rather than by a sentence about what it is"
            }
        }

        /* Reported, not failed, and the distinction is the same one the iOS file draws. A Compose
           `Image(painter, null)` publishes no semantics at all, so a decorative picture is genuinely
           absent from this tree rather than merely hidden in it — which is why the count below is
           normally nought and why a non-nought is worth seeing. It is a note rather than an
           assertion because a picture that carries Role.Image with no description could equally be
           a control mid-composition, and this harness cannot tell TalkBack's silence from its own. */
        if (imagesWithoutDescription.isNotEmpty()) {
            notes += "${imagesWithoutDescription.size} node(s) publish Role.Image with no description: " +
                imagesWithoutDescription.joinToString("; ") + ". Check them with TalkBack"
        }
        notes += "read ${controls.size} control(s), ${textHeights.size} string(s) and " +
            "${descriptions.size} description(s) over $nodesRead semantics node(s). The tree is what " +
            "TalkBack is built from and not what TalkBack reads: reading order, focus and whether a " +
            "merged sentence makes sense out loud are not measured by anything in this directory"
        notes.forEach { println("  note · $name: $it") }
        return found
    }

    private fun round(value: Float) = Math.round(value)
}

private fun SemanticsNode.isControl(): Boolean {
    if (config.contains(SemanticsActions.OnClick)) return true
    if (config.contains(SemanticsActions.SetText)) return true
    return config.getOrNull(SemanticsProperties.Role) in setOf(
        Role.Button, Role.Checkbox, Role.RadioButton, Role.Switch, Role.Tab, Role.DropdownList
    )
}

internal fun SemanticsNode.roleName(): String = when (config.getOrNull(SemanticsProperties.Role)) {
    Role.Button -> "button"
    Role.Checkbox -> "checkbox"
    Role.RadioButton -> "radio button"
    Role.Switch -> "switch"
    Role.Tab -> "tab"
    Role.Image -> "image"
    Role.DropdownList -> "dropdown"
    else -> if (config.contains(SemanticsActions.SetText)) "text field" else "control"
}

/** What a screen reader would be given for this node: its description, else its own words. */
internal fun SemanticsNode.spoken(): String {
    config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" ")
        ?.takeIf { it.isNotBlank() }?.let { return it }
    config.getOrNull(SemanticsProperties.Text)?.joinToString(" ") { it.text }
        ?.takeIf { it.isNotBlank() }?.let { return it }
    return config.getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()
}

/** A failure that names every problem on the screen rather than the first one found. */
fun assertUsable(audit: ScreenAudit) {
    val failures = audit.failures()
    assertTrue(
        "${audit.name} — ${failures.size} problem(s):\n  · " + failures.joinToString("\n  · "),
        failures.isEmpty()
    )
}

/* Espresso gives a screen sixty seconds to go quiet and then declares the app hung. That is a
   generous allowance on a developer's laptop and not always a generous one here: these tests run on
   an arm64 emulator that is sharing a machine with a Gradle build, and the first composition of a
   cold-started app has been seen to take longer than a minute — the failure that produced was a
   "ComposeNotIdleException" thrown out of `setContent`, which reads like a hung app and was a busy
   one. The allowance is raised rather than the flake tolerated, because a suite that fails once in
   five runs for a reason nobody can reproduce is a suite people learn to re-run rather than read.

   It is worth saying what this is *not* working around. The home draws a 22-second
   `rememberInfiniteTransition` behind the greeting, and an animation that never ends would keep a
   composition busy for ever — but Compose's test infrastructure installs an InfiniteAnimationPolicy
   that excludes exactly those from the idleness question, so the home settles like any other
   screen. */
fun allowForASlowEmulator() {
    IdlingPolicies.setMasterPolicyTimeout(4, TimeUnit.MINUTES)
    IdlingPolicies.setIdlingResourceTimeout(4, TimeUnit.MINUTES)
}
