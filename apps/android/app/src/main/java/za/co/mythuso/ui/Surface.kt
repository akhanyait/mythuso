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

/** The luminous ground: three pale tints, none darker than the floor the maths is measured against.
 *
 * A gradient rather than a flat fill because a translucent panel over a flat colour reads as a grey
 * card. It does not move — a ground that drifts is a box that keeps changing under a thumb. */
@Composable fun auroraBrush(): Brush = Brush.linearGradient(
    0.0f to AuroraWarm, 0.42f to AuroraCool, 1.0f to AuroraSage
)

/* Secondary text, and the ground it is allowed to sit on.
 *
 * A metric's label is `faint` everywhere — 5.75 on a white card, 5.05 on the mist ground, 4.57 on a
 * cloud panel, all of them pairs tokens.json declares and the build computes. On the sage lead panel
 * it is 3.75, which fails AA for body text, and NOTHING WOULD HAVE CAUGHT IT: the contrast check
 * computes the pairs the token file lists, and faint-on-paleSage is a combination this design had
 * never put together before the lead panel started carrying metrics. It was found by working the
 * ratio out by hand after the screenshot looked slightly washed, which is the only way a pair
 * nobody declared ever gets found.
 *
 * So the lead panel provides the answer rather than every call site remembering it: inside a sage
 * panel a label is charcoal at 11.11, and a screen cannot get it wrong by forgetting. A pair to
 * declare in tokens.json is `faint on paleSage` as a KNOWN FAILURE with charcoal as its measured
 * replacement, so the next person to reach for it is told rather than left to notice. */
internal val LocalSecondaryText = androidx.compose.runtime.compositionLocalOf { Faint }

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
            color = if (flagged) SurfaceWhite else Charcoal,
            modifier = Modifier
                .background(if (flagged) Charcoal else SurfaceWhite, RoundedCornerShape(ThusoRadius.pill))
                .then(if (flagged) Modifier else Modifier.border(1.dp, Stone, RoundedCornerShape(ThusoRadius.pill)))
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
 * `lead` is the one panel a screen is about and it takes the sage ground — charcoal on paleSage is
 * 11.11:1, so the emphasis costs nothing a reader pays for. `quiet` recedes onto cloud. `glass` is
 * the translucent case, which resolves to the declared floor wherever translucency is refused. */
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
        PanelTone.LEAD -> PaleSage
        PanelTone.GLASS -> if (opaque) GlassFloor else SurfaceWhite.copy(alpha = 0.72f)
    }
    val hairline = when (tone) {
        PanelTone.PLAIN, PanelTone.GLASS -> Stone
        else -> Color.Transparent
    }
    /* Everything read on a sage panel is charcoal, and the panel says so rather than each caller
       remembering to. See LocalSecondaryText above for the measurement. */
    androidx.compose.runtime.CompositionLocalProvider(
        LocalSecondaryText provides if (tone == PanelTone.LEAD) Charcoal else Faint
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
                .border(1.dp, Stone, RoundedCornerShape(ThusoRadius.pill))
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
            .background(if (current) Charcoal else Cloud, shape)
            .clickable(onClick = onClick)
            .padding(start = ThusoSpacing.space16, end = ThusoSpacing.space4, top = ThusoSpacing.space4, bottom = ThusoSpacing.space4)
            .semantics(mergeDescendants = true) { role = Role.Tab; contentDescription = if (current) "$label, current" else label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Icon(icon, null, tint = if (current) SurfaceWhite else Charcoal, modifier = Modifier.size(20.dp))
        Text(
            label, style = MaterialTheme.typography.titleSmall,
            color = if (current) SurfaceWhite else Charcoal,
            maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
        )
        Box(
            Modifier.size(36.dp).background(if (current) SurfaceWhite else Color.Transparent, RoundedCornerShape(ThusoRadius.pill)),
            Alignment.Center
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowForward, null,
                tint = if (current) Charcoal else Faint, modifier = Modifier.size(17.dp)
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
                        index == now -> SageSlate
                        index < done -> SoftSage
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
        color = if (flagged) SurfaceWhite else Charcoal, maxLines = 1,
        modifier = Modifier
            .background(if (flagged) Charcoal else SurfaceWhite, shape)
            .then(if (flagged) Modifier else Modifier.border(1.dp, Stone, shape))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
    )
}
