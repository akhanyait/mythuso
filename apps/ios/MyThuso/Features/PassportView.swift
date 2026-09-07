import SwiftUI

struct PassportView: View {
    @State private var tab = "Overview"
    @State private var share = false
    @State private var deviceState: LoadState = .denied
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DemoBadge()
                hero
                Picker("Passport sections", selection: $tab) { ForEach(["Overview", "Records", "Medications", "More"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
                switch tab {
                case "Records":
                    CareCard {
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
                        CareCard {
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
                    Text("Health trends").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    ClinicalChart(title: "Blood pressure", unit: "mmHg",
                                  readings: [.init(label: "12 Aug", value: 128), .init(label: "19 Aug", value: 134), .init(label: "28 Aug", value: 141, note: "Missed medication"), .init(label: "4 Sep", value: 136)],
                                  normal: 90...140, symbol: "heart")
                    ClinicalChart(title: "Heart rate", unit: "bpm",
                                  readings: [.init(label: "12 Aug", value: 76), .init(label: "19 Aug", value: 74), .init(label: "28 Aug", value: 80), .init(label: "4 Sep", value: 72)],
                                  normal: 50...100, symbol: "waveform.path.ecg")
                    ClinicalChart(title: "Blood glucose", unit: "mmol/L",
                                  readings: [.init(label: "12 Aug", value: 5.6), .init(label: "19 Aug", value: 6.1), .init(label: "28 Aug", value: 5.4), .init(label: "4 Sep", value: 5.2)],
                                  normal: 4...7.8, decimals: 1, symbol: "drop")
                    HStack(spacing: 10) {
                        actionTile("Share record", "square.and.arrow.up") { share = true }
                        ShareLink(item: "MyThuso fictional passport: BP 118/78 mmHg, pulse 72 bpm, glucose 5.2 mmol/L. Demo only, not a medical record.") {
                            VStack(spacing: 8) { Image(systemName: "arrow.down.doc").font(.system(size: 19)).foregroundStyle(ThusoTheme.teal)
                                Text("Export sample").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.forest) }
                                .frame(maxWidth: .infinity, minHeight: 80)
                                .background(.white, in: RoundedRectangle(cornerRadius: 18))
                                .overlay(RoundedRectangle(cornerRadius: 18).stroke(ThusoTheme.line, lineWidth: 1))
                        }
                        NavigationLink { FeatureDetail(title: "Your care team") } label: {
                            VStack(spacing: 8) { Image(systemName: "person.2").font(.system(size: 19)).foregroundStyle(ThusoTheme.teal)
                                Text("Doctors").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.forest) }
                                .frame(maxWidth: .infinity, minHeight: 80)
                                .background(.white, in: RoundedRectangle(cornerRadius: 18))
                                .overlay(RoundedRectangle(cornerRadius: 18).stroke(ThusoTheme.line, lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                }
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Health Passport").navigationBarTitleDisplayMode(.large)
    }
    private func actionTile(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 19)).foregroundStyle(ThusoTheme.teal)
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.forest)
            }
            .frame(maxWidth: .infinity, minHeight: 80)
            .background(.white, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(ThusoTheme.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }
    private var hero: some View {
        ZStack(alignment: .leading) {
            LinearGradient(colors: [Color(red: 0.059, green: 0.290, blue: 0.251), Color(red: 0.078, green: 0.420, blue: 0.361)], startPoint: .topLeading, endPoint: .bottomTrailing)
            HStack {
                VStack(alignment: .leading, spacing: 11) {
                    StatusPill(text: "Thuso Pass", tone: "light")
                    Text("Your health.\nYour story.").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Lerato Molefe").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                        Text("ID: TH-2048-3920").font(.system(size: 12)).foregroundStyle(Color(red: 0.725, green: 0.863, blue: 0.824))
                    }
                }
                Spacer(minLength: 8)
                Image("Patient").resizable().scaledToFill().frame(width: 84, height: 84)
                    .clipShape(Circle()).overlay(Circle().stroke(.white.opacity(0.25), lineWidth: 3)).accessibilityHidden(true)
            }.padding(20)
        }
        .frame(minHeight: 160)
        .clipShape(RoundedRectangle(cornerRadius: 18))
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
                    VStack(alignment: .leading, spacing: 6) {
                        HStack { Text("\(invitation.name) · \(invitation.relationship)").font(.subheadline.weight(.semibold)); Spacer(); Text(invitation.status).font(.caption).foregroundStyle(invitation.status == "Active" ? ThusoTheme.teal : .secondary) }
                        Text("\(invitation.scope) · Ends: \(invitation.expires)").font(.caption).foregroundStyle(.secondary)
                        Button("Revoke") { invitation.status = "Revoked" }.font(.caption).disabled(invitation.status == "Revoked")
                    }
                    .padding(.vertical, 3)
                }
                NavigationLink("Invite someone") { InviteGuardianView() }
                NavigationLink("Guardian verification") { VettingStatusView(subjectId: "G-031") }
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
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 18) { CareHeading(eyebrow: "Thuso Routine", title: "A healthier rhythm.", subtitle: "Proposal pricing · Phase 2–3 preview"); ForEach(plans, id: \.0) { plan in NavigationLink { FeatureDetail(title: plan.0) } label: { CareCard { Image(systemName: "heart").foregroundStyle(ThusoTheme.teal); Text(plan.0).font(.title2.weight(.semibold)); Text(plan.2).font(.subheadline).foregroundStyle(.secondary); Text(plan.1).font(.title3) } }.buttonStyle(.plain) } }.padding(20) }.background(ThusoTheme.canvas).navigationTitle("Care plans") }
}
struct WalletView: View {
    var body: some View { List { Section { Label("THUSO WALLET", systemImage: "creditcard").foregroundStyle(ThusoTheme.teal); Text("R500.00").font(.largeTitle.weight(.semibold)); Text("Demo balance · No financial account").font(.caption).foregroundStyle(.secondary) }; Section { NavigationLink("Top up") { FeatureDetail(title: "Top up wallet") }; NavigationLink("Sponsor care") { VettingStatusView(subjectId: "S-021") } }; Section("Sample activity") { LabeledContent("Family care credit", value: "+ R500"); LabeledContent("Vitals visit", value: "− R249") } }.navigationTitle("Thuso Wallet") }
}
struct NotificationsView: View {
    var body: some View { List { Section("Sample notifications") { Label("Your Saturday visit is confirmed.", systemImage: "calendar"); Label("Your visit summary is ready.", systemImage: "doc.text"); Label("Explore regular check-ins with Thuso Routine.", systemImage: "heart") } }.navigationTitle("Notifications") }
}
struct MoreView: View {
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    private let groups: [[(String, String, String)]] = [
        [("My family", "Manage your loved ones", "person.2"), ("Care plans", "Ongoing care and subscriptions", "heart.text.square"), ("Payments", "Cards, history and refunds", "creditcard")],
        [("Notifications", "Visit updates and messages", "bell"), ("Privacy & settings", "Your data and app preferences", "slider.horizontal.3"), ("Language", "Read MyThuso your way", "globe")],
        [("Design review", "First-run, recovery and system states", "sparkles"), ("Workspace previews", "Nurse, doctor, partner and Control Tower", "stethoscope"), ("Explore the roadmap", "All 21 modules in the proposal", "square.grid.2x2")]
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                NavigationLink { PrivacyView() } label: {
                    CareCard {
                        HStack(spacing: 13) {
                            Image("Patient").resizable().scaledToFill().frame(width: 52, height: 52).clipShape(Circle()).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Lerato Molefe").font(.system(size: 16, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                Text("View and edit your profile").font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6))
                        }
                    }
                }.buttonStyle(.plain)
                CareCard {
                    row("My family", "Manage your loved ones", "person.2") { FamilyView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Care plans", "Ongoing care and subscriptions", "heart.text.square") { PlansView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Payments", "Cards, history and refunds", "creditcard") { WalletView() }
                }
                CareCard {
                    row("Notifications", "Visit updates and messages", "bell") { NotificationsView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Privacy & settings", "Your data and app preferences", "slider.horizontal.3") { PrivacyView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Language", "Read MyThuso your way", "globe") { LanguageView() }
                }
                CareCard {
                    Button(action: firstRun) { MenuRow(title: "First-run & recovery", subtitle: "Sign-up, one-time code and lost access", symbol: "person.badge.plus") }.buttonStyle(.plain)
                    Divider().overlay(ThusoTheme.line)
                    row("Vetting", "Every party that must be vetted, and what each is refused", "checkmark.shield") { VettingDirectoryView() }
                    Divider().overlay(ThusoTheme.line)
                    row("System states", "Loading, error, offline and denied", "square.stack.3d.up") { SystemStatesView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Explore the roadmap", "All 21 modules in the proposal", "square.grid.2x2") { RoadmapView() }
                }
                CareCard {
                    row("Nurse workspace", "Visits, assessment and vetting", "cross.case") { WorkspaceView(role: "Nurse") }
                    Divider().overlay(ThusoTheme.line)
                    row("Doctor workspace", "Review queue and sign-off", "stethoscope") { WorkspaceView(role: "Doctor") }
                    Divider().overlay(ThusoTheme.line)
                    row("Partner workspace", "Pharmacy and laboratory orders", "pills") { FulfilmentQueueView() }
                    Divider().overlay(ThusoTheme.line)
                    row("Control Tower", "Dispatch, incidents and vetting", "antenna.radiowaves.left.and.right") { WorkspaceView(role: "Control Tower") }
                }
                CareCard {
                    Button(action: firstRun) { MenuRow(title: "Log out", subtitle: "Returns to the first-run flow — this preview has no account", symbol: "rectangle.portrait.and.arrow.right", danger: true) }.buttonStyle(.plain)
                }
                Text("Native SwiftUI design preview. All data is fictional and held only in memory.")
                    .font(.footnote).foregroundStyle(ThusoTheme.body).frame(maxWidth: .infinity)
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("More").navigationBarTitleDisplayMode(.large)
    }
    private func row<Destination: View>(_ title: String, _ subtitle: String, _ symbol: String, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink { destination() } label: { MenuRow(title: title, subtitle: subtitle, symbol: symbol) }.buttonStyle(.plain)
    }
}
struct RoadmapView: View {
    private let features = ["Thuso Screen", "Thuso Wear", "Thuso Pharmacy", "Thuso Labs", "Thuso SOS", "Thuso Corner", "Thuso Work", "Thuso Locum", "Thuso Academy", "Thuso Money", "Thuso Cover", "Thuso Devices", "Thuso Kit", "Thuso AI", "Thuso Doctor"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                CareHeading(eyebrow: "The MyThuso family", title: "More ways to be cared for.", subtitle: "Availability follows the proposal’s phased roadmap.")
                CareCard {
                    ForEach(Array(features.enumerated()), id: \.offset) { index, feature in
                        NavigationLink { FeatureDetail(title: feature) } label: { MenuRow(title: feature, subtitle: "", symbol: "square.grid.2x2") }.buttonStyle(.plain)
                        if index < features.count - 1 { Divider().overlay(ThusoTheme.line) }
                    }
                }
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Roadmap").navigationBarTitleDisplayMode(.inline)
    }
}
struct WorkspaceView: View {
    let role: String
    @State private var available = true
    var body: some View {
        List {
            Section {
                DemoBadge()
                Text("\(role) workspace").font(.title2.weight(.semibold))
                Text("Design role preview, not authentication.").font(.caption).foregroundStyle(.secondary)
                if role == "Nurse" { Toggle("Available for visits", isOn: $available) }
            }
            if role == "Control Tower" {
                Section("Dispatch") { NavigationLink("Live dispatch board") { DispatchBoardView() } }
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
                Section("Vetting") {
                    NavigationLink("Vetting queue") { VettingConsoleView() }
                    NavigationLink("Renewals due") { VettingRenewalsView() }
                    NavigationLink("All twelve vetted parties") { VettingDirectoryView() }
                    NavigationLink("Operators on duty") { VettingRoleView(roleId: "operator") }
                }
                Section("Your tools") { NavigationLink("Quality & revenue") { FeatureDetail(title: "Quality & revenue") } }
            } else if role == "Doctor" {
                Section("Review queue") {
                    ForEach(["TH-2048 · Vitals assessment", "TH-2045 · Wound follow-up", "TH-2041 · Prescription request"], id: \.self) { item in
                        NavigationLink(item) { DoctorReviewView(reference: String(item.prefix(7))) }
                    }
                }
                Section("Your vetting") {
                    NavigationLink("My registration and cover") { VettingStatusView(subjectId: "D-401") }
                    NavigationLink("Apply to join as a doctor") { VettingApplyView(roleId: "doctor") }
                    NavigationLink("Every doctor on the platform") { VettingRoleView(roleId: "doctor") }
                }
                Section("Your tools") {
                    NavigationLink("Clinical protocols") { FeatureDetail(title: "Clinical protocols") }
                    NavigationLink("Teleconsultation") { FeatureDetail(title: "Teleconsultation") }
                    NavigationLink("Referral pathway") { FeatureDetail(title: "Referral pathway") }
                }
            } else {
                Section("Today’s work") {
                    NavigationLink("TH-2048 · Vitals assessment · Rosebank") { VisitAssessmentView() }
                    ForEach(["11:30 · Wound care · Parktown", "14:00 · Mother & baby · Melville"], id: \.self) { item in NavigationLink(item) { FeatureDetail(title: item) } }
                }
                Section("Your vetting") {
                    NavigationLink("My vetting status") { VettingStatusView(subjectId: "N-205") }
                    NavigationLink("Nurse onboarding & vetting") { VettingApplyView(roleId: "nurse") }
                    NavigationLink("Locum vetting") { VettingRoleView(roleId: "locum") }
                }
                Section("Your tools") {
                    NavigationLink("Visit assessment") { VisitAssessmentView() }
                    NavigationLink("Diagnostic kit") { FeatureDetail(title: "Diagnostic kit") }
                    NavigationLink("Weekly payouts") { FeatureDetail(title: "Weekly payouts") }
                    NavigationLink("Locum shifts") { FeatureDetail(title: "Locum shifts") }
                    NavigationLink("Academy") { FeatureDetail(title: "Academy") }
                }
            }
            Section { Text("AI is decision support. An authorised clinician must sign off clinical decisions.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle(role)
    }
}
