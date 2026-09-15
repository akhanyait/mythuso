import Foundation
import Combine

/* Thuso Kit's registry on iOS: the types DevicesData.swift is written into, and the arithmetic the engine
 * does in packages/engines/src/devices/domain, mirrored rather than paraphrased.
 *
 * A CONSUMER DEVICE NEVER CARRIES CLINICAL WEIGHT, AND IT IS ARITHMETIC. carriesWeight() is the one place the
 * question is answered on this phone, and it asks the same five things the engine asks, every one of them a
 * flag the contract declares: the class carries weight, the source is not simulated, the sample's quality
 * carries weight, no recall mark, and the capturer meant it for the record. No class id is compared here to
 * decide weight, so a consumer watch cannot be promoted by somebody editing a string in this file; only the
 * contract's carriesClinicalWeight: false can say what a class is worth, and it says it on all three platforms.
 *
 * HEALTH IS WORKED OUT WHEN IT IS READ, never stored. The stale interval and the calibration window are the
 * generated settings, and each instrument's cadence is the capture model's own (ThusoKit.devices), so no
 * number that decides a state is typed in this file.
 *
 * NO VALUE IS HELD. A reading below is everything Devices knows about one — where it came from, the sample,
 * its marks — and never the number. Every device, reading and link is fictional and held in memory; nothing
 * is contacted and nothing is persisted. */

enum Devices {}

struct DevicesChoice: Identifiable, Hashable { let id: String; let label: String }
struct DeviceClassSpec: Identifiable { let id: String; let label: String; let carriesClinicalWeight: Bool }
struct DeviceSourceSpec: Identifiable { let id: String; let label: String; let simulated: Bool; let classes: [String] }
struct DeviceQualitySpec: Identifiable { let id: String; let label: String; let carriesClinicalWeight: Bool }
struct DeviceMarkSpec: Identifiable { let id: String; let label: String; let sentence: String }
struct WearablePlatformSpec: Identifiable { let id: String; let name: String; let phone: String }
struct DevicesRefusal: Identifiable { let id: String; let status: Int; let statement: String }

extension Devices {
    struct Recall: Hashable {
        let reasonCode: String
        let effectiveFrom: Date
        let recordedAt: Date
    }

    /// A registered device. Its class is fixed when it is registered, because the class is what decides weight.
    struct Registered: Identifiable, Hashable {
        let id: String
        let serial: String
        let model: String
        let firmware: String
        let deviceClass: String
        let instrumentKind: String?
        let calibratedOn: Date?
        var batteryPercent: Int?
        var lastSyncAt: Date?
        var recall: Recall?
    }

    /// What Devices was asked about one reading: everything but its value.
    struct Reading: Identifiable, Hashable {
        let id: String
        let deviceRef: String
        let deviceClass: String
        let metric: String
        let takenAt: Date
        let source: String
        let quality: String
        let intendedUse: String
        var marks: [String]
    }

    struct Calibration: Hashable {
        let stateId: String
        let dueOn: Date?
    }

    // MARK: - Weight

    static func carriesWeight(deviceClass: String, source: String, quality: String, intendedUse: String, marks: [String]) -> Bool {
        deviceClasses.first { $0.id == deviceClass }?.carriesClinicalWeight == true
            && sources.first { $0.id == source }?.simulated == false
            && qualities.first { $0.id == quality }?.carriesClinicalWeight == true
            && !marks.contains("recalled")
            && intendedUse == "clinical"
    }
    static func carriesWeight(_ reading: Reading) -> Bool {
        carriesWeight(deviceClass: reading.deviceClass, source: reading.source, quality: reading.quality,
                      intendedUse: reading.intendedUse, marks: reading.marks)
    }

    /* The patient's own device, found from the contract's flags rather than by its id: a class that carries no
       weight and that a non-simulated source produces. The engine keeps a consumer device's calibration out of
       MyThuso's hands and marks its readings as from one; both follow from this answer. */
    static func isOwnDeviceClass(_ deviceClass: String) -> Bool {
        deviceClasses.first { $0.id == deviceClass }?.carriesClinicalWeight == false
            && sources.contains { !$0.simulated && $0.classes.contains(deviceClass) }
    }

    // MARK: - Health

    static func isStale(_ device: Registered, now: Date) -> Bool {
        guard let last = device.lastSyncAt else { return false }
        return now.timeIntervalSince(last) > TimeInterval(staleAfterMinutes * 60)
    }

    static func healthState(of device: Registered, now: Date) -> String {
        if device.recall != nil { return "recalled" }
        if device.lastSyncAt == nil { return "never-synced" }
        return isStale(device, now: now) ? "stale" : "reporting"
    }

    /* When a calibration runs out: the day it was calibrated plus its kind's cadence in months, on whole days so
       the state a nurse reads in the morning is the state she reads in the afternoon. Due is dueDays or fewer
       before that day; overdue is after it. */
    static func calibration(of device: Registered, at moment: Date, dueDays: Int = calibrationDueDays) -> Calibration {
        guard !isOwnDeviceClass(device.deviceClass),
              let kind = device.instrumentKind.flatMap(ThusoKit.device),
              let calibratedOn = device.calibratedOn
        else { return Calibration(stateId: "not-tracked", dueOn: nil) }
        let due = VettingClock.adding(months: kind.calibrateEveryMonths, to: calibratedOn)
        let calendar = Calendar.current
        let daysLeft = calendar.dateComponents([.day], from: calendar.startOfDay(for: moment), to: calendar.startOfDay(for: due)).day ?? 0
        return Calibration(stateId: daysLeft < 0 ? "overdue" : daysLeft <= dueDays ? "due" : "in-date", dueOn: due)
    }

    static func recalledAt(_ device: Registered, _ moment: Date) -> Bool {
        guard let recall = device.recall else { return false }
        return moment >= recall.effectiveFrom
    }

    /* The marks a reading is asked with, in the engine's order, from the device and the moment it was taken and
       never from a setting: the calibration is read against a due window of nought, so a change to the window
       cannot mark or unmark a reading. */
    static func marks(device: Registered, source: String, quality: String, intendedUse: String, takenAt: Date) -> [String] {
        var marks: [String] = []
        if sources.first(where: { $0.id == source })?.simulated == true { marks.append("simulated") }
        if isOwnDeviceClass(device.deviceClass) { marks.append("consumer-device") }
        if qualities.first(where: { $0.id == quality })?.carriesClinicalWeight == false { marks.append("poor-sample") }
        if recalledAt(device, takenAt) { marks.append("recalled") }
        if calibration(of: device, at: takenAt, dueDays: 0).stateId == "overdue" { marks.append("calibration-overdue") }
        if intendedUse != "clinical" { marks.append("guidance-only") }
        return marks
    }

    // MARK: - Words

    /// The stale interval in the words a nurse reads: whole days, whole hours, or minutes.
    static func intervalText(minutes: Int) -> String {
        if minutes % (24 * 60) == 0 { let days = minutes / (24 * 60); return "\(days) \(days == 1 ? "day" : "days")" }
        if minutes % 60 == 0 { let hours = minutes / 60; return "\(hours) \(hours == 1 ? "hour" : "hours")" }
        return "\(minutes) minutes"
    }

    /// A refusal in the route's own words. An id the contract does not carry answers with the id, rather than trapping.
    static func refusal(_ id: String) -> DevicesRefusal {
        refusals.first { $0.id == id } ?? DevicesRefusal(id: id, status: 500, statement: id)
    }

    static func fill(_ sentence: String, _ values: [String: String]) -> String {
        values.reduce(sentence) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
    }

    static func label(_ choices: [DevicesChoice], _ id: String) -> String { choices.first { $0.id == id }?.label ?? id }
    static func mark(_ id: String) -> DeviceMarkSpec? { marks.first { $0.id == id } }
    static func sourceLabel(_ id: String) -> String { sources.first { $0.id == id }?.label ?? id }
    static func qualityLabel(_ id: String) -> String { qualities.first { $0.id == id }?.label ?? id }
    static func platform(_ id: String) -> WearablePlatformSpec? { platforms.first { $0.id == id } }
    /// The record contract's name for a measure, so a reading type is never labelled twice.
    static func measureLabel(_ id: String) -> String { Records.observations.first { $0.id == id }?.label ?? id }

    /* The sample quality beside a reading on the kit's own queue, which predates Devices and carries no quality.
       A caveat that the chosen qualifier brings — an expired strip lot, a cold finger — is the instrument saying
       the sample is usable with a caveat, so it is acceptable; a caveat every option carries, like the single
       lead's screening note, is about reading the result rather than the sample, and leaves it good. A reading
       with no instrument has no device source, and nothing is answered for it rather than a guess. */
    static func captureQualityId(instrumentId: String?, qualifier: String?) -> String? {
        guard let instrumentId, let sighting = KitFixtures.sighting(instrumentId), let device = sighting.device else { return nil }
        let caveats = device.qualifier.caveated
        guard let qualifier, caveats[qualifier] != nil, caveats.count < device.qualifier.options.count else { return "good" }
        return "acceptable"
    }
}

// MARK: - The preview's registry

/* Seeded the way the web seeds it: the six instruments are the capture model's own, registered a month ago, the
   readings asked about at the moment each was taken, the syncs applied, and then the oximeter recalled. The
   stale glucometer, the recalled oximeter and the marked pulse are what the arithmetic above answers for those
   moments, not flags typed onto rows. Nurse N-205's kit, and every serial in it, is fictional. */
extension Devices {
    static let kitHolder = "N-205"

    struct Registry {
        let devices: [Registered]
        let readings: [Reading]
        func readings(of deviceRef: String) -> [Reading] {
            readings.filter { $0.deviceRef == deviceRef }.sorted { $0.takenAt > $1.takenAt }
        }
    }

    static let registry: Registry = seed(now: Date())

    private static func seed(now: Date) -> Registry {
        let hour: TimeInterval = 3600
        var devices = KitFixtures.sightings.map { sighting in
            Registered(id: "DEV-\(sighting.serial)", serial: sighting.serial, model: sighting.name, firmware: "2.4.1",
                       deviceClass: "certified", instrumentKind: sighting.deviceId, calibratedOn: sighting.lastCalibrated,
                       batteryPercent: nil, lastSyncAt: nil, recall: nil)
        }
        func byKind(_ kind: String) -> Registered { devices.first { $0.instrumentKind == kind }! }

        var readings: [Reading] = []
        func taken(_ kind: String, _ ref: String, _ metric: String, hoursAgo: Double, quality: String) {
            let device = byKind(kind)
            let at = now.addingTimeInterval(-hoursAgo * hour)
            readings.append(Reading(id: ref, deviceRef: device.id, deviceClass: device.deviceClass, metric: metric, takenAt: at,
                                    source: "kit-instrument", quality: quality, intendedUse: "clinical",
                                    marks: marks(device: device, source: "kit-instrument", quality: quality, intendedUse: "clinical", takenAt: at)))
        }
        taken("pulse-oximeter", "RD-0101", "oxygen", hoursAgo: 72, quality: "good")
        taken("pulse-oximeter", "RD-0102", "pulse", hoursAgo: 26, quality: "acceptable")
        taken("glucometer", "RD-0103", "glucose", hoursAgo: 36, quality: "acceptable")
        taken("bp-cuff", "RD-0104", "systolic", hoursAgo: 0.8, quality: "good")
        taken("thermometer", "RD-0105", "temperature", hoursAgo: 3, quality: "poor")

        let syncs: [String: (hoursAgo: Double, battery: Int)] = [
            "bp-cuff": (0.8, 82), "pulse-oximeter": (2, 70), "thermometer": (3, 64),
            "glucometer": (36, 18), "scale": (5, 91), "ecg": (20, 47)
        ]
        devices = devices.map { device in
            var synced = device
            if let kind = device.instrumentKind, let sync = syncs[kind] {
                synced.lastSyncAt = now.addingTimeInterval(-sync.hoursAgo * hour)
                synced.batteryPercent = sync.battery
            }
            return synced
        }

        /* The oximeter's maker issued a notice an hour ago about a fault that began two days ago. Its reading from
           yesterday is marked; the one from three days ago is not. */
        var oximeter = byKind("pulse-oximeter")
        oximeter.recall = Recall(reasonCode: "manufacturer-notice", effectiveFrom: now.addingTimeInterval(-48 * hour),
                                 recordedAt: now.addingTimeInterval(-hour))
        devices = devices.map { $0.id == oximeter.id ? oximeter : $0 }
        readings = readings.map { reading in
            guard reading.deviceRef == oximeter.id, recalledAt(oximeter, reading.takenAt), !reading.marks.contains("recalled") else { return reading }
            var marked = reading
            marked.marks.append("recalled")
            return marked
        }
        return Registry(devices: devices, readings: readings)
    }
}

// MARK: - A wearable link request

/* Recorded, and never connected. There is no health-store library, entitlement or permission prompt in this
   app, and this store does not add a way to one: a request keeps the platform, the consent version in force and
   the reading types agreed to, and its state is requested-not-connected for as long as this build exists. The
   refusals are the engine's, in its order, and nothing here is persisted. */
final class WearableLinkStore: ObservableObject {
    static let shared = WearableLinkStore()

    struct Link: Identifiable, Hashable {
        let id: String
        let platform: String
        let consentVersion: Int
        let metrics: [String]
        let requestedAt: Date
        var withdrawnAt: Date?
    }

    @Published private(set) var links: [Link] = []

    func open(_ platform: String) -> Link? { links.last { $0.platform == platform && $0.withdrawnAt == nil } }
    func last(_ platform: String) -> Link? { links.last { $0.platform == platform } }

    func request(platform: String, metrics: [String], agreed: Bool) -> DevicesRefusal? {
        guard agreed else { return Devices.refusal("consent-missing") }
        guard Devices.platform(platform) != nil else { return Devices.refusal("platform-not-declared") }
        guard !metrics.isEmpty, metrics.allSatisfy({ metric in Devices.measureUnits.contains { $0.id == metric } })
        else { return Devices.refusal("metric-not-in-the-scope") }
        guard open(platform) == nil else { return Devices.refusal("link-already-requested") }
        let chosen = Devices.measureUnits.map(\.id).filter { metrics.contains($0) }
        links.append(Link(id: "LNK-\(links.count + 1)", platform: platform, consentVersion: Devices.wearableConsentVersion,
                          metrics: chosen, requestedAt: Date(), withdrawnAt: nil))
        return nil
    }

    func withdraw(platform: String) -> DevicesRefusal? {
        guard let index = links.lastIndex(where: { $0.platform == platform }) else { return Devices.refusal("link-not-found") }
        guard links[index].withdrawnAt == nil else { return Devices.refusal("link-already-withdrawn") }
        links[index].withdrawnAt = Date()
        return nil
    }
}
