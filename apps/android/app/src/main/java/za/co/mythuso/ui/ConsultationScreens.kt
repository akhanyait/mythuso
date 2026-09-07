package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import java.time.LocalDateTime

/*
 * One shape for every encounter. The sections, which of them are required, which capability each
 * hangs on and the four SOAP headings all live in the record contract, because a structure retyped
 * into a screen is a structure that holds only until somebody edits the screen. Everything below
 * renders whatever it finds in RecordsData.kt.
 *
 * Nothing here is written, transmitted or acted on. The patients, the clinicians and their council
 * registrations are fictional.
 */

/* Which sections each SOAP heading covers, read off the headings' own descriptions in the contract:
   Subjective is what the patient reports, Objective is vitals and examination, Assessment is the
   assessment, Plan is treatment, medicine, tests, referral and follow-up. A section no heading
   claims — the free clinical note — is shown after the four rather than swept under Plan, because a
   heading that means “everything else” has stopped meaning anything. */
private val soapCovers = mapOf(
    "S" to listOf("reason", "history"),
    "O" to listOf("observations", "examination"),
    "A" to listOf("assessment"),
    "P" to listOf("plan", "medication", "tests", "referral", "followup")
)
private val soapClaimed = soapCovers.values.flatten().toSet()
private val outsideSoap = consultationSections.filter { it.id != "clinician" && it.id !in soapClaimed }

/* ---- Fields ----------------------------------------------------------------------------------
   A section is one field, so the record's shape is the standard's shape. The assessment is the one
   exception, and it is the exception on purpose — see mayDiagnose. */
private data class ConsultationField(val id: String, val sectionId: String, val label: String, val placeholder: String = "")
private const val NURSING_ASSESSMENT = "assessment-nursing"
private const val CLINICAL_IMPRESSION = "assessment-impression"
private const val DIAGNOSIS = "diagnosis"
private val placeholders = mapOf(
    "reason" to "Why the patient asked to be seen, in their words where it matters…",
    "history" to "Onset, duration, what makes it better or worse, medicine already taken…",
    "observations" to "Anything measured that the readings above do not carry…",
    "examination" to "What you examined, and what you found…",
    "plan" to "What is being done about it, by whom, and by when…",
    "medication" to "Medicine, dose, frequency, duration and repeats…",
    "tests" to "The test, the specimen, and the question it answers…",
    "referral" to "To whom, why, and how urgently…",
    "followup" to "When, with whom, and what would bring the patient back sooner…",
    "notes" to "What the next clinician needs that the sections above do not hold…"
)
private fun fieldsFor(section: ConsultationSection, mayDiagnose: Boolean): List<ConsultationField> = when {
    section.id == "clinician" -> emptyList()                     // the signature block, not something typed
    section.id == "assessment" && mayDiagnose -> listOf(
        ConsultationField(CLINICAL_IMPRESSION, section.id, "Assessment — clinical impression", "What you make of the findings…"),
        ConsultationField(DIAGNOSIS, section.id, "Diagnosis", "The diagnosis you are accountable for…")
    )
    section.id == "assessment" -> listOf(
        ConsultationField(NURSING_ASSESSMENT, section.id, "Assessment — recorded by a nurse", "What you found, and what concerns you…")
    )
    else -> listOf(ConsultationField(section.id, section.id, section.name, placeholders[section.id].orEmpty()))
}
/* Every field the standard can produce, whoever is writing. Used to show a reader what the record
   already holds in fields their own form does not offer. */
private val everyField = consultationSections
    .flatMap { fieldsFor(it, true) + fieldsFor(it, false) }
    .distinctBy { it.id }

/* A nurse and a doctor hold different grants in the vetting table, so they are offered different
   forms. These three writers are the three answers a design review needs to see side by side: a
   cleared nurse, a cleared doctor, and a doctor whose registration lapsed four days ago. */
private val consultationWriterIds = listOf("N-205", "D-401", "D-402")
/* Shape follows the role's grants; permission to write today follows the live vetting decision.
   Keeping those apart matters: a doctor whose registration lapsed is still a doctor, and their
   record is refused outright rather than quietly re-shaped into a nurse's. */
private fun roleGrants(subject: VettingSubject, capability: String) =
    vettingRoleById(subject.roleId)?.grants.orEmpty().any { it.capability == capability }

private data class ConsultationSignature(
    val name: String, val reference: String, val role: String, val at: LocalDateTime, val diagnosis: Boolean
)

@Composable fun ConsultationRecordScreen(
    store: PreviewStore, reference: String = "TH-2048", patient: String = "Lerato Molefe"
) {
    val writers = remember(store) { consultationWriterIds.mapNotNull { store.vetting.subject(it) } }
    var writerId by remember { mutableStateOf(writers.first().id) }
    var view by remember { mutableStateOf("Full record") }
    val record = remember { mutableStateMapOf<String, String>() }
    var signature by remember { mutableStateOf<ConsultationSignature?>(null) }
    val writer = writers.firstOrNull { it.id == writerId } ?: writers.first()
    val role = vettingRoleById(writer.roleId)
    /* There is no “diagnose” capability in the vetting table. The one it grants a doctor and never a
       nurse is signing a clinical decision, so that is what the form asks about. If a narrower
       capability is ever added, this line is the only place that has to change. */
    val mayDiagnose = roleGrants(writer, "sign-clinical-review")
    val mayWrite = can(writer, "write-clinical-note")
    fun value(id: String) = record[id].orEmpty().trim()
    /* Two different refusals, kept apart. A section the role is never granted is not on the form at
       all; a section the role holds but this party's clearance does not currently allow is on the
       form, locked, saying which check took it away. */
    val offered = consultationSections.filter { it.gatedBy == null || roleGrants(writer, it.gatedBy) }
    val neverGranted = consultationSections.filter { it.gatedBy != null && !roleGrants(writer, it.gatedBy) }
    val offeredFields = offered.flatMap { fieldsFor(it, mayDiagnose) }
    val outstanding = offered.filter { it.required && it.id != "clinician" && fieldsFor(it, mayDiagnose).none { f -> value(f.id).isNotEmpty() } }
    val filled = offeredFields.count { value(it.id).isNotEmpty() }
    /* Anything the record already holds that this writer is not offered — a nurse's assessment read
       by a doctor, a doctor's prescription read by a nurse. It stays visible and read-only, because
       the point of one structure is that the record does not change when the reader does. */
    val carried = everyField.filter { value(it.id).isNotEmpty() && offeredFields.none { o -> o.id == it.id } }
    /* The readings this encounter is being written about, straight from the capture queue rather
       than retyped into the note. Retyping is where origin is lost: a number copied out of a queue
       into a text box arrives in the record as something a clinician wrote, which is exactly the
       confusion between a measured value and a typed one the capture contract exists to prevent. */
    val readings = store.capture.forVisit(reference)
        .filter { it.state != CaptureState.REFUSED }
        .sortedBy { it.label }

    ScreenColumn {
        DemoBadge()
        Heading("Clinical", thuso(Phrase.CONSULTATION_RECORD, store.locale), "$reference · $patient")
        StatusPill(if (signature != null) "Signed · demo record" else "Draft — not signed", if (signature != null) "teal" else "amber")
        Note(consultationWhy)

        CareCard {
            Text("Writing as", style = MaterialTheme.typography.titleMedium)
            FlowRowChips(writers.map { it.name }, setOf(writer.name)) { name ->
                writerId = writers.first { it.name == name }.id
                signature = null
            }
            Note("${role?.name} · ${writer.reference} · ${summarise(writer).status.label}")
            if (!mayWrite.allowed) Text(
                "${mayWrite.reason.orEmpty()} The form is read-only rather than merely unsignable: an entry nobody may put their registration against is not a record, it is a note that looks like one.",
                style = MaterialTheme.typography.bodyMedium, color = Danger,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        }

        FlowRowChips(listOf("Full record", "SOAP", "As it reads"), setOf(view)) { view = it }
        Note("One record, $filled of ${offeredFields.size} fields written. SOAP and the long form are two arrangements of those same fields — switching loses nothing, because there is no second copy of the note to keep in step.")

        when (view) {
            "Full record" -> offered.forEach { section ->
                ConsultationSectionBlock(section, record, mayDiagnose, writer, signature != null, readings, patient)
            }
            "SOAP" -> {
                soapHeadings.forEach { heading ->
                    val covered = offered.filter { it.id in soapCovers[heading.id].orEmpty() }
                    CareCard {
                        StatusPill("${heading.id} · ${heading.name}", "quiet")
                        Note(heading.detail)
                        if (covered.isEmpty()) Note("Nothing under this heading is offered to a ${role?.name?.lowercase() ?: "party"}.")
                        else covered.forEach { section ->
                            ConsultationSectionBlock(section, record, mayDiagnose, writer, signature != null, readings, patient)
                        }
                    }
                }
                outsideSoap.filter { it in offered }.forEach { section ->
                    CareCard {
                        StatusPill("No SOAP heading claims this", "quiet")
                        ConsultationSectionBlock(section, record, mayDiagnose, writer, signature != null, readings, patient)
                    }
                }
            }
            else -> {
                soapHeadings.forEach { heading ->
                    val lines = offered.filter { it.id in soapCovers[heading.id].orEmpty() }
                        .flatMap { fieldsFor(it, mayDiagnose) }.filter { value(it.id).isNotEmpty() }
                    CareCard {
                        StatusPill("${heading.id} · ${heading.name}", "quiet")
                        if (heading.id == "O") readings.forEach { reading ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(reading.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                                Text("${reading.value} ${reading.unit}", style = MaterialTheme.typography.bodyMedium, color = Slate)
                                ProvenanceMark(reading.provenance)
                            }
                        }
                        if (lines.isEmpty() && !(heading.id == "O" && readings.isNotEmpty())) Note("Nothing written under ${heading.name.lowercase()} yet.")
                        else lines.forEach { ReviewLine(it.label, value(it.id)) }
                    }
                }
                Note("Assembled from the fields above every time this view opens. It is a reading of the record rather than a copy of it, so there is nothing here to save and nothing to fall out of step.")
            }
        }

        if (carried.isNotEmpty()) CareCard {
            StatusPill("Already in this record", "quiet")
            carried.forEach { ReviewLine(it.label, value(it.id)) }
            Note("Written on another clinician’s form and read-only here. The record does not change shape because the reader did.")
        }
        if (neverGranted.isNotEmpty()) CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.MedicalServices, null, tint = Indigo)
                Text("Not on this form at all", style = MaterialTheme.typography.titleSmall, color = Ink)
            }
            Text(
                "${neverGranted.joinToString(", ") { it.name.lowercase() }.replaceFirstChar { it.uppercase() }} ${if (neverGranted.size > 1) "are" else "is"} absent rather than offered and refused after it has been written. A ${role?.name?.lowercase() ?: "party"} is never granted ${if (neverGranted.size > 1) "those capabilities" else "that capability"}.",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        /* Attribution is part of the record, not a footer: the name, the council registration and
           the moment of signing, taken from the vetting record the platform decides on. */
        val signed = signature
        if (signed != null) CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.VerifiedUser, null, tint = Indigo)
                Text("Demo consultation signed.", style = MaterialTheme.typography.titleMedium)
            }
            ReviewLine("Clinician", signed.name)
            ReviewLine("Council registration", signed.reference)
            ReviewLine("Role", signed.role)
            ReviewLine("Signed", formatVettingTime(signed.at))
            ReviewLine("Diagnosis", if (signed.diagnosis) "Recorded by the signing doctor" else "Not recorded — a nurse’s assessment is not a diagnosis")
            Note("Nothing was written to a record, transmitted or acted on. In production this becomes an append-only entry attributed to that registration, and an encounter nobody signs stays a draft rather than quietly counting as a consultation.")
        } else CareCard {
            ReviewLine("Signature", "Draft — ${writer.name} has not signed")
            Note(
                if (outstanding.isNotEmpty()) "Outstanding before this can be signed: ${outstanding.joinToString(", ") { it.name.lowercase() }}."
                else "Every required section is written. Signing attaches the name, the council registration and the moment of signing."
            )
            Button(
                onClick = {
                    signature = ConsultationSignature(
                        writer.name, writer.reference, role?.name ?: "—", LocalDateTime.now(),
                        mayDiagnose && value(DIAGNOSIS).isNotEmpty()
                    )
                },
                enabled = mayWrite.allowed && outstanding.isEmpty()
            , shape = ThusoButtonShape) { Text("Sign demo consultation") }
        }
    }
}

/**
 * One section, in whichever ordering asked for it. The fields are keyed on their own ids so the
 * same text box is reused when the view changes — SOAP is a rearrangement of the record, and a
 * rearrangement that dropped the caret would be a second form wearing the first one's values.
 */
@Composable private fun ConsultationSectionBlock(
    section: ConsultationSection,
    record: MutableMap<String, String>,
    mayDiagnose: Boolean,
    writer: VettingSubject,
    locked: Boolean,
    readings: List<CapturedReading>,
    patient: String
) {
    val decision = if (section.gatedBy != null) can(writer, section.gatedBy) else can(writer, "write-clinical-note")
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        /* The observations arrive already filed, each with its origin and whatever the instrument
           could not decide for itself. They are read-only here because a consultation does not get
           to change what a reading was — it gets to say what it makes of it, which is the free field
           underneath. */
        if (section.id == "observations" && decision.allowed && readings.isNotEmpty()) {
            Text("Readings captured on this visit", style = MaterialTheme.typography.labelLarge, color = Slate)
            readings.forEach { reading ->
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(reading.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Text("${reading.value} ${reading.unit}", style = MaterialTheme.typography.bodyMedium, color = Slate)
                        ProvenanceMark(reading.provenance)
                    }
                    if (reading.state != CaptureState.STORED) StatusPill(reading.state.label, "sky")
                    if (reading.superseded) StatusPill("Superseded · kept", "quiet")
                    ProvenanceBlock(reading, patient)
                    HorizontalDivider(color = Line)
                }
            }
            Note("Carried from the capture queue rather than retyped. A number copied into a text box arrives in the record as something a clinician wrote, and the whole point of recording an origin is that the record can still tell the difference in a year’s time.")
        }
        if (decision.allowed) fieldsFor(section, mayDiagnose).forEach { field ->
            key(field.id) {
                OutlinedTextField(
                    record[field.id].orEmpty(),
                    { record[field.id] = it.take(1200) },
                    label = { Text(field.label) },
                    placeholder = { Text(field.placeholder) },
                    enabled = !locked,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        } else {
            ReviewLine(section.name, "Locked")
            /* The reason is worth repeating only where it is this section's own. A form the writer
               may not use at all says so once, at the top, rather than twelve times down the page. */
            if (section.gatedBy != null) Note(decision.reason.orEmpty())
        }
        section.note?.let { Note(it) }
        /* A nurse's assessment and a doctor's diagnosis are different fields. The diagnosis row is
           shown, locked and explicitly empty rather than omitted, so a nurse's record says what it
           does not contain instead of leaving a reader to guess. */
        if (section.id == "assessment" && !mayDiagnose) {
            ReviewLine("Diagnosis", "Not recorded — a doctor’s")
            Note("A nurse’s assessment is a different field from a diagnosis, not the same field written by somebody else. ${can(writer, "sign-clinical-review").reason.orEmpty()} This record carries no diagnosis until a doctor writes one under their own HPCSA registration.")
        }
    }
}
