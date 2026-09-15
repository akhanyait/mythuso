import SwiftUI

/* The assessment, and the clinical review that reads it.
 *
 * WHAT CHANGED WHEN THIS CAME OFF `Form`, AND WHY IT IS NOT A RESTYLE.
 *
 * Both screens here were system `Form`s: default grouped rows, iOS's own greys, iOS's own corner
 * radius and system chevrons — on the screen a nurse stands in somebody's kitchen holding, and the
 * screen a doctor signs from. Every other surface in this product had moved onto
 * DesignSystem/Surface.swift, so a nurse walking from her workspace into this form walked into a
 * different product. They are composed from the same panels, hairlines and chips as everything
 * else now, and what a person types into comes from DesignSystem/Controls.swift rather than from
 * whatever `Form` happened to draw around it.
 *
 * The gain is not tidiness, it is hierarchy. A `Form` gives every section the same weight, so the
 * seven readings, the instruments, the flag count and the sentence about clinical judgement were
 * five identical grey boxes. There is one lead panel per stage now, and on the observations stage
 * it is the count of what is filed, what is outside the range and what has no origin — the three
 * numbers that decide whether she may go on. Each is counted from the array printed underneath it.
 *
 * The one thing that must not change is what is refused. The origin gate, the vetting gate, the
 * visit-code gate and the separate authority to prescribe are the same arithmetic they were; the
 * layout only stopped burying them among rows of equal weight. */

/// Indicative adult reference ranges, used only to flag a value for the nurse's attention.
/// This is not a validated triage or early-warning score and it never decides anything.
struct Observation: Identifiable, Hashable {
    let id: String
    let label: String
    let unit: String
    let range: ClosedRange<Double>
    static let all: [Observation] = [
        .init(id: "systolic", label: "Blood pressure — systolic", unit: "mmHg", range: 90...140),
        .init(id: "diastolic", label: "Blood pressure — diastolic", unit: "mmHg", range: 60...90),
        .init(id: "pulse", label: "Pulse", unit: "bpm", range: 50...100),
        .init(id: "respiratory", label: "Respiratory rate", unit: "breaths/min", range: 12...20),
        .init(id: "temperature", label: "Temperature", unit: "°C", range: 36.1...37.5),
        .init(id: "oxygen", label: "Oxygen saturation", unit: "%", range: 95...100),
        .init(id: "glucose", label: "Blood glucose", unit: "mmol/L", range: 4...7.8)
    ]
}

/* Three nurses, so the gate on this form can be seen rather than described: one cleared, one whose
   Thuso Kit training is still outstanding, and one whose police clearance lapsed nine days ago. */
private let assessmentNurseIds = ["N-205", "N-202", "N-204"]

struct VisitAssessmentView: View {
    var reference = "TH-2048"
    var patient = "Lerato Molefe"
    var nurseId = "N-205"
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var kit = CaptureStore.shared
    /* Every finished piece of this visit, held on the phone. Until this existed the readings were
       written to a file and the code, the consent, the findings and the signature were not — the
       last thing that happens in a house was the least protected thing in the product. */
    @ObservedObject private var queue = VisitQueueStore.shared
    @ObservedObject private var vetting = VettingStore.shared
    @State private var stage = 0
    @State private var otp = ""
    @State private var otpError = ""
    @State private var identitySeen = false
    @State private var consentAssessment = false
    @State private var consentRecord = false
    @State private var values: [String: String] = [:]
    /* Kept beside the values rather than inside them, and deliberately not defaulted. A dictionary
       with no entry for an observation is the honest representation of “nobody has said where this
       came from”, and every screen below treats that as not-filed rather than as a guess. */
    @State private var origin: [String: Provenance] = [:]
    /// What a paired instrument produced, with its serial, its calibration and its qualifier.
    @State private var fromKit: [String: CaptureReading] = [:]
    @State private var symptoms: Set<String> = []
    @State private var notes = ""
    @State private var escalation = "No escalation — routine visit"
    @State private var signed = false
    /* Two counts, not one sum. The readings are sealed in the capture ledger and the observations
       part is sealed in the visit ledger, and adding them would count the same seven readings
       twice — a number on a screen that a nurse cannot reconcile with what she did. */
    @State private var sealedParts = 0
    @State private var sealedReadings = 0
    @State private var nurse = ""
    @State private var capturing: KitDevice?
    @State private var capturingFor = ""
    private let stages = ["Identity", "Consent", "Observations", "Findings", "Sign-off"]

    private var nurses: [VettingSubject] { assessmentNurseIds.compactMap { vetting.subject($0) } }
    private var subject: VettingSubject { nurses.first { $0.id == nurse } ?? nurses.first ?? VettingFixtures.subjects[0] }
    /* Capturing a reading is writing into somebody's record, so it asks the question writing asks.
       There is no separate "may use the kit" capability and there should not be: an instrument
       producing numbers nobody may file produces nothing. */
    private var mayWrite: VettingDecision { can(subject, "write-clinical-note") }

    private func flag(_ observation: Observation) -> String? {
        guard let raw = values[observation.id], !raw.isEmpty else { return nil }
        guard let value = Double(raw) else { return "Enter a number." }
        if value < observation.range.lowerBound { return "Below the indicative range" }
        if value > observation.range.upperBound { return "Above the indicative range" }
        return nil
    }
    private func typed(_ id: String) -> Bool { !(values[id] ?? "").isEmpty && Double(values[id] ?? "") != nil }
    /* The rule, in one line: a value nobody can say the origin of is not filed. Not filed with a
       warning, not filed as "unknown" — not filed. Everything downstream reads this list. */
    private var captured: [Observation] { Observation.all.filter { typed($0.id) && origin[$0.id] != nil } }
    private var statedNothing: [Observation] { Observation.all.filter { typed($0.id) && origin[$0.id] == nil } }
    private var abnormal: [Observation] { captured.filter { flag($0) != nil } }
    private var derived: DerivedReading? {
        guard origin["systolic"] != nil, origin["diastolic"] != nil else { return nil }
        return meanArterialPressure(systolic: values["systolic"] ?? "", diastolic: values["diastolic"] ?? "")
    }
    /// Weight and a single-lead trace: measured by the kit, and flagged against nothing, because
    /// there is no indicative range for either. Silence about a range is not an oversight here.
    private var unranged: [CaptureReading] { KitMeasures.unranged.compactMap { fromKit[$0.id] } }
    /* The signature carries the registration it was made under, taken from the same vetting record
       dispatch asks before it offers the visit, rather than a number typed into this screen. */
    private var nurseAttribution: String { "\(subject.name) · \(subject.reference) (demo)" }

    private func reading(_ observation: Observation) -> CaptureReading? {
        guard let provenance = origin[observation.id], typed(observation.id) else { return nil }
        if provenance == .device, var kitReading = fromKit[observation.id] {
            kitReading.value = values[observation.id] ?? kitReading.value
            return kitReading
        }
        /* A device reading somebody then re-typed is a manual reading of that instrument, not a
           device reading with a different number in it. The instrument stays attached — it is what
           she was reading off — and the origin says who read it. */
        let instrument = fromKit[observation.id]
        return CaptureReading(id: "\(reference)-\(observation.id)", observationId: observation.id,
                              label: observation.label, unit: observation.unit,
                              value: values[observation.id] ?? "", provenance: provenance,
                              instrumentId: instrument?.instrumentId, instrumentName: instrument?.instrumentName,
                              instrumentSerial: instrument?.instrumentSerial,
                              calibratedOn: instrument?.calibratedOn,
                              calibrationStanding: instrument?.calibrationStanding,
                              qualifierLabel: instrument?.qualifierLabel, qualifier: instrument?.qualifier,
                              caveats: instrument?.caveats ?? [])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                SurfaceHeading(eyebrow: "Visit assessment", title: stages[stage],
                               subtitle: "\(reference) · \(patient)")
                whoIsRecording
                VisitSafetyPanel(reference: reference)
                switch stage {
                case 0: identityStage
                case 1: consentStage
                case 2: observationStage
                case 3: findingsStage
                default: signOffStage
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        /* Above the work rather than inside it. "Has any of this left the phone" is a question a
           nurse asks between fields, and an answer she has to navigate to is an answer she stops
           asking for. */
        .thusoGround()
        .safeAreaInset(edge: .top) { CaptureStandingStrip() }
        .navigationTitle("Visit assessment").navigationBarTitleDisplayMode(.inline)
        .onAppear { if nurse.isEmpty { nurse = nurses.contains { $0.id == nurseId } ? nurseId : (nurses.first?.id ?? "") } }
        .sheet(item: $capturing) { device in
            NavigationStack {
                KitReadingSheet(device: device, visitReference: reference, patient: patient, subject: subject) { taken in
                    guard taken.observationId == capturingFor || capturingFor.isEmpty else { return }
                    fromKit[taken.observationId] = taken
                    origin[taken.observationId] = .device
                    if Observation.all.contains(where: { $0.id == taken.observationId }) {
                        values[taken.observationId] = taken.value
                    }
                }
            }
        }
    }

    /* Where she is and who she is, in one recessed panel above the work. Quiet rather than plain:
       it is context for every stage and it is the same on all five, so a white card would make it
       compete with whichever stage the nurse actually came for. */
    @ViewBuilder private var whoIsRecording: some View {
        SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
            StepDots(step: stage + 1, total: stages.count, label: stages[stage])
            Hairline()
            PickRow(label: "Recording as", selection: $nurse,
                    options: nurses.map { ($0.id, "\($0.name) · \($0.reference)") })
            HStack(spacing: ThusoSpacing.space8) {
                Text("Vetting").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Spacer(minLength: ThusoSpacing.space8)
                SubjectStatusPill(status: summarise(subject).status)
            }
            VettingRefusalNote(decision: mayWrite)
        }
    }

    @ViewBuilder private var identityStage: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Confirm you’re at the right door",
                      note: "Ask \(patient.split(separator: " ").first ?? "") for the six-digit code in the MyThuso app. In this preview the code is 482190.")
            CodeBoxes(code: $otp, invalid: !otpError.isEmpty, label: "Visit code")
            if !otpError.isEmpty {
                Text(otpError).font(.footnote).foregroundStyle(ThusoTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            AgreeRow(text: "I have seen the patient’s identity document, or a household member has confirmed identity.", on: $identitySeen)
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button("Confirm identity") { otp == "482190" ? holdIdentity() : (otpError = "That code doesn’t match this visit. Call the Control Tower before continuing.") }
                .buttonStyle(CareButton())
                .disabled(otp.count < 6 || !identitySeen)
            Text("If the code fails, the visit does not start. The nurse contacts the Control Tower instead of proceeding.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var consentStage: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Consent, in plain words")
            AgreeRow(text: "“May I check your blood pressure, pulse, temperature and other basic readings today?”", on: $consentAssessment)
            Hairline()
            AgreeRow(text: "“May I add today’s readings to your Health Passport, where a doctor can review them?”", on: $consentRecord)
            Text("Refusal is recorded as a valid outcome, not a failed visit. A guardian consents for a child or where authority is verified.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        stageButtons(forward: "Start observations", action: holdConsent, back: 0, enabled: consentAssessment)
    }

    @ViewBuilder private var observationStage: some View {
        if !mayWrite.allowed {
            SurfacePanel {
                RefusalCard(title: "This form will not take a reading from this nurse", decision: mayWrite)
                Text("Refused at the top of the form rather than at the signature. A nurse who has taken seven readings before being told is a nurse the platform has wasted, in somebody’s home, with the cuff already on their arm.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button("Back") { stage = 1 }.buttonStyle(QuietButton())
        } else {
            standingOfTheReadings
            SurfacePanel {
                PanelHead("Today’s readings")
                ForEach(Observation.all) { observation in
                    observationRow(observation)
                    if observation.id != Observation.all.last?.id { Hairline() }
                }
            }
            if let derived {
                SurfacePanel(tone: .quiet) {
                    PanelHead("Calculated")
                    HStack(alignment: .firstTextBaseline) {
                        Text(derived.label).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: ThusoSpacing.space8)
                        Text("\(derived.value) \(derived.unit)")
                            .font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(ThusoTheme.charcoal)
                    }
                    ProvenanceMark(provenance: .derived, full: true)
                    Text(derived.workings).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("It appears because both its inputs are here and it disappears when either is taken away. There is nothing to save, so there is nothing to fall out of step with the numbers it was worked out from.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if !unranged.isEmpty {
                SurfacePanel {
                    PanelHead("From the kit, with no indicative range")
                    ForEach(unranged) { ReadingRow(reading: $0) }
                    Text("A weight means something against this person’s own previous weights and nothing against a population’s, and a single-lead trace is not a number at all. Neither is flagged, because there is nothing honest to flag them against.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            SurfacePanel {
                PanelHead("Instruments")
                if kit.instruments.isEmpty {
                    Text("Nothing is paired to this phone, so every reading here will be one you took and typed — and it will say so. That is a complete answer, not a lesser one.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(kit.instruments) { instrument in
                    HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                        Text(instrument.name).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: ThusoSpacing.space8)
                        CalibrationPill(calibration: instrument.calibration)
                    }
                }
                NavigationLink { ThusoKitView(operatorId: subject.id, visitReference: reference, patient: patient) } label: {
                    NavPillLabel(title: "Pair an instrument", symbol: "sensor.tag.radiowaves.forward")
                }
                .buttonStyle(.plain)
            }
            if !statedNothing.isEmpty {
                SurfacePanel {
                    PanelHead("\(statedNothing.count) reading\(statedNothing.count == 1 ? " has" : "s have") a number and no origin",
                              note: CaptureRules.provenanceIsRequired)
                    /* One deliberate act covering many rows, rather than a default covering them
                       silently. She is still saying it — she is only saying it once. */
                    Button("Everything I typed, I read off my own instrument") {
                        for observation in statedNothing { origin[observation.id] = .manual }
                    }
                    .buttonStyle(QuietButton())
                }
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                Text(abnormal.isEmpty
                     ? "Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you."
                     : "\(abnormal.count) reading\(abnormal.count > 1 ? "s are" : " is") outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Record findings", action: recordFindings).buttonStyle(CareButton()).disabled(captured.isEmpty)
                Button("Back") { stage = 1 }.buttonStyle(QuietButton())
            }
        }
    }

    /* The lead panel of the stage a nurse spends the visit in, and every figure on it is counted
       from an array printed further down this same screen: `captured`, `abnormal`, `statedNothing`.
       A strip that said "24 readings" over seven rows would teach her not to believe the number,
       which is worse than having no strip — so there is no fourth figure here that nothing counts.

       At most one is flagged. Origin-not-stated takes the mark when there is one, because it is the
       only one of the three that stops her going on; an out-of-range reading is a prompt for her
       judgement and never a blockage. */
    @ViewBuilder private var standingOfTheReadings: some View {
        SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            ThusoMetrics {
                ThusoMetric(value: "\(captured.count)", unit: "of \(Observation.all.count)", label: "Readings with an origin, ready to file",
                            chip: captured.isEmpty ? "None yet" : "Filed")
                ThusoMetric(value: "\(abnormal.count)", label: "Outside the indicative range",
                            chip: abnormal.isEmpty ? "None" : "For your judgement")
                ThusoMetric(value: "\(statedNothing.count)", label: "Typed with no origin, so not filed",
                            chip: statedNothing.isEmpty ? "None" : "Owed an origin", flagged: !statedNothing.isEmpty)
            }
        }
    }

    /* One row, and the origin is asked for on it rather than assumed from how the number arrived.
       “Measured by a device” is not in the picker at all — it is only ever set by actually taking a
       reading off a paired instrument, because a nurse choosing it from a menu would be putting a
       serial number and a calibration date into the record that nothing produced. */
    @ViewBuilder private func observationRow(_ observation: Observation) -> some View {
        let provenance = origin[observation.id]
        let instruments = kit.paired(measuring: observation.id)
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    Text(observation.label).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    Spacer(minLength: ThusoSpacing.space8)
                    valueField(observation).frame(width: 96)
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    Text(observation.label).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    valueField(observation)
                }
            }
            Text(flag(observation) ?? "Indicative range \(observation.range.lowerBound.formatted())–\(observation.range.upperBound.formatted()) \(observation.unit)")
                .font(.footnote)
                .foregroundStyle(flag(observation) == nil ? ThusoTheme.studioInkMuted : ThusoTheme.mangoInk)
                .fixedSize(horizontal: false, vertical: true)
            /* The origin, the way to state it and the way to take it, on one line while they fit
               and stacked when they do not. They were an HStack with a Spacer in it, which at the
               accessibility sizes put "Say where this came from" and "Take a reading" into about
               forty points each. */
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space8) { originControls(observation, provenance, instruments) }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { originControls(observation, provenance, instruments) }
            }
            if let kitReading = fromKit[observation.id] {
                if let line = kitReading.instrumentLine {
                    Text(provenance == .device ? line : "\(line) — read by hand, so this is a clinician’s reading of that instrument")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let label = kitReading.qualifierLabel, let qualifier = kitReading.qualifier {
                    Text("\(label): \(qualifier)").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                CaveatNote(caveats: kitReading.caveats)
            }
            if provenance == .patientReported {
                Text("In the record as what they said, not as something you observed.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 3)
    }

    @ViewBuilder private func valueField(_ observation: Observation) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        TextField(observation.unit, text: Binding(
            get: { values[observation.id] ?? "" },
            set: { newValue in
                if newValue != (values[observation.id] ?? ""), origin[observation.id] == .device {
                    origin[observation.id] = .manual
                }
                values[observation.id] = newValue
            }))
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            /* Monospaced digits so a column of seven readings lines up rather than shuffling as the
               numbers are typed — the same reason ThusoMetric uses them. */
            .font(.body.monospacedDigit()).foregroundStyle(ThusoTheme.charcoal)
            .padding(.horizontal, ThusoSpacing.space12)
            .frame(minHeight: 44)
            .background(ThusoTheme.surface, in: shape)
            .overlay(shape.stroke(flag(observation) == nil ? ThusoTheme.controlEdge : ThusoTheme.mangoInk, lineWidth: 1))
            .accessibilityLabel("\(observation.label), \(observation.unit)")
    }

    @ViewBuilder private func originControls(_ observation: Observation, _ provenance: Provenance?,
                                             _ instruments: [PairedInstrument]) -> some View {
        if let provenance {
            ProvenanceMark(provenance: provenance)
        } else if typed(observation.id) {
            MetricChip(text: "Origin not stated — not filed", tone: .attention)
        }
        Menu {
            Button("Entered by a clinician — I read it and typed it") { origin[observation.id] = .manual }
            Button("Reported by the patient — they told me") { origin[observation.id] = .patientReported }
            if provenance != nil { Button("Clear the origin", role: .destructive) { origin[observation.id] = nil } }
        } label: {
            Text(provenance == nil ? "Say where this came from" : "Change")
                .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        if let device = instruments.first?.device {
            Button("Take a reading") { capturingFor = observation.id; capturing = device }
                .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .frame(minHeight: 44)
        }
    }

    /* The readings go to both ledgers: individually to the capture ledger, which is where a single
         reading's provenance, instrument and conflicts live, and as one observations part to the
         visit ledger, which is what makes them a piece of this visit rather than seven loose
         numbers. Neither is a copy of the other, and the duplicate check on arrival is asked of the
         capture ledger so the two cannot disagree about what the record already holds. */
    private func recordFindings() {
        var readings: [CaptureReading] = []
        for observation in captured {
            if let value = reading(observation) {
                kit.capture(value, visit: reference, patient: patient, by: subject)
                readings.append(value)
            }
        }
        queue.hold(kind: .observations, visit: reference, patient: patient,
                   summary: "\(readings.count) reading\(readings.count == 1 ? "" : "s") taken at this visit",
                   detail: readings.map { VisitPartFact(label: $0.label, value: $0.display) },
                   readings: readings, by: subject)
        stage = 3
    }

    /* The five moments a piece of a visit is finished, and each one writes it to the phone before
       the screen moves on. Not on every keystroke: what is being recorded is a finished act, and
       "captured" means exactly that — it exists on this phone and it exists nowhere else yet. */
    private func holdIdentity() {
        queue.hold(kind: .identity, visit: reference, patient: patient,
                   summary: "Visit code confirmed at the door, and identity seen",
                   detail: [VisitPartFact(label: "Visit code", value: "Six digits, matched"),
                            VisitPartFact(label: "Identity", value: "Document seen by the nurse")],
                   by: subject)
        /* appointment.in_progress, as the preview has it: the code matched, so the visit has started and
           so has its timer, timed by the visit's own service rather than a number typed here. */
        let serviceId = WorkspaceDay.nurseVisits.first(where: { visit in visit.id == reference })?.serviceId ?? WorkspaceDay.nurseVisits[0].serviceId
        FieldSafetyStore.shared.startVisit(reference, serviceId: serviceId, codeMatched: true)
        stage = 1
    }
    private func holdConsent() {
        queue.hold(kind: .consent, visit: reference, patient: patient,
                   summary: consentRecord ? "Consented to the readings and to them being added to the record"
                                          : "Consented to the readings only",
                   detail: [VisitPartFact(label: "Today\u{2019}s readings", value: consentAssessment ? "Agreed" : "Refused"),
                            VisitPartFact(label: "Adding them to the Health Passport", value: consentRecord ? "Agreed" : "Refused")],
                   by: subject)
        stage = 2
    }
    private func holdFindings() {
        queue.hold(kind: .findings, visit: reference, patient: patient,
                   summary: notes.isEmpty ? "Symptoms and the next step, with no note written" : "What the nurse found, in her own words",
                   detail: [VisitPartFact(label: "Symptoms reported", value: symptoms.isEmpty ? "None recorded" : symptoms.sorted().joined(separator: ", ")),
                            VisitPartFact(label: "Next step", value: escalation)]
                       + (notes.isEmpty ? [] : [VisitPartFact(label: "Visit notes", value: notes)]),
                   by: subject)
        stage = 4
    }
    /* Signing seals both queues at once, because a nurse has one queue however many files it is
       kept in. The count she is shown afterwards is the whole of her work, not one screen's share. */
    private func signOff() {
        queue.hold(kind: .signOff, visit: reference, patient: patient,
                   summary: "Signed on this phone, and not yet filed",
                   detail: [VisitPartFact(label: "Signed by", value: nurseAttribution),
                            VisitPartFact(label: "Readings filed", value: "\(captured.count) of \(Observation.all.count)")],
                   by: subject)
        sealedReadings = kit.seal(visit: reference)
        sealedParts = queue.seal(visit: reference)
        /* appointment.completed, as the preview has it: signed, so nobody is left in the house to time. */
        FieldSafetyStore.shared.visitSigned(reference)
        signed = true
    }

    private let reportableSymptoms = ["Headache", "Dizziness", "Shortness of breath", "Chest pain",
                                      "Swelling", "Fatigue", "Nausea", "None reported"]

    @ViewBuilder private var findingsStage: some View {
        SurfacePanel {
            PanelHead("Reported symptoms",
                      note: "Symptoms are what the patient reported. They are not observations and they never carry an instrument, which is why they sit in their own section rather than among the readings.")
            ForEach(reportableSymptoms, id: \.self) { symptom in
                TickRow(title: symptom, ticked: symptoms.contains(symptom)) {
                    if symptoms.contains(symptom) { symptoms.remove(symptom) } else { symptoms.insert(symptom) }
                }
            }
        }
        SurfacePanel {
            WriteNote(label: "Visit notes", text: $notes,
                      prompt: "Write what the next clinician needs, not everything you noticed.")
        }
        SurfacePanel(tone: escalation.contains("Emergency") ? .lead : .plain) {
            PickRow(label: "Next step", selection: $escalation,
                    options: ["No escalation — routine visit", "Refer for doctor review within 24 hours",
                              "Refer for doctor review today", "Advise clinic or emergency department now",
                              "Emergency services called from the home"].map { ($0, $0) })
            if escalation.contains("Emergency") {
                Text("In production this opens the emergency pathway immediately and alerts the Control Tower before the form is finished.")
                    .font(.footnote).foregroundStyle(ThusoTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        stageButtons(forward: "Review sign-off", action: holdFindings, back: 2)
    }

    @ViewBuilder private var signOffStage: some View {
        if signed {
            SurfacePanel(tone: .lead) {
                PanelHead("Demo assessment closed")
                /* This used to say nothing had been written. It is no longer true and it must not
                   be left standing: readings are now written to a file on this phone, and a screen
                   that reassures a nurse about the wrong thing is worse than one that says nothing. */
                ThusoMetrics {
                    ThusoMetric(value: "\(sealedParts)", label: "Pieces of this visit sealed on this phone", chip: "Not sent")
                    ThusoMetric(value: "\(sealedReadings)", label: "Readings sealed on this phone", chip: "Not sent")
                }
                Text("The code checked at the door, the consent, what you found and your signature are sealed and waiting to send from this phone. Nothing was transmitted, no server was contacted and no clinician was notified, and all of it survives the app being killed.")
                    .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Text("In production this becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration, once a server has accepted it.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                NavigationLink { VisitQueueView() } label: {
                    NavPillLabel(title: "See the whole visit waiting on this phone", symbol: "tray.full")
                }.buttonStyle(.plain)
                NavigationLink { CaptureQueueView() } label: {
                    NavPillLabel(title: "See the readings waiting on this phone", symbol: "waveform.path.ecg")
                }.buttonStyle(.plain)
                Button("Back to the workspace") { dismiss() }.buttonStyle(CareButton())
            }
        } else {
            SurfacePanel {
                PanelHead("\(patient) · \(reference)")
                ForEach(captured) { observation in
                    if let value = reading(observation) { ReadingRow(reading: value) }
                }
                if let derived {
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(derived.label).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                            Spacer(minLength: ThusoSpacing.space8)
                            Text("\(derived.value) \(derived.unit)")
                                .font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(ThusoTheme.charcoal)
                        }
                        ProvenanceMark(provenance: .derived)
                        Text(derived.workings).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                ForEach(unranged) { ReadingRow(reading: $0) }
                Hairline()
                FactRow(label: "Symptoms", value: symptoms.isEmpty ? "None recorded" : symptoms.sorted().joined(separator: ", "))
                FactRow(label: "Next step", value: escalation)
                FactRow(label: "Recorded by", value: nurseAttribution)
            }
            if !statedNothing.isEmpty {
                SurfacePanel(tone: .quiet) {
                    Text("\(statedNothing.map { $0.label.lowercased() }.joined(separator: ", ")) \(statedNothing.count == 1 ? "has" : "have") a number and no origin, so \(statedNothing.count == 1 ? "it is" : "they are") not in the list above and will not be filed. Go back and say where \(statedNothing.count == 1 ? "it" : "they") came from, or leave the field empty.")
                        .font(.footnote).foregroundStyle(ThusoTheme.mangoInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            ProvenanceKey()
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                Text("A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                VettingRefusalNote(decision: mayWrite)
                Button("Sign demo assessment", action: signOff).buttonStyle(CareButton())
                    .disabled(!mayWrite.allowed)
                Button("Back") { stage = 3 }.buttonStyle(QuietButton())
            }
        }
    }

    /// Forward and back, at full width, in the same place on every stage a nurse steps through.
    @ViewBuilder private func stageButtons(forward: String, action: @escaping () -> Void,
                                           back: Int, enabled: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button(forward, action: action).buttonStyle(CareButton()).disabled(!enabled)
            Button("Back") { stage = back }.buttonStyle(QuietButton())
        }
    }
}

struct DoctorReviewView: View {
    var reference = "TH-2048"
    @State private var decision = ""
    @State private var rationale = ""
    @State private var done = false
    @State private var signingDoctor = "D-401"
    @State private var refused = ""
    @ObservedObject private var vetting = VettingStore.shared
    @ObservedObject private var kit = CaptureStore.shared
    /* A case cannot be signed by a doctor whose HPCSA registration is not current, and prescribing
       is a separate answer again — so the queue asks twice, and refuses rather than warns. */
    private var doctor: VettingSubject? { vetting.subject(signingDoctor) }
    private var signDecision: VettingDecision {
        /* Who may sign is the review-confirmer setting, asked through Clinical (Wave 5). */
        doctor.map { Clinical.confirmDecision($0) }
            ?? VettingDecision(allowed: false, reason: "No vetted doctor is signed in, so nothing here can be signed.", blockedBy: [])
    }
    private var prescribeDecision: VettingDecision {
        doctor.map { can($0, "prescribe") }
            ?? VettingDecision(allowed: false, reason: "No vetted doctor is signed in.", blockedBy: [])
    }
    private var needsPrescribing: Bool { decision.contains("prescription") }
    private var blocked: VettingDecision? {
        if !signDecision.allowed { return signDecision }
        if needsPrescribing && !prescribeDecision.allowed { return prescribeDecision }
        return nil
    }
    /// What the nurse actually submitted, read out of this phone's own store, so the doctor sees
    /// the origins she recorded rather than a tidied list of numbers.
    private var submitted: [CapturedEntry] {
        kit.forVisit(reference).filter { !$0.superseded }.sorted { $0.writtenToPhoneAt < $1.writtenToPhoneAt }
    }
    /* Counted rather than claimed. The line above this list used to say two readings were flagged,
       which was a sentence about a fixture and not about the rows underneath it — so on a phone
       where the nurse had filed one reading, or none, the doctor was told two. */
    private var flagged: [CapturedEntry] {
        submitted.filter { entry in
            guard let range = Passport.spec(entry.reading.observationId),
                  let value = Double(entry.reading.value) else { return false }
            return !range.range.contains(value)
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Clinical review", title: "\(reference) · Lerato Molefe",
                               subtitle: "Submitted by Sister Naledi Mokoena, 4 September 11:24.")
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    ThusoMetrics {
                        ThusoMetric(value: "\(submitted.count)", label: "Readings on this phone for this visit",
                                    chip: submitted.isEmpty ? "Nothing yet" : "Submitted")
                        ThusoMetric(value: "\(flagged.count)", label: "Outside the indicative range",
                                    chip: flagged.isEmpty ? "None" : "Flagged by the nurse", flagged: !flagged.isEmpty)
                    }
                }
                SurfacePanel {
                    ClinicalChart(title: "Blood pressure — systolic", unit: "mmHg",
                                  readings: [.init(label: "12 Aug", value: 128), .init(label: "19 Aug", value: 134), .init(label: "28 Aug", value: 141, note: "Missed medication"), .init(label: "4 Sep", value: 146, note: "Nurse flagged")],
                                  normal: 90...140)
                }
                nurseSubmission
                signingDoctorPanel
                yourDecision
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    Text("Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(done ? "Demo decision held in this screen only" : "Sign demo decision", action: sign)
                        .buttonStyle(CareButton())
                        .disabled(done || decision.isEmpty || rationale.trimmingCharacters(in: .whitespaces).count < 10)
                    if !refused.isEmpty {
                        Text(refused).font(.footnote).foregroundStyle(ThusoTheme.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Clinical review").navigationBarTitleDisplayMode(.inline)
    }

    /* A doctor reading a nurse's submission is the exact moment the origin matters most: he is
       deciding what to do about a number he did not take, and “who took this, on what, calibrated
       when” is the difference between acting on it and repeating it. */
    @ViewBuilder private var nurseSubmission: some View {
        SurfacePanel {
            PanelHead("Nurse’s submission")
            if submitted.isEmpty {
                Text("Nothing for this visit is on this phone.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(submitted) { entry in
                    VStack(alignment: .leading, spacing: 5) {
                        ReadingRow(reading: entry.reading)
                        HStack(spacing: ThusoSpacing.space8) {
                            CaptureStatePill(state: entry.state)
                            Text(entry.capturedByName).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                            Spacer(minLength: 0)
                        }
                        WrittenAgoNote(at: entry.writtenToPhoneAt)
                    }
                    .padding(.vertical, 2)
                    if entry.id != submitted.last?.id { Hairline() }
                }
                NavigationLink { CaptureQueueView() } label: {
                    NavPillLabel(title: "Open the capture queue", symbol: "tray.full")
                }.buttonStyle(.plain)
            }
            Hairline()
            FactRow(label: "Reported symptoms", value: "Headache, fatigue")
            FactRow(label: "Next step", value: "Refer for doctor review within 24 hours")
        }
    }

    @ViewBuilder private var signingDoctorPanel: some View {
        SurfacePanel(tone: .quiet) {
            PanelHead("Signing doctor")
            PickRow(label: "Doctor", selection: $signingDoctor,
                    options: vetting.subjects(role: "doctor").map { ($0.id, $0.name) })
            if let doctor {
                FactRow(label: "Registration", value: doctor.reference)
                HStack(spacing: ThusoSpacing.space8) {
                    Text("Vetting").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    Spacer(minLength: ThusoSpacing.space8)
                    SubjectStatusPill(status: summarise(doctor).status)
                }
                NavigationLink { VettingStatusView(subjectId: doctor.id) } label: {
                    NavPillLabel(title: "Open this doctor’s vetting", symbol: "checkmark.shield")
                }.buttonStyle(.plain)
            }
            VettingRefusalNote(decision: signDecision)
        }
    }

    @ViewBuilder private var yourDecision: some View {
        SurfacePanel {
            PanelHead("Your decision")
            PickRow(label: "Outcome", selection: $decision,
                    options: [("", "Choose an outcome…")]
                        + ["Continue current management, review in one month", "Adjust medication and issue a prescription",
                           "Request laboratory tests", "Book a teleconsultation with the patient",
                           "Refer to a facility"].map { ($0, $0) })
            /* Prescribing is asked separately from signing, because it rests on a separate
               authority — the outcome that needs one says so before the signature is attempted. */
            if needsPrescribing { VettingRefusalNote(decision: prescribeDecision) }
            WriteNote(label: "Clinical rationale", text: $rationale,
                      prompt: "Why this decision, for the record and the next clinician.")
        }
    }

    private func sign() {
        guard let blocked else { refused = ""; done = true; return }
        refused = "Signature refused. \(blocked.reason ?? "") The case stays in the queue for a doctor who may sign it."
    }
}
