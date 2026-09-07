import SwiftUI

struct PassportView: View {
    @State private var tab = "Overview"
    @State private var share = false
    @State private var deviceState: LoadState = .denied
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                hero
                Picker("Passport sections", selection: $tab) { ForEach(["Overview", "Records", "Medications", "More"], id: \.self) { Text($0) } }
                    .pickerStyle(.segmented)
                    .sensoryFeedback(.selection, trigger: tab)
                switch tab {
                case "Records":
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        NavigationLink { FeatureDetail(title: "Visit summary") } label: { MenuRow(title: "Visit summary", subtitle: "Fictional document · 4 September", symbol: "doc.text") }.buttonStyle(.plain)
                        Divider().overlay(ThusoTheme.line)
                        NavigationLink { LabOrderView() } label: { MenuRow(title: "Laboratory results", subtitle: "Fasting panel · Released", symbol: "flask") }.buttonStyle(.plain)
                        Divider().overlay(ThusoTheme.line)
                        NavigationLink { FeatureDetail(title: "Medical certificate") } label: { MenuRow(title: "Medical certificate", subtitle: "Doctor reviewed · Demo", symbol: "checkmark.seal") }.buttonStyle(.plain)
                    }
                case "Medications":
                    EmptyStateCard(title: "No active prescriptions", message: "Prescriptions appear here after a registered doctor issues them.")
                    NavigationLink { PrescriptionView() } label: { Text("Preview a sample prescription") }.buttonStyle(QuietButton())
                case "More":
                    StatePicker(title: "Preview the device permission state", state: $deviceState)
                    StateBlock(state: deviceState, subject: "Readings from your connected devices", permission: "Apple Health access", retry: { deviceState = .ready }) {
                        CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                            NavigationLink { FeatureDetail(title: "Apple Health connection") } label: { MenuRow(title: "Apple Health", subtitle: "Choose exactly which readings you share", symbol: "heart.circle") }.buttonStyle(.plain)
                            Divider().overlay(ThusoTheme.line)
                            NavigationLink { FeatureDetail(title: "Thuso Kit") } label: { MenuRow(title: "Thuso Kit", subtitle: "Connected diagnostic capture", symbol: "sensor") }.buttonStyle(.plain)
                        }
                    }
                    CareCard {
                        Toggle("Demo access for Dr. A. Dlamini", isOn: $share).font(.subheadline)
                        Text(share ? "Demo access active for 24 hours. Turn off to revoke. No real access is granted." : "No active shares. You control who sees your records.")
                            .font(.footnote).foregroundStyle(ThusoTheme.body)
                    }
                default:
                    CareSectionHeader("Health trends")
                    ClinicalChart(title: "Blood pressure", unit: "mmHg",
                                  readings: [.init(label: "12 Aug", value: 128), .init(label: "19 Aug", value: 134), .init(label: "28 Aug", value: 141, note: "Missed medication"), .init(label: "4 Sep", value: 136)],
                                  normal: 90...140, symbol: "heart")
                    ClinicalChart(title: "Heart rate", unit: "bpm",
                                  readings: [.init(label: "12 Aug", value: 76), .init(label: "19 Aug", value: 74), .init(label: "28 Aug", value: 80), .init(label: "4 Sep", value: 72)],
                                  normal: 50...100, symbol: "waveform.path.ecg")
                    ClinicalChart(title: "Blood glucose", unit: "mmol/L",
                                  readings: [.init(label: "12 Aug", value: 5.6), .init(label: "19 Aug", value: 6.1), .init(label: "28 Aug", value: 5.4), .init(label: "4 Sep", value: 5.2)],
                                  normal: 4...7.8, decimals: 1, symbol: "drop")
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
        .background(ThusoTheme.canvas)
        .navigationTitle("Health Passport").navigationBarTitleDisplayMode(.large)
    }
    @ViewBuilder private var passportActions: some View {
        Button { share = true } label: { tileFace("Share record", "square.and.arrow.up") }.buttonStyle(.plain)
        ShareLink(item: "MyThuso fictional passport: BP 118/78 mmHg, pulse 72 bpm, glucose 5.2 mmol/L. Demo only, not a medical record.") {
            tileFace("Export sample", "arrow.down.doc")
        }.buttonStyle(.plain)
        NavigationLink { FeatureDetail(title: "Your care team") } label: { tileFace("Doctors", "person.2") }.buttonStyle(.plain)
    }
    private func tileFace(_ title: String, _ symbol: String) -> some View {
        VStack(spacing: ThusoSpacing.space8) {
            Image(systemName: symbol).font(.title3).foregroundStyle(ThusoTheme.indigo).accessibilityHidden(true)
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.slate)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity).padding(.vertical, ThusoSpacing.space16).frame(minHeight: 76)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(ThusoTheme.line, lineWidth: 1))
        .contentShape(Rectangle())
    }
    private var hero: some View {
        ZStack(alignment: .leading) {
            LinearGradient(colors: [ThusoTheme.indigoDeep, ThusoTheme.indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
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
                Image("Patient").resizable().scaledToFill().frame(width: 76, height: 76)
                    .clipShape(Circle()).overlay(Circle().stroke(.white.opacity(0.22), lineWidth: 2)).accessibilityHidden(true)
            }.padding(ThusoSpacing.space20)
        }
        .frame(minHeight: 150)
        .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
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
                        HStack { Text("\(invitation.name) · \(invitation.relationship)").font(.subheadline.weight(.semibold)); Spacer(); Text(invitation.status).font(.caption).foregroundStyle(invitation.status == "Active" ? ThusoTheme.indigo : .secondary) }
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
                        if index < plans.count - 1 { Divider().overlay(ThusoTheme.line) }
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .background(ThusoTheme.canvas)
        .navigationTitle("Care plans")
    }
    /* One row per plan: the name, what it includes and what it costs. Five equally weighted cards
       with a heart on each of them told a reader nothing about which plan was which. */
    private func planRow(_ plan: (String, String, String)) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(plan.2).font(.caption).foregroundStyle(ThusoTheme.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: ThusoSpacing.space8)
            Text(plan.1).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.slate)
                .multilineTextAlignment(.trailing).fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.faint)
                .accessibilityHidden(true)
        }
        .padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44).contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
struct WalletView: View {
    var body: some View { List { Section { Label("THUSO WALLET", systemImage: "creditcard").foregroundStyle(ThusoTheme.indigo); Text("R500.00").font(.largeTitle.weight(.semibold)); Text("Demo balance · No financial account").font(.caption).foregroundStyle(.secondary) }; Section { NavigationLink("Top up") { FeatureDetail(title: "Top up wallet") }; NavigationLink("Sponsor care") { VettingStatusView(subjectId: "S-021") } }; Section("Sample activity") { LabeledContent("Family care credit", value: "+ R500"); LabeledContent("Vitals visit", value: "− R249") } }.navigationTitle("Thuso Wallet") }
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
                            Image("Patient").resizable().scaledToFill().frame(width: 52, height: 52).clipShape(Circle()).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Lerato Molefe").font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text("View and edit your profile").font(.footnote).foregroundStyle(ThusoTheme.body)
                            }
                            Spacer(minLength: ThusoSpacing.space8)
                            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.faint)
                                .accessibilityHidden(true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }.buttonStyle(.plain)
                group("Your care") {
                    row("My family", "Manage your loved ones", "person.2") { FamilyView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Care plans", "Ongoing care and subscriptions", "heart.text.square") { PlansView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Payments", "Cards, history and refunds", "creditcard") { WalletView() }
                }
                group("Your account") {
                    row("Notifications", "Visit updates and messages", "bell") { NotificationsView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Privacy & settings", "Your data and app preferences", "slider.horizontal.3") { PrivacyView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Language", "Read MyThuso your way", "globe") { LanguageView() }
                }
                group("Design review", note: "Screens built to be examined rather than used. Nothing here books, pays or contacts anybody.") {
                    Button(action: firstRun) { MenuRow(title: "First-run & recovery", subtitle: "Sign-up, one-time code and lost access", symbol: "person.badge.plus") }.buttonStyle(.plain)
                    Divider().overlay(ThusoTheme.line)
                    row("Vetting", "Every party that must be vetted, and what each is refused", "checkmark.shield") { VettingDirectoryView() }
                    Divider().overlay(ThusoTheme.line)
                    row(thuso(.patientFile, store.locale), "Eight tabs, gated on vetting — the same file four different ways", "folder.badge.person.crop") { PatientFileView() }
                    Divider().overlay(ThusoTheme.line)
                    row(thuso(.consultationRecord, store.locale), "One structure for every encounter, in long form or SOAP", "square.and.pencil") { ConsultationRecordView() }
                    Divider().overlay(ThusoTheme.line)
                    row(thuso(.householdRecord, store.locale), "One household, and what each member may see of the others", "house") { HouseholdView() }
                    Divider().overlay(ThusoTheme.line)
                    row(thuso(.healthSummary, store.locale), "The shareable summary, bound to a purpose and a period", "square.and.arrow.up") { HealthSummaryView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Thuso Kit", "Pairing, calibration and where a reading came from", "sensor.tag.radiowave.forward") { ThusoKitView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Waiting to send", "Offline capture, and the four conflicts nobody merges", "tray.full") { CaptureQueueView() }
                    Divider().overlay(ThusoTheme.line)
                    row("System states", "Loading, error, offline and denied", "square.stack.3d.up") { SystemStatesView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Explore the roadmap", "All 21 modules in the proposal", "square.grid.2x2") { RoadmapView() }
                }
                /* A workspace is entered, not pushed. Each opens over the patient's tab bar with a
                   tab bar of its own, because a nurse's sections are not a shopper's and putting
                   one inside the other is how the two got confused in the first place. */
                group("Workspace previews") {
                    workspaceRow("Nurse workspace", "Visits, assessment and vetting", "cross.case", role: "Nurse")
                    Divider().overlay(ThusoTheme.line)
                    workspaceRow("Doctor workspace", "Review queue and sign-off", "stethoscope", role: "Doctor")
                    Divider().overlay(ThusoTheme.line)
                    workspaceRow("Partner workspace", "Pharmacy and laboratory orders", "pills", role: "Partner")
                    Divider().overlay(ThusoTheme.line)
                    workspaceRow("Control Tower", "Dispatch, incidents and vetting", "antenna.radiowaves.left.and.right", role: "Control Tower")
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        Button(action: firstRun) { MenuRow(title: "Log out", subtitle: "Returns to the first-run flow — this preview has no account", symbol: "rectangle.portrait.and.arrow.right", danger: true) }.buttonStyle(.plain)
                    }
                    Text("Native SwiftUI design preview. All data is fictional and held only in memory.")
                        .font(.footnote).foregroundStyle(ThusoTheme.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .background(ThusoTheme.canvas)
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
                Text(note).font(.caption).foregroundStyle(ThusoTheme.body)
                    .fixedSize(horizontal: false, vertical: true).padding(.bottom, ThusoSpacing.space4)
            }
            CareCard(padding: ThusoSpacing.space16, spacing: 0) { rows() }
        }
    }
    private func row<Destination: View>(_ title: String, _ subtitle: String, _ symbol: String, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink { destination() } label: { MenuRow(title: title, subtitle: subtitle, symbol: symbol) }.buttonStyle(.plain)
    }
    private func workspaceRow(_ title: String, _ subtitle: String, _ symbol: String, role: String) -> some View {
        Button { workspace = WorkspaceEntry(id: role) } label: { MenuRow(title: title, subtitle: subtitle, symbol: symbol) }.buttonStyle(.plain)
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
                        if index < features.count - 1 { Divider().overlay(ThusoTheme.line) }
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .background(ThusoTheme.canvas)
        .navigationTitle("Roadmap").navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $openPassport) { PassportView() }
        .navigationDestination(isPresented: $openServices) { ServicesView() }
    }
}
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
 * than at the foot of one. */
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

    /* What is waiting, and how long it has waited. A workspace that opens with anything else is
       asking the person to go and find the urgent thing themselves. */
    static func urgency(_ role: String) -> [(String, String, String)] {
        switch role {
        case "Doctor": return [("Awaiting review", "12", "Longest waiting 3 h 20 m"),
                               ("Priority reviews", "2", "Flagged out of range"),
                               ("Reviewed today", "18", "Median 4 m 10 s")]
        case "Partner": return [("Open orders", "8", "2 past their collection window"),
                                ("Scheduled collections", "4", "Next 11:15"),
                                ("Ready for release", "3", "Awaiting a clinician")]
        case "Control Tower": return [("Active visits", "24", "3 running late"),
                                      ("Available nurses", "18", "4 off duty"),
                                      ("Open incidents", "3", "1 severity high")]
        default: return [("Next visit", "09:00", "Rosebank · in 40 minutes"),
                         ("Today’s visits", "3", "One awaiting sign-off"),
                         ("This week so far", "R 598", "Pays Wednesday")]
        }
    }
}

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
        .tint(ThusoTheme.indigo)
    }
}

/// The urgency strip a workspace lands on. Scaled type, no fixed heights: at the largest sizes the
/// three panels stack instead of clipping the note under the number.
struct WorkspaceUrgency: View {
    let role: String
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let entries = WorkspaceNavigation.urgency(role)
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8))
            : AnyLayout(HStackLayout(alignment: .top, spacing: ThusoSpacing.space8))
        layout {
            ForEach(entries, id: \.0) { entry in
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.0).font(.caption).foregroundStyle(ThusoTheme.body)
                    Text(entry.1).font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.ink)
                    Text(entry.2).font(.caption2).foregroundStyle(ThusoTheme.body).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(ThusoSpacing.space12)
                .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(ThusoTheme.line, lineWidth: 1))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(entry.0): \(entry.1). \(entry.2)")
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
        List {
            if landing {
                Section {
                    DemoBadge()
                    Text("Design role preview, not authentication.").font(.caption).foregroundStyle(.secondary)
                    WorkspaceUrgency(role: role).listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                }
            }
            content
            Section { Text("AI is decision support. An authorised clinician must sign off clinical decisions.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle(section)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Leave", action: leave).accessibilityLabel("Leave the \(role) workspace")
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch (role, section) {
        case ("Doctor", "Review queue"): doctorQueue
        case ("Doctor", "Teleconsultation"): Section { NavigationLink("Open a teleconsultation") { TeleconsultView() } }
        case ("Doctor", "Patient context"):
            Section("Patient records") {
                /* A doctor's queue and a doctor's record are the same authority asked twice, so the
                   file opens as this doctor rather than as an anonymous reader. */
                NavigationLink("Patient file") { PatientFileView(viewerId: "D-401") }
                NavigationLink("Consultation record") { ConsultationRecordView(writerId: "D-401") }
            }
        case ("Doctor", "Protocols"):
            Section("Your tools") {
                NavigationLink("Clinical protocols") { FeatureDetail(title: "Clinical protocols") }
                NavigationLink("Referral pathway") { FeatureDetail(title: "Referral pathway") }
            }
        case ("Partner", "Orders"):
            partnerOrders
            Section("Substitution and repeats") {
                NavigationLink("CHR-0114 · Chronic Routine · substitution and repeats") { DispensingView() }
            }
        case ("Partner", "Collections"):
            Section("Collections") {
                NavigationLink("Collection schedule") { FeatureDetail(title: "Collection schedule") }
                NavigationLink("Couriers who may take custody") { VettingRoleView(roleId: "courier") }
            }
        case ("Partner", "Results"):
            Section("Laboratory") {
                NavigationLink("LAB-0023 · Fasting panel · Results verified") { LabOrderView(reference: "LAB-0023") }
                NavigationLink("LAB-0019 · Sample in transit · Seal intact") { LabOrderView(reference: "LAB-0019") }
                NavigationLink("This laboratory’s accreditation") { VettingStatusView(subjectId: "B-601") }
            }
        case ("Control Tower", "Dispatch"):
            Section("Dispatch") {
                NavigationLink("Live dispatch board") { DispatchBoardView() }
                NavigationLink("Operators on duty") { VettingRoleView(roleId: "operator") }
            }
        case ("Control Tower", "Incidents"): incidents
        case ("Control Tower", "Vetting queue"):
            Section("Vetting") {
                NavigationLink("Vetting queue") { VettingConsoleView() }
                NavigationLink("Renewals due") { VettingRenewalsView() }
                NavigationLink("All thirteen vetted parties") { VettingDirectoryView() }
            }
        case ("Control Tower", "Quality"):
            Section("Your tools") {
                NavigationLink("Quality & revenue") { FeatureDetail(title: "Quality & revenue") }
                NavigationLink("Employer and sponsor programmes") { ProgrammesView() }
                NavigationLink("Nurse onboarding & vetting") { VettingApplyView(roleId: "nurse") }
            }
        case (_, "Assessments"):
            Section("Start a visit") { NavigationLink("Visit assessment · TH-2048") { VisitAssessmentView() } }
            Section("Patient records") {
                NavigationLink("Patient file") { PatientFileView(viewerId: "N-201") }
                NavigationLink("Consultation record") { ConsultationRecordView(writerId: "N-205") }
            }
        case (_, "Thuso Kit"):
            Section("On this phone") { waitingToSend }
            Section("Instruments") { NavigationLink("Thuso Kit · pair an instrument") { ThusoKitView() } }
        case (_, "Earnings & payouts"):
            Section { NavigationLink("Earnings & payouts") { EarningsView() } }
        case (_, "Vetting"):
            Section("Your vetting") {
                NavigationLink("My vetting status") { VettingStatusView(subjectId: "N-205") }
                NavigationLink("Nurse onboarding & vetting") { VettingApplyView(roleId: "nurse") }
                NavigationLink("Locum vetting") { VettingRoleView(roleId: "locum") }
            }
        default: nurseSchedule
        }
    }

    private var doctorQueue: some View {
        Group {
            Section("Clinical review queue") {
                ForEach(["TH-2048 · Vitals assessment", "TH-2045 · Wound follow-up", "TH-2041 · Prescription request"], id: \.self) { item in
                    NavigationLink(item) { DoctorReviewView(reference: String(item.prefix(7))) }
                }
            }
            Section("Your vetting") {
                NavigationLink("My registration and cover") { VettingStatusView(subjectId: "D-401") }
                NavigationLink("Apply to join as a doctor") { VettingApplyView(roleId: "doctor") }
                NavigationLink("Every doctor on the platform") { VettingRoleView(roleId: "doctor") }
            }
        }
    }

    private var partnerOrders: some View {
        Group {
            Section("Prescriptions") {
                NavigationLink("RX-0081 · 2 items · Awaiting pharmacist") { PrescriptionView(reference: "RX-0081") }
                NavigationLink("RX-0079 · 1 item · Dispensed, awaiting courier") { PrescriptionView(reference: "RX-0079") }
            }
            Section("Vetting") {
                NavigationLink("This pharmacy’s licence and pharmacist") { VettingStatusView(subjectId: "P-501") }
                NavigationLink("Apply as a partner") { VettingApplyView(roleId: "pharmacy") }
            }
            Section { Text("Sample orders. No live partner API, dispensing or courier handover is connected.").font(.caption).foregroundStyle(.secondary) }
        }
    }

    private var incidents: some View {
        Section("Open incidents") {
            ForEach(Incidents.all) { incident in
                NavigationLink { IncidentDetailView(incident: incident) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(incident.id) · \(incident.title)").font(.subheadline)
                        Text("\(incident.severity) · \(incident.area) · Opened \(incident.opened) · \(incident.status)").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var nurseSchedule: some View {
        Group {
            Section { Toggle("Available for visits", isOn: $available) }
            /* First, not last. A nurse coming out of a house with no signal wants one answer before
               anything else on this screen: is my work safe? */
            Section("On this phone") { waitingToSend }
            Section("Today’s work") {
                NavigationLink("TH-2048 · Vitals assessment · Rosebank") { VisitAssessmentView() }
                ForEach(["11:30 · Wound care · Parktown", "14:00 · Mother & baby · Melville"], id: \.self) { item in
                    NavigationLink(item) { FeatureDetail(title: item) }
                }
            }
            Section("More tools") {
                NavigationLink("Thuso SOS · urgent care") { SosView() }
                NavigationLink("Locum shifts") { FeatureDetail(title: "Locum shifts") }
                NavigationLink("Academy") { FeatureDetail(title: "Academy") }
            }
        }
    }

    private var waitingToSend: some View {
        NavigationLink { CaptureQueueView() } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text("Waiting to send").font(.subheadline)
                Text("\(kit.onlyHereCount) reading\(kit.onlyHereCount == 1 ? "" : "s") held here · \(kit.conflictedCount) needing a decision")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
