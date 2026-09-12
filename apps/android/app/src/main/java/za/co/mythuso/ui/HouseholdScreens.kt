package za.co.mythuso.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.model.*
import java.time.LocalDateTime

/*
 * The household record, and the summary a person hands over from inside it. Two screens because
 * they are two questions: what may a viewer reach of somebody else, and what may a person choose to
 * give away of themselves. The first is answered by visibilityFor() in model/Household.kt, which no
 * composable here is allowed to reach past; the second by a purpose, a period and a guard that
 * reads the artefact's own bytes.
 *
 * Nothing here is a security control. It is the design of one, on a phone, with fictional people.
 */

private val householdRecordType = recordTypeById("household")

@Composable fun HouseholdRecordScreen(store: PreviewStore, open: (String) -> Unit) {
    val household = mokoenaHousehold
    val viewers = remember(store) { householdViewers(store.vetting) }
    var viewerId by remember { mutableStateOf(viewers.first().id) }
    var openId by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf("") }
    var state by remember { mutableStateOf(LoadState.READY) }
    val viewer = viewers.firstOrNull { it.id == viewerId } ?: viewers.first()

    val seen = household.members.map { it to visibilityFor(viewer, it) }
    /* A household member already knows who lives there, so the roster tells them nothing new and the
       refusals are worth showing by name. To anybody else the roster is itself information, so they
       are shown only the people they have a basis for, and no count of the rest. */
    val roster = if (viewer.memberId != null) seen else seen.filter { it.second.level != AccessLevel.NONE }
    val clinical = seen.filter { atLeast(it.second.level, AccessLevel.CLINICAL) }
    val principal = viewer.memberId == household.scheme.principal
    val billing = when {
        viewer.memberId != null -> VettingDecision(true, null, emptyList())
        viewer.subject != null -> can(viewer.subject!!, "view-billing")
        else -> VettingDecision(false, "Nothing stands behind this claim, so the scheme record is not opened.", emptyList())
    }
    val refusal = viewer.subject?.let { can(it, "view-patient-summary").reason }
        ?: "Nobody outside this household is shown its members."
    val opened = openId?.let { id -> seen.firstOrNull { it.first.id == id } }

    val choose: (HouseholdViewer) -> Unit = { next ->
        val count = household.members.count { atLeast(visibilityFor(next, it).level, AccessLevel.EMERGENCY) }
        viewerId = next.id
        openId = null
        status = if (next.memberId != null)
            "Viewing as ${next.name}. $count of ${household.members.size} records are open to them; the rest are refused with the reason on the card."
        else "Viewing as ${next.name}, who does not live here. " + if (count == 0)
            "No member of this household is listed for them at all."
        else "Only the $count member${if (count == 1) "" else "s"} they have a basis for are listed; the household roster is itself information."
    }

    ScreenColumn {
        DemoBadge()
        Heading(
            "Patients", thuso(Phrase.HOUSEHOLD_RECORD, store.locale),
            "One household, held as a FHIR Group, and what each member may see of the others. Fictional household, fictional scheme, fictional numbers."
        )
        CareCard {
            Text("Look at this household as", style = MaterialTheme.typography.titleMedium)
            Note("Membership is not consent. Switch the viewer and watch the same four people open and close — that is the demonstration, and it is the only way to tell whether a refusal was designed or assumed.")
            FlowRowChips(viewers.map { "${it.name} · ${it.role}" }, setOf("${viewer.name} · ${viewer.role}")) { label ->
                choose(viewers.first { "${it.name} · ${it.role}" == label })
            }
        }
        Text(
            status.ifEmpty { "Viewing as ${viewer.name} — ${viewer.role}." },
            style = MaterialTheme.typography.labelLarge, color = BodyText,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
        )

        CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TileIcon(Icons.Outlined.Groups)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(household.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note("FHIR ${householdRecordType?.fhir ?: "Group"} · ${household.id} · ${household.area}")
                }
            }
            Text(householdRecordType?.summary.orEmpty(), style = MaterialTheme.typography.bodyMedium)
        }

        StatePicker("Preview how this household behaves when the record service is unavailable", state) { state = it }
        StateBlock(state, "This household record", "clinical record access", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                roster.forEach { (member, visibility) ->
                    MemberCard(member, visibility) {
                        openId = member.id
                        status = "Opened ${member.name} at ${visibility.level.label.lowercase()}."
                    }
                }
                if (roster.isEmpty()) CareCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Outlined.Lock, null, tint = Danger)
                        Text("Nothing here is yours to see.", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    }
                    Text(refusal, style = MaterialTheme.typography.bodyMedium)
                    Note("Not one member is named, and no count of them is given. A refusal that still told you how many people live here, and which of them have records, would be a refusal in name only.")
                }

                WithheldHouseholdNotice()

                opened?.let { (member, visibility) ->
                    if (atLeast(visibility.level, AccessLevel.EMERGENCY)) CareCard {
                        Text(member.name, style = MaterialTheme.typography.titleMedium, color = Charcoal,
                            modifier = Modifier.semantics { heading() })
                        Note("${visibility.level.label} · ${visibility.reason}")
                        if (visibility.level == AccessLevel.EMERGENCY) {
                            ReviewLine("Blood group", member.bloodGroup)
                            ReviewLine("Allergies", member.allergies.joinToString("; "))
                            ReviewLine("Emergency contact", member.emergencyContact)
                            Note("Three lines, and deliberately not the fourth. Conditions and medicines would say more about ${firstName(member)} than an emergency needs to know.")
                        } else {
                            SummaryCardBlock(member, recordSummaryCard.fields)
                        }
                        if (visibility.level == AccessLevel.SELF) {
                            /* The route carries the member, because “your own record” is whoever is
                               looking — Amahle's summary is Amahle's to hand over, not her mother's. */
                            OutlinedButton(onClick = { open("Health summary: ${member.id}") }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) {
                                Icon(Icons.Outlined.Share, null, Modifier.size(17.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Share this summary")
                            }
                            Note("Your own record opens in full here, and it is the only record on this screen that does.")
                        }
                    }
                }

                SharedAppointments(viewer)
                SchemeCard(household, viewer, billing, principal)
                DueList(
                    "Immunisations due", Icons.Outlined.Vaccines,
                    clinical.flatMap { (member, _) -> member.immunisations.map { firstName(member) to "${it.vaccine} · due ${formatVettingDate(it.due)}" } },
                    "This list covers the members whose records are open to you. It does not say whether there is anything outstanding for the others. Dates are indicative; the national EPI schedule governs."
                )
                DueList(
                    "Chronic medicine to collect", Icons.Outlined.Medication,
                    clinical.flatMap { (member, _) -> member.collections.map { firstName(member) to "${it.medicine} · ready ${formatVettingDate(it.ready)} · ${it.pharmacy}" } },
                    "Same rule, and for the same reason: “a collection is due for someone you cannot see” is itself a clinical fact about that person."
                )
                CareCard {
                    Text("Book a home visit", style = MaterialTheme.typography.titleMedium)
                    Note("Arranging care is not reading a record, so this stays open to the household while the record above stays shut.")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        household.members.forEach { member ->
                            OutlinedButton(
                                onClick = {
                                    status = "Home visit requested for ${member.name}. Nothing is booked in this preview, and booking it would still tell you nothing about what the nurse finds."
                                },
                                enabled = viewer.memberId != null
                            , shape = ThusoButtonShape) { Text(firstName(member)) }
                        }
                    }
                    Note(if (viewer.memberId != null)
                        "You can arrange a visit for anyone in the household. The visit summary goes to them."
                    else "Only a member of the household can arrange visits for it.")
                }
            }
        }
        Note("Nothing on this screen is transmitted, stored or acted upon. Every person, scheme and number is fictional.")
    }
}

/* ---- One member ------------------------------------------------------------------------------
   The card carries the refusal, not just the lock: a greyed name with no sentence teaches a family
   that the app is broken, where a sentence teaches them whose decision it was. */
@Composable private fun MemberCard(member: HouseholdMember, visibility: Visibility, open: () -> Unit) {
    val permitted = atLeast(visibility.level, AccessLevel.EMERGENCY)
    val tone = when {
        visibility.level == AccessLevel.SELF -> "teal"
        permitted -> "sky"
        else -> "danger"
    }
    val age = ageOf(member.born)
    CareCard {
        /* The card reads as one sentence — who, what level, and why — because a name, a pill and a
           paragraph in three swipes is three facts the listener has to reassemble. The control keeps
           a node of its own, and names the person in its own label, so it stays reachable alone. */
        Column(
            Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
                contentDescription = "${member.name}, ${member.relation.lowercase()}, $age years, " +
                    "reference ${member.reference}. ${visibility.level.label}. ${visibility.reason}"
            },
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(46.dp).background(if (member.relation == "Child") MangoSoft else IndigoSoft, CircleShape), Alignment.Center) {
                    Text(
                        member.name.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString(""),
                         style = MaterialTheme.typography.titleMedium,
                        color = if (member.relation == "Child") MangoInk else IndigoDeep
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(member.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note("${member.relation} · $age years · ${member.reference}")
                }
            }
            /* The level sits on its own line rather than beside the name. “Emergency details only”
               is a long label, and a name squeezed into two lines to make room for it is the one
               word on the card a reader must not have to work at. */
            StatusPill(visibility.level.label, tone)
            Text(visibility.reason, style = MaterialTheme.typography.bodyMedium)
        }
        OutlinedButton(
            onClick = open, enabled = permitted,
            modifier = Modifier.fillMaxWidth().semantics {
                contentDescription = if (permitted) "Open what you may see of ${member.name}"
                else "Refused — ${member.name}’s record is not open to you"
            }
        , shape = ThusoButtonShape) {
            Icon(if (permitted) Icons.Outlined.LockOpen else Icons.Outlined.Lock, null, Modifier.size(17.dp))
            Spacer(Modifier.width(8.dp))
            Text(if (permitted) "Open what you may see" else "Refused")
        }
    }
}

/* ---- The constant notice ----------------------------------------------------------------------
   Every record in this household has parts only the person themselves can release. The line stands
   on all of them, whether or not there is anything behind it — a notice that appeared only where
   there was something to hide would be the disclosure it is meant to prevent, and a count of the
   records it stood on would be another one. */
@Composable private fun WithheldHouseholdNotice() {
    CareCard(Modifier.semantics(mergeDescendants = true) {
        contentDescription = "Withheld from every member of this household. " +
            "${summaryWithheldCategories.joinToString(", ")}. This notice stands on every record here, " +
            "whether or not anything is held behind it, and no count of them is given."
    }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Lock, null, tint = Charcoal)
            Text("A category is withheld from every record here.", style = MaterialTheme.typography.titleSmall, color = Charcoal)
        }
        Text("Every record in this household has parts only the person themselves can release. This line stands on all of them, whether or not there is anything behind it — a notice that appeared only where there was something to hide would be the disclosure it is meant to prevent, and a count of the records it stood on would be another one.",
            style = MaterialTheme.typography.bodyMedium)
        CategoryChips()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun CategoryChips() {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        summaryWithheldCategories.forEach { category -> StatusPill(category) }
    }
}

/* ---- The household's own facts --------------------------------------------------------------- */
@Composable private fun SharedAppointments(viewer: HouseholdViewer) {
    CareCard {
        Text("Shared appointments", style = MaterialTheme.typography.titleMedium)
        householdAppointments.forEach { appointment ->
            val member = householdMemberById(appointment.memberId) ?: return@forEach
            val visibility = visibilityFor(viewer, member)
            /* A member of the household sees the whole calendar, because they already know who is
               out of the house on Saturday morning. Everyone else sees only the people they hold a
               basis for — and the service name needs summary level, not a shared front door. */
            if (viewer.memberId == null && !atLeast(visibility.level, AccessLevel.EMERGENCY)) return@forEach
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TileIcon(Icons.Outlined.CalendarMonth, size = 38.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${formatVettingDate(appointment.on)} · ${appointment.time} · ${firstName(member)}",
                        style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                    Note(if (atLeast(visibility.level, AccessLevel.SUMMARY)) appointment.service
                    else "A booked visit. What it is for is not part of the household calendar.")
                }
            }
        }
        Note("A household calendar says who is out of the house on Saturday morning. It says what the visit is for only to someone already allowed to know.")
    }
}

@Composable private fun SchemeCard(
    household: Household, viewer: HouseholdViewer, billing: VettingDecision, principal: Boolean
) {
    CareCard {
        Text("Medical aid and dependants", style = MaterialTheme.typography.titleMedium)
        if (billing.allowed) {
            ReviewLine("Scheme", household.scheme.name)
            ReviewLine("Plan", household.scheme.plan)
            ReviewLine("Membership", household.scheme.membership)
            household.members.filter { principal || it.id == viewer.memberId }.forEach { member ->
                ReviewLine(
                    member.name + if (member.id == household.scheme.principal) " · principal" else "",
                    "Dependant ${member.dependant}"
                )
            }
            Note((if (principal) "You are the principal member, so you hold every dependant code."
            else "Only your own dependant code is shown. The others are not yours to quote.") +
                " A dependant code links a person to a scheme; it is not a key to their record, and nothing clinical is stored against it.")
        } else {
            Text(billing.reason.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            Note("Claims carry a service code and never the diagnosis in words, which is what makes a refusal here cheap rather than obstructive.")
        }
    }
}

@Composable private fun DueList(title: String, icon: ImageVector, rows: List<Pair<String, String>>, footer: String) {
    CareCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (rows.isEmpty()) Note("Nothing is outstanding for the members whose records are open to you.")
        rows.forEach { (who, what) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TileIcon(icon, size = 38.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(who, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                    Note(what)
                }
            }
        }
        Note(footer)
    }
}

/* ---- The summary card ------------------------------------------------------------------------
   The contract's nine fields, in the contract's own order, so the card cannot grow a field the
   contract does not have. The notice under it is constant on every member and every purpose. */
@Composable fun ColumnScope.SummaryCardBlock(member: HouseholdMember, fields: List<String>) {
    summaryValues(member, fields).forEach { field -> StackedLine(field.label, field.value) }
    WithheldSummaryNotice()
}

/* A care-team line and a token are both too long to sit beside their label on a phone held by
   somebody who has turned the text size up. The label goes above rather than the value going off
   the edge. */
@Composable private fun StackedLine(label: String, value: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = BodyText)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

@Composable fun ColumnScope.WithheldSummaryNotice() {
    Column(
        Modifier.fillMaxWidth().background(Mist, MaterialTheme.shapes.medium).padding(12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "Withheld from every summary. ${recordSummaryCard.withheld} " +
                    "The categories are ${summaryWithheldCategories.joinToString(", ")}. " +
                    "This notice reads the same on every summary, whether or not anything is held behind it."
            },
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Lock, null, tint = Charcoal, modifier = Modifier.size(18.dp))
            Text("Withheld from every summary.", style = MaterialTheme.typography.titleSmall, color = IndigoDeep)
        }
        Text(recordSummaryCard.withheld, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        CategoryChips()
    }
}

/* ---- The health summary ------------------------------------------------------------------------ */
@Composable fun HealthSummaryScreen(store: PreviewStore, member: HouseholdMember = mokoenaHousehold.members[0]) {
    val context = LocalContext.current
    var purposeId by remember { mutableStateOf(sharePurposes.first().id) }
    var recipient by remember { mutableStateOf("") }
    var understood by remember { mutableStateOf(false) }
    val shares = remember { mutableStateListOf<SummaryShare>() }
    var status by remember { mutableStateOf("") }
    var proof by remember { mutableStateOf("") }
    val purpose = sharePurposes.first { it.id == purposeId }

    ScreenColumn {
        DemoBadge()
        Heading(
            "Patients", thuso(Phrase.HEALTH_SUMMARY, store.locale),
            "The page a stranger reads when there is no time to read the file — shared for one purpose, for a fixed number of hours."
        )
        CareCard {
            Text("${thuso(Phrase.HEALTH_SUMMARY, store.locale)} · ${member.name}", style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() })
            Note(recordSummaryCard.why)
            SummaryCardBlock(member, recordSummaryCard.fields)
            if (member.restricted.isNotEmpty()) Note(
                "You have ${member.restricted.size} entries in protected categories. They are yours, they appear in no summary you share, and you release them one at a time, to one person, for one purpose."
            )
        }

        CareCard {
            Text("Share this summary", style = MaterialTheme.typography.titleMedium)
            Note("A summary that is valid forever is a summary you have lost. Choose what it is for; the purpose chooses the fields and the hours.")
            Text("What is this summary for?", style = MaterialTheme.typography.labelLarge, color = Charcoal)
            FlowRowChips(sharePurposes.map { it.name }, setOf(purpose.name)) { name ->
                purposeId = sharePurposes.first { it.name == name }.id
                val chosen = sharePurposes.first { it.name == name }
                status = "${chosen.name} — ${chosen.fields.size} fields, valid ${chosen.hours} hours."
            }
            OutlinedTextField(
                recipient, { recipient = it.take(80) },
                label = { Text("Who receives it") }, placeholder = { Text(purpose.recipient) },
                singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            StackedLine("They will see", summaryValues(member, purpose.fields).joinToString(", ") { it.label })
            StackedLine("They will not see", recordSummaryCard.fields.filter { it !in purpose.fields }
                .mapNotNull { summaryFieldLabel(it, member) }.joinToString(", ")
                .ifEmpty { "Nothing further — this purpose carries the whole card" })
            ReviewLine("Valid for", "${purpose.hours} hours")
            Setting("I understand this is a design preview. Nothing is sent, no link works, and the data is fictional.", understood) { understood = it }
            StudioButton(
                onClick = {
                    val now = LocalDateTime.now()
                    shares.add(0, SummaryShare(
                        "SHR-${shares.size + 1}", shareToken(), purpose,
                        recipient.trim().ifEmpty { purpose.recipient }, now, now.plusHours(purpose.hours)
                    ))
                    understood = false
                    status = "Summary shared for ${purpose.name.lowercase()}. It stops being valid at " +
                        "${formatVettingTime(shares.first().validUntil)} — ${purpose.fields.size} of " +
                        "${recordSummaryCard.fields.size} fields, and no protected category."
                },
                enabled = understood, modifier = Modifier.fillMaxWidth()
            , shape = ThusoButtonShape) { Text("Create the share") }
            Text(status.ifEmpty { "Nothing has been shared yet." },
                style = MaterialTheme.typography.bodySmall, color = BodyText,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }

        shares.forEachIndexed { index, share ->
            CareCard {
                StackedLine("Purpose", share.purpose.name)
                StackedLine("Shared with", share.recipient)
                StackedLine("Produced", "${formatVettingTime(share.createdAt)} by ${member.name}")
                ReviewLine("Stops being valid", if (share.revoked) "Revoked" else formatVettingTime(share.validUntil))
                StackedLine("Reference", share.token)
                ScannerNote(member)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            /* The rule is checked against the bytes that would actually leave. */
                            val body = buildSharedSummary(member, share)
                            val leak = protectedLeakIn(member, body)
                            if (leak != null) {
                                status = "Export refused: a ${leak.category.lowercase()} entry reached the artefact. Nothing was shared."
                                return@OutlinedButton
                            }
                            context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "MyThuso health summary · ${share.purpose.name} · expires ${formatVettingTime(share.validUntil)}")
                                putExtra(Intent.EXTRA_TEXT, body)
                            }, "Share this health summary"))
                            status = "Shared through the system sheet. The text says who made it, for whom, for what, and when it stops being valid — and carries ${share.purpose.fields.size} fields with no protected category in any of them. No file was written and no permission was asked for."
                        },
                        enabled = !share.revoked
                    , shape = ThusoButtonShape) { Text("Export this summary") }
                    OutlinedButton(
                        onClick = {
                            shares[index] = share.copy(revoked = true)
                            status = "Revoked. The verification link now answers “revoked”. Anything already read cannot be unread, which is why the purpose and the hours matter more than the revocation does."
                        },
                        enabled = !share.revoked
                    , shape = ThusoButtonShape) { Text(if (share.revoked) "Revoked" else "Revoke") }
                }
            }
        }

        ExportGuardProof(member, proof) { proof = it }
        Note("Fictional person, fictional reference, fictional token. Nothing is stored, no link resolves and no summary reaches anybody.")
    }
}

/* What a scanner would read, said in the UI rather than left to be assumed. No code is drawn: an
   encoder is a dependency this preview has not spent, and the picture would only be a way to lose
   the reference — the reference is the part that matters. */
@Composable private fun ColumnScope.ScannerNote(member: HouseholdMember) {
    val initials = member.name.split(" ").mapNotNull { it.firstOrNull() }.joinToString(".") + "."
    Column(
        Modifier.fillMaxWidth().background(InfoSoft, MaterialTheme.shapes.medium).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.QrCode2, null, tint = Info, modifier = Modifier.size(18.dp))
            Text("What a scanner would read.", style = MaterialTheme.typography.titleSmall, color = Info)
        }
        Text("The reference above, and nothing else — 100 bits from the device’s own secure generator, not your patient number and not a number anyone can count up to. Someone holding it is answered with your initials ($initials), whether the summary is valid, expired or revoked, what it was made for, and when it stops. Not your name, not your date of birth, not one clinical word.",
            style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        Text("No code is drawn here. The picture would only be a way to lose the reference, and the reference is the part that matters.",
            style = MaterialTheme.typography.bodySmall, color = BodyText)
    }
}

/* ---- Proving the guard --------------------------------------------------------------------------
   A rule nobody tests is a rule somebody hopes about, and reading the guard is not testing it. This
   runs the same check twice: once over the artefact as it would really be built, and once over the
   same artefact with a protected entry deliberately written into it. The second one must be
   refused, and nothing built by it is ever offered for sharing. */
@Composable private fun ExportGuardProof(member: HouseholdMember, result: String, setResult: (String) -> Unit) {
    CareCard {
        Text("Check the artefact against its own bytes", style = MaterialTheme.typography.titleMedium)
        Note("The export is searched for the text of this person’s protected entries before it is offered. Run it here against a clean summary and against one with a protected entry planted in it, so the refusal can be watched happening rather than taken on trust.")
        OutlinedButton(
            onClick = {
                val now = LocalDateTime.now()
                /* The widest purpose, because a guard proved on three fields has not been proved. */
                val whole = sharePurposes.first { it.id == "casualty" }
                val share = SummaryShare("SHR-CHECK", shareToken(), whole,
                    "Nobody — this artefact is built to be inspected", now, now.plusHours(whole.hours))
                val clean = buildSharedSummary(member, share)
                val cleanLeak = protectedLeakIn(member, clean)
                val planted = member.restricted.firstOrNull()
                    ?: RestrictedEntry("Mental health", "Planted line, for this check only")
                val dirty = buildSharedSummary(member, share, planted)
                val dirtyLeak = protectedLeakIn(member, dirty)
                setResult(buildString {
                    append("Clean artefact: ${clean.length} characters, all ${recordSummaryCard.fields.size} contract fields, ")
                    append(if (cleanLeak == null) "no protected entry found — offered.\n" else "REFUSED, which means the summary itself is leaking.\n")
                    append("Planted artefact: the same summary with a ${planted.category.lowercase()} entry written into it — ")
                    append(if (dirtyLeak != null) "found and refused. Nothing was shared." else "NOT FOUND, which means the guard is not reading the bytes.")
                })
            },
            modifier = Modifier.fillMaxWidth()
        , shape = ThusoButtonShape) { Text("Run the check") }
        if (result.isNotEmpty()) Text(result, style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        Note("The guard searches for the entry’s own detail, never for the category names — the artefact names every protected category on purpose, so searching for those would refuse every export ever made.")
    }
}
