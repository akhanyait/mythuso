package za.co.mythuso.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/*
 * Where is she now.
 *
 * The question this product could answer for a Control Tower and not for the person sitting at home
 * with the door on the latch. The coordinates, the zones and the arrival arithmetic have all been on
 * this platform since the dispatch board was written; a patient saw none of it.
 *
 * The composition is an argument. The largest thing on the screen is the number of minutes and the
 * chip above it says “Straight line” before the reader has got to the figure, because a figure that
 * has to be qualified underneath is a figure that will be quoted without the qualification. The map
 * draws that same straight line, dashed, through the buildings between two suburbs — the picture and
 * the caveat saying one thing rather than the picture saying “she is coming down that road”.
 *
 * And on most days there is nothing to show, which is the state this screen was designed around
 * first. A patient can open it a fortnight before her visit; what she gets then is her suburb, the
 * name of the nurse who is coming, and a sentence saying why there is no position on it. An empty
 * map with a spinner would have been the easier thing to build and it would have taught her that the
 * screen is broken.
 *
 * Nothing here is connected. dispatch is one of fifteen capabilities and none of them is; no nurse
 * device is read, no position is requested from this phone — the manifest declares no location
 * permission and no permission of any other kind — and every coordinate on the screen is a suburb
 * centre out of packages/catalog/geography.json.
 */

/* A picture of two suburbs and the line between them.
 *
 * Every coverage zone is drawn, so the two that matter are somewhere rather than floating: the
 * suburbs MyThuso works in are the whole of the map. The nurse is a circle and the visit is a
 * square — the dispatch board's own vocabulary, and shape rather than colour alone, so the two marks
 * are still two marks to a reader who cannot separate them by hue.
 *
 * Nothing moves. A dot that animates towards a house is a promise about a road. */
@Composable internal fun ArrivalMap(from: Zone?, to: Zone, summary: String) {
    Canvas(
        Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(ThusoRadius.control))
            .semantics { contentDescription = summary; role = Role.Image }
    ) {
        val side = size.minDimension
        fun at(zone: Zone): Offset {
            val (x, y) = Geography.project(zone.at)
            return Offset((x / 100.0).toFloat() * size.width, (y / 100.0).toFloat() * size.height)
        }
        fun radius(zone: Zone) = (Geography.radiusInSquare(zone.radiusKm) / 100.0).toFloat() * side
        drawRect(Mist, Offset.Zero, Size(size.width, size.height))
        GeographyData.zones.forEach { zone ->
            val mine = zone.id == to.id || zone.id == from?.id
            drawCircle(if (mine) PaleSage.copy(alpha = 0.65f) else Cloud, radius(zone), at(zone))
            drawCircle(SageSlate.copy(alpha = 0.55f), radius(zone), at(zone), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx()))
        }
        if (from != null) drawLine(
            SageSlate, at(from), at(to), strokeWidth = 3f, cap = StrokeCap.Round,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 12f))
        )
        /* Both marks solid charcoal, and the difference is the shape. The nurse was a ring and the
           key below it a filled dot, which is a key that does not describe its own picture — found
           by looking at the two together rather than at either. */
        val visit = at(to)
        drawRect(Charcoal, Offset(visit.x - 10f, visit.y - 10f), Size(20f, 20f))
        if (from != null) drawCircle(Charcoal, 11f, at(from))
    }
}

@Composable private fun MapKeyRow(square: Boolean, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        Box(Modifier.size(12.dp).background(Charcoal, if (square) RoundedCornerShape(2.dp) else CircleShape))
        Text(text, style = MaterialTheme.typography.bodySmall, color = LocalSecondaryText.current)
    }
}

/** One thing this screen is not, and the reason underneath it. */
@Composable private fun StatedRefusal(title: String, sentence: String, why: String = "") {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
        Text(sentence, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        if (why.isNotEmpty()) Note(why)
    }
}

@Composable fun ArrivalScreen(store: PreviewStore, reference: String, open: (String) -> Unit) {
    val visit = store.visits.firstOrNull { it.reference == reference } ?: store.visits.firstOrNull()
    if (visit == null) {
        ScreenColumn {
            Heading("Your visit", "Where is your nurse?", "")
            EmptyStateCard(
                "Nothing to follow",
                "When you book a visit, this is where you will see who is coming and how far away they are on the day."
            )
        }
        return
    }
    val arrival = arrivalFor(visit.address, visit.date, visit.kind, VisitGroup.UPCOMING)
    val to = when (arrival) {
        is Arrival.OnTheDay -> arrival.to
        is Arrival.AnotherDay -> arrival.to
        is Arrival.NoWindow -> arrival.to
        else -> null
    }
    val from = (arrival as? Arrival.OnTheDay)?.from
    val eta = (arrival as? Arrival.OnTheDay)?.eta
    val watching = arrival is Arrival.OnTheDay
    val summary = if (to == null) "Schematic map of ${GeographyData.city}."
    else "Schematic map of ${GeographyData.city}. Your visit is drawn at the centre of ${to.name}." +
        (if (from != null) " ${AssignedNurse.name} is drawn at the centre of ${from.name}, and a dashed straight line joins the two."
        else " No nurse is drawn, because nobody is on the way yet.")

    ScreenColumn {
        DemoBadge()
        Heading("Your visit", "Where is your nurse?",
            "${visit.service.name} for ${visit.person}${visit.date?.let { " · ${Scheduling.longDate(it)}" } ?: ""}")
        NotConnected(of = "dispatch")

        /* The lead, and it is the only panel on the screen that takes the sage. What a person came
           for is one figure; everything under it is the reason that figure is allowed to be shown. */
        SPanel(tone = PanelTone.LEAD) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                Box(Modifier.size(44.dp).background(SurfaceWhite, CircleShape), Alignment.Center) {
                    Text(AssignedNurse.initials, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text(AssignedNurse.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note(AssignedNurse.role)
                }
                SChip(
                    when (arrival) {
                        is Arrival.OnTheDay -> "Coming today"
                        is Arrival.AnotherDay -> "In ${arrival.days} ${if (arrival.days == 1L) "day" else "days"}"
                        else -> "Not yet"
                    }
                )
            }
            if (watching && eta != null) {
                MetricRow(listOfNotNull(
                    /* Minutes first and the chip says what they are before the reader reaches them.
                       When there is nothing to divide, the word is “Estimating” — never a dash, which
                       reads as a number to nobody, and never nought, which reads as “she is at the
                       gate”. */
                    if (eta.minutes != null)
                        MetricSpec(minutesSentence(eta), "${from?.name} to ${to?.name}", unit = "min", chip = "Straight line")
                    else MetricSpec(minutesSentence(eta), to?.name.orEmpty(), chip = "No distance to measure"),
                    eta.distanceKm?.let { MetricSpec("%.1f".format(java.util.Locale.UK, it), "Distance measured", unit = "km", chip = "Suburb centres") },
                    visit.start?.let { MetricSpec(it, visit.ends?.let { end -> "Your window, until $end" } ?: "Your window", chip = "What you were told") }
                ))
                Note(basisSentence(eta))
            } else {
                MetricRow(listOfNotNull(
                    (arrival as? Arrival.AnotherDay)?.let {
                        MetricSpec(it.days.toString(), "Until the day", unit = if (it.days == 1L) "day" else "days", chip = "Your visit")
                    },
                    visit.start?.let { MetricSpec(it, visit.ends?.let { end -> "Your window, until $end" } ?: "Your window", chip = "What you were told") },
                    to?.let { MetricSpec(it.name, "The suburb your visit is in", chip = "Where") }
                ))
                Note(when (arrival) {
                    is Arrival.AnotherDay -> arrival.refusal
                    is Arrival.NoWindow -> arrival.refusal
                    is Arrival.OutsideCoverage -> arrival.refusal
                    is Arrival.Finished -> arrival.refusal
                    else -> ""
                })
            }
        }

        (arrival as? Arrival.OutsideCoverage)?.let {
            TonedCard(background = MangoSoft) {
                Text("${it.refusal} ${it.why}", style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }

        if (to != null) Section(if (from != null) "${from.name} to ${to.name}" else to.name) {
            CareCard {
                ArrivalMap(from, to, summary)
                if (from != null) MapKeyRow(false, "${AssignedNurse.name} · ${from.name}")
                MapKeyRow(true, "Your visit · ${to.name}")
                Note(GeographyData.precisionSentence)
            }
        }

        /* The half of this screen that matters most, and the half a tracking feature normally leaves
           out. Each of the four is something a reader could otherwise reasonably assume the opposite
           of. */
        Section("What this is, and what it is not") {
            CareCard {
                StatedRefusal("It is not an arrival time", ArrivalRefusals.notAnArrivalTime,
                    Capabilities.blocking("dispatch").joinToString(" "))
                HorizontalDivider(color = StudioLine)
                StatedRefusal("Neither pin is a house", ArrivalRefusals.noDoorstep,
                    Geography.rule("address-is-not-a-pin").why)
                HorizontalDivider(color = StudioLine)
                StatedRefusal("Nowhere she has been", Geography.rule("no-history-drawn").statement,
                    Geography.rule("no-history-drawn").why)
                HorizontalDivider(color = StudioLine)
                StatedRefusal("You see this on the day and not before", ArrivalRefusals.onlyOnTheDay)
            }
            TonedCard { Text(ArrivalRefusals.nothingMeasured, style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
            Note(GeographyData.coverageSentence)
        }

        StudioButton(onClick = { open("Door check") }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
            Text(VerifyInServiceData.PatientDoorText.open)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            OutlinedButton(
                onClick = { open("Visits") },
                Modifier.weight(1f).heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text("Back to your visits") }
        }
    }
}
