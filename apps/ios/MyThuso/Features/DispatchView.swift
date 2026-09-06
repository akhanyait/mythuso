import SwiftUI

struct DispatchJob: Identifiable, Hashable {
    let id: String, service: String, area: String, window: String, priority: String
    let x: Double, y: Double
}
struct DispatchNurse: Identifiable, Hashable {
    let id: String, name: String, area: String, status: String, eta: Int, skills: String
    let x: Double, y: Double
}
enum Dispatch {
    static let zones = [("Randburg", 0.17, 0.19, 0.13), ("Rosebank", 0.76, 0.19, 0.13), ("Parktown", 0.68, 0.50, 0.12), ("Melville", 0.25, 0.50, 0.12), ("Soweto", 0.38, 0.81, 0.14)]
    static let jobs = [
        DispatchJob(id: "TH-2049", service: "Wound care", area: "Soweto", window: "11:00 – 12:00", priority: "Same day", x: 0.41, y: 0.79),
        DispatchJob(id: "TH-2051", service: "Vitals & chronic check", area: "Randburg", window: "13:00 – 14:00", priority: "Routine", x: 0.21, y: 0.24),
        DispatchJob(id: "TH-2052", service: "Post-operative check", area: "Parktown", window: "As soon as possible", priority: "Urgent", x: 0.70, y: 0.52)
    ]
    static let nurses = [
        DispatchNurse(id: "N-108", name: "Sister Palesa Khumalo", area: "Soweto", status: "Available", eta: 9, skills: "Wound care · Maternal", x: 0.35, y: 0.83),
        DispatchNurse(id: "N-114", name: "Sister Naledi Mokoena", area: "Rosebank", status: "Available", eta: 18, skills: "Wound care · Chronic care", x: 0.76, y: 0.21),
        DispatchNurse(id: "N-133", name: "Sister Refilwe Sithole", area: "Randburg", status: "Available", eta: 24, skills: "Chronic care · Paediatric", x: 0.15, y: 0.20),
        DispatchNurse(id: "N-121", name: "Brother Sipho Ndlovu", area: "Melville", status: "On a visit", eta: 46, skills: "Post-operative · Chronic care", x: 0.24, y: 0.51)
    ]
}
/// The map is a picture of the same information in the list below it. Everything can be
/// dispatched from the list alone, so the map carries a spoken summary and nothing more.
struct DispatchMap: View {
    let selected: String
    let assigned: [String: String]
    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(Color(red: 0.945, green: 0.965, blue: 0.949))
                ForEach(Dispatch.zones, id: \.0) { zone in
                    Circle().fill(Color(red: 0.875, green: 0.933, blue: 0.894))
                        .frame(width: zone.3 * 2 * size, height: zone.3 * 2 * size)
                        .position(x: zone.1 * size, y: zone.2 * size)
                }
                ForEach(Dispatch.nurses) { nurse in
                    Circle().fill(nurse.status == "Available" ? Color(red: 0.184, green: 0.612, blue: 0.490) : Color(white: 0.66))
                        .frame(width: 10, height: 10).position(x: nurse.x * size, y: nurse.y * size)
                }
                ForEach(Dispatch.jobs) { job in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(assigned[job.id] != nil ? Color(red: 0.184, green: 0.612, blue: 0.490) : Color(red: 0.851, green: 0.604, blue: 0.271))
                        .frame(width: 12, height: 12)
                        .overlay { if job.id == selected { Circle().stroke(ThusoTheme.forest, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])).frame(width: 26, height: 26) } }
                        .position(x: job.x * size, y: job.y * size)
                }
                ForEach(Dispatch.zones, id: \.0) { zone in
                    Text(zone.0).font(.system(size: 10, weight: .semibold)).foregroundStyle(ThusoTheme.forest.opacity(0.75))
                        .position(x: zone.1 * size, y: (zone.2 - zone.3) * size + 8)
                }
            }
            .frame(width: size, height: size)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel("Demonstration dispatch map of northern Johannesburg. \(Dispatch.jobs.count) visits awaiting assignment. \(Dispatch.nurses.filter { $0.status == "Available" }.count) nurses available. All positions are fictional.")
    }
}
struct DispatchBoardView: View {
    @State private var state: LoadState = .ready
    @State private var selected = Dispatch.jobs[0].id
    @State private var assigned: [String: String] = [:]
    private var job: DispatchJob { Dispatch.jobs.first { $0.id == selected } ?? Dispatch.jobs[0] }
    var body: some View {
        List {
            Section { DemoBadge(); StatePicker(title: "Preview the dispatch feed state", state: $state) }
            if state == .ready {
                Section("Live dispatch · Demo") {
                    DispatchMap(selected: selected, assigned: assigned).listRowInsets(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10))
                    HStack(spacing: 14) {
                        Label("Available", systemImage: "circle.fill").foregroundStyle(Color(red: 0.184, green: 0.612, blue: 0.490))
                        Label("On a visit", systemImage: "circle.fill").foregroundStyle(Color(white: 0.66))
                        Label("Visit", systemImage: "square.fill").foregroundStyle(Color(red: 0.851, green: 0.604, blue: 0.271))
                    }.font(.caption2)
                }
                Section("Awaiting assignment") {
                    Picker("Visit", selection: $selected) { ForEach(Dispatch.jobs) { Text($0.id).tag($0.id) } }.pickerStyle(.segmented)
                    LabeledContent("Service", value: job.service)
                    LabeledContent("Area", value: job.area)
                    LabeledContent("Window", value: job.window)
                    LabeledContent("Priority", value: job.priority)
                    LabeledContent("Status", value: assigned[job.id].map { "Assigned to \($0)" } ?? "Unassigned")
                }
                Section("Nearest available nurses") {
                    ForEach(Dispatch.nurses.sorted { $0.eta < $1.eta }) { nurse in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(nurse.name).font(.subheadline.weight(.semibold))
                                Text("\(nurse.area) · \(nurse.status) · ETA \(nurse.eta) min").font(.caption).foregroundStyle(.secondary)
                                Text(nurse.skills).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(assigned[job.id] == nurse.name ? "Assigned" : "Assign") {
                                assigned[job.id] = assigned[job.id] == nurse.name ? nil : nurse.name
                            }
                            .buttonStyle(.bordered).disabled(nurse.status != "Available")
                        }
                        .padding(.vertical, 3)
                    }
                    Text("Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Section { StateBlock(state: state, subject: "The live dispatch feed", permission: "location sharing from nurse devices", retry: { state = .ready }) { EmptyView() }.listRowInsets(EdgeInsets()) }
            }
        }
        .navigationTitle("Dispatch").navigationBarTitleDisplayMode(.inline)
    }
}
struct IncidentSummary: Identifiable, Hashable {
    let id: String, title: String, severity: String, area: String, opened: String, status: String
}
enum Incidents {
    static let all = [
        IncidentSummary(id: "INC-014", title: "Nurse could not gain access at the address", severity: "Medium", area: "Soweto", opened: "09:52", status: "Triage"),
        IncidentSummary(id: "INC-015", title: "Patient reported chest pain during a routine visit", severity: "Critical", area: "Parktown", opened: "10:31", status: "Escalated"),
        IncidentSummary(id: "INC-016", title: "Sample seal found damaged on courier handover", severity: "High", area: "Rosebank", opened: "11:04", status: "Open")
    ]
}
struct IncidentDetailView: View {
    let incident: IncidentSummary
    @State private var severity: String
    @State private var action = ""
    @State private var notes = ""
    @State private var log: [String] = []
    init(incident: IncidentSummary) { self.incident = incident; _severity = State(initialValue: incident.severity) }
    var body: some View {
        Form {
            Section {
                DemoBadge()
                Text(incident.title).font(.headline)
                LabeledContent("Opened", value: "\(incident.opened) · \(incident.area)")
                LabeledContent("Reported by", value: "Sister Palesa Khumalo · N-108")
            }
            Section("Triage") {
                Picker("Severity", selection: $severity) { ForEach(["Low", "Medium", "High", "Critical"], id: \.self) { Text($0) } }
                if severity == "Critical" {
                    Text("A critical incident pages the on-call clinical lead immediately. The form is never a prerequisite for calling emergency services.").font(.caption).foregroundStyle(.red)
                }
                Picker("Immediate action", selection: $action) {
                    Text("Choose an action…").tag("")
                    ForEach(["Call the nurse now", "Advise nurse to call emergency services", "Escalate to the on-call clinical lead", "Notify the patient’s emergency contact", "Reassign the visit", "Stand down — no further action"], id: \.self) { Text($0).tag($0) }
                }
                TextEditor(text: $notes).frame(minHeight: 80)
                Text("Handover note — what happened, what you did, what the next shift must know.").font(.caption).foregroundStyle(.secondary)
                Button("Add demo action to the log") { log.append(action); action = "" }.disabled(action.isEmpty)
            }
            if !log.isEmpty {
                Section("Demo incident log") { ForEach(log, id: \.self) { Label($0, systemImage: "checkmark.circle.fill").foregroundStyle(ThusoTheme.teal) } }
            }
            Section { Text("Incident logs are append-only and reviewed weekly. Nothing here is recorded, paged or sent.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle(incident.id).navigationBarTitleDisplayMode(.inline)
    }
}
struct NurseVettingView: View {
    @State private var stage = 0
    @State private var sanc = ""
    @State private var scope: Set<String> = []
    @State private var attested = false
    private let checks = [
        ("SANC registration", "Verified against the South African Nursing Council register", "Verified"),
        ("Identity", "Home Affairs verification through an accredited provider", "Verified"),
        ("Qualifications", "Certified copies checked against the issuing institution", "Verified"),
        ("Police clearance", "SAPS clearance, renewed every two years", "In review"),
        ("Professional indemnity", "Cover in force for the scope of practice", "In review"),
        ("Two clinical references", "Contacted directly, never through the applicant", "Outstanding"),
        ("Thuso Kit training", "Device handling, infection control and escalation drill", "Outstanding")
    ]
    private var verified: Int { checks.filter { $0.2 == "Verified" }.count }
    var body: some View {
        Form {
            if stage == 0 {
                Section("Join the MyThuso nurse network") {
                    Text("Vetting protects patients and it protects you. Nothing is submitted in this preview.").font(.caption).foregroundStyle(.secondary)
                    TextField("SANC registration number (8 digits)", text: $sanc).keyboardType(.numberPad)
                }
                Section("Scope of practice") {
                    ForEach(["Chronic care", "Wound care", "Maternal & child", "Post-operative", "Phlebotomy", "Paediatric", "Elderly care"], id: \.self) { skill in
                        Button { if scope.contains(skill) { scope.remove(skill) } else { scope.insert(skill) } } label: {
                            HStack { Text(skill).foregroundStyle(ThusoTheme.ink); Spacer(); if scope.contains(skill) { Image(systemName: "checkmark").foregroundStyle(ThusoTheme.teal) } }
                        }
                        .accessibilityAddTraits(scope.contains(skill) ? [.isSelected] : [])
                    }
                }
                Section {
                    Text("You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.").font(.caption).foregroundStyle(.secondary)
                    Button("Continue") { stage = 1 }.disabled(sanc.filter(\.isNumber).count < 8 || scope.isEmpty)
                }
            } else {
                Section("Your vetting status") {
                    ProgressView(value: Double(verified), total: Double(checks.count))
                    Text("\(verified) of \(checks.count) checks complete in this sample. You cannot take visits until every check passes.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    ForEach(checks, id: \.0) { check in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(check.0).font(.subheadline.weight(.semibold)); Spacer(); Text(check.2).font(.caption).foregroundStyle(check.2 == "Verified" ? ThusoTheme.teal : .secondary) }
                            Text(check.1).font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                        .accessibilityElement(children: .combine)
                    }
                }
                Section {
                    Toggle("I confirm the information above is true and I will report any change to my registration, clearance or health status.", isOn: $attested)
                    Text("Re-vetting runs on a schedule, not once at sign-up. A lapsed registration removes a nurse from dispatch automatically.").font(.caption).foregroundStyle(.secondary)
                    Button("Submit demo application") { stage = 0 }.disabled(!attested)
                    Button("Back") { stage = 0 }
                }
            }
        }
        .navigationTitle("Nurse vetting").navigationBarTitleDisplayMode(.inline)
    }
}
