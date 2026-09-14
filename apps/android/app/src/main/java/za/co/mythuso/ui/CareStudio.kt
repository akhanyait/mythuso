package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.animation.core.*
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalWindowInfo
import kotlin.math.sin
import kotlin.math.PI
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* THE CARE STUDIO, AS COMPOSE.
 *
 * The founder built a prototype, refined it, and on 12 September said we were finally aligned. What
 * he pointed at for the phones is a cream ground, a very large headline in two tones, lime accent
 * blocks and lime pill actions with ink labels, and a near-black card carrying the one thing that is
 * live right now. The palette landed first — studioPaper, studioNight, studioInk, studioInkDeep,
 * studioLime, studioLilac, studioPeach, studioLine in tokens.json, with every pair measured. This
 * file is the shapes that palette is spent on, and it is the twin of
 * apps/ios/MyThuso/DesignSystem/CareStudio.swift: same four objects, same reasoning, each in its own
 * platform's idiom.
 *
 * WHAT IS NOT HERE, AND WHY.
 *
 * No second typeface. The 10 September cut of this direction set its accent line in FontFamily.Serif
 * italic, and typography.families.display in tokens.json now says in as many words why that was
 * dropped: a decorative serif across the headlines of a clinical product reads as an editorial about
 * health rather than a tool for managing one. The two tones of the headline are two INKS — Charcoal
 * then StudioOlive, both on the paper — rather than two faces or two grounds.
 *
 * Requested editorial motion is confined to decorative artwork and brief chart entrances.
 * Readings remain steady; Remove animations presents the complete, still artwork.
 *
 * studioLime IS A FILL AND NEVER A WORD ON A LIGHT GROUND. It measures 1.05:1 against paper, so no
 * such pair is declared and one would fail the build. Everything below spends it as a ground under
 * studioInk or studioInkDeep — both declared — or as a word on studioNight, which is the one pair in
 * this palette where the accent is allowed to be read. */

/* Which ground a thing is standing on. A figure drawn inside a night card has nowhere to be told
   what colour it is, and the card is the only thing that knows. StudioNightCard is the only thing
   that sets this. */
val LocalOnStudioNight = compositionLocalOf { false }

/* Ink on the night card. `studioPaper` is the declared pair at 13.95:1; the quiet weight is the same
   paper at the muted opacity, which composites to #C8CBC6 and reads 9.04. An alpha rather than a
   flattened grey, for the same reason LocalSecondaryText is one: a fixed grey stops following the
   card the day the card changes. */
val StudioNightInk = StudioPaper
val StudioNightInkQuiet = StudioPaper.copy(alpha = 0.78f)

/* THE DISPLAY HEADLINE: two lines, two inks, one voice.
 *
 * The lead line is what the reader is — a greeting, or the framing of the role whose workspace this
 * is. The accent line is what the product is for, and it is
 * studioOlive, the token that exists for this line and is declared against the ground at 4.98:1 and
 * against a white card.
 *
 * IT WAS INK ON A LIME BLOCK FIRST, AND THE SCREENSHOT IS WHY IT IS NOT. A full-width lime bar under
 * the greeting is the loudest object on the screen, on every screen carrying a headline, which is the
 * opposite of the rule the rest of this pass enforces: one lime object per card, and it is the thing
 * you press. The tokens settled it independently — a colour meant to sit on lime would have been
 * declared against lime, and studioOlive is declared against paper.
 *
 * SIZE, AND WHERE IT STOPS. `metricLarge` is 40sp and it is the largest step the type scale declares.
 * Past a 1.5 font scale it drops to `screenTitle`: forty points is nine characters to a line on a
 * 393dp phone, at twice that it is four, and a headline set one word per line has stopped being a
 * headline and become a column of words. Everything still scales from there, so the reader who asked
 * for larger type still gets larger type — it simply grows from a smaller start. That is the same
 * threshold StatusHeader and MetricRow already turn on.
 *
 * One node to TalkBack, announced as a heading. Read as three it was a greeting, then a slogan, then
 * a sentence, with nothing saying the three were one thing. */
/* IN THE WORDMARK'S COLOURS, SINCE 14 SEPTEMBER. The only screens that set this headline are the staff
   workspaces, and the founder asked those to stick to the logo: BrandInk for the lead (10.93 on the
   paper), BrandGreen for the accent — 3.08 by the sRGB formula (tokens.json's note says 3.19), a pair
   declared for large text only, and this
   line is never smaller than `screenTitle` — and BodyText for the detail. */
@Composable fun StudioHeadline(lead: String, accent: String, detail: String = "") {
    val compact = LocalDensity.current.fontScale >= 1.5f
    val size = if (compact) ThusoType.screenTitle else ThusoType.metricLarge
    Column(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { heading() },
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                lead, color = BrandInk, fontSize = size, lineHeight = size * 1.1f,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                accent, color = BrandGreen, fontSize = size, lineHeight = size * 1.1f,
                fontWeight = FontWeight.SemiBold
            )
        }
        if (detail.isNotEmpty()) Text(detail, style = MaterialTheme.typography.bodyMedium, color = BodyText)
    }
}

/* THE CARD FOR THE ONE THING THAT IS LIVE, AND THERE IS ONE OF THEM PER SCREEN.
 *
 * The prototype's phone frames spend exactly one near-black card and spend it on whatever is
 * happening now: the visit somebody has already arranged, or the count of what is waiting for the
 * clinician whose workspace this is. Everything else on the screen is paper, white or a hairline.
 * That is the whole hierarchy, and it is why the screen has a subject.
 *
 * The dark is studioNight rather than charcoal. On a cream ground a neutral black panel reads as a
 * hole cut in the paper, and studioNight is the one token in this palette declared to carry both
 * studioPaper and studioLime as words. There is no hairline — a rule would be noise on a shape this
 * dark — and no shadow: the card is separated from the ground by fourteen stops of luminance.
 *
 * The highlight is `surface` at 10%, so the palest point on the card composites to #2E4040, where
 * studioPaper reads 10.28:1 against 13.95 at the darkest and studioLime 9.80 against 13.31. All four
 * clear AA, and the card is opaque at every point, so no ratio on it depends on what is behind it. */
@Composable fun StudioNightCard(
    modifier: Modifier = Modifier,
    padding: Dp = ThusoSpacing.space20,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(ThusoRadius.panel)
    CompositionLocalProvider(
        LocalOnStudioNight provides true,
        LocalSecondaryText provides StudioNightInkQuiet
    ) {
        Column(
            modifier.fillMaxWidth().clip(shape)
                .background(StudioNight)
                .background(Brush.linearGradient(
                    0.0f to SurfaceWhite.copy(alpha = 0.10f), 0.55f to Color.Transparent
                ))
                .padding(padding),
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16), content = content
        )
    }
}

/* Two colours a composable that can appear on either ground asks for by name rather than by
   remembering. IconLine, NurseRow and the visit card's own header are drawn on white on five screens
   and on the night card on one; passing a colour down through all of them would have been a
   parameter nobody sets correctly the second time. */
@Composable fun studioTitleInk(): Color = if (LocalOnStudioNight.current) StudioNightInk else Charcoal
@Composable fun studioBodyInk(): Color = if (LocalOnStudioNight.current) StudioNightInkQuiet else StudioInkMuted

/* The visit card's header on the night ground. StatusHeader's own reasoning is unchanged — the chip
   goes above the title past a 1.3 font scale, because a pill and a title cannot both have the width
   on a 393dp phone — and this is that layout with the night chip in it. */
@Composable fun StudioNightStatusHeader(
    status: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val stacked = LocalDensity.current.fontScale >= 1.3f
    if (stacked) Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        StudioNightChip(status)
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), content = content)
    } else Row(
        modifier.fillMaxWidth(), verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), content = content)
        StudioNightChip(status)
    }
}

/* A chip on the night card. Neutral is paper outlined on paper at 16%; `flagged` is the one figure a
   reader has to find without reading, and on a dark card the only fill that finds it is the accent —
   studioInkDeep on studioLime, the declared pair for the heavier label on an accent fill. It is the
   single lime object on the card, which is the whole of why it works. */
@Composable fun StudioNightChip(text: String, flagged: Boolean = false) {
    val shape = RoundedCornerShape(ThusoRadius.pill)
    Text(
        text, style = MaterialTheme.typography.labelSmall,
        color = if (flagged) StudioInkDeep else StudioNightInk,
        modifier = Modifier
            .background(if (flagged) StudioLime else StudioPaper.copy(alpha = 0.16f), shape)
            .then(if (flagged) Modifier else Modifier.border(1.dp, StudioPaper.copy(alpha = 0.3f), shape))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
    )
}

/* A figure on the night card: the chip above, the numeral large and thin, the name below. The same
   order Metric draws in — docs/DESIGN-LANGUAGE.md's *a status chip floating above a large light
   numeral, with a small label beneath* — and the same reason: a large light figure is simply large,
   where a bold one shouts. */
@Composable fun StudioNightFigure(
    label: String,
    value: String,
    note: String,
    modifier: Modifier = Modifier,
    lead: Boolean = false,
    flagged: Boolean = false
) {
    Column(
        modifier.semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        StudioNightChip(note, flagged)
        val figure = if (lead) ThusoType.metricLarge else ThusoType.metric
        Text(
            value, color = StudioNightInk, maxLines = 1,
            /* Light, and `tnum` so a column of figures lines up on the decimal instead of shuffling
               as the digits change. The same style Metric uses; the size is the one step up for the
               figure that answers the question the reader opened the workspace with. */
            style = TextStyle(
                fontSize = figure, lineHeight = figure,
                fontWeight = FontWeight.Light, fontFeatureSettings = "tnum"
            )
        )
        Text(label, style = MaterialTheme.typography.bodyMedium, color = StudioNightInkQuiet)
    }
}

/* THE FILLED BUTTON, AND WHY IT IS A COMPOSABLE RATHER THAN A COLOUR SCHEME.
 *
 * The prototype's call to action is a lime pill with an ink label, and studioInkDeep on studioLime is
 * a declared pair. The obvious way to get it everywhere is `colorScheme.primary = StudioLime`, and
 * that is the wrong way: Material reads `primary` for a text field's cursor and focused border, a
 * switch's track, a checkbox's box and a progress indicator, and lime measures 1.05:1 against white.
 * Turning the primary lime would have made forty-five thin affordances invisible in order to make
 * fifty buttons right. So the scheme's primary stays charcoal and the button asks for the accent by
 * name — exactly the reasoning ThusoButtonShape already carries a few lines below, for exactly the
 * same Material limitation.
 *
 * Disabled is a recessed fill rather than a faded accent: a pale lime is still lime, and a control
 * that cannot be pressed should not look like the one control on the screen that can. */
@Composable fun StudioButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = ThusoButtonShape,
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    content: @Composable RowScope.() -> Unit
) {
    Button(
        onClick = onClick, modifier = modifier, enabled = enabled, shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = StudioInk, contentColor = SurfaceWhite,
            disabledContainerColor = Cloud, disabledContentColor = StudioInkMuted
        ),
        contentPadding = contentPadding, content = content
    )
}

// Shared pacing: decorative motion only; clinical figures, prices and safety states stay still.
object StudioMotion {
    const val orbitMillis = 16000
    const val revealMillis = 650
    const val loadingMillis = 1200
}

// Decorative native drawing. It carries no measurement or wellbeing score.
@Composable fun MoonArtwork(modifier: Modifier = Modifier) {
    var visible by remember { mutableStateOf(false) }
    val reducedMotion = prefersReducedMotion()
    val phase = if (visible && !reducedMotion) {
        val transition = rememberInfiniteTransition(label = "Wellbeing moon")
        val angle by transition.animateFloat(0f, (4 * PI).toFloat(),
            infiniteRepeatable(tween(StudioMotion.orbitMillis, easing = LinearEasing)), label = "Gentle orbit")
        angle
    } else 0f
    androidx.compose.foundation.Canvas(modifier.studioVisibility { visible = it }) {
        translate(top = 3.dp.toPx() * sin(phase)) {
        val radius = size.minDimension * 0.36f
        drawCircle(brush = Brush.radialGradient(listOf(SurfaceWhite, StudioLilac, StudioInkMuted),
            center = androidx.compose.ui.geometry.Offset(size.width * 0.28f, size.height * 0.25f),
            radius = size.minDimension * 0.8f), radius = radius * (1 + 0.02f * sin(phase)))
        rotate(-28f + 12f * sin(phase * 0.5f)) {
        drawOval(color = StudioInkMuted.copy(alpha = 0.4f),
            topLeft = androidx.compose.ui.geometry.Offset(0f, size.height * 0.32f),
            size = androidx.compose.ui.geometry.Size(size.width, size.height * 0.36f),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx()))
        }
        }
    }
}

// Trigger artwork entrances in the viewport; layout coordinates remain stable during animation.
fun Modifier.studioVisibility(changed: (Boolean) -> Unit): Modifier = composed {
    val window = LocalWindowInfo.current.containerSize
    onGloballyPositioned { coordinates ->
        val position = coordinates.positionInWindow()
        changed(position.y < window.height && position.y + coordinates.size.height > 0 &&
            position.x < window.width && position.x + coordinates.size.width > 0)
    }
}

@Composable fun rememberStudioReveal(visible: Boolean, delayMillis: Int = 0, identity: Any? = Unit): State<Float> {
    val reducedMotion = prefersReducedMotion()
    val progress = remember(identity) { Animatable(if (reducedMotion) 1f else 0f) }
    LaunchedEffect(visible, reducedMotion, identity) {
        if (reducedMotion) progress.snapTo(1f)
        else if (visible && progress.value < 1f) progress.animateTo(1f,
            tween(StudioMotion.revealMillis, delayMillis = delayMillis, easing = FastOutSlowInEasing))
    }
    return progress.asState()
}

/** A plot-only reveal: layout, accessibility values and adjacent labels do not animate. */
fun Modifier.studioChartEntrance(identity: Any?): Modifier = composed {
    var visible by remember { mutableStateOf(false) }
    val progress = rememberStudioReveal(visible, identity = identity)
    studioVisibility { visible = it }.drawWithContent {
        clipRect(left = -8f, top = -8f, right = (size.width + 8f) * progress.value, bottom = size.height + 8f) { this@drawWithContent.drawContent() }
    }
}

fun Modifier.studioBarEntrance(delayMillis: Int, identity: Any? = Unit): Modifier = composed {
    var visible by remember { mutableStateOf(false) }
    val progress = rememberStudioReveal(visible, delayMillis, identity)
    studioVisibility { visible = it }.graphicsLayer {
        scaleY = progress.value
        transformOrigin = TransformOrigin(0.5f, 1f)
    }
}
