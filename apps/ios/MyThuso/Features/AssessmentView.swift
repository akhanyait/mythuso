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
struct VisitAssessmentView: View {
    var reference = "TH-2048"
    var patient = "Lerato Molefe"
    @Environment(\.dismiss) private var dismiss
    @State private var stage = 0
    @State private var otp = ""
    @State private var otpError = ""
    @State private var identitySeen = false
    @State private var consentAssessment = false
    @State private var consentRecord = false
    @State private var values: [String: String] = [:]
    @State private var symptoms: Set<String> = []
    @State private var notes = ""
    @State private var escalation = "No escalation — routine visit"
    @State private var signed = false
    private let stages = ["Identity", "Consent", "Observations", "Findings", "Sign-off"]
    private func flag(_ observation: Observation) -> String? {
        guard let raw = values[observation.id], !raw.isEmpty else { return nil }
        guard let value = Double(raw) else { return "Enter a number." }
        if value < observation.range.lowerBound { return "Below the indicative range" }
        if value > observation.range.upperBound { return "Above the indicative range" }
        return nil
    }
    private var captured: [Observation] { Observation.all.filter { !(values[$0.id] ?? "").isEmpty && Double(values[$0.id] ?? "") != nil } }
    private var abnormal: [Observation] { captured.filter { flag($0) != nil } }
    var body: some View {
        Form {
            Section {
                Text("Step \(stage + 1) of \(stages.count) · \(stages[stage])").font(.caption).foregroundStyle(ThusoTheme.teal)
                LabeledContent("Visit", value: "\(reference) · \(patient)")
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
    }
    @ViewBuilder private var identityStage: some View {
        Section("Confirm you’re at the right door") {
            Text("Ask \(patient.split(separator: " ").first ?? "") for the six-digit code in the MyThuso app. In this preview the code is 482190.").font(.caption).foregroundStyle(.secondary)
            TextField("Visit code", text: $otp).keyboardType(.numberPad)
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
        Section("Today’s readings") {
            ForEach(Observation.all) { observation in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(observation.label).font(.subheadline)
                        Spacer()
                        TextField(observation.unit, text: Binding(get: { values[observation.id] ?? "" }, set: { values[observation.id] = $0 }))
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 92)
                    }
                    Text(flag(observation) ?? "Indicative range \(observation.range.lowerBound.formatted())–\(observation.range.upperBound.formatted()) \(observation.unit)")
                        .font(.caption2).foregroundStyle(flag(observation) == nil ? .secondary : Color(red: 0.61, green: 0.38, blue: 0.19))
                }
                .padding(.vertical, 3)
            }
        }
        Section {
            Text(abnormal.isEmpty
                 ? "Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you."
                 : "\(abnormal.count) reading\(abnormal.count > 1 ? "s are" : " is") outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Record findings") { stage = 3 }.disabled(captured.isEmpty)
            Button("Back") { stage = 1 }
        }
    }
    @ViewBuilder private var findingsStage: some View {
        Section("Reported symptoms") {
            ForEach(["Headache", "Dizziness", "Shortness of breath", "Chest pain", "Swelling", "Fatigue", "Nausea", "None reported"], id: \.self) { symptom in
                Button { if symptoms.contains(symptom) { symptoms.remove(symptom) } else { symptoms.insert(symptom) } } label: {
                    HStack {
                        Text(symptom).foregroundStyle(ThusoTheme.ink)
                        Spacer()
                        if symptoms.contains(symptom) { Image(systemName: "checkmark").foregroundStyle(ThusoTheme.teal) }
                    }
                }
                .accessibilityAddTraits(symptoms.contains(symptom) ? [.isSelected] : [])
            }
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
                Label("Demo assessment closed", systemImage: "checkmark.seal.fill").foregroundStyle(ThusoTheme.teal)
                Text("Nothing was transmitted, no record was written and no clinician was notified. In production this becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration.").font(.subheadline).foregroundStyle(.secondary)
                Button("Back to the workspace") { dismiss() }
            }
        } else {
            Section("\(patient) · \(reference)") {
                ForEach(captured) { observation in
                    LabeledContent(observation.label, value: "\(values[observation.id] ?? "") \(observation.unit)\(flag(observation) == nil ? "" : " ⚠")")
                }
                LabeledContent("Symptoms", value: symptoms.isEmpty ? "None recorded" : symptoms.sorted().joined(separator: ", "))
                LabeledContent("Next step", value: escalation)
                LabeledContent("Recorded by", value: "Sister Naledi Mokoena · SANC 0000000 (demo)")
            }
            Section {
                Text("A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.").font(.caption).foregroundStyle(.secondary)
                Button("Sign demo assessment") { signed = true }
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
            Section("Nurse’s submission") {
                LabeledContent("Pulse", value: "88 bpm")
                LabeledContent("Reported symptoms", value: "Headache, fatigue")
                LabeledContent("Next step", value: "Refer for doctor review within 24 hours")
            }
            Section("Your decision") {
                Picker("Outcome", selection: $decision) {
                    Text("Choose an outcome…").tag("")
                    ForEach(["Continue current management, review in one month", "Adjust medication and issue a prescription", "Request laboratory tests", "Book a teleconsultation with the patient", "Refer to a facility"], id: \.self) { Text($0).tag($0) }
                }
                TextEditor(text: $rationale).frame(minHeight: 90)
                Text("Clinical rationale — why this decision, for the record and the next clinician.").font(.caption).foregroundStyle(.secondary)
            }
            Section {
                Text("Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration.").font(.caption).foregroundStyle(.secondary)
                Button(done ? "Demo decision held in this screen only" : "Sign demo decision") { done = true }
                    .disabled(done || decision.isEmpty || rationale.trimmingCharacters(in: .whitespaces).count < 10)
            }
        }
        .navigationTitle("Clinical review").navigationBarTitleDisplayMode(.inline)
    }
}
