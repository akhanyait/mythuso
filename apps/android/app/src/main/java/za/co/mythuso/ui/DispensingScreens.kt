package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Hearing
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/* Substitution and chronic authorisation, for the pharmacist.

   A pharmacist hands over something other than what was written. A repeat runs out. Both are the
   most ordinary events in a pharmacy, and both are where harm hides, so this screen is built out of
   the distinctions that ordinariness erodes:

     A substitution is a clinical decision, not a stock decision. An empty shelf is a reason to think
     about an alternative; it is never on its own a reason to hand one over. Every item says which of
     the three classes it is in and on what ground, and an item that must not be substituted carries
     no control at all — not a disabled one. A button that refuses is still a button somebody will
     look for a way around, and there is nothing here to work around.

     The patient is told, in words, before they accept it. Nothing can be marked handed over until
     the words have actually been shown, which is a gate rather than a reminder.

     Who decided. Every substituted item carries the pharmacist's name and SAPC registration, the
     same way a clinical sign-off does.

     The authorisation is boxed twice, by a date and by a number of repeats, and it ends on whichever
     arrives first. Both boxes are arithmetic on the contract, done in Dispensing.kt.

   Two refusals here belong to the vetting register and are quoted rather than restated: a pharmacy
   whose responsible pharmacist is not current cannot be dispensed to, and a doctor whose
   registration has lapsed cannot stand behind the prescription.

   Nothing is dispensed. No pharmacy is contacted and every patient, pharmacist and product is
   fictional.

   WHO IS READING. This is the pharmacy's screen, and packages/catalog/medicines.json#partnerQueue
   .neverCarries lists the patient and the prescriber: a pharmacy is told what to dispense and never
   who for. So the prescription is drawn by its reference and the day it was issued, and the
   prescriber as the vetting register's answer — whether a doctor who may prescribe stands behind it
   — and never as a name or an HPCSA number. The demonstration switch between a current and a lapsed
   doctor is keyed by position, and the subject id stays inside `prescriberAt`. The web stopped
   naming either on 1 October 2026 and this screen went on doing it until the 2nd;
   scripts/check-boundaries.mjs holds all three to it now. Whether a pharmacist should read the
   prescriber's name off a real prescription is an open question in docs/FEATURE-MAP.md. */

private val dispensingPharmacies = listOf("P-501", "P-502")
/* A doctor whose registration is current and one whose HPCSA registration lapsed. Switching between
   them changes whether anybody may stand behind the prescription and nothing else. */
private val dispensingPrescribers = listOf("D-401", "D-402")

@Composable fun DispensingScreen(store: PreviewStore) {
    val pharmacies = remember(store) { dispensingPharmacies.mapNotNull { store.vetting.subject(it) } }
    /* The register's answer for the doctor at each position in the switch, worked out here so that
       only the answer leaves: a doctor missing from the register is a refusal like any other. */
    val prescriberAt = dispensingPrescribers.map { id ->
        store.vetting.subject(id)?.let { can(it, "prescribe") } ?: VettingDecision(false, null, emptyList())
    }
    var pharmacyId by remember { mutableStateOf(pharmacies.first().id) }
    var prescriberKey by remember { mutableStateOf(0) }
    var told by remember { mutableStateOf(setOf<String>()) }
    var handed by remember { mutableStateOf(setOf<String>()) }
    var collectTried by remember { mutableStateOf(false) }

    val pharmacy = pharmacies.firstOrNull { it.id == pharmacyId } ?: pharmacies.first()
    val mayDispense = can(pharmacy, "dispense")
    val mayPrescribe = prescriberAt[prescriberKey]
    val standings = prescriberAt.map { Dispensing.prescriberStanding(it) }
    val open = mayDispense.allowed && mayPrescribe.allowed
    val rx = dispensedPrescription
    val auth = chronicAuthorisation
    val everyItemTold = rx.items.all { it.id in told }

    ScreenColumn {
        DemoBadge()
        NotConnected("dispensing")
        Heading("Partner workspace", "Substitution & repeats",
            "A fictional prescription. Nothing is dispensed and no pharmacy is contacted.")

        CareCard {
            Text(rx.reference, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Charcoal)
            /* By its reference and the day it was issued, never by the patient's name and birth date. */
            Note("Issued ${rx.issuedInDays * -1} days ago")
            ReviewLine("Prescriber", standings[prescriberKey])
            ReviewLine("Dispensed by", "${rx.pharmacist.name} · ${rx.pharmacist.registration}")
            ReviewLine("At", "${pharmacy.name} · ${pharmacy.reference}")
            Note(DispensingPartner.told)
        }

        /* Both answers come from the vetting register in its own words. A licence and a registration
           are not badges on a partner page; they are what decides whether anything here does
           anything. */
        Text("Dispensing pharmacy", style = MaterialTheme.typography.titleMedium, color = Charcoal)
        FlowRowChips(pharmacies.map { p -> p.name }, setOf(pharmacy.name)) { chosen ->
            pharmacyId = pharmacies.first { p -> p.name == chosen }.id; handed = emptySet()
        }
        /* Each chip is the register's answer for the doctor at that position, so the switch shows what
           changes — whether anybody may stand behind the script — and nobody's name. Keyed by position
           rather than by its words, so two doctors with the same answer are still two chips. */
        Text("Prescriber", style = MaterialTheme.typography.titleMedium, color = Charcoal)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            standings.forEachIndexed { at, standing ->
                FilterChip(
                    selected = at == prescriberKey,
                    onClick = { prescriberKey = at; handed = emptySet() },
                    label = { Text(standing) },
                    modifier = Modifier.semantics { selected = at == prescriberKey }
                )
            }
        }
        if (!mayDispense.allowed) Alert(mayDispense.reason.orEmpty())
        if (!mayPrescribe.allowed) Alert(mayPrescribe.reason.orEmpty())

        Text("What a substitution may and may not change", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Text("NEVER, WITHOUT THE PRESCRIBER", style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
            substitutionNeverChanges.forEach { Bullet(it.what, it.why) }
            HorizontalDivider()
            Text("MAY CHANGE, AND THE PATIENT IS TOLD", style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
            substitutionMayChange.forEach { Bullet(it.what, it.why) }
            DispensingRefusalRow(Dispensing.refusal("substitute-the-molecule"))
        }

        Text("The three classes", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        substitutionClasses.forEach { klass ->
            CareCard {
                StatusPill(klass.shortName, klass.tone)
                Text(klass.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(klass.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Note(klass.whoDecides)
            }
        }
        Note(
            "There is no fourth class called “may be substituted”. Section 22F of the Medicines and " +
                "Related Substances Act 101 of 1965 makes telling the patient a duty on every substitution, " +
                "with four exceptions — " +
                Dispensing.statutoryGrounds.joinToString(", ") { g -> "${g.name.lowercase()} (${g.section})" } +
                " — so a silent swap is not the mild end of this screen. It is outside it."
        )

        Text("${rx.items.size} items · ${rx.substituted.size} substituted",
            style = MaterialTheme.typography.titleLarge, color = Charcoal)
        Text(Dispensing.rule("substitution-is-clinical").sentence,
            style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        rx.items.forEach { item ->
            ItemCard(
                item = item, pharmacist = rx.pharmacist, open = open,
                told = item.id in told,
                onTell = { told = if (item.id in told) told - item.id else told + item.id },
                handed = item.id in handed,
                onHand = { on -> handed = if (on) handed + item.id else handed - item.id }
            )
        }
        Text(Dispensing.rule("patient-is-told-first").sentence,
            style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        Text(Dispensing.rule("substitution-is-signed").sentence,
            style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)

        Text("The handover", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            dispensingHandover.forEachIndexed { index, step ->
                val done = open && (index < 2 || (step.id == "told" && everyItemTold) ||
                    (step.id == "recorded" && handed.size == rx.items.size))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(if (done) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null,
                        tint = if (done) Indigo else StudioInkMuted)
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(step.label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                        Text(step.detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    }
                }
            }
        }

        Text("The chronic authorisation", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(auth.reference, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                    Text("${auth.programme} · ${auth.condition}", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                }
                StatusPill("${Dispensing.repeatsRemaining} of ${auth.repeatsAuthorised} left",
                    if (Dispensing.bindsOnDate) "amber" else "teal")
            }
            Box3("Runs out in", "${Dispensing.expiresInDays} days",
                "Authorised ${-auth.authorisedByDays} days ago for ${auth.validMonths} months")
            Box3("Medicine still authorised", "${Dispensing.daysOfMedicineLeft} days",
                "${Dispensing.repeatsRemaining} repeats of ${auth.daysPerRepeat} days")
            Box3("Ends on", if (Dispensing.bindsOnDate) "the date" else "the repeats",
                if (Dispensing.strandedRepeats > 0)
                    "Whichever comes first — ${Dispensing.strandedRepeats} of the repeats cannot be collected before it expires"
                else "Whichever comes first")
            Note(auth.note)
            Note(auth.quantityNote)
            Text(Dispensing.rule("authorisation-is-boxed").sentence,
                style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            ReviewLine("Last collected", "${-auth.lastCollectedDays} days ago")
            ReviewLine("Next collection due", "in ${Dispensing.nextCollectionInDays} days")
            StudioButton({ collectTried = true }, enabled = open, shape = ThusoButtonShape) { Text("Collect a repeat") }
            if (collectTried) {
                val answer = Dispensing.collectionAnswer
                if (answer.allowed) {
                    Text(answer.reason, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                } else {
                    Alert(answer.reason)
                    Text(Dispensing.rule("early-is-refused-with-a-date").sentence,
                        style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                }
            }
            if (Dispensing.isFinalRepeat) {
                Alert("This is the last repeat. It is said now, not at the counter next month.")
            }
            Column(
                Modifier.fillMaxWidth().background(IndigoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text("What happens at the end", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(auth.endsWith, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Text(Dispensing.rule("ends-in-a-review").sentence,
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }

        Text("What this screen will not do", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        dispensingRefusals.forEach { CareCard { DispensingRefusalRow(it) } }
        Note("Nothing is dispensed, no stock is checked and no prescriber is notified. Every date above is arithmetic on the demo contract, and none of the clinical wording here has been read by a pharmacist.")
    }
}

@Composable private fun ItemCard(
    item: PrescriptionItem, pharmacist: DispensingPharmacist, open: Boolean,
    told: Boolean, onTell: () -> Unit, handed: Boolean, onHand: (Boolean) -> Unit
) {
    val klass = Dispensing.substitutionClass(item.classId)
    CareCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.dispensed, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                Text("${item.molecule} ${item.strength} · ${item.form} · ${item.dose} · ${item.quantity}",
                    style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            }
            StatusPill(klass.shortName, klass.tone)
        }
        Text(
            if (item.wasSubstituted) "Written: ${item.prescribed}" else "Written and dispensed: ${item.prescribed}",
            style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted
        )
        GroundRow(Dispensing.ground(item.ground))
        item.secondGround?.let { GroundRow(Dispensing.ground(it)) }
        Note(klass.whoDecides)

        /* An item that must not be substituted carries no control. The refusal is the absence, and
           the sentence says where the route actually is. */
        if (item.classId == "must-not") DispensingRefusalRow(Dispensing.refusal("override-do-not-substitute"))

        item.writtenReason?.let { reason ->
            Column(
                Modifier.fillMaxWidth().background(Mist, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text("${pharmacist.name} · ${pharmacist.registration}",
                    style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                Text("${pharmacist.role} · the prescriber was told the same day",
                    style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                Text(reason, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            }
        }

        OutlinedButton(onTell, shape = ThusoButtonShape) {
            Text(if (told) "Hide what was said to the patient" else "Read this to the patient")
        }
        if (told) Telling(item)

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(handed, onHand, enabled = told && open,
                modifier = Modifier.clearAndSetSemantics { contentDescription = "Hand over ${item.dispensed}" })
            Text(
                if (told) "Handed over"
                else "Nothing is handed over before the patient has been told what it is",
                style = MaterialTheme.typography.bodyMedium, color = if (told) Charcoal else StudioInkMuted
            )
        }
        Note(item.note)
    }
}

/* The words. Not a label on a box — sentences a person can repeat to somebody else at home, so they
   are set as speech rather than as small print. */
@Composable private fun Telling(item: PrescriptionItem) {
    Column(
        Modifier.fillMaxWidth().background(IndigoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Hearing, null, tint = Charcoal)
            Text(Dispensing.headline(item), style = MaterialTheme.typography.labelLarge, color = IndigoDeep)
        }
        if (item.wasSubstituted) {
            Text("It replaces ${item.prescribed}.", style = MaterialTheme.typography.bodyMedium, color = IndigoDeep)
        }
        Text(item.patientWords, style = MaterialTheme.typography.bodyLarge, color = Charcoal)
        if (item.sameness.isNotEmpty()) {
            Text("THE SAME", style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
            item.sameness.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted) }
            Text("DIFFERENT", style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
            item.differences.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted) }
        }
    }
}

@Composable private fun GroundRow(ground: SubstitutionGround) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Info, null, tint = Charcoal)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(if (ground.section == null) ground.name else "${ground.name} · section ${ground.section}",
                style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
            Text(ground.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        }
    }
}

@Composable private fun Bullet(what: String, why: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Text("•", color = Indigo)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(what, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
            Text(why, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        }
    }
}

@Composable private fun Box3(label: String, value: String, note: String) {
    Column(
        Modifier.fillMaxWidth().background(Mist, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = StudioInkMuted)
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Charcoal)
        Text(note, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
    }
}

@Composable private fun Alert(text: String) {
    Row(
        Modifier.fillMaxWidth().background(MangoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top
    ) {
        Icon(Icons.Outlined.CalendarMonth, null, tint = MangoInk)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

@Composable private fun DispensingRefusalRow(item: DispensingRefusal) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Block, null, tint = Danger)
        Text(item.sentence, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}
