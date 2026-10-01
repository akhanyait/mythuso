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
import za.co.mythuso.model.MedicinesData
import za.co.mythuso.model.Dispensing
import za.co.mythuso.model.DispensingPartner
import za.co.mythuso.model.VettingDecision
import za.co.mythuso.model.can
import za.co.mythuso.model.dispensingCrossReference
import za.co.mythuso.model.seededSubjects

/* An attribution line is where a reader is shown what accountability looks like, so the registration
   on it is read from the vetting record rather than typed here — a placeholder council number under
   a prescription is the one place a preview should not be fictional twice over. The party is
   fictional; the number is the one the vetting pipeline actually holds for them, and the format is
   the one the HPCSA issues. */
private const val orderPrescriber = "D-401"
private val prescriber: String = seededSubjects.first { it.id == orderPrescriber }.let { "${it.name} · ${it.reference}" }

/* WHO IS READING. The prescription and the laboratory order open for the patient (the Passport), the
   clinician (the patient file) and the partner who fills them (the partner's orders and results), and
   until 2 October 2026 they drew the patient's name and birth date, the prescriber's name and HPCSA
   number and the nurse who drew the sample whoever opened them — a day after the web stopped.
   packages/catalog/medicines.json#partnerQueue.neverCarries lists the patient, a name, the prescriber
   and the collector, so both screens take `partner`, with no default so that no route can forget to
   say, and a partner is drawn what partnerQueue carries: the order by its reference, what to fill, how
   far along it is, and the prescriber as the vetting register's answer rather than a person. The
   people are drawn by `whoFor` and nowhere else, so the one function a partner never reaches is the
   one place a person could come back through (scripts/check-boundaries.mjs holds it there).

   WHICH ORDER. Each order is its own fixture, found by its reference. Both screens drew one order
   whatever reference opened them, so LAB-0019, a sample still with the courier, opened LAB-0023's
   returned result and a release button, and RX-0079's one item opened RX-0081's two. A reference with
   no fixture is refused in words rather than shown somebody else's order. */

/* The people behind an order, for a reader who may know them. The first line returns before any
   person is read, which is the whole of what partnerQueue asks. */
private fun whoFor(partner: Boolean, patient: String? = null, prescriberAs: String, collectedBy: String? = null): List<Pair<String, String>> {
    if (partner) return emptyList()
    return listOfNotNull(patient?.let { "Patient" to it }, prescriberAs to prescriber, collectedBy?.let { "Collected by" to it })
}
/* What a partner is drawn where the prescriber's name was: whether the vetting register lets them stand
   behind the order, in dispensing.json#partner's words. */
private fun standingFor(label: String): Pair<String, String> =
    label to Dispensing.prescriberStanding(
        seededSubjects.firstOrNull { it.id == orderPrescriber }?.let { can(it, "prescribe") } ?: VettingDecision(false, null, emptyList())
    )
/* The people behind an order, as a partner sees them (nobody, and the register's answer) or as anybody
   else does. One composable for both screens, so the branch is written once. */
@Composable private fun OrderPeople(partner: Boolean, facts: List<Pair<String, String>>) {
    facts.forEach { (label, value) -> ReviewLine(label, value) }
    if (partner) Note(DispensingPartner.told)
}
/* A reference nothing here holds is said in words. Drawing another order under its heading was how one
   order's timeline came to stand for every order on the board. */
@Composable private fun NoSuchOrder(kind: String, reference: String) = ScreenColumn {
    DemoBadge()
    Text("There is no $kind $reference in this preview, so nothing is drawn for it — not another order under its reference.",
        style = MaterialTheme.typography.bodyLarge)
}

private val amlodipine = listOf("Amlodipine 5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take with or without food. Report ankle swelling.")
private val hydrochlorothiazide = listOf("Hydrochlorothiazide 12.5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take early in the day.")
private data class ScriptFixture(val medicines: List<List<String>>, val issued: String, val patient: String, val dispensed: Boolean)
/* The two scripts the partner's orders list, each as far along as its row says: RX-0081 is waiting for
   the pharmacist, RX-0079 is dispensed, sealed and waiting for its courier. */
private val scripts = mapOf(
    "RX-0081" to ScriptFixture(listOf(amlodipine, hydrochlorothiazide), "Issued 4 September · Valid for 6 months",
        patient = "Lerato Molefe · 01/01/1980", dispensed = false),
    "RX-0079" to ScriptFixture(listOf(amlodipine), "Issued 2 September · Valid for 6 months",
        patient = "Lerato Molefe · 01/01/1980", dispensed = true)
)
private data class LabFixture(val what: String, val reached: Int, val collectedBy: String, val seal: String) {
    /** All five steps behind it means a result came back. */
    val returned: Boolean get() = reached >= 5
}
/* The two orders the partner's results list, each as far along as its row says: LAB-0023 came back and
   waits for its doctor, LAB-0019's sample is with the courier. */
private val labOrders = mapOf(
    "LAB-0023" to LabFixture("Requested 4 September · Fasting panel", 5,
        collectedBy = "Sister Naledi Mokoena · At home, Rosebank", seal = "SEAL-77341 · Intact on receipt"),
    "LAB-0019" to LabFixture("Requested 4 September · Sample in transit", 2,
        collectedBy = "Sister Naledi Mokoena · At home, Soweto", seal = "SEAL-77352 · Intact at the courier’s handover")
)
/* The steps as far as an order has got: the ones behind it done, the one in hand active, the rest
   waiting with no time against them. The release step keeps its own state once a result is back. */
private fun progressed(steps: List<TimelineStep>, order: LabFixture): List<TimelineStep> = steps.mapIndexed { n, step ->
    if (n == steps.lastIndex && order.returned) step
    else step.copy(
        at = if (n < order.reached) step.at else "",
        state = when { n < order.reached -> "done"; n == order.reached -> "active"; else -> "waiting" }
    )
}

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
@Composable fun PrescriptionScreen(reference: String, partner: Boolean) {
    val script = scripts[reference] ?: run { NoSuchOrder("prescription", reference); return }
    var state by remember(reference) { mutableStateOf(LoadState.READY) }
    /* A dispensed script's items were checked before it was sealed, so they start checked. */
    var checked by remember(reference) { mutableStateOf(if (script.dispensed) script.medicines.map { it[0] }.toSet() else setOf()) }
    val medicines = script.medicines
    ScreenColumn {
        DemoBadge()
        NotConnected("dispensing")
        Heading("Fictional prescription", reference, "${script.issued} · ${if (script.dispensed) "Dispensed, awaiting courier" else "Awaiting pharmacist"}")
        CareCard {
            /* A partner is told whether the prescriber may stand behind the script and not who they
               are; everybody else reads the people too. */
            OrderPeople(partner, if (partner) listOf(standingFor("Prescriber")) else whoFor(partner, patient = script.patient, prescriberAs = "Prescriber"))
            ReviewLine("Dispensing pharmacy", "Rosebank community pharmacy")
        }
        StatePicker("Preview the pharmacy connection state", state) { state = it }
        StateBlock(state, "The dispensing partner’s order feed", "partner data sharing", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                medicines.forEach { medicine ->
                    CareCard {
                        Row(verticalAlignment = Alignment.Top) {
                            Checkbox(medicine[0] in checked, { on -> checked = if (on) checked + medicine[0] else checked - medicine[0] },
                                enabled = !script.dispensed, modifier = Modifier.clearAndSetSemantics { contentDescription = "Mark ${medicine[0]} checked by pharmacist" })
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
                        TimelineStep("Pharmacist check", "${checked.size} of ${medicines.size} items checked in this preview", state = if (script.dispensed) "done" else "active"),
                        TimelineStep("Dispensed and sealed", "Tamper-evident seal number recorded", state = if (script.dispensed) "done" else "waiting"),
                        TimelineStep("Delivered to the patient", "Signature or visit-code handover", state = if (script.dispensed) "active" else "waiting")
                    ))
                }
            }
        }
        Note(dispensingCrossReference)
    }
}
@Composable fun LabOrderScreen(reference: String, partner: Boolean) {
    val order = labOrders[reference] ?: run { NoSuchOrder("laboratory order", reference); return }
    var state by remember(reference) { mutableStateOf(LoadState.READY) }
    var released by remember(reference) { mutableStateOf(false) }
    val panel = listOf(
        listOf("Haemoglobin", "13.9 g/dL", "12.0 – 15.5", ""),
        listOf("Fasting glucose", "6.4 mmol/L", "3.9 – 5.6", "High"),
        listOf("Creatinine", "74 µmol/L", "49 – 90", ""),
        listOf("Total cholesterol", "5.8 mmol/L", "< 5.0", "High")
    )
    ScreenColumn {
        DemoBadge()
        Heading("Fictional laboratory order", reference, "${order.what} · ${if (released) "Released to patient" else if (order.returned) "Awaiting release" else "Not yet returned"}")
        CareCard {
            /* A partner reads the register's answer where the doctor was, and nobody where the nurse
               who drew the sample was. */
            OrderPeople(partner, if (partner) listOf(standingFor("Requested by")) else whoFor(partner, prescriberAs = "Requested by", collectedBy = order.collectedBy))
            ReviewLine("Sample seal", order.seal)
        }
        CareCard {
            Text("Chain of custody", style = MaterialTheme.typography.titleMedium)
            Timeline(progressed(listOf(
                TimelineStep("Ordered", "Doctor requested a fasting panel", "4 September, 08:10", "done"),
                TimelineStep("Collected at home", "Two tubes drawn, sealed and labelled at the bedside", "4 September, 09:05", "done"),
                TimelineStep("Courier handover", "Seal scanned by courier · Temperature logged", "4 September, 09:40", "done"),
                TimelineStep("Received by the laboratory", "Seal verified intact · Accessioned", "4 September, 12:15", "done"),
                /* A reference returned, not a result verified: no test is run, so the contract's words. */
                TimelineStep(MedicinesData.ResultsText.returned, MedicinesData.ResultsText.returnedDetail, "5 September, 07:30", "done"),
                TimelineStep("Released to the patient", if (released) "Visible in the Health Passport with an explanation" else "Held until the requesting doctor releases them", state = if (released) "done" else "active")
            ), order))
        }
        if (!order.returned) Note("This sample is still on its way to the laboratory, so nothing has come back for it.")
        else StatePicker("Preview the laboratory connection state", state) { state = it }
        if (order.returned) StateBlock(state, "The laboratory result feed", "partner data sharing", { state = LoadState.READY }) {
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
        /* Release is withheld from the partner. vetting.json grants a laboratory release-lab-result, and
           the partner's own Results board says a clinician releases a result; of the two, the clinician's
           rule is the one a patient is protected by, so a partner reads the sentence and is drawn no
           control. */
        if (partner) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.Block, null, tint = Charcoal)
            Text(DispensingPartner.releaseWithheld, style = MaterialTheme.typography.bodyMedium)
        }
        else if (order.returned) StudioButton(onClick = { released = !released }, Modifier.fillMaxWidth(), shape = ThusoButtonShape) { Text(if (released) "Withdraw demo release" else "Release with an explanation") }
    }
}
