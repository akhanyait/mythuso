import SwiftUI

struct PassportView: View {
    @State private var share = false
    @State private var deviceState: LoadState = .denied
    var body: some View {
        List {
            Section { DemoBadge(); CareHeading(eyebrow: "Thuso Pass", title: "Your story. Your health.", subtitle: "Lerato Molefe · Fictional record") }
            Section("Sample trends") {
                ClinicalChart(title: "Blood pressure — systolic", unit: "mmHg",
                              readings: [.init(label: "12 Aug", value: 128), .init(label: "19 Aug", value: 134), .init(label: "28 Aug", value: 141, note: "Missed medication"), .init(label: "4 Sep", value: 136)],
                              normal: 90...140).listRowInsets(EdgeInsets())
                ClinicalChart(title: "Heart rate", unit: "bpm",
                              readings: [.init(label: "12 Aug", value: 76), .init(label: "19 Aug", value: 74), .init(label: "28 Aug", value: 80), .init(label: "4 Sep", value: 72)],
                              normal: 50...100).listRowInsets(EdgeInsets())
                ClinicalChart(title: "Blood glucose", unit: "mmol/L",
                              readings: [.init(label: "12 Aug", value: 5.6), .init(label: "19 Aug", value: 6.1), .init(label: "28 Aug", value: 5.4), .init(label: "4 Sep", value: 5.2)],
                              normal: 4...7.8, decimals: 1).listRowInsets(EdgeInsets())
            }
            Section("Your records") {
                NavigationLink("Visit summary") { FeatureDetail(title: "Visit summary") }
                NavigationLink("Laboratory results") { LabOrderView() }
                NavigationLink("Medical certificate") { FeatureDetail(title: "Medical certificate") }
                NavigationLink("Medicines") { PrescriptionView() }
            }
            Section("Sharing") {
                Toggle("Demo access for Dr. A. Dlamini", isOn: $share)
                Text(share ? "Demo access active for 24 hours. Turn off to revoke. No real access is granted." : "No active shares. You control who sees your records.").font(.caption).foregroundStyle(.secondary)
                ShareLink(item: "MyThuso fictional passport: BP 118/78 mmHg, pulse 72 bpm, glucose 5.2 mmol/L. Demo only, not a medical record.") { Label("Export sample passport", systemImage: "square.and.arrow.up") }
            }
            Section("Connected devices") {
                StatePicker(title: "Preview the device permission state", state: $deviceState)
                if deviceState == .ready {
                    NavigationLink("Apple Health") { FeatureDetail(title: "Apple Health connection") }
                    NavigationLink("Thuso Kit") { FeatureDetail(title: "Thuso Kit") }
                } else {
                    StateBlock(state: deviceState, subject: "Readings from your connected devices", permission: "Apple Health access", retry: { deviceState = .ready }) { EmptyView() }
                        .listRowInsets(EdgeInsets())
                }
            }
        }.navigationTitle("Health Passport").navigationBarTitleDisplayMode(.inline)
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
    var body: some View { List { Section { Label("THUSO WALLET", systemImage: "creditcard").foregroundStyle(ThusoTheme.teal); Text("R500.00").font(.largeTitle.weight(.semibold)); Text("Demo balance · No financial account").font(.caption).foregroundStyle(.secondary) }; Section { NavigationLink("Top up") { FeatureDetail(title: "Top up wallet") }; NavigationLink("Sponsor care") { FeatureDetail(title: "Sponsor care") } }; Section("Sample activity") { LabeledContent("Family care credit", value: "+ R500"); LabeledContent("Vitals visit", value: "− R249") } }.navigationTitle("Thuso Wallet") }
}
struct NotificationsView: View {
    var body: some View { List { Section("Sample notifications") { Label("Your Saturday visit is confirmed.", systemImage: "calendar"); Label("Your visit summary is ready.", systemImage: "doc.text"); Label("Explore regular check-ins with Thuso Routine.", systemImage: "heart") } }.navigationTitle("Notifications") }
}
struct MoreView: View {
    let firstRun: () -> Void
    private let features = ["Thuso Screen", "Thuso Wear", "Thuso Pharmacy", "Thuso Labs", "Thuso SOS", "Thuso Corner", "Thuso Work", "Thuso Locum", "Thuso Academy", "Thuso Money", "Thuso Cover", "Thuso Devices", "Thuso Kit", "Thuso AI", "Thuso Doctor"]
    var body: some View {
        List {
            Section("Your care") {
                NavigationLink("My family") { FamilyView() }
                NavigationLink("Care plans") { PlansView() }
                NavigationLink("Thuso Wallet") { WalletView() }
                NavigationLink("Privacy & settings") { PrivacyView() }
                NavigationLink("Language") { LanguageView() }
            }
            Section("Design review") {
                Button("First-run & recovery", action: firstRun)
                NavigationLink("System states") { SystemStatesView() }
            }
            Section("Workspace previews") {
                NavigationLink("Nurse") { WorkspaceView(role: "Nurse") }
                NavigationLink("Doctor") { WorkspaceView(role: "Doctor") }
                NavigationLink("Partner") { FulfilmentQueueView() }
                NavigationLink("Control Tower") { WorkspaceView(role: "Control Tower") }
            }
            Section("Explore the roadmap") { ForEach(features, id: \.self) { feature in NavigationLink(feature) { FeatureDetail(title: feature) } } }
            Section { Text("Native SwiftUI design preview. All data is fictional and held only in memory.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle("More MyThuso")
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
                Section("Your tools") { NavigationLink("Nurse onboarding & vetting") { NurseVettingView() }; NavigationLink("Quality & revenue") { FeatureDetail(title: "Quality & revenue") } }
            } else if role == "Doctor" {
                Section("Review queue") {
                    ForEach(["TH-2048 · Vitals assessment", "TH-2045 · Wound follow-up", "TH-2041 · Prescription request"], id: \.self) { item in
                        NavigationLink(item) { DoctorReviewView(reference: String(item.prefix(7))) }
                    }
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
                Section("Your tools") {
                    NavigationLink("Visit assessment") { VisitAssessmentView() }
                    NavigationLink("Nurse onboarding & vetting") { NurseVettingView() }
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
