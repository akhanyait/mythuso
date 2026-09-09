package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import za.co.mythuso.model.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role

/* The teleconsultation call.

   The doctor's review queue and the consultation record already existed; the encounter between them
   did not. This is the whole of it — before, during and after — and the parts that took the design
   work are not the ones that look like a video call.

   Who is in the room. A MyThuso consultation frequently has a nurse standing in the patient's
   kitchen, and sometimes a guardian or an interpreter as well. That is not a private doctor's
   appointment. Everyone who can hear the patient is named before the call opens, with where they are
   standing and what they can hear, and each of them is a separate question put to the patient rather
   than a setting configured for them. Any of them except the doctor can be asked to step out in the
   middle of the call, and the cost of asking is said before the question, not after it: the moment
   the nurse leaves, everything that needed hands is withdrawn from what the doctor may do.

   Recording. Not offered here, and not offered as a switch either. This build has no microphone
   permission, no camera permission and nowhere to put a recording, so a control for it would be a
   control that cannot do what it says — and a patient taught to tick it in a preview has been taught
   to tick it. The screen shows instead what a recording would be for, who could open one, how long
   it would live and how it would be asked for.

   A dropped line. The state this screen exists for, and the one most products handle worst. The
   encounter stays open, the doctor calls back rather than the patient redialling, both ends count
   down the same ninety seconds, and a nurse in the room stays with the patient. If the line does not
   come back the encounter is closed as interrupted — with no assessment, no plan and no signature —
   because a record that cannot tell a finished consultation from an abandoned one is worse than no
   record, since it will be believed.

   Bandwidth. Sound only is a designed path. Most of South Africa, most of the time, is not on a
   connection that carries video, and a product that treats sound as a failure state is a product
   that works in Sandton.

   Nothing connects. No media API is used, no camera or microphone is requested and the manifest
   declares neither permission. Every party is fictional. */

private val callDoctorIds = listOf("D-401", "D-402")
private val callStageNames = listOf("Who is in the room", "Identity", "Recording", "The call", "Afterwards")

@Composable fun TeleconsultScreen(store: PreviewStore, reference: String = "TH-2048", patient: String = "Lerato Molefe", open: (String) -> Unit) {
    var stage by remember { mutableIntStateOf(0) }
    var doctorId by remember { mutableStateOf(callDoctorIds.first()) }
    val present = remember { mutableStateMapOf("nurse" to true, "guardian" to false, "interpreter" to false) }
    val consented = remember { mutableStateMapOf("doctor" to false, "nurse" to false, "guardian" to false, "interpreter" to false) }
    var withdrawnNote by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var codeError by remember { mutableStateOf("") }
    var identityConfirmed by remember { mutableStateOf(false) }
    var mediaState by remember { mutableStateOf(callMedia.state) }
    var connectionId by remember { mutableStateOf("video") }
    var everDropped by remember { mutableStateOf(false) }
    var resumed by remember { mutableStateOf(false) }
    var holdLeft by remember { mutableIntStateOf(callReconnect.holdSeconds) }
    var decisionReached by remember { mutableStateOf(false) }
    var refusedClinician by remember { mutableStateOf(false) }

    val doctor = store.vetting.subject(doctorId)
    val consult = doctor?.let { can(it, "sign-clinical-review") }
    val nursePresent = present["nurse"] == true && consented["nurse"] == true
    val dropped = connectionId == "dropped"
    /* Real seconds, counted on the screen. A countdown that is a label rather than a clock is
       exactly the reassurance this state must not give. */
    LaunchedEffect(dropped, holdLeft) {
        if (dropped && holdLeft > 0) { delay(1000); holdLeft -= 1 }
    }
    val outcome = Teleconsult.outcomeOf(
        CallAttempt(
            clinicianAllowed = !refusedClinician && (consult?.allowed == true),
            identityConfirmed = identityConfirmed,
            consented = consented["doctor"] == true,
            everConnected = identityConfirmed && consented["doctor"] == true,
            lineDropped = everDropped, resumed = resumed, decisionReached = decisionReached
        )
    )
    fun subjectFor(p: CallParticipant) = when (p.id) {
        "doctor" -> doctor
        "nurse" -> store.vetting.subject("N-205")
        "guardian" -> store.vetting.subject("G-032")
        else -> null
    }
    fun displayName(p: CallParticipant) = if (p.id == "patient") patient else subjectFor(p)?.name ?: p.name
    val inTheRoom = callParticipants.filter { it.essential || present[it.id] == true }

    /* Everyone who can hear the patient, with the vetting register's name against the contract's
       role. A roster carrying its own names would be a second copy of the vetting record, and the
       copy is the one the patient would be reading. */
    @Composable fun Roster(canAsk: Boolean) {
        inTheRoom.forEach { person ->
            val out = !person.essential && consented[person.id] != true
            CareCard {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TileIcon(if (out) Icons.Outlined.MeetingRoom else Icons.Outlined.Person,
                        if (out) BodyText else Indigo, if (out) Mist else IndigoSoft, 38.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(displayName(person), style = MaterialTheme.typography.titleSmall, color = if (out) Faint else Charcoal)
                        Text(person.name, style = MaterialTheme.typography.labelMedium, color = Indigo)
                        Text(person.place, style = MaterialTheme.typography.bodySmall, color = Faint)
                        Text("Can see: ${person.sees}", style = MaterialTheme.typography.bodySmall, color = Faint)
                        Text("Can hear: ${person.hears}", style = MaterialTheme.typography.bodySmall, color = Faint)
                        if (out) Text("Not in the room. ${person.ifDeclined.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = BodyText)
                    }
                }
                if (canAsk && person.mayBeAskedToLeave && !out) {
                    OutlinedButton(onClick = {
                        consented[person.id] = false
                        withdrawnNote = Teleconsult.consentFor(person.id)?.revokedMidCall
                    }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Ask ${displayName(person)} to step out") }
                } else if (person.essential && person.id != "patient") {
                    StatusPill("Cannot be asked to leave", "quiet")
                }
            }
        }
    }

    @Composable fun Refusal(item: CallRefusal) {
        Row(Modifier.fillMaxWidth().background(Mist, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.Block, null, tint = Danger)
            Text(item.sentence, style = MaterialTheme.typography.bodySmall, color = Charcoal)
        }
    }

    @Composable fun Row2(label: String, value: String) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = BodyText, modifier = Modifier.weight(1f))
            Text(value, style = MaterialTheme.typography.labelMedium, color = Charcoal)
        }
    }

    ScreenColumn {
        DemoBadge()
        if (stage < 4) StepDots(stage + 1, callStageNames.size, callStageNames[stage])
        Heading("Doctor workspace", "Teleconsultation", "$reference · $patient")

        when (stage) {
            0 -> {
                Text("Who will be able to see and hear you.", style = MaterialTheme.typography.titleMedium)
                Text(Teleconsult.rule("presence-is-consented").sentence, style = MaterialTheme.typography.bodySmall, color = BodyText)
                CareCard {
                    Text("Doctor for this appointment", style = MaterialTheme.typography.labelMedium, color = Charcoal)
                    FlowRowChips(callDoctorIds.map { store.vetting.subject(it)?.name ?: it }, setOf(store.vetting.subject(doctorId)?.name ?: doctorId)) { name ->
                        doctorId = callDoctorIds.firstOrNull { store.vetting.subject(it)?.name == name } ?: doctorId
                    }
                    doctor?.let { Text("${it.name} · ${it.reference}", style = MaterialTheme.typography.bodySmall, color = Faint) }
                    /* The same capability the clinical queue asks about, refused in the same words.
                       A doctor told one thing by the queue and another by the call trusts neither. */
                    if (consult?.allowed == false) {
                        Text(consult.reason.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Danger)
                    }
                }
                CareCard {
                    Text("Who else is at the address or on the call", style = MaterialTheme.typography.labelMedium, color = Charcoal)
                    callParticipants.filter { !it.essential }.forEach { person ->
                        Setting(person.name, present[person.id] == true) { on ->
                            present[person.id] = on; consented[person.id] = false
                        }
                    }
                }
                Roster(canAsk = false)
                Text("Asked one at a time", style = MaterialTheme.typography.titleMedium)
                Text("Each of these is a separate answer, and each can be taken back in the middle of the call.",
                     style = MaterialTheme.typography.bodySmall, color = BodyText)
                inTheRoom.filter { it.consentQuestion != null }.forEach { person ->
                    CareCard {
                        /* The box and the question are one control, not two things read out one
                           after the other. A screen reader that says "checkbox, not ticked" and then,
                           separately, "may this doctor see you and treat you", has asked the patient
                           to hold the two halves together themselves. */
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                                value = consented[person.id] == true, role = Role.Checkbox,
                                onValueChange = { consented[person.id] = it }
                            ),
                            verticalAlignment = Alignment.Top
                        ) {
                            Checkbox(consented[person.id] == true, null)
                            Text("“${person.consentQuestion}”", style = MaterialTheme.typography.bodySmall, color = Charcoal)
                        }
                        if (consented[person.id] != true) {
                            Text("If you say no: ${person.ifDeclined.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = BodyText)
                        } else Teleconsult.consentFor(person.id)?.takeIf { !it.required }?.let {
                            Text("You can change your mind during the call. ${it.revokedMidCall}", style = MaterialTheme.typography.bodySmall, color = Faint)
                        }
                    }
                }
                Refusal(Teleconsult.refusal("silent-observers"))
                if (consult?.allowed == true) {
                    Button(onClick = { stage = 1 }, Modifier.fillMaxWidth(), enabled = consented["doctor"] == true, shape = ThusoButtonShape) { Text("Check identity") }
                } else {
                    Button(onClick = { refusedClinician = true; stage = 4 }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) {
                        Text("Rebook with a doctor whose registration is current")
                    }
                }
            }

            1 -> {
                Text("Both ends, checked.", style = MaterialTheme.typography.titleMedium)
                CareCard {
                    StatusPill("What the patient checks", "quiet")
                    doctor?.let { Row2("The doctor on this call", it.name); Row2("Council registration", it.reference) }
                    Text(callIdentity.patientSideDetail, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
                CareCard {
                    StatusPill("What the doctor checks", "quiet")
                    /* The same six-digit visit code the nurse is asked for at the door. One identity
                       check in MyThuso, not two — a second mechanism invented for video would be a
                       second thing to get wrong, and the one the patient had learned would stop
                       being the one that counts. */
                    Text("${callIdentity.doctorSideDetail} In this preview the code is 482190.",
                         style = MaterialTheme.typography.bodySmall, color = BodyText)
                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6); codeError = "" },
                        label = { Text("Visit code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    if (codeError.isNotEmpty()) Text(codeError, style = MaterialTheme.typography.bodySmall, color = Danger)
                }
                Text(callIdentity.whyOneMechanism, style = MaterialTheme.typography.bodySmall, color = Faint)
                if (codeError.isEmpty()) {
                    Button(onClick = {
                        if (code == "482190") { identityConfirmed = true; stage = 2 } else codeError = callIdentity.failure
                    }, Modifier.fillMaxWidth(), enabled = code.length >= 6, shape = ThusoButtonShape) { Text("Confirm and continue") }
                } else {
                    Button(onClick = { stage = 4 }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Close the encounter") }
                }
                OutlinedButton(onClick = { stage = 0 }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Back") }
            }

            2 -> {
                Text("Recording is a second question, and the answer here is no.", style = MaterialTheme.typography.titleMedium)
                Text(Teleconsult.rule("recording-is-separate").sentence, style = MaterialTheme.typography.bodySmall, color = BodyText)
                CareCard {
                    Text(callRecording.decision, style = MaterialTheme.typography.titleSmall, color = MangoInk)
                    Text(callRecording.why, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
                Text("What happens instead", style = MaterialTheme.typography.titleMedium)
                callRecording.instead.forEach { Text("· $it", style = MaterialTheme.typography.bodySmall, color = BodyText) }
                Text("What would be asked, if it existed", style = MaterialTheme.typography.titleMedium)
                CareCard {
                    Row2("When", "Its own screen")
                    Text(callRecording.whenItExists.askedSeparately, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    Row2("Cost of refusing", "None")
                    Text(callRecording.whenItExists.refusingIsCostless, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    Row2("While it runs", "Unmistakable")
                    Text(callRecording.whenItExists.whileRecording, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    Row2("Who could open it", "Three, and no more")
                    callRecording.whenItExists.whoMayView.forEach {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Outlined.Lock, null, tint = Charcoal); Text(it, style = MaterialTheme.typography.bodySmall, color = Charcoal)
                        }
                    }
                    Row2("Kept for", "${callRecording.whenItExists.keptForDays} days")
                    Text(callRecording.whenItExists.afterwards, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
                Refusal(Teleconsult.refusal("covert-recording"))
                Button(onClick = { stage = 3 }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Open the call") }
                OutlinedButton(onClick = { stage = 1 }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Back") }
            }

            3 -> {
                /* "Never asked" is not the same fact as "refused", and a screen that shows one state
                   for both is telling the patient their answer did not matter. Both are here, so a
                   review sees two screens rather than one with a different word in it. */
                CareCard {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        TileIcon(Icons.Outlined.VideocamOff, Indigo, IndigoSoft, 38.dp)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(Teleconsult.mediaState(mediaState).name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                            Text(Teleconsult.mediaState(mediaState).detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
                            Text(callMedia.sentence, style = MaterialTheme.typography.bodySmall, color = Faint)
                        }
                    }
                    FlowRowChips(callMedia.states.map { it.name }, setOf(Teleconsult.mediaState(mediaState).name)) { name ->
                        mediaState = callMedia.states.firstOrNull { it.name == name }?.id ?: mediaState
                    }
                    Text(callMedia.whyTheDistinctionMatters, style = MaterialTheme.typography.bodySmall, color = Faint)
                }

                Text("In the room", style = MaterialTheme.typography.titleMedium)
                Roster(canAsk = true)
                withdrawnNote?.let { Note(it) }

                Text("The line", style = MaterialTheme.typography.titleMedium)
                FlowRowChips(callConnectionStates.map { it.name }, setOf(Teleconsult.connectionState(connectionId).name)) { name ->
                    val next = callConnectionStates.firstOrNull { it.name == name } ?: return@FlowRowChips
                    connectionId = next.id
                    if (next.id == "dropped") { everDropped = true; holdLeft = callReconnect.holdSeconds }
                    else if (everDropped) resumed = true
                }
                Text("A preview control. In production this is the network's answer, not a choice.",
                     style = MaterialTheme.typography.bodySmall, color = Faint)
                /* Both ends, one card. The failure this is written against is a patient staring at a
                   frozen picture while the doctor's screen says something else entirely. */
                CareCard {
                    StatusPill("The patient sees", "quiet")
                    Text(Teleconsult.connectionState(connectionId).patientSees, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    HorizontalDivider(color = Stone)
                    StatusPill("The doctor sees", "quiet")
                    Text(Teleconsult.connectionState(connectionId).doctorSees, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
                Text(Teleconsult.connectionState(connectionId).note, style = MaterialTheme.typography.bodySmall, color = Faint)
                if (connectionId == "audio") {
                    Text(Teleconsult.rule("audio-is-not-lesser").sentence, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }

                if (dropped) {
                    Column(Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.card)).padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.widthIn(min = 96.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Outlined.HourglassEmpty, null, tint = Danger)
                                Text("${holdLeft}s", style = MaterialTheme.typography.titleLarge, color = Danger)
                                Text("of ${callReconnect.holdSeconds} · up to ${callReconnect.attempts} attempts",
                                     style = MaterialTheme.typography.bodySmall, color = BodyText)
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(callReconnect.whoCallsWhom, style = MaterialTheme.typography.labelMedium, color = Charcoal)
                                Text(callReconnect.duringTheHold, style = MaterialTheme.typography.bodySmall, color = BodyText)
                                if (nursePresent) Text(callReconnect.nurseInTheRoom, style = MaterialTheme.typography.bodySmall, color = BodyText)
                                if (holdLeft == 0) {
                                    Text(callReconnect.afterTheHold, style = MaterialTheme.typography.bodySmall, color = BodyText)
                                    Text(callReconnect.ifUnreachable, style = MaterialTheme.typography.bodySmall, color = BodyText)
                                }
                                Text(callReconnect.whyNotLonger, style = MaterialTheme.typography.bodySmall, color = Faint)
                            }
                        }
                    }
                }

                Text("What this doctor may conclude, right now", style = MaterialTheme.typography.titleMedium)
                Teleconsult.permitted(connectionId, nursePresent).forEach { limit ->
                    Row(Modifier.fillMaxWidth().background(IndigoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Outlined.Check, null, tint = Charcoal)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(limit.name, style = MaterialTheme.typography.bodySmall, color = Charcoal)
                            Text(limit.detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
                        }
                    }
                }
                Teleconsult.withdrawn(connectionId, nursePresent).forEach { limit ->
                    Row(Modifier.fillMaxWidth().background(Mist, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Outlined.Block, null, tint = Danger)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(limit.name, style = MaterialTheme.typography.bodySmall, color = Charcoal)
                            Text(if (limit.needs == "nurse" && !nursePresent)
                                "Nobody is in the room to examine on the doctor’s behalf." else limit.detail,
                                 style = MaterialTheme.typography.bodySmall, color = BodyText)
                        }
                    }
                }
                Text(Teleconsult.rule("examination-is-attributed").sentence, style = MaterialTheme.typography.bodySmall, color = BodyText)
                Refusal(Teleconsult.refusal("diagnose-the-unseen"))

                /* Nothing here can close an encounter as finished while the line is down. That is the
                   button this whole feature exists in order not to have. */
                Button(onClick = { decisionReached = true; stage = 4 }, Modifier.fillMaxWidth(),
                    enabled = Teleconsult.mayConclude(connectionId, nursePresent) && consented["doctor"] == true, shape = ThusoButtonShape) {
                    Text("Reach a decision and end the consultation")
                }
                if (!Teleconsult.mayConclude(connectionId, nursePresent)) {
                    Text("The line does not currently allow a decision to be reached, so there is no way to close this encounter as a completed consultation.",
                         style = MaterialTheme.typography.bodySmall, color = Danger)
                }
                OutlinedButton(onClick = { stage = 4 }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("End without a decision") }
            }

            else -> {
                StatusPill(if (outcome.countsAsConsultation) "Counts as a consultation" else "Not a consultation",
                    if (outcome.countsAsConsultation) "teal" else "amber")
                Text(outcome.name, style = MaterialTheme.typography.titleLarge)
                Text(outcome.record, style = MaterialTheme.typography.bodySmall, color = BodyText)
                CareCard {
                    Row2("Charged", if (outcome.charged) "Yes — a consultation was held" else "No")
                    if (!outcome.charged) {
                        Text(Teleconsult.refusal("charge-for-a-failure").sentence, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    }
                }
                Text("What goes into the consultation record", style = MaterialTheme.typography.titleMedium)
                Text("The same sections every MyThuso encounter writes into. A section this encounter did not reach is withheld here rather than left empty for somebody to fill in later.",
                     style = MaterialTheme.typography.bodySmall, color = BodyText)
                CareCard {
                    Teleconsult.sectionsFor(outcome).forEach { (section, written) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                            Text(section.name, style = MaterialTheme.typography.bodySmall, color = if (written) Charcoal else Faint, modifier = Modifier.weight(1f))
                            Text(if (written) "Yes" else "Not reached",
                                 style = MaterialTheme.typography.labelMedium, color = if (written) Indigo else Faint)
                        }
                    }
                }
                if (outcome.countsAsConsultation) {
                    Text(Teleconsult.rule("dropped-is-not-finished").sentence, style = MaterialTheme.typography.bodySmall, color = BodyText)
                    OutlinedButton(onClick = { open("Consultation record") }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) {
                        Text("Write it up in the consultation record")
                    }
                } else {
                    Refusal(Teleconsult.refusal("half-a-consultation"))
                    Text("${Teleconsult.rule("dropped-is-not-finished").sentence} There is no button on this screen that closes this encounter as a completed consultation, for anybody, in any state.",
                         style = MaterialTheme.typography.bodySmall, color = Danger,
                        modifier = Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp))
                }
                Text("What this screen will not do", style = MaterialTheme.typography.titleMedium)
                callRefusals.filterNot { it.id == "half-a-consultation" || it.id == "charge-for-a-failure" }.forEach { Refusal(it) }
                Note("${Teleconsult.rule("no-media-in-this-build").sentence} Nothing was transmitted, no encounter was written and no clinician was notified.")
                OutlinedButton(onClick = {
                    stage = 0; refusedClinician = false; decisionReached = false; resumed = false; everDropped = false
                    connectionId = "video"; code = ""; codeError = ""; identityConfirmed = false; withdrawnNote = null
                    listOf("doctor", "nurse", "guardian", "interpreter").forEach { consented[it] = false }
                }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Start again") }
            }
        }
    }
}
