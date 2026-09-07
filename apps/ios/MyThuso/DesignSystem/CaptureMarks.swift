import SwiftUI

/* The marks a reading wears, built out of the tokens in Theme.swift rather than a second visual
   language for clinical data.

   The hard part of this file is a design decision, not a layout one. Four origins have to be
   distinguishable at a glance without any of them reading as a downgrade of another, and the usual
   ways of showing “where this came from” all rank: a badge on the device reading implies the typed
   one is missing something, a warning tint on the typed one implies it is suspect, and greying the
   patient’s own words says out loud what the contract says never to say about them.

   So all four are one shape, one size, one weight and one opacity. What differs is the glyph and
   the hue, and both are chosen to be four *kinds* rather than four steps: teal for an instrument,
   blue for a clinician, deep green for the patient’s own voice, and a dashed edge for arithmetic —
   dashed because a calculated value is assembled from other values, which is a real difference and
   not a lesser one.

   The only thing in this file that is allowed to look like a warning is a caveat, and a caveat is
   attached to the circumstances of a reading — a calibration that ran out, an expired strip, a cold
   finger — never to its origin. */

extension Provenance {
    var tint: Color {
        switch self {
        case .device: return ThusoTheme.indigo
        case .manual: return ThusoTheme.info
        case .patientReported: return ThusoTheme.slate
        case .derived: return ThusoTheme.indigoDeep
        }
    }
    var wash: Color {
        switch self {
        case .device: return ThusoTheme.indigoSoft
        case .manual: return ThusoTheme.infoSoft
        case .patientReported: return ThusoTheme.accentSoft
        case .derived: return ThusoTheme.canvas
        }
    }
}

/// One chip, four hues, one weight. VoiceOver hears the origin as a sentence, because “device” on
/// its own tells a listener nothing about what it is a property of.
struct ProvenanceMark: View {
    let provenance: Provenance
    var full = false
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: provenance.symbol).font(.caption2.weight(.semibold))
            Text(full ? provenance.name : provenance.shortName).font(.caption2.weight(.semibold))
        }
        .foregroundStyle(provenance.tint)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(provenance.wash, in: Capsule())
        .overlay(
            Capsule().strokeBorder(provenance.tint.opacity(0.3),
                                   style: StrokeStyle(lineWidth: 1, dash: provenance == .derived ? [3, 2] : []))
        )
        .accessibilityElement()
        .accessibilityLabel("Origin: \(provenance.name)")
    }
}

/// The legend, wherever the four appear together for the first time. It says the thing the marks
/// themselves cannot: that they are kinds and not grades.
struct ProvenanceKey: View {
    var body: some View {
        CareCard {
            Label("Four origins, four marks", systemImage: "square.on.square.dashed")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
            Text("They differ by symbol and colour, not by weight. A blood pressure a nurse took by hand on the right cuff is a clinical skill, not a weaker copy of one a machine sent over. What the mark says is where the number came from — what it is worth is the reader’s judgement, which is what the sentences below are for.")
                .font(.caption).foregroundStyle(ThusoTheme.body)
            ForEach(Provenance.allCases) { provenance in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        ProvenanceMark(provenance: provenance, full: true)
                        Spacer(minLength: 6)
                        Text(provenance.fhir).font(.caption2).foregroundStyle(ThusoTheme.faint)
                    }
                    Text(provenance.detail).font(.caption2).foregroundStyle(ThusoTheme.ink)
                    Text(provenance.trust).font(.caption2).foregroundStyle(ThusoTheme.body)
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                if provenance != Provenance.allCases.last { Divider().overlay(ThusoTheme.line) }
            }
            Text(CaptureRules.provenanceIsRequired).font(.caption2).foregroundStyle(ThusoTheme.faint)
        }
    }
}

/// Everything that makes a reader treat a number differently, in amber, one line each. Amber and
/// never red: the reading is not wrong and it is not refused — it is a number with a condition
/// attached, and refusing it would leave a nurse in a home with one instrument holding nothing.
struct CaveatNote: View {
    let caveats: [String]
    var body: some View {
        if !caveats.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(caveats, id: \.self) { caveat in
                    Label(caveat, systemImage: "exclamationmark.circle")
                        .font(.caption2).foregroundStyle(ThusoTheme.mangoInk)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: 10))
            .accessibilityElement(children: .combine)
        }
    }
}

struct CalibrationPill: View {
    let calibration: CalibrationRecord
    var body: some View {
        StatusPill(text: calibration.standing.label, tone: calibration.standing.tone)
            .accessibilityLabel("\(calibration.standing.label). \(calibration.phrase).")
    }
}

/// A reading as it appears everywhere it appears: the value, its origin, what took it, and any
/// caveat. One row, so the assessment, the queue, the patient file and the consultation cannot
/// drift into showing three-quarters of it each.
struct ReadingRow: View {
    let reading: CaptureReading
    var dense = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(reading.label).font(.caption).foregroundStyle(ThusoTheme.body)
                Spacer(minLength: 8)
                Text(reading.display).font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(ThusoTheme.ink).multilineTextAlignment(.trailing)
            }
            HStack(spacing: 8) {
                ProvenanceMark(provenance: reading.provenance)
                if let standing = reading.calibrationStanding, reading.provenance == .device {
                    StatusPill(text: standing.label, tone: standing.tone)
                }
                Spacer(minLength: 0)
            }
            if let line = reading.instrumentLine {
                Text(reading.calibratedOn.map { "\(line) · last calibrated \(vettingDate($0))" } ?? line)
                    .font(.caption2).foregroundStyle(ThusoTheme.faint)
            }
            if let label = reading.qualifierLabel, let qualifier = reading.qualifier {
                Text("\(label): \(qualifier)").font(.caption2).foregroundStyle(ThusoTheme.faint)
            }
            if !reading.derivedFrom.isEmpty {
                Text("Calculated from \(reading.derivedFrom.map { KitMeasures.label($0).lowercased() }.joined(separator: " and "))")
                    .font(.caption2).foregroundStyle(ThusoTheme.faint)
            }
            if !dense { CaveatNote(caveats: reading.caveats) }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(reading.label), \(reading.display). \(reading.provenance.name).\(reading.caveats.isEmpty ? "" : " " + reading.caveats.joined(separator: " "))")
    }
}

/* Two clocks, never one. The phone’s time is evidence about the phone; the receipt time is the only
   one that orders anything, and an entry nobody has received does not get a time it happened just
   because the phone was willing to guess. */
struct TwoClocksRow: View {
    let entry: CapturedEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            FieldRow(label: "This phone believed", value: captureStamp(entry.deviceCapturedAt))
            FieldRow(label: "Received", value: entry.serverReceivedAt.map(captureStamp) ?? "Not received")
            Text(entry.whenItHappened == captureStamp(entry.serverReceivedAt ?? entry.deviceCapturedAt)
                 ? "Ordered by the receipt time. The phone’s own time is kept beside it as what the phone believed."
                 : entry.whenItHappened)
                .font(.caption2).foregroundStyle(ThusoTheme.faint)
            if let drift = entry.clockDisagreedBy {
                let hours = abs(drift) / 3600
                Label("This phone’s clock was \(String(format: "%.1f", hours)) hours \(drift > 0 ? "ahead of" : "behind") the receipt. Nobody was asked about it — the receipt time orders the record and the phone’s time is kept as what the phone believed.",
                      systemImage: "clock.badge.exclamationmark")
                    .font(.caption2).foregroundStyle(ThusoTheme.mangoInk)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// offlineNeverServesStaleSilently, in one reusable line. Anything read out of the phone’s own
/// store says how old the copy is, in words, wherever it is shown.
struct WrittenAgoNote: View {
    let at: Date?
    var what = "This row"
    var body: some View {
        if let at {
            Text("\(what) was \(writtenInWords(at)), to the store on this phone.")
                .font(.caption2).foregroundStyle(ThusoTheme.faint)
        } else {
            Text("\(what) has not been written to this phone’s store.")
                .font(.caption2).foregroundStyle(ThusoTheme.faint)
        }
    }
}

struct CaptureStatePill: View {
    let state: CaptureState
    var body: some View {
        StatusPill(text: state.name, tone: state.tone)
            .accessibilityLabel("\(state.name). \(state.detail)")
    }
}
