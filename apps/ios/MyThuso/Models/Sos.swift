import Foundation

/* The emergency pathway.

   This is the one screen in MyThuso where being wrong is dangerous rather than inconvenient, and
   the shape of the model is the argument. Three things are true of it and none of them is
   decoration:

   MyThuso is not an ambulance service. `Sos.emergency` — the three real South African numbers —
   is the first property in the generated table and the first thing on the screen, above anything
   MyThuso sells. It does not move, and no answer to any question moves it.

   Software does not triage. `route(...)` below takes the ticked conditions and the two routing
   answers and returns a door. It does not score, weight, rank or add anything up, and any ticked
   condition returns `.emergencyServices` before the other two answers are even read. That early
   return is the design: a question asked after a red flag would only be there to talk somebody out
   of an ambulance.

   A promise about time is a promise. `Sos.targetMinutes` is the duration of the `sos` row in the
   service catalogue, generated into SosData.swift rather than typed, and the copy calls it a
   target every time it says it. It is never used as an arrival estimate. Arrival estimates come
   from Geo.swift, which returns `.unavailable` with a reason rather than a plausible number — the
   rule this app already holds on the dispatch board, and the rule that matters most here.

   The table itself is generated from packages/catalog/sos.json. What is here is the reasoning.

   Nothing dials. No telephony, no location permission, no dispatch, no ambulance partner. */

struct SosNumber: Identifiable, Hashable {
    let id: String
    /// A real South African emergency number, written from the contract rather than typed here.
    let number: String
    let name: String
    let detail: String
    let whenToUse: String
}

struct SosEmergency {
    let headline: String
    let lead: String
    let notAnAmbulance: String
    let previewNote: String
    let whyFirst: String
    let numbers: [SosNumber]
}

/// One of the eight conditions that ends the questions. There is no severity on it, on purpose:
/// severity is the judgement this app refuses to make.
struct SosCondition: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
}

struct SosRedFlags {
    let prompt: String
    let help: String
    let noneLabel: String
    let endsTheQuestions: String
    let conditions: [SosCondition]
}

struct SosQuestion: Identifiable, Hashable {
    let id: String
    let prompt: String
    let help: String
    /// "red-flags", "area" or "callback". A question's kind is what it routes on; none of them
    /// carries a weight, because nothing is being weighed.
    let kind: String
}

struct SosRouting {
    let isNotTriage: String
    let noAlgorithm: String
    let questions: [SosQuestion]
}

struct SosOutcome: Identifiable, Hashable {
    let id: String
    let name: String
    let headline: String
    let detail: String
    let offersVisit: Bool
}

struct SosTarget {
    let title: String
    let statement: String
    let whenItCannotBeMet: String
    let arrivalUnknown: String
    let estimateIsNotTheTarget: String
}

struct SosHours {
    let opensAt: String
    let closesAt: String
    let days: String
    let note: String
}

struct SosCoverage {
    let statement: String
    /// The areas dispatch can actually reach. A coverage list drawn optimistically is a person
    /// waiting at a window.
    let areas: [String]
    let hours: SosHours
    let honestNote: String
}

struct SosStandDownReason: Identifiable, Hashable {
    let id: String
    let label: String
    /// One line, and nothing clinical in it. A cancelled visit is not a consultation.
    let nurseIsTold: String
    let recorded: String
}

struct SosStandDown {
    let title: String
    let statement: String
    let reasons: [SosStandDownReason]
    let noAnswerRule: String
    let chargeRule: String
    let nurseNote: String
}

/// A way this pathway fails, and what to do instead. The second half is not optional: a failure
/// screen without it is a dead end wearing an apology.
struct SosFailure: Identifiable, Hashable {
    let id: String
    let name: String
    let what: String
    let instead: String
}

struct SosAlertNote: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct SosAlert {
    let name: String
    let what: String
    let phaseNote: String
    let honesty: [SosAlertNote]
    let notCover: String
}

struct SosRecord {
    let title: String
    let statement: String
    let kept: [String]
    let notKept: [String]
}

struct SosRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct SosRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
}

enum Sos {
    static func outcome(_ id: String) -> SosOutcome { outcomes.first { $0.id == id } ?? outcomes[0] }
    static func failure(_ id: String) -> SosFailure { failures.first { $0.id == id } ?? failures[0] }
    static func rule(_ id: String) -> SosRule { rules.first { $0.id == id } ?? rules[0] }
    static func refusal(_ id: String) -> SosRefusal { refusals.first { $0.id == id } ?? refusals[0] }
    static func condition(_ id: String) -> SosCondition? { redFlags.conditions.first { $0.id == id } }

    /// What the person answered. Three fields, and not one of them is a severity.
    struct Answers {
        var flagged: Set<String> = []
        var area: String? = nil
        var canAnswerAPhone: Bool? = nil
    }

    /// Where an answer sends somebody. A failure is a door too, and it is named, so that "we cannot
    /// help" always arrives with the reason attached rather than as a spinner that never resolves.
    enum Door: Equatable {
        case emergencyServices
        case urgentVisit
        case refused(String)

        var outcomeId: String {
            switch self {
            case .emergencyServices: return "emergency-services"
            case .urgentVisit: return "urgent-visit"
            case .refused: return "cannot-help"
            }
        }
    }

    /* Routing, not triage.

       Read the order. A ticked condition returns immediately, before the area and before the
       callback — one tick is enough, and nothing after it can downgrade the answer. Then the two
       questions that are genuinely about reach rather than about the person: can a nurse get
       there, and is there a phone to ring. Neither of those is a judgement about how sick anybody
       is, and there is deliberately no branch in this function that makes one. */
    static func route(_ answers: Answers, openNow: Bool, cleared: Bool) -> Door {
        if !answers.flagged.isEmpty { return .emergencyServices }
        guard let area = answers.area, coverage.areas.contains(area) else { return .refused("outside-coverage") }
        if !openNow { return .refused("outside-hours") }
        if answers.canAnswerAPhone == false { return .refused("no-callback") }
        /* Urgency does not relax vetting. The nurse who would be sent is checked against the same
           register that gates the dispatch board, and a lapsed check refuses here exactly as it
           refuses there. There is no override in this function and none anywhere above it. */
        if !cleared { return .refused("vetting") }
        return .urgentVisit
    }

    /// The label the pathway shows for the target. Never the arrival estimate — those are two
    /// different things and the copy says so.
    static var targetLabel: String { "Under \(targetMinutes) minutes · target" }
}
