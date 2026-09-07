import CoreGraphics
import Foundation

/// Where MyThuso works, and what a map of it is allowed to draw.
///
/// The coordinates are generated into `GeographyData.swift` from
/// `packages/catalog/geography.json`; the decisions are here, hand-written, because a generator
/// that emitted them would hide them. `Geo.swift` already refuses a coordinate that is not in
/// South Africa — this type never repeats that test, it calls it.
///
/// Nothing in this file opens a network connection. The native maps draw the schematic from these
/// coordinates alone: no tile is fetched, no map vendor is told what a nurse is doing, and no
/// location permission is declared by either native app.
enum Geography {

    /// Latitude first in the struct, longitude first in a tuple — the same convention `Geo.swift`
    /// and `packages/geo` hold, so a value never has to be remembered rather than read.
    struct Point: Hashable {
        let lat: Double
        let lng: Double
    }

    /// A suburb MyThuso covers, at its working radius. A circle around a named centre rather than a
    /// polygon: the business commits to suburbs, and a polygon would imply a surveyed boundary
    /// nobody has drawn.
    struct Zone: Hashable, Identifiable {
        let id: String
        let name: String
        let at: Point
        let radiusKm: Double
    }

    /// One entry in the key beside a map. Every mark on screen has one, so a reader is never left
    /// working out what a colour means.
    struct MapMark: Hashable, Identifiable {
        let id: String
        let name: String
        let detail: String
    }

    struct GeographyRule: Hashable, Identifiable {
        let id: String
        let statement: String
        let why: String
    }

    struct GeographyRefusal: Hashable, Identifiable {
        let id: String
        let sentence: String
        let why: String
    }

    static func zone(id: String) -> Zone? { zones.first { $0.id == id } }
    static func zone(named name: String) -> Zone? {
        zones.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }
    static func refusal(_ id: String) -> GeographyRefusal { refusals.first { $0.id == id }! }

    /// Rounded to the precision the contract declares, on the way *in*. Doing it at the point of
    /// drawing would leave the sharper number sitting in memory for the next screen to render, and
    /// the rule is about what MyThuso knows, not only about what it shows.
    static func blur(_ p: Point) -> Point {
        let f = pow(10.0, Double(coordinateDecimals))
        return Point(lat: (p.lat * f).rounded() / f, lng: (p.lng * f).rounded() / f)
    }

    static func distanceKm(_ a: Point, _ b: Point) -> Double {
        let r = 6371.0
        let dLat = (b.lat - a.lat) * .pi / 180
        let dLng = (b.lng - a.lng) * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2)
            + cos(a.lat * .pi / 180) * cos(b.lat * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * atan2(sqrt(h), sqrt(1 - h))
    }

    static func zone(containing p: Point) -> Zone? {
        zones.first { distanceKm($0.at, p) <= $0.radiusKm }
    }

    /// What a map may do with a position: draw it, or say why not, in the contract's own words.
    enum Placement: Hashable {
        case drawn(at: Point, zone: Zone?)
        case refused(sentence: String, why: String)
    }

    /// One gate, and every map on this platform goes through it. A position that is absent, or
    /// outside South Africa, or outside the suburbs MyThuso actually works in, is refused out loud
    /// rather than quietly dropped: a pin that vanishes teaches a dispatcher that the board is
    /// unreliable, and a pin in the Atlantic teaches them nothing at all.
    static func place(_ p: Point?, requireCoverage: Bool = false) -> Placement {
        guard let p else {
            let r = refusal("no-position-shared")
            return .refused(sentence: r.sentence, why: r.why)
        }
        // The bounding box is Geo.swift's, called rather than restated: a second copy of South
        // Africa is a second thing to get wrong, and the two would drift apart silently.
        guard SouthAfricaBounds.contains(lat: p.lat, lng: p.lng) else {
            let r = refusal("outside-south-africa")
            return .refused(sentence: r.sentence, why: r.why)
        }
        let at = blur(p)
        let found = zone(containing: at)
        if requireCoverage, found == nil {
            let r = refusal("outside-coverage")
            return .refused(sentence: r.sentence, why: r.why)
        }
        return .drawn(at: at, zone: found)
    }

    /// A visit waiting for a nurse is drawn at the centre of its suburb and never at its address.
    /// A home address beside a health service is not a location, it is a diagnosis with a doorstep:
    /// the controller assigning the visit needs the suburb, and the person actually going there
    /// gets the address inside the visit, where it belongs. This is the function that makes that
    /// true rather than a paragraph that says it.
    static func suburbPin(_ areaName: String) -> Point? { zone(named: areaName)?.at }

    /// The schematic projection: a position onto a 0–100 square. The same arithmetic, radian for radian, as `projectToSquare` in `packages/geo/coords.ts`.
    /// A square window measured in kilometres, so the picture keeps its proportions at
    /// Johannesburg's latitude instead of stretching east-west the way a raw degree grid does.
    static func project(_ p: Point, size: Double = 100) -> CGPoint {
        let earthRadiusKm = 6371.0
        let radians = { (d: Double) in d * .pi / 180 }
        let eastKm = earthRadiusKm * radians(p.lng - centre.lng) * cos(radians(centre.lat))
        let northKm = earthRadiusKm * radians(p.lat - centre.lat)
        return CGPoint(x: size * (0.5 + eastKm / spanKm), y: size * (0.5 - northKm / spanKm))
    }

    static func radiusInSquare(_ km: Double, size: Double = 100) -> Double { size * km / spanKm }
}
