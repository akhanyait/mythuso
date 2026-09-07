import Foundation

/* An employer runs a wellness programme; a sponsor pays for somebody's care.

   Both are vetted parties already, and both have a hard refusal attached in
   packages/catalog/vetting.json — an employer may pay for care and still never see who used it; a
   sponsorship is a payment, not a permission. Those two sentences are the feature, and this file is
   what makes them arithmetic rather than assurance.

   The table itself — the floor, what each party sees and never sees, joining, leaving, the seven
   rules, the six refusals, two fictional programmes and one statement — is generated into
   ProgrammesData.swift from packages/catalog/programmes.json, so nothing below is transcribed.

   What is here is `suppress`, and it is the whole of it. An employer is shown counts of people, and
   a count of people is a disclosure about every one of them:

     The floor. Nothing is reported about a group of fewer than twelve. A department of four is not
     anonymous, and rounding it does not make it so.

     Dominance. A group of fourteen in which thirteen answered the same way tells the employer there
     is exactly one person who did not. Suppressed whichever way round it falls, because "almost
     nobody" identifies as surely as "almost everybody".

     Secondary suppression, which is the rule everybody leaves out. If the first two hide only one
     group, that group is the total minus the ones published — so a second is hidden as well, the
     smallest that was going to be reported, and the subtraction stops working. Without this step
     the other two are decorative.

     Rounding, to the nearest five, because two reports laid side by side are the easiest thing in
     the world and a figure that moves by one names the person who moved it.

   The counts in the generated table are unsuppressed on purpose. Suppressing them in the generator
   would mean the rule lived there and this app drew whatever it was handed — which is exactly the
   arrangement in which somebody eventually asks for the unsuppressed version for a board pack.

   Nothing here reports anything. No employer is contacted, no payment is taken, and every company,
   cohort and person is fictional. */

struct SuppressionFloor {
    let minimumCohort: Int
    let dominanceCeiling: Double
    let roundTo: Int
    /// Never one hidden row on its own: one hidden row is a subtraction away from being visible.
    let minimumSuppressed: Int
    let whyTwelve: String
    let whyDominance: String
    let whyRounding: String
    let whySecondary: String
}

struct Disclosure: Identifiable, Hashable {
    let what: String
    let why: String
    var id: String { what }
    init(_ what: String, _ why: String) { self.what = what; self.why = why }
}

struct ProgrammeStep: Identifiable, Hashable {
    let label: String
    let detail: String
    var id: String { label }
    init(_ label: String, _ detail: String) { self.label = label; self.detail = detail }
}

struct Declining {
    let headline: String
    let detail: String
    let note: String
}

struct LineDetailChoice: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let isDefault: Bool
}

struct SponsorConsent {
    let headline: String
    let detail: String
    let withdrawal: String
}

struct ProgrammeRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct ProgrammeRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct SuppressionReason: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct Cohort: Identifiable, Hashable {
    let id: String
    let name: String
    let eligible: Int
    let tookPart: Int
    let advisedToSeeADoctor: Int
}

struct Programme: Identifiable, Hashable {
    let id: String
    let name: String
    let employer: String
    let startedInDays: Int
    let note: String
    let cohorts: [Cohort]
    var started: Date { Date().addingTimeInterval(TimeInterval(startedInDays) * 86_400) }
}

struct StatementLine: Identifiable, Hashable {
    let onDays: Int
    /// The service's price in the catalogue, resolved by the generator. Not a number anybody typed.
    let amount: Int
    let service: String
    var id: String { "\(onDays)-\(service)" }
    var on: Date { Date().addingTimeInterval(TimeInterval(onDays) * 86_400) }
}

struct SponsorStatement {
    let sponsor: String
    let recipient: String
    let relationship: String
    let setAside: Int
    let note: String
    let lines: [StatementLine]
    var spent: Int { lines.reduce(0) { $0 + $1.amount } }
    var remaining: Int { setAside - spent }
}

/// A row on the report. `suppressedBy` nil means it is published; anything else is why it is not,
/// said in the contract's own words rather than left as a blank somebody will go and ask about.
struct ReportedCohort: Identifiable, Hashable {
    let cohort: Cohort
    var suppressedBy: String?
    let eligible: Int
    let tookPart: Int
    let advisedToSeeADoctor: Int
    let uptake: Double
    var id: String { cohort.id }
}

struct ProgrammeReport {
    let programme: Programme
    let rows: [ReportedCohort]
    let totalEligible: Int
    let totalTookPart: Int
    let totalAdvised: Int
    let totalUptake: Double
    /// Deliberately not equal to the total. If it were, the suppressed rows could be had by
    /// subtracting and every rule above would be decorative.
    let publishedTookPart: Int
    var suppressed: [ReportedCohort] { rows.filter { $0.suppressedBy != nil } }
    var reconciles: Bool { publishedTookPart == totalTookPart }
}

enum Programmes {
    static func rule(_ id: String) -> ProgrammeRule { rules.first { $0.id == id } ?? rules[0] }
    static func refusal(_ id: String) -> ProgrammeRefusal { refusals.first { $0.id == id } ?? refusals[0] }
    static func suppressionReason(_ id: String) -> SuppressionReason {
        suppressionReasons.first { $0.id == id } ?? suppressionReasons[0]
    }
    static func programme(_ id: String) -> Programme { programmes.first { $0.id == id } ?? programmes[0] }

    /// To the nearest five, always in the same direction, so the same cohort reported twice gives
    /// the same answer.
    static func roundOff(_ n: Int) -> Int {
        Int((Double(n) / Double(floor.roundTo)).rounded()) * floor.roundTo
    }
    /// One answer covering four fifths of the group, whichever answer it is.
    static func isDominated(_ c: Cohort) -> Bool {
        guard c.tookPart > 0 else { return false }
        let larger = max(c.advisedToSeeADoctor, c.tookPart - c.advisedToSeeADoctor)
        return Double(larger) / Double(c.tookPart) >= floor.dominanceCeiling
    }

    static func suppress(_ programme: Programme) -> ProgrammeReport {
        var rows = programme.cohorts.map { cohort -> ReportedCohort in
            let reason: String? = (cohort.tookPart < floor.minimumCohort || cohort.eligible < floor.minimumCohort)
                ? "below-floor" : (isDominated(cohort) ? "dominated" : nil)
            return ReportedCohort(cohort: cohort, suppressedBy: reason,
                                  eligible: roundOff(cohort.eligible), tookPart: roundOff(cohort.tookPart),
                                  advisedToSeeADoctor: roundOff(cohort.advisedToSeeADoctor),
                                  uptake: cohort.eligible == 0 ? 0 : Double(cohort.tookPart) / Double(cohort.eligible))
        }
        /* Secondary suppression. One hidden row is a subtraction away from being visible, so the
           smallest row that was going to be published is withheld with it — smallest, because
           withholding the largest costs the report the most and protects nobody more. */
        while rows.contains(where: { $0.suppressedBy != nil })
            && rows.filter({ $0.suppressedBy != nil }).count < floor.minimumSuppressed {
            let candidates = rows.enumerated().filter { $0.element.suppressedBy == nil }
            guard let next = candidates.min(by: { $0.element.cohort.tookPart < $1.element.cohort.tookPart }) else { break }
            rows[next.offset].suppressedBy = "secondary"
        }
        let eligible = programme.cohorts.reduce(0) { $0 + $1.eligible }
        let tookPart = programme.cohorts.reduce(0) { $0 + $1.tookPart }
        return ProgrammeReport(
            programme: programme, rows: rows,
            totalEligible: roundOff(eligible), totalTookPart: roundOff(tookPart),
            totalAdvised: roundOff(programme.cohorts.reduce(0) { $0 + $1.advisedToSeeADoctor }),
            totalUptake: eligible == 0 ? 0 : Double(tookPart) / Double(eligible),
            publishedTookPart: rows.filter { $0.suppressedBy == nil }.reduce(0) { $0 + $1.tookPart })
    }
}
