package za.co.mythuso.model

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * Where is she now — the one question this product could answer for a controller and not for the
 * person waiting at home.
 *
 * The Control Tower has had coordinates, zones and arrival estimates since the dispatch board was
 * written. A patient had none of it. This module is the patient's half of the same contract, and it
 * is deliberately *less* than the controller's rather than a copy of it. It is the Kotlin half of
 * apps/web/src/lib/arrival.ts and the same three refusals, in the same order, for the same reasons.
 *
 * THREE REFUSALS, AND THEY ARE THE FEATURE.
 *
 * A patient is never shown where a nurse is standing. She is shown the suburb the nurse is in, and
 * every distance below is between two suburb centres. GeographyData already says a visit is drawn at
 * the centre of its suburb and never at its address — “a home address beside a health service is not
 * a location, it is a diagnosis with a doorstep” — and the same sentence read the other way round is
 * why a patient does not get a moving dot on a street. A nurse's working day is her private life as
 * much as an address is somebody's.
 *
 * A position is shown only on the day of the visit. A patient who can open this screen a fortnight
 * before her appointment and watch a nurse move around Johannesburg is being handed a tracking
 * device, and no part of arranging a home visit needs one. That is enforced by [daysUntil] and the
 * branch below it — arithmetic, not copy — because a rule written only as a sentence is a rule
 * somebody will one day render around. Before the day there is nothing here to watch, and the screen
 * says so rather than drawing an empty map.
 *
 * No arrival time is claimed. The number below is a straight line at a stated speed, exactly as it
 * is on the dispatch board, and the sentence that carries it says so in the same breath. No routing
 * provider is connected; a straight line through Johannesburg is optimistic by roughly a third and
 * knows nothing about the M1, a school run or the visit she is finishing first.
 *
 * WHAT BELONGS IN A CONTRACT AND IS NOT THERE YET. The refusal sentences are in one — geography.json
 * holds all seven and this file reads them. What is still not is the fact that a nurse is Sister
 * Naledi Mokoena working out of Rosebank: that fixture is typed into ui/DispatchScreens.kt as well,
 * where she is nurse N-205, the id the vetting register holds, and into apps/web/src/lib/arrival.ts
 * a third time. Three copies of a person is exactly the drift packages/catalog exists to stop. It is
 * reported rather than invented a fourth time.
 *
 * Nothing here reads a device. dispatch is not connected, the positions are the contract's own zone
 * centres, and the manifest declares no permission of any kind — location included.
 */

/** The nurse this account's visits are assigned to. Typed here because the web types it too; it
 *  belongs in a contract beside the dispatch roster. */
object AssignedNurse {
    const val name = "Sister Naledi Mokoena"
    const val role = "Registered Nurse (SANC)"
    const val initials = "SN"
    /** A suburb in geography.json, never a coordinate. What a patient is told is the suburb. */
    const val area = "Rosebank"
}

/*
 * The sentences a patient is owed when there is nothing to show. Each says what is refused and
 * leaves the reader somewhere to stand, which is the difference between a state and a blank.
 *
 * All seven are read out of packages/catalog/geography.json — four from its refusals and three from
 * its privacy rules — and reach this app as GeographyData.refusals and GeographyData.privacyRules.
 * They were typed out here, in apps/ios/MyThuso/Models/Arrival.swift and in
 * apps/web/src/lib/arrival.ts, three copies with nothing comparing them; the names below stay
 * because the screen reads better for them, but not one of the sentences is written here.
 *
 * Which is not the same as saying the rules are prose. only-on-the-day is enforced by the day
 * arithmetic in [arrivalFor], not by the sentence that describes it, and a boundary check reads the
 * branch rather than the wording: a rule written only as a sentence is one somebody will one day
 * render around.
 */
object ArrivalRefusals {
    val anotherDay: String get() = Geography.refusal("nobody-on-the-way-yet").sentence
    /* The rule behind that, said once, in the list of what this screen is not — rather than repeated
       verbatim under the figure it has already explained. */
    val onlyOnTheDay: String get() = Geography.rule("only-on-the-day").statement
    val noWindow: String get() = Geography.refusal("no-window-no-nurse").sentence
    val finished: String get() = Geography.refusal("visit-behind-you").sentence
    val notAnArrivalTime: String get() = Geography.refusal("not-an-arrival-time").sentence
    val noDoorstep: String get() = Geography.rule("no-doorstep-at-either-end").statement
    val nothingMeasured: String get() = Geography.rule("nothing-is-measured").statement
}

/** Whole days between today in Johannesburg and a date. Negative is behind us. Scheduling.today()
 *  rather than the device's own idea of the date: a phone set to another zone must not move the day
 *  a patient is allowed to watch. */
fun daysUntil(date: LocalDate, from: LocalDate = Scheduling.today()): Long =
    ChronoUnit.DAYS.between(from, date)

/** The suburb half of "Home visit · Rosebank". A visit carries an address for the nurse who is going
 *  there; what a map is allowed to know about it is the suburb, and this is that narrowing. */
fun areaOf(address: String): String = address.substringAfterLast('·').trim()

/** Which list a visit is in. The screen never estimates for a visit that is not ahead of you. */
enum class VisitGroup { UPCOMING, PAST, CANCELLED }

sealed interface Arrival {
    /** The day of the visit. A suburb for her, a suburb for you, and a line between them. */
    data class OnTheDay(val from: Zone, val to: Zone, val eta: Eta) : Arrival
    /** Ahead of the day. The suburb is drawn; she is not. */
    data class AnotherDay(val to: Zone, val days: Long, val refusal: String) : Arrival
    /** No time has been given, so nobody has been asked to come. */
    data class NoWindow(val to: Zone?, val refusal: String) : Arrival
    /** The address is not in a suburb MyThuso works in, in the contract's own words. */
    data class OutsideCoverage(val area: String, val refusal: String, val why: String) : Arrival
    data class Finished(val refusal: String) : Arrival
}

/* No routing provider is connected, and every request for one comes back unavailable — which is
   also what a real provider returns when it is down. So this is the path the screen was written
   against from its first day rather than the one nobody tries. Nothing is quietly redrawn as the
   straight line: the screen asks a different question, by name, and prints the answer's basis
   beside it. */
private fun routeFor(from: Zone, to: Zone): RouteResult =
    routeUnavailable("No routing provider is connected, so no road route can be drawn or timed.")

fun arrivalFor(address: String, date: LocalDate?, kind: String, group: VisitGroup): Arrival {
    if (group != VisitGroup.UPCOMING) return Arrival.Finished(ArrivalRefusals.finished)
    val area = areaOf(address)
    val to = Geography.zoneNamed(area)
        ?: Geography.refusal("outside-coverage").let { return Arrival.OutsideCoverage(area, it.sentence, it.why) }
    if (kind != "scheduled" || date == null) return Arrival.NoWindow(to, ArrivalRefusals.noWindow)
    val days = daysUntil(date)
    if (days != 0L) return Arrival.AnotherDay(to, days, ArrivalRefusals.anotherDay)
    val from = Geography.zoneNamed(AssignedNurse.area)
    /* A nurse with no suburb is a nurse whose device is telling us nothing, and the contract has a
       sentence for that already. It is said out loud rather than left as an absent pin. */
        ?: return Arrival.NoWindow(to, Geography.refusal("no-position-shared").sentence)
    val measured = etaFromRoute(routeFor(from, to))
    val eta = when {
        measured.minutes != null -> measured
        /* Same suburb. A straight line between one zone centre and itself is nought kilometres, and
           “1 minute away” is a promise about a doorstep this screen has refused to know about. */
        from.id == to.id -> noEta("She is working in ${to.name}, which is your own suburb. There is no distance here to measure, and how long a nurse takes to reach a door on the same streets is not something this screen knows.")
        else -> straightLineEta(from.at, to.at, sourceLabel = "arrival")
    }
    return Arrival.OnTheDay(from, to, eta)
}

/* The basis, in a patient's words rather than a controller's. The figures come off the Eta — there
   is no way to print a number here without the thing it was derived from, which is the rule
   model/Geo.kt exists to enforce. */
fun basisSentence(eta: Eta): String = when (eta.basis) {
    EtaBasis.STRAIGHT_LINE -> "Measured in a straight line over %.1f km at %.0f km/h. That is not a road route."
        .format(java.util.Locale.UK, eta.distanceKm ?: 0.0, eta.speedKmh ?: URBAN_SPEED_KMH)
    EtaBasis.ROUTE -> "Measured along a road route."
    EtaBasis.LAST_KNOWN_ROUTE -> "The last road route we measured, ${Math.round((eta.ageSeconds ?: 0.0) / 60)} minutes ago."
    EtaBasis.NONE -> eta.reason ?: "There is nothing to estimate from."
}

/** “About 12 minutes”, or the word rather than a dash. An empty cell reads as nothing at all to a
 *  screen reader and a dash reads as one. */
fun minutesSentence(eta: Eta): String = eta.minutes?.toString() ?: "Estimating"
