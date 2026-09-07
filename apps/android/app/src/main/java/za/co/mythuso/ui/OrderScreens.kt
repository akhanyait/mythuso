package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.dispensingCrossReference
import za.co.mythuso.model.seededSubjects

/* An attribution line is where a reader is shown what accountability looks like, so the registration
   on it is read from the vetting record rather than typed here — a placeholder council number under
   a prescription is the one place a preview should not be fictional twice over. The party is
   fictional; the number is the one the vetting pipeline actually holds for them, and the format is
   the one the HPCSA issues. */
private val prescriber: String = seededSubjects.first { it.id == "D-401" }.let { "${it.name} · ${it.reference}" }

data class TimelineStep(val label: String, val detail: String, val at: String = "", val state: String = "waiting")

@Composable fun Timeline(steps: List<TimelineStep>) {
    Column {
        steps.forEach { step ->
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(
                    when (step.state) { "done" -> Icons.Outlined.CheckCircle; "active" -> Icons.Outlined.RadioButtonChecked; else -> Icons.Outlined.RadioButtonUnchecked },
                    null, tint = if (step.state == "waiting") MaterialTheme.colorScheme.onSurfaceVariant else Indigo
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(step.label, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                    Note(step.detail)
                    if (step.at.isNotEmpty()) Text(step.at, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
@Composable fun PrescriptionScreen(reference: String = "RX-0081") {
    var state by remember { mutableStateOf(LoadState.READY) }
    var checked by remember { mutableStateOf(setOf<String>()) }
    val medicines = listOf(
        listOf("Amlodipine 5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take with or without food. Report ankle swelling."),
        listOf("Hydrochlorothiazide 12.5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take early in the day.")
    )
    ScreenColumn {
        DemoBadge()
        Heading("Fictional prescription", reference, "Issued 4 September · Valid for 6 months · Awaiting pharmacist")
        CareCard {
            ReviewLine("Patient", "Lerato Molefe · 01/01/1980")
            ReviewLine("Prescriber", prescriber)
            ReviewLine("Dispensing pharmacy", "Rosebank community pharmacy")
        }
        StatePicker("Preview the pharmacy connection state", state) { state = it }
        StateBlock(state, "The dispensing partner’s order feed", "partner data sharing", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                medicines.forEach { medicine ->
                    CareCard {
                        Row(verticalAlignment = Alignment.Top) {
                            Checkbox(medicine[0] in checked, { on -> checked = if (on) checked + medicine[0] else checked - medicine[0] },
                                modifier = Modifier.clearAndSetSemantics { contentDescription = "Mark ${medicine[0]} checked by pharmacist" })
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(medicine[0], fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge)
                                Note(medicine[1]); Note(medicine[2]); Note(medicine[3])
                            }
                        }
                    }
                }
                CareCard {
                    Text("Chain of custody", style = MaterialTheme.typography.titleMedium)
                    Timeline(listOf(
                        TimelineStep("Prescribed", "Signed by the reviewing doctor", "4 September, 11:41", "done"),
                        TimelineStep("Sent to pharmacy", "Encrypted transfer to the dispensing partner", "4 September, 11:42", "done"),
                        TimelineStep("Pharmacist check", "${checked.size} of ${medicines.size} items checked in this preview", state = "active"),
                        TimelineStep("Dispensed and sealed", "Tamper-evident seal number recorded"),
                        TimelineStep("Delivered to the patient", "Signature or visit-code handover")
                    ))
                }
            }
        }
        Note(dispensingCrossReference)
    }
}
@Composable fun LabOrderScreen(reference: String = "LAB-0023") {
    var state by remember { mutableStateOf(LoadState.READY) }
    var released by remember { mutableStateOf(false) }
    val panel = listOf(
        listOf("Haemoglobin", "13.9 g/dL", "12.0 – 15.5", ""),
        listOf("Fasting glucose", "6.4 mmol/L", "3.9 – 5.6", "High"),
        listOf("Creatinine", "74 µmol/L", "49 – 90", ""),
        listOf("Total cholesterol", "5.8 mmol/L", "< 5.0", "High")
    )
    ScreenColumn {
        DemoBadge()
        Heading("Fictional laboratory order", reference, "Requested 4 September · Fasting panel · ${if (released) "Released to patient" else "Awaiting release"}")
        CareCard {
            ReviewLine("Requested by", prescriber)
            ReviewLine("Collected by", "Sister Naledi Mokoena · At home, Rosebank")
            ReviewLine("Sample seal", "SEAL-77341 · Intact on receipt")
        }
        CareCard {
            Text("Chain of custody", style = MaterialTheme.typography.titleMedium)
            Timeline(listOf(
                TimelineStep("Ordered", "Doctor requested a fasting panel", "4 September, 08:10", "done"),
                TimelineStep("Collected at home", "Two tubes drawn, sealed and labelled at the bedside", "4 September, 09:05", "done"),
                TimelineStep("Courier handover", "Seal scanned by courier · Temperature logged", "4 September, 09:40", "done"),
                TimelineStep("Received by the laboratory", "Seal verified intact · Accessioned", "4 September, 12:15", "done"),
                TimelineStep("Results verified", "Checked by the laboratory’s reviewing pathologist", "5 September, 07:30", "done"),
                TimelineStep("Released to the patient", if (released) "Visible in the Health Passport with an explanation" else "Held until the requesting doctor releases them", state = if (released) "done" else "active")
            ))
        }
        StatePicker("Preview the laboratory connection state", state) { state = it }
        StateBlock(state, "The laboratory result feed", "partner data sharing", { state = LoadState.READY }) {
            CareCard {
                Text("Results", style = MaterialTheme.typography.titleMedium)
                panel.forEach { row ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(row[0], style = MaterialTheme.typography.bodyMedium)
                            Text(row[1], fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Note("Reference ${row[2]}")
                            Text(row[3].ifEmpty { "Within range" }, style = MaterialTheme.typography.labelSmall,
                                color = if (row[3].isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MangoInk)
                        }
                    }
                    HorizontalDivider()
                }
                Note("Fictional results. Reference ranges are illustrative and vary by laboratory, age and sex.")
            }
        }
        Note("Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.")
        Button(onClick = { released = !released }, Modifier.fillMaxWidth()) { Text(if (released) "Withdraw demo release" else "Release with an explanation") }
    }
}
