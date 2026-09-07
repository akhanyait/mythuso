package za.co.mythuso.model

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/*
 * Coordinates, once — the Android copy.
 *
 * packages/geo is the original and packages/geo/README.md is the porting contract this file owes.
 * It is hand-written rather than generated, for the same reason the identity check digit is: these
 * are decisions, and a generator would hide the decision. Idiomatic Kotlin is allowed; the bounding
 * box, the order of the checks, the sentences a refusal is worded in and the arithmetic are not.
 *
 * The whole module exists because a sibling project shipped without it. An iOS Simulator's default
 * position — Cupertino — travelled from a device into a locations table, back out into a routing
 * call, and returned as a 16 939 km route line drawn across the Atlantic. Every number in that
 * chain was correct. Nothing between the device and the map had asked whether the coordinate was in
 * South Africa, so nothing caught it, and a migration had to clean up afterwards. The lesson is not
 * “validate what a user types”: it is that the read path has to ask too, because the coordinate
 * that hurts is the one already sitting in the table.
 *
 * The one place this file deliberately does not match packages/geo word for word is the simulator
 * sentence; see it below. Nothing here is a location service — the manifest declares no location
 * permission and every coordinate the app holds is fictional.
 */

/* Latitude first in the object, longitude first in the tuple, exactly as upstream: the platform
   geolocation APIs hand over latitude and longitude, and every map vendor's wire format takes
   [lng, lat]. Naming both and converting at the boundary is cheaper than remembering which one you
   are holding. */
data class LatLng(val lat: Double, val lng: Double)

/** Generous on purpose — the coastline and the Mozambique-border protrusion. It admits Gaborone and
 *  Maputo near the corners, which is accepted: [provinceFor] is the tighter test where one is
 *  needed. It is tight enough that Cupertino, London and null-island all fall outside. */
object SaBounds {
    const val MIN_LNG = 16.0
    const val MAX_LNG = 33.5
    const val MIN_LAT = -35.5
    const val MAX_LAT = -22.0
}

const val EARTH_RADIUS_KM = 6371.0
private fun radians(degrees: Double) = degrees * Math.PI / 180.0

/** Finite and on the globe. Says nothing about whether it is anywhere MyThuso works. */
fun isFiniteCoordinate(point: LatLng?): Boolean {
    if (point == null) return false
    if (!point.lat.isFinite() || !point.lng.isFinite()) return false
    return point.lat >= -90.0 && point.lat <= 90.0 && point.lng >= -180.0 && point.lng <= 180.0
}
fun isInsideSouthAfrica(point: LatLng?): Boolean {
    if (!isFiniteCoordinate(point) || point == null) return false
    return point.lng >= SaBounds.MIN_LNG && point.lng <= SaBounds.MAX_LNG &&
        point.lat >= SaBounds.MIN_LAT && point.lat <= SaBounds.MAX_LAT
}

/* Great-circle distance, and the only distance this app can compute without a vendor. Every caller
   has to say so out loud: a straight line between two points is not how far anybody drives. */
fun distanceMetres(a: LatLng, b: LatLng): Double {
    val dLat = radians(b.lat - a.lat)
    val dLng = radians(b.lng - a.lng)
    val h = sin(dLat / 2) * sin(dLat / 2) +
        cos(radians(a.lat)) * cos(radians(b.lat)) * sin(dLng / 2) * sin(dLng / 2)
    return EARTH_RADIUS_KM * 1000.0 * 2.0 * atan2(sqrt(h), sqrt(1 - h))
}
fun distanceKm(a: LatLng, b: LatLng): Double = distanceMetres(a, b) / 1000.0

/* ---- The nine provinces ----------------------------------------------------------------------
   Conservative rectangles around the real outlines. The rectangles overlap, because provinces are
   not rectangles, which is why nothing here returns a province for every point on earth: the
   sibling project took the nearest centroid, so a coordinate in the middle of the Atlantic came
   back as “Western Cape” with nothing to suggest anything was wrong. Containment can answer “none”,
   and “none” is the answer that catches the bug. */
data class ProvinceBounds(val minLng: Double, val maxLng: Double, val minLat: Double, val maxLat: Double)
data class Province(val key: String, val name: String, val centre: LatLng, val bounds: ProvinceBounds)
val provinces: List<Province> = listOf(
    Province("LIM", "Limpopo", LatLng(-23.4, 29.5), ProvinceBounds(26.0, 32.0, -25.6, -22.0)),
    Province("NW", "North West", LatLng(-26.7, 25.6), ProvinceBounds(22.5, 28.1, -28.0, -24.6)),
    Province("GP", "Gauteng", LatLng(-26.1, 28.1), ProvinceBounds(27.2, 29.1, -26.9, -25.4)),
    Province("MP", "Mpumalanga", LatLng(-25.6, 30.6), ProvinceBounds(28.4, 32.0, -27.5, -24.4)),
    Province("NC", "Northern Cape", LatLng(-29.0, 21.9), ProvinceBounds(16.4, 25.0, -32.2, -26.0)),
    Province("FS", "Free State", LatLng(-28.5, 26.8), ProvinceBounds(24.4, 29.6, -30.7, -26.6)),
    Province("KZN", "KwaZulu-Natal", LatLng(-28.8, 30.9), ProvinceBounds(28.6, 33.0, -31.1, -26.9)),
    Province("WC", "Western Cape", LatLng(-33.5, 21.0), ProvinceBounds(17.4, 23.9, -35.5, -30.7)),
    Province("EC", "Eastern Cape", LatLng(-32.3, 26.5), ProvinceBounds(22.7, 30.4, -34.9, -30.3))
)
fun provinceByKey(key: String): Province? = provinces.firstOrNull { it.key == key }
private fun squaredDegrees(a: LatLng, b: LatLng) = (a.lat - b.lat) * (a.lat - b.lat) + (a.lng - b.lng) * (a.lng - b.lng)
/** Every rectangle the point falls in, nearest centroid first. More than one is normal at a border. */
fun provincesContaining(point: LatLng?): List<Province> {
    if (!isFiniteCoordinate(point) || point == null) return emptyList()
    return provinces
        .filter { point.lng >= it.bounds.minLng && point.lng <= it.bounds.maxLng &&
            point.lat >= it.bounds.minLat && point.lat <= it.bounds.maxLat }
        .sortedBy { squaredDegrees(point, it.centre) }
}
/** The likeliest province, or null — never a nearest guess. A screen that says “Gauteng” about a
 *  coordinate in the sea has told the reader something worse than nothing. */
fun provinceFor(point: LatLng?): Province? = provincesContaining(point).firstOrNull()

/* ---- The gate every coordinate goes through --------------------------------------------------
   The American spelling is kept from the sibling project this was ported from, so the copies stay
   greppable as the same thing. Everything else here is South African English. */

/** What arrived, exactly as it arrived, so a screenshot of a diagnostic tells the whole story. */
data class RawCoordinate(val lat: String?, val lng: String?)

data class NormalizedCoord(
    val lng: Double,
    val lat: Double,
    /** True only when both values are finite and the pair is inside South Africa. */
    val valid: Boolean,
    /** Why it was refused, in words a person can act on. Null when valid. */
    val reason: String?,
    /** Who handed it over — a table, a screen, a device feed. Carried so a warning can name it. */
    val sourceLabel: String,
    /** True when latitude and longitude arrived the wrong way round and were swapped back. */
    val autoCorrected: Boolean,
    val raw: RawCoordinate
)

/* Warnings go to the log by default and can be redirected, which is how they can be asserted on
   rather than assumed. System.out reaches logcat, so this stays free of any Android import and can
   be compiled and run on its own — a guard nobody can execute is a guard nobody has checked. */
data class CoordinateWarning(val message: String, val detail: Map<String, Any?>)
private val toLog: (CoordinateWarning) -> Unit = { println("${it.message} ${it.detail}") }
private var warn: (CoordinateWarning) -> Unit = toLog
fun setCoordinateWarningSink(sink: ((CoordinateWarning) -> Unit)?) { warn = sink ?: toLog }

private const val NO_COORDINATE = "No coordinate was given."
private const val NOT_A_NUMBER = "Coordinate is not a number."
private const val OUTSIDE_SA = "Coordinate is outside South Africa."
private const val NULL_ISLAND = "Coordinate is null-island (0, 0) — almost always an unset field rather than a place."
private const val OFF_THE_GLOBE = "Coordinate exceeds the global lat/lng range."
/* The one sentence that deliberately differs from packages/geo, which says “the iOS Simulator
   default (Cupertino)”. The same one-degree circle catches the Android emulator's own default,
   Mountain View, ten kilometres up the road — and on this platform that is far and away the likelier
   of the two. Naming only the other one would send an Android developer looking in the wrong place,
   which is the entire purpose of naming it at all. Web and iOS should take this wording too. */
private const val SIMULATOR_DEFAULT =
    "Coordinate looks like a mobile simulator default (Cupertino, or the Android emulator’s Mountain View)."

/* Strings are coerced rather than refused because a database column, a form field and a query
   parameter all arrive as text, and refusing them only pushes the same conversion out to every
   caller, where it is forgotten in one of them. */
private fun coerce(value: Any?): Double = when (value) {
    null -> Double.NaN
    is Double -> value
    is Number -> value.toDouble()
    is CharSequence -> value.toString().trim().toDoubleOrNull() ?: Double.NaN
    else -> Double.NaN
}

/**
 * The gate, in the order the porting contract sets out: coerce, refuse anything not finite, accept
 * a pair already inside the box, swap back a pair that is valid only the other way round and warn
 * about it, and otherwise refuse — naming the offender wherever it is recognisable, because the
 * wording is what sends a developer to the right line of code.
 */
fun normalizeSouthAfricaLngLat(lat: Any?, lng: Any?, sourceLabel: String): NormalizedCoord {
    val raw = RawCoordinate(lat?.toString(), lng?.toString())
    fun refused(reason: String, atLng: Double = 0.0, atLat: Double = 0.0) =
        NormalizedCoord(atLng, atLat, false, reason, sourceLabel, false, raw)

    val latitude = coerce(lat)
    val longitude = coerce(lng)
    if (!latitude.isFinite() || !longitude.isFinite()) return refused(NOT_A_NUMBER)

    if (isInsideSouthAfrica(LatLng(latitude, longitude))) {
        return NormalizedCoord(longitude, latitude, true, null, sourceLabel, false, raw)
    }
    /* Valid only when read the other way round. South African longitude is positive and latitude is
       negative, so this is unambiguous rather than a guess — and the correction is announced,
       because a silent one means the bug upstream is never found. */
    if (isInsideSouthAfrica(LatLng(longitude, latitude))) {
        warn(CoordinateWarning(
            "[geo] Corrected reversed lat/lng from $sourceLabel",
            mapOf("rawLat" to lat, "rawLng" to lng, "correctedLat" to longitude, "correctedLng" to latitude)
        ))
        return NormalizedCoord(latitude, longitude, true, null, sourceLabel, true, raw)
    }

    val reason = when {
        abs(latitude - 37.33) < 1.0 && abs(longitude + 122.03) < 1.0 -> SIMULATOR_DEFAULT
        latitude == 0.0 && longitude == 0.0 -> NULL_ISLAND
        abs(latitude) > 90.0 || abs(longitude) > 180.0 -> OFF_THE_GLOBE
        else -> OUTSIDE_SA
    }
    warn(CoordinateWarning("[geo] Refused a coordinate from $sourceLabel",
        mapOf("lat" to latitude, "lng" to longitude, "reason" to reason)))
    return refused(reason, longitude, latitude)
}
/** The same gate for a coordinate that is already a pair, or missing altogether. */
fun normalizeSouthAfricaLngLat(point: LatLng?, sourceLabel: String): NormalizedCoord =
    if (point == null) NormalizedCoord(0.0, 0.0, false, NO_COORDINATE, sourceLabel, false, RawCoordinate(null, null))
    else normalizeSouthAfricaLngLat(point.lat, point.lng, sourceLabel)

fun asLatLng(n: NormalizedCoord): LatLng? = if (n.valid) LatLng(n.lat, n.lng) else null

/**
 * A trip longer than this inside one metro is not a long trip, it is a wrong coordinate. Both
 * endpoints can pass the national box and still be most of a country apart; that is the 16 939 km
 * line again with a smaller number on it. Past this an estimate is refused as a data fault rather
 * than reported.
 */
const val MAX_REALISTIC_DISPATCH_KM = 300.0

/* ---- Drawing a picture of coordinates ---------------------------------------------------------
   A decorative map is still allowed to be true. Hand-placed positions drift away from the data they
   claim to show and nobody notices, because there is nothing to notice against; a projection cannot
   drift, because there is only one set of numbers. The window is a square measured in kilometres,
   so the picture keeps its proportions at Johannesburg's latitude rather than stretching east-west
   the way a raw degree grid does. */
data class MapWindow(val centre: LatLng, val spanKm: Double)
data class BoxPoint(val x: Double, val y: Double)
fun projectToSquare(point: LatLng, window: MapWindow, size: Double = 100.0): BoxPoint {
    val eastKm = EARTH_RADIUS_KM * radians(point.lng - window.centre.lng) * cos(radians(window.centre.lat))
    val northKm = EARTH_RADIUS_KM * radians(point.lat - window.centre.lat)
    return BoxPoint(size * (0.5 + eastKm / window.spanKm), size * (0.5 - northKm / window.spanKm))
}
/** A radius on that square. One scale for both axes, which is the point of a square window. */
fun kmToBoxUnits(km: Double, window: MapWindow, size: Double = 100.0): Double = size * km / window.spanKm

/* ---- What a routing provider returns, written down before there is one ------------------------
   MyThuso has no routing provider, no key and no map vendor. What it can have now is the shape, so
   that adding one is writing an adapter rather than reworking every screen that shows an arrival
   time. The rule the shape exists to hold, learned by a sibling project the expensive way: when the
   route is unavailable you say it is unavailable. You do not quietly draw the straight line between
   the two points and let it read as a road. There is deliberately nothing in here that can
   manufacture a duration, a distance or a geometry. */
sealed interface RouteResult {
    val provider: String
}
data class RouteMeasured(
    /** As the provider measured them. Neither is ever inferred from the other. */
    val distanceMetres: Double,
    val durationSeconds: Double,
    /** Epoch milliseconds of the measurement, and how old it is now. Age is what makes “stale” checkable. */
    val measuredAtMs: Long,
    val ageSeconds: Double,
    val stale: Boolean,
    override val provider: String
) : RouteResult
data class RouteUnavailable(
    /** Said in words a dispatcher can act on, not a vendor error code. */
    val reason: String,
    override val provider: String = "none"
) : RouteResult
fun routeUnavailable(reason: String, provider: String = "none") = RouteUnavailable(reason, provider)

/* Ninety seconds. A nurse in traffic has not moved far in that time, and a board that re-asks more
   often is paying a vendor to be told the same thing. */
const val ROUTE_STALE_AFTER_SECONDS = 90.0
/** Age a measurement against the clock, passed in so nothing decides for itself what “old” means. */
fun ageRoute(route: RouteResult, nowMs: Long = System.currentTimeMillis()): RouteResult {
    if (route !is RouteMeasured) return route
    val ageSeconds = max(0.0, (nowMs - route.measuredAtMs) / 1000.0)
    return route.copy(ageSeconds = ageSeconds, stale = ageSeconds > ROUTE_STALE_AFTER_SECONDS)
}
/** The honest default, and the one the app runs on today: asked for a route, it says there is none. */
fun noRoutingProvider(reason: String = "No routing provider is connected, so no road route can be drawn or timed."): RouteResult =
    routeUnavailable(reason)

/* ---- An estimated arrival, or nothing ---------------------------------------------------------
   A number on a screen is a claim, and a claim that came from a placeholder is worse than a blank,
   because a dispatcher will plan around it. So every arrival time carries the basis it came from,
   and there is no path to a number without one. When there is no basis, minutes is null and reason
   says why in words the screen can print — rendered as “estimating”, never a dash, never an empty
   cell, and never zero. */
enum class EtaBasis { ROUTE, LAST_KNOWN_ROUTE, STRAIGHT_LINE, NONE }
data class Eta(
    /** Null means we do not know. It never means zero, and zero is never rounded down to. */
    val minutes: Int?,
    val basis: EtaBasis,
    val distanceKm: Double?,
    /** The speed the estimate can point at. Null when a provider measured the duration itself. */
    val speedKmh: Double?,
    /** Set exactly when [minutes] is null. */
    val reason: String?,
    val ageSeconds: Double?
)

/**
 * Johannesburg traffic, averaged over stops, robots and school runs. It is a guess — but a guess
 * with a name, kept in one place, printed on the row it produced and easy to argue with. That is
 * the difference between an assumption and a made-up number.
 */
const val URBAN_SPEED_KMH = 30.0

fun noEta(reason: String, km: Double? = null) = Eta(null, EtaBasis.NONE, km, null, reason, null)

/**
 * A straight line between two points, at a stated speed. Not a route, and it must never be shown as
 * one: it goes through buildings, ignores the M1 and is optimistic by roughly a third in a city laid
 * out like Johannesburg. No detour factor is applied, on purpose — multiplying by 1.3 would give a
 * closer arrival time and a worse label, and the screen says “straight line”, so the number has to
 * be one.
 */
fun straightLineEta(
    from: LatLng?, to: LatLng?, speedKmh: Double = URBAN_SPEED_KMH, sourceLabel: String = "eta"
): Eta {
    val origin = normalizeSouthAfricaLngLat(from, "$sourceLabel:from")
    if (!origin.valid) return noEta(origin.reason ?: "There is no position to measure from.")
    val destination = normalizeSouthAfricaLngLat(to, "$sourceLabel:to")
    if (!destination.valid) return noEta(destination.reason ?: "There is no position to measure to.")
    if (!(speedKmh > 0) || !speedKmh.isFinite()) return noEta("There is no speed to divide the distance by.")
    val km = distanceKm(LatLng(origin.lat, origin.lng), LatLng(destination.lat, destination.lng))
    /* Both ends passed the national box and are still most of a country apart. That is a coordinate
       fault, and estimating a nine-hour arrival for a home visit would hide it. */
    if (km > MAX_REALISTIC_DISPATCH_KM) {
        return noEta("Those two positions are ${km.roundToInt()} km apart, which is a coordinate fault rather than a long trip.", km)
    }
    /* One minute is the floor. Somebody at the gate still has to reach the door, and zero minutes is
       the number the sibling project refused to print. */
    return Eta(max(1, (km / speedKmh * 60.0).roundToInt()), EtaBasis.STRAIGHT_LINE, km, speedKmh, null, null)
}

/**
 * An arrival time from a measured route — and nothing at all from an unavailable one. There is no
 * straight-line branch in here, and that absence is the contract: a screen that wants one calls
 * [straightLineEta] by name, at its own call site, and labels it where the reader can see it.
 *
 * “Stale” is not “unavailable”. A route measured ninety seconds ago is still a measurement, and
 * blanking it while a refresh is in flight is how a board flickers between a real arrival time and
 * “calculating”, which teaches an operator to distrust both.
 */
fun etaFromRoute(result: RouteResult): Eta {
    if (result !is RouteMeasured) return noEta((result as RouteUnavailable).reason)
    if (!result.durationSeconds.isFinite() || result.durationSeconds < 0) {
        return noEta("${result.provider} returned a route without a usable duration.")
    }
    return Eta(
        minutes = max(1, (result.durationSeconds / 60.0).roundToInt()),
        basis = if (result.stale) EtaBasis.LAST_KNOWN_ROUTE else EtaBasis.ROUTE,
        distanceKm = if (result.distanceMetres.isFinite()) result.distanceMetres / 1000.0 else null,
        speedKmh = null, reason = null, ageSeconds = result.ageSeconds
    )
}
