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
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import za.co.mythuso.R
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.householdMemberById
import za.co.mythuso.model.mokoenaHousehold

@Composable fun PassportScreen(open: (String) -> Unit) {
    var tab by remember { mutableStateOf("Overview") }
    var sharing by remember { mutableStateOf(false) }
    var deviceState by remember { mutableStateOf(LoadState.DENIED) }
    val context = LocalContext.current
    ScreenColumn {
        Heading("", "Health Passport", "")
        DemoBadge()
        Box(
            Modifier.fillMaxWidth().heightIn(min = 160.dp).clip(RoundedCornerShape(18.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF0F4A40), Color(0xFF146B5C))))
                .padding(20.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    StatusPill("Thuso Pass", "light")
                    Text("Your health.\nYour story.", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White, lineHeight = 29.sp)
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text("Lerato Molefe", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        Text("ID: TH-2048-3920", fontSize = 12.sp, color = Color(0xFFB9DCD2))
                    }
                }
                Image(
                    painterResource(R.drawable.mythuso_patient), null,
                    Modifier.size(84.dp).clip(CircleShape).border(3.dp, Color.White.copy(alpha = 0.25f), CircleShape),
                    contentScale = ContentScale.Crop
                )
            }
        }
        FlowRowChips(listOf("Overview", "Records", "Medications", "More"), setOf(tab)) { tab = it }
        when (tab) {
            "Records" -> CareCard {
                MenuRow("Visit summary", "Fictional document · 4 September", Icons.Outlined.Description) { open("Visit summary") }
                HorizontalDivider(color = Line)
                MenuRow("Laboratory results", "Fasting panel · Released", Icons.Outlined.Science) { open("Laboratory order LAB-0023") }
                HorizontalDivider(color = Line)
                MenuRow("Medical certificate", "Doctor reviewed · Demo", Icons.Outlined.VerifiedUser) { open("Medical certificate") }
            }
            "Medications" -> {
                EmptyStateCard("No active prescriptions", "Prescriptions appear here after a registered doctor issues them.")
                OutlinedButton(onClick = { open("Prescription RX-0081") }, Modifier.fillMaxWidth()) { Text("Preview a sample prescription") }
            }
            "More" -> {
                StatePicker("Preview the device permission state", deviceState) { deviceState = it }
                StateBlock(deviceState, "Readings from your connected devices", "Health Connect access", { deviceState = LoadState.READY }) {
                    CareCard {
                        MenuRow("Health Connect", "Choose exactly which readings you share", Icons.Outlined.MonitorHeart) { open("Health Connect") }
                        HorizontalDivider(color = Line)
                        MenuRow("Thuso Kit", "Connected diagnostic capture", Icons.Outlined.Sensors) { open("Thuso Kit") }
                    }
                }
                CareCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Demo access for Dr. A. Dlamini", Modifier.weight(1f), fontSize = 14.sp, color = Ink)
                        Switch(sharing, { sharing = it })
                    }
                    Note(if (sharing) "Demo access active for 24 hours. Turn off to revoke." else "No active shares. No real access is granted.")
                }
            }
            else -> {
                Text("Health trends", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                ClinicalChart("Blood pressure", "mmHg", listOf(
                    Reading("12 Aug", 128.0), Reading("19 Aug", 134.0), Reading("28 Aug", 141.0, "Missed medication"), Reading("4 Sep", 136.0)
                ), 90.0..140.0, icon = Icons.Outlined.MonitorHeart)
                ClinicalChart("Heart rate", "bpm", listOf(
                    Reading("12 Aug", 76.0), Reading("19 Aug", 74.0), Reading("28 Aug", 80.0), Reading("4 Sep", 72.0)
                ), 50.0..100.0, icon = Icons.Outlined.Favorite)
                ClinicalChart("Blood glucose", "mmol/L", listOf(
                    Reading("12 Aug", 5.6), Reading("19 Aug", 6.1), Reading("28 Aug", 5.4), Reading("4 Sep", 5.2)
                ), 4.0..7.8, 1, icon = Icons.Outlined.Bloodtype)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ActionTile("Share record", Icons.Outlined.Share, Modifier.weight(1f)) { sharing = true }
                    ActionTile("Export sample", Icons.Outlined.Download, Modifier.weight(1f)) {
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "MyThuso fictional passport: BP 118/78 mmHg, pulse 72 bpm, glucose 5.2 mmol/L. Demo only, not a medical record.")
                        }
                        context.startActivity(Intent.createChooser(intent, "Export sample passport"))
                    }
                    ActionTile("Doctors", Icons.Outlined.People, Modifier.weight(1f)) { open("Your care team") }
                }
            }
        }
    }
}
@Composable fun ActionTile(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier, click: () -> Unit) {
    Column(
        modifier.heightIn(min = 80.dp).background(Color.White, RoundedCornerShape(18.dp))
            .border(1.dp, Line, RoundedCornerShape(18.dp)).clickable(onClick = click).padding(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, null, tint = Teal)
        Spacer(Modifier.height(8.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Forest, textAlign = TextAlign.Center, lineHeight = 15.sp)
    }
}
@Composable fun ToolRow(name: String, click: () -> Unit) { Row(Modifier.fillMaxWidth().clickable(onClick = click).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) { Text(name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium); Icon(Icons.Outlined.ChevronRight, null, tint = Teal) } }
@Composable fun MoreScreen(open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        Heading("", "More", "")
        CareCard(Modifier.clickable { open("Your profile") }) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                Image(painterResource(R.drawable.mythuso_patient), null, Modifier.size(52.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Lerato Molefe", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                    Text("View and edit your profile", fontSize = 12.sp, color = BodyText)
                }
                Icon(Icons.Outlined.ChevronRight, null, tint = BodyText.copy(alpha = 0.7f))
            }
        }
        CareCard {
            MenuRow("My family", "Manage your loved ones", Icons.Outlined.People) { open("My family") }
            HorizontalDivider(color = Line)
            MenuRow("Care plans", "Ongoing care and subscriptions", Icons.Outlined.FavoriteBorder) { open("Care plans") }
            HorizontalDivider(color = Line)
            MenuRow("Payments", "Cards, history and refunds", Icons.Outlined.CreditCard) { open("Thuso Wallet") }
        }
        CareCard {
            MenuRow("Notifications", "Visit updates and messages", Icons.Outlined.Notifications) { open("Notifications") }
            HorizontalDivider(color = Line)
            MenuRow("Privacy & settings", "Your data and app preferences", Icons.Outlined.Tune) { open("Privacy & settings") }
            HorizontalDivider(color = Line)
            MenuRow("Language", "Read MyThuso your way", Icons.Outlined.Language) { open("Language") }
        }
        CareCard {
            MenuRow("First-run & recovery", "Sign-up, one-time code and lost access", Icons.Outlined.PersonAdd) { firstRun() }
            HorizontalDivider(color = Line)
            MenuRow("System states", "Loading, error, offline and denied", Icons.Outlined.Layers) { open("System states") }
            HorizontalDivider(color = Line)
            MenuRow("Explore the roadmap", "All 21 modules in the proposal", Icons.Outlined.GridView) { open("Roadmap") }
            HorizontalDivider(color = Line)
            MenuRow("Vetting & verification", "Every party MyThuso vets, and what each is refused until it passes", Icons.Outlined.VerifiedUser) { open("Vetting pipeline") }
            HorizontalDivider(color = Line)
            MenuRow("Patient file", "The clinician-facing record, and what each viewer is refused", Icons.Outlined.FolderShared) { open("Patient file") }
            HorizontalDivider(color = Line)
            MenuRow("Consultation record", "One structure for every encounter, in long form or SOAP", Icons.Outlined.EditNote) { open("Consultation record") }
            HorizontalDivider(color = Line)
            MenuRow("Household record", "One household, and what each member may see of the others", Icons.Outlined.Groups) { open("Household record") }
            HorizontalDivider(color = Line)
            MenuRow("Health summary", "The shareable summary, bound to a purpose and a period", Icons.Outlined.Share) { open("Health summary") }
        }
        CareCard {
            listOf("Nurse" to "Visits, assessment and vetting", "Doctor" to "Review queue and sign-off",
                   "Partner" to "Pharmacy and laboratory orders", "Control Tower" to "Dispatch, incidents and vetting").forEachIndexed { index, (role, detail) ->
                MenuRow("$role workspace", detail, Icons.Outlined.MedicalServices) { open("$role workspace") }
                if (index < 3) HorizontalDivider(color = Line)
            }
        }
        CareCard { MenuRow("Log out", "Returns to the first-run flow — this preview has no account", Icons.Outlined.Logout, danger = true) { firstRun() } }
        Note("Native Compose design preview. All data is fictional and held only in memory.")
    }
}
@Composable fun RoadmapScreen(open: (String) -> Unit) {
    ScreenColumn {
        Heading("The MyThuso family", "More ways to be cared for.", "Availability follows the proposal’s phased roadmap.")
        CareCard {
            listOf("Thuso Screen", "Thuso Wear", "Thuso Pharmacy", "Thuso Labs", "Thuso SOS", "Thuso Corner", "Thuso Work",
                   "Thuso Locum", "Thuso Academy", "Thuso Money", "Thuso Cover", "Thuso Devices", "Thuso Kit", "Thuso AI", "Thuso Doctor")
                .forEachIndexed { index, feature ->
                    MenuRow(feature, "", Icons.Outlined.GridView) { open(feature) }
                    if (index < 14) HorizontalDivider(color = Line)
                }
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
        title == "Roadmap" -> RoadmapScreen(open)
        title == "First-run & recovery" -> firstRun()
        title == "Invite a guardian" -> InviteGuardianScreen(store) { open("My family") }
        title == "Visit assessment" -> VisitAssessmentScreen(store, close = { open("Nurse workspace") })
        /* The clinician-facing file and the encounter that writes into it. They are one route each
           because both are read about somebody else: the Passport is the patient's own view, and
           putting them behind the same door would blur whose record is whose. */
        title == "Patient file" -> PatientFileScreen(store, open)
        title == "Consultation record" -> ConsultationRecordScreen(store)
        /* The household and the summary a person hands out of it. Both are about several people at
           once, which is exactly why they are separate routes: a screen that opened a household and
           a record in the same breath would be the back door the whole design is written to close. */
        title == "Household record" -> HouseholdRecordScreen(store, open)
        title == "Health summary" -> HealthSummaryScreen(store)
        title.startsWith("Health summary: ") -> HealthSummaryScreen(
            store, householdMemberById(title.removePrefix("Health summary: ")) ?: mokoenaHousehold.members[0]
        )
        /* Vetting is reachable from every workspace, because every workspace is somebody who was
           vetted to be there. The routes carry the party, not a copy of their record. */
        title == "Nurse onboarding & vetting" -> VettingApplicationScreen(store, "nurse", open) { open("Nurse workspace") }
        title == "Vetting pipeline" -> VettingPipelineScreen(store, open)
        title == "Renewals due" -> VettingRenewalsScreen(store, open)
        title == "Vetting decision log" -> VettingLogScreen(store)
        title.startsWith("Vetting: ") -> VettingStatusScreen(store, title.removePrefix("Vetting: "), open)
        title.startsWith("Apply for vetting") ->
            VettingApplicationScreen(store, title.removePrefix("Apply for vetting").removePrefix(": ").ifEmpty { null }, open) { open("Vetting pipeline") }
        title == "Live dispatch board" -> DispatchBoardScreen(store, open)
        title.startsWith("Doctor review") -> DoctorReviewScreen(store, title.removePrefix("Doctor review "))
        title.startsWith("Prescription ") -> PrescriptionScreen(title.removePrefix("Prescription "))
        title.startsWith("Laboratory order ") -> LabOrderScreen(title.removePrefix("Laboratory order "))
        title.startsWith("Incident ") -> IncidentDetailScreen(title.removePrefix("Incident "))
        title == "Partner workspace" -> FulfilmentQueueScreen(open)
        title == "Notifications" -> ScreenColumn {
            Heading("Your care updates", "Notifications", "Sample notifications only.")
            listOf("Your Saturday visit is confirmed.", "Your visit summary is ready.", "Explore regular check-ins with Thuso Routine.", "Kagiso asked to help with your bookings. Review what he would see.").forEach { CareCard { Text(it) } }
        }
        title.endsWith("workspace") -> WorkspaceScreen(title, store, open)
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
        CareCard {
            Text("Verification", style = MaterialTheme.typography.titleMedium)
            ToolRow("Guardian verification · Nomsa Molefe") { open("Vetting: G-031") }
            ToolRow("Sponsor verification · Themba Molefe") { open("Vetting: S-021") }
            Note("Being a parent in the app is not proof of being a guardian in law, and paying is not permission. Both are vetted separately.")
        }
        Note("Sponsoring care does not automatically grant access to health records.")
    }
}
@Composable fun PrivacyScreen(store: PreviewStore, open: (String) -> Unit) { ScreenColumn { Heading("Your privacy matters", "Your data. Your choices.", "Demo preferences reset when the app restarts."); CareCard { Setting("Care reminders", store.reminders) { store.reminders = it }; Setting("Wearable readings", store.wearableSharing) { store.wearableSharing = it }; Setting("Product updates", store.marketing) { store.marketing = it } }; CareCard { listOf("Access history", "Request a correction", "Request account deletion", "Information Officer").forEach { item -> ToolRow(item) { open(item) } } }; Text("Production POPIA compliance requires governance, lawful processing, verified technical controls and a clinical retention schedule. These are UI previews.", style = MaterialTheme.typography.bodySmall) } }
@Composable fun PlansScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Routine", "A healthier rhythm.", "Proposal prices · Phase 2–3 preview"); listOf(Triple("Chronic Routine", "R199 / month", "Monthly check-ins and doctor review"), Triple("Family Planning", "R99 / month", "Scheduled visits and discreet reminders"), Triple("Thuso Mom", "R249 / month", "Pregnancy and baby’s first year"), Triple("Thuso Senior", "R699 / month", "Weekly care and family support"), Triple("Thuso Recover", "Custom pricing", "Personalised recovery support")).forEach { (name, price, description) -> CareCard { Icon(Icons.Outlined.FavoriteBorder, null, tint = Teal); Text(name, style = MaterialTheme.typography.titleLarge); Text(description); Text(price, style = MaterialTheme.typography.headlineSmall, color = Teal); OutlinedButton(onClick = { open(name) }) { Text("Explore plan") } } } } }
@Composable fun WalletScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Wallet", "A little care, set aside.", "Support your own care or someone you love."); CareCard { Text("Demo balance"); Text("R500.00", style = MaterialTheme.typography.displaySmall, color = Forest); ToolRow("Top up wallet") { open("Top up wallet") }; ToolRow("Sponsor care") { open("Sponsor care") } }; CareCard { Text("Sample activity", style = MaterialTheme.typography.titleMedium); Text("Family care credit   + R500"); Text("Vitals visit   − R249") } } }
@Composable fun WorkspaceScreen(title: String, store: PreviewStore, open: (String) -> Unit) {
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
            CareCard {
                Text("Dispatch", style = MaterialTheme.typography.titleMedium)
                ToolRow("Live dispatch board") { open("Live dispatch board") }
                ToolRow("Vetting pipeline") { open("Vetting pipeline") }
                ToolRow("Renewals due") { open("Renewals due") }
            }
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
                nurse -> listOf("Visit assessment", "Patient file", "Consultation record", "Nurse onboarding & vetting", "Vetting: N-205", "Apply for vetting: locum", "Diagnostic kit", "Weekly payouts", "Locum shifts", "Academy")
                doctor -> listOf("Patient file", "Consultation record", "Apply for vetting: doctor", "Vetting: D-401", "Clinical protocols", "Teleconsultation", "Referral pathway")
                else -> listOf("Vetting pipeline", "Vetting: O-802", "Vetting: A-902", "Vetting decision log", "Apply for vetting", "Incident INC-015", "Quality & revenue", "Employer programmes")
            }
            /* A route reads as a route. The workspace names the party it opens rather than its
               reference, because nobody thinks of a colleague as O-802. */
            fun label(route: String) = when {
                route.startsWith("Vetting: ") -> store.vetting.subject(route.removePrefix("Vetting: "))
                    ?.let { "Vetting · ${it.name}" } ?: route
                route == "Apply for vetting" -> "Start a vetting application"
                route.startsWith("Apply for vetting: ") -> "Vetting application · ${route.removePrefix("Apply for vetting: ").replaceFirstChar { it.uppercase() }}"
                else -> route
            }
            tools.forEach { item -> ToolRow(label(item)) { open(item) } }
        }
        Note("AI is decision support. Clinical decisions require an authorised clinician’s sign-off.")
    }
}
