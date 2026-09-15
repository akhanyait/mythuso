package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import za.co.mythuso.model.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/* Verify in service on Android: the nurse's shift start and the code she shows at a door, and the patient's check
 * of the person at hers. Every word is VerifyInServiceData.kt, generated from the contract; every rule is
 * model/VerifyInService.kt; every number is the contract's default, which an admin changes on the web.
 *
 * The shift start says plainly that no face match was performed and why, before anything else, and nothing here
 * opens a camera. The door check shows a name and a badge tier and never a number, and "This is not my nurse" is on
 * the screen at every step. A door code is digits: a QR code would need a scanning library the open-source register
 * has not procured.
 *
 * Nothing here is a real service: no desk is told, no incident is raised and no code reaches a door.
 */
private val clockFormat = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Africa/Johannesburg"))
private fun clockTime(millis: Long): String = clockFormat.format(Instant.ofEpochMilli(millis))
/* The nurse this preview's workspace opens as, and whether her vetting is current today on this phone. */
private fun badgeCurrent(store: PreviewStore): Boolean = store.vetting.subject("N-205")?.let { summarise(it).cleared } ?: false

@Composable fun ShiftStartScreen(store: PreviewStore, open: (String) -> Unit) {
    var refused by remember { mutableStateOf<VerifyInServiceRefusal?>(null) }
    val shift = VerifyInServiceStore.shift
    ScreenColumn {
        DemoBadge()
        Heading("Your shift", VerifyInServiceData.ShiftText.heading, VerifyInServiceData.ShiftText.intro)
        NotConnected(of = "credential-verification")
        SPanel(tone = PanelTone.LEAD) {
            Text(VerifyInServiceData.ShiftText.noMatch, style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Note(VerifyInServiceData.ShiftText.whyNoMatch)
            if (shift != null) {
                Text(VerifyInService.fill(VerifyInServiceData.ShiftText.started, mapOf("at" to clockTime(shift.startedAtMillis))),
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Text(VerifyInService.nurseLine(shift), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            } else {
                StudioButton(
                    onClick = {
                        when (val answer = VerifyInService.startShift(System.currentTimeMillis(), badgeCurrent(store))) {
                            is VerifyInService.Answer.Done -> { VerifyInServiceStore.shift = answer.value; refused = null }
                            is VerifyInService.Answer.Refused -> refused = answer.refusal
                        }
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                ) { Text(VerifyInServiceData.ShiftText.button) }
            }
            refused?.let { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = Danger) }
        }
        OutlinedButton(onClick = { open("Door code") }, Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape) {
            Text(VerifyInServiceData.NurseDoorText.heading)
        }
    }
}
// End of the shift start

@Composable fun NurseDoorCodeScreen(store: PreviewStore) {
    var refused by remember { mutableStateOf<VerifyInServiceRefusal?>(null) }
    val shown = VerifyInServiceStore.check.code
    ScreenColumn {
        DemoBadge()
        Heading("At the door", VerifyInServiceData.NurseDoorText.heading, VerifyInServiceData.NurseDoorText.intro)
        SPanel(tone = PanelTone.LEAD) {
            if (shown != null) {
                Text(shown.digits, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = Charcoal)
                Note(VerifyInService.fill(VerifyInServiceData.NurseDoorText.expires, mapOf("at" to clockTime(shown.expiresAtMillis))))
                Note(VerifyInService.fill(VerifyInServiceData.NurseDoorText.tries, mapOf("attempts" to shown.attemptsAllowed.toString())))
            }
            Note(VerifyInServiceData.NurseDoorText.preview)
            StudioButton(
                onClick = {
                    val tier = if (badgeCurrent(store)) VerifyInServiceData.tiers.first().id else null
                    when (val answer = VerifyInServiceStore.check.show(AssignedNurse.name, tier, System.currentTimeMillis())) {
                        is VerifyInService.Answer.Done -> { VerifyInServiceStore.check = answer.value; refused = null }
                        is VerifyInService.Answer.Refused -> refused = answer.refusal
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)
            ) { Text(if (shown == null) VerifyInServiceData.NurseDoorText.button else VerifyInServiceData.NurseDoorText.again) }
            refused?.let { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = Danger) }
        }
    }
}

@Composable fun DoorCheckScreen(store: PreviewStore, open: (String) -> Unit) {
    var typed by remember { mutableStateOf("") }
    var tried by remember { mutableStateOf<VerifyInService.Tried?>(null) }
    var refused by remember { mutableStateOf<VerifyInServiceRefusal?>(null) }
    var deskTold by remember { mutableStateOf(false) }
    var confirmed by remember { mutableStateOf(false) }
    val visit = store.visits.firstOrNull()
    val attempt = {
        when (val answer = VerifyInServiceStore.check.attempt(typed, System.currentTimeMillis())) {
            is VerifyInService.Answer.Done -> {
                VerifyInServiceStore.check = answer.value.first
                tried = answer.value.second
                refused = null
                if (answer.value.second is VerifyInService.Tried.Mismatch) deskTold = true
            }
            is VerifyInService.Answer.Refused -> refused = answer.refusal
        }
        typed = ""
    }
    val answerWith = { id: String ->
        when (val answer = VerifyInServiceStore.check.answer(id)) {
            is VerifyInService.Answer.Done -> {
                VerifyInServiceStore.check = answer.value.first
                refused = null
                if (answer.value.second) deskTold = true else confirmed = true
            }
            is VerifyInService.Answer.Refused -> refused = answer.refusal
        }
    }
    ScreenColumn {
        DemoBadge()
        Heading("Your visit", VerifyInServiceData.PatientDoorText.heading, VerifyInServiceData.PatientDoorText.intro)
        NotConnected(of = "credential-verification")
        SPanel(tone = PanelTone.LEAD) {
            Text(AssignedNurse.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            visit?.let { Note("${it.service.name} for ${it.person}") }
            Note(VerifyInServiceData.PatientDoorText.photo)
            if (!deskTold && !confirmed) {
                OutlinedTextField(
                    typed, { value -> typed = value.filter { it.isDigit() }.take(VerifyInServiceData.doorDigits) },
                    label = { Text(VerifyInServiceData.PatientDoorText.codeLabel) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    singleLine = true, modifier = Modifier.fillMaxWidth()
                )
                StudioButton(onClick = attempt, enabled = typed.length == VerifyInServiceData.doorDigits,
                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(VerifyInServiceData.PatientDoorText.check) }
            }
            refused?.let { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = Danger) }
            when {
                deskTold -> {
                    Text(VerifyInServiceData.PatientDoorText.mismatch, style = MaterialTheme.typography.titleSmall, color = Danger)
                    Text(VerifyInServiceData.PatientDoorText.danger, style = MaterialTheme.typography.bodyMedium, color = Danger)
                }
                confirmed -> Text(VerifyInServiceData.PatientDoorText.verified, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                else -> when (val result = tried) {
                    is VerifyInService.Tried.Wrong -> Text(
                        VerifyInService.fill(VerifyInServiceData.PatientDoorText.wrong, mapOf("attempts" to result.attemptsLeft.toString())),
                        style = MaterialTheme.typography.bodyMedium, color = Danger)
                    is VerifyInService.Tried.CodeFits -> {
                        Text(VerifyInServiceData.PatientDoorText.matched, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text("${VerifyInServiceData.PatientDoorText.name}: ${result.nurseName}", style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                        Text("${VerifyInServiceData.PatientDoorText.badge}: ${result.tierName ?: VerifyInServiceData.PatientDoorText.noBadge}",
                            style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                        Note(VerifyInServiceData.PatientDoorText.badgeSentence)
                        Text(VerifyInServiceData.PatientDoorText.question, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        if (result.tierName != null) StudioButton(onClick = { answerWith("she-is-my-nurse") },
                            modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                            Text(VerifyInService.label(VerifyInServiceData.answers, "she-is-my-nurse"))
                        }
                    }
                    else -> {}
                }
            }
        }
        if (!deskTold) {
            Note(VerifyInServiceData.PatientDoorText.anyTime)
            OutlinedButton(onClick = { answerWith("not-my-nurse") }, Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape) {
                Text(VerifyInService.label(VerifyInServiceData.answers, "not-my-nurse"), color = Danger)
            }
        }
        OutlinedButton(onClick = { open("Visits") }, Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape) {
            Text("Back to your visits")
        }
    }
}
// End of the door check
