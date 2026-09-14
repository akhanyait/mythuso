import SwiftUI

/* Thuso Kit — pairing an instrument, taking a reading off it, and landing that reading in the
   visit with everything that has to travel beside it.

   Until now Thuso Kit was a row in the roadmap. That is the honest starting point and it is worth
   saying, because the thing this screen exists to settle is not whether a Bluetooth cuff can talk
   to a phone — it can, and a fortnight of firmware work would prove it. What has to be right before
   any of that is what the record says a reading *is*: which instrument, whose hands, what cuff,
   what the calibration was that morning, and what happens when the calibration has run out and the
   nurse is standing in somebody’s kitchen with the only oximeter she owns.

   Nothing here connects. No CoreBluetooth session is opened, no scan is run, and the app declares
   no Bluetooth permission — which is a different thing from a permission that was asked for and
   refused, and this screen says which. Every instrument, serial and reading is fictional. */

/// Three answers a design review needs beside each other: a cleared nurse, a nurse whose Thuso Kit
/// training is still outstanding, and one whose police clearance lapsed nine days ago.
private let kitOperatorIds = ["N-205", "N-202", "N-204"]

enum KitScan: Equatable { case idle, searching, done }

struct ThusoKitView: View {
    var operatorId = "N-205"
    var visitReference = CaptureFixtures.visit
    var patient = CaptureFixtures.patient
    @ObservedObject private var kit = CaptureStore.shared
    @ObservedObject private var vetting = VettingStore.shared
    @State private var who = ""
    @State private var scan: KitScan = .idle
    @State private var capturing: KitDevice?
    @State private var notice = ""

    private var operators: [VettingSubject] { kitOperatorIds.compactMap { vetting.subject($0) } }
    private var subject: VettingSubject { operators.first { $0.id == who } ?? operators.first ?? VettingFixtures.subjects[0] }
    /* Capturing is writing. There is no separate “use the kit” capability in the vetting table and
       there should not be: an instrument that produces a number nobody may put in a record produces
       nothing. So the gate on the cuff is the gate on the note. */
    private var mayWrite: VettingDecision { can(subject, "write-clinical-note") }
    private var unpaired: [KitSighting] { KitFixtures.sightings.filter { !kit.pairedIds.contains($0.id) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                deck
                if mayWrite.allowed {
                    discovery
                    pairedInstruments
                } else {
                    CareCard {
                        RefusalCard(title: "This kit will not pair for this nurse", decision: mayWrite)
                        Text("Pairing is refused rather than merely un-signable. An instrument in the hands of somebody who may not write is an instrument producing numbers with nowhere to go, and a nurse who has taken twenty readings before being told is a nurse the platform has wasted.")
                            .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                }
                ProvenanceKey()
                whereItGoes
                if !notice.isEmpty {
                    Text(notice).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Thuso Kit").navigationBarTitleDisplayMode(.inline)
        .onAppear { if who.isEmpty { who = operators.contains { $0.id == operatorId } ? operatorId : (operators.first?.id ?? "") } }
        .sheet(item: $capturing) { device in
            NavigationStack {
                KitReadingSheet(device: device, visitReference: visitReference, patient: patient, subject: subject) { reading in
                    notice = "\(reading.label) \(reading.display) was written to this phone as captured, and to the visit. It exists nowhere else yet."
                }
            }
        }
    }

    /* The most important card on the screen, and it goes first. A preview that lets a reviewer
       believe a radio is involved has told them something false about how far the work has got. */
    @ViewBuilder private var nothingConnects: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Label("Nothing here connects", systemImage: "antenna.radiowaves.left.and.right.slash")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text("This build opens no Bluetooth session. There is no CoreBluetooth call in it, no scan is run, and no instrument is contacted. The six below are the six instruments in the capture contract, drawn on this phone from that list; their serial numbers are invented.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Text("The app also declares no Bluetooth usage description, so iOS would refuse it a scan even if it asked — and it must not ask. A permission prompt an app cannot honestly finish the sentence for is a prompt nobody should be shown. This is not a refused permission. Nothing has asked for one.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    /* THE KIT IS A DECK, AND "NOTHING HERE CONNECTS" STANDS ON IT.
       The screen used to open on a badge, a heading, a notice and two white cards of equal weight, so the
       one fact a reviewer most needs — nothing here reaches an instrument — sat at the height of the
       choice of nurse. The capability's own sentence is on the canvas now at reading size, and "Nothing
       here connects" is the sheet on the canvas's edge: the first thing under the deck and the most
       raised thing on the screen.
       The choice of nurse is a pill cluster rather than a menu, because the vetting gate on the cuff is
       the whole demonstration and comparing the three is how a reviewer sees it; each pill is a
       44-point target at every size, which is what PickRow existed to guarantee. The ring is the
       contract's instruments with the paired ones lit; the panel counts what is still on this phone. */
    private var deck: some View {
        let paired = ThusoKit.devices.map { device in kit.instruments.contains { $0.deviceId == device.id } }
        let outOfDate = kit.instruments.filter { $0.calibration.standing == .outOfDate }.count
        let dueSoon = kit.instruments.filter { $0.calibration.standing == .dueSoon }.count
        let standing = summarise(subject)
        return DeckHero {
            DeckPreviewMark()
            DeckHeadline(eyebrow: "Thuso Kit",
                         words: [.text("Connected"), .glyph("sensor.tag.radiowaves.forward"), .text("diagnostic capture.")],
                         tail: "An instrument, a reading, and everything the record needs to know about where the number came from.")
            CapabilityNotice(of: "devices")
            DeckPills(label: "Working as", selection: $who,
                      options: operators.map { ($0.id, "\($0.name) · \($0.reference)") })
            HStack(spacing: ThusoSpacing.space8) {
                DeckTag(text: standing.status.label, flagged: !standing.cleared)
                Text(subject.role?.name ?? subject.roleId).font(.footnote).foregroundStyle(DeckInk.quiet)
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            DeckRefusal(decision: mayWrite)
            NavigationLink { VettingStatusView(subjectId: subject.id) } label: {
                HStack(spacing: ThusoSpacing.space12) {
                    Text("Open this nurse’s vetting")
                        .font(.footnote.weight(.semibold)).foregroundStyle(DeckInk.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    DeckCircle(onNight: true)
                }
                .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            DeckGlass {
                DeckFigure(value: "\(kit.instruments.count)", label: "of \(ThusoKit.devices.count) instruments paired to this phone",
                           chip: kit.instruments.isEmpty ? "Nothing paired"
                               : outOfDate > 0 ? "\(outOfDate) out of calibration"
                               : dueSoon > 0 ? "\(dueSoon) due for calibration" : "All in calibration",
                           flagged: outOfDate > 0, shape: .ring(paired))
            }
            DeckPanel {
                DeckFigure(value: "\(kit.onlyHereCount)", label: "readings held on this phone, not yet sent",
                           chip: kit.conflictedCount > 0 ? "\(kit.conflictedCount) needing a decision" : "None needing a decision",
                           flagged: kit.conflictedCount > 0, ground: .panel)
            }
        } sheet: {
            nothingConnects
        }
    }

    @ViewBuilder private var discovery: some View {
        CareCard {
            Label("Instruments nearby", systemImage: "dot.radiowaves.left.and.right")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            switch scan {
            case .idle:
                Text("Nothing is being listened for. Pressing the button below draws the contract’s six instruments after a pause — it does not search.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Button("Look for instruments") {
                    scan = .searching
                    Task {
                        try? await Task.sleep(nanoseconds: 900_000_000)
                        scan = .done
                    }
                }.buttonStyle(CareButton())
            case .searching:
                SkeletonRows(rows: 2)
                Text("Drawing the list. No radio is on.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            case .done:
                if unpaired.isEmpty {
                    Text("Every instrument in the contract is paired to this phone.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                } else {
                    ForEach(unpaired) { sighting in
                        sightingRow(sighting)
                        if sighting.id != unpaired.last?.id { Divider().overlay(ThusoTheme.studioLine) }
                    }
                }
                Button("Look again") { scan = .idle }.buttonStyle(QuietButton())
            }
        }
    }

    @ViewBuilder private func sightingRow(_ sighting: KitSighting) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            HStack(spacing: ThusoSpacing.space12) {
                TileIcon(symbol: sighting.device?.symbol ?? "sensor", size: 38)
                VStack(alignment: .leading, spacing: 3) {
                    Text(sighting.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("\(sighting.serial) · \(sighting.device?.transport ?? "") · \(sighting.proximity)")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                Spacer(minLength: 6)
            }
            HStack(spacing: ThusoSpacing.space8) {
                CalibrationPill(calibration: sighting.calibration)
                Text(sighting.calibration.phrase).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Spacer(minLength: 0)
            }
            Button("Pair") { kit.pair(sighting); notice = "\(sighting.name) \(sighting.serial) is paired to this phone. Nothing was contacted." }
                .buttonStyle(QuietButton())
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private var pairedInstruments: some View {
        DeckSectionHead(title: "Paired to this phone", count: "\(kit.instruments.count)")
        if kit.instruments.isEmpty {
            EmptyStateCard(title: "No instrument is paired",
                           message: "Every reading taken in the assessment will be one a person typed, and it will say so. That is a complete answer, not a degraded one — most home visits in this country are done with a manual cuff and a nurse who knows how to use it.")
        } else {
            ForEach(kit.instruments) { instrument in
                CareCard { instrumentCard(instrument) }
            }
            WrittenAgoNote(at: kit.ledgerWrittenAt, what: "The paired list")
        }
    }

    @ViewBuilder private func instrumentCard(_ instrument: PairedInstrument) -> some View {
        let calibration = instrument.calibration
        HStack(spacing: ThusoSpacing.space12) {
            TileIcon(symbol: instrument.device?.symbol ?? "sensor")
            VStack(alignment: .leading, spacing: 3) {
                Text(instrument.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text("\(instrument.serial) · \(instrument.device?.transport ?? "")").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            }
            Spacer(minLength: 6)
        }
        HStack(spacing: ThusoSpacing.space8) {
            CalibrationPill(calibration: calibration)
            Text(instrument.device?.cadence ?? "").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Spacer(minLength: 0)
        }
        FieldRow(label: "Last calibrated", value: vettingDate(calibration.lastCalibrated))
        FieldRow(label: "Next due", value: "\(vettingDate(calibration.due)) · \(calibration.phrase.lowercased())")
        FieldRow(label: "Measures", value: (instrument.device?.measures ?? []).map { KitMeasures.label($0) }.joined(separator: ", "))
        /* The device’s own note, at the instrument rather than in a manual. The person who needs to
           read “cuff size is a clinical decision the device cannot make” is the person holding the
           cuff, and she is holding it now. */
        if let note = instrument.device?.note {
            Label(note, systemImage: "info.circle").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
        if calibration.standing == .outOfDate {
            CaveatNote(caveats: [calibration.caveat ?? "", CaptureRules.calibrationNeverRefuses].filter { !$0.isEmpty })
        }
        HStack(spacing: ThusoSpacing.space8) {
            Button("Take a reading") { capturing = instrument.device }.buttonStyle(CareButton())
            Button("Unpair") { kit.unpair(instrument.id); notice = "\(instrument.name) is no longer paired. Readings already taken on it keep its name, serial and calibration date — unpairing an instrument does not un-take a reading." }
                .buttonStyle(QuietButton())
        }
    }

    @ViewBuilder private var whereItGoes: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: "Where a reading goes")
            Text("Into the visit assessment, with its origin, its instrument and the calibration it was taken under; then onto this phone’s store as captured; then sealed and queued when the nurse signs off. It is in the record only once a server has accepted it, and this build has no server.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            /* Both of these were eighteen points tall. They are the two doors off this screen, so
               they are pill rows now — the shape the rest of the product uses for a destination,
               and one that cannot be under 44 by construction. */
            NavigationLink { VisitAssessmentView(reference: visitReference, patient: patient) } label: {
                DeckDestination(title: "Open the visit assessment", symbol: "list.clipboard", raised: true)
            }.buttonStyle(.plain)
            NavigationLink { CaptureQueueView() } label: {
                DeckDestination(title: "Open what is waiting on this phone", symbol: "waveform.path.ecg")
            }.buttonStyle(.plain)
        }
    }
}

// MARK: - Taking a reading

/* The qualifier is asked before the reading is taken, not after it. That ordering is the whole
   point: a nurse who has just watched a number appear will accept whatever the form suggests about
   the cuff, and a cuff chosen retrospectively is a cuff nobody chose. */
struct KitReadingSheet: View {
    let device: KitDevice
    let visitReference: String
    let patient: String
    let subject: VettingSubject
    var onCapture: (CaptureReading) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var kit = CaptureStore.shared
    @State private var measureId = ""
    @State private var qualifier = ""
    @State private var taken: [CaptureReading] = []
    @State private var attempts = 0

    private var instrument: PairedInstrument? { kit.instruments.first { $0.deviceId == device.id } }
    private var measure: String { measureId.isEmpty ? (device.measures.first ?? "") : measureId }
    private var ready: Bool { instrument != nil && !qualifier.isEmpty }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Take a reading", title: device.name,
                               subtitle: "\(visitReference) · \(patient)")
                if let instrument {
                    SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                        HStack(spacing: ThusoSpacing.space8) {
                            CalibrationPill(calibration: instrument.calibration)
                            Spacer(minLength: ThusoSpacing.space8)
                            Text(instrument.serial).font(.footnote)
                                .foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                    }
                }
                /* The limitation, at the moment of the reading. Not a tooltip, not a settings page —
                   the person who needs it is holding the instrument. */
                SurfacePanel {
                    PanelHead("What this instrument cannot answer for itself")
                    Text(device.note).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if device.measures.count > 1 {
                    SurfacePanel {
                        ChoiceRow(label: "Which reading", selection: $measureId,
                                  options: device.measures.map { ($0, KitMeasures.label($0)) })
                    }
                }
                /* The qualifier leads, because it is what the sheet is refusing on. Palest sage
                   while it is unanswered — the one panel that has to be dealt with before the
                   button below it does anything — and plain once it has been. */
                SurfacePanel(tone: qualifier.isEmpty ? .lead : .plain) {
                    PanelHead(device.qualifier.label, note: device.qualifier.why)
                    ChoiceRow(label: device.qualifier.label, selection: $qualifier,
                              options: [("", "Not stated")] + device.qualifier.options.map { ($0, $0) })
                    if qualifier.isEmpty {
                        Text("Nothing is read until this is answered. It is not a field the form can guess for you, and a reading the record cannot say the \(device.qualifier.label.lowercased()) for is a reading nobody can correct for afterwards.")
                            .font(.footnote).foregroundStyle(ThusoTheme.mangoInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let instrument, instrument.calibration.standing == .outOfDate {
                    SurfacePanel {
                        CaveatNote(caveats: [instrument.calibration.caveat ?? ""])
                        Text(CaptureRules.calibrationNeverRefuses).font(.footnote)
                            .foregroundStyle(ThusoTheme.studioInkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    Button("Read from the instrument", action: take).buttonStyle(CareButton()).disabled(!ready)
                    Text("The number is invented on this phone from a fixed table. No instrument produced it, and the screen says so on every reading it makes.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !taken.isEmpty {
                    SurfacePanel {
                        PanelHead("Taken, and written to this phone",
                                  note: "Held on this phone as captured. It exists nowhere else yet, and it survives this app being killed.")
                        ForEach(taken) { reading in
                            ReadingRow(reading: reading)
                            if reading.id != taken.last?.id { Hairline() }
                        }
                    }
                    Button("Done") { dismiss() }.buttonStyle(QuietButton())
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Take a reading").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        .onAppear { if measureId.isEmpty { measureId = device.measures.first ?? "" } }
    }

    private func take() {
        guard let instrument else { return }
        attempts += 1
        let calibration = instrument.calibration
        var caveats: [String] = []
        if let caveat = calibration.caveat { caveats.append(caveat) }
        if let caveat = device.qualifier.caveated[qualifier] { caveats.append(caveat) }
        let reading = CaptureReading(id: kit.nextReadingId(), observationId: measure,
                                     label: KitMeasures.label(measure), unit: KitMeasures.unit(measure),
                                     value: KitFixtures.inventedReading(measure, attempts),
                                     provenance: .device,
                                     instrumentId: instrument.id, instrumentName: instrument.name,
                                     instrumentSerial: instrument.serial,
                                     calibratedOn: calibration.lastCalibrated,
                                     calibrationStanding: calibration.standing,
                                     qualifierLabel: device.qualifier.label, qualifier: qualifier,
                                     caveats: caveats)
        kit.capture(reading, visit: visitReference, patient: patient, by: subject)
        taken.append(reading)
        onCapture(reading)
    }
}
