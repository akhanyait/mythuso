package za.co.mythuso.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import kotlin.math.abs

/*
 * Vetting is the gate the whole marketplace rests on, so it is a real pipeline with real refusals
 * rather than a list of names. Every screen here reads the same records the dispatch board and the
 * clinical queue read before they offer an action, which is why a decision taken on this screen
 * takes a nurse off the board a screen later.
 *
 * The model — roles, checks, issuing authorities, expiry arithmetic and the refusal matrix — is in
 * model/Vetting.kt. Nothing here is verified, submitted or stored anywhere.
 */

private fun tone(status: SubjectStatus) = when (status) {
    SubjectStatus.CLEARED -> "teal"
    SubjectStatus.EXPIRING -> "amber"
    SubjectStatus.IN_PROGRESS -> "sky"
    SubjectStatus.SUSPENDED, SubjectStatus.DECLINED -> "danger"
}
private fun tone(state: CheckState) = when (state) {
    CheckState.VERIFIED -> "teal"
    CheckState.EXPIRING -> "amber"
    CheckState.SUBMITTED, CheckState.IN_REVIEW -> "sky"
    CheckState.LAPSED, CheckState.DECLINED -> "danger"
    CheckState.OUTSTANDING -> "quiet"
}
/** One sentence a screen reader can read instead of a progress bar and a row of pills. */
private fun spokenSummary(subject: VettingSubject, summary: VettingSummary): String {
    val role = vettingRoleById(subject.roleId)?.name ?: subject.roleId
    val blocked = when {
        summary.lapsed.isNotEmpty() -> "Lapsed: ${summary.lapsed.joinToString(", ") { it.name }}."
        summary.awaitingSecond.isNotEmpty() -> "Awaiting a second reviewer: ${summary.awaitingSecond.joinToString(", ") { it.name }}."
        summary.blocking.isNotEmpty() -> "Still to pass: ${summary.blocking.joinToString(", ") { it.name }}."
        else -> "Nothing is blocking."
    }
    return "${subject.name}, $role. Vetting status ${summary.status.label}. " +
        "${summary.passed} of ${summary.total} checks passing. $blocked"
}
@Composable private fun VettingProgress(subject: VettingSubject, summary: VettingSummary, locale: ThusoLocale) {
    Column(
        Modifier.fillMaxWidth().semantics { contentDescription = spokenSummary(subject, summary) },
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        LinearProgressIndicator({ summary.progress }, Modifier.fillMaxWidth().studioChartEntrance(summary.progress))
        Text("${summary.passed} / ${summary.total} · ${thuso(Phrase.VETTING_PROGRESS, locale)}", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetQuiet)
    }
}
/** The countdown a dashboard should be showing: the soonest renewal, in days, not a reassurance. */
@Composable private fun NextDueLine(summary: VettingSummary) {
    val due = summary.nextDue ?: return
    val (check, days) = due
    Note(
        when {
            days < 0 -> "${check.name} lapsed ${-days} days ago."
            days == 0L -> "${check.name} renews today."
            else -> "${check.name} renews in $days days — the soonest of ${summary.total} checks."
        }
    )
}

/* ---- The pipeline ------------------------------------------------------------------------------
   Twelve kinds of party are vetted, not one. The filter is by role because a compliance officer
   works one register at a time, and the counts are computed rather than written down. */
@Composable fun VettingPipelineScreen(store: PreviewStore, open: (String) -> Unit) {
    val vetting = store.vetting
    var state by remember { mutableStateOf(LoadState.READY) }
    var filter by remember { mutableStateOf("All roles") }
    val subjects = if (filter == "All roles") vetting.subjects.toList() else vetting.subjects.filter { vettingRoleById(it.roleId)?.name == filter }
    val summaries = subjects.map { it to summarise(it) }
    ScreenColumn {
        DemoBadge()
        Heading(thuso(Phrase.VETTING, store.locale), "Who may do what, and why not.", "Every party on MyThuso is vetted — nurses, doctors, pharmacies, laboratories, couriers, operators, employers, sponsors, guardians and sites. Fictional records only.")
        StatePicker("Preview the vetting feed state", state) { state = it }
        StateBlock(state, "The vetting register", "access to the vetting register", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                CareCard {
                    Text("Across the register", style = MaterialTheme.typography.titleMedium)
                    SubjectStatus.entries.forEach { status ->
                        val count = vetting.subjects.count { summarise(it).status == status }
                        ReviewLine(status.label, "$count")
                    }
                    Note("Nobody typed these totals. They are the same arithmetic the refusal on a dispatch screen uses.")
                }
                CareCard {
                    MenuRow(thuso(Phrase.VETTING_RENEWALS, store.locale), "Sorted by soonest expiry", Icons.Outlined.Update) { open("Renewals due") }
                    HorizontalDivider(color = DeckInk.sheetLine)
                    MenuRow("Decision log", "Append-only, including the lapses nobody decided", Icons.Outlined.History) { open("Vetting decision log") }
                    HorizontalDivider(color = DeckInk.sheetLine)
                    MenuRow(thuso(Phrase.VETTING_APPLY, store.locale), "Any of the thirteen vetted roles", Icons.Outlined.PersonAdd) { open("Apply for vetting") }
                }
                FlowRowChips(listOf("All roles") + vettingRoles.map { it.name }, setOf(filter)) { filter = it }
                summaries.forEach { (subject, summary) ->
                    CareCard(Modifier.clickable { open("Vetting: ${subject.id}") }) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(subject.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge, color = DeckInk.sheetInk)
                                Note("${vettingRoleById(subject.roleId)?.name} · ${subject.reference}${subject.zone?.let { " · $it" } ?: ""}")
                            }
                            StatusPill(summary.status.label, tone(summary.status))
                        }
                        VettingProgress(subject, summary, store.locale)
                        if (summary.blocking.isNotEmpty()) Note("Blocking: ${summary.blocking.joinToString(", ") { it.name }}")
                        else if (summary.awaitingSecond.isNotEmpty()) Note("Awaiting a second reviewer: ${summary.awaitingSecond.joinToString(", ") { it.name }}")
                        else NextDueLine(summary)
                    }
                }
                if (summaries.isEmpty()) EmptyStateCard("Nobody in this register yet", "Applications appear here the moment they are submitted, before anything has been decided.")
                Note("Approving somebody here approves nobody. This preview has no backend, and no credential is checked against any register.")
            }
        }
    }
}

/* ---- Renewals ----------------------------------------------------------------------------------
   Re-vetting runs on a schedule, not once at sign-up, so the queue that matters is the one sorted
   by what expires next. */
@Composable fun VettingRenewalsScreen(store: PreviewStore, open: (String) -> Unit) {
    val vetting = store.vetting
    var state by remember { mutableStateOf(LoadState.READY) }
    val due = vetting.renewalsDue()
    ScreenColumn {
        DemoBadge()
        Heading(thuso(Phrase.VETTING, store.locale), thuso(Phrase.VETTING_RENEWALS, store.locale), "Soonest first. A check that passes its date is not warned about — it lapses, and whatever it was holding open closes.")
        StatePicker("Preview the renewals feed state", state) { state = it }
        StateBlock(state, "The renewals queue", "access to the vetting register", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (due.isEmpty()) EmptyStateCard("Nothing renews in the next four months", "Checks with no renewal date, such as identity, are not listed here at all.")
                due.forEach { renewal ->
                    val overdue = renewal.days < 0
                    CareCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("${renewal.check.name} · ${renewal.subject.name}", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
                                Note("${vettingRoleById(renewal.subject.roleId)?.name} · ${vettingAuthorityById(renewal.check.authority)?.short}")
                            }
                            StatusPill(if (overdue) "Lapsed" else "${renewal.days} days", if (overdue) "danger" else if (renewal.days <= EXPIRY_WARNING_DAYS) "amber" else "quiet")
                        }
                        Note(expiryWording(renewal.record))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { open("Vetting: ${renewal.subject.id}") }, shape = ThusoButtonShape) { Text("Open record") }
                            DeckButton(onClick = { vetting.verify(renewal.subject.id, renewal.check.id, renewal = true) }, shape = ThusoButtonShape) { Text("Renew") }
                        }
                        if (renewal.check.risk == "high") Note("Renewing this check clears its second reviewer. A new decision needs a new second signature.")
                    }
                }
                Note("Renewing here changes this preview’s own records and nothing else. Acting as ${vetting.reviewer}.")
            }
        }
    }
}

/* ---- The decision log --------------------------------------------------------------------------
   Entries are only ever added. The lapses at the bottom were decided by the calendar rather than by
   a person, which is the point of resolving state at read time. */
@Composable fun VettingLogScreen(store: PreviewStore) {
    val vetting = store.vetting
    ScreenColumn {
        DemoBadge()
        Heading("Vetting", "Decision log", "Append-only. Nothing on this screen can edit an entry that was already written.")
        vetting.log.forEach { event ->
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(event.kind.label, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
                    StatusPill(event.id, "quiet")
                }
                Note("${event.subjectName} · ${event.checkId?.let { vettingCheckById(event.roleId, it)?.name ?: it } ?: vettingRoleById(event.roleId)?.name ?: event.roleId}")
                Note("${formatVettingTime(event.at)} · ${event.actor}")
                event.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        Note("An audit trail is only worth having if nothing rewrites it. docs/PRIVACY-AND-SECURITY.md lists the real one as not built.")
    }
}

/* ---- One party's status ------------------------------------------------------------------------
   The screen a vetted party sees about themselves, and the one a reviewer decides on. Both need the
   same three things: what has been checked, what is blocking, and what is refused until it passes. */
@Composable fun VettingStatusScreen(store: PreviewStore, subjectId: String, open: (String) -> Unit) {
    val vetting = store.vetting
    val subject = vetting.subjects.firstOrNull { it.id == subjectId }
    if (subject == null) {
        ScreenColumn { EmptyStateCard("That record is not in this preview", "Vetting records live only in memory here, so they go when the app restarts.") }
        return
    }
    val role = vettingRoleById(subject.roleId)
    val summary = summarise(subject)
    var declining by remember { mutableStateOf<String?>(null) }
    var declineNote by remember { mutableStateOf("") }
    var refusedSecond by remember { mutableStateOf<String?>(null) }
    val decisions = capabilityDecisions(subject)
    val allowed = decisions.count { (_, _, decision) -> decision.allowed }
    val renewal: (@Composable ColumnScope.() -> Unit)? = summary.nextDue?.let { (check, days) ->
        {
            DeckFigure(
                value = "${abs(days)}", unit = if (abs(days) == 1L) "day" else "days",
                label = when {
                    days < 0 -> "since ${check.name} lapsed"
                    days == 0L -> "${check.name} renews today"
                    else -> "until ${check.name} renews — the soonest of ${summary.total} checks"
                },
                chip = if (days < 0) "Lapsed" else null, flagged = days < 0, ground = DeckGround.NIGHT
            )
        }
    }
    ScreenColumn {
        /* ONE PARTY'S STANDING, AS A DECK.
           The status used to be a white card holding a progress bar, and the bar was the single most
           important drawing on the screen at twelve points tall. The deck counts the same arithmetic in
           three places: the ring is this role's checks with the passing ones lit, the panel's dial is
           the capabilities this party may use out of every one the role is granted, and the night card
           crossing its edge is the soonest renewal in days — the countdown the old line spelled out.
           Every one of them is counted off the lists below, and the sentence that says why is still
           the first thing on the sheet. */
        DeckHero(
            content = {
                DeckPreviewMark()
                DeckHeadline(
                    role?.name ?: "Vetting",
                    listOf(DeckWord.Glyph(Icons.Outlined.VerifiedUser), DeckWord.Words(subject.name)),
                    tail = "${subject.reference}${subject.zone?.let { " · $it" } ?: ""} · ${role?.summary ?: ""}"
                )
                DeckGlassCard {
                    DeckFigure(
                        value = "${summary.passed}", label = "of ${summary.total} ${thuso(Phrase.VETTING_PROGRESS, store.locale)}",
                        chip = summary.status.label, flagged = !summary.cleared,
                        shape = DeckShape.Ring(summary.states.map { it.second in passingStates })
                    )
                }
                DeckPanel(float = renewal) {
                    DeckFigure(
                        value = "$allowed", label = "of ${decisions.size} capabilities this party may use",
                        chip = if (allowed == decisions.size) "Nothing refused" else "${decisions.size - allowed} refused",
                        flagged = allowed < decisions.size,
                        shape = DeckShape.Gauge(allowed, decisions.size), ground = DeckGround.PANEL
                    )
                }
            },
            sheet = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(thuso(Phrase.VETTING_STATUS, store.locale), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    StatusPill(summary.status.label, tone(summary.status))
                }
                /* Where the party stands among the seven gates, computed from the checks rather than
                   stored. A fail rule is the contract's sentence, word for word; a suspension or a
                   decline is said just below and is not said twice. */
                val progress = gateProgress(subject)
                ReviewLine("Onboarding", progress.status)
                if (progress.outcome in listOf(GateOutcome.STOPPED, GateOutcome.FAILED, GateOutcome.HELD)) {
                    progress.sentence?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Danger) }
                }
                when {
                    subject.declined -> Text(subject.declinedReason ?: "This application was declined.", style = MaterialTheme.typography.bodyMedium, color = Danger)
                    subject.suspended -> Text(subject.suspendedReason ?: "This party is suspended.", style = MaterialTheme.typography.bodyMedium, color = Danger)
                    summary.lapsed.isNotEmpty() -> Text("${summary.lapsed.joinToString(" and ") { it.name }} lapsed. Nothing was decided — the renewal date simply passed.", style = MaterialTheme.typography.bodyMedium, color = Danger)
                    summary.awaitingSecond.isNotEmpty() -> Text("${summary.awaitingSecond.joinToString(" and ") { it.name }} is verified by one reviewer and still needs a second.", style = MaterialTheme.typography.bodyMedium)
                    summary.blocking.isNotEmpty() -> Text("Still to pass: ${summary.blocking.joinToString(", ") { it.name }}.", style = MaterialTheme.typography.bodyMedium)
                    else -> Text("Every check is in date. Re-vetting continues on a schedule.", style = MaterialTheme.typography.bodyMedium)
                }
                if (subject.appealed) Note("An appeal has been lodged. The decline stands until it is decided.")
                if (subject.scope.isNotEmpty()) Note("Scope: ${subject.scope.joinToString(", ")}")
                if (subject.declined || subject.suspended) OutlinedButton(onClick = { vetting.restore(subject.id, "Appeal upheld. The declined check still has to be decided again.") }, shape = ThusoButtonShape) { Text("Uphold the appeal") }
            }
        )
        DeckSectionHead("Acting as")
        DeckPills("", vetting.reviewer, vettingReviewers.map { it to it }, onNight = false) { vetting.reviewer = it }
        Note("A high-risk check needs two different reviewers. Change who you are acting as to second one — the same signature twice is one signature.")
        DeckSectionHead("Checks", count = "${summary.passed}/${summary.total}")
        summary.states.forEach { (check, state) ->
            val record = recordFor(subject, check.id)
            val authority = vettingAuthorityById(check.authority)
            val awaiting = needsSecondReviewer(subject, check.id)
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(check.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
                    StatusPill(if (awaiting) "Awaiting second" else state.label, if (awaiting) "sky" else tone(state))
                }
                Note(check.detail)
                ReviewLine("Issuing authority", "${authority?.short} · ${authority?.verifies}")
                ReviewLine("Evidence", check.evidence)
                ReviewLine("Renews", check.renewMonths?.let { "Every $it months" } ?: "Does not renew")
                ReviewLine("Risk", if (check.risk == "high") "High — two reviewers" else "Standard")
                ReviewLine("Decided by", record.decidedBy ?: "Nobody yet")
                if (check.risk == "high") ReviewLine("Seconded by", record.secondedBy ?: "Nobody yet")
                Note(expiryWording(record))
                record.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Danger) }
                if (refusedSecond == check.id) Note("You verified this check yourself. A second reviewer has to be somebody else.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state == CheckState.VERIFIED || state == CheckState.EXPIRING) {
                        if (awaiting) DeckButton(onClick = { refusedSecond = if (vetting.second(subject.id, check.id)) null else check.id }, shape = ThusoButtonShape) { Text("Second this check") }
                        else OutlinedButton(onClick = { vetting.verify(subject.id, check.id, renewal = true) }, shape = ThusoButtonShape) { Text("Renew") }
                    } else {
                        DeckButton(onClick = { vetting.verify(subject.id, check.id) }, shape = ThusoButtonShape) { Text(if (state == CheckState.LAPSED) "Re-verify" else "Verify") }
                    }
                    if (state != CheckState.DECLINED) OutlinedButton(onClick = { declining = check.id; declineNote = "" }, shape = ThusoButtonShape) { Text("Decline") }
                }
                if (declining == check.id) {
                    OutlinedTextField(
                        declineNote, { declineNote = it.take(300) }, label = { Text("Why is this refused?") },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
                        supportingText = { Text("A decline without a reason is a decision the applicant cannot answer.") }
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { declining = null }, shape = ThusoButtonShape) { Text("Cancel") }
                        DeckButton(onClick = { vetting.decline(subject.id, check.id, declineNote.trim()); declining = null }, enabled = declineNote.trim().length >= 10, shape = ThusoButtonShape) { Text("Record the decline") }
                    }
                }
            }
        }
        /* The matrix is the module's whole argument: not a list of documents, but a refusal with a
           reason, in the words the applicant is owed. */
        DeckSectionHead("What this party may do", count = "$allowed of ${decisions.size}")
        decisions.forEach { (capability, _, decision) ->
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(if (decision.allowed) Icons.Outlined.CheckCircle else Icons.Outlined.Block, null, tint = if (decision.allowed) DeckInk.sheetInk else Danger)
                    Text(capability.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
                    StatusPill(if (decision.allowed) "Allowed" else "Refused", if (decision.allowed) "teal" else "danger")
                }
                Note(capability.detail)
                decision.reason?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Danger) }
                if (decision.blockedBy.isNotEmpty()) Note("Blocked by: ${decision.blockedBy.joinToString(", ") { it.name }}")
            }
        }
        OutlinedButton(onClick = { open("Vetting pipeline") }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Back to the register") }
        Note("Fictional party, fictional credentials, fictional decisions. Clearing somebody here clears nobody.")
    }
}

/* ---- The applicant flow ------------------------------------------------------------------------
   The same six steps for every vetted role, because the questions are the same questions: who are
   you, what are you registered to do, what can you show for it, and what are you undertaking. What
   changes is which authority is asked, and that is data rather than a screen per role. */
@Composable fun VettingApplicationScreen(store: PreviewStore, initialRole: String?, open: (String) -> Unit, close: () -> Unit) {
    val vetting = store.vetting
    var roleId by remember { mutableStateOf(initialRole) }
    var step by remember { mutableIntStateOf(if (initialRole == null) 0 else 1) }
    var applicant by remember { mutableStateOf("") }
    val credentials = remember { mutableStateMapOf<String, String>() }
    var scope by remember { mutableStateOf(setOf<String>()) }
    var attached by remember { mutableStateOf(setOf<String>()) }
    var agreed by remember { mutableStateOf(setOf<Int>()) }
    var attested by remember { mutableStateOf(false) }
    var submittedId by remember { mutableStateOf<String?>(null) }

    val role = roleId?.let { vettingRoleById(it) }
    val practice = roleId?.let { scopeFor(it) }
    val steps = listOfNotNull("Role", "Credentials", practice?.let { "Scope" }, "Evidence", "Declarations", "Attest")
    val stepId = steps[step.coerceIn(0, steps.size - 1)]
    val credentialChecks = role?.checks.orEmpty().filter { vettingAuthorityById(it.authority)?.pattern?.isNotEmpty() == true }
    val anchor = credentialChecks.firstOrNull()
    fun entry(check: VettingCheck) = credentials[check.id].orEmpty()
    fun problem(check: VettingCheck): String? {
        val value = entry(check)
        if (value.isEmpty()) return null                                  // an unheld number is outstanding, not wrong
        val result = validateCredential(check.authority, value)
        return if (result.ok) null else result.reason
    }
    val credentialsReady = applicant.isNotBlank() && credentialChecks.none { problem(it) != null } &&
        (anchor == null || validateCredential(anchor.authority, entry(anchor)).ok)
    val declarations = roleId?.let { declarationsFor(it) }.orEmpty()
    val reference = anchor?.let { "${vettingAuthorityById(it.authority)?.short} ${entry(it)}".trim() } ?: "Application"

    if (submittedId != null) {
        ScreenColumn {
            DemoBadge()
            Heading("Vetting", "Application lodged", "Nothing was transmitted, and no register was contacted.")
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.Schedule, null, tint = DeckInk.sheetInk)
                    Text("$applicant · ${role?.name}", style = MaterialTheme.typography.titleMedium)
                }
                Text("You are refused everything on the list below until each check passes. That is the honest position, and it is what the applicant is told rather than “your application is being processed”.", style = MaterialTheme.typography.bodyMedium)
                role?.grants?.forEach { grant -> Note("• ${grant.refusal}") }
            }
            DeckButton(onClick = { open("Vetting: $submittedId") }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Open the vetting record") }
            OutlinedButton(onClick = close, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Close") }
        }
        return
    }
    ScreenColumn {
        DemoBadge()
        StepDots(step + 1, steps.size, stepId)
        when (stepId) {
            "Role" -> {
                Heading("Vetting", "Who is applying?", "Twelve kinds of party are vetted on MyThuso, and each is refused something specific until its checks pass.")
                vettingRoles.forEach { option ->
                    CareCard(Modifier.clickable { roleId = option.id; credentials.clear(); scope = emptySet(); attached = emptySet(); agreed = emptySet() }) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            RadioButton(roleId == option.id, { roleId = option.id }, Modifier.semantics { selected = roleId == option.id })
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(option.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge, color = DeckInk.sheetInk)
                                Note(option.summary)
                                Note("${option.checks.size} checks · ${option.workspace} workspace")
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = close, shape = ThusoButtonShape) { Text("Close") }
                    DeckButton(onClick = { step = 1 }, enabled = roleId != null, shape = ThusoButtonShape) { Text("Continue") }
                }
            }
            "Credentials" -> {
                Heading("Vetting", "Your credentials", "Checked as you type, on the phone, against the format the issuing body actually uses. Nothing is sent anywhere.")
                OutlinedTextField(
                    applicant, { applicant = it.take(70) },
                    label = { Text(if (role?.party == "person") "Your full name" else if (role?.party == "site") "Site name" else "Registered name") },
                    singleLine = true, modifier = Modifier.fillMaxWidth()
                )
                credentialChecks.forEach { check ->
                    val authority = vettingAuthorityById(check.authority)!!
                    val digits = authority.pattern == "sa-id" || authority.pattern.startsWith("^\\d")
                    val message = problem(check)
                    OutlinedTextField(
                        entry(check),
                        { raw -> credentials[check.id] = if (digits) raw.filter { c -> c.isDigit() }.take(13) else raw.uppercase().take(24) },
                        label = { Text("${check.name} · ${authority.short}") },
                        keyboardOptions = KeyboardOptions(keyboardType = if (digits) KeyboardType.NumberPassword else KeyboardType.Text),
                        singleLine = true, isError = message != null, modifier = Modifier.fillMaxWidth(),
                        supportingText = {
                            Text(
                                message ?: "${authority.name} · ${authority.format}. For example ${authority.example}.",
                                color = if (message != null) Danger else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )
                }
                Note("Leave a number you do not have yet blank — that check stays outstanding rather than becoming wrong. ${anchor?.name ?: "The first credential"} is the one this application hangs on.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step = 0 }, shape = ThusoButtonShape) { Text("Back") }
                    DeckButton(onClick = { step = 2 }, enabled = credentialsReady, shape = ThusoButtonShape) { Text("Continue") }
                }
            }
            "Scope" -> {
                Heading("Vetting", practice!!.title, practice.detail)
                FlowRowChips(practice.options, scope) { option -> scope = if (option in scope) scope - option else scope + option }
                Note("Declaring a scope is not being granted it. Every check below still has to pass first.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step -= 1 }, shape = ThusoButtonShape) { Text("Back") }
                    DeckButton(onClick = { step += 1 }, enabled = scope.isNotEmpty(), shape = ThusoButtonShape) { Text("Continue") }
                }
            }
            "Evidence" -> {
                Heading("Vetting", "What you have to show", "One slot per check: the document, who verifies it, and how often it has to be done again.")
                role?.checks?.forEach { check ->
                    val authority = vettingAuthorityById(check.authority)
                    val on = check.id in attached
                    CareCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(check.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
                            if (check.risk == "high") StatusPill("Two reviewers", "quiet")
                        }
                        Note(check.detail)
                        ReviewLine("Document", check.evidence)
                        ReviewLine("Verified by", "${authority?.name}")
                        ReviewLine("Renews", check.renewMonths?.let { "Every $it months" } ?: "Does not renew")
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (on) "Attached in this preview" else "Nothing attached", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            Switch(on, { checked -> attached = if (checked) attached + check.id else attached - check.id })
                        }
                    }
                }
                Note("This preview attaches nothing. There is no upload, no storage and no transmission — the switch records only that the slot was filled.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step -= 1 }, shape = ThusoButtonShape) { Text("Back") }
                    DeckButton(onClick = { step += 1 }, shape = ThusoButtonShape) { Text("Continue") }
                }
            }
            "Declarations" -> {
                Heading("Vetting", "What you are undertaking", "Written in the first person, and about what you give up rather than what MyThuso gains.")
                declarations.forEachIndexed { index, declaration ->
                    CareCard { Setting(declaration, index in agreed) { on -> agreed = if (on) agreed + index else agreed - index } }
                }
                Note("Every undertaking is required. An application cannot proceed on a partial one.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step -= 1 }, shape = ThusoButtonShape) { Text("Back") }
                    DeckButton(onClick = { step += 1 }, enabled = agreed.size == declarations.size, shape = ThusoButtonShape) { Text("Continue") }
                }
            }
            else -> {
                Heading("Vetting", "Before you submit", "Read it back. This is what the reviewer will see.")
                CareCard {
                    ReviewLine("Applying as", role?.name ?: "—")
                    ReviewLine("Name", applicant)
                    ReviewLine("Reference", reference)
                    if (scope.isNotEmpty()) ReviewLine(practice?.title ?: "Scope", scope.sorted().joinToString(", "))
                    ReviewLine("Evidence attached", "${attached.size} of ${role?.checks?.size ?: 0}")
                    ReviewLine("Undertakings signed", "${agreed.size}")
                }
                CareCard {
                    Text("Until every check passes", style = MaterialTheme.typography.titleMedium)
                    role?.grants?.forEach { grant ->
                        val capability = vettingCapabilityById(grant.capability)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(capability?.name ?: grant.capability, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
                            Text(grant.refusal, style = MaterialTheme.typography.bodyMedium, color = Danger)
                        }
                    }
                }
                Setting("I attest that everything I have entered is true, and I accept that a false declaration ends the application and any access it would have given.", attested) { attested = it }
                Note("Re-vetting runs on a schedule, not once at sign-up. A lapsed registration removes a party automatically, without anybody deciding anything.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step -= 1 }, shape = ThusoButtonShape) { Text("Back") }
                    DeckButton(
                        onClick = { submittedId = vetting.startApplication(roleId!!, applicant.trim(), reference, scope.sorted(), attached).id },
                        enabled = attested && applicant.isNotBlank()
                    , shape = ThusoButtonShape) { Text("Submit demo application") }
                }
            }
        }
    }
}
