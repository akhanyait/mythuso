import SwiftUI

/* Vetting is the gate the whole marketplace rests on, so this is a real pipeline with real refusals
   rather than a list of names: an applicant flow for every one of the thirteen vetted parties, a
   status screen that resolves its own state against today's date, and a queue where a decision
   taken here is the same record dispatch and the clinical queue ask before they offer an action.

   Nothing is submitted, decided or stored anywhere. Every party, credential and decision below is
   fictional, and the screens say so. */

// MARK: - Small shared pieces

struct CheckStatePill: View {
    let state: CheckState
    var body: some View { StatusPill(text: state.label, tone: state.tone) }
}
struct SubjectStatusPill: View {
    let status: SubjectStatus
    var body: some View { StatusPill(text: status.label, tone: status.tone) }
}
/// Progress is the first thing a party looks for, so it is also the first thing VoiceOver reads.
struct VettingProgressRow: View {
    let summary: VettingSummary
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            ProgressView(value: summary.progress)
                .tint(summary.cleared ? ThusoTheme.charcoal : ThusoTheme.mangoInk)
                .studioChartEntrance(identity: "\(summary.passed)/\(summary.total)")
            Text("\(summary.passed) of \(summary.total) checks in date")
                .font(.caption).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Vetting progress")
        .accessibilityValue("\(summary.passed) of \(summary.total) checks in date. \(summary.status.label).")
    }
}
struct RefusalRow: View {
    let item: CapabilityDecision
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.capability.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                StatusPill(text: item.decision.allowed ? "Allowed" : "Refused", tone: item.decision.allowed ? "teal" : "danger")
            }
            Text(item.capability.detail).font(.caption).foregroundStyle(.secondary)
            if let reason = item.decision.reason {
                Text(reason).font(.caption).foregroundStyle(ThusoTheme.danger)
            }
            if !item.decision.blockedBy.isEmpty {
                Text("Blocked by \(item.decision.blockedBy.map(\.name).joined(separator: ", "))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}
/// One line of the same refusal, for screens that are not the vetting module — dispatch, the
/// clinical queue — where the answer matters more than the whole file behind it.
struct VettingRefusalNote: View {
    let decision: VettingDecision
    var body: some View {
        if !decision.allowed, let reason = decision.reason {
            Label(reason, systemImage: "hand.raised")
                .font(.caption).foregroundStyle(ThusoTheme.danger)
                .accessibilityLabel("Refused. \(reason)")
        }
    }
}
struct SubjectSummaryRow: View {
    let subject: VettingSubject
    var body: some View {
        let summary = summarise(subject)
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(subject.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                SubjectStatusPill(status: summary.status)
            }
            Text("\(subject.id) · \(subject.reference)\(subject.zone.map { " · \($0)" } ?? "")")
                .font(.caption).foregroundStyle(.secondary)
            Text("\(summary.passed) of \(summary.total) checks in date")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - The directory of vetted parties

struct VettingDirectoryView: View {
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    @State private var feed: LoadState = .ready
    /// Workspaces in the order the roles are written, so the directory reads like the platform does.
    private var workspaces: [String] {
        Vetting.roles.reduce(into: [String]()) { list, role in if !list.contains(role.workspace) { list.append(role.workspace) } }
    }
    var body: some View {
        List {
            Section {
                DemoBadge()
                Text("Thirteen parties are vetted, not only nurses.").font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text("Each one is refused something specific until its checks pass, and each check is renewed on its own cadence by the authority that issued it.")
                    .font(.caption).foregroundStyle(.secondary)
                StatePicker(title: "Preview the vetting feed state", state: $feed)
            }
            if feed == .ready {
                Section("Reviewing") {
                    NavigationLink { VettingConsoleView() } label: { MenuRow(title: thuso(.vettingQueue, store.locale), subtitle: "Every party awaiting a decision", symbol: "checkmark.shield") }
                    NavigationLink { VettingRenewalsView() } label: { MenuRow(title: thuso(.vettingRenewals, store.locale), subtitle: "Soonest expiry first", symbol: "clock.arrow.circlepath") }
                    NavigationLink { VettingAuditView() } label: { MenuRow(title: "Decision history", subtitle: "Append-only, newest first", symbol: "list.bullet.rectangle") }
                }
                ForEach(workspaces, id: \.self) { workspace in
                    Section("\(workspace) workspace") {
                        ForEach(Vetting.roles.filter { $0.workspace == workspace }) { role in
                            NavigationLink { VettingRoleView(roleId: role.id) } label: { roleRow(role) }
                        }
                    }
                }
                Section {
                    Text("Fictional parties and fictional credentials. Nothing here is verified with SANC, HPCSA, SAPC, SANAS, SAPS, Home Affairs, CIPC, RTMC or SAHPRA, and no document is uploaded anywhere.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Section {
                    StateBlock(state: feed, subject: "The vetting register", permission: "access to the vetting queue", retry: { feed = .ready }) { EmptyView() }
                        .listRowInsets(EdgeInsets())
                }
            }
        }
        .navigationTitle(thuso(.vetting, store.locale)).navigationBarTitleDisplayMode(.inline)
    }
    private func roleRow(_ role: VettedRole) -> some View {
        let parties = vetting.subjects(role: role.id)
        let cleared = parties.filter { summarise($0).cleared }.count
        return VStack(alignment: .leading, spacing: 4) {
            Text(role.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(role.summary).font(.caption).foregroundStyle(.secondary)
            Text("\(role.checks.count) checks · \(role.grants.count) gated capabilit\(role.grants.count == 1 ? "y" : "ies") · \(cleared) of \(parties.count) parties cleared")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - One role: what it is refused, what it must prove, who holds it

struct VettingRoleView: View {
    let roleId: String
    @ObservedObject private var vetting = VettingStore.shared
    private var role: VettedRole? { Vetting.role(roleId) }
    var body: some View {
        List {
            if let role {
                Section {
                    Text(role.summary).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    LabeledContent("Party", value: role.party.capitalized)
                    LabeledContent("Workspace", value: role.workspace)
                }
                Section("What is refused until vetting completes") {
                    ForEach(role.grants, id: \.capability) { grant in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Vetting.capability(grant.capability)?.name ?? grant.capability)
                                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text(grant.refusal).font(.caption).foregroundStyle(ThusoTheme.danger)
                        }
                        .padding(.vertical, 3)
                        .accessibilityElement(children: .combine)
                    }
                }
                Section("Checks") {
                    ForEach(role.checks) { check in CheckDefinitionRow(check: check) }
                }
                Section("Parties in this preview") {
                    ForEach(vetting.subjects(role: roleId)) { subject in
                        NavigationLink { VettingStatusView(subjectId: subject.id) } label: { SubjectSummaryRow(subject: subject) }
                    }
                }
                Section {
                    NavigationLink("Apply as a \(role.name.lowercased())") { VettingApplyView(roleId: roleId) }
                }
            }
        }
        .navigationTitle(role?.name ?? "Role").navigationBarTitleDisplayMode(.inline)
    }
}
struct CheckDefinitionRow: View {
    let check: VettingCheck
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(check.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                if check.isHighRisk { StatusPill(text: "Two reviewers", tone: "amber") }
            }
            Text(check.detail).font(.caption).foregroundStyle(.secondary)
            Text("\(Vetting.authority(check.authority)?.name ?? check.authority) · \(check.evidence) · \(check.cadence)")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Applying, for any of the thirteen roles

struct VettingApplyView: View {
    var roleId: String = "nurse"
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    @State private var chosenRole = ""
    @State private var applicant = ""
    @State private var entries: [String: String] = [:]
    @State private var scope: Set<String> = []
    @State private var attached: Set<String> = []
    @State private var declarations: Set<String> = []
    @State private var signature = ""
    @State private var attested = false
    @State private var submitted: String?

    private var role: VettedRole { Vetting.role(chosenRole.isEmpty ? roleId : chosenRole) ?? Vetting.roles[0] }
    private var roleScope: Vetting.RoleScope? { Vetting.scope(for: role.id) }
    private var scopeOptions: [String] { roleScope?.options ?? [] }
    /// One field per issuing authority, in the order the checks name them — an applicant types a
    /// SANC number once, not once per check that rests on it.
    private var credentialAuthorities: [VettingAuthority] {
        var seen: Set<String> = []
        return role.checks.compactMap { check -> VettingAuthority? in
            guard let authority = Vetting.authority(check.authority), !authority.pattern.isEmpty,
                  !seen.contains(authority.id) else { return nil }
            seen.insert(authority.id)
            return authority
        }
    }
    private var stages: [String] {
        ["Role", "Credentials"] + (scopeOptions.isEmpty ? [] : ["Scope"]) + ["Evidence", "Declarations", "Attestation"]
    }
    @State private var stage = 0
    private var stageName: String { stages[min(stage, stages.count - 1)] }
    private func valid(_ authority: VettingAuthority) -> (ok: Bool, reason: String?) {
        validateCredential(authority.id, entries[authority.id] ?? "")
    }
    private var credentialsPass: Bool { credentialAuthorities.allSatisfy { valid($0).ok } }
    private let declarationLines = [
        "Everything I have entered is true, and the documents are mine.",
        "No professional body is investigating me, and none has restricted my practice.",
        "I consent to MyThuso verifying these credentials directly with the authorities named.",
        "I will report any change to my registration, clearance, cover or health status."
    ]
    private var organisationLine: String? {
        role.party == "person" ? nil : "I am authorised to bind this \(role.party) and to sign on its behalf."
    }
    private var allDeclarations: [String] { declarationLines + (organisationLine.map { [$0] } ?? []) }

    var body: some View {
        Form {
            Section {
                StepDots(step: stage + 1, total: stages.count, label: stageName)
                Text("Vetting protects patients, and it protects you. Nothing in this preview is submitted, checked or stored.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            switch stageName {
            case "Role": roleStage
            case "Credentials": credentialStage
            case "Scope": scopeStage
            case "Evidence": evidenceStage
            case "Declarations": declarationStage
            default: attestationStage
            }
        }
        .navigationTitle(thuso(.vettingApply, store.locale)).navigationBarTitleDisplayMode(.inline)
        .onAppear { if chosenRole.isEmpty { chosenRole = roleId } }
    }

    @ViewBuilder private var roleStage: some View {
        Section("Which party are you?") {
            Picker("Role", selection: $chosenRole) {
                ForEach(Vetting.roles) { Text($0.name).tag($0.id) }
            }
            .pickerStyle(.inline).labelsHidden()
        }
        Section {
            Text(role.summary).font(.caption).foregroundStyle(.secondary)
            TextField(role.party == "person" ? "Your full name" : "Registered name", text: $applicant)
                .textInputAutocapitalization(.words)
            Text("\(role.checks.count) checks, decided by \(Set(role.checks.map(\.authority)).count) authorities. \(role.checks.filter(\.isHighRisk).count) of them need two reviewers.")
                .font(.caption).foregroundStyle(.secondary)
        }
        Section {
            Button("Continue") { advance() }.disabled(applicant.trimmingCharacters(in: .whitespaces).count < 3)
        }
    }

    @ViewBuilder private var credentialStage: some View {
        Section("Credentials") {
            ForEach(credentialAuthorities) { authority in
                CredentialField(authority: authority,
                                value: Binding(get: { entries[authority.id] ?? "" }, set: { entries[authority.id] = $0 }),
                                usedFor: role.checks.filter { $0.authority == authority.id }.map(\.name))
            }
        }
        Section {
            Text("Checked on this device against the format each authority uses. No number is sent anywhere, and none of these numbers belongs to anyone.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Continue") { advance() }.disabled(!credentialsPass)
            Button("Back") { retreat() }
        }
    }

    @ViewBuilder private var scopeStage: some View {
        Section(roleScope?.label ?? "Scope of practice") {
            ForEach(scopeOptions, id: \.self) { item in
                Button {
                    if scope.contains(item) { scope.remove(item) } else { scope.insert(item) }
                } label: {
                    HStack {
                        Text(item).foregroundStyle(ThusoTheme.charcoal)
                        Spacer()
                        if scope.contains(item) { Image(systemName: "checkmark").foregroundStyle(ThusoTheme.charcoal) }
                    }
                }
                .accessibilityAddTraits(scope.contains(item) ? [.isSelected] : [])
            }
        }
        Section {
            Text(roleScope?.note ?? "")
                .font(.caption).foregroundStyle(.secondary)
            Button("Continue") { advance() }.disabled(scope.isEmpty)
            Button("Back") { retreat() }
        }
    }

    @ViewBuilder private var evidenceStage: some View {
        Section("Evidence") {
            ForEach(role.checks) { check in
                EvidenceSlot(check: check,
                             attached: attached.contains(check.id),
                             toggle: { if attached.contains(check.id) { attached.remove(check.id) } else { attached.insert(check.id) } })
            }
        }
        Section {
            Text("\(attached.count) of \(role.checks.count) slots filled. What you leave empty stays outstanding — an application is never held up quietly.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Continue") { advance() }
            Button("Back") { retreat() }
        }
    }

    @ViewBuilder private var declarationStage: some View {
        Section("Declarations") {
            ForEach(allDeclarations, id: \.self) { line in
                Toggle(line, isOn: Binding(
                    get: { declarations.contains(line) },
                    set: { on in if on { declarations.insert(line) } else { declarations.remove(line) } }
                )).font(.subheadline)
            }
        }
        Section {
            Text("A false declaration is a vetting decision of its own, and it is recorded against the party rather than quietly forgotten.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Continue") { advance() }.disabled(declarations.count < allDeclarations.count)
            Button("Back") { retreat() }
        }
    }

    @ViewBuilder private var attestationStage: some View {
        if let submitted, let subject = vetting.subject(submitted) {
            Section {
                Label("Demo application submitted", systemImage: "checkmark.seal.fill").foregroundStyle(ThusoTheme.charcoal)
                Text("\(subject.name) now appears in the vetting queue as \(subject.id). Nothing was transmitted and nobody was notified.")
                    .font(.subheadline).foregroundStyle(.secondary)
                NavigationLink("Open the status of this application") { VettingStatusView(subjectId: subject.id) }
            }
        } else {
            Section("Attestation") {
                LabeledContent("Applying as", value: role.name)
                LabeledContent("Name", value: applicant)
                if !scope.isEmpty { LabeledContent("Scope", value: scope.sorted().joined(separator: ", ")) }
                ForEach(credentialAuthorities) { authority in
                    LabeledContent(authority.short, value: entries[authority.id] ?? "—")
                }
                TextField("Type your full name to sign", text: $signature).textInputAutocapitalization(.words)
                Toggle("I attest that this application is mine and that I understand re-vetting runs on a schedule, not once at sign-up.", isOn: $attested).font(.subheadline)
            }
            Section {
                Text("A lapsed registration removes a party from the platform automatically. Nobody has to notice first.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Submit demo application", action: submit)
                    .disabled(!attested || signature.trimmingCharacters(in: .whitespaces).lowercased() != applicant.trimmingCharacters(in: .whitespaces).lowercased())
                Button("Back") { retreat() }
            }
        }
    }

    private func advance() { stage = min(stage + 1, stages.count - 1) }
    private func retreat() { stage = max(stage - 1, 0) }
    private func submit() {
        let name = applicant.trimmingCharacters(in: .whitespaces)
        let primary = credentialAuthorities.first { $0.id != "dha" } ?? credentialAuthorities.first
        let reference = primary.map { "\($0.short) \(entries[$0.id] ?? "")" } ?? "\(role.name) applicant"
        let records = role.checks.map { check in
            CheckRecord(checkId: check.id,
                        state: attached.contains(check.id) ? .submitted : .outstanding,
                        evidence: attached.contains(check.id) ? check.evidence : nil)
        }
        let subject = VettingSubject(id: "AP-\(String(format: "%03d", vetting.subjects.count + 1))", name: name,
                                     roleId: role.id, reference: reference, zone: nil,
                                     scope: scope.sorted(), records: records)
        vetting.add(subject)
        submitted = subject.id
    }
}

/// Live validation, with the issuing authority's own hint as the error. A format answered on the
/// device is worth more than a spinner that fails after the applicant has walked away.
struct CredentialField: View {
    let authority: VettingAuthority
    @Binding var value: String
    let usedFor: [String]
    private var result: (ok: Bool, reason: String?) { validateCredential(authority.id, value) }
    private var entered: Bool { !value.trimmingCharacters(in: .whitespaces).isEmpty }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            Text(authority.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text("\(authority.verifies) · \(authority.format)").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: ThusoSpacing.space8) {
                TextField(authority.example, text: $value)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.characters)
                    .keyboardType(authority.id == "dha" || authority.id == "sanc" || authority.id == "rtmc" ? .numberPad : .asciiCapable)
                    .accessibilityLabel("\(authority.short) number")
                    .accessibilityHint(authority.hint)
                if entered {
                    Image(systemName: result.ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(result.ok ? ThusoTheme.charcoal : ThusoTheme.danger)
                        .accessibilityHidden(true)
                }
            }
            if entered, let reason = result.reason {
                Text(reason).font(.caption).foregroundStyle(ThusoTheme.danger)
            } else if entered && authority.id == "dha" {
                Text(validateSaId(value).message).font(.caption).foregroundStyle(ThusoTheme.charcoal)
            } else {
                Text("Used for \(usedFor.joined(separator: ", ")).").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
/// One slot per check: what document, which authority checks it, and how often it comes round again.
struct EvidenceSlot: View {
    let check: VettingCheck
    let attached: Bool
    let toggle: () -> Void
    private var authority: VettingAuthority? { Vetting.authority(check.authority) }
    private var mine: Bool { check.authority != "internal" }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(alignment: .firstTextBaseline) {
                Text(check.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                if check.isHighRisk { StatusPill(text: "Two reviewers", tone: "amber") }
            }
            Text(check.detail).font(.caption).foregroundStyle(.secondary)
            Text("\(authority?.name ?? check.authority) · \(check.cadence)").font(.caption2).foregroundStyle(.secondary)
            if mine {
                Button(attached ? "Remove \(check.evidence.lowercased())" : "Attach \(check.evidence.lowercased())", action: toggle)
                    .font(.caption.weight(.semibold)).buttonStyle(.borderless)
                    .accessibilityAddTraits(attached ? [.isSelected] : [])
            } else {
                Text("MyThuso completes this one. There is nothing for you to attach.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if attached {
                Label("\(check.evidence) attached · demo file", systemImage: "paperclip").font(.caption2).foregroundStyle(ThusoTheme.charcoal)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - The standing of one party

struct VettingStatusView: View {
    let subjectId: String
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    var body: some View {
        Group {
            if let subject = vetting.subject(subjectId) {
                content(subject, summarise(subject))
            } else {
                List { EmptyStateCard(title: "No such party", message: "This preview holds its vetting register in memory, so it starts again whenever the app does.").listRowInsets(EdgeInsets()) }
            }
        }
        .navigationTitle(thuso(.vettingStatus, store.locale)).navigationBarTitleDisplayMode(.inline)
    }

    /* ONE PARTY'S STANDING, AS A DECK.
     *
     * This was a system List: a name, a thin progress bar and nine grouped sections of the same grey,
     * so the answer a nurse opens it for — am I cleared, and what am I refused — sat at the height of
     * the fine print. The deck counts it in three places. The ring is this role's checks with the
     * passing ones lit; the panel's dial is the capabilities this party may use out of every one the
     * role is granted; and the night card crossing its edge is the soonest renewal in days. All three
     * are arithmetic over the two lists below, which are unchanged, and the sentences that explain a
     * refusal are the sheet standing on the canvas — the first thing read, not the last. */
    private func content(_ subject: VettingSubject, _ summary: VettingSummary) -> some View {
        let capabilities = decisions(subject)
        let allowed = capabilities.filter(\.decision.allowed).count
        return ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DeckHero {
                    DeckPreviewMark()
                    DeckHeadline(eyebrow: subject.role?.name ?? subject.roleId,
                                 words: [.glyph("checkmark.seal"), .text(subject.name)],
                                 tail: "\(subject.role?.name ?? subject.roleId) · \(subject.id) · \(subject.reference)")
                    if !subject.scope.isEmpty {
                        Text("Scope: \(subject.scope.joined(separator: ", "))").font(.footnote).foregroundStyle(DeckInk.quiet)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    DeckGlass {
                        DeckFigure(value: "\(summary.passed)", label: "of \(summary.total) checks in date",
                                   chip: summary.status.label, flagged: !summary.cleared,
                                   shape: .ring(summary.states.map { $0.state.passes }))
                    }
                    if let due = summary.nextDue, let days = daysUntil(due.record.expiresOn) {
                        DeckPanel { capabilityFigure(allowed, capabilities.count) } float: {
                            DeckFigure(value: "\(abs(days))", unit: abs(days) == 1 ? "day" : "days",
                                       label: days < 0 ? "since \(due.check.name) lapsed" : "until \(due.check.name) renews",
                                       chip: days < 0 ? "Lapsed" : nil, flagged: days < 0, ground: .night)
                        }
                    } else {
                        DeckPanel { capabilityFigure(allowed, capabilities.count) }
                    }
                } sheet: {
                    standing(subject, summary)
                }
                DeckSectionHead(title: thuso(.vettingRefused, store.locale), count: "\(allowed) of \(capabilities.count)")
                CareCard {
                    ForEach(capabilities) { item in
                        RefusalRow(item: item)
                        if item.id != capabilities.last?.id { Hairline() }
                    }
                }
                DeckSectionHead(title: "Checks", count: "\(summary.passed)/\(summary.total)")
                ForEach(summary.states) { standing in
                    CareCard { CheckStandingRow(subject: subject, standing: standing, vetting: vetting) }
                }
                Text("Fictional party, fictional credentials, fictional decisions. Nothing on this screen was verified with anybody.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
    }

    private func capabilityFigure(_ allowed: Int, _ total: Int) -> some View {
        DeckFigure(value: "\(allowed)", label: "of \(total) capabilities this party may use",
                   chip: allowed == total ? "Nothing refused" : "\(total - allowed) refused", flagged: allowed < total,
                   shape: .gauge(part: allowed, whole: total), ground: .panel)
    }

    /* What the figures cannot say: why. A declined or suspended file says so first, in danger and in
       words; a file held up says which checks are holding it; and every file says when it next comes
       round, because re-vetting runs on a schedule and nobody should have to remember the date. */
    @ViewBuilder private func standing(_ subject: VettingSubject, _ summary: VettingSummary) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Text(thuso(.vettingStatus, store.locale)).font(.headline).foregroundStyle(ThusoTheme.charcoal)
            Spacer(minLength: ThusoSpacing.space8)
            SubjectStatusPill(status: summary.status)
        }
        .accessibilityElement(children: .combine)
        if subject.declined || subject.suspended {
            Label(subject.declined ? "Declined" : "Suspended", systemImage: "hand.raised.fill")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
            Text(subject.declinedReason ?? subject.suspendedReason ?? "A check on this file has lapsed, so every capability it carried is withdrawn.")
                .font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            if subject.appealed {
                Text("An appeal is lodged. The decision stands while it is heard — an appeal is not a suspension of the refusal.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        if !summary.blocking.isEmpty || !summary.awaitingSecond.isEmpty {
            Text("What is blocking").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(summary.blocking) { check in
                Label("\(check.name) — \(stateOf(subject, check.id).label.lowercased())", systemImage: "circle.dashed")
                    .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
            }
            ForEach(summary.awaitingSecond) { standing in
                Label("\(standing.check.name) — verified by \(standing.record.decidedBy ?? "a reviewer"), waiting for a second", systemImage: "person.2")
                    .font(.subheadline).foregroundStyle(ThusoTheme.mangoInk)
            }
            Text("A high-risk check is not verified on one person's say-so, so a file can look complete and still be refused.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let due = summary.nextDue {
            Hairline()
            FactRow(label: due.check.name, value: expiryPhrase(due.record.expiresOn))
            Text("Re-vetting runs on a schedule, not once at sign-up. Nobody has to remember this date.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// One check, resolved against today, with the reviewer's own controls folded away underneath it.
struct CheckStandingRow: View {
    let subject: VettingSubject
    let standing: CheckStanding
    @ObservedObject var vetting: VettingStore
    @State private var open = false
    @State private var reason = ""
    @State private var refused = ""
    private var check: VettingCheck { standing.check }
    private var record: CheckRecord { standing.record }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(alignment: .firstTextBaseline) {
                Text(check.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                CheckStatePill(state: standing.state)
            }
            Text(check.detail).font(.caption).foregroundStyle(.secondary)
            Text("\(Vetting.authority(check.authority)?.name ?? check.authority) · \(check.evidence) · \(check.cadence)")
                .font(.caption2).foregroundStyle(.secondary)
            if let decidedBy = record.decidedBy {
                Text("Verified by \(decidedBy) on \(vettingDate(record.decidedOn))").font(.caption2).foregroundStyle(.secondary)
            }
            if check.isHighRisk {
                Text(record.secondedBy.map { "Seconded by \($0)" } ?? "Awaiting a second reviewer — a different person to the one who verified it")
                    .font(.caption2).foregroundStyle(record.secondedBy == nil ? ThusoTheme.mangoInk : .secondary)
            }
            if record.expiresOn != nil {
                Text("\(vettingDate(record.expiresOn)) · \(expiryPhrase(record.expiresOn))")
                    .font(.caption2).foregroundStyle(standing.state == .lapsed ? ThusoTheme.danger : .secondary)
            }
            if let note = record.note {
                Text(note).font(.caption).foregroundStyle(ThusoTheme.danger)
            }
            reviewer
        }
        .padding(.vertical, 4)
    }
    @ViewBuilder private var reviewer: some View {
        DisclosureGroup(isExpanded: $open) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text("Deciding as \(vetting.reviewer)").font(.caption2).foregroundStyle(.secondary)
                HStack(spacing: ThusoSpacing.space12) {
                    Button(standing.state.passes ? "Renew" : "Verify") { vetting.verify(subject.id, check: check.id); refused = "" }
                    if check.isHighRisk {
                        Button("Second") {
                            refused = vetting.second(subject.id, check: check.id) ? ""
                                : "The same reviewer cannot agree with themselves. A high-risk check needs a second, different person."
                        }
                        .disabled(!standing.state.passes || record.secondedBy != nil)
                    }
                }
                .font(.caption.weight(.semibold)).buttonStyle(.bordered)
                if !refused.isEmpty { Text(refused).font(.caption).foregroundStyle(ThusoTheme.danger) }
                TextField("Reason, if you are declining", text: $reason, axis: .vertical).font(.caption)
                Button("Decline this check") { vetting.decline(subject.id, check: check.id, reason: reason) }
                    .font(.caption.weight(.semibold)).buttonStyle(.bordered)
                    .disabled(reason.trimmingCharacters(in: .whitespaces).count < 10)
                Text("Decisions are added to the history and never rewritten. Nothing here is recorded outside this preview.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .padding(.top, 6)
        } label: {
            Text("Reviewer actions").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
        }
    }
}

// MARK: - The queue

struct VettingConsoleView: View {
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    @State private var feed: LoadState = .ready
    @State private var filter = "Needs a decision"
    private let filters = ["Needs a decision", "Refused", "Renewals due", "Everyone"]
    private func matches(_ subject: VettingSubject) -> Bool {
        let status = summarise(subject).status
        switch filter {
        case "Needs a decision": return status == .inProgress
        case "Refused": return status == .suspended || status == .declined
        case "Renewals due": return status == .expiring
        default: return true
        }
    }
    private var shown: [VettingSubject] { vetting.subjects.filter(matches) }
    var body: some View {
        List {
            Section {
                DemoBadge()
                StatePicker(title: "Preview the vetting queue state", state: $feed)
            }
            if feed == .ready {
                Section("Deciding as") {
                    Picker("Reviewer", selection: $vetting.reviewer) {
                        ForEach(VettingFixtures.reviewers, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                    Text("A high-risk check needs two of these three. Verify as one and the Second button refuses you until you switch.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Reviewing is itself gated") {
                    ForEach(vetting.subjects(role: "admin")) { admin in
                        NavigationLink { VettingStatusView(subjectId: admin.id) } label: { adminRow(admin) }
                    }
                    Text("Nobody decides another party's vetting until their own is complete. In this preview the governance reviewers above stand in for that queue while the internal admin files are themselves outstanding.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Picker("Filter", selection: $filter) { ForEach(filters, id: \.self) { Text($0) } }.pickerStyle(.segmented)
                }
                if shown.isEmpty {
                    Section { EmptyStateCard(title: "Nothing in this list", message: "No party is in that state right now. Change a decision on a file and it moves here by itself.").listRowInsets(EdgeInsets()) }
                } else {
                    ForEach(Vetting.roles) { role in
                        let parties = shown.filter { $0.roleId == role.id }
                        if !parties.isEmpty {
                            Section(role.name) {
                                ForEach(parties) { subject in
                                    NavigationLink { VettingStatusView(subjectId: subject.id) } label: { SubjectSummaryRow(subject: subject) }
                                }
                            }
                        }
                    }
                }
                Section {
                    NavigationLink(thuso(.vettingRenewals, store.locale)) { VettingRenewalsView() }
                    NavigationLink("Decision history") { VettingAuditView() }
                }
            } else {
                Section {
                    StateBlock(state: feed, subject: "The vetting queue", permission: "access to the vetting queue", retry: { feed = .ready }) { EmptyView() }
                        .listRowInsets(EdgeInsets())
                }
            }
        }
        .navigationTitle(thuso(.vettingQueue, store.locale)).navigationBarTitleDisplayMode(.inline)
    }
    private func adminRow(_ admin: VettingSubject) -> some View {
        let decision = can(admin, "review-vetting")
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(admin.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                StatusPill(text: decision.allowed ? "May decide" : "Refused", tone: decision.allowed ? "teal" : "danger")
            }
            VettingRefusalNote(decision: decision)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Renewals

struct RenewalItem: Identifiable {
    let subject: VettingSubject
    let standing: CheckStanding
    var id: String { "\(subject.id)-\(standing.check.id)" }
    var days: Int { daysUntil(standing.record.expiresOn) ?? Int.max }
}
struct VettingRenewalsView: View {
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    private var items: [RenewalItem] {
        vetting.subjects.flatMap { subject in
            summarise(subject).states.filter { $0.record.expiresOn != nil }.map { RenewalItem(subject: subject, standing: $0) }
        }
        .sorted { $0.days < $1.days }
    }
    var body: some View {
        List {
            Section {
                DemoBadge()
                Text("Soonest expiry first. A check that runs out removes the capability it carried, without anybody having to notice.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            group("Lapsed", items.filter { $0.days < 0 })
            group("Due within \(VettingClock.expiryWarningDays) days", items.filter { $0.days >= 0 && $0.days <= VettingClock.expiryWarningDays })
            group("Later", items.filter { $0.days > VettingClock.expiryWarningDays })
        }
        .navigationTitle(thuso(.vettingRenewals, store.locale)).navigationBarTitleDisplayMode(.inline)
    }
    @ViewBuilder private func group(_ title: String, _ rows: [RenewalItem]) -> some View {
        if rows.isEmpty {
            Section(title) { Text("Nothing here.").font(.caption).foregroundStyle(.secondary) }
        } else {
            Section("\(title) · \(rows.count)") {
                ForEach(rows.prefix(40)) { item in
                    NavigationLink { VettingStatusView(subjectId: item.subject.id) } label: { row(item) }
                }
            }
        }
    }
    private func row(_ item: RenewalItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(item.standing.check.name) · \(item.subject.name)")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                CheckStatePill(state: item.standing.state)
            }
            Text("\(Vetting.authority(item.standing.check.authority)?.short ?? "") · \(vettingDate(item.standing.record.expiresOn)) · \(expiryPhrase(item.standing.record.expiresOn))")
                .font(.caption).foregroundStyle(item.days < 0 ? ThusoTheme.danger : .secondary)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - The history

struct VettingAuditView: View {
    @ObservedObject private var vetting = VettingStore.shared
    var body: some View {
        List {
            Section {
                Text("Entries are only ever added. Nothing on this screen can be edited or removed, which is the only reason it is worth keeping.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Newest first") {
                ForEach(vetting.log) { event in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(event.kind.label).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Spacer(minLength: 8)
                            Text(formatEventTime(event.at)).font(.caption2).foregroundStyle(.secondary)
                        }
                        Text("\(event.subjectName) · \(event.checkId.flatMap { Vetting.check(event.roleId, $0)?.name } ?? Vetting.role(event.roleId)?.name ?? event.roleId)")
                            .font(.caption).foregroundStyle(.secondary)
                        Text(event.actor).font(.caption2).foregroundStyle(.secondary)
                        if let note = event.note { Text(note).font(.caption).foregroundStyle(.secondary) }
                    }
                    .padding(.vertical, 3)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .navigationTitle("Decision history").navigationBarTitleDisplayMode(.inline)
    }
}
