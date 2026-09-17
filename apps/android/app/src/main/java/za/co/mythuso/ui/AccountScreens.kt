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
import za.co.mythuso.model.FramingData
import za.co.mythuso.model.MedicinesData
import za.co.mythuso.model.Passport
import za.co.mythuso.model.PassportSharingData
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.Scheduling
import za.co.mythuso.model.Earnings
import za.co.mythuso.model.VisitPartKind
import za.co.mythuso.model.payWeeks
import za.co.mythuso.model.services
import za.co.mythuso.model.readingSets
import za.co.mythuso.model.householdMemberById
import za.co.mythuso.model.observationRanges
import za.co.mythuso.model.fileTabs
import za.co.mythuso.model.canOpenTab
import za.co.mythuso.model.summarise
import za.co.mythuso.model.passingStates
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
                .background(StudioNight)
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
            when (tab) {
                "Records" -> PassportTimeline(open)
                "Medications" -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    EmptyStateCard("No active prescriptions", "Prescriptions appear here after a registered doctor issues them.")
                    OutlinedButton(onClick = { open("Prescription RX-0081") }, Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape) { Text("Preview a sample prescription") }
                }
                "More" -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space24)) {
                    Section("Connected devices") {
                        StateBlock(deviceState, "Readings from your connected devices", "Health Connect access", { deviceState = LoadState.READY }) {
                            CareCard(padding = ThusoSpacing.space8) {
                                MenuRow("Health Connect", "What would be read, and what never would", Icons.Outlined.MonitorHeart) { open("Health Connect") }
                                HorizontalDivider(color = StudioLine)
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
                        /* Health Passport P1: the emergency card and who opened the record. */
                        PlainRow(PassportSharingData.Card.TITLE_ROUTE, PassportSharingData.Card.INTRO) { open(PassportSharingData.Card.TITLE_ROUTE) }
                        PlainRow(PassportSharingData.Log.TITLE_ROUTE, PassportSharingData.Log.INTRO) { open(PassportSharingData.Log.TITLE_ROUTE) }
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
            .border(1.dp, StudioLine, RoundedCornerShape(ThusoRadius.card)).clickable(onClick = click)
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
                    Text("View and edit your profile", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                }
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = StudioInkMuted)
            }
        }
        Section("Your care") {
            CareCard(padding = ThusoSpacing.space8) {
                LiveWellRow(open)
                HorizontalDivider(color = StudioLine)
                MenuRow("My family", "Manage your loved ones", Icons.Outlined.People) { open("My family") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Care plans", "Ongoing care and subscriptions", Icons.Outlined.FavoriteBorder) { open("Care plans") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Payments", "Cards, history and refunds", Icons.Outlined.CreditCard) { open("Thuso Wallet") }
            }
        }
        Section("Settings") {
            CareCard(padding = ThusoSpacing.space8) {
                MenuRow("Notifications", "Visit updates and messages", Icons.Outlined.Notifications) { open("Notifications") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Privacy & settings", "Your data and app preferences", Icons.Outlined.Tune) { open("Privacy & settings") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Language", "Read MyThuso your way", Icons.Outlined.Language) { open("Language") }
                HorizontalDivider(color = StudioLine)
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
                        if (index < workspaceRoles.size - 1) HorizontalDivider(color = StudioLine)
                    }
            }
            Note("A role preview for design review. Nothing here authenticates anybody or grants access to a record.")
        }
        Section("For design review") {
            CareCard(padding = ThusoSpacing.space8) {
                MenuRow("First-run & recovery", "Sign-up, one-time code and lost access", Icons.Outlined.PersonAdd) { firstRun() }
                HorizontalDivider(color = StudioLine)
                MenuRow("System states", "Loading, error, offline and denied", Icons.Outlined.Layers) { open("System states") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Explore the roadmap", "All 21 modules in the proposal", Icons.Outlined.GridView) { open("Roadmap") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Vetting & verification", "Every party MyThuso vets, and what each is refused until it passes", Icons.Outlined.VerifiedUser) { open("Vetting pipeline") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Patient file", "The clinician-facing record, and what each viewer is refused", Icons.Outlined.FolderShared) { open("Patient file") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Consultation record", "One structure for every encounter, in long form or SOAP", Icons.Outlined.EditNote) { open("Consultation record") }
                HorizontalDivider(color = StudioLine)
                MenuRow("Household record", "One household, and what each member may see of the others", Icons.Outlined.Groups) { open("Household record") }
                HorizontalDivider(color = StudioLine)
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
                    if (index < 14) HorizontalDivider(color = StudioLine)
                }
        }
    }
}
@Composable fun DetailScreen(title: String, store: PreviewStore, open: (String) -> Unit, firstRun: () -> Unit) {
    when {
        title == "Your care team" -> CareTeamScreen(store, open)
        title.startsWith("Clinician: ") -> ClinicianProfileScreen(store, title.removePrefix("Clinician: "))
        title.startsWith("Upcoming visit: ") -> UpcomingVisitScreen(store, title.removePrefix("Upcoming visit: "), open)
        /* One visit's thread with its nurse. Its own route because it is opened from the visit and
           read without it; a closed thread still opens, with what was said. */
        title.startsWith("Visit messages: ") -> VisitThreadScreen(store, title.removePrefix("Visit messages: "))
        title.startsWith("Past visit: ") -> PastVisitScreen(store, title.removePrefix("Past visit: ").toLongOrNull() ?: Passport.latestSet.dayOffset, open)
        title == "Health Passport" -> PassportScreen(open)
        /* The three the passport offered and could not open. A completed visit is looked up by the
           day it happened rather than handed its readings, so a visit and what was measured at it
           cannot disagree — they never met before, which is why they never did. */
        title == "Health trends" -> HealthTrendsScreen(open)
        /* The question a person actually opened the passport with, and the one it answered least:
           what does this number mean. Written text with its own provenance on it — never a model. */
        title == "What your readings mean" -> ExplainReadingsScreen(open)
        title == "Visit summary" -> PastVisitScreen(store, Passport.latestSet.dayOffset, open)
        /* Health Passport P1: the emergency card and who opened the record, routed by the names the generated
           contract gives them, so a renamed screen cannot strand its door. */
        title == PassportSharingData.Card.TITLE_ROUTE -> EmergencyCardScreen(open)
        title == PassportSharingData.Log.TITLE_ROUTE -> PassportAccessLogScreen(open)
        isDevicePermissionScreen(title) -> DevicePermissionScreen(title, open)
        /* A wearable link request, opened from the Health Connect permission screen. It records what the
           patient agreed to and connects nothing. The title is the contract's heading, filled. */
        title == za.co.mythuso.model.Devices.wearableLinkTitle("health-connect") -> WearableLinkScreen("health-connect")
        /* Thuso Ride's responder app, opened from the Control Tower's dispatch section by the contract's own heading. */
        title == za.co.mythuso.model.MovementData.ResponderText.HEADING -> ResponderScreen()
        /* Live well is the patient's own diary and it is a route of its own rather than a tab
           inside the passport, because the passport is what clinicians measured and this is what
           the person said. Putting them behind one door is the blur wellbeing.json's
           no-reading-interpreted refusal is written to prevent. */
        /* The shop is a route of its own rather than a tab beside care. A person comparing the
           price of a thermometer is on a different errand from a person checking a visit, and the
           web app keeps them at separate addresses for the same reason. */
        title == "Shop" -> ShopScreen()
        title == "Live well" -> LiveWellScreen(store, open)
        title == "My family" -> FamilyScreen(store, open)
        /* The payer's own view of what they pay for. Its own route rather than a tab inside the
           family screen: a sponsor is not a guardian, and putting the two behind one door is the
           blur the whole contract is written to prevent. */
        title == "Care you pay for" -> SponsoredCareScreen(store, open)
        title == "Privacy & settings" -> PrivacyScreen(store, open)
        title == za.co.mythuso.model.SosNextOfKinText.heading -> NextOfKinScreen()
        title == "Care plans" -> PlansScreen(open)
        /* MyThuso for Mom by the contract's own name, so renaming the plan cannot strand its screen. */
        title == za.co.mythuso.model.momPlan.name -> MomPlanScreen()
        title == "Thuso Wallet" -> WalletScreen(open)
        /* A group that pays for its members, from the member's side: she is invited and agrees here, as herself.
           Routed by the contract's own heading, so renaming the screen cannot strand its door. */
        title == za.co.mythuso.model.GroupsData.Words.heading -> GroupOptInScreen()
        title == "Language" -> LanguageScreen(store)
        title == "Interpreters" -> InterpretingScreen()
        title == "System states" -> SystemStatesScreen()
        title == "Roadmap" -> RoadmapScreen(store, open)
        title == "First-run & recovery" -> firstRun()
        title == "Invite a guardian" -> InviteGuardianScreen(store) { open("My family") }
        title == "Visit assessment" -> VisitAssessmentScreen(store, close = { open("Nurse workspace") }, open = open)
        /* The visit a nurse accepted from her schedule, and the assessment it is signed off in — opened
           under the visit's own reference, so the sign-off it seals is the one handover and completion
           ask for, and closing it returns to the visit. */
        title == "Care visit" -> CareVisitScreen(store, open)
        title == "Care assessment" -> VisitAssessmentScreen(store, reference = za.co.mythuso.model.CareData.Preview.appointmentRef, close = { open("Care visit") }, open = open)
        /* The whole visit, one level up from the readings. Its own route because it is worth opening
           when no instrument is anywhere near — it is where the morning’s work sits when there is no
           signal, and on this platform it is on the disk rather than in memory. */
        title == "Visit queue" -> VisitQueueScreen(store, open)
        /* Verify in service: the nurse's shift start and door code, and the patient's check of the person at her door. */
        title == "Shift start" -> ShiftStartScreen(store, open)
        title == "Door code" -> NurseDoorCodeScreen(store)
        title == "Door check" -> DoorCheckScreen(store, open)
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
        /* A doctor's per-case fees: the cases Money recorded and a fee nobody has decided. */
        title == "Per-case fees" -> DoctorFeesScreen()
        title == "Thuso SOS" || title == "Emergency & urgent care" -> SosScreen(store)
        /* GilbertOne full screen, for a link; the orb on the patient shell opens the same content in a sheet. */
        title == za.co.mythuso.model.GilbertData.name -> GilbertScreen(store, open)
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
        /* Wave 5: the inbox a review is signed from, named by the contract's own heading. */
        title == za.co.mythuso.model.ClinicalData.InboxText.heading -> ClinicalInboxScreen(store)
        title.startsWith("Prescription ") -> PrescriptionScreen(title.removePrefix("Prescription "))
        title == "Substitution & repeats" -> DispensingScreen(store)
        /* Named by the contract's own heading, so the row that opens it and the screen it opens cannot drift. */
        title == MedicinesData.HandoverText.heading -> MedicinesHandoverScreen()
        title == "Employer programmes" -> ProgrammesScreen(store)
        title.startsWith("Laboratory order ") -> LabOrderScreen(title.removePrefix("Laboratory order "))
        title.startsWith("Incident ") -> IncidentDetailScreen(title.removePrefix("Incident "))
        /* The reference a case is read against. It was the roadmap placeholder; the ranges were in the
           record contract all along. ClinicalDeck.kt says what the screen refuses to draw. */
        title == "Clinical protocols" -> ClinicalProtocolsScreen()
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
            StudioButton(onClick = { store.family.add(name.trim()); name = "" }, enabled = name.isNotBlank(), shape = ThusoButtonShape) { Text("Add demo member") }
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
@Composable fun PrivacyScreen(store: PreviewStore, open: (String) -> Unit) { ScreenColumn { Heading("Your privacy matters", "Your data. Your choices.", "Demo preferences reset when the app restarts."); CareCard { Setting("Care reminders", store.reminders) { store.reminders = it }; Setting("Wearable readings", store.wearableSharing) { store.wearableSharing = it }; Setting("Product updates", store.marketing) { store.marketing = it } }; CareCard { ToolRow(za.co.mythuso.model.SosNextOfKinText.heading) { open(za.co.mythuso.model.SosNextOfKinText.heading) }; listOf("Access history", "Request a correction", "Request account deletion", "Information Officer").forEach { item -> ToolRow(item) { open(item) } } }; Text("Production POPIA compliance requires governance, lawful processing, verified technical controls and a clinical retention schedule. These are UI previews.", style = MaterialTheme.typography.bodySmall) } }
/* Derived, not typed. This screen carried five prices as strings until 14 September 2026, the day the
   R249 Thuso Mom became three MyThuso for Mom tiers on the web and would have stayed R249 here. The
   prices are generated from the business model and mom-plans.json; only each plan's one-line
   description is written here, because it is copy rather than a number. MyThuso for Mom leads, as it
   does in the Blueprint and on the web, and the payments notice is above every price. */
private val planBlurb = mapOf(
    "chronic" to "Monthly check-ins and doctor review", "planning" to "Scheduled visits and discreet reminders",
    "senior" to "Weekly care and family support", "recover" to "Personalised recovery support"
)
@Composable fun PlansScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Routine", "A healthier rhythm.", "Proposal prices · Phase 2–3 preview"); NotConnected("payments"); za.co.mythuso.model.planSubscriptions.filter { it.phase <= 3 }.sortedBy { !it.tiered }.forEach { plan -> CareCard { Icon(Icons.Outlined.FavoriteBorder, null, tint = Charcoal); Text(plan.name, style = MaterialTheme.typography.titleLarge); Text(if (plan.tiered) za.co.mythuso.model.momPlan.payerHeadline else planBlurb[plan.id] ?: plan.includes); Text(planMonthly(plan), style = MaterialTheme.typography.headlineSmall, color = Indigo); OutlinedButton(onClick = { open(plan.name) }, shape = ThusoButtonShape) { Text("Explore plan") } } } } }
@Composable fun WalletScreen(open: (String) -> Unit) { ScreenColumn { Heading("Thuso Wallet", "A little care, set aside.", "Support your own care or someone you love."); CareCard { Text("Demo balance"); Text("R500.00", style = MaterialTheme.typography.displaySmall, color = Charcoal); ToolRow("Top up wallet") { open("Top up wallet") }; ToolRow("Sponsor care") { open("Sponsor care") }; ToolRow("Care you pay for") { open("Care you pay for") }; ToolRow(za.co.mythuso.model.GroupsData.Words.heading) { open(za.co.mythuso.model.GroupsData.Words.heading) } }; CareCard { Text("Sample activity", style = MaterialTheme.typography.titleMedium); Text("Family care credit   + R500"); Text("Vitals visit   − R249") } } }
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

/* ---- The three boards a workspace strip is allowed to speak for ---------------------------------
 *
 * Each of these was a list of strings written inside the card that rendered it, which meant the
 * figures above them had nothing to be counted from and were typed instead. They are data now, and
 * the strip counts them. Nothing here is a real queue: the references, the names and the waiting
 * times are fictional, and the screens that render them say so.
 */

/** One case waiting on a doctor. The waiting time is a field rather than a sentence in the strip,
 *  because the strip's "longest waiting" has to come off the same row the queue shows. */
data class ReviewWaiting(val reference: String, val what: String, val waitingMinutes: Int, val flagged: Boolean)
/* Longest first, because that is the order the queue is worked and what the screen says it is.

   THE SAME THREE CASES USED TO CARRY DIFFERENT MINUTES ON EVERY PLATFORM. TH-2041 was 26 here, 24
   on iOS and 65 on the web; TH-2045 was 74 here, 1 h 05 m on iOS and 22 on the web; and iOS did not
   flag TH-2041 at all, so "Priority reviews" read 2 here and 1 there. One product telling a doctor
   two different things about one queue is the defect the counted-figure rule exists to stop, arrived
   at from the other direction — every figure was counted correctly, off rows that disagreed. The web
   is the source of truth and these are its numbers. */
val doctorReviewQueue = listOf(
    ReviewWaiting("TH-2048", "Vitals assessment", 200, flagged = true),
    ReviewWaiting("TH-2041", "Prescription request", 65, flagged = true),
    ReviewWaiting("TH-2045", "Wound follow-up", 22, flagged = false)
)

/** One prescription on a partner's counter, and what it is waiting for. */
data class PartnerOrder(val reference: String, val items: Int, val waitingFor: String)
val partnerOrders = listOf(
    PartnerOrder("RX-0081", 2, "Awaiting pharmacist"),
    PartnerOrder("RX-0079", 1, "Dispensed, awaiting courier")
)

/** One visit on a nurse's day. The reference is null where the preview has no assessment behind it,
 *  which is what stops the strip claiming a visit is open on this phone when it is not.
 *
 *  It names the catalogue service as well as what the row calls it, because the deck draws the day
 *  to scale and a visit is as long as its own service takes — `CareService.duration` already says an
 *  hour is not the answer for every service, and a day drawn as three equal blocks says it is. */
data class NurseVisit(
    val at: String, val serviceId: String, val service: String, val area: String,
    val reference: String? = null
) {
    val minutes: Int get() = services.firstOrNull { it.id == serviceId }?.duration ?: 0
    val from: Int get() = DeckClock.minuteOf(at)
    val to: Int get() = from + minutes
}
val nurseToday = listOf(
    NurseVisit("09:00", "vitals", "Vitals assessment", "Rosebank", "TH-2048"),
    NurseVisit("11:30", "wound", "Wound care", "Parktown"),
    NurseVisit("14:00", "mother", "Mother & baby", "Melville")
)

/** “3 h 20 m”, “1 h 05 m”, “22 m” — from minutes, so a waiting time is written once and read
 *  everywhere. Padded, because a column of them is read down rather than across. */
internal fun waitedText(minutes: Int): String =
    if (minutes >= 60) "%d h %02d m".format(minutes / 60, minutes % 60) else "$minutes m"

/** A figure in a workspace's strip, in the order it is drawn: the chip floats above the numeral and
 *  says how it is going, the label sits beneath and says what it is. `flagged` marks the one value on
 *  the strip that is out of range, and at most one per strip is the whole point of it — a strip where
 *  every figure is marked has marked nothing.
 *
 *  `shape` is the drawing that belongs to the figure where the role gets a deck rather than a flat
 *  strip. It is presentation and never a second number: whatever is handed in is built from the same
 *  arithmetic as the value beside it, so a reader who distrusts the picture can read the numeral and
 *  a reader who distrusts the numeral can count the picture. ClinicalDeck.kt draws them and says in
 *  full why each one is allowed to exist. */
data class WorkspaceFigure(
    val label: String,
    val value: String,
    val note: String,
    val flagged: Boolean = false,
    val shape: DeckShape? = null
)

/*
 * What is waiting, and how long it has waited. A workspace that opens with anything else is asking
 * the person to go and find the urgent thing themselves.
 *
 * EVERY FIGURE IS COUNTED, and that is the whole of this function's job. All twelve used to be
 * literals, and four of them contradicted the board directly underneath: twenty-four active visits
 * over three rows, eighteen available nurses over a roster of five, four off duty when not one nurse
 * is, and "1 severity high" when the worst open incident is critical. The doctor's strip claimed
 * twelve cases over a queue of three. A person who catches a strip lying once stops believing the
 * strip, and what they stop believing next is the number that mattered.
 *
 * The vetting store is asked for rather than assumed because the dispatch board refuses a nurse
 * whose clearance has lapsed, and a strip that counts her as available has offered an operator
 * somebody the next screen will not let them send.
 */
fun workspaceUrgency(role: String, store: PreviewStore): List<WorkspaceFigure> = when (role) {
    "Doctor" -> {
        val flagged = doctorReviewQueue.count { it.flagged }
        listOf(
            WorkspaceFigure("Awaiting review", "${doctorReviewQueue.size}",
                if (flagged == 0) "All inside their ranges" else "$flagged out of range",
                shape = DeckShape.Ring(doctorReviewQueue.map { it.flagged })),
            WorkspaceFigure("Priority reviews", "$flagged", "Out of range", flagged = flagged > 0,
                shape = DeckShape.Gauge(flagged, doctorReviewQueue.size)),
            WorkspaceFigure("Longest wait", waitedText(doctorReviewQueue.maxOf { it.waitingMinutes }),
                "Oldest in the queue",
                shape = DeckShape.Bars(doctorReviewQueue.map { it.waitingMinutes }))
        )
    }
    "Partner" -> {
        val pharmacist = partnerOrders.count { it.waitingFor.contains("pharmacist", ignoreCase = true) }
        val courier = partnerOrders.count { it.waitingFor.contains("courier", ignoreCase = true) }
        val items = partnerOrders.sumOf { it.items }
        listOf(
            WorkspaceFigure("Open orders", "${partnerOrders.size}", "$items item${if (items == 1) "" else "s"} between them"),
            WorkspaceFigure("Awaiting a pharmacist", "$pharmacist", "Nothing is dispensed until one signs"),
            WorkspaceFigure("Awaiting a courier", "$courier", "Dispensed, not yet collected")
        )
    }
    "Control Tower" -> {
        val urgent = DispatchBoard.awaitingAssignment.count { it.priority == "Urgent" }
        val available = DispatchBoard.available(store.vetting)
        val refused = DispatchBoard.refusedByVetting(store.vetting)
        val open = incidents.filter { it.status != "Closed" }
        /* Counted by severity, in the web's own shape, because the strip used to say "1 severity
           high" over a list whose worst entry is critical — and a reader who sees "high" reaches for
           it after the two things they think are more urgent. */
        val critical = open.count { it.severity == "Critical" }
        val high = open.count { it.severity == "High" }
        listOf(
            WorkspaceFigure("Awaiting assignment", "${DispatchBoard.awaitingAssignment.size}",
                if (urgent == 0) "None is marked urgent" else "$urgent marked urgent"),
            WorkspaceFigure("Nurses available", "$available",
                if (refused > 0) "$refused refused by vetting" else "${DispatchBoard.onAVisit} on a visit"),
            WorkspaceFigure("Open incidents", "${open.size}",
                when {
                    critical > 0 -> "$critical critical"
                    high > 0 -> "$high high"
                    else -> "None is critical or high"
                })
        )
    }
    else -> {
        val next = nurseToday.first()
        /* Real state rather than a sentence: a visit is signed off only if the visit queue is
           holding her sign-off for it. The ring fills the ones she has actually sealed, which is the
           same fact the assessment screen wrote rather than a second opinion kept beside the row. */
        fun signedOff(visit: NurseVisit) = visit.reference
            ?.let { reference -> store.visitQueue.forVisit(reference).any { it.kind == VisitPartKind.SIGN_OFF } } == true
        val signed = nurseToday.count { signedOff(it) }
        val left = nurseToday.size - signed
        val week = Earnings.currentWeek
        listOf(
            /* The area AND the length of the visit, which is what the deck can afford and the flat
               strip could not: every figure has its own column and its own chip line now, so a chip
               that wraps no longer drops the numeral beside it one line lower. The length is the same
               duration the day above it is drawn to. */
            WorkspaceFigure("Next visit", next.at, "${next.area} · ${next.minutes} min",
                shape = DeckShape.Day(
                    nurseToday.map { DeckVisit(it.from, it.to, signedOff(it)) },
                    nurseToday.first().from, nurseToday.last().to
                )),
            WorkspaceFigure("Today’s visits", "${nurseToday.size}",
                if (signed > 0) "$signed signed, $left to go" else "$left to sign off",
                shape = DeckShape.Ring(nurseToday.map { signedOff(it) })),
            WorkspaceFigure("This week", rand(week.total),
                "Pays ${week.pays.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.UK)}",
                shape = DeckShape.Spark(completedWeekTotals()))
        )
    }
}

/* The weeks BEHIND this one, oldest first, so a line drawn from them runs the way time does. Sorted
   on each week's own end date rather than on the order the contract lists them in — the register is
   written newest first and a series drawn in that order would show every week falling. The week in
   progress is deliberately not the last point on it: it is the figure above the line, and a week
   still being added to, drawn as the end of a series, reads as a fall rather than as a week that has
   not finished. */
private fun completedWeekTotals(): List<Int> =
    payWeeks.filter { it.state != "accruing" }.sortedBy { it.ends }.map { it.total }

/* What is waiting, at the top of a workspace, before anything else.
 *
 * TWO ROLES GET AN INSTRUMENT DECK AND TWO KEEP THE FLAT STRIP. A nurse and a doctor open the
 * application on one list and work it for a shift, which is the case a ring and a dial earn their
 * place in: the shape of that list is the thing they need before its first row. The partner and the
 * Control Tower read several boards a day, and a dial on each of six boards is a dashboard rather
 * than a tool. ClinicalDeck.kt draws the deck; everything below is the strip the other two keep.
 *
 * Three equal boxes is a dashboard; a person opening a workspace has one question — what is waiting
 * and how long has it waited — and the first of the three is the answer. So the first is the wide one
 * with the count at the metric size, and the two behind it are context at half the width. The strip
 * still wraps rather than clipping as the font scale grows.
 *
 * The two deck sentences are the web's, word for word (`deckHead` in apps/web/src/shells/
 * StaffShell.tsx). They are a third copy of them and the honest home is packages/catalog/framing.json
 * beside the role framings, which is a generator change rather than a screen one. */
fun deckHead(role: String): Pair<String, String>? = when (role) {
    "Doctor" -> "THE QUEUE AT A GLANCE" to "Every figure is counted off the rows below"
    "Nurse" -> "TODAY AT A GLANCE" to "Every figure is counted off the visits below"
    else -> null
}

@Composable fun WorkspaceUrgency(role: String, store: PreviewStore) {
    val entries = workspaceUrgency(role, store)
    val head = deckHead(role)
    if (head != null) {
        ClinicalDeck(role, head.first, head.second, entries)
        return
    }
    BoxWithConstraints { val room = maxWidth
    /* THE ONE NEAR-BLACK CARD ON THE SCREEN, AND IT CARRIES WHAT IS WAITING RIGHT NOW.
       The strip was a pale sage lead card with two white cards beside it, which was the right answer
       against a grey ground and is the previous generation's accent against a cream one. It is
       studioNight now, which is what the prototype gives the thing that is live — and for somebody
       holding a phone on a doorstep the thing that is live is the count of what has not been done.

       The figures were upside down as well as the wrong colour: a small label above a large value
       above a note, where docs/DESIGN-LANGUAGE.md asks for *a status chip floating above a large
       light numeral, with a small label beneath*. The note is the chip, the value is the numeral and
       the label sits under it, so the strip reads the way every other metric in the product does. */
    StudioNightCard {
        entries.firstOrNull()?.let { figure ->
            StudioNightFigure(
                figure.label, figure.value, figure.note, lead = true, flagged = figure.flagged,
                modifier = Modifier.semantics(mergeDescendants = true) {
                    contentDescription = "${figure.label}: ${figure.value}. ${figure.note}"
                }
            )
        }
        /* Two half-width cards, until half is not a width any more.
           At the largest font scale on a tablet-shaped window the rail takes 110dp off the row, and
           half of what is left held about six characters: “Nurses available” came back as
           “Nurse / s / availa / ble” and “1 refused by vetting” as four more lines of the same. The
           font-scale suite passes that — nothing is truncated and nothing is squeezed to nought —
           and it is still not a thing anybody can read at a glance, which is the only thing this
           strip is for.
           The threshold is the narrowest screen this app supports rather than a number chosen for
           this row: docs/ACCESSIBILITY.md holds every layout to 320dp without horizontal overflow,
           so a pair of cards that cannot have that much between them is a pair that should be one
           column. Above it they sit side by side exactly as before. */
        val stacked = room < 320.dp
        @Composable fun figure(entry: WorkspaceFigure, modifier: Modifier) {
            StudioNightFigure(
                entry.label, entry.value, entry.note, flagged = entry.flagged,
                modifier = modifier.semantics(mergeDescendants = true) {
                    contentDescription = "${entry.label}: ${entry.value}. ${entry.note}"
                }
            )
        }
        if (stacked) entries.drop(1).forEach { figure(it, Modifier.fillMaxWidth()) }
        else Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
            entries.drop(1).forEach { figure(it, Modifier.weight(1f)) }
        }
    } }
}

/* The sections behind a landing that are drawn as decks. A nurse's four and the doctor's two the
   founder named; the doctor's teleconsultation, the partner and the Control Tower keep the plain
   heading, because nobody asked for them and a deck on every tab is a deck that has stopped leading. */
private fun sectionDeck(role: String, section: String) =
    (role == "Nurse" && section in listOf("Assessments", "Thuso Kit", "Earnings", "Vetting")) ||
        (role == "Doctor" && section in listOf("Patient context", "Protocols"))

/* A section behind the landing, in the deck's grammar rather than as a heading over a grey pill.
 *
 * The screen was a sentence-case title and one white card holding one pill, which is what the founder
 * meant by boring: it told a nurse where a door was and nothing about what was behind it. The canvas
 * now names the section with the tab's own glyph inside the headline, carries the section's sentence
 * from the framing contract, and puts the one figure the section can honestly count on glass. The
 * door itself is the raised card standing on the canvas's edge. Every section still says it is a
 * preview, on the canvas, in DemoBadge's own words. */
@Composable private fun SectionDeck(
    eyebrow: String, section: String, icon: androidx.compose.ui.graphics.vector.ImageVector,
    figure: @Composable ColumnScope.() -> Unit, lead: @Composable ColumnScope.() -> Unit
) {
    DeckHero(
        wrap = false,
        content = {
            DeckPreviewMark()
            DeckHeadline(eyebrow, listOf(DeckWord.Words(section), DeckWord.Glyph(icon)), tail = FramingData.blurb(section))
            DeckGlassCard(content = figure)
        },
        sheet = lead
    )
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
        /* THE SECTION A ROLE LANDS ON IS FRAMED; THE OTHERS ARE LABELLED.
           The landing opens with the role's own two-tone headline and keeps the preview disclosure
           immediately under it, word for word. Every other section keeps the plain heading it had: a
           display headline on all four of a role's tabs would be four claims of the same size, which
           is the inverse of what a display size is for. */
        /* The words are packages/catalog/framing.json's, generated into FramingData.kt and into
           iOS's FramingData.swift from the one file. They were typed here and typed again on iOS,
           with a comment in each admitting the honest home was a contract; this is that contract. A
           role the contract has not framed falls through to the plain heading rather than borrowing
           the nurse's words, which is what the when expression's else branch used to do silently. */
        val framing = if (landing) FramingData.forRole(role) else null
        if (framing != null) {
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                StudioHeadline(framing.lead, framing.accent, "Role preview for design review, not authentication.")
                DemoBadge()
            }
            WorkspaceUrgency(role, store)
        } else if (!sectionDeck(role, section)) {
            Heading("", section, "")
        }
        when {
            role == "Nurse" && section == "Schedule" -> {
                CareCard { Setting("Available for visits", available) { available = it } }
                /* An offer is a decision about the day, so it is read directly under whether she is
                   taking visits at all. Off duty it shows nothing new; a visit she has taken still shows. */
                CareOfferCard(store, available, open)
                /* Verify: her shift start, which says no face match was performed, and the code she shows at a door. */
                CareCard {
                    Text(za.co.mythuso.model.VerifyInServiceData.ShiftText.heading, style = MaterialTheme.typography.titleMedium)
                    ToolRow(za.co.mythuso.model.VerifyInServiceData.ShiftText.heading) { open("Shift start") }
                    ToolRow(za.co.mythuso.model.VerifyInServiceData.NurseDoorText.heading) { open("Door code") }
                }
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
                /* The same three rows the strip above counts. They were written here as strings and
                   counted nowhere, which is how “Today’s visits · 3” came to be a literal beside a
                   list that could have said it. */
                CareCard {
                    Text("Today’s work", style = MaterialTheme.typography.titleMedium)
                    nurseToday.forEach { visit ->
                        val label = "${visit.reference ?: visit.at} · ${visit.service} · ${visit.area}"
                        ToolRow(label) { open(if (visit.reference != null) "Visit assessment" else label) }
                    }
                }
                CareCard {
                    Text("More tools", style = MaterialTheme.typography.titleMedium)
                    listOf("Thuso SOS", "Locum shifts", "Academy").forEach { item -> ToolRow(item) { open(item) } }
                    ToolRow(MedicinesData.HandoverText.heading) { open(MedicinesData.HandoverText.heading) }
                }
            }
            role == "Nurse" && section == "Assessments" -> {
                /* Counted off the contract's seven readings and the visit queue's own record of which of
                   them this phone holds for TH-2048 — the visit the first destination opens. */
                val taken = observationRanges.map { store.capture.standingFor("TH-2048", it.id) != null }
                SectionDeck("Start a visit", section, Icons.Outlined.ContentPaste, figure = {
                    DeckFigure(
                        value = "${taken.count { it }}", label = "of ${observationRanges.size} readings taken for TH-2048 on this phone",
                        chip = "Visit assessment · TH-2048", shape = DeckShape.Ring(taken)
                    )
                }) {
                    DeckDestination("Visit assessment", "Identity, consent, readings, findings, sign-off", Icons.Outlined.ContentPaste, raised = true) { open("Visit assessment") }
                }
                DeckSectionHead("Patient records")
                DeckDestination("Patient file", "${fileTabs.size} tabs, gated on vetting", Icons.Outlined.FolderShared) { open("Patient file") }
                DeckDestination("Consultation record", "One structure for every encounter", Icons.Outlined.EditNote) { open("Consultation record") }
            }
            role == "Nurse" && section == "Thuso Kit" -> {
                val held = store.capture.readings.filter { it.state != CaptureState.STORED }
                val needing = held.count { it.state == CaptureState.CONFLICTED }
                SectionDeck("Instruments and what they wrote", section, Icons.Outlined.Sensors, figure = {
                    DeckFigure(
                        value = "${held.size}", label = "readings held on this phone, not yet sent",
                        chip = if (needing > 0) "$needing needing a decision" else "None needing a decision", flagged = needing > 0,
                        shape = DeckShape.Ring(held.map { it.state == CaptureState.CONFLICTED })
                    )
                }) {
                    DeckDestination("Thuso Kit", "Pairing, calibration and where a reading came from", Icons.Outlined.Sensors, raised = true) { open("Thuso Kit") }
                }
                DeckDestination("Capture queue", "", Icons.Outlined.Inventory2) { open("Capture queue") }
                DeckDestination("Visit queue", "", Icons.Outlined.Inbox) { open("Visit queue") }
            }
            role == "Nurse" && section == "Earnings" -> {
                val week = Earnings.currentWeek
                SectionDeck("Your money", section, Icons.Outlined.CreditCard, figure = {
                    DeckFigure(
                        value = rand(week.total).removePrefix("R "), prefix = "R", label = "This week so far",
                        chip = "Pays ${week.pays.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.UK)}",
                        shape = DeckShape.Spark(completedWeekTotals())
                    )
                }) {
                    DeckDestination("Earnings & payouts", "What a visit paid, and what a suspension never touches", Icons.Outlined.CreditCard, raised = true) { open("Earnings & payouts") }
                }
            }
            role == "Nurse" -> {
                val self = store.vetting.subject("N-205")
                val standing = self?.let { summarise(it) }
                SectionDeck("Your vetting", section, Icons.Outlined.VerifiedUser, figure = {
                    if (standing != null) DeckFigure(
                        value = "${standing.passed}", label = "of ${standing.total} checks in date",
                        chip = standing.status.label, flagged = !standing.cleared,
                        shape = DeckShape.Ring(standing.states.map { it.second in passingStates })
                    )
                }) {
                    DeckDestination(label("Vetting: N-205"), "Every check, and what each one gates", Icons.Outlined.VerifiedUser, raised = true) { open("Vetting: N-205") }
                }
                DeckDestination(label("Nurse onboarding & vetting"), "What a nurse must produce before a visit", Icons.Outlined.PersonAdd) { open("Nurse onboarding & vetting") }
                DeckDestination(label("Apply for vetting: locum"), "The same bar, for a shift rather than a post", Icons.Outlined.Schedule) { open("Apply for vetting: locum") }
            }
            role == "Doctor" && section == "Review queue" -> {
                /* The queue the strip above counts, and the waiting time is on the row as well as in
                   the figure over it: a “longest waiting” a reader cannot find in the list is a
                   number they have to take on trust, which is how the strip came to say twelve. */
                CareCard {
                    Text("Clinical review queue", style = MaterialTheme.typography.titleMedium)
                    doctorReviewQueue.forEach { waiting ->
                        ToolRow("${waiting.reference} · ${waiting.what} · waiting ${waitedText(waiting.waitingMinutes)}") {
                            open("Doctor review ${waiting.reference}")
                        }
                    }
                    ToolRow(za.co.mythuso.model.ClinicalData.InboxText.heading) { open(za.co.mythuso.model.ClinicalData.InboxText.heading) }
                }
                CareCard {
                    Text("Your vetting", style = MaterialTheme.typography.titleMedium)
                    listOf("Vetting: D-401", "Apply for vetting: doctor").forEach { item -> ToolRow(label(item)) { open(item) } }
                }
                CareCard {
                    Text("Your fees", style = MaterialTheme.typography.titleMedium)
                    ToolRow("Per-case fees") { open("Per-case fees") }
                }
            }
            role == "Doctor" && section == "Teleconsultation" -> CareCard { ToolRow("Teleconsultation") { open("Teleconsultation") } }
            role == "Doctor" && section == "Patient context" -> {
                /* The file opens as D-401, so the ring is what D-401 may open of it, counted by the same
                   canOpenTab the file's own tabs are drawn from. */
                val doctor = store.vetting.subject("D-401")
                val openTabs = doctor?.let { reader -> fileTabs.map { canOpenTab(reader, it).allowed } }.orEmpty()
                SectionDeck("Patient records", section, Icons.Outlined.MonitorHeart, figure = {
                    DeckFigure(
                        value = "${openTabs.count { it }}", label = "of ${fileTabs.size} sections of a patient file open to ${doctor?.name ?: "this doctor"}",
                        chip = doctor?.let { summarise(it).status.label }, shape = DeckShape.Ring(openTabs)
                    )
                }) {
                    DeckDestination("Patient file", "${fileTabs.size} tabs, gated on vetting", Icons.Outlined.FolderShared, raised = true) { open("Patient file") }
                }
                DeckDestination("Consultation record", "One structure for every encounter", Icons.Outlined.EditNote) { open("Consultation record") }
            }
            role == "Doctor" -> {
                SectionDeck("Your tools", section, Icons.Outlined.Book, figure = {
                    DeckFigure(value = "${observationRanges.size}", label = "readings, and the indicative adult range each is flagged against")
                }) {
                    DeckDestination("Clinical protocols", "The reference a case is read against", Icons.Outlined.Straighten, raised = true) { open("Clinical protocols") }
                }
                DeckDestination("Referral pathway", "", Icons.AutoMirrored.Outlined.Send) { open("Referral pathway") }
            }
            role == "Partner" && section == "Orders" -> {
                CareCard {
                    Text("Prescriptions", style = MaterialTheme.typography.titleMedium)
                    partnerOrders.forEach { order ->
                        ToolRow("${order.reference} · ${order.items} item${if (order.items == 1) "" else "s"} · ${order.waitingFor}") {
                            open("Prescription ${order.reference}")
                        }
                    }
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
                ToolRow(za.co.mythuso.model.MovementData.ResponderText.HEADING) { open(za.co.mythuso.model.MovementData.ResponderText.HEADING) }
            }
            /* The field-safety queue leads the section: a nurse in trouble is picked up before the
               register of what went wrong last week is read. */
            role == "Control Tower" && section == "Incidents" -> Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
                SafetyDeskSection()
                CareCard {
                    Text("Open incidents", style = MaterialTheme.typography.titleMedium)
                    incidents.forEach { incident ->
                        Column(Modifier.fillMaxWidth()) {
                            ToolRow("${incident.id} · ${incident.title}") { open("Incident ${incident.id}") }
                            Note("${incident.severity} · ${incident.area} · Opened ${incident.opened} · ${incident.status}")
                        }
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
