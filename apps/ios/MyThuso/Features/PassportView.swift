import SwiftUI

struct PassportView: View {
    @State private var tab = "Overview"
    @State private var share = false
    @State private var recordFilter = "All records"
    /* The content, not the refusal. This opened on .denied, which put a "we need your permission
       first" block in front of the two device screens the tab exists to reach — and those screens
       are the ones that say what a permission would and would not cover. The denied state is still
       one tap away in the picker, where a state to be reviewed belongs. */
    @State private var deviceState: LoadState = .ready
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                hero
                SectionTabs(sections: ["Overview", "Records", "Medications", "More"], selection: $tab)
                switch tab {
                case "Records":
                    recordTimeline
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        NavigationLink { PastVisitView(service: CareService.all[1]) } label: { MenuRow(title: "Visit summary", subtitle: "What the nurse found, and what the doctor said about it", symbol: "doc.text") }.buttonStyle(.plain)
                        Divider().overlay(ThusoTheme.studioLine)
                        NavigationLink { LabOrderView() } label: { MenuRow(title: "Laboratory results", subtitle: "Fasting panel · Released", symbol: "flask") }.buttonStyle(.plain)
                        Divider().overlay(ThusoTheme.studioLine)
                        NavigationLink { ReadingsExplainedView() } label: { MenuRow(title: "What your readings mean", subtitle: "Seven measurements, in words, written by a person", symbol: "text.book.closed") }.buttonStyle(.plain)
                        Divider().overlay(ThusoTheme.studioLine)
                        NavigationLink { FeatureDetail(title: "Medical certificate") } label: { MenuRow(title: "Medical certificate", subtitle: "Doctor reviewed · Demo", symbol: "checkmark.seal") }.buttonStyle(.plain)
                    }
                case "Medications":
                    EmptyStateCard(title: "No active prescriptions", message: "Prescriptions appear here after a registered doctor issues them.")
                    NavigationLink { PrescriptionView() } label: { Text("Preview a sample prescription") }.buttonStyle(QuietButton())
                case "More":
                    StatePicker(title: "Preview the device permission state", state: $deviceState)
                    StateBlock(state: deviceState, subject: "Readings from your connected devices", permission: "Apple Health access", retry: { deviceState = .ready }) {
                        CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                            NavigationLink { DevicePermissionView(integration: DeviceIntegration.of("apple-health")) } label: { MenuRow(title: "Apple Health", subtitle: "Exactly what would be read, and what never would", symbol: "heart.circle") }.buttonStyle(.plain)
                            Divider().overlay(ThusoTheme.studioLine)
                            NavigationLink { DevicePermissionView(integration: DeviceIntegration.of("thuso-kit")) } label: { MenuRow(title: "Thuso Kit", subtitle: "The instruments a nurse brings, and how a reading is filed", symbol: "sensor") }.buttonStyle(.plain)
                        }
                    }
                    CareCard {
                        Toggle("Demo access for Dr. A. Dlamini", isOn: $share).font(.subheadline)
                        Text(share ? "Demo access active for 24 hours. Turn off to revoke. No real access is granted." : "No active shares. You control who sees your records.")
                            .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                default:
                    /* Where things stand today, before any curve. Somebody opening their passport
                       wants the current number first and the shape of it second — the reverse is a
                       chart they have to decode to answer "am I all right".

                       Every figure, label and range below comes out of Passport.swift, which reads
                       the assessment's own observations. The three charts that used to be here were
                       literal arrays dated "12 Aug" through "4 Sep": right the week they were typed
                       and a year wrong by the following winter. */
                    lastVisit
                    /* The question a person opens their passport with, which seven ranges and no
                       words never answered. It sits above the charts because "what does this mean"
                       comes before "how has it moved". */
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        NavigationLink { ReadingsExplainedView() } label: {
                            MenuRow(title: "What your readings mean",
                                    subtitle: "What each measurement is, and who decides what it means for you",
                                    symbol: "text.book.closed", tinted: true)
                        }.buttonStyle(.plain)
                    }
                    CareSectionHeader(title: "Health trends") {
                        NavigationLink("See all") { HealthTrendsView() }
                    }
                    ForEach(Passport.headline.prefix(2)) { observation in
                        ClinicalChart(title: observation.label, unit: observation.unit,
                                      readings: Passport.series(observation), normal: observation.range,
                                      decimals: Passport.decimals(observation),
                                      symbol: Passport.symbol(observation.id))
                    }
                    /* Three tiles side by side while they fit, and a column when the text has
                       grown past the point where three labels share one line. */
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: ThusoSpacing.space8) { passportActions }
                        VStack(spacing: ThusoSpacing.space8) { passportActions }
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Health Passport").navigationBarTitleDisplayMode(.large)
    }
    private var recordTimeline: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your care timeline").font(.title2.weight(.semibold))
            Text("Sample records, newest first. Recorded readings and a doctor’s review are separate events.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            SectionTabs(sections: ["All records", "Readings", "Reviews"], groupLabel: "Record filters", selection: $recordFilter)
            if recordFilter != "Readings" {
                NavigationLink { PastVisitView(service: CareService.all[1]) } label: {
                    CareCard {
                        Label(Scheduling.longDate(Passport.lastReview.date), systemImage: "checkmark.bubble").font(.footnote)
                        Text("Doctor review completed").font(.headline)
                        Text(Passport.reviewer.attribution).font(.subheadline)
                        Text(Passport.lastReview.next).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                }.buttonStyle(.plain)
            }
            if recordFilter != "Reviews" {
                ForEach(Passport.readingSets.sorted { $0.dayOffset > $1.dayOffset }) { reading in
                    NavigationLink { HealthTrendsView() } label: {
                        CareCard {
                            Label(Scheduling.longDate(reading.date), systemImage: "heart.text.square").font(.footnote)
                            Text("Home visit readings").font(.headline)
                            Text("\(Passport.measured(in: reading).count) measurements recorded").font(.subheadline)
                            if let note = reading.note { Text(note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted) }
                            Text("Recorded · Open health trends").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                    }.buttonStyle(.plain)
                }
            }
        }.sensoryFeedback(.selection, trigger: recordFilter)
    }

    /// The last visit as four metrics and one way into it. A chip above a thin numeral with its
    /// name below — the same shape a figure takes on every other screen in this product.
    private var lastVisit: some View {
        let latest = Passport.latestSet
        let measures = Passport.measured(in: latest).filter { Passport.headlineIds.contains($0.id) }
        let outside = measures.filter { !Passport.flag($0, latest.values[$0.id]!).isNormal }
        return SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            PanelHead(title: "Your last visit", note: Scheduling.longDate(latest.date)) {
                NavigationLink { PastVisitView(service: CareService.all[1]) } label: {
                    OpenCircle(label: "Open what the nurse found at your last visit")
                }
            }
            ThusoMetrics {
                ForEach(measures) { observation in
                    let value = latest.values[observation.id]!
                    let flag = Passport.flag(observation, value)
                    ThusoMetric(value: Passport.format(observation, value), unit: observation.unit,
                                label: observation.label, chip: flag.chip, flagged: !flag.isNormal)
                }
            }
            Text(outside.isEmpty
                 ? "Every reading taken at that visit sits inside its indicative reference range."
                 : "\(outside.count) reading\(outside.count == 1 ? "" : "s") sat outside the indicative range. A reading outside a range is something to look at, not a diagnosis.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var passportActions: some View {
        Button { share = true } label: { tileFace("Share record", "square.and.arrow.up") }.buttonStyle(.plain)
        ShareLink(item: "MyThuso fictional passport: BP 118/78 mmHg, pulse 72 bpm, glucose 5.2 mmol/L. Demo only, not a medical record.") {
            tileFace("Export sample", "arrow.down.doc")
        }.buttonStyle(.plain)
        NavigationLink { CareClinicianProfile(doctor: true) } label: { tileFace("Doctors", "person.2") }.buttonStyle(.plain)
    }
    private func tileFace(_ title: String, _ symbol: String) -> some View {
        VStack(spacing: ThusoSpacing.space8) {
            Image(systemName: symbol).font(.title3).foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity).padding(.vertical, ThusoSpacing.space16).frame(minHeight: 76)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.controlEdge, lineWidth: 1))
        .contentShape(Rectangle())
    }
    private var hero: some View {
        ZStack(alignment: .leading) {
            NightPanel()
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    StatusPill(text: "Thuso Pass", tone: "light")
                    Text("Your health.\nYour story.").font(.title2.weight(.bold)).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Lerato Molefe").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        Text("ID: TH-2048-3920").font(.caption).foregroundStyle(.white.opacity(0.78))
                    }
                }
                Spacer(minLength: 0)
                Image("Patient").resizable().scaledToFill().frame(width: 76, height: 76).accessibilityHidden(true)
                    .clipShape(Circle()).overlay(Circle().stroke(.white.opacity(0.22), lineWidth: 2)).accessibilityHidden(true)
            }.padding(ThusoSpacing.space20)
        }
        .frame(minHeight: 150)
        .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
/* The four sections of the Health Passport, as four tap targets.
 *
 * They were a segmented Picker, and a segmented control is thirty-two points tall at every content
 * size: the height is intrinsic to UISegmentedControl and .frame(height: 44) pads the SwiftUI view
 * around it without stretching the segments. So all four sat under the forty-four points Apple's own
 * guidelines set for a control, with an exemption written for them in MyThusoUITests — and unlike
 * the notification bell there is no second route to what is behind them, so the exemption was
 * standing in front of the only way in. A pill built out of a Button has the frame a thumb has to
 * hit as its own frame, and it is the pill the web already draws for the same four sections: a
 * surface ground and a hairline border when it is not chosen, charcoal with white text when it is.
 *
 * When four pills no longer share a line the strip wraps to a column rather than scrolling
 * sideways. A sideways scroller would carry Medications and More off the edge with nothing on
 * screen to say they are still there, and the reader who loses them is the one who turned their
 * text up — the reader this is being changed for. A column is also the answer this app already
 * gives everywhere it runs out of width: the passport's own action tiles, the home's chips and
 * CareSectionHeader all fall from a row to a column through ViewThatFits.
 */
struct SectionTabs: View {
    let sections: [String]
    var groupLabel = "Passport sections"
    @Binding var selection: String
    /* A capsule's ends curve in by half its height, so a label that has wrapped to two lines is cut
       off by its own background. Past the accessibility sizes it becomes a rounded chip instead —
       the same trade StatusPill makes, for the same reason. */
    @Environment(\.dynamicTypeSize) private var typeSize
    private var shape: AnyShape {
        typeSize.isAccessibilitySize ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)) : AnyShape(Capsule())
    }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            /* Across the row each pill is only as wide as its own words. Sharing the width out
               equally, the way a segmented control does, gives every pill the width of the shortest
               one plus a quarter of the slack — which is under what "Medications" needs, so the
               word broke across two lines while "More" sat in twice the space it wanted. */
            HStack(spacing: ThusoSpacing.space8) { pills(filling: false) }
            VStack(spacing: ThusoSpacing.space8) { pills(filling: true) }
        }
        .sensoryFeedback(.selection, trigger: selection)
        /* The Picker carried the name of the group; four loose buttons would not, so it is said
           here rather than lost. `children: .contain` leaves each pill its own element. */
        .accessibilityElement(children: .contain)
        .accessibilityLabel(groupLabel)
    }
    @ViewBuilder private func pills(filling: Bool) -> some View {
        ForEach(sections, id: \.self) { section in
            let chosen = section == selection
            Button { selection = section } label: {
                /* A semantic style, not a point size: .footnote is the thirteen points the web gives
                   this control and it is the only way the label answers Dynamic Type at all. */
                Text(section).font(.footnote.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(chosen ? ThusoTheme.studioPaper : ThusoTheme.charcoal)
                    .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
                    /* Where the forty-four points are actually met — on the button's own frame,
                       which is the frame XCUITest measures and a thumb has to find. */
                    .frame(maxWidth: filling ? .infinity : nil, minHeight: 44)
                    .background(chosen ? ThusoTheme.studioNight : ThusoTheme.surface, in: shape)
                    .overlay(shape.stroke(chosen ? ThusoTheme.studioNight : ThusoTheme.studioLine, lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            /* Chosen is said, not only drawn. Colour alone leaves a reader who cannot see it, or
               who is listening to the screen, with four identical buttons. */
            .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
        }
    }
}

struct FamilyView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var name = ""
    var body: some View {
        List {
            Section { Text("Care for your whole circle.").font(.title2.weight(.semibold)); Text("Record access requires verified authority and consent.").foregroundStyle(.secondary) }
            Section("Your family") { ForEach(Array(store.family.enumerated()), id: \.offset) { _, member in NavigationLink(member) { FeatureDetail(title: "Care for \(member)") } } }
            Section("Add a fictional member") {
                TextField("Display name", text: $name)
                Button("Add demo family member") { store.family.append(String(name.trimmingCharacters(in: .whitespaces).prefix(60))); name = "" }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Section("Guardians and shared access") {
                if store.invitations.isEmpty {
                    EmptyStateCard(title: "Nobody else has access", message: "When you invite a guardian or a family member, their access appears here with exactly what they can see and when it ends.").listRowInsets(EdgeInsets())
                }
                ForEach($store.invitations) { $invitation in
                    VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                        HStack { Text("\(invitation.name) · \(invitation.relationship)").font(.subheadline.weight(.semibold)); Spacer(); Text(invitation.status).font(.caption).foregroundStyle(invitation.status == "Active" ? ThusoTheme.charcoal : .secondary) }
                        Text("\(invitation.scope) · Ends: \(invitation.expires)").font(.caption).foregroundStyle(.secondary)
                        Button("Revoke") { invitation.status = "Revoked" }.font(.caption).disabled(invitation.status == "Revoked")
                    }
                    .padding(.vertical, 3)
                }
                NavigationLink("Invite someone") { InviteGuardianView() }
                NavigationLink("Guardian verification") { VettingStatusView(subjectId: "G-031") }
                /* A household is where somebody would look for this, and where the guardian flow's
                   promise is easiest to undo — so it is reachable from here, not only from the
                   design-review list. */
                NavigationLink("The household record") { HouseholdView() }
            }
            Section { Text("Paying for care does not grant access to someone’s health records. Revoking takes effect immediately and the other person is told.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle("Your circle of care")
    }
}
struct PrivacyView: View {
    @EnvironmentObject private var store: PreviewStore
    var body: some View { Form { Section { CareHeading(eyebrow: "Your privacy matters", title: "Your data. Your choices.", subtitle: "Demo settings reset when the app restarts.") }; Section("Optional preferences") { Toggle("Care reminders", isOn: $store.reminders); Toggle("Wearable readings", isOn: $store.wearableSharing); Toggle("Product updates", isOn: $store.marketing) }; Section("Your rights") { ForEach(["Access history", "Request a correction", "Request account deletion", "Information Officer"], id: \.self) { item in NavigationLink(item) { FeatureDetail(title: item) } } }; Section { Text("Production POPIA compliance requires lawful processing, governance, verified access controls and a clinical retention schedule. These controls are UI previews.").font(.caption).foregroundStyle(.secondary) } }.navigationTitle("Privacy & settings") }
}
struct PlansView: View {
    private let plans = [("Chronic Routine", "R199 / month", "Monthly check-ins and doctor review"), ("Family Planning", "R99 / month", "Scheduled visits and discreet reminders"), ("Thuso Mom", "R249 / month", "Support for pregnancy and baby’s first year"), ("Thuso Senior", "R699 / month", "Weekly care and family support"), ("Thuso Recover", "Custom pricing", "Personalised post-discharge support")]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CareHeading(eyebrow: "Thuso Routine", title: "A healthier rhythm.", subtitle: "Proposal pricing · Phase 2–3 preview")
                CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                    ForEach(Array(plans.enumerated()), id: \.element.0) { index, plan in
                        NavigationLink { FeatureDetail(title: plan.0) } label: { planRow(plan) }.buttonStyle(.plain)
                        if index < plans.count - 1 { Divider().overlay(ThusoTheme.studioLine) }
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Care plans")
    }
    /* One row per plan: the name, what it includes and what it costs. Five equally weighted cards
       with a heart on each of them told a reader nothing about which plan was which. */
    private func planRow(_ plan: (String, String, String)) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Text(plan.2).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: ThusoSpacing.space8)
            Text(plan.1).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .multilineTextAlignment(.trailing).fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.studioInkMuted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44).contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
struct WalletView: View {
    var body: some View { List { Section { Label("THUSO WALLET", systemImage: "creditcard").foregroundStyle(ThusoTheme.charcoal); Text("R500.00").font(.largeTitle.weight(.semibold)); Text("Demo balance · No financial account").font(.caption).foregroundStyle(.secondary) }; Section { NavigationLink("Top up") { FeatureDetail(title: "Top up wallet") }; NavigationLink("Sponsor care") { VettingStatusView(subjectId: "S-021") } }; Section("Sample activity") { LabeledContent("Family care credit", value: "+ R500"); LabeledContent("Vitals visit", value: "− R249") } }.navigationTitle("Thuso Wallet") }
}
struct NotificationsView: View {
    var body: some View { List { Section("Sample notifications") { Label("Your Saturday visit is confirmed.", systemImage: "calendar"); Label("Your visit summary is ready.", systemImage: "doc.text"); Label("Explore regular check-ins with Thuso Routine.", systemImage: "heart") } }.navigationTitle("Notifications") }
}
/// A role, in a shape `fullScreenCover(item:)` can present.
struct WorkspaceEntry: Identifiable { let id: String }

struct MoreView: View {
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    @State private var workspace: WorkspaceEntry?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                NavigationLink { PrivacyView() } label: {
                    CareCard(weight: .lead) {
                        HStack(spacing: ThusoSpacing.space12) {
                            Image("Patient").resizable().scaledToFill().frame(width: 52, height: 52).accessibilityHidden(true).clipShape(Circle()).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Lerato Molefe").font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                                Text("View and edit your profile").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                            }
                            Spacer(minLength: ThusoSpacing.space8)
                            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.studioInkMuted)
                                .accessibilityHidden(true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }.buttonStyle(.plain)
                group("Your care") {
                    row("Live well", "What you did, in your own words — and the ten things this will never say about it", "book.closed") { LiveWellView() }
                    row("Assistant", "An ambient picture of what needs you", "sparkles") { AssistantView() }
                    row("My family", "Manage your loved ones", "person.2") { FamilyView() }
                    row("Care you pay for", "What sponsoring somebody's care shows you, and what it never will", "hand.raised.fingers.spread") { SponsoredCareView() }
                    row("Care plans", "Ongoing care and subscriptions", "heart.text.square") { PlansView() }
                    row("Payments", "Cards, history and refunds", "creditcard") { WalletView() }
                }
                group("Your account") {
                    row("Notifications", "Visit updates and messages", "bell") { NotificationsView() }
                    row("Privacy & settings", "Your data and app preferences", "slider.horizontal.3") { PrivacyView() }
                    row("Language", "Read MyThuso your way", "globe") { LanguageView() }
                }
                group("Design review", note: "Screens built to be examined rather than used. Nothing here books, pays or contacts anybody.") {
                    Button(action: firstRun) { MenuRow(title: "First-run & recovery", subtitle: "Sign-up, one-time code and lost access", symbol: "person.badge.plus") }.buttonStyle(.plain)
                    row("Vetting", "Every party that must be vetted, and what each is refused", "checkmark.shield") { VettingDirectoryView() }
                    row(thuso(.patientFile, store.locale), "Eight tabs, gated on vetting — the same file four different ways", "folder.badge.person.crop") { PatientFileView() }
                    row(thuso(.consultationRecord, store.locale), "One structure for every encounter, in long form or SOAP", "square.and.pencil") { ConsultationRecordView() }
                    row(thuso(.householdRecord, store.locale), "One household, and what each member may see of the others", "house") { HouseholdView() }
                    row(thuso(.healthSummary, store.locale), "The shareable summary, bound to a purpose and a period", "square.and.arrow.up") { HealthSummaryView() }
                    row("Thuso Kit", "Pairing, calibration and where a reading came from", "sensor.tag.radiowave.forward") { ThusoKitView() }
                    row("The visit, waiting", "Offline capture of a whole visit — identity, consent, readings, findings, sign-off", "tray.full") { VisitQueueView() }
                    row("Readings waiting to send", "One reading at a time, and the four conflicts nobody merges", "waveform.path.ecg") { CaptureQueueView() }
                    row("System states", "Loading, error, offline and denied", "square.stack.3d.up") { SystemStatesView() }
                    row("Explore the roadmap", "All 21 modules in the proposal", "square.grid.2x2") { RoadmapView() }
                }
                /* A workspace is entered, not pushed. Each opens over the patient's tab bar with a
                   tab bar of its own, because a nurse's sections are not a shopper's and putting
                   one inside the other is how the two got confused in the first place. */
                group("Workspace previews") {
                    workspaceRow("Nurse workspace", "Visits, assessment and vetting", "cross.case", role: "Nurse")
                    workspaceRow("Doctor workspace", "Review queue and sign-off", "stethoscope", role: "Doctor")
                    workspaceRow("Partner workspace", "Pharmacy and laboratory orders", "pills", role: "Partner")
                    workspaceRow("Control Tower", "Dispatch, incidents and vetting", "antenna.radiowaves.left.and.right", role: "Control Tower")
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        Button(action: firstRun) { MenuRow(title: "Log out", subtitle: "Returns to the first-run flow — this preview has no account", symbol: "rectangle.portrait.and.arrow.right", danger: true) }.buttonStyle(.plain)
                    }
                    Text("Native SwiftUI design preview. All data is fictional and held only in memory.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("More").navigationBarTitleDisplayMode(.large)
        .fullScreenCover(item: $workspace) { entry in
            WorkspaceShell(role: entry.id) { workspace = nil }.environmentObject(store)
        }
    }
    /* A named group of rows. The name is what was missing: a heading tells a reader which of these
       lists is theirs and which is here to be reviewed, and it gives VoiceOver something to skip
       by rather than forty rows in one run. */
    private func group<Content: View>(_ title: String, note: String = "", @ViewBuilder rows: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader(title)
            if !note.isEmpty {
                Text(note).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true).padding(.bottom, ThusoSpacing.space4)
            }
            VStack(spacing: ThusoSpacing.space8) { rows() }
        }
    }
    /* A destination is a pill: symbol, label, and a circular arrow at the trailing edge. It was a
       row inside a card with a hairline under it, which is the shape of a settings list — and this
       screen is not a settings list, it is where every part of the product is reached from. The
       pills are also the only place in the app a reader can see at a glance how many destinations
       there are, because each one is its own object rather than a band inside one long card. */
    private func row<Destination: View>(_ title: String, _ subtitle: String, _ symbol: String, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink { destination() } label: {
            NavPillLabel(title: title, subtitle: subtitle, symbol: symbol)
        }.buttonStyle(.plain)
    }
    private func workspaceRow(_ title: String, _ subtitle: String, _ symbol: String, role: String) -> some View {
        Button { workspace = WorkspaceEntry(id: role) } label: {
            NavPillLabel(title: title, subtitle: subtitle, symbol: symbol)
        }.buttonStyle(.plain)
    }
}
/* Explore. This is where the rotating banner lives now.
 *
 * It used to open the patient's home, roughly two thirds of a phone screen tall, standing between
 * somebody who had come to book a nurse and the four services they could have booked. Rotating
 * promotion is what this screen is for, so it is promotion here rather than an obstacle there. It
 * keeps its pause control either way — WCAG 2.2.2 — and it still refuses to rotate at all when the
 * system asks for reduced motion. */
struct RoadmapView: View {
    @State private var openPassport = false
    @State private var openServices = false
    private let features = ["Thuso Screen", "Thuso Wear", "Thuso Pharmacy", "Thuso Labs", "Thuso SOS", "Thuso Corner", "Thuso Work", "Thuso Locum", "Thuso Academy", "Thuso Money", "Thuso Cover", "Thuso Devices", "Thuso Kit", "Thuso AI", "Thuso Doctor"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CareHeading(eyebrow: "The MyThuso family", title: "More ways to be cared for.", subtitle: "Availability follows the proposal’s phased roadmap.")
                HeroCarousel { position in if position == 1 { openPassport = true } else { openServices = true } }
                CareSectionHeader("Every module in the proposal")
                CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                    ForEach(Array(features.enumerated()), id: \.offset) { index, feature in
                        /* Thuso Kit is no longer a row that opens a paragraph about a later phase.
                           It is built, so the roadmap sends you to the thing rather than to a
                           promise about it. */
                        if feature == "Thuso Kit" {
                            NavigationLink { ThusoKitView() } label: { MenuRow(title: feature, subtitle: "Built — pairing, calibration and provenance", symbol: "sensor.tag.radiowave.forward") }.buttonStyle(.plain)
                        } else if feature == "Thuso SOS" {
                            NavigationLink { SosView() } label: { MenuRow(title: feature, subtitle: "Emergency services first, then what MyThuso can actually do", symbol: "cross.case") }.buttonStyle(.plain)
                        } else {
                            NavigationLink { FeatureDetail(title: feature) } label: { MenuRow(title: feature, subtitle: "", symbol: "square.grid.2x2") }.buttonStyle(.plain)
                        }
                        if index < features.count - 1 { Divider().overlay(ThusoTheme.studioLine) }
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Roadmap").navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $openPassport) { PassportView() }
        .navigationDestination(isPresented: $openServices) { ServicesView() }
    }
}
