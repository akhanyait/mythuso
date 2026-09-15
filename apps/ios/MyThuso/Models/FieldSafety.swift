import Foundation
import Combine

/* The nurse safety suite on iOS, and why it is two files.
 *
 * FieldSafetyData.swift is written by scripts/emit-field-safety.mjs from packages/catalog/field-safety.json:
 * the grace, the extension steps and ceiling, the panic window, every sentence and every refusal. This
 * file is the arithmetic of packages/engines/src/safety/domain, hand-written because a native app cannot
 * run the engine, and it asks the questions the engine asks in the same order, so a refusal on this phone
 * is the refusal the web and the engine would give.
 *
 * In memory and nowhere else. A timer or a panic in this preview is gone when the app is, which is true of
 * a preview and would be a defect in the product. The desk is seeded by running these same rules at
 * earlier times, so every age, deadline and window on the board is arithmetic rather than a typed row.
 *
 * Nothing here contacts anybody. The position a panic shares is the centre of the suburb the nurse works
 * in, rounded to the precision packages/catalog/geography.json declares, and it is forgotten the moment
 * sharing stops.
 */
struct FieldSafetyChoice: Identifiable, Hashable {
    let id: String
    let label: String
    let flag: Bool
}

struct FieldSafetyRefusal: Hashable {
    let id: String
    let status: Int
    let statement: String
}

enum FieldSafety {
    static func refusal(_ id: String) -> FieldSafetyRefusal {
        refusals.first { refusal in refusal.id == id } ?? FieldSafetyRefusal(id: id, status: 500, statement: id)
    }
    static func fill(_ sentence: String, _ values: [String: String]) -> String {
        values.reduce(sentence) { text, pair in text.replacingOccurrences(of: "{" + pair.key + "}", with: pair.value) }
    }
    static func label(_ list: [FieldSafetyChoice], _ id: String) -> String {
        list.first { choice in choice.id == id }?.label ?? id
    }
    /* South African time whatever the phone is set to, as the engine does: a desk in Johannesburg told a
       window ends at the wrong hour has been told the wrong thing at the worst moment. */
    private static let clockFormat: DateFormatter = {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_ZA")
        format.timeZone = TimeZone(identifier: "Africa/Johannesburg")
        format.dateFormat = "HH:mm"
        return format
    }()
    static func clock(_ date: Date) -> String { clockFormat.string(from: date) }
    static func serviceMinutes(_ id: String) -> Int? { CareService.all.first { service in service.id == id }?.duration }
    static func minutes(_ count: Int) -> TimeInterval { TimeInterval(count) * 60 }

    enum Standing: String { case running, overdue, closed }

    struct Extension {
        let at: Date
        let minutes: Int
        let reasonId: String
    }
    /// An overdue is an episode: when the deadline passed, who at the desk picked it up, when the nurse answered, and why it was closed.
    struct Episode {
        let since: Date
        var acknowledgedAt: Date? = nil
        var answeredAt: Date? = nil
        var silencedReasonId: String? = nil
    }
    struct VisitTimer: Identifiable {
        let id: String
        let appointmentRef: String
        let serviceId: String
        let nurseId: String
        let startedAt: Date
        var dueAt: Date
        var extensions: [Extension] = []
        var checkIns: [Date] = []
        var overdue: Episode? = nil
        var announcedFor: Date? = nil
        var closedAt: Date? = nil
        var closedBySigning = false

        var extensionUsed: Int { extensions.reduce(0) { total, added in total + added.minutes } }
        var extensionLeft: Int { FieldSafety.maxExtensionMinutes - extensionUsed }
        var stepsOffered: [Int] { FieldSafety.extensionSteps.filter { step in step <= extensionLeft } }
        func standing(at now: Date) -> Standing { closedAt != nil ? .closed : (now >= dueAt ? .overdue : .running) }
        func minutesLeft(at now: Date) -> Int { max(0, Int((dueAt.timeIntervalSince(now) / 60).rounded(.up))) }
    }
    struct Position {
        let lat: Double
        let lng: Double
        let at: Date
    }
    struct Panic: Identifiable {
        let id: String
        let nurseId: String
        let appointmentRef: String?
        let raisedAt: Date
        let shareEndsAt: Date
        var acknowledgedAt: Date? = nil
        var resolvedAt: Date? = nil
        var outcomeId: String? = nil
        /// The latest position, while sharing. Never a list.
        var position: Position? = nil

        /// Whichever comes first: the window running out, or the desk resolving the panic.
        var sharingEndsAt: Date { min(shareEndsAt, resolvedAt ?? .distantFuture) }
        func isSharing(at now: Date) -> Bool { now < sharingEndsAt }
        var standing: String { resolvedAt != nil ? "resolved" : (acknowledgedAt != nil ? "acknowledged" : "raised") }
    }
    /// A row on the desk: a nurse and a suburb, never the service, the person visited or the address.
    struct DeskRow: Identifiable {
        let id: String
        let isPanic: Bool
        let nurse: String
        let suburb: String
        let raisedAt: Date
        let ageMinutes: Int
        let acknowledgedAt: Date?
        let answeredAt: Date?
        let outcome: String?
        let sharingEndsAt: Date?
        let sharing: Bool
        let open: Bool
        var rank: Int { !open ? 3 : (acknowledgedAt != nil ? 2 : (isPanic ? 0 : 1)) }
    }
    enum PositionRead {
        case shared(Position?)
        case ended(String)
    }
}

/* One store for the nurse and the desk, as the web has one module for both: a panic pressed on the visit
   is the row the Control Tower picks up, on the same phone, in the same session. */
@MainActor final class FieldSafetyStore: ObservableObject {
    static let shared = FieldSafetyStore()
    /// The nurse whose day the workspace draws.
    static let nurseOnShift = "N-205"

    @Published private(set) var timers: [FieldSafety.VisitTimer] = []
    @Published private(set) var panics: [FieldSafety.Panic] = []
    @Published private(set) var now = Date()
    private var serial = 413
    private var ticking: Task<Void, Never>?

    private init() { seed(at: Date()) }

    /* The clock moves on the simulated feed cadence while a screen is looking, which is also how often a
       sharing panic receives its next position. It moves time; it animates nothing. */
    func startClock() {
        guard ticking == nil else { return }
        advance(to: Date())
        ticking = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(FieldSafety.positionEverySeconds) * 1_000_000_000)
                self?.advance(to: Date())
            }
        }
    }

    func advance(to date: Date) {
        now = date
        timers = timers.map { timer in
            var next = timer
            if next.closedAt == nil, date >= next.dueAt, next.announcedFor != next.dueAt {
                next.announcedFor = next.dueAt
                next.overdue = FieldSafety.Episode(since: next.dueAt)
            }
            return next
        }
        panics = panics.map { panic in
            var next = panic
            if next.isSharing(at: date) {
                let stale = next.position.map { position in date.timeIntervalSince(position.at) >= TimeInterval(FieldSafety.positionEverySeconds) } ?? true
                if stale { next.position = Self.feed(next, at: date) }
            } else {
                next.position = nil
            }
            return next
        }
    }

    private func nextRef(_ prefix: String) -> String {
        serial += 1
        return prefix + "-0" + String(serial)
    }
    private static func nurse(_ id: String) -> DispatchNurse? { Dispatch.nurses.first { nurse in nurse.id == id } }

    /* The simulated feed: the centre of the suburb the nurse works in, rounded on the way in. There is
       never an address to leak, because the preview has none. */
    static func feed(_ panic: FieldSafety.Panic, at date: Date) -> FieldSafety.Position? {
        guard panic.isSharing(at: date), let nurse = nurse(panic.nurseId), let zone = Geography.zone(named: nurse.area) else { return nil }
        let point = Geography.blur(zone.at)
        return FieldSafety.Position(lat: point.lat, lng: point.lng, at: date)
    }

    static func makeTimer(id: String, appointmentRef: String, serviceId: String, nurseId: String, at date: Date) -> FieldSafety.VisitTimer? {
        guard let minutes = FieldSafety.serviceMinutes(serviceId) else { return nil }
        return FieldSafety.VisitTimer(id: id, appointmentRef: appointmentRef, serviceId: serviceId, nurseId: nurseId,
                                      startedAt: date, dueAt: date.addingTimeInterval(FieldSafety.minutes(minutes + FieldSafety.graceMinutes)))
    }

    /* A late nurse, an open panic and one resolved this morning, each run through these rules at the time
       it happened and moved forward to now. */
    private func seed(at start: Date) {
        let others = Dispatch.nurses.filter { nurse in nurse.id != Self.nurseOnShift && Geography.zone(named: nurse.area) != nil }
        guard others.count >= 3 else { return }
        let lateService = "senior"
        let lateBy = (FieldSafety.serviceMinutes(lateService) ?? 0) + FieldSafety.graceMinutes + 12
        if let late = Self.makeTimer(id: "CHK-0412", appointmentRef: "TH-2044", serviceId: lateService, nurseId: others[0].id,
                                     at: start.addingTimeInterval(-FieldSafety.minutes(lateBy))) {
            timers = [late]
        }
        let window = FieldSafety.minutes(FieldSafety.panicWindowMinutes)
        let pressedAt = start.addingTimeInterval(-FieldSafety.minutes(4))
        var open = FieldSafety.Panic(id: "PNC-0088", nurseId: others[1].id, appointmentRef: "TH-2046", raisedAt: pressedAt,
                                     shareEndsAt: pressedAt.addingTimeInterval(window))
        open.position = Self.feed(open, at: start.addingTimeInterval(-TimeInterval(FieldSafety.positionEverySeconds)))
        let morning = start.addingTimeInterval(-TimeInterval(3 * 3600))
        var resolved = FieldSafety.Panic(id: "PNC-0081", nurseId: others[2].id, appointmentRef: "TH-2031", raisedAt: morning,
                                         shareEndsAt: morning.addingTimeInterval(window))
        resolved.acknowledgedAt = morning.addingTimeInterval(FieldSafety.minutes(1))
        resolved.resolvedAt = morning.addingTimeInterval(FieldSafety.minutes(6))
        resolved.outcomeId = "pressed-by-mistake"
        panics = [open, resolved]
        advance(to: start)
    }

    // MARK: - The nurse

    func timer(for appointmentRef: String) -> FieldSafety.VisitTimer? { timers.last { timer in timer.appointmentRef == appointmentRef } }
    func panic(for appointmentRef: String) -> FieldSafety.Panic? { panics.last { panic in panic.appointmentRef == appointmentRef } }

    /// appointment.in_progress, as the preview has it: the visit code matched at the door.
    @discardableResult
    func startVisit(_ appointmentRef: String, serviceId: String, codeMatched: Bool) -> FieldSafetyRefusal? {
        advance(to: Date())
        if let running = timer(for: appointmentRef), running.closedAt == nil { return nil }
        guard codeMatched else { return FieldSafety.refusal("timer-without-a-matched-code") }
        guard let made = Self.makeTimer(id: nextRef("CHK"), appointmentRef: appointmentRef, serviceId: serviceId,
                                        nurseId: Self.nurseOnShift, at: now) else {
            return FieldSafety.refusal("timer-for-an-unknown-service")
        }
        timers.append(made)
        return nil
    }

    private func changeTimer(where match: (FieldSafety.VisitTimer) -> Bool,
                             _ body: (inout FieldSafety.VisitTimer, Date) -> FieldSafetyRefusal?) -> FieldSafetyRefusal? {
        advance(to: Date())
        guard let index = timers.lastIndex(where: match) else { return FieldSafety.refusal("checkin-after-close") }
        var copy = timers[index]
        if let refused = body(&copy, now) { return refused }
        timers[index] = copy
        return nil
    }
    /* A nurse answering an open episode marks it answered. It does not close it: only the desk does, with
       a reason, because the desk was the one told. */
    private static func answer(_ timer: inout FieldSafety.VisitTimer, at date: Date) {
        guard var episode = timer.overdue, episode.answeredAt == nil, episode.silencedReasonId == nil else { return }
        episode.answeredAt = date
        timer.overdue = episode
    }

    /* Saying she is safe never moves the deadline. If it did, pressing it every quarter of an hour would
       be an extension with no reason and no ceiling, which is exactly what an extension refuses. */
    func checkIn(_ appointmentRef: String) -> FieldSafetyRefusal? {
        changeTimer(where: { timer in timer.appointmentRef == appointmentRef }) { timer, date in
            guard timer.closedAt == nil else { return FieldSafety.refusal("checkin-after-close") }
            timer.checkIns.append(date)
            Self.answer(&timer, at: date)
            return nil
        }
    }

    func extend(_ appointmentRef: String, minutes: Int, reasonId: String?) -> FieldSafetyRefusal? {
        changeTimer(where: { timer in timer.appointmentRef == appointmentRef }) { timer, date in
            guard timer.closedAt == nil else { return FieldSafety.refusal("checkin-after-close") }
            guard let reasonId, FieldSafety.extensionReasons.contains(where: { reason in reason.id == reasonId }) else {
                return FieldSafety.refusal("extension-without-reason")
            }
            guard FieldSafety.extensionSteps.contains(minutes) else { return FieldSafety.refusal("extension-not-offered") }
            guard timer.extensionUsed + minutes <= FieldSafety.maxExtensionMinutes else { return FieldSafety.refusal("extension-limit") }
            /* From now when she is already past it, or the new deadline would have passed already. */
            timer.dueAt = max(timer.dueAt, date).addingTimeInterval(FieldSafety.minutes(minutes))
            timer.extensions.append(FieldSafety.Extension(at: date, minutes: minutes, reasonId: reasonId))
            Self.answer(&timer, at: date)
            return nil
        }
    }

    func checkOut(_ appointmentRef: String) -> FieldSafetyRefusal? { close(appointmentRef, bySigning: false) }

    /// appointment.completed, as the preview has it: the assessment signed. Closes a timer if there is one.
    @discardableResult
    func visitSigned(_ appointmentRef: String) -> FieldSafetyRefusal? {
        guard let timer = timer(for: appointmentRef), timer.closedAt == nil else { return nil }
        return close(appointmentRef, bySigning: true)
    }

    private func close(_ appointmentRef: String, bySigning: Bool) -> FieldSafetyRefusal? {
        changeTimer(where: { timer in timer.appointmentRef == appointmentRef }) { timer, date in
            guard timer.closedAt == nil else { return FieldSafety.refusal("already-closed") }
            timer.closedAt = date
            timer.closedBySigning = bySigning
            Self.answer(&timer, at: date)
            return nil
        }
    }

    /* A second press is never refused and never swallowed: the same nurse pressing again for the same
       visit while her panic is open is the panic she already has, as the engine answers it. */
    func pressPanic(_ appointmentRef: String?) -> FieldSafetyRefusal? {
        advance(to: Date())
        let alreadyOpen = panics.contains { panic in
            panic.nurseId == Self.nurseOnShift && panic.appointmentRef == appointmentRef && panic.resolvedAt == nil && panic.isSharing(at: now)
        }
        if alreadyOpen { return nil }
        var panic = FieldSafety.Panic(id: nextRef("PNC"), nurseId: Self.nurseOnShift, appointmentRef: appointmentRef, raisedAt: now,
                                      shareEndsAt: now.addingTimeInterval(FieldSafety.minutes(FieldSafety.panicWindowMinutes)))
        panic.position = Self.feed(panic, at: now)
        panics.append(panic)
        return nil
    }

    // MARK: - The desk

    private func changePanic(_ id: String, _ body: (inout FieldSafety.Panic, Date) -> FieldSafetyRefusal?) -> FieldSafetyRefusal? {
        advance(to: Date())
        guard let index = panics.firstIndex(where: { panic in panic.id == id }) else { return FieldSafety.refusal("panic-already-resolved") }
        var copy = panics[index]
        if let refused = body(&copy, now) { return refused }
        panics[index] = copy
        return nil
    }

    func pickUp(_ row: FieldSafety.DeskRow) -> FieldSafetyRefusal? {
        if row.isPanic {
            return changePanic(row.id) { panic, date in
                guard panic.resolvedAt == nil else { return FieldSafety.refusal("panic-already-resolved") }
                if panic.acknowledgedAt == nil { panic.acknowledgedAt = date }
                return nil
            }
        }
        return changeTimer(where: { timer in timer.id == row.id }) { timer, date in
            guard var episode = timer.overdue, episode.silencedReasonId == nil else { return FieldSafety.refusal("nothing-to-silence") }
            if episode.acknowledgedAt == nil { episode.acknowledgedAt = date }
            timer.overdue = episode
            return nil
        }
    }

    func closeOverdue(_ checkinRef: String, reasonId: String?) -> FieldSafetyRefusal? {
        changeTimer(where: { timer in timer.id == checkinRef }) { timer, _ in
            guard var episode = timer.overdue, episode.silencedReasonId == nil else { return FieldSafety.refusal("nothing-to-silence") }
            guard let reason = FieldSafety.silenceReasons.first(where: { reason in reason.id == reasonId }) else {
                return FieldSafety.refusal("overdue-silenced-without-reason")
            }
            guard episode.acknowledgedAt != nil else { return FieldSafety.refusal("overdue-acknowledged-first") }
            guard !reason.flag || episode.answeredAt != nil else { return FieldSafety.refusal("silence-reason-untrue") }
            episode.silencedReasonId = reason.id
            timer.overdue = episode
            return nil
        }
    }

    /* Resolving stops sharing in the same instant, so the position goes with it rather than waiting for
       the window. Nobody is sent anywhere from here: the outcome records what a person did. */
    func resolve(_ panicRef: String, outcomeId: String?) -> FieldSafetyRefusal? {
        changePanic(panicRef) { panic, date in
            guard panic.resolvedAt == nil else { return FieldSafety.refusal("panic-already-resolved") }
            guard let outcomeId, FieldSafety.outcomes.contains(where: { outcome in outcome.id == outcomeId }) else {
                return FieldSafety.refusal("panic-resolved-without-outcome")
            }
            guard panic.acknowledgedAt != nil else { return FieldSafety.refusal("panic-resolved-before-acknowledged") }
            panic.resolvedAt = date
            panic.outcomeId = outcomeId
            panic.position = nil
            return nil
        }
    }

    func position(of panicRef: String) -> FieldSafety.PositionRead {
        guard let panic = panics.first(where: { panic in panic.id == panicRef }) else {
            return .ended(FieldSafety.refusal("panic-already-resolved").statement)
        }
        guard panic.isSharing(at: now) else {
            return .ended(FieldSafety.fill(FieldSafety.refusal("position-after-the-window").statement, ["ended": FieldSafety.clock(panic.sharingEndsAt)]))
        }
        return .shared(panic.position)
    }

    /* Oldest first inside each group: a panic nobody has picked up, then a timer nobody has picked up,
       then what the desk already holds, then what is closed. */
    var desk: [FieldSafety.DeskRow] {
        let fromPanics: [FieldSafety.DeskRow] = panics.map { panic in
            let nurse = Self.nurse(panic.nurseId)
            return FieldSafety.DeskRow(id: panic.id, isPanic: true, nurse: nurse?.name ?? panic.nurseId, suburb: nurse?.area ?? "",
                                       raisedAt: panic.raisedAt, ageMinutes: age(since: panic.raisedAt),
                                       acknowledgedAt: panic.acknowledgedAt, answeredAt: nil,
                                       outcome: panic.outcomeId.map { id in FieldSafety.label(FieldSafety.outcomes, id) },
                                       sharingEndsAt: panic.sharingEndsAt, sharing: panic.isSharing(at: now), open: panic.resolvedAt == nil)
        }
        let fromTimers: [FieldSafety.DeskRow] = timers.compactMap { timer in
            guard let episode = timer.overdue else { return nil }
            let nurse = Self.nurse(timer.nurseId)
            return FieldSafety.DeskRow(id: timer.id, isPanic: false, nurse: nurse?.name ?? timer.nurseId, suburb: nurse?.area ?? "",
                                       raisedAt: episode.since, ageMinutes: age(since: episode.since),
                                       acknowledgedAt: episode.acknowledgedAt, answeredAt: episode.answeredAt,
                                       outcome: episode.silencedReasonId.map { id in FieldSafety.label(FieldSafety.silenceReasons, id) },
                                       sharingEndsAt: nil, sharing: false, open: episode.silencedReasonId == nil)
        }
        return (fromPanics + fromTimers).sorted { left, right in
            left.rank != right.rank ? left.rank < right.rank : left.raisedAt < right.raisedAt
        }
    }
    private func age(since date: Date) -> Int { max(0, Int(now.timeIntervalSince(date) / 60)) }
    var waitingCount: Int { desk.filter { row in row.open && row.acknowledgedAt == nil }.count }
    var openCount: Int { desk.filter { row in row.open }.count }
}
