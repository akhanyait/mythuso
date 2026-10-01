import Foundation

/* The account holder's own health record, in one place.
 *
 * The Health Passport drew three charts out of three literal arrays typed into the screen, dated
 * "12 Aug" through "4 Sep" — labels that were right the week somebody typed them and would have
 * been a year wrong by the next winter. The past visit that produced those readings had no screen
 * at all: the passport's "Visit summary" row and both device rows went to the sentence that says a
 * workflow will be connected later. So nothing connected a visit to what was measured at it, and
 * the two could not have disagreed because they never met.
 *
 * Everything here is dated in day offsets from today, the way every other contract in this
 * repository is, so a preview left open over a weekend cannot go stale. The visit list's past visit
 * is three days ago and so is the last reading set, which is what makes "what the nurse found at
 * this visit" a lookup rather than a coincidence.
 *
 * WHERE THE RANGES COME FROM. Not one range is written here. Every label, unit and reference range
 * is read from `Observation.all`, which is packages/catalog/records.json's list through the
 * generated Records.observations. What is never read comes from the record contract's own protected
 * categories, and the instruments come from ThusoKit. A second copy of any of the three is the drift
 * the contract files exist to stop.
 *
 * WHERE THE RECORD COMES FROM. Not one value is written here either, since 1 October 2026: the
 * holder, the reviewer, the four reading sets, the doctor's review and the four headline measures
 * are packages/catalog/passport.json's, read through the generated PassportData. This file typed all
 * of them beside the generated copy, held word for word by a quarantine in
 * scripts/check-boundaries.mjs; what is left here is the arithmetic and the types the screens use.
 *
 * Fictional patient, invented readings, nothing stored and nothing sent. */

struct PassportHolder {
    let name: String
    let passportId: String
    let issuedBy: String
}

/// The clinician who reviews what a nurse records for this account. One name, read by the trends
/// screen and the visit summary rather than typed into each of them.
struct PassportReviewer {
    let name: String
    let registration: String
    var attribution: String { "\(name) · \(registration)" }
}

/// Where a value sits against its own reference range. Asked of the range, never stored beside it.
enum RangeFlag {
    case normal, high, low
    var isNormal: Bool { self == .normal }
    /// The word, which is on the chip alongside the fill — colour is never the only difference
    /// between a reading inside its range and one outside it.
    var chip: String {
        switch self {
        case .normal: return "In range"
        case .high: return "Above range"
        case .low: return "Below range"
        }
    }
    var shortWord: String {
        switch self {
        case .normal: return "inside"
        case .high: return "above"
        case .low: return "below"
        }
    }
}

/// One set of observations, taken at one visit, on one day.
struct ReadingSet: Identifiable, Hashable {
    /// Days before today. Negative. The date and every label are derived from it.
    let dayOffset: Int
    let values: [String: Double]
    /// Why a reading sat where it did, when somebody said so at the visit.
    var note: String?
    var id: Int { dayOffset }
    var date: Date { Date().addingTimeInterval(TimeInterval(dayOffset) * 86_400) }
}

/// What a doctor said about the last visit. A nurse records and a doctor reviews: two acts, two
/// names, and no screen in this app presents the first as the second.
struct PassportReview {
    let assessment: String
    let plan: String
    let next: String
    let reviewedDayOffset: Int
    var date: Date { Date().addingTimeInterval(TimeInterval(reviewedDayOffset) * 86_400) }
}

enum Passport {
    static let holder = PassportHolder(name: PassportData.holder.name, passportId: PassportData.holder.passportId,
                                       issuedBy: PassportData.holder.issuedBy)
    static let reviewer = PassportReviewer(name: PassportData.reviewer.name, registration: PassportData.reviewer.registration)
    /// The nurse who took these readings. The same one the visit list and dispatch already name.
    static let nurse = (name: "Sister Naledi Mokoena", role: "Registered Nurse (SANC)")
    /// The reference the completed visit was booked under. One of the references this preview's
    /// capture ledger already knows, so a summary and a queue cannot name two different visits.
    static let lastVisitReference = "TH-2045"

    /* Four home visits over three months, as the contract holds them. The third is the one worth
       opening: a systolic above its upper reference, with the reason the person gave on the day. */
    static let readingSets: [ReadingSet] = PassportData.readingSets.map {
        ReadingSet(dayOffset: $0.dayOffset, values: $0.values, note: $0.note)
    }

    /// The visit the last set of readings was taken at.
    static var latestSet: ReadingSet { readingSets[readingSets.count - 1] }
    static func set(onDay dayOffset: Int) -> ReadingSet? { readingSets.first { $0.dayOffset == dayOffset } }

    // MARK: - Asking the assessment, never a second copy

    static func spec(_ id: String) -> Observation? { Observation.all.first { $0.id == id } }

    /// Every measure that has a value in a set, in the order the assessment collects them.
    static func measured(in set: ReadingSet) -> [Observation] {
        Observation.all.filter { set.values[$0.id] != nil }
    }

    static func flag(_ observation: Observation, _ value: Double) -> RangeFlag {
        if value < observation.range.lowerBound { return .low }
        if value > observation.range.upperBound { return .high }
        return .normal
    }
    static func flag(_ id: String, _ value: Double) -> RangeFlag {
        spec(id).map { flag($0, value) } ?? .normal
    }

    /* A reading with a decimal step is written with one, and one without is written without. The
       assessment does not carry a step, so it is derived from the range: a range whose bounds are
       whole numbers is a whole-number reading. Temperature and glucose are the two that are not. */
    static func decimals(_ observation: Observation) -> Int {
        let bounds = [observation.range.lowerBound, observation.range.upperBound]
        return bounds.allSatisfy { $0 == $0.rounded() } ? 0 : 1
    }
    static func format(_ observation: Observation, _ value: Double) -> String {
        String(format: "%.\(decimals(observation))f", value)
    }
    static func rangeText(_ observation: Observation) -> String {
        "\(format(observation, observation.range.lowerBound))–\(format(observation, observation.range.upperBound)) \(observation.unit)"
    }

    /// A measure's readings over time, oldest first. Only the sets that carry it.
    static func series(_ observation: Observation) -> [Reading] {
        readingSets.compactMap { set in
            guard let value = set.values[observation.id] else { return nil }
            return Reading(label: Scheduling.shortDate(set.date), value: value, note: set.note ?? "—")
        }
    }

    /* The four the trends screen leads with. Seven charts on one phone screen is a wall; these are
       the four somebody with a blood-pressure diagnosis actually watches, and the other three are
       one tap below in the same shape. */
    static let headlineIds = PassportData.headlineMeasures
    static var headline: [Observation] { Observation.all.filter { headlineIds.contains($0.id) } }
    static var others: [Observation] { Observation.all.filter { !headlineIds.contains($0.id) } }

    /// A symbol per reading. The one thing here that is presentation rather than contract.
    static func symbol(_ id: String) -> String {
        switch id {
        case "systolic", "diastolic": return "heart"
        case "pulse": return "waveform.path.ecg"
        case "glucose": return "drop"
        case "temperature": return "thermometer"
        case "oxygen", "respiratory": return "lungs"
        default: return "chart.line.uptrend.xyaxis"
        }
    }

    // MARK: - What the doctor said about the last visit

    static let lastReview = PassportReview(
        assessment: PassportData.lastReview.assessment, plan: PassportData.lastReview.plan,
        next: PassportData.lastReview.next, reviewedDayOffset: PassportData.lastReview.reviewedDayOffset)

    // MARK: - What a device would and would not be allowed to hand over

    /* Both halves are derived. What a reading type *is* comes from the assessment's own observation
       list, because MyThuso does not ask a phone for a category it has nowhere to file. What is
       never read comes from the record contract's protected categories, which are released by the
       person entry by entry and are not a thing an operating system's permission sheet can grant on
       somebody's behalf. */
    static var readable: [Observation] { Observation.all }
    static var neverRead: [String] { Records.protectedCategories }
    /// The instruments the kit itself carries, and what each of them measures.
    static var kitInstruments: [KitDevice] { ThusoKit.devices }

    /* An instrument's `measures` are identifiers, and two of the eight are not observations the
       assessment collects at all, so they have no label to borrow — KitMeasures names those two.
       The rest take the qualifying half of their own label: a cuff's row reading "blood pressure —
       systolic, blood pressure — diastolic, pulse" says "blood pressure" twice in a column three
       words wide. */
    static func measureName(_ id: String) -> String {
        let label = KitMeasures.label(id).lowercased()
        guard let tail = label.components(separatedBy: " — ").last, label.contains(" — ") else { return label }
        return tail
    }
}

/* The three integrations the passport offers and could not open, and the three answers each one
   owes before a person could sensibly say yes to it. Health Connect is Android's and is not offered
   here; it is in the same table on the web because that screen is read on both.

   None of these sentences is a capability notice. The notice — the sentence that says nothing is
   connected — belongs to packages/catalog/capabilities.json and is rendered by CapabilityNotice,
   never typed. What is below is the part no contract holds: how a particular operating system asks
   the question, and where a person goes to take the answer back. */
struct DeviceIntegration: Identifiable, Hashable {
    let id: String
    let name: String
    let platform: String
    let symbol: String
    /// How the permission is actually asked, on the person's own phone, by somebody who is not us.
    let sheet: String
    /// Where to turn it off again, and what turning it off does and does not do.
    let withdraw: String

    static let all: [DeviceIntegration] = [
        DeviceIntegration(
            id: "apple-health", name: "Apple Health", platform: "your iPhone", symbol: "heart.circle",
            sheet: "iOS asks you, on your own phone, one reading type at a time. MyThuso never sees the question and never sees a type you decline.",
            withdraw: "Health → Sharing → Apps, on your phone. Withdrawing it stops new readings; it does not remove what is already on your record."),
        DeviceIntegration(
            id: "thuso-kit", name: "Thuso Kit", platform: "the instruments a nurse brings", symbol: "sensor",
            sheet: "The kit is paired at a visit, by the nurse, in front of you. Nothing pairs itself and nothing pairs while you are not there.",
            withdraw: "Ask the nurse to unpair it, or unpair it from this screen once the kit is connected. An unpaired instrument sends nothing.")
    ]
    static func of(_ id: String) -> DeviceIntegration { all.first { $0.id == id } ?? all[0] }
}
