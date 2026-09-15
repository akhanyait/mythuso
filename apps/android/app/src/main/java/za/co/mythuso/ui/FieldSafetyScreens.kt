package za.co.mythuso.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import za.co.mythuso.model.*

/* The nurse safety suite on Android: the strip on the visit a nurse is in, and the queue the Control
 * Tower works. Every word is FieldSafetyData.kt, generated from the contract; every rule is
 * model/FieldSafety.kt.
 *
 * The strip is small and panic is not: one line of time, three plain controls, and a panic control that
 * is findable without looking, full width, its own colour and its own word. Panic asks once, and the
 * confirmation is the only place the window is stated before it starts. The desk sees a nurse and a
 * suburb, never the service or the person visited, and a position only while its window is open.
 *
 * The store is here rather than in PreviewStore because it needs the dispatch roster, which is drawn by
 * this package. It is in memory only: a timer or a panic is gone when the process is.
 */
object FieldSafetyStore {
    const val nurseOnShift = "N-205"
    val timers = mutableStateListOf<VisitTimer>()
    val panics = mutableStateListOf<SafetyPanic>()
    var now by mutableStateOf(System.currentTimeMillis())
        private set
    private var serial = 413
    private var seeded = false

    private fun nurse(id: String) = DispatchBoard.roster.firstOrNull { it.id == id }
    private fun zoneOf(id: String) = nurse(id)?.let { Geography.zoneNamed(it.area) }?.at
    private fun nextRef(prefix: String): String {
        serial += 1
        return prefix + "-0" + serial
    }

    fun ensureSeeded() {
        if (seeded) return
        seeded = true
        seed(System.currentTimeMillis())
    }

    /* A late nurse, an open panic and one resolved this morning, each run through the rules at the time it
       happened and moved forward to now. */
    private fun seed(start: Long) {
        val others = DispatchBoard.roster.filter { it.id != nurseOnShift && Geography.zoneNamed(it.area) != null }
        if (others.size < 3) return
        val lateService = "senior"
        val lateBy = (FieldSafety.serviceMinutes(lateService) ?: 0) + FieldSafetyData.graceMinutes + 12
        FieldSafety.makeTimer("CHK-0412", "TH-2044", lateService, others[0].id, start - FieldSafety.minutesToMillis(lateBy))
            ?.let { timers.add(FieldSafety.tick(it, start)) }
        var open = FieldSafety.raisePanic("PNC-0088", others[1].id, "TH-2046", start - FieldSafety.minutesToMillis(4))
        zoneOf(open.nurseId)?.let { point ->
            val fed = FieldSafety.receivePosition(open, point.lat, point.lng, start - FieldSafetyData.positionEverySeconds * 1000L)
            if (fed is SafetyResult.Done) open = fed.value
        }
        val morning = start - 3 * 3_600_000L
        var resolved = FieldSafety.raisePanic("PNC-0081", others[2].id, "TH-2031", morning)
            .copy(acknowledgedAt = morning + FieldSafety.minutesToMillis(1))
        val closed = FieldSafety.resolve(resolved, "pressed-by-mistake", morning + FieldSafety.minutesToMillis(6))
        if (closed is SafetyResult.Done) resolved = closed.value
        panics.addAll(listOf(open, resolved))
        now = start
    }

    fun advance(at: Long) {
        ensureSeeded()
        now = at
        for (i in timers.indices) {
            val next = FieldSafety.tick(timers[i], at)
            if (next != timers[i]) timers[i] = next
        }
        for (i in panics.indices) {
            var panic = panics[i]
            val last = panic.position
            if (panic.isSharing(at) && (last == null || at - last.at >= FieldSafetyData.positionEverySeconds * 1000L)) {
                val point = zoneOf(panic.nurseId)
                if (point != null) {
                    val fed = FieldSafety.receivePosition(panic, point.lat, point.lng, at)
                    if (fed is SafetyResult.Done) panic = fed.value
                }
            }
            panic = FieldSafety.sweep(panic, at)
            if (panic != panics[i]) panics[i] = panic
        }
    }

    fun timerFor(appointmentRef: String): VisitTimer? = timers.lastOrNull { it.appointmentRef == appointmentRef }
    fun panicFor(appointmentRef: String): SafetyPanic? = panics.lastOrNull { it.appointmentRef == appointmentRef }

    private fun onTimer(match: (VisitTimer) -> Boolean, change: (VisitTimer, Long) -> SafetyResult<VisitTimer>): FieldSafetyRefusal? {
        val at = System.currentTimeMillis()
        advance(at)
        val index = timers.indexOfLast(match)
        if (index < 0) return FieldSafety.refusal("checkin-after-close")
        return when (val result = change(timers[index], at)) {
            is SafetyResult.Done -> { timers[index] = result.value; null }
            is SafetyResult.Refused -> result.refusal
        }
    }

    private fun onPanic(panicRef: String, change: (SafetyPanic, Long) -> SafetyResult<SafetyPanic>): FieldSafetyRefusal? {
        val at = System.currentTimeMillis()
        advance(at)
        val index = panics.indexOfFirst { it.panicRef == panicRef }
        if (index < 0) return FieldSafety.refusal("panic-already-resolved")
        return when (val result = change(panics[index], at)) {
            is SafetyResult.Done -> { panics[index] = result.value; null }
            is SafetyResult.Refused -> result.refusal
        }
    }

    /** appointment.in_progress, as the preview has it: the visit code matched at the door. */
    fun startVisit(appointmentRef: String, serviceId: String, codeMatched: Boolean): FieldSafetyRefusal? {
        val at = System.currentTimeMillis()
        advance(at)
        val running = timerFor(appointmentRef)
        if (running != null && running.closedAt == null) return null
        if (!codeMatched) return FieldSafety.refusal("timer-without-a-matched-code")
        val made = FieldSafety.makeTimer(nextRef("CHK"), appointmentRef, serviceId, nurseOnShift, at)
            ?: return FieldSafety.refusal("timer-for-an-unknown-service")
        timers.add(made)
        return null
    }
    fun checkIn(appointmentRef: String) = onTimer({ it.appointmentRef == appointmentRef }) { timer, at -> FieldSafety.checkIn(timer, at) }
    fun extend(appointmentRef: String, minutes: Int, reasonId: String?) =
        onTimer({ it.appointmentRef == appointmentRef }) { timer, at -> FieldSafety.extend(timer, minutes, reasonId, at) }
    fun checkOut(appointmentRef: String) = onTimer({ it.appointmentRef == appointmentRef }) { timer, at -> FieldSafety.close(timer, false, at) }
    /** appointment.completed, as the preview has it: the assessment signed. Closes a timer if there is one. */
    fun visitSigned(appointmentRef: String): FieldSafetyRefusal? {
        val timer = timerFor(appointmentRef) ?: return null
        if (timer.closedAt != null) return null
        return onTimer({ it.appointmentRef == appointmentRef }) { open, at -> FieldSafety.close(open, true, at) }
    }
    fun pressPanic(appointmentRef: String?): FieldSafetyRefusal? {
        val at = System.currentTimeMillis()
        advance(at)
        if (FieldSafety.openPanicFor(panics, nurseOnShift, appointmentRef, at) != null) return null
        var panic = FieldSafety.raisePanic(nextRef("PNC"), nurseOnShift, appointmentRef, at)
        val point = zoneOf(nurseOnShift)
        if (point != null) {
            val fed = FieldSafety.receivePosition(panic, point.lat, point.lng, at)
            if (fed is SafetyResult.Done) panic = fed.value
        }
        panics.add(panic)
        return null
    }

    fun pickUp(row: SafetyDeskRow): FieldSafetyRefusal? =
        if (row.isPanic) onPanic(row.reference) { panic, at -> FieldSafety.acknowledge(panic, at) }
        else onTimer({ it.checkinRef == row.reference }) { timer, at -> FieldSafety.acknowledgeOverdue(timer, at) }
    fun closeOverdue(checkinRef: String, reasonId: String?) =
        onTimer({ it.checkinRef == checkinRef }) { timer, _ -> FieldSafety.silenceOverdue(timer, reasonId) }
    fun resolve(panicRef: String, outcomeId: String?) = onPanic(panicRef) { panic, at -> FieldSafety.resolve(panic, outcomeId, at) }
    fun position(panicRef: String): SafetyResult<SafetyPosition?> =
        panics.firstOrNull { it.panicRef == panicRef }?.let { FieldSafety.positionFor(it, now) }
            ?: SafetyResult.Refused(FieldSafety.refusal("panic-already-resolved"))

    /* Oldest first inside each group: a panic nobody has picked up, then a timer nobody has picked up, then
       what the desk already holds, then what is closed. */
    fun desk(): List<SafetyDeskRow> {
        val at = now
        val fromPanics = panics.map { panic ->
            val nurse = nurse(panic.nurseId)
            SafetyDeskRow(panic.panicRef, true, nurse?.name ?: panic.nurseId, nurse?.area ?: "", panic.raisedAt,
                maxOf(0L, (at - panic.raisedAt) / FieldSafety.MINUTE).toInt(), panic.acknowledgedAt, null,
                panic.outcomeId?.let { FieldSafety.label(FieldSafetyData.outcomes, it) }, panic.sharingEndsAt, panic.isSharing(at), panic.resolvedAt == null)
        }
        val fromTimers = timers.mapNotNull { timer ->
            val episode = timer.overdue ?: return@mapNotNull null
            val nurse = nurse(timer.nurseId)
            SafetyDeskRow(timer.checkinRef, false, nurse?.name ?: timer.nurseId, nurse?.area ?: "", episode.since,
                maxOf(0L, (at - episode.since) / FieldSafety.MINUTE).toInt(), episode.acknowledgedAt, episode.answeredAt,
                episode.silencedReasonId?.let { FieldSafety.label(FieldSafetyData.silenceReasons, it) }, null, false, episode.silencedReasonId == null)
        }
        return (fromPanics + fromTimers).sortedWith(compareBy<SafetyDeskRow>({ it.rank }, { it.raisedAt }))
    }
}

/** The clock moves on the simulated feed cadence while a screen is looking. It moves time; it animates nothing. */
@Composable fun FieldSafetyClock() {
    LaunchedEffect(Unit) {
        FieldSafetyStore.advance(System.currentTimeMillis())
        while (true) {
            delay(FieldSafetyData.positionEverySeconds * 1000L)
            FieldSafetyStore.advance(System.currentTimeMillis())
        }
    }
}

@Composable private fun SafetyRule(colour: Color, modifier: Modifier = Modifier) {
    Box(modifier.width(3.dp).background(colour, RoundedCornerShape(2.dp)))
}

@Composable private fun ChoiceLine(label: String, selected: Boolean, pick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected = selected, onClick = pick, role = Role.RadioButton),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

@Composable fun VisitSafetyPanel(reference: String) {
    FieldSafetyClock()
    var extending by remember { mutableStateOf(false) }
    var reasonId by remember { mutableStateOf<String?>(null) }
    var confirming by remember { mutableStateOf(false) }
    var refused by remember { mutableStateOf<FieldSafetyRefusal?>(null) }
    val now = FieldSafetyStore.now
    val timer = FieldSafetyStore.timerFor(reference) ?: return
    val panic = FieldSafetyStore.panicFor(reference)
    val standing = timer.standing(now)
    val roomy = LocalDensity.current.fontScale < 1.5f
    val nurseText = FieldSafetyData.NurseText
    val panicText = FieldSafetyData.PanicText
    CareCard {
        Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            SafetyRule(if (standing == "overdue") Danger else if (standing == "closed") Line else Faint, Modifier.fillMaxHeight())
            Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(nurseText.heading + " · " + FieldSafety.label(FieldSafetyData.timerStates, standing), style = MaterialTheme.typography.labelMedium, color = Faint)
                val closedAt = timer.closedAt
                val headline = if (closedAt != null)
                    FieldSafety.fill(if (timer.closedBySigning) nurseText.closedBySigning else nurseText.closedByNurse, mapOf("at" to FieldSafety.clock(closedAt)))
                else FieldSafety.fill(nurseText.due, mapOf("due" to FieldSafety.clock(timer.dueAt)))
                Text(headline, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                if (standing != "closed") {
                    val base = if (standing == "overdue") FieldSafety.fill(nurseText.overdue, mapOf("since" to FieldSafety.clock(timer.dueAt)))
                    else FieldSafety.fill(nurseText.left, mapOf("minutes" to timer.minutesLeft(now).toString()))
                    val episode = timer.overdue
                    val answeredAt = if (episode != null && episode.silencedReasonId == null) episode.answeredAt else null
                    val line = if (answeredAt != null) base + " " + FieldSafety.fill(nurseText.answered, mapOf("at" to FieldSafety.clock(answeredAt))) else base
                    Text(line, style = MaterialTheme.typography.bodySmall, color = if (standing == "overdue") Danger else Faint)
                }
            }
        }
        if (standing != "closed") {
            val controls: @Composable (Modifier) -> Unit = { each ->
                OutlinedButton(onClick = { refused = FieldSafetyStore.checkIn(reference) }, modifier = each, shape = ThusoButtonShape) { Text(nurseText.checkIn) }
                OutlinedButton(onClick = { extending = !extending; refused = null }, modifier = each, shape = ThusoButtonShape) { Text(nurseText.extend) }
                OutlinedButton(onClick = { refused = FieldSafetyStore.checkOut(reference); extending = false }, modifier = each, shape = ThusoButtonShape) { Text(nurseText.checkOut) }
            }
            if (roomy) Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) { controls(Modifier.weight(1f).heightIn(min = 48.dp)) }
            else Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) { controls(Modifier.fillMaxWidth().heightIn(min = 48.dp)) }
        }
        OutlinedButton(
            onClick = { confirming = true; refused = null },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            shape = ThusoButtonShape,
            border = BorderStroke(2.dp, Danger),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger)
        ) {
            Icon(Icons.Outlined.ReportProblem, contentDescription = null)
            Spacer(Modifier.width(ThusoSpacing.space8))
            Text(panicText.press, style = MaterialTheme.typography.labelLarge)
        }
        if (extending && standing != "closed") {
            Text(nurseText.extendQuestion, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            FieldSafetyData.extensionReasons.forEach { reason ->
                ChoiceLine(reason.label, reasonId == reason.id) { reasonId = reason.id }
            }
            val offered = timer.stepsOffered
            if (offered.isEmpty()) {
                /* The ceiling says so in the sentence on the route, rather than as buttons that do nothing. */
                Note(FieldSafety.refusal("extension-limit").statement)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                    offered.forEach { step ->
                        OutlinedButton(
                            onClick = {
                                refused = FieldSafetyStore.extend(reference, step, reasonId)
                                if (refused == null) { extending = false; reasonId = null }
                            },
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp), shape = ThusoButtonShape
                        ) { Text(FieldSafety.fill(nurseText.extendStep, mapOf("minutes" to step.toString()))) }
                    }
                }
                Note(FieldSafety.fill(nurseText.extendLeft, mapOf("minutes" to timer.extensionLeft.toString())))
            }
        }
        if (confirming) {
            val ends = FieldSafety.clock(now + FieldSafety.minutesToMillis(FieldSafetyData.panicWindowMinutes))
            Column(
                Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.card))
                    .border(2.dp, Danger, RoundedCornerShape(ThusoRadius.card)).padding(ThusoSpacing.space16),
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
            ) {
                Text(panicText.confirmQuestion, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(FieldSafety.fill(panicText.whatHappens, mapOf("ends" to ends)), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Text(panicText.whatDoesNotHappen, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                NotConnected("emergency")
                Button(
                    onClick = {
                        refused = FieldSafetyStore.pressPanic(reference)
                        if (refused == null) confirming = false
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = ThusoButtonShape,
                    colors = ButtonDefaults.buttonColors(containerColor = Danger, contentColor = SurfaceWhite)
                ) {
                    Icon(Icons.Outlined.ReportProblem, contentDescription = null)
                    Spacer(Modifier.width(ThusoSpacing.space8))
                    Text(panicText.confirm, style = MaterialTheme.typography.labelLarge)
                }
                OutlinedButton(onClick = { confirming = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = ThusoButtonShape) {
                    Text(panicText.cancel)
                }
            }
        }
        if (panic != null && !confirming) {
            val sharing = panic.isSharing(now)
            val ends = FieldSafety.clock(panic.sharingEndsAt)
            Column(
                Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.control)).padding(ThusoSpacing.space12)
                    .semantics(mergeDescendants = true) {},
                verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
            ) {
                Text(FieldSafety.label(FieldSafetyData.panicStates, panic.standing) + " · " + FieldSafety.fill(panicText.pressedAt, mapOf("at" to FieldSafety.clock(panic.raisedAt))),
                    style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text(if (sharing) FieldSafety.fill(panicText.sharingUntil, mapOf("ends" to ends)) else FieldSafety.fill(panicText.sharingStopped, mapOf("ended" to ends)),
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                if (!sharing && panic.resolvedAt == null) Text(panicText.pressAgain, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }
        refused?.let { Text(it.statement, style = MaterialTheme.typography.bodySmall, color = Danger) }
    }
}

@Composable fun SafetyDeskSection() {
    FieldSafetyClock()
    val rows = FieldSafetyStore.desk()
    val waiting = rows.count { it.open && it.acknowledgedAt == null }
    val open = rows.count { it.open }
    val deskText = FieldSafetyData.DeskText
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        DeckSectionHead(deskText.heading, open.toString(), FieldSafety.fill(deskText.waiting, mapOf("waiting" to waiting.toString(), "open" to open.toString())))
        NotConnected("emergency")
        NotConnected("dispatch")
        if (open == 0) Note(deskText.empty)
        rows.forEach { row -> key(row.reference) { SafetyDeskRowCard(row) } }
    }
}

@Composable private fun SafetyDeskRowCard(row: SafetyDeskRow) {
    var choice by remember(row.reference) { mutableStateOf<String?>(null) }
    var refused by remember(row.reference) { mutableStateOf<FieldSafetyRefusal?>(null) }
    val deskText = FieldSafetyData.DeskText
    /* A rule and a word for the kind, never colour alone. */
    val rule = when {
        !row.open -> Color.Transparent
        row.acknowledgedAt != null -> Faint
        row.isPanic -> Danger
        else -> MangoInk
    }
    val pickedUp = row.acknowledgedAt
    val standing = when {
        !row.open -> FieldSafety.fill(deskText.closedLine, mapOf("outcome" to (row.outcome ?: "")))
        pickedUp != null -> FieldSafety.fill(deskText.pickedUp, mapOf("at" to FieldSafety.clock(pickedUp)))
        else -> deskText.notPickedUp
    }
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            SafetyRule(rule, Modifier.height(16.dp))
            Text(if (row.isPanic) deskText.kindPanic else deskText.kindOverdue, style = MaterialTheme.typography.labelLarge, color = Charcoal)
            Text(row.reference, style = MaterialTheme.typography.labelMedium, color = Faint)
            Spacer(Modifier.weight(1f))
            Text(FieldSafety.fill(deskText.age, mapOf("minutes" to row.ageMinutes.toString())), style = MaterialTheme.typography.labelMedium, color = Charcoal)
        }
        Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(row.nurse, style = MaterialTheme.typography.titleMedium, color = if (row.open) Charcoal else Faint)
            Note(row.suburb + " · " + FieldSafety.fill(deskText.raisedAt, mapOf("at" to FieldSafety.clock(row.raisedAt))))
            Text(standing, style = MaterialTheme.typography.bodySmall, color = if (row.open) Charcoal else Faint)
            val answered = row.answeredAt
            if (row.open && answered != null) Text(FieldSafety.fill(deskText.answered, mapOf("at" to FieldSafety.clock(answered))), style = MaterialTheme.typography.bodySmall, color = Charcoal)
        }
        if (row.isPanic) {
            when (val read = FieldSafetyStore.position(row.reference)) {
                is SafetyResult.Done -> Column(
                    Modifier.fillMaxWidth().border(1.dp, Line, RoundedCornerShape(ThusoRadius.control)).padding(ThusoSpacing.space12),
                    verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
                ) {
                    Text(deskText.position, style = MaterialTheme.typography.labelMedium, color = Faint)
                    val at = read.value
                    if (at != null) {
                        Text(row.suburb + " · " + at.lat + ", " + at.lng, style = MaterialTheme.typography.bodyLarge, color = Charcoal)
                        val seconds = maxOf(0L, (FieldSafetyStore.now - at.at) / 1000L).toString()
                        Note(FieldSafety.fill(deskText.positionUpdated, mapOf("seconds" to seconds)) + " · " +
                            FieldSafety.fill(deskText.sharingUntil, mapOf("ends" to FieldSafety.clock(row.sharingEndsAt ?: FieldSafetyStore.now))))
                    } else Text(deskText.positionNotYet, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                }
                is SafetyResult.Refused -> Note(read.refusal.statement)
            }
        }
        if (row.open) {
            if (pickedUp == null) {
                StudioButton(onClick = { refused = FieldSafetyStore.pickUp(row) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(deskText.pickUp) }
            } else {
                Text(if (row.isPanic) deskText.outcomeQuestion else deskText.reasonQuestion, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                (if (row.isPanic) FieldSafetyData.outcomes else FieldSafetyData.silenceReasons).forEach { option ->
                    ChoiceLine(option.label, choice == option.id) { choice = option.id; refused = null }
                }
                StudioButton(
                    onClick = { refused = if (row.isPanic) FieldSafetyStore.resolve(row.reference, choice) else FieldSafetyStore.closeOverdue(row.reference, choice) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) { Text(if (row.isPanic) deskText.resolve else deskText.close) }
            }
        }
        refused?.let { Text(it.statement, style = MaterialTheme.typography.bodySmall, color = Danger) }
    }
}
