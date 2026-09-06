package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import za.co.mythuso.model.Phrase
import za.co.mythuso.model.thuso

@Composable fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) { Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(22.dp), content = content) }
@Composable fun HomeScreen(store: PreviewStore, book: () -> Unit, open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        DemoBadge()
        Heading("A little care goes a long way", thuso(Phrase.GREETING, store.locale), thuso(Phrase.GREETING_SUB, store.locale))
        Column(Modifier.fillMaxWidth().background(Sage, RoundedCornerShape(24.dp)).padding(24.dp), verticalArrangement = Arrangement.spacedBy(17.dp)) {
            Text("CARE THAT COMES TO YOU", style = MaterialTheme.typography.labelSmall, color = Teal)
            Text(thuso(Phrase.HERO_TITLE, store.locale), style = MaterialTheme.typography.headlineLarge, color = Forest)
            Text(thuso(Phrase.HERO_BODY, store.locale), style = MaterialTheme.typography.bodyMedium)
            Button(onClick = book, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) { Text(thuso(Phrase.BOOK_NURSE, store.locale)); Spacer(Modifier.width(14.dp)); Icon(Icons.Outlined.ArrowForward, null) }
            Text(thuso(Phrase.HERO_TRUST, store.locale), style = MaterialTheme.typography.labelSmall, color = Forest)
        }
        Text(thuso(Phrase.HELP_WITH, store.locale), style = MaterialTheme.typography.titleMedium)
        services.take(4).chunked(2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { row.forEach { service -> CareCard(Modifier.weight(1f).clickable(onClick = book)) { Icon(Icons.Outlined.FavoriteBorder, null, tint = Teal); Text(service.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium); Text("From R${service.price}", style = MaterialTheme.typography.labelMedium, color = Teal) } } } }
        Text(thuso(Phrase.NEXT_VISIT, store.locale), style = MaterialTheme.typography.titleMedium)
        store.visits.firstOrNull()?.let { visit -> CareCard(Modifier.clickable { open("Visit: ${visit.service.name} · ${visit.time}") }) { Text("● Confirmed · Demo", color = Teal, style = MaterialTheme.typography.labelSmall); Text(visit.service.name, style = MaterialTheme.typography.titleMedium); Text(visit.time, style = MaterialTheme.typography.bodyMedium); HorizontalDivider(); Text("Sister Naledi Mokoena", style = MaterialTheme.typography.bodyMedium) } }
        Column(Modifier.fillMaxWidth().background(Forest, RoundedCornerShape(22.dp)).clickable { open("Health Passport") }.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { Text("THUSO PASS", color = Color.White, style = MaterialTheme.typography.labelSmall); Text("Your health.\nOne safe place.", color = Color.White, style = MaterialTheme.typography.headlineMedium); Text(thuso(Phrase.OPEN_PASSPORT, store.locale) + " →", color = Color.White) }
        CareCard(Modifier.clickable { open("My family") }) { Text("Your circle of care", style = MaterialTheme.typography.titleMedium); Text("Looking after your favourite people.") }
        TextButton(onClick = firstRun) { Text("See the first-run and recovery flow") }
        Text(thuso(Phrase.TAGLINE, store.locale), style = MaterialTheme.typography.labelSmall, color = Teal)
    }
}
@Composable fun ServicesScreen(store: PreviewStore) {
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<CareService?>(null) }
    ScreenColumn { DemoBadge(); Heading("Care, on your terms", "A little help, at home.", "Choose the care you need."); OutlinedTextField(query, { query = it }, label = { Text("Search services") }, modifier = Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true)
        val filtered = services.filter { it.name.contains(query, ignoreCase = true) }
        if(filtered.isEmpty()) Text("No matching services. Try another name.")
        filtered.forEach { service -> CareCard(Modifier.clickable { selected = service }) { Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.MedicalServices, null, tint = Teal); Spacer(Modifier.width(14.dp)); Text(service.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Text("R${service.price}", color = Teal) }; Text(service.detail, style = MaterialTheme.typography.bodyMedium) } }
    }
    selected?.let { BookingDialog(it, store) { selected = null } }
}
@Composable fun BookingDialog(service: CareService, store: PreviewStore, close: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    var person by remember { mutableStateOf("Lerato Molefe") }
    var time by remember { mutableStateOf("Tomorrow · 09:00–10:00") }
    var address by remember { mutableStateOf("Rosebank, Johannesburg") }
    var consent by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = close, title = { Text(if(step == 2) "Your demo visit is booked" else "Your home visit") }, text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(service.name, style = MaterialTheme.typography.titleMedium); Text("R${service.price} · Demo booking")
        when(step) {
            0 -> { Text("Who is this for?"); (listOf("Lerato Molefe") + store.family).forEach { name -> Row(Modifier.fillMaxWidth().clickable { person = name }, verticalAlignment = Alignment.CenterVertically) { RadioButton(person == name, { person = name }); Text(name) } }; OutlinedTextField(address, { address = it }, label = { Text("Visit location") }); Text("Choose a time"); listOf("Tomorrow · 09:00–10:00", "Tomorrow · 14:00–15:00").forEach { slot -> Row(Modifier.fillMaxWidth().clickable { time = slot }, verticalAlignment = Alignment.CenterVertically) { RadioButton(time == slot, { time = slot }); Text(slot, style = MaterialTheme.typography.bodySmall) } } }
            1 -> { Text("For $person\n$time\n$address\nPayment after visit"); Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(consent, { consent = it }); Text("I understand this is fictional and does not dispatch a nurse.") } }
            else -> Text("No nurse has been dispatched and no payment was taken. Your demo visit is now in the Visits tab.")
        }
    } }, confirmButton = { TextButton(onClick = { when(step) { 0 -> step = 1; 1 -> { store.visits.add(0, DemoVisit(service, person, time)); step = 2 }; else -> close() } }, enabled = if(step == 0) address.trim().length >= 5 else step != 1 || consent) { Text(when(step) { 0 -> "Review visit"; 1 -> "Confirm demo"; else -> "Done" }) } }, dismissButton = { if(step < 2) TextButton(onClick = { if(step == 1) step = 0 else close() }) { Text(if(step == 1) "Back" else "Cancel") } })
}
@Composable fun VisitsScreen(store: PreviewStore, open: (String) -> Unit) { var state by remember { mutableStateOf(LoadState.READY) }; ScreenColumn { DemoBadge(); Heading("We’ll be there", "Your visits", "Upcoming care, in one place."); StatePicker("Preview how this list behaves when the network or service is unavailable", state) { state = it }; StateBlock(state, "Your visit list", "notifications", { state = LoadState.READY }) { Column(verticalArrangement = Arrangement.spacedBy(16.dp)) { store.visits.forEach { visit -> CareCard(Modifier.clickable { open("Visit: ${visit.service.name} · ${visit.time}") }) { Text(visit.service.name, style = MaterialTheme.typography.titleMedium); Text(visit.time); Text("For ${visit.person} · Confirmed demo", color = Teal, style = MaterialTheme.typography.bodySmall) } } } } } }
