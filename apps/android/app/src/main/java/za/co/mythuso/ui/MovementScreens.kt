package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import za.co.mythuso.model.*

/* Thuso Ride's responder app on Android: the trip offered to this responder, accept or decline, the emergency summary
 * while the trip is under way and never outside it, and the hand-over at the destination by role with the checklist.
 *
 * WHAT LEADS. A responder opens this to know where to go and whether they can go, so the offer and its two buttons
 * lead; the summary sits under it and says, in the contract's words, when it opens and when it closed; the hand-over
 * appears only once there is a trip to hand over.
 *
 * WHAT IT NEVER SAYS. That Thuso Ride is an ambulance: the contract's sentence that it is not sits above the offer.
 * Every sentence is MovementData.kt's, every refusal the route's own, and the interval is the generated default. */

private val stamp = SimpleDateFormat("EEE d MMM HH:mm", Locale("en", "ZA"))
private fun whenOf(millis: Long): String = stamp.format(Date(millis))

/* One checklist line: the whole row is the target, at least the touch target tall, and read as a checkbox. */
@Composable private fun ChecklistLine(label: String, checked: Boolean, change: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).toggleable(value = checked, role = Role.Checkbox, onValueChange = change),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

@Composable fun ResponderScreen() {
    val text = MovementData.ResponderText
    var trip by remember { mutableStateOf(Movement.previewTrip(System.currentTimeMillis())) }
    var receivingRole by remember { mutableStateOf<String?>(null) }
    var ticked by remember { mutableStateOf(setOf<String>()) }
    var refusal by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    fun answer(result: ResponderAnswer, said: String? = null) {
        when (result) {
            is ResponderAnswer.Done -> { trip = result.trip; refusal = null; status = said }
            is ResponderAnswer.Refused -> { refusal = result.sentence; status = null }
        }
    }
    val stateTone = when (trip.stateId) { "handed-over" -> "quiet"; "accepted" -> "teal"; else -> "amber" }

    ScreenColumn {
        DemoBadge()
        NotConnected("dispatch")
        Heading("Thuso Ride", text.HEADING, text.INTRO)
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.Info, contentDescription = null, tint = Charcoal)
            Text(MovementData.NOT_AN_AMBULANCE, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        }

        CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                TileIcon(Icons.Outlined.DirectionsCar)
                Text(trip.ref, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.weight(1f))
                StatusPill(Movement.priority(trip.priorityClass)?.label ?: trip.priorityClass, "quiet")
            }
            StatusPill(Movement.label(MovementData.tripStates, trip.stateId), stateTone)
            Text(Movement.fill(text.PICKUP, mapOf("zone" to Movement.label(MovementData.zones, trip.zoneId), "when" to whenOf(trip.pickupAtMillis))),
                style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            Text(Movement.fill(text.DESTINATION, mapOf("facility" to Movement.label(MovementData.facilities, trip.facilityRef))),
                style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            if (trip.stateId == "requested" && !trip.declined) {
                Note(text.OFFERED)
                Button(
                    onClick = { answer(Movement.accept(trip, System.currentTimeMillis())) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
                ) { Text(text.ACCEPT) }
                OutlinedButton(
                    onClick = { answer(Movement.decline(trip), text.DECLINED) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
                ) { Text(text.DECLINE) }
            } else if (trip.declined) {
                Note(text.DECLINED)
            }
        }

        CareCard {
            Text(text.SUMMARY_HEADING, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(
                when {
                    Movement.summaryOpen(trip) -> Movement.fill(text.SUMMARY_OPEN, mapOf("categories" to PassportSharingData.emergencySummaryNames.joinToString(", ")))
                    trip.stateId == "handed-over" -> text.SUMMARY_CLOSED
                    else -> text.SUMMARY_NOT_YET
                },
                style = MaterialTheme.typography.bodyMedium, color = Charcoal,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        }

        if (trip.stateId == "accepted") CareCard {
            Text(text.HANDOVER_HEADING, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(text.RECEIVING_ROLE, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
            MovementData.receivingRoles.forEach { role ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                        .selectable(selected = receivingRole == role.id, role = Role.RadioButton) { receivingRole = role.id; refusal = null },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
                ) {
                    RadioButton(selected = receivingRole == role.id, onClick = null)
                    Text(role.label, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                }
            }
            HorizontalDivider(color = StudioLine)
            Text(text.CHECKLIST_HEADING, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Charcoal)
            MovementData.checklist.forEach { line ->
                ChecklistLine(line, line in ticked) { on -> ticked = if (on) ticked + line else ticked - line; refusal = null }
            }
            Button(
                onClick = {
                    val result = Movement.handOver(trip, receivingRole, ticked.size == MovementData.checklist.size, System.currentTimeMillis())
                    val at = (result as? ResponderAnswer.Done)?.trip?.handedOverAtMillis
                    answer(result, at?.let { Movement.fill(text.HANDED_OVER, mapOf("when" to whenOf(it))) })
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text(text.HANDOVER) }
        }

        refusal?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = Danger,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
        }
        status?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Charcoal, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        Note(Movement.fill(text.HEARTBEAT, mapOf("interval" to Movement.intervalText())))
        Note(MovementData.PREVIEW)
    }
}
