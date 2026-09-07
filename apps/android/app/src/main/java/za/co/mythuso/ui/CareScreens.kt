package za.co.mythuso.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.R
import za.co.mythuso.model.*
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions

@Composable fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp), content = content
    )
}
private val tileTints = listOf(
    Indigo to IndigoSoft,
    Color(0xFFB5814F) to Color(0xFFFBEEE3),
    Color(0xFFA97392) to Color(0xFFF6E9F0),
    Color(0xFF5C81AB) to Color(0xFFE6EEFA)
)
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
 * than clip, which is what the tiles this replaces used to do. */
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
        TextButton(onClick = firstRun, modifier = Modifier.heightIn(min = 48.dp)) { Text("See the first-run and recovery flow") }
        Text(thuso(Phrase.TAGLINE, store.locale), fontSize = 12.sp, color = BodyText, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
    }
}

/* The care area and the person a visit is for sit at the top, together, because they change what
   everything under them means. Choosing a family member here opens the family screen, where the
   consent and record-access questions are actually answered — never their record. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun HomeGreeting(store: PreviewStore, open: (String) -> Unit) {
    var areaMenu by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${thuso(Phrase.GREETING, store.locale)} 👋", fontSize = 23.sp, fontWeight = FontWeight.Bold, color = Ink, lineHeight = 29.sp)
            Text(thuso(Phrase.GREETING_SUB, store.locale), fontSize = 13.sp, color = BodyText, lineHeight = 19.sp)
        }
        /* A FlowRow rather than a Row: at the largest font scales the two chips take a line each
           instead of squeezing the care area down to an ellipsis. */
        FlowRow(horizontalArrangement = Arrangement.spacedBy(9.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Box {
                ContextChip(Icons.Outlined.LocationOn, store.careArea, "Care area: ${store.careArea}") { areaMenu = true }
                DropdownMenu(areaMenu, { areaMenu = false }) {
                    careAreas.forEach { area ->
                        DropdownMenuItem(
                            text = { Text(area) },
                            onClick = { store.careArea = area; areaMenu = false },
                            trailingIcon = { if (area == store.careArea) Icon(Icons.Outlined.Check, null, tint = Indigo) }
                        )
                    }
                }
            }
            ContextChip(Icons.Outlined.AccountCircle, "Lerato Molefe", "Care is for Lerato Molefe. Open your circle of care") { open("My family") }
        }
    }
}

@Composable private fun ContextChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, label: String, click: () -> Unit) {
    Row(
        Modifier.heightIn(min = 48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.92f))
            .border(1.dp, Line, CircleShape).clickable(onClick = click)
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Icon(icon, null, tint = Slate, modifier = Modifier.size(17.dp))
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Slate, lineHeight = 18.sp)
        Icon(Icons.Outlined.ExpandMore, null, tint = Slate, modifier = Modifier.size(15.dp))
    }
}

@Composable private fun SectionRow(title: String, action: String, onAction: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 23.sp, modifier = Modifier.weight(1f))
        Text(
            action, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Indigo, lineHeight = 18.sp,
            modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onAction)
                .heightIn(min = 48.dp).padding(horizontal = 8.dp, vertical = 15.dp)
        )
    }
}

@Composable private fun HomeNextVisit(store: PreviewStore, book: (CareService?) -> Unit, open: (String) -> Unit) {
    SectionRow(thuso(Phrase.NEXT_VISIT, store.locale), "All visits") { open("Visits") }
    val visit = store.visits.firstOrNull()
    if (visit == null) {
        /* Not a blank space and not a fixture. The sentences are the scheduling contract's, so all
           three apps say the same thing about having nothing booked. */
        CareCard {
            TileIcon(Icons.Outlined.EditCalendar)
            Text(SchedulingData.noUpcoming, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 21.sp)
            Text(SchedulingData.noUpcomingDetail, fontSize = 13.sp, color = BodyText, lineHeight = 19.sp)
            OutlinedButton(onClick = { book(null) }, Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(thuso(Phrase.BOOK_NURSE, store.locale))
            }
        }
    } else {
        CareCard(Modifier.clickable { open("Visit: ${visit.service.name} · ${visit.shortWhenText}") }) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TileIcon(serviceIcon(visit.service.id))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(visit.service.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 20.sp)
                    Text(visit.shortWhenText, fontSize = 12.sp, color = BodyText, lineHeight = 17.sp)
                }
                StatusPill(visit.status, if (visit.isScheduled) "teal" else "amber")
            }
            /* An arrival estimate belongs to "come now" and to nothing else; a visit booked for a
               named hour says how long it takes instead, from the catalogue. */
            if (visit.isScheduled) IconLine(Icons.Outlined.Schedule, "${visit.service.duration} minutes")
            else IconLine(Icons.Outlined.Bolt, "Looking for the nearest nurse")
            IconLine(Icons.Outlined.LocationOn, visit.address)
            HorizontalDivider(color = Line)
            NurseRow { Icon(Icons.Outlined.ChevronRight, null, tint = BodyText.copy(alpha = 0.7f)) }
        }
    }
}

@Composable private fun HomeBooking(store: PreviewStore, book: (CareService?) -> Unit) {
    OutlinedTextField(
        store.careQuery, { store.careQuery = it }, placeholder = { Text("What care do you need today?") },
        leadingIcon = { Icon(Icons.Outlined.Search, null, tint = BodyText) },
        singleLine = true, shape = CircleShape,
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Search for care" },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { book(null) }),
        colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = Line)
    )
    Button(onClick = { book(null) }, Modifier.fillMaxWidth().heightIn(min = 52.dp), shape = RoundedCornerShape(12.dp)) {
        Icon(Icons.Outlined.MedicalServices, null, Modifier.size(18.dp))
        Spacer(Modifier.width(9.dp))
        Text(thuso(Phrase.BOOK_NURSE, store.locale), fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(9.dp))
        Icon(Icons.Outlined.ArrowForward, null, Modifier.size(16.dp))
    }
}

/* One row per service: one icon, the name, what it is, the price and how long it takes. The two-up
   grid this replaces had room for the name and nothing else, and wrapped it over three lines on a
   small phone. Both numbers come from the catalogue rather than being typed here. */
@Composable private fun HomeShortcuts(store: PreviewStore, book: (CareService?) -> Unit) {
    SectionRow("Care you can book today", thuso(Phrase.BOOK_NURSE, store.locale)) { book(null) }
    CareCard(padding = 14.dp) {
        services.take(4).forEachIndexed { index, service ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { book(service) }
                    .heightIn(min = 48.dp).padding(vertical = 8.dp)
                    .semantics {
                        contentDescription =
                            "${service.name}. ${service.detail} From R${service.price}, ${service.duration} minutes"
                    },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(13.dp)
            ) {
                TileIcon(serviceIcon(service.id), tileTints[index % 4].first, tileTints[index % 4].second, 40.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(service.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 20.sp)
                    Text(service.detail, fontSize = 12.sp, color = BodyText, lineHeight = 17.sp)
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("R${service.price}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate, lineHeight = 19.sp)
                    Text("${service.duration} min", fontSize = 12.sp, color = BodyText, lineHeight = 17.sp)
                }
                Icon(Icons.Outlined.ChevronRight, null, tint = BodyText.copy(alpha = 0.7f), modifier = Modifier.size(18.dp))
            }
            if (index < 3) HorizontalDivider(color = Line)
        }
    }
}

@Composable private fun HomeResults(open: (String) -> Unit) {
    SectionRow("Recent results", "Health Passport") { open("Health Passport") }
    CareCard(padding = 14.dp) {
        val results = listOf(
            Triple("Blood pressure", "118/78 mmHg", "In range" to "teal"),
            Triple("Blood glucose", "5.4 mmol/L", "In range" to "teal"),
            Triple("Full blood count", "Awaiting doctor review", "With a doctor" to "amber")
        )
        results.forEachIndexed { index, (name, value, status) ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { open("Health Passport") }
                    .heightIn(min = 48.dp).padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 19.sp)
                    Text(value, fontSize = 12.sp, color = BodyText, lineHeight = 17.sp)
                }
                Spacer(Modifier.width(10.dp))
                StatusPill(status.first, status.second)
            }
            if (index < results.size - 1) HorizontalDivider(color = Line)
        }
    }
}

@Composable private fun HomeCarePlan(open: (String) -> Unit) {
    SectionRow("Care plan", "Care plans") { open("Care plans") }
    CareCard {
        MenuRow("Chronic Routine", "Monthly check-in · due in 9 days", Icons.Outlined.Schedule) { open("Care plans") }
    }
}

@Composable private fun HomeFamily(store: PreviewStore, open: (String) -> Unit) {
    SectionRow("Your circle of care", "My family") { open("My family") }
    CareCard(padding = 14.dp) {
        store.family.forEachIndexed { index, member ->
            /* A member somebody added in this preview has no relationship recorded, and is not given
               one. Inventing "Your son" for a name typed a moment ago would be the app asserting
               something about a person it was never told. */
            val relationship = when (index) {
                0 -> "Mother · Sponsored care"
                1 -> "Your son · 8 years"
                else -> "Added in this preview"
            }
            MenuRow(member, relationship, Icons.Outlined.AccountCircle) { open("My family") }
            HorizontalDivider(color = Line)
        }
        MenuRow("Add a family member", "", Icons.Outlined.PersonAdd) { open("My family") }
    }
    /* Booking for somebody opens their booking, never their record. What you may see of another
       person is decided in My family, under consent, and nowhere on this screen. */
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(Icons.Outlined.VerifiedUser, null, tint = BodyText, modifier = Modifier.size(15.dp))
        Text("Booking for someone opens their booking, never their record. What you may see is decided in My family.",
             fontSize = 12.sp, color = BodyText, lineHeight = 17.sp)
    }
}

@Composable private fun PassportPromo(store: PreviewStore, open: (String) -> Unit) {
    Box(
        Modifier.fillMaxWidth().heightIn(min = 160.dp).clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF12564B), Indigo)))
            .clickable { open("Health Passport") }.padding(22.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            StatusPill("THUSO PASS", "light")
            Text("Your health.\nOne safe place.", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White, lineHeight = 28.sp)
            Text("Every visit, reading and result, in a record you own and control.",
                 fontSize = 13.sp, color = Color(0xFFC9E5DB), lineHeight = 19.sp)
            Text("${thuso(Phrase.OPEN_PASSPORT, store.locale)} →", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFC9E5DB))
        }
    }
}
@Composable fun NurseRow(trailing: @Composable (() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Box(Modifier.size(42.dp).background(AccentSoft, CircleShape), Alignment.Center) {
            Text("SN", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = IndigoDeep)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("Sister Naledi Mokoena", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink)
            Text("Registered Nurse (SANC)", fontSize = 11.sp, color = BodyText)
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
@Composable fun ServicesScreen(store: PreviewStore, preselect: CareService? = null, onPreselectUsed: () -> Unit = {}) {
    /* The query lives on the store so a search typed on the home screen is already applied here.
       It used to be captured into a local that nothing outside this screen could read. */
    var selected by remember { mutableStateOf<CareService?>(null) }
    LaunchedEffect(preselect) { if (preselect != null) { selected = preselect; onPreselectUsed() } }
    ScreenColumn {
        DemoBadge()
        Heading("Care, on your terms", "Professional care at your door", "Choose a service and we’ll match you with the nearest qualified nurse.")
        OutlinedTextField(
            store.careQuery, { store.careQuery = it }, placeholder = { Text("Find a service") },
            leadingIcon = { Icon(Icons.Outlined.Search, null, tint = BodyText) },
            singleLine = true, shape = CircleShape,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Find a service" },
            colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = Line)
        )
        val filtered = services.filter { it.name.contains(store.careQuery, ignoreCase = true) }
        if (filtered.isEmpty()) EmptyStateCard("No matching services", "Try another name, or browse the whole catalogue.")
        filtered.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                row.forEach { service ->
                    CareCard(Modifier.weight(1f).clickable { selected = service }, padding = 15.dp) {
                        TileIcon(serviceIcon(service.id))
                        Text(service.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 19.sp)
                        Text(service.detail, fontSize = 11.sp, color = BodyText, lineHeight = 16.sp)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text("From R${service.price}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Slate, modifier = Modifier.weight(1f))
                            Icon(Icons.Outlined.ChevronRight, null, tint = BodyText.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        Note("All clinical decisions require a registered clinician. Prescription services require a valid prescription.")
    }
    selected?.let { BookingDialog(it, store) { selected = null } }
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
        title = { Text(if (step == 4) "Your demo visit is booked" else "Your home visit", fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (step < 4) StepDots(step + 1, 4, labels[step])
                when (step) {
                    0 -> {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TileIcon(serviceIcon(service.id))
                            Column(Modifier.weight(1f)) {
                                Text(service.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                                Text("Registered nurse", fontSize = 12.sp, color = BodyText)
                            }
                            Text("R${service.price}", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Ink)
                        }
                        Text("Who is this visit for?", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Slate)
                        (listOf("Lerato Molefe") + store.family).forEach { name ->
                            Row(
                                Modifier.fillMaxWidth().clickable { person = name }.semantics { selected = person == name },
                                verticalAlignment = Alignment.CenterVertically
                            ) { RadioButton(person == name, { person = name }); Text(name, fontSize = 14.sp) }
                        }
                        OutlinedTextField(address, { address = it }, label = { Text("Visit location") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    }
                    1 -> {
                        Text(SchedulingData.chooseWhen, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        /* Two different promises, chosen rather than inferred: an arrival estimate
                           answers "when will somebody get here", which is only a question for one. */
                        SchedulingData.kinds.forEach { option ->
                            Row(
                                Modifier.fillMaxWidth().clickable { kind = option.id }.semantics { selected = kind == option.id },
                                verticalAlignment = Alignment.Top
                            ) {
                                RadioButton(kind == option.id, { kind = option.id })
                                Column(Modifier.weight(1f).padding(top = 12.dp)) {
                                    Text(option.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                                    Text(option.detail, fontSize = 12.sp, color = BodyText)
                                }
                            }
                        }
                        if (scheduled) {
                        Text(SchedulingData.scheduledHeading, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            days.forEachIndexed { index, offered ->
                                Column(
                                    Modifier.widthIn(min = 66.dp).heightIn(min = 72.dp).padding(vertical = 4.dp)
                                        .background(if (day == index) Indigo else Color.White, RoundedCornerShape(14.dp))
                                        .border(1.dp, if (day == index) Indigo else Line, RoundedCornerShape(14.dp))
                                        .clickable { day = index }
                                        .semantics { selected = day == index; contentDescription = Scheduling.longDate(offered.date) },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Text(offered.weekday, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (day == index) Color(0xFFD6ECE5) else BodyText)
                                    Text(offered.dayNumber, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = if (day == index) Color.White else Ink)
                                    Text(offered.month, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (day == index) Color(0xFFD6ECE5) else BodyText)
                                }
                            }
                        }
                        slots.chunked(3).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                row.forEach { time ->
                                    Box(
                                        Modifier.weight(1f).height(48.dp)
                                            .background(if (slot == time) Indigo else Color.White, RoundedCornerShape(12.dp))
                                            .border(1.dp, if (slot == time) Indigo else Line, RoundedCornerShape(12.dp))
                                            .clickable { slot = time }.semantics { selected = slot == time },
                                        Alignment.Center
                                    ) { Text(time, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (slot == time) Color.White else BodyText) }
                                }
                            }
                        }
                        Note("${Scheduling.longDate(chosen.date)} · $slot – $endTime (${service.duration} minutes)")
                        } else {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.Bolt, null, tint = MangoInk, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(8.dp))
                                Note("We look for the nearest nurse who is free. Nobody is dispatched in this preview.")
                            }
                        }
                    }
                    2 -> {
                        Text("How would you like to pay?", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        listOf("Card" to "Visa ending 4242", "Cash" to "Pay the nurse after the visit", "Thuso Wallet" to "Demo balance R500.00").forEach { (name, detail) ->
                            Row(
                                Modifier.fillMaxWidth().clickable { payment = name }.semantics { selected = payment == name },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(payment == name, { payment = name })
                                Column(Modifier.weight(1f)) {
                                    Text(name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                                    Text(detail, fontSize = 12.sp, color = BodyText)
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
                        NurseRow { Text("★ 4.9", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = BodyText) }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(consent, { consent = it })
                            Text("I understand this is a UI preview using fictional information.", fontSize = 13.sp, color = BodyText)
                        }
                        Note("You can cancel or reschedule up to 2 hours before the visit.")
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
            ) { Text(if (step == 3) "Confirm & book" else if (step == 4) "Done" else "Continue") }
        },
        dismissButton = { if (step < 4) TextButton(onClick = { if (step == 0) close() else step -= 1 }) { Text(if (step == 0) "Cancel" else "Back") } }
    )
}
@Composable fun VisitsScreen(store: PreviewStore, open: (String) -> Unit) {
    var tab by remember { mutableStateOf("Upcoming") }
    var state by remember { mutableStateOf(LoadState.READY) }
    /* A row's date block and its time come from the same date, so the weekday shown can never
       disagree with the day it names. Every booked visit used to be given Triple("FRI","12","SEP")
       whatever day it was booked for. */
    data class Row5(val title: String, val place: String, val status: String, val tone: String,
                    val date: java.time.LocalDate?, val start: String?, val minutes: Int, val nurse: Boolean) {
        val weekday get() = date?.let { Scheduling.format(it, "EEE").uppercase() } ?: "NOW"
        val dayNumber get() = date?.let { Scheduling.format(it, "d") } ?: ""
        val month get() = date?.let { Scheduling.format(it, "MMM").uppercase() } ?: ""
        val time get() = start?.let { "$it – ${Scheduling.endTime(it, minutes)}" } ?: SchedulingData.asapPending
    }
    fun sample(title: String, place: String, status: String, tone: String, offset: Long, start: String, minutes: Int) =
        Row5(title, place, status, tone, Scheduling.today().plusDays(offset), start, minutes, false)
    val rows = when (tab) {
        "Past" -> listOf(sample("Wound care", "Home visit · Sandton", "Completed", "teal", -3, "10:00", 40))
        "Cancelled" -> listOf(sample("Blood tests", "Home visit · Soweto", "Cancelled", "amber", -12, "08:00", 25))
        else -> store.visits.mapIndexed { index, visit ->
            Row5(visit.service.name, "${visit.address} · ${visit.person}", visit.status,
                 if (visit.isScheduled) "teal" else "amber", visit.date, visit.start, visit.service.duration, index == 0)
        } + listOf(
            sample("Wound care", "Home visit · Sandton", "Pending", "amber", 17, "10:00", 40),
            sample("Mother & baby", "Home visit · Rivonia", "Scheduled", "sky", 29, "14:00", 45)
        )
    }
    ScreenColumn {
        Heading("", "Your visits", "")
        FlowRowChips(listOf("Upcoming", "Past", "Cancelled"), setOf(tab)) { tab = it }
        StatePicker("Preview how this list behaves when the network or service is unavailable", state) { state = it }
        StateBlock(state, "Your visit list", "notifications", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                rows.forEach { row ->
                    CareCard {
                        Row(horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                            Column(
                                Modifier.width(54.dp).background(Canvas, RoundedCornerShape(14.dp))
                                    .border(1.dp, Line, RoundedCornerShape(14.dp)).padding(vertical = 9.dp),
                                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
                            ) {
                                Text(row.weekday, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = BodyText, lineHeight = 11.sp)
                                Text(row.dayNumber, fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Ink, lineHeight = 23.sp)
                                Text(row.month, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = BodyText, lineHeight = 11.sp)
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                Row(verticalAlignment = Alignment.Top) {
                                    Text(row.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                                    StatusPill(row.status, row.tone)
                                }
                                IconLine(Icons.Outlined.Schedule, row.time)
                                IconLine(Icons.Outlined.LocationOn, row.place)
                            }
                        }
                        if (row.nurse) {
                            HorizontalDivider(color = Line)
                            NurseRow()
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedButton(onClick = { open("Reschedule visit") }, Modifier.weight(1f)) { Text("Reschedule") }
                                Button(onClick = { open("Visit: ${row.title} · ${row.time}") }, Modifier.weight(1f)) { Text("View details") }
                            }
                        }
                    }
                }
            }
        }
        Box(
            Modifier.fillMaxWidth().heightIn(min = 190.dp).clip(RoundedCornerShape(18.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF12564B), Indigo)))
        ) {
            Image(painterResource(R.drawable.mythuso_family), null, Modifier.align(Alignment.BottomEnd).height(150.dp), contentScale = ContentScale.Fit)
            Column(Modifier.padding(20.dp).fillMaxWidth(0.66f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Text("Care that fits\nyour life.", fontSize = 23.sp, fontWeight = FontWeight.Bold, color = Color.White, lineHeight = 28.sp)
                Text("Easy booking. Trusted professionals.", fontSize = 13.sp, color = Color(0xFFC9E5DB), lineHeight = 18.sp)
                Button(onClick = { open("Book care") }, shape = CircleShape, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = IndigoDeep)) {
                    Text("Book another visit"); Spacer(Modifier.width(9.dp)); Icon(Icons.Outlined.ArrowForward, null, Modifier.size(16.dp))
                }
            }
        }
    }
}
@Composable fun IconLine(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, null, tint = BodyText, modifier = Modifier.size(14.dp))
        Text(text, fontSize = 12.sp, color = BodyText)
    }
}
