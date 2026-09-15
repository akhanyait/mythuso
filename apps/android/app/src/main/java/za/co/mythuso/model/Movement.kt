package za.co.mythuso.model

/* Thuso Ride's responder app on Android: a trip offered to this responder, accepted or declined, the emergency
 * summary open only while the trip is under way, and a hand-over by role with the checklist.
 *
 * The arithmetic is packages/engines/src/movement/domain/trips.ts's, asked in the same order, and every sentence is
 * MovementData's, generated from packages/catalog/movement.json and packages/catalog/apis/movement.json. A refusal
 * is shown in the route's own words, so a phone and the engine cannot disagree about why a hand-over was refused.
 *
 * WHAT IS NOT HERE. No position is read from this phone and no heartbeat is sent: the preview has no service to
 * send one to, and the interval on the screen is the generated default. No admission, pending or otherwise, is on
 * a phone at all. And nothing here can make a P1 a trip, because MovementData's priorities never let Thuso Ride
 * take one and the preview trip is the contract's own. */

data class MovementPriority(val id: String, val label: String, val takenByThusoRide: Boolean, val sentence: String)
data class MovementChoice(val id: String, val label: String)
data class MovementPreviewTrip(val ref: String, val priorityClass: String, val zoneId: String, val pickupInMinutes: Int, val facilityRef: String, val responderRef: String)

/** One trip as this responder's phone holds it. State ids are the contract's: requested, accepted, handed-over. */
data class ResponderTrip(
    val ref: String,
    val priorityClass: String,
    val zoneId: String,
    val facilityRef: String,
    val pickupAtMillis: Long,
    val stateId: String,
    val offeredToMe: Boolean,
    val declined: Boolean,
    val acceptedAtMillis: Long? = null,
    val handedOverAtMillis: Long? = null,
    val receivingRoleId: String? = null
)

sealed class ResponderAnswer {
    data class Done(val trip: ResponderTrip) : ResponderAnswer()
    data class Refused(val sentence: String) : ResponderAnswer()
}

object Movement {
    private const val MINUTE = 60_000L

    fun label(list: List<MovementChoice>, id: String?): String = list.firstOrNull { it.id == id }?.label ?: (id ?: "")
    fun priority(id: String): MovementPriority? = MovementData.priorities.firstOrNull { it.id == id }

    /** The contract's preview trip, offered to this phone's responder, picking up from now plus its offset. */
    fun previewTrip(nowMillis: Long): ResponderTrip = MovementData.previewTrip.let {
        ResponderTrip(it.ref, it.priorityClass, it.zoneId, it.facilityRef, nowMillis + it.pickupInMinutes * MINUTE, "requested", offeredToMe = true, declined = false)
    }

    /* The engine's order: a closed trip first, then whether it was offered to this responder, and a P2 taken without
       an offer is a responder assigning themselves a same-day priority. */
    fun accept(trip: ResponderTrip, nowMillis: Long): ResponderAnswer = when {
        trip.stateId == "handed-over" -> ResponderAnswer.Refused(MovementData.Refusals.TRIP_CLOSED)
        trip.stateId == "accepted" -> ResponderAnswer.Done(trip)
        !trip.offeredToMe || trip.declined -> ResponderAnswer.Refused(if (trip.priorityClass == "P2") MovementData.Refusals.SELF_ASSIGNED_P2 else MovementData.Refusals.TRIP_NOT_OFFERED)
        else -> ResponderAnswer.Done(trip.copy(stateId = "accepted", acceptedAtMillis = nowMillis))
    }

    fun decline(trip: ResponderTrip): ResponderAnswer =
        if (!trip.offeredToMe || trip.declined || trip.stateId != "requested") ResponderAnswer.Refused(MovementData.Refusals.TRIP_NOT_OFFERED)
        else ResponderAnswer.Done(trip.copy(declined = true))

    fun handOver(trip: ResponderTrip, receivingRoleId: String?, checklistComplete: Boolean, nowMillis: Long): ResponderAnswer = when {
        trip.stateId == "requested" -> ResponderAnswer.Refused(MovementData.Refusals.TRIP_NOT_YOURS)
        trip.stateId == "handed-over" -> ResponderAnswer.Refused(MovementData.Refusals.TRIP_CLOSED)
        MovementData.receivingRoles.none { it.id == receivingRoleId } -> ResponderAnswer.Refused(MovementData.Refusals.UNNAMED_RECEIVER)
        !checklistComplete -> ResponderAnswer.Refused(MovementData.Refusals.CHECKLIST_NOT_FOLLOWED)
        else -> ResponderAnswer.Done(trip.copy(stateId = "handed-over", handedOverAtMillis = nowMillis, receivingRoleId = receivingRoleId))
    }

    /** The emergency summary opens only while this responder's trip is under way: accepted, and not yet handed over. */
    fun summaryOpen(trip: ResponderTrip): Boolean = trip.stateId == "accepted"

    /** The heartbeat interval in words, from the generated default and never typed. */
    fun intervalText(seconds: Int = MovementData.HEARTBEAT_INTERVAL_SECONDS): String =
        if (seconds % 60 == 0) "${seconds / 60} ${if (seconds == 60) "minute" else "minutes"}" else "$seconds seconds"

    fun fill(sentence: String, values: Map<String, String>): String =
        Regex("\\{(\\w+)\\}").replace(sentence) { match -> values[match.groupValues[1]] ?: match.value }
}
