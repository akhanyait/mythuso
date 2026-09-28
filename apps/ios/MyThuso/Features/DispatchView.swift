import SwiftUI

/* The board used to hold a hand-typed number of minutes against each nurse, and a separate pair of
   picture coordinates for the map. Neither was derived from anything, and the two could not
   contradict each other because they were never about the same thing.

   Both are now one thing: a position. Every position on this screen is fictional, sits inside a
   fictional window over Johannesburg, and goes through the guard in Models/Geo.swift before it
   reaches either the map or an arrival time. The map is a projection of those positions rather than
   a second set of numbers, so a coordinate the guard refuses has nowhere to be drawn and nothing to
   be estimated from — which is the honest outcome, and the one the screen shows.

   WHAT CHANGED WHEN THE BOARD CAME OFF `List`.

   1. The visit selector was a `UISegmentedControl`. It paints iOS's own greys rather than the
      palette, and it cannot wrap: at the accessibility sizes three visit references in one bar
      become three ellipses, so a controller chose between jobs by tapping a row of dots. It is
      ChoiceRow now — full labels, 48 points each, a fill and a weight for the selected one rather
      than a tint.
   2. The map sat in a grouped list row with its own inset and iOS's corner radius on top of the
      one it draws itself. It is the lead panel of the board now, which is also the honest
      hierarchy: it is the thing an operator opens this screen to look at.
   3. The board had no figures at all, and everything worth counting was already computed for the
      map's spoken summary — visits awaiting assignment, nurses cleared, nurses refused, nurses
      with no usable position. Those four sentences and the strip are now one arithmetic, so the
      number a sighted operator reads and the number VoiceOver speaks cannot disagree.

   Every refusal is where it was. Availability is still not permission, a nurse the board cannot
   estimate for still sorts last, and the operator's own vetting is still asked before anybody
   else's. */
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
                RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).fill(ThusoRole.muted)
                ForEach(Dispatch.zones) { zone in
                    if let point = Dispatch.plot(zone.position) {
                        Circle().fill(ThusoRole.surfaceRaised.opacity(0.65))
                            .overlay { Circle().stroke(ThusoRole.mutedForeground.opacity(0.55), lineWidth: 1) }
                            .frame(width: zone.radius * 2 * size, height: zone.radius * 2 * size)
                            .position(x: point.x * size, y: point.y * size)
                    }
                }
                ForEach(Dispatch.nurses) { nurse in
                    if let point = Dispatch.plot(nurse.position) {
                        Circle().fill(nurse.status == "Available" ? ThusoRole.successInk : ThusoRole.mutedForeground)
                            .frame(width: 10, height: 10).position(x: point.x * size, y: point.y * size)
                    }
                }
                ForEach(Dispatch.jobs) { job in
                    if let point = Dispatch.plot(job.position) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(assigned[job.id] != nil ? ThusoRole.successInk : ThusoRole.warningInk)
                            .frame(width: 12, height: 12)
                            .overlay { if job.id == selected { Circle().stroke(ThusoRole.foreground, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])).frame(width: 26, height: 26) } }
                            .position(x: point.x * size, y: point.y * size)
                    }
                }
                ForEach(Dispatch.zones) { zone in
                    if let point = Dispatch.plot(zone.position) {
                        Text(zone.name).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
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

    /* The four things this board can honestly count, worked out once and read by both the strip a
       sighted operator sees and the sentence VoiceOver speaks over the map. They were only ever
       computed for the summary; a strip that counted them a second time is exactly how a figure
       comes to disagree with the board underneath it. */
    private var cleared: Int { Dispatch.nurses.filter { $0.status == "Available" && gate($0).allowed }.count }
    private var refusedCount: Int { Dispatch.nurses.filter { !gate($0).allowed }.count }
    private var unplotted: Int { Dispatch.nurses.filter { Dispatch.plot($0.position) == nil }.count }
    private var unassigned: Int { Dispatch.jobs.filter { assigned[$0.id] == nil }.count }

    /* What the map says out loud. It claims what it can count — how many visits, how many nurses
       cleared, how many refused, how many have no position worth drawing — and nothing about
       proximity, because a straight line over a fictional window is not a measurement of who is
       closest. */
    private var mapSummary: String {
        let missing = unplotted == 0 ? ""
            : "\(unplotted) nurse\(unplotted == 1 ? " has" : "s have") no position this map can use, and \(unplotted == 1 ? "is" : "are") not drawn. "
        return "Demonstration dispatch map of northern Johannesburg. \(Dispatch.jobs.count) visits awaiting assignment. "
            + "\(cleared) nurses available and cleared by vetting, \(refusedCount) refused. "
            + missing
            + "Every position is fictional, and arrival times are straight-line estimates rather than routed journeys, so this is a picture of who is roughly where — not a measurement of who is closest."
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                /* The subtitle is the contract's, not this screen's. It was typed here as well as in
                   WorkspaceView and in the web's shell, so the same board had three descriptions and
                   a change to one of them left the other two saying something slightly else. */
                SurfaceHeading(eyebrow: "Control Tower", title: "Dispatch",
                               subtitle: FramingData.blurb("Dispatch"))
                SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                    StatePicker(title: "Preview the dispatch feed state", state: $state)
                }
                if state == .ready {
                    standing
                    liveBoard
                    awaitingAssignment
                    operatorOnDutyPanel
                    nearestNurses
                } else {
                    StateBlock(state: state, subject: "The live dispatch feed",
                               permission: "location sharing from nurse devices", retry: { state = .ready }) { EmptyView() }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Dispatch").navigationBarTitleDisplayMode(.inline)
    }

    /* Three figures, every one of them counted from the arrays drawn underneath it: the jobs list,
       the candidate list and the same vetting gate the rows ask. Nothing here is a fixture.

       Refused takes the mark rather than unassigned. Visits waiting is the ordinary state of a
       dispatch board at any hour of the day; a nurse who is on the board, near the job and not
       permitted to take it is the one thing an operator has to notice without reading. */
    @ViewBuilder private var standing: some View {
        SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            ThusoMetrics {
                ThusoMetric(value: "\(unassigned)", unit: "of \(Dispatch.jobs.count)", label: "Visits still awaiting a nurse",
                            chip: unassigned == 0 ? "All assigned" : "Waiting")
                ThusoMetric(value: "\(cleared)", unit: "of \(Dispatch.nurses.count)", label: "Available and cleared by vetting",
                            chip: cleared == 0 ? "None" : "Dispatchable")
                ThusoMetric(value: "\(refusedCount)", label: "On the board and refused by vetting",
                            chip: refusedCount == 0 ? "None" : "Cannot be sent", flagged: refusedCount > 0)
            }
            if unplotted > 0 {
                Text("\(unplotted) nurse\(unplotted == 1 ? " has" : "s have") no position this map can use, and \(unplotted == 1 ? "is" : "are") not drawn. \(Geography.refusal("no-position-shared").sentence)")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /* The map is the lead of the board and gets a panel of its own. It was a row in a grouped list,
       which put iOS's corner radius around the one the map already draws for itself. */
    @ViewBuilder private var liveBoard: some View {
        SurfacePanel {
            PanelHead("Live dispatch · Demo")
            DispatchMap(selected: selected, assigned: assigned, summary: mapSummary)
            Hairline()
            /* The key wraps rather than truncating. Three labels and three swatches on one line is
               about two hundred points at the default size and six hundred at AccessibilityXXXL. */
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space16) { mapKey }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { mapKey }
            }
        }
    }
    @ViewBuilder private var mapKey: some View {
        Label("Available", systemImage: "circle.fill").foregroundStyle(ThusoRole.successInk).font(.thuso(.footnote))
        Label("On a visit", systemImage: "circle.fill").foregroundStyle(ThusoRole.mutedForeground).font(.thuso(.footnote))
        Label("Visit", systemImage: "square.fill").foregroundStyle(ThusoRole.warningInk).font(.thuso(.footnote))
    }

    @ViewBuilder private var awaitingAssignment: some View {
        SurfacePanel {
            PanelHead("Awaiting assignment")
            ChoiceRow(label: "Visit", selection: $selected, options: Dispatch.jobs.map { ($0.id, $0.id) })
            Hairline()
            FactRow(label: "Service", value: job.service)
            FactRow(label: "Area", value: job.area)
            FactRow(label: "Window", value: job.window)
            FactRow(label: "Priority", value: job.priority)
            FactRow(label: "Status", value: assigned[job.id].map { "Assigned to \($0)" } ?? "Unassigned")
        }
    }

    @ViewBuilder private var operatorOnDutyPanel: some View {
        SurfacePanel(tone: .quiet) {
            PanelHead("Operator on duty",
                      note: "Suspend this operator in the vetting queue and the board stops assigning, on this screen, immediately.")
            PickRow(label: "Operator", selection: $onDuty,
                    options: vetting.subjects(role: "operator").map { ($0.id, $0.name) })
            VettingRefusalNote(decision: operatorDecision)
            if let operatorOnDuty {
                NavigationLink { VettingStatusView(subjectId: operatorOnDuty.id) } label: {
                    NavPillLabel(title: "Open this operator’s vetting", symbol: "checkmark.shield")
                }.buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private var nearestNurses: some View {
        SurfacePanel {
            PanelHead("Nearest available nurses",
                      note: "Ordered by the estimate rather than by a typed number. A nurse the board cannot measure sorts last.")
            ForEach(candidates) { candidate in
                DispatchNurseRow(nurse: candidate.nurse, estimate: candidate.estimate, jobId: job.id,
                                 assigned: $assigned, operatorDecision: operatorDecision)
                if candidate.id != candidates.last?.id { Hairline() }
            }
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            /* The sentence above is a promise; this one is the arithmetic that keeps it. If the two
               ever stop agreeing, it is this screen that is lying. */
            Text("Each estimate is the distance from the nurse’s last reported position to the address, in a straight line, at an assumed \(Int(urbanSpeedKmh)) km/h in traffic. No road factor is applied — a multiplier chosen to make the number feel right would make the label a lie. Where a position cannot be used, the row says “Estimating” and gives the reason rather than a number nothing produced.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
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
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            /* Name, standing and the button on one line while they fit, stacked when they do not.
               The button was pinned to a trailing Spacer, so at the accessibility sizes a two-word
               nurse's name and "Assigned" shared one line and both truncated. */
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: ThusoSpacing.space12) { identity; Spacer(minLength: 0); assignButton }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { identity; assignButton }
            }
            VettingRefusalNote(decision: decision)
            if !refused.isEmpty {
                Text(refused).font(.thuso(.footnote)).foregroundStyle(ThusoRole.dangerInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let subject {
                /* The height goes on the label, not on the link. A NavigationLink reports the frame
                   of what it is given, so a modifier chained after it grows the row and leaves a
                   sixteen-point target in it — which is what the audit measured. */
                NavigationLink { VettingStatusView(subjectId: subject.id) } label: {
                    Text("Why is this nurse refused or cleared?")
                        .font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 3)
    }

    @ViewBuilder private var identity: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(spacing: ThusoSpacing.space8) {
                Text(nurse.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let subject { SubjectStatusPill(status: summarise(subject).status) }
            }
            /* “ETA 9 min” is read out as three letters and a number, and an estimate that is
               missing must not arrive as silence. The row shows the short form and speaks the
               long one, including what the estimate was derived from. */
            Text("\(nurse.area) · \(nurse.status) · \(estimate.label)")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("\(nurse.area). \(nurse.status). \(estimate.spoken)")
            Text(nurse.skills).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            if case let .unavailable(reason, _) = estimate {
                /* Amber, not red: nothing is being refused here. The nurse can still be assigned —
                   the board just will not pretend to know when she will arrive. */
                Label(reason, systemImage: "location.slash")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.warningInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder private var assignButton: some View {
        Button(assigned[jobId] == nurse.name ? "Assigned" : "Assign", action: assign)
            .buttonStyle(QuietButton())
            .fixedSize(horizontal: true, vertical: false)
            .disabled(nurse.status != "Available")
            .accessibilityHint(decision.allowed ? "Assigns this visit" : (decision.reason ?? "Assignment is refused"))
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
    private let severities = ["Low", "Medium", "High", "Critical"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: incident.id, title: incident.title)
                SurfacePanel(tone: .quiet) {
                    FactRow(label: "Opened", value: "\(incident.opened) · \(incident.area)")
                    FactRow(label: "Reported by", value: "Sister Palesa Khumalo · N-206")
                }
                SurfacePanel(tone: severity == "Critical" ? .lead : .plain) {
                    PanelHead("Triage")
                    ChoiceRow(label: "Severity", selection: $severity, options: severities.map { ($0, $0) })
                    if severity == "Critical" {
                        Text("A critical incident pages the on-call clinical lead immediately. The form is never a prerequisite for calling emergency services.")
                            .font(.thuso(.footnote)).foregroundStyle(ThusoRole.dangerInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Hairline()
                    PickRow(label: "Immediate action", selection: $action,
                            options: [("", "Choose an action…")]
                                + ["Call the nurse now", "Advise nurse to call emergency services",
                                   "Escalate to the on-call clinical lead", "Notify the patient’s emergency contact",
                                   "Reassign the visit", "Stand down — no further action"].map { ($0, $0) })
                    WriteNote(label: "Handover note", text: $notes,
                              prompt: "What happened, what you did, what the next shift must know.")
                    Button("Add demo action to the log") { log.append(action); action = "" }
                        .buttonStyle(QuietButton()).disabled(action.isEmpty)
                }
                if !log.isEmpty {
                    SurfacePanel {
                        PanelHead("Demo incident log")
                        ForEach(log, id: \.self) { entry in
                            Label(entry, systemImage: "checkmark.circle.fill")
                                .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                Text("Incident logs are append-only and reviewed weekly. Nothing here is recorded, paged or sent.")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(incident.id).navigationBarTitleDisplayMode(.inline)
    }
}
/* The nurse-only vetting screen that used to live here has become the module in
   Features/VettingView.swift: every vetted role, resolved against today rather than listed, and the
   same record this board asks before it offers an assignment. */
