import Foundation

/* Where a reading came from, and what the instrument that took it was.

   A reading is not just a number. packages/catalog/capture.json says why: a record that cannot
   tell a measured value from a typed one from a reported one is a record that will eventually be
   read wrongly by somebody in a hurry. So the origin is not metadata hung off the side of a value
   — it is part of the value, and nothing in this app carries one without the other.

   The four origins, the six instruments, the six capture states and the four conflicts below are
   transcribed from that contract. They are not generated from it, unlike the vetting table and the
   record contract, because there is no emitter for capture yet. That is a real difference and it is
   worth naming: the tables here can drift from the JSON in a way VettingData.swift cannot.
   scripts/check-boundaries.mjs reads capture.json directly and holds the devices to the
   observations the assessment actually collects, so the shape is guarded; the sentences are not.

   Nothing here connects to anything. No CoreBluetooth session is opened, no scan is run, no
   instrument is contacted, and the app declares no Bluetooth permission — which is a different
   thing from a permission that was asked for and refused, and the screens say which. Every
   instrument, serial and reading below is fictional. */

// MARK: - The four origins

/* The whole of how the four are told apart on a screen is a symbol and a colour, at one size and
   one weight. That is deliberate. A manual blood pressure is a clinical skill: an auscultated
   reading taken by a nurse who chose the right cuff is not a degraded version of one a machine
   sent over Bluetooth, and a design that greys it, shrinks it or hangs a warning triangle on it is
   telling the reader something untrue about their own work. What the mark says is where the number
   came from. It does not say how much the number is worth — the reader decides that, which is what
   the trust sentence is for. */
enum Provenance: String, CaseIterable, Identifiable, Codable, Hashable {
    case device
    case manual
    case patientReported = "patient-reported"
    case derived
    var id: String { rawValue }

    var name: String {
        switch self {
        case .device: return "Measured by a device"
        case .manual: return "Entered by a clinician"
        case .patientReported: return "Reported by the patient"
        case .derived: return "Calculated"
        }
    }
    /// For a row too tight for the full sentence. Never an abbreviation of the rank, because there
    /// is no rank — “Device”, “Clinician”, “Patient”, “Calculated” are four kinds, not four grades.
    var shortName: String {
        switch self {
        case .device: return "Device"
        case .manual: return "Clinician"
        case .patientReported: return "Patient"
        case .derived: return "Calculated"
        }
    }
    var fhir: String {
        switch self {
        case .device: return "Observation.device"
        case .manual: return "Observation.performer"
        case .patientReported: return "Observation.performer (Patient)"
        case .derived: return "Observation.derivedFrom"
        }
    }
    var detail: String {
        switch self {
        case .device:
            return "Read off a paired instrument and written straight into the record. The instrument, its serial and the date it was last calibrated travel with the reading."
        case .manual:
            return "Read off an instrument by a person and typed in, or taken by hand. Attributed to the registration of whoever typed it."
        case .patientReported:
            return "What the person said, in the record as what they said rather than as a finding."
        case .derived:
            return "Computed from other readings — BMI from height and weight, a mean arterial pressure from a blood pressure."
        }
    }
    var trust: String {
        switch self {
        case .device:
            return "The strongest of the four, and only while the calibration is in date. An instrument out of calibration still produces a reading; what it stops producing is a reading anybody should act on without saying so."
        case .manual:
            return "As good as the person and the instrument they were holding. It is not weaker than a device reading — a manual blood pressure is a clinical skill — but it is a different fact and the record says which."
        case .patientReported:
            return "Not a measurement. It is evidence about the person’s experience, which is often the more useful thing, and it must never be presented as though a clinician observed it."
        case .derived:
            return "Exactly as good as its inputs, and it names them. A derived value whose inputs are unknown is not a value."
        }
    }
    /// SF Symbol. Four different objects, not four sizes of one.
    var symbol: String {
        switch self {
        case .device: return "dot.radiowaves.left.and.right"
        case .manual: return "stethoscope"
        case .patientReported: return "quote.bubble"
        case .derived: return "function"
        }
    }
    /// Resolved to colour by the design system, the way vetting resolves its own tones.
    var tone: String {
        switch self {
        case .device: return "device"
        case .manual: return "clinician"
        case .patientReported: return "patient"
        case .derived: return "calculated"
        }
    }
    /// How a reading of this origin is attributed on screen, given who was in the room.
    func attribution(clinician: String, registration: String, patient: String, instrument: String?) -> String {
        switch self {
        case .device: return instrument.map { "\($0), read by \(clinician)" } ?? "A paired instrument"
        case .manual: return "\(clinician) · \(registration)"
        case .patientReported: return "\(patient), in their own words"
        case .derived: return "Calculated on this phone"
        }
    }
}

/// The rules, in the contract’s own words, so a screen can quote the one it is obeying rather than
/// paraphrase it into something slightly different.
enum CaptureRules {
    static let provenanceIsRequired = "Every reading carries exactly one provenance. There is no default and no unknown: a value nobody can say the origin of is not filed."
    static let calibrationNeverRefuses = "An out-of-date calibration marks a reading, it does not block it. A nurse in a home with one instrument still needs the number; what she must not have is the number without the caveat."
    static let deviceClockIsNotTruth = "The device’s own time is recorded as what the device believed. Ordering uses the server’s receipt time."
    static let conflictsAreNotMerged = "Nothing is auto-merged and nothing is auto-discarded. A timestamp does not win a clinical disagreement; a clinician does."
    static let queuedIsNotLost = "An entry that has been captured is the nurse’s work. It survives a crash, a restart and a sign-out, and it is never dropped to make a sync succeed."
    static let offlineNeverServesStaleSilently = "A value read from the device’s own store carries when it was written, on screen, in words."
    static let why = "A reading is not just a number. Where it came from decides what may be done with it, and a record that cannot tell a measured value from a typed one from a reported one is a record that will eventually be read wrongly by somebody in a hurry."
}

// MARK: - What the kit measures

/* Two of the eight things the six instruments measure are not among the seven observations the
   assessment flags against an indicative range, and both for the same reason: there is no range to
   flag them against. A weight means something against this person’s own previous weights and
   nothing against a population’s. A single-lead trace is not a number at all.
   scripts/check-boundaries.mjs holds the same two names, so a third one has to be argued for in
   two places rather than typed into one. */
struct KitMeasure: Identifiable, Hashable {
    let id: String
    let label: String
    let unit: String
    /// Where an indicative range exists, it is Observation.all’s — there is not a second copy here.
    var rangeFlagged: Bool { Observation.all.contains { $0.id == id } }
}
enum KitMeasures {
    static let unranged: [KitMeasure] = [
        KitMeasure(id: "weight", label: "Weight", unit: "kg"),
        KitMeasure(id: "ecg", label: "Single-lead ECG", unit: "trace")
    ]
    static func measure(_ id: String) -> KitMeasure? {
        if let observation = Observation.all.first(where: { $0.id == id }) {
            return KitMeasure(id: observation.id, label: observation.label, unit: observation.unit)
        }
        return unranged.first { $0.id == id }
    }
    static func label(_ id: String) -> String { measure(id)?.label ?? id }
    static func unit(_ id: String) -> String { measure(id)?.unit ?? "" }
}

// MARK: - The six instruments

/* Each device’s note is a real clinical limitation, and it is written where the reading is taken
   rather than in a manual nobody opens in somebody’s kitchen. The qualifier beside it is the part
   of the limitation the instrument cannot answer for itself — the cuff, the site, the strip lot,
   the position — so it is asked for, recorded, and travels with the reading. */
struct KitQualifier: Hashable {
    let id: String
    let label: String
    let why: String
    let options: [String]
    /// An option that marks the reading rather than blocking it, the way a lapsed calibration does.
    var caveated: [String: String] = [:]
}
struct KitDevice: Identifiable, Hashable {
    let id: String
    let name: String
    let measures: [String]
    let transport: String
    let calibrateEveryMonths: Int
    let note: String
    let qualifier: KitQualifier
    var cadence: String {
        calibrateEveryMonths % 12 == 0
            ? "Calibrated every \(calibrateEveryMonths / 12) year\(calibrateEveryMonths == 12 ? "" : "s")"
            : "Calibrated every \(calibrateEveryMonths) months"
    }
    var symbol: String {
        switch id {
        case "bp-cuff": return "heart"
        case "pulse-oximeter": return "lungs"
        case "thermometer": return "thermometer"
        case "glucometer": return "drop"
        case "scale": return "scalemass"
        default: return "waveform.path.ecg"
        }
    }
}

enum ThusoKit {
    static let devices: [KitDevice] = [
        KitDevice(id: "bp-cuff", name: "Blood-pressure monitor", measures: ["systolic", "diastolic", "pulse"],
                  transport: "Bluetooth Low Energy", calibrateEveryMonths: 12,
                  note: "Cuff size is a clinical decision the device cannot make. A reading taken on the wrong cuff is wrong in a direction nobody can correct for afterwards, so the cuff used is recorded with the reading.",
                  qualifier: KitQualifier(id: "cuff", label: "Cuff used",
                                          why: "The monitor cannot see the arm it is on. Whoever chose the cuff is the only record of that choice.",
                                          options: ["Small adult · 22–26 cm", "Standard adult · 27–34 cm", "Large adult · 35–44 cm", "Extra large · 45–52 cm", "Paediatric"])),
        KitDevice(id: "pulse-oximeter", name: "Pulse oximeter", measures: ["oxygen", "pulse"],
                  transport: "Bluetooth Low Energy", calibrateEveryMonths: 24,
                  note: "Reads high on dark skin under low perfusion. This is documented rather than corrected for, because the correction is not the platform’s to invent.",
                  qualifier: KitQualifier(id: "probe", label: "Probe site and perfusion",
                                          why: "The reading is recorded as it came off the probe. Nothing is adjusted here — the conditions are written down so the next clinician can weigh them.",
                                          options: ["Finger · warm, well perfused", "Finger · cold or poorly perfused", "Toe", "Ear lobe"],
                                          caveated: ["Finger · cold or poorly perfused": "Taken under low perfusion. Pulse oximetry reads high on dark skin in these conditions, and no correction has been applied to this number.",
                                                     "Toe": "Taken at the toe, where perfusion is lower than at the finger. No correction has been applied.",
                                                     "Ear lobe": "Taken at the ear lobe. No correction has been applied."])),
        KitDevice(id: "thermometer", name: "Infrared thermometer", measures: ["temperature"],
                  transport: "Bluetooth Low Energy", calibrateEveryMonths: 12,
                  note: "Site matters and is recorded: a forehead reading is not an oral one.",
                  qualifier: KitQualifier(id: "site", label: "Site read",
                                          why: "A forehead reading and an oral one are different measurements of different things. The record says which was taken rather than calling both “temperature”.",
                                          options: ["Forehead", "Temporal artery", "Tympanic", "Oral", "Axillary"])),
        KitDevice(id: "glucometer", name: "Glucose meter", measures: ["glucose"],
                  transport: "Bluetooth Low Energy", calibrateEveryMonths: 6,
                  note: "Strips expire separately from the meter, and an expired strip reads low. The strip lot travels with the reading.",
                  qualifier: KitQualifier(id: "strip-lot", label: "Strip lot",
                                          why: "The meter can be in calibration and the strip out of date on the same morning. They are two expiries, so they are two records.",
                                          options: ["Lot 24C119 · expires 03/2027", "Lot 24A077 · expires 11/2026", "Lot 23K884 · expired 08/2026"],
                                          caveated: ["Lot 23K884 · expired 08/2026": "Strip lot 23K884 expired in August 2026, and an expired strip reads low. The reading stands as taken; treat it as a floor rather than a value."])),
        KitDevice(id: "scale", name: "Weighing scale", measures: ["weight"],
                  transport: "Bluetooth Low Energy", calibrateEveryMonths: 12,
                  note: "Recorded with whether the patient was weighed standing, seated or in bed, because the three are not comparable.",
                  qualifier: KitQualifier(id: "position", label: "Weighed",
                                          why: "A weight trend built out of three positions is not a trend. The position is what makes this month’s number comparable with last month’s.",
                                          options: ["Standing", "Seated", "In bed"])),
        KitDevice(id: "ecg", name: "Single-lead ECG", measures: ["ecg"],
                  transport: "Bluetooth Low Energy", calibrateEveryMonths: 12,
                  note: "A single-lead trace is a screening tool. It is never a diagnosis, and any interpretation is decision support that a doctor signs or does not.",
                  qualifier: KitQualifier(id: "placement", label: "Lead placement",
                                          why: "A single lead sees one view of the heart, and which view depends on where the hands were. The placement is part of reading the trace.",
                                          options: ["Both hands · lead I", "Right hand and left knee · lead II", "Chest wall · left lower"],
                                          caveated: ["Both hands · lead I": "A single-lead trace is a screening tool, not a diagnosis. Any interpretation is decision support that a doctor signs or does not.",
                                                     "Right hand and left knee · lead II": "A single-lead trace is a screening tool, not a diagnosis. Any interpretation is decision support that a doctor signs or does not.",
                                                     "Chest wall · left lower": "A single-lead trace is a screening tool, not a diagnosis. Any interpretation is decision support that a doctor signs or does not."]))
    ]
    static func device(_ id: String) -> KitDevice? { devices.first { $0.id == id } }
    /// Which instruments could produce this observation. Empty is a real answer, and the assessment
    /// says so rather than offering a button that would do nothing.
    static func devices(measuring observationId: String) -> [KitDevice] {
        devices.filter { $0.measures.contains(observationId) }
    }
}

// MARK: - Calibration

/* Resolved against today rather than trusted from a stored label, for the same reason a stored
   “verified” is only true until its expiry date: a calibration that lapsed last Tuesday should not
   still read “in date” because nobody re-opened the screen since.

   The warning window is thirty days, and it is not the vetting module’s forty-five. They answer
   different questions — a clearance renewal is paperwork somebody must start weeks ahead, a
   calibration is a courier collecting an instrument — so sharing one number would be a coincidence
   dressed as a principle. */
enum CalibrationStanding: String, Codable, Hashable {
    case inDate, dueSoon, outOfDate
    var label: String {
        switch self {
        case .inDate: return "Calibration in date"
        case .dueSoon: return "Calibration due soon"
        case .outOfDate: return "Calibration out of date"
        }
    }
    var tone: String {
        switch self {
        case .inDate: return "teal"
        case .dueSoon: return "amber"
        case .outOfDate: return "danger"
        }
    }
}
struct CalibrationRecord: Codable, Hashable {
    static let warningDays = 30
    let lastCalibrated: Date
    let everyMonths: Int
    var due: Date { VettingClock.adding(months: everyMonths, to: lastCalibrated) }
    var standing: CalibrationStanding {
        guard let days = daysUntil(due) else { return .inDate }
        if days < 0 { return .outOfDate }
        return days <= CalibrationRecord.warningDays ? .dueSoon : .inDate
    }
    /// The countdown in words, so nobody subtracts two dates by eye in somebody’s front room.
    var phrase: String {
        guard let days = daysUntil(due) else { return "—" }
        if days < 0 { return "Calibration ran out \(-days) day\(days == -1 ? "" : "s") ago" }
        if days == 0 { return "Calibration runs out today" }
        return "Calibration good for \(days) more day\(days == 1 ? "" : "s")"
    }
    /// What travels with the reading, forever. Not a live lookup: the question a reader asks in
    /// eight months is what the calibration was on the morning the number was taken.
    var caveat: String? {
        standing == .outOfDate
            ? "Taken on an instrument whose calibration ran out on \(vettingDate(due)). The reading stands; it is marked, and it is not a reading to act on without saying this."
            : nil
    }
}

// MARK: - Instruments, sighted and paired

/* What a scan would find, if a scan were run. It is not. These six are drawn on the phone from the
   contract’s own device list, and the screen that shows them says so in the same breath. The point
   of building it anyway is that pairing, calibration standing and the qualifier a reading needs are
   design decisions that have to be right before there is a radio to get them wrong with. */
struct KitSighting: Identifiable, Hashable {
    let id: String
    let deviceId: String
    let serial: String
    let lastCalibrated: Date
    let proximity: String
    var device: KitDevice? { ThusoKit.device(deviceId) }
    var name: String { device?.name ?? deviceId }
    var calibration: CalibrationRecord {
        CalibrationRecord(lastCalibrated: lastCalibrated, everyMonths: device?.calibrateEveryMonths ?? 12)
    }
}
struct PairedInstrument: Identifiable, Codable, Hashable {
    let id: String
    let deviceId: String
    let serial: String
    let lastCalibrated: Date
    let pairedAt: Date
    var device: KitDevice? { ThusoKit.device(deviceId) }
    var name: String { device?.name ?? deviceId }
    var calibration: CalibrationRecord {
        CalibrationRecord(lastCalibrated: lastCalibrated, everyMonths: device?.calibrateEveryMonths ?? 12)
    }
}

enum KitFixtures {
    /* One instrument per device in the contract, and the calibration dates are chosen so that all
       three standings can be seen in one room: a glucometer eight months past a six-month cadence
       is the one that matters, because it is the one the rule is about. */
    static let sightings: [KitSighting] = [
        KitSighting(id: "BP-4471-0092", deviceId: "bp-cuff", serial: "BP-4471-0092",
                    lastCalibrated: VettingClock.inMonths(-5), proximity: "Close by"),
        KitSighting(id: "OX-2210-0417", deviceId: "pulse-oximeter", serial: "OX-2210-0417",
                    lastCalibrated: VettingClock.inMonths(-23), proximity: "Close by"),
        KitSighting(id: "TH-8802-1130", deviceId: "thermometer", serial: "TH-8802-1130",
                    lastCalibrated: VettingClock.inMonths(-2), proximity: "Close by"),
        KitSighting(id: "GL-5567-0233", deviceId: "glucometer", serial: "GL-5567-0233",
                    lastCalibrated: VettingClock.inMonths(-8), proximity: "In the bag"),
        KitSighting(id: "SC-3391-0741", deviceId: "scale", serial: "SC-3391-0741",
                    lastCalibrated: VettingClock.inMonths(-11), proximity: "In the bag"),
        KitSighting(id: "EC-7120-0058", deviceId: "ecg", serial: "EC-7120-0058",
                    lastCalibrated: VettingClock.inMonths(-4), proximity: "In the bag")
    ]
    static func sighting(_ id: String) -> KitSighting? { sightings.first { $0.id == id } }

    /* A number to put on the screen so the flow can be walked end to end. It is invented on this
       phone from a fixed table — no instrument produced it — and it is cycled rather than
       randomised so that two people demonstrating the same screen see the same reading. */
    private static let invented: [String: [String]] = [
        "systolic": ["138", "142", "129"],
        "diastolic": ["88", "91", "83"],
        "pulse": ["76", "88", "71"],
        "oxygen": ["97", "94", "98"],
        "temperature": ["36.8", "37.9", "36.4"],
        "glucose": ["6.2", "9.1", "5.4"],
        "weight": ["71.5", "88.2", "64.3"],
        "ecg": ["Sinus rhythm, 30-second trace", "Irregular rhythm, 30-second trace", "Sinus rhythm, 30-second trace"]
    ]
    static func inventedReading(_ measureId: String, _ sequence: Int) -> String {
        guard let values = invented[measureId], !values.isEmpty else { return "—" }
        return values[abs(sequence) % values.count]
    }
}

// MARK: - Derived readings

/* The one derived value the seven observations can actually produce, and it names its inputs
   because “a derived value whose inputs are unknown is not a value”. It appears when both inputs
   are present and disappears when either is taken away — there is nothing here to save, so there
   is nothing to fall out of step with the numbers it was computed from. */
struct DerivedReading {
    let id: String
    let label: String
    let unit: String
    let value: String
    let from: [String]
    let workings: String
}
func meanArterialPressure(systolic: String, diastolic: String) -> DerivedReading? {
    guard let top = Double(systolic), let bottom = Double(diastolic), top > bottom else { return nil }
    let map = bottom + (top - bottom) / 3
    return DerivedReading(id: "map", label: "Mean arterial pressure", unit: "mmHg",
                          value: String(format: "%.0f", map), from: ["systolic", "diastolic"],
                          workings: "Diastolic + (systolic − diastolic) ÷ 3, from \(Int(bottom)) and \(Int(top)) mmHg.")
}

// MARK: - How long ago, in words

/* offlineNeverServesStaleSilently is the whole reason this function exists. A row read out of a
   file on this phone must say when it was written, on the screen, in words a nurse reads at a
   glance — not an ISO timestamp, and not nothing at all.

   The doctrine is artisanZA’s, whose mobile offline layer keeps a downloaded bundle with the
   version and build time it was installed at, and keeps the write queue in a separate file that is
   only ever emptied of the rows that actually landed. What does not transfer is the code: that is
   React Native and Supabase, and this is a Swift file with no server behind it at all. What
   transfers is the rule — a local copy is offered as a local copy, with its age attached, and never
   as though it were the answer to a request nobody managed to make. */
func writtenInWords(_ date: Date, now: Date = Date()) -> String {
    let seconds = now.timeIntervalSince(date)
    if seconds < 0 { return "written with a clock that is ahead of this one" }
    if seconds < 60 { return "written less than a minute ago" }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "written \(minutes) minute\(minutes == 1 ? "" : "s") ago" }
    let hours = Int(seconds / 3600)
    if hours < 24 { return "written about \(hours) hour\(hours == 1 ? "" : "s") ago" }
    let days = Int(seconds / 86_400)
    if days == 1 { return "written yesterday" }
    if days < 30 { return "written \(days) days ago" }
    return "written on \(vettingDate(date))"
}
private let captureStampFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.dateFormat = "d MMM yyyy · HH:mm"
    return formatter
}()
func captureStamp(_ date: Date) -> String { captureStampFormatter.string(from: date) }
