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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/**
 * Indicative adult reference ranges, used only to flag a value for the nurse's attention.
 * This is not a validated triage or early-warning score and it never decides anything.
 */
data class Observation(val id: String, val label: String, val unit: String, val low: Double, val high: Double)
val observations = listOf(
    Observation("systolic", "Blood pressure — systolic", "mmHg", 90.0, 140.0),
    Observation("diastolic", "Blood pressure — diastolic", "mmHg", 60.0, 90.0),
    Observation("pulse", "Pulse", "bpm", 50.0, 100.0),
    Observation("respiratory", "Respiratory rate", "breaths/min", 12.0, 20.0),
    Observation("temperature", "Temperature", "°C", 36.1, 37.5),
    Observation("oxygen", "Oxygen saturation", "%", 95.0, 100.0),
    Observation("glucose", "Blood glucose", "mmol/L", 4.0, 7.8)
)
private val Flag = Color(0xFF9B6231)

@Composable fun VisitAssessmentScreen(reference: String = "TH-2048", patient: String = "Lerato Molefe", close: () -> Unit) {
    var stage by remember { mutableIntStateOf(0) }
    var otp by remember { mutableStateOf("") }
    var otpError by remember { mutableStateOf("") }
    var identitySeen by remember { mutableStateOf(false) }
    var consentAssessment by remember { mutableStateOf(false) }
    var consentRecord by remember { mutableStateOf(false) }
    val values = remember { mutableStateMapOf<String, String>() }
    var symptoms by remember { mutableStateOf(setOf<String>()) }
    var notes by remember { mutableStateOf("") }
    var escalation by remember { mutableStateOf("No escalation — routine visit") }
    var signed by remember { mutableStateOf(false) }
    val stages = listOf("Identity", "Consent", "Observations", "Findings", "Sign-off")
    fun flag(observation: Observation): String? {
        val raw = values[observation.id].orEmpty()
        if (raw.isBlank()) return null
        val value = raw.toDoubleOrNull() ?: return "Enter a number."
        if (value < observation.low) return "Below the indicative range (${observation.low}–${observation.high})"
        if (value > observation.high) return "Above the indicative range (${observation.low}–${observation.high})"
        return null
    }
    val captured = observations.filter { values[it.id].orEmpty().toDoubleOrNull() != null }
    val abnormal = captured.filter { flag(it) != null }
    ScreenColumn {
        Text("Step ${stage + 1} of ${stages.size} · ${stages[stage]}", style = MaterialTheme.typography.labelMedium, color = Teal)
        ReviewLine("Visit", "$reference · $patient")
        when (stage) {
            0 -> {
                Text("Confirm you’re at the right door.", style = MaterialTheme.typography.titleMedium)
                Note("Ask ${patient.substringBefore(' ')} for the six-digit code in the MyThuso app. In this preview the code is 482190.")
                OutlinedTextField(otp, { otp = it.filter { c -> c.isDigit() }.take(6); otpError = "" }, label = { Text("Visit code") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), singleLine = true, modifier = Modifier.fillMaxWidth(),
                    isError = otpError.isNotEmpty(), supportingText = { Text(otpError.ifEmpty { "The code changes for every visit and expires when the visit ends." }) })
                Setting("I have seen the patient’s identity document, or a household member has confirmed identity.", identitySeen) { identitySeen = it }
                Note("If the code fails, the visit does not start. The nurse contacts the Control Tower instead of proceeding.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = close) { Text("Leave") }
                    Button(onClick = { if (otp == "482190") stage = 1 else otpError = "That code doesn’t match this visit. Call the Control Tower before continuing." }, enabled = otp.length == 6 && identitySeen) { Text("Confirm identity") }
                }
            }
            1 -> {
                Text("Consent, in plain words.", style = MaterialTheme.typography.titleMedium)
                Note("Read these aloud. ${patient.substringBefore(' ')} can decline any part and still receive the rest of the visit.")
                CareCard {
                    Setting("“May I check your blood pressure, pulse, temperature and other basic readings today?”", consentAssessment) { consentAssessment = it }
                    Setting("“May I add today’s readings to your Health Passport, where a doctor can review them?”", consentRecord) { consentRecord = it }
                }
                Note("Refusal is recorded as a valid outcome, not a failed visit. A guardian consents for a child or where authority is verified.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { stage = 0 }) { Text("Back") }
                    Button(onClick = { stage = 2 }, enabled = consentAssessment) { Text("Start observations") }
                }
            }
            2 -> {
                Text("Today’s readings", style = MaterialTheme.typography.titleMedium)
                Note("Leave anything you did not measure blank. Nothing is auto-filled from a device in this preview.")
                observations.forEach { observation ->
                    val message = flag(observation)
                    OutlinedTextField(
                        values[observation.id].orEmpty(), { values[observation.id] = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("${observation.label} (${observation.unit})") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth(),
                        isError = message != null,
                        supportingText = { Text(message ?: "Indicative range ${observation.low}–${observation.high}", color = if (message != null) Flag else MaterialTheme.colorScheme.onSurfaceVariant) }
                    )
                }
                Note(
                    if (abnormal.isEmpty()) "Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you."
                    else "${abnormal.size} reading${if (abnormal.size > 1) "s are" else " is"} outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient."
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { stage = 1 }) { Text("Back") }
                    Button(onClick = { stage = 3 }, enabled = captured.isNotEmpty()) { Text("Record findings") }
                }
            }
            3 -> {
                Text("What did you find?", style = MaterialTheme.typography.titleMedium)
                FlowRowChips(listOf("Headache", "Dizziness", "Shortness of breath", "Chest pain", "Swelling", "Fatigue", "Nausea", "None reported"), symptoms) { symptom ->
                    symptoms = if (symptom in symptoms) symptoms - symptom else symptoms + symptom
                }
                OutlinedTextField(notes, { notes = it.take(1200) }, label = { Text("Visit notes") }, modifier = Modifier.fillMaxWidth().height(130.dp),
                    supportingText = { Text("Write what the next clinician needs, not everything you noticed.") })
                CareCard {
                    Text("Next step", style = MaterialTheme.typography.titleMedium)
                    listOf("No escalation — routine visit", "Refer for doctor review within 24 hours", "Refer for doctor review today", "Advise clinic or emergency department now", "Emergency services called from the home").forEach { option ->
                        Row(
                            Modifier.fillMaxWidth().clickable { escalation = option }.semantics { selected = escalation == option },
                            verticalAlignment = Alignment.CenterVertically
                        ) { RadioButton(escalation == option, { escalation = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
                if (escalation.contains("Emergency")) Note("In production this opens the emergency pathway immediately and alerts the Control Tower before the form is finished.")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { stage = 2 }) { Text("Back") }
                    Button(onClick = { stage = 4 }) { Text("Review sign-off") }
                }
            }
            else -> {
                if (signed) {
                    CareCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(Icons.Outlined.VerifiedUser, null, tint = Teal); Text("Demo assessment closed.", style = MaterialTheme.typography.titleMedium)
                        }
                        Note("Nothing was transmitted, no record was written and no clinician was notified. In production this becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration.")
                    }
                    Button(onClick = close, Modifier.fillMaxWidth()) { Text("Back to the workspace") }
                } else {
                    CareCard {
                        Text("$patient · $reference", style = MaterialTheme.typography.titleMedium)
                        captured.forEach { ReviewLine(it.label, "${values[it.id]} ${it.unit}${if (flag(it) != null) " ⚠" else ""}") }
                        ReviewLine("Symptoms", if (symptoms.isEmpty()) "None recorded" else symptoms.sorted().joinToString(", "))
                        ReviewLine("Next step", escalation)
                        ReviewLine("Recorded by", "Sister Naledi Mokoena · SANC 0000000 (demo)")
                    }
                    Note("A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.")
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = { stage = 3 }) { Text("Back") }
                        Button(onClick = { signed = true }) { Text("Sign demo assessment") }
                    }
                }
            }
        }
    }
}
@Composable fun DoctorReviewScreen(reference: String = "TH-2048") {
    var decision by remember { mutableStateOf("") }
    var rationale by remember { mutableStateOf("") }
    var done by remember { mutableStateOf(false) }
    ScreenColumn {
        DemoBadge()
        Heading("Clinical review", "$reference · Lerato Molefe", "Submitted by Sister Naledi Mokoena, 4 September 11:24. Two readings were flagged by the nurse.")
        ClinicalChart("Blood pressure — systolic", "mmHg", listOf(
            Reading("12 Aug", 128.0), Reading("19 Aug", 134.0), Reading("28 Aug", 141.0, "Missed medication"), Reading("4 Sep", 146.0, "Nurse flagged")
        ), 90.0..140.0)
        CareCard {
            ReviewLine("Pulse", "88 bpm")
            ReviewLine("Reported symptoms", "Headache, fatigue")
            ReviewLine("Nurse’s next step", "Refer for doctor review within 24 hours")
        }
        CareCard {
            Text("Your decision", style = MaterialTheme.typography.titleMedium)
            listOf("Continue current management, review in one month", "Adjust medication and issue a prescription", "Request laboratory tests", "Book a teleconsultation with the patient", "Refer to a facility").forEach { option ->
                Row(
                    Modifier.fillMaxWidth().clickable { decision = option }.semantics { selected = decision == option },
                    verticalAlignment = Alignment.CenterVertically
                ) { RadioButton(decision == option, { decision = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        OutlinedTextField(rationale, { rationale = it.take(800) }, label = { Text("Clinical rationale") }, modifier = Modifier.fillMaxWidth().height(120.dp),
            supportingText = { Text("Why this decision, for the record and the next clinician.") })
        Note("Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration.")
        Button(onClick = { done = true }, enabled = !done && decision.isNotEmpty() && rationale.trim().length >= 10) {
            Text(if (done) "Demo decision held in this screen only" else "Sign demo decision")
        }
    }
}
