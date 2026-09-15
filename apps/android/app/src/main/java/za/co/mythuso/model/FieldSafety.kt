package za.co.mythuso.model

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/* The nurse safety suite on Android, and why it is two files.
 *
 * FieldSafetyData.kt is written by scripts/emit-field-safety.mjs from packages/catalog/field-safety.json:
 * the grace, the extension steps and ceiling, the panic window, every sentence and every refusal. This
 * file is the arithmetic of packages/engines/src/safety/domain, hand-written because a native app cannot
 * run the engine, and it asks the questions the engine asks in the same order, so a refusal on this phone
 * is the refusal the web and the engine would give. Pure functions over immutable values: the store that
 * holds them lives with the screens, in ui/FieldSafetyScreens.kt, and keeps them in memory only.
 */
data class FieldSafetyChoice(val id: String, val label: String, val flag: Boolean)
data class FieldSafetyRefusal(val id: String, val status: Int, val statement: String)

data class SafetyExtension(val at: Long, val minutes: Int, val reasonId: String)
/** An overdue is an episode: when the deadline passed, who at the desk picked it up, when the nurse answered, and why it was closed. */
data class SafetyEpisode(val since: Long, val acknowledgedAt: Long? = null, val answeredAt: Long? = null, val silencedReasonId: String? = null)

data class VisitTimer(
    val checkinRef: String, val appointmentRef: String, val serviceId: String, val nurseId: String,
    val startedAt: Long, val dueAt: Long,
    val extensions: List<SafetyExtension> = emptyList(), val checkIns: List<Long> = emptyList(),
    val overdue: SafetyEpisode? = null, val announcedFor: Long? = null,
    val closedAt: Long? = null, val closedBySigning: Boolean = false
) {
    val extensionUsed: Int get() = extensions.sumOf { it.minutes }
    val extensionLeft: Int get() = FieldSafetyData.maxExtensionMinutes - extensionUsed
    val stepsOffered: List<Int> get() = FieldSafetyData.extensionSteps.filter { it <= extensionLeft }
    fun standing(now: Long): String = if (closedAt != null) "closed" else if (now >= dueAt) "overdue" else "running"
    fun minutesLeft(now: Long): Int = maxOf(0L, (dueAt - now + FieldSafety.MINUTE - 1) / FieldSafety.MINUTE).toInt()
}

data class SafetyPosition(val lat: Double, val lng: Double, val at: Long)

data class SafetyPanic(
    val panicRef: String, val nurseId: String, val appointmentRef: String?, val raisedAt: Long, val shareEndsAt: Long,
    val acknowledgedAt: Long? = null, val resolvedAt: Long? = null, val outcomeId: String? = null,
    /** The latest position, while sharing. Never a list. */
    val position: SafetyPosition? = null
) {
    /** Whichever comes first: the window running out, or the desk resolving the panic. */
    val sharingEndsAt: Long get() = resolvedAt?.let { minOf(shareEndsAt, it) } ?: shareEndsAt
    fun isSharing(now: Long): Boolean = now < sharingEndsAt
    val standing: String get() = if (resolvedAt != null) "resolved" else if (acknowledgedAt != null) "acknowledged" else "raised"
}

/** A row on the desk: a nurse and a suburb, never the service, the person visited or the address. */
data class SafetyDeskRow(
    val reference: String, val isPanic: Boolean, val nurse: String, val suburb: String, val raisedAt: Long, val ageMinutes: Int,
    val acknowledgedAt: Long?, val answeredAt: Long?, val outcome: String?, val sharingEndsAt: Long?, val sharing: Boolean, val open: Boolean
) {
    val rank: Int get() = if (!open) 3 else if (acknowledgedAt != null) 2 else if (isPanic) 0 else 1
}

sealed interface SafetyResult<out T> {
    data class Done<T>(val value: T) : SafetyResult<T>
    data class Refused(val refusal: FieldSafetyRefusal) : SafetyResult<Nothing>
}

object FieldSafety {
    const val MINUTE = 60_000L
    fun minutesToMillis(count: Int): Long = count * MINUTE
    fun refusal(id: String): FieldSafetyRefusal = FieldSafetyData.refusals.firstOrNull { it.id == id } ?: FieldSafetyRefusal(id, 500, id)
    fun fill(sentence: String, values: Map<String, String>): String =
        values.entries.fold(sentence) { text, entry -> text.replace("{" + entry.key + "}", entry.value) }
    fun label(list: List<FieldSafetyChoice>, id: String): String = list.firstOrNull { it.id == id }?.label ?: id
    /* South African time whatever the phone is set to, as the engine does. */
    private val clockFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Africa/Johannesburg"))
    fun clock(at: Long): String = clockFormat.format(Instant.ofEpochMilli(at))
    fun serviceMinutes(id: String): Int? = services.firstOrNull { it.id == id }?.duration
    private fun refuse(id: String): SafetyResult.Refused = SafetyResult.Refused(refusal(id))

    fun makeTimer(checkinRef: String, appointmentRef: String, serviceId: String, nurseId: String, at: Long): VisitTimer? {
        val booked = serviceMinutes(serviceId) ?: return null
        return VisitTimer(checkinRef, appointmentRef, serviceId, nurseId, at, at + minutesToMillis(booked + FieldSafetyData.graceMinutes))
    }

    /** The deadline passing opens an episode once for that deadline, and only for an open timer. */
    fun tick(timer: VisitTimer, now: Long): VisitTimer =
        if (timer.closedAt == null && now >= timer.dueAt && timer.announcedFor != timer.dueAt)
            timer.copy(announcedFor = timer.dueAt, overdue = SafetyEpisode(timer.dueAt))
        else timer

    /* A nurse answering an open episode marks it answered. It does not close it: only the desk does, with
       a reason, because the desk was the one told. */
    private fun answered(timer: VisitTimer, at: Long): SafetyEpisode? {
        val episode = timer.overdue ?: return null
        return if (episode.answeredAt == null && episode.silencedReasonId == null) episode.copy(answeredAt = at) else episode
    }

    /* Saying she is safe never moves the deadline, or pressing it every quarter of an hour would be an
       extension with no reason and no ceiling. */
    fun checkIn(timer: VisitTimer, at: Long): SafetyResult<VisitTimer> =
        if (timer.closedAt != null) refuse("checkin-after-close")
        else SafetyResult.Done(timer.copy(checkIns = timer.checkIns + at, overdue = answered(timer, at)))

    fun extend(timer: VisitTimer, minutes: Int, reasonId: String?, at: Long): SafetyResult<VisitTimer> = when {
        timer.closedAt != null -> refuse("checkin-after-close")
        reasonId == null || FieldSafetyData.extensionReasons.none { it.id == reasonId } -> refuse("extension-without-reason")
        minutes !in FieldSafetyData.extensionSteps -> refuse("extension-not-offered")
        timer.extensionUsed + minutes > FieldSafetyData.maxExtensionMinutes -> refuse("extension-limit")
        /* From now when she is already past it, or the new deadline would have passed already. */
        else -> SafetyResult.Done(timer.copy(
            dueAt = maxOf(timer.dueAt, at) + minutesToMillis(minutes),
            extensions = timer.extensions + SafetyExtension(at, minutes, reasonId.orEmpty()),
            overdue = answered(timer, at)
        ))
    }

    fun close(timer: VisitTimer, bySigning: Boolean, at: Long): SafetyResult<VisitTimer> =
        if (timer.closedAt != null) refuse("already-closed")
        else SafetyResult.Done(timer.copy(closedAt = at, closedBySigning = bySigning, overdue = answered(timer, at)))

    fun acknowledgeOverdue(timer: VisitTimer, at: Long): SafetyResult<VisitTimer> {
        val episode = timer.overdue
        if (episode == null || episode.silencedReasonId != null) return refuse("nothing-to-silence")
        return SafetyResult.Done(if (episode.acknowledgedAt != null) timer else timer.copy(overdue = episode.copy(acknowledgedAt = at)))
    }

    fun silenceOverdue(timer: VisitTimer, reasonId: String?): SafetyResult<VisitTimer> {
        val episode = timer.overdue
        if (episode == null || episode.silencedReasonId != null) return refuse("nothing-to-silence")
        val reason = FieldSafetyData.silenceReasons.firstOrNull { it.id == reasonId } ?: return refuse("overdue-silenced-without-reason")
        if (episode.acknowledgedAt == null) return refuse("overdue-acknowledged-first")
        if (reason.flag && episode.answeredAt == null) return refuse("silence-reason-untrue")
        return SafetyResult.Done(timer.copy(overdue = episode.copy(silencedReasonId = reason.id)))
    }

    fun raisePanic(panicRef: String, nurseId: String, appointmentRef: String?, at: Long): SafetyPanic =
        SafetyPanic(panicRef, nurseId, appointmentRef, at, at + minutesToMillis(FieldSafetyData.panicWindowMinutes))

    /* A second press is never refused and never swallowed: the same nurse pressing again for the same visit
       while her panic is open is the panic she already has, as the engine answers it; anybody else, another
       visit, a resolved panic or a closed window is a new one. */
    fun openPanicFor(panics: List<SafetyPanic>, nurseId: String, appointmentRef: String?, now: Long): SafetyPanic? =
        panics.lastOrNull { it.nurseId == nurseId && it.appointmentRef == appointmentRef && it.resolvedAt == null && it.isSharing(now) }

    private fun afterTheWindow(panic: SafetyPanic): SafetyResult.Refused {
        val refused = refusal("position-after-the-window")
        return SafetyResult.Refused(refused.copy(statement = fill(refused.statement, mapOf("ended" to clock(panic.sharingEndsAt)))))
    }

    /** One position from the feed, rounded to the declared precision. Kept only while sharing, and only as the latest. */
    fun receivePosition(panic: SafetyPanic, lat: Double, lng: Double, at: Long): SafetyResult<SafetyPanic> {
        if (!panic.isSharing(at)) return afterTheWindow(panic)
        val point = Geography.blur(LatLng(lat, lng))
        return SafetyResult.Done(panic.copy(position = SafetyPosition(point.lat, point.lng, at)))
    }

    fun positionFor(panic: SafetyPanic, now: Long): SafetyResult<SafetyPosition?> =
        if (!panic.isSharing(now)) afterTheWindow(panic) else SafetyResult.Done(panic.position)

    /** Forget the position once sharing has stopped. */
    fun sweep(panic: SafetyPanic, now: Long): SafetyPanic =
        if (panic.position != null && !panic.isSharing(now)) panic.copy(position = null) else panic

    fun acknowledge(panic: SafetyPanic, at: Long): SafetyResult<SafetyPanic> = when {
        panic.resolvedAt != null -> refuse("panic-already-resolved")
        panic.acknowledgedAt != null -> SafetyResult.Done(panic)
        else -> SafetyResult.Done(panic.copy(acknowledgedAt = at))
    }

    /* Resolving stops sharing in the same instant, so the position goes with it. Nobody is sent anywhere
       from here: the outcome records what a person did. */
    fun resolve(panic: SafetyPanic, outcomeId: String?, at: Long): SafetyResult<SafetyPanic> = when {
        panic.resolvedAt != null -> refuse("panic-already-resolved")
        FieldSafetyData.outcomes.none { it.id == outcomeId } -> refuse("panic-resolved-without-outcome")
        panic.acknowledgedAt == null -> refuse("panic-resolved-before-acknowledged")
        else -> SafetyResult.Done(panic.copy(resolvedAt = at, outcomeId = outcomeId, position = null))
    }
}
