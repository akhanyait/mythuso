import Combine
import Foundation

/* What happens to a reading between the front room and the record.

   The rest of this preview holds everything in memory, on purpose: nothing about a design review
   needs a patient’s blood pressure to survive the app being killed. Capture is the exception, and
   the contract says why. “An entry that has been captured is the nurse’s work. It survives a crash,
   a restart and a sign-out, and it is never dropped to make a sync succeed.” A queue that forgets
   is not a queue, it is a delay before losing something, and a nurse who has been told her work is
   safe and finds it gone will never trust the app again.

   So this one module writes to disk. It is a JSON file in Application Support, written through
   FileManager with iOS data protection on it. There is no database, no dependency and no
   framework — the ledger is small, it is written whole, and being able to read it with your eyes is
   worth more here than being able to query it.

   What it survives, exactly, is stated on screen in CaptureQueueView and it is stated accurately:
     · a crash and a force-quit — the file is written at the moment of capture, not at exit;
     · a restart of the phone;
     · a sign-out — this preview’s sign-out returns to the first-run flow and does not go near the
       ledger, because the entries belong to the work rather than to the session.
   What it does not survive is the app being deleted, and it is deliberately excluded from device
   backups: readings are special personal information under POPIA, and a nurse’s phone backing them
   up to somebody’s laptop is not a promise this preview should be quietly making. That is a real
   trade — it means a lost phone loses the queue — and it is written down rather than assumed.

   Nothing is transmitted. There is no server: “sending” runs here, on this phone, and every screen
   that shows a result says so. Every entry, patient and clinician below is fictional. */

// MARK: - The six states

enum CaptureState: String, CaseIterable, Identifiable, Codable {
    case captured, queued, sending, stored, conflicted, refused
    var id: String { rawValue }
    var name: String {
        switch self {
        case .captured: return "Captured"
        case .queued: return "Waiting to send"
        case .sending: return "Sending"
        case .stored: return "Stored"
        case .conflicted: return "Needs a decision"
        case .refused: return "Refused"
        }
    }
    var detail: String {
        switch self {
        case .captured: return "Taken, and held on the device it was taken on. It exists nowhere else yet."
        case .queued: return "Finished and sealed, waiting for a connection. The nurse has done everything they can do."
        case .sending: return "In flight. Interruptible without loss — an entry that does not land stays queued."
        case .stored: return "Accepted by the server and in the record."
        case .conflicted: return "Landed against a record that already holds a reading for the same observation in the same visit. Nothing is merged and nothing is discarded."
        case .refused: return "The server would not take it, and says why. It stays on the device until somebody decides what to do with it."
        }
    }
    var tone: String {
        switch self {
        case .captured: return "sky"
        case .queued: return "quiet"
        case .sending: return "sky"
        case .stored: return "teal"
        case .conflicted: return "amber"
        case .refused: return "danger"
        }
    }
    var symbol: String {
        switch self {
        case .captured: return "iphone"
        case .queued: return "tray.full"
        case .sending: return "arrow.up.circle"
        case .stored: return "checkmark.seal"
        case .conflicted: return "questionmark.circle"
        case .refused: return "hand.raised"
        }
    }
    /// Whether the entry is still only on this phone. Drives the sentence a reader needs most.
    var onlyOnThisPhone: Bool { self != .stored }
}

// MARK: - The four conflicts

enum CaptureConflict: String, CaseIterable, Identifiable, Codable {
    case duplicateObservation = "duplicate-observation"
    case clockSkew = "clock-skew"
    case staleWrite = "stale-write"
    case vettingLapsed = "vetting-lapsed"
    var id: String { rawValue }
    var name: String {
        switch self {
        case .duplicateObservation: return "Two readings, one observation"
        case .clockSkew: return "The device clock disagrees"
        case .staleWrite: return "The record moved on"
        case .vettingLapsed: return "The capturer’s standing lapsed"
        }
    }
    var detail: String {
        switch self {
        case .duplicateObservation:
            return "The same observation recorded twice in one visit — usually a retake after a doubtful first reading. Both are kept; a clinician says which stands, and the other stays visible as superseded rather than being deleted."
        case .clockSkew:
            return "A device that has been offline may have drifted or been set by hand. The server’s receipt time is authoritative for ordering; the device’s time is kept beside it as what the device believed, never presented as the time it happened."
        case .staleWrite:
            return "The record changed while the entry was queued — a doctor has already signed, or the visit was cancelled. It is never applied silently after the fact."
        case .vettingLapsed:
            return "A nurse whose clearance lapsed between capture and sync. The reading was taken while she was cleared, so it is not discarded — but it is not filed on her authority alone either."
        }
    }
    /// The contract names a resolver for every conflict, and the two answers behave differently.
    /// A “server” conflict is settled by arithmetic the moment the entry lands and nobody is asked;
    /// a “clinician” conflict stops and waits for a person, however long that takes.
    var resolution: String {
        switch self {
        case .clockSkew: return "server"
        default: return "clinician"
        }
    }
    var asksAPerson: Bool { resolution == "clinician" }
}

// MARK: - A reading, with everything that has to travel with it

struct CaptureReading: Codable, Hashable, Identifiable {
    var id: String
    var observationId: String
    var label: String
    var unit: String
    var value: String
    /* Not optional, and there is no “unknown” case in the enum to fall back on. That is the shape
       of “there is no default”: a reading whose origin nobody stated cannot be constructed, so it
       cannot be filed, so the rule holds by construction rather than by everybody remembering. */
    var provenance: Provenance
    var instrumentId: String?
    var instrumentName: String?
    var instrumentSerial: String?
    /* Frozen at the moment of capture rather than looked up later. The question a reader asks in
       eight months is what the calibration was on the morning the number was taken, not what it is
       on the morning they are reading. */
    var calibratedOn: Date?
    var calibrationStanding: CalibrationStanding?
    var qualifierLabel: String?
    var qualifier: String?
    var derivedFrom: [String] = []
    /* Marks, never blocks. Everything that would make a reader treat the number differently: a
       calibration that ran out, a strip lot that expired, a probe on a cold finger, a single-lead
       trace that is a screening tool and not a diagnosis. */
    var caveats: [String] = []

    var display: String { unit == "trace" ? value : "\(value) \(unit)" }
    var hasCaveats: Bool { !caveats.isEmpty }
    var instrumentLine: String? {
        guard let name = instrumentName else { return nil }
        return instrumentSerial.map { "\(name) · \($0)" } ?? name
    }
}

// MARK: - An entry in the ledger

struct CapturedEntry: Identifiable, Codable, Hashable {
    var id: String
    var visitReference: String
    var patient: String
    var reading: CaptureReading
    var capturedBySubjectId: String
    var capturedByName: String
    var capturedByReference: String
    /* Two times, kept apart on purpose and never collapsed into one. deviceCapturedAt is what this
       phone’s clock said; serverReceivedAt is when it was accepted. The first is evidence about the
       phone, the second is the only one that orders anything. */
    var deviceCapturedAt: Date
    var serverReceivedAt: Date?
    /// When this row was written into the file on this phone. What offlineNeverServesStaleSilently
    /// is measured against — the age of the copy, not the age of the reading.
    var writtenToPhoneAt: Date
    var state: CaptureState
    var conflict: CaptureConflict?
    /// The entry already in the record that this one landed against.
    var conflictWithId: String?
    var refusal: String?
    /// Superseded, not deleted. The reading stays readable and says which decision set it aside.
    var supersededById: String?
    var supersedes: String?
    var decidedBy: String?
    var decidedByReference: String?
    var decidedAt: Date?
    var decision: String?
    var countersignedBy: String?
    var countersignedByReference: String?

    var superseded: Bool { supersededById != nil }
    /// The device clock is only worth remarking on when it disagreed with the receipt by enough to
    /// change the order of two readings.
    var clockDisagreedBy: TimeInterval? {
        guard let received = serverReceivedAt else { return nil }
        let drift = deviceCapturedAt.timeIntervalSince(received)
        return abs(drift) > CaptureLedger.skewTolerance ? drift : nil
    }
    /// The one sentence that must never be got wrong: an entry nobody has received has no time it
    /// happened, only a time a phone believed.
    var whenItHappened: String {
        guard let received = serverReceivedAt else {
            return "Not received yet, so this reading has no time it happened — only a time this phone believed."
        }
        return captureStamp(received)
    }
}

// MARK: - The file on disk

struct CaptureLedger: Codable {
    static let version = 1
    /// Ten minutes. Below this a phone clock is merely a phone clock; above it, two readings can
    /// be put in the wrong order by trusting it.
    static let skewTolerance: TimeInterval = 600
    var version: Int = CaptureLedger.version
    var writtenAt: Date
    var entries: [CapturedEntry]
    var instruments: [PairedInstrument]
}

// MARK: - One live store the capture screens share

@MainActor final class CaptureStore: ObservableObject {
    static let shared = CaptureStore()

    @Published private(set) var entries: [CapturedEntry] = []
    @Published private(set) var instruments: [PairedInstrument] = []
    /// When the file this screen is reading was last written. Shown, in words, wherever it is read.
    @Published private(set) var ledgerWrittenAt: Date?
    /// What happened the last time the ledger was opened, in a sentence fit to print.
    @Published private(set) var storeNote = ""
    /// A ledger that would not parse is renamed, never deleted, and the new name is said out loud.
    @Published private(set) var setAside: String?
    /* Two design-review controls. Neither pretends to be a product feature: there is no radio in
       this build and no clock to be wrong, so the two things that make a queue interesting have to
       be askable for. */
    @Published var pretendNoSignal = true
    @Published var pretendClockFastHours = 0

    private var sequence = 0
    private var captureSequence = 0

    // MARK: Where the file lives

    private static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("ThusoCapture", isDirectory: true)
    }
    static var ledgerURL: URL { directory.appendingPathComponent("capture-ledger.json") }
    /// Said on screen, so “it is on this phone” is a claim a reader can go and check.
    var ledgerPath: String { CaptureStore.ledgerURL.path }

    private static let coder: (JSONEncoder, JSONDecoder) = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        // Written to be read by a person as well as by this app. A queue nobody can inspect is a
        // queue nobody can be shown the truth about.
        return (encoder, decoder)
    }()

    init() { load() }

    // MARK: Reading and writing the ledger

    private func load() {
        let url = CaptureStore.ledgerURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            seed()
            storeNote = "No ledger existed on this phone, so one was written with the fictional entries the four conflicts need."
            return
        }
        do {
            let ledger = try CaptureStore.coder.1.decode(CaptureLedger.self, from: Data(contentsOf: url))
            entries = ledger.entries
            instruments = ledger.instruments
            ledgerWrittenAt = ledger.writtenAt
            sequence = entries.count
            storeNote = "Read from the ledger on this phone."
        } catch {
            /* A ledger that will not parse is still the nurse’s work. It is moved aside with a name
               that says when, and the app carries on with a fresh one — because the alternative is
               deleting evidence to make a screen load. */
            let aside = CaptureStore.directory
                .appendingPathComponent("capture-ledger.unreadable-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.moveItem(at: url, to: aside)
            setAside = aside.lastPathComponent
            seed()
            storeNote = "The ledger on this phone could not be read. It has been kept, under a new name, and a fresh one started. Nothing was deleted."
        }
    }

    private func persist() {
        let now = Date()
        ledgerWrittenAt = now
        let ledger = CaptureLedger(writtenAt: now, entries: entries, instruments: instruments)
        do {
            try FileManager.default.createDirectory(at: CaptureStore.directory, withIntermediateDirectories: true)
            let data = try CaptureStore.coder.0.encode(ledger)
            /* completeUnlessOpen rather than complete: a nurse locks the phone with the app still
               holding the queue open, and an entry that cannot be written because the screen went
               dark is an entry lost to a security setting nobody asked for. */
            try data.write(to: CaptureStore.ledgerURL, options: [.atomic, .completeFileProtectionUnlessOpen])
            excludeFromBackup()
        } catch {
            storeNote = "This phone would not accept the write: \(error.localizedDescription). Nothing in memory has been dropped."
        }
    }
    /* Health data is special personal information. A queue of readings syncing itself into whatever
       backup the phone happens to be attached to is a disclosure nobody consented to, so the file
       is marked as not for backup. The cost is real and is said on screen: a lost phone loses the
       queue, and the answer to that is to send, not to back it up. */
    private func excludeFromBackup() {
        var url = CaptureStore.ledgerURL
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    // MARK: Pairing

    var pairedIds: Set<String> { Set(instruments.map(\.id)) }
    func paired(measuring observationId: String) -> [PairedInstrument] {
        instruments.filter { $0.device?.measures.contains(observationId) ?? false }
    }
    func pair(_ sighting: KitSighting) {
        guard !pairedIds.contains(sighting.id) else { return }
        instruments.append(PairedInstrument(id: sighting.id, deviceId: sighting.deviceId, serial: sighting.serial,
                                            lastCalibrated: sighting.lastCalibrated, pairedAt: Date()))
        persist()
    }
    func unpair(_ id: String) {
        instruments.removeAll { $0.id == id }
        persist()
    }

    // MARK: Capturing

    /// The phone’s own idea of now, which is the only clock this app has and is not to be trusted.
    var deviceNow: Date { Date().addingTimeInterval(TimeInterval(pretendClockFastHours) * 3600) }

    func nextReadingId() -> String {
        captureSequence += 1
        return String(format: "R-%05d", captureSequence + entries.count)
    }

    /* A reading is written to the file the moment it is taken, not when the form is finished. That
       is what makes “captured” an honest state: it exists on this phone, it exists nowhere else,
       and closing the app does not undo the taking of it.

       While an entry is still only captured, re-taking the same observation in the same visit
       replaces it — that is a correction, not a second opinion. Once it has been sealed and sent,
       a second reading of the same observation is a second fact, and the record has to be told
       which one stands. That is exactly the duplicate-observation conflict, arrived at rather
       than invented. */
    @discardableResult
    func capture(_ reading: CaptureReading, visit: String, patient: String, by subject: VettingSubject) -> CapturedEntry {
        sequence += 1
        let now = Date()
        let entry = CapturedEntry(id: String(format: "CAP-%05d", sequence + 100),
                                  visitReference: visit, patient: patient, reading: reading,
                                  capturedBySubjectId: subject.id, capturedByName: subject.name,
                                  capturedByReference: subject.reference,
                                  deviceCapturedAt: deviceNow, serverReceivedAt: nil,
                                  writtenToPhoneAt: now, state: .captured)
        if let index = entries.firstIndex(where: {
            $0.state == .captured && $0.visitReference == visit && $0.reading.observationId == reading.observationId
        }) {
            entries[index] = entry
        } else {
            entries.append(entry)
        }
        persist()
        return entry
    }

    /// Sealing is the nurse saying she is finished. After it, there is nothing left for her to do.
    @discardableResult
    func seal(visit: String) -> Int {
        var sealed = 0
        let now = Date()
        for index in entries.indices where entries[index].visitReference == visit && entries[index].state == .captured {
            entries[index].state = .queued
            entries[index].writtenToPhoneAt = now
            sealed += 1
        }
        if sealed > 0 { persist() }
        return sealed
    }

    func captured(visit: String) -> [CapturedEntry] {
        entries.filter { $0.visitReference == visit && $0.state == .captured }
    }
    /* What this phone believes the record already holds for a visit. VisitQueue.swift asks this
       rather than keeping its own idea of what counts as a duplicate: two modules deciding that
       separately is a second gate, and two gates is where holes live. */
    func storedObservationIds(visit: String) -> Set<String> {
        Set(entries.filter { $0.visitReference == visit && $0.state == .stored && !$0.superseded }
            .map(\.reading.observationId))
    }
    func forVisit(_ visit: String) -> [CapturedEntry] {
        entries.filter { $0.visitReference == visit }
    }

    // MARK: Sending

    var queuedCount: Int { entries.filter { $0.state == .queued }.count }
    var conflictedCount: Int { entries.filter { $0.state == .conflicted }.count }
    var refusedCount: Int { entries.filter { $0.state == .refused }.count }
    var onlyHereCount: Int { entries.filter { $0.state.onlyOnThisPhone }.count }

    /* There is no server, so “accepted” is decided here, by rules a reader can check, and every
       screen that shows the outcome says where the decision was actually made.

       Whether the capturer is still cleared is not decided here either. The queue asks — the answer
       comes from the same vetting record dispatch and the clinical queue ask, so a nurse declined
       in the console a moment ago is a nurse this queue stops on. A module that kept its own idea
       of who is cleared would be a second gate, and two gates is where holes live. */
    func attemptSend(isStillCleared: @escaping (String) -> Bool) async -> String {
        if pretendNoSignal {
            return "Nothing was sent: this phone is being shown with no signal. \(queuedCount) entr\(queuedCount == 1 ? "y stays" : "ies stay") sealed and waiting, which is what waiting is supposed to look like."
        }
        let waiting = entries.enumerated().filter { $0.element.state == .queued }.map(\.offset)
        guard !waiting.isEmpty else { return "Nothing is waiting to send." }
        for index in waiting { entries[index].state = .sending }
        persist()
        try? await Task.sleep(nanoseconds: 700_000_000)

        var stored = 0, conflicted = 0, refused = 0
        for index in waiting {
            let entry = entries[index]
            let received = Date()
            /* Order matters and is not arbitrary. Standing is asked first because a reading nobody
               may file is not made fileable by being the only one of its kind; the record’s own
               state is asked next; and only then is the reading compared with what is already
               there. */
            if !isStillCleared(entry.capturedBySubjectId) {
                entries[index].state = .conflicted
                entries[index].conflict = .vettingLapsed
                entries[index].serverReceivedAt = received
                conflicted += 1
            } else if let existing = entries.first(where: {
                $0.id != entry.id && $0.visitReference == entry.visitReference
                    && $0.reading.observationId == entry.reading.observationId
                    && $0.state == .stored && !$0.superseded
            }) {
                entries[index].state = .conflicted
                entries[index].conflict = .duplicateObservation
                entries[index].conflictWithId = existing.id
                entries[index].serverReceivedAt = received
                conflicted += 1
            } else if CaptureFixtures.signedVisits.contains(entry.visitReference) {
                entries[index].state = .conflicted
                entries[index].conflict = .staleWrite
                entries[index].serverReceivedAt = received
                conflicted += 1
            } else if !CaptureFixtures.knownVisits.contains(entry.visitReference) {
                entries[index].state = .refused
                entries[index].refusal = "This visit reference is not one the record holds for \(entry.patient). Nothing has been written, and the entry stays on the phone until somebody decides what it belongs to."
                entries[index].serverReceivedAt = received
                refused += 1
            } else {
                entries[index].state = .stored
                entries[index].serverReceivedAt = received
                /* The one conflict nobody is asked about. The receipt time orders the record; the
                   phone’s time is kept beside it as what the phone believed, and the row says so
                   rather than quietly preferring one. */
                if entries[index].clockDisagreedBy != nil { entries[index].conflict = .clockSkew }
                stored += 1
            }
            entries[index].writtenToPhoneAt = Date()
        }
        persist()
        var parts: [String] = []
        if stored > 0 { parts.append("\(stored) stored") }
        if conflicted > 0 { parts.append("\(conflicted) waiting on a clinician") }
        if refused > 0 { parts.append("\(refused) refused") }
        return "Decided here, on this phone, by the rules in CaptureQueue.swift — there is no server in this build: \(parts.joined(separator: ", "))."
    }

    // MARK: Resolving, without merging and without discarding

    /* Nothing below deletes anything. The word the contract uses is “superseded”, and it means the
       reading stays readable, stays attributed and says which decision set it aside — because a
       nurse whose retake was set aside is entitled to see that it was, and by whom. */
    func resolveDuplicate(keep keptId: String, supersede supersededId: String, by clinician: VettingSubject, note: String) {
        let now = Date()
        if let kept = entries.firstIndex(where: { $0.id == keptId }) {
            entries[kept].state = .stored
            entries[kept].conflict = entries[kept].clockDisagreedBy != nil ? .clockSkew : nil
            entries[kept].supersedes = supersededId
            entries[kept].decidedBy = clinician.name
            entries[kept].decidedByReference = clinician.reference
            entries[kept].decidedAt = now
            entries[kept].decision = note
            entries[kept].writtenToPhoneAt = now
        }
        if let gone = entries.firstIndex(where: { $0.id == supersededId }) {
            entries[gone].supersededById = keptId
            entries[gone].decidedBy = clinician.name
            entries[gone].decidedByReference = clinician.reference
            entries[gone].decidedAt = now
            entries[gone].decision = note
            entries[gone].writtenToPhoneAt = now
        }
        persist()
    }

    /* The lapsed nurse. The reading was taken while she was cleared, so it is not thrown away; it
       is not filed on her authority alone either, because that authority no longer exists. A
       cleared clinician reads it and puts their own registration to it, and the record then carries
       both names — who took the reading and who stands behind its being in the file. */
    func countersign(_ id: String, by clinician: VettingSubject, note: String) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let now = Date()
        entries[index].state = .stored
        entries[index].conflict = nil
        entries[index].countersignedBy = clinician.name
        entries[index].countersignedByReference = clinician.reference
        entries[index].decidedBy = clinician.name
        entries[index].decidedByReference = clinician.reference
        entries[index].decidedAt = now
        entries[index].decision = note
        entries[index].writtenToPhoneAt = now
        persist()
    }

    /// A record that has moved on is added to, in the open, after the signature — never edited
    /// behind it.
    func fileAsAddendum(_ id: String, by clinician: VettingSubject, note: String) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let now = Date()
        entries[index].state = .stored
        entries[index].conflict = nil
        entries[index].decidedBy = clinician.name
        entries[index].decidedByReference = clinician.reference
        entries[index].decidedAt = now
        entries[index].decision = "Filed as an addendum after the signature. \(note)"
        entries[index].writtenToPhoneAt = now
        persist()
    }

    /// Neither filed nor thrown away. The honest third answer, and the one a busy screen tempts
    /// everybody into skipping.
    func hold(_ id: String, by clinician: VettingSubject, note: String) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].decidedBy = clinician.name
        entries[index].decidedByReference = clinician.reference
        entries[index].decidedAt = Date()
        entries[index].decision = "Held for a decision elsewhere. \(note)"
        entries[index].writtenToPhoneAt = Date()
        persist()
    }

    func requeue(_ id: String) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].state = .queued
        entries[index].refusal = nil
        entries[index].serverReceivedAt = nil
        entries[index].writtenToPhoneAt = Date()
        persist()
    }

    func entry(_ id: String) -> CapturedEntry? { entries.first { $0.id == id } }

    // MARK: Demonstrating what it survives

    /* Signing out of this preview returns to the first-run flow and goes nowhere near the ledger.
       This drops everything held in memory and reads the file again from scratch, which is what a
       cold launch does, and is the only way to show the promise being kept rather than described. */
    func reloadFromDisk() {
        entries = []
        instruments = []
        ledgerWrittenAt = nil
        setAside = nil
        load()
    }
    /// The only thing in this module that removes anything, and it is a person’s deliberate act on
    /// a preview full of fictional entries — never something a sync, a sign-out or a failure does.
    func resetToFixtures() {
        try? FileManager.default.removeItem(at: CaptureStore.ledgerURL)
        entries = []
        instruments = []
        seed()
        storeNote = "The ledger was cleared by hand and written again from the fixtures."
    }

    private func seed() {
        entries = CaptureFixtures.entries
        instruments = []
        sequence = entries.count
        persist()
    }
}

// MARK: - The entries a review needs to see on open

/* Six states and four conflicts, none of which can be reached by tapping through a preview in the
   two minutes anybody spends on it — a lapse that happened between capture and sync is, by
   definition, not something you can wait for. So they are written down, fictional, dated relative
   to today, and every one of them can also be arrived at live: capture a pulse for a visit that
   already holds one, or decline this nurse in the vetting console and then try to send. */
enum CaptureFixtures {
    static let visit = "TH-2048"
    static let patient = "Lerato Molefe"
    /// The references this preview’s stand-in knows about, and the ones already signed off.
    static let knownVisits: Set<String> = ["TH-2048", "TH-2045", "TH-2041"]
    static let signedVisits: Set<String> = ["TH-2041"]

    private static func reading(_ id: String, _ value: String, _ provenance: Provenance,
                                instrument: KitSighting? = nil, qualifier: (String, String)? = nil,
                                caveats: [String] = []) -> CaptureReading {
        CaptureReading(id: "R-\(id)-\(value)", observationId: id,
                       label: KitMeasures.label(id), unit: KitMeasures.unit(id), value: value,
                       provenance: provenance,
                       instrumentId: instrument?.id, instrumentName: instrument?.name,
                       instrumentSerial: instrument?.serial,
                       calibratedOn: instrument?.lastCalibrated,
                       calibrationStanding: instrument?.calibration.standing,
                       qualifierLabel: qualifier?.0, qualifier: qualifier?.1,
                       caveats: caveats + (instrument?.calibration.caveat.map { [$0] } ?? []))
    }
    private static let cuff = KitFixtures.sighting("BP-4471-0092")
    private static let oximeter = KitFixtures.sighting("OX-2210-0417")
    private static let meter = KitFixtures.sighting("GL-5567-0233")

    static var entries: [CapturedEntry] {
        let naledi = VettingFixtures.subjects.first { $0.id == "N-205" }
        let ayanda = VettingFixtures.subjects.first { $0.id == "N-204" }
        func entry(_ id: String, _ reading: CaptureReading, _ state: CaptureState,
                   by nurse: VettingSubject?, deviceDaysAgo: Double, receivedDaysAgo: Double?,
                   conflict: CaptureConflict? = nil, against: String? = nil, refusal: String? = nil,
                   visit: String = CaptureFixtures.visit) -> CapturedEntry {
            CapturedEntry(id: id, visitReference: visit, patient: patient, reading: reading,
                          capturedBySubjectId: nurse?.id ?? "N-205",
                          capturedByName: nurse?.name ?? "Sister Naledi Mokoena",
                          capturedByReference: nurse?.reference ?? "SANC 20016688",
                          deviceCapturedAt: VettingClock.inDays(0).addingTimeInterval(-deviceDaysAgo * 86_400),
                          serverReceivedAt: receivedDaysAgo.map { VettingClock.inDays(0).addingTimeInterval(-$0 * 86_400) },
                          writtenToPhoneAt: VettingClock.inDays(0).addingTimeInterval(-(receivedDaysAgo ?? deviceDaysAgo) * 86_400),
                          state: state, conflict: conflict, conflictWithId: against, refusal: refusal)
        }
        return [
            // Stored, and the thing a retake will collide with.
            entry("CAP-00001", reading("pulse", "78", .device, instrument: cuff,
                                       qualifier: ("Cuff used", "Standard adult · 27–34 cm")),
                  .stored, by: naledi, deviceDaysAgo: 3.02, receivedDaysAgo: 3.0),
            // Stored, and the phone was seven hours fast. Nobody was asked; the row says both times.
            entry("CAP-00002", reading("temperature", "36.8", .manual,
                                       qualifier: ("Site read", "Oral")),
                  .stored, by: naledi, deviceDaysAgo: 2.71, receivedDaysAgo: 3.0,
                  conflict: .clockSkew),
            // A retake of the pulse, taken by hand after the cuff reading looked wrong.
            entry("CAP-00003", reading("pulse", "88", .manual,
                                       qualifier: ("Counted for", "Sixty seconds, radial")),
                  .conflicted, by: naledi, deviceDaysAgo: 2.98, receivedDaysAgo: 2.9,
                  conflict: .duplicateObservation, against: "CAP-00001"),
            // The record moved on: a doctor signed TH-2041 while this sat in the queue.
            entry("CAP-00004", reading("respiratory", "22", .manual), .conflicted, by: naledi,
                  deviceDaysAgo: 5.0, receivedDaysAgo: 1.0, conflict: .staleWrite, visit: "TH-2041"),
            // Captured eleven days ago; her SAPS clearance lapsed nine days ago, on an instrument
            // that was already out of calibration. Both facts travel, neither refuses the number.
            entry("CAP-00005", reading("glucose", "9.1", .device, instrument: meter,
                                       qualifier: ("Strip lot", "Lot 23K884 · expired 08/2026"),
                                       caveats: ["Strip lot 23K884 expired in August 2026, and an expired strip reads low. The reading stands as taken; treat it as a floor rather than a value."]),
                  .conflicted, by: ayanda, deviceDaysAgo: 11.0, receivedDaysAgo: 0.4,
                  conflict: .vettingLapsed),
            // Refused, with a reason, and still here.
            entry("CAP-00006", reading("oxygen", "94", .device, instrument: oximeter,
                                       qualifier: ("Probe site and perfusion", "Finger · cold or poorly perfused"),
                                       caveats: ["Taken under low perfusion. Pulse oximetry reads high on dark skin in these conditions, and no correction has been applied to this number."]),
                  .refused, by: naledi, deviceDaysAgo: 1.2, receivedDaysAgo: 1.1,
                  refusal: "This visit reference is not one the record holds for Lerato Molefe. Nothing has been written, and the entry stays on the phone until somebody decides what it belongs to.",
                  visit: "TH-2099"),
            // Sealed and waiting, which is where most of a nurse’s day actually leaves things.
            entry("CAP-00007", reading("systolic", "142", .manual,
                                       qualifier: ("Cuff used", "Large adult · 35–44 cm")),
                  .queued, by: naledi, deviceDaysAgo: 0.02, receivedDaysAgo: nil)
        ]
    }
}
