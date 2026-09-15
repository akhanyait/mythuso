import Foundation
import Combine

/* Sentinel tiers one to three, and safeguarding reports, on iOS: the types SentinelData.swift is written into, and the
 * arithmetic packages/engines/src/safety/domain/sentinel.ts does, mirrored rather than paraphrased.
 *
 * A CONSUMER READING NEVER FORMS A BASELINE. Sentinel hears a reading only when Devices publishes it, and Devices
 * publishes only what carriesWeight() accepts. So the readings below are the kit registry's readings that
 * Devices.carriesWeight() accepted as they stood when they were linked, and nothing else: the thermometer's poor sample
 * is on the kit screen and in no baseline, and a consumer class carries no weight however it is sent.
 *
 * NOTHING IS EVALUATED. This phone shows the contract's sentence and never works a deviation out. A tier is raised by
 * the nurse, one to three, and tier four is not offered: the sentence it is refused in is shown instead. The window and
 * minimum a baseline keeps are the generated defaults, and the stale interval is DevicesData's, so no number that
 * decides anything is typed in this file.
 *
 * A SAFEGUARDING REPORT IS OPEN AND NOT SENT. It keeps who it is about and the kind, never shows the kind again, and
 * nothing here closes one or sends one. Everything is held in memory and nothing is persisted. */

enum Sentinel {}

struct SentinelRung: Identifiable, Hashable { let rung: Int; let id: String; let label: String; let means: String; let toldCode: String; let whoIsTold: String }
struct SentinelChoice: Identifiable, Hashable { let id: String; let label: String; let sentence: String }
struct SentinelRefusal: Identifiable { let id: String; let status: Int; let statement: String }

extension Sentinel {
    /// A reading Sentinel heard: where it came from and what it measured, and never its value.
    struct Heard: Identifiable, Hashable {
        let id: String
        let deviceRef: String
        let metric: String
        let heardAt: Date
        var leftByRecallAt: Date?
    }

    /// A baseline keeps the window and minimum it was opened under.
    struct Baseline: Identifiable, Hashable {
        var id: String { metric }
        let metric: String
        let openedAt: Date
        let windowDays: Int
        let minimumReadings: Int
        var suspendedSince: Date?
    }

    struct BaselineView: Identifiable {
        var id: String { metric }
        let metric: String
        let stateId: String
        let counted: Int
        let needed: Int
        let windowDays: Int
        let suspendedSince: Date?
        let leftByRecall: Int
    }

    struct Raised: Identifiable, Hashable {
        let id: String
        let rung: SentinelRung
        let metric: String
        let raisedAt: Date
    }

    struct Report: Identifiable, Hashable {
        let id: String
        let groupCode: String
        let categoryCode: String
        let recordedAt: Date
    }

    /// A refusal in the route's own words. An id the contract does not carry answers with the id, rather than trapping.
    static func refusal(_ id: String) -> SentinelRefusal { refusals.first { $0.id == id } ?? SentinelRefusal(id: id, status: 500, statement: id) }
    static func fill(_ sentence: String, _ values: [String: String]) -> String { values.reduce(sentence) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) } }
    static func label(_ choices: [SentinelChoice], _ id: String) -> String { choices.first { $0.id == id }?.label ?? id }
    static func rung(_ number: Int) -> SentinelRung? { rungs.first { $0.rung == number } }

    /* baselineOf(), mirrored: suspended is asked first, because a suspended baseline counts towards nothing whatever it
       holds; then formed at the minimum it kept, counting only what it heard inside the window it kept. */
    static func view(of baseline: Baseline, readings: [Heard], now: Date) -> BaselineView {
        let mine = readings.filter { $0.metric == baseline.metric }
        let window = TimeInterval(baseline.windowDays) * 86_400
        let counted = mine.filter { $0.leftByRecallAt == nil && now.timeIntervalSince($0.heardAt) <= window }.count
        let state = baseline.suspendedSince != nil ? "suspended" : counted >= baseline.minimumReadings ? "formed" : "forming"
        return BaselineView(metric: baseline.metric, stateId: state, counted: counted, needed: baseline.minimumReadings, windowDays: baseline.windowDays,
                            suspendedSince: baseline.suspendedSince, leftByRecall: mine.filter { $0.leftByRecallAt != nil }.count)
    }
}

/* The preview's Sentinel, seeded from the kit registry the way the web seeds it from Devices': a reading heard when it
   was linked and carried weight then, a baseline opened by the first of each measure, a stale instrument suspending
   its baselines from the moment its interval passed, and a recalled instrument's readings taken out at the moment the
   recall was recorded. None of it is a flag typed onto a row. */
final class SentinelStore: ObservableObject {
    static let shared = SentinelStore()

    @Published private(set) var readings: [Sentinel.Heard] = []
    @Published private(set) var baselines: [Sentinel.Baseline] = []
    @Published private(set) var raised: [Sentinel.Raised] = []
    @Published private(set) var reports: [Sentinel.Report] = []
    private var serial = 0

    private init(now: Date = Date()) {
        let registry = Devices.registry
        var heard: [Sentinel.Heard] = []
        var opened: [Sentinel.Baseline] = []
        for reading in registry.readings.sorted(by: { $0.takenAt < $1.takenAt }) {
            /* As it stood when it was linked: a recall recorded afterwards took its weight away later, and the recall
               below is what answers for that. */
            let recordedAfter = registry.devices.first { $0.id == reading.deviceRef }?.recall.map { $0.recordedAt > reading.takenAt } ?? false
            let marksWhenLinked = recordedAfter ? reading.marks.filter { $0 != "recalled" } : reading.marks
            guard Devices.carriesWeight(deviceClass: reading.deviceClass, source: reading.source, quality: reading.quality,
                                        intendedUse: reading.intendedUse, marks: marksWhenLinked) else { continue }
            heard.append(Sentinel.Heard(id: reading.id, deviceRef: reading.deviceRef, metric: reading.metric, heardAt: reading.takenAt, leftByRecallAt: nil))
            if !opened.contains(where: { $0.metric == reading.metric }) {
                opened.append(Sentinel.Baseline(metric: reading.metric, openedAt: reading.takenAt, windowDays: Sentinel.baselineWindowDays,
                                                minimumReadings: Sentinel.baselineMinimumReadings, suspendedSince: nil))
            }
        }
        let staleAfter = TimeInterval(Devices.staleAfterMinutes * 60)
        for device in registry.devices where device.recall == nil && Devices.isStale(device, now: now) {
            guard let last = device.lastSyncAt else { continue }
            let metrics = Set(heard.filter { $0.deviceRef == device.id }.map(\.metric))
            opened = opened.map { baseline in
                var changed = baseline
                if metrics.contains(baseline.metric) && baseline.suspendedSince == nil { changed.suspendedSince = last.addingTimeInterval(staleAfter) }
                return changed
            }
        }
        for device in registry.devices {
            guard let recall = device.recall else { continue }
            heard = heard.map { reading in
                var changed = reading
                if reading.deviceRef == device.id && reading.leftByRecallAt == nil { changed.leftByRecallAt = recall.recordedAt }
                return changed
            }
        }
        readings = heard
        baselines = opened
    }

    func views(now: Date = Date()) -> [Sentinel.BaselineView] { baselines.map { Sentinel.view(of: $0, readings: readings, now: now) } }
    /// The readings a tier may be raised on: heard, and not taken out by a recall.
    var entries: [Sentinel.Heard] { readings.filter { $0.leftByRecallAt == nil } }

    private func next(_ prefix: String) -> String {
        serial += 1
        return "\(prefix)-\(String(format: "%04d", serial))"
    }

    /* raiseByHand(), in the engine's order for what this phone can send: a tier, tier four refused in its own words, a
       tier off the ladder, then a reading Sentinel heard and still counts. */
    func raise(entryId: String?, rung: Int?) -> SentinelRefusal? {
        let highest = Sentinel.rungs.map(\.rung).max() ?? 0
        guard let rung else { return Sentinel.refusal("rung-not-on-the-sentinel-ladder") }
        if rung > highest { return Sentinel.refusal("tier-four-not-in-this-build") }
        guard let chosen = Sentinel.rung(rung) else { return Sentinel.refusal("rung-not-on-the-sentinel-ladder") }
        guard let reading = readings.first(where: { $0.id == entryId }) else { return Sentinel.refusal("no-clinical-weight-behind-it") }
        if reading.leftByRecallAt != nil { return Sentinel.refusal("reading-left-by-recall") }
        raised.insert(Sentinel.Raised(id: next("DEV"), rung: chosen, metric: reading.metric, raisedAt: Date()), at: 0)
        return nil
    }

    /// recordReport(), in its order for what this phone can send. A report is recorded open and not sent, and nothing here changes either.
    func record(groupCode: String?, categoryCode: String?) -> (report: Sentinel.Report?, refusal: SentinelRefusal?) {
        guard let groupCode, Sentinel.groups.contains(where: { $0.id == groupCode }) else { return (nil, Sentinel.refusal("safeguarding-group-not-declared")) }
        guard let categoryCode, Sentinel.categories.contains(where: { $0.id == categoryCode }) else { return (nil, Sentinel.refusal("safeguarding-category-not-declared")) }
        let report = Sentinel.Report(id: next("SG"), groupCode: groupCode, categoryCode: categoryCode, recordedAt: Date())
        reports.append(report)
        return (report, nil)
    }
}
