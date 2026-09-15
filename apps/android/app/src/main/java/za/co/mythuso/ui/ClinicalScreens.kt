package za.co.mythuso.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.model.*

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
private val Flag = MangoInk

/* The labels a held part's facts are written under.
 *
 * A part's `detail` is what that part holds, said in the nurse's own terms — so reading it back is
 * how the assessment comes back rather than a second, hidden copy of the same state. The labels are
 * constants because they are read as well as written: a label typed twice and spelt differently
 * once is an assessment that reloads with half of a consent.
 *
 * The visit code is deliberately not among them. It is a secret that expires with the visit, and
 * what is worth keeping is that it matched — not the six digits themselves. */
private const val FACT_CODE = "Visit code"
private const val FACT_IDENTITY = "Identity"
private const val FACT_CONSENT_READINGS = "Readings today"
private const val FACT_CONSENT_RECORD = "Into the Health Passport"
private const val FACT_SYMPTOMS = "Symptoms"
private const val FACT_NEXT_STEP = "Next step"
private const val FACT_NOTES = "Visit notes"
private const val FACT_SIGNED_BY = "Signed by"
private const val FACT_REGISTRATION = "Registration"
private const val AGREED = "Agreed"
private const val NOT_AGREED = "Not agreed"
private const val NO_SYMPTOMS = "None recorded"
private const val NO_NOTES = "None written"

private fun VisitPart.fact(label: String): String? = detail.firstOrNull { it.label == label }?.value

@Composable fun VisitAssessmentScreen(store: PreviewStore, reference: String = "TH-2048", patient: String = "Lerato Molefe", close: () -> Unit, open: (String) -> Unit = {}) {
    /* The signature carries the registration it was made under, read from the same vetting record
       dispatch asks before it offers the visit rather than a number typed into this screen. An
       attribution line is where a reader is shown what accountability looks like, and it is the one
       place a preview should not be fictional twice over. */
    val nurse = store.vetting.byName("Sister Naledi Mokoena")
    /* Recording an observation is writing into somebody's record, so it asks the same question the
       consultation form asks before it offers a field. */
    val mayWrite = nurse?.let { can(it, "write-clinical-note") }
    /* Where this assessment lives between screens, and it is not this screen.
     *
     * Every var below used to be `remember {}`, which is to say it lived nowhere: walking away from
     * the screen, or Android reclaiming the process behind it, lost the whole assessment — and a
     * nurse who loses one writes it again in the car from memory, which is a different record. So
     * each finished part is held in the visit queue, on the disk, and this screen starts by reading
     * back whatever is already there for this visit. See model/VisitQueue.kt.
     *
     * The state is derived from the parts rather than kept beside them. A second copy of “what has
     * been done” is a second thing to get wrong, and it is the copy that would be stale. */
    val queue = store.visitQueue
    val heldParts = queue.forVisit(reference)
    fun partOf(kind: VisitPartKind) = heldParts.firstOrNull { it.kind == kind }
    val identityPart = partOf(VisitPartKind.IDENTITY)
    val consentPart = partOf(VisitPartKind.CONSENT)
    val observationsPart = partOf(VisitPartKind.OBSERVATIONS)
    val findingsPart = partOf(VisitPartKind.FINDINGS)
    val signOffPart = partOf(VisitPartKind.SIGN_OFF)
    /* The readings the held observations part names, resolved through the capture ledger — which is
       where a reading lives, whether a nurse typed it or an instrument reported it. This screen used
       to read them off the part itself and union them with the ledger's, which is how the same visit
       had two answers to what was measured at it. */
    val heldReadings = observationsPart?.let { queue.readingsOf(it) }.orEmpty()
    /* This screen's own readings carry an id derived from the visit and the observation, so it can
       tell its own work from the kit's without keeping a second list to get wrong. */
    fun typedId(observationId: String) = "VQ-$reference-$observationId"
    val stages = listOf("Identity", "Consent", "Observations", "Findings", "Sign-off")
    /* Where she got to, worked out from what is held rather than written down separately. The first
       stage with nothing behind it is the one she is standing on. */
    val furthest = listOf(identityPart, consentPart, observationsPart, findingsPart)
        .indexOfFirst { it == null }.let { if (it < 0) 4 else it }
    var stage by rememberSaveable(reference) { mutableIntStateOf(furthest) }
    var otp by rememberSaveable(reference) { mutableStateOf("") }
    var otpError by rememberSaveable(reference) { mutableStateOf("") }
    var identitySeen by rememberSaveable(reference) { mutableStateOf(identityPart != null) }
    var consentAssessment by rememberSaveable(reference) { mutableStateOf(consentPart?.fact(FACT_CONSENT_READINGS) == AGREED) }
    var consentRecord by rememberSaveable(reference) { mutableStateOf(consentPart?.fact(FACT_CONSENT_RECORD) == AGREED) }
    /* The typed readings come back as readings, with their origins on them, rather than as a map of
       strings this screen would have had to guess the provenance of a second time. */
    val values = remember(reference) {
        mutableStateMapOf<String, String>().apply {
            heldReadings.forEach { put(it.observationId, it.value) }
        }
    }
    /* Origin is its own map rather than a field on the value with a default, because the moment it
       has a default it has been guessed, and the contract is blunt about that: there is no default
       and no unknown, and a value nobody can say the origin of is not filed. A number typed into
       the box below is therefore not a reading yet. It becomes one when somebody says where it
       came from. */
    val origins = remember(reference) {
        mutableStateMapOf<String, Provenance>().apply {
            heldReadings.forEach { put(it.observationId, it.provenance) }
        }
    }
    /* A nurse may want to take by hand what the kit already gave her — a cuff reading she does not
       believe, most often. Overriding does not erase the kit's reading; it leaves it in the queue,
       where it becomes the other half of a two-readings-one-observation decision.

       Restored by arithmetic rather than by a flag on the disk: an observation the held part has a
       hand-taken reading for, and which the kit also has one standing for, was overridden. There is
       nothing a stored flag could say that those two facts do not already. */
    val overridden = remember(reference) {
        mutableStateMapOf<String, Boolean>().apply {
            heldReadings.forEach { reading ->
                /* Besides this one. The typed reading is in the ledger now, so "is there a reading
                   for this observation" would otherwise be answered by her own number. */
                if (store.capture.standingBesides(reference, reading.observationId, reading.id) != null) put(reading.observationId, true)
            }
        }
    }
    /* A plain remember rather than a saveable one: a Set has no bundle of its own, and the copy that
       matters is the held part on the disk. */
    var symptoms by remember(reference) {
        mutableStateOf(
            findingsPart?.fact(FACT_SYMPTOMS)?.takeIf { it != NO_SYMPTOMS }
                ?.split(", ")?.filter { it.isNotBlank() }?.toSet() ?: emptySet()
        )
    }
    var notes by rememberSaveable(reference) {
        mutableStateOf(findingsPart?.fact(FACT_NOTES)?.takeIf { it != NO_NOTES } ?: "")
    }
    var escalation by rememberSaveable(reference) {
        mutableStateOf(findingsPart?.fact(FACT_NEXT_STEP) ?: "No escalation — routine visit")
    }
    var signed by rememberSaveable(reference) { mutableStateOf(signOffPart != null) }

    fun kitFor(observation: Observation): CapturedReading? =
        if (overridden[observation.id] == true) null
        else store.capture.standingBesides(reference, observation.id, typedId(observation.id))
    fun rawOf(observation: Observation): String = kitFor(observation)?.value ?: values[observation.id].orEmpty()
    fun originOf(observation: Observation): Provenance? = kitFor(observation)?.provenance ?: origins[observation.id]
    fun flag(observation: Observation): String? {
        val raw = rawOf(observation)
        if (raw.isBlank()) return null
        val value = raw.toDoubleOrNull() ?: return "Enter a number."
        if (value < observation.low) return "Below the indicative range (${observation.low}–${observation.high})"
        if (value > observation.high) return "Above the indicative range (${observation.low}–${observation.high})"
        return null
    }
    /* Filed means a number and an origin. The two conditions are one sentence in the contract and
       they are one condition here. */
    val captured = observations.filter { rawOf(it).toDoubleOrNull() != null && originOf(it) != null }
    val unattributed = observations.filter { rawOf(it).toDoubleOrNull() != null && originOf(it) == null }
    val abnormal = captured.filter { flag(it) != null }
    /* Calculated, and it names its inputs. It exists only while both of them do — a derived value
       whose inputs are unknown is not a value, which is a null rather than a dash on a screen. */
    val systolic = observations.firstOrNull { it.id == "systolic" }?.let { if (it in captured) rawOf(it).toDoubleOrNull() else null }
    val diastolic = observations.firstOrNull { it.id == "diastolic" }?.let { if (it in captured) rawOf(it).toDoubleOrNull() else null }
    val mapValue = meanArterialPressure(systolic, diastolic)
    /* A weight and a single-lead trace are captured and filed and never flagged, because there is no
       indicative range to flag them against: a weight means something only against this person's own
       earlier weights, and a trace is not a number. */
    val alsoCaptured = store.capture.forVisit(reference)
        .filter { it.observationId in notRangeFlagged && !it.superseded && it.state != CaptureState.REFUSED }

    /* Finishing a stage puts it on the disk. Nothing is sent — the app declares no permissions at
       all — and the state the part is left in says exactly that: captured, held here, hers to
       correct until she signs. A nurse who steps back and changes the readings has corrected them
       rather than taken a second set, so the held part is replaced rather than stacked; the store
       does that, not this screen. */
    fun holdPart(kind: VisitPartKind, summary: String, detail: List<VisitPartFact>, readings: List<CapturedReading> = emptyList()) {
        nurse?.let { queue.hold(kind, reference, patient, summary, detail, readings, it) }
    }
    /* The typed readings, as readings. Each one carries the origin somebody chose for it. They are
       handed to the queue, which files them in the capture ledger and keeps their ids on the part —
       so this screen no longer holds the only copy of a number a nurse typed, and the consultation
       record, which asks that ledger alone, now sees them.

       The kit's readings are not among them: they are already in the same ledger with their
       instrument, serial and calibration attached, and they are the visit's whether this screen
       names them or not. */
    fun typedReadings(): List<CapturedReading> = captured.mapNotNull { observation ->
        val origin = origins[observation.id] ?: return@mapNotNull null
        val value = values[observation.id] ?: return@mapNotNull null
        val now = System.currentTimeMillis()
        CapturedReading(
            id = typedId(observation.id), visit = reference, patient = patient,
            observationId = observation.id, label = observation.label, unit = observation.unit,
            value = value, provenance = origin,
            caveats = if (origin == Provenance.PATIENT_REPORTED)
                listOf("What ${patient.substringBefore(' ')} said, recorded as what they said. It is not a finding, and no clinician observed it.")
            else emptyList(),
            byId = nurse?.id.orEmpty(), byName = nurse?.name.orEmpty(), byReference = nurse?.reference.orEmpty(),
            deviceMillis = now, writtenMillis = now, state = CaptureState.CAPTURED
        )
    }

    ScreenColumn {
        StepDots(stage + 1, stages.size, stages[stage])
        /* Above the work on every stage, because “has any of this left the phone” is a question a
           nurse answers by looking rather than by opening something. */
        VisitQueueStanding(store, open)
        ReviewLine("Visit", "$reference · $patient")
        when (stage) {
            0 -> {
                Text("Confirm you’re at the right door.", style = MaterialTheme.typography.titleMedium)
                Note("Ask ${patient.substringBefore(' ')} for the six-digit code in the MyThuso app. In this preview the code is 482190.")
                Text("Visit code", style = MaterialTheme.typography.labelLarge, color = Charcoal)
                CodeBoxes(otp, { otp = it; otpError = "" }, invalid = otpError.isNotEmpty(), label = "Visit code")
                Note(otpError.ifEmpty { "The code changes for every visit and expires when the visit ends." })
                Setting("I have seen the patient’s identity document, or a household member has confirmed identity.", identitySeen) { identitySeen = it }
                Note("If the code fails, the visit does not start. The nurse contacts the Control Tower instead of proceeding.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = close, shape = ThusoButtonShape) { Text("Leave") }
                    StudioButton(onClick = {
                        if (otp == "482190") {
                            holdPart(
                                VisitPartKind.IDENTITY, "Visit code confirmed at the door, and identity seen",
                                listOf(
                                    VisitPartFact(FACT_CODE, "Six digits, matched"),
                                    VisitPartFact(FACT_IDENTITY, "Document seen by the nurse")
                                )
                            )
                            /* appointment.in_progress, as the preview has it: the code matched, so the
                               visit has started and so has its timer, timed by the visit's own service. */
                            FieldSafetyStore.startVisit(reference, nurseToday.firstOrNull { it.reference == reference }?.serviceId ?: nurseToday.first().serviceId, codeMatched = true)
                            stage = 1
                        } else otpError = "That code doesn’t match this visit. Call the Control Tower before continuing."
                    }, enabled = otp.length == 6 && identitySeen, shape = ThusoButtonShape) { Text("Confirm identity") }
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
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { stage = 0 }, shape = ThusoButtonShape) { Text("Back") }
                    StudioButton(onClick = {
                        holdPart(
                            VisitPartKind.CONSENT,
                            if (consentRecord) "Agreed to today’s readings and to them going into her Health Passport"
                            else "Agreed to today’s readings. Not to them going into her Health Passport",
                            listOf(
                                VisitPartFact(FACT_CONSENT_READINGS, if (consentAssessment) AGREED else NOT_AGREED),
                                VisitPartFact(FACT_CONSENT_RECORD, if (consentRecord) AGREED else NOT_AGREED)
                            )
                        )
                        stage = 2
                    }, enabled = consentAssessment, shape = ThusoButtonShape) { Text("Start observations") }
                }
            }
            2 -> {
                Text("Today’s readings", style = MaterialTheme.typography.titleMedium)
                Note("Leave anything you did not measure blank. Anything already taken on the Thuso Kit for this visit is here with its instrument, its serial and its calibration attached, rather than as a bare number.")
                if (mayWrite?.allowed == false) Text(
                    mayWrite.reason.orEmpty(),
                    style = MaterialTheme.typography.bodyMedium, color = Danger,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
                )
                observations.forEach { observation ->
                    val kit = kitFor(observation)
                    if (kit != null) CareCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(observation.label, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                Note("Indicative range ${observation.low}–${observation.high} ${observation.unit}")
                            }
                            Text("${kit.value} ${observation.unit}", style = MaterialTheme.typography.titleLarge, color = Charcoal)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ProvenanceMark(kit.provenance)
                            flag(observation)?.let { StatusPill("Outside the indicative range", "amber") }
                        }
                        ProvenanceBlock(kit, patient)
                        TextButton(onClick = { overridden[observation.id] = true }, shape = ThusoButtonShape) { Text("Take this one by hand instead") }
                        Note("The kit reading stays in the queue. Two readings of one observation in one visit is a decision for a clinician, not something this screen quietly overwrites.")
                    } else {
                        val message = flag(observation)
                        val origin = origins[observation.id]
                        OutlinedTextField(
                            values[observation.id].orEmpty(), { values[observation.id] = it.filter { c -> c.isDigit() || c == '.' } },
                            label = { Text("${observation.label} (${observation.unit})") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth(),
                            enabled = mayWrite?.allowed != false,
                            isError = message != null,
                            supportingText = { Text(message ?: "Indicative range ${observation.low}–${observation.high}", color = if (message != null) Flag else MaterialTheme.colorScheme.onSurfaceVariant) }
                        )
                        if (values[observation.id].orEmpty().isNotBlank()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Where did this come from?", style = MaterialTheme.typography.labelLarge, color = Charcoal)
                            FlowRowChips(
                                listOf(Provenance.MANUAL.label, Provenance.PATIENT_REPORTED.label),
                                setOfNotNull(origin?.label)
                            ) { label -> origins[observation.id] = if (label == Provenance.MANUAL.label) Provenance.MANUAL else Provenance.PATIENT_REPORTED }
                            if (origin == null) Text(
                                "Not filed yet. A value nobody can say the origin of is not filed, so this number is on the screen and nowhere else.",
                                style = MaterialTheme.typography.bodySmall, color = Flag
                            ) else Note(origin.trust)
                            if (overridden[observation.id] == true) Note("Taken by hand in place of the kit reading, which is still in the queue.")
                        }
                    }
                }
                Note("“Measured by a device” is not one of the choices above, and that is deliberate: a device reading is one that came off a paired instrument with its serial and its calibration date attached. Typing a number and calling it a device reading would be the record’s first lie. Take it on the Thuso Kit screen instead. “Calculated” is not offered either — it is computed from readings that are already here, and it names them.")
                if (unattributed.isNotEmpty()) CareCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Outlined.QuestionMark, null, tint = Flag)
                        Text("${unattributed.size} number${if (unattributed.size > 1) "s are" else " is"} typed but not filed", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    }
                    Text("${unattributed.joinToString(", ") { it.label }} — say where each came from and it is filed. Until then it is not counted, because a record that cannot say where a value came from will eventually be read wrongly by somebody in a hurry.", style = MaterialTheme.typography.bodyMedium)
                }
                if (mapValue != null) CareCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) { Text("Mean arterial pressure", style = MaterialTheme.typography.titleSmall, color = Charcoal) }
                        Text("%.0f mmHg".format(mapValue), style = MaterialTheme.typography.titleLarge, color = Charcoal)
                    }
                    ProvenanceMark(Provenance.DERIVED)
                    ReviewLine("Calculated from", mapDerivedFrom(systolic!!, diastolic!!).joinToString(" and "))
                    Note("It is exactly as good as those two readings and no better, and it disappears the moment either of them does.")
                }
                if (alsoCaptured.isNotEmpty()) CareCard {
                    Text("Also captured on the kit", style = MaterialTheme.typography.titleMedium)
                    Note("Filed with the rest, and never flagged: there is no indicative range to flag them against. A weight means something only against this person’s own earlier weights, and a single-lead trace is a screening tool rather than a number.")
                    alsoCaptured.forEach { extra ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${extra.label} · ${extra.value} ${extra.unit}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                            ProvenanceMark(extra.provenance)
                        }
                    }
                }
                Note(
                    if (abnormal.isEmpty()) "Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you."
                    else "${abnormal.size} reading${if (abnormal.size > 1) "s are" else " is"} outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient."
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { stage = 1 }, shape = ThusoButtonShape) { Text("Back") }
                    StudioButton(onClick = {
                        holdPart(
                            VisitPartKind.OBSERVATIONS,
                            "${captured.size} ${if (captured.size == 1) "reading" else "readings"} taken at this visit",
                            captured.map { VisitPartFact(it.label, "${rawOf(it)} ${it.unit}") },
                            typedReadings()
                        )
                        stage = 3
                    }, enabled = captured.isNotEmpty(), shape = ThusoButtonShape) { Text("Record findings") }
                }
            }
            3 -> {
                Text("What did you find?", style = MaterialTheme.typography.titleMedium)
                FlowRowChips(listOf("Headache", "Dizziness", "Shortness of breath", "Chest pain", "Swelling", "Fatigue", "Nausea", "None reported"), symptoms) { symptom ->
                    symptoms = if (symptom in symptoms) symptoms - symptom else symptoms + symptom
                }
                OutlinedTextField(notes, { notes = it.take(1200) }, label = { Text("Visit notes") }, modifier = Modifier.fillMaxWidth().heightIn(min = 130.dp),
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
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { stage = 2 }, shape = ThusoButtonShape) { Text("Back") }
                    StudioButton(onClick = {
                        holdPart(
                            VisitPartKind.FINDINGS,
                            if (symptoms.isEmpty() && notes.isBlank()) "Nothing reported, and $escalation".lowercase().replaceFirstChar { it.uppercase() }
                            else "What ${patient.substringBefore(' ')} reported, and what happens next",
                            listOf(
                                VisitPartFact(FACT_SYMPTOMS, if (symptoms.isEmpty()) NO_SYMPTOMS else symptoms.sorted().joinToString(", ")),
                                VisitPartFact(FACT_NEXT_STEP, escalation),
                                VisitPartFact(FACT_NOTES, notes.ifBlank { NO_NOTES })
                            )
                        )
                        stage = 4
                    }, shape = ThusoButtonShape) { Text("Review sign-off") }
                }
            }
            else -> {
                if (signed) {
                    CareCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Outlined.VerifiedUser, null, tint = Charcoal); Text("Demo assessment closed.", style = MaterialTheme.typography.titleMedium)
                        }
                        Note("Nothing was transmitted, no record was written and no clinician was notified. In production this becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration.")
                        /* Sealed is not sent, and the difference is the whole feature. Everything
                           she did is on this phone and comes back from a crash or a restart; none of
                           it is anywhere a doctor can read it. */
                        Note("Every piece of this visit is sealed and held on this phone. It survives ${queue.survives.replaceFirstChar { it.lowercase() }} Until it sends, no doctor can read it and the Control Tower does not know the visit is done.")
                        OutlinedButton(
                            onClick = { open("Visit queue") },
                            Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
                        ) { Text("See what is waiting on this phone") }
                    }
                    StudioButton(onClick = close, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text("Back to the workspace") }
                } else {
                    CareCard {
                        Text("$patient · $reference", style = MaterialTheme.typography.titleMedium)
                        /* Each line carries its own origin. The whole argument of the capture contract
                           is that this list is not seven numbers — it is seven facts of four
                           different kinds, and a reader in a hurry has to be able to tell them apart
                           without opening anything. */
                        captured.forEach { observation ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(observation.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                                Text("${rawOf(observation)} ${observation.unit}${if (flag(observation) != null) " ⚠" else ""}", style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                                originOf(observation)?.let { ProvenanceMark(it) }
                            }
                            kitFor(observation)?.takeIf { it.caveats.isNotEmpty() }?.let { kit ->
                                Text(kit.caveats.first(), style = MaterialTheme.typography.bodySmall, color = MangoInk)
                            }
                        }
                        if (mapValue != null) Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Mean arterial pressure", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                            Text("%.0f mmHg".format(mapValue), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                            ProvenanceMark(Provenance.DERIVED)
                        }
                        ReviewLine("Symptoms", if (symptoms.isEmpty()) "None recorded" else symptoms.sorted().joinToString(", "))
                        ReviewLine("Next step", escalation)
                        ReviewLine("Recorded by", "Sister Naledi Mokoena · ${nurse?.reference ?: "SANC registration"} (demo)")
                    }
                    if (unattributed.isNotEmpty()) Note("${unattributed.size} number${if (unattributed.size > 1) "s were" else " was"} typed without an origin and ${if (unattributed.size > 1) "are" else "is"} not in this record. Nothing was guessed on your behalf.")
                    Note("A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { stage = 3 }, shape = ThusoButtonShape) { Text("Back") }
                        /* Signing is the nurse saying she is finished, and it seals everything this
                           visit holds at once — the contract's own word for the state she leaves it
                           in. After it there is nothing left for her to do, and the phone owes it a
                           connection. */
                        StudioButton(onClick = {
                            holdPart(
                                VisitPartKind.SIGN_OFF, "Signed on this phone, and not yet filed",
                                listOf(
                                    VisitPartFact(FACT_SIGNED_BY, nurse?.name ?: "Sister Naledi Mokoena"),
                                    VisitPartFact(FACT_REGISTRATION, nurse?.reference ?: "SANC registration")
                                )
                            )
                            queue.seal(reference)
                            /* appointment.completed, as the preview has it: signed, so nobody is left in the house to time. */
                            FieldSafetyStore.visitSigned(reference)
                            signed = true
                        }, enabled = mayWrite?.allowed != false, shape = ThusoButtonShape) { Text("Sign demo assessment") }
                    }
                }
            }
        }
    }
}
/**
 * The queue refuses the signature rather than warning about it. A doctor whose HPCSA registration
 * has lapsed can still open the case — the refusal has to be readable to be answerable — but the
 * record itself, and the signature, are withheld.
 */
@Composable fun DoctorReviewScreen(store: PreviewStore, reference: String = "TH-2048") {
    var decision by remember { mutableStateOf("") }
    var rationale by remember { mutableStateOf("") }
    var done by remember { mutableStateOf(false) }
    var signingAs by remember { mutableStateOf("D-401") }
    val doctors = store.vetting.subjects.filter { it.roleId == "doctor" }
    val doctor = doctors.firstOrNull { it.id == signingAs } ?: doctors.firstOrNull()
    val mayRead = doctor?.let { can(it, "view-clinical-record") }
    /* Who may sign is the review-confirmer setting, asked through Clinical (Wave 5). */
    val maySign = doctor?.let { za.co.mythuso.model.Clinical.confirmDecision(it) }
    ScreenColumn {
        DemoBadge()
        Heading("Clinical review", "$reference · Lerato Molefe", "Submitted by Sister Naledi Mokoena, 4 September 11:24. Two readings were flagged by the nurse.")
        CareCard {
            Text("Signing as", style = MaterialTheme.typography.titleMedium)
            FlowRowChips(doctors.map { it.name }, setOfNotNull(doctor?.name)) { name -> signingAs = doctors.first { it.name == name }.id }
            doctor?.let { Note("${vettingRoleById(it.roleId)?.name} · ${it.reference} · ${summarise(it).status.label}") }
            if (maySign?.allowed == false) Text(maySign.reason ?: "", style = MaterialTheme.typography.bodyMedium, color = Danger)
        }
        if (mayRead?.allowed == false) {
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.Block, null, tint = Danger)
                    Text("This case is withheld", style = MaterialTheme.typography.titleMedium)
                }
                Text(mayRead.reason ?: "", style = MaterialTheme.typography.bodyMedium)
                Note("Blocked by: ${mayRead.blockedBy.joinToString(", ") { it.name }}. The patient’s readings are not shown, not blurred — withheld.")
            }
            return@ScreenColumn
        }
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
        OutlinedTextField(rationale, { rationale = it.take(800) }, label = { Text("Clinical rationale") }, modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            supportingText = { Text("Why this decision, for the record and the next clinician.") })
        Note("Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration.")
        StudioButton(onClick = { done = true }, enabled = !done && maySign?.allowed == true && decision.isNotEmpty() && rationale.trim().length >= 10, shape = ThusoButtonShape) {
            Text(if (done) "Demo decision held in this screen only" else "Sign demo decision")
        }
    }
}
