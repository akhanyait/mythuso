package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/* Three screens the Health Passport offered on Android and could not open.
 *
 * "Health trends" was a section heading over three charts built from arrays of literal dates. The
 * three device rows under More each went to the catch-all — "this workflow will connect to the
 * relevant clinical, operational or partner service in the functionality phase" — which is the
 * sentence a screen shows when nobody has decided what it is for. And a completed visit, the screen
 * a returning patient wants most, had no door at all: the Past tab drew a row and the row opened
 * the same catch-all.
 *
 * They are ported from apps/web/src/features/Passport.tsx and VisitSummary.tsx rather than
 * reinvented, and the contract wording is the web's word for word — the ranges, the refusals and
 * the notices are all read from the same places the web reads them from.
 */

/* ---- A table of facts ---------------------------------------------------------------------------
   A reading a person cannot read is not a reading, and a table is what somebody reads out to a
   doctor over the phone. Three columns while they fit; at the largest font scales the row stacks
   into a heading and its two facts, because three columns across a 360dp phone at 200% type is four
   words to a column and every one of them broken. */
@Composable private fun FactTable(headings: Triple<String, String, String>, rows: List<Triple<String, String, String>>) {
    val stacked = LocalDensity.current.fontScale >= 1.5f
    Column(Modifier.fillMaxWidth()) {
        if (!stacked) Row(
            Modifier.fillMaxWidth().padding(bottom = ThusoSpacing.space8),
            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
        ) {
            listOf(headings.first, headings.second, headings.third).forEach {
                Text(it, style = MaterialTheme.typography.labelSmall, color = Faint, modifier = Modifier.weight(1f))
            }
        }
        rows.forEachIndexed { index, row ->
            if (index > 0) HorizontalDivider(color = StudioLine)
            if (stacked) Column(
                Modifier.fillMaxWidth().padding(vertical = ThusoSpacing.space12),
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
            ) {
                Text(row.first, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text("${headings.second}: ${row.second}", style = MaterialTheme.typography.bodySmall, color = Faint)
                Text("${headings.third}: ${row.third}", style = MaterialTheme.typography.bodySmall, color = Faint)
            } else Row(
                Modifier.fillMaxWidth().padding(vertical = ThusoSpacing.space12),
                horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
            ) {
                Text(row.first, style = MaterialTheme.typography.titleSmall, color = Charcoal, modifier = Modifier.weight(1f))
                Text(row.second, style = MaterialTheme.typography.bodySmall, color = Charcoal, modifier = Modifier.weight(1f))
                Text(row.third, style = MaterialTheme.typography.bodySmall, color = Faint, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** A statement and what stands behind it, which is the shape most of this product's prose takes. */
@Composable private fun Stated(term: String, detail: String, footnote: String = "") {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        Text(term, style = MaterialTheme.typography.titleSmall, color = Charcoal)
        Text(detail, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        if (footnote.isNotEmpty()) Text(footnote, style = MaterialTheme.typography.bodySmall, color = Faint)
    }
}

@Composable private fun Helper(icon: ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = Faint, modifier = Modifier.size(16.dp).padding(top = 2.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = Faint)
    }
}

/* ---- Trends ------------------------------------------------------------------------------------ */

@Composable fun HealthTrendsScreen(open: (String) -> Unit) {
    var showAll by remember { mutableStateOf(false) }
    val latest = Passport.latestSet
    val outside = Passport.outsideRange(latest)
    val shown = if (showAll) Passport.headlineMeasures + Passport.otherMeasures else Passport.headlineMeasures
    ScreenColumn {
        Heading(
            "Health Passport", "How your readings have changed.",
            "${readingSets.size} home visits over the last ${Passport.monthsCovered} months. Every reading is judged against an indicative reference range, which is a guide and not a diagnosis."
        )
        NotConnected(of = "clinical-records")

        /* The lead: where things stand today, before any curve. A person opening a trends screen
           wants the current number first and the shape of it second — the reverse is a chart they
           have to decode to answer "am I all right". It is the sage panel rather than a lifted
           white one, which is how this language says "read this first". */
        SPanel(tone = PanelTone.LEAD) {
            SChip(
                if (outside.isEmpty()) "All inside range" else "${outside.size} outside range",
                flagged = outside.isNotEmpty()
            )
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text("Your last visit", style = MaterialTheme.typography.titleMedium, color = Charcoal,
                     modifier = Modifier.semantics { heading() })
                Text(Scheduling.longDate(Passport.dateOf(latest.dayOffset)), style = MaterialTheme.typography.bodySmall, color = Charcoal)
            }
            MetricRow(Passport.headlineMeasures.filter { latest.values.containsKey(it.id) }.map { observation ->
                val value = latest.values.getValue(observation.id)
                MetricSpec(
                    Passport.format(observation, value), observation.label, observation.unit,
                    chip = Passport.chipFor(observation, value),
                    flagged = Passport.flagOf(observation, value) != "normal"
                )
            })
        }

        Section("Over time") {
            shown.forEach { observation ->
                ClinicalChart(
                    observation.label, observation.unit,
                    Passport.seriesFor(observation).map { (set, value) ->
                        Reading(Passport.shortLabel(set.dayOffset), value, set.note ?: "—")
                    },
                    observation.low..observation.high,
                    decimals = if (Passport.format(observation, 1.0).contains('.')) 1 else 0
                )
            }
            OutlinedButton(
                onClick = { showAll = !showAll },
                Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) {
                Text(if (showAll) "Show the four I watch" else "Show the other ${Passport.otherMeasures.size} readings")
            }
        }

        /* Every range on this screen in one place, because a person who wants to check one number
           against one range should not have to open seven charts to find it. */
        Section("The ranges these are judged against") {
            CareCard(padding = ThusoSpacing.space16) {
                Note("Indicative reference ranges. They are a guide for a healthy adult and are not a validated early-warning score; your own doctor may work to different numbers for you.")
                FactTable(
                    Triple("Reading", "Indicative range", "Your last"),
                    (Passport.headlineMeasures + Passport.otherMeasures).map { observation ->
                        val value = latest.values[observation.id]
                        val flag = value?.let { Passport.flagOf(observation, it) }
                        Triple(
                            observation.label,
                            Passport.rangeText(observation),
                            if (value == null) "—" else
                                "${Passport.format(observation, value)} ${observation.unit}" +
                                    (if (flag != null && flag != "normal") " · $flag" else "")
                        )
                    }
                )
            }
        }
        Helper(Icons.Outlined.Shield, "Nothing on this screen interprets a reading for you. What a number means for a particular person is a clinical judgement, and MyThuso does not make one.")
        PrimaryAction("Book a visit to have these taken again") { open("Book care") }
        /* This screen is not itself a navigation entry, so no tab is lit while you are on it. A
           full-size way back is the difference between a sub-page and a dead end. */
        OutlinedButton(
            onClick = { open("Health Passport") },
            Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
        ) { Text("Back to your Health Passport") }
    }
}

/* ---- A visit that has already happened ----------------------------------------------------------
   Four answers, in this order: what was measured, whether each reading sits inside its reference
   range, what a doctor said about them, and one way to arrange the same visit again. The readings
   are the visit's own — looked up by the day the visit happened rather than printed beside it — and
   every range is the assessment's, never typed. */

@Composable fun PastVisitScreen(store: PreviewStore, dayOffset: Long, open: (String) -> Unit) {
    val set = Passport.setOnDay(dayOffset)
    val service = services.first { it.id == "vitals" }
    ScreenColumn {
        NotConnected(of = "clinical-records")
        SPanel {
            SChip("Completed")
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(service.name, style = MaterialTheme.typography.titleLarge, color = Charcoal,
                     modifier = Modifier.semantics { heading() })
                Text("${passportHolder.name} · Home visit · Sandton", style = MaterialTheme.typography.bodySmall, color = Faint)
            }
            HorizontalDivider(color = StudioLine)
            ReviewLine("When", Scheduling.longDate(Passport.dateOf(dayOffset)))
            ReviewLine("Where", "Home visit · Sandton")
            ReviewLine("This visit", "R${service.price}")
            HorizontalDivider(color = StudioLine)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                TileIcon(Icons.Outlined.MedicalServices)
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text("Sister Naledi Mokoena", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text("Registered Nurse (SANC)", style = MaterialTheme.typography.bodySmall, color = Faint)
                }
            }
        }

        if (set != null) {
            val measures = Passport.measuredIn(set)
            val outside = Passport.outsideRange(set)
            Section("What was measured") {
                /* The subject of the screen, and the only thing on it set large. A status chip above
                   a thin numeral with its name below — the same shape a figure takes everywhere in
                   this product, so a reading is read the same way as a balance or a count. */
                CareCard(padding = ThusoSpacing.space20) {
                    MetricRow(measures.map { observation ->
                        val value = set.values.getValue(observation.id)
                        MetricSpec(
                            Passport.format(observation, value), observation.label, observation.unit,
                            chip = Passport.chipFor(observation, value),
                            flagged = Passport.flagOf(observation, value) != "normal"
                        )
                    })
                    /* Colour is never the only difference between two states: every chip carries the
                       word as well, and the range each judgement was made against is in the table
                       underneath. */
                    Helper(
                        Icons.Outlined.MonitorHeart,
                        if (outside.isEmpty())
                            "Every reading taken at this visit sits inside its indicative reference range. The ranges are in the table below."
                        else
                            "${outside.joinToString(" and ") { it.label }} sat outside the indicative range at this visit. A reading outside a range is something to look at, not a diagnosis."
                    )
                    set.note?.let { ReviewLine("Noted at the visit", it) }
                }
            }
            CareCard(padding = ThusoSpacing.space16) {
                Note("Every reading taken on ${Scheduling.longDate(Passport.dateOf(set.dayOffset))}, with the indicative range it is judged against.")
                FactTable(
                    Triple("Reading", "Value", "Indicative range"),
                    measures.map { observation ->
                        val value = set.values.getValue(observation.id)
                        val flag = Passport.flagOf(observation, value)
                        Triple(
                            observation.label,
                            "${Passport.format(observation, value)} ${observation.unit}",
                            Passport.rangeText(observation) + if (flag != "normal") " · $flag" else ""
                        )
                    }
                )
            }
        } else {
            EmptyStateCard(
                "No readings were filed for this visit",
                "Nothing was recorded against it, and the record does not fill that in afterwards. If you think something was measured, the nurse who came is the person to ask."
            )
        }

        /* A nurse records and a doctor reviews. Two acts, two names, and the screen never presents
           the first as the second — so the attribution sits above all three sentences rather than
           beside the first one, where it read as a caption on that sentence alone. */
        Section("What the doctor said") {
            CareCard(padding = ThusoSpacing.space20) {
                ReviewLine("Reviewed by", reviewedBy)
                ReviewLine("On", Scheduling.longDate(Passport.dateOf(lastReview.reviewedDayOffset)))
                HorizontalDivider(color = StudioLine)
                Stated("The assessment", lastReview.assessment)
                Stated("What to do until the next visit", lastReview.plan)
                Stated("What happens next", lastReview.next)
            }
        }

        PrimaryAction("Book ${service.name} again") { open("Book care") }
        OutlinedButton(
            onClick = { open("Health trends") },
            Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
        ) { Text("See how this has changed over time") }
        Helper(Icons.Outlined.Shield, "A completed visit is not edited from here. If something on it is wrong, ask for a correction under Privacy & settings and the change is recorded beside the original rather than instead of it.")
    }
}

/* ---- Device permissions -------------------------------------------------------------------------
   Each of the three integrations needs the same three answers before a person could sensibly say
   yes: exactly what would be read, exactly what would not, and the fact that none of it is
   connected.

   Every one of those three is derived. The reading types are the assessment's own observations,
   because MyThuso does not ask for a category it has nowhere to file. The refusal is the record
   contract's protected categories, which are released by the person entry by entry and are not
   something an operating system's permission sheet can hand over on their behalf. And the notice is
   packages/catalog/capabilities.json's, rendered rather than written. */

private data class Integration(
    val name: String, val platform: String, val sheet: String, val withdraw: String, val icon: ImageVector
)
/* Two, not the web's three. Apple Health is the iPhone's store and this is the Android app; a
   screen here explaining what MyThuso would read from a store this device does not have would be
   the first invented thing on a screen written to stop exactly that. */
private val integrations = listOf(
    Integration(
        "Health Connect", "Android",
        "Health Connect asks you, on your own phone, one reading type at a time. MyThuso never sees the question and never sees a type you decline.",
        "Health Connect → App permissions, on your phone. Withdrawing it stops new readings; it does not remove what is already on your record.",
        Icons.Outlined.PhoneAndroid
    ),
    Integration(
        "Thuso Kit readings", "the instruments a nurse brings",
        "The kit is paired at a visit, by the nurse, in front of you. Nothing pairs itself and nothing pairs while you are not there.",
        "Ask the nurse to unpair it, or unpair it from this screen once the kit is connected. An unpaired instrument sends nothing.",
        Icons.Outlined.Bluetooth
    )
)
fun isDevicePermissionScreen(title: String) = integrations.any { it.name == title }

/* An instrument's `measures` are identifiers — "systolic", "ecg" — and two of the nine are not
   observations the assessment collects at all, so they have no reference range to borrow a label
   from. They take the capture contract's own label instead, and the qualifying half of it where
   there is one: a cuff's cell reading "blood pressure — systolic, blood pressure — diastolic,
   pulse" is four wrapped lines saying "blood pressure" twice in a column three words wide. */
private fun measureName(id: String): String {
    val label = (measureLabels[id] ?: id).lowercase()
    return if (label.contains(" — ")) label.substringAfter(" — ") else label
}

@Composable fun DevicePermissionScreen(title: String, open: (String) -> Unit) {
    val spec = integrations.first { it.name == title }
    val device = Provenance.DEVICE
    ScreenColumn {
        /* One notice, from the contract, above everything. It is the first thing on the screen
           because the decision the screen is asking about has not got a subject yet. */
        NotConnected(of = "devices")
        SPanel {
            SChip("Not connected", flagged = true)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.CenterVertically) {
                TileIcon(spec.icon)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text(spec.name, style = MaterialTheme.typography.titleLarge, color = Charcoal,
                         modifier = Modifier.semantics { heading() })
                    Text("Readings from ${spec.platform}", style = MaterialTheme.typography.bodySmall, color = Faint)
                }
            }
        }

        /* A table rather than seven rows each carrying the same tick in the same tile. The units and
           the ranges line up in columns a reader can run an eye down, which is what somebody
           checking whether a permission covers the one reading they care about is actually doing. */
        Section("What would be read") {
            CareCard(padding = ThusoSpacing.space16) {
                Note("Every reading type MyThuso would ask ${spec.name} for, and nothing else. It asks for these because they are what a visit records; a category it has nowhere to file is a category it does not request.")
                FactTable(
                    Triple("Reading", "Recorded in", "Judged against"),
                    Passport.readableMeasures.map { Triple(it.label, it.unit, Passport.rangeText(it)) }
                )
            }
            Helper(Icons.Outlined.Check, spec.sheet)
        }

        /* The half of a permission screen that is usually missing. A list of what an app will read
           tells a person nothing without the list of what it will not, and the second list is the
           one that matters to somebody deciding whether to hand over a phone's health store. */
        Section("What would never be read") {
            CareCard(padding = ThusoSpacing.space20) {
                Stated(
                    "Anything in a protected category", Passport.neverRead.joinToString(", ") + ".",
                    "These are released by you, entry by entry, and a permission sheet cannot hand one over on your behalf."
                )
                Stated(
                    "Where you are, who you message, and what else is on the phone",
                    "MyThuso asks for reading types and nothing else.",
                    "A permission it does not need is a permission it does not ask for. This app’s manifest declares none at all."
                )
                Stated(
                    "Anything going the other way",
                    "Nothing on your MyThuso record is written back to ${spec.name}.",
                    "Readings would come in. Your record would not go out to a store you did not choose to put it in."
                )
            }
        }

        Section("How a reading from a device is filed") {
            CareCard(padding = ThusoSpacing.space20) {
                Stated(device.label, device.detail)
                Stated("Its trust, written down beside it", device.trust)
            }
        }

        if (spec.name == "Thuso Kit readings") Section("The instruments in the kit") {
            CareCard(padding = ThusoSpacing.space16) {
                Note("What a nurse carries, what each instrument measures, and how often it has to be calibrated. An instrument out of calibration still produces a reading; what it stops producing is one anybody should act on without saying so.")
                FactTable(
                    Triple("Instrument", "Measures", "Calibrated"),
                    kitInstruments.map {
                        Triple(it.name, it.measures.joinToString(", ") { id -> measureName(id) }, "Every ${it.calibrateEveryMonths} months")
                    }
                )
            }
        }

        Section("Turning it off again") { Note(spec.withdraw) }

        /* Why it cannot be switched on today, in the contract's own words rather than in a
           paraphrase. There is no Connect button here, disabled or otherwise: a greyed-out primary
           is the biggest thing on a screen promising the one thing the screen has just said it
           cannot do. What is offered instead is the thing that does work — a nurse who brings the
           instruments herself. */
        TonedCard {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.Lock, null, tint = Charcoal, modifier = Modifier.size(18.dp))
                Text(
                    Capabilities.blocking("devices").joinToString(" ") +
                        " Until that changes there is nothing to connect to, so there is no button here pretending otherwise.",
                    style = MaterialTheme.typography.bodySmall, color = Charcoal
                )
            }
        }
        PrimaryAction("Book a visit — the nurse brings the instruments") { open("Book care") }
        OutlinedButton(
            onClick = { open("Health Passport") },
            Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
        ) { Text("Back to your Health Passport") }
    }
}
