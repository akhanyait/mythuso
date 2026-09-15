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
/* Native editorial home: care cover, dated readings, appointments and a personal journal.
   Booking callbacks still carry the selected service and search query. */
@Composable fun HomeScreen(store: PreviewStore, book: (CareService?) -> Unit, open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        HomeGreeting(store, open)
        HomeNextVisit(store, book, open)
        HomeBooking(store, book)
        HomeSnapshot(open)
        HomeCareCover(store, book)
        HomeLiveWell(open)
        HomeShortcuts(store, book)
        HomeResults(open)
        HomeCarePlan(open)
        HomeFamily(store, open)
        PassportPromo(store, open)
        /* The tagline used to close this screen in thirteen-point grey. It opens it now, at forty
           points on a lime block, so it is not repeated down here. */
        TextButton(onClick = firstRun, modifier = Modifier.heightIn(min = TouchTarget), shape = ThusoButtonShape) { Text("See the first-run and recovery flow") }
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
        /* THE HEADLINE IS THE CONTRACT'S OWN WORDS, IN ELEVEN LANGUAGES.
           The prototype's patient frame is a greeting over a short line about what the product is
           for, both set very large. The temptation was to type the second line in English and let ten
           locales show a slogan nobody had translated, on the one screen a person opens first. There
           was no need: shell.greeting and shell.tagline are both in locales.json, reviewed to the
           same standard as the rest of the shell, and "Help. Health. Home." is three words in every
           one of them. So the tagline is promoted from a centred grey caption at the very bottom of
           this screen to the second line of the headline. Nothing new was written.

           The waving hand went with it. An emoji at forty points is a picture the size of a word,
           TalkBack reads it aloud as "waving hand" after the greeting, and it was the one decorative
           object in a design that has no others. */
        /* Which three keys, from packages/catalog/framing.json rather than from here. The words are
           still the locale table's — this screen has never typed them — but which of its two hundred
           keys make up the patient's headline is a framing decision, and it sits in the one file
           that holds the other five. */
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text(thuso(FramingData.patientLead, store.locale),
                style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold,
                letterSpacing = (-1).sp, color = StudioInkDeep)
            Text(thuso(FramingData.patientDetail, store.locale),
                style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        }
        /* A FlowRow rather than a Row: at the largest font scales the two chips take a line each
           instead of squeezing the care area down to an ellipsis. */
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box {
                ContextChip(Icons.Outlined.LocationOn, store.careArea, "Care area: ${store.careArea}") { areaMenu = true }
                DropdownMenu(areaMenu, { areaMenu = false }) {
                    careAreas.forEach { area ->
                        DropdownMenuItem(
                            text = { Text(area) },
                            onClick = { store.careArea = area; areaMenu = false },
                            trailingIcon = { if (area == store.careArea) Icon(Icons.Outlined.Check, null, tint = Charcoal) }
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

@Composable private fun ContextChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, label: String, click: () -> Unit) {
    Row(
        Modifier.heightIn(min = TouchTarget).clip(CircleShape).background(Color.White.copy(alpha = 0.92f))
            .border(1.dp, StudioLine, CircleShape).clickable(onClick = click)
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(icon, null, tint = Charcoal, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = Charcoal, modifier = Modifier.weight(1f, fill = false))
        Icon(Icons.Outlined.ExpandMore, null, tint = StudioInkMuted, modifier = Modifier.size(16.dp))
    }
}

/* The one thing on this screen that is already true: a visit somebody has arranged. It is a LeadCard
   rather than a CareCard, and that is the whole of the difference between a home screen with a
   subject and a home screen with eight equal cards on it. The card is one thing to TalkBack too —
   merged, so the service, the hour and the nurse are read as a sentence rather than as six stops. */
@Composable private fun HomeNextVisit(store: PreviewStore, book: (CareService?) -> Unit, open: (String) -> Unit) {
    val visit = store.visits.firstOrNull()
    Section(thuso(Phrase.NEXT_VISIT, store.locale), if (visit == null) null else "All visits", { open("Visits") }) {
        if (visit == null) {
            /* Not a blank space and not a fixture. The sentences are the scheduling contract's, so
               all three apps say the same thing about having nothing booked. */
            LeadCard(Modifier.semantics(mergeDescendants = true) {}) {
                TileIcon(Icons.Outlined.EditCalendar, size = 44.dp)
                Text(SchedulingData.noUpcoming, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                Text(SchedulingData.noUpcomingDetail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                StudioButton(onClick = { book(null) }) { Text("Find your care") }
            }
        } else {
            /* Spelled out rather than left to be concatenated. A merged card reads its children in
               order, which on this one is seven fragments — a service, an hour, a pill, a duration,
               an address and a nurse's two lines — and the sentence below is what somebody would
               actually say about a visit. */
            val spoken = "${visit.service.name}, ${visit.status}. ${visit.shortWhenText}. " +
                (if (visit.isScheduled) "${visit.service.duration} minutes. " else "Looking for the nearest nurse. ") +
                "${visit.address}. Sister Naledi Mokoena, Registered Nurse, SANC."
            /* THE ONE NEAR-BLACK CARD ON THIS SCREEN, AND IT CARRIES THE ONE THING ALREADY TRUE.
               The prototype's phone frames spend exactly one dark card and spend it on what is live
               right now. On a returning patient's home that is the visit somebody has arranged — not
               the catalogue under it and not the promotion at the foot of it. It was a pale lead card
               among seven other cards, which is the defect the design language names first.

               The chip loses its tone word on the way. On a card that is one node to TalkBack and one
               object on the screen, a teal chip and an amber chip were two colours saying what the
               words beside them already say; the night chip says the word. */
            StudioNightCard(
                Modifier
                    .clickable { open("Upcoming visit: ${visit.reference}") }
                    .semantics(mergeDescendants = true) { contentDescription = spoken }
            ) {
                StudioNightStatusHeader(visit.status) {
                    Text(visit.service.name, style = MaterialTheme.typography.titleLarge, color = StudioNightInk)
                    Text(visit.shortWhenText, style = MaterialTheme.typography.bodyMedium, color = StudioNightInkQuiet)
                }
                /* An arrival estimate belongs to "come now" and to nothing else; a visit booked for a
                   named hour says how long it takes instead, from the catalogue. */
                if (visit.isScheduled) IconLine(Icons.Outlined.Schedule, "${visit.service.duration} minutes")
                else IconLine(Icons.Outlined.Bolt, "Looking for the nearest nurse")
                IconLine(Icons.Outlined.LocationOn, visit.address)
                /* A rule on a card this dark is drawn in the card's own ink. StudioLine is a hairline
                   for a light ground and there is nothing of it to see here. */
                HorizontalDivider(color = StudioPaper.copy(alpha = 0.18f))
                NurseRow { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = StudioNightInkQuiet) }
                Text("Have your medication list ready.", style = MaterialTheme.typography.bodySmall, color = StudioNightInkQuiet)
                Text("View visit details & preparation", style = MaterialTheme.typography.labelMedium, color = StudioLime)
            }
        }
    }
}

/* The action, and then the way round it. The search field used to sit above the button, which put a
   text box between somebody who had already decided and the button that acts on the decision. */
@Composable private fun HomeCareCover(store: PreviewStore, book: (CareService?) -> Unit) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(30.dp)).background(StudioNight)) {
        Image(painterResource(R.drawable.care_editorial), null,
            modifier = Modifier.matchParentSize(), contentScale = ContentScale.Crop)
        Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(
            StudioNight.copy(alpha = 0.96f), StudioNight.copy(alpha = 0.80f), StudioNight.copy(alpha = 0.1f)))))
        Column(Modifier.fillMaxWidth().heightIn(min = 254.dp).padding(ThusoSpacing.space24),
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
            Text("HELP. HEALTH. HOME.", style = MaterialTheme.typography.labelMedium,
                letterSpacing = 1.5.sp, color = StudioLime)
            Text("Care that\nfeels like home.", style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Medium, letterSpacing = (-1.4).sp, color = SurfaceWhite)
            Button(onClick = { book(null) }, shape = RoundedCornerShape(ThusoRadius.control),
                colors = ButtonDefaults.buttonColors(containerColor = StudioLime, contentColor = StudioInkDeep),
                modifier = Modifier.heightIn(min = TouchTarget)) {
                Text(thuso(Phrase.BOOK_NURSE, store.locale), modifier = Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(ThusoSpacing.space8))
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, modifier = Modifier.size(18.dp))
            }
            Text("Illustrative image", style = MaterialTheme.typography.bodySmall, color = SurfaceWhite)
        }
    }
}

@Composable private fun HomeBooking(store: PreviewStore, book: (CareService?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        OutlinedTextField(
            store.careQuery, { store.careQuery = it }, placeholder = { Text("What care do you need today?") },
            leadingIcon = { Icon(Icons.Outlined.Search, null, tint = StudioInkMuted) },
            singleLine = true, shape = RoundedCornerShape(ThusoRadius.pill),
            textStyle = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Search for care" },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { store.careCategory = "All care"; book(null) }),
            colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = StudioInkMuted)
        )
    }
}

/* One row per service: one symbol, the name, what it is, the price and how long it takes. The
   two-up grid this replaces had room for the name and nothing else, and wrapped it over three lines
   on a small phone. Both numbers come from the catalogue rather than being typed here. */
@Composable private fun HomeShortcuts(store: PreviewStore, book: (CareService?) -> Unit) {
    Section("Care you can book today", "See all", { book(null) }) {
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
                    /* One tint, not four. These rows used to cycle brown, mauve and slate-blue behind
                       their symbols, and a colour that means nothing is a colour that has stopped
                       meaning anything where it is meant to mean something — a reading out of range,
                       a refusal, a visit nobody has picked up. */
                    TileIcon(serviceIcon(service.id))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(service.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text(service.detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text("R${service.price}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text("${service.duration} min", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    }
                }
                if (index < 3) HorizontalDivider(color = StudioLine)
            }
        }
    }
}

// Sample values come from the same record as the Passport, including their date.
@Composable private fun HomeSnapshot(open: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Text("Your care at a glance", style = MaterialTheme.typography.titleMedium, color = StudioInk)
        Text("Sample readings · ${Passport.shortLabel(Passport.latestSet.dayOffset)}",
            style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        val stacked = LocalDensity.current.fontScale >= 1.3f
        if (stacked) {
            SnapshotCard("systolic", Modifier.fillMaxWidth(), open)
            SnapshotCard("glucose", Modifier.fillMaxWidth(), open)
        } else Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            SnapshotCard("systolic", Modifier.weight(1f), open)
            SnapshotCard("glucose", Modifier.weight(1f), open)
        }
    }
}

@Composable private fun SnapshotCard(id: String, modifier: Modifier, open: (String) -> Unit) {
    val observation = Passport.spec(id) ?: return
    val value = Passport.latestSet.values[id] ?: return
    val shape = RoundedCornerShape(ThusoRadius.panel)
    val display = if (id == "systolic") "${value.toInt()}/${Passport.latestSet.values.getValue("diastolic").toInt()}"
                  else Passport.format(observation, value)
    Column(modifier.clip(shape).background(if (id == "systolic") SurfaceWhite else StudioLime)
        .clickable(role = Role.Button) { open("Health Passport") }
        .semantics(mergeDescendants = true) {}
        .padding(ThusoSpacing.space16), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Icon(if (id == "systolic") Icons.Outlined.FavoriteBorder else Icons.Outlined.MonitorHeart,
                null, tint = StudioInk, modifier = Modifier.size(20.dp))
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = StudioInkMuted, modifier = Modifier.size(16.dp))
        }
        Text(if (id == "systolic") "Blood pressure" else observation.label,
            style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        Text(display, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-1).sp, color = StudioInkDeep)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(observation.unit, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            Row(Modifier.height(30.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Passport.seriesFor(observation).forEachIndexed { index, (_, reading) ->
                    Box(Modifier.width(7.dp).height((reading / (if (id == "systolic") 160 else 8) * 30).toFloat().dp)
                        .studioBarEntrance(index * 80, reading)
                        .background(StudioOlive.copy(alpha = 0.45f), CircleShape))
                }
            }
        }
    }
}

@Composable private fun HomeResults(open: (String) -> Unit) {
    Section("Your health over time", "Health Passport", { open("Health Passport") }) {
        Passport.spec("systolic")?.let { observation ->
            ClinicalChart("Systolic blood pressure", observation.unit, Passport.seriesFor(observation).map { (set, value) -> Reading(Passport.shortLabel(set.dayOffset), value, set.note ?: "—") }, observation.low..observation.high)
        }
        PassportData.documents.firstOrNull { it.name == "Laboratory results" }?.let { document ->
            CareCard {
                MenuRow(document.name, "${Passport.shortLabel(document.dayOffset)} · ${document.kind}", Icons.Outlined.Biotech) { open(document.opens ?: "Health Passport") }
                StatusPill(if (document.reviewed) "Doctor reviewed" else "Awaiting doctor review", if (document.reviewed) "teal" else "amber")
            }
        }
    }
}

@Composable private fun HomeLiveWell(open: (String) -> Unit) {
    val stacked = LocalDensity.current.fontScale >= 1.3f
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(30.dp)).background(StudioLilac)
        .clickable(role = Role.Button) { open("Live well") }.semantics(mergeDescendants = true) {}
        .padding(ThusoSpacing.space24), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
        Text("YOUR EVERYDAY WELLBEING", style = MaterialTheme.typography.labelMedium, letterSpacing = 1.2.sp, color = StudioInkMuted)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Make room\nfor you.", style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Medium, letterSpacing = (-1.4).sp, color = StudioInkDeep, modifier = Modifier.weight(1f))
            if (!stacked) MoonArtwork(Modifier.size(112.dp))
        }
        Text("How have you been feeling? A quiet space for your own words.", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        Row(Modifier.fillMaxWidth().background(SurfaceWhite, RoundedCornerShape(ThusoRadius.control))
            .padding(ThusoSpacing.space16), horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8),
            verticalAlignment = Alignment.CenterVertically) {
            Text("Open your journal", style = MaterialTheme.typography.labelLarge, color = StudioInk, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = StudioInk, modifier = Modifier.size(18.dp))
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
                HorizontalDivider(color = StudioLine)
            }
            MenuRow("Add a family member", "", Icons.Outlined.PersonAdd) { open("My family") }
        }
        /* Booking for somebody opens their booking, never their record. What you may see of another
           person is decided in My family, under consent, and nowhere on this screen. */
        /* Tinted rather than left on the page ground, which is the colour it was already sitting on:
           a panel the colour of the thing behind it is not a panel. */
        TonedCard {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.VerifiedUser, null, tint = Charcoal, modifier = Modifier.size(18.dp))
                Text("Booking for someone opens their booking, never their record. What you may see is decided in My family.",
                     style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            }
        }
    }
}

/* THE PROMOTION GAVE UP THE DARK CARD, BECAUSE THERE IS ONLY ONE OF THOSE.
   It was charcoal, and so is the visit at the top of this screen now — two near-black cards on one
   page, which is two subjects, which is none. One of those claims is a nurse arriving at somebody's
   house on Thursday and the other is an invitation to look at a record, and they were drawn
   identically. It takes studioPeach, one of the three tiles this palette declares, with charcoal on
   it at 12.1:1. It is still the warmest object at the foot of the screen; it has stopped competing
   with the thing that is actually happening. */
@Composable private fun PassportPromo(store: PreviewStore, open: (String) -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.card))
            .background(StudioPeach)
            .clickable { open("Health Passport") }.padding(ThusoSpacing.space20)
            .semantics(mergeDescendants = true) {}
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusPill("THUSO PASS", "light")
            Text("Your health.\nOne safe place.", style = MaterialTheme.typography.titleLarge, color = Color.White)
            Text("Every visit, reading and result, in a record you own and control.",
                  style = MaterialTheme.typography.bodySmall, color = SurfaceWhite)
            Text("${thuso(Phrase.OPEN_PASSPORT, store.locale)} →", style = MaterialTheme.typography.titleSmall, color = SurfaceWhite)
        }
    }
}
/* The nurse whose name is on the visit. The portrait is the shared illustration the three apps are
   held to by scripts/check-boundaries.mjs — it has been rendered into this bundle all along and only
   Android was not drawing it, which is why lint had it down as an unused resource. Two initials in a
   circle is what a system shows when it does not know who is coming. */
@Composable fun NurseRow(trailing: @Composable (() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Image(
            painterResource(R.drawable.mythuso_nurse), null,
            Modifier.size(44.dp).clip(CircleShape).background(AccentSoft, CircleShape),
            contentScale = ContentScale.Crop
        )
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
            OutlinedTextField(
                store.careQuery, { store.careQuery = it }, placeholder = { Text("Find a service") },
                leadingIcon = { Icon(Icons.Outlined.Search, null, tint = StudioInkMuted) },
                singleLine = true, shape = RoundedCornerShape(ThusoRadius.pill),
                textStyle = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Find a service" },
                colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = StudioInkMuted)
            )
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                careCategories.forEach { category ->
                    FilterChip(selected = store.careCategory == category, onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        store.careCategory = category
                    }, label = { Text(category) })
                }
            }
            Text("${filtered.size} services · Prices and durations shown before booking", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            if (filtered.isEmpty()) {
                EmptyStateCard("No matching services", "Try a different care category or a shorter search.")
                OutlinedButton(onClick = { store.careQuery = ""; store.careCategory = "All care" }, shape = ThusoButtonShape) { Text("Show all services") }
            }
            else filtered.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    row.forEach { service -> ServiceRow(service, Modifier.weight(1f)) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); selected = service } }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        TonedCard {
            Note("All clinical decisions require a registered clinician. Prescription services require a valid prescription.")
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
                Text(service.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(service.detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = StudioInkMuted, modifier = Modifier.size(20.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text("From R${service.price}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text("·", style = MaterialTheme.typography.bodySmall, color = StudioLine)
            Text("${service.duration} minutes", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
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
    LaunchedEffect(choice) { if (choice != Booking.NEAREST && kind == "asap") kind = "scheduled" }
    val scheduled = kind == "scheduled"
    val hours = Booking.offeredSlots(service, chosen.date, nurse?.subject?.id, store.visits)
    val endTime = Scheduling.endTime(slot, service.duration)
    val labels = listOf("Who is the visit for?", "Where should we come?", BookingData.Person.heading, "Choose your time", "Choose payment", "Review your visit")
    val finished = step == 6
    ModalBottomSheet(onDismissRequest = close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = SurfaceWhite, contentColor = Charcoal) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 24.dp).padding(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(if (finished) "Your demo visit is booked" else labels[step], style = MaterialTheme.typography.titleLarge, color = Charcoal)
            if (!finished) {
                StepDots(step + 1, labels.size, labels[step])
                Column(Modifier.fillMaxWidth().background(StudioPaper, RoundedCornerShape(16.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(service.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text("R${service.price} · ${service.duration} minutes · Registered nurse", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    if (step > 0) Text(person, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                }
            }
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (step) {
                    0 -> (listOf("Lerato Molefe") + store.family).forEach { name ->
                        CareChoice(name, if (name == "Lerato Molefe") "For yourself" else "For someone in your family", person == name) { person = name }
                    }
                    1 -> {
                        OutlinedTextField(address, { address = it }, label = { Text("Visit location") }, supportingText = { Text("Enter at least 5 characters. Your draft stays here if you close this sheet.") }, modifier = Modifier.fillMaxWidth())
                        Note("Choose a location where the person receiving care can welcome the clinician. Coverage is checked separately; this preview does not dispatch anyone.")
                    }
                    2 -> NurseChoiceStep(options, person, choice, nurseId) { next, id -> choice = next; nurseId = id }
                    3 -> {
                        /* As soon as possible belongs to whoever is nearest, so it is not offered beside a named nurse. */
                        SchedulingData.kinds.filter { choice == Booking.NEAREST || it.id != "asap" }
                            .forEach { option -> CareChoice(option.name, option.detail, kind == option.id) { kind = option.id } }
                        if (choice != Booking.NEAREST) Note(BookingData.Person.asapNeedsNearest)
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
                        ReviewLine("Payment", payment)
                        ReviewLine(BookingData.Review.priceLabel, "R${service.price}")
                        ReviewLine(BookingData.Review.cancellingLabel, CancellationData.windowSentence)
                        Note("A registered nurse provides this service. A doctor may decide that a home visit is needed after reviewing your care; it is not booked through this selection.")
                        NotConnected("booking")
                        Row(Modifier.fillMaxWidth().heightIn(min = TouchTarget).toggleable(consent, role = Role.Checkbox, onValueChange = { consent = it }), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(consent, null)
                            Text("I understand this is a UI preview using fictional information.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        }
                    }
                    else -> {
                        Note("No nurse has been dispatched. Your demo visit is now in the Visits tab.")
                        /* What happened to the money, in packages/catalog/money.json's words: cash is owed at
                           the door, and anything else would have gone to a provider this phone does not have. */
                        Note(za.co.mythuso.model.Money.afterBooking(payment))
                        NotConnected("payments")
                        BookingStatus(bookedHistory, asap = !scheduled)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!finished) TextButton(onClick = { if (step == 0) close() else step -= 1 }, shape = ThusoButtonShape) { Text(if (step == 0) "Save & close" else "Back") }
                StudioButton(onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    when (step) {
                        5 -> {
                            /* The whole choice, and who was asked for, travel into the visit. */
                            val visit = BookedVisit(service, person, address.trim(), kind, if (scheduled) chosen.date else null, if (scheduled) slot else null, payment,
                                nurseId = nurse?.subject?.id, nurseName = nurse?.subject?.name)
                            store.visits.add(0, visit)
                            bookedHistory = Booking.history(visit, cancelled = false)
                            store.bookingDrafts.remove(service.id)
                            step = 6
                        }
                        6 -> close()
                        else -> step += 1
                    }
                }, modifier = Modifier.weight(1f), enabled = when(step) { 1 -> address.trim().length >= 5; 2 -> choiceStands; 3 -> !scheduled || slot in hours; 5 -> consent; else -> true }) {
                    Text(if (step == 5) "Confirm & book" else if (finished) "Done" else "Continue")
                }
            }
            if (!finished) Text("Draft kept for this session · No payment taken", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        }
    }
}

@Composable private fun CareChoice(title: String, detail: String, chosen: Boolean, choose: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (chosen) StudioLime.copy(alpha = .35f) else StudioPaper)
        .clickable(role = Role.RadioButton) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); choose() }.semantics { selected = chosen }.padding(8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        RadioButton(chosen, null)
        Column(Modifier.weight(1f).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
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
    Text(SchedulingData.scheduledHeading, style = MaterialTheme.typography.titleSmall, color = Charcoal)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        days.forEachIndexed { index, offered ->
            Column(
                Modifier.widthIn(min = 66.dp).heightIn(min = 72.dp).padding(vertical = 4.dp)
                    .background(if (day == index) StudioNight else SurfaceWhite, RoundedCornerShape(ThusoRadius.card))
                    .border(1.dp, if (day == index) Indigo else StudioLine, RoundedCornerShape(ThusoRadius.card))
                    .clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onDay(index) }
                    .semantics { selected = day == index; contentDescription = Scheduling.longDate(offered.date) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(offered.weekday, style = MaterialTheme.typography.labelMedium, color = if (day == index) SurfaceWhite else StudioInkMuted)
                Text(offered.dayNumber, style = MaterialTheme.typography.titleMedium, color = if (day == index) StudioPaper else Charcoal)
                Text(offered.month, style = MaterialTheme.typography.labelMedium, color = if (day == index) SurfaceWhite else StudioInkMuted)
            }
        }
    }
    slots.chunked(3).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { time ->
                Box(
                    Modifier.weight(1f).heightIn(min = TouchTarget)
                        /* A time somebody has picked out of a grid of twelve is exactly the
                           one-per-screen the loud fill is for: studioLime, with charcoal on it at
                           15.3:1, and it is the only object on the screen wearing it. */
                        .background(if (slot == time) StudioLime else SurfaceWhite, RoundedCornerShape(ThusoRadius.control))
                        .border(1.dp, if (slot == time) Indigo else StudioLine, RoundedCornerShape(ThusoRadius.control))
                        .clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onSlot(time) }.semantics { selected = slot == time },
                    Alignment.Center
                ) { Text(time, style = MaterialTheme.typography.titleSmall, color = if (slot == time) Color.White else StudioInkMuted) }
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
            PrimaryTabRow(
                selectedTabIndex = tabs.indexOf(tab),
                containerColor = Color.Transparent,
                divider = { HorizontalDivider(color = StudioLine) }
            ) {
                tabs.forEach { name ->
                    Tab(
                        selected = tab == name, onClick = { tab = name },
                        text = { Text(name, style = MaterialTheme.typography.labelMedium, maxLines = 1) },
                        selectedContentColor = Charcoal, unselectedContentColor = StudioInkMuted
                    )
                }
            }
            StateBlock(state, "Your visit list", "notifications", { state = LoadState.READY }) {
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    rows.forEach { row ->
                        val body: @Composable ColumnScope.() -> Unit = {
                            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                                Column(
                                    Modifier.widthIn(min = 56.dp).background(Canvas, RoundedCornerShape(ThusoRadius.control))
                                        .padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space8),
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
                                ) {
                                    Text(row.weekday, style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
                                    Text(row.dayNumber, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                                    Text(row.month, style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                                    StatusHeader(row.status, row.tone) {
                                        Text(row.title, style = if (row.nurse) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleSmall, color = Charcoal)
                                    }
                                    IconLine(Icons.Outlined.Schedule, row.time)
                                    IconLine(Icons.Outlined.LocationOn, row.place)
                                    row.reasonLine?.let { IconLine(Icons.AutoMirrored.Outlined.Notes, it) }
                                }
                            }
                            if (row.nurse) {
                                HorizontalDivider(color = StudioLine)
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
                                HorizontalDivider(color = StudioLine)
                                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                                    OutlinedButton(
                                        onClick = { moving = visit },
                                        Modifier.weight(1f).heightIn(min = TouchTarget)
                                            .semantics { contentDescription = "Move the ${row.title} visit, ${row.time}" },
                                        shape = ThusoButtonShape
                                    ) { Text("Reschedule") }
                                    if (row.nurse) StudioButton(
                                        onClick = { open("Upcoming visit: ${visit.reference}") },
                                        Modifier.weight(1f).heightIn(min = TouchTarget),
                                        shape = ThusoButtonShape
                                    ) { Text("View details") }
                                }
                                /* Only on the Upcoming tab, and only where there is a visit behind
                                   the row. What the screen shows depends on the day — the suburb and
                                   nothing else until the day itself — and that is decided by
                                   model/Arrival.kt rather than by whether this button is drawn. */
                                /* Outlined rather than a bare text button. Between two buttons above
                                   it and a red one below it, a line of charcoal text on its own read
                                   as a heading — it was found by looking at the three together. The
                                   pin says what kind of answer is behind it before the words do. */
                                if (tab == "Upcoming") OutlinedButton(
                                    onClick = { open("Where is your nurse · ${visit.reference}") },
                                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                                        .semantics { contentDescription = "Where is the nurse for the ${row.title} visit, ${row.time}" },
                                    shape = ThusoButtonShape
                                ) {
                                    Icon(Icons.Outlined.LocationOn, null, Modifier.size(17.dp), tint = Charcoal)
                                    Spacer(Modifier.width(ThusoSpacing.space8))
                                    Text("Where is your nurse?")
                                }
                                TextButton(
                                    onClick = { cancelling = visit },
                                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                                        .semantics { contentDescription = "Cancel the ${row.title} visit, ${row.time}" },
                                    shape = ThusoButtonShape,
                                    colors = ButtonDefaults.textButtonColors(contentColor = Danger)
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
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.card))
                .background(StudioNight)
                .semantics(mergeDescendants = true) {}
        ) {
            Image(painterResource(R.drawable.mythuso_family), null, Modifier.align(Alignment.BottomEnd).height(140.dp), contentScale = ContentScale.Fit)
            Column(Modifier.padding(ThusoSpacing.space20).fillMaxWidth(0.62f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                Text("Care that fits your life.", style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text("Easy booking. Trusted professionals.", style = MaterialTheme.typography.bodySmall, color = SurfaceWhite)
                Button(
                    onClick = { open("Book care") }, shape = RoundedCornerShape(ThusoRadius.control),
                    modifier = Modifier.heightIn(min = TouchTarget),
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceWhite, contentColor = Charcoal)
                ) {
                    Text("Book another visit", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.width(ThusoSpacing.space8))
                    Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(16.dp))
                }
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
