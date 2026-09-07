import Foundation

/* The South African Sign Language accommodation.

   packages/catalog/locales.json already said what is owed to a Deaf patient: a booking that will
   not complete without an interpreter, a nurse told before she leaves, an interpreter named on the
   call roster, and six things that must never happen. It said, at the bottom, that none of it was
   built. This file and InterpretingData.swift beside it are the half that makes it arithmetic.

   The table — the three modes, four fictional interpreters and the hours they are free, the hold,
   the wait, the free cancellation, the seven rules and the eight refusals — is generated into
   InterpretingData.swift from packages/catalog/interpreting.json, so nothing below is transcribed.

   What is here is the arithmetic, and one line of it is the whole point:

       static func firstFree(...) -> FreeSlot?

   The optional is not a convenience. A function that cannot return "I do not know" is a function
   somebody will one day make return something, and the something will be a number a person takes a
   morning off work for. packages/catalog/sos.json holds an ambulance's arrival to the same rule
   under the same id — an estimate that is honest on one screen and confident on another is worse
   than either — and scripts/check-boundaries.mjs fails the build if this signature, or the Kotlin
   one, or the TypeScript one, stops being able to return nothing.

   The other half is `resolve`, which has three outcomes and no fourth. An interpreter is free at
   the hour chosen and the visit is confirmed with them named on it; or one is free later and the
   visit is held with that hour shown; or nobody is and the visit is held with the contract's
   sentence about not knowing. There is no branch here that produces a dispatchable visit with the
   requirement on and no interpreter against it.

   Nothing here contacts an interpreter, holds a real visit or books anybody's time. Every person on
   the roster is fictional, and the accreditation route in the vetting table is drafted rather than
   confirmed with the body it names. */

struct InterpreterAccreditation {
    let body: String
    let short: String
    let authorityId: String
    let route: String
    /// Nil until a named person at the accrediting body has read it. Every screen says which.
    let confirmedBy: String?
    let confirmedOrganisation: String?
    let confirmedOn: String?
    let uncertainty: String
    let whatWouldMakeItTrue: String
    var isConfirmed: Bool { confirmedBy != nil && confirmedOrganisation != nil && confirmedOn != nil }
}

struct InterpretingMode: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let note: String
}

struct InterpreterFreeDay: Hashable {
    let dayOffset: Int
    let slots: [String]
}

struct Interpreter: Identifiable, Hashable {
    let id: String
    let name: String
    /// Their number with the accrediting body, in whatever shape that body actually issues it.
    let reference: String
    let mode: String
    let area: String
    let settings: [String]
    /// Free hours, unresolved. Which one answers a request is decided below, not in the generator.
    let free: [InterpreterFreeDay]
}

struct InterpreterHold {
    let status: String
    let title: String
    let sentence: String
    let whyNotDispatched: String
    let whatHappensNext: String
}

struct InterpreterEstimate {
    let knownPrefix: String
    let unknown: String
    let unknownDetail: String
    let horizonNote: String
}

struct InterpreterCancellation {
    let fee: Int
    /// MyThuso. A service failure filed under the patient's name is a failure that stops being seen.
    let attributedTo: String
    let label: String
    let sentence: String
    let notThePatientsChoice: String
    let keepsTheRequirement: String
}

struct InterpreterWithdrawal {
    let endsTheConsultation: Bool
    let question: String
    let sentence: String
    let why: String
    let notAPunishment: String
}

struct InterpreterCost {
    let charged: Bool
    let sentence: String
}

struct InterpretingRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct InterpretingRefusal: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct InterpretingLabels {
    let heading: String
    let requirementOn: String
    let chooseMode: String
    let rosterHeading: String
    let noneFree: String
    let matched: String
    let heldBadge: String
    let vettingHeading: String
    let refusalsHeading: String
    let modeUnavailable: String
}

/// One hour somebody is actually free, resolved against the days this app offers a visit on.
struct FreeSlot: Identifiable, Hashable {
    let interpreter: Interpreter
    let date: Date
    let slot: String
    var id: String { "\(interpreter.id)-\(Scheduling.isoDay(date))-\(slot)" }
    var iso: String { Scheduling.isoDay(date) }
}

/// Three outcomes and no fourth.
enum InterpreterOutcome {
    case matched(FreeSlot)
    case held(FreeSlot, days: Int)
    case heldUnknown

    var isHeld: Bool { if case .matched = self { return false }; return true }
    var found: FreeSlot? {
        switch self {
        case .matched(let slot): return slot
        case .held(let slot, _): return slot
        case .heldUnknown: return nil
        }
    }
}

enum Interpreting {
    static func mode(_ id: String) -> InterpretingMode { modes.first { $0.id == id } ?? modes[0] }
    static func rule(_ id: String) -> InterpretingRule { rules.first { $0.id == id } ?? rules[0] }
    static func refusal(_ id: String) -> InterpretingRefusal { refusals.first { $0.id == id } ?? refusals[0] }

    /* The window is scheduling's, not a second copy of it: the same five days from tomorrow and the
       same nine hours. An interpreter free on the sixth day is one this cannot see, and
       `estimate.horizonNote` is what says so on the screen rather than a silence. */
    static func availability(mode: String, from now: Date = Date()) -> [FreeSlot] {
        let offered = Scheduling.offeredDays(from: now)
        let offeredDays = Set(offered.map(\.id))
        var free: [FreeSlot] = []
        for interpreter in roster where interpreter.mode == mode {
            for day in interpreter.free {
                let date = now.addingTimeInterval(TimeInterval(day.dayOffset) * 86_400)
                guard offeredDays.contains(Scheduling.isoDay(date)) else { continue }
                for slot in day.slots where Scheduling.slots.contains(slot) {
                    free.append(FreeSlot(interpreter: interpreter, date: date, slot: slot))
                }
            }
        }
        return free.sorted { $0.iso == $1.iso ? $0.slot < $1.slot : $0.iso < $1.iso }
    }

    static func freeAt(mode: String, iso: String, slot: String, from now: Date = Date()) -> FreeSlot? {
        availability(mode: mode, from: now).first { $0.iso == iso && $0.slot == slot }
    }

    /// The first free hour at or after the one asked for — and nil when there is not one. The
    /// optional is the feature; see the header.
    static func firstFree(mode: String, iso: String, slot: String, from now: Date = Date()) -> FreeSlot? {
        availability(mode: mode, from: now).first { $0.iso > iso || ($0.iso == iso && $0.slot >= slot) }
    }

    static func waitDays(from iso: String, to found: FreeSlot) -> Int {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_ZA")
        formatter.timeZone = Scheduling.zone
        formatter.dateFormat = "yyyy-MM-dd"
        guard let asked = formatter.date(from: iso), let offered = formatter.date(from: found.iso) else { return 0 }
        return max(0, Int((offered.timeIntervalSince(asked) / 86_400).rounded()))
    }

    static func resolve(mode: String, iso: String, slot: String, from now: Date = Date()) -> InterpreterOutcome {
        if let exact = freeAt(mode: mode, iso: iso, slot: slot, from: now) { return .matched(exact) }
        guard let next = firstFree(mode: mode, iso: iso, slot: slot, from: now) else { return .heldUnknown }
        return .held(next, days: waitDays(from: iso, to: next))
    }

    /// The status a visit carries out of that decision. Matched keeps whatever it had; the other two
    /// are held, in the contract's word, and a held visit is not dispatched.
    static func status(_ outcome: InterpreterOutcome, ifMatched: String) -> String {
        outcome.isHeld ? hold.status : ifMatched
    }

    /// The wait as a sentence, or the admission that there is not one. No third form, and no number
    /// to fall through to.
    static func waitSentence(_ outcome: InterpreterOutcome) -> String {
        guard let found = outcome.found else { return estimate.unknown }
        return "\(estimate.knownPrefix) \(found.interpreter.name), \(Scheduling.longDate(found.date)) at \(found.slot)."
    }
}
