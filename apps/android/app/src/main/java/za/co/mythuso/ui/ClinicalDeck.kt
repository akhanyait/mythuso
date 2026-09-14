package za.co.mythuso.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.time.LocalTime
import za.co.mythuso.model.Scheduling
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowOutward
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.Constraints
import androidx.compose.material.icons.outlined.Straighten
import za.co.mythuso.model.ObservationRange
import za.co.mythuso.model.observationRanges
import za.co.mythuso.model.observationsNote

/* The instrument deck a nurse and a doctor open a workspace on, as Compose.
 *
 * WHAT IT REPLACES ON THIS PHONE. Three figures on a near-black card, every one the same size, the
 * same weight and the same distance from the next — so the screen said "here are three numbers"
 * rather than "here is the shape of your day". A clinician reads it, learns nothing she could not
 * have learnt by counting the rows, and scrolls past.
 *
 * THE ONE RULE THAT GOVERNS EVERY MARK BELOW. Nothing drawn here introduces a number. Each drawing
 * is built from the same arithmetic as the numeral beside it, off the same rows the section lists:
 * the doctor's ring has one arc per case on the queue below it and the bright arcs are the ones
 * carrying a badge, and the nurse's day is her three visits drawn to the length each service
 * actually takes, out of the catalogue those rows are timed from. A reader who distrusts a picture
 * can count the list; a reader who distrusts a numeral can count the picture. The figures are still
 * decided in one place — `workspaceUrgency` in AccountScreens.kt, which is the block
 * scripts/check-boundaries.mjs reads for a typed digit.
 *
 * THE GROUND IS THE WORDMARK'S INK. On 14 September the founder looked at these screens and asked
 * them to "stick to logo colors and ui": the near-black StudioNight and the lime lead were the Care
 * Studio's palette, not the logo's. The wordmark (apps/web/public/brand/mythuso-logo.svg) is
 * BrandInk, BrandGreen, a BrandOrange roof and a BrandLime dot, and those four and white are what the
 * deck is drawn in now. No colour token was added. This is the twin of ClinicalDeckView.swift.
 *
 * Flat rather than StudioNightCard's highlight, for the reason that was always true here: every
 * unlit mark is measured against one ground rather than a gradient. The lead's panel is RECESSED
 * rather than lifted — the design system's Ink at 45% over BrandInk — and that is arithmetic rather
 * than taste. BrandGreen reads 3.55 on BrandInk, falls to 2.98 on a six-per-cent white lift and 2.81
 * on eight, and rises to 4.34 on the recess.
 *
 *   on BrandInk                 white 12.04   BrandLime 10.47   BrandMint 8.09
 *                               white at 72% 7.04 — quiet text     BrandGreen 3.55 — a mark, never a word
 *                               white at 44% 3.63 — an unlit mark  BrandOrange 4.24 — a fill or a glyph
 *                               white at 24% 2.06 — the groove a ring runs in; it carries nothing
 *   on the recess (Ink at 45%)  white 14.71   white at 72% 8.29   white at 44% 4.03
 *                               BrandGreen 4.34 — the lead's lit mark    BrandLime 12.80
 *
 * AND COLOUR IS NEVER THE ONLY DIFFERENCE. A flagged arc is the green one AND the thicker one; a
 * signed visit is the filled block AND the white one. Green is spent once per deck, on the figure the
 * screen was opened for, and lime once, as the eyebrow word — the dot on the wordmark, and the one
 * pair tokens.json lets lime be read in. The flagged chip is the orange roof, filled, with the design
 * system's Ink on it at 6.30: BrandInk on orange is 4.24, and a 13sp word needs 4.5.
 *
 * MOTION. Every mark draws itself once on arrival and that is all. Reduce motion is not a shorter
 * draw: `rememberStudioReveal` snaps to the finished mark when the system animator scale is nought,
 * so stillness is the complete picture rather than an empty ring, and no clinical value is ever
 * animated into place. The only thing that keeps moving is the `now` hairline on the nurse's day,
 * once a minute, and that is freshness rather than motion — a clock that stops when a reader asks
 * for less movement is a clock that lies to them instead. */

// MARK: - The drawing that belongs to one figure

/** One visit on the day, in minutes since midnight, and whether it has been signed off. */
data class DeckVisit(val from: Int, val to: Int, val signed: Boolean)

/** Every field is counted off the rows the figure beside it counts. Nothing here may carry a fact
 *  of its own — see the rule at the top of this file. */
sealed interface DeckShape {
    /** One arc per row. `true` is the row carrying the badge the chip counts: flagged, or signed. */
    data class Ring(val segments: List<Boolean>) : DeckShape
    /** A part of a whole, as a dial. Both numbers are the strip's own. */
    data class Gauge(val part: Int, val whole: Int) : DeckShape
    /** One bar per row, as long as that row has waited. The longest is the row the figure names. */
    data class Bars(val values: List<Int>) : DeckShape
    /** The working day to scale, and where now sits in it. */
    data class Day(val visits: List<DeckVisit>, val from: Int, val to: Int) : DeckShape
    /** The weeks behind a headline figure. Never the week the figure itself states. */
    data class Spark(val weeks: List<Int>) : DeckShape
    /** One column per row, oldest first; `lit` marks the rows the figure beside it adds up. */
    data class Columns(val values: List<Int>, val lit: List<Boolean>) : DeckShape
}

/* Alphas over white rather than flattened greys, for the reason ThusoOpacity's own comment gives: a
   flattened grey cannot follow the ground it sits on and an alpha has no choice but to. The ratios
   each of these composites to are in the header above. */
object DeckInk {
    val ground = BrandInk
    val ink = SurfaceWhite
    /** The wordmark's dot. A word only on BrandInk, and on the deck only the eyebrow. */
    val accent = BrandLime
    /** The lead's lit mark: the wordmark's green, on the recess where it clears 3:1. */
    val lit = BrandGreen
    /** The muted step is the token rather than a number retyped here: the same alpha every muted
     *  label on all three platforms is set at, and it darkens with whatever ground it lands on. */
    val quiet = SurfaceWhite.copy(alpha = ThusoOpacity.charcoalMuted)
    val mark = SurfaceWhite.copy(alpha = 0.44f)

    /** The unlit mark on the lead's recess, 4.03 there. The same alpha as `mark`: the recess is darker
     *  than the ground, so a mark that clears on one clears on both. */
    val leadMark = SurfaceWhite.copy(alpha = 0.44f)
    val track = SurfaceWhite.copy(alpha = 0.24f)
    val edge = SurfaceWhite.copy(alpha = 0.14f)
    val leadGround = Ink.copy(alpha = 0.45f)
    /** The roof on the wordmark: the one thing that is not as it should be. A fill or a glyph. */
    val attention = BrandOrange
    val onAttention = Ink

    /* The grounds the screens behind the deck add: the glass the lead figure stands on, the edge of
       anything pressable on the canvas, the glyph a refusal wears there, the pale green panel, the
       words on a white sheet and the chosen pill. Every ratio is in the table above the section that
       spends them, at the foot of this file. The panel is composited once from two tokens rather than
       left translucent, so its ratios cannot change with whatever stands behind it. */
    val glass = Ink.copy(alpha = 0.45f)
    val glassEdge = SurfaceWhite.copy(alpha = 0.16f)
    val control = SurfaceWhite.copy(alpha = 0.44f)
    val refusal = BrandOrange
    val panel = BrandGreen.copy(alpha = 0.06f).compositeOver(SurfaceWhite)
    val panelInk = BrandInk
    val panelQuiet = BrandInk.copy(alpha = ThusoOpacity.charcoalMuted)
    val panelLit = BrandGreen
    val panelMark = BrandInk.copy(alpha = 0.60f)
    val panelTrack = BrandInk.copy(alpha = 0.12f)
    val sheetInk = BrandInk
    val sheetQuiet = BodyText
    val sheetLine = Line
    val chosen = BrandGreen
    val onChosen = Ink
    /** The sheet standing on the canvas when what it holds is a refusal: the roof mark at 8% over white.
     *  BrandInk 11.08 on it, BodyText 6.98. */
    val attentionWash = BrandOrange.copy(alpha = 0.08f).compositeOver(SurfaceWhite)
}

/** Minutes since midnight and back again, so a day can be drawn to scale rather than as three equal
 *  blocks. `Scheduling.endTime` already works out when a visit ends; this is the other half of it. */
object DeckClock {
    fun minuteOf(text: String): Int {
        val pieces = text.split(":").mapNotNull { it.toIntOrNull() }
        return if (pieces.size == 2) pieces[0] * 60 + pieces[1] else 0
    }

    fun textOf(minutes: Int): String = "%02d:%02d".format((minutes / 60) % 24, minutes % 60)
}

/* A stagger that is a function of one progress rather than a second animation per mark. The later
   arcs start later and every one of them still finishes at the same moment, so there is one thing to
   settle when a reader asks for stillness — and it is already settled. */
private fun staggered(progress: Float, index: Int, count: Int): Float {
    if (count <= 1) return progress
    val spread = 0.3f
    val start = spread * index / (count - 1)
    return ((progress - start) / (1f - spread)).coerceIn(0f, 1f)
}

// MARK: - The instruments

/* Turns rather than degrees, measured clockwise from twelve o'clock, because every arc here is
   "this many of that many" and a fraction of a circle is what that means. Compose measures from
   three o'clock, which is the quarter turn subtracted below. */
private fun turnToDegrees(turn: Float) = turn * 360f - 90f

/** The queue, or the day, as arcs — one per row, the marked ones brighter and heavier. Colour is
 *  never the only difference between the two states: a marked arc is also the thicker one. */
@Composable private fun DeckRing(
    segments: List<Boolean>, lit: Color, unlit: Color, progress: Float, side: Dp, track: Color = DeckInk.track
) {
    Canvas(Modifier.size(side)) {
        val span = size.minDimension
        val radius = span * 0.39f
        val centre = Offset(size.width / 2, size.height / 2)
        val box = Size(radius * 2, radius * 2)
        val corner = Offset(centre.x - radius, centre.y - radius)
        drawArc(
            track, 0f, 360f, useCenter = false, topLeft = corner, size = box,
            style = Stroke(width = span * 0.10f)
        )
        val count = maxOf(segments.size, 1)
        val step = 1f / count
        /* A gap wide enough to count the arcs across, and never wider than a third of an arc — a ring
           of twelve cases must not dissolve into a dotted line. */
        val gap = minOf(0.028f, step / 3)
        segments.forEachIndexed { index, on ->
            val from = index * step + gap / 2
            val to = (index + 1) * step - gap / 2
            drawArc(
                if (on) lit else unlit,
                turnToDegrees(from),
                (to - from) * 360f * staggered(progress, index, count),
                useCenter = false, topLeft = corner, size = box,
                /* Butt caps, and this was a bug worth writing down. A round cap extends half the
                   stroke past each end of its arc, so at the lit width the two caps either side of a
                   gap grow further into it than the gap is wide — and a ring of three cases is drawn
                   as one unbroken circle. The segments are the count; a count you cannot count is
                   not one. */
                style = Stroke(width = span * (if (on) 0.16f else 0.10f), cap = StrokeCap.Butt)
            )
        }
    }
}

/** A part of a whole as a dial: how much of the queue is pressing rather than merely waiting. */
@Composable private fun DeckGauge(part: Int, whole: Int, lit: Color, progress: Float, side: Dp, track: Color = DeckInk.track) {
    Canvas(Modifier.size(side)) {
        val span = size.minDimension
        val radius = span * 0.39f
        val corner = Offset(size.width / 2 - radius, size.height / 2 - radius)
        val box = Size(radius * 2, radius * 2)
        val from = 0.625f
        val sweep = 0.75f
        val filled = if (whole > 0) (part.toFloat() / whole).coerceIn(0f, 1f) else 0f
        drawArc(
            track, turnToDegrees(from), sweep * 360f, useCenter = false,
            topLeft = corner, size = box, style = Stroke(width = span * 0.10f, cap = StrokeCap.Round)
        )
        if (filled > 0f) drawArc(
            lit, turnToDegrees(from), sweep * filled * 360f * progress, useCenter = false,
            topLeft = corner, size = box, style = Stroke(width = span * 0.16f, cap = StrokeCap.Round)
        )
    }
}

/** One bar per row, as long as that row has waited. The longest is the row the figure names. */
@Composable private fun DeckBars(values: List<Int>, lit: Color, unlit: Color, progress: Float) {
    val longest = maxOf(values.maxOrNull() ?: 1, 1)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        values.forEachIndexed { index, value ->
            val isLongest = value == longest
            /* A floor of four per cent so a case that has only just arrived is still a bar rather
               than nothing at all — a queue with an invisible row reads as a shorter queue. */
            val width = (value.toFloat() / longest).coerceIn(0.04f, 1f)
            Box(
                Modifier
                    .fillMaxWidth(width * staggered(progress, index, values.size))
                    .height(if (isLongest) 11.dp else 9.dp)
                    .clip(RoundedCornerShape(ThusoRadius.pill))
                    .background(if (isLongest) lit else unlit)
            )
        }
    }
}

/* The working day to scale, each visit as long as its service actually takes, and a mark for now.

   The mark is drawn only while now is inside the day. A needle parked at one end of the track at
   seven in the evening would say the last visit is about to start, which is the kind of figure a
   reader can disprove by looking out of the window. */
@Composable private fun DeckDay(
    visits: List<DeckVisit>, from: Int, to: Int, lit: Color, unlit: Color, progress: Float
) {
    /* Once a minute, and it keeps ticking under reduced motion: see the note at the top of the file.
       It is a clock rather than an animation — nothing here interpolates, the mark simply stands in
       a different place the next minute. */
    var minuteNow by remember { mutableStateOf(LocalTime.now(Scheduling.zone).let { it.hour * 60 + it.minute }) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            minuteNow = LocalTime.now(Scheduling.zone).let { it.hour * 60 + it.minute }
        }
    }
    val span = maxOf(to - from, 1)
    val inside = minuteNow in from..to
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        BoxWithConstraints(
            Modifier.fillMaxWidth().height(34.dp)
                .clip(RoundedCornerShape(ThusoRadius.pill)).background(DeckInk.track)
        ) {
            val room = maxWidth
            fun place(minute: Int): Dp = room * ((minute - from).toFloat() / span)
            visits.forEachIndexed { index, visit ->
                val width = (place(visit.to) - place(visit.from)).coerceAtLeast(6.dp)
                Box(
                    Modifier
                        .padding(start = place(visit.from), top = 6.dp)
                        .width(width * staggered(progress, index, visits.size))
                        .height(22.dp)
                        .clip(RoundedCornerShape(ThusoRadius.pill))
                        .background(if (index == 0) lit else if (visit.signed) DeckInk.ink else unlit)
                )
            }
            /* A hairline rather than a filled needle, and it never draws itself in: a mark that slid
               into place would be a clock being drawn rather than a clock being read. */
            if (inside) Box(
                Modifier
                    .padding(start = place(minuteNow).coerceIn(0.dp, room - 2.dp))
                    .width(2.dp).fillMaxHeight().background(DeckInk.ink)
            )
        }
        /* The two ends of the track, so the blocks on it are a day rather than three shapes. The
           middle says where now is only while now is in the day: "before the first visit" is what an
           empty middle already says, and a third state written out in words would say it twice. */
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(DeckClock.textOf(from), style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet)
            if (inside) Text(
                "now ${DeckClock.textOf(minuteNow)}",
                style = MaterialTheme.typography.bodySmall, color = DeckInk.ink
            )
            Text(DeckClock.textOf(to), style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet)
        }
    }
}

/** The weeks behind the headline figure. Flat where a week was flat; it invents no trend, and the
 *  week the figure itself states is not on it — a week still being added to, drawn as the end of a
 *  series, reads as a fall rather than as a week that has not finished. */
@Composable private fun DeckSpark(weeks: List<Int>, lit: Color, progress: Float) {
    val high = weeks.maxOrNull() ?: 1
    val low = weeks.minOrNull() ?: 0
    val spread = maxOf(high - low, 1)
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        Canvas(Modifier.fillMaxWidth().height(52.dp)) {
            fun x(index: Int) =
                if (weeks.size > 1) size.width * index / (weeks.size - 1) else size.width / 2
            fun y(value: Int) = size.height * (0.9f - 0.7f * (value - low) / spread)
            val line = Path().apply {
                weeks.forEachIndexed { index, week ->
                    if (index == 0) moveTo(x(index), y(week)) else lineTo(x(index), y(week))
                }
            }
            val area = Path().apply {
                addPath(line)
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
            clipRect(right = size.width * progress) {
                drawPath(
                    area,
                    Brush.verticalGradient(listOf(lit.copy(alpha = 0.3f), Color.Transparent))
                )
                drawPath(line, lit, style = Stroke(width = 2.dp.toPx()))
            }
        }
        // What the line is, so nobody reads it as this week's own shape.
        Text(
            "${weeks.size} weeks before this one",
            style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet
        )
    }
}

// MARK: - A chip on the deck

/* The deck's own chip, and it is not the night card's. Flagged is the wordmark's orange roof, filled —
   the one warm thing on a cool ground — standing 4.24 off BrandInk, with the design system's Ink on
   it at 6.30. Everything else is outlined quiet. Filled against outlined is the difference that does
   not depend on seeing orange. */
@Composable private fun DeckChip(text: String, flagged: Boolean) {
    /* A pill until the words no longer fit on a line. A capsule's ends curve in by half its height,
       and at the larger font scales that eats the first and last word of a wrapped status. */
    val shape = RoundedCornerShape(
        if (LocalDensity.current.fontScale >= 1.3f) ThusoRadius.control else ThusoRadius.pill
    )
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = if (flagged) DeckInk.onAttention else DeckInk.quiet,
        modifier = Modifier
            .background(if (flagged) DeckInk.attention else Color.Transparent, shape)
            .then(if (flagged) Modifier else Modifier.border(1.dp, DeckInk.mark, shape))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
    )
}

// MARK: - One instrument

@Composable private fun DeckInstrument(
    figure: WorkspaceFigure, lead: Boolean, progress: Float, modifier: Modifier = Modifier
) {
    /* The lead is the only instrument that spends the green. On the other two a lit mark is the
       quiet tone — still the brightest thing in its own drawing, still two channels apart from an
       unlit one, and not a second thing on the deck claiming to be the most important. */
    val lit = if (lead) DeckInk.lit else DeckInk.quiet
    val unlit = if (lead) DeckInk.leadMark else DeckInk.mark
    /* The two dial sizes the web settles on below its 900px breakpoint, which is every phone: 124
       for the lead and 116 for the pair beside it. The pair stay smaller than the lead whatever the
       screen does — a dial the same size as the lead's is a second lead, and a deck with two leads
       has none.
       They grow with the reader's font scale, because the numeral in the middle of them does: a ring
       frozen at 124dp with an 80sp figure inside it is a figure touching the stroke on both sides.
       Capped, because past twice the type the dial is wider than a 320dp screen and the drawing has
       stopped being the thing that fits. */
    val dial = (if (lead) 124.dp else 116.dp) * LocalDensity.current.fontScale.coerceIn(1f, 2f)
    val numeralSize = if (lead) ThusoType.metricLarge else ThusoType.metric
    Column(
        modifier.semantics(mergeDescendants = true) { contentDescription = spokenFor(figure) },
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        DeckChip(figure.note, figure.flagged)
        val numeral = @Composable {
            Text(
                figure.value, color = DeckInk.ink, maxLines = 1,
                /* Light, and `tnum` so a column of figures lines up instead of shuffling as the
                   digits change. The same style every other metric in the product is set in. */
                style = TextStyle(
                    fontSize = numeralSize, lineHeight = numeralSize,
                    fontWeight = FontWeight.Light, fontFeatureSettings = "tnum"
                )
            )
        }
        when (val shape = figure.shape) {
            /* A dial puts the numeral in the middle of itself, which is the whole reason to draw a
               ring rather than a bar. */
            is DeckShape.Ring -> Box(Modifier.size(dial), contentAlignment = Alignment.Center) {
                DeckRing(shape.segments, lit, unlit, progress, dial)
                numeral()
            }
            is DeckShape.Gauge -> Box(Modifier.size(dial), contentAlignment = Alignment.Center) {
                DeckGauge(shape.part, shape.whole, lit, progress, dial)
                numeral()
            }
            /* Everything else puts the numeral above the drawing, because a line under a figure is
               read as that figure's history and a line through one is read as an error. */
            else -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                numeral()
                when (shape) {
                    is DeckShape.Bars -> DeckBars(shape.values, lit, unlit, progress)
                    is DeckShape.Day -> DeckDay(shape.visits, shape.from, shape.to, lit, unlit, progress)
                    is DeckShape.Spark -> DeckSpark(shape.weeks, lit, progress)
                    else -> Unit
                }
            }
        }
        /* The labels sit on one line across the deck whatever height the drawing above each of them
           takes. Three figures at three heights is the one thing a row of numerals must never do.
           In a stacked column the weight resolves to nothing and the label follows its drawing. */
        Spacer(Modifier.weight(1f))
        Text(figure.label, style = MaterialTheme.typography.bodyMedium, color = DeckInk.quiet)
    }
}

/* One node rather than four. A ring of three arcs read out after the words "3" and "2 out of range"
   is the same sentence spoken twice; what the drawings do say that the numeral does not — the shape
   of a day, the weeks behind a total — is said here instead. */
private fun spokenFor(figure: WorkspaceFigure): String {
    val head = "${figure.label}: ${figure.value}. ${figure.note}"
    return when (val shape = figure.shape) {
        is DeckShape.Day -> "$head. ${shape.visits.size} visits between ${DeckClock.textOf(shape.from)} " +
            "and ${DeckClock.textOf(shape.to)}, ${shape.visits.count { it.signed }} signed off"
        is DeckShape.Spark -> "$head. Drawn over the ${shape.weeks.size} weeks before this one"
        else -> head
    }
}

// MARK: - The deck

@Composable fun ClinicalDeck(role: String, eyebrow: String, note: String, figures: List<WorkspaceFigure>) {
    var visible by remember { mutableStateOf(false) }
    /* Already finished on the first painted frame when the system animator scale is nought. A
       reduced entrance is not a shorter one: it is no entrance, with the complete mark there. */
    val progress by rememberStudioReveal(visible, identity = figures)
    val lead = figures.firstOrNull()
    val rest = figures.drop(1)
    BoxWithConstraints {
        val room = maxWidth
        /* Two-up while two numerals and their labels fit on a line, and a column when they do not.
           The threshold is arithmetic rather than taste, and it is the web's own: the deck's pair sit
           in an auto-fit grid of 150px minimum with 16 between them inside 20 of padding either
           side, so 356 is the narrowest deck that can hold two of them. Below that the web falls to
           one column and so does this. A 320dp phone is below it, which is the point. */
        val stacked = room < 356.dp || LocalDensity.current.fontScale >= 1.3f
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(ThusoRadius.panel))
                .background(DeckInk.ground)
                .padding(
                    start = ThusoSpacing.space20, end = ThusoSpacing.space20,
                    top = ThusoSpacing.space20, bottom = ThusoSpacing.space24
                )
                .studioVisibility { visible = it },
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space20)
        ) {
            Column(
                /* The role is named once, here, where the deck introduces itself — the same thing
                   the web's section label does. Every figure below is its own node and repeats
                   nothing of it. */
                Modifier.semantics(mergeDescendants = true) { contentDescription = "$role. $eyebrow. $note" },
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
            ) {
                /* What the deck is, not which workspace it is in: the headline three lines above
                   already frames the role, and a screen that says the same word twice at the top of
                   itself has spent its most valuable line saying nothing. */
                Text(
                    eyebrow, color = DeckInk.accent,
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp)
                )
                /* Not a disclosure and not a boast: the one sentence that tells a reader what to do
                   if a figure looks wrong, which is to count the rows it was counted from. */
                Text(note, style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(DeckInk.edge))
            /* The lead is a panel and the other two are not: the ground recessed by the design system's
               Ink, which is depth by one step of the same colour rather than by a second shadow inside
               a shadowed card, and darker rather than lighter so its green clears. It is what makes the deck say what the screen is for before it says anything
               else — a row of three identical cells is the composition this replaces. */
            if (lead != null) Box(
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(ThusoRadius.card))
                    .background(DeckInk.leadGround)
                    .padding(ThusoSpacing.space16)
            ) { DeckInstrument(lead, lead = true, progress = progress) }
            if (stacked) rest.forEach { DeckInstrument(it, lead = false, progress = progress, modifier = Modifier.fillMaxWidth()) }
            else Row(
                Modifier.fillMaxWidth().height(IntrinsicSize.Max),
                horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space20)
            ) {
                rest.forEach {
                    DeckInstrument(it, lead = false, progress = progress,
                        modifier = Modifier.weight(1f).fillMaxHeight())
                }
            }
        }
    }
}

// MARK: - The deck, spent on a whole screen

/* THE SEVEN SCREENS BEHIND THE DECK, IN THE DECK'S OWN GRAMMAR.
 *
 * The founder opened the doctor's deck and then Patient file, Consultation record and Protocols, and
 * on the nurse's side Assessments, Thuso Kit, Earnings and Vetting, and said every one of them was
 * boring. The emulator agreed: a clinician crossed from a night canvas with a ring of her own rows on
 * it into a column of white cards at one elevation, and nothing on the way explained the change of
 * dialect. The web had the same fault and fixed it in clinical-records.css and nurse-tools.css; this
 * is Android's half, and the twin of the same section of Features/ClinicalDeckView.swift.
 *
 * What follows is the deck's composition lifted off the landing and made into parts a screen is built
 * from, the composition apps/web/src/features/clinical-deck.css draws: a night canvas carrying a
 * headline with circular glyph badges set inside the sentence; the one figure the screen is about on
 * dark glass, the only place lime is spent; a pale indigo panel with its chart drawn BEHIND its
 * numeral, and a night card crossing that panel's edge; pill clusters for the choice a design review
 * turns on; circular affordances; and a light sheet standing on the canvas's lower edge, one elevation
 * above it.
 *
 * THE WORDMARK'S COLOURS WHERE THE REFERENCE WAS VIOLET. The reference draws its quiet half in
 * lavender; this file drew it in indigo and spent lime on the dark, and the founder asked for the logo
 * instead. So the canvas is BrandInk, the lit marks and the chosen pill BrandGreen, attention
 * BrandOrange, the one spark BrandLime, and the pale panel a six-per-cent green wash over white. No
 * colour token was added.
 *
 * THE RULE THE DECK ABOVE IS BUILT ON HOLDS UNCHANGED. Nothing drawn introduces a number — every
 * ring, gauge, bar and line is counted off rows the same screen lists — and no clinical value moves: a
 * reading's trend is the finished drawing on the first frame whatever the animator scale says, and
 * only a count of rows draws itself in, and not even that when animations are off.
 *
 * MEASURED ON THE GROUND EACH PAIR ACTUALLY LANDS ON, with the sRGB formula the build runs:
 *   BrandInk                  white 12.04   quiet 7.04   lime 10.47   green 3.55, a mark   orange 4.24, a glyph
 *                             Danger is 1.83 here and is never written on the dark
 *   the glass, Ink at 45%     white 14.71   quiet 8.29   green 4.34   lime 12.80   unlit mark at 44% 4.03
 *   a control's edge          white at 44%: 3.63 on the ground, 4.03 on the glass
 *   the chosen pill           BrandGreen, 3.55 off BrandInk and 3.39 off white; Ink on it 5.27
 *   the flagged tag           BrandOrange, 4.24 off BrandInk; Ink on it 6.30
 *   the panel, green at 6%    BrandInk 11.27   BrandInk at 72% 4.99   BodyText 7.10
 *                             green 3.17, the lit mark   BrandInk at 60% 3.59, the unlit one
 *   the badge                 a BrandGreen disc, 3.55 on BrandInk and 3.39 on white; its white glyph 3.39
 *   a white sheet             BrandInk 12.04   BodyText 7.58
 * Colour is never the only difference between two states: a lit arc is thicker, the longest bar is
 * taller, a chosen pill is filled and heavier and carries a tick, and a refusal says so in words. */

enum class DeckGround { GLASS, NIGHT, PANEL }

/** tokens.json's one raised elevation — `0 4px 16px` of ink at ten per cent — and never a second. */
fun Modifier.deckRaised(shape: Shape): Modifier =
    shadow(8.dp, shape, clip = false, ambientColor = Ink.copy(alpha = 0.10f), spotColor = Ink.copy(alpha = 0.10f))

/* One thing standing on the lower edge of another. The upper one is given the overlap back as padding
   by its caller first, so what the lower one covers is empty ground and never a figure; the lower one
   is drawn second, so it is the one on top. Measured rather than offset, because an offset moves the
   drawing and leaves the gap in the layout. */
@Composable private fun DeckStraddle(overlap: Dp, upper: @Composable () -> Unit, lower: @Composable () -> Unit) {
    Layout(content = { Box { upper() }; Box { lower() } }) { measurables, constraints ->
        val loose = constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity)
        val top = measurables[0].measure(loose)
        val bottom = measurables[1].measure(loose)
        val cross = overlap.roundToPx().coerceAtMost(top.height)
        layout(constraints.maxWidth, top.height + bottom.height - cross) {
            top.place(0, 0)
            bottom.place(0, top.height - cross)
        }
    }
}

/* Padding that gives width back once the type is large. Past a 1.6 font scale the app moves to its
   navigation rail and the deck is left a column a little over two hundred dp wide; twenty either side
   of the canvas and sixteen inside the glass spent a fifth of it on ground, and the words it held broke
   one to a line. Twelve is the next step on the spacing scale, not a number chosen for this. */
@Composable private fun deckInset(roomy: Dp): Dp =
    if (LocalDensity.current.fontScale >= 1.6f) ThusoSpacing.space12 else roomy

/** The overlap grows with the reader's type, capped where a larger crossing would start to cover words. */
@Composable private fun scaledOverlap(base: Dp): Dp = base * LocalDensity.current.fontScale.coerceIn(1f, 1.6f)

/* The canvas: flat BrandInk for the reason this file's header gives, the one raised
   elevation, and the composition locals that tell the metrics inside it they are on the dark. */
@Composable fun DeckCanvas(overhang: Dp = 0.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.panel)
    val side = deckInset(ThusoSpacing.space20)
    CompositionLocalProvider(LocalOnStudioNight provides true, LocalSecondaryText provides DeckInk.quiet) {
        Column(
            Modifier.fillMaxWidth().deckRaised(shape).clip(shape).background(DeckInk.ground)
                .padding(start = side, end = side, top = ThusoSpacing.space20, bottom = ThusoSpacing.space24 + overhang),
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space20), content = content
        )
    }
}

/* A canvas and the light sheet that stands on its lower edge. The sheet is inset from the canvas's
   sides, so the night shows either side of it and reads as the ground it stands on rather than as a
   card that has slipped. */
@Composable fun DeckHero(
    wrap: Boolean = true,
    sheetFill: Color = SurfaceWhite,
    content: @Composable ColumnScope.() -> Unit,
    sheet: @Composable ColumnScope.() -> Unit
) {
    val overlap = scaledOverlap(36.dp)
    DeckStraddle(
        overlap,
        upper = { DeckCanvas(overhang = overlap, content = content) },
        /* `wrap` is off where what stands on the edge is already a card of its own — a destination
           carries its own elevation, and a card inside a card is two edges saying one thing. */
        lower = {
            Box(Modifier.padding(horizontal = ThusoSpacing.space12)) {
                if (wrap) DeckSheet(fill = sheetFill, content = sheet)
                else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = sheet)
            }
        }
    )
}

/** The light card that stands on the canvas: white, the card radius, the one elevation. */
@Composable fun DeckSheet(modifier: Modifier = Modifier, fill: Color = SurfaceWhite, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    CompositionLocalProvider(LocalOnStudioNight provides false, LocalSecondaryText provides DeckInk.sheetQuiet) {
        Column(
            modifier.fillMaxWidth().deckRaised(shape).clip(shape).background(fill).padding(ThusoSpacing.space16),
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content
        )
    }
}

/** The lead's own card: the night lifted eight per cent — depth by one step of the same colour rather
    than by a second shadow inside a shadowed card. */
@Composable fun DeckGlassCard(content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(DeckInk.glass).border(1.dp, DeckInk.glassEdge, shape).padding(deckInset(ThusoSpacing.space16)),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content
    )
}

/* The pale half of the deck, and the night card that crosses its lower edge. The dot grid is the
   panel's own ink at a fifth of its strength: it carries nothing, and it is what stops a block of one
   pale colour reading as a hole in the canvas. */
@Composable fun DeckPanel(float: (@Composable ColumnScope.() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    val overlap = if (float != null) scaledOverlap(28.dp) else 0.dp
    val panel = @Composable {
        CompositionLocalProvider(LocalOnStudioNight provides false, LocalSecondaryText provides DeckInk.panelQuiet) {
            Column(
                Modifier.fillMaxWidth().clip(shape).background(DeckInk.panel)
                    .drawBehind {
                        val step = 14.dp.toPx()
                        val radius = 1.dp.toPx()
                        var x = step / 2
                        while (x < size.width) {
                            var y = step / 2
                            while (y < size.height) { drawCircle(BrandInk.copy(alpha = 0.14f), radius, Offset(x, y)); y += step }
                            x += step
                        }
                    }
                    .padding(start = deckInset(ThusoSpacing.space16), end = deckInset(ThusoSpacing.space16), top = ThusoSpacing.space16, bottom = ThusoSpacing.space16 + overlap),
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content
            )
        }
    }
    if (float == null) { panel(); return }
    DeckStraddle(overlap, upper = panel, lower = {
        CompositionLocalProvider(LocalOnStudioNight provides true, LocalSecondaryText provides DeckInk.quiet) {
            Column(
                Modifier.padding(start = ThusoSpacing.space16).fillMaxWidth().deckRaised(shape).clip(shape)
                    .background(DeckInk.ground).border(1.dp, DeckInk.glassEdge, shape)
                    .padding(horizontal = ThusoSpacing.space16, vertical = ThusoSpacing.space12),
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), content = float
            )
        }
    })
}

/** A word of a deck headline, or the circular badge set inside the sentence in place of one. The
    sentence must read correctly with every badge removed, which is what lets TalkBack skip them. */
sealed interface DeckWord {
    data class Words(val text: String) : DeckWord
    data class Glyph(val icon: ImageVector) : DeckWord
}

/* The headline. `metric` rather than `metricLarge`: it is a sentence and not a figure, and the figure on
   the glass below has to stay the largest thing on the screen. Past a 1.5 font scale it drops to
   `screenTitle`, still scaled, for StudioHeadline's reason — a display line one word per row has
   stopped being a headline. One node to TalkBack, announced as a heading, with no badge in it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun DeckHeadline(eyebrow: String, words: List<DeckWord>, tail: String = "") {
    val density = LocalDensity.current
    val size = if (density.fontScale >= 1.5f) ThusoType.screenTitle else ThusoType.metric
    val spoken = words.filterIsInstance<DeckWord.Words>().joinToString(" ") { it.text }
    val line = with(density) { (size * 1.18f).toDp() }
    val disc = with(density) { (size * 0.92f).toDp() }
    Column(
        Modifier.fillMaxWidth().clearAndSetSemantics { heading(); contentDescription = if (tail.isEmpty()) spoken else "$spoken. $tail" },
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Text(eyebrow.uppercase(), color = DeckInk.accent, style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(with(density) { (size * 0.24f).toDp() })) {
            words.forEach { word ->
                when (word) {
                    is DeckWord.Words -> word.text.split(" ").forEach { piece ->
                        Text(
                            piece, color = DeckInk.ink,
                            style = TextStyle(fontSize = size, lineHeight = size * 1.18f, fontWeight = FontWeight.Medium, letterSpacing = (-0.6).sp)
                        )
                    }
                    is DeckWord.Glyph -> Box(Modifier.height(line), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(disc).background(BrandGreen, CircleShape), contentAlignment = Alignment.Center) {
                            Icon(word.icon, null, tint = SurfaceWhite, modifier = Modifier.size(disc * 0.5f))
                        }
                    }
                }
            }
        }
        if (tail.isNotEmpty()) Text(tail, style = MaterialTheme.typography.bodyMedium, color = DeckInk.quiet)
    }
}

/** DemoBadge's words, unchanged, on the dark: outlined in the control edge rather than a pale lozenge
    pulling the eye off the headline. */
@Composable fun DeckPreviewMark() {
    Row(
        Modifier.border(1.dp, DeckInk.control, RoundedCornerShape(ThusoRadius.control))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Box(Modifier.size(6.dp).background(DeckInk.ink, CircleShape))
        Text("Design preview · Fictional data", style = MaterialTheme.typography.labelMedium, color = DeckInk.ink)
    }
}

/** A refusal on the canvas: an orange glyph and the sentence the contract wrote, in white. Orange is
    4.24 on BrandInk, which is a glyph's ratio and not a sentence's. */
@Composable fun DeckRefusal(reason: String?) {
    if (reason.isNullOrEmpty()) return
    Row(
        Modifier.semantics(mergeDescendants = true) { contentDescription = "Refused. $reason" },
        verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Icon(Icons.Outlined.Block, null, tint = DeckInk.refusal, modifier = Modifier.size(18.dp))
        Text(reason, style = MaterialTheme.typography.bodyMedium, color = DeckInk.ink)
    }
}

/** A status on any of the three grounds: outlined in the ground's quiet ink, filled for the one thing
    that is not as it should be, with the word on it doing the telling. */
@Composable fun DeckTag(text: String, flagged: Boolean = false, ground: DeckGround = DeckGround.GLASS) {
    val shape = RoundedCornerShape(if (LocalDensity.current.fontScale >= 1.3f) ThusoRadius.control else ThusoRadius.pill)
    val (ink, fill, edge) = when {
        ground == DeckGround.PANEL && flagged -> Triple(SurfaceWhite, DeckInk.panelInk, DeckInk.panelInk)
        ground == DeckGround.PANEL -> Triple(DeckInk.panelInk, Color.Transparent, DeckInk.panelMark)
        flagged -> Triple(DeckInk.onAttention, DeckInk.attention, DeckInk.attention)
        else -> Triple(DeckInk.quiet, Color.Transparent, DeckInk.mark)
    }
    Text(
        text, style = MaterialTheme.typography.labelSmall, color = ink,
        modifier = Modifier.background(fill, shape).border(1.dp, edge, shape)
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
    )
}

/* A pill cluster: the choice a design review turns on, laid out so every option is visible at once. A
   chip row of Material FilterChips was the same idea in the platform's shape and the wrong ground —
   a pale chip on the night is a lozenge nobody can read. Every pill is a 48dp target and grows with the
   words; past a 1.3 font scale it stops being a capsule, whose ends would cut a wrapped label. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun <T> DeckPills(label: String, selected: T, options: List<Pair<T, String>>, onNight: Boolean = true, choose: (T) -> Unit) {
    val shape = RoundedCornerShape(if (LocalDensity.current.fontScale >= 1.3f) ThusoRadius.control else ThusoRadius.pill)
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        if (label.isNotEmpty()) Text(label, style = MaterialTheme.typography.labelLarge, color = if (onNight) DeckInk.quiet else DeckInk.sheetQuiet)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            options.forEach { (value, title) ->
                val on = value == selected
                val ink = if (on) DeckInk.onChosen else (if (onNight) DeckInk.ink else DeckInk.sheetInk)
                val fill = if (on) DeckInk.chosen else (if (onNight) DeckInk.glass else SurfaceWhite)
                val edge = if (on) Color.Transparent else (if (onNight) DeckInk.control else DeckInk.sheetQuiet)
                Row(
                    Modifier.heightIn(min = TouchTarget).clip(shape).background(fill, shape).border(1.dp, edge, shape)
                        .clickable(role = Role.Button) { choose(value) }
                        .semantics { this.selected = on }
                        .padding(horizontal = ThusoSpacing.space16, vertical = ThusoSpacing.space8),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
                ) {
                    if (on) Icon(Icons.Outlined.Check, null, tint = ink, modifier = Modifier.size(16.dp))
                    Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, color = ink)
                }
            }
        }
    }
}

/** The circular affordance: filled and inverted against its ground, so it reads as the thing that
    moves you. Decorative to TalkBack — the row it sits on is the control. */
@Composable fun DeckCircle(icon: ImageVector = Icons.Outlined.ArrowOutward, onNight: Boolean = false) {
    Box(Modifier.size(44.dp).background(if (onNight) DeckInk.ink else DeckInk.ground, CircleShape), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = if (onNight) DeckInk.ground else SurfaceWhite, modifier = Modifier.size(18.dp))
    }
}

/* A destination in a section, as a card with a circle rather than a grey pill in a column of grey
   pills. The first on a section is `raised` and carries the badge; the rest keep a hairline and a plain
   icon, because a badge on every row is a colour that has stopped meaning anything. */
@Composable fun DeckDestination(title: String, subtitle: String, icon: ImageVector, raised: Boolean = false, click: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    val roomy = LocalDensity.current.fontScale < 1.5f
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp)
            .then(if (raised) Modifier.deckRaised(shape) else Modifier)
            .clip(shape).background(SurfaceWhite, shape)
            .then(if (raised) Modifier else Modifier.border(1.dp, DeckInk.sheetLine, shape))
            .clickable(role = Role.Button, onClick = click)
            .semantics(mergeDescendants = true) {}
            .padding(start = ThusoSpacing.space16, end = ThusoSpacing.space12, top = ThusoSpacing.space12, bottom = ThusoSpacing.space12),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        if (roomy) {
            if (raised) Box(Modifier.size(44.dp).background(BrandGreen, CircleShape), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = SurfaceWhite, modifier = Modifier.size(22.dp))
            } else Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = DeckInk.sheetInk, modifier = Modifier.size(22.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
            if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
        }
        DeckCircle()
    }
}

/* The head of a section on paper: a tracked eyebrow over a hairline, with the section's own count at
   the trailing edge where there is one. */
@Composable fun DeckSectionHead(title: String, count: String? = null, note: String = "") {
    Column(
        Modifier.fillMaxWidth().padding(top = ThusoSpacing.space8).semantics(mergeDescendants = true) { heading() },
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text(
                title.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
                fontWeight = FontWeight.SemiBold, color = DeckInk.sheetQuiet, modifier = Modifier.weight(1f)
            )
            if (count != null) Text(count, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = DeckInk.sheetInk)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(DeckInk.sheetLine))
        if (note.isNotEmpty()) Text(note, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
    }
}

/* One figure on glass, on the night or on the panel, with the drawing that belongs to it. A dial puts
   the numeral inside itself; a line or a set of bars is drawn behind the numeral in the same box,
   because the drawing and the numeral are the same arithmetic.

   `still` is for a clinical value: its trend is the finished picture on the first frame and never
   draws itself in, whatever the reader's animation setting. */
@Composable fun DeckFigure(
    value: String, label: String,
    prefix: String = "", unit: String = "", chip: String? = null, flagged: Boolean = false,
    shape: DeckShape? = null, ground: DeckGround = DeckGround.GLASS, still: Boolean = false
) {
    var visible by remember { mutableStateOf(false) }
    val reveal by rememberStudioReveal(visible, identity = shape)
    val progress = if (still) 1f else reveal
    val ink = if (ground == DeckGround.PANEL) DeckInk.panelInk else DeckInk.ink
    val quiet = if (ground == DeckGround.PANEL) DeckInk.panelQuiet else DeckInk.quiet
    /* Green is the glass's and the panel's. On the bare ground a lit mark is the quiet tone, so the
       figure on the glass stays the one the screen is about. */
    val lit = when (ground) { DeckGround.GLASS -> DeckInk.lit; DeckGround.PANEL -> DeckInk.panelLit; else -> DeckInk.quiet }
    val unlit = when (ground) { DeckGround.GLASS -> DeckInk.leadMark; DeckGround.PANEL -> DeckInk.panelMark; else -> DeckInk.mark }
    val track = if (ground == DeckGround.PANEL) DeckInk.panelTrack else DeckInk.track
    val scale = LocalDensity.current.fontScale
    val stacked = scale >= 1.3f
    val numeralSize = if (ground == DeckGround.GLASS && shape !is DeckShape.Ring && shape !is DeckShape.Gauge) ThusoType.metricLarge else ThusoType.metric
    val numeral = @Composable {
        /* On one baseline. Aligned to the bottom of their boxes, a 16sp "R" sat below a 40sp figure
           whose line box is its own size, and read as a subscript rather than a currency. */
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            if (prefix.isNotEmpty()) Text(prefix, style = MaterialTheme.typography.bodyLarge, color = quiet, modifier = Modifier.alignByBaseline())
            Text(
                value, color = ink, maxLines = 1, modifier = Modifier.alignByBaseline(),
                style = TextStyle(fontSize = numeralSize, lineHeight = numeralSize, fontWeight = FontWeight.Light, fontFeatureSettings = "tnum")
            )
            if (unit.isNotEmpty()) Text(unit, style = MaterialTheme.typography.bodyLarge, color = quiet, modifier = Modifier.alignByBaseline())
        }
    }
    val words = @Composable {
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            if (chip != null) DeckTag(chip, flagged, ground)
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = quiet)
        }
    }
    val spoken = listOf(label, "$prefix$value $unit".trim(), chip.orEmpty()).filter { it.isNotEmpty() }.joinToString(", ")
    Box(Modifier.fillMaxWidth().studioVisibility { visible = it }.clearAndSetSemantics { contentDescription = spoken }) {
        when (shape) {
            is DeckShape.Ring, is DeckShape.Gauge -> {
                val dial = 112.dp * scale.coerceIn(1f, 1.8f)
                val drawn = @Composable {
                    Box(Modifier.size(dial), contentAlignment = Alignment.Center) {
                        if (shape is DeckShape.Ring) DeckRing(shape.segments, lit, unlit, progress, dial, track)
                        else if (shape is DeckShape.Gauge) DeckGauge(shape.part, shape.whole, lit, progress, dial, track)
                        numeral()
                    }
                }
                if (stacked) Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) { drawn(); words() }
                else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space20)) {
                    drawn(); Box(Modifier.weight(1f)) { words() }
                }
            }
            is DeckShape.Bars, is DeckShape.Spark, is DeckShape.Columns -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                if (chip != null) DeckTag(chip, flagged, ground)
                /* Tall enough that a plot drawn behind the figure starts under its lower edge rather than
                   through its digits: at 96 the panel's outlined columns cut the numeral in two. */
                Box(Modifier.fillMaxWidth().heightIn(min = 104.dp)) {
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(64.dp)) {
                        if (shape is DeckShape.Bars) Box(Modifier.align(Alignment.BottomStart)) { DeckBars(shape.values, lit, unlit, progress) }
                        else if (shape is DeckShape.Spark) DeckPlotLine(shape.weeks, lit, progress)
                        else if (shape is DeckShape.Columns) DeckColumns(shape.values, shape.lit, lit, unlit, progress)
                    }
                    numeral()
                }
                Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = quiet)
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                if (chip != null) DeckTag(chip, flagged, ground)
                numeral()
                Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = quiet)
            }
        }
    }
}

/** A line under a numeral, drawn to whatever height it is given, with no caption of its own. */
@Composable private fun DeckPlotLine(values: List<Int>, lit: Color, progress: Float) {
    val high = values.maxOrNull() ?: 1
    val low = values.minOrNull() ?: 0
    val spread = maxOf(high - low, 1)
    Canvas(Modifier.fillMaxSize()) {
        fun x(index: Int) = if (values.size > 1) size.width * index / (values.size - 1) else size.width / 2
        fun y(value: Int) = size.height * (0.92f - 0.72f * (value - low) / spread)
        val line = Path().apply { values.forEachIndexed { index, value -> if (index == 0) moveTo(x(index), y(value)) else lineTo(x(index), y(value)) } }
        val area = Path().apply { addPath(line); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
        clipRect(right = size.width * progress) {
            drawPath(area, lit.copy(alpha = 0.18f))
            drawPath(line, lit, style = Stroke(width = 2.5.dp.toPx()))
        }
    }
}

/** Columns, one per row, oldest first. A lit column is filled and an unlit one is only outlined, so the
    rows the figure adds up are told apart by fill as well as by tone. */
@Composable private fun DeckColumns(values: List<Int>, lit: List<Boolean>, on: Color, off: Color, progress: Float) {
    val high = maxOf(values.maxOrNull() ?: 1, 1)
    Canvas(Modifier.fillMaxSize()) {
        val count = maxOf(values.size, 1)
        val gap = 8.dp.toPx()
        val width = (size.width - gap * (count - 1)) / count
        val edge = 1.5.dp.toPx()
        values.forEachIndexed { index, value ->
            /* A floor of six per cent, for DeckBars' reason: a week that paid little is still a week. */
            val height = size.height * (value.toFloat() / high).coerceIn(0.06f, 1f) * staggered(progress, index, count)
            val left = index * (width + gap)
            /* Square: the radius scale starts at the control's sixteen, which on a column twenty dp wide
               is a capsule, and a capsule is DeckBars' shape rather than a column's. */
            if (lit.getOrElse(index) { false }) drawRect(on, Offset(left, size.height - height), Size(width, height))
            else drawRect(
                off, Offset(left + edge / 2, size.height - height + edge / 2), Size(width - edge, maxOf(height - edge, 0f)),
                style = Stroke(edge)
            )
        }
    }
}

// MARK: - Protocols

/* THE REFERENCE A CASE IS READ AGAINST.
 *
 * "Clinical protocols" was a row in the doctor's tools that opened the roadmap's placeholder. It is
 * the one screen in that workspace that needs no service behind it to be real: the indicative ranges
 * are already in the record contract, generated into RecordsData.kt, and the sentence that qualifies
 * every one of them is that contract's own note on the observations section. Nothing on this screen is
 * new information. What was missing was a screen that says it in one place, which is what a protocol
 * is — and the web has drawn it since the clinical-records pass.
 *
 * WHAT IT REFUSES. The escalation ladder the web draws beside the ranges is typed into a React
 * component rather than into a contract, and a third copy of it here would be the drift this project
 * generates code to avoid; it stays off this screen until it is contract. The "screening" capability's
 * own sentence stands on the canvas, because a reference range read on a phone is exactly the thing a
 * reader might take for a triage tool. And nothing here moves: a range a clinical value is judged
 * against is drawn finished, whatever the animator scale says. */
@Composable fun ClinicalProtocolsScreen() {
    ScreenColumn {
        DeckHero(
            content = {
                DeckPreviewMark()
                DeckHeadline(
                    "Doctor workspace · protocols",
                    listOf(DeckWord.Words("The reference a case"), DeckWord.Glyph(Icons.Outlined.Straighten), DeckWord.Words("is read against"))
                )
                NotConnected("screening")
                DeckGlassCard {
                    DeckFigure(value = "${observationRanges.size}", label = "readings, and the indicative adult range each is flagged against")
                }
            },
            sheet = {
                Text(observationsNote, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
                Text("AI is decision support. Clinical decisions require an authorised clinician’s sign-off.",
                    style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet)
            }
        )
        DeckSectionHead("Where a reading is flagged", count = "${observationRanges.size}")
        observationRanges.forEach { ProtocolRange(it) }
    }
}

/* One range as a ruler: the band is the indicative range and either side of it is where a reading is
   flagged. It is a schematic rather than a scale — seven readings in six units cannot share one axis
   honestly — so the numbers are written on the band and read out in full, because a chart in this
   product is always also a table. White on the BrandInk band is 12.04; BodyText on the green wash 7.10. */
@Composable private fun ProtocolRange(range: ObservationRange) {
    fun figure(value: Double) = if (range.step < 1) "%.1f".format(value) else "%.0f".format(value)
    val low = figure(range.low)
    val high = figure(range.high)
    val shape = RoundedCornerShape(ThusoRadius.card)
    val pill = RoundedCornerShape(ThusoRadius.pill)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(SurfaceWhite).border(1.dp, DeckInk.sheetLine, shape).padding(ThusoSpacing.space16)
            .clearAndSetSemantics {
                contentDescription = "${range.label}. Below $low ${range.unit} is flagged low, $low to $high is inside the indicative range, above $high is flagged high."
            },
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text(range.label, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
            Text(range.unit, style = MaterialTheme.typography.labelMedium, color = DeckInk.sheetQuiet)
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 32.dp).clip(pill).background(DeckInk.panel), verticalAlignment = Alignment.CenterVertically) {
            Text("Low", style = MaterialTheme.typography.labelMedium, color = DeckInk.sheetQuiet, modifier = Modifier.weight(1f).padding(start = ThusoSpacing.space12))
            Box(Modifier.weight(2f).heightIn(min = 32.dp).background(DeckInk.ground, pill), contentAlignment = Alignment.Center) {
                Text("$low–$high", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = SurfaceWhite)
            }
            Text("High", style = MaterialTheme.typography.labelMedium, color = DeckInk.sheetQuiet, textAlign = androidx.compose.ui.text.style.TextAlign.End,
                modifier = Modifier.weight(1f).padding(end = ThusoSpacing.space12))
        }
    }
}

/* The primary action on a staff screen, in the wordmark's ink. StudioButton is the Care Studio's olive
   and stays the patient app's; the screens a clinician works in moved to the logo, and a dark olive
   button under a BrandInk canvas is the palette the founder asked to be rid of. White on BrandInk is
   12.04; a disabled button is the green wash with BodyText on it at 7.10, and it says so by losing the
   ink rather than by greying the words below what a reader can make out. */
@Composable fun DeckButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = ThusoButtonShape,
    contentPadding: PaddingValues = androidx.compose.material3.ButtonDefaults.ContentPadding,
    content: @Composable RowScope.() -> Unit
) {
    androidx.compose.material3.Button(
        onClick = onClick, modifier = modifier, enabled = enabled, shape = shape,
        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
            containerColor = DeckInk.ground, contentColor = SurfaceWhite,
            disabledContainerColor = DeckInk.panel, disabledContentColor = DeckInk.sheetQuiet
        ),
        contentPadding = contentPadding, content = content
    )
}
