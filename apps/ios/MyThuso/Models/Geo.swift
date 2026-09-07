import Foundation

/* Every coordinate that reaches the map, or that an arrival estimate is derived from, goes through
   this file first.

   It exists because of a failure that has already happened, in a sibling project. An iOS
   Simulator’s default position — Cupertino, latitude 37.33, longitude −122.03 — was written on the
   way in, never questioned on the way out, and a route was drawn from California to Johannesburg:
   16 939 km, rendered as a fact, in front of a user. A database migration was needed to clean up
   after it. On a preview built for the simulator that is not a hypothetical failure; it is the
   default one.

   So the common offenders are named by hand rather than swept into a single “invalid coordinate”.
   The person reading the refusal is usually the person who can go and fix whatever produced it, and
   “this is the simulator’s own position” tells them where to look in a way that “out of bounds”
   never does.

   The same reasoning is written once for the web and once for Android. The native apps hand-write
   shared logic rather than reading it at runtime — the same arrangement the identity check digit in
   Localisation.swift is under — so the three copies are held in step by their public surface, their
   bounds and their sentences. Nothing here imports anything but Foundation, and nothing here
   depends on the rest of the app, so the file can be compiled, run and compared on its own. */

// MARK: - Where South Africa is

/// Generous rather than tight: the coastline and the Mozambique-border protrusions are inside it,
/// and so is a little sea. A bounding box that clips a real address is worse than one that admits a
/// little water, because the first refuses a visit and the second only fails to catch one mistake.
enum SouthAfricaBounds {
    static let minLng = 16.0
    static let maxLng = 33.5
    static let minLat = -35.5
    static let maxLat = -22.0
    static func contains(lat: Double, lng: Double) -> Bool {
        lat.isFinite && lng.isFinite
            && lat >= minLat && lat <= maxLat
            && lng >= minLng && lng <= maxLng
    }
}

/* A trip longer than this inside one metro is not a long trip, it is a wrong coordinate. Both ends
   can pass the national bounding box and still be 1 200 km apart; that is how the 16 939 km line
   got drawn, only with a smaller number. Anything past this is refused as a data fault rather than
   estimated. */
let maxRealisticDispatchKm = 300.0

// MARK: - The answer

/// What arrived, as it arrived, so a screenshot of a refusal tells the whole story rather than
/// half of it.
struct RawCoordinate: Hashable {
    let lat: String?
    let lng: String?
    var described: String { "lat \(lat ?? "—"), lng \(lng ?? "—")" }
}

struct NormalisedCoordinate: Hashable {
    /// Canonical longitude. Only meaningful when `valid`; kept on a refusal so the refusal can say
    /// what it was looking at.
    let lng: Double
    /// Canonical latitude, under the same rule.
    let lat: Double
    /// True only when both values are finite and the pair sits inside South Africa.
    let valid: Bool
    /// Why it was refused, in a sentence a person can read on a screen. nil when valid.
    let reason: String?
    /// Whose coordinate this is — “Sister Palesa Khumalo’s last reported position”, not “input”.
    /// It is the whole value of the warning, so it is required rather than optional.
    let source: String
    /// True when a transposed latitude and longitude were put back the right way round.
    let autoCorrected: Bool
    let raw: RawCoordinate
    /// The sentence this coordinate was warned with, kept on the value so a screen can show what a
    /// log would otherwise swallow. nil when there was nothing to warn about.
    let warning: String?
}

extension NormalisedCoordinate {
    /// The pair, or nothing. ArtisanZA throws here so a call site cannot pass rubbish to a map;
    /// Swift does not need to be that violent about it — an Optional refuses at compile time what a
    /// throw only refuses at run time.
    var pair: (lat: Double, lng: Double)? { valid ? (lat, lng) : nil }
}

// MARK: - The refusals, written once

/* These sentences are the part three platforms must not paraphrase, so they are lifted verbatim
   from packages/geo/normalize.ts rather than rewritten in a native voice. A refusal that reads one
   way on a phone and another way in a console is two refusals, and whoever is comparing them has to
   work out which is the truth. */
enum GeoRefusal {
    static let missing = "No coordinate was given."
    static let notANumber = "Coordinate is not a number."
    static let simulator = "Coordinate looks like a mobile simulator default (Cupertino, or the Android emulator’s Mountain View)."
    static let nullIsland = "Coordinate is null-island (0, 0) — almost always an unset field rather than a place."
    static let offEarth = "Coordinate exceeds the global lat/lng range."
    static let outsideSouthAfrica = "Coordinate is outside South Africa."
}

// MARK: - The guard

/// The single entry point. Coerces, refuses what is not a number, puts a transposed pair back the
/// right way round with a warning against its source, and names the mistake when it can.
func normaliseSouthAfricaLngLat(lat: Double?, lng: Double?, source: String) -> NormalisedCoordinate {
    let raw = RawCoordinate(lat: lat.map(describeCoordinate), lng: lng.map(describeCoordinate))
    func refuse(_ reason: String, lat: Double = 0, lng: Double = 0) -> NormalisedCoordinate {
        let warning = "Rejected a coordinate from \(source). \(reason) (\(raw.described))"
        warnAboutCoordinate(warning)
        return NormalisedCoordinate(lng: lng, lat: lat, valid: false, reason: reason, source: source,
                                    autoCorrected: false, raw: raw, warning: warning)
    }

    guard let lat, let lng else { return refuse(GeoRefusal.missing) }
    guard lat.isFinite, lng.isFinite else { return refuse(GeoRefusal.notANumber) }

    if SouthAfricaBounds.contains(lat: lat, lng: lng) {
        return NormalisedCoordinate(lng: lng, lat: lat, valid: true, reason: nil, source: source,
                                    autoCorrected: false, raw: raw, warning: nil)
    }

    /* A transposed pair is unmistakable in this country and nowhere near ambiguous: a South African
       longitude is positive 16 to 33, a South African latitude is negative 22 to 35, and the two
       ranges do not overlap. Swapping them back is safe, but it is still somebody’s bug, so it is
       corrected loudly rather than quietly. */
    if SouthAfricaBounds.contains(lat: lng, lng: lat) {
        let warning = "Corrected a reversed latitude and longitude from \(source). Read as lat \(describeCoordinate(lng)), lng \(describeCoordinate(lat)) — the source still has them the wrong way round."
        warnAboutCoordinate(warning)
        return NormalisedCoordinate(lng: lat, lat: lng, valid: true, reason: nil, source: source,
                                    autoCorrected: true, raw: raw, warning: warning)
    }

    var reason = GeoRefusal.outsideSouthAfrica
    if abs(lat - 37.33) < 1 && abs(lng + 122.03) < 1 {
        reason = GeoRefusal.simulator
    } else if lat == 0 && lng == 0 {
        reason = GeoRefusal.nullIsland
    } else if abs(lat) > 90 || abs(lng) > 180 {
        reason = GeoRefusal.offEarth
    }
    return refuse(reason, lat: lat, lng: lng)
}

/* The same guard for values that arrive as text, which is how a coordinate arrives from a form, a
   query string or a JSON field somebody typed. It carries its own name rather than overloading the
   one above: `nil` is a coordinate nobody supplied, and an overload set that cannot tell which kind
   of nothing it was handed is an ambiguity at every call site.

   An empty box is not zero, either. JavaScript will read "" as the equator off Ghana; reproducing
   that here would be reproducing the bug this file exists to stop. */
func normaliseSouthAfricaLngLat(latText: String?, lngText: String?, source: String) -> NormalisedCoordinate {
    let (lat, lng) = (latText, lngText)
    let parsed = [lat, lng].map { text -> Double? in
        guard let trimmed = text?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty else { return nil }
        return Double(trimmed)
    }
    guard let latitude = parsed[0], let longitude = parsed[1] else {
        let raw = RawCoordinate(lat: lat, lng: lng)
        let reason = (lat == nil || lng == nil) ? GeoRefusal.missing : GeoRefusal.notANumber
        let warning = "Rejected a coordinate from \(source). \(reason) (\(raw.described))"
        warnAboutCoordinate(warning)
        return NormalisedCoordinate(lng: 0, lat: 0, valid: false, reason: reason, source: source,
                                    autoCorrected: false, raw: raw, warning: warning)
    }
    return normaliseSouthAfricaLngLat(lat: latitude, lng: longitude, source: source)
}

private func describeCoordinate(_ value: Double) -> String {
    value.isFinite ? String(format: "%g", value) : (value.isNaN ? "NaN" : (value > 0 ? "∞" : "−∞"))
}
/// Standard error rather than a logging framework, because the app has no dependencies and this
/// warning has one reader: whoever is watching the console when a wrong coordinate goes past.
private func warnAboutCoordinate(_ message: String) {
    FileHandle.standardError.write(Data("[coordinate guard] \(message)\n".utf8))
}

// MARK: - Distance

/// Great-circle distance in kilometres, or nothing when either end is not a place. The Optional is
/// the point: there is no distance between a real address and the Cupertino simulator default that
/// is worth printing, so none is returned.
func haversineKm(_ from: NormalisedCoordinate, _ to: NormalisedCoordinate) -> Double? {
    guard let start = from.pair, let end = to.pair else { return nil }
    let earthRadiusKm = 6371.0
    let φ1 = start.lat * .pi / 180, φ2 = end.lat * .pi / 180
    let dφ = (end.lat - start.lat) * .pi / 180
    let dλ = (end.lng - start.lng) * .pi / 180
    let a = sin(dφ / 2) * sin(dφ / 2) + cos(φ1) * cos(φ2) * sin(dλ / 2) * sin(dλ / 2)
    return earthRadiusKm * 2 * atan2(sqrt(a), sqrt(1 - a))
}

/// Thousands are spaced rather than comma’d, which is how a distance is written in South Africa.
let kilometreFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = "\u{00A0}"
    formatter.maximumFractionDigits = 0
    return formatter
}()

// MARK: - An arrival time that can say where it came from

/* The board used to carry a hand-typed number of minutes against each nurse. It looked like an
   estimate and was in fact a decoration: nothing produced it, nothing could contradict it, and it
   would have stayed the same if the nurse had been in Cape Town.

   An estimate here is a distance divided by a speed, both of which are named on the screen that
   shows them. Where there is no distance there is no estimate, and the board says so rather than
   filling the gap with something plausible. A plausible number is the worst of the three options: a
   wrong one nobody will question, that a dispatcher will plan around.

   Swift can hold that rule in the type rather than in a convention. packages/geo returns an object
   whose `minutes` may be null beside a `basis` that may say so; the enum below cannot be given a
   number without also being given what the number came from, and cannot be read for minutes when it
   has none. The contract is the same one, refused at compile time instead of at review time. */

/// The shared `EtaBasis`. iOS has no routing provider, so only two of the four are reachable from
/// this app — and the two that are missing are exactly the two that would need one.
enum ArrivalBasis: String {
    case route
    case lastKnownRoute = "last-known-route"
    case straightLine = "straight-line"
    case none
}

/* Johannesburg traffic, averaged over stops, robots and school runs. It is a guess — but it is a
   guess with a name, kept in one place, printed on the row it produced, and easy to argue with.
   That is the difference between an assumption and a made-up number. Held at the same figure as
   packages/geo: an arrival time that differs between a dispatcher’s screen and a nurse’s phone is
   two answers to one question. */
let urbanSpeedKmh = 30.0

enum ArrivalEstimate: Hashable {
    /// Derived: a straight-line distance over the ground, at the stated speed.
    case straightLine(minutes: Int, km: Double, speedKmh: Double)
    /// Nothing to derive it from. The reason is the coordinate guard’s own sentence, carried
    /// through, because “estimating” on its own tells an operator nothing they can act on. The
    /// distance is kept where there was one — a refusal that can say “1 248 km” is a refusal
    /// somebody can go and fix.
    case unavailable(reason: String, km: Double?)

    static func noEstimate(_ reason: String, km: Double? = nil) -> ArrivalEstimate {
        .unavailable(reason: reason, km: km)
    }
    /// Never zero, and never a dash. Nothing rounds down into a number here.
    var minutes: Int? {
        if case let .straightLine(minutes, _, _) = self { return minutes }
        return nil
    }
    var basis: ArrivalBasis {
        if case .straightLine = self { return .straightLine }
        return .none
    }
    var km: Double? {
        switch self {
        case let .straightLine(_, km, _): return km
        case let .unavailable(_, km): return km
        }
    }
    /// What the row shows. A straight-line estimate says on the row that it is one — the promise at
    /// the bottom of the board is not allowed to be the only place it is admitted.
    var label: String {
        switch self {
        case let .straightLine(minutes, km, _):
            return "\(minutes) min · \(String(format: "%.1f", km)) km straight line"
        case .unavailable:
            return "Estimating"
        }
    }
    /// What VoiceOver says. “Estimating” must not arrive as an empty value, and “ETA” must not
    /// arrive as three spelled-out letters.
    var spoken: String {
        switch self {
        case let .straightLine(minutes, km, speedKmh):
            return "Estimated arrival \(minutes) minute\(minutes == 1 ? "" : "s"), from a straight-line distance of \(String(format: "%.1f", km)) kilometres at an assumed \(Int(speedKmh)) kilometres an hour. Not a routed journey."
        case let .unavailable(reason, _):
            return "No arrival estimate. \(reason)"
        }
    }
}

/* A straight line between two points, at a stated speed.

   Not a route, and it must never be presented as one: it goes through buildings, ignores the M1 and
   is optimistic by roughly a third in a city laid out like Johannesburg. No detour factor is applied
   here on purpose. Multiplying by 1.3 would produce a closer arrival time and a worse label — the
   screen says “straight line”, so the number has to be one. A screen that wants road distance has to
   ask a provider for a road route.

   Both ends go through the guard first, so a coordinate nobody checked cannot reach a number by any
   path into this function. */
func straightLineArrival(from: NormalisedCoordinate, to: NormalisedCoordinate, speedKmh: Double = urbanSpeedKmh) -> ArrivalEstimate {
    guard from.valid else { return .noEstimate(from.reason ?? "There is no position to measure from.") }
    guard to.valid else { return .noEstimate(to.reason ?? "There is no position to measure to.") }
    guard speedKmh > 0, speedKmh.isFinite else { return .noEstimate("There is no speed to divide the distance by.") }
    guard let km = haversineKm(from, to) else { return .noEstimate("There is no distance between these two positions to work from.") }
    /* Both ends passed the national bounds and are still most of a country apart. That is a
       coordinate fault, and estimating a nine-hour arrival for a home visit would hide it. */
    guard km <= maxRealisticDispatchKm else {
        let spaced = kilometreFormatter.string(from: NSNumber(value: km.rounded())) ?? String(Int(km.rounded()))
        return .noEstimate("Those two positions are \(spaced) km apart, which is a coordinate fault rather than a long trip.", km: km)
    }
    /* One minute is the floor. Somebody at the gate still has to reach the door, and zero minutes is
       the number that would be read as “already there”. */
    return .straightLine(minutes: max(1, Int((km / speedKmh * 60).rounded())), km: km, speedKmh: speedKmh)
}
