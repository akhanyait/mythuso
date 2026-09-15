package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import za.co.mythuso.model.CashCodeDoor
import za.co.mythuso.model.Money
import za.co.mythuso.model.MoneyData
import za.co.mythuso.model.CareData
import za.co.mythuso.model.CareOffer
import za.co.mythuso.model.CareOfferState
import za.co.mythuso.model.CareStage
import za.co.mythuso.model.CareVisitState
import za.co.mythuso.model.PreviewStore

/*
 * A visit offered to a nurse, and the visit itself, on Android.
 *
 * TWO PLACES, BECAUSE THEY ARE TWO DECISIONS. The offer sits on her schedule, because whether to take
 * another visit is a decision about the day and is read beside the visits already in it. The visit
 * opens as its own screen once she has taken it, because from the door onwards it is the only thing
 * she is doing.
 *
 * WHAT THE OFFER WITHHOLDS. The suburb. An offer goes to a nurse who may decline it, and
 * appointment.offered carries no patient location for exactly that reason; the card says how far, as
 * the straight line between suburb centres it is, and when, and the place arrives with acceptance.
 *
 * WHAT THE VISIT REFUSES, ON THE SCREEN. The code at both ends, a checklist under a draft protocol, a
 * handover before the encounter is signed, and the patient's view of where the nurse is once the visit
 * is done — each in the contract's own words, from CareData, beside the control that was refused.
 *
 * Nothing animates. The minutes left on an offer are re-read every fifteen seconds and redrawn.
 */

private const val TICK_MILLIS = 15_000L

/** The offer, on the nurse's schedule. Off duty, no new offer is shown; a visit she has already taken still is. */
@Composable fun CareOfferCard(store: PreviewStore, available: Boolean, open: (String) -> Unit) {
    val care = store.careVisit
    LaunchedEffect(care) { while (true) { delay(TICK_MILLIS); care.tick() } }
    val offer = care.offer
    val serviceName = care.service?.name.orEmpty()
    when {
        care.completed -> CareCard {
            CareEyebrow("Visit ${CareData.Preview.appointmentRef} · complete")
            CareTitle("$serviceName, ${care.visitZone?.name.orEmpty()}")
            Note(CareData.billable)
        }
        care.accepted -> CareCard {
            CareEyebrow("You accepted · ${CareData.Preview.appointmentRef}")
            CareTitle("$serviceName, ${care.visitZone?.name.orEmpty()}")
            Note("Today at ${CareVisitState.clock(care.scheduledFor)} · ${care.service?.duration ?: 0} min")
            StudioButton(onClick = { open("Care visit") }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Continue this visit") }
        }
        available && offer != null && offer.state == CareOfferState.OPEN -> CareOfferPanel(care, offer, serviceName)
        offer != null && (offer.state == CareOfferState.DECLINED || offer.state == CareOfferState.LAPSED) -> CareCard {
            CareEyebrow(if (offer.state == CareOfferState.DECLINED) "You declined · $serviceName" else "Offer lapsed · $serviceName")
            CareStrong(if (offer.state == CareOfferState.DECLINED) CareData.declined else CareData.lapsed)
        }
        available && care.withheld != null -> CareCard {
            CareEyebrow("No visit offered to you")
            CareStrong(care.withheld.orEmpty())
            Note(CareData.withheldIsNotLast)
        }
    }
}

@Composable private fun CareOfferPanel(care: CareVisitState, offer: CareOffer, serviceName: String) {
    CareCard {
        CareEyebrow("A visit offered to you")
        CareTitle(serviceName)
        offer.marker?.let { Text(it, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = Charcoal) }
        /* This app has no admin surface and never reads the value an admin puts in force on the web: it offers
           by the generated default. So the marker describes that default and only that — shown while the
           contract's default for who may be offered this service waits on a clinical review, and gone the day a
           reviewed default is emitted, never because a doctor confirmed a web value this phone is not using. It
           never withholds the offer. */
        if (CareData.scopeNotReviewed(CareData.Preview.serviceId)) {
            Text(CareData.notClinicallyReviewed, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
        }
        CareFact("When", "Today, ${CareVisitState.clock(care.scheduledFor)}", "${care.service?.duration ?: 0} min")
        CareFact("How far", "%.1f km".format(offer.distanceKm), CareData.distanceBasis)
        CareFact("Lapses", CareVisitState.clock(offer.expiresAtMillis), if (care.minutesLeft == 0) "Now" else "In ${care.minutesLeft} min")
        Note("Where the patient lives is shown to the nurse who accepts, and to nobody else who was asked.")
        NotConnected("booking")
        care.refusal?.takeIf { it.stage == null }?.let { CareRefusalText(it.statement) }
        CareButtons(
            primary = { modifier -> StudioButton(onClick = { care.accept() }, modifier = modifier) { Text("Accept this visit") } },
            secondary = { modifier -> OutlinedButton(onClick = { care.decline() }, shape = ThusoButtonShape, modifier = modifier) { Text("Decline") } }
        )
    }
}

/** The visit, from the road to the doctor's queue to its completion. */
@Composable fun CareVisitScreen(store: PreviewStore, open: (String) -> Unit) {
    val care = store.careVisit
    var code by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(care) { while (true) { delay(TICK_MILLIS); care.tick() } }
    val zoneName = care.visitZone?.name.orEmpty()
    ScreenColumn {
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            CareEyebrow("Visit ${CareData.Preview.appointmentRef} · $zoneName")
            Text(
                "${care.service?.name.orEmpty()}, today at ${CareVisitState.clock(care.scheduledFor)}",
                style = MaterialTheme.typography.titleLarge, color = Charcoal, modifier = Modifier.semantics { heading() }
            )
            NotConnected("booking")
        }
        if (!care.accepted) {
            Note("There is no visit to continue. An offer is accepted from your schedule, and the visit opens here once you have.")
            return@ScreenColumn
        }
        CareRail(care)
        if (care.completed) {
            CareCard {
                CareTitle("The visit is complete")
                CareStrong(CareData.billable)
                Note(care.locationSentence)
            }
            /* Cash is recorded only against a completed visit, so the code is asked for here and nowhere earlier. */
            CashAtTheDoor(store.cashDoor)
            return@ScreenColumn
        }
        when (care.stage) {
            CareStage.ROUTE -> {
                CareCard {
                    CareTitle("On the way to $zoneName")
                    NotConnected("dispatch")
                    care.visitZone?.let { to ->
                        val from = care.nurseBase
                        ArrivalMap(
                            from, to,
                            if (from != null) "Schematic map. You are drawn at the centre of ${from.name} and this visit at the centre of ${to.name}."
                            else "Schematic map. This visit is drawn at the centre of ${to.name}."
                        )
                    }
                    care.offer?.let { CareStrong("%.1f km · ".format(it.distanceKm) + CareData.distanceBasis) }
                    Note(care.locationSentence)
                }
                CareWide { modifier -> StudioButton(onClick = { care.go(CareStage.START) }, modifier = modifier) { Text("I am at the door") } }
            }
            CareStage.START -> CareCodeStage(care, CareStage.START, "Confirm you are at the right door", "Start the visit", code, { code = it }) {
                care.start(code)
                code = ""
            }
            CareStage.CHECKLIST -> {
                CareCard {
                    CareTitle("Checklist")
                    care.protocols.forEach { entry ->
                        Row(
                            Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(entry.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                Note("Version ${entry.version}")
                            }
                            Text(
                                entry.status.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium, color = Charcoal,
                                modifier = Modifier.border(1.dp, StudioLine, RoundedCornerShape(ThusoRadius.pill))
                                    .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4)
                            )
                        }
                    }
                    care.checklistRefusal?.let { CareRefusalText(it, care.checklistWhy) }
                }
                CareWide { modifier -> StudioButton(onClick = { care.go(CareStage.RECORD) }, modifier = modifier) { Text("Continue to readings and sign-off") } }
            }
            CareStage.RECORD -> {
                CareCard {
                    CareTitle("Readings and sign-off")
                    NotConnected("clinical-records")
                    Note(CareData.recordSentence)
                    CareStrong(if (care.signedOff) "Signed off on this phone." else "Not signed off yet.")
                }
                if (!care.signedOff) DeckDestination("Open the visit assessment", "Identity, consent, readings, findings, sign-off", Icons.Outlined.ContentPaste) { open("Care assessment") }
                CareWide { modifier -> StudioButton(onClick = { care.go(CareStage.HANDOVER) }, modifier = modifier) { Text("Continue to handover") } }
            }
            CareStage.HANDOVER -> {
                CareCard {
                    CareTitle("Hand to a doctor")
                    NotConnected("doctor-review")
                    care.refusal?.takeIf { it.stage == CareStage.HANDOVER }?.let { CareRefusalText(it.statement) }
                }
                if (care.refusal?.stage == CareStage.HANDOVER) DeckDestination("Open the visit assessment", "Identity, consent, readings, findings, sign-off", Icons.Outlined.ContentPaste) { open("Care assessment") }
                CareWide { modifier -> StudioButton(onClick = { care.handOver() }, modifier = modifier) { Text("Hand to a doctor") } }
            }
            CareStage.COMPLETE -> CareCodeStage(care, CareStage.COMPLETE, "Complete with the code", "Complete the visit", code, { code = it }) {
                care.complete(code)
                code = ""
            }
        }
    }
}

/* On a completed visit: what the patient owes at the door, from the catalogue, and the nurse entering their cash
   code. The patient's simulated screen shows its code once and forgets it as she enters anything; every refusal
   is the route's sentence from MoneyData, and no amount is typed here. */
@Composable private fun CashAtTheDoor(door: CashCodeDoor) {
    var code by rememberSaveable { mutableStateOf("") }
    CareCard {
        CareTitle(MoneyData.cashNurseHeading)
        door.amountCents?.let { CareStrong("${Money.state(if (door.recorded) "succeeded" else "pending").name} · ${Money.randCents(it)}") }
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(MoneyData.cashNursePatientPhone, style = MaterialTheme.typography.labelLarge, color = Charcoal)
            door.patientCode?.let { Text(it, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = Charcoal) }
            Note(if (door.patientCode != null) MoneyData.cashNurseShownOnce else MoneyData.cashNurseShownAlready)
        }
        if (door.recorded) {
            CareStrong(MoneyData.cashNurseRecorded)
        } else {
            Note(MoneyData.cashNurseAsk)
            CodeBoxes(code, { code = it }, invalid = door.refusal != null, label = MoneyData.cashNurseCodeLabel)
            door.refusal?.let { CareRefusalText(it) }
        }
        NotConnected("payments")
    }
    if (!door.recorded) {
        CareWide { modifier ->
            StudioButton(onClick = { door.enter(code); code = "" }, enabled = code.length == MoneyData.cashCodeLength, modifier = modifier) { Text(MoneyData.cashNurseEnter) }
        }
    }
}

@Composable private fun CareCodeStage(
    care: CareVisitState, stage: CareStage, title: String, button: String,
    code: String, change: (String) -> Unit, run: () -> Unit
) {
    CareCard {
        CareTitle(title)
        if (stage == CareStage.COMPLETE && care.handedOver) {
            /* A queue is only honestly named beside the sentence that says nobody reads it yet. */
            CareStrong(CareData.handoverQueued)
            NotConnected("doctor-review")
        }
        Note("Ask the patient for the six-digit code in the MyThuso app. In this preview the code is ${CareData.Preview.visitCode}.")
        CodeBoxes(code, change, invalid = care.refusal?.stage == stage, label = "Visit code")
        care.refusal?.takeIf { it.stage == stage }?.let { CareRefusalText(it.statement) }
    }
    CareWide { modifier -> StudioButton(onClick = run, enabled = code.length == 6, modifier = modifier) { Text(button) } }
}

/* Six named steps as a column rather than a row of dots: what is behind her filled, where she is
   ringed, and each read out as a step with its state, so nothing is carried by the fill alone. */
@Composable private fun CareRail(care: CareVisitState) {
    val stages = CareStage.values().toList()
    val at = stages.indexOf(care.stage)
    CareCard {
        stages.forEachIndexed { index, stage ->
            val done = care.completed || index < at
            val current = !care.completed && index == at
            val state = if (done) ", done" else if (current) ", current" else ""
            Row(
                Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "Step ${index + 1} of ${stages.size}, ${stage.stageName}$state" },
                horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier.size(28.dp).background(if (done) BrandInk else SurfaceWhite, CircleShape)
                        .border(if (current) 2.dp else 1.dp, if (done || current) BrandInk else StudioLine, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    if (done) Icon(Icons.Outlined.Check, null, tint = SurfaceWhite, modifier = Modifier.size(16.dp))
                    else Text("${index + 1}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
                }
                Text(
                    stage.stageName, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal, color = Charcoal
                )
            }
        }
    }
}

// ---- The parts both screens are made of ----------------------------------------------------------

@Composable private fun CareEyebrow(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = LocalSecondaryText.current)
}

@Composable private fun CareTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
}

@Composable private fun CareStrong(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
}

/* A fact on the offer: a label over a value over what the value is. The value is what a nurse compares,
   so it is the one set heavy. */
@Composable private fun CareFact(label: String, value: String, detail: String) {
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        Note(label)
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
        Note(detail)
    }
}

/* A refusal, beside the control it refused: the sentence in the text ink and the danger colour only on
   the mark in front of it, so the words are readable and the state is not carried by colour alone. */
@Composable private fun CareRefusalText(statement: String, why: String? = null) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top
    ) {
        Icon(Icons.Outlined.Block, null, tint = Danger, modifier = Modifier.size(18.dp))
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            CareStrong(statement)
            why?.let { Note(it) }
        }
    }
}

/** One full-width primary action under a card. */
@Composable private fun CareWide(button: @Composable (Modifier) -> Unit) {
    button(Modifier.fillMaxWidth().heightIn(min = 48.dp))
}

/* Two actions side by side while the words fit, stacked from a 1.3 font scale, where two buttons in one
   row start breaking their labels mid-word. The primary comes first when stacked. */
@Composable private fun CareButtons(primary: @Composable (Modifier) -> Unit, secondary: @Composable (Modifier) -> Unit) {
    if (LocalDensity.current.fontScale >= 1.3f) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            primary(Modifier.fillMaxWidth().heightIn(min = 48.dp))
            secondary(Modifier.fillMaxWidth().heightIn(min = 48.dp))
        }
    } else {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            secondary(Modifier.weight(1f).heightIn(min = 48.dp))
            primary(Modifier.weight(1f).heightIn(min = 48.dp))
        }
    }
}
