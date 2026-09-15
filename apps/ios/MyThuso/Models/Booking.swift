import Foundation

/* Booking a visit, choosing who comes, where a booking stands, the thread between a patient and the
   nurse on one visit, and handing a Gilbert conversation to the nurse queue.

   Every sentence is packages/catalog/booking.json’s (or assistant.json’s, for the handover), generated
   into BookingData.swift and AssistantData.swift. This file is the arithmetic beside that data, and it
   is the same arithmetic as packages/engines/src/access/domain/booking.ts, thread.ts and handover.ts,
   which the web imports directly. Native apps cannot import TypeScript, so the order of the refusals is
   copied here by hand — and it is the order that matters, not the wording, which is never typed.

   WHAT IT REFUSES

   A nurse is offered only while her badge is current. Continuity is a preference, never an override:
   a patient asking for the nurse she saw last time does not get somebody whose clearance lapsed last
   night. The take-visit gate decides, from VettingStore on every read, so a nurse suspended in the
   console is withdrawn here by the same arithmetic rather than by somebody remembering.

   As soon as possible belongs to whoever is nearest. Asking for one nurse and asking for the first
   person free are two different requests, and pretending otherwise would promise a named nurse at an
   hour nobody offered.

   A named nurse’s hours are the day’s hours less the ones already held against her. An hour that is
   not offered is not drawn, rather than drawn and refused.

   Nothing moves backwards. A cancelled booking is not confirmed afterwards, and an as-soon-as-possible
   booking is not confirmed at all until there is an hour to hold — a made-up hour is the invented slot
   the whole contract refuses.

   A thread carries words only, is kept short, and closes with the visit. There is no attachment
   parameter anywhere in this file, which is how “nothing can be attached” is enforced on this platform:
   not by a check, but by there being nothing to check.

   A handover’s urgency only ever rises. */

// MARK: - The generated contract’s shapes

struct BookingPersonOption: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
}

struct BookingStateWords: Identifiable, Hashable {
    let id: String
    let name: String
    let patientWords: String
    let event: String
}

struct BookingTransition: Hashable {
    let from: String?
    let to: String
}

struct BookingRefusal: Identifiable, Hashable {
    let id: String
    /// METHOD /path@version, or nil for booking.json’s own refusals that answer no route.
    let route: String?
    let status: Int?
    let sentence: String
}

struct BookingThreadClosed: Identifiable, Hashable {
    let id: String
    let sentence: String
}

// MARK: - The capability’s own refusals, by the slug of their words

extension Capabilities {
    /* Addressed by the slug of the sentence rather than by an index, which is what
       apps/web/src/lib/capabilities.ts does. Reword the refusal in the contract and the slug stops
       resolving — loudly in a debug build — instead of the screen going on refusing in words nobody
       says any more. */
    static func refusalSlug(_ sentence: String) -> String {
        var slug = ""
        var gap = false
        for scalar in sentence.lowercased().unicodeScalars {
            if ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar) {
                if gap && !slug.isEmpty { slug.append("-") }
                slug.unicodeScalars.append(scalar)
                gap = false
            } else {
                gap = true
            }
        }
        return slug
    }

    static func simulationRefusal(_ id: String, _ slug: String) -> String? {
        simulation(id)?.refuses.first { refusalSlug($0) == slug }
    }
}

// MARK: - Who may be asked for

enum BookingState: String, CaseIterable, Identifiable {
    case requested, confirmed, cancelled
    var id: String { rawValue }
    var words: BookingStateWords { BookingData.states.first { $0.id == rawValue } ?? BookingData.states[0] }
}

/// A nurse as this phone’s own vetting register sees her today.
struct NurseCandidate: Identifiable, Hashable {
    let id: String
    let name: String
    /// Her working suburb as the register writes it, which is not always one dispatch reaches.
    let zone: String
    let covered: Bool
    let badgeCurrent: Bool
    /// The booking capability’s refusal sentence, or nil when she is offered.
    let notOfferedBecause: String?
    /// Straight line between suburb centres, for ordering only. Nil outside coverage.
    let distanceKm: Double?
    var offered: Bool { covered && badgeCurrent && notOfferedBecause == nil }
    var worksIn: String { Booking.fill(BookingData.Person.worksIn, ["zone": zone]) }
}

enum PersonChoice: Hashable {
    case nearest
    case previous(String)
    case named(String)
    var nurseId: String? {
        switch self {
        case .nearest: return nil
        case .previous(let id), .named(let id): return id
        }
    }
}

struct PersonOptions {
    let offered: [NurseCandidate]
    let notOffered: [NurseCandidate]
    /// The nurse this person saw last and whether she may be asked for today. Nil when there was nobody.
    let previous: (candidate: NurseCandidate, offered: Bool)?
}

enum Booking {
    /// The route a thread message is written to, as booking.json and the Access engine name it.
    static let threadRoute = "POST /v1/access/visit-threads/{bookingRef}/messages@1"

    static func fill(_ text: String, _ values: [String: String]) -> String {
        values.reduce(text) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
    }

    /// booking.json’s refusal by id, and by route where two routes could share one. Nil for an id the
    /// contract does not carry, which a debug build treats as the defect it is.
    static func refusal(_ id: String, route: String? = nil) -> BookingRefusal? {
        let found = BookingData.refusals.first { $0.id == id && (route == nil || $0.route == route) }
        assert(found != nil, "packages/catalog/booking.json names no refusal \(id)")
        return found
    }

    /* The suburb a visit is in, read from where it is. The address is free text, so it is the first
       zone whose name it contains; failing that, the area the home screen was set to. Nil when neither
       is one dispatch reaches, which leaves every nurse unordered rather than ordered from a guess. */
    static func visitZone(address: String, area: String) -> Geography.Zone? {
        let named = Geography.zones.first { address.localizedCaseInsensitiveContains($0.name) }
        return named ?? Geography.zones.first { area.localizedCaseInsensitiveContains($0.name) }
    }

    /* Why the roster will not offer her, or nothing. Coverage first, because nothing about a person’s
       clearance changes whether MyThuso works in her suburb. Then a lapse, then an unfinished
       application: a clearance that ran out last night and four checks still outstanding are
       different situations, and one sentence for both would tell an applicant halfway through her
       paperwork that something of hers had lapsed. The same order as apps/web/src/lib/roster.ts. */
    static func candidates(register: [VettingSubject], near here: Geography.Zone?) -> [NurseCandidate] {
        let outside = Capabilities.simulationRefusal("booking", "book-outside-a-zone-dispatch-can-reach")
        let lapsed = Capabilities.simulationRefusal("booking", "offer-a-nurse-whose-simulated-vetting-has-lapsed")
        let unfinished = Capabilities.simulationRefusal("booking", "offer-a-nurse-whose-vetting-has-not-finished")
        assert(outside != nil && lapsed != nil && unfinished != nil,
               "the booking capability no longer refuses in the words this screen looks up")
        let fallback = refusal("nurse-badge-not-current")?.sentence
        return register.filter { $0.roleId == "nurse" }.map { subject in
            let zoneName = subject.zone ?? ""
            let zone = Geography.zone(named: zoneName)
            let badge = can(subject, BookingData.Person.badgeCapability).allowed
            let reason: String?
            if zone == nil { reason = outside ?? fallback }
            else if badge { reason = nil }
            else if !summarise(subject).lapsed.isEmpty { reason = lapsed ?? fallback }
            else { reason = unfinished ?? fallback }
            let distance = zone.flatMap { mine in here.map { Geography.distanceKm(mine.at, $0.at) } }
            return NurseCandidate(id: subject.id, name: subject.name, zone: zoneName, covered: zone != nil,
                                  badgeCurrent: badge, notOfferedBecause: reason, distanceKm: distance)
        }
    }

    /// Everybody who may be asked for, nearest first, and everybody who may not, with the reason beside them.
    static func options(_ candidates: [NurseCandidate], previous nurseId: String?) -> PersonOptions {
        let offered = candidates.filter(\.offered).sorted { first, second in
            let a = first.distanceKm ?? .infinity, b = second.distanceKm ?? .infinity
            return a == b ? first.id < second.id : a < b
        }
        let seen = nurseId.flatMap { id in candidates.first { $0.id == id } }
        return PersonOptions(offered: offered, notOffered: candidates.filter { !$0.offered },
                             previous: seen.map { (candidate: $0, offered: $0.offered) })
    }

    /// Nil when the choice may be booked against; otherwise the refusal shown instead of her name.
    static func refuseChoice(_ candidates: [NurseCandidate], _ choice: PersonChoice) -> BookingRefusal? {
        guard let id = choice.nurseId else { return nil }
        guard let nurse = candidates.first(where: { $0.id == id }) else { return refusal("slot-not-offered") }
        if !nurse.badgeCurrent { return refusal("nurse-badge-not-current") }
        return nurse.offered ? nil : refusal("slot-not-offered")
    }

    /* The nurse on this person’s most recent completed visit, if this phone knows of one. The only
       completed visit the preview holds is the Health Passport’s, for its holder, and the nurse named
       on it is looked up in the register rather than trusted by name. Anybody else in the family has
       had no visit, and is told so. */
    static func previousNurseId(for patient: String, register: [VettingSubject]) -> String? {
        guard patient == Passport.holder.name else { return nil }
        return register.first { $0.roleId == "nurse" && $0.name == Passport.nurse.name }?.id
    }

    // MARK: The offer

    private static func minutes(_ hhmm: String) -> Int? {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }

    /* The day’s hours, less every hour that would overlap a visit already held with this nurse on this
       day — overlap measured with both visits’ own lengths, so a forty-minute visit at nine holds the
       nine o’clock hour and nothing from ten. A nearest-nurse booking holds nobody until somebody is
       assigned, so with no nurse named every hour is offered.

       roster.json’s shift arithmetic is not applied here: it is not generated into Swift, and with
       today’s catalogue every hour fits the shift. The engine applies it. */
    static func offeredHours(on day: Date, minutes length: Int, nurseId: String?, visits: [BookedVisit]) -> [String] {
        guard let nurseId else { return Scheduling.slots }
        let dayId = Scheduling.isoDay(day)
        let held = visits.filter { $0.nurseId == nurseId && $0.isScheduled && $0.date.map(Scheduling.isoDay) == dayId }
        return Scheduling.slots.filter { hour in
            guard let start = minutes(hour) else { return false }
            return !held.contains { visit in
                guard let heldStart = visit.start.flatMap(minutes) else { return false }
                return start < heldStart + visit.service.duration && heldStart < start + length
            }
        }
    }

    /// The sentence under the hours when some were taken away, with her name in it. Nil when none were.
    static func hoursNote(offered: [String], nurseName: String?) -> String? {
        guard let nurseName, offered.count < Scheduling.slots.count else { return nil }
        return fill(offered.isEmpty ? BookingData.Time.noHoursLeft : BookingData.Time.fewerHours, ["nurse": nurseName])
    }

    // MARK: Where a booking stands

    static func mayMove(from: BookingState?, to: BookingState) -> Bool {
        BookingData.transitions.contains { $0.from == from?.rawValue && $0.to == to.rawValue }
    }

    /// A booking asked for. Every booking starts here, because it is the one arrow from nothing.
    static func request() -> BookingState? { mayMove(from: nil, to: .requested) ? .requested : nil }

    /// Care accepted — in this preview, the simulated roster. Refused after a cancellation and without an hour.
    static func confirm(_ state: BookingState, hasTime: Bool) -> Result<BookingState, BookingRefusalError> {
        if state == .cancelled { return .failure(BookingRefusalError(refusal: refusal("confirm-after-cancel"))) }
        if state == .confirmed { return .success(state) }
        if !hasTime { return .failure(BookingRefusalError(refusal: refusal("confirm-without-a-time"))) }
        return mayMove(from: state, to: .confirmed) ? .success(.confirmed) : .failure(BookingRefusalError(refusal: nil))
    }

    static func cancel(_ state: BookingState) -> BookingState { mayMove(from: state, to: .cancelled) ? .cancelled : state }

    /* Where a visit stands, worked out rather than stored. It is asked for, then the simulated roster
       confirms it at once if it has an hour; an as-soon-as-possible visit is refused that confirmation
       and stays asked for. Worked out every time so that moving an as-soon-as-possible visit to an hour
       confirms it by the same arithmetic, with no second state to forget to update. */
    static func state(of visit: BookedVisit, cancelled: Bool = false) -> BookingState {
        guard let asked = request() else { return .requested }
        let settled: BookingState
        switch confirm(asked, hasTime: visit.isScheduled && visit.date != nil && visit.start != nil) {
        case .success(let state): settled = state
        case .failure: settled = asked
        }
        return cancelled ? cancel(settled) : settled
    }

    // MARK: The thread

    /// Why a visit’s thread is closed, or nil while it is open.
    static func threadClosed(for visit: BookedVisit, cancelled: Bool, now: Date = Date()) -> BookingThreadClosed? {
        if cancelled { return closedBecause("booking-cancelled") }
        if let ends = visit.endsAt, ends <= now { return closedBecause("visit-completed") }
        return nil
    }

    static func closedBecause(_ id: String) -> BookingThreadClosed? { BookingData.Thread.closedBecause.first { $0.id == id } }

    /// How long a message is, counted as a person counts it: an emoji or an accented letter is one.
    static func length(_ words: String) -> Int { words.trimmingCharacters(in: .whitespacesAndNewlines).count }

    /* The route’s order: closed first, then the length. A blank message is not refused because it is
       never sent — the button does not act on one. */
    static func postRefusal(_ words: String, closed: Bool) -> BookingRefusal? {
        if closed { return refusal("thread-closed", route: threadRoute) }
        if length(words) > BookingData.Thread.maxCharacters { return refusal("message-too-long", route: threadRoute) }
        return nil
    }

    // MARK: A reference that says it is simulated

    /* FNV-1a, as packages/engines/src/access/domain/contract.ts computes it — over UTF-16 code units,
       because that is what JavaScript’s charCodeAt reads — so the same seed gives the same reference on
       every platform. It identifies; it protects nothing. */
    static func simulatedRef(_ prefix: String, _ seed: String) -> String {
        let units = Array(seed.utf16)
        var hash: UInt32 = 0x811c9dc5
        for unit in units { hash ^= UInt32(unit); hash = hash &* 0x01000193 }
        var second: UInt32 = hash ^ 0x5bd1e995
        for unit in units.reversed() { second ^= UInt32(unit); second = second &* 0x01000193 }
        let hex = { (value: UInt32) in String(format: "%08X", value) }
        return "SIM-\(prefix)-\(hex(hash).prefix(6))\(hex(second).prefix(2))"
    }
}

struct BookingRefusalError: Error {
    let refusal: BookingRefusal?
}

extension BookedVisit {
    /// When the visit ends, as an instant. Nil for a visit with no hour.
    var endsAt: Date? {
        guard isScheduled, let date, let start else { return nil }
        let parts = start.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Scheduling.zone
        guard let day = calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: date) else { return nil }
        return day.addingTimeInterval(TimeInterval(service.duration * 60))
    }
}

// MARK: - A message on a visit’s thread

struct VisitThreadMessage: Identifiable, Hashable {
    enum Role: String { case patient, nurse }
    let id: UUID
    let role: Role
    let words: String
    let at: Date
}

// MARK: - The nurse queue a Gilbert conversation is handed to

struct GilbertHandoverRecord: Hashable {
    let reference: String
    let conversation: String
    let urgency: String
}

enum HandoverQueue {
    /* The contract lists the urgencies most urgent first, so a code’s rank is how far from the end it is. */
    static func rank(_ urgency: String) -> Int {
        let ids = Gilbert.handover.urgency.map(\.id)
        return ids.count - (ids.firstIndex(of: urgency) ?? ids.count)
    }

    /* Whether any turn of the conversation got the emergency answer. Whether, never which. Everything
       else is not-assessed, because no emergency word is not a finding that something is not urgent. */
    static func urgency(emergencyRaised: Bool) -> GilbertUrgency? {
        Gilbert.handover.urgency.first { $0.id == (emergencyRaised ? "emergency" : "not-assessed") }
    }

    /* Never lowered: an equal or calmer summary for a conversation already handed over sends nothing,
       and the queue keeps the higher code. The result says whether this call sent anything, so the
       screen can say it was handed over already, truthfully. */
    static func handOver(_ queue: [GilbertHandoverRecord], conversation: String, urgency: String, at: Date = Date())
        -> (queue: [GilbertHandoverRecord], record: GilbertHandoverRecord, sentNow: Bool) {
        if let held = queue.first(where: { $0.conversation == conversation }), rank(urgency) <= rank(held.urgency) {
            return (queue, held, false)
        }
        let seed = "\(conversation)|\(urgency)|\(ISO8601DateFormatter().string(from: at))"
        let record = GilbertHandoverRecord(reference: Booking.simulatedRef("HO", seed), conversation: conversation, urgency: urgency)
        return (queue.filter { $0.conversation != conversation } + [record], record, true)
    }
}
