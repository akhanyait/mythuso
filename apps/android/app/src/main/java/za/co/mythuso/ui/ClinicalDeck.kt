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
 * THE GROUND IS FLAT studioNight, AND DELIBERATELY NOT StudioNightCard's. That card carries a white
 * highlight at ten per cent, which is right for a card holding a sentence and wrong for one holding
 * five drawings: every unlit mark would be measured against a ground that changes across the card,
 * and at the palest corner paper at forty per cent falls to 3.01 against it — a mark that clears
 * SC 1.4.11 in the middle of the panel and scrapes it at the edge. On a flat ground every ratio the
 * web computes in apps/web/src/features/clinical-deck.css holds here exactly:
 *
 *   studioPaper on studioNight   13.59      studioLime on studioNight   12.03
 *   paper at 72% over night      7.73       — quiet text: the labels, the note, an unlit lit mark
 *   paper at 40% over night      3.42       — an unlit mark, clear of 3:1 against the ground
 *   paper at 24% over night      2.11       — the groove a ring runs in; it carries nothing
 *   paper at  6% over night                 — the lead's own panel: paper on it 11.47, lime 10.16
 *   paper at 44% over that panel 3.55       — the unlit mark ON the lighter ground. The 40% above
 *                                             measures 2.89 there, which is a colour that clears on
 *                                             the ground it was chosen against and not on the one it
 *                                             lands on.
 *
 * AND COLOUR IS NEVER THE ONLY DIFFERENCE. A flagged arc is the brighter one AND the thicker one; a
 * signed visit is the filled block AND the paper-weight one. Lime is spent once per deck, on the
 * figure the screen was opened for — which is why the flagged chip here is paper on night rather
 * than StudioNightChip's lime: a deck with two accents has none.
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
}

/* Alphas over StudioPaper rather than flattened greys, for the reason ThusoOpacity's own comment
   gives: a flattened grey cannot follow the ground it sits on and an alpha has no choice but to.
   The ratios each of these composites to are in the header above. */
object DeckInk {
    val ground = StudioNight
    val ink = StudioPaper
    val accent = StudioLime
    /** The muted step is the token rather than a number retyped here: the same alpha every muted
     *  label on all three platforms is set at, and it darkens with whatever ground it lands on. */
    val quiet = StudioPaper.copy(alpha = ThusoOpacity.charcoalMuted)
    val mark = StudioPaper.copy(alpha = 0.40f)

    /** The unlit mark on the lead's lighter panel. See the header: 40% does not clear 3:1 there. */
    val leadMark = StudioPaper.copy(alpha = 0.44f)
    val track = StudioPaper.copy(alpha = 0.24f)
    val edge = StudioPaper.copy(alpha = 0.14f)
    val leadGround = StudioPaper.copy(alpha = 0.06f)
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
    segments: List<Boolean>, lit: Color, unlit: Color, progress: Float, side: Dp
) {
    Canvas(Modifier.size(side)) {
        val span = size.minDimension
        val radius = span * 0.39f
        val centre = Offset(size.width / 2, size.height / 2)
        val box = Size(radius * 2, radius * 2)
        val corner = Offset(centre.x - radius, centre.y - radius)
        drawArc(
            DeckInk.track, 0f, 360f, useCenter = false, topLeft = corner, size = box,
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
@Composable private fun DeckGauge(part: Int, whole: Int, lit: Color, progress: Float, side: Dp) {
    Canvas(Modifier.size(side)) {
        val span = size.minDimension
        val radius = span * 0.39f
        val corner = Offset(size.width / 2 - radius, size.height / 2 - radius)
        val box = Size(radius * 2, radius * 2)
        val from = 0.625f
        val sweep = 0.75f
        val filled = if (whole > 0) (part.toFloat() / whole).coerceIn(0f, 1f) else 0f
        drawArc(
            DeckInk.track, turnToDegrees(from), sweep * 360f, useCenter = false,
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

/* The deck's own chip, and it is not the night card's. StudioNightChip fills the flagged one lime,
   which is right on a card whose only accent it is and wrong here: the lead instrument already
   spends lime on its marks, and a second lime object would leave the deck with two accents and
   therefore with none. So the flagged chip is the deck's ink filled — studioNight on studioPaper,
   13.59:1, the same declared pair the other way round — and everything else is outlined quiet. */
@Composable private fun DeckChip(text: String, flagged: Boolean) {
    /* A pill until the words no longer fit on a line. A capsule's ends curve in by half its height,
       and at the larger font scales that eats the first and last word of a wrapped status. */
    val shape = RoundedCornerShape(
        if (LocalDensity.current.fontScale >= 1.3f) ThusoRadius.control else ThusoRadius.pill
    )
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = if (flagged) DeckInk.ground else DeckInk.quiet,
        modifier = Modifier
            .background(if (flagged) DeckInk.ink else Color.Transparent, shape)
            .then(if (flagged) Modifier else Modifier.border(1.dp, DeckInk.mark, shape))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
    )
}

// MARK: - One instrument

@Composable private fun DeckInstrument(
    figure: WorkspaceFigure, lead: Boolean, progress: Float, modifier: Modifier = Modifier
) {
    /* The lead is the only instrument that spends the accent. On the other two a lit mark is the
       quiet tone — still the brightest thing in its own drawing, still two channels apart from an
       unlit one, and not a second thing on the deck claiming to be the most important. */
    val lit = if (lead) DeckInk.accent else DeckInk.quiet
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
            /* The lead is a panel and the other two are not: the night lifted six per cent, which is
               depth by one step of the same colour rather than by a second shadow inside a shadowed
               card. It is what makes the deck say what the screen is for before it says anything
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
