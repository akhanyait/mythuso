package za.co.mythuso.model

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

/* Where MyThuso works, and what a map of it is allowed to draw.
 *
 * The coordinates are generated into GeographyData.kt from packages/catalog/geography.json; the
 * decisions are here, hand-written, because a generator that emitted them would hide them. Geo.kt
 * already refuses a coordinate that is not in South Africa — nothing below repeats that test, it
 * calls it.
 *
 * Nothing in this file opens a network connection. The Android map draws the schematic from these
 * coordinates alone: no tile is fetched, no map vendor is told what a nurse is doing, and the
 * manifest declares no location permission. */

/** A suburb MyThuso covers, at its working radius. A circle around a named centre rather than a
 *  polygon: the business commits to suburbs, and a polygon would imply a surveyed boundary nobody
 *  has drawn. */
data class Zone(val id: String, val name: String, val at: LatLng, val radiusKm: Double)

/** One entry in the key beside a map. Every mark on screen has one, so a reader is never left
 *  working out what a colour means. */
data class MapMark(val id: String, val name: String, val detail: String)

data class GeographyRule(val id: String, val statement: String, val why: String)

data class GeographyRefusal(val id: String, val sentence: String, val why: String)

/** What a map may do with a position: draw it, or say why not, in the contract's own words. */
sealed interface Placement {
    data class Drawn(val at: LatLng, val zone: Zone?) : Placement
    data class Refused(val sentence: String, val why: String) : Placement
}

object Geography {

    fun zoneById(id: String): Zone? = GeographyData.zones.firstOrNull { it.id == id }
    fun zoneNamed(name: String): Zone? = GeographyData.zones.firstOrNull { it.name.equals(name, ignoreCase = true) }
    fun refusal(id: String): GeographyRefusal = GeographyData.refusals.first { it.id == id }

    /** Rounded to the precision the contract declares, on the way *in*. Doing it at the point of
     *  drawing would leave the sharper number sitting in memory for the next screen to render, and
     *  the rule is about what MyThuso knows, not only about what it shows. */
    fun blur(p: LatLng): LatLng {
        var f = 1.0
        repeat(GeographyData.coordinateDecimals) { f *= 10 }
        return LatLng((p.lat * f).roundToLong() / f, (p.lng * f).roundToLong() / f)
    }

    fun distanceKm(a: LatLng, b: LatLng): Double {
        val r = 6371.0
        val dLat = Math.toRadians(b.lat - a.lat)
        val dLng = Math.toRadians(b.lng - a.lng)
        val h = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * atan2(sqrt(h), sqrt(1 - h))
    }

    fun zoneContaining(p: LatLng): Zone? = GeographyData.zones.firstOrNull { distanceKm(it.at, p) <= it.radiusKm }

    /** One gate, and every map on this platform goes through it. A position that is absent, or
     *  outside South Africa, or outside the suburbs MyThuso actually works in, is refused out loud
     *  rather than quietly dropped: a pin that vanishes teaches a dispatcher that the board is
     *  unreliable, and a pin in the Atlantic teaches them nothing at all. */
    fun place(p: LatLng?, requireCoverage: Boolean = false): Placement {
        if (p == null) {
            val r = refusal("no-position-shared")
            return Placement.Refused(r.sentence, r.why)
        }
        // The bounding box is Geo.kt's, called rather than restated: a second copy of South Africa
        // is a second thing to get wrong, and the two would drift apart silently.
        if (!p.lat.isFinite() || !p.lng.isFinite() ||
            p.lat < SaBounds.MIN_LAT || p.lat > SaBounds.MAX_LAT ||
            p.lng < SaBounds.MIN_LNG || p.lng > SaBounds.MAX_LNG
        ) {
            val r = refusal("outside-south-africa")
            return Placement.Refused(r.sentence, r.why)
        }
        val at = blur(p)
        val zone = zoneContaining(at)
        if (requireCoverage && zone == null) {
            val r = refusal("outside-coverage")
            return Placement.Refused(r.sentence, r.why)
        }
        return Placement.Drawn(at, zone)
    }

    /** A visit waiting for a nurse is drawn at the centre of its suburb and never at its address.
     *  A home address beside a health service is not a location, it is a diagnosis with a doorstep:
     *  the controller assigning the visit needs the suburb, and the person actually going there
     *  gets the address inside the visit, where it belongs. This is the function that makes that
     *  true rather than a paragraph that says it. */
    fun suburbPin(areaName: String): LatLng? = zoneNamed(areaName)?.at

    /** The schematic projection: a position onto a 0–100 square. The same arithmetic, radian for
     *  radian, as projectToSquare in packages/geo/coords.ts. A square window measured in
     *  kilometres, so the picture keeps its proportions at Johannesburg's latitude instead of
     *  stretching east-west the way a raw degree grid does. */
    fun project(p: LatLng, size: Double = 100.0): Pair<Double, Double> {
        val earthRadiusKm = 6371.0
        val eastKm = earthRadiusKm * Math.toRadians(p.lng - GeographyData.centre.lng) *
            cos(Math.toRadians(GeographyData.centre.lat))
        val northKm = earthRadiusKm * Math.toRadians(p.lat - GeographyData.centre.lat)
        return Pair(size * (0.5 + eastKm / GeographyData.spanKm), size * (0.5 - northKm / GeographyData.spanKm))
    }

    fun radiusInSquare(km: Double, size: Double = 100.0): Double = size * km / GeographyData.spanKm

    /** Kept because a projected point outside the square is a coordinate fault worth seeing rather
     *  than a pin quietly clipped at the edge of the board. */
    fun isOffBoard(x: Double, y: Double, size: Double = 100.0): Boolean =
        abs(x - size / 2) > size / 2 || abs(y - size / 2) > size / 2
}
