package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.model.*

/*
 * The clinician-facing patient file: what a nurse or a doctor opens *about somebody else*. It is
 * not the Health Passport, which is the patient's own view of their own record, and neither
 * replaces the other — the audience is different, so the refusals are different too.
 *
 * What has to be known immediately is in a header that stays above every tab; the depth is behind
 * the eight tabs, which are the whole of the contract's navigation. The 42 record types are the
 * data model, not the menu.
 *
 * Everything below asks can(subject, capability) before it draws. Nothing here is a security
 * control: this is a preview with no server, and a gate drawn on a phone gates nothing. It is the
 * design of one, and it is honest about what it refuses so the refusals can be reviewed before they
 * are built.
 */

/* One party per interesting answer, so a design review can watch the same file change shape rather
   than read a paragraph claiming it would. Two of them are refused nearly everything: a nurse whose
   SAPS clearance lapsed nine days ago and a doctor whose HPCSA registration lapsed four days ago —
   neither by anybody's decision, both by arithmetic on an expiry date. */
private val fileViewerIds = listOf("D-401", "N-201", "N-204", "D-402", "P-501", "G-032", "O-801", "A-901")

/* view-patient-summary is one capability, but the vetting contract writes a different sentence for
   each role that holds it, and those sentences do not describe the same summary. An operator “sees
   an address, a service and a window — never a clinical record”; a pharmacy “sees the prescription
   and the allergies that bear on filling it. Nothing else.” Giving all three the same header
   because they share a capability id would be a gate that reads the contract's key and ignores its
   words. So the field groups are narrowed per role, and the role's own sentence is printed under
   the header as the reason. */
private data class HeaderProfile(val facts: List<String>, val chips: List<String>)
/* The name is the heading, so it is not repeated as a row. Everything else earns one. */
private val fullHeaderProfile = HeaderProfile(
    listOf("id", "dob", "sex", "mobile", "aid", "emergency", "facility"),
    listOf("blood", "allergy", "chronic", "aid")
)
private val headerProfiles = mapOf(
    "operator" to HeaderProfile(listOf("id", "mobile", "address", "service", "window"), emptyList()),
    "pharmacy" to HeaderProfile(listOf("id", "dob", "sex", "mobile", "facility"), listOf("blood", "allergy"))
)
private fun headerProfileFor(roleId: String) = headerProfiles[roleId] ?: fullHeaderProfile
private fun viewerLabel(subject: VettingSubject) = "${subject.name} · ${vettingRoleById(subject.roleId)?.name}"
private fun grantSentence(roleId: String, capability: String): String? =
    vettingRoleById(roleId)?.grants?.firstOrNull { it.capability == capability }?.refusal

@Composable fun PatientFileScreen(store: PreviewStore, open: (String) -> Unit) {
    val viewers = remember(store) { fileViewerIds.mapNotNull { store.vetting.subject(it) } }
    var patientId by remember { mutableStateOf(filePatients.first().id) }
    var viewerId by remember { mutableStateOf(viewers.first().id) }
    var tabName by remember { mutableStateOf(fileTabs.first().name) }
    var state by remember { mutableStateOf(LoadState.READY) }
    var notice by remember { mutableStateOf("") }
    val patient = filePatientById(patientId) ?: filePatients.first()
    val viewer = viewers.firstOrNull { it.id == viewerId } ?: viewers.first()
    val tab = fileTabs.firstOrNull { it.name == tabName } ?: fileTabs.first()
    val decision = canOpenTab(viewer, tab)
    val refused = fileTabs.count { !canOpenTab(viewer, it).allowed }
    val role = vettingRoleById(viewer.roleId)
    val status = summarise(viewer).status
    val move: (String) -> Unit = { name -> tabName = name; notice = "" }

    val clinical = can(viewer, "view-clinical-record")
    val latest = patient.vitals.last()

    ScreenColumn {
        /* THE FILE OPENS ON A DECK, AND THE HEADLINE IS THE FILE'S NAME RATHER THAN THE PATIENT'S.
           A viewer refused the patient summary is told "The file is open. The person is not." — so the
           patient's name may not be the largest word on the screen above that sentence. The name stays
           where it always was, inside the summary, which is the sheet standing on the canvas's edge and
           asks the vetting module before it draws a single fact.
           The two choices a design review turns on are pill clusters directly under it. The ring is the file's eight sections with the open ones
           lit, counted by the same canOpenTab the tabs below are drawn from; the panel is the last
           blood pressure with the systolic trend behind it, drawn finished, and it is a refusal in
           words for anybody the clinical record is refused to. */
        DeckHero(
            content = {
                DeckPreviewMark()
                DeckHeadline(
                    "Clinical",
                    listOf(DeckWord.Words(thuso(Phrase.PATIENT_FILE, store.locale)), DeckWord.Glyph(Icons.Outlined.FolderShared)),
                    tail = "The file a nurse or a doctor opens about somebody else. Fictional patients, fictional numbers; nothing here is a record and nothing reaches a service."
                )
                DeckGlassCard {
                    DeckFigure(
                        value = "${fileTabs.size - refused}", label = "of ${fileTabs.size} sections open to ${viewer.name}",
                        chip = "${status.label} · ${role?.name ?: viewer.roleId}",
                        flagged = status != SubjectStatus.CLEARED && status != SubjectStatus.EXPIRING,
                        shape = DeckShape.Ring(fileTabs.map { canOpenTab(viewer, it).allowed })
                    )
                }
                DeckPanel {
                    if (clinical.allowed) DeckFigure(
                        value = "${latest.systolic}/${latest.diastolic}", unit = "mmHg",
                        label = "Blood pressure, ${longDate(latest.at)}",
                        chip = provenanceById(latest.bloodPressureFrom)?.label,
                        shape = DeckShape.Spark(patient.vitals.map { it.systolic }), ground = DeckGround.PANEL, still = true
                    ) else {
                        Text("Observations are not open to this viewer", style = MaterialTheme.typography.titleSmall, color = DeckInk.panelInk)
                        Text(clinical.reason.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = DeckInk.panelQuiet)
                    }
                }
            },
            sheet = { SummaryHeaderBody(patient, viewer) }
        )
        /* The review controls, directly under the file rather than on its canvas. Eight viewers set as
           pills on the night made the deck nearly two screens tall before the file began, and the file is
           what the deck is for. Nothing about the demonstration moved: every option is still visible at
           once, and the ring on the glass above answers the moment a pill is pressed. */
        DeckSectionHead(
            "The same file, through different eyes",
            note = "Every tab, action and field group below asks the vetting module whether this party may see it. Change the viewer and watch the file change shape — that is the demonstration, and it is the only way to tell whether a refusal was designed or assumed."
        )
        DeckPills("Open the file of", patient.id, filePatients.map { it.id to it.name }, onNight = false) { patientId = it; notice = "" }
        /* The pill carries the role as well as the name, because “Kagiso Molefe” does not tell a
           reviewer that the next tap is a Control Tower operator, and that is the whole point of the
           switch. */
        DeckPills(thuso(Phrase.VIEWING_AS, store.locale), viewer.id, viewers.map { it.id to viewerLabel(it) }, onNight = false) { viewerId = it; notice = "" }
        Text(
            "$refused of ${fileTabs.size} sections are refused to this viewer.",
            style = MaterialTheme.typography.labelLarge, color = StudioInkMuted,
            modifier = Modifier.semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = "${patient.name}, ${patient.id}. Viewing as ${viewer.name}, " +
                    "${role?.name?.lowercase() ?: viewer.roleId}. $tabName is ${if (decision.allowed) "open" else "refused"}. " +
                    "$refused of ${fileTabs.size} sections are refused to this viewer."
            }
        )
        WithheldNotice(viewer)
        FileTabRow(viewer, tabName, move)
        StatePicker("Preview how this file behaves when the record service is unavailable", state) { state = it }
        StateBlock(state, "This patient file", "clinical record access", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Note(tab.holds)
                if (!decision.allowed) RefusalCard("$tabName — not open to this viewer", decision)
                else when (tabName) {
                    "Overview" -> FileOverview(patient, viewer, notice, { notice = it }, move)
                    "Timeline" -> FileTimeline(patient, viewer)
                    "Consultations" -> FileConsultations(patient, viewer)
                    "Medication" -> FileMedication(patient, viewer, open)
                    "Results" -> FileResults(patient, viewer, open)
                    "Referrals" -> FileReferrals(patient, viewer)
                    "Documents" -> FileDocuments(patient, viewer)
                    else -> FileBilling(patient, viewer)
                }
                Note(tab.notBuilt)
            }
        }
    }
}

/* ---- The tabs --------------------------------------------------------------------------------
   A refused tab is still a tab. Hiding it would teach a clinician that this file has six sections,
   which is a quieter kind of lie than a lock. */
/* Pills in the deck's own shape rather than Material FilterChips, so the tab row and the two clusters
   on the canvas above it read as one family of control. The chosen tab is the night filled; a refused
   tab carries a lock AND says so to TalkBack, never only a tint. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun FileTabRow(viewer: VettingSubject, current: String, move: (String) -> Unit) {
    val shape = RoundedCornerShape(if (LocalDensity.current.fontScale >= 1.3f) ThusoRadius.control else ThusoRadius.pill)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        fileTabs.forEach { tab ->
            val unlocked = canOpenTab(viewer, tab).allowed
            val on = tab.name == current
            Row(
                Modifier.heightIn(min = TouchTarget).clip(shape).background(if (on) StudioNight else SurfaceWhite, shape)
                    .border(1.dp, if (on) Color.Transparent else StudioInkMuted, shape)
                    .clickable(role = Role.Tab) { move(tab.name) }
                    .semantics {
                        selected = on
                        contentDescription = if (unlocked) tab.name else "${tab.name} — refused to this viewer"
                    }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (!unlocked) Icon(Icons.Outlined.Lock, null, tint = if (on) StudioPaper else Danger, modifier = Modifier.size(15.dp))
                Text(tab.name, style = MaterialTheme.typography.labelLarge, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (on) StudioPaper else Charcoal)
            }
        }
    }
}

/* ---- Refusals --------------------------------------------------------------------------------
   A refused thing says the sentence the vetting contract wrote for it, and names the checks that
   are standing in the way. A greyed control with no explanation teaches a clinician that the system
   is broken; a sentence teaches them what to do next. */
@Composable private fun RefusalCard(title: String, decision: VettingDecision) {
    CareCard { RefusalBody(title, decision) }
}
/** The same refusal without a card of its own, for the places already standing inside one. */
@Composable private fun ColumnScope.RefusalBody(title: String, decision: VettingDecision) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Outlined.Lock, null, tint = Danger)
        Text(title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
    }
    Text(decision.reason.orEmpty(), style = MaterialTheme.typography.bodyMedium)
    if (decision.blockedBy.isNotEmpty()) Note("Outstanding: ${decision.blockedBy.joinToString(" · ") { it.name }}")
}
/* An entry the viewer holds a release for is marked, so nobody reads it aloud in a room with
   somebody else in it. Only a reader who already holds the release ever sees the marker, so it
   discloses nothing it has not already disclosed. */
@Composable private fun ReleasedTag(item: Sensitive) {
    if (isProtected(item)) StatusPill("Protected · released to you", "amber")
}

/* ---- The permanent header --------------------------------------------------------------------
   Above every tab, because the thing a nurse needs at a glance is not on the tab she happens to
   have open. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun ColumnScope.SummaryHeaderBody(patient: PatientRecord, viewer: VettingSubject) {
    val decision = can(viewer, "view-patient-summary")
    val profile = headerProfileFor(viewer.roleId)
    val scope = grantSentence(viewer.roleId, "view-patient-summary")
    /* A protected condition never becomes a chip — not for a nurse, not for a doctor holding a
       release, not for anybody. This header is read over a shoulder in a living room. */
    val chronic = patient.conditions.filter { !isProtected(it) }.map { it.name }
    val facts = mapOf(
        "id" to ("Patient ID" to patient.id),
        "dob" to ("Date of birth" to "${longDate(patient.dob)} · ${ageFrom(patient.dob)} years"),
        "sex" to ("Sex" to patient.sex),
        "mobile" to ("Mobile" to patient.mobile),
        "aid" to ("Medical aid" to "${patient.medicalAid.scheme} · ${patient.medicalAid.plan}"),
        "emergency" to ("Emergency contact" to "${patient.emergency.name} · ${patient.emergency.relationship} · ${patient.emergency.mobile}"),
        "facility" to ("Preferred facility" to patient.facility),
        "address" to ("Address" to patient.address),
        "service" to ("Service booked" to patient.service),
        "window" to ("Window" to patient.window)
    )
    val chips = listOf(
        Triple("blood", "Blood group" to patient.bloodGroup, ""),
        Triple("allergy", "Allergies" to (patient.allergies.takeIf { it.isNotEmpty() }
            ?.joinToString(" · ") { "${it.substance} — ${it.reaction.lowercase()}" } ?: "None recorded"),
            if (patient.allergies.isNotEmpty()) "danger" else "amber"),
        Triple("chronic", "Chronic conditions" to (chronic.takeIf { it.isNotEmpty() }?.joinToString(" · ") ?: "None recorded"), ""),
        Triple("aid", "Medical aid status" to patient.medicalAid.status, patient.medicalAid.tone)
    )
    run {
        if (!decision.allowed) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TileIcon(Icons.Outlined.PersonOutline)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Patient ${patient.id}", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note("The file is open. The person is not.")
                }
            }
            RefusalBody("The patient summary is not open to this viewer", decision)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(46.dp).background(IndigoSoft, CircleShape), Alignment.Center) {
                    Text(
                        patient.name.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString(""),
                         style = MaterialTheme.typography.titleMedium, color = IndigoDeep
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(patient.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note("${patient.id} · ${patient.sex} · ${ageFrom(patient.dob)} years")
                }
            }
            profile.facts.forEach { id -> facts[id]?.let { ReviewLine(it.first, it.second) } }
            if (profile.chips.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    chips.filter { it.first in profile.chips }.forEach { (_, pair, tone) ->
                        HeaderChip(pair.first, pair.second, tone)
                    }
                }
            }
            if (scope != null) Note("The header is cut to this role’s own words in the vetting contract: “$scope”")
        }
    }
}
/** A chip is read aloud as one sentence, because “Allergies” and “Penicillin” in two swipes is two
    facts a clinician has to reassemble. */
@Composable private fun HeaderChip(key: String, value: String, tone: String) {
    val (background, foreground) = when (tone) {
        "danger" -> DangerSoft to Danger
        "amber" -> MangoSoft to MangoInk
        else -> IndigoSoft to IndigoDeep
    }
    Column(
        Modifier.background(background, RoundedCornerShape(ThusoRadius.control)).padding(horizontal = 12.dp, vertical = 8.dp)
            .semantics(mergeDescendants = true) { contentDescription = "$key: $value" },
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(key, style = MaterialTheme.typography.labelMedium, color = foreground.copy(alpha = 0.85f))
        Text(value, style = MaterialTheme.typography.labelMedium, color = foreground)
    }
}

/* ---- The withheld notice ---------------------------------------------------------------------
   The rule this whole surface exists to get right. It is written once, appears on every file, and
   reads identically whether the patient has three protected entries or none: a notice that turned
   up only when there was something behind it would disclose the thing it is hiding, as surely as a
   chip reading “Chronic: HIV” would. So there is no count, no category name and no difference
   between one patient and the next. */
/* The categories are the contract's, so the sentence is assembled from them rather than typed out
   beside them: a category added to the contract is named here without anybody editing this screen.
   Only the casing is ours, and an initialism keeps its capitals — “hIV” would be a category nobody
   recognises in the one sentence that has to be recognised. */
private val withheldCategorySentence: String = run {
    val terms = protectedCategories.mapIndexed { index, term ->
        if (index == 0 || (term.length > 1 && term[1].isUpperCase())) term
        else term.replaceFirstChar { it.lowercase() }
    }
    val list = if (terms.size < 2) terms.joinToString() else terms.dropLast(1).joinToString(", ") + " and " + terms.last()
    "$list are never a chip — and this notice stands on every file, whether or not anything is held behind it."
}
@Composable private fun WithheldNotice(viewer: VettingSubject) {
    val decision = can(viewer, "view-protected-record")
    val ask = if (decision.allowed)
        "Vetted is not released: the patient releases a category entry by entry, in their own account, naming you. Ask them."
    else "${decision.reason.orEmpty()} Ask the patient, or the clinician they released it to."
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Lock, null, tint = Charcoal)
            Text("A category is withheld from this header.", style = MaterialTheme.typography.titleSmall, color = Charcoal)
        }
        Text(recordSummaryCard.withheld, style = MaterialTheme.typography.bodyMedium)
        Text(withheldCategorySentence, style = MaterialTheme.typography.bodyMedium)
        Note(ask)
    }
}

/* ---- Overview --------------------------------------------------------------------------------
   Three cards, the latest observations, four bullets and the last few events. Visual on purpose: a
   wall of text is read by nobody standing in a doorway. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun FileOverview(
    patient: PatientRecord, viewer: VettingSubject,
    notice: String, setNotice: (String) -> Unit, go: (String) -> Unit
) {
    val clinical = can(viewer, "view-clinical-record")
    /* The medicine card is reached the way the Medication tab is reached, not through the summary
       capability: a pharmacy holds neither the clinical record nor a reason to be told “no medicine
       is visible” when what it actually holds is dispense. */
    val medicines = canAny(viewer, listOf("view-clinical-record", "dispense"))
    val latest = patient.vitals.last()
    val recent = timelineFor(patient).filter { canOpen(viewer, it).allowed }.take(4)
    val current = patient.medication.filter { it.stopped == null && canOpen(viewer, it).allowed }

    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.CalendarMonth, null, tint = Charcoal, modifier = Modifier.size(17.dp))
            Text("Last visit", style = MaterialTheme.typography.labelLarge, color = StudioInkMuted)
        }
        if (clinical.allowed) {
            Text(shortDate(patient.lastVisit.at), style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(patient.lastVisit.service, style = MaterialTheme.typography.bodyMedium)
            Note("${patient.lastVisit.by} · ${patient.lastVisit.outcome}")
        } else RefusalBody("Withheld", clinical)
    }
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.EventAvailable, null, tint = Charcoal, modifier = Modifier.size(17.dp))
            Text("Next appointment", style = MaterialTheme.typography.labelLarge, color = StudioInkMuted)
        }
        val next = patient.nextAppointment
        if (next != null) {
            Text("${shortDate(next.at)} · ${next.time}", style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(next.service, style = MaterialTheme.typography.bodyMedium)
            Note(next.place)
        } else Note("Nothing is booked. A missed appointment and an unbooked one are not the same thing, and this file does not blur them.")
    }
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Medication, null, tint = Charcoal, modifier = Modifier.size(17.dp))
            Text("Current medication", style = MaterialTheme.typography.labelLarge, color = StudioInkMuted)
        }
        when {
            !medicines.allowed -> RefusalBody("Withheld", medicines)
            current.isEmpty() -> Note("Nothing is currently prescribed.")
            else -> {
                Text("${current.first().name} ${current.first().dose}", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(current.first().frequency, style = MaterialTheme.typography.bodyMedium)
                Note("${if (current.size > 1) "${current.size - 1} more · " else ""}${current.first().repeats}")
            }
        }
    }

    DeckSectionHead("Latest observations")
    if (clinical.allowed) {
        /* Every tile wears where its number came from. It is the difference between a file that can
           be read in a hurry and one that will be read wrongly in a hurry: the last set here was
           four numbers the patient read out over a telehealth call, and a reader who takes them for
           measurements is about to make a decision on evidence that was never a measurement. The
           mark is the same shape and the same tint on all four origins — see ProvenanceMark — so a
           patient-reported weight is told apart from a measured one without being drawn as a lesser
           reading than one. */
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                Triple(Icons.Outlined.MonitorHeart, "Blood pressure", "${latest.systolic}/${latest.diastolic} mmHg") to latest.bloodPressureFrom,
                Triple(Icons.Outlined.Favorite, "Pulse", "${latest.pulse} bpm") to latest.pulseFrom,
                Triple(Icons.Outlined.Thermostat, "Temperature", "%.1f °C".format(latest.temperature)) to latest.temperatureFrom,
                Triple(Icons.Outlined.Scale, "Weight", "%.1f kg".format(latest.weight)) to latest.weightFrom,
                Triple(Icons.Outlined.Air, "Oxygen saturation", "${latest.oxygen} %") to latest.oxygenFrom
            ).forEach { (tile, origin) -> VitalTile(tile.first, tile.second, tile.third, provenanceById(origin)) }
            /* The fourth origin, and the only one nobody entered. It exists while its two inputs do
               and not otherwise, and it names them rather than standing on its own. */
            meanArterialPressureOf(latest)?.let { map ->
                VitalTile(Icons.Outlined.Calculate, "Mean arterial pressure", "%.0f mmHg".format(map), Provenance.DERIVED)
            }
        }
        val origins = listOf(latest.bloodPressureFrom, latest.pulseFrom, latest.temperatureFrom, latest.weightFrom, latest.oxygenFrom)
            .distinct().mapNotNull { provenanceById(it) }
        Note("Recorded ${longDate(latest.at)} by ${patient.careTeam.first().name}. ${origins.joinToString(" ") { "${it.label}: ${it.trust}" }}")
        Note("The mean arterial pressure is calculated from the systolic and diastolic above. It is exactly as good as those two readings and it names them, because a derived value whose inputs are unknown is not a value.")
        ClinicalChart(
            "Systolic blood pressure", "mmHg",
            patient.vitals.map { Reading(dayMonth(it.at), it.systolic.toDouble()) }, 90.0..140.0
        )
        ClinicalChart(
            "Pulse", "bpm",
            patient.vitals.map { Reading(dayMonth(it.at), it.pulse.toDouble()) }, 50.0..100.0
        )
    } else RefusalCard("Observations are not open to this viewer", clinical)

    DeckSectionHead("Clinical summary")
    if (clinical.allowed) CareCard {
        patient.summaryPoints.forEach { point -> Text("· $point", style = MaterialTheme.typography.bodyMedium) }
    } else RefusalCard("The clinical summary is not open to this viewer", clinical)

    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Recent activity", style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.weight(1f))
        TextButton(onClick = { go("Timeline") }, shape = ThusoButtonShape) { Text("Open the timeline") }
    }
    CareCard {
        if (recent.isEmpty()) Note("Nothing in this patient’s history is open to this viewer. That is a refusal, not an empty record.")
        else recent.forEach { entry -> EntryRow(entry, canOpen(viewer, entry), full = false) }
    }

    DeckSectionHead("Actions")
    CareCard {
        fileActions.forEachIndexed { index, action ->
            val allowed = can(viewer, action.capability)
            val icon = when (action.label) {
                "New consultation" -> Icons.Outlined.MedicalServices
                "Prescription" -> Icons.Outlined.Medication
                "Referral" -> Icons.AutoMirrored.Outlined.Send
                "Upload document" -> Icons.Outlined.UploadFile
                else -> Icons.Outlined.Place
            }
            if (allowed.allowed) MenuRow(action.label, action.detail, icon) {
                setNotice("${action.label} would open here for ${patient.name}. This preview writes nothing, sends nothing and dispenses nothing.")
            } else Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TileIcon(Icons.Outlined.Lock, Danger, DangerSoft, 38.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(action.label, style = MaterialTheme.typography.titleSmall, color = StudioInkMuted)
                    Note(allowed.reason.orEmpty())
                }
            }
            if (index < fileActions.lastIndex) HorizontalDivider(color = StudioLine)
        }
    }
    if (notice.isNotEmpty()) Text(
        notice, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
    )
}
@Composable private fun VitalTile(icon: ImageVector, name: String, value: String, provenance: Provenance? = null) {
    Column(
        Modifier.background(Color.White, RoundedCornerShape(ThusoRadius.card)).padding(12.dp)
            .semantics(mergeDescendants = true) { contentDescription = "$name $value${provenance?.let { ", ${it.label}" } ?: ""}" },
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, null, tint = Charcoal, modifier = Modifier.size(15.dp))
            Text(name, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        }
        Text(value, style = MaterialTheme.typography.titleSmall, color = Charcoal)
        provenance?.let { ProvenanceMark(it) }
    }
}

/* ---- Timeline --------------------------------------------------------------------------------
   Everything in one chronological list, each entry wearing its record type, because “a test” and “a
   referral” are different things to a clinician scanning a year of care.

   A clinical entry the viewer may not open is still listed, locked, with its refusal: a nurse who
   sees a gap will assume nothing happened there, which is worse than knowing something did. A
   protected entry is not listed at all, because for those the existence *is* the disclosure. That
   asymmetry is the design, not an oversight, and the line above the list says so. */
@Composable private fun FileTimeline(patient: PatientRecord, viewer: VettingSubject) {
    var filter by remember(patient.id, viewer.id) { mutableStateOf("All records") }
    val all = timelineFor(patient).filter { canOpen(viewer, it).allowed || !isProtected(it) }
    val kinds = listOf("All records") + all.map { recordTypeById(it.typeId)?.name ?: it.typeId }.distinct()
    val rows = all.filter { filter == "All records" || (recordTypeById(it.typeId)?.name ?: it.typeId) == filter }
    FlowRowChips(kinds, setOf(filter)) { filter = it }
    Note("Protected entries are not listed here, on any patient, for any viewer without a release. A locked line would say one exists, which is the disclosure this class exists to prevent.")
    if (rows.isEmpty()) EmptyStateCard(
        "Nothing under this filter",
        "Change the record type, or choose all records. An empty filter is not an empty record."
    ) else CareCard {
        rows.forEachIndexed { index, entry ->
            EntryRow(entry, canOpen(viewer, entry), full = true)
            if (index < rows.lastIndex) HorizontalDivider(color = StudioLine)
        }
    }
}
@Composable private fun EntryRow(entry: TimelineEntry, decision: VettingDecision, full: Boolean) {
    val type = recordTypeById(entry.typeId)
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TileIcon(
            if (decision.allowed) Icons.Outlined.Description else Icons.Outlined.Lock,
            if (decision.allowed) Indigo else Danger,
            if (decision.allowed) IndigoSoft else DangerSoft, 36.dp
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                if (decision.allowed) entry.title else "${type?.name ?: "Record"} · withheld",
                 style = MaterialTheme.typography.titleSmall, color = Charcoal
            )
            Text(
                if (decision.allowed) entry.detail else decision.reason.orEmpty(),
                style = MaterialTheme.typography.bodySmall, color = StudioInkMuted
            )
            Note(
                if (full) "${type?.name} · ${type?.fhir} · ${shortDate(entry.at)}${if (decision.allowed) " · ${entry.by}" else ""}"
                else shortDate(entry.at)
            )
            if (decision.allowed) ReleasedTag(entry)
        }
    }
}

/* ---- Consultations ---------------------------------------------------------------------------- */
@Composable private fun FileConsultations(patient: PatientRecord, viewer: VettingSubject) {
    val rows = patient.consultations.filter { canOpen(viewer, it).allowed }
    Note("Twelve sections, the same twelve whoever writes them, mapped to ${soapHeadings.joinToString(" · ") { it.id }} as the reading order. A section marked as needing a capability is about who may write it; reading a prescription is not prescribing.")
    if (rows.isEmpty()) Note("No consultation in this file is open to this viewer. Consultations exist; this viewer is not one of the people who may read them.")
    rows.forEach { consultation ->
        key(consultation.id) {
        var open by remember { mutableStateOf(false) }
        CareCard(Modifier.clickable { open = !open }) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${shortDate(consultation.at)} · ${consultation.kind}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Note(consultation.by)
                }
                Icon(
                    if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                    if (open) "Collapse this consultation" else "Open this consultation",
                    tint = StudioInkMuted
                )
            }
            ReleasedTag(consultation)
            if (open) {
                ReviewLine("Reason for visit", consultation.reason)
                ReviewLine("Assessment", consultation.assessment)
                ReviewLine("Treatment plan", consultation.plan)
                ReviewLine("Clinician and registration", "${consultation.by} · ${consultation.registration}")
                ReviewLine("Place", consultation.place)
                Text("The standardised structure", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                consultationSections.forEach { section ->
                    val filled = section.id in consultation.sections
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(section.name, style = MaterialTheme.typography.labelMedium, color = if (filled) Ink else StudioInkMuted)
                        Note(
                            (if (filled) "Recorded" else if (section.required) "Required and not recorded" else "Not recorded") +
                                (section.gatedBy?.let { " · written only by a party holding $it" } ?: "")
                        )
                        section.note?.let { Note(it) }
                    }
                }
            }
        }
        }
    }
}

/* ---- Medication ------------------------------------------------------------------------------
   Reached by a doctor through view-clinical-record and by a pharmacy through dispense, because the
   contract says a pharmacy sees “the prescription and the allergies that bear on filling it”. The
   allergy panel is repeated here rather than left in the header: this is the screen where somebody
   hands over a medicine. */
@Composable private fun FileMedication(patient: PatientRecord, viewer: VettingSubject, open: (String) -> Unit) {
    val visible = patient.medication.filter { canOpen(viewer, it).allowed }
    val current = visible.filter { it.stopped == null }
    val past = visible.filter { it.stopped != null }
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Warning, null, tint = if (patient.allergies.isNotEmpty()) Danger else MangoInk)
            Text(if (patient.allergies.isNotEmpty()) "Allergies" else "No allergy has been recorded", style = MaterialTheme.typography.titleSmall, color = Charcoal)
        }
        Text(
            if (patient.allergies.isNotEmpty())
                patient.allergies.joinToString("; ") { "${it.substance} — ${it.reaction.lowercase()} (${it.severity.lowercase()})" } +
                    ". Carried into this screen because the pharmacist needs it before anything else, not after the label is printed."
            else "That is not the same as no allergy. Ask before dispensing.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
    DeckSectionHead("Current medicine")
    if (current.isEmpty()) Note("No current medicine is open to this viewer.")
    else CareCard {
        current.forEachIndexed { index, medicine ->
            MedicineRow(medicine, "${medicine.frequency} · started ${medicine.started} · ${medicine.repeats}",
                medicine.prescriber + (medicine.dispensedBy?.let { " · last dispensed $it" } ?: " · not yet dispensed"))
            if (index < current.lastIndex) HorizontalDivider(color = StudioLine)
        }
    }
    if (past.isNotEmpty()) {
        DeckSectionHead("Stopped")
        CareCard {
            past.forEachIndexed { index, medicine ->
                MedicineRow(medicine, "Stopped ${medicine.stopped} · started ${medicine.started}", medicine.prescriber)
                if (index < past.lastIndex) HorizontalDivider(color = StudioLine)
            }
        }
    }
    ProtectedLine(viewer, "medicine")
    OutlinedButton(onClick = { open("Prescription RX-0081") }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Open a sample prescription record") }
}
@Composable private fun MedicineRow(medicine: Medicine, detail: String, attribution: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TileIcon(Icons.Outlined.Medication, size = 36.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${medicine.name} ${medicine.dose}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            Note(attribution)
            ReleasedTag(medicine)
        }
    }
}

/* ---- Results ---------------------------------------------------------------------------------- */
@Composable private fun FileResults(patient: PatientRecord, viewer: VettingSubject, open: (String) -> Unit) {
    val rows = patient.results.filter { canOpen(viewer, it).allowed }
    val order = can(viewer, "order-test")
    if (rows.isEmpty()) Note("No result in this file is open to this viewer.")
    rows.forEach { report ->
        CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TileIcon(Icons.Outlined.Science, size = 40.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(report.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Note("${report.source} · ${shortDate(report.at)}")
                }
                StatusPill(report.status)
            }
            ReleasedTag(report)
            Note("Fictional results. Reference ranges are indicative and are not a validated early-warning score.")
            report.rows.forEach { row ->
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        .semantics(mergeDescendants = true) {
                            contentDescription = "${row.name}: ${row.value}${row.flag?.let { ", $it" } ?: ""}. Reference range ${row.range}."
                        },
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(row.name, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted, modifier = Modifier.weight(1f))
                        Text(
                            row.value + (row.flag?.let { " · $it" } ?: ""),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (row.flag != null) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (row.flag != null) MangoInk else Charcoal
                        )
                    }
                    Note("Reference range ${row.range}")
                }
            }
            Note("Released by ${report.releasedBy}. An abnormal result is held until a clinician releases it with an explanation — release is a clinical act, not a delivery step.")
        }
    }
    ProtectedLine(viewer, "result")
    if (order.allowed) OutlinedButton(onClick = { open("Laboratory order LAB-0023") }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) {
        Text("Request a test · open the sample order")
    } else RefusalCard("Requesting a test is refused", order)
}

/* ---- Referrals -------------------------------------------------------------------------------- */
@Composable private fun FileReferrals(patient: PatientRecord, viewer: VettingSubject) {
    val rows = patient.referrals.filter { canOpen(viewer, it).allowed }
    if (rows.isEmpty()) Note("No referral in this file is open to this viewer.")
    else CareCard {
        rows.forEachIndexed { index, referral ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TileIcon(Icons.AutoMirrored.Outlined.Send, size = 36.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(referral.to, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text(referral.reason, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    Note("${shortDate(referral.at)} · ${referral.urgency} · ${referral.by}")
                    StatusPill(referral.status, if (referral.status.startsWith("Accepted")) "teal" else "sky")
                }
            }
            if (index < rows.lastIndex) HorizontalDivider(color = StudioLine)
        }
    }
    ProtectedLine(viewer, "referral")
    Note("Reading a referral and making one are different acts: the record opens on “view-clinical-record”, and “${recordTypeById("referral")?.writtenBy?.joinToString() ?: "refer-patient"}” writes it. A nurse who may not refer still has to know her patient was referred.")
}

/* ---- Documents -------------------------------------------------------------------------------- */
@Composable private fun FileDocuments(patient: PatientRecord, viewer: VettingSubject) {
    val rows = patient.documents.filter { canOpen(viewer, it).allowed }
    if (rows.isEmpty()) Note("No document in this file is open to this viewer.")
    else CareCard {
        rows.forEachIndexed { index, document ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TileIcon(Icons.Outlined.Description, size = 36.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(document.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text("${document.kind} · ${document.by}", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    Note("${shortDate(document.at)} · DocumentReference")
                }
            }
            if (index < rows.lastIndex) HorizontalDivider(color = StudioLine)
        }
    }
    ProtectedLine(viewer, "document")
}

/* ---- Billing ---------------------------------------------------------------------------------
   A service code and an amount, never a diagnosis in words. That is necessary and it is not
   sufficient: 3932 is not anonymous to anybody holding the code book, so a claim line for a
   protected service discloses the condition as surely as the note would. Those lines are withheld
   too, and the screen says so rather than letting the code do quietly what the words are forbidden
   from doing. */
@Composable private fun FileBilling(patient: PatientRecord, viewer: VettingSubject) {
    val rows = patient.billing.filter { canOpen(viewer, it).allowed }
    val total = rows.sumOf { it.amount }
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.AutoMirrored.Outlined.ReceiptLong, null, tint = Danger)
            Text("A code is not anonymous.", style = MaterialTheme.typography.titleSmall, color = Charcoal)
        }
        Text(
            "Finance sees a service code and an amount and never a diagnosis in words — but a code can be looked up. A claim line for a protected service is withheld here for the same reason the words are.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
    if (rows.isEmpty()) Note("No claim line in this file is open to this viewer.")
    else CareCard {
        Note("Fictional claim lines. Nothing has been submitted to a scheme and no payment has been taken.")
        rows.forEachIndexed { index, line ->
            Column(
                Modifier.fillMaxWidth().padding(vertical = 8.dp)
                    .semantics(mergeDescendants = true) {
                        contentDescription = "${shortDate(line.at)}, code ${line.code}, ${line.service}, ${rands(line.amount)}, ${line.status}."
                    },
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${line.code} · ${line.service}", style = MaterialTheme.typography.titleSmall, color = Charcoal, modifier = Modifier.weight(1f))
                    Text(rands(line.amount), style = MaterialTheme.typography.titleSmall, color = Charcoal)
                }
                Note("${shortDate(line.at)} · ${line.payer}")
                StatusPill(line.status, if (line.status == "Rejected") "danger" else "quiet")
                line.note?.let { Note(it) }
            }
            if (index < rows.lastIndex) HorizontalDivider(color = StudioLine)
        }
        HorizontalDivider(color = StudioLine)
        ReviewLine("Visible to this viewer", "${rands(total)} · ${rows.size} of ${patient.billing.size} lines")
    }
    ProtectedLine(viewer, "claim line")
}

/* One sentence, the same wherever a list could have been shortened by the protected rule. It does
   not say whether anything was removed, for the same reason the header notice does not. */
@Composable private fun ProtectedLine(viewer: VettingSubject, what: String) {
    val vetted = can(viewer, "view-protected-record")
    Note("A protected $what appears on this page only where the patient released that entry to you by name. ${if (vetted.allowed) releaseRefusal(viewer.roleId) else vetted.reason.orEmpty()}")
}
