import SwiftUI

/* The patient's devices, live and simulated, beside the doctor's consultation on iOS — the compact panel the
   web draws in the call room and the consultation record's rail (the founder, 1 October 2026: "even on
   consultation the doctor sees them").

   Every stream, scenario, sentence and refusal is LiveVitalsData.swift's, generated from
   packages/catalog/live-vitals.json; every number is LiveVitals.swift's arithmetic. A row says the reading,
   its unit, the instrument it stands for, that it is simulated, how long ago it arrived and where it stands
   against the record's range in words. Where the Lovable export drew a score, a triage colour, an
   interpretation, alarms and a heatmap, the panel draws the contract's sentence saying why not.

   Decorative organ motion stops with Pause, stale or missing readings and Reduce Motion. Its rhythm
   is illustrative rather than measured. VoiceOver reads the text, never the decorative icon.
 */
struct LiveVitalsPanel: View {
    let subject: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var presetId = LiveVitals.defaultPreset
    @State private var tick = 0
    @State private var running = true
    @State private var startedAt = Date()
    @State private var receivedAt = Date()
    @State private var now = Date()
    private let clock = Timer.publish(every: Double(LiveVitals.tickMs) / 1000, on: .main, in: .common).autoconnect()

    private var seed: Int { LiveVitals.seed(of: subject) }
    private var live: Bool { LiveVitals.streamsLive(presetId) }
    private typealias W = LiveVitals.Words

    var body: some View {
        CareCard {
            Text(W.compactHeading).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .accessibilityAddTraits(.isHeader)
            Text(W.motionNote).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            banner
            Picker(W.scenario, selection: $presetId) {
                ForEach(LiveVitals.presets) { Text($0.name).tag($0.id) }
            }
            .onChange(of: presetId) { _, _ in restart() }
            Button(running ? W.pause : W.resume) { running.toggle() }
                .buttonStyle(QuietButton()).disabled(!live)
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                StatusPill(text: W.simulatedMark, tone: "quiet")
                Text(live ? (running ? LiveVitals.fill(W.running, ["seconds": "\(LiveVitals.tickMs / 1000)"]) : W.paused) : W.stale)
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(LiveVitals.streams.enumerated()), id: \.element.id) { index, stream in
                row(index, stream)
            }
            ForEach(LiveVitals.notStreamed, id: \.self) { line in
                Text(line).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("\(W.simulatedSentence) \(W.rangeNote)").font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Text(W.refusalsHeading).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .accessibilityAddTraits(.isHeader)
            ForEach(LiveVitals.refusals) { refusal in
                HStack(alignment: .top, spacing: ThusoSpacing.space8) {
                    Image(systemName: "nosign").foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                        Text(refusal.heading).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        Text(refusal.sentence).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .onReceive(clock) { at in
            now = at
            if running && live { tick += 1; receivedAt = at }
        }
    }

    private var banner: some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space8) {
            Image(systemName: "exclamationmark.triangle").foregroundStyle(ThusoRole.warningInk).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(W.banner).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(W.notice).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.muted, in: RoundedRectangle(cornerRadius: ThusoRadius.tile, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func restart() { tick = 0; startedAt = Date(); receivedAt = startedAt; now = startedAt }

    /// Colour belongs to the organ, never to the reading: nothing here can be read as a severity.
    private func organInk(_ id: String) -> Color {
        switch id {
        case "pulse", "watch-pulse": return ThusoRole.coral
        case "oxygen": return ThusoRole.info
        case "temperature": return ThusoRole.highlight
        case "glucose": return ThusoRole.accent
        default: return ThusoRole.primary
        }
    }

    @ViewBuilder private func row(_ index: Int, _ stream: LiveStreamSpec) -> some View {
        let history = LiveVitals.history(presetId, seed: seed, stream: index, tick: tick)
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(alignment: .top) {
                Image(systemName: stream.id == "oxygen" ? "lungs.fill" : ["pulse", "watch-pulse"].contains(stream.id) ? "heart.fill" : stream.id == "temperature" ? "thermometer.medium" : stream.id == "glucose" ? "drop.fill" : "waveform.path.ecg")
                    .font(.thuso(.title2)).foregroundStyle(organInk(stream.id))
                    .frame(width: 52, height: 52).background(organInk(stream.id).opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
                    .symbolEffect(.pulse, options: .repeating, isActive: running && live && !reduceMotion && !history.isEmpty)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(stream.label).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text("\(W.simulatedClass) · \(LiveVitals.fill(W.standsFor, ["instrument": stream.instrument]))")
                        .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                }
                Spacer(minLength: ThusoSpacing.space8)
                if let latest = history.last {
                    Text("\(LiveVitals.format(latest.value, stream.step)) \(stream.unit)")
                        .font(.thuso(.title3, weight: .semibold)).monospacedDigit().foregroundStyle(ThusoRole.foreground)
                }
            }
            if let latest = history.last {
                Spark(stream: stream, history: history)
                Text(LiveVitals.rangeWords(stream, latest.value))
                    .font(.thuso(.caption, weight: LiveVitals.place(stream, latest.value) == .inside ? .regular : .semibold))
                    .foregroundStyle(ThusoRole.foreground)
                let at = live ? receivedAt : startedAt.addingTimeInterval(Double(latest.atOffsetMs) / 1000)
                Text("\(W.provenance) · \(W.simulatedMark) · \(LiveVitals.ago(Int(now.timeIntervalSince(at) * 1000)))")
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            } else {
                Text(W.nothing).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.tile, style: .continuous).stroke(ThusoRole.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/* The trend line over the record's range as a band of the muted ground, the newest reading at the right edge.
   The same two colours whatever the value: a line that turned red would be the severity colour this panel
   refuses. Its words are the row's, so VoiceOver skips the drawing. */
private struct Spark: View {
    let stream: LiveStreamSpec
    let history: [LiveReading]
    var body: some View {
        GeometryReader { geo in
            let values = history.map(\.value)
            let lo = values.min() ?? 0, hi = values.max() ?? 0
            let pad = max(stream.step * 2, (hi - lo) * 0.2)
            let minV = lo - pad, maxV = hi + pad
            let w = geo.size.width, h = geo.size.height
            let span = (w - 4) / CGFloat(LiveVitals.history - 1)
            let x = { (i: Int) in 2 + CGFloat(i + LiveVitals.history - history.count) * span }
            let y = { (v: Double) in h - 2 - CGFloat((v - minV) / (maxV - minV)) * (h - 4) }
            let top = min(max(0, y(stream.high)), h), bottom = min(max(0, y(stream.low)), h)
            ZStack(alignment: .topLeading) {
                if bottom > top { Rectangle().fill(ThusoRole.muted).frame(height: bottom - top).offset(y: top) }
                if history.count > 1 {
                    Path { p in
                        for (i, r) in history.enumerated() {
                            let point = CGPoint(x: x(i), y: y(r.value))
                            if i == 0 { p.move(to: point) } else { p.addLine(to: point) }
                        }
                    }
                    .stroke(ThusoRole.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .frame(height: 28)
        .accessibilityHidden(true)
    }
}
