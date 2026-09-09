package za.co.mythuso.ui

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
/* The returning patient's home.
 *
 * It used to open with a 470dp green field behind a carousel that rotated on its own, then a search
 * box, then a two-up grid of service tiles whose names wrapped to three lines on a narrow phone —
 * and the services began below the fold. A person who had already decided to book saw a promotion
 * first and the thing they came for last.
 *
 * The order below is what a returning patient needs, in the order they need it: who they are and
 * where, what is already arranged, how to arrange the next thing, and then results, plans and
 * family. The shortcuts are rows rather than tiles because a row has somewhere to put the price and
 * the length of the visit without squeezing the name. One promotional card is still here, once,
 * near the bottom, where it is an offer rather than an obstacle; the rotating one moved to the
 * roadmap, which is the screen rotating promotion is actually for.
 *
 * `book` takes the service the person tapped. Every shortcut used to call the same argumentless
 * callback, so all four opened the same generic booking — and the search field captured a query
 * that nothing ever read.
 *
 * Nothing here puts a fixed height around text. At the largest font scales the rows wrap rather
 * than clip, which is what the tiles this replaces used to do.
 *
 * What is new below is weight. The order was already right and every card was still drawn the same
 * as every other, so the screen had eight equal things on it and no subject. The visit that is
 * already arranged is now the one lifted card on the page, the action that arranges the next one is
 * the one filled button, and everything under them is a quiet list under a heading. */
@Composable fun HomeScreen(store: PreviewStore, book: (CareService?) -> Unit, open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        HomeGreeting(store, open)
        HomeNextVisit(store, book, open)
        HomeBooking(store, book)
        HomeShortcuts(store, book)
        HomeResults(open)
        HomeCarePlan(open)
        HomeFamily(store, open)
        PassportPromo(store, open)
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            TextButton(onClick = firstRun, modifier = Modifier.heightIn(min = TouchTarget), shape = ThusoButtonShape) { Text("See the first-run and recovery flow") }
            Text(thuso(Phrase.TAGLINE, store.locale), style = MaterialTheme.typography.bodySmall, color = Faint, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        }
    }
}

/* The care area and the person a visit is for sit at the top, together, because they change what
   everything under them means. Choosing a family member here opens the family screen, where the
   consent and record-access questions are actually answered — never their record. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun HomeGreeting(store: PreviewStore, open: (String) -> Unit) {
    var areaMenu by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${thuso(Phrase.GREETING, store.locale)} 👋", style = MaterialTheme.typography.headlineSmall, color = Charcoal,
                 modifier = Modifier.semantics { heading() })
            Text(thuso(Phrase.GREETING_SUB, store.locale), style = MaterialTheme.typography.bodyMedium, color = BodyText)
        }
        DemoBadge()
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
            .border(1.dp, Stone, CircleShape).clickable(onClick = click)
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(icon, null, tint = Charcoal, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = Charcoal, modifier = Modifier.weight(1f, fill = false))
        Icon(Icons.Outlined.ExpandMore, null, tint = Faint, modifier = Modifier.size(16.dp))
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
                Text(SchedulingData.noUpcomingDetail, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            }
        } else {
            /* Spelled out rather than left to be concatenated. A merged card reads its children in
               order, which on this one is seven fragments — a service, an hour, a pill, a duration,
               an address and a nurse's two lines — and the sentence below is what somebody would
               actually say about a visit. */
            val spoken = "${visit.service.name}, ${visit.status}. ${visit.shortWhenText}. " +
                (if (visit.isScheduled) "${visit.service.duration} minutes. " else "Looking for the nearest nurse. ") +
                "${visit.address}. Sister Naledi Mokoena, Registered Nurse, SANC."
            LeadCard(
                Modifier
                    .clickable { open("Visit: ${visit.service.name} · ${visit.shortWhenText}") }
                    .semantics(mergeDescendants = true) { contentDescription = spoken }
            ) {
                StatusHeader(visit.status, if (visit.isScheduled) "teal" else "amber") {
                    Text(visit.service.name, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                    Text(visit.shortWhenText, style = MaterialTheme.typography.bodyMedium, color = BodyText)
                }
                /* An arrival estimate belongs to "come now" and to nothing else; a visit booked for a
                   named hour says how long it takes instead, from the catalogue. */
                if (visit.isScheduled) IconLine(Icons.Outlined.Schedule, "${visit.service.duration} minutes")
                else IconLine(Icons.Outlined.Bolt, "Looking for the nearest nurse")
                IconLine(Icons.Outlined.LocationOn, visit.address)
                HorizontalDivider(color = Stone)
                NurseRow { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Faint) }
            }
        }
    }
}

/* The action, and then the way round it. The search field used to sit above the button, which put a
   text box between somebody who had already decided and the button that acts on the decision. */
@Composable private fun HomeBooking(store: PreviewStore, book: (CareService?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        PrimaryAction(thuso(Phrase.BOOK_NURSE, store.locale), icon = Icons.Outlined.MedicalServices) { book(null) }
        OutlinedTextField(
            store.careQuery, { store.careQuery = it }, placeholder = { Text("What care do you need today?") },
            leadingIcon = { Icon(Icons.Outlined.Search, null, tint = Faint) },
            singleLine = true, shape = RoundedCornerShape(ThusoRadius.pill),
            textStyle = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Search for care" },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { book(null) }),
            colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = Faint)
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
                        Text(service.detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text("R${service.price}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text("${service.duration} min", style = MaterialTheme.typography.bodySmall, color = Faint)
                    }
                }
                if (index < 3) HorizontalDivider(color = Stone)
            }
        }
    }
}

@Composable private fun HomeResults(open: (String) -> Unit) {
    Section("Recent results", "Health Passport", { open("Health Passport") }) {
        CareCard(padding = ThusoSpacing.space8) {
            val results = listOf(
                Triple("Blood pressure", "118/78 mmHg", "In range" to "teal"),
                Triple("Blood glucose", "5.4 mmol/L", "In range" to "teal"),
                Triple("Full blood count", "Awaiting doctor review", "With a doctor" to "amber")
            )
            results.forEachIndexed { index, (name, value, status) ->
                StatusHeader(
                    status.first, status.second,
                    Modifier.clip(RoundedCornerShape(ThusoRadius.control)).clickable { open("Health Passport") }
                        .heightIn(min = TouchTarget).padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space8)
                        .semantics(mergeDescendants = true) {}
                ) {
                    Text(name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text(value, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
                if (index < results.size - 1) HorizontalDivider(color = Stone)
            }
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
                HorizontalDivider(color = Stone)
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
                     style = MaterialTheme.typography.bodySmall, color = BodyText)
            }
        }
    }
}

@Composable private fun PassportPromo(store: PreviewStore, open: (String) -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.card))
            .background(Charcoal)
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
            Text("Sister Naledi Mokoena", style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text("Registered Nurse (SANC)", style = MaterialTheme.typography.bodySmall, color = BodyText)
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
        val filtered = services.filter { it.name.contains(store.careQuery, ignoreCase = true) }
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            OutlinedTextField(
                store.careQuery, { store.careQuery = it }, placeholder = { Text("Find a service") },
                leadingIcon = { Icon(Icons.Outlined.Search, null, tint = Faint) },
                singleLine = true, shape = RoundedCornerShape(ThusoRadius.pill),
                textStyle = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Find a service" },
                colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = Faint)
            )
            if (filtered.isEmpty()) EmptyStateCard("No matching services", "Try another name, or browse the whole catalogue.")
            else filtered.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    row.forEach { service -> ServiceRow(service, Modifier.weight(1f)) { selected = service } }
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
                Text(service.detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Faint, modifier = Modifier.size(20.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text("From R${service.price}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text("·", style = MaterialTheme.typography.bodySmall, color = Stone)
            Text("${service.duration} minutes", style = MaterialTheme.typography.bodySmall, color = Faint)
        }
    }
}
@Composable fun BookingDialog(service: CareService, store: PreviewStore, close: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    var person by remember { mutableStateOf("Lerato Molefe") }
    var address by remember { mutableStateOf("Home visit · Sandton") }
    var day by remember { mutableIntStateOf(0) }
    var slot by remember { mutableStateOf("09:00") }
    var payment by remember { mutableStateOf("Card") }
    var consent by remember { mutableStateOf(false) }
    var kind by remember { mutableStateOf("scheduled") }
    /* Computed once per booking rather than typed. The strip used to be five hand-written triples
       beginning Triple("FRI", "12", "SEP") — a weekday that had not matched its date in months. */
    val days = remember { Scheduling.offeredDays() }
    val slots = SchedulingData.slots
    val labels = listOf("Who & where", "When", "Payment", "Review")
    val scheduled = kind == "scheduled"
    val chosen = days.getOrElse(day) { days.first() }
    val endTime = Scheduling.endTime(slot, service.duration)
    AlertDialog(
        onDismissRequest = close,
        /* White, like every other surface in the app. Material derives a dialog's ground from the
           primary colour, which under Deep Indigo comes out a pale lavender — a colour that appears
           nowhere else in this design and reads as a different product the moment it opens. */
        containerColor = Color.White,
        shape = RoundedCornerShape(ThusoRadius.card),
        title = { Text(if (step == 4) "Your demo visit is booked" else "Your home visit", style = MaterialTheme.typography.titleLarge, color = Charcoal) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (step < 4) StepDots(step + 1, 4, labels[step])
                when (step) {
                    0 -> {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TileIcon(serviceIcon(service.id))
                            Column(Modifier.weight(1f)) {
                                Text(service.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                Text("Registered nurse", style = MaterialTheme.typography.bodySmall, color = BodyText)
                            }
                            Text("R${service.price}", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                        }
                        Text("Who is this visit for?", style = MaterialTheme.typography.labelMedium, color = Charcoal)
                        (listOf("Lerato Molefe") + store.family).forEach { name ->
                            Row(
                                Modifier.fillMaxWidth().clickable { person = name }.semantics { selected = person == name },
                                verticalAlignment = Alignment.CenterVertically
                            ) { RadioButton(person == name, { person = name }); Text(name, style = MaterialTheme.typography.bodyMedium) }
                        }
                        OutlinedTextField(address, { address = it }, label = { Text("Visit location") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    }
                    1 -> {
                        Text(SchedulingData.chooseWhen, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        /* Two different promises, chosen rather than inferred: an arrival estimate
                           answers "when will somebody get here", which is only a question for one. */
                        SchedulingData.kinds.forEach { option ->
                            Row(
                                Modifier.fillMaxWidth().clickable { kind = option.id }.semantics { selected = kind == option.id },
                                verticalAlignment = Alignment.Top
                            ) {
                                RadioButton(kind == option.id, { kind = option.id })
                                Column(Modifier.weight(1f).padding(top = 12.dp)) {
                                    Text(option.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                    Text(option.detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
                                }
                            }
                        }
                        if (scheduled) {
                            VisitTimePicker(
                                days, day, { day = it }, slots, slot, { slot = it },
                                "${Scheduling.longDate(chosen.date)} · $slot – $endTime (${service.duration} minutes)"
                            )
                        } else {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.Bolt, null, tint = MangoInk, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(8.dp))
                                Note("We look for the nearest nurse who is free. Nobody is dispatched in this preview.")
                            }
                        }
                    }
                    2 -> {
                        Text("How would you like to pay?", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        listOf("Card" to "Visa ending 4242", "Cash" to "Pay the nurse after the visit", "Thuso Wallet" to "Demo balance R500.00").forEach { (name, detail) ->
                            Row(
                                Modifier.fillMaxWidth().clickable { payment = name }.semantics { selected = payment == name },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(payment == name, { payment = name })
                                Column(Modifier.weight(1f)) {
                                    Text(name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                    Text(detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
                                }
                            }
                        }
                        Note("No card is stored and no payment is taken. Production payments run through a regulated provider.")
                    }
                    3 -> {
                        ReviewLine("Service", service.name)
                        ReviewLine("Date", if (scheduled) Scheduling.longDate(chosen.date) else Scheduling.kind("asap").name)
                        if (scheduled) ReviewLine("Time", "$slot – $endTime")
                        ReviewLine("Location", address)
                        ReviewLine("Patient", person)
                        ReviewLine("Payment", if (payment == "Card") "•••• 4242" else payment)
                        NurseRow { Text("★ 4.9", style = MaterialTheme.typography.labelMedium, color = BodyText) }
                        /* The row is the control and the sentence is its name. This was a bare
                           `Checkbox` beside a separate `Text`, which TalkBack reads as "not
                           checked, checkbox" with nothing to say what would be agreed to — and the
                           thing being agreed to here is that none of this is real. The shape is
                           `Setting` in Components.kt: the row owns the toggle semantics, the box is
                           drawn rather than clicked, and the whole sentence is the tap target. */
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                                .toggleable(value = consent, onValueChange = { consent = it }, role = Role.Checkbox),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(consent, null)
                            Spacer(Modifier.width(ThusoSpacing.space8))
                            Text("I understand this is a UI preview using fictional information.",
                                 style = MaterialTheme.typography.bodySmall, color = BodyText,
                                 modifier = Modifier.weight(1f))
                        }
                        /* The window, from packages/catalog/cancellation.json rather than typed
                           here. This sentence was a hand-written string in this file and another in
                           Swift, promising a right the app then offered no way to exercise — the two
                           hours had no contract behind them, so nothing could notice when they
                           disagreed. */
                        Note(CancellationData.windowSentence)
                    }
                    else -> Note("No nurse has been dispatched and no payment was taken. Your demo visit is now in the Visits tab.")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    when (step) {
                        /* The whole choice, not a time with the day dropped off it. */
                        3 -> { store.visits.add(0, BookedVisit(service, person, address, kind,
                                   if (scheduled) chosen.date else null, if (scheduled) slot else null, payment)); step = 4 }
                        4 -> close()
                        else -> step += 1
                    }
                },
                enabled = when (step) { 0 -> address.trim().length >= 5; 3 -> consent; else -> true }
            , shape = ThusoButtonShape) { Text(if (step == 3) "Confirm & book" else if (step == 4) "Done" else "Continue") }
        },
        dismissButton = { if (step < 4) TextButton(onClick = { if (step == 0) close() else step -= 1 }, shape = ThusoButtonShape) { Text(if (step == 0) "Cancel" else "Back") } }
    )
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
    Text(SchedulingData.scheduledHeading, style = MaterialTheme.typography.titleSmall, color = Charcoal)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        days.forEachIndexed { index, offered ->
            Column(
                Modifier.widthIn(min = 66.dp).heightIn(min = 72.dp).padding(vertical = 4.dp)
                    .background(if (day == index) Charcoal else SurfaceWhite, RoundedCornerShape(ThusoRadius.card))
                    .border(1.dp, if (day == index) Indigo else Stone, RoundedCornerShape(ThusoRadius.card))
                    .clickable { onDay(index) }
                    .semantics { selected = day == index; contentDescription = Scheduling.longDate(offered.date) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(offered.weekday, style = MaterialTheme.typography.labelMedium, color = if (day == index) SurfaceWhite else Faint)
                Text(offered.dayNumber, style = MaterialTheme.typography.titleMedium, color = if (day == index) SurfaceWhite else Charcoal)
                Text(offered.month, style = MaterialTheme.typography.labelMedium, color = if (day == index) SurfaceWhite else Faint)
            }
        }
    }
    slots.chunked(3).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { time ->
                Box(
                    Modifier.weight(1f).heightIn(min = TouchTarget)
                        .background(if (slot == time) Charcoal else SurfaceWhite, RoundedCornerShape(ThusoRadius.control))
                        .border(1.dp, if (slot == time) Indigo else Stone, RoundedCornerShape(ThusoRadius.control))
                        .clickable { onSlot(time) }.semantics { selected = slot == time },
                    Alignment.Center
                ) { Text(time, style = MaterialTheme.typography.titleSmall, color = if (slot == time) Color.White else BodyText) }
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
                divider = { HorizontalDivider(color = Stone) }
            ) {
                tabs.forEach { name ->
                    Tab(
                        selected = tab == name, onClick = { tab = name },
                        text = { Text(name, style = MaterialTheme.typography.labelMedium, maxLines = 1) },
                        selectedContentColor = Charcoal, unselectedContentColor = Faint
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
                                    Text(row.weekday, style = MaterialTheme.typography.labelSmall, color = Faint)
                                    Text(row.dayNumber, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                                    Text(row.month, style = MaterialTheme.typography.labelSmall, color = Faint)
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
                                HorizontalDivider(color = Stone)
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
                                HorizontalDivider(color = Stone)
                                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                                    OutlinedButton(
                                        onClick = { moving = visit },
                                        Modifier.weight(1f).heightIn(min = TouchTarget)
                                            .semantics { contentDescription = "Move the ${row.title} visit, ${row.time}" },
                                        shape = ThusoButtonShape
                                    ) { Text("Reschedule") }
                                    if (row.nurse) Button(
                                        onClick = { open("Visit: ${row.title} · ${row.time}") },
                                        Modifier.weight(1f).heightIn(min = TouchTarget),
                                        shape = ThusoButtonShape
                                    ) { Text("View details") }
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
                .background(Charcoal)
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
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(icon, null, tint = BodyText, modifier = Modifier.size(14.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = BodyText)
    }
}
