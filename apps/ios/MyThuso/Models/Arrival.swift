import Foundation

/* Where is she now — the one question this product could answer for a controller and not for the
 * person waiting at home.
 *
 * The Control Tower has had coordinates, zones and arrival estimates since DispatchView was
 * written. A patient had none of it: the visit detail screen said "arrival updates will be
 * connected in the functionality phase" and that was the whole of it. This module is the patient's
 * half of the same contract, and it is deliberately *less* than the controller's rather than a copy
 * of it. apps/web/src/lib/arrival.ts is the same reasoning; the three refusals below are its.
 *
 * THREE REFUSALS, AND THEY ARE THE FEATURE.
 *
 * A patient is never shown where a nurse is standing. She is shown the suburb the nurse is in, and
 * every distance below is between two suburb centres out of GeographyData.swift. The geography
 * contract already says a visit is drawn at the centre of its suburb and never at its address — "a
 * home address beside a health service is not a location, it is a diagnosis with a doorstep" — and
 * the same sentence read the other way round is why a patient does not get a moving dot on a
 * street. A nurse's working day is her private life as much as an address is somebody's.
 *
 * A position is shown only on the day of the visit, and that is arithmetic rather than copy:
 * `state(for:)` cannot reach `.onTheDay` unless `daysUntil` returns nought, so there is no path
 * through this file that draws a nurse a fortnight early. A patient who can open this screen a
 * fortnight before her appointment and watch a nurse move around Johannesburg has been handed a
 * tracking device, and no part of arranging a home visit needs one. Before the day there is nothing
 * to watch, and the screen says so rather than drawing an empty map.
 *
 * No arrival time is claimed. The number is a straight line at a stated speed, exactly as it is on
 * the dispatch board, and the sentence carrying it says so in the same breath. No routing provider
 * is connected; a straight line through Johannesburg is optimistic by roughly a third and knows
 * nothing about the M1, a school run or the visit she is finishing first.
 *
 * WHAT BELONGS IN A CONTRACT AND IS NOT THERE YET. The refusal sentences below, and the fact that a
 * nurse is Sister Naledi Mokoena working out of Rosebank — that fixture is typed into DispatchView
 * as well, where she is nurse N-114, and two copies of a person is exactly the drift
 * packages/catalog exists to stop. Both are reported rather than invented a third time.
 *
 * Nothing here reads a device. dispatch is not connected, the positions are the contract's own zone
 * centres, and no location permission is declared by this target — a boundary check fails the build
 * if one ever is. */

/// The nurse this account's visits are assigned to. Named here so the screens that show her read
/// one fixture; it belongs in a contract beside the dispatch roster.
struct AssignedNurse {
    let name: String
    let role: String
    let initials: String
    /// A suburb in geography.json, never a coordinate. What a patient is told is the suburb.
    let area: String
}

enum Arrival {
    static let nurse = AssignedNurse(name: "Sister Naledi Mokoena", role: "Registered Nurse (SANC)",
                                     initials: "SN", area: "Rosebank")

    /* The sentences a patient is owed when there is nothing to show. Each says what is refused and
       leaves the reader somewhere to stand, which is the difference between a state and a blank. */
    enum Refusal {
        static let anotherDay = "Nobody is on the way yet, so there is nothing to follow. You will see where she is on the day of your visit."
        /* The rule behind that, said once, in the list of what this screen is not — rather than
           repeated verbatim under the figure it has already explained. */
        static let onlyOnTheDay = "MyThuso shows you where a nurse is on the day of your visit and not before. A nurse’s whereabouts between visits is her own, in the same way your address is yours."
        static let noWindow = "This visit has no time yet, so there is nobody assigned to be on the way. When a nurse accepts it you will be told who is coming and when."
        static let finished = "This visit is not ahead of you, so there is nothing to follow. What happened at it is in the visit itself."
        static let notAnArrivalTime = "This is not an arrival time. It is the distance between two suburbs, divided by a speed — it does not know the traffic, the road, or the visit she is finishing first."
        static let noDoorstep = "A nurse is drawn in the suburb she is working in, and your visit is drawn in the centre of yours — at both ends, at every zoom."
        static let nothingIsMeasured = "Nothing on this screen is being measured. No nurse’s device is read, no arrival is timed against your window, and nobody has been told you are watching."
    }

    /// Which list a visit is in. The screen behaves differently for a visit behind you, and it
    /// should not have to work that out from a status word.
    enum Group { case upcoming, past, cancelled }

    enum State {
        /// The day of the visit. A suburb for her, a suburb for you, and a line between them.
        case onTheDay(from: Geography.Zone, to: Geography.Zone, estimate: ArrivalEstimate)
        /// Ahead of the day. The suburb is drawn; she is not.
        case anotherDay(to: Geography.Zone, days: Int, refusal: String)
        /// No time has been given, so nobody has been asked to come.
        case noWindow(to: Geography.Zone?, refusal: String)
        /// The address is not in a suburb MyThuso works in, in the contract's own words.
        case outsideCoverage(area: String, refusal: String, why: String)
        case finished(refusal: String)

        /// The suburb the visit is in, wherever there is one. The map draws this and nothing else
        /// when there is no nurse to draw.
        var destination: Geography.Zone? {
            switch self {
            case let .onTheDay(_, to, _): return to
            case let .anotherDay(to, _, _): return to
            case let .noWindow(to, _): return to
            case .outsideCoverage, .finished: return nil
            }
        }
        var origin: Geography.Zone? {
            if case let .onTheDay(from, _, _) = self { return from }
            return nil
        }
        /// True on exactly one day. Everything the screen shows about a position is behind this.
        var isWatching: Bool { if case .onTheDay = self { return true }; return false }
        var refusal: String? {
            switch self {
            case .onTheDay: return nil
            case let .anotherDay(_, _, refusal): return refusal
            case let .noWindow(_, refusal): return refusal
            case let .outsideCoverage(_, refusal, _): return refusal
            case let .finished(refusal): return refusal
            }
        }
    }

    /* Whole days between today in Johannesburg and a date, counted in the scheduling contract's own
       timezone rather than the device's. A phone set to London must not turn tomorrow's visit into
       today's, which is exactly the mistake that would show a patient a position a day early. */
    static func daysUntil(_ date: Date, from now: Date = Date()) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Scheduling.zone
        let start = calendar.startOfDay(for: now)
        let end = calendar.startOfDay(for: date)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }

    /// The suburb half of "Home visit · Melville". A visit carries an address for the nurse who is
    /// going there; what a map is allowed to know about it is the suburb, and this is that
    /// narrowing — the only place an address is turned into a position in this app.
    static func area(of address: String) -> String {
        (address.components(separatedBy: "·").last ?? address).trimmingCharacters(in: .whitespaces)
    }

    /* No routing provider is connected, and every request for one comes back unavailable — which is
       also what a real provider returns when it is down. So this is the path the screen was written
       against from its first day rather than the one nobody tries. Nothing is quietly redrawn as
       the straight line: the screen asks a different question, by name, and prints the answer's
       basis beside it. */
    static func route(from: Geography.Zone, to: Geography.Zone) -> ArrivalEstimate {
        .noEstimate("No routing provider is connected, so no road route can be drawn or timed.")
    }

    static func state(for visit: BookedVisit, group: Group = .upcoming) -> State {
        guard group == .upcoming else { return .finished(refusal: Refusal.finished) }
        let name = area(of: visit.address)
        guard let to = Geography.zone(named: name) else {
            let outside = Geography.refusal("outside-coverage")
            return .outsideCoverage(area: name, refusal: outside.sentence, why: outside.why)
        }
        guard visit.kind != "asap", let date = visit.date else {
            return .noWindow(to: to, refusal: Refusal.noWindow)
        }
        let days = daysUntil(date)
        guard days == 0 else { return .anotherDay(to: to, days: days, refusal: Refusal.anotherDay) }
        /* A nurse with no suburb is a nurse whose device is telling us nothing, and the geography
           contract has a sentence for that already. It is said out loud rather than left as an
           absent pin. */
        guard let from = Geography.zone(named: nurse.area) else {
            return .noWindow(to: to, refusal: Geography.refusal("no-position-shared").sentence)
        }
        return .onTheDay(from: from, to: to, estimate: estimate(from: from, to: to))
    }

    /* Both ends go through Geo.swift's coordinate guard rather than straight into the arithmetic,
       so a zone centre that somebody mistyped into geography.json cannot reach a number by any path
       — the same gate the dispatch board's estimates pass through. */
    static func estimate(from: Geography.Zone, to: Geography.Zone) -> ArrivalEstimate {
        let asked = route(from: from, to: to)
        if asked.minutes != nil { return asked }
        /* Same suburb. A straight line between one zone centre and itself is nought kilometres, and
           "1 minute away" is a promise about a doorstep this screen has refused to know about. */
        guard from.id != to.id else {
            return .noEstimate("She is working in \(to.name), which is your own suburb. There is no distance here to measure, and how long a nurse takes to reach a door on the same streets is not something this screen knows.")
        }
        let start = normaliseSouthAfricaLngLat(lat: from.at.lat, lng: from.at.lng,
                                               source: "\(nurse.name)’s working suburb")
        let end = normaliseSouthAfricaLngLat(lat: to.at.lat, lng: to.at.lng,
                                             source: "the centre of \(to.name)")
        return straightLineArrival(from: start, to: end)
    }

    /// The basis, in a patient's words rather than a controller's. The figures come off the
    /// estimate — there is no way to print a number here without the thing it was derived from,
    /// which is the rule ArrivalEstimate exists to enforce.
    static func basisSentence(_ estimate: ArrivalEstimate) -> String {
        switch estimate {
        case let .straightLine(_, km, speedKmh):
            return "Measured in a straight line over \(String(format: "%.1f", km)) km at \(Int(speedKmh)) km/h. That is not a road route."
        case let .unavailable(reason, _):
            return reason
        }
    }

    /// "12", or the word rather than a dash. An empty cell reads as nothing at all to a screen
    /// reader and a dash reads as one.
    static func minutesText(_ estimate: ArrivalEstimate) -> String {
        estimate.minutes.map(String.init) ?? "Estimating"
    }

    /// What the screen says about how precise any of this is, read from the contract rather than
    /// restated. Three decimal places is about a hundred metres: enough to draw a suburb and not
    /// enough to find a door.
    static var precisionSentence: String { Geography.precisionSentence }
    static var coverageSentence: String { Geography.coverageSentence }
    static var addressRule: Geography.GeographyRule { Geography.privacyRules.first { $0.id == "address-is-not-a-pin" }! }
    static var historyRule: Geography.GeographyRule { Geography.privacyRules.first { $0.id == "no-history-drawn" }! }
}
