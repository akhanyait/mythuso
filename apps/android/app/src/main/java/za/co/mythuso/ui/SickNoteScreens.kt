package za.co.mythuso.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.SickNote
import za.co.mythuso.model.SickNoteData
import za.co.mythuso.model.SickNoteDraft
import za.co.mythuso.model.SickNoteLine

/*
 * The doctor's medical certificate on Android (2 October 2026) — the sick note the founder asked for,
 * beside the consultation record and the referral. The web's SickNote.tsx is the same screen; both read
 * packages/catalog/sick-note.json, generated here as SickNoteData.kt, and the rules are SickNote.kt's.
 *
 * SickNoteScreen is the doctor's page: the consultation a certificate comes out of, and the composer for
 * it. SickNoteComposer is the form on its own, handed a consultation's reference, the patient and who is
 * writing, for a consultation screen to embed.
 *
 * What it refuses is the point of it: a nurse (the sentence she already reads on her assessment), a doctor
 * whose registration lapsed (the vetting register's refusal), a call with nobody in the room (the
 * teleconsultation contract's own words), a consultation that has not happened, a period reaching further
 * back or running longer than the contract allows, and an illness described without the patient's
 * agreement. No identity number is carried. And nothing is issued: a signature shows the certificate as
 * the patient would read it, marked not issued, held in this screen's state and gone when it closes.
 * Every word is SickNoteData's; none is typed here.
 */
@Composable fun SickNoteScreen(store: PreviewStore) {
    var reference by remember { mutableStateOf(SickNoteData.consultations.first().reference) }
    val chosen = SickNote.consultation(reference) ?: SickNoteData.consultations.first()
    ScreenColumn {
        Heading("Doctor", SickNoteData.Screen.deskTitle, SickNoteData.Screen.lead)
        NotConnected("clinical-records")
        Note(SickNoteData.Screen.deskLead)
        CareCard {
            Text(SickNoteData.Screen.consultationLabel, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            SickNoteData.consultations.forEach { k ->
                Choice("${k.reference} · ${k.patient} · ${SickNote.day(k.dayOffset)}", k.reference == reference) { reference = k.reference }
            }
        }
        key(chosen.reference) { SickNoteComposer(store, chosen.reference, chosen.patient) }
    }
}

@Composable fun SickNoteComposer(store: PreviewStore, reference: String, patient: String, writer: String = "D-401") {
    var writerId by remember { mutableStateOf(writer) }
    var draft by remember { mutableStateOf(SickNote.draft(reference, patient)) }
    var signed by remember { mutableStateOf<List<SickNoteLine>?>(null) }
    val issuer = SickNote.issuer(store.vetting.subject(writerId))
    val refusals = SickNote.refusals(draft, issuer)
    val seen = SickNote.consultation(reference)
    fun set(next: SickNoteDraft) { draft = next }

    CareCard { Text(SickNoteData.notIssued, style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
    val done = signed
    if (done != null) {
        /* As the patient would read it: marked not issued above and below, so no crop of it loses both. */
        CareCard {
            Text(SickNoteData.notIssuedShort.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Charcoal)
            Text(SickNoteData.Screen.asSeenHeading, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            done.forEach { line -> ReviewLine(line.label, line.value) }
            Note(SickNoteData.notIssued)
            Note(SickNoteData.memoryOnly)
            OutlinedButton(onClick = { signed = null; draft = SickNote.draft(reference, patient) }, shape = ThusoButtonShape, modifier = Modifier.fillMaxWidth()) {
                Text(SickNoteData.Screen.again)
            }
        }
        return
    }
    CareCard {
        ReviewLine(SickNoteData.Screen.consultationLabel, seen?.let { "${it.reference} · ${SickNote.day(it.dayOffset)} at ${it.time}" } ?: reference)
        ReviewLine(SickNoteData.labels["patient"].orEmpty(), patient)
        Text(SickNoteData.Screen.writingAs, style = MaterialTheme.typography.labelLarge)
        SickNoteData.writers.forEach { id ->
            val subject = store.vetting.subject(id)
            Choice(subject?.let { "${it.name} · ${it.reference}" } ?: id, id == writerId) { writerId = id }
        }
        if (seen?.kind == "home-visit") Note("${SickNoteData.Basis.homeVisit} ${SickNoteData.Basis.byVideo}")
        Note(SickNoteData.protocolLine)
    }
    CareCard {
        Text(SickNoteData.Screen.fitnessLabel, style = MaterialTheme.typography.labelLarge)
        SickNoteData.fitness.forEach { f -> Choice(f.label, draft.fitness == f.id) { set(draft.copy(fitness = f.id)) } }
        Stepped(SickNoteData.Screen.fromLabel, SickNote.day(draft.fromOffset), { set(draft.copy(fromOffset = draft.fromOffset - 1)) }, { set(draft.copy(fromOffset = draft.fromOffset + 1)) })
        Stepped(SickNoteData.Screen.toLabel, SickNote.day(draft.toOffset), { set(draft.copy(toOffset = draft.toOffset - 1)) }, { set(draft.copy(toOffset = draft.toOffset + 1)) })
        Note("${maxOf(draft.daysCovered, 0)} ${SickNoteData.Screen.daysLabel}")
    }
    CareCard {
        /* Rule 16(1)(f): the proviso is the default, and unticking clears the words, so nothing written
           before the patient changed their mind reaches the certificate. */
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = draft.consent, onCheckedChange = { on -> set(draft.copy(consent = on, description = if (on) draft.description else "")) })
            Text(SickNoteData.Diagnosis.consentLabel, style = MaterialTheme.typography.bodyMedium)
        }
        if (draft.consent) {
            OutlinedTextField(
                value = draft.description,
                onValueChange = { set(draft.copy(description = it.take(SickNoteData.Diagnosis.descriptionMaxLength))) },
                label = { Text(SickNoteData.Diagnosis.descriptionLabel) },
                placeholder = { Text(SickNoteData.Diagnosis.descriptionHint) },
                modifier = Modifier.fillMaxWidth()
            )
        } else Note(SickNoteData.Diagnosis.withheld)
        SickNoteData.notCarried.forEach { Note(it) }
    }
    CareCard {
        if (refusals.isEmpty()) Note(SickNoteData.Screen.readyLine)
        else {
            Text(SickNoteData.Screen.refusedHeading, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            refusals.forEach { Text(it.sentence, style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
        }
        Button(onClick = { if (refusals.isEmpty()) signed = SickNote.certificate(draft, issuer) }, enabled = refusals.isEmpty(),
            shape = ThusoButtonShape, modifier = Modifier.fillMaxWidth()) { Text(SickNoteData.Screen.sign) }
    }
}

@Composable private fun Choice(label: String, chosen: Boolean, choose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected = chosen, role = Role.RadioButton, onClick = choose),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = chosen, onClick = null)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable private fun Stepped(label: String, value: String, earlier: () -> Unit, later: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("$label: $value", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        OutlinedButton(onClick = earlier, shape = ThusoButtonShape) { Text("−") }
        OutlinedButton(onClick = later, shape = ThusoButtonShape) { Text("+") }
    }
}
