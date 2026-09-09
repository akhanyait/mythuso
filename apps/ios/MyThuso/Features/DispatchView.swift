import SwiftUI

/* The board used to hold a hand-typed number of minutes against each nurse, and a separate pair of
   picture coordinates for the map. Neither was derived from anything, and the two could not
   contradict each other because they were never about the same thing.

   Both are now one thing: a position. Every position on this screen is fictional, sits inside a
   fictional window over Johannesburg, and goes through the guard in Models/Geo.swift before it
   reaches either the map or an arrival time. The map is a projection of those positions rather than
   a second set of numbers, so a coordinate the guard refuses has nowhere to be drawn and nothing to
   be estimated from — which is the honest outcome, and the one the screen shows. */
struct DispatchJob: Identifiable, Hashable {
    let id: String, service: String, area: String, window: String, priority: String
    /// Normalised once, where the fixture is written, so the raw pair is unreachable from here on
    /// and the warning is printed once rather than on every redraw.
    let position: NormalisedCoordinate
    init(id: String, service: String, area: String, window: String, priority: String, lat: Double, lng: Double) {
        (self.id, self.service, self.area, self.window, self.priority) = (id, service, area, window, priority)
        position = normaliseSouthAfricaLngLat(lat: lat, lng: lng, source: "The address for visit \(id)")
    }
}
struct DispatchNurse: Identifiable, Hashable {
    let id: String, name: String, area: String, status: String, skills: String
    let position: NormalisedCoordinate
    init(id: String, name: String, area: String, status: String, skills: String, lat: Double, lng: Double) {
        (self.id, self.name, self.area, self.status, self.skills) = (id, name, area, status, skills)
        position = normaliseSouthAfricaLngLat(lat: lat, lng: lng, source: "\(name)’s last reported position")
    }
}
struct DispatchZone: Identifiable, Hashable {
    let name: String
    let position: NormalisedCoordinate
    /// How wide the circle is drawn, as a fraction of the map. A zone is a shaded area on a picture,
    /// not a boundary anybody is dispatched by, so its size is a drawing decision and stays one.
    let radius: Double
    var id: String { name }
    init(_ name: String, lat: Double, lng: Double, radius: Double) {
        self.name = name
        self.radius = radius
        position = normaliseSouthAfricaLngLat(lat: lat, lng: lng, source: "The \(name) zone")
    }
}
enum Dispatch {
    /* The rectangle the demonstration map draws, in degrees. Coordinates are projected into it
       rather than the other way round: nothing on this screen holds a screen position of its own. */
    static let viewport = (minLng: 27.82, maxLng: 28.14, minLat: -26.34, maxLat: -26.08)
    /// Where a position falls inside the square, or nowhere at all. A refused coordinate is not
    /// drawn at the edge or at the origin — it is left off, and counted in the spoken summary.
    static func plot(_ coordinate: NormalisedCoordinate) -> (x: Double, y: Double)? {
        guard let pair = coordinate.pair else { return nil }
        let x = (pair.lng - viewport.minLng) / (viewport.maxLng - viewport.minLng)
        let y = (viewport.maxLat - pair.lat) / (viewport.maxLat - viewport.minLat)
        guard (0...1).contains(x), (0...1).contains(y) else { return nil }
        return (x, y)
    }
    static let zones = [
        DispatchZone("Randburg", lat: -26.1294, lng: 27.8744, radius: 0.13),
        DispatchZone("Rosebank", lat: -26.1294, lng: 28.0632, radius: 0.13),
        DispatchZone("Parktown", lat: -26.2100, lng: 28.0376, radius: 0.12),
        DispatchZone("Melville", lat: -26.2100, lng: 27.9000, radius: 0.12),
        DispatchZone("Soweto", lat: -26.2906, lng: 27.9416, radius: 0.14)
    ]
    static let jobs = [
        DispatchJob(id: "TH-2049", service: "Wound care", area: "Soweto", window: "11:00 – 12:00", priority: "Same day", lat: -26.2854, lng: 27.9512),
        DispatchJob(id: "TH-2051", service: "Vitals & chronic check", area: "Randburg", window: "13:00 – 14:00", priority: "Routine", lat: -26.1424, lng: 27.8872),
        DispatchJob(id: "TH-2052", service: "Post-operative check", area: "Parktown", window: "As soon as possible", priority: "Urgent", lat: -26.2152, lng: 28.0440)
    ]
    static let nurses = [
        DispatchNurse(id: "N-206", name: "Sister Palesa Khumalo", area: "Soweto", status: "Available", skills: "Wound care · Maternal", lat: -26.2958, lng: 27.9320),
        DispatchNurse(id: "N-205", name: "Sister Naledi Mokoena", area: "Rosebank", status: "Available", skills: "Wound care · Chronic care", lat: -26.1346, lng: 28.0632),
        DispatchNurse(id: "N-207", name: "Sister Refilwe Sithole", area: "Randburg", status: "Available", skills: "Chronic care · Paediatric", lat: -26.1320, lng: 27.8680),
        DispatchNurse(id: "N-208", name: "Brother Sipho Ndlovu", area: "Melville", status: "On a visit", skills: "Post-operative · Chronic care", lat: -26.2126, lng: 27.8968),
        /* Two nurses who are on the board and near the job, and still cannot be sent. Availability
           is not permission, so they stay visible with the reason attached rather than disappearing
           and leaving an operator to wonder where they went. */
        DispatchNurse(id: "N-204", name: "Sister Ayanda Dube", area: "Soweto", status: "Available", skills: "Elderly care", lat: -26.3010, lng: 27.9608),
        DispatchNurse(id: "N-203", name: "Brother Lwazi Mahlangu", area: "Parktown", status: "Available", skills: "Post-operative · Phlebotomy", lat: -26.2022, lng: 28.0248),
        /* And one who is cleared, available and near nothing the board can prove: her device last
           reported the iOS Simulator’s own position in Cupertino. She is the reason the guard exists,
           kept on the board rather than described in a comment, because a preview built for the
           simulator is exactly where that coordinate comes from. Vetting has nothing against her,
           so the board offers her — it simply refuses to put a number next to her name. */
        DispatchNurse(id: "N-201", name: "Sister Thandeka Zulu", area: "Soweto", status: "Available", skills: "Chronic care · Wound care", lat: 37.3349, lng: -122.0090)
    ]
}
/// The map is a picture of the same information in the list below it. Everything can be
/// dispatched from the list alone, so the map carries a spoken summary and nothing more.
struct DispatchMap: View {
    let selected: String
    let assigned: [String: String]
    /// Written by the board, which is the only thing that knows what vetting said. A summary that
    /// counted for itself would be a second answer to the same question.
    let summary: String
    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            ZStack {
                RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).fill(ThusoTheme.canvas)
                ForEach(Dispatch.zones) { zone in
                    if let point = Dispatch.plot(zone.position) {
                        Circle().fill(ThusoTheme.paleSage)
                            .frame(width: zone.radius * 2 * size, height: zone.radius * 2 * size)
                            .position(x: point.x * size, y: point.y * size)
                    }
                }
                ForEach(Dispatch.nurses) { nurse in
                    if let point = Dispatch.plot(nurse.position) {
                        Circle().fill(nurse.status == "Available" ? ThusoTheme.tealInk : ThusoTheme.charcoal.opacity(0.72))
                            .frame(width: 10, height: 10).position(x: point.x * size, y: point.y * size)
                    }
                }
                ForEach(Dispatch.jobs) { job in
                    if let point = Dispatch.plot(job.position) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(assigned[job.id] != nil ? ThusoTheme.tealInk : ThusoTheme.mangoInk)
                            .frame(width: 12, height: 12)
                            .overlay { if job.id == selected { Circle().stroke(ThusoTheme.charcoal, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])).frame(width: 26, height: 26) } }
                            .position(x: point.x * size, y: point.y * size)
                    }
                }
                ForEach(Dispatch.zones) { zone in
                    if let point = Dispatch.plot(zone.position) {
                        Text(zone.name).font(.caption2.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                            .position(x: point.x * size, y: (point.y - zone.radius) * size + 8)
                    }
                }
            }
            .frame(width: size, height: size)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel(summary)
    }
}
struct DispatchBoardView: View {
    @State private var state: LoadState = .ready
    @State private var selected = Dispatch.jobs[0].id
    @State private var assigned: [String: String] = [:]
    @State private var onDuty = "O-801"
    @ObservedObject private var vetting = VettingStore.shared
    private var job: DispatchJob { Dispatch.jobs.first { $0.id == selected } ?? Dispatch.jobs[0] }
    /* Sending a named nurse to a named address is the most sensitive thing this platform does, so
       the board asks about the operator’s own vetting before it asks about anybody else’s. */
    private var operatorOnDuty: VettingSubject? { vetting.subject(onDuty) }
    private var operatorDecision: VettingDecision {
        operatorOnDuty.map { can($0, "dispatch-nurses") }
            ?? VettingDecision(allowed: false, reason: "No vetted operator is signed in, so nobody can be dispatched.", blockedBy: [])
    }
    private struct Candidate: Identifiable {
        let nurse: DispatchNurse
        let estimate: ArrivalEstimate
        var id: String { nurse.id }
    }
    /* Ordered by the estimate rather than by a number somebody typed, and a nurse the board cannot
       estimate for sorts last. Being unmeasurable must never look like being nearest. */
    private var candidates: [Candidate] {
        Dispatch.nurses
            .map { Candidate(nurse: $0, estimate: straightLineArrival(from: $0.position, to: job.position)) }
            .sorted { left, right in
                switch (left.estimate.minutes, right.estimate.minutes) {
                case let (first?, second?): return first == second ? left.nurse.id < right.nurse.id : first < second
                case (_?, nil): return true
                case (nil, _?): return false
                case (nil, nil): return left.nurse.id < right.nurse.id
                }
            }
    }
    /// The same gate the rows use, asked once more so the map and the list cannot disagree.
    private func gate(_ nurse: DispatchNurse) -> VettingDecision {
        guard operatorDecision.allowed else { return operatorDecision }
        return vetting.subject(named: nurse.name).map { can($0, "take-visit") }
            ?? VettingDecision(allowed: false, reason: "This nurse has no vetting record, so no visit can be offered to them.", blockedBy: [])
    }
    /* What the map says out loud. It claims what it can count — how many visits, how many nurses
       cleared, how many refused, how many have no position worth drawing — and nothing about
       proximity, because a straight line over a fictional window is not a measurement of who is
       closest. */
    private var mapSummary: String {
        let cleared = Dispatch.nurses.filter { $0.status == "Available" && gate($0).allowed }.count
        let refused = Dispatch.nurses.filter { !gate($0).allowed }.count
        let unplotted = Dispatch.nurses.filter { Dispatch.plot($0.position) == nil }.count
        let missing = unplotted == 0 ? ""
            : "\(unplotted) nurse\(unplotted == 1 ? " has" : "s have") no position this map can use, and \(unplotted == 1 ? "is" : "are") not drawn. "
        return "Demonstration dispatch map of northern Johannesburg. \(Dispatch.jobs.count) visits awaiting assignment. "
            + "\(cleared) nurses available and cleared by vetting, \(refused) refused. "
            + missing
            + "Every position is fictional, and arrival times are straight-line estimates rather than routed journeys, so this is a picture of who is roughly where — not a measurement of who is closest."
    }
    var body: some View {
        List {
            Section { DemoBadge(); StatePicker(title: "Preview the dispatch feed state", state: $state) }
            if state == .ready {
                Section("Live dispatch · Demo") {
                    DispatchMap(selected: selected, assigned: assigned, summary: mapSummary)
                        .listRowInsets(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10))
                    HStack(spacing: ThusoSpacing.space16) {
                        Label("Available", systemImage: "circle.fill").foregroundStyle(ThusoTheme.tealInk)
                        Label("On a visit", systemImage: "circle.fill").foregroundStyle(Color(white: 0.66))
                        Label("Visit", systemImage: "square.fill").foregroundStyle(ThusoTheme.mangoInk)
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
                Section("Operator on duty") {
                    Picker("Operator", selection: $onDuty) {
                        ForEach(vetting.subjects(role: "operator")) { Text($0.name).tag($0.id) }
                    }
                    VettingRefusalNote(decision: operatorDecision)
                    if let operatorOnDuty {
                        NavigationLink("Open this operator’s vetting") { VettingStatusView(subjectId: operatorOnDuty.id) }
                    }
                    Text("Suspend this operator in the vetting queue and the board stops assigning, on this screen, immediately.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Nearest available nurses") {
                    ForEach(candidates) { candidate in
                        DispatchNurseRow(nurse: candidate.nurse, estimate: candidate.estimate, jobId: job.id,
                                         assigned: $assigned, operatorDecision: operatorDecision)
                    }
                    Text("Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.").font(.caption).foregroundStyle(.secondary)
                    /* The sentence above is a promise; this one is the arithmetic that keeps it. If
                       the two ever stop agreeing, it is this screen that is lying. */
                    Text("Each estimate is the distance from the nurse’s last reported position to the address, in a straight line, at an assumed \(Int(urbanSpeedKmh)) km/h in traffic. No road factor is applied — a multiplier chosen to make the number feel right would make the label a lie. Where a position cannot be used, the row says “Estimating” and gives the reason rather than a number nothing produced.").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Section { StateBlock(state: state, subject: "The live dispatch feed", permission: "location sharing from nurse devices", retry: { state = .ready }) { EmptyView() }.listRowInsets(EdgeInsets()) }
            }
        }
        .navigationTitle("Dispatch").navigationBarTitleDisplayMode(.inline)
    }
}
/// A nurse who is not cleared still appears on the board — the refusal is shown against them rather
/// than hidden by removing them, so an operator can see why the nearest nurse is not being sent.
struct DispatchNurseRow: View {
    let nurse: DispatchNurse
    let estimate: ArrivalEstimate
    let jobId: String
    @Binding var assigned: [String: String]
    let operatorDecision: VettingDecision
    @ObservedObject private var vetting = VettingStore.shared
    @State private var refused = ""
    private var subject: VettingSubject? { vetting.subject(named: nurse.name) }
    private var decision: VettingDecision {
        if !operatorDecision.allowed { return operatorDecision }
        return subject.map { can($0, "take-visit") }
            ?? VettingDecision(allowed: false, reason: "This nurse has no vetting record, so no visit can be offered to them.", blockedBy: [])
    }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: ThusoSpacing.space8) {
                        Text(nurse.name).font(.subheadline.weight(.semibold))
                        if let subject { SubjectStatusPill(status: summarise(subject).status) }
                    }
                    /* “ETA 9 min” is read out as three letters and a number, and an estimate that is
                       missing must not arrive as silence. The row shows the short form and speaks the
                       long one, including what the estimate was derived from. */
                    Text("\(nurse.area) · \(nurse.status) · \(estimate.label)")
                        .font(.caption).foregroundStyle(.secondary)
                        .accessibilityLabel("\(nurse.area). \(nurse.status). \(estimate.spoken)")
                    Text(nurse.skills).font(.caption2).foregroundStyle(.secondary)
                    if case let .unavailable(reason, _) = estimate {
                        /* Amber, not red: nothing is being refused here. The nurse can still be
                           assigned — the board just will not pretend to know when she will arrive. */
                        Label(reason, systemImage: "location.slash")
                            .font(.caption2).foregroundStyle(ThusoTheme.mangoInk)
                            .accessibilityHidden(true)
                    }
                }
                Spacer()
                Button(assigned[jobId] == nurse.name ? "Assigned" : "Assign", action: assign)
                    .buttonStyle(.bordered)
                    .disabled(nurse.status != "Available")
                    .accessibilityHint(decision.allowed ? "Assigns this visit" : (decision.reason ?? "Assignment is refused"))
            }
            VettingRefusalNote(decision: decision)
            if !refused.isEmpty { Text(refused).font(.caption2).foregroundStyle(ThusoTheme.danger) }
            if let subject {
                NavigationLink("Why") { VettingStatusView(subjectId: subject.id) }
                    .font(.caption2).foregroundStyle(ThusoTheme.charcoal)
            }
        }
        .padding(.vertical, 3)
    }
    private func assign() {
        guard decision.allowed else {
            refused = "Assignment refused. \(decision.reason ?? "") Nothing was sent."
            return
        }
        refused = ""
        assigned[jobId] = assigned[jobId] == nurse.name ? nil : nurse.name
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
                LabeledContent("Reported by", value: "Sister Palesa Khumalo · N-206")
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
                Section("Demo incident log") { ForEach(log, id: \.self) { Label($0, systemImage: "checkmark.circle.fill").foregroundStyle(ThusoTheme.charcoal) } }
            }
            Section { Text("Incident logs are append-only and reviewed weekly. Nothing here is recorded, paged or sent.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle(incident.id).navigationBarTitleDisplayMode(.inline)
    }
}
/* The nurse-only vetting screen that used to live here has become the module in
   Features/VettingView.swift: every vetted role, resolved against today rather than listed, and the
   same record this board asks before it offers an assignment. */
