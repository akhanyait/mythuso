import Foundation

/* Cancelling a visit, and moving one.
 *
 * Both native apps have printed a promise on the booking confirmation — that a visit may be
 * cancelled or moved up to two hours before it — since long before this file existed, and neither
 * offered a cancel control anywhere in the app. The Cancelled tab has been showing the outcome of
 * an action the product did not offer. The two hours were a hand-typed string in one Swift file
 * and one Kotlin file with nothing to compare them against, which is why the drift check never saw
 * them: a right that bears on money, living as a duplicated literal.
 *
 * packages/catalog/cancellation.json is the number's one home now, generated into
 * CancellationData.swift beside this file. What is here is the reasoning and the arithmetic, and
 * the arithmetic is the point: which of the three moments a visit is in is worked out from the
 * visit's own start against the window in the contract. The number two does not appear below, so
 * changing it is a decision taken once in the JSON rather than an edit made in five places.
 */

/// One of the three moments a person can ask to cancel in. Each says something different to them.
struct CancellationState: Identifiable, Hashable {
    let id: String
    let name: String
    /// Why this moment is different, in the contract's words. For the screen, not for the log.
    let detail: String
    /// Said to the person, word for word. Never paraphrased on the way to the screen.
    let patientWords: String
    /// True on exactly one state, and the build refuses it on the late one.
    let refusesCancellation: Bool
}

/// A reason a person may give. Not one of them asks anybody to justify themselves.
struct CancellationReason: Identifiable, Hashable {
    let id: String
    let text: String
    /// Carried by the reason that is not really a cancellation at all, so the screen can offer the
    /// move again before it takes the visit away.
    let offersRescheduleFirst: Bool
}

/* A sentence the product says out loud rather than merely obeys. "You do not have to give a reason"
   is the one that earns its place: a screen can behave permissively and still read as a demand, and
   the person who cannot tell the difference is the one deciding whether to answer it. */
struct CancellationRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
    let why: String
}

/// Something cancelling a visit does not do. Three of them, and each is a promise about afterwards.
struct CancellationLimit: Identifiable, Hashable {
    let id: String
    let statement: String
    let why: String
}

/* A cancelled visit, kept.
 *
 * It holds the whole visit rather than a title and a date, because `doesNotUndo.the-record` says a
 * cancelled visit is not deleted — and a record that kept only what was convenient to show would
 * be a deletion with a summary in front of it. The state is kept beside the reason because a late
 * cancellation is recorded as one; that is what "recorded" means here and it is all it means. No
 * charge is attached, and none can be: what a late cancellation costs is an open question the
 * contract holds as `pendingDecision`. */
struct CancelledVisit: Identifiable, Hashable {
    let visit: BookedVisit
    let reason: CancellationReason
    let state: CancellationState
    var id: UUID { visit.id }
    var wasLate: Bool { state.id == "inside-window" }
}

enum Cancellation {
    /// The window, in seconds, from the hours the contract declares. Never from a literal.
    static var window: TimeInterval { TimeInterval(hoursBefore) * 3600 }

    static func state(_ id: String) -> CancellationState { states.first { $0.id == id } ?? states[0] }
    static func reason(_ id: String) -> CancellationReason { reasons.first { $0.id == id } ?? reasons[0] }
    /* Trapping rather than defaulting: a refusal sentence that silently became a different refusal
       sentence would be a screen quietly saying something nobody wrote. There are three, they are
       generated, and asking for one that is not there is a mistake in this file, not in the data. */
    static func refusal(_ id: String) -> String {
        guard let found = refusals.first(where: { $0.id == id }) else {
            preconditionFailure("no cancellation refusal called \(id) — see packages/catalog/cancellation.json")
        }
        return found.sentence
    }

    /// The one calendar this arithmetic is done in. A phone set to another zone must not move a
    /// visit's start by two hours and with it the moment cancelling becomes late.
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Scheduling.zone
        return calendar
    }

    /// The instant a visit begins, built from the day it was booked for and the hour on it. Nil for
    /// a visit that has no appointed hour, which is a visit somebody asked for as soon as possible.
    static func startsAt(_ visit: BookedVisit, calendar: Calendar = Cancellation.calendar) -> Date? {
        guard let date = visit.date, let start = visit.start else { return nil }
        let pieces = start.split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2 else { return nil }
        var parts = calendar.dateComponents([.year, .month, .day], from: date)
        parts.hour = pieces[0]
        parts.minute = pieces[1]
        return calendar.date(from: parts)
    }

    /* Which moment this visit is in.
     *
     * Two of the three answers are subtraction, and the third is the only refusal in the feature.
     * A visit whose hour has arrived is treated as begun: a booking screen cannot end an encounter
     * that is happening in somebody's house, and it does not get to decide that the nurse is not
     * there yet on the strength of a clock.
     *
     * Nothing below can refuse a late cancellation, and that is deliberate rather than an omission.
     * The contract's `always` says a visit can always be cancelled and gives the reason: a product
     * that refuses a cancellation has not prevented it, it has only made somebody not answer the
     * door — and the nurse still travels, and nobody knows why. So the late state is named and
     * recorded, and it is never a locked button.
     *
     * A visit asked for as soon as possible has no hour to subtract from, and is answered as late
     * rather than as early. That is the safe direction: somebody is being looked for the moment it
     * is asked for, so it is never true that nothing has been dispatched — and being wrong in the
     * other direction would tell a person nothing had moved when a nurse was already driving.
     */
    static func state(of visit: BookedVisit, now: Date = Date()) -> CancellationState {
        guard let start = startsAt(visit) else { return state("inside-window") }
        if now >= start { return state("in-progress") }
        return start.timeIntervalSince(now) <= window ? state("inside-window") : state("before-window")
    }
}
