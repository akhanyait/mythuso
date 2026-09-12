package za.co.mythuso.ui

import android.app.ActivityManager
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.ArrowOutward
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/* The dashboard language, as Compose.
 *
 * docs/DESIGN-LANGUAGE.md is the direction and apps/web/src/surface/ is the implementation the web
 * already has. Android carried the new palette — Tokens.kt is generated and has held mist, charcoal,
 * stone and the four sages since the palette landed — and not one of the shapes, which is why the
 * three apps looked like relatives rather than one product. The palette is the smaller half. What
 * makes the reference recognisable is four specific pieces:
 *
 *   1. A metric is a status chip floating ABOVE a large thin numeral, with a small label beneath.
 *      This app did the exact inverse on every screen: a small label above a bold figure. That
 *      inversion is most of why it looked nothing like the reference.
 *   2. Navigation is a pill row — icon, label, a circular arrow at the trailing edge — and the
 *      circle inverts on the selected row, which is what makes it read as where you are rather than
 *      as one more thing you could press.
 *   3. Separation is a hairline and a lighter fill, never a shadow. Material's default card
 *      elevation is the opposite of this language, so it is switched off rather than tuned down.
 *   4. Sage is a fill and never a label. Everything read is charcoal.
 *
 * Nothing in this file knows anything about health. It is shape only.
 *
 * ---- THE BLUR DECISION, AND THE MEASUREMENT BEHIND IT ----
 *
 * There is no blur here. Compose has no cheap `.ultraThinMaterial`: a real backdrop blur means
 * capturing the content behind a panel into a GraphicsLayer and re-drawing it through a
 * RenderEffect every frame, once per panel, and the handset this product is actually for is a nurse's
 * mid-range Android on a prepaid bundle in the field all day. The web learned this the expensive
 * way — backdrop-filter on every chip and button, about forty compositor layers a screen, and a
 * click timing out one run in three.
 *
 * What is here instead is a translucent tint with no blur, and on this palette that costs nothing
 * measurable. packages/design-tokens/tokens.json declares glass as white at 72% with `glassFloor`
 * (#F9FAF8) as its floor — the composite of that tint over the darkest point the ground is allowed
 * to reach. The floor is a property of the TINT, not of the blur: white at 72% over the ground
 * resolves to exactly the same colour whether or not what is underneath was blurred first. So every
 * contrast figure measured against `glassFloor` is true here, and the thing dropped is the optical
 * softening and nothing else.
 *
 * ---- THE FLOOR RULE ----
 *
 * A translucent surface has no colour of its own, so a contrast figure against it is a guess about
 * position unless it resolves to a declared floor. The ground below can never go darker than
 * `GlassFloorGround`, every tint composites over that to `GlassFloor`, and where translucency is
 * refused the panel is painted `GlassFloor` outright — which is not a lesser version, it is the
 * exact colour the ratios were computed against.
 */

/** Whether this device should be given flat, opaque surfaces instead of translucent ones.
 *
 * Android has no reduced-transparency switch of iOS's kind, so this is not one setting read but
 * three conditions that each mean the same thing in practice, and the panel resolves to the
 * declared floor under any of them:
 *
 *   High-contrast text is on. It is the accessibility setting whose intent is closest — a reader who
 *   has asked the system to stop being subtle about text has asked for this too.
 *   The device is low-RAM. Android's own word for the handsets translucency costs the most on.
 *   Battery saver is on, which on a prepaid phone in the field is most of the day.
 */
@Composable fun prefersOpaqueSurfaces(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val highContrastText = Settings.Secure.getInt(context.contentResolver, "high_text_contrast_enabled", 0) == 1
        val lowRam = (context.getSystemService(ActivityManager::class.java))?.isLowRamDevice == true
        val saving = (context.getSystemService(PowerManager::class.java))?.isPowerSaveMode == true
        highContrastText || lowRam || saving
    }
}

/** THE GROUND IS PAPER NOW.
 *
 * It was three pale tints — auroraWarm, auroraCool, auroraSage — drawn so a translucent panel had
 * something to refract, because glass over a flat colour reads as a grey card.
 *
 * The Care Studio generation the founder chose on 12 September has one ground and it is studioPaper,
 * a cream. Three tints under it would be the previous palette showing through the new one. So: paper,
 * with one soft white highlight rather than three of anything. Glass still has a gradient; the ground
 * is one colour.
 *
 * The arithmetic gets easier rather than harder. Every point on this ground is at least as light as
 * `mist`, which is what every charcoal pair in tokens.json was measured against, and GlassFloor is the
 * tint over the darkest point the ground may reach — a lighter ground makes that floor conservative
 * rather than optimistic. It still does not move: a ground that drifts is a box that keeps changing
 * under a thumb, and this is a phone somebody is holding on a doorstep. */
@Composable fun studioGroundBrush(): Brush = Brush.linearGradient(
    0.0f to SurfaceWhite, 0.35f to StudioPaper, 1.0f to StudioPaper
)

/* Secondary text, and the ground it is allowed to sit on.
 *
 * THIS USED TO BE TWO SLATE BLUES AND A HOLE. A metric's label was `faint`, measured on white, mist
 * and cloud — and 3.75 on the sage lead panel, which fails AA for body text and which NOTHING WOULD
 * HAVE CAUGHT: the contrast check computes the pairs the token file lists, and faint-on-paleSage was
 * a combination nobody had declared. It was found by working the ratio out by hand after a screenshot
 * looked washed, which is the only way an undeclared pair ever gets found.
 *
 * `studioInkMuted` closes it properly. One value, declared against every ground this palette asks it
 * to sit on and computed on every build: paper 6.51, white 6.92, lime 6.21, lilac 4.90, peach 4.84.
 * The two slate blues it replaces — BodyText and Faint — were the indigo generation's neutrals, which
 * is why the tab labels came back navy against a cream ground in the emulator.
 *
 * The composition local stays, because the night card still has to say what its own quiet ink is and
 * that one has no token yet. */
internal val LocalSecondaryText = androidx.compose.runtime.compositionLocalOf { StudioInkMuted }

/* The signature of the language, and the one text style in this app that is not one of Material's
   roles: `FontWeight.Light` is a real 300 here — Roboto ships the axis on every Android — where the
   web has to spend a 400 against 600 labels because its subset opens no lighter. `tnum` so a column
   of readings lines up on the decimal instead of dancing as the digits change. The size is the
   token file's `metric`; the reference sets its figures at 40, which is on the type scale the design
   brief lists and is not one of the seven roles `typography.scale` declares, so this asks for the
   step that exists rather than inventing one. */
private val MetricNumeral = androidx.compose.ui.text.TextStyle(
    fontSize = ThusoType.metric, lineHeight = ThusoType.metric,
    fontWeight = FontWeight.Light, fontFeatureSettings = "tnum"
)

/** A metric: the chip above, the numeral large and thin, the name below. */
@Composable fun Metric(
    value: String,
    label: String,
    unit: String = "",
    prefix: String = "",
    chip: String? = null,
    flagged: Boolean = false,
    modifier: Modifier = Modifier
) {
    Column(
        modifier.semantics(mergeDescendants = true) {
            contentDescription = listOf(label, "$prefix$value $unit".trim(), chip.orEmpty()).filter { it.isNotEmpty() }.joinToString(", ")
        },
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        /* The one chip that carries weight is a value out of range: filled charcoal rather than
           outlined. Colour is never the only difference — the chip says the word as well. */
        if (chip != null) Text(
            chip, style = MaterialTheme.typography.labelSmall,
            color = if (flagged) StudioPaper else Charcoal,
            modifier = Modifier
                .background(if (flagged) StudioNight else SurfaceWhite, RoundedCornerShape(ThusoRadius.pill))
                .then(if (flagged) Modifier else Modifier.border(1.dp, StudioLine, RoundedCornerShape(ThusoRadius.pill)))
                .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
        )
        Row(verticalAlignment = Alignment.Bottom) {
            if (prefix.isNotEmpty()) Text(
                prefix, style = MaterialTheme.typography.bodyLarge, color = Charcoal,
                modifier = Modifier.padding(end = ThusoSpacing.space4)
            )
            Text(value, style = MetricNumeral, color = Charcoal, maxLines = 1)
            if (unit.isNotEmpty()) Text(
                unit, style = MaterialTheme.typography.bodyLarge, color = Charcoal,
                modifier = Modifier.padding(start = ThusoSpacing.space4)
            )
        }
        Text(label, style = MaterialTheme.typography.bodySmall, color = LocalSecondaryText.current)
    }
}

/** One figure, as data, so a screen hands MetricRow a list of readings rather than a list of
    lambdas it has to get the Compose annotation right on. */
data class MetricSpec(
    val value: String, val label: String, val unit: String = "", val prefix: String = "",
    val chip: String? = null, val flagged: Boolean = false
)

/* Metrics side by side. Two to a row on a phone, and one to a row once the reader has enlarged the
   type past the point where two large numerals and their labels both fit — a figure squeezed into
   half a narrow screen is where a light 32sp numeral starts ellipsising, and an ellipsised number is
   not a number. */
@Composable fun MetricRow(metrics: List<MetricSpec>) {
    val perRow = if (LocalDensity.current.fontScale >= 1.3f) 1 else 2
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space20)) {
        metrics.chunked(perRow).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
                row.forEach { spec ->
                    Metric(spec.value, spec.label, spec.unit, spec.prefix, spec.chip, spec.flagged, Modifier.weight(1f))
                }
                repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/* A panel: a hairline and a lighter fill, never a shadow.
 *
 * `lead` is the one panel a screen is about and it takes studioLilac — charcoal reads 11.93:1 on it,
 * so the emphasis costs nothing a reader pays for. paleSage was the palest step of a ramp measured
 * against a grey ground this app no longer has, and on cream it is the previous generation's accent
 * showing through the new one. `quiet` recedes onto cloud. `glass` is the translucent case, which
 * resolves to the declared floor wherever translucency is refused. */
enum class PanelTone { PLAIN, QUIET, LEAD, GLASS }

@Composable fun SPanel(
    modifier: Modifier = Modifier,
    tone: PanelTone = PanelTone.PLAIN,
    padding: Dp = ThusoSpacing.space20,
    content: @Composable ColumnScope.() -> Unit
) {
    val opaque = prefersOpaqueSurfaces()
    val shape = RoundedCornerShape(ThusoRadius.panel)
    val fill = when (tone) {
        PanelTone.PLAIN -> SurfaceWhite
        PanelTone.QUIET -> Cloud
        PanelTone.LEAD -> StudioLilac
        PanelTone.GLASS -> if (opaque) GlassFloor else SurfaceWhite.copy(alpha = 0.72f)
    }
    val hairline = when (tone) {
        PanelTone.PLAIN, PanelTone.GLASS -> StudioLine
        else -> Color.Transparent
    }
    /* The lead panel used to have to override this, because the secondary grey of the day failed on
       its fill. studioInkMuted clears 4.90 on studioLilac, so there is one answer for every tone and
       the panel no longer has to know which one it is. */
    androidx.compose.runtime.CompositionLocalProvider(
        LocalSecondaryText provides StudioInkMuted
    ) {
        Column(
            modifier.fillMaxWidth().clip(shape).background(fill, shape).border(1.dp, hairline, shape).padding(padding),
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content
        )
    }
}

/** A panel's own head: its name, an optional note, and the small circular affordance that opens it. */
@Composable fun SPanelHead(title: String, note: String = "", openLabel: String = "", onOpen: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
            if (note.isNotEmpty()) Text(note, style = MaterialTheme.typography.bodySmall, color = LocalSecondaryText.current)
        }
        if (onOpen != null) Box(
            Modifier.size(TouchTarget).clip(RoundedCornerShape(ThusoRadius.pill))
                .background(SurfaceWhite, RoundedCornerShape(ThusoRadius.pill))
                .border(1.dp, StudioLine, RoundedCornerShape(ThusoRadius.pill))
                .clickable(onClick = onOpen)
                .semantics { role = Role.Button; contentDescription = openLabel.ifEmpty { "Open $title" } },
            Alignment.Center
        ) { Icon(Icons.Outlined.ArrowOutward, null, tint = Charcoal, modifier = Modifier.size(18.dp)) }
    }
}

/* A navigation row. Icon, label, trailing circle; the circle inverts on the selected row.
 *
 * The height floor is the touch target and nothing caps it, so a reader at the largest font scale
 * gets a taller pill rather than a clipped label. */
@Composable fun NavPillRow(icon: ImageVector, label: String, current: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.pill)
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape)
            /* The row you are on takes studioNight and studioPaper, the same pair the one live card
               on a screen uses. A neutral black pill on a cream ground reads as a hole rather than as
               a place, and the two darks would have been the only two in the app that disagreed. */
            .background(if (current) StudioNight else Cloud, shape)
            .clickable(onClick = onClick)
            .padding(start = ThusoSpacing.space16, end = ThusoSpacing.space4, top = ThusoSpacing.space4, bottom = ThusoSpacing.space4)
            .semantics(mergeDescendants = true) { role = Role.Tab; contentDescription = if (current) "$label, current" else label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Icon(icon, null, tint = if (current) StudioPaper else Charcoal, modifier = Modifier.size(20.dp))
        Text(
            label, style = MaterialTheme.typography.titleSmall,
            color = if (current) StudioPaper else Charcoal,
            maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
        )
        Box(
            Modifier.size(36.dp).background(if (current) StudioPaper else Color.Transparent, RoundedCornerShape(ThusoRadius.pill)),
            Alignment.Center
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowForward, null,
                tint = if (current) StudioNight else StudioInkMuted, modifier = Modifier.size(17.dp)
            )
        }
    }
}

/* Progress as a row of rounded segments rather than one continuous bar. A bar invites a reader to
   measure a proportion; segments say "these many, of these many", which is what a count of readings
   or of parts of a visit actually is. */
@Composable fun Segments(total: Int, done: Int, now: Int = -1, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().semantics { contentDescription = "$done of $total complete" },
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        repeat(total) { index ->
            Box(
                Modifier.weight(1f).height(12.dp).background(
                    when {
                        index == now -> StudioNight
                        index < done -> StudioOlive
                        else -> Cloud
                    },
                    RoundedCornerShape(ThusoRadius.pill)
                )
            )
        }
    }
}

/** A small status chip in the language's own shape: outlined on white, filled charcoal when it is
    the one thing on a panel that is not as it should be. */
@Composable fun SChip(text: String, flagged: Boolean = false) {
    val shape = RoundedCornerShape(ThusoRadius.pill)
    Text(
        text, style = MaterialTheme.typography.labelSmall,
        color = if (flagged) StudioPaper else Charcoal, maxLines = 1,
        modifier = Modifier
            .background(if (flagged) StudioNight else SurfaceWhite, shape)
            .then(if (flagged) Modifier else Modifier.border(1.dp, StudioLine, shape))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
    )
}
