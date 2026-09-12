import Foundation

/* LIVE WELL — the reasoning. The words are in WellbeingData.swift beside this file, generated from
 * packages/catalog/wellbeing.json; this is the little arithmetic the feature has, which is a date
 * and a sort and nothing else.
 *
 * THE ARITHMETIC IS THE PLACE THIS FEATURE WOULD GO WRONG. Every harmful version of a healthy-living
 * screen is a calculation: a count of consecutive days, a proportion of a week, an average of a
 * month, a figure with an arrow beside it. None of those are difficult to write, which is exactly
 * why the contract forbids them by name and the build fails on them. What is left is a list in the
 * order it happened, and a word for which day that was.
 *
 * SO THERE IS NO GAP ARITHMETIC EITHER. `day(_:)` answers what to call a day that has something on
 * it. Nothing asks it about a day that has not, because the timeline draws what is there and says
 * nothing at all about what is not — a row reading "nothing written" is a reproach with a neutral
 * face on, and this product is for people who are ill.
 *
 * WHAT A PERSON WRITES LIVES IN MEMORY AND DIES WITH THE APP. It is deliberately not in the visit
 * ledger on the disk: the contract's no-sharing-by-default refusal says what somebody writes here is
 * not added to their record and is not sent to anybody, and a diary quietly persisted beside a
 * nurse's captured work is the first half of sending it. */

/// Something a person wrote down, and the day they wrote it.
///
/// No field takes a number, which is the one decision the safety of this whole feature rests on:
/// `dayOffset` is not something anybody types, it is which day this is.
struct WellbeingEntry: Identifiable, Hashable {
    let id = UUID()
    /// An id in `WellbeingData.habits`.
    let habit: String
    /// Days from today. Never positive — nobody writes down a day they have not had.
    let dayOffset: Int
    let text: String
}

enum Wellbeing {
    /// The preview's fictional entries, newest first. They come from the contract rather than from
    /// here, so the one place a sample sentence could acquire a number is the one place the
    /// generator refuses it.
    static var seed: [WellbeingEntry] {
        ordered(WellbeingData.sampleEntries.map { WellbeingEntry(habit: $0.habit, dayOffset: $0.dayOffset, text: $0.text) })
    }

    /// Newest first, and stable within a day: two things written on one morning stay in the order
    /// they were written rather than swapping about every time the list is redrawn.
    static func ordered(_ entries: [WellbeingEntry]) -> [WellbeingEntry] {
        entries.enumerated().sorted { left, right in
            left.element.dayOffset == right.element.dayOffset
                ? left.offset < right.offset
                : left.element.dayOffset > right.element.dayOffset
        }.map(\.element)
    }

    /// What to call the day an entry was written on. A name for the last week, then a date — never
    /// an interval, because "4 days ago" is a measurement of a gap and the gaps are not this
    /// feature's business.
    static func day(_ offset: Int, from reference: Date = Date()) -> String {
        switch offset {
        case 0: return "Today"
        case -1: return "Yesterday"
        default:
            let date = Calendar.current.date(byAdding: .day, value: offset, to: reference) ?? reference
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_ZA")
            formatter.dateFormat = offset > -7 ? "EEEE" : "d MMMM"
            return formatter.string(from: date)
        }
    }

    /// What a person has just typed, ready to go on the front of the list.
    static func written(_ habit: String, _ text: String) -> WellbeingEntry {
        WellbeingEntry(habit: habit, dayOffset: 0, text: text.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
