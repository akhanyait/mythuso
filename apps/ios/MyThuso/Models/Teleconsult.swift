import Foundation

/* The teleconsultation call: the types and the reasoning, hand-written.

   The table itself — the roster, the five consent questions, the recording decision, the four
   connection states, the six clinical limits, the reconnection protocol, the seven encounter
   outcomes, the six rules and the six refusals — is generated into TeleconsultData.swift from
   packages/catalog/teleconsult.json, so nothing below is transcribed. What is here is the
   arithmetic, and there are only three pieces of it worth having.

   What the doctor may conclude, given the line and who is in the room. Two gates, not one: the
   connection decides what can be perceived, and the roster decides whether there is anybody there
   to examine on the doctor's behalf. A limit that needs a nurse goes the moment the patient asks
   her to step outside — which is the consequence they were told about before they asked.

   Which outcome an encounter had. Worked out, never chosen. A clinician under time pressure,
   offered a list of outcomes, picks the one nearest the top, and "completed" is nearly always
   nearest the top. So there is no list.

   Which sections of the consultation record an outcome writes. An encounter that did not reach a
   decision writes no assessment and no plan, and cannot be called a consultation. That is the whole
   feature. It is held here as arithmetic and checked in scripts/check-boundaries.mjs, because the
   failure is not somebody writing the wrong sentence — it is a half-finished encounter sitting in a
   record looking exactly like a finished one until somebody relies on it.

   Nobody is named in the contract. A participant carries a roleId into the vetting register and
   the screen resolves the party from there, so the registration the patient reads is the one a
   reviewer verified. Nothing here refuses a clinician in words of its own either: the call asks
   can(subject, "sign-clinical-review") and shows the clinical queue's answer.

   Nothing connects. No media framework is imported, no camera or microphone is requested, and this
   target declares neither permission. Every party below is fictional. */

struct MediaState: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
}

/// `declared` is a fact about the build, not a setting. It is false, and the screen says so.
struct MediaPosture {
    let declared: Bool
    let state: String
    let sentence: String
    let states: [MediaState]
    let whyTheDistinctionMatters: String
}

struct CallIdentity {
    let patientSideDetail: String
    let doctorSideDetail: String
    /// The same refusal the nurse gets at the door. One identity check, one sentence.
    let failure: String
    let whyOneMechanism: String
}

struct CallParticipant: Identifiable, Hashable {
    let id: String
    /// The role, not the person. `roleId` reaches into the vetting register for the person.
    let name: String
    let roleId: String?
    /// `where` is taken by Swift, so the generator emits the location as `place`.
    let place: String
    let sees: String
    let hears: String
    let essential: Bool
    let mayBeAskedToLeave: Bool
    let consentQuestion: String?
    let ifDeclined: String?
    let note: String
}

struct ConsentItem: Identifiable, Hashable {
    let id: String
    let participant: String?
    let required: Bool
    /// Every one of them is. Consent that cannot be taken back mid-call is not consent.
    let revocable: Bool
    let revokedMidCall: String
}

struct RecordingIfItExisted: Hashable {
    let askedSeparately: String
    let refusingIsCostless: String
    let whileRecording: String
    let whoMayView: [String]
    let keptForDays: Int
    let afterwards: String
}

struct RecordingPolicy {
    /// False. A recording switch this build cannot honour would teach the habit of granting it.
    let offeredInPreview: Bool
    let decision: String
    let why: String
    let instead: [String]
    let whenItExists: RecordingIfItExisted
}

struct ClinicalLimit: Identifiable, Hashable {
    let id: String
    let name: String
    /// "sound", "video" or "nurse" — what has to be true for this to be allowed.
    let needs: String
    let detail: String
}

struct ConnectionState: Identifiable, Hashable {
    let id: String
    let name: String
    /// 3 down to 0. What each state permits is a subset of the one above it, and the build fails
    /// if that stops being true.
    let fidelity: Int
    let patientSees: String
    let doctorSees: String
    let permits: [String]
    let note: String
}

struct Reconnect {
    let holdSeconds: Int
    let attempts: Int
    let whoCallsWhom: String
    let duringTheHold: String
    let afterTheHold: String
    let ifUnreachable: String
    let nurseInTheRoom: String
    let whyNotLonger: String
}

struct EncounterOutcome: Identifiable, Hashable {
    let id: String
    let name: String
    let reachedDecision: Bool
    let connectionLost: Bool
    /// The one that matters. False for every outcome that did not reach a decision.
    let countsAsConsultation: Bool
    let charged: Bool
    /// Section ids in packages/catalog/records.json.
    let writes: [String]
    let record: String
}

struct CallRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct CallRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
}

/// One of the three ways a person reaches a doctor. A route names a service in the catalogue rather
/// than carrying a price: a price lives in one place and this is not it. `serviceId` is nil for the
/// route a patient does not buy — the doctor joining a visit that has already been paid for.
struct CallRoute: Identifiable, Hashable {
    let id: String
    let name: String
    let serviceId: String?
    let startedBy: String
    let detail: String
    let patientWords: String
    /// False for the results review, which is a doctor reading rather than a call. Naming it a
    /// consultation would let a review be charged and recorded as one.
    let live: Bool
    let phase: Int
}

/// What a person is told between asking for a doctor and getting one.
struct WaitingState: Identifiable, Hashable {
    let id: String
    let name: String
    let patientWords: String
    /// What the screen puts beside the sentence — a name, a position in the queue, a plan.
    let shows: String
}

/// A document a consultation can produce, and the limit on producing it. A prescription and a
/// medical certificate are legal documents; a video call is not an examination, which is why two of
/// these have `mayIssue` false and say so in the patient's own words.
struct IssuedDocument: Identifiable, Hashable {
    let id: String
    let name: String
    let mayIssue: Bool
    let condition: String
    let goesTo: String?
    let limit: String
}

/// What actually happened, in the order the refusals bite.
struct CallAttempt {
    var clinicianAllowed = true
    var identityConfirmed = false
    var consented = false
    var everConnected = false
    var lineDropped = false
    var resumed = false
    var decisionReached = false
}

enum Teleconsult {
    static func participant(_ id: String) -> CallParticipant { participants.first { $0.id == id } ?? participants[0] }
    static func consentItem(_ id: String) -> ConsentItem { consent.first { $0.id == id } ?? consent[0] }
    static func consentFor(participant id: String) -> ConsentItem? { consent.first { $0.participant == id } }
    static func connectionState(_ id: String) -> ConnectionState { connection.first { $0.id == id } ?? connection[0] }
    static func limit(_ id: String) -> ClinicalLimit { clinicalLimits.first { $0.id == id } ?? clinicalLimits[0] }
    static func outcome(_ id: String) -> EncounterOutcome { outcomes.first { $0.id == id } ?? outcomes[0] }
    static func rule(_ id: String) -> CallRule { rules.first { $0.id == id } ?? rules[0] }
    static func refusal(_ id: String) -> CallRefusal { refusals.first { $0.id == id } ?? refusals[0] }
    static func route(_ id: String) -> CallRoute { routes.first { $0.id == id } ?? routes[0] }
    static func waiting(_ id: String) -> WaitingState { waitingRoom.first { $0.id == id } ?? waitingRoom[0] }
    static func document(_ id: String) -> IssuedDocument { issued.first { $0.id == id } ?? issued[0] }
    /// The two documents a call may not produce, so a screen lists them from the contract rather
    /// than from somebody remembering which two they were.
    static var refusedDocuments: [IssuedDocument] { issued.filter { !$0.mayIssue } }
    static func mediaState(_ id: String) -> MediaState { media.states.first { $0.id == id } ?? media.states[0] }

    /// Worst first, which is the order the ladder is read in when something is going wrong.
    static var degradations: [ConnectionState] { connection.sorted { $0.fidelity < $1.fidelity } }

    /* What this doctor may conclude, right now. The line and the room, both. */
    static func permitted(connection id: String, nursePresent: Bool) -> [ClinicalLimit] {
        let state = connectionState(id)
        return clinicalLimits.filter { state.permits.contains($0.id) && ($0.needs != "nurse" || nursePresent) }
    }
    static func withdrawn(connection id: String, nursePresent: Bool) -> [ClinicalLimit] {
        let allowed = Set(permitted(connection: id, nursePresent: nursePresent).map(\.id))
        return clinicalLimits.filter { !allowed.contains($0.id) }
    }
    /// On a dropped line this is false, which is why there is no button to close the encounter.
    static func mayConclude(connection id: String, nursePresent: Bool) -> Bool {
        permitted(connection: id, nursePresent: nursePresent).contains { $0.id == "conclude" }
    }

    /* The outcome, worked out rather than picked. */
    static func outcome(of attempt: CallAttempt) -> EncounterOutcome {
        if !attempt.clinicianAllowed { return outcome("clinician-refused") }
        if !attempt.identityConfirmed { return outcome("identity-failed") }
        if !attempt.consented { return outcome("consent-declined") }
        if !attempt.everConnected { return outcome("never-connected") }
        if !attempt.decisionReached { return outcome("interrupted") }
        return attempt.lineDropped && attempt.resumed ? outcome("resumed") : outcome("completed")
    }

    /// Which sections of the consultation record this outcome writes, resolved against the record
    /// contract itself rather than restated. A section it did not reach is withheld, not empty.
    static func sections(for outcome: EncounterOutcome) -> [(section: ConsultationSection, written: Bool)] {
        Records.consultationSections.map { ($0, outcome.writes.contains($0.id)) }
    }
}
