import Foundation

/* The live vitals board's arithmetic on iOS — the same pure function packages/engines/src/devices/live-vitals.ts
   is on the web, over the baselines and constants LiveVitalsData.swift carries from the contract.

   A reading is worked out from the scenario, the patient, the stream and the reading's number: the preset's
   baseline at that step plus a jitter from Park and Miller's generator, on the record's step. No clock, no
   random source and nothing stored, so the doctor reading a patient's devices on a phone sees the numbers the
   web shows for the same patient on the same scenario at the same reading. Every integer product here stays
   below 2^53, which is what lets a Swift Int and a JavaScript number agree.

   WHAT IT REFUSES TO KNOW. Whether a reading is concerning. It says whether a value is inside, below or above
   the record's indicative range and nothing else: no score, no priority and no severity, because no triage
   protocol is ratified. Every reading here is simulated and carries no clinical weight. */

enum LiveVitals {}

/* A stream names its measure and nothing more about it: the label, unit, range and step are read from
   Records.observations, the one place on iOS a reference range is written. */
struct LiveStreamSpec: Identifiable, Hashable {
    let id: String
    let measure: String
    let instrument: String
    let presetType: String
    let jitter: Double
    let ceiling: Double?
    private var range: ObservationRange { Records.observations.first { $0.id == measure }! }
    var label: String { range.label }
    var unit: String { range.unit }
    var low: Double { range.low }
    var high: Double { range.high }
    var step: Double { range.step }
}

struct LivePresetReading: Hashable {
    let type: String
    let value: Double
    let offsetMs: Int
}

struct LivePresetSpec: Identifiable, Hashable {
    let id: String
    let name: String
    let readings: [LivePresetReading]
}

struct LiveRefusalSpec: Identifiable, Hashable {
    let id: String
    let heading: String
    let sentence: String
}

struct LiveReading: Hashable {
    let value: Double
    let tick: Int
    /// Milliseconds after the scenario started; negative for a reading the preset placed in the past.
    let atOffsetMs: Int
}

enum LiveRangePlace { case inside, below, above }

extension LiveVitals {
    static func preset(_ id: String) -> LivePresetSpec? { presets.first { $0.id == id } }

    /// A patient's seed: their reference folded over UTF-16 code units, never nought.
    static func seed(of subject: String) -> Int {
        var h = 0
        for unit in subject.utf16 { h = (h * 31 + Int(unit)) % modulus }
        return h == 0 ? 1 : h
    }

    /// A number in [0, 1) for this patient, reading and stream; the same as the web's.
    static func unit(seed: Int, tick: Int, stream: Int) -> Double {
        var x = (seed + tick * tickStride + stream * streamStride) % modulus
        if x == 0 { x = 1 }
        x = (x * multiplier) % modulus
        x = (x * multiplier) % modulus
        return Double(x) / Double(modulus)
    }

    static func decimals(_ step: Double) -> Int {
        var places = 0, scaled = step
        while scaled.rounded() != scaled && places < 6 { scaled *= 10; places += 1 }
        return places
    }

    /// A value on the measure's own step, to as many places as the step has.
    static func onStep(_ value: Double, _ step: Double) -> Double {
        let snapped = (value / step).rounded() * step
        let scale = pow(10, Double(decimals(step)))
        return (snapped * scale).rounded() / scale
    }

    private static func liveOffsets(_ presetId: String) -> [Int] {
        guard let p = preset(presetId) else { return [] }
        return Array(Set(p.readings.map(\.offsetMs).filter { $0 >= 0 })).sorted()
    }

    static func streamsLive(_ presetId: String) -> Bool { !liveOffsets(presetId).isEmpty }

    private static func baseline(_ presetId: String, _ type: String, _ tick: Int) -> Double? {
        let offsets = liveOffsets(presetId)
        guard let p = preset(presetId), !offsets.isEmpty else { return nil }
        let at = offsets[min(tick / ticksPerStep, offsets.count - 1)]
        return p.readings.filter { $0.type == type && $0.offsetMs >= 0 && $0.offsetMs <= at }
            .max { $0.offsetMs < $1.offsetMs }?.value
    }

    /// Reading number `tick` of one stream, or nil when the scenario sends nothing from its instrument.
    static func reading(_ presetId: String, seed: Int, stream index: Int, tick: Int) -> LiveReading? {
        let s = streams[index]
        guard let base = baseline(presetId, s.presetType, tick) else { return nil }
        var value = onStep(base + (unit(seed: seed, tick: tick, stream: index) * 2 - 1) * s.jitter, s.step)
        if let ceiling = s.ceiling { value = min(value, ceiling) }
        return LiveReading(value: value, tick: tick, atOffsetMs: tick * tickMs)
    }

    /// The last `history` readings up to `tick`, oldest first. The stale preset sends nothing live: its own
    /// readings come back as they are, at their own offsets.
    static func history(_ presetId: String, seed: Int, stream index: Int, tick: Int) -> [LiveReading] {
        let s = streams[index]
        if !streamsLive(presetId) {
            let own = (preset(presetId)?.readings ?? []).filter { $0.type == s.presetType }.sorted { $0.offsetMs < $1.offsetMs }
            return Array(own.enumerated().map { LiveReading(value: onStep($0.element.value, s.step), tick: $0.offset, atOffsetMs: $0.element.offsetMs) }.suffix(history))
        }
        return (max(0, tick - history + 1)...tick).compactMap { reading(presetId, seed: seed, stream: index, tick: $0) }
    }

    static func place(_ stream: LiveStreamSpec, _ value: Double) -> LiveRangePlace {
        value < stream.low ? .below : value > stream.high ? .above : .inside
    }

    /// A reading, to as many places as its step has: 37.0 °C, never 37.
    static func format(_ value: Double, _ step: Double) -> String { String(format: "%.\(decimals(step))f", value) }
    /// A range's bound as the record writes it: 90, 36.1.
    static func plain(_ value: Double) -> String { value == value.rounded() ? String(Int(value)) : String(value) }

    static func fill(_ template: String, _ values: [String: String]) -> String {
        values.reduce(template) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
    }

    /// The range in the record's numbers, said as a place and never a severity.
    static func rangeWords(_ stream: LiveStreamSpec, _ value: Double) -> String {
        let template: String
        switch place(stream, value) { case .inside: template = Words.inside; case .below: template = Words.below; case .above: template = Words.above }
        return fill(template, ["low": plain(stream.low), "high": plain(stream.high), "unit": stream.unit])
    }

    static func ago(_ ms: Int) -> String {
        let s = max(0, ms / 1000)
        if s < 2 { return Words.justNow }
        if s < 60 { return fill(Words.secondsAgo, ["n": "\(s)"]) }
        if s < 3600 { return fill(Words.minutesAgo, ["n": "\(s / 60)"]) }
        return fill(Words.hoursAgo, ["n": "\(s / 3600)"])
    }
}
