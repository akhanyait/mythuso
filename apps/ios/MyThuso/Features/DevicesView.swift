import SwiftUI

/* Thuso Kit's registry on iOS, on the two surfaces a phone carries: the nurse's kit, and the patient asking to
 * link Apple Health. The Control Tower's registry desk is web-only, because a recall is recorded at a desk.
 *
 * Every sentence is DevicesData.swift's, generated from packages/catalog/devices.json and
 * packages/catalog/apis/devices.json, and every state is Devices.swift's arithmetic. No reading's value is
 * on any of these screens, because Devices never holds one.
 *
 * THE WEARABLE SCREEN HAS NO CONNECT BUTTON. What it offers is the one thing that is true: a request,
 * recorded with the consent in force and the reading types agreed to, that reads nothing from the phone. */

// MARK: - The nurse's kit

struct KitHealthSection: View {
    var now = Date()
    private var registry: Devices.Registry { Devices.registry }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: Devices.NurseText.heading, count: "\(registry.devices.count)", note: Devices.NurseText.intro)
            ForEach(registry.devices) { device in
                CareCard { deviceCard(device) }
                    .accessibilityIdentifier("device-health-\(device.serial)")
            }
            Label(Devices.RuleText.calibrationNeverRefuses, systemImage: "exclamationmark.circle")
                .font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
                .fixedSize(horizontal: false, vertical: true)
            Label(Devices.RuleText.preview, systemImage: "antenna.radiowaves.left.and.right.slash")
                .font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /* A tone and a word for every state, never colour alone. */
    private func stateTone(_ id: String) -> String {
        switch id { case "stale": return "amber"; case "recalled": return "danger"; case "never-synced": return "quiet"; default: return "teal" }
    }
    private func calibrationTone(_ id: String) -> String {
        switch id { case "due": return "amber"; case "overdue": return "danger"; case "not-tracked": return "quiet"; default: return "teal" }
    }

    @ViewBuilder private func deviceCard(_ device: Devices.Registered) -> some View {
        let state = Devices.healthState(of: device, now: now)
        let calibration = Devices.calibration(of: device, at: now)
        HStack(spacing: ThusoSpacing.space12) {
            TileIcon(symbol: device.instrumentKind.flatMap(ThusoKit.device)?.symbol ?? "sensor")
            VStack(alignment: .leading, spacing: 3) {
                Text(device.model).font(.subheadline.weight(.semibold)).foregroundStyle(DeckInk.sheetInk)
                Text(device.serial).font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
            }
            Spacer(minLength: 6)
            StatusPill(text: Devices.label(Devices.healthStates, state), tone: stateTone(state))
        }
        .accessibilityElement(children: .combine)
        if let recall = device.recall {
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Label(Devices.fill(Devices.NurseText.recalledFrom, ["when": captureStamp(recall.effectiveFrom),
                                                                     "reason": Devices.label(Devices.recallReasons, recall.reasonCode)]),
                      systemImage: "xmark.shield")
                    .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                Text(Devices.NurseText.doNotUse).font(.footnote).foregroundStyle(DeckInk.sheetInk)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(ThusoSpacing.space8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .accessibilityElement(children: .combine)
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            Text(device.lastSyncAt.map { Devices.fill(Devices.NurseText.lastSync, ["when": captureStamp($0)]) } ?? Devices.NurseText.neverSynced)
                .font(.footnote).foregroundStyle(DeckInk.sheetInk)
            if Devices.isStale(device, now: now) {
                Text(Devices.fill(Devices.NurseText.staleSince, ["interval": Devices.intervalText(minutes: Devices.staleAfterMinutes)]))
                    .font(.footnote).foregroundStyle(ThusoTheme.mangoInk)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            StatusPill(text: Devices.label(Devices.calibrationStates, calibration.stateId), tone: calibrationTone(calibration.stateId))
            Text(calibrationSentence(calibration)).font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        FieldRow(label: device.batteryPercent.map { Devices.fill(Devices.NurseText.battery, ["percent": String($0)]) } ?? Devices.NurseText.batteryUnknown,
                 value: Devices.fill(Devices.NurseText.firmware, ["version": device.firmware]))
        let readings = registry.readings(of: device.id)
        if !readings.isEmpty {
            Divider().overlay(DeckInk.sheetLine)
            ForEach(readings) { reading in
                DeviceReadingFacts(reading: reading)
                if reading.id != readings.last?.id { Divider().overlay(DeckInk.sheetLine) }
            }
        }
    }

    private func calibrationSentence(_ calibration: Devices.Calibration) -> String {
        guard let due = calibration.dueOn else { return Devices.NurseText.calibrationNotTracked }
        let sentence = calibration.stateId == "overdue" ? Devices.NurseText.calibrationOverdue
            : calibration.stateId == "due" ? Devices.NurseText.calibrationDue : Devices.NurseText.calibrationInDate
        return Devices.fill(sentence, ["on": vettingDate(due)])
    }
}

/* What Devices knows about one reading, which is everything but the number. A mark is shown wherever the
   reading is shown, with the sentence that says what it took away. */
struct DeviceReadingFacts: View {
    let reading: Devices.Reading
    var body: some View {
        let carries = Devices.carriesWeight(reading)
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(Devices.measureLabel(reading.metric)).font(.footnote.weight(.semibold)).foregroundStyle(DeckInk.sheetInk)
                Spacer(minLength: 8)
                Text(captureStamp(reading.takenAt)).thusoFont(ThusoType.caption).foregroundStyle(DeckInk.sheetQuiet)
            }
            FieldRow(label: Devices.NurseText.readingSource, value: Devices.sourceLabel(reading.source))
            FieldRow(label: Devices.NurseText.readingQuality, value: Devices.qualityLabel(reading.quality))
            FieldRow(label: Devices.NurseText.readingWeight, value: carries ? Devices.NurseText.carries : Devices.NurseText.carriesNot)
            ForEach(reading.marks, id: \.self) { id in
                if let mark = Devices.mark(id) {
                    Label { Text("\(Text(mark.label).fontWeight(.semibold)). \(mark.sentence)") } icon: { Image(systemName: "exclamationmark.circle") }
                        .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.mangoInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("device-reading-\(reading.id)")
    }
}

/* The source and sample beside a reading on the kit's own queue. A reading typed by a clinician, reported by
   the patient or calculated has no device source, so nothing is drawn for it rather than a guess. */
struct DeviceSampleTags: View {
    let reading: CaptureReading
    var body: some View {
        if reading.provenance == .device,
           let quality = Devices.captureQualityId(instrumentId: reading.instrumentId, qualifier: reading.qualifier) {
            let source = StatusPill(text: "\(Devices.NurseText.readingSource): \(Devices.sourceLabel("kit-instrument"))", tone: "quiet")
            let sample = StatusPill(text: "\(Devices.NurseText.readingQuality): \(Devices.qualityLabel(quality))",
                                    tone: quality == "poor" ? "amber" : "quiet")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space8) { source; sample; Spacer(minLength: 0) }
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) { source; sample }
            }
        }
    }
}

// MARK: - The patient's wearable link

struct WearableLinkRequestView: View {
    let platformId: String
    @ObservedObject private var store = WearableLinkStore.shared
    @State private var chosen: Set<String> = []
    @State private var agreed = false
    @State private var refused: DevicesRefusal?

    private var platform: WearablePlatformSpec? { Devices.platform(platformId) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CapabilityNotice(of: "wearables")
                if let platform { content(platform) } else {
                    Text(Devices.refusal("platform-not-declared").statement).font(.subheadline).foregroundStyle(ThusoTheme.danger)
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(platform.map { Devices.fill(Devices.WearableText.heading, ["platform": $0.name]) } ?? "")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func content(_ platform: WearablePlatformSpec) -> some View {
        let open = store.open(platform.id)
        let last = store.last(platform.id)
        SurfaceHeading(eyebrow: platform.phone, title: Devices.fill(Devices.WearableText.heading, ["platform": platform.name]), subtitle: "")
        if let open {
            SurfacePanel(tone: .lead) {
                HStack(spacing: ThusoSpacing.space12) {
                    TileIcon(symbol: "applewatch", size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(platform.name).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                        Text(platform.phone).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                    Spacer(minLength: ThusoSpacing.space8)
                    StatusPill(text: Devices.WearableText.stateLabel, tone: "amber")
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("wearable-link-\(open.id)")
            }
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(Devices.WearableText.notConnected).font(.subheadline.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
            Text(Devices.WearableText.why).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Text(Devices.WearableText.notInThisBuild).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
        .fixedSize(horizontal: false, vertical: true)
        if let open {
            SurfacePanel {
                PanelHead(Devices.WearableText.scopeHeading)
                ForEach(open.metrics, id: \.self) { metric in
                    Label(Devices.measureLabel(metric), systemImage: "checkmark").font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                }
                Button(Devices.WearableText.withdraw) { refused = store.withdraw(platform: platform.id) }
                    .buttonStyle(QuietButton())
            }
        } else {
            SurfacePanel {
                PanelHead(Devices.WearableText.scopeHeading)
                ForEach(Devices.measureUnits, id: \.id) { measure in
                    Toggle(Devices.measureLabel(measure.id), isOn: Binding(
                        get: { chosen.contains(measure.id) },
                        set: { if $0 { chosen.insert(measure.id) } else { chosen.remove(measure.id) } }))
                        .font(.subheadline).frame(minHeight: 44)
                }
            }
            SurfacePanel {
                PanelHead(Devices.WearableText.consentHeading)
                Toggle(isOn: $agreed) {
                    Text(Devices.WearableText.consentName).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(Devices.WearableText.consentWithdrawal).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(Devices.WearableText.request) {
                refused = store.request(platform: platform.id, metrics: Array(chosen), agreed: agreed)
                if refused == nil { chosen = []; agreed = false }
            }
            .buttonStyle(CareButton())
            .disabled(!agreed || chosen.isEmpty)
        }
        if open == nil, last?.withdrawnAt != nil {
            Text(Devices.WearableText.withdrawn).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let refused {
            Label(refused.statement, systemImage: "hand.raised").font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
