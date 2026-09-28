package za.co.mythuso.ui

import za.co.mythuso.model.FramingData
import za.co.mythuso.model.Passport
import za.co.mythuso.model.passportHolder

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.R
import za.co.mythuso.model.*
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.semantics.hideFromAccessibility
import za.co.mythuso.ui.components.*

/* Every screen's ground. 16dp in from the edges, 24dp between the things on it — unrelated things
   far apart — and a section holds its own header 12dp above its own content. The last gap is the
   bottom bar's: a screen that ends level with the navigation looks like it has been cut off. */
@Composable fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = ThusoSpacing.space16)
            .padding(top = ThusoSpacing.space8, bottom = ThusoSpacing.space40),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space24), content = content
    )
}
/* The patient's home, on the identity (28 September 2026): the same order and the same data as
   apps/web/src/features/Dashboard.tsx. The welcome and, in it, the one thing a person opened the home
   for — the next step; the figures, from the record; care you can book today; your health over time,
   drawn only from readings on record; recent care, newest first; and the rest of the household. Every
   card is white, as the web's are since the handoff: the editorial cover, the lilac wellbeing block and
   the peach promotion said nothing a reader could use. Booking callbacks still carry the selected
   service and search query. */
@Composable fun HomeScreen(store: PreviewStore, book: (CareService?) -> Unit, open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        HomeGreeting(store, open)
        HomeNextVisit(store, book, open)
        HomeMetrics(store, open)
        HomeShortcuts(store, book)
        HomeResults(open)
        HomeHistory(open)
        HomeLiveWell(open)
        HomeCarePlan(open)
        HomeFamily(store, open)
        PassportPromo(store, open)
        ThusoButton("See the first-run and recovery flow", onClick = firstRun, variant = ThusoButtonVariant.Ghost, modifier = Modifier.fillMaxWidth())
    }
}

/* The care area and the person a visit is for sit at the top, together, because they change what
   everything under them means. Choosing a family member here opens the family screen, where the
   consent and record-access questions are actually answered — never their record. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun HomeGreeting(store: PreviewStore, open: (String) -> Unit) {
    var areaMenu by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
        DemoBadge()
        /* THE HEADLINE IS THE CONTRACT'S OWN WORDS, IN ELEVEN LANGUAGES. shell.greeting and shell.tagline
           are both in locales.json, reviewed to the same standard as the rest of the shell; which keys
           make up the patient's headline is packages/catalog/framing.json's decision, not this file's.
           Set in the display face, as the handoff sets a page title. */
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text(thuso(FramingData.patientLead, store.locale), style = MaterialTheme.typography.headlineLarge, color = theme.foreground,
                modifier = Modifier.semantics { heading() })
            Text(thuso(FramingData.patientDetail, store.locale), style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
        }
        /* A FlowRow rather than a Row: at the largest font scales the two chips take a line each
           instead of squeezing the care area down to an ellipsis. */
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box {
                ContextChip(Icons.Outlined.LocationOn, store.careArea, "Care area: ${store.careArea}") { areaMenu = true }
                DropdownMenu(areaMenu, { areaMenu = false }, containerColor = theme.surface) {
                    careAreas.forEach { area ->
                        DropdownMenuItem(
                            text = { Text(area, color = theme.foreground) },
                            onClick = { store.careArea = area; areaMenu = false },
                            trailingIcon = { if (area == store.careArea) Icon(Icons.Outlined.Check, null, tint = theme.foreground) }
                        )
                    }
                }
            }
            /* A first name here, and the whole sentence in the description a screen reader reads. The
               full name beside the care area is wider than a 393dp phone, so the two chips took a
               line each and pushed the visit somebody came to look at below the fold. */
            ContextChip(Icons.Outlined.AccountCircle, "Lerato", "Care is for Lerato Molefe. Open your circle of care") { open("My family") }
        }
    }
}

/* The handoff's pd-chip: a compact control, so the one place a pill is still right. */
@Composable private fun ContextChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, label: String, click: () -> Unit) {
    Row(
        Modifier.heightIn(min = TouchTarget).clip(CircleShape).background(theme.surface)
            .border(1.dp, theme.border, CircleShape).clickable(onClick = click)
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(icon, null, tint = theme.foreground, modifier = Modifier.size(16.dp))
        /* Ellipsised rather than broken: "Johannesbur / g" is not a place. The whole name is in the
           description a screen reader reads. */
        Text(text, style = MaterialTheme.typography.labelMedium, color = theme.foreground, maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        Icon(Icons.Outlined.ExpandMore, null, tint = theme.mutedForeground, modifier = Modifier.size(16.dp))
    }
}

/* The MyThuso visit icon on the handoff's tile, for the one card on this screen that is about a visit. */
@Composable private fun VisitTile() {
    Box(Modifier.size(44.dp).background(theme.accent.tint(0.15f), RoundedCornerShape(ThusoRadius.tile)), Alignment.Center) {
        Icon(painterResource(R.drawable.ic_mythuso_visit), null, Modifier.size(24.dp), tint = Color.Unspecified)
    }
}

/* The next step, as the web's pd-next section: what is already true — a visit somebody has arranged —
   or the way to arrange one. It is the LeadCard, the one elevated card on the screen, and it is one
   thing to TalkBack: the service, the hour and the nurse read as a sentence rather than as six stops. */
@Composable private fun HomeNextVisit(store: PreviewStore, book: (CareService?) -> Unit, open: (String) -> Unit) {
    val visit = store.visits.firstOrNull()
    Section(thuso(Phrase.NEXT_VISIT, store.locale), if (visit == null) null else "All visits", { open("Visits") }) {
        if (visit == null) {
            /* Not a blank space and not a fixture. The sentences are the scheduling contract's, so
               all three apps say the same thing about having nothing booked. */
            LeadCard(Modifier.semantics(mergeDescendants = true) {}) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    VisitTile()
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(SchedulingData.noUpcoming, style = MaterialTheme.typography.titleLarge, color = theme.foreground)
                        Text(SchedulingData.noUpcomingDetail, style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
                    }
                }
                ThusoButton("Explore care", onClick = { book(null) }, trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward, modifier = Modifier.fillMaxWidth())
            }
        } else {
            val confirmed = visit.status == "Confirmed"
            val spoken = "${visit.service.name}, ${visit.status}. ${visit.shortWhenText}. " +
                (if (visit.isScheduled) "${visit.service.duration} minutes. " else "Looking for the nearest nurse. ") +
                "${visit.address}. Sister Naledi Mokoena, Registered Nurse, SANC."
            /* The state pill sits at the row's end while there is room and above the title past a 1.3
               font scale, for StatusHeader's reason: a pill and a title cannot both have the width on a
               393dp phone, and the pill overran the title at twice the type. */
            val stacked = LocalDensity.current.fontScale >= 1.3f
            LeadCard(Modifier.semantics(mergeDescendants = true) { contentDescription = spoken }) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    VisitTile()
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        if (stacked) StatusPill(visit.status, if (confirmed) "teal" else "amber")
                        Text(if (confirmed) "Get ready for your visit" else "Review your visit request", style = MaterialTheme.typography.titleLarge, color = theme.foreground)
                        Text("${visit.service.name} · ${visit.shortWhenText} · ${visit.person}", style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
                    }
                    if (!stacked) StatusPill(visit.status, if (confirmed) "teal" else "amber")
                }
                /* An arrival estimate belongs to "come now" and to nothing else; a visit booked for a
                   named hour says how long it takes instead, from the catalogue. */
                if (visit.isScheduled) IconLine(Icons.Outlined.Schedule, "${visit.service.duration} minutes")
                else IconLine(Icons.Outlined.Bolt, "Looking for the nearest nurse")
                IconLine(Icons.Outlined.LocationOn, visit.address)
                HorizontalDivider(color = theme.border)
                NurseRow()
                Text("Have your medication list ready.", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                ThusoButton(
                    if (confirmed) "Prepare for my visit" else "View visit details",
                    onClick = { open("Upcoming visit: ${visit.reference}") },
                    trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward, modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

/* The figures, from the record — the same four the web counts (Dashboard.tsx, "pd-metrics"): the next
   visit, blood pressure and blood glucose from the Passport's latest set, and the doctor's review. Two
   of them are readings and open the record they came from; the other two are facts about the account
   and are not buttons, because nothing is behind them to open. Two to a row, and one to a row once the
   reader has enlarged the type past the point where two large numerals fit. */
@Composable private fun HomeMetrics(store: PreviewStore, open: (String) -> Unit) {
    val next = store.visits.firstOrNull()
    val latest = Passport.latestSet
    val systolic = Passport.spec("systolic")
    val diastolic = Passport.spec("diastolic")
    val glucose = Passport.spec("glucose")
    val pressureInRange = systolic != null && diastolic != null &&
        Passport.flagOf(systolic, latest.values.getValue("systolic")) == "normal" && Passport.flagOf(diastolic, latest.values.getValue("diastolic")) == "normal"
    val glucoseValue = glucose?.let { latest.values[it.id] }
    val glucoseInRange = glucose != null && glucoseValue != null && Passport.flagOf(glucose, glucoseValue) == "normal"
    val cards: List<@Composable (Modifier) -> Unit> = listOf(
        { m -> ThusoMetricCard(
            "Next visit", next?.let { if (it.isScheduled) it.start ?: "Soon" else "Soon" } ?: "None", m,
            trend = next?.let { if (it.isScheduled && it.date != null) Scheduling.shortDate(it.date) else it.service.name },
            iconSlot = { Icon(painterResource(R.drawable.ic_mythuso_visit), null, Modifier.size(20.dp), tint = Color.Unspecified) }
        ) },
        { m -> ThusoMetricCard(
            "Blood pressure", "${latest.values.getValue("systolic").toInt()}/${latest.values.getValue("diastolic").toInt()}", m,
            unit = systolic?.unit,
            iconSlot = { Icon(painterResource(R.drawable.ic_mythuso_health), null, Modifier.size(20.dp), tint = Color.Unspecified) },
            onClick = { open("Health Passport") },
            foot = { RangeFoot(pressureInRange, "systolic") }
        ) },
        { m -> ThusoMetricCard(
            "Blood glucose", if (glucose != null && glucoseValue != null) Passport.format(glucose, glucoseValue) else "—", m,
            unit = glucose?.unit,
            iconSlot = { Icon(painterResource(R.drawable.ic_mythuso_results), null, Modifier.size(20.dp), tint = Color.Unspecified) },
            onClick = { open("Health Passport") },
            foot = { RangeFoot(glucoseInRange, "glucose") }
        ) },
        { m -> ThusoMetricCard(
            "Doctor's review", Passport.shortLabel(lastReview.reviewedDayOffset), m, trend = passportReviewer.name,
            iconSlot = { Icon(painterResource(R.drawable.ic_mythuso_health), null, Modifier.size(20.dp), tint = Color.Unspecified) }
        ) }
    )
    val perRow = if (LocalDensity.current.fontScale >= 1.3f) 1 else 2
    Column(Modifier.semantics { contentDescription = "Your care at a glance" }, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        cards.chunked(perRow).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                row.forEach { card -> card(Modifier.weight(1f)) }
                repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/* Under a reading: whether it sits inside its indicative range, in words, and the shape of it over the
   visits on record — a sparkline drawn only from readings that reached the record. */
@Composable private fun RangeFoot(inRange: Boolean, measure: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        ThusoBadge(if (inRange) "In range" else "Outside range", variant = if (inRange) ThusoBadgeVariant.Success else ThusoBadgeVariant.Warning, size = ThusoBadgeSize.Sm, dot = true)
        Sparkline(measure)
    }
}

@Composable private fun Sparkline(measure: String) {
    val observation = Passport.spec(measure) ?: return
    val series = Passport.seriesFor(observation).map { it.second }
    if (series.size < 2) return
    val ink = theme.accent
    androidx.compose.foundation.Canvas(Modifier.width(56.dp).height(20.dp).semantics { hideFromAccessibility() }) {
        val low = series.min(); val high = series.max()
        val span = if (high - low == 0.0) 1.0 else high - low
        val path = androidx.compose.ui.graphics.Path()
        series.forEachIndexed { index, value ->
            val x = size.width * index / (series.size - 1)
            val y = size.height - (size.height * ((value - low) / span)).toFloat()
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, ink, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
    }
}

/* One row per service: one symbol, the name, what it is, the price and how long it takes. Both
   numbers come from the catalogue rather than being typed here. The field above them is the
   identity's search: the same words as the web's, and Search sends the query to the catalogue. */
@Composable private fun HomeShortcuts(store: PreviewStore, book: (CareService?) -> Unit) {
    Section("Care you can book today", "See all", { book(null) }) {
        ThusoTextField(
            store.careQuery, { store.careQuery = it }, placeholder = "What care do you need today?",
            leadingIcon = Icons.Outlined.Search,
            modifier = Modifier.semantics { contentDescription = "Search for care" },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { store.careCategory = "All care"; book(null) })
        )
        CareCard(padding = ThusoSpacing.space8) {
            services.take(4).forEachIndexed { index, service ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.control)).clickable { book(service) }
                        .heightIn(min = TouchTarget).padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space8)
                        .semantics(mergeDescendants = true) {
                            contentDescription =
                                "${service.name}. ${service.detail} From R${service.price}, ${service.duration} minutes"
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
                ) {
                    TileIcon(serviceIcon(service.id))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(service.name, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                        Text(service.detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text("R${service.price}", style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                        Text("${service.duration} min", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                    }
                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = theme.mutedForeground, modifier = Modifier.size(20.dp))
                }
                if (index < 3) HorizontalDivider(color = theme.border)
            }
        }
    }
}

/* Your health over time: the trend, drawn only through readings that reached the record — two or more
   of one measure — and, where there are not two, the honest empty state rather than a line drawn
   through one point. */
@Composable private fun HomeResults(open: (String) -> Unit) {
    Section("Your health over time", "Health Passport", { open("Health Passport") }) {
        val observation = Passport.spec("systolic")
        val series = observation?.let { Passport.seriesFor(it) }.orEmpty()
        if (observation != null && series.size > 1) {
            ClinicalChart("Systolic blood pressure", observation.unit, series.map { (set, value) -> Reading(Passport.shortLabel(set.dayOffset), value, set.note ?: "—") }, observation.low..observation.high)
        } else EmptyStateCard("No trend to show yet", "A trend needs two readings on your record. It is drawn from what a nurse recorded, never filled in.")
        PassportData.documents.firstOrNull { it.name == "Laboratory results" }?.let { document ->
            CareCard {
                MenuRow(document.name, "${Passport.shortLabel(document.dayOffset)} · ${document.kind}", Icons.Outlined.Biotech) { open(document.opens ?: "Health Passport") }
                StatusPill(if (document.reviewed) "Doctor reviewed" else "Awaiting doctor review", if (document.reviewed) "teal" else "amber")
            }
        }
    }
}

/* What happened lately, newest first: each visit that took readings, and the doctor's review of the
   last one on the day it was written. Read from the Passport's contract rather than composed here,
   as the web's "Recent care" is. */
@Composable private fun HomeHistory(open: (String) -> Unit) {
    data class Item(val day: Long, val title: String, val detail: String, val badge: String?)
    val systolic = Passport.spec("systolic")
    val diastolic = Passport.spec("diastolic")
    val history = (listOf(Item(lastReview.reviewedDayOffset, "${passportReviewer.name} reviewed your readings", lastReview.next, "Reviewed")) +
        readingSets.map { set ->
            val s = set.values["systolic"]; val d = set.values["diastolic"]
            val outside = systolic != null && diastolic != null && s != null && d != null &&
                (Passport.flagOf(systolic, s) != "normal" || Passport.flagOf(diastolic, d) != "normal")
            Item(set.dayOffset, "Home visit · readings taken",
                "Blood pressure ${s?.toInt() ?: "—"}/${d?.toInt() ?: "—"} ${systolic?.unit.orEmpty()}${set.note?.let { " · $it" } ?: ""}",
                if (outside) "Outside range" else null)
        }).sortedByDescending { it.day }
    Section("Recent care", "Care timeline", { open("Care timeline") }) {
        CareCard(padding = ThusoSpacing.space8) {
            Text("What your nurse recorded, and what the doctor said about it.", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground,
                modifier = Modifier.padding(horizontal = ThusoSpacing.space8))
            history.forEachIndexed { index, item ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.control)).clickable { open("Health Passport") }
                        .heightIn(min = TouchTarget).padding(ThusoSpacing.space8).semantics(mergeDescendants = true) {},
                    verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
                ) {
                    Text(Passport.shortLabel(item.day), style = MaterialTheme.typography.labelMedium, color = theme.mutedForeground, modifier = Modifier.widthIn(min = 52.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(item.title, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                        Text(item.detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                    }
                    item.badge?.let { ThusoBadge(it, variant = if (it == "Reviewed") ThusoBadgeVariant.Primary else ThusoBadgeVariant.Warning, size = ThusoBadgeSize.Sm) }
                }
                if (index < history.lastIndex) HorizontalDivider(color = theme.border)
            }
        }
    }
}

/* Live well, on a card like every other: the eyebrow, the invitation and the way in. The lilac block
   and its decorative moon are gone with the handoff's refusal of decorative orbs. */
@Composable private fun HomeLiveWell(open: (String) -> Unit) {
    ThusoCard(
        Modifier.semantics(mergeDescendants = true) {}, variant = ThusoCardVariant.Interactive,
        padding = ThusoCardPadding.Md, onClick = { open("Live well") }
    ) {
        Text("YOUR EVERYDAY WELLBEING", style = MaterialTheme.typography.labelSmall, letterSpacing = 0.8.sp, color = theme.mutedForeground)
        Text("Make room for you.", style = MaterialTheme.typography.titleLarge, color = theme.foreground)
        Text("How have you been feeling? A quiet space for your own words.", style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text("Open your journal", style = MaterialTheme.typography.labelLarge, color = theme.foreground)
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = theme.foreground, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable private fun HomeCarePlan(open: (String) -> Unit) {
    Section("Care plan", "Care plans", { open("Care plans") }) {
        CareCard(padding = ThusoSpacing.space8) {
            MenuRow("Chronic Routine", "Monthly check-in · due in 9 days", Icons.Outlined.Schedule) { open("Care plans") }
        }
    }
}

@Composable private fun HomeFamily(store: PreviewStore, open: (String) -> Unit) {
    Section("Your circle of care", "My family", { open("My family") }) {
        CareCard(padding = ThusoSpacing.space8) {
            store.family.forEachIndexed { index, member ->
                /* A member somebody added in this preview has no relationship recorded, and is not
                   given one. Inventing "Your son" for a name typed a moment ago would be the app
                   asserting something about a person it was never told. */
                val relationship = when (index) {
                    0 -> "Mother · Sponsored care"
                    1 -> "Your son · 8 years"
                    else -> "Added in this preview"
                }
                /* A face for the two people the preview knows about, and the generic mark for
                   anybody typed in during it — the app has never been shown their face and does not
                   invent one, in the same way it does not invent their relationship. */
                val portrait = when (index) {
                    0 -> painterResource(R.drawable.mythuso_elder)
                    1 -> painterResource(R.drawable.mythuso_family)
                    else -> null
                }
                if (portrait != null) PersonRow(member, relationship, portrait) { open("My family") }
                else MenuRow(member, relationship, Icons.Outlined.AccountCircle) { open("My family") }
                HorizontalDivider(color = theme.border)
            }
            MenuRow("Add a family member", "", Icons.Outlined.PersonAdd) { open("My family") }
        }
        /* Booking for somebody opens their booking, never their record. What you may see of another
           person is decided in My family, under consent, and nowhere on this screen. */
        ThusoAlert("Booking for someone opens their booking, never their record.") {
            ThusoAlertText("What you may see is decided in My family.")
        }
    }
}

/* The promotion, on a card: a badge, the line and the way in. It was a peach block, and before that the
   second near-black card on the page. */
@Composable private fun PassportPromo(store: PreviewStore, open: (String) -> Unit) {
    ThusoCard(
        Modifier.semantics(mergeDescendants = true) {}, variant = ThusoCardVariant.Interactive,
        padding = ThusoCardPadding.Md, onClick = { open("Health Passport") }
    ) {
        ThusoBadge("Thuso Pass", variant = ThusoBadgeVariant.Primary)
        Text("Your health. One safe place.", style = MaterialTheme.typography.titleLarge, color = theme.foreground)
        Text("Every visit, reading and result, in a record you own and control.", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        Text("${thuso(Phrase.OPEN_PASSPORT, store.locale)} →", style = MaterialTheme.typography.labelLarge, color = theme.foreground)
    }
}
/* The nurse whose name is on the visit. The portrait is the shared illustration the three apps are
   held to by scripts/check-boundaries.mjs. */
@Composable fun NurseRow(trailing: @Composable (() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        ThusoAvatar("Sister Naledi Mokoena", size = ThusoAvatarSize.Lg, image = painterResource(R.drawable.mythuso_nurse))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Sister Naledi Mokoena", style = MaterialTheme.typography.titleSmall, color = studioTitleInk())
            Text("Registered Nurse (SANC)", style = MaterialTheme.typography.bodySmall, color = studioBodyInk())
        }
        trailing?.invoke()
    }
}
fun serviceIcon(id: String) = when (id) {
    "vitals" -> Icons.Outlined.MonitorHeart
    "wound" -> Icons.Outlined.Healing
    "mother" -> Icons.Outlined.ChildFriendly
    "blood" -> Icons.Outlined.Bloodtype
    "injection" -> Icons.Outlined.Vaccines
    "planning" -> Icons.Outlined.Spa
    "postop" -> Icons.Outlined.Shield
    "senior" -> Icons.Outlined.People
    else -> Icons.Outlined.Description
}
/* The catalogue.
 *
 * A person opens this screen having decided to book something, so the list is the subject and
 * everything above it is preamble: a two-line heading and a field to narrow the list with, and then
 * the services. The two-up grid this replaces gave each service a square with room for its name and
 * a price and nothing else — the sentence saying what the visit actually is had to be cut to two
 * lines and the price lost the word "from". A row is wider than a square and holds all three.
 *
 * On a tablet the same rows run two to a line, because a 900dp row with eight words on it is a
 * waste of the screen rather than a use of it. */
@Composable fun ServicesScreen(store: PreviewStore, preselect: CareService? = null, onPreselectUsed: () -> Unit = {}) {
    /* The query lives on the store so a search typed on the home screen is already applied here.
       It used to be captured into a local that nothing outside this screen could read. */
    var selected by remember { mutableStateOf<CareService?>(null) }
    val haptic = LocalHapticFeedback.current
    LaunchedEffect(preselect) { if (preselect != null) { selected = preselect; onPreselectUsed() } }
    val columns = if (with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() } >= 600.dp) 2 else 1
    ScreenColumn {
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            /* No eyebrow on this one. "Care, on your terms" above "Professional care at your door"
               is the same sentence twice, and on the screen somebody opens to choose a service it
               was three lines of brand voice before the first service. */
            Heading("", "Professional care at your door", "Choose a service and we’ll match you with the nearest qualified nurse.")
            DemoBadge()
        }
        val filtered = discoverCare(store.careQuery, store.careCategory)
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            ThusoTextField(
                store.careQuery, { store.careQuery = it }, placeholder = "Find a service",
                leadingIcon = Icons.Outlined.Search,
                modifier = Modifier.semantics { contentDescription = "Find a service" }
            )
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                careCategories.forEach { category ->
                    FilterChip(selected = store.careCategory == category, onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        store.careCategory = category
                    }, label = { Text(category) })
                }
            }
            Text("${filtered.size} services · Prices and durations shown before booking", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
            if (filtered.isEmpty()) {
                EmptyStateCard("No matching services", "Try a different care category or a shorter search.")
                ThusoButton("Show all services", onClick = { store.careQuery = ""; store.careCategory = "All care" }, variant = ThusoButtonVariant.Secondary)
            }
            else filtered.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    row.forEach { service -> ServiceRow(service, Modifier.weight(1f)) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); selected = service } }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        ThusoAlert("All clinical decisions require a registered clinician.") {
            ThusoAlertText("Prescription services require a valid prescription.")
        }
    }
    selected?.let { BookingDialog(it, store) { selected = null } }
}

/** One service, read as one thing: what it is, what it costs, how long it takes. */
@Composable private fun ServiceRow(service: CareService, modifier: Modifier = Modifier, choose: () -> Unit) {
    CareCard(modifier.clickable(onClick = choose)
        .semantics(mergeDescendants = true) {
            contentDescription = "${service.name}. ${service.detail} From R${service.price}, ${service.duration} minutes"
        }) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            TileIcon(serviceIcon(service.id))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(service.name, style = MaterialTheme.typography.titleMedium, color = theme.foreground)
                Text(service.detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = theme.mutedForeground, modifier = Modifier.size(20.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text("From R${service.price}", style = MaterialTheme.typography.titleSmall, color = theme.foreground)
            Text("·", style = MaterialTheme.typography.bodySmall, color = theme.border)
            Text("${service.duration} minutes", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun BookingDialog(service: CareService, store: PreviewStore, close: () -> Unit) {
    val draft = remember(service.id) { store.bookingDrafts.getOrPut(service.id) { BookingDraft() } }
    var step by draft::step
    var person by draft::person
    var address by draft::address
    var day by draft::day
    var slot by draft::slot
    var payment by draft::payment
    var kind by draft::kind
    var choice by draft::choice
    var nurseId by draft::nurseId
    var consent by remember { mutableStateOf(false) }
    var bookedHistory by remember { mutableStateOf<List<String>>(emptyList()) }
    /* What happens if the named nurse cannot take it, as the booked visit keeps it, for the confirmation. */
    var bookedFallback by remember { mutableStateOf<String?>(null) }
    val haptic = LocalHapticFeedback.current
    val days = remember { Scheduling.offeredDays() }
    val chosen = days.getOrElse(day) { days.first() }
    /* Who may be asked for, from this phone's vetting register and the booking contract's refusals, and
       the hours on the chosen day for that choice — less the ones already held with a nurse asked for by
       name. As soon as possible belongs to whoever is nearest, so naming somebody turns it into an hour. */
    val candidates = Booking.candidates(store.vetting.subjects, Booking.visitZone(address, store.careArea))
    val options = Booking.personOptions(candidates, Booking.previousNurseId(store, person))
    val nurse = Booking.chosenNurse(options, choice, nurseId)
    val choiceStands = choice == Booking.NEAREST || nurse != null
    LaunchedEffect(choice) { if (choice != Booking.NEAREST && kind == "asap" && !Booking.asapWithNamedNurse) kind = "scheduled" }
    /* What happens if the nurse asked for by name cannot take it, when Access's generated fallback asks the
       patient. Waiting for her is chosen first, because she is who they asked for. */
    var fallbackPick by remember(service.id) { mutableStateOf(BookingData.Fallback.choices.first().id) }
    val scheduled = kind == "scheduled"
    val hours = Booking.offeredSlots(service, chosen.date, nurse?.subject?.id, store.visits)
    val endTime = Scheduling.endTime(slot, service.duration)
    val labels = listOf("Who is the visit for?", "Where should we come?", BookingData.Person.heading, "Choose your time", "Choose payment", "Review your visit")
    val finished = step == 6
    ModalBottomSheet(onDismissRequest = close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = theme.surface, contentColor = theme.foreground) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 24.dp).padding(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(if (finished) "Your demo visit is booked" else labels[step], style = MaterialTheme.typography.titleLarge, color = theme.foreground, modifier = Modifier.semantics { heading() })
            if (!finished) {
                StepDots(step + 1, labels.size, labels[step])
                Column(Modifier.fillMaxWidth().background(theme.muted, RoundedCornerShape(ThusoRadius.card)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(service.name, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                    Text("R${service.price} · ${service.duration} minutes · Registered nurse", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                    if (step > 0) Text(person, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                }
            }
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (step) {
                    0 -> (listOf("Lerato Molefe") + store.family).forEach { name ->
                        CareChoice(name, if (name == "Lerato Molefe") "For yourself" else "For someone in your family", person == name) { person = name }
                    }
                    1 -> {
                        ThusoField("Visit location", hint = "Enter at least 5 characters. Your draft stays here if you close this sheet.", required = true) {
                            ThusoTextField(address, { address = it }, placeholder = "Street, suburb")
                        }
                        Note("Choose a location where the person receiving care can welcome the clinician. Coverage is checked separately; this preview does not dispatch anyone.")
                    }
                    2 -> NurseChoiceStep(options, person, choice, nurseId) { next, id -> choice = next; nurseId = id }
                    3 -> {
                        /* As soon as possible stays beside a named nurse only when Access's generated fallback can send
                           somebody else if she cannot take it. */
                        val rule = Booking.fallbackRule
                        SchedulingData.kinds.filter { choice == Booking.NEAREST || Booking.asapWithNamedNurse || it.id != "asap" }
                            .forEach { option -> CareChoice(option.name, option.detail, kind == option.id) { kind = option.id } }
                        if (choice != Booking.NEAREST && !Booking.asapWithNamedNurse) Note(BookingData.Person.asapNeedsNearest)
                        /* What happens if she cannot take it within Care's generated offer window: asked when the rule
                           asks, said when it does not. Either way the patient ends with a nurse or a sentence. */
                        if (nurse != null && rule != null) {
                            val minutes = CareData.offerExpiresAfterMinutes.toString()
                            fun say(text: String) = text.replace("{nurse}", nurse.subject.name).replace("{minutes}", minutes)
                            if (rule.asksPatient) {
                                Text(say(BookingData.Fallback.heading), style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                                Note(say(rule.sentence))
                                BookingData.Fallback.choices.forEach { option -> CareChoice(say(option.name), option.sentence, fallbackPick == option.id) { fallbackPick = option.id } }
                            } else Note(say(rule.sentence))
                        }
                        if (scheduled) {
                            VisitTimePicker(days, day, { day = it }, hours, slot, { slot = it },
                                "${Scheduling.longDate(chosen.date)} · $slot – $endTime (${service.duration} minutes)")
                            Booking.hoursNote(hours, nurse?.subject?.name)?.let { Note(it) }
                        }
                        else Note("We look for the nearest nurse who is free. Nobody is dispatched in this preview.")
                    }
                    4 -> {
                        /* The ways to pay are packages/catalog/money.json's, generated into MoneyData. No card
                           fragment is shown: a fragment of a card number on a screen is a fragment in a
                           screenshot, and the payment-result door refuses the same fragment by name. */
                        za.co.mythuso.model.Money.visitMethods.forEach { method -> CareChoice(method.name, method.detail, payment == method.name) { payment = method.name } }
                        NotConnected("payments")
                    }
                    5 -> {
                        ReviewLine("Service", service.name)
                        ReviewLine("Date", if (scheduled) Scheduling.longDate(chosen.date) else Scheduling.kind("asap").name)
                        if (scheduled) ReviewLine("Time", "$slot – $endTime")
                        ReviewLine("Location", address)
                        ReviewLine("Patient", person)
                        /* Who comes, with her badge in words, or the promise that whoever is nearest is named
                           before she sets off; the price from the catalogue and the way out from
                           cancellation.json, both before the button that books. The payment is the method's
                           name and never a card fragment, because the payment-result door refuses one. */
                        ReviewLine(BookingData.Review.nurseLabel, nurse?.let { "${it.subject.name} · ${BookingData.Person.badgeName}" } ?: BookingData.Review.nearestValue)
                        /* What happens if she cannot take it, in the words of the answer the booking is made with. */
                        Booking.fallbackRule?.takeIf { nurse != null }?.let { rule ->
                            val answer = if (rule.asksPatient) fallbackPick else rule.resolvesTo
                            BookingData.Fallback.choices.firstOrNull { it.id == answer }?.let { ReviewLine(BookingData.Fallback.reviewLabel, it.sentence) }
                        }
                        ReviewLine("Payment", payment)
                        ReviewLine(BookingData.Review.priceLabel, "R${service.price}")
                        ReviewLine(BookingData.Review.cancellingLabel, CancellationData.windowSentence)
                        Note("A registered nurse provides this service. A doctor may decide that a home visit is needed after reviewing your care; it is not booked through this selection.")
                        NotConnected("booking")
                        ThusoCheckbox(consent, { consent = it }, "I understand this is a UI preview using fictional information.")
                    }
                    else -> {
                        Note("No nurse has been dispatched. Your demo visit is now in the Visits tab.")
                        /* What happened to the money, in packages/catalog/money.json's words: cash is owed at
                           the door, and anything else would have gone to a provider this phone does not have. */
                        Note(za.co.mythuso.model.Money.afterBooking(payment))
                        NotConnected("payments")
                        /* What happens if she cannot take it, as the booked visit keeps it rather than as the review last showed it. */
                        BookingData.Fallback.choices.firstOrNull { it.id == bookedFallback }?.let { ReviewLine(BookingData.Fallback.reviewLabel, it.sentence) }
                        BookingStatus(bookedHistory, asap = !scheduled)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!finished) ThusoButton(if (step == 0) "Save & close" else "Back", onClick = { if (step == 0) close() else step -= 1 }, variant = ThusoButtonVariant.Ghost)
                ThusoButton(if (step == 5) "Confirm & book" else if (finished) "Done" else "Continue", onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    when (step) {
                        5 -> {
                            /* The whole choice, and who was asked for, travel into the visit — and what happens if she
                               cannot take it, as its own field the way the booking route carries it: the patient's pick
                               when the generated fallback asks, or the one it resolves to. */
                            val answer = Booking.fallbackRule?.takeIf { nurse != null }?.let { if (it.asksPatient) fallbackPick else it.resolvesTo }
                            val visit = BookedVisit(service, person, address.trim(), kind, if (scheduled) chosen.date else null, if (scheduled) slot else null, payment,
                                nurseId = nurse?.subject?.id, nurseName = nurse?.subject?.name, namedNurseFallback = answer)
                            store.visits.add(0, visit)
                            bookedHistory = Booking.history(visit, cancelled = false)
                            bookedFallback = visit.namedNurseFallback
                            store.bookingDrafts.remove(service.id)
                            step = 6
                        }
                        6 -> close()
                        else -> step += 1
                    }
                }, modifier = Modifier.weight(1f), enabled = when(step) { 1 -> address.trim().length >= 5; 2 -> choiceStands; 3 -> !scheduled || slot in hours; 5 -> consent; else -> true },
                trailingIcon = if (step == 5 || finished) null else Icons.AutoMirrored.Outlined.ArrowForward)
            }
            if (!finished) Text("Draft kept for this session · No payment taken", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}

@Composable private fun CareChoice(title: String, detail: String, chosen: Boolean, choose: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    /* A chosen row is the accent at 15% with the accent on its edge, and it carries the radio mark as
       well, so the fill is never the only difference. Compact corners, the control radius. */
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(Modifier.fillMaxWidth().clip(shape).background(if (chosen) theme.accent.tint(0.15f) else theme.surface)
        .border(1.dp, if (chosen) theme.accent else theme.border, shape)
        .clickable(role = Role.RadioButton) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); choose() }.semantics { selected = chosen }.padding(8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        RadioButton(chosen, null)
        Column(Modifier.weight(1f).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}
/* The one date-and-time picker in this app.
 *
 * It was inline in the booking dialog, which is where it belongs and is not where it can stay: a
 * visit can be moved as well as booked, and a second picker built for the move is a second set of
 * offered days, a second slot grid and a second footer that will one day disagree with the first
 * about which days exist. It takes what it shows rather than computing it, so the days on offer are
 * still Scheduling.offeredDays() wherever they came from.
 *
 * The footer is the caller's sentence because the two callers say different things about the same
 * choice: booking states the visit's length, moving states what the visit is moving to. */
@Composable fun VisitTimePicker(
    days: List<OfferedDay>,
    day: Int,
    onDay: (Int) -> Unit,
    slots: List<String>,
    slot: String,
    onSlot: (String) -> Unit,
    footer: String
) {
    val haptic = LocalHapticFeedback.current
    Text(SchedulingData.scheduledHeading, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        days.forEachIndexed { index, offered ->
            Column(
                Modifier.widthIn(min = 66.dp).heightIn(min = 72.dp).padding(vertical = 4.dp)
                    .background(if (day == index) theme.primary else theme.surface, RoundedCornerShape(ThusoRadius.card))
                    .border(1.dp, if (day == index) theme.primary else theme.border, RoundedCornerShape(ThusoRadius.card))
                    .clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onDay(index) }
                    .semantics { selected = day == index; contentDescription = Scheduling.longDate(offered.date) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(offered.weekday, style = MaterialTheme.typography.labelMedium, color = if (day == index) theme.primaryForeground else theme.mutedForeground)
                Text(offered.dayNumber, style = MaterialTheme.typography.titleMedium, color = if (day == index) theme.primaryForeground else theme.foreground)
                Text(offered.month, style = MaterialTheme.typography.labelMedium, color = if (day == index) theme.primaryForeground else theme.mutedForeground)
            }
        }
    }
    slots.chunked(3).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { time ->
                Box(
                    Modifier.weight(1f).heightIn(min = TouchTarget)
                        /* The time somebody has picked is the primary fill under its foreground — the
                           handoff spends the ink on selection — and it says so in its semantics too. */
                        .background(if (slot == time) theme.primary else theme.surface, RoundedCornerShape(ThusoRadius.control))
                        .border(1.dp, if (slot == time) theme.primary else theme.border, RoundedCornerShape(ThusoRadius.control))
                        .clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onSlot(time) }.semantics { selected = slot == time },
                    Alignment.Center
                ) { Text(time, style = MaterialTheme.typography.titleSmall, color = if (slot == time) theme.primaryForeground else theme.mutedForeground) }
            }
        }
    }
    Note(footer)
}

/* The list of visits.
 *
 * Three states of the same list — upcoming, past, cancelled — is what a tab row is for, so it is a
 * tab row rather than three filter chips borrowed from the search screens. The next visit is drawn
 * with weight and the ones behind it are not, because a list where every row is as loud as every
 * other is a list somebody has to read all of.
 *
 * The date block has a minimum width rather than a fixed 54dp: at the largest font scale a fixed one
 * cuts the day number in half. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun VisitsScreen(store: PreviewStore, open: (String) -> Unit) {
    val tabs = listOf("Upcoming", "Past", "Cancelled")
    var tab by remember { mutableStateOf(tabs.first()) }
    var state by remember { mutableStateOf(LoadState.READY) }
    /* Which visit somebody is cancelling, and which they are moving. Two states rather than one
       because the cancel flow can hand over to the move — packages/catalog/cancellation.json offers
       the move first, and again to anybody who says the day is the problem. */
    var cancelling by remember { mutableStateOf<BookedVisit?>(null) }
    var moving by remember { mutableStateOf<BookedVisit?>(null) }
    /* A row's date block and its time come from the same date, so the weekday shown can never
       disagree with the day it names. Every booked visit used to be given Triple("FRI","12","SEP")
       whatever day it was booked for. */
    data class Row5(val title: String, val place: String, val status: String, val tone: String,
                    val date: java.time.LocalDate?, val start: String?, val minutes: Int, val nurse: Boolean,
                    /* The visit this row is drawn from, where there is one. A row with a visit behind
                       it can be moved and cancelled; the sample rows beside it are pictures of visits
                       and are offered neither, because there is nothing there to act on. */
                    val visit: BookedVisit? = null,
                    /* Where the row goes when it is opened. A completed visit has a summary; a
                       sample beside it has nothing behind it and stays inert rather than opening a
                       screen about a visit that did not happen. */
                    val opens: String? = null,
                    /* And the record of one that was cancelled, which is what puts the reason on the
                       row. The Cancelled tab held a single sample and no way to add to it, so the
                       product displayed the outcome of an action it did not offer. */
                    val cancelled: CancelledVisit? = null) {
        val weekday get() = date?.let { Scheduling.format(it, "EEE").uppercase() } ?: "NOW"
        val dayNumber get() = date?.let { Scheduling.format(it, "d") } ?: ""
        val month get() = date?.let { Scheduling.format(it, "MMM").uppercase() } ?: ""
        val time get() = start?.let { "$it – ${Scheduling.endTime(it, minutes)}" } ?: SchedulingData.asapPending
        val reasonLine get() = cancelled?.let { "Reason given: ${it.reason.text}" }
        val spoken get() = "$title, $status. ${date?.let { Scheduling.longDate(it) } ?: ""} $time. $place" +
            (reasonLine?.let { ". $it" } ?: "")
    }
    fun sample(title: String, place: String, status: String, tone: String, offset: Long, start: String, minutes: Int) =
        Row5(title, place, status, tone, Scheduling.today().plusDays(offset), start, minutes, false)
    val rows = when (tab) {
        /* The visit the passport's last reading set was taken at, dated from that set rather than
           from a number typed here, so the row and the summary it opens cannot disagree about when
           it happened — they could not disagree before because they never met. */
        "Past" -> listOf(
            Row5(services.first { it.id == "vitals" }.name, "Home visit · Sandton · ${passportHolder.name}",
                 "Completed", "teal", Passport.dateOf(Passport.latestSet.dayOffset), "09:00",
                 services.first { it.id == "vitals" }.duration, false, opens = "Visit summary")
        )
        /* Cancelled visits are kept, with the reason given, and the sample below them is left where
           it was: a tab that empties itself the moment somebody uses it teaches nothing. */
        "Cancelled" -> store.cancelled.map { entry ->
            Row5(entry.visit.service.name, "${entry.visit.address} · ${entry.visit.person}", "Cancelled", "amber",
                 entry.visit.date, entry.visit.start, entry.visit.service.duration, false, cancelled = entry)
        } + listOf(sample("Blood tests", "Home visit · Soweto", "Cancelled", "amber", -12, "08:00", 25))
        else -> store.visits.mapIndexed { index, visit ->
            Row5(visit.service.name, "${visit.address} · ${visit.person}", visit.status,
                 if (visit.isScheduled) "teal" else "amber", visit.date, visit.start, visit.service.duration,
                 index == 0, visit = visit)
        } + listOf(
            sample("Wound care", "Home visit · Sandton", "Pending", "amber", 17, "10:00", 40),
            sample("Mother & baby", "Home visit · Rivonia", "Scheduled", "sky", 29, "14:00", 45)
        )
    }
    ScreenColumn {
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            Heading("", "Your visits", "")
            DemoBadge()
        }
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
            ThusoTabs(tabs, tab, { tab = it })
            StateBlock(state, "Your visit list", "notifications", { state = LoadState.READY }) {
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    rows.forEach { row ->
                        val body: @Composable ColumnScope.() -> Unit = {
                            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                                Column(
                                    Modifier.widthIn(min = 56.dp).background(theme.muted, RoundedCornerShape(ThusoRadius.control))
                                        .padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space8),
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
                                ) {
                                    Text(row.weekday, style = MaterialTheme.typography.labelSmall, color = theme.mutedForeground)
                                    Text(row.dayNumber, style = MaterialTheme.typography.titleLarge, color = theme.foreground)
                                    Text(row.month, style = MaterialTheme.typography.labelSmall, color = theme.mutedForeground)
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                                    StatusHeader(row.status, row.tone) {
                                        Text(row.title, style = if (row.nurse) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleSmall, color = theme.foreground)
                                    }
                                    IconLine(Icons.Outlined.Schedule, row.time)
                                    IconLine(Icons.Outlined.LocationOn, row.place)
                                    row.reasonLine?.let { IconLine(Icons.AutoMirrored.Outlined.Notes, it) }
                                }
                            }
                            if (row.nurse) {
                                HorizontalDivider(color = theme.border)
                                NurseRow()
                            }
                            /* Every visit that exists can be moved and can be cancelled — not only
                               the one at the top of the list. The booking confirmation has promised
                               both since before this file had a control for either, and a promise
                               kept on one row out of three is a promise nobody can rely on.

                               Cancelling is quieter than the rest and deliberately so: it is the
                               action a person has to be able to find and the one nothing should
                               nudge them towards. It is not hidden, because a hidden way out is how
                               somebody ends up simply not answering the door.

                               Both controls carry a description naming the visit they act on. Three
                               rows all offering "Cancel this visit" are three identical stops to a
                               screen reader with nothing to tell them apart. */
                            row.visit?.let { visit ->
                                HorizontalDivider(color = theme.border)
                                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                                    ThusoButton(
                                        "Reschedule", onClick = { moving = visit }, variant = ThusoButtonVariant.Secondary,
                                        modifier = Modifier.weight(1f).semantics { contentDescription = "Move the ${row.title} visit, ${row.time}" }
                                    )
                                    if (row.nurse) ThusoButton(
                                        "View details", onClick = { open("Upcoming visit: ${visit.reference}") },
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                                /* Only on the Upcoming tab, and only where there is a visit behind
                                   the row. What the screen shows depends on the day — the suburb and
                                   nothing else until the day itself — and that is decided by
                                   model/Arrival.kt rather than by whether this button is drawn. */
                                /* Outlined rather than a bare text button. Between two buttons above
                                   it and a red one below it, a line of charcoal text on its own read
                                   as a heading — it was found by looking at the three together. The
                                   pin says what kind of answer is behind it before the words do. */
                                if (tab == "Upcoming") ThusoButton(
                                    "Where is your nurse?", onClick = { open("Where is your nurse · ${visit.reference}") },
                                    variant = ThusoButtonVariant.Secondary, leadingIcon = Icons.Outlined.LocationOn,
                                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Where is the nurse for the ${row.title} visit, ${row.time}" }
                                )
                                /* The way out is a ghost button in the refusal ink: findable, and nudging nobody. */
                                TextButton(
                                    onClick = { cancelling = visit },
                                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                                        .semantics { contentDescription = "Cancel the ${row.title} visit, ${row.time}" },
                                    shape = ThusoButtonShape,
                                    colors = ButtonDefaults.textButtonColors(contentColor = theme.dangerInk)
                                ) { Text("Cancel this visit") }
                            }
                        }
                        /* Merged only where the card is not also holding its own buttons: a card with
                           Reschedule and View details in it is three things to a screen reader and
                           has to stay three, or the buttons disappear into the sentence. */
                        val opens = row.opens
                        if (row.nurse) LeadCard(content = body)
                        else if (row.visit != null) CareCard(content = body)
                        else if (opens != null) CareCard(
                            Modifier.clickable { open(opens) }.semantics(mergeDescendants = true) {
                                contentDescription = "${row.spoken}. Opens the visit summary."
                            }, content = body
                        )
                        else CareCard(Modifier.semantics(mergeDescendants = true) { contentDescription = row.spoken }, content = body)
                    }
                }
            }
            StatePicker("Preview how this list behaves when the network or service is unavailable", state) { state = it }
        }
        CareCard(Modifier.semantics(mergeDescendants = true) {}, padding = ThusoSpacing.space20) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    Text("Care that fits your life.", style = MaterialTheme.typography.titleLarge, color = theme.foreground)
                    Text("Easy booking. Trusted professionals.", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                    ThusoButton("Book another visit", onClick = { open("Book care") }, trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward)
                }
                Image(painterResource(R.drawable.mythuso_family), null, Modifier.height(112.dp), contentScale = ContentScale.Fit)
            }
        }
    }
    cancelling?.let { visit ->
        CancelVisitDialog(
            visit, store,
            close = { cancelling = null },
            /* The way out of the cancel flow that keeps the visit. It closes one dialog and opens
               the other on the same visit, so the move happens to the thing that was about to be
               cancelled rather than to a fresh copy of it. */
            move = { cancelling = null; moving = visit }
        )
    }
    moving?.let { visit -> RescheduleVisitDialog(visit, store) { moving = null } }
}
@Composable fun IconLine(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    val ink = studioBodyInk()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(icon, null, tint = ink, modifier = Modifier.size(14.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = ink)
    }
}
