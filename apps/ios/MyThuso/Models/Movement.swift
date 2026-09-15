import Foundation

/* Thuso Ride's responder app on iOS: a trip offered to this responder, accepted or declined, the emergency summary
 * open only while the trip is under way, and a hand-over by role with the checklist.
 *
 * The arithmetic is packages/engines/src/movement/domain/trips.ts's, asked in the same order, and every sentence is
 * MovementData.swift's, generated from packages/catalog/movement.json and packages/catalog/apis/movement.json. A
 * refusal is shown in the route's own words, so a phone and the engine cannot disagree about why a hand-over was
 * refused.
 *
 * WHAT IS NOT HERE. No position is read from this phone and no heartbeat is sent: the preview has no service to send
 * one to, and the interval on the screen is the generated default. No admission, pending or otherwise, is on a phone
 * at all. And nothing here can make a P1 a trip, because MovementData's priorities never let Thuso Ride take one and
 * the preview trip is the contract's own. */
enum Movement {
    struct PrioritySpec: Hashable {
        let id: String
        let label: String
        let takenByThusoRide: Bool
        let sentence: String
    }
    struct Choice: Hashable, Identifiable {
        let id: String
        let label: String
    }
    struct PreviewTrip {
        let ref: String
        let priorityClass: String
        let zoneId: String
        let pickupInMinutes: Int
        let facilityRef: String
        let responderRef: String
    }

    /// One trip as this responder's phone holds it. State ids are the contract's: requested, accepted, handed-over.
    struct ResponderTrip: Identifiable, Equatable {
        let id: String
        let priorityClass: String
        let zoneId: String
        let facilityRef: String
        let pickupAt: Date
        var stateId: String
        var offeredToMe: Bool
        var declined: Bool
        var acceptedAt: Date?
        var handedOverAt: Date?
        var receivingRoleId: String?
    }

    enum Answer: Equatable {
        case done(ResponderTrip)
        case refused(String)
    }

    static func label(_ list: [Choice], _ id: String?) -> String { list.first { $0.id == id }?.label ?? (id ?? "") }
    static func priority(_ id: String) -> PrioritySpec? { priorities.first { $0.id == id } }

    /// The contract's preview trip, offered to this phone's responder, picking up from now plus its offset.
    static func previewTrip(now: Date) -> ResponderTrip {
        ResponderTrip(id: previewTrip.ref, priorityClass: previewTrip.priorityClass, zoneId: previewTrip.zoneId, facilityRef: previewTrip.facilityRef,
                      pickupAt: now.addingTimeInterval(TimeInterval(previewTrip.pickupInMinutes * 60)), stateId: "requested", offeredToMe: true, declined: false)
    }

    /* The engine's order: a closed trip first, then whether it was offered to this responder, and a P2 taken without
       an offer is a responder assigning themselves a same-day priority. */
    static func accept(_ trip: ResponderTrip, now: Date) -> Answer {
        if trip.stateId == "handed-over" { return .refused(Refusals.tripClosed) }
        if trip.stateId == "accepted" { return .done(trip) }
        if !trip.offeredToMe || trip.declined { return .refused(trip.priorityClass == "P2" ? Refusals.selfAssignedP2 : Refusals.tripNotOffered) }
        var taken = trip
        taken.stateId = "accepted"
        taken.acceptedAt = now
        return .done(taken)
    }

    static func decline(_ trip: ResponderTrip) -> Answer {
        guard trip.offeredToMe, !trip.declined, trip.stateId == "requested" else { return .refused(Refusals.tripNotOffered) }
        var declined = trip
        declined.declined = true
        return .done(declined)
    }

    static func handOver(_ trip: ResponderTrip, receivingRoleId: String?, checklistComplete: Bool, now: Date) -> Answer {
        if trip.stateId == "requested" { return .refused(Refusals.tripNotYours) }
        if trip.stateId == "handed-over" { return .refused(Refusals.tripClosed) }
        guard receivingRoles.contains(where: { $0.id == receivingRoleId }) else { return .refused(Refusals.unnamedReceiver) }
        guard checklistComplete else { return .refused(Refusals.checklistNotFollowed) }
        var handed = trip
        handed.stateId = "handed-over"
        handed.handedOverAt = now
        handed.receivingRoleId = receivingRoleId
        return .done(handed)
    }

    /// The emergency summary opens only while this responder's trip is under way: accepted, and not yet handed over.
    static func summaryOpen(_ trip: ResponderTrip) -> Bool { trip.stateId == "accepted" }

    /// The heartbeat interval in words, from the generated default and never typed.
    static func intervalText(seconds: Int = heartbeatIntervalSeconds) -> String {
        seconds % 60 == 0 ? "\(seconds / 60) \(seconds == 60 ? "minute" : "minutes")" : "\(seconds) seconds"
    }

    static func fill(_ sentence: String, _ values: [String: String]) -> String {
        values.reduce(sentence) { text, pair in text.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }
}
