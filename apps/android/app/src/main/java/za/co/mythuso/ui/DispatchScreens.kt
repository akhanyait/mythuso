package za.co.mythuso.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp

data class DispatchJob(val id: String, val service: String, val area: String, val window: String, val priority: String, val x: Float, val y: Float)
data class DispatchNurse(val id: String, val name: String, val area: String, val status: String, val eta: Int, val skills: String, val x: Float, val y: Float)
private val zones = listOf(
    Triple("Randburg", 0.17f to 0.19f, 0.13f), Triple("Rosebank", 0.76f to 0.19f, 0.13f), Triple("Parktown", 0.68f to 0.50f, 0.12f),
    Triple("Melville", 0.25f to 0.50f, 0.12f), Triple("Soweto", 0.38f to 0.81f, 0.14f)
)
private val jobs = listOf(
    DispatchJob("TH-2049", "Wound care", "Soweto", "11:00 – 12:00", "Same day", 0.41f, 0.79f),
    DispatchJob("TH-2051", "Vitals & chronic check", "Randburg", "13:00 – 14:00", "Routine", 0.21f, 0.24f),
    DispatchJob("TH-2052", "Post-operative check", "Parktown", "As soon as possible", "Urgent", 0.70f, 0.52f)
)
private val nurses = listOf(
    DispatchNurse("N-108", "Sister Palesa Khumalo", "Soweto", "Available", 9, "Wound care · Maternal", 0.35f, 0.83f),
    DispatchNurse("N-114", "Sister Naledi Mokoena", "Rosebank", "Available", 18, "Wound care · Chronic care", 0.76f, 0.21f),
    DispatchNurse("N-133", "Sister Refilwe Sithole", "Randburg", "Available", 24, "Chronic care · Paediatric", 0.15f, 0.20f),
    DispatchNurse("N-121", "Brother Sipho Ndlovu", "Melville", "On a visit", 46, "Post-operative · Chronic care", 0.24f, 0.51f)
)
private val Free = Color(0xFF2F9C7D)
private val Busy = Color(0xFFA7ADA4)
private val Waiting = Color(0xFFD99A45)

/**
 * The map is a picture of the same information in the list below it. Everything can be
 * dispatched from the list alone, so the map carries a spoken summary and nothing more.
 */
@Composable fun DispatchBoardScreen() {
    var state by remember { mutableStateOf(LoadState.READY) }
    var selected by remember { mutableStateOf(jobs[0].id) }
    val assigned = remember { mutableStateMapOf<String, String>() }
    val job = jobs.first { it.id == selected }
    val summary = "Demonstration dispatch map of northern Johannesburg. ${jobs.size} visits awaiting assignment across ${zones.joinToString(", ") { it.first }}. " +
        "${nurses.count { it.status == "Available" }} nurses available. All positions are fictional."
    ScreenColumn {
        DemoBadge()
        Heading("Control Tower", "A clear view of care.", "Fictional dispatch board. No live map, assignment or escalation is connected.")
        StatePicker("Preview the dispatch feed state", state) { state = it }
        StateBlock(state, "The live dispatch feed", "location sharing from nurse devices", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                CareCard {
                    Text("Live dispatch · Demo", style = MaterialTheme.typography.titleMedium)
                    Canvas(Modifier.fillMaxWidth().aspectRatio(1f).semantics { contentDescription = summary }) {
                        val side = size.minDimension
                        drawRect(Color(0xFFF1F6F2), Offset.Zero, Size(size.width, size.height))
                        zones.forEach { (_, centre, radius) -> drawCircle(Color(0xFFDFEEE4), radius * side, Offset(centre.first * size.width, centre.second * size.height)) }
                        nurses.forEach { nurse -> drawCircle(if (nurse.status == "Available") Free else Busy, 9f, Offset(nurse.x * size.width, nurse.y * size.height)) }
                        jobs.forEach { pin ->
                            drawRect(if (assigned[pin.id] != null) Free else Waiting,
                                Offset(pin.x * size.width - 9f, pin.y * size.height - 9f), Size(18f, 18f))
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("● Available", style = MaterialTheme.typography.labelSmall, color = Free)
                        Text("● On a visit", style = MaterialTheme.typography.labelSmall, color = Busy)
                        Text("■ Visit", style = MaterialTheme.typography.labelSmall, color = Waiting)
                    }
                    Note("The map is a picture of the same information in the list below it. Everything can be dispatched from the list alone.")
                }
                CareCard {
                    Text("Awaiting assignment", style = MaterialTheme.typography.titleMedium)
                    FlowRowChips(jobs.map { it.id }, setOf(selected)) { selected = it }
                    ReviewLine("Service", job.service)
                    ReviewLine("Area", job.area)
                    ReviewLine("Window", job.window)
                    ReviewLine("Priority", job.priority)
                    ReviewLine("Status", assigned[job.id]?.let { "Assigned to $it" } ?: "Unassigned")
                }
                CareCard {
                    Text("Nearest available nurses", style = MaterialTheme.typography.titleMedium)
                    nurses.sortedBy { it.eta }.forEach { nurse ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(nurse.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                                Note("${nurse.area} · ${nurse.status} · ETA ${nurse.eta} min")
                                Note(nurse.skills)
                            }
                            OutlinedButton(
                                onClick = { if (assigned[job.id] == nurse.name) assigned.remove(job.id) else assigned[job.id] = nurse.name },
                                enabled = nurse.status == "Available"
                            ) { Text(if (assigned[job.id] == nurse.name) "Assigned" else "Assign") }
                        }
                        HorizontalDivider()
                    }
                    Note("Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.")
                }
            }
        }
    }
}
data class IncidentSummary(val id: String, val title: String, val severity: String, val area: String, val opened: String, val status: String)
val incidents = listOf(
    IncidentSummary("INC-014", "Nurse could not gain access at the address", "Medium", "Soweto", "09:52", "Triage"),
    IncidentSummary("INC-015", "Patient reported chest pain during a routine visit", "Critical", "Parktown", "10:31", "Escalated"),
    IncidentSummary("INC-016", "Sample seal found damaged on courier handover", "High", "Rosebank", "11:04", "Open")
)
@Composable fun IncidentDetailScreen(reference: String) {
    val incident = incidents.firstOrNull { it.id == reference } ?: incidents[1]
    var severity by remember { mutableStateOf(incident.severity) }
    var action by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val log = remember { mutableStateListOf<String>() }
    ScreenColumn {
        DemoBadge()
        Heading("Incident management preview", "${incident.id} · ${incident.title}", "Opened ${incident.opened} · ${incident.area}")
        CareCard { ReviewLine("Reported by", "Sister Palesa Khumalo · N-108"); ReviewLine("Current status", incident.status) }
        CareCard {
            Text("Severity", style = MaterialTheme.typography.titleMedium)
            FlowRowChips(listOf("Low", "Medium", "High", "Critical"), setOf(severity)) { severity = it }
            if (severity == "Critical") Note("A critical incident pages the on-call clinical lead immediately. The form is never a prerequisite for calling emergency services.")
        }
        CareCard {
            Text("Immediate action", style = MaterialTheme.typography.titleMedium)
            listOf("Call the nurse now", "Advise nurse to call emergency services", "Escalate to the on-call clinical lead", "Notify the patient’s emergency contact", "Reassign the visit", "Stand down — no further action").forEach { option ->
                Row(
                    Modifier.fillMaxWidth().clickable { action = option }.semantics { selected = action == option },
                    verticalAlignment = Alignment.CenterVertically
                ) { RadioButton(action == option, { action = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        OutlinedTextField(notes, { notes = it.take(600) }, label = { Text("Handover note") }, modifier = Modifier.fillMaxWidth().height(120.dp),
            supportingText = { Text("What happened, what you did, what the next shift must know.") })
        Button(onClick = { log.add(action); action = "" }, enabled = action.isNotEmpty()) { Text("Add demo action to the log") }
        if (log.isNotEmpty()) CareCard {
            Text("Demo incident log", style = MaterialTheme.typography.titleMedium)
            log.forEach { entry ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.CheckCircle, null, tint = Teal); Text(entry, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Note("Incident logs are append-only and reviewed weekly. Nothing here is recorded, paged or sent.")
    }
}
@Composable fun NurseVettingScreen(close: () -> Unit) {
    var stage by remember { mutableIntStateOf(0) }
    var sanc by remember { mutableStateOf("") }
    var scope by remember { mutableStateOf(setOf<String>()) }
    var attested by remember { mutableStateOf(false) }
    val checks = listOf(
        Triple("SANC registration", "Verified against the South African Nursing Council register", "Verified"),
        Triple("Identity", "Home Affairs verification through an accredited provider", "Verified"),
        Triple("Qualifications", "Certified copies checked against the issuing institution", "Verified"),
        Triple("Police clearance", "SAPS clearance, renewed every two years", "In review"),
        Triple("Professional indemnity", "Cover in force for the scope of practice", "In review"),
        Triple("Two clinical references", "Contacted directly, never through the applicant", "Outstanding"),
        Triple("Thuso Kit training", "Device handling, infection control and escalation drill", "Outstanding")
    )
    val verified = checks.count { it.third == "Verified" }
    ScreenColumn {
        DemoBadge()
        if (stage == 0) {
            Heading("Nurse onboarding preview", "Join the MyThuso nurse network.", "Vetting protects patients and it protects you. Nothing is submitted in this preview.")
            OutlinedTextField(sanc, { sanc = it.filter { c -> c.isDigit() }.take(8) }, label = { Text("SANC registration number") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), singleLine = true, modifier = Modifier.fillMaxWidth(),
                supportingText = { Text(if (sanc.isNotEmpty() && sanc.length < 8) "A SANC number has 8 digits." else "Use a fictional number, for example 20012345.") })
            Text("Scope of practice you are applying for", style = MaterialTheme.typography.titleMedium)
            FlowRowChips(listOf("Chronic care", "Wound care", "Maternal & child", "Post-operative", "Phlebotomy", "Paediatric", "Elderly care"), scope) { skill ->
                scope = if (skill in scope) scope - skill else scope + skill
            }
            Note("You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = close) { Text("Close") }
                Button(onClick = { stage = 1 }, enabled = sanc.length == 8 && scope.isNotEmpty()) { Text("Continue") }
            }
        } else {
            Heading("Nurse onboarding preview", "Your vetting status", "$verified of ${checks.size} checks complete in this sample. You cannot take visits until every check passes.")
            LinearProgressIndicator({ verified.toFloat() / checks.size }, Modifier.fillMaxWidth())
            checks.forEach { (name, detail, status) ->
                CareCard {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text(status, style = MaterialTheme.typography.labelMedium, color = if (status == "Verified") Teal else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Note(detail)
                }
            }
            Setting("I confirm the information above is true and I will report any change to my registration, clearance or health status.", attested) { attested = it }
            Note("Re-vetting runs on a schedule, not once at sign-up. A lapsed registration removes a nurse from dispatch automatically.")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { stage = 0 }) { Text("Back") }
                Button(onClick = close, enabled = attested) { Text("Submit demo application") }
            }
        }
    }
}
