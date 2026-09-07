import SwiftUI

struct TimelineStep: Identifiable {
    let label: String, detail: String, at: String, state: String
    var id: String { label }
}
struct TimelineList: View {
    let steps: [TimelineStep]
    var body: some View {
        ForEach(steps) { step in
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: step.state == "done" ? "checkmark.circle.fill" : step.state == "active" ? "circle.dashed" : "circle")
                    .foregroundStyle(step.state == "waiting" ? .gray.opacity(0.5) : ThusoTheme.teal)
                VStack(alignment: .leading, spacing: 4) {
                    Text(step.label).font(.subheadline.weight(.semibold)).foregroundStyle(step.state == "waiting" ? .secondary : .primary)
                    Text(step.detail).font(.caption).foregroundStyle(.secondary)
                    if !step.at.isEmpty { Text(step.at).font(.caption2).foregroundStyle(.secondary) }
                }
            }
            .padding(.vertical, 3)
            .accessibilityElement(children: .combine)
        }
    }
}
struct PrescriptionView: View {
    var reference = "RX-0081"
    @State private var state: LoadState = .ready
    @State private var checked: Set<String> = []
    private let medicines = [
        ("Amlodipine 5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take with or without food. Report ankle swelling."),
        ("Hydrochlorothiazide 12.5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take early in the day.")
    ]
    var body: some View {
        Form {
            Section {
                DemoBadge()
                Text(reference).font(.title2.weight(.semibold))
                Text("Issued 4 September · Valid for 6 months · Awaiting pharmacist").font(.caption).foregroundStyle(.secondary)
                LabeledContent("Patient", value: "Lerato Molefe · 01/01/1980")
                LabeledContent("Prescriber", value: "Dr. A. Dlamini · HPCSA 0000000 (demo)")
                LabeledContent("Pharmacy", value: "Rosebank community pharmacy")
            }
            Section { StatePicker(title: "Preview the pharmacy connection state", state: $state) }
            if state == .ready {
                Section("Items") {
                    ForEach(medicines, id: \.0) { medicine in
                        Toggle(isOn: Binding(get: { checked.contains(medicine.0) }, set: { on in if on { checked.insert(medicine.0) } else { checked.remove(medicine.0) } })) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(medicine.0).font(.subheadline.weight(.semibold))
                                Text(medicine.1).font(.caption).foregroundStyle(.secondary)
                                Text(medicine.2).font(.caption).foregroundStyle(.secondary)
                                Text(medicine.3).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section("Chain of custody") {
                    TimelineList(steps: [
                        .init(label: "Prescribed", detail: "Signed by the reviewing doctor", at: "4 September, 11:41", state: "done"),
                        .init(label: "Sent to pharmacy", detail: "Encrypted transfer to the dispensing partner", at: "4 September, 11:42", state: "done"),
                        .init(label: "Pharmacist check", detail: "\(checked.count) of \(medicines.count) items checked in this preview", at: "", state: "active"),
                        .init(label: "Dispensed and sealed", detail: "Tamper-evident seal number recorded", at: "", state: "waiting"),
                        .init(label: "Delivered to the patient", detail: "Signature or visit-code handover", at: "", state: "waiting")
                    ])
                }
            } else {
                Section { StateBlock(state: state, subject: "The dispensing partner’s order feed", permission: "partner data sharing", retry: { state = .ready }) { EmptyView() }.listRowInsets(EdgeInsets()) }
            }
            Section { Text("Schedule 5 and above, chronic authorisations and substitution rules are not modelled here. Dispensing requires a registered pharmacist and a valid original script.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle("Prescription").navigationBarTitleDisplayMode(.inline)
    }
}
struct LabOrderView: View {
    var reference = "LAB-0023"
    @State private var state: LoadState = .ready
    @State private var released = false
    private let panel = [("Haemoglobin", "13.9 g/dL", "12.0 – 15.5", ""), ("Fasting glucose", "6.4 mmol/L", "3.9 – 5.6", "High"),
                         ("Creatinine", "74 µmol/L", "49 – 90", ""), ("Total cholesterol", "5.8 mmol/L", "< 5.0", "High")]
    var body: some View {
        Form {
            Section {
                DemoBadge()
                Text(reference).font(.title2.weight(.semibold))
                Text("Requested 4 September · Fasting panel · \(released ? "Released to patient" : "Awaiting release")").font(.caption).foregroundStyle(.secondary)
                LabeledContent("Requested by", value: "Dr. A. Dlamini · HPCSA 0000000 (demo)")
                LabeledContent("Collected by", value: "Sister Naledi Mokoena")
                LabeledContent("Sample seal", value: "SEAL-77341 · Intact on receipt")
            }
            Section("Chain of custody") {
                TimelineList(steps: [
                    .init(label: "Ordered", detail: "Doctor requested a fasting panel", at: "4 September, 08:10", state: "done"),
                    .init(label: "Collected at home", detail: "Two tubes drawn, sealed and labelled at the bedside", at: "4 September, 09:05", state: "done"),
                    .init(label: "Courier handover", detail: "Seal scanned by courier · Temperature logged", at: "4 September, 09:40", state: "done"),
                    .init(label: "Received by the laboratory", detail: "Seal verified intact · Accessioned", at: "4 September, 12:15", state: "done"),
                    .init(label: "Results verified", detail: "Checked by the laboratory’s reviewing pathologist", at: "5 September, 07:30", state: "done"),
                    .init(label: "Released to the patient", detail: released ? "Visible in the Health Passport with an explanation" : "Held until the requesting doctor releases them", at: "", state: released ? "done" : "active")
                ])
            }
            Section { StatePicker(title: "Preview the laboratory connection state", state: $state) }
            if state == .ready {
                Section("Results") {
                    ForEach(panel, id: \.0) { row in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(row.0).font(.subheadline); Spacer(); Text(row.1).font(.subheadline.weight(.semibold)) }
                            HStack { Text("Reference \(row.2)").font(.caption2).foregroundStyle(.secondary); Spacer()
                                Text(row.3.isEmpty ? "Within range" : row.3).font(.caption2).foregroundStyle(row.3.isEmpty ? .secondary : Color(red: 0.64, green: 0.33, blue: 0.18)) }
                        }
                        .padding(.vertical, 2)
                        .accessibilityElement(children: .combine)
                    }
                    Text("Fictional results. Reference ranges are illustrative and vary by laboratory, age and sex.").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Section { StateBlock(state: state, subject: "The laboratory result feed", permission: "partner data sharing", retry: { state = .ready }) { EmptyView() }.listRowInsets(EdgeInsets()) }
            }
            Section {
                Text("Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.").font(.caption).foregroundStyle(.secondary)
                Button(released ? "Withdraw demo release" : "Release with an explanation") { released.toggle() }
            }
        }
        .navigationTitle("Laboratory order").navigationBarTitleDisplayMode(.inline)
    }
}
struct FulfilmentQueueView: View {
    var body: some View {
        List {
            Section { DemoBadge(); Text("Fulfilment queue").font(.title2.weight(.semibold)) }
            Section("Prescriptions") {
                NavigationLink("RX-0081 · 2 items · Awaiting pharmacist") { PrescriptionView(reference: "RX-0081") }
                NavigationLink("RX-0079 · 1 item · Dispensed, awaiting courier") { PrescriptionView(reference: "RX-0079") }
            }
            Section("Laboratory") {
                NavigationLink("LAB-0023 · Fasting panel · Results verified") { LabOrderView(reference: "LAB-0023") }
                NavigationLink("LAB-0019 · Sample in transit · Seal intact") { LabOrderView(reference: "LAB-0019") }
            }
            Section("Vetting") {
                NavigationLink("This pharmacy’s licence and pharmacist") { VettingStatusView(subjectId: "P-501") }
                NavigationLink("This laboratory’s accreditation") { VettingStatusView(subjectId: "B-601") }
                NavigationLink("Couriers who may take custody") { VettingRoleView(roleId: "courier") }
                NavigationLink("Apply as a partner") { VettingApplyView(roleId: "pharmacy") }
            }
            Section { Text("Sample orders. No live partner API, dispensing or courier handover is connected.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle("Partner workspace").navigationBarTitleDisplayMode(.inline)
    }
}
