package za.co.mythuso.model

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/* Booking a visit, the thread about it, and handing a Gilbert conversation to the nurse queue.
 *
 * The words are generated into BookingData.kt from packages/catalog/booking.json; this is the arithmetic
 * beside them, and it is the same arithmetic as packages/engines/src/access/domain/booking.ts, thread.ts
 * and handover.ts, in the same refusal order. It is mirrored rather than shared because a native app
 * cannot import TypeScript.
 *
 * What it will not do is the point of it:
 *  - offer a nurse whose badge is not current today. Continuity is a preference, never an override, so a
 *    patient asking for the nurse she saw last time is told why that nurse is not offered rather than
 *    given her anyway;
 *  - offer an hour a named nurse is already booked for, or "as soon as someone is free" with a named
 *    nurse — the first person free and one person in particular are two different requests;
 *  - move a booking backwards, confirm one that was cancelled, or confirm one that has no hour to hold;
 *  - carry anything but words in a visit thread, or keep a thread open once the visit is over or called off;
 *  - lower an urgency Gilbert has already handed over.
 *
 * Nothing here books, sends or dispatches anything. The roster, the thread and the queue are simulated,
 * in memory, and every screen that reads this says so from the capabilities contract. */

data class BookingPersonOption(val id: String, val name: String, val detail: String)
data class BookingStateWords(val id: String, val name: String, val patientWords: String, val event: String)
data class BookingTransition(val from: String?, val to: String)
/** [route] and [status] are null for a refusal that answers no route: booking.json's own. */
data class BookingRefusal(val id: String, val route: String?, val status: Int?, val sentence: String)
data class BookingThreadClosed(val id: String, val sentence: String)
/** One value of Access's setting named-nurse-fallback: whether as soon as possible stays beside a nurse asked for by
    name, whether the patient is asked, the answer when they are not, and the sentence that says so. */
data class BookingFallbackRule(val setting: String, val offersAsap: Boolean, val asksPatient: Boolean, val resolvesTo: String?, val sentence: String)
/** An answer the patient may give to what happens if the nurse they asked for cannot take the visit. */
data class BookingFallbackChoice(val id: String, val name: String, val sentence: String)
/** A window of the handover desk's rota: a post, days and hours in Johannesburg. Never a named person. */
data class HandoverWindow(val post: String, val days: List<String>, val from: String, val to: String)

/** A nurse as this phone's vetting register sees her today, and whether the roster may offer her. */
data class BookingCandidate(
    val subject: VettingSubject,
    /** Her working suburb, when geography.json names it. Null means dispatch does not reach her. */
    val zone: Zone?,
    /** The take-visit gate's answer today. */
    val badgeCurrent: Boolean,
    /** The booking capability's refusal sentence, or null when she is offered. */
    val notOfferedBecause: String?,
    /** Straight line between suburb centres, for ordering only. */
    val distanceKm: Double?
) {
    val offered: Boolean get() = zone != null && badgeCurrent && notOfferedBecause == null
}

data class PersonOptions(
    val offered: List<BookingCandidate>,
    val notOffered: List<BookingCandidate>,
    /** The nurse this person saw last, offered or not. Null when the store knows of nobody. */
    val previous: BookingCandidate?
)

/** Words a person wrote in a visit thread. Held in memory in PreviewStore and nowhere else. */
data class VisitThreadMessage(val visitReference: String, val fromRole: String, val text: String, val atMillis: Long)

sealed interface ThreadState {
    data object Open : ThreadState
    data class Closed(val sentence: String) : ThreadState
}

sealed interface Posted {
    data class Kept(val message: VisitThreadMessage) : Posted
    data class Refused(val refusal: BookingRefusal) : Posted
    /* Blank is not a refusal with a sentence: the Send button is simply not offered for nothing. */
    data object Blank : Posted
}

data class HandoverSent(val reference: String, val conversation: String, val urgency: String)
data class HandoverOutcome(val handover: HandoverSent, val sentNow: Boolean)

object Booking {
    const val NEAREST = "nearest"
    const val PREVIOUS = "previous"
    const val NAMED = "named"
    const val THREAD_ROUTE = "POST /v1/access/visit-threads/{bookingRef}/messages@1"

    fun refusal(id: String, route: String? = null): BookingRefusal =
        BookingData.refusals.first { it.id == id && (route == null || it.route == route) }
    fun closedSentence(id: String): String = BookingData.Thread.closedBecause.first { it.id == id }.sentence
    fun stateWords(id: String): BookingStateWords = BookingData.states.first { it.id == id }
    fun fill(text: String, key: String, value: String) = text.replace("{$key}", value)

    /* ---- The roster's refusals ---------------------------------------------------------------------
       The booking capability's own sentences, found by the slug of their words as apps/web/src/lib/
       capabilities.ts finds them. Reword one in the contract and this stops resolving, loudly, rather
       than going on refusing a nurse in words nobody says any more. */

    fun refusalSlug(sentence: String): String = sentence.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')

    fun simulationRefusal(capability: String, slug: String): String {
        val refuses = Capabilities.of(capability)?.simulation?.refuses.orEmpty()
        return refuses.firstOrNull { refusalSlug(it) == slug }
            ?: error("Capability \"$capability\" has no simulation refusal reading \"$slug\". It refuses: ${refuses.joinToString { refusalSlug(it) }}.")
    }

    val outsideCoverage: String get() = simulationRefusal("booking", "book-outside-a-zone-dispatch-can-reach")
    val lapsed: String get() = simulationRefusal("booking", "offer-a-nurse-whose-simulated-vetting-has-lapsed")
    val unfinished: String get() = simulationRefusal("booking", "offer-a-nurse-whose-vetting-has-not-finished")

    /* ---- Who may be asked for ---------------------------------------------------------------------- */

    /** The suburb a visit would be in: the one its address names, or the care area chosen on the home. */
    fun visitZone(address: String, area: String): Zone? =
        GeographyData.zones.firstOrNull { address.contains(it.name, ignoreCase = true) }
            ?: GeographyData.zones.firstOrNull { area.contains(it.name, ignoreCase = true) }

    /* Coverage first, because nothing about a clearance changes whether MyThuso works in Tembisa; then a
       lapse, then an unfinished application. A clearance that ran out last night and four checks still
       outstanding are different situations, and one sentence for both would tell an applicant halfway
       through her paperwork that something of hers had lapsed. The web's roster.ts asks in this order. */
    fun candidates(subjects: List<VettingSubject>, near: Zone?): List<BookingCandidate> =
        subjects.filter { it.roleId == "nurse" }.map { subject ->
            val zone = subject.zone?.let(Geography::zoneNamed)
            val decision = can(subject, BookingData.Person.badgeCapability)
            val lapsedRecord = subject.records.any { it.expiresOn?.isBefore(vettingToday()) == true }
            val because = when {
                zone == null -> outsideCoverage
                decision.allowed -> null
                lapsedRecord -> lapsed
                else -> unfinished
            }
            BookingCandidate(subject, zone, decision.allowed, because,
                if (zone != null && near != null) Geography.distanceKm(zone.at, near.at) else null)
        }

    fun personOptions(candidates: List<BookingCandidate>, previousNurseId: String?): PersonOptions = PersonOptions(
        offered = candidates.filter { it.offered }
            .sortedWith(compareBy<BookingCandidate> { it.distanceKm ?: Double.MAX_VALUE }.thenBy { it.subject.id }),
        notOffered = candidates.filterNot { it.offered },
        previous = previousNurseId?.let { id -> candidates.firstOrNull { it.subject.id == id } }
    )

    /* The nurse on this person's most recent finished visit, if the store knows one: a booked visit with a
       named nurse whose hour has passed. The account holder's completed visit in the Health Passport was
       taken by the nurse the arrival screen names, looked up in the register rather than trusted by name,
       so she is the answer for the holder when no finished booking says otherwise. */
    fun previousNurseId(store: PreviewStore, person: String): String? {
        val now = LocalDateTime.now(Scheduling.zone)
        val finished = store.visits.filter { visit ->
            visit.person == person && visit.nurseId != null && endsAt(visit)?.isBefore(now) == true
        }.maxByOrNull { endsAt(it)!! }
        return finished?.nurseId
            ?: if (person == HOLDER) store.vetting.byName(AssignedNurse.name)?.id else null
    }
    private const val HOLDER = "Lerato Molefe"

    /** The nurse a choice names, when she may be booked against; null for nearest or for somebody not offered. */
    fun chosenNurse(options: PersonOptions, choice: String, nurseId: String?): BookingCandidate? = when (choice) {
        PREVIOUS -> options.previous?.takeIf { it.offered }
        NAMED -> options.offered.firstOrNull { it.subject.id == nurseId }
        else -> null
    }

    /* ---- The offer --------------------------------------------------------------------------------- */

    private fun minutesOf(hhmm: String): Int = runCatching { LocalTime.parse(hhmm).toSecondOfDay() / 60 }.getOrDefault(0)

    fun startsAt(visit: BookedVisit): LocalDateTime? {
        val date = visit.date ?: return null
        val start = visit.start ?: return null
        return runCatching { date.atTime(LocalTime.parse(start)) }.getOrNull()
    }
    fun endsAt(visit: BookedVisit): LocalDateTime? = startsAt(visit)?.plusMinutes(visit.service.duration.toLong())

    private fun overlaps(start: String, minutes: Int, holdStart: String, holdMinutes: Int) =
        minutesOf(start) < minutesOf(holdStart) + holdMinutes && minutesOf(holdStart) < minutesOf(start) + minutes

    /**
     * The hours that may be booked on a day, and only those. With whoever is nearest that is every hour
     * the scheduling contract offers; with a named nurse it is those less every hour that would overlap a
     * visit already held with her, each visit at its own service's length.
     */
    fun offeredSlots(service: CareService, date: LocalDate, nurseId: String?, visits: List<BookedVisit>): List<String> {
        if (nurseId == null) return SchedulingData.slots
        val held = visits.mapNotNull { visit ->
            val start = visit.start
            if (visit.nurseId == nurseId && visit.isScheduled && visit.date == date && start != null) start to visit.service.duration else null
        }
        return SchedulingData.slots.filter { start -> held.none { (holdStart, holdMinutes) -> overlaps(start, service.duration, holdStart, holdMinutes) } }
    }

    /** The sentence under the hours when some were taken away, with her name in it. Null when none were. */
    fun hoursNote(offered: List<String>, nurseName: String?): String? {
        if (nurseName == null || offered.size >= SchedulingData.slots.size) return null
        return fill(if (offered.isEmpty()) BookingData.Time.noHoursLeft else BookingData.Time.fewerHours, "nurse", nurseName)
    }

    /* ---- Where a booking stands -------------------------------------------------------------------- */

    fun mayMove(from: String?, to: String) = BookingData.transitions.any { it.from == from && it.to == to }

    /* What the simulated roster did with a visit. It is worked out rather than stored, because a stored
       state is one somebody can forget to move: a visit moved from "as soon as possible" to an hour has
       an hour to hold now, and the roster accepts it the moment it does. A cancelled booking is not
       accepted afterwards, and nothing without an hour is accepted at all — the made-up hour is the
       invented slot this whole contract refuses. */
    fun history(visit: BookedVisit, cancelled: Boolean): List<String> {
        val history = mutableListOf<String>()
        if (mayMove(null, "requested")) history += "requested"
        if (visit.isScheduled && startsAt(visit) != null && mayMove(history.lastOrNull(), "confirmed")) history += "confirmed"
        if (cancelled && mayMove(history.lastOrNull(), "cancelled")) history += "cancelled"
        return history
    }

    /* ---- The thread about a visit ------------------------------------------------------------------ */

    /* Closed when the visit is finished or called off. A thread left open after the visit is a private
       line to a nurse outside any rota, and what was said stays readable either way. */
    fun threadState(visit: BookedVisit, cancelled: Boolean, now: LocalDateTime = LocalDateTime.now(Scheduling.zone)): ThreadState {
        if (cancelled) return ThreadState.Closed(closedSentence("booking-cancelled"))
        val closes = threadClosesAt(visit, now)
        if (closes != null && !closes.isAfter(now)) return ThreadState.Closed(closedSentence("visit-completed"))
        return ThreadState.Open
    }

    /* When a completed visit's thread closes: the end of the visit plus the hours Access's generated setting
       holds, fixed by when the visit ended rather than by when somebody looks. Null while it has not ended. */
    fun threadClosesAt(visit: BookedVisit, now: LocalDateTime = LocalDateTime.now(Scheduling.zone)): LocalDateTime? {
        val ends = endsAt(visit) ?: return null
        if (ends.isAfter(now)) return null
        return ends.plusHours(BookingData.Thread.openHoursAfterVisit.toLong())
    }

    /* ---- When a nurse asked for by name cannot take the visit ---------------------------------------- */

    /** The rule Access's generated named-nurse fallback is. Null only if the contract lost it, which the build refuses. */
    val fallbackRule: BookingFallbackRule? get() = BookingData.Fallback.rules.firstOrNull { it.setting == BookingData.Fallback.inForce }
    /** Whether as soon as possible stays beside a nurse asked for by name. */
    val asapWithNamedNurse: Boolean get() = fallbackRule?.offersAsap ?: false

    fun codePoints(text: String): Int = text.trim().let { it.codePointCount(0, it.length) }

    /** The route's order: closed, then too long. A blank message is never sent. There is no attachment to count. */
    fun post(state: ThreadState, reference: String, fromRole: String, text: String, atMillis: Long = System.currentTimeMillis()): Posted {
        if (state is ThreadState.Closed) return Posted.Refused(refusal("thread-closed", THREAD_ROUTE))
        val words = text.trim()
        if (words.isEmpty()) return Posted.Blank
        if (codePoints(words) > BookingData.Thread.maxCharacters) return Posted.Refused(refusal("message-too-long", THREAD_ROUTE))
        return Posted.Kept(VisitThreadMessage(reference, fromRole, words, atMillis))
    }
}

/* Handing a conversation to the simulated nurse queue.
 *
 * The urgency only rises. The contract lists the codes most urgent first, so a later handover in the
 * same conversation sends something new only when its code outranks the one already held; an emergency
 * at the first message and a calm "can I talk to a nurse" at the tenth is still an emergency. */
object Handovers {
    /* When the handover desk answers, from Access's generated handover hours, in Johannesburg — Core's rule
       for a rota, onDuty in packages/engines/src/core/domain/loops.ts, which the web imports and a phone cannot,
       so it is mirrored here: a window covers the local day and a time from its start until before its end. It
       returns no words, so it has no way to leave out what Gilbert says first out of hours: nobody is there,
       and the numbers. */
    data class Desk(val open: Boolean, val opensDaysAhead: Int?, val opensOn: LocalDate?, val opensFrom: String?)

    fun desk(now: java.time.ZonedDateTime = java.time.ZonedDateTime.now(Scheduling.zone), hours: List<HandoverWindow> = BookingData.Handover.hours): Desk {
        val local = now.withZoneSameInstant(Scheduling.zone)
        fun minute(hhmm: String) = hhmm.split(":").let { it[0].toInt() * 60 + it[1].toInt() }
        fun id(day: LocalDate) = day.dayOfWeek.name.take(3).lowercase()
        val nowMinute = local.hour * 60 + local.minute
        val today = local.toLocalDate()
        val open = hours.any { it.days.contains(id(today)) && minute(it.from) <= nowMinute && nowMinute < minute(it.to) }
        for (ahead in 0..7) {
            val day = today.plusDays(ahead.toLong())
            val first = hours.filter { it.days.contains(id(day)) && (ahead > 0 || minute(it.from) > nowMinute) }.map { it.from }.minOrNull()
            if (first != null) return Desk(open, ahead, day, first)
        }
        return Desk(open, null, null, null)
    }

    /** When the desk next opens, in the contract's words, or null for a rota with no window. */
    fun opensWords(desk: Desk): String? {
        val day = desk.opensOn ?: return null
        val from = desk.opensFrom ?: return null
        val template = when (desk.opensDaysAhead) { 0 -> BookingData.Handover.opensToday; 1 -> BookingData.Handover.opensTomorrow; else -> BookingData.Handover.opensOn }
        return template.replace("{time}", from).replace("{day}", day.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.UK))
    }

    fun rank(code: String): Int {
        val index = GilbertData.handover.urgency.indexOfFirst { it.id == code }
        return if (index < 0) 0 else GilbertData.handover.urgency.size - index
    }

    fun handOver(queue: MutableList<HandoverSent>, conversation: String, urgency: String, atMillis: Long = System.currentTimeMillis()): HandoverOutcome {
        val held = queue.firstOrNull { it.conversation == conversation }
        if (held != null && rank(urgency) <= rank(held.urgency)) return HandoverOutcome(held, sentNow = false)
        val sent = HandoverSent(simulatedRef("HO", "$conversation|$urgency|$atMillis"), conversation, urgency)
        queue.removeAll { it.conversation == conversation }
        queue.add(sent)
        return HandoverOutcome(sent, sentNow = true)
    }
}

/* A reference that says it is simulated, the same FNV-1a as packages/engines/src/access/domain/contract.ts
   so a reference means the same thing on every platform. It identifies; it protects nothing. */
fun simulatedRef(prefix: String, seed: String): String {
    var hash = 0x811c9dc5L.toInt()
    for (c in seed) hash = (hash xor c.code) * 0x01000193
    var second = hash xor 0x5bd1e995
    for (i in seed.indices.reversed()) second = (second xor seed[i].code) * 0x01000193
    fun hex(value: Int) = Integer.toHexString(value).padStart(8, '0')
    return "SIM-$prefix-${hex(hash).take(6).uppercase()}${hex(second).take(2).uppercase()}"
}
