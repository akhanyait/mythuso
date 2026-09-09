package za.co.mythuso.ui

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import za.co.mythuso.model.CaptureState
import za.co.mythuso.model.Passport
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.Scheduling
import za.co.mythuso.model.readingSets
import za.co.mythuso.model.householdMemberById
import za.co.mythuso.model.mokoenaHousehold

/* The patient's own record.
 *
 * The screen used to open with the words "Health Passport" at 26sp, then a card carrying the words
 * "Your health. Your story." at 24 — two headings in a row, saying the same thing at almost the same
 * size, and then four filter chips. The card is the heading now: it names the person, carries the
 * identifier, and is the one thing on the screen with the brand behind it. The top bar already says
 * which tab this is.
 *
 * Overview, Records, Medications and More are four views of one record, which is a tab row rather
 * than a set of filters. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun PassportScreen(open: (String) -> Unit) {
    val tabs = listOf("Overview", "Records", "Medications", "More")
    var tab by remember { mutableStateOf(tabs.first()) }
    var sharing by remember { mutableStateOf(false) }
    var deviceState by remember { mutableStateOf(LoadState.DENIED) }
    val context = LocalContext.current
    ScreenColumn {
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(ThusoRadius.card))
                .background(Charcoal)
                .padding(ThusoSpacing.space20)
                .semantics(mergeDescendants = true) {}
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    StatusPill("Thuso Pass", "light")
                    Text("Your health.\nYour story.", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text("Lerato Molefe", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text("ID: TH-2048-3920", style = MaterialTheme.typography.bodySmall, color = SurfaceWhite)
                    }
                }
                Image(
                    painterResource(R.drawable.mythuso_patient), null,
                    Modifier.size(72.dp).clip(CircleShape).border(2.dp, Color.White.copy(alpha = 0.3f), CircleShape),
                    contentScale = ContentScale.Crop
                )
            }
        }
        DemoBadge()
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
            /* Scrollable rather than fixed: four tab labels at the largest font scale do not fit
               across a 360dp phone, and a tab that has been squeezed to two characters is not a tab. */
            ScrollableTabRow(
                selectedTabIndex = tabs.indexOf(tab),
                containerColor = Color.Transparent,
                edgePadding = 0.dp,
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
            when (tab) {
                "Records" -> CareCard(padding = ThusoSpacing.space8) {
                    MenuRow("Visit summary", "Fictional document · 4 September", Icons.Outlined.Description) { open("Visit summary") }
                    HorizontalDivider(color = Stone)
                    MenuRow("Laboratory results", "Fasting panel · Released", Icons.Outlined.Science) { open("Laboratory order LAB-0023") }
                    HorizontalDivider(color = Stone)
                    MenuRow("Medical certificate", "Doctor reviewed · Demo", Icons.Outlined.VerifiedUser) { open("Medical certificate") }
                }
                "Medications" -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    EmptyStateCard("No active prescriptions", "Prescriptions appear here after a registered doctor issues them.")
                    OutlinedButton(onClick = { open("Prescription RX-0081") }, Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape) { Text("Preview a sample prescription") }
                }
                "More" -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space24)) {
                    Section("Connected devices") {
                        StateBlock(deviceState, "Readings from your connected devices", "Health Connect access", { deviceState = LoadState.READY }) {
                            CareCard(padding = ThusoSpacing.space8) {
                                MenuRow("Health Connect", "What would be read, and what never would", Icons.Outlined.MonitorHeart) { open("Health Connect") }
                                HorizontalDivider(color = Stone)
                                /* The patient's side of the kit is the readings it wrote into her record, not
                                   the pairing surface — that one is a clinician's, and it opens under a
                                   nurse's registration. */
                                MenuRow("Thuso Kit readings", "The instruments, and how a device reading is filed", Icons.Outlined.Sensors) { open("Thuso Kit readings") }
                            }
                        }
                        StatePicker("Preview the device permission state", deviceState) { deviceState = it }
                    }
                    Section("Who can see your record") {
                        CareCard {
                            Setting("Demo access for Dr. A. Dlamini", sharing) { sharing = it }
                            Note(if (sharing) "Demo access active for 24 hours. Turn off to revoke." else "No active shares. No real access is granted.")
                        }
                    }
                }
                else -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space24)) {
                    /* Where things stand, and then the way to the shape of it. This used to be three
                       charts drawn from arrays of literal dates — "12 Aug" through "4 Sep" — which
                       were right the week they were typed and a year wrong by the next winter. The
                       numbers are the record's own now, dated in offsets from today, and the four
                       curves are one tap away rather than stacked on the overview. */
                    val latest = Passport.latestSet
                    val outside = Passport.outsideRange(latest)
                    SPanel(tone = PanelTone.LEAD) {
                        SChip(if (outside.isEmpty()) "All inside range" else "${outside.size} outside range", flagged = outside.isNotEmpty())
                        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                            Text("Your last visit", style = MaterialTheme.typography.titleMedium, color = Charcoal)
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
                    Section("Health trends") {
                        /* First of the three, because it is the question the other two assume has
                           already been answered: a chart of a number nobody has explained is a
                           picture of an unanswered question. */
                        PlainRow("What your readings mean", "What each measurement is, and who decides what it means for you") { open("What your readings mean") }
                        PlainRow("How your readings have changed", "${readingSets.size} visits over the last ${Passport.monthsCovered} months") { open("Health trends") }
                        PlainRow("Your last completed visit", "What was measured, and what the doctor said") { open("Visit summary") }
                    }
                    Section("Do something with it") {
                        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
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
    }
}
/* Three of these sit side by side, so the label has to be allowed two lines and the tile a height
   that follows it — at the largest font scale a fixed 80dp box cut "Export sample" in half. */
@Composable fun ActionTile(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier, click: () -> Unit) {
    Column(
        modifier.heightIn(min = 88.dp).background(Color.White, RoundedCornerShape(ThusoRadius.card))
            .border(1.dp, Stone, RoundedCornerShape(ThusoRadius.card)).clickable(onClick = click)
            .padding(ThusoSpacing.space12)
            .semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, null, tint = Charcoal, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(ThusoSpacing.space8))
        Text(label, style = MaterialTheme.typography.labelMedium, color = Charcoal, textAlign = TextAlign.Center)
    }
}
@Composable fun ToolRow(name: String, click: () -> Unit) = PlainRow(name, click = click)
/* Everything the four tabs do not hold.
 *
 * This screen used to be five cards of the same weight holding twenty-four rows of the same weight,
 * in no order anybody could name: "Payments" sat two rows above "System states", and "Household
 * record" — a design-review route — sat between two product features. Finding anything meant reading
 * all of it.
 *
 * It is now the person, then their care, then their settings, then the role previews, then the
 * routes that exist for design review, each under a heading that says which it is. Nothing was
 * removed and no route changed: the same rows are on the same screen, sorted. Saying out loud that
 * the last group is a preview is the honest version of what those rows already were.
 */
@Composable fun MoreScreen(open: (String) -> Unit, firstRun: () -> Unit) {
    ScreenColumn {
        /* No heading: the top bar already says More, and a screen that says its own name twice in
           two sizes is what this redesign is for. */
        DemoBadge()
        LeadCard(Modifier.clickable { open("Your profile") }.semantics(mergeDescendants = true) {}) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
                Image(painterResource(R.drawable.mythuso_patient), null, Modifier.size(56.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text("Lerato Molefe", style = MaterialTheme.typography.titleLarge, color = Charcoal)
                    Text("View and edit your profile", style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Faint)
            }
        }
        Section("Your care") {
            CareCard(padding = ThusoSpacing.space8) {
                MenuRow("My family", "Manage your loved ones", Icons.Outlined.People) { open("My family") }
                HorizontalDivider(color = Stone)
                MenuRow("Care plans", "Ongoing care and subscriptions", Icons.Outlined.FavoriteBorder) { open("Care plans") }
                HorizontalDivider(color = Stone)
                MenuRow("Payments", "Cards, history and refunds", Icons.Outlined.CreditCard) { open("Thuso Wallet") }
            }
        }
        Section("Settings") {
            CareCard(padding = ThusoSpacing.space8) {
                MenuRow("Notifications", "Visit updates and messages", Icons.Outlined.Notifications) { open("Notifications") }
                HorizontalDivider(color = Stone)
                MenuRow("Privacy & settings", "Your data and app preferences", Icons.Outlined.Tune) { open("Privacy & settings") }
                HorizontalDivider(color = Stone)
                MenuRow("Language", "Read MyThuso your way", Icons.Outlined.Language) { open("Language") }
                HorizontalDivider(color = Stone)
                MenuRow("Interpreters", "South African Sign Language: who is free, and what happens when nobody is", Icons.Outlined.Language) { open("Interpreters") }
            }
        }
        Section("Workspaces") {
            CareCard(padding = ThusoSpacing.space8) {
                /* Each role takes the symbol its own workspace opens on, rather than four rows of the
                   same medical bag — a list where every row has the same mark is a list nobody can
                   scan. */
                workspaceRoles.zip(listOf("Visits, assessment and vetting", "Review queue and sign-off",
                                          "Pharmacy and laboratory orders", "Dispatch, incidents and vetting"))
                    .forEachIndexed { index, (role, detail) ->
                        MenuRow("$role workspace", detail, workspaceSections(role).first().icon) { open("$role workspace") }
                        if (index < workspaceRoles.size - 1) HorizontalDivider(color = Stone)
                    }
            }
            Note("A role preview for design review. Nothing here authenticates anybody or grants access to a record.")
        }
        Section("For design review") {
            CareCard(padding = ThusoSpacing.space8) {
                MenuRow("First-run & recovery", "Sign-up, one-time code and lost access", Icons.Outlined.PersonAdd) { firstRun() }
                HorizontalDivider(color = Stone)
                MenuRow("System states", "Loading, error, offline and denied", Icons.Outlined.Layers) { open("System states") }
                HorizontalDivider(color = Stone)
                MenuRow("Explore the roadmap", "All 21 modules in the proposal", Icons.Outlined.GridView) { open("Roadmap") }
                HorizontalDivider(color = Stone)
                MenuRow("Vetting & verification", "Every party MyThuso vets, and what each is refused until it passes", Icons.Outlined.VerifiedUser) { open("Vetting pipeline") }
                HorizontalDivider(color = Stone)
                MenuRow("Patient file", "The clinician-facing record, and what each viewer is refused", Icons.Outlined.FolderShared) { open("Patient file") }
                HorizontalDivider(color = Stone)
                MenuRow("Consultation record", "One structure for every encounter, in long form or SOAP", Icons.Outlined.EditNote) { open("Consultation record") }
                HorizontalDivider(color = Stone)
                MenuRow("Household record", "One household, and what each member may see of the others", Icons.Outlined.Groups) { open("Household record") }
                HorizontalDivider(color = Stone)
                MenuRow("Health summary", "The shareable summary, bound to a purpose and a period", Icons.Outlined.Share) { open("Health summary") }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            CareCard(padding = ThusoSpacing.space8) {
                MenuRow("Log out", "Returns to the first-run flow — this preview has no account", Icons.AutoMirrored.Outlined.Logout, danger = true) { firstRun() }
            }
            Note("Native Compose design preview. All data is fictional and held only in memory.")
        }
    }
}
/* Explore. This is where the rotating banner lives now.
 *
 * It used to open the patient's home, roughly two thirds of a phone screen tall, standing between
 * somebody who had come to book a nurse and the four services they could have booked. Rotating
 * promotion is what this screen is for, so it is promotion here rather than an obstacle there. It
 * keeps its pause control either way — WCAG 2.2.2 — and it still refuses to rotate at all when the
 * system asks for reduced motion. */
@Composable fun RoadmapScreen(store: PreviewStore, open: (String) -> Unit) {
    ScreenColumn {
        Heading("The MyThuso family", "More ways to be cared for.", "Availability follows the proposal’s phased roadmap.")
        HeroCarousel(store) { position -> if (position == 1) open("Health Passport") else open("Book care") }
        CareCard {
            listOf("Thuso Screen", "Thuso Wear", "Thuso Pharmacy", "Thuso Labs", "Thuso SOS", "Thuso Corner", "Thuso Work",
                   "Thuso Locum", "Thuso Academy", "Thuso Money", "Thuso Cover", "Thuso Devices", "Thuso Kit", "Thuso AI", "Thuso Doctor")
                .forEachIndexed { index, feature ->
                    MenuRow(feature, "", Icons.Outlined.GridView) { open(feature) }
                    if (index < 14) HorizontalDivider(color = Stone)
                }
        }
    }
}
@Composable fun DetailScreen(title: String, store: PreviewStore, open: (String) -> Unit, firstRun: () -> Unit) {
    when {
        title == "Health Passport" -> PassportScreen(open)
        /* The three the passport offered and could not open. A completed visit is looked up by the
           day it happened rather than handed its readings, so a visit and what was measured at it
           cannot disagree — they never met before, which is why they never did. */
        title == "Health trends" -> HealthTrendsScreen(open)
        /* The question a person actually opened the passport with, and the one it answered least:
           what does this number mean. Written text with its own provenance on it — never a model. */
        title == "What your readings mean" -> ExplainReadingsScreen(open)
        title == "Visit summary" -> PastVisitScreen(store, Passport.latestSet.dayOffset, open)
        isDevicePermissionScreen(title) -> DevicePermissionScreen(title, open)
        title == "My family" -> FamilyScreen(store, open)
        /* The payer's own view of what they pay for. Its own route rather than a tab inside the
           family screen: a sponsor is not a guardian, and putting the two behind one door is the
           blur the whole contract is written to prevent. */
        title == "Care you pay for" -> SponsoredCareScreen(store, open)
        title == "Privacy & settings" -> PrivacyScreen(store, open)
        title == "Care plans" -> PlansScreen(open)
        title == "Thuso Wallet" -> WalletScreen(open)
        title == "Language" -> LanguageScreen(store)
        title == "Interpreters" -> InterpretingScreen()
        title == "System states" -> SystemStatesScreen()
        title == "Roadmap" -> RoadmapScreen(store, open)
        title == "First-run & recovery" -> firstRun()
        title == "Invite a guardian" -> InviteGuardianScreen(store) { open("My family") }
        title == "Visit assessment" -> VisitAssessmentScreen(store, close = { open("Nurse workspace") }, open = open)
        /* The whole visit, one level up from the readings. Its own route because it is worth opening
           when no instrument is anywhere near — it is where the morning’s work sits when there is no
           signal, and on this platform it is on the disk rather than in memory. */
        title == "Visit queue" -> VisitQueueScreen(store, open)
        /* Where is your nurse. The suburb and never a position, and nothing at all before the day —
           see model/Arrival.kt for why that is arithmetic rather than copy. */
        title.startsWith("Where is your nurse") ->
            ArrivalScreen(store, title.substringAfter('·', "").trim(), open)
        /* Thuso Kit and the queue underneath it are one feature read from two ends: the nurse takes
           a reading on the first and the record has to live with it on the second. Two routes rather
           than one screen with a tab, because the queue is worth opening when no instrument is
           anywhere near — it is where the morning's work sits when there is no signal. */
        title == "Thuso Kit" || title == "Diagnostic kit" -> ThusoKitScreen(store, open)
        title == "Capture queue" -> CaptureQueueScreen(store, open)
        title == "Weekly payouts" || title == "Earnings & payouts" -> EarningsScreen(store, open)
        title == "Thuso SOS" || title == "Emergency & urgent care" -> SosScreen(store)
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
        title == "Teleconsultation" -> TeleconsultScreen(store, open = open)
        title.startsWith("Doctor review") -> DoctorReviewScreen(store, title.removePrefix("Doctor review "))
        title.startsWith("Prescription ") -> PrescriptionScreen(title.removePrefix("Prescription "))
        title == "Substitution & repeats" -> DispensingScreen(store)
        title == "Employer programmes" -> ProgrammesScreen(store)
        title.startsWith("Laboratory order ") -> LabOrderScreen(title.removePrefix("Laboratory order "))
        title.startsWith("Incident ") -> IncidentDetailScreen(title.removePrefix("Incident "))
        title == "Notifications" -> ScreenColumn {
            Heading("Your care updates", "Notifications", "Sample notifications only.")
            listOf("Your Saturday visit is confirmed.", "Your visit summary is ready.", "Explore regular check-ins with Thuso Routine.", "Kagiso asked to help with your bookings. Review what he would see.").forEach { CareCard { Text(it) } }
        }
        else -> ScreenColumn {
            DemoBadge()
            Heading("MyThuso", title, "Connected to your care journey.")
            CareCard {
                Icon(Icons.Outlined.VerifiedUser, null, tint = Charcoal)
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
            Button(onClick = { store.family.add(name.trim()); name = "" }, enabled = name.isNotBlank(), shape = ThusoButtonShape) { Text("Add demo member") }
        }
        InvitationList(store, open)
        CareCard {
            Text("Verification", style = MaterialTheme.typography.titleMedium)
            ToolRow("Guardian verification · Nomsa Molefe") { open("Vetting: G-031") }
            ToolRow("Sponsor verification · Themba Molefe") { open("Vetting: S-021") }
            Note("Being a parent in the app is not proof of being a guardian in law, and paying is not permission. Both are vetted separately.")
        }
        /* The word "sponsored care" has been on this screen since it was written with nothing behind
           it. There is now: what has been drawn, and where the line is. */
        CareCard {
            Text("Care you pay for", style = MaterialTheme.typography.titleMedium)
            ToolRow("What has been used, and what it lets you see") { open("Care you pay for") }
        }
        Note("Sponsoring care does not automatically grant access to health records.")
    }
}
@Composable fun PrivacyScreen(store: PreviewStore, open: (String) -> Unit) { ScreenColumn { Heading("Your privacy matters", "Your data. Your choices.", "Demo preferences reset when the app restarts."); CareCard { Setting("Care reminders", store.reminders) { store.reminders = it }; Setting("Wearable readings", store.wearableSharing) { store.wearableSharing = it }; Setting("Product updates", store.marketing) { store.marketing = it } }; CareCard { listOf("Access history", "Request a correction", "Request account deletion", "Information Officer").forEach { item -> ToolRow(item) { open(item) } } }; Text("Production POPIA compliance requires governance, lawful processing, verified technical controls and a clinical retention schedule. These are UI previews.", style = MaterialTheme.typography.bodySmall) } }
@Composable fun PlansScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Routine", "A healthier rhythm.", "Proposal prices · Phase 2–3 preview"); listOf(Triple("Chronic Routine", "R199 / month", "Monthly check-ins and doctor review"), Triple("Family Planning", "R99 / month", "Scheduled visits and discreet reminders"), Triple("Thuso Mom", "R249 / month", "Pregnancy and baby’s first year"), Triple("Thuso Senior", "R699 / month", "Weekly care and family support"), Triple("Thuso Recover", "Custom pricing", "Personalised recovery support")).forEach { (name, price, description) -> CareCard { Icon(Icons.Outlined.FavoriteBorder, null, tint = Charcoal); Text(name, style = MaterialTheme.typography.titleLarge); Text(description); Text(price, style = MaterialTheme.typography.headlineSmall, color = Indigo); OutlinedButton(onClick = { open(name) }, shape = ThusoButtonShape) { Text("Explore plan") } } } } }
@Composable fun WalletScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Wallet", "A little care, set aside.", "Support your own care or someone you love."); CareCard { Text("Demo balance"); Text("R500.00", style = MaterialTheme.typography.displaySmall, color = Charcoal); ToolRow("Top up wallet") { open("Top up wallet") }; ToolRow("Sponsor care") { open("Sponsor care") }; ToolRow("Care you pay for") { open("Care you pay for") } }; CareCard { Text("Sample activity", style = MaterialTheme.typography.titleMedium); Text("Family care credit   + R500"); Text("Vitals visit   − R249") } } }
/* A clinical workspace navigates as itself.
 *
 * Every role used to open one long screen under the patient's own bottom bar, so a nurse on a
 * doorstep and a Control Tower operator with three late visits both navigated by Home, Book care,
 * Visits, Passport and More. A workspace is not a shop and does not belong under a shop's
 * navigation.
 *
 * Each role now gets its own bottom bar — its own sections, in Compose's own idiom — and each lands
 * on what is waiting and how long it has waited rather than on a catalogue. Nothing was granted by
 * moving it: every vetting route, every application and every clinical sign-off is the same screen
 * it was behind, and the sentence about AI being decision support is at the foot of every section
 * rather than at the foot of one. */
data class WorkspaceSection(val name: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

val workspaceRoles = listOf("Nurse", "Doctor", "Partner", "Control Tower")

/** The same sections, in the same order, as roleNavigation in the web app's App.tsx. */
fun workspaceSections(role: String): List<WorkspaceSection> = when (role) {
    "Doctor" -> listOf(
        WorkspaceSection("Review queue", Icons.Outlined.Inbox),
        WorkspaceSection("Teleconsultation", Icons.Outlined.Videocam),
        WorkspaceSection("Patient context", Icons.Outlined.MonitorHeart),
        WorkspaceSection("Protocols", Icons.Outlined.Book)
    )
    "Partner" -> listOf(
        WorkspaceSection("Orders", Icons.Outlined.Inventory2),
        WorkspaceSection("Collections", Icons.Outlined.LocalShipping),
        WorkspaceSection("Results", Icons.Outlined.Science)
    )
    "Control Tower" -> listOf(
        WorkspaceSection("Dispatch", Icons.Outlined.Sensors),
        WorkspaceSection("Incidents", Icons.Outlined.ReportProblem),
        WorkspaceSection("Vetting queue", Icons.Outlined.VerifiedUser),
        WorkspaceSection("Quality", Icons.Outlined.BarChart)
    )
    else -> listOf(
        WorkspaceSection("Schedule", Icons.Outlined.CalendarMonth),
        WorkspaceSection("Assessments", Icons.Outlined.ContentPaste),
        WorkspaceSection("Thuso Kit", Icons.Outlined.Sensors),
        WorkspaceSection("Earnings", Icons.Outlined.CreditCard),
        WorkspaceSection("Vetting", Icons.Outlined.VerifiedUser)
    )
}

/* What is waiting, and how long it has waited. A workspace that opens with anything else is asking
   the person to go and find the urgent thing themselves. */
fun workspaceUrgency(role: String): List<Triple<String, String, String>> = when (role) {
    "Doctor" -> listOf(
        Triple("Awaiting review", "12", "Longest waiting 3 h 20 m"),
        Triple("Priority reviews", "2", "Flagged out of range"),
        Triple("Reviewed today", "18", "Median 4 m 10 s")
    )
    "Partner" -> listOf(
        Triple("Open orders", "8", "2 past their collection window"),
        Triple("Scheduled collections", "4", "Next 11:15"),
        Triple("Ready for release", "3", "Awaiting a clinician")
    )
    "Control Tower" -> listOf(
        Triple("Active visits", "24", "3 running late"),
        Triple("Available nurses", "18", "4 off duty"),
        Triple("Open incidents", "3", "1 severity high")
    )
    else -> listOf(
        Triple("Next visit", "09:00", "Rosebank · in 40 minutes"),
        Triple("Today’s visits", "3", "One awaiting sign-off"),
        Triple("This week so far", "R 598", "Pays Wednesday")
    )
}

/* What is waiting, at the top of a workspace, before anything else.
 *
 * Three equal boxes is a dashboard; a person opening a workspace has one question — what is waiting
 * and how long has it waited — and the first of the three is the answer. So the first is the wide
 * one with the count at the metric size, and the two behind it are context at half the width. The
 * strip still wraps rather than clipping as the font scale grows. */
@Composable fun WorkspaceUrgency(role: String) {
    val entries = workspaceUrgency(role)
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        entries.firstOrNull()?.let { (label, value, note) ->
            LeadCard(Modifier.semantics(mergeDescendants = true) { contentDescription = "$label: $value. $note" }) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = Indigo)
                Text(value, style = MaterialTheme.typography.displaySmall, color = Charcoal)
                Text(note, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            entries.drop(1).forEach { (label, value, note) ->
                CareCard(
                    Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = "$label: $value. $note" },
                    padding = ThusoSpacing.space12
                ) {
                    Text(label, style = MaterialTheme.typography.bodySmall, color = Faint)
                    Text(value, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                    Text(note, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
            }
        }
    }
}

@Composable fun WorkspaceScreen(role: String, section: String, store: PreviewStore, open: (String) -> Unit) {
    var available by remember { mutableStateOf(true) }
    val landing = workspaceSections(role).first().name == section
    /* A route reads as a route. The workspace names the party it opens rather than its reference,
       because nobody thinks of a colleague as O-802. */
    fun label(route: String) = when {
        route.startsWith("Vetting: ") -> store.vetting.subject(route.removePrefix("Vetting: "))?.let { "Vetting · ${it.name}" } ?: route
        route == "Apply for vetting" -> "Start a vetting application"
        route.startsWith("Apply for vetting: ") -> "Vetting application · ${route.removePrefix("Apply for vetting: ").replaceFirstChar { it.uppercase() }}"
        else -> route
    }
    ScreenColumn {
        /* No eyebrow naming the workspace: the app bar above already says which one this is, and a
           screen that says "Control Tower workspace" twice — once in small capitals underneath
           itself — is spending the reader's first line on something they have just read. */
        if (landing) {
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                Heading("", section, "Role preview for design review, not authentication.")
                DemoBadge()
            }
            WorkspaceUrgency(role)
        } else {
            Heading("", section, "")
        }
        when {
            role == "Nurse" && section == "Schedule" -> {
                CareCard { Setting("Available for visits", available) { available = it } }
                /* First, not last. A nurse coming out of a house with no signal wants one answer
                   before anything else on this screen: is my work safe? */
                CareCard {
                    Text("On this phone", style = MaterialTheme.typography.titleMedium)
                    /* Both queues, counted together. A nurse has not got two queues, so she must not
                       be shown two numbers here and a third somewhere else. */
                    val readingsHeld = store.capture.readings.count { it.state != CaptureState.STORED }
                    val partsHeld = store.visitQueue.parts.count { it.isPending }
                    val needing = store.capture.readings.count { it.state == CaptureState.CONFLICTED } +
                        store.visitQueue.conflicted.size
                    ToolRow("Waiting to send") { open("Visit queue") }
                    Note("$partsHeld ${if (partsHeld == 1) "piece" else "pieces"} of a visit and $readingsHeld reading${if (readingsHeld == 1) "" else "s"} held here · $needing needing a decision")
                    Note("Held on the disk, not in memory. It comes back from a crash, a force-quit and a restart.")
                }
                CareCard {
                    Text("Today’s work", style = MaterialTheme.typography.titleMedium)
                    ToolRow("TH-2048 · Vitals assessment · Rosebank") { open("Visit assessment") }
                    listOf("11:30 · Wound care · Parktown", "14:00 · Mother & baby · Melville").forEach { item -> ToolRow(item) { open(item) } }
                }
                CareCard {
                    Text("More tools", style = MaterialTheme.typography.titleMedium)
                    listOf("Thuso SOS", "Locum shifts", "Academy").forEach { item -> ToolRow(item) { open(item) } }
                }
            }
            role == "Nurse" && section == "Assessments" -> CareCard {
                Text("Start a visit", style = MaterialTheme.typography.titleMedium)
                listOf("Visit assessment", "Patient file", "Consultation record").forEach { item -> ToolRow(item) { open(item) } }
            }
            role == "Nurse" && section == "Thuso Kit" -> CareCard {
                Text("Instruments and what they wrote", style = MaterialTheme.typography.titleMedium)
                listOf("Thuso Kit", "Capture queue", "Visit queue").forEach { item -> ToolRow(item) { open(item) } }
            }
            role == "Nurse" && section == "Earnings" -> CareCard {
                Text("Your money", style = MaterialTheme.typography.titleMedium)
                ToolRow("Earnings & payouts") { open("Earnings & payouts") }
            }
            role == "Nurse" -> CareCard {
                Text("Your vetting", style = MaterialTheme.typography.titleMedium)
                listOf("Vetting: N-205", "Nurse onboarding & vetting", "Apply for vetting: locum").forEach { item -> ToolRow(label(item)) { open(item) } }
            }
            role == "Doctor" && section == "Review queue" -> {
                CareCard {
                    Text("Clinical review queue", style = MaterialTheme.typography.titleMedium)
                    listOf("TH-2048 · Vitals assessment", "TH-2045 · Wound follow-up", "TH-2041 · Prescription request").forEach { item ->
                        ToolRow(item) { open("Doctor review ${item.take(7)}") }
                    }
                }
                CareCard {
                    Text("Your vetting", style = MaterialTheme.typography.titleMedium)
                    listOf("Vetting: D-401", "Apply for vetting: doctor").forEach { item -> ToolRow(label(item)) { open(item) } }
                }
            }
            role == "Doctor" && section == "Teleconsultation" -> CareCard { ToolRow("Teleconsultation") { open("Teleconsultation") } }
            role == "Doctor" && section == "Patient context" -> CareCard {
                Text("Patient records", style = MaterialTheme.typography.titleMedium)
                listOf("Patient file", "Consultation record").forEach { item -> ToolRow(item) { open(item) } }
            }
            role == "Doctor" -> CareCard {
                Text("Your tools", style = MaterialTheme.typography.titleMedium)
                listOf("Clinical protocols", "Referral pathway").forEach { item -> ToolRow(item) { open(item) } }
            }
            role == "Partner" && section == "Orders" -> {
                CareCard {
                    Text("Prescriptions", style = MaterialTheme.typography.titleMedium)
                    ToolRow("RX-0081 · 2 items · Awaiting pharmacist") { open("Prescription RX-0081") }
                    ToolRow("RX-0079 · 1 item · Dispensed, awaiting courier") { open("Prescription RX-0079") }
                }
                /* A partner is vetted as an organisation, and the courier who carries the sample is
                   vetted in his own right. Both refusals reach this queue, so both are reachable. */
                CareCard {
                    Text("Vetting", style = MaterialTheme.typography.titleMedium)
                    ToolRow("Pharmacy vetting · Diepkloof Family Pharmacy") { open("Vetting: P-502") }
                    ToolRow("Start a partner application") { open("Apply for vetting: pharmacy") }
                }
                Note("Sample orders. No live partner API, dispensing or courier handover is connected.")
            }
            role == "Partner" && section == "Collections" -> CareCard {
                Text("Collections", style = MaterialTheme.typography.titleMedium)
                ToolRow("Collection schedule") { open("Collection schedule") }
                ToolRow("Courier vetting · Johannes Pretorius") { open("Vetting: C-702") }
            }
            role == "Partner" -> CareCard {
                Text("Laboratory", style = MaterialTheme.typography.titleMedium)
                ToolRow("LAB-0023 · Fasting panel · Results verified") { open("Laboratory order LAB-0023") }
                ToolRow("LAB-0019 · Sample in transit · Seal intact") { open("Laboratory order LAB-0019") }
                ToolRow("Laboratory vetting · Vaal Diagnostics") { open("Vetting: B-602") }
            }
            role == "Control Tower" && section == "Dispatch" -> CareCard {
                Text("Dispatch", style = MaterialTheme.typography.titleMedium)
                ToolRow("Live dispatch board") { open("Live dispatch board") }
                ToolRow(label("Vetting: O-802")) { open("Vetting: O-802") }
            }
            role == "Control Tower" && section == "Incidents" -> CareCard {
                Text("Open incidents", style = MaterialTheme.typography.titleMedium)
                incidents.forEach { incident ->
                    Column(Modifier.fillMaxWidth()) {
                        ToolRow("${incident.id} · ${incident.title}") { open("Incident ${incident.id}") }
                        Note("${incident.severity} · ${incident.area} · Opened ${incident.opened} · ${incident.status}")
                    }
                }
            }
            role == "Control Tower" && section == "Vetting queue" -> CareCard {
                Text("Vetting", style = MaterialTheme.typography.titleMedium)
                listOf("Vetting pipeline", "Renewals due", "Vetting decision log", "Apply for vetting").forEach { item -> ToolRow(label(item)) { open(item) } }
            }
            else -> CareCard {
                Text("Your tools", style = MaterialTheme.typography.titleMedium)
                listOf("Quality & revenue", "Employer programmes", "Vetting: A-902").forEach { item -> ToolRow(label(item)) { open(item) } }
            }
        }
        Note("AI is decision support. Clinical decisions require an authorised clinician’s sign-off.")
    }
}
