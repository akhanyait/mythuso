package za.co.mythuso.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/* The hand-over of a sealed medicine bag at a patient's door, as the nurse who holds it.
 *
 * Every word on this screen that is not about the preview itself is MedicinesData.kt, generated from the contract,
 * and every rule is model/Medicines.kt. The screen adds three things of its own, each for a reason:
 *
 *   The patient's phone. A collector does not know the PIN, and a reviewer walking the journey has nobody to ask,
 *   so a synthetic patient stands on this device and is shown the PIN once. The card says it is synthetic, because
 *   a PIN printed beside the field it unlocks is exactly what the real screen must never look like.
 *
 *   The seal is chosen, not assumed. Neither answer is selected when the screen opens, so a nurse cannot hand a bag
 *   over without having said what she saw.
 *
 *   A fresh bag each time the screen opens. The collection lives in the screen's own state and nowhere else: a
 *   voided bag goes back to the pharmacy, and the only way to try again is the way the contract gives, a new
 *   authorisation, which here is leaving and coming back.
 *
 * Nothing is collected and no pharmacy is contacted; the capability notice for medicine collection says so in the
 * contract's words.
 */
class MedicinesHandoverDesk {
    companion object {
        /* The nurse the workspace opens as. She is the collector the synthetic patient authorised, so the refusals a
           reviewer meets are the ones a real collector would, not "not-the-authorised-collector" on every tap. */
        val collector = Medicines.Caller("N-205", "nurse")
        private fun reference(prefix: String, length: Int) = prefix + Medicines.newSalt().take(length).uppercase()
    }

    val authorisation: Medicines.Authorisation
    var prescription by mutableStateOf(
        /* A schedule a driver may not carry, when the contract has one: the nurse is the collector who may, and a
           reviewer sees why the patient chose a nurse rather than a courier for this bag. */
        Medicines.Prescription(
            reference("RX-SYN-", 6), "P-SYNTHETIC",
            (MedicinesData.schedules.firstOrNull { !it.driverMayCarry } ?: MedicinesData.schedules.first()).id,
            System.currentTimeMillis(), reference("SEAL-", 8)
        )
    )
        private set
    var collection by mutableStateOf<Medicines.CollectionRecord?>(null)
        private set
    var attempts by mutableStateOf(listOf<Medicines.Attempt>())
        private set
    var patientPin by mutableStateOf<String?>(null)
        private set
    var refusal by mutableStateOf<MedicinesRefusal?>(null)
        private set

    init {
        val pin = Medicines.newPin()
        authorisation = Medicines.authorise(
            prescription, reference("AUTH-", 8), collector.ref.orEmpty(), collector.role, pin, Medicines.Terms.defaults, prescription.dispensedAt ?: System.currentTimeMillis()
        )
        patientPin = pin
    }

    val state get() = Medicines.custodyState(collection, attempts, authorisation)
    val attemptsLeft get() = Medicines.attemptsLeft(attempts, authorisation)
    val handedOver get() = collection?.handedOverAt != null

    fun collect() {
        when (val collected = Medicines.collect(
            prescription, authorisation, collection, reference("COL-", 8), prescription.sealRef.orEmpty(), collector, System.currentTimeMillis()
        )) {
            is MedicinesOutcome.Done -> { collection = collected.value.collection; prescription = collected.value.prescription; refusal = null }
            is MedicinesOutcome.Refused -> refusal = collected.refusal
        }
    }

    /** The nurse enters the PIN the patient reads to her. The patient's screen forgets it as she does, as a PIN shown once must. */
    fun handOver(pin: String, sealIntact: Boolean) {
        patientPin = null
        val held = collection ?: run { refusal = Medicines.refusal("no-such-collection"); return }
        val handed = Medicines.handOver(
            held, prescription, authorisation, attempts, Medicines.pinMatches(pin, authorisation), sealIntact, collector, System.currentTimeMillis()
        )
        handed.keep?.let { attempts = attempts + it }
        when (val result = handed.result) {
            is MedicinesOutcome.Done -> { collection = result.value.collection; prescription = result.value.prescription; refusal = null }
            is MedicinesOutcome.Refused -> refusal = result.refusal
        }
    }
}

@Composable fun MedicinesHandoverScreen() {
    val desk = remember { MedicinesHandoverDesk() }
    var pin by remember { mutableStateOf("") }
    var sealIntact by remember { mutableStateOf<Boolean?>(null) }
    val text = MedicinesData.HandoverText

    ScreenColumn {
        DemoBadge()
        Heading("", text.heading, text.intro)
        NotConnected("medicine-collection")

        /* Quiet ground, a phone symbol and the word synthetic in its first line: it is somebody else's screen
           standing in this one, and it must not read as part of the collector's. */
        TonedCard(background = Cloud) {
            Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.PhoneAndroid, null, tint = Charcoal, modifier = Modifier.size(18.dp))
                    Text("The patient's phone · synthetic, in this preview", style = MaterialTheme.typography.labelLarge, color = Charcoal)
                }
                desk.patientPin?.let { Text(it, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = Charcoal) }
                Note(
                    if (desk.patientPin == null) "Shown once, and gone now. A synthetic patient, on this device so the hand-over can be walked."
                    else "A synthetic patient, on this device so the hand-over can be walked. Shown once: it goes the moment a PIN is entered, and a real collector never sees it."
                )
            }
        }

        CareCard {
            Text(Medicines.label(MedicinesData.custodyStates, desk.state), style = MaterialTheme.typography.labelMedium, color = Faint)
            Text(
                listOfNotNull(Medicines.schedule(desk.prescription.scheduleCode)?.name, desk.prescription.sealRef).joinToString(" · "),
                style = MaterialTheme.typography.titleLarge, color = Charcoal
            )
            Medicines.voidedBy(desk.attempts, desk.authorisation)?.let {
                Text(Medicines.label(MedicinesData.voidReasons, it), style = MaterialTheme.typography.labelMedium, color = Danger)
            }
            if (desk.collection == null) {
                StudioButton(onClick = { desk.collect() }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(text.collect) }
                desk.refusal?.let { MedicinesRefusalLine(it) }
            }
        }

        if (desk.collection != null && !desk.handedOver) {
            CareCard {
                SealChoice(text.sealIntact, sealIntact == true) { sealIntact = true }
                SealChoice(text.sealBroken, sealIntact == false) { sealIntact = false }
                Text(text.pin, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                CodeBoxes(pin, { pin = it }, length = MedicinesData.pinDigits, invalid = desk.refusal != null, label = text.pin)
                if (desk.state == "collected") Note(Medicines.fill(text.attemptsLeft, mapOf("left" to desk.attemptsLeft.toString())))
                desk.refusal?.let { MedicinesRefusalLine(it) }
            }
            StudioButton(
                onClick = { sealIntact?.let { desk.handOver(pin, it) }; pin = "" },
                enabled = pin.length == MedicinesData.pinDigits && sealIntact != null,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            ) { Text(text.handOver) }
        }

        if (desk.handedOver) {
            CareCard { Text(text.handedOver, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Charcoal) }
        }
    }
}

@Composable private fun SealChoice(label: String, selected: Boolean, pick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected = selected, onClick = pick, role = Role.RadioButton),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

/* The refusal in the text ink and the danger colour only on the mark, so the words stay readable and the state is
   not carried by colour alone. */
@Composable private fun MedicinesRefusalLine(refusal: MedicinesRefusal) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top
    ) {
        Icon(Icons.Outlined.Block, null, tint = Danger, modifier = Modifier.size(18.dp))
        Text(refusal.statement, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
    }
}
