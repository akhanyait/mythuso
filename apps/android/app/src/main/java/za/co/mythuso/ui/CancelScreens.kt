package za.co.mythuso.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/* Cancelling a visit, and moving one.
 *
 * Both native apps have promised on the booking confirmation, since long before this file existed,
 * that a visit may be cancelled or rescheduled up to two hours before it — and there was no cancel
 * control anywhere in the patient app. A Cancelled tab sat two screens away holding a sample
 * cancelled visit, so the product showed the outcome of an action it would not let anybody take.
 *
 * What is drawn here is mostly the contract's own words, and the shape of it is the contract's too:
 *
 *   The move is offered first, and offered again to anybody who says the day is the problem. A
 *   person who wanted a different Tuesday and is shown nothing but a cancel button cancels, and
 *   MyThuso loses a visit somebody still wanted.
 *
 *   Nobody is asked to justify themselves. The four reasons are the four reasons; none of them
 *   demands an explanation, "I would rather not say" is one of them, and choosing nothing at all
 *   still cancels the visit — what gets recorded then is that same answer, because a list of reasons
 *   with no way past it is a demand wearing a menu's clothes.
 *
 *   A visit inside the window is still cancelled. That is never refused. The alternative to letting
 *   somebody cancel late is a nurse arriving at a door nobody opens, and the lateness is recorded
 *   rather than punished.
 *
 *   The one cancellation that is refused is one for a visit that has already begun, and the refusal
 *   is about where the event belongs: a booking screen cannot end an encounter happening in
 *   somebody's house. That is a clinical event and it is recorded as one.
 *
 * And what is not here: any sentence about money beyond the one the payments capability supplies.
 * What a late cancellation costs is an open question — section 47 of the Consumer Protection Act 68
 * of 2008 and a commercial decision nobody has taken — recorded in the contract as `pendingDecision`
 * precisely so that no screen quietly acquires a percentage on the way past. The late state is named
 * and recorded; it costs nothing, and nothing here implies that it might.
 */

/** One answer, and the whole row is the control. */
@Composable private fun ChoiceRow(label: String, selected: Boolean, choose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget)
            .selectable(selected = selected, role = Role.RadioButton, onClick = choose),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected, null)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Charcoal, modifier = Modifier.weight(1f))
    }
}

/** The offer to keep the visit and move it, in the contract's words, wherever it is made. */
@Composable private fun RescheduleOffer(move: () -> Unit) {
    TonedCard {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Icon(Icons.Outlined.EventRepeat, null, tint = Charcoal, modifier = Modifier.size(18.dp))
            Text(CancellationData.rescheduleSentence, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        }
        OutlinedButton(
            onClick = move,
            modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
            shape = ThusoButtonShape
        ) { Text("Move this visit instead") }
    }
}

@Composable fun CancelVisitDialog(visit: BookedVisit, store: PreviewStore, close: () -> Unit, move: () -> Unit) {
    /* Worked out once, when the dialog opens, and then kept. The state is a fact about the clock,
       and a person reading three paragraphs about a visit that was two hours away must not have the
       sentence change underneath them at the moment they press the button. */
    val state = remember(visit) { Cancellation.stateOf(visit) }
    var chosen by remember(visit) { mutableStateOf<CancellationReason?>(null) }
    var done by remember(visit) { mutableStateOf(false) }
    val refused = state.refusesCancellation

    AlertDialog(
        onDismissRequest = close,
        containerColor = Color.White,
        shape = RoundedCornerShape(ThusoRadius.card),
        title = {
            Text(
                when {
                    done -> "Cancelled"
                    refused -> state.name
                    else -> "Cancel this visit"
                },
                style = MaterialTheme.typography.titleLarge, color = Charcoal
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                when {
                    /* The refusal, in the contract's words and nobody else's, with somewhere to go
                       that is not this screen. */
                    refused -> {
                        Text(state.patientWords, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                        Note(state.detail)
                    }
                    done -> {
                        /* Verbatim. The late state says it was late and the early state says nothing
                           was charged, and which of those a person reads is arithmetic rather than
                           a choice made here. */
                        Text(state.patientWords, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                        ReviewLine("Reference", visit.reference)
                        ReviewLine("Reason given", (chosen ?: Cancellation.reason("unstated")).text)
                        /* The three things cancelling does not undo. The record is kept, the consent
                           is untouched, and the interpreter is stood down without being charged to
                           the patient — each of which is a promise made somewhere else in this app
                           that cancelling a visit could quietly have broken. */
                        Text("What this does not change", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        CancellationData.doesNotUndo.forEach { limit -> Note(limit.statement) }
                        /* One notice, from the capability, so it disappears from every screen on the
                           day a payment provider is connected rather than being hunted down by hand. */
                        NotConnected(of = CancellationData.moneyCapability)
                    }
                    else -> {
                        ReviewLine("Visit", visit.service.name)
                        ReviewLine("When", visit.whenText)
                        ReviewLine("Reference", visit.reference)
                        Text(state.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Note(state.detail)

                        /* Offered before the reasons, not after them. By the time somebody has
                           chosen why they are cancelling they have cancelled. */
                        RescheduleOffer(move)

                        Text("Why are you cancelling?", style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        CancellationData.reasons.forEach { reason ->
                            ChoiceRow(reason.text, chosen?.id == reason.id) { chosen = reason }
                        }
                        /* The one reason that is really a request for a different day gets the offer
                           again, where the person is looking. */
                        if (chosen?.offersRescheduleFirst == true) RescheduleOffer(move)

                        /* True only while payments are not connected, and gated on that rather than
                           typed as a standing fact, so it leaves at the same moment the capability's
                           own notice does. No charge is stated here because none has been decided. */
                        if (!Capabilities.isConnected(CancellationData.moneyCapability)) {
                            Note(CancellationData.moneyWhileNotConnected)
                        }
                    }
                }
            }
        },
        confirmButton = {
            when {
                refused -> TextButton(onClick = close, shape = ThusoButtonShape) { Text("Close") }
                done -> TextButton(onClick = close, shape = ThusoButtonShape) { Text("Done") }
                else -> TextButton(
                    onClick = {
                        /* Nothing chosen is an answer, and it is recorded as the one the contract
                           already has a word for rather than as a blank. */
                        val reason = chosen ?: Cancellation.reason("unstated")
                        chosen = reason
                        Cancellation.cancel(store, visit, reason, state)
                        done = true
                    },
                    /* Named for the visit it ends. Every row on the list behind this dialog carries
                       a control reading "Cancel this visit" as well, and four identical stops is
                       what a screen reader would otherwise be given. */
                    modifier = Modifier.semantics { contentDescription = "Confirm cancelling the ${visit.service.name} visit" },
                    shape = ThusoButtonShape,
                    colors = ButtonDefaults.textButtonColors(contentColor = Danger)
                ) { Text("Cancel this visit") }
            }
        },
        dismissButton = {
            if (!refused && !done) TextButton(onClick = close, shape = ThusoButtonShape) { Text("Keep this visit") }
        }
    )
}

/**
 * Moving a visit.
 *
 * The picker is the booking screen's own — `VisitTimePicker` in CareScreens.kt — rather than a
 * second one built here, because two pickers is two sets of offered days and one of them will
 * eventually be wrong about which days exist.
 *
 * Everything above the picker is the part that does not change. A moved visit keeps its reference,
 * the person it is for, the address and the service, so it is the same visit and not a new one —
 * which is what leaves the interpreter held for it, the consent given for it and the record of it
 * still applying afterwards.
 */
@Composable fun RescheduleVisitDialog(visit: BookedVisit, store: PreviewStore, close: () -> Unit) {
    /* A visit that has begun is not moved either, and for the same reason it is not cancelled from
       here: what happens to an encounter under way in somebody's house is a clinical event, and it
       is settled with the nurse who is in the room rather than on a booking screen. The refusal is
       shown rather than the control hidden — an option that is simply absent explains nothing to the
       person looking for it. */
    val state = remember(visit) { Cancellation.stateOf(visit) }
    if (state.refusesCancellation) {
        AlertDialog(
            onDismissRequest = close,
            containerColor = Color.White,
            shape = RoundedCornerShape(ThusoRadius.card),
            title = { Text(state.name, style = MaterialTheme.typography.titleLarge, color = Charcoal) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    Text(state.patientWords, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                    Note(state.detail)
                }
            },
            confirmButton = { TextButton(onClick = close, shape = ThusoButtonShape) { Text("Close") } }
        )
        return
    }
    val days = remember { Scheduling.offeredDays() }
    val slots = SchedulingData.slots
    var day by remember(visit) { mutableIntStateOf(0) }
    /* Opens on the hour the visit already has, where that hour is still one of the offered ones.
       Landing on 08:00 for a visit booked at three in the afternoon invites somebody to move a visit
       they only meant to look at. */
    var slot by remember(visit) { mutableStateOf(visit.start?.takeIf { it in slots } ?: slots.first()) }
    var moved by remember(visit) { mutableStateOf<BookedVisit?>(null) }
    val chosen = days.getOrElse(day) { days.first() }
    val endTime = Scheduling.endTime(slot, visit.service.duration)

    AlertDialog(
        onDismissRequest = close,
        containerColor = Color.White,
        shape = RoundedCornerShape(ThusoRadius.card),
        title = {
            Text(if (moved == null) "Move this visit" else "This visit has moved",
                 style = MaterialTheme.typography.titleLarge, color = Charcoal)
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                val current = moved ?: visit
                ReviewLine("Reference", current.reference)
                ReviewLine("Visit", current.service.name)
                ReviewLine("Patient", current.person)
                ReviewLine("Location", current.address)
                val after = moved
                if (after == null) {
                    Note(CancellationData.rescheduleKeepsTheSameVisit)
                    VisitTimePicker(
                        days, day, { day = it }, slots, slot, { slot = it },
                        "${Scheduling.longDate(chosen.date)} · $slot – $endTime (${visit.service.duration} minutes)"
                    )
                } else {
                    ReviewLine("Now", after.whenText)
                    Note(CancellationData.rescheduleKeepsTheSameVisit)
                    NotConnected(of = "booking")
                }
            }
        },
        confirmButton = {
            if (moved == null) TextButton(
                onClick = { moved = Cancellation.reschedule(store, visit, chosen.date, slot) },
                modifier = Modifier.semantics { contentDescription = "Move this visit to ${Scheduling.longDate(chosen.date)} at $slot" },
                shape = ThusoButtonShape
            ) { Text("Move the visit") }
            else TextButton(onClick = close, shape = ThusoButtonShape) { Text("Done") }
        },
        dismissButton = {
            if (moved == null) TextButton(onClick = close, shape = ThusoButtonShape) { Text("Leave it where it is") }
        }
    )
}
