import SwiftUI

/// Paying for someone's care is not the same as being allowed to read their records.
/// Scope, duration and verification are three separate decisions, so they are three separate steps.
struct InviteGuardianView: View {
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0
    @State private var name = ""
    @State private var relationship = "Parent"
    @State private var scope = "Bookings and payments only"
    @State private var expires = "Until I revoke it"
    @State private var understood = false
    private var minor: Bool { relationship == "Child under 18" }
    private let scopes = [
        ("Bookings and payments only", "They can arrange and pay for visits. They see no clinical information at all."),
        ("Visit summaries only", "They see what happened at a visit and what to do next. No history, results or medicines."),
        ("Full Health Passport", "Everything you can see. Appropriate for a guardian of a child, or where you have chosen to share fully.")
    ]
    var body: some View {
        Form {
            Section { Text("Step \(step + 1) of 4 · \(["Who", "What they see", "For how long", "Review"][step])").font(.caption).foregroundStyle(ThusoTheme.teal) }
            switch step {
            case 0:
                Section("Who are you inviting?") {
                    TextField("Their name", text: $name)
                    Picker("Relationship", selection: $relationship) {
                        ForEach(["Parent", "Child under 18", "Adult child", "Partner", "Sibling", "Carer", "Other family member"], id: \.self) { Text($0) }
                    }
                    if minor {
                        Text("For a child under 18 you are asking for guardianship, not sharing. Production requires proof of parental responsibility and a record of the child’s own views as they grow older.").font(.caption).foregroundStyle(.secondary)
                    }
                    Text("They receive an invitation on their own phone and choose whether to accept. You can withdraw it at any time.").font(.caption).foregroundStyle(.secondary)
                }
                Section { Button("Continue") { step = 1 }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
            case 1:
                Section("What should they be able to see?") {
                    ForEach(scopes, id: \.0) { option in
                        Button { scope = option.0 } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: scope == option.0 ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.teal)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(option.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                    Text(option.1).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .accessibilityAddTraits(scope == option.0 ? [.isSelected] : [])
                    }
                    Text("Sexual and reproductive health, mental health and HIV-related entries stay hidden under every scope unless you release them one by one.").font(.caption).foregroundStyle(.secondary)
                }
                Section { Button("Continue") { step = 2 }; Button("Back") { step = 0 } }
            case 2:
                Section("For how long?") {
                    Picker("Access expires", selection: $expires) {
                        ForEach(["Until I revoke it", "Until the end of this visit", "For 7 days", "For 30 days", "31 December 2026"], id: \.self) { Text($0) }
                    }
                    Text("Time-limited access is the safer default. An open-ended grant is reviewed with you every six months. They must verify their identity before the invitation becomes active — an unverified invitation grants nothing.").font(.caption).foregroundStyle(.secondary)
                }
                Section { Button("Review") { step = 3 }; Button("Back") { step = 1 } }
            default:
                Section("Check this before you send it") {
                    LabeledContent("Person", value: name)
                    LabeledContent("Relationship", value: relationship)
                    LabeledContent("They will see", value: scope)
                    LabeledContent("Access ends", value: expires)
                    LabeledContent("Before it starts", value: "Identity verification\(minor ? " and proof of guardianship" : "")")
                    Toggle("I understand this is a design preview. No invitation is sent and no access is granted.", isOn: $understood)
                }
                Section {
                    Button("Send demo invitation") {
                        store.invitations.append(.init(id: "INV-00\(40 + Int.random(in: 0..<50))", name: name.trimmingCharacters(in: .whitespaces), relationship: relationship, scope: scope, expires: expires, status: "Verification pending"))
                        dismiss()
                    }.disabled(!understood)
                    Button("Back") { step = 2 }
                }
            }
        }
        .navigationTitle("Invite someone").navigationBarTitleDisplayMode(.inline)
    }
}
struct SystemStatesView: View {
    @State private var state: LoadState = .loading
    var body: some View {
        List {
            Section {
                DemoBadge()
                Text("Every screen that will talk to a clinical, payment, partner or device integration needs these designed up front.").font(.subheadline).foregroundStyle(.secondary)
                StatePicker(title: "Choose a state", state: $state)
            }
            Section("The chosen state") {
                if state == .ready {
                    Label("The real content, with nothing standing in for it.", systemImage: "checkmark.circle").foregroundStyle(ThusoTheme.teal)
                } else {
                    StateBlock(state: state, subject: "Your laboratory results", permission: "Apple Health access", retry: { state = .ready }) { EmptyView() }
                        .listRowInsets(EdgeInsets())
                }
            }
            Section("Skeleton while care information loads") { SkeletonRows() }
            Section("Nothing here yet") { EmptyStateCard(title: "No visits yet", message: "When you book your first visit it appears here, with the nurse’s name and what to have ready.").listRowInsets(EdgeInsets()) }
            Section { Text("An error state never blames the patient, never loses what they typed, and always says what happens next.").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle("System states").navigationBarTitleDisplayMode(.inline)
    }
}
struct LanguageView: View {
    @EnvironmentObject private var store: PreviewStore
    var body: some View {
        Form {
            Section("Choose your language") {
                Picker("Language", selection: $store.locale) { ForEach(ThusoLocale.allCases) { Text($0.native).tag($0) } }.pickerStyle(.inline).labelsHidden()
            }
            Section {
                Text("Navigation, the shell and the main actions are translated. Clinical wording stays in English until a South African clinical language review is complete — a mistranslated instruction is a safety problem, not a polish problem.").font(.caption).foregroundStyle(.secondary)
                Text("isiXhosa, Setswana, Sepedi, Xitsonga, siSwati, Tshivenda, isiNdebele and South African Sign Language guidance are planned before a pilot.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Language").navigationBarTitleDisplayMode(.inline)
    }
}
