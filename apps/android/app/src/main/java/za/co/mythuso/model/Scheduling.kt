package za.co.mythuso.model

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/* When a visit happens.
 *
 * The rules — the timezone, the shape of the offer, the two kinds of booking — are generated into
 * SchedulingData.kt from packages/catalog/scheduling.json, so all three apps make the same promises
 * in the same words. What is here is the arithmetic, and it exists because of a specific defect:
 * CareScreens carried a hand-typed strip, Triple("FRI", "12", "SEP") and four more, which had not
 * matched the calendar since somebody typed it — and the visits list gave every booked visit that
 * same Friday whatever day it was actually booked for. The same five labels were typed again in
 * Swift and again in TypeScript.
 *
 * Nothing below is typed. The days are computed from the device clock in Africa/Johannesburg and a
 * weekday is asked of its own date. A visit ends its own duration after it starts, from the service
 * catalogue, rather than an hour later whatever the service is. */

data class BookingKind(
    val id: String,
    val name: String,
    val detail: String,
    /** Only the kind that means "come now" gets to show an arrival estimate. */
    val showsArrivalEstimate: Boolean,
    val confirmation: String
)

data class SchedulingRule(val id: String, val title: String, val sentence: String)

/** A day being offered, identified by its date rather than by where it sits in a list. */
data class OfferedDay(val date: LocalDate) {
    val weekday: String get() = Scheduling.format(date, "EEE").uppercase(Locale.UK)
    val dayNumber: String get() = Scheduling.format(date, "d")
    val month: String get() = Scheduling.format(date, "MMM").uppercase(Locale.UK)
}

object Scheduling {
    fun kind(id: String) = SchedulingData.kinds.firstOrNull { it.id == id } ?: SchedulingData.kinds.first()
    fun rule(id: String) = SchedulingData.rules.firstOrNull { it.id == id } ?: SchedulingData.rules.first()

    /* South Africa keeps one timezone and no daylight saving, but it is named rather than assumed:
       a phone set to another zone must not quietly move a nurse's arrival by two hours. */
    val zone: ZoneId get() = ZoneId.of(SchedulingData.timezone)
    fun today(): LocalDate = LocalDate.now(zone)

    fun format(date: LocalDate, pattern: String): String =
        date.format(DateTimeFormatter.ofPattern(pattern, Locale.UK))

    fun longDate(date: LocalDate): String = format(date, "EEEE, d MMMM yyyy")
    fun shortDate(date: LocalDate): String = format(date, "EEE d MMM")

    fun offeredDays(from: LocalDate = today()): List<OfferedDay> =
        (0 until SchedulingData.daysOffered).map { OfferedDay(from.plusDays((SchedulingData.firstDayOffset + it).toLong())) }

    /** The end of a visit is its own duration after the start — never a flat hour. */
    fun endTime(start: String, minutes: Int): String = runCatching {
        LocalTime.parse(start).plusMinutes(minutes.toLong()).format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrDefault(start)
}

/* Everything a person chose, carried whole. A scheduled visit cannot exist without its date, which
   is the defect this type closes: the confirmation used to hand on a time and drop the day. */
data class BookedVisit(
    val service: CareService,
    val person: String,
    val address: String,
    val kind: String,
    val date: LocalDate?,
    val start: String?,
    val payment: String
) {
    val isScheduled: Boolean get() = kind == "scheduled"
    val status: String get() = if (isScheduled) "Confirmed" else SchedulingData.asapPending
    val ends: String? get() = start?.let { Scheduling.endTime(it, service.duration) }
    val whenText: String
        get() = if (isScheduled && date != null && start != null) "${Scheduling.longDate(date)} · $start–$ends"
        else SchedulingData.asapPending
    val shortWhenText: String
        get() = if (isScheduled && date != null && start != null) "${Scheduling.shortDate(date)} · $start"
        else SchedulingData.asapPending
    val timeText: String
        get() = if (start != null) "$start – $ends" else SchedulingData.asapPending
}
