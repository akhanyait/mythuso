import SwiftUI

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
    @State private var sealedCount = 0
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
        Form {
            Section {
                StepDots(step: stage + 1, total: stages.count, label: stages[stage])
                LabeledContent("Visit", value: "\(reference) · \(patient)")
                Picker("Recording as", selection: $nurse) {
                    ForEach(nurses) { Text("\($0.name) · \($0.reference)").tag($0.id) }
                }
                HStack { Text("Vetting"); Spacer(); SubjectStatusPill(status: summarise(subject).status) }
                VettingRefusalNote(decision: mayWrite)
            }
            switch stage {
            case 0: identityStage
            case 1: consentStage
            case 2: observationStage
            case 3: findingsStage
            default: signOffStage
            }
        }
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

    @ViewBuilder private var identityStage: some View {
        Section("Confirm you’re at the right door") {
            Text("Ask \(patient.split(separator: " ").first ?? "") for the six-digit code in the MyThuso app. In this preview the code is 482190.").font(.caption).foregroundStyle(.secondary)
            CodeBoxes(code: $otp, invalid: !otpError.isEmpty, label: "Visit code").listRowInsets(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
            if !otpError.isEmpty { Text(otpError).font(.caption).foregroundStyle(.red) }
            Toggle("I have seen the patient’s identity document, or a household member has confirmed identity.", isOn: $identitySeen)
        }
        Section {
            Button("Confirm identity") { otp == "482190" ? (stage = 1) : (otpError = "That code doesn’t match this visit. Call the Control Tower before continuing.") }
                .disabled(otp.count < 6 || !identitySeen)
            Text("If the code fails, the visit does not start. The nurse contacts the Control Tower instead of proceeding.").font(.caption).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private var consentStage: some View {
        Section("Consent, in plain words") {
            Toggle("“May I check your blood pressure, pulse, temperature and other basic readings today?”", isOn: $consentAssessment)
            Toggle("“May I add today’s readings to your Health Passport, where a doctor can review them?”", isOn: $consentRecord)
            Text("Refusal is recorded as a valid outcome, not a failed visit. A guardian consents for a child or where authority is verified.").font(.caption).foregroundStyle(.secondary)
        }
        Section { Button("Start observations") { stage = 2 }.disabled(!consentAssessment); Button("Back") { stage = 0 } }
    }

    @ViewBuilder private var observationStage: some View {
        if !mayWrite.allowed {
            Section {
                Label("This form will not take a reading from this nurse", systemImage: "hand.raised").font(.subheadline).foregroundStyle(ThusoTheme.danger)
                Text(mayWrite.reason ?? "").font(.caption).foregroundStyle(.secondary)
                Text("Refused at the top of the form rather than at the signature. A nurse who has taken seven readings before being told is a nurse the platform has wasted, in somebody’s home, with the cuff already on their arm.").font(.caption).foregroundStyle(.secondary)
                Button("Back") { stage = 1 }
            }
        } else {
            Section("Today’s readings") {
                ForEach(Observation.all) { observation in observationRow(observation) }
            }
            if let derived {
                Section("Calculated") {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(derived.label).font(.subheadline)
                            Spacer()
                            Text("\(derived.value) \(derived.unit)").font(.system(.subheadline, design: .rounded, weight: .semibold))
                        }
                        ProvenanceMark(provenance: .derived, full: true)
                        Text(derived.workings).font(.caption2).foregroundStyle(.secondary)
                    }
                    Text("It appears because both its inputs are here and it disappears when either is taken away. There is nothing to save, so there is nothing to fall out of step with the numbers it was worked out from.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !unranged.isEmpty {
                Section("From the kit, with no indicative range") {
                    ForEach(unranged) { ReadingRow(reading: $0) }
                    Text("A weight means something against this person’s own previous weights and nothing against a population’s, and a single-lead trace is not a number at all. Neither is flagged, because there is nothing honest to flag them against.").font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("Instruments") {
                if kit.instruments.isEmpty {
                    Text("Nothing is paired to this phone, so every reading here will be one you took and typed — and it will say so. That is a complete answer, not a lesser one.").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(kit.instruments) { instrument in
                    HStack(spacing: 8) {
                        Text(instrument.name).font(.caption)
                        Spacer(minLength: 6)
                        CalibrationPill(calibration: instrument.calibration)
                    }
                }
                NavigationLink("Pair an instrument") { ThusoKitView(operatorId: subject.id, visitReference: reference, patient: patient) }
            }
            Section {
                if !statedNothing.isEmpty {
                    Text("\(statedNothing.count) reading\(statedNothing.count == 1 ? " has" : "s have") a number and no origin. \(CaptureRules.provenanceIsRequired)")
                        .font(.caption).foregroundStyle(ThusoTheme.mangoInk)
                    /* One deliberate act covering many rows, rather than a default covering them
                       silently. She is still saying it — she is only saying it once. */
                    Button("Everything I typed, I read off my own instrument") {
                        for observation in statedNothing { origin[observation.id] = .manual }
                    }
                }
                Text(abnormal.isEmpty
                     ? "Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you."
                     : "\(abnormal.count) reading\(abnormal.count > 1 ? "s are" : " is") outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Record findings", action: recordFindings).disabled(captured.isEmpty)
                Button("Back") { stage = 1 }
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
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(observation.label).font(.subheadline)
                Spacer()
                TextField(observation.unit, text: Binding(
                    get: { values[observation.id] ?? "" },
                    set: { newValue in
                        if newValue != (values[observation.id] ?? ""), origin[observation.id] == .device {
                            origin[observation.id] = .manual
                        }
                        values[observation.id] = newValue
                    }))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 92)
            }
            Text(flag(observation) ?? "Indicative range \(observation.range.lowerBound.formatted())–\(observation.range.upperBound.formatted()) \(observation.unit)")
                .font(.caption2).foregroundStyle(flag(observation) == nil ? .secondary : Color(red: 0.61, green: 0.38, blue: 0.19))
            HStack(spacing: 8) {
                if let provenance {
                    ProvenanceMark(provenance: provenance)
                } else if typed(observation.id) {
                    StatusPill(text: "Origin not stated — not filed", tone: "amber")
                }
                Spacer(minLength: 4)
                Menu {
                    Button("Entered by a clinician — I read it and typed it") { origin[observation.id] = .manual }
                    Button("Reported by the patient — they told me") { origin[observation.id] = .patientReported }
                    if provenance != nil { Button("Clear the origin", role: .destructive) { origin[observation.id] = nil } }
                } label: {
                    Text(provenance == nil ? "Say where this came from" : "Change").font(.caption.weight(.semibold))
                }
                if let device = instruments.first?.device {
                    Button("Take a reading") { capturingFor = observation.id; capturing = device }
                        .font(.caption.weight(.semibold))
                }
            }
            if let kitReading = fromKit[observation.id] {
                if let line = kitReading.instrumentLine {
                    Text(provenance == .device ? line : "\(line) — read by hand, so this is a clinician’s reading of that instrument")
                        .font(.caption2).foregroundStyle(ThusoTheme.faint)
                }
                if let label = kitReading.qualifierLabel, let qualifier = kitReading.qualifier {
                    Text("\(label): \(qualifier)").font(.caption2).foregroundStyle(ThusoTheme.faint)
                }
                CaveatNote(caveats: kitReading.caveats)
            }
            if provenance == .patientReported {
                Text("In the record as what they said, not as something you observed.").font(.caption2).foregroundStyle(ThusoTheme.faint)
            }
        }
        .padding(.vertical, 3)
    }

    /* Written to the phone at the end of the observations, not on every keystroke. What is being
       recorded is a finished act — she has taken the readings and moved on — and “captured” means
       exactly that: it exists on this phone and it exists nowhere else yet. */
    private func recordFindings() {
        for observation in captured {
            if let value = reading(observation) { kit.capture(value, visit: reference, patient: patient, by: subject) }
        }
        stage = 3
    }

    @ViewBuilder private var findingsStage: some View {
        Section("Reported symptoms") {
            ForEach(["Headache", "Dizziness", "Shortness of breath", "Chest pain", "Swelling", "Fatigue", "Nausea", "None reported"], id: \.self) { symptom in
                Button { if symptoms.contains(symptom) { symptoms.remove(symptom) } else { symptoms.insert(symptom) } } label: {
                    HStack {
                        Text(symptom).foregroundStyle(ThusoTheme.ink)
                        Spacer()
                        if symptoms.contains(symptom) { Image(systemName: "checkmark").foregroundStyle(ThusoTheme.indigo) }
                    }
                }
                .accessibilityAddTraits(symptoms.contains(symptom) ? [.isSelected] : [])
            }
            Text("Symptoms are what the patient reported. They are not observations and they never carry an instrument, which is why they sit in their own section rather than among the readings.").font(.caption).foregroundStyle(.secondary)
        }
        Section("Visit notes") {
            TextEditor(text: $notes).frame(minHeight: 96)
            Text("Write what the next clinician needs, not everything you noticed.").font(.caption).foregroundStyle(.secondary)
        }
        Section("Next step") {
            Picker("Next step", selection: $escalation) {
                ForEach(["No escalation — routine visit", "Refer for doctor review within 24 hours", "Refer for doctor review today", "Advise clinic or emergency department now", "Emergency services called from the home"], id: \.self) { Text($0) }
            }.labelsHidden().pickerStyle(.inline)
            if escalation.contains("Emergency") {
                Text("In production this opens the emergency pathway immediately and alerts the Control Tower before the form is finished.").font(.caption).foregroundStyle(.red)
            }
        }
        Section { Button("Review sign-off") { stage = 4 }; Button("Back") { stage = 2 } }
    }

    @ViewBuilder private var signOffStage: some View {
        if signed {
            Section {
                Label("Demo assessment closed", systemImage: "checkmark.seal.fill").foregroundStyle(ThusoTheme.indigo)
                /* This used to say nothing had been written. It is no longer true and it must not
                   be left standing: readings are now written to a file on this phone, and a screen
                   that reassures a nurse about the wrong thing is worse than one that says nothing. */
                Text("\(sealedCount) reading\(sealedCount == 1 ? " was" : "s were") sealed and are waiting to send from this phone. Nothing was transmitted, no server was contacted and no clinician was notified — but the readings are on this device, in a file, and they survive the app being killed.").font(.subheadline).foregroundStyle(.secondary)
                Text("In production this becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration, once a server has accepted it.").font(.caption).foregroundStyle(.secondary)
                NavigationLink("See what is waiting on this phone") { CaptureQueueView() }
                Button("Back to the workspace") { dismiss() }
            }
        } else {
            Section("\(patient) · \(reference)") {
                ForEach(captured) { observation in
                    if let value = reading(observation) { ReadingRow(reading: value) }
                }
                if let derived {
                    VStack(alignment: .leading, spacing: 5) {
                        HStack { Text(derived.label).font(.caption).foregroundStyle(.secondary); Spacer(); Text("\(derived.value) \(derived.unit)").font(.system(.subheadline, design: .rounded, weight: .semibold)) }
                        ProvenanceMark(provenance: .derived)
                        Text(derived.workings).font(.caption2).foregroundStyle(ThusoTheme.faint)
                    }
                }
                ForEach(unranged) { ReadingRow(reading: $0) }
                LabeledContent("Symptoms", value: symptoms.isEmpty ? "None recorded" : symptoms.sorted().joined(separator: ", "))
                LabeledContent("Next step", value: escalation)
                LabeledContent("Recorded by", value: nurseAttribution)
            }
            if !statedNothing.isEmpty {
                Section {
                    Text("\(statedNothing.map { $0.label.lowercased() }.joined(separator: ", ")) \(statedNothing.count == 1 ? "has" : "have") a number and no origin, so \(statedNothing.count == 1 ? "it is" : "they are") not in the list above and will not be filed. Go back and say where \(statedNothing.count == 1 ? "it" : "they") came from, or leave the field empty.")
                        .font(.caption).foregroundStyle(ThusoTheme.mangoInk)
                }
            }
            Section {
                ProvenanceKey().listRowInsets(EdgeInsets())
            }
            Section {
                Text("A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.").font(.caption).foregroundStyle(.secondary)
                Button("Sign demo assessment") { sealedCount = kit.seal(visit: reference); signed = true }
                    .disabled(!mayWrite.allowed)
                VettingRefusalNote(decision: mayWrite)
                Button("Back") { stage = 3 }
            }
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
        doctor.map { can($0, "sign-clinical-review") }
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
    var body: some View {
        Form {
            Section {
                DemoBadge()
                Text("\(reference) · Lerato Molefe").font(.headline)
                Text("Submitted by Sister Naledi Mokoena, 4 September 11:24. Two readings were flagged by the nurse.").font(.caption).foregroundStyle(.secondary)
            }
            Section {
                ClinicalChart(title: "Blood pressure — systolic", unit: "mmHg",
                              readings: [.init(label: "12 Aug", value: 128), .init(label: "19 Aug", value: 134), .init(label: "28 Aug", value: 141, note: "Missed medication"), .init(label: "4 Sep", value: 146, note: "Nurse flagged")],
                              normal: 90...140)
                .listRowInsets(EdgeInsets())
            }
            /* A doctor reading a nurse's submission is the exact moment the origin matters most:
               she is deciding what to do about a number she did not take, and “who took this, on
               what, calibrated when” is the difference between acting on it and repeating it. */
            Section("Nurse’s submission") {
                if submitted.isEmpty {
                    Text("Nothing for this visit is on this phone.").font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(submitted) { entry in
                        VStack(alignment: .leading, spacing: 5) {
                            ReadingRow(reading: entry.reading)
                            HStack(spacing: 8) {
                                CaptureStatePill(state: entry.state)
                                Text(entry.capturedByName).font(.caption2).foregroundStyle(.secondary)
                                Spacer(minLength: 0)
                            }
                            WrittenAgoNote(at: entry.writtenToPhoneAt)
                        }
                        .padding(.vertical, 2)
                    }
                    NavigationLink("Open the capture queue") { CaptureQueueView() }
                }
                LabeledContent("Reported symptoms", value: "Headache, fatigue")
                LabeledContent("Next step", value: "Refer for doctor review within 24 hours")
            }
            Section("Signing doctor") {
                Picker("Doctor", selection: $signingDoctor) {
                    ForEach(vetting.subjects(role: "doctor")) { Text($0.name).tag($0.id) }
                }
                if let doctor {
                    LabeledContent("Registration", value: doctor.reference)
                    HStack { Text("Vetting"); Spacer(); SubjectStatusPill(status: summarise(doctor).status) }
                    NavigationLink("Open this doctor’s vetting") { VettingStatusView(subjectId: doctor.id) }
                }
                VettingRefusalNote(decision: signDecision)
            }
            Section("Your decision") {
                Picker("Outcome", selection: $decision) {
                    Text("Choose an outcome…").tag("")
                    ForEach(["Continue current management, review in one month", "Adjust medication and issue a prescription", "Request laboratory tests", "Book a teleconsultation with the patient", "Refer to a facility"], id: \.self) { Text($0).tag($0) }
                }
                /* Prescribing is asked separately from signing, because it rests on a separate
                   authority — the outcome that needs one says so before the signature is attempted. */
                if needsPrescribing { VettingRefusalNote(decision: prescribeDecision) }
                TextEditor(text: $rationale).frame(minHeight: 90)
                Text("Clinical rationale — why this decision, for the record and the next clinician.").font(.caption).foregroundStyle(.secondary)
            }
            Section {
                Text("Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration.").font(.caption).foregroundStyle(.secondary)
                Button(done ? "Demo decision held in this screen only" : "Sign demo decision", action: sign)
                    .disabled(done || decision.isEmpty || rationale.trimmingCharacters(in: .whitespaces).count < 10)
                if !refused.isEmpty { Text(refused).font(.caption).foregroundStyle(ThusoTheme.danger) }
            }
        }
        .navigationTitle("Clinical review").navigationBarTitleDisplayMode(.inline)
    }
    private func sign() {
        guard let blocked else { refused = ""; done = true; return }
        refused = "Signature refused. \(blocked.reason ?? "") The case stays in the queue for a doctor who may sign it."
    }
}
