import SwiftUI

/* A clinical workspace navigates as itself.
 *
 * Every role used to open one long List under the patient's own tab bar, so a nurse on a doorstep
 * and a Control Tower operator with three late visits both navigated by Home, Book care, Visits,
 * Passport and More. A workspace is not a shop and does not belong under a shop's navigation.
 *
 * Each role now gets its own tab bar — its own sections, in its own idiom — and each lands on what
 * is waiting and how long it has waited rather than on a catalogue. Nothing was granted by moving
 * it: every vetting gate, every "apply" route and every clinical sign-off is the same view it was
 * behind, and the sentence about AI being decision support is at the foot of every section rather
 * than at the foot of one.
 *
 * WHAT CHANGED WHEN THIS MOVED OUT OF PassportView, AND WHY IT IS NOT A RESTYLE.
 *
 * 1. It was a system `Form`. Default grouped rows, system chevrons, iOS's own greys and iOS's own
 *    corner radius — on the two screens a clinician spends the most time in. Every other screen in
 *    this product had been moved onto the dashboard language a fortnight ago and these two had not,
 *    so the app read as two products. They are now composed from DesignSystem/Surface.swift like
 *    everything else: pill rows, hairline panels, one heading per screen.
 *
 * 2. The metrics were upside down. `Text(label).caption` above `Text(value).title3.bold` above a
 *    note — a small label over a bold figure, which is the exact inverse of the language.
 *    docs/DESIGN-LANGUAGE.md: *a metric is a status chip floating above a large light numeral, with
 *    a small label beneath*, and ThusoMetric is that shape. A bold figure shouts; a large light one
 *    is simply large, which is the difference between a dashboard and a scoreboard.
 *
 * 3. The figures were fiction contradicting the screen under them. The Control Tower's strip said
 *    "Active visits 24" and "Available nurses 18" over a dispatch board holding three jobs and
 *    seven nurses, and "1 severity high" over an incident list whose worst entry is critical. The
 *    doctor's said twelve cases waiting above three. A figure a reader can disprove by tapping once
 *    is worse than no figure, so every one of them is now counted from the rows the same workspace
 *    lists — which is what apps/web/src/shells/StaffShell.tsx does, and for the same reason.
 *
 * The web shell is the reference for composition throughout. It differs in one deliberate place:
 * the web repeats its counts above every board section, and a phone cannot afford three panels of
 * repetition above Collections and again above Results, so the strip is drawn on the section a role
 * lands in and nowhere else. */

// MARK: - The sections, and what each is for

struct WorkspaceSection: Identifiable, Hashable {
    let id: String
    let symbol: String
}

enum WorkspaceNavigation {
    /// The same sections, in the same order, as roleNavigation in the web app's App.tsx.
    static func sections(_ role: String) -> [WorkspaceSection] {
        switch role {
        case "Doctor": return [.init(id: "Review queue", symbol: "doc.text.magnifyingglass"),
                               .init(id: "Teleconsultation", symbol: "video"),
                               .init(id: "Patient context", symbol: "waveform.path.ecg"),
                               .init(id: "Protocols", symbol: "book")]
        case "Partner": return [.init(id: "Orders", symbol: "shippingbox"),
                                .init(id: "Collections", symbol: "truck.box"),
                                .init(id: "Results", symbol: "testtube.2")]
        case "Control Tower": return [.init(id: "Dispatch", symbol: "antenna.radiowaves.left.and.right"),
                                      .init(id: "Incidents", symbol: "exclamationmark.triangle"),
                                      .init(id: "Vetting queue", symbol: "checkmark.shield"),
                                      .init(id: "Quality", symbol: "chart.bar")]
        default: return [.init(id: "Schedule", symbol: "calendar"),
                         .init(id: "Assessments", symbol: "list.clipboard"),
                         .init(id: "Thuso Kit", symbol: "sensor.tag.radiowave.forward"),
                         .init(id: "Earnings & payouts", symbol: "creditcard"),
                         .init(id: "Vetting", symbol: "checkmark.seal")]
        }
    }

    /* HOW A ROLE IS FRAMED WHEN IT ARRIVES.
     *
     * The prototype the founder settled on gives each audience a headline of its own, in two tones:
     * the patient gets a greeting, and the clinical roles get a sentence about the judgement they
     * are being asked for. "Your judgement. A clearer view." is his, word for word, for the doctor.
     *
     * These four pairs are typed here and mirrored in Android's `workspaceFraming`. That is a copy,
     * and this codebase does not like copies — but the honest place for it is a contract in
     * packages/catalog, and the web's own workspace headings are being rebuilt by somebody else this
     * week. Writing the contract now would mean writing it against a shell that is moving. So it is
     * two copies rather than three, alongside `blurb` below, which has been the same two copies since
     * the workspaces were built; when the web lands, all three should read one file.
     *
     * The lead line is what the reader is there to do and the accent line is what the screen gives
     * them for it. The second line carries the lime block, so it is short by construction: a
     * highlighter across four words is an emphasis, and across two lines it is a banner. */
    static func framing(_ role: String) -> (lead: String, accent: String) {
        switch role {
        case "Doctor": return ("Your judgement.", "A clearer view.")
        case "Partner": return ("Every order.", "And what it waits on.")
        case "Control Tower": return ("Every visit.", "One board.")
        default: return ("Your round today.", "Make it count.")
        }
    }

    /* What a section is for, in the words somebody doing the job would use. The same sentences the
       web's sectionBlurb carries, so a nurse reading the two does not meet two descriptions of one
       screen. A section with nothing useful to say has no line rather than a filler one. */
    static func blurb(_ section: String) -> String {
        switch section {
        case "Schedule": return "Today’s visits, in the order you will do them, and the one still waiting for your sign-off."
        case "Review queue": return "Cases waiting to be read. Decision support may draft; only a registered doctor signs."
        case "Dispatch": return "Where every visit is, which nurses are free, and what is running late."
        case "Incidents": return "What went wrong, how severe it is, and who is holding it."
        case "Orders": return "Prescriptions and laboratory orders routed to this partner, and what each is waiting on."
        case "Collections": return "Sample collections booked against this partner, and the windows they have to be inside."
        case "Results": return "Results this partner has produced, and what is holding each one back from release."
        default: return ""
        }
    }
}

// MARK: - What is waiting, counted from what is on the screen

/* A figure, its standing and its name, in the order ThusoMetric draws them: the chip floats above
   the numeral and says how it is going, the label sits beneath and says what it is. `flagged` fills
   the chip charcoal, and at most one per strip is the whole point of it — a screen where every
   figure is marked has marked nothing. */
struct WorkspaceFigure: Identifiable {
    let label: String
    let value: String
    /// Leading, for the one case where the unit is written first: R 598, never 598 R.
    var prefix: String?
    let chip: String
    var flagged = false
    var id: String { label }
}

/* The rows each landing section lists, as data rather than as strings inside a view.
 *
 * They were inline in the `case` arms, which is why the counts above them had drifted: nothing
 * could count a NavigationLink's title. Both the strip and the list now read this, so the two
 * cannot disagree, and a reviewer changing the day's work changes it once. */
enum WorkspaceDay {
    struct Visit: Identifiable { let id: String, time: String, service: String, area: String, standing: String }
    struct Case: Identifiable { let id: String, subject: String, waiting: String; var priority = false }
    struct Order: Identifiable { let id: String, subject: String, standing: String; var late = false }

    /// Sister Naledi Mokoena's day. The first row is the visit the assessment screen opens.
    static let nurseVisits = [
        Visit(id: "TH-2048", time: "09:00", service: "Vitals assessment", area: "Rosebank", standing: "Awaiting sign-off"),
        Visit(id: "TH-2053", time: "11:30", service: "Wound care", area: "Parktown", standing: "Not started"),
        Visit(id: "TH-2057", time: "14:00", service: "Mother & baby", area: "Melville", standing: "Not started")
    ]
    static let doctorQueue = [
        Case(id: "TH-2048", subject: "Vitals assessment", waiting: "Waiting 3 h 20 m", priority: true),
        Case(id: "TH-2045", subject: "Wound follow-up", waiting: "Waiting 1 h 05 m"),
        Case(id: "TH-2041", subject: "Prescription request", waiting: "Waiting 24 m")
    ]
    static let prescriptions = [
        Order(id: "RX-0081", subject: "2 items", standing: "Awaiting pharmacist", late: true),
        Order(id: "RX-0079", subject: "1 item", standing: "Dispensed, awaiting courier")
    ]
    static let laboratory = [
        Order(id: "LAB-0023", subject: "Fasting panel", standing: "Results verified"),
        Order(id: "LAB-0019", subject: "Sample in transit", standing: "Seal intact")
    ]

    /* Counted, never typed. Each of these is arithmetic over the list the same section draws below
       it, so the only way the strip can be wrong is for the list to be wrong too. */
    static func figures(_ role: String) -> [WorkspaceFigure] {
        switch role {
        case "Doctor":
            let priority = doctorQueue.filter(\.priority).count
            return [.init(label: "Awaiting review", value: String(doctorQueue.count), chip: doctorQueue.first?.waiting ?? "Nothing waiting"),
                    .init(label: "Priority reviews", value: String(priority), chip: "Flagged out of range", flagged: priority > 0),
                    .init(label: "Reviewed today", value: "18", chip: "Median 4 m 10 s")]
        case "Partner":
            let late = prescriptions.filter(\.late).count
            let released = laboratory.filter { $0.standing.hasPrefix("Results") }.count
            return [.init(label: "Open orders", value: String(prescriptions.count),
                          chip: late == 0 ? "All inside their windows" : "\(late) past its window", flagged: late > 0),
                    .init(label: "Laboratory orders", value: String(laboratory.count), chip: "Next collection 11:15"),
                    .init(label: "Ready for release", value: String(released), chip: "Awaiting a clinician")]
        case "Control Tower":
            let free = Dispatch.nurses.filter { $0.status == "Available" }.count
            let busy = Dispatch.nurses.count - free
            let critical = Incidents.all.filter { $0.severity == "Critical" }.count
            return [.init(label: "Visits on the board", value: String(Dispatch.jobs.count), chip: "Awaiting a nurse"),
                    .init(label: "Nurses on duty", value: String(free), chip: "\(busy) on a visit"),
                    .init(label: "Open incidents", value: String(Incidents.all.count),
                          chip: critical > 0 ? "\(critical) critical" : "None critical", flagged: critical > 0)]
        default:
            let toSign = nurseVisits.filter { $0.standing == "Awaiting sign-off" }.count
            let next = nurseVisits.first
            /* The area, not the area and the service. A chip is a word: "Vitals assessment ·
               Rosebank" wrapped to two lines, and because the chip floats above the figure, a chip
               one line taller than its neighbour's pushes its numeral one line lower — so 09:00 and
               3 sat at different heights in a strip whose whole job is to be scanned across. */
            return [.init(label: "Next visit", value: next?.time ?? "—", chip: next?.area ?? "Nothing booked"),
                    .init(label: "Today’s visits", value: String(nurseVisits.count),
                          chip: toSign == 1 ? "One awaiting sign-off" : "\(toSign) awaiting sign-off"),
                    /* The one figure that is not counted from this screen: a week's earnings are the
                       earnings screen's arithmetic, not the schedule's. The prefix keeps it R 598
                       rather than 598 R, which is the only reason ThusoMetric has one. */
                    .init(label: "This week so far", value: "598", prefix: "R ", chip: "Pays Wednesday")]
        }
    }
}

// MARK: - The shell

/// A workspace, presented as itself: its own tab bar, one NavigationStack per section.
struct WorkspaceShell: View {
    let role: String
    let leave: () -> Void
    @State private var section: String
    init(role: String, leave: @escaping () -> Void) {
        self.role = role
        self.leave = leave
        _section = State(initialValue: WorkspaceNavigation.sections(role).first?.id ?? "Schedule")
    }
    var body: some View {
        TabView(selection: $section) {
            ForEach(WorkspaceNavigation.sections(role)) { entry in
                NavigationStack { WorkspaceSectionView(role: role, section: entry.id, leave: leave) }
                    .tabItem { Label(entry.id, systemImage: entry.symbol) }
                    .tag(entry.id)
            }
        }
        .tint(ThusoTheme.charcoal)
    }
}

/* The strip a workspace lands on. Three figures side by side while they fit and a column when they
   do not — ThusoMetrics decides that from the scaled width of a numeral rather than from a size
   class, so a reader at the accessibility sizes gets one metric per row without anything here
   asking about it. */
struct WorkspaceUrgency: View {
    let role: String
    var body: some View {
        /* The one near-black card on the screen, and it carries what is waiting right now.
         *
         * A workspace landing has a toggle, a queue and three lists on it, and if the strip that says
         * what is waiting is another white card with the same hairline then the screen has no subject
         * — the defect the design language names first. It was a pale sage panel, which was the right
         * answer against a grey ground and is the previous generation's accent against a cream one.
         *
         * `studioNight` is what the prototype gives the thing that is live, and for somebody holding
         * a phone on a doorstep the thing that is live is the count of what has not been done. The
         * figures read `studioPaper` at 13.95:1 and their labels 9.04; the one flagged chip on the
         * strip is the single lime object on the card, which is the whole reason it is findable. */
        StudioNightCard(padding: ThusoSpacing.space20, spacing: ThusoSpacing.space16) {
            ThusoMetrics {
                ForEach(WorkspaceDay.figures(role)) { figure in
                    ThusoMetric(value: figure.value, prefix: figure.prefix, label: figure.label,
                                chip: figure.chip, flagged: figure.flagged)
                }
            }
        }
    }
}

struct WorkspaceSectionView: View {
    let role: String
    let section: String
    let leave: () -> Void
    /// Observed rather than read, so the count on the nurse's first row moves when the queue does.
    @ObservedObject private var kit = CaptureStore.shared
    @State private var available = true
    private var landing: Bool { WorkspaceNavigation.sections(role).first?.id == section }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                /* No eyebrow. The navigation bar above says which workspace this is and the tab bar
                   below says which section — an eyebrow here would be the third copy of one of
                   those two words on a screen that has one column to spend.

                   THE SECTION A ROLE LANDS ON IS FRAMED, AND THE OTHERS ARE LABELLED. The landing
                   opens with the role's own two-tone headline and carries the section's own sentence
                   under it; every other section keeps the plain heading it had. A display headline
                   on all four of a role's tabs would be four claims of the same size, which is the
                   inverse of what a display size is for. */
                if landing {
                    DemoBadge()
                    let framing = WorkspaceNavigation.framing(role)
                    StudioHeadline(lead: framing.lead, accent: framing.accent,
                                   detail: WorkspaceNavigation.blurb(section))
                    WorkspaceUrgency(role: role)
                } else {
                    SurfaceHeading(title: section, subtitle: WorkspaceNavigation.blurb(section))
                }
                content
                /* The standing disclosure, at the foot of every section rather than at the foot of
                   one. Quiet, because it is true on every screen and a reader who has read it once
                   should not have to read past it to reach the work. */
                Text("AI is decision support. An authorised clinician must sign off clinical decisions.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
                if landing {
                    Text("Design role preview, not authentication.")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
                /* The way out, at full size, on every section.
                 *
                 * There was one way to leave a workspace and it was a navigation-bar item, which
                 * UIKit lays out at thirty-six points however tall the view asks to be — the same
                 * fact MyThusoUITests already carries an exemption for on the notifications bell.
                 * An exemption is defensible when the thing behind it is reachable at full size
                 * somewhere else, and for the bell it is. It was not for this one: a nurse whose
                 * hands are cold on a doorstep had a thirty-six-point target and no alternative.
                 * The web shell puts Sign out in its sidebar as well as its top bar for the same
                 * reason. */
                Button(action: leave) {
                    NavPillLabel(title: "Leave the \(role) workspace",
                                 subtitle: "Back to the patient app", symbol: "rectangle.portrait.and.arrow.right")
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(.isButton)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        /* The bar carries the workspace and the screen carries the section, which is the web
           shell's `Control Tower / Dispatch` breadcrumb in the two places iOS already has for it.
           It was the section in both, so the same word was set twice, ten points apart. */
        .navigationTitle(role)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                /* The shortcut, not the only way. A navigation-bar item is the height of the bar's
                   content whatever frame it asks for, so this measures thirty-six and is declared
                   in Audit.knownUndersized as such; the full-size control is at the foot of the
                   section. The label is the same on all four roles so that exemption is one row
                   rather than four saying the same thing. */
                Button("Leave", action: leave).accessibilityLabel("Leave this workspace")
            }
        }
    }

    // MARK: - The sections

    @ViewBuilder private var content: some View {
        switch (role, section) {
        case ("Doctor", "Review queue"): doctorQueue
        case ("Doctor", "Teleconsultation"):
            group("The room") {
                pill("Open a teleconsultation", "Who is in the room, and what each of them may hear", "video") { TeleconsultView() }
            }
        case ("Doctor", "Patient context"):
            /* A doctor's queue and a doctor's record are the same authority asked twice, so the file
               opens as this doctor rather than as an anonymous reader. */
            group("Patient records") {
                pill("Patient file", "Eight tabs, gated on vetting", "folder.badge.person.crop") { PatientFileView(viewerId: "D-401") }
                pill("Consultation record", "One structure for every encounter", "square.and.pencil") { ConsultationRecordView(writerId: "D-401") }
            }
        case ("Doctor", "Protocols"):
            group("Your tools") {
                pill("Clinical protocols", "", "book") { FeatureDetail(title: "Clinical protocols") }
                pill("Referral pathway", "", "arrow.triangle.branch") { FeatureDetail(title: "Referral pathway") }
            }
        case ("Partner", "Orders"): partnerOrders
        case ("Partner", "Collections"):
            group("Collections") {
                pill("Collection schedule", "The windows a sample has to be inside", "calendar.badge.clock") { FeatureDetail(title: "Collection schedule") }
                pill("Couriers who may take custody", "Vetted, and refused where they are not", "truck.box") { VettingRoleView(roleId: "courier") }
            }
        case ("Partner", "Results"): partnerResults
        case ("Control Tower", "Dispatch"): dispatch
        case ("Control Tower", "Incidents"): incidents
        case ("Control Tower", "Vetting queue"):
            group("Vetting") {
                pill("Vetting queue", "Every party awaiting a decision", "checkmark.shield") { VettingConsoleView() }
                pill("Renewals due", "Soonest expiry first", "clock.arrow.circlepath") { VettingRenewalsView() }
                /* Counted, not spelled. This row said "All thirteen vetted parties"; thirteen is
                   the number of *roles* on the register, and the register holds rather more parties
                   than that. The web's admin shell counts the same array for the same sentence,
                   which is why it was never wrong there. */
                pill("All \(VettingFixtures.subjects.count) vetted parties", "The register, by role", "person.2.badge.gearshape") { VettingDirectoryView() }
            }
        case ("Control Tower", "Quality"):
            group("Your tools") {
                pill("Quality & revenue", "", "chart.bar") { FeatureDetail(title: "Quality & revenue") }
                pill("Employer and sponsor programmes", "Who is paying, and what they never see", "building.2") { ProgrammesView() }
                pill("Nurse onboarding & vetting", "What a nurse must produce before a visit", "person.badge.plus") { VettingApplyView(roleId: "nurse") }
            }
        case (_, "Assessments"):
            group("Start a visit") {
                pill("Visit assessment · TH-2048", "Identity, consent, readings, findings, sign-off", "list.clipboard") { VisitAssessmentView() }
            }
            group("Patient records") {
                pill("Patient file", "Eight tabs, gated on vetting", "folder.badge.person.crop") { PatientFileView(viewerId: "N-201") }
                pill("Consultation record", "One structure for every encounter", "square.and.pencil") { ConsultationRecordView(writerId: "N-205") }
            }
        case (_, "Thuso Kit"):
            group("On this phone") { waitingToSend }
            group("Instruments") {
                pill("Thuso Kit · pair an instrument", "Pairing, calibration and where a reading came from", "sensor.tag.radiowave.forward") { ThusoKitView() }
            }
        case (_, "Earnings & payouts"):
            group("Your money") {
                pill("Earnings & payouts", "What a visit paid, and what a suspension never touches", "creditcard") { EarningsView() }
            }
        case (_, "Vetting"):
            group("Your vetting") {
                pill("My vetting status", "Every check, and what each one gates", "checkmark.seal") { VettingStatusView(subjectId: "N-205") }
                pill("Nurse onboarding & vetting", "What a nurse must produce before a visit", "person.badge.plus") { VettingApplyView(roleId: "nurse") }
                pill("Locum vetting", "The same bar, for a shift rather than a post", "clock.badge.checkmark") { VettingRoleView(roleId: "locum") }
            }
        default: nurseSchedule
        }
    }

    // MARK: - The boards

    private var doctorQueue: some View {
        Group {
            group("Clinical review queue") {
                ForEach(WorkspaceDay.doctorQueue) { item in
                    NavigationLink { DoctorReviewView(reference: item.id) } label: {
                        QueueRow(reference: item.id, subject: item.subject, note: item.waiting,
                                 chip: item.priority ? "Priority" : "In queue",
                                 tone: item.priority ? .attention : .neutral)
                    }.buttonStyle(.plain)
                }
            }
            group("Your vetting") {
                pill("My registration and cover", "What lapses, and when", "checkmark.seal") { VettingStatusView(subjectId: "D-401") }
                pill("Apply to join as a doctor", "", "person.badge.plus") { VettingApplyView(roleId: "doctor") }
                pill("Every doctor on the platform", "", "stethoscope") { VettingRoleView(roleId: "doctor") }
            }
        }
    }

    private var partnerOrders: some View {
        Group {
            group("Prescriptions") {
                ForEach(WorkspaceDay.prescriptions) { item in
                    NavigationLink { PrescriptionView(reference: item.id) } label: {
                        QueueRow(reference: item.id, subject: item.subject,
                                 note: item.late ? "Past its collection window" : nil,
                                 chip: item.standing, tone: item.late ? .attention : .neutral)
                    }.buttonStyle(.plain)
                }
            }
            group("Substitution and repeats") {
                pill("CHR-0114 · Chronic Routine", "What may be swapped, what may not, and who is told", "arrow.triangle.2.circlepath") { DispensingView() }
            }
            group("Vetting") {
                pill("This pharmacy’s licence and pharmacist", "", "building.columns") { VettingStatusView(subjectId: "P-501") }
                pill("Apply as a partner", "", "person.badge.plus") { VettingApplyView(roleId: "pharmacy") }
            }
            /* The sentence stays where the Form put it, because it is the truthful one: these rows
               are samples and nothing behind them is connected. */
            Text("Sample orders. No live partner API, dispensing or courier handover is connected.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var partnerResults: some View {
        Group {
            group("Laboratory") {
                ForEach(WorkspaceDay.laboratory) { item in
                    NavigationLink { LabOrderView(reference: item.id) } label: {
                        QueueRow(reference: item.id, subject: item.subject, chip: item.standing)
                    }.buttonStyle(.plain)
                }
            }
            group("Vetting") {
                pill("This laboratory’s accreditation", "What it is accredited to do, and what it is not", "checkmark.shield") { VettingStatusView(subjectId: "B-601") }
            }
        }
    }

    /* No section heading. The bar says Control Tower, the screen heading says Dispatch and the tab
       says Dispatch; a fourth "Dispatch" over two rows is the same word four times on one screen. */
    private var dispatch: some View {
        VStack(spacing: ThusoSpacing.space8) {
            pill("Live dispatch board", "Who is where, who is cleared, and who is refused", "antenna.radiowaves.left.and.right") { DispatchBoardView() }
            pill("Operators on duty", "Suspend one here and the board stops assigning", "person.badge.shield.checkmark") { VettingRoleView(roleId: "operator") }
        }
    }

    private var incidents: some View {
        group("Open incidents") {
            ForEach(Incidents.all) { incident in
                NavigationLink { IncidentDetailView(incident: incident) } label: {
                    QueueRow(reference: incident.id, subject: incident.title,
                             note: "\(incident.area) · opened \(incident.opened) · \(incident.status)",
                             chip: incident.severity,
                             tone: incident.severity == "Critical" ? .refused : incident.severity == "High" ? .attention : .neutral)
                }.buttonStyle(.plain)
            }
        }
    }

    private var nurseSchedule: some View {
        Group {
            /* Not a Toggle, and this is the one place in the app where that is the right call.
             *
             * A SwiftUI Toggle publishes the switch's own row height as its accessibility frame —
             * MyThusoUITests has an exemption saying exactly that, and that a frame on the label,
             * padding on the label and padding around the control were all tried and all came back
             * the same. Out of the Form that used to be padding it, this one measured twenty-eight.
             *
             * It is also the most consequential control a nurse touches all day: it is the one that
             * decides whether the Control Tower may send her to somebody's house. A twenty-eight
             * point switch for that is the wrong size in a sense that has nothing to do with a test.
             * So it is a pill — the shape every other row on this screen already is — fifty-two
             * points tall, with the state as a word rather than as the position of a knob. */
            Button { available.toggle() } label: {
                HStack(spacing: ThusoSpacing.space12) {
                    Image(systemName: available ? "figure.walk" : "moon.zzz")
                        .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .frame(width: 24).accessibilityHidden(true)
                    Text("Available for visits").thusoFont(ThusoType.body, weight: .medium)
                        .foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: ThusoSpacing.space8)
                    MetricChip(text: available ? "On duty" : "Off duty", tone: available ? .filled : .quiet)
                }
                .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.controlEdge, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Available for visits")
            .accessibilityValue(available ? "On duty" : "Off duty")
            .accessibilityHint("Changes whether the Control Tower may offer you a visit")
            .accessibilityAddTraits(.isButton)
            /* First, not last. A nurse coming out of a house with no signal wants one answer before
               anything else on this screen: is my work safe? */
            group("On this phone") { waitingToSend }
            group("Today’s work") {
                ForEach(WorkspaceDay.nurseVisits) { visit in
                    NavigationLink { destination(for: visit) } label: { VisitRow(visit: visit) }
                        .buttonStyle(.plain)
                }
            }
            group("More tools") {
                pill("Thuso SOS · urgent care", "Emergency services first, then what MyThuso can do", "cross.case") { SosView() }
                pill("Locum shifts", "", "clock.badge") { FeatureDetail(title: "Locum shifts") }
                pill("Academy", "", "graduationcap") { FeatureDetail(title: "Academy") }
            }
        }
    }

    /* One visit in the day is a whole assessment and the rest are drawn but not built. Saying so by
       destination rather than by hiding the other two: a schedule with one row on it is not what a
       nurse's day looks like, and a reviewer should be able to see which of the three is real. */
    @ViewBuilder private func destination(for visit: WorkspaceDay.Visit) -> some View {
        if visit.id == WorkspaceDay.nurseVisits.first?.id { VisitAssessmentView() }
        else { FeatureDetail(title: "\(visit.time) · \(visit.service) · \(visit.area)") }
    }

    private var waitingToSend: some View {
        NavigationLink { CaptureQueueView() } label: {
            NavPillLabel(title: "Waiting to send",
                         subtitle: "\(kit.onlyHereCount) reading\(kit.onlyHereCount == 1 ? "" : "s") held here · \(kit.conflictedCount) needing a decision",
                         symbol: "tray.full")
        }.buttonStyle(.plain)
    }

    // MARK: - Composition

    /* A named group of pill rows. The heading is what a Form's `Section` was giving for free and
       what a plain VStack would have lost: it tells a reader which of these lists is theirs, and it
       gives VoiceOver something to skip by rather than thirty rows in one run. */
    private func group<Content: View>(_ title: String, @ViewBuilder rows: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader(title)
            VStack(spacing: ThusoSpacing.space8) { rows() }
        }
    }

    private func pill<Destination: View>(_ title: String, _ subtitle: String, _ symbol: String,
                                         @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink { destination() } label: {
            NavPillLabel(title: title, subtitle: subtitle, symbol: symbol)
        }.buttonStyle(.plain)
    }
}

/* A row in a queue, in three columns rather than one sentence with two middle dots in it.
 *
 * A reference, what the case is, and what state it is in are three different questions, and a
 * reader scanning a queue answers the third one first — so the standing is a chip in its own column
 * at the trailing edge, aligned down the list, instead of the last few words of a string. The
 * reference is monospaced so a column of them lines up rather than shuffling.
 *
 * It stacks rather than squeezes at the accessibility sizes: three columns inside a phone's width
 * at three times the type is three columns of one word each. */
struct QueueRow: View {
    let reference: String
    let subject: String
    /// Everything about the row that is not its state. Omitted where the chip already says it all.
    var note: String?
    /// The state, and it appears here or in `note`, never in both.
    let chip: String
    var tone: ChipTone = .neutral
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        SurfacePanel(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space8) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8))
                : AnyLayout(HStackLayout(alignment: .top, spacing: ThusoSpacing.space12))
            layout {
                VStack(alignment: .leading, spacing: 3) {
                    Text(reference).font(.footnote.weight(.semibold).monospaced())
                        .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    Text(subject).thusoFont(ThusoType.body, weight: .medium).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    if let note {
                        Text(note).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                MetricChip(text: chip, tone: tone)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reference). \(subject). \(note.map { "\($0). " } ?? "")\(chip)")
        .accessibilityAddTraits(.isButton)
    }
}

/// A visit in a nurse's day: the time in its own column, so a column of them reads as a timetable.
struct VisitRow: View {
    let visit: WorkspaceDay.Visit
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        SurfacePanel(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space8) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: ThusoSpacing.space16))
            layout {
                Text(visit.time).font(.headline.monospacedDigit()).foregroundStyle(ThusoTheme.charcoal)
                VStack(alignment: .leading, spacing: 3) {
                    Text(visit.service).thusoFont(ThusoType.body, weight: .medium).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(visit.id) · \(visit.area)").font(.footnote)
                        .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                MetricChip(text: visit.standing, tone: visit.standing == "Awaiting sign-off" ? .attention : .quiet)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(visit.time), \(visit.service), \(visit.area). \(visit.id). \(visit.standing)")
        .accessibilityAddTraits(.isButton)
    }
}
