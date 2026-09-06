package za.co.mythuso.ui

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.PreviewStore

@Composable fun PassportScreen(open: (String) -> Unit) {
    var sharing by remember { mutableStateOf(false) }
    var deviceState by remember { mutableStateOf(LoadState.DENIED) }
    val context = LocalContext.current
    ScreenColumn {
        DemoBadge()
        Heading("Thuso Pass", "Your story. Your health.", "Lerato Molefe · Fictional health record")
        ClinicalChart("Blood pressure — systolic", "mmHg", listOf(
            Reading("12 Aug", 128.0), Reading("19 Aug", 134.0), Reading("28 Aug", 141.0, "Missed medication"), Reading("4 Sep", 136.0)
        ), 90.0..140.0)
        ClinicalChart("Heart rate", "bpm", listOf(
            Reading("12 Aug", 76.0), Reading("19 Aug", 74.0), Reading("28 Aug", 80.0), Reading("4 Sep", 72.0)
        ), 50.0..100.0)
        ClinicalChart("Blood glucose", "mmol/L", listOf(
            Reading("12 Aug", 5.6), Reading("19 Aug", 6.1), Reading("28 Aug", 5.4), Reading("4 Sep", 5.2)
        ), 4.0..7.8, decimals = 1)
        CareCard {
            Text("Your records", style = MaterialTheme.typography.titleMedium)
            ToolRow("Visit summary") { open("Visit summary") }
            ToolRow("Laboratory results") { open("Laboratory order LAB-0023") }
            ToolRow("Medical certificate") { open("Medical certificate") }
            ToolRow("Medicines") { open("Prescription RX-0081") }
        }
        CareCard {
            Text("Manage sharing", style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Demo access for Dr. A. Dlamini", modifier = Modifier.weight(1f))
                Switch(sharing, { sharing = it })
            }
            Note(if (sharing) "Demo access active for 24 hours. Turn off to revoke." else "No active shares. No real access is granted.")
        }
        CareCard {
            Text("Connected devices", style = MaterialTheme.typography.titleMedium)
            StatePicker("Preview the device permission state", deviceState) { deviceState = it }
            StateBlock(deviceState, "Readings from your connected devices", "Health Connect access", { deviceState = LoadState.READY }) {
                Column {
                    ToolRow("Health Connect") { open("Health Connect") }
                    ToolRow("Thuso Kit") { open("Thuso Kit") }
                }
            }
        }
        OutlinedButton(onClick = {
            val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "MyThuso fictional passport: BP 118/78 mmHg, pulse 72 bpm, glucose 5.2 mmol/L. Demo only, not a medical record.") }
            context.startActivity(Intent.createChooser(intent, "Export sample passport"))
        }) { Icon(Icons.Outlined.Share, null); Spacer(Modifier.width(10.dp)); Text("Export sample passport") }
    }
}
@Composable fun ToolRow(name: String, click: () -> Unit) { Row(Modifier.fillMaxWidth().clickable(onClick = click).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) { Text(name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium); Icon(Icons.Outlined.ChevronRight, null, tint = Teal) } }
@Composable fun MoreScreen(open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        Heading("The MyThuso family", "More ways to care.", "Explore your care and the full feature roadmap.")
        CareCard { listOf("My family", "Care plans", "Thuso Wallet", "Privacy & settings", "Language").forEach { item -> ToolRow(item) { open(item) } } }
        CareCard {
            Text("Design review", style = MaterialTheme.typography.titleMedium)
            ToolRow("First-run & recovery") { firstRun() }
            ToolRow("System states") { open("System states") }
        }
        CareCard {
            Text("Workspace previews", style = MaterialTheme.typography.titleMedium)
            listOf("Nurse", "Doctor", "Partner", "Control Tower").forEach { role -> ToolRow("$role workspace") { open("$role workspace") } }
        }
        CareCard {
            Text("Explore the roadmap", style = MaterialTheme.typography.titleMedium)
            listOf("Thuso Screen", "Thuso Wear", "Thuso Pharmacy", "Thuso Labs", "Thuso SOS", "Thuso Corner", "Thuso Work", "Thuso Locum", "Thuso Academy", "Thuso Money", "Thuso Cover", "Thuso Devices", "Thuso Kit", "Thuso AI", "Thuso Doctor").forEach { item -> ToolRow(item) { open(item) } }
        }
    }
}
@Composable fun DetailScreen(title: String, store: PreviewStore, open: (String) -> Unit, firstRun: () -> Unit) {
    when {
        title == "Health Passport" -> PassportScreen(open)
        title == "My family" -> FamilyScreen(store, open)
        title == "Privacy & settings" -> PrivacyScreen(store, open)
        title == "Care plans" -> PlansScreen(open)
        title == "Thuso Wallet" -> WalletScreen(open)
        title == "Language" -> LanguageScreen(store)
        title == "System states" -> SystemStatesScreen()
        title == "First-run & recovery" -> firstRun()
        title == "Invite a guardian" -> InviteGuardianScreen(store) { open("My family") }
        title == "Visit assessment" -> VisitAssessmentScreen(close = { open("Nurse workspace") })
        title == "Nurse onboarding & vetting" -> NurseVettingScreen { open("Nurse workspace") }
        title == "Live dispatch board" -> DispatchBoardScreen()
        title.startsWith("Doctor review") -> DoctorReviewScreen(title.removePrefix("Doctor review "))
        title.startsWith("Prescription ") -> PrescriptionScreen(title.removePrefix("Prescription "))
        title.startsWith("Laboratory order ") -> LabOrderScreen(title.removePrefix("Laboratory order "))
        title.startsWith("Incident ") -> IncidentDetailScreen(title.removePrefix("Incident "))
        title == "Partner workspace" -> FulfilmentQueueScreen(open)
        title == "Notifications" -> ScreenColumn {
            Heading("Your care updates", "Notifications", "Sample notifications only.")
            listOf("Your Saturday visit is confirmed.", "Your visit summary is ready.", "Explore regular check-ins with Thuso Routine.", "Kagiso asked to help with your bookings. Review what he would see.").forEach { CareCard { Text(it) } }
        }
        title.endsWith("workspace") -> WorkspaceScreen(title, open)
        else -> ScreenColumn {
            DemoBadge()
            Heading("MyThuso", title, "Connected to your care journey.")
            CareCard {
                Icon(Icons.Outlined.VerifiedUser, null, tint = Teal)
                if (title.startsWith("Visit:")) {
                    Text("Confirmed · Demo"); Text("Sister Naledi Mokoena · Registered nurse"); Text("Have your medication list ready.")
                }
                Text("This workflow will connect to the relevant clinical, operational or partner service in the functionality phase.")
                Note("No live care, payments, device permissions or clinical decisions are activated.")
            }
        }
    }
}
@Composable fun FamilyScreen(store: PreviewStore, open: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    ScreenColumn {
        Heading("Thuso Family", "Your circle of care.", "Care for the people you love.")
        store.family.forEach { member ->
            CareCard {
                ToolRow(member) { open("Family profile: $member") }
                Note("Clinical records require verified authority and consent.")
            }
        }
        CareCard {
            Text("Add a fictional family member")
            OutlinedTextField(name, { name = it.take(60) }, label = { Text("Display name") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { store.family.add(name.trim()); name = "" }, enabled = name.isNotBlank()) { Text("Add demo member") }
        }
        InvitationList(store, open)
        Note("Sponsoring care does not automatically grant access to health records.")
    }
}
@Composable fun PrivacyScreen(store: PreviewStore, open: (String) -> Unit) { ScreenColumn { Heading("Your privacy matters", "Your data. Your choices.", "Demo preferences reset when the app restarts."); CareCard { Setting("Care reminders", store.reminders) { store.reminders = it }; Setting("Wearable readings", store.wearableSharing) { store.wearableSharing = it }; Setting("Product updates", store.marketing) { store.marketing = it } }; CareCard { listOf("Access history", "Request a correction", "Request account deletion", "Information Officer").forEach { item -> ToolRow(item) { open(item) } } }; Text("Production POPIA compliance requires governance, lawful processing, verified technical controls and a clinical retention schedule. These are UI previews.", style = MaterialTheme.typography.bodySmall) } }
@Composable fun Setting(name: String, checked: Boolean, change: (Boolean) -> Unit) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(name, Modifier.weight(1f)); Switch(checked, change) } }
@Composable fun PlansScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Routine", "A healthier rhythm.", "Proposal prices · Phase 2–3 preview"); listOf(Triple("Chronic Routine", "R199 / month", "Monthly check-ins and doctor review"), Triple("Family Planning", "R99 / month", "Scheduled visits and discreet reminders"), Triple("Thuso Mom", "R249 / month", "Pregnancy and baby’s first year"), Triple("Thuso Senior", "R699 / month", "Weekly care and family support"), Triple("Thuso Recover", "Custom pricing", "Personalised recovery support")).forEach { (name, price, description) -> CareCard { Icon(Icons.Outlined.FavoriteBorder, null, tint = Teal); Text(name, style = MaterialTheme.typography.titleLarge); Text(description); Text(price, style = MaterialTheme.typography.headlineSmall, color = Teal); OutlinedButton(onClick = { open(name) }) { Text("Explore plan") } } } } }
@Composable fun WalletScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Wallet", "A little care, set aside.", "Support your own care or someone you love."); CareCard { Text("Demo balance"); Text("R500.00", style = MaterialTheme.typography.displaySmall, color = Forest); ToolRow("Top up wallet") { open("Top up wallet") }; ToolRow("Sponsor care") { open("Sponsor care") } }; CareCard { Text("Sample activity", style = MaterialTheme.typography.titleMedium); Text("Family care credit   + R500"); Text("Vitals visit   − R249") } } }
@Composable fun WorkspaceScreen(title: String, open: (String) -> Unit) {
    var available by remember { mutableStateOf(true) }
    val nurse = title.startsWith("Nurse")
    val doctor = title.startsWith("Doctor")
    val tower = title.startsWith("Control Tower")
    if (title.startsWith("Partner")) { FulfilmentQueueScreen(open); return }
    ScreenColumn {
        DemoBadge()
        Heading("Care team preview", title, "Role preview for design review, not authentication.")
        if (nurse) CareCard { Setting("Available for visits", available) { available = it } }
        if (tower) {
            CareCard { Text("Dispatch", style = MaterialTheme.typography.titleMedium); ToolRow("Live dispatch board") { open("Live dispatch board") } }
            CareCard {
                Text("Open incidents", style = MaterialTheme.typography.titleMedium)
                incidents.forEach { incident ->
                    Column(Modifier.fillMaxWidth()) {
                        ToolRow("${incident.id} · ${incident.title}") { open("Incident ${incident.id}") }
                        Note("${incident.severity} · ${incident.area} · Opened ${incident.opened} · ${incident.status}")
                    }
                }
            }
        } else {
            CareCard {
                Text(if (doctor) "Clinical review queue" else "Today’s work", style = MaterialTheme.typography.titleMedium)
                if (doctor) {
                    listOf("TH-2048 · Vitals assessment", "TH-2045 · Wound follow-up", "TH-2041 · Prescription request").forEach { item ->
                        ToolRow(item) { open("Doctor review ${item.take(7)}") }
                    }
                } else {
                    ToolRow("TH-2048 · Vitals assessment · Rosebank") { open("Visit assessment") }
                    listOf("11:30 · Wound care · Parktown", "14:00 · Mother & baby · Melville").forEach { item -> ToolRow(item) { open(item) } }
                }
            }
        }
        CareCard {
            Text("Your tools", style = MaterialTheme.typography.titleMedium)
            val tools = when {
                nurse -> listOf("Visit assessment", "Nurse onboarding & vetting", "Diagnostic kit", "Weekly payouts", "Locum shifts", "Academy")
                doctor -> listOf("Clinical protocols", "Teleconsultation", "Referral pathway")
                else -> listOf("Nurse onboarding & vetting", "Incident INC-015", "Quality & revenue", "Employer programmes")
            }
            tools.forEach { item -> ToolRow(item) { open(item) } }
        }
        Note("AI is decision support. Clinical decisions require an authorised clinician’s sign-off.")
    }
}
