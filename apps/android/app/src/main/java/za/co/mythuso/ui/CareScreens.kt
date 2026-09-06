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

@Composable fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp), content = content
    )
}
private val tileTints = listOf(
    Teal to TealSoft,
    Color(0xFFB5814F) to Color(0xFFFBEEE3),
    Color(0xFFA97392) to Color(0xFFF6E9F0),
    Color(0xFF5C81AB) to Color(0xFFE6EEFA)
)
@Composable fun HomeScreen(store: PreviewStore, book: () -> Unit, open: (String) -> Unit, firstRun: () -> Unit) {
    var query by remember { mutableStateOf("") }
    ScreenColumn {
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("${thuso(Phrase.GREETING, store.locale)}\u00A0👋", fontSize = 25.sp, fontWeight = FontWeight.Bold, color = Ink)
            Text(thuso(Phrase.GREETING_SUB, store.locale), fontSize = 13.sp, color = BodyText)
        }
        HeroCarousel(store) { position -> if (position == 1) open("Passport") else book() }
        OutlinedTextField(
            query, { query = it }, placeholder = { Text("What care do you need today?") },
            leadingIcon = { Icon(Icons.Outlined.Search, null, tint = BodyText) },
            singleLine = true, shape = CircleShape, modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = Line)
        )
        services.take(4).chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                row.forEachIndexed { column, service ->
                    val index = services.indexOf(service)
                    CareCard(Modifier.weight(1f).clickable(onClick = book), padding = 15.dp) {
                        TileIcon(serviceIcon(service.id), tileTints[index % 4].first, tileTints[index % 4].second)
                        Text(service.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 19.sp)
                    }
                    if (row.size == 1 && column == 0) Spacer(Modifier.weight(1f))
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(thuso(Phrase.NEXT_VISIT, store.locale), fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
            Text("All visits", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Teal, modifier = Modifier.clickable { open("Visits") })
        }
        store.visits.firstOrNull()?.let { visit ->
            CareCard(Modifier.clickable { open("Visit: ${visit.service.name} · ${visit.time}") }) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TileIcon(serviceIcon(visit.service.id))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(visit.service.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        Text(visit.time, fontSize = 12.sp, color = BodyText)
                    }
                    StatusPill("Confirmed")
                }
                HorizontalDivider(color = Line)
                NurseRow()
            }
        }
        Box(
            Modifier.fillMaxWidth().heightIn(min = 160.dp).clip(RoundedCornerShape(18.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF12564B), Teal)))
                .clickable { open("Health Passport") }.padding(22.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                StatusPill("THUSO PASS", "light")
                Text("Your health.\nOne safe place.", fontSize = 23.sp, fontWeight = FontWeight.Bold, color = Color.White, lineHeight = 28.sp)
                Text("${thuso(Phrase.OPEN_PASSPORT, store.locale)} →", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFC9E5DB))
            }
        }
        CareCard { MenuRow("Your circle of care", "Looking after your favourite people", Icons.Outlined.People) { open("My family") } }
        TextButton(onClick = firstRun) { Text("See the first-run and recovery flow") }
        Text(thuso(Phrase.TAGLINE, store.locale), fontSize = 12.sp, color = BodyText, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
    }
}
@Composable fun NurseRow(trailing: @Composable (() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Box(Modifier.size(42.dp).background(Mint, CircleShape), Alignment.Center) {
            Text("SN", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TealDeep)
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
@Composable fun ServicesScreen(store: PreviewStore) {
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<CareService?>(null) }
    ScreenColumn {
        DemoBadge()
        Heading("Care, on your terms", "Professional care at your door", "Choose a service and we’ll match you with the nearest qualified nurse.")
        OutlinedTextField(
            query, { query = it }, placeholder = { Text("Find a service") },
            leadingIcon = { Icon(Icons.Outlined.Search, null, tint = BodyText) },
            singleLine = true, shape = CircleShape, modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White, focusedContainerColor = Color.White, unfocusedBorderColor = Line)
        )
        val filtered = services.filter { it.name.contains(query, ignoreCase = true) }
        if (filtered.isEmpty()) EmptyStateCard("No matching services", "Try another name, or browse the whole catalogue.")
        filtered.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                row.forEach { service ->
                    CareCard(Modifier.weight(1f).clickable { selected = service }, padding = 15.dp) {
                        TileIcon(serviceIcon(service.id))
                        Text(service.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink, lineHeight = 19.sp)
                        Text(service.detail, fontSize = 11.sp, color = BodyText, lineHeight = 16.sp)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text("From R${service.price}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Forest, modifier = Modifier.weight(1f))
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
    val days = listOf(Triple("FRI", "12", "SEP"), Triple("SAT", "13", "SEP"), Triple("SUN", "14", "SEP"), Triple("MON", "15", "SEP"), Triple("TUE", "16", "SEP"))
    val slots = listOf("08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00")
    val labels = listOf("Who & where", "Date & time", "Payment", "Review")
    val endTime = "%02d:00".format((slot.take(2).toIntOrNull() ?: 9) + 1)
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
                        Text("Who is this visit for?", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Forest)
                        (listOf("Lerato Molefe") + store.family).forEach { name ->
                            Row(
                                Modifier.fillMaxWidth().clickable { person = name }.semantics { selected = person == name },
                                verticalAlignment = Alignment.CenterVertically
                            ) { RadioButton(person == name, { person = name }); Text(name, fontSize = 14.sp) }
                        }
                        OutlinedTextField(address, { address = it }, label = { Text("Visit location") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    }
                    1 -> {
                        Text("Choose a date and time", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            days.forEachIndexed { index, date ->
                                Column(
                                    Modifier.width(66.dp).height(72.dp)
                                        .background(if (day == index) Teal else Color.White, RoundedCornerShape(14.dp))
                                        .border(1.dp, if (day == index) Teal else Line, RoundedCornerShape(14.dp))
                                        .clickable { day = index }.semantics { selected = day == index },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Text(date.first, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (day == index) Color(0xFFD6ECE5) else BodyText)
                                    Text(date.second, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = if (day == index) Color.White else Ink)
                                    Text(date.third, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (day == index) Color(0xFFD6ECE5) else BodyText)
                                }
                            }
                        }
                        slots.chunked(3).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                row.forEach { time ->
                                    Box(
                                        Modifier.weight(1f).height(48.dp)
                                            .background(if (slot == time) Teal else Color.White, RoundedCornerShape(12.dp))
                                            .border(1.dp, if (slot == time) Teal else Line, RoundedCornerShape(12.dp))
                                            .clickable { slot = time }.semantics { selected = slot == time },
                                        Alignment.Center
                                    ) { Text(time, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (slot == time) Color.White else BodyText) }
                                }
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Bolt, null, tint = Color(0xFFE0A93F), modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Note("Average arrival time: within 60 minutes")
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
                        ReviewLine("Date", "${days[day].first} ${days[day].second} ${days[day].third} 2026")
                        ReviewLine("Time", "$slot – $endTime")
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
                        3 -> { store.visits.add(0, DemoVisit(service, person, "$slot – $endTime")); step = 4 }
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
    data class Row5(val title: String, val time: String, val place: String, val status: String, val tone: String, val date: Triple<String, String, String>, val nurse: Boolean)
    val rows = when (tab) {
        "Past" -> listOf(Row5("Wound care", "10:00 – 10:40", "Home visit · Sandton", "Completed", "teal", Triple("THU", "4", "SEP"), false))
        "Cancelled" -> listOf(Row5("Blood tests", "08:00 – 08:30", "Home visit · Soweto", "Cancelled", "amber", Triple("TUE", "26", "AUG"), false))
        else -> store.visits.mapIndexed { index, visit ->
            Row5(visit.service.name, visit.time, "Home visit · Sandton · ${visit.person}", "Confirmed", "teal", Triple("FRI", "12", "SEP"), index == 0)
        } + listOf(
            Row5("Wound care", "10:00 – 11:00", "Home visit · Sandton", "Pending", "amber", Triple("WED", "24", "SEP"), false),
            Row5("Mother & baby", "14:00 – 15:00", "Home visit · Rivonia", "Scheduled", "sky", Triple("MON", "6", "OCT"), false)
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
                                Text(row.date.first, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = BodyText, lineHeight = 11.sp)
                                Text(row.date.second, fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Ink, lineHeight = 23.sp)
                                Text(row.date.third, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = BodyText, lineHeight = 11.sp)
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
                .background(Brush.linearGradient(listOf(Color(0xFF12564B), Teal)))
        ) {
            Image(painterResource(R.drawable.mythuso_family), null, Modifier.align(Alignment.BottomEnd).height(150.dp), contentScale = ContentScale.Fit)
            Column(Modifier.padding(20.dp).fillMaxWidth(0.66f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Text("Care that fits\nyour life.", fontSize = 23.sp, fontWeight = FontWeight.Bold, color = Color.White, lineHeight = 28.sp)
                Text("Easy booking. Trusted professionals.", fontSize = 13.sp, color = Color(0xFFC9E5DB), lineHeight = 18.sp)
                Button(onClick = { open("Book care") }, shape = CircleShape, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = TealDeep)) {
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
