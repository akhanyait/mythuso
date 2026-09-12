package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.CheckBoxOutlineBlank
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.model.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role

/* Thuso SOS — the emergency pathway.

   Every other screen in this app is wrong in ways that cost somebody time or money. This one is
   wrong in ways that cost somebody their life, so the ordering of the page is the first refusal and
   everything else follows it:

     MyThuso is not an ambulance service. EmergencyFirst() is the first thing the screen composes,
     above anything MyThuso sells, and no answer to any question moves it. A screen that offered its
     own service first and the ambulance underneath would be asking a frightened person to compare
     the two, and some of them would choose wrong.

     Software does not triage. Three questions, and one tick on the first ends them — no follow-up,
     no severity, no score. Sos.route in model/Sos.kt does the routing and has no arithmetic in it.

     A target is not a promise. sosTargetMinutes is the duration of the `sos` row in the service
     catalogue, generated rather than typed, and it is never rendered as an arrival estimate.
     Arrival estimates come from Geo.kt, which returns an Eta with null minutes and a reason rather
     than a plausible number.

     Urgency does not relax vetting. Every nurse offered here goes through can(subject,
     "take-visit") — the same call the dispatch board makes — and the rota chips put a nurse whose
     clearance lapsed on the only shift, so the refusal is visible rather than described.

   Nothing dials. There is no telephony in this file, no location permission is requested, nothing
   is dispatched, and no ambulance partner exists. The numbers are printed so a person can dial them
   from their own phone. */

/** A nurse on the SOS rota. A null position is a real state — a phone in a bag — and the estimate
 *  says so rather than producing a number from nowhere. */
private data class SosOnCall(val id: String, val at: LatLng?)

private data class SosRota(val id: String, val label: String, val note: String, val nurses: List<SosOnCall>)

/* Fictional, and deliberately blunt — three decimal places, about a hundred metres. The suburbs are
   real; nobody lives at these points, and a preview has no business being precise about where a
   frightened person is standing. */
private val sosAreaPoints = mapOf(
    "Randburg" to LatLng(-26.099, 28.004),
    "Rosebank" to LatLng(-26.146, 28.042),
    "Parktown" to LatLng(-26.184, 28.040),
    "Melville" to LatLng(-26.175, 27.999),
    "Soweto" to LatLng(-26.249, 27.908)
)
private const val SOS_ELSEWHERE = "Somewhere else in South Africa"

/* Two rotas, so the vetting refusal is a thing you can see rather than a paragraph. */
private val sosRotas = listOf(
    SosRota(
        "usual", "The usual rota",
        "Two nurses on call. One phone is not sharing a position, which is what a phone in a bag looks like.",
        listOf(SosOnCall("N-205", LatLng(-26.150, 28.046)), SosOnCall("N-207", null))
    ),
    SosRota(
        "lapsed", "Only Sister Ayanda Dube is on tonight",
        "Her police clearance lapsed nine days ago. This is the rota that tests whether urgency is allowed to lift a check.",
        listOf(SosOnCall("N-204", LatLng(-26.240, 27.916)))
    )
)

/* No routing provider is connected, so every road route comes back unavailable — which is also what
   a real provider returns when it is down. Geo.kt refuses to manufacture a duration from that, and
   the straight line has to be asked for by name, here, and labelled where the reader can see it. On
   this screen that rule matters more than anywhere else: a made-up arrival time is what keeps
   somebody at a window instead of on the phone to 10177. */
private fun sosEta(nurse: SosOnCall, to: LatLng?): Eta {
    val measured = etaFromRoute(routeUnavailable("No routing provider is connected in this preview."))
    if (measured.minutes != null) return measured
    if (to == null) return noEta("No address has been chosen yet, so there is nothing to measure to.")
    if (nurse.at == null) return noEta("This nurse’s phone is not sharing a position, so there is nothing to measure from.")
    return straightLineEta(nurse.at, to, sourceLabel = "sos:${nurse.id}")
}

/** "Estimating" is a word rather than a dash: an empty cell reads as nothing to a screen reader and
 *  a dash reads as one. The target never stands in for a missing estimate. */
private fun arrivalLine(eta: Eta) = if (eta.minutes == null) "Arrival estimating" else "About ${eta.minutes} min away"
private fun basisLine(eta: Eta) = when (eta.basis) {
    EtaBasis.STRAIGHT_LINE -> "Straight line over ${"%.1f".format(eta.distanceKm ?: 0.0)} km at ${eta.speedKmh?.toInt()} km/h — not a road route, and not a promise."
    EtaBasis.ROUTE -> "Measured road route."
    EtaBasis.LAST_KNOWN_ROUTE -> "Last measured road route."
    EtaBasis.NONE -> eta.reason ?: "Nothing to estimate from."
}

@Composable fun SosScreen(store: PreviewStore) {
    var flagged by remember { mutableStateOf(setOf<String>()) }
    var none by remember { mutableStateOf(false) }
    var area by remember { mutableStateOf<String?>(null) }
    var canAnswer by remember { mutableStateOf<Boolean?>(null) }
    var rotaId by remember { mutableStateOf("usual") }
    var openNow by remember { mutableStateOf(true) }
    var requested by remember { mutableStateOf(false) }
    var stoodDown by remember { mutableStateOf<String?>(null) }
    var unanswered by remember { mutableStateOf(false) }

    val rota = sosRotas.first { it.id == rotaId }
    val to = area?.let { sosAreaPoints[it] }
    /* Vetting is asked before a name is offered, not after. A nurse whose clearance lapsed still
       appears — hiding her would leave a reader wondering where she went — and cannot be sent. */
    val candidates = rota.nurses.mapNotNull { onCall ->
        store.vetting.subject(onCall.id)?.let { Triple(it, can(it, "take-visit"), sosEta(onCall, to)) }
    }.sortedWith(compareByDescending<Triple<VettingSubject, VettingDecision, Eta>> { it.second.allowed }
        .thenBy { it.third.minutes ?: Int.MAX_VALUE })
    val cleared = candidates.any { it.second.allowed }
    val answered = none || flagged.isNotEmpty()
    val door = if (answered) Sos.route(SosAnswers(flagged, area, canAnswer), openNow, cleared) else null

    ScreenColumn {
        DemoBadge()
        Heading("Thuso SOS", "Urgent care", "Nothing on this screen dials anybody.")

        /* First, above everything MyThuso sells, and it does not move. */
        EmergencyFirst()
        /* Under it and never over it. On this one pathway the ambulance number outranks anything
           MyThuso has to say about itself — including the sentence saying the acknowledgement behind
           this screen is simulated. The web has always rendered it here; this app said nothing at
           all, which is the silence `a-simulation-says-so` is written against. */
        NotConnected("emergency")
        Note(sosEmergency.whyFirst)

        Text("If it is not that, three questions", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        Note(sosRouting.noAlgorithm)
        CareCard {
            Text(sosRedFlags.prompt, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Note(sosRedFlags.help)
            sosRedFlags.conditions.forEach { condition ->
                val ticked = condition.id in flagged
                Row(
                    /* A row drawn as a checkbox has to be one to a screen reader as well. `clickable` announces
                       "double tap to activate" and never says whether the box is ticked, which on this
                       screen is the difference between "chest pain" and "not chest pain". `toggleable`
                       with Role.Checkbox announces the state and the change; the 48dp floor is what a
                       finger needs when the person holding the phone is frightened. */
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                        value = ticked, role = Role.Checkbox,
                        onValueChange = {
                            none = false; requested = false; stoodDown = null; unanswered = false
                            flagged = if (ticked) flagged - condition.id else flagged + condition.id
                        }
                    ).padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top
                ) {
                    Icon(if (ticked) Icons.Outlined.CheckBox else Icons.Outlined.CheckBoxOutlineBlank, null,
                        tint = if (ticked) Danger else StudioInkMuted)
                    Column {
                        Text(condition.name, style = MaterialTheme.typography.bodyLarge, color = Charcoal)
                        Text(condition.detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                    value = none, role = Role.Checkbox,
                    onValueChange = {
                        requested = false; stoodDown = null; unanswered = false
                        none = it; flagged = emptySet()
                    }
                ).padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(if (none) Icons.Outlined.CheckBox else Icons.Outlined.CheckBoxOutlineBlank, null,
                    tint = if (none) Indigo else StudioInkMuted)
                Text(sosRedFlags.noneLabel, style = MaterialTheme.typography.bodyLarge, color = Charcoal)
            }
            Text(sosRouting.isNotTriage, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        }

        if (flagged.isNotEmpty()) {
            val outcome = Sos.outcome("emergency-services")
            Column(
                Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.card)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(outcome.headline, style = MaterialTheme.typography.titleLarge, color = Danger)
                Text(outcome.detail, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                flagged.sorted().forEach { id ->
                    Sos.condition(id)?.let { Text("• ${it.name}", style = MaterialTheme.typography.titleSmall, color = Charcoal) }
                }
                Text(sosRedFlags.endsTheQuestions, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                DialLine()
                Text(sosEmergency.previewNote, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            }
        }

        if (none) {
            CareCard {
                Text(sosRouting.questions[1].prompt, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                FlowRowChips(sosCoverage.areas + SOS_ELSEWHERE, setOfNotNull(area)) { picked ->
                    area = picked; requested = false
                }
                Note(sosRouting.questions[1].help)
                Text(sosRouting.questions[2].prompt, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                FlowRowChips(listOf("Yes", "No"), setOfNotNull(canAnswer?.let { if (it) "Yes" else "No" })) { picked ->
                    canAnswer = picked == "Yes"; requested = false
                }
                Note(sosRouting.questions[2].help)
            }
            FlowRowChips(sosRotas.map { it.label }, setOf(rota.label)) { label ->
                rotaId = sosRotas.first { it.label == label }.id; requested = false; stoodDown = null
            }
            Note(rota.note)
            FlowRowChips(listOf("Now · inside the hours", "02:10 · outside the hours"),
                setOf(if (openNow) "Now · inside the hours" else "02:10 · outside the hours")) { picked ->
                openNow = picked.startsWith("Now"); requested = false
            }
            Note("Thuso SOS runs ${sosCoverage.hours.days.lowercase()} from ${sosCoverage.hours.opensAt} to ${sosCoverage.hours.closesAt}. ${sosCoverage.hours.note}")
        }

        if (door is SosDoor.Refused) {
            val outcome = Sos.outcome("cannot-help")
            val failure = Sos.failure(door.failureId)
            Column(
                Modifier.fillMaxWidth().background(MangoSoft, RoundedCornerShape(ThusoRadius.card)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(outcome.headline, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(outcome.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Text(failure.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text(failure.what, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Text(failure.instead, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                if (door.failureId == "vetting") {
                    candidates.filter { !it.second.allowed }.forEach {
                        Text("${it.first.name}: ${it.second.reason.orEmpty()}",
                            style = MaterialTheme.typography.bodySmall, color = Danger)
                    }
                }
                DialLine()
            }
        }

        if (door == SosDoor.UrgentVisit) {
            val outcome = Sos.outcome("urgent-visit")
            CareCard {
                Text(outcome.headline, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(outcome.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                ReviewLine("Thuso SOS urgent visit", "R $sosVisitPrice")
                ReviewLine("Of that, to the nurse", "R $sosVisitNurseShare")
                ReviewLine("Where", area.orEmpty())
            }
            CareCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Text(sosTarget.title, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.weight(1f))
                    StatusPill(Sos.targetLabel, "amber")
                }
                Text(sosTarget.statement, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Text(sosTarget.whenItCannotBeMet, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Note(sosTarget.estimateIsNotTheTarget)
            }
            Text("Who could come", style = MaterialTheme.typography.titleLarge, color = Charcoal)
            CareCard {
                candidates.forEach { (subject, decision, eta) ->
                    Column(Modifier.padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                            Text(subject.name, style = MaterialTheme.typography.titleSmall, color = Charcoal, modifier = Modifier.weight(1f))
                            StatusPill(if (decision.allowed) "Cleared" else "Refused", if (decision.allowed) "teal" else "danger")
                        }
                        Text("${subject.zone.orEmpty()} · ${subject.reference} · ${arrivalLine(eta)}",
                            style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                        Text(basisLine(eta), style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                        if (!decision.allowed) {
                            Text(decision.reason.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Danger)
                        } else {
                            OutlinedButton({ requested = true }, enabled = !requested, shape = ThusoButtonShape) {
                                Text(if (requested) "Asked" else "Ask her to come")
                            }
                        }
                    }
                }
                Note(sosTarget.arrivalUnknown)
                Text(Sos.rule("urgency-does-not-relax-vetting").sentence,
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }

        if (requested) {
            Text(sosStandDown.title, style = MaterialTheme.typography.titleLarge, color = Charcoal)
            CareCard {
                Text(sosStandDown.statement, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Note(sosStandDown.chargeRule)
                val chosen = stoodDown?.let { id -> sosStandDown.reasons.firstOrNull { it.id == id } }
                if (chosen == null) {
                    sosStandDown.reasons.forEach { reason ->
                        OutlinedButton({ stoodDown = reason.id }, shape = ThusoButtonShape) { Text(reason.label) }
                    }
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .toggleable(value = unanswered, role = Role.Checkbox, onValueChange = { unanswered = it })
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(if (unanswered) Icons.Outlined.CheckBox else Icons.Outlined.CheckBoxOutlineBlank, null,
                            tint = if (unanswered) MangoInk else StudioInkMuted)
                        Text("Preview: nobody answers the callback", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                    }
                    if (unanswered) {
                        Text(sosStandDown.noAnswerRule, style = MaterialTheme.typography.bodyMedium, color = Charcoal,
                            modifier = Modifier.fillMaxWidth().background(MangoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp))
                    }
                } else {
                    Text("Stood down · ${chosen.label}", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text(sosStandDown.nurseNote, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                    ReviewLine("What the nurse is told", chosen.nurseIsTold)
                    ReviewLine("What is recorded", chosen.recorded)
                    OutlinedButton({ stoodDown = null }, shape = ThusoButtonShape) { Text("Back") }
                }
            }
        }

        Text("When this does not work", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        Note("Four ways a button like this fails and one way vetting stops it. Each says what to do instead, because a failure screen without one is a dead end wearing an apology.")
        sosFailures.forEach { failure ->
            CareCard {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.WarningAmber, null, tint = MangoInk)
                    Text(failure.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                }
                Text(failure.what, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                Text(failure.instead, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }

        Text("Where and when", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Text(sosCoverage.statement, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            Text(sosCoverage.areas.joinToString(" · "), style = MaterialTheme.typography.titleSmall, color = Charcoal)
            ReviewLine("Hours", "${sosCoverage.hours.days}, ${sosCoverage.hours.opensAt}–${sosCoverage.hours.closesAt}")
            Note(sosCoverage.hours.note)
            Note(sosCoverage.honestNote)
        }

        Text("${sosAlert.name} · the panic button", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Text("${sosAlert.name} · R $sosAlertMonthly a month", style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(sosAlert.what, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            Note(sosAlert.phaseNote)
            sosAlert.honesty.forEach {
                Text(it.sentence, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            }
            Text(sosAlert.notCover, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        }

        Text(sosRecord.title, style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Text(sosRecord.statement, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            sosRecord.kept.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
            HorizontalDivider(color = StudioLine)
            sosRecord.notKept.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted) }
        }

        Text("The promises this screen makes", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        sosRules.forEach { rule ->
            CareCard {
                Text(rule.title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text(rule.sentence, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
            }
        }

        Text("What this screen will not do", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        sosRefusals.forEach { refusal ->
            CareCard {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.Block, null, tint = Danger)
                    Text(refusal.sentence, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                }
            }
        }
        Note("Nothing here is transmitted, dispatched or dialled. No ambulance partner is contracted, no nurse is paged, no location is read from this device and Thuso Alert does not exist.")
    }
}

/** Always the first thing on the page, and never conditional on anything. */
@Composable private fun EmergencyFirst() {
    Column(
        Modifier.fillMaxWidth()
            .background(DangerSoft, RoundedCornerShape(ThusoRadius.card))
            .border(2.dp, Danger, RoundedCornerShape(ThusoRadius.card))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.LocalHospital, null, tint = Danger)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(sosEmergency.headline, style = MaterialTheme.typography.titleLarge, color = Danger)
                Text(sosEmergency.lead, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
        }
        sosEmergency.numbers.forEach { number ->
            Row(
                Modifier.fillMaxWidth().background(SurfaceWhite, RoundedCornerShape(ThusoRadius.card)).padding(12.dp)
                    .semantics { contentDescription = "${number.name}. ${number.number}. ${number.whenToUse}" },
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top
            ) {
                Text(number.number, style = MaterialTheme.typography.titleLarge, color = Danger)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(number.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                    Text(number.detail, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    Text(number.whenToUse, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                }
            }
        }
        Text(sosEmergency.notAnAmbulance, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        Text(sosEmergency.previewNote, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
    }
}

/** The ambulance number again, wherever a door has just been chosen. Repetition is the point. */
@Composable private fun DialLine() {
    Row(
        Modifier.fillMaxWidth().background(SurfaceWhite, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Outlined.Phone, null, tint = Danger)
        Text(sosEmergency.numbers[0].number, style = MaterialTheme.typography.titleLarge, color = Danger)
        Text("Ambulance · or ${sosEmergency.numbers[1].number} from a mobile",
            style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
    }
}
