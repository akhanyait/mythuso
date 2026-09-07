import Foundation

/* When a visit happens.
 *
 * The rules — the timezone, the shape of the offer, the two kinds of booking — are generated into
 * SchedulingData.swift from packages/catalog/scheduling.json, so all three apps make the same
 * promises in the same words. What is here is the arithmetic, and it exists because of a specific
 * defect: BookingView carried a hand-typed strip, ("Fri", "12", "Sep") and four more, which had not
 * matched the calendar since the day somebody typed it. The same five labels were typed again in
 * Kotlin and again in TypeScript, and all three disagreed with the dates printed beside them.
 *
 * Nothing below is typed. The days are computed from the device clock in Africa/Johannesburg, and a
 * weekday is asked of its own date. A visit ends its own duration after it starts, from the service
 * catalogue, rather than an hour later whatever the service is. */

struct BookingKind: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    /// Only the kind that means "come now" gets to show an arrival estimate.
    let showsArrivalEstimate: Bool
    let confirmation: String
}

struct SchedulingRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

/// A day being offered, identified by its date rather than by where it sits in a list.
struct OfferedDay: Identifiable, Hashable {
    let date: Date
    var id: String { Scheduling.isoDay(date) }
    var weekday: String { Scheduling.format(date, "EEE") }
    var day: String { Scheduling.format(date, "d") }
    var month: String { Scheduling.format(date, "MMM") }
}

enum Scheduling {
    static func kind(_ id: String) -> BookingKind { kinds.first { $0.id == id } ?? kinds[0] }
    static func rule(_ id: String) -> SchedulingRule { rules.first { $0.id == id } ?? rules[0] }

    /* South Africa keeps one timezone and no daylight saving, but it is named rather than assumed:
       a phone set to another zone must not quietly move a nurse's arrival by two hours. */
    static var zone: TimeZone { TimeZone(identifier: timezone) ?? .current }

    static func format(_ date: Date, _ template: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_ZA")
        formatter.timeZone = zone
        formatter.dateFormat = template
        return formatter.string(from: date)
    }
    static func isoDay(_ date: Date) -> String { format(date, "yyyy-MM-dd") }
    static func longDate(_ date: Date) -> String { format(date, "EEEE, d MMMM yyyy") }
    static func shortDate(_ date: Date) -> String { format(date, "EEE d MMM") }

    static func offeredDays(from now: Date = Date()) -> [OfferedDay] {
        (0..<daysOffered).map { index in
            OfferedDay(date: now.addingTimeInterval(TimeInterval(firstDayOffset + index) * 86_400))
        }
    }

    /// The end of a visit is its own duration after the start — never a flat hour.
    static func endTime(start: String, minutes: Int) -> String {
        let pieces = start.split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2 else { return start }
        let total = pieces[0] * 60 + pieces[1] + minutes
        return String(format: "%02d:%02d", (total / 60) % 24, total % 60)
    }
}

/* Everything a person chose, carried whole. There is no way to build one of these without saying
   who it is for and where — and a scheduled visit cannot exist without its date, which is the
   defect this type closes: the confirmation used to hand on a time and drop the day. */
struct BookedVisit: Identifiable, Hashable {
    let id = UUID()
    let service: CareService
    let patient: String
    let address: String
    let kind: String
    let date: Date?
    let start: String?
    let payment: String

    var isScheduled: Bool { kind == "scheduled" }
    var status: String { isScheduled ? "Confirmed" : Scheduling.Label.asapPending }
    var ends: String? { start.map { Scheduling.endTime(start: $0, minutes: service.duration) } }
    var whenText: String {
        guard isScheduled, let date, let start, let ends else { return Scheduling.Label.asapPending }
        return "\(Scheduling.longDate(date)) · \(start)–\(ends)"
    }
    var shortWhenText: String {
        guard isScheduled, let date, let start else { return Scheduling.Label.asapPending }
        return "\(Scheduling.shortDate(date)) · \(start)"
    }
}
