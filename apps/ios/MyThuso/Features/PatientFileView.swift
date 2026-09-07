import SwiftUI

/* The clinician-facing patient file: what a nurse or a doctor opens *about somebody else*. It is
   not the Health Passport, which is the patient's own view of their own record, and neither
   replaces the other — the audience is different, so the refusals are different too.

   What has to be known immediately is in a summary header that stays above the tabs; the depth is
   behind the eight tabs of packages/catalog/records.json's navigation. The 42 record types in that
   file are the data model, not the menu.

   Everything below — every tab, every action, every field group — asks can(subject, capability)
   before it renders. Nothing here is a security control: this is a preview with no server, and a
   gate drawn on a phone gates nothing. It is the design of one, and it is honest about what it
   refuses so that the refusals can be reviewed before they are built. */

/* One party per interesting answer, so a design review can watch the same file change shape rather
   than read a paragraph claiming it would. The same eight the web preview offers. Two of them are
   refused everything: a nurse whose SAPS clearance lapsed nine days ago, and a doctor whose HPCSA
   registration lapsed four days ago — neither by anybody's decision, both by arithmetic on an
   expiry date. */
private let patientFileViewerIds = ["D-401", "N-201", "N-204", "D-402", "P-501", "G-032", "O-801", "A-901"]

/* view-patient-summary is one capability, but vetting.json writes a different sentence for each
   role that holds it, and those sentences do not describe the same summary. An operator “sees an
   address, a service and a window — never a clinical record”; a pharmacy “sees the prescription
   and the allergies that bear on filling it. Nothing else.” Giving all three the same header
   because they share a capability id would be a gate that reads the contract's key and ignores its
   words. So the field groups are narrowed per role, and the role's own sentence is printed under
   the header as the reason. */
private enum SummaryFact: String { case patientId, dob, sex, mobile, aid, emergency, facility, address, service, window }
private enum SummaryChip: String { case blood, allergy, chronic, aid }
private struct SummaryProfile { let facts: [SummaryFact]; let chips: [SummaryChip] }
/// The name sits in the heading, so it is not repeated as a field. Everything else earns a row.
private let fullSummaryProfile = SummaryProfile(
    facts: [.patientId, .dob, .sex, .mobile, .aid, .emergency, .facility], chips: [.blood, .allergy, .chronic, .aid])
private let summaryProfiles: [String: SummaryProfile] = [
    "operator": SummaryProfile(facts: [.patientId, .mobile, .address, .service, .window], chips: []),
    "pharmacy": SummaryProfile(facts: [.patientId, .dob, .sex, .mobile, .facility], chips: [.blood, .allergy])
]
private func summaryProfile(_ roleId: String) -> SummaryProfile { summaryProfiles[roleId] ?? fullSummaryProfile }
private func grantSentence(_ roleId: String, _ capability: String) -> String? {
    Vetting.role(roleId)?.grants.first { $0.capability == capability }?.refusal
}

// MARK: - The screen

struct PatientFileView: View {
    /// Which party the file opens as. A workspace passes its own; the design review changes it.
    var viewerId = "D-401"
    @EnvironmentObject private var store: PreviewStore
    @ObservedObject private var vetting = VettingStore.shared
    @State private var patientId = PatientFixtures.all[0].id
    @State private var viewer = ""
    @State private var tabName = Records.fileTabs[0].name
    @State private var feed: LoadState = .ready
    @State private var notice = ""

    private var viewers: [VettingSubject] { patientFileViewerIds.compactMap { vetting.subject($0) } }
    private var patient: PatientRecord { PatientFixtures.patient(patientId) ?? PatientFixtures.all[0] }
    private var subject: VettingSubject { viewers.first { $0.id == viewer } ?? viewers.first ?? VettingFixtures.subjects[0] }
    private var tab: PatientFileTab { Records.fileTabs.first { $0.name == tabName } ?? Records.fileTabs[0] }
    private var decision: VettingDecision { canOpenTab(subject, tab) }
    private var refusedCount: Int { Records.fileTabs.filter { !canOpenTab(subject, $0).allowed }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Clinical · design preview", title: thuso(.patientFile, store.locale),
                            subtitle: "The file a nurse or a doctor opens about somebody else. Fictional patients, fictional numbers; nothing here is a record and nothing reaches a service.")
                reviewControls
                PatientSummaryHeader(patient: patient, viewer: subject)
                tabStrip
                Text(spokenState).font(.caption).foregroundStyle(ThusoTheme.body)
                    .accessibilityAddTraits(.updatesFrequently)
                StatePicker(title: "Preview how this file behaves when the record service is unavailable", state: $feed)
                StateBlock(state: feed, subject: "This patient file", permission: "clinical record access",
                           retry: { feed = .ready }) {
                    VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                        Text(tab.holds).font(.footnote).foregroundStyle(ThusoTheme.body)
                        tabBody
                        Label(tab.notBuilt, systemImage: "checkmark.shield")
                            .font(.caption2).foregroundStyle(ThusoTheme.body)
                    }
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle(thuso(.patientFile, store.locale)).navigationBarTitleDisplayMode(.inline)
        .onAppear { if viewer.isEmpty { viewer = viewers.contains { $0.id == viewerId } ? viewerId : (viewers.first?.id ?? "") } }
    }

    private var spokenState: String {
        "\(patient.name), \(patient.id). Viewing as \(subject.name), \(subject.role?.name.lowercased() ?? "party"). \(tabName) is \(decision.allowed ? "open" : "refused"). \(refusedCount) of \(Records.fileTabs.count) sections are refused to this viewer."
    }

    @ViewBuilder private var reviewControls: some View {
        CareCard {
            StatusPill(text: "Design review", tone: "quiet")
            Text("The same file, through different eyes").font(.headline).foregroundStyle(ThusoTheme.ink)
            Text("Every tab, action and field group below asks the vetting module whether this party may see it. Change the viewer and watch the file change shape — that is the demonstration, and it is the only way to tell whether a refusal was designed or assumed.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
            /* The label is drawn rather than left to the picker: a menu picker in a card shows only
               its value, and “Viewing as” is the whole point of the control. */
            Text(thuso(.openFileOf, store.locale)).font(.caption).foregroundStyle(ThusoTheme.body)
            Picker(thuso(.openFileOf, store.locale), selection: $patientId) {
                ForEach(PatientFixtures.all) { Text("\($0.name) · \($0.id)").tag($0.id) }
            }
            .labelsHidden()
            .onChange(of: patientId) { _, _ in notice = "" }
            Text(thuso(.viewingAs, store.locale)).font(.caption).foregroundStyle(ThusoTheme.body)
            Picker(thuso(.viewingAs, store.locale), selection: $viewer) {
                ForEach(viewers) { Text("\($0.name) · \($0.role?.name ?? $0.roleId)").tag($0.id) }
            }
            .labelsHidden()
            .onChange(of: viewer) { _, _ in notice = "" }
            HStack(spacing: ThusoSpacing.space8) {
                SubjectStatusPill(status: summarise(subject).status)
                Text("\(subject.reference) · \(refusedCount) of \(Records.fileTabs.count) sections refused to this viewer")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            }
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ThusoSpacing.space8) {
                ForEach(Records.fileTabs) { item in
                    let open = canOpenTab(subject, item).allowed
                    Button { tabName = item.name; notice = "" } label: {
                        HStack(spacing: 5) {
                            Text(item.name).font(.footnote.weight(.semibold))
                            if !open { Image(systemName: "lock").font(.caption2.weight(.semibold)) }
                        }
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .background(item.name == tabName ? ThusoTheme.indigo : .white, in: Capsule())
                        .foregroundStyle(item.name == tabName ? .white : ThusoTheme.body)
                        .overlay(Capsule().stroke(ThusoTheme.line, lineWidth: item.name == tabName ? 0 : 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(open ? item.name : "\(item.name), refused to this viewer")
                    .accessibilityAddTraits(item.name == tabName ? [.isSelected] : [])
                }
            }
            .padding(.vertical, 2)
        }
        .accessibilityLabel("Patient file sections")
    }

    @ViewBuilder private var tabBody: some View {
        if !decision.allowed {
            RefusalCard(title: "\(tabName) — not open to this viewer", decision: decision)
        } else {
            switch tabName {
            case "Overview": PatientFileOverview(patient: patient, viewer: subject, notice: $notice, go: { tabName = $0 })
            case "Timeline": PatientFileTimeline(patient: patient, viewer: subject)
            case "Consultations": PatientFileConsultations(patient: patient, viewer: subject)
            case "Medication": PatientFileMedication(patient: patient, viewer: subject)
            case "Results": PatientFileResults(patient: patient, viewer: subject)
            case "Referrals": PatientFileReferrals(patient: patient, viewer: subject)
            case "Documents": PatientFileDocuments(patient: patient, viewer: subject)
            default: PatientFileBilling(patient: patient, viewer: subject)
            }
        }
    }
}

// MARK: - Refusals

/* A refused thing says the sentence the vetting contract wrote for it, and names the checks that
   are standing in the way. A greyed control with no explanation teaches a clinician that the
   system is broken; a sentence teaches them what to do next. */
struct RefusalCard: View {
    let title: String
    let decision: VettingDecision
    var body: some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "lock").font(.body).foregroundStyle(ThusoTheme.danger)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                if let reason = decision.reason {
                    Text(reason).font(.footnote).foregroundStyle(ThusoTheme.body)
                }
                if !decision.blockedBy.isEmpty {
                    Text("Outstanding: \(decision.blockedBy.map(\.name).joined(separator: " · "))")
                        .font(.caption2).foregroundStyle(ThusoTheme.body)
                }
            }
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/* An entry a viewer holds a release for is marked as protected, so nobody reads it aloud in a room
   with somebody else in it. Only a reader who already holds the release ever sees the marker, so
   it discloses nothing it has not already disclosed. */
struct ReleasedTag: View {
    let entry: RecordEntry
    var body: some View {
        if isProtected(entry) { StatusPill(text: "Protected · released to you", tone: "amber") }
    }
}

/* One sentence, the same wherever a list could have been shortened by the protected rule. It does
   not say whether anything was removed, for the same reason the header notice does not. */
struct ProtectedLineNote: View {
    let viewer: VettingSubject
    let what: String
    var body: some View {
        let vetted = can(viewer, "view-protected-record")
        Label("A protected \(what) appears on this page only where the patient released that entry to you by name. \(vetted.allowed ? releaseRefusal(viewer.roleId) : (vetted.reason ?? ""))",
              systemImage: "lock")
            .font(.caption2).foregroundStyle(ThusoTheme.body)
            .accessibilityElement(children: .combine)
    }
}

// MARK: - The permanent header

/// Present above every tab, because the thing a nurse needs at a glance is not on the tab she
/// happens to have open.
struct PatientSummaryHeader: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    private var decision: VettingDecision { can(viewer, "view-patient-summary") }
    /* A protected condition never becomes a chip — not for a nurse, not for a doctor holding a
       release, not for anybody. The header is read over a shoulder in a living room. */
    private var chronic: [String] { patient.conditions.filter { !isProtected($0) }.map(\.name) }

    private func fact(_ id: SummaryFact) -> (String, String) {
        switch id {
        case .patientId: return ("Patient ID", patient.id)
        case .dob: return ("Date of birth", "\(longDate(patient.dob)) · \(ageFrom(patient.dob)) years")
        case .sex: return ("Sex", patient.sex)
        case .mobile: return ("Mobile", patient.mobile)
        case .aid: return ("Medical aid", "\(patient.medicalAid.scheme) · \(patient.medicalAid.plan)")
        case .emergency: return ("Emergency contact", "\(patient.emergency.name) · \(patient.emergency.relationship) · \(patient.emergency.mobile)")
        case .facility: return ("Preferred facility", patient.facility)
        case .address: return ("Address", patient.address)
        case .service: return ("Service booked", patient.service)
        case .window: return ("Window", patient.window)
        }
    }
    private func chip(_ id: SummaryChip) -> (String, String, String) {
        switch id {
        case .blood: return ("Blood group", patient.bloodGroup, "teal")
        case .allergy: return ("Allergies",
                               patient.allergies.isEmpty ? "None recorded"
                               : patient.allergies.map { "\($0.substance) — \($0.reaction.lowercased())" }.joined(separator: " · "),
                               patient.allergies.isEmpty ? "amber" : "danger")
        case .chronic: return ("Chronic conditions", chronic.isEmpty ? "None recorded" : chronic.joined(separator: " · "), "teal")
        case .aid: return ("Medical aid status", patient.medicalAid.status, patient.medicalAid.tone)
        }
    }

    var body: some View {
        CareCard {
            if decision.allowed {
                identity
                let profile = summaryProfile(viewer.roleId)
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    ForEach(profile.facts, id: \.rawValue) { id in
                        let row = fact(id)
                        FieldRow(label: row.0, value: row.1)
                    }
                }
                if !profile.chips.isEmpty {
                    VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                        ForEach(profile.chips, id: \.rawValue) { id in
                            let entry = chip(id)
                            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                                Text(entry.0).font(.caption2).foregroundStyle(ThusoTheme.body)
                                Spacer(minLength: 8)
                                StatusPill(text: entry.1, tone: entry.2)
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("\(entry.0): \(entry.1)")
                        }
                    }
                }
                if let scope = grantSentence(viewer.roleId, "view-patient-summary") {
                    Label("The header is cut to this role's own words in the vetting contract: “\(scope)”",
                          systemImage: "checkmark.shield")
                        .font(.caption2).foregroundStyle(ThusoTheme.body)
                }
            } else {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Patient \(patient.id)").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("The file is open. The person is not.").font(.caption).foregroundStyle(ThusoTheme.body)
                }
                RefusalCard(title: "The patient summary is not open to this viewer", decision: decision)
            }
            WithheldNoticeCard(viewer: viewer)
        }
    }

    @ViewBuilder private var identity: some View {
        HStack(spacing: ThusoSpacing.space12) {
            Text(patient.initials).font(.callout.weight(.bold)).foregroundStyle(ThusoTheme.indigoDeep)
                .frame(width: 46, height: 46).background(ThusoTheme.indigoSoft, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(patient.name).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text("\(patient.id) · \(patient.sex) · \(ageFrom(patient.dob)) years")
                    .font(.caption).foregroundStyle(ThusoTheme.body)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

/* The rule this whole surface exists to get right. It is written once, appears on every file, and
   reads identically whether the patient has three protected entries or none: a notice that turned
   up only when there was something behind it would disclose the thing it is hiding, as surely as a
   chip reading “Chronic: HIV” would. So there is no count, no category name and no difference
   between one patient and the next. */
struct WithheldNoticeCard: View {
    let viewer: VettingSubject
    var body: some View {
        let decision = can(viewer, "view-protected-record")
        let ask = decision.allowed
            ? "Vetted is not released: the patient releases a category entry by entry, in their own account, naming you. Ask them."
            : "\(decision.reason ?? "") Ask the patient, or the clinician they released it to."
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "lock").font(.body).foregroundStyle(ThusoTheme.mangoInk)
            VStack(alignment: .leading, spacing: 5) {
                Text("A category is withheld from this header.")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(Records.summaryCard.withheld).font(.footnote).foregroundStyle(ThusoTheme.body)
                /* The categories are listed from the contract rather than typed into this sentence,
                   so one added to records.json is named here without anybody editing a screen. */
                Text("These are never a chip: \(Records.protectedCategories.joined(separator: ", ")). The notice stands on every file, whether or not anything is held behind it.")
                    .font(.footnote).foregroundStyle(ThusoTheme.body)
                Text(ask).font(.caption2).foregroundStyle(ThusoTheme.body)
            }
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Shared rows

struct FieldRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Text(label).font(.caption).foregroundStyle(ThusoTheme.body)
            Spacer(minLength: 10)
            Text(value).font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.ink)
                .multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

struct RecordEntryRow: View {
    let entry: TimelineEntry
    let decision: VettingDecision
    var full = false
    var body: some View {
        let type = Records.type(entry.typeId)
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            TileIcon(symbol: decision.allowed ? "doc.text" : "lock",
                     tint: decision.allowed ? ThusoTheme.indigo : ThusoTheme.danger,
                     background: decision.allowed ? ThusoTheme.indigoSoft : ThusoTheme.dangerSoft, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(decision.allowed ? entry.title : "\(type?.name ?? "Record") · withheld")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(decision.allowed ? entry.detail : (decision.reason ?? ""))
                    .font(.caption).foregroundStyle(ThusoTheme.body)
                if full {
                    Text("\(type?.name ?? "") · \(type?.fhir ?? "") · \(shortDate(entry.at))\(decision.allowed ? " · \(entry.by)" : "")")
                        .font(.caption2).foregroundStyle(ThusoTheme.faint)
                } else {
                    Text(shortDate(entry.at)).font(.caption2).foregroundStyle(ThusoTheme.faint)
                }
                if decision.allowed { ReleasedTag(entry: entry) }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Overview

/// Three cards, the latest observations, four bullets and the last few events. Highly visual on
/// purpose: a wall of text is read by nobody standing in a doorway.
struct PatientFileOverview: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    @Binding var notice: String
    let go: (String) -> Void

    private var clinical: VettingDecision { can(viewer, "view-clinical-record") }
    /* The medicine card is reached the way the Medication tab is reached, not through the summary
       capability: a pharmacy holds neither the clinical record nor a reason to be told “no medicine
       is visible” when what it actually holds is dispense. */
    private var medicines: VettingDecision { canAny(viewer, ["view-clinical-record", "dispense"]) }
    private var current: [Medicine] { patient.medication.filter { $0.stopped == nil && canOpen(viewer, $0).allowed } }
    private var recent: [TimelineEntry] { Array(timelineFor(patient).filter { canOpen(viewer, $0).allowed }.prefix(4)) }
    private var latest: VitalSet { patient.vitals[patient.vitals.count - 1] }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            lastVisitCard
            nextAppointmentCard
            medicationCard
            SectionHeading(title: "Latest observations")
            if clinical.allowed { observations } else {
                RefusalCard(title: "Observations are not open to this viewer", decision: clinical)
            }
            SectionHeading(title: "Clinical summary")
            if clinical.allowed {
                CareCard {
                    ForEach(patient.summaryPoints, id: \.self) { point in
                        HStack(alignment: .top, spacing: ThusoSpacing.space8) {
                            Circle().fill(ThusoTheme.indigo).frame(width: 5, height: 5).padding(.top, 6)
                            Text(point).font(.footnote).foregroundStyle(ThusoTheme.ink)
                        }
                    }
                }
            } else {
                RefusalCard(title: "The clinical summary is not open to this viewer", decision: clinical)
            }
            SectionHeading(title: "Recent activity", action: "Open the timeline") { go("Timeline") }
            CareCard {
                if recent.isEmpty {
                    Text("Nothing in this patient's history is open to this viewer. That is a refusal, not an empty record.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                } else {
                    ForEach(recent) { RecordEntryRow(entry: $0, decision: canOpen(viewer, $0)) }
                }
            }
            SectionHeading(title: "Actions")
            actions
            if !notice.isEmpty {
                Text(notice).font(.caption).foregroundStyle(ThusoTheme.body)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    @ViewBuilder private var lastVisitCard: some View {
        CareCard {
            Label("Last visit", systemImage: "calendar").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.body)
            if clinical.allowed {
                Text(shortDate(patient.lastVisit.at)).font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(patient.lastVisit.service).font(.footnote).foregroundStyle(ThusoTheme.ink)
                Text("\(patient.lastVisit.by) · \(patient.lastVisit.outcome)").font(.caption2).foregroundStyle(ThusoTheme.body)
            } else {
                RefusalCard(title: "Withheld", decision: clinical)
            }
        }
    }
    @ViewBuilder private var nextAppointmentCard: some View {
        CareCard {
            Label("Next appointment", systemImage: "calendar.badge.clock").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.body)
            if let next = patient.nextAppointment {
                Text("\(shortDate(next.at)) · \(next.time)").font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(next.service).font(.footnote).foregroundStyle(ThusoTheme.ink)
                Text(next.place).font(.caption2).foregroundStyle(ThusoTheme.body)
            } else {
                Text("Nothing is booked. A missed appointment and an unbooked one are not the same thing, and this file does not blur them.")
                    .font(.footnote).foregroundStyle(ThusoTheme.body)
            }
        }
    }
    @ViewBuilder private var medicationCard: some View {
        CareCard {
            Label("Current medication", systemImage: "pills").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.body)
            if medicines.allowed {
                if let first = current.first {
                    Text("\(first.name) \(first.dose)").font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    Text(first.frequency).font(.footnote).foregroundStyle(ThusoTheme.ink)
                    Text("\(current.count > 1 ? "\(current.count - 1) more · " : "")\(first.repeats)")
                        .font(.caption2).foregroundStyle(ThusoTheme.body)
                } else {
                    Text("Nothing is currently prescribed.").font(.footnote).foregroundStyle(ThusoTheme.body)
                }
            } else {
                RefusalCard(title: "Withheld", decision: medicines)
            }
        }
    }

    /* Six numbers with four different origins between them, which is what a home visit actually
       produces. The marks are the same size, the same weight and the same shape as one another:
       a blood pressure a nurse auscultated on the right cuff is a clinical skill, not a downgrade
       of one a machine sent over Bluetooth, and a card that shaded it grey would be telling this
       reader something untrue about the last person who stood in that room. */
    @ViewBuilder private var observations: some View {
        CareCard {
            VitalStat(symbol: "heart", name: "Blood pressure", value: "\(Int(latest.systolic))/\(Int(latest.diastolic))",
                      unit: "mmHg", provenance: originOf(latest, "systolic"))
            Divider().overlay(ThusoTheme.line)
            VitalStat(symbol: "waveform.path.ecg", name: "Pulse", value: "\(Int(latest.pulse))", unit: "bpm",
                      provenance: originOf(latest, "pulse"))
            Divider().overlay(ThusoTheme.line)
            VitalStat(symbol: "thermometer", name: "Temperature", value: String(format: "%.1f", latest.temperature),
                      unit: "°C", provenance: originOf(latest, "temperature"))
            Divider().overlay(ThusoTheme.line)
            VitalStat(symbol: "scalemass", name: "Weight", value: String(format: "%.1f", latest.weight), unit: "kg",
                      provenance: originOf(latest, "weight"))
            Divider().overlay(ThusoTheme.line)
            VitalStat(symbol: "lungs", name: "Oxygen saturation", value: "\(Int(latest.oxygen))", unit: "%",
                      provenance: originOf(latest, "oxygen"))
            if let instrument = latest.instrument {
                Divider().overlay(ThusoTheme.line)
                FieldRow(label: "Instrument", value: instrument)
            }
            if let note = latest.calibrationNote {
                CaveatNote(caveats: [note])
            }
        }
        Text("Recorded \(longDate(latest.at)) by \(patient.careTeam[0].name). Each reading says where it came from. A weight the patient read off her own bathroom scale is in this record as exactly that, and never as something a clinician measured — which is why the mark is beside every number rather than a footnote under the card.")
            .font(.caption2).foregroundStyle(ThusoTheme.body)
        NavigationLink("What the four marks mean") {
            ScrollView { VStack(alignment: .leading, spacing: ThusoSpacing.space16) { DemoBadge(); ProvenanceKey() }.padding(ThusoSpacing.space16) }
                .background(ThusoTheme.canvas)
                .navigationTitle("Where a reading came from").navigationBarTitleDisplayMode(.inline)
        }
        .font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
        ClinicalChart(title: "Systolic blood pressure", unit: "mmHg",
                      readings: patient.vitals.map { Reading(label: dayLabel($0.at), value: $0.systolic) },
                      normal: 90...140, symbol: "heart")
        ClinicalChart(title: "Pulse", unit: "bpm",
                      readings: patient.vitals.map { Reading(label: dayLabel($0.at), value: $0.pulse) },
                      normal: 50...100, symbol: "waveform.path.ecg")
    }

    @ViewBuilder private var actions: some View {
        CareCard {
            ForEach(Records.fileActions) { action in
                let allowed = can(viewer, action.capability)
                if allowed.allowed {
                    Button {
                        notice = "\(action.label) would open here for \(patient.name). This preview writes nothing, sends nothing and dispenses nothing."
                    } label: {
                        MenuRow(title: action.label, subtitle: action.detail, symbol: action.symbol)
                    }
                    .buttonStyle(.plain)
                } else {
                    MenuRow(title: action.label, subtitle: allowed.reason ?? "", symbol: "lock", danger: true)
                        .accessibilityLabel("\(action.label), refused. \(allowed.reason ?? "")")
                }
                if action.id != Records.fileActions.last?.id { Divider().overlay(ThusoTheme.line) }
            }
        }
    }
}

struct VitalStat: View {
    let symbol: String
    let name: String
    let value: String
    let unit: String
    /* Optional, and the nil branch is not a formality. A reading whose origin nobody recorded is
       not filed, so the file does not print the number and then apologise for it — it says the
       number is not there and says why. */
    var provenance: Provenance?
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: ThusoSpacing.space8) {
                Image(systemName: symbol).font(.footnote).foregroundStyle(ThusoTheme.indigo).frame(width: 18)
                Text(name).font(.caption).foregroundStyle(ThusoTheme.body)
                Spacer(minLength: 8)
                if provenance == nil {
                    Text("Not filed").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.mangoInk)
                } else {
                    Text(value).font(.system(.body, design: .rounded, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text(unit).font(.caption2).foregroundStyle(ThusoTheme.body)
                }
            }
            if let provenance {
                ProvenanceMark(provenance: provenance)
            } else {
                Text(CaptureRules.provenanceIsRequired).font(.caption2).foregroundStyle(ThusoTheme.faint)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(provenance == nil
                            ? "\(name): not filed, because no origin was recorded for it."
                            : "\(name): \(value) \(unit). \(provenance?.name ?? "")")
    }
}

struct SectionHeading: View {
    let title: String
    var action: String?
    var onAction: (() -> Void)?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.callout.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
            Spacer(minLength: 8)
            if let action, let onAction {
                Button(action, action: onAction).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
            }
        }
        .padding(.top, 2)
    }
}

// MARK: - Timeline

/* Everything in one chronological list, each entry wearing its record type, because “a test” and
   “a referral” are different things to a clinician scanning a year of care.

   A clinical entry the viewer may not open is still listed, locked, with its refusal: a nurse who
   sees a gap will assume nothing happened there, which is worse than knowing something did. A
   protected entry is not listed at all, because for those the existence *is* the disclosure. That
   asymmetry is the design, not an oversight, and the line above the list says so. */
struct PatientFileTimeline: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    @State private var filter = "All records"
    private var all: [TimelineEntry] {
        timelineFor(patient).filter { canOpen(viewer, $0).allowed || !isProtected($0) }
    }
    private var kinds: [String] {
        var names = ["All records"]
        for entry in all {
            let name = Records.type(entry.typeId)?.name ?? entry.typeId
            if !names.contains(name) { names.append(name) }
        }
        return names
    }
    private var rows: [TimelineEntry] {
        all.filter { filter == "All records" || (Records.type($0.typeId)?.name ?? $0.typeId) == filter }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: ThusoSpacing.space8) {
                    ForEach(kinds, id: \.self) { kind in
                        Button { filter = kind } label: {
                            Text(kind).font(.caption.weight(.semibold))
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(filter == kind ? ThusoTheme.indigoSoft : .white, in: Capsule())
                                .foregroundStyle(filter == kind ? ThusoTheme.indigoDeep : ThusoTheme.body)
                                .overlay(Capsule().stroke(ThusoTheme.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(filter == kind ? [.isSelected] : [])
                    }
                }
                .padding(.vertical, 2)
            }
            .accessibilityLabel("Filter by record type")
            Label("Protected entries are not listed here, on any patient, for any viewer without a release. A locked line would say one exists, which is the disclosure this class exists to prevent.",
                  systemImage: "lock")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
            CareCard {
                if rows.isEmpty {
                    Text("Nothing under this filter. Change the record type, or choose all records. An empty filter is not an empty record.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                    Button("Show all records") { filter = "All records" }.buttonStyle(QuietButton())
                } else {
                    ForEach(rows) { RecordEntryRow(entry: $0, decision: canOpen(viewer, $0), full: true) }
                }
            }
        }
    }
}

// MARK: - Consultations

struct PatientFileConsultations: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    @State private var openId = ""
    private var rows: [ConsultationEntry] { patient.consultations.filter { canOpen(viewer, $0).allowed } }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            Label("Twelve sections, the same twelve whoever writes them, mapped to \(Records.soap.map(\.id).joined(separator: " · ")) as the reading order. A section marked as needing a capability is about who may write it; reading a prescription is not prescribing.",
                  systemImage: "doc.text")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
            if rows.isEmpty {
                CareCard {
                    Text("No consultation in this file is open to this viewer. Consultations exist; this viewer is not one of the people who may read them.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                }
            } else {
                ForEach(rows) { consultation in
                    CareCard {
                        DisclosureGroup(isExpanded: Binding(get: { openId == consultation.id },
                                                            set: { openId = $0 ? consultation.id : "" })) {
                            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                                FieldRow(label: "Reason for visit", value: consultation.reason)
                                FieldRow(label: "Assessment", value: consultation.assessment)
                                FieldRow(label: "Treatment plan", value: consultation.plan)
                                FieldRow(label: "Clinician and registration", value: "\(consultation.by) · \(consultation.registration)")
                                FieldRow(label: "Place", value: consultation.place)
                                Text("The standardised structure").font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ThusoTheme.ink).padding(.top, 4)
                                ForEach(Records.consultationSections) { section in
                                    ConsultationSectionRow(section: section, filled: consultation.sections.contains(section.id))
                                }
                            }
                            .padding(.top, 8)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(shortDate(consultation.at)) · \(consultation.kind)")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text(consultation.by).font(.caption).foregroundStyle(ThusoTheme.body)
                                ReleasedTag(entry: consultation)
                            }
                        }
                    }
                }
            }
        }
    }
}
struct ConsultationSectionRow: View {
    let section: ConsultationSection
    let filled: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: ThusoSpacing.space8) {
                Image(systemName: filled ? "checkmark.circle.fill" : "circle")
                    .font(.caption).foregroundStyle(filled ? ThusoTheme.indigo : ThusoTheme.faint)
                Text(section.name).font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.ink)
            }
            Text("\(filled ? "Recorded" : section.required ? "Required and not recorded" : "Not recorded")\(section.gatedBy.map { " · written only by a party holding \($0)" } ?? "")")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
            if let note = section.note {
                Text(note).font(.caption2).italic().foregroundStyle(ThusoTheme.faint)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Medication

/* Reached by a doctor through view-clinical-record and by a pharmacy through dispense, because the
   contract says a pharmacy sees “the prescription and the allergies that bear on filling it”. The
   allergy panel is repeated here rather than left in the header: this is the screen where somebody
   hands over a medicine. */
struct PatientFileMedication: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    private var visible: [Medicine] { patient.medication.filter { canOpen(viewer, $0).allowed } }
    var body: some View {
        let current = visible.filter { $0.stopped == nil }
        let past = visible.filter { $0.stopped != nil }
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            CareCard {
                if patient.allergies.isEmpty {
                    Label("No allergy has been recorded.", systemImage: "exclamationmark.shield")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("That is not the same as no allergy. Ask before dispensing.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                } else {
                    Label("Allergies: \(patient.allergies.map { "\($0.substance) — \($0.reaction.lowercased()) (\($0.severity.lowercased()))" }.joined(separator: "; ")).",
                          systemImage: "exclamationmark.triangle")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                    Text("Carried into this screen because the pharmacist needs it before anything else, not after the label is printed.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                }
            }
            SectionHeading(title: "Current medicine")
            CareCard {
                if current.isEmpty {
                    Text("No current medicine is open to this viewer.").font(.footnote).foregroundStyle(ThusoTheme.body)
                } else {
                    ForEach(current) { medicine in
                        MedicineRow(medicine: medicine, detail: "\(medicine.frequency) · started \(medicine.started) · \(medicine.repeats)",
                                    attribution: "\(medicine.prescriber)\(medicine.dispensedBy.map { " · last dispensed \($0)" } ?? " · not yet dispensed")")
                    }
                }
            }
            if !past.isEmpty {
                SectionHeading(title: "Stopped")
                CareCard {
                    ForEach(past) { medicine in
                        MedicineRow(medicine: medicine,
                                    detail: "Stopped \(medicine.stopped ?? "") · started \(medicine.started)",
                                    attribution: medicine.prescriber)
                    }
                }
            }
            ProtectedLineNote(viewer: viewer, what: "medicine")
        }
    }
}
struct MedicineRow: View {
    let medicine: Medicine
    let detail: String
    let attribution: String
    var body: some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            TileIcon(symbol: "pills", size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(medicine.name) \(medicine.dose)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(detail).font(.caption).foregroundStyle(ThusoTheme.body)
                Text(attribution).font(.caption2).foregroundStyle(ThusoTheme.faint)
                ReleasedTag(entry: medicine)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Results

struct PatientFileResults: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    private var rows: [LabReport] { patient.results.filter { canOpen(viewer, $0).allowed } }
    var body: some View {
        let order = can(viewer, "order-test")
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            if rows.isEmpty {
                CareCard { Text("No result in this file is open to this viewer.").font(.footnote).foregroundStyle(ThusoTheme.body) }
            } else {
                ForEach(rows) { report in
                    CareCard {
                        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                            TileIcon(symbol: "testtube.2", size: 38)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(report.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text("\(report.source) · \(shortDate(report.at))").font(.caption).foregroundStyle(ThusoTheme.body)
                            }
                            Spacer(minLength: 0)
                            StatusPill(text: report.status)
                        }
                        ReleasedTag(entry: report)
                        ForEach(report.rows) { row in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                                    Text(row.name).font(.caption).foregroundStyle(ThusoTheme.body)
                                    Spacer(minLength: 8)
                                    Text(row.value).font(.footnote.weight(.semibold))
                                        .foregroundStyle(row.flag == nil ? ThusoTheme.ink : ThusoTheme.mangoInk)
                                }
                                Text("Reference range \(row.range)\(row.flag.map { " · \($0)" } ?? "")")
                                    .font(.caption2).foregroundStyle(ThusoTheme.faint)
                            }
                            .padding(.vertical, 2)
                            .accessibilityElement(children: .combine)
                        }
                        Text("Fictional results. Reference ranges are indicative and are not a validated early-warning score.")
                            .font(.caption2).foregroundStyle(ThusoTheme.faint)
                        Label("Released by \(report.releasedBy). An abnormal result is held until a clinician releases it with an explanation — release is a clinical act, not a delivery step.",
                              systemImage: "checkmark.shield")
                            .font(.caption2).foregroundStyle(ThusoTheme.body)
                    }
                }
            }
            ProtectedLineNote(viewer: viewer, what: "result")
            if !order.allowed {
                RefusalCard(title: "Requesting a test is refused", decision: order)
            } else {
                NavigationLink { LabOrderView() } label: {
                    Text("Request a test · open the sample order").frame(maxWidth: .infinity)
                }
                .buttonStyle(QuietButton())
            }
        }
    }
}

// MARK: - Referrals

struct PatientFileReferrals: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    private var rows: [ReferralRow] { patient.referrals.filter { canOpen(viewer, $0).allowed } }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            CareCard {
                if rows.isEmpty {
                    Text("No referral in this file is open to this viewer.").font(.footnote).foregroundStyle(ThusoTheme.body)
                } else {
                    ForEach(rows) { referral in
                        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                            TileIcon(symbol: "paperplane", size: 38)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(referral.to).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text(referral.reason).font(.caption).foregroundStyle(ThusoTheme.body)
                                Text("\(shortDate(referral.at)) · \(referral.urgency) · \(referral.by)")
                                    .font(.caption2).foregroundStyle(ThusoTheme.faint)
                                StatusPill(text: referral.status, tone: referral.status.hasPrefix("Accepted") ? "teal" : "sky")
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            ProtectedLineNote(viewer: viewer, what: "referral")
            /* records.json separates the two acts — a referral opens with the clinical record, and
               `writtenBy` marks refer-patient as what it takes to raise one. This tab is gated on
               raising one, which is narrower than the contract asks, and it says so here rather
               than being quietly loosened on one platform and not the others. */
            Label("The contract lets a nurse read that her patient was referred, and reserves making a referral for a clinician holding “refer-patient”. This tab currently asks for the second, which is stricter than the record type is. Separating reading a referral from writing one is not built.",
                  systemImage: "paperplane")
                .font(.caption2).foregroundStyle(ThusoTheme.body)
        }
    }
}

// MARK: - Documents

struct PatientFileDocuments: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    private var rows: [DocumentRow] { patient.documents.filter { canOpen(viewer, $0).allowed } }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            CareCard {
                if rows.isEmpty {
                    Text("No document in this file is open to this viewer.").font(.footnote).foregroundStyle(ThusoTheme.body)
                } else {
                    ForEach(rows) { document in
                        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                            TileIcon(symbol: "doc.text", size: 38)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(document.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text("\(document.kind) · \(document.by)").font(.caption).foregroundStyle(ThusoTheme.body)
                                Text("\(shortDate(document.at)) · DocumentReference").font(.caption2).foregroundStyle(ThusoTheme.faint)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            ProtectedLineNote(viewer: viewer, what: "document")
        }
    }
}

// MARK: - Billing

/* A service code and an amount, never a diagnosis in words. That is necessary and it is not
   sufficient: 3932 is not anonymous to anybody holding the code book, so a claim line for a
   protected service discloses the condition as surely as the note would. Those lines are withheld
   too, and the screen says so rather than letting the code do quietly what the words are forbidden
   from doing. */
struct PatientFileBilling: View {
    let patient: PatientRecord
    let viewer: VettingSubject
    private var rows: [BillingLine] { patient.billing.filter { canOpen(viewer, $0).allowed } }
    var body: some View {
        let total = rows.reduce(0) { $0 + $1.amount }
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            CareCard {
                Label("A code is not anonymous.", systemImage: "creditcard")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text("Finance sees a service code and an amount and never a diagnosis in words — but a code can be looked up. A claim line for a protected service is withheld here for the same reason the words are.")
                    .font(.footnote).foregroundStyle(ThusoTheme.body)
            }
            CareCard {
                if rows.isEmpty {
                    Text("No claim line in this file is open to this viewer.").font(.footnote).foregroundStyle(ThusoTheme.body)
                } else {
                    ForEach(rows) { line in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                                Text("\(line.code) · \(line.service)").font(.footnote.weight(.semibold))
                                    .foregroundStyle(ThusoTheme.ink)
                                Spacer(minLength: 8)
                                Text("R\(line.amount)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                            }
                            Text("\(shortDate(line.at)) · \(line.payer) · \(line.status)")
                                .font(.caption2).foregroundStyle(ThusoTheme.body)
                            if let note = line.note {
                                Text(note).font(.caption2).foregroundStyle(ThusoTheme.faint)
                            }
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                        Divider().overlay(ThusoTheme.line)
                    }
                    HStack {
                        Text("Visible to this viewer").font(.caption).foregroundStyle(ThusoTheme.body)
                        Spacer()
                        Text("R\(total) · \(rows.count) of \(patient.billing.count) lines")
                            .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    }
                    .accessibilityElement(children: .combine)
                    Text("Fictional claim lines. Nothing has been submitted to a scheme and no payment has been taken.")
                        .font(.caption2).foregroundStyle(ThusoTheme.faint)
                }
            }
            ProtectedLineNote(viewer: viewer, what: "claim line")
        }
    }
}
