import Combine
import Foundation

/* The whole visit, held on the phone — not just the readings.
 *
 * CaptureQueue.swift already answers this question for one reading: six states, four conflicts, two
 * clocks, and a ledger on disk. What it does not cover is the rest of a visit. A nurse in a house in
 * Ivory Park with one bar checks a visit code at the door, reads consent aloud, types seven
 * observations, writes what she found and signs. Only the readings had anywhere to wait. Everything
 * else lived in @State on VisitAssessmentView, which is to say it lived nowhere: a crash, a phone
 * handed to a toddler, or iOS reclaiming the app in the background lost an assessment that a nurse
 * would then rewrite in the car from memory. A record written from memory an hour later is a
 * different record. That is a clinical safety problem before it is an inconvenience, and it is what
 * this module exists to stop.
 *
 * So this is not a second queue. It is the same queue one level up: a part is a piece of a visit
 * that has been finished, it carries the contract's own six states and four conflicts, and an
 * observations part carries real CaptureReadings.
 *
 * WHERE IT DIFFERS FROM THE WEB, AND WHY. apps/web/src/lib/visit-queue.ts is the same module and
 * holds its parts in a module-level array, because scripts/check-boundaries.mjs fails the build on
 * the browser's local storage, session storage and IndexedDB across the whole web app — a preview
 * must not leave patient readings on a borrowed machine. That store therefore does not survive a
 * reload, and the web screen says so in the contract's own words rather than implying a durability
 * it has not got. iOS is under no such constraint and does not copy the limitation: this writes to
 * the same Application Support directory the capture ledger uses, with the same file protection,
 * and the screen states what it actually survives instead. A queue that forgets is not a queue, it
 * is a delay before losing something.
 *
 * WHAT IT DOES NOT SURVIVE, and this is said on screen as plainly as what it does: deleting the
 * app, and losing the phone. The file is deliberately excluded from device backups, because a whole
 * assessment — a consent, seven readings and a signature — is special personal information under
 * POPIA and syncing it into whatever backup a phone happens to be attached to is a disclosure
 * nobody consented to. The cost of that is real: a lost phone loses the queue, and the answer to a
 * lost phone is to send, not to back up.
 *
 * Nothing is transmitted. There is no server; "sending" is decided here, by rules a reader can
 * check, and every screen that shows the result says where the decision was made. Every part,
 * patient and clinician below is fictional. */

// MARK: - What a piece of a visit is

/* Five parts, because those are the five things a nurse does in a house and each one is separately
   losable. They are not stages of a form — a form is a shape on a screen, and what is held here is
   work that has been done. The names are the assessment's own, so a nurse reading the queue reads
   the visit back rather than reading a data model. */
enum VisitPartKind: String, CaseIterable, Identifiable, Codable {
    case identity, consent, observations, findings, signOff = "sign-off"
    var id: String { rawValue }
    var name: String {
        switch self {
        case .identity: return "Identity check"
        case .consent: return "Consent"
        case .observations: return "Readings"
        case .findings: return "What you found"
        case .signOff: return "Your sign-off"
        }
    }
    var symbol: String {
        switch self {
        case .identity: return "person.text.rectangle"
        case .consent: return "hand.raised"
        case .observations: return "waveform.path.ecg"
        case .findings: return "text.alignleft"
        case .signOff: return "signature"
        }
    }
    /// What this part cannot do while it is still on the phone. A queue that only counts is a queue
    /// that lets a nurse assume the doctor has already seen it.
    var whileHeld: String {
        switch self {
        case .identity:
            return "The code was checked against the visit this phone already had. It is checked again by the server when it lands, and a code that fails then stops the visit being filed rather than stopping the visit that already happened."
        case .consent:
            return "What she agreed to is recorded here. It is not in her consent record yet, so nothing downstream may rely on it."
        case .observations:
            return "The numbers are here with where each one came from. No doctor can see them, and nothing has been compared against her history."
        case .findings:
            return "Written and kept. Nothing has been read by anybody else, and no referral has been raised."
        case .signOff:
            return "Signed on this phone, and not yet filed. A signature that has not reached the record cannot be relied on by anybody who was not in the room."
        }
    }
}

struct VisitPart: Identifiable, Codable, Hashable {
    var id: String
    var kind: VisitPartKind
    /// Which visit this belongs to, so two visits queued on one phone never answer for each other.
    var visitReference: String
    var patient: String
    /// One line, in the nurse's own terms, saying what this part holds.
    var summary: String
    /// The detail behind that line. An array of pairs rather than a dictionary, because the order a
    /// nurse did these things in is part of reading them back.
    var detail: [VisitPartFact]
    /// Observations only. Real readings, carrying their own provenance and instrument.
    var readings: [CaptureReading] = []
    var capturedBySubjectId: String
    var capturedByName: String
    var capturedByReference: String
    /* Two clocks, kept apart for the same reason CapturedEntry keeps them apart. The first is what
       this phone believed; the second is the only one that orders anything. */
    var deviceCapturedAt: Date
    var serverReceivedAt: Date?
    var writtenToPhoneAt: Date
    var state: CaptureState
    var conflict: CaptureConflict?
    var note: String?

    /// Still only on this phone, and still hers to correct.
    var isPending: Bool { state == .captured || state == .queued || state == .sending }
    /// Sealed and waiting on a connection: everything the nurse can do has been done.
    var isSealed: Bool { state == .queued || state == .sending }
}

struct VisitPartFact: Codable, Hashable, Identifiable {
    let label: String
    let value: String
    var id: String { label }
}

// MARK: - The file on disk

struct VisitPartLedger: Codable {
    static let version = 1
    var version: Int = VisitPartLedger.version
    var writtenAt: Date
    var parts: [VisitPart]
}

// MARK: - What the arrival questions are, and whose they are

/* The same questions CaptureStore.attemptSend asks of a reading, in the same order and for the same
   reasons: whether the person who did the work may still file it, whether the record moved on
   underneath it, and — for readings only — whether the record already holds this observation for
   this visit. The clocks are last and are never a refusal.

   The duplicate question is not answered here. It is asked of CaptureStore, which is the module
   that holds what this phone believes is already in the record. A second module keeping its own
   idea of what counts as a duplicate would be a second gate, and two gates is where holes live. */
struct VisitArrival {
    var now: Date
    var capturerAllowed: Bool
    var capturerReason: String?
    /// A doctor signed, or the visit was cancelled, while the part was waiting.
    var recordMovedOn: Bool
    var movedOnNote: String?
    /// What the record already holds for a visit, asked of the capture ledger rather than kept here.
    var alreadyStored: (String) -> Set<String>
}

func receive(_ part: VisitPart, _ arrival: VisitArrival) -> VisitPart {
    var received = part
    received.serverReceivedAt = arrival.now
    received.writtenToPhoneAt = arrival.now
    if !arrival.capturerAllowed {
        received.state = .conflicted
        received.conflict = .vettingLapsed
        received.note = "\(part.capturedByName) was cleared when she did this and is not cleared now. \(arrival.capturerReason ?? "") It is kept — it was validly done — and it is not filed on her authority alone."
            .trimmingCharacters(in: .whitespaces)
        return received
    }
    if arrival.recordMovedOn {
        received.state = .conflicted
        received.conflict = .staleWrite
        received.note = arrival.movedOnNote
            ?? "The record changed while this was waiting to send. It is never applied silently after the fact."
        return received
    }
    if !part.readings.isEmpty {
        let stored = arrival.alreadyStored(part.visitReference)
        let clashing = part.readings.filter { stored.contains($0.observationId) }
        if !clashing.isEmpty {
            received.state = .conflicted
            received.conflict = .duplicateObservation
            received.note = "The record already holds \(clashing.map(\.label).joined(separator: " and ")) for \(part.visitReference). Both are kept; a clinician says which stands."
            return received
        }
    }
    received.state = .stored
    received.conflict = nil
    return received
}

// MARK: - One live store the visit screens share

@MainActor final class VisitQueueStore: ObservableObject {
    static let shared = VisitQueueStore()

    @Published private(set) var parts: [VisitPart] = []
    @Published private(set) var ledgerWrittenAt: Date?
    @Published private(set) var storeNote = ""
    /// A ledger that would not parse is renamed, never deleted, and the new name is said out loud.
    @Published private(set) var setAside: String?
    /* Two design-review controls, and neither pretends to be a product feature: there is no radio in
       this build and no doctor to sign anything, so the two things that make a queue interesting
       have to be askable for. */
    @Published var pretendNoSignal = true
    @Published var pretendDoctorSigned = false

    private var sequence = 0

    private static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("ThusoCapture", isDirectory: true)
    }
    /// Beside the reading ledger, in the same protected directory, as its own file. One file per
    /// thing so a parse failure in one cannot take the other down with it.
    static var ledgerURL: URL { directory.appendingPathComponent("visit-parts.json") }
    var ledgerPath: String { VisitQueueStore.ledgerURL.path }

    private static let coder: (JSONEncoder, JSONDecoder) = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (encoder, decoder)
    }()

    init() { load() }

    // MARK: Reading and writing

    private func load() {
        let url = VisitQueueStore.ledgerURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            seed()
            storeNote = "No visit ledger existed on this phone, so one was written with the parts a review needs to see on opening."
            return
        }
        do {
            let ledger = try VisitQueueStore.coder.1.decode(VisitPartLedger.self, from: Data(contentsOf: url))
            parts = ledger.parts
            ledgerWrittenAt = ledger.writtenAt
            sequence = parts.count
            storeNote = "Read from the visit ledger on this phone."
        } catch {
            /* A ledger that will not parse is still the nurse's work. It is moved aside with a name
               that says when, and the app carries on with a fresh one — because the alternative is
               deleting evidence to make a screen load. */
            let aside = VisitQueueStore.directory
                .appendingPathComponent("visit-parts.unreadable-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.moveItem(at: url, to: aside)
            setAside = aside.lastPathComponent
            seed()
            storeNote = "The visit ledger on this phone could not be read. It has been kept, under a new name, and a fresh one started. Nothing was deleted."
        }
    }

    private func persist() {
        let now = Date()
        ledgerWrittenAt = now
        do {
            try FileManager.default.createDirectory(at: VisitQueueStore.directory, withIntermediateDirectories: true)
            let data = try VisitQueueStore.coder.0.encode(VisitPartLedger(writtenAt: now, parts: parts))
            /* completeUnlessOpen rather than complete: a nurse locks the phone with the assessment
               still open, and a part that cannot be written because the screen went dark is a part
               lost to a security setting nobody asked for. */
            try data.write(to: VisitQueueStore.ledgerURL, options: [.atomic, .completeFileProtectionUnlessOpen])
            excludeFromBackup()
        } catch {
            storeNote = "This phone would not accept the write: \(error.localizedDescription). Nothing in memory has been dropped."
        }
    }
    private func excludeFromBackup() {
        var url = VisitQueueStore.ledgerURL
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    // MARK: Holding a finished part

    var pending: [VisitPart] { parts.filter(\.isPending) }
    var held: [VisitPart] { parts.filter { $0.state == .captured } }
    var sealed: [VisitPart] { parts.filter(\.isSealed) }
    var queuedCount: Int { parts.filter { $0.state == .queued }.count }
    var conflicted: [VisitPart] { parts.filter { $0.state == .conflicted } }
    var stored: [VisitPart] { parts.filter { $0.state == .stored } }

    /// The age of the oldest thing still on this phone. Nothing here is ever a bare timestamp.
    var oldestPending: Date? { pending.map(\.deviceCapturedAt).min() }

    /* Hold a finished part on the device. Nothing is sent, and the state says exactly that.

       One part per kind per visit: a nurse who steps back to correct the readings and comes forward
       again has corrected them, not taken a second set, so a held part is replaced rather than
       stacked. Anything already sealed or stored is left alone — that is no longer hers to
       overwrite, and a second set against a stored one is the duplicate conflict, arrived at
       rather than invented. */
    @discardableResult
    func hold(kind: VisitPartKind, visit: String, patient: String, summary: String,
              detail: [VisitPartFact], readings: [CaptureReading] = [], by subject: VettingSubject) -> VisitPart {
        sequence += 1
        let now = Date()
        let part = VisitPart(id: String(format: "VQ-%03d", sequence), kind: kind, visitReference: visit,
                             patient: patient, summary: summary, detail: detail, readings: readings,
                             capturedBySubjectId: subject.id, capturedByName: subject.name,
                             capturedByReference: subject.reference,
                             deviceCapturedAt: now, serverReceivedAt: nil, writtenToPhoneAt: now,
                             state: .captured)
        if let index = parts.firstIndex(where: {
            $0.visitReference == visit && $0.kind == kind && $0.state == .captured
        }) {
            parts[index] = part
        } else {
            parts.append(part)
        }
        persist()
        return part
    }

    /// Sealing is the nurse saying she is finished. The contract's own word for the state she
    /// leaves it in, and after it there is nothing left for her to do.
    @discardableResult
    func seal(visit: String) -> Int {
        var count = 0
        let now = Date()
        for index in parts.indices where parts[index].visitReference == visit && parts[index].state == .captured {
            parts[index].state = .queued
            parts[index].writtenToPhoneAt = now
            count += 1
        }
        if count > 0 { persist() }
        return count
    }

    // MARK: Sending

    /* Two steps with a pause between them, because "sending" is a state a nurse can watch fail and
       a queue whose in-flight state is invisible is a queue nobody believes. */
    func attemptSend(isStillCleared: @escaping (String) -> (allowed: Bool, reason: String?)) async -> String {
        if pretendNoSignal {
            let waiting = queuedCount
            return "Nothing was sent: this phone is being shown with no signal. \(waiting) piece\(waiting == 1 ? "" : "s") of work stay\(waiting == 1 ? "s" : "") sealed and waiting, which is what waiting is supposed to look like."
        }
        let waiting = parts.enumerated().filter { $0.element.state == .queued }.map(\.offset)
        guard !waiting.isEmpty else { return "Nothing is waiting to send." }
        for index in waiting { parts[index].state = .sending }
        persist()
        try? await Task.sleep(nanoseconds: 700_000_000)
        /* Interrupted while in flight. The work went back to the queue and nowhere else, and a
           settle that ran on top of that would file something the nurse has already been told is
           still waiting. */
        guard parts.contains(where: { $0.state == .sending }) else { return "The send was interrupted. Everything went back to the queue rather than anywhere else." }

        var filed = 0, conflicts = 0
        for index in waiting where parts[index].state == .sending {
            let standing = isStillCleared(parts[index].capturedBySubjectId)
            let arrival = VisitArrival(now: Date(), capturerAllowed: standing.allowed,
                                       capturerReason: standing.reason,
                                       recordMovedOn: pretendDoctorSigned,
                                       movedOnNote: "A doctor signed this visit while the work was waiting to send. It is never applied silently after the fact, and a signed record is not edited behind the signature.",
                                       alreadyStored: { CaptureStore.shared.storedObservationIds(visit: $0) })
            parts[index] = receive(parts[index], arrival)
            parts[index].state == .stored ? (filed += 1) : (conflicts += 1)
        }
        persist()
        var said: [String] = []
        if filed > 0 { said.append("\(filed) filed") }
        if conflicts > 0 { said.append("\(conflicts) waiting on a clinician") }
        return "Decided here, on this phone, by the rules in VisitQueue.swift — there is no server in this build: \(said.joined(separator: ", "))."
    }

    /// An interrupted send puts the work back in the queue, and nowhere else.
    func interruptSend() {
        var moved = false
        for index in parts.indices where parts[index].state == .sending {
            parts[index].state = .queued
            parts[index].note = "The send was interrupted. It went back to the queue rather than anywhere else."
            parts[index].writtenToPhoneAt = Date()
            moved = true
        }
        if moved { persist() }
    }

    // MARK: Demonstrating what it survives

    /// A cold launch, without the launch. Drops everything held in memory and reads the file again.
    func reloadFromDisk() {
        parts = []
        ledgerWrittenAt = nil
        setAside = nil
        load()
    }
    /// The only thing here that removes anything, and it is a person's deliberate act on fictional
    /// parts — never something a sync, a sign-out or a failure does.
    func resetToFixtures() {
        try? FileManager.default.removeItem(at: VisitQueueStore.ledgerURL)
        parts = []
        seed()
        storeNote = "The visit ledger was cleared by hand and written again from the fixtures."
    }

    private func seed() {
        parts = VisitQueueFixtures.parts
        sequence = parts.count
        persist()
    }
}

// MARK: - What is found at the start of a shift

/* One part from the last house, sealed and never sent, and one that reached the record two days
   ago. Not staging: the first is what an offline queue actually looks like at the start of a shift,
   and the second is what gives the duplicate check something to answer against. */
enum VisitQueueFixtures {
    static let visit = "TH-2041"
    static let patient = "R. Sithole"

    static var parts: [VisitPart] {
        let naledi = VettingFixtures.subjects.first { $0.id == "N-205" }
        let by = (id: naledi?.id ?? "N-205", name: naledi?.name ?? "Sister Naledi Mokoena",
                  reference: naledi?.reference ?? "SANC 20016688")
        let hours: (Double) -> Date = { Date().addingTimeInterval(-$0 * 3600) }
        func reading(_ id: String, _ value: String) -> CaptureReading {
            CaptureReading(id: "VQ-\(id)", observationId: id, label: KitMeasures.label(id),
                           unit: KitMeasures.unit(id), value: value, provenance: .manual)
        }
        return [
            VisitPart(id: "VQ-001", kind: .observations, visitReference: visit, patient: patient,
                      summary: "Three readings from yesterday’s visit in Parktown",
                      detail: [VisitPartFact(label: "Blood pressure — systolic", value: "138 mmHg"),
                               VisitPartFact(label: "Pulse", value: "78 bpm"),
                               VisitPartFact(label: "Temperature", value: "36.9 °C")],
                      readings: [reading("systolic", "138"), reading("pulse", "78"), reading("temperature", "36.9")],
                      capturedBySubjectId: by.id, capturedByName: by.name, capturedByReference: by.reference,
                      deviceCapturedAt: hours(20), serverReceivedAt: nil, writtenToPhoneAt: hours(20),
                      state: .queued),
            VisitPart(id: "VQ-002", kind: .identity, visitReference: visit, patient: patient,
                      summary: "Visit code confirmed at the door, and identity seen",
                      detail: [VisitPartFact(label: "Visit code", value: "Six digits, matched"),
                               VisitPartFact(label: "Identity", value: "Document seen by the nurse")],
                      capturedBySubjectId: by.id, capturedByName: by.name, capturedByReference: by.reference,
                      deviceCapturedAt: hours(20.2), serverReceivedAt: hours(19.9), writtenToPhoneAt: hours(19.9),
                      state: .stored)
        ]
    }
}
