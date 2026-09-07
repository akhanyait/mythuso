import SwiftUI

/* One shape for every encounter. The sections, which of them are required, which capability each
   hangs on and the four SOAP headings all come from the record contract, because a structure
   retyped into a screen is a structure that holds only until somebody edits the screen.

   SOAP is a second *ordering* of the same fields rather than a second set of boxes. One flat store,
   keyed by field: switching view rearranges the screen and touches no value, so there is no second
   copy of the note to fall out of step with the first.

   Nothing here is written, transmitted or acted on. The patients, the clinicians and their council
   registrations are fictional. */

/* Which sections each SOAP heading covers, read off the headings' own descriptions in the
   contract: Subjective is what the patient reports, Objective is vitals and examination,
   Assessment is the assessment, Plan is treatment, medicine, tests, referral and follow-up. A
   section no heading claims — the free clinical note — is shown after the four rather than swept
   under Plan, because a heading that means “everything else” has stopped meaning anything. */
private let soapCovers: [String: [String]] = [
    "S": ["reason", "history"],
    "O": ["observations", "examination"],
    "A": ["assessment"],
    "P": ["plan", "medication", "tests", "referral", "followup"]
]
private let soapClaimed = Set(soapCovers.values.flatMap { $0 })
private let outsideSoap = Records.consultationSections.filter { $0.id != "clinician" && !soapClaimed.contains($0.id) }

/* ---- Fields --------------------------------------------------------------------------------
   A section is one field, so the record's shape is the standard's shape. The assessment is the one
   exception, and it is the exception on purpose — see mayDiagnose. */
struct ConsultationField: Identifiable, Hashable {
    let id: String
    let sectionId: String
    let label: String
    var prompt: String = ""
}
enum ConsultationFieldIds {
    static let nursing = "assessment-nursing"
    static let impression = "assessment-impression"
    static let diagnosis = "diagnosis"
}
private let fieldPrompts: [String: String] = [
    "reason": "Why the patient asked to be seen, in their words where it matters…",
    "history": "Onset, duration, what makes it better or worse, medicine already taken…",
    "observations": "Anything measured that the readings above do not carry…",
    "examination": "What you examined, and what you found…",
    "plan": "What is being done about it, by whom, and by when…",
    "medication": "Medicine, dose, frequency, duration and repeats…",
    "tests": "The test, the specimen, and the question it answers…",
    "referral": "To whom, why, and how urgently…",
    "followup": "When, with whom, and what would bring the patient back sooner…",
    "notes": "What the next clinician needs that the sections above do not hold…"
]
private func consultationFields(for section: ConsultationSection, mayDiagnose: Bool) -> [ConsultationField] {
    if section.id == "clinician" { return [] }                 // the signature block, not something typed
    if section.id == "assessment" {
        return mayDiagnose
            ? [ConsultationField(id: ConsultationFieldIds.impression, sectionId: section.id,
                                 label: "Assessment — clinical impression", prompt: "What you make of the findings…"),
               ConsultationField(id: ConsultationFieldIds.diagnosis, sectionId: section.id,
                                 label: "Diagnosis", prompt: "The diagnosis you are accountable for…")]
            : [ConsultationField(id: ConsultationFieldIds.nursing, sectionId: section.id,
                                 label: "Assessment — recorded by a nurse", prompt: "What you found, and what concerns you…")]
    }
    return [ConsultationField(id: section.id, sectionId: section.id, label: section.name,
                              prompt: fieldPrompts[section.id] ?? "")]
}
/// Every field the standard can produce, whoever is writing. Used to show a reader what the record
/// already holds in fields their own form does not offer.
private let everyConsultationField: [ConsultationField] = {
    var seen = Set<String>()
    return Records.consultationSections.flatMap { section in
        (consultationFields(for: section, mayDiagnose: true) + consultationFields(for: section, mayDiagnose: false))
            .filter { seen.insert($0.id).inserted }
    }
}()

// MARK: - The record

struct ConsultationSignature: Hashable {
    let name: String
    let reference: String
    let role: String
    let at: Date
    let diagnosis: Bool
}

/* A nurse and a doctor hold different grants in the vetting table, so they are offered different
   forms. These three writers are the three answers a design review needs to see side by side: a
   cleared nurse, a cleared doctor, and a doctor whose registration lapsed four days ago. */
private let consultationWriterIds = ["N-205", "D-401", "D-402"]

struct ConsultationRecordView: View {
    var reference = "TH-2048"
    var patient = "Lerato Molefe"
    /// Which party the form opens as. A workspace passes its own.
    var writerId = "N-205"
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var vetting = VettingStore.shared
    @State private var writer = ""
    @State private var view: RecordView = .record
    @State private var draft: [String: String] = [:]
    @State private var signature: ConsultationSignature?

    enum RecordView: String, CaseIterable, Identifiable {
        case record = "Full record", soap = "SOAP", read = "As it reads"
        var id: String { rawValue }
    }

    private var writers: [VettingSubject] { consultationWriterIds.compactMap { vetting.subject($0) } }
    private var subject: VettingSubject { writers.first { $0.id == writer } ?? writers.first ?? VettingFixtures.subjects[0] }
    private var role: VettedRole? { subject.role }
    /* There is no “diagnose” capability in the vetting table. The one it grants a doctor and never
       a nurse is signing a clinical decision, so that is what the form asks about. If a narrower
       capability is ever added, this line is the only place that has to change. */
    private var mayDiagnose: Bool { roleGrants(subject, "sign-clinical-review") }
    private var mayWrite: VettingDecision { can(subject, "write-clinical-note") }
    /* Shape follows the role's grants; permission to write today follows the live vetting decision.
       Keeping those apart matters: a doctor whose registration lapsed is still a doctor, and their
       record is refused outright rather than quietly re-shaped into a nurse's. */
    private func roleGrants(_ party: VettingSubject, _ capability: String) -> Bool {
        (party.role?.grants ?? []).contains { $0.capability == capability }
    }
    private func value(_ id: String) -> String { (draft[id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    private func fields(_ section: ConsultationSection) -> [ConsultationField] { consultationFields(for: section, mayDiagnose: mayDiagnose) }
    /* Two different refusals, kept apart. A section the role is never granted is not on the form at
       all; a section the role holds but this party's clearance does not currently allow is on the
       form, locked, saying which check took it away. */
    private var offered: [ConsultationSection] {
        Records.consultationSections.filter { $0.gatedBy == nil || roleGrants(subject, $0.gatedBy!) }
    }
    private var neverGranted: [ConsultationSection] {
        Records.consultationSections.filter { section in section.gatedBy.map { !roleGrants(subject, $0) } ?? false }
    }
    private var offeredFields: [ConsultationField] { offered.flatMap(fields) }
    private var outstanding: [ConsultationSection] {
        offered.filter { $0.required && $0.id != "clinician" && !fields($0).contains { !value($0.id).isEmpty } }
    }
    /// Anything the record already holds that this writer is not offered — a nurse's assessment
    /// read by a doctor, a doctor's prescription read by a nurse. It stays visible and read-only,
    /// because the point of one structure is that the record does not change when the reader does.
    private var carried: [ConsultationField] {
        everyConsultationField.filter { field in !value(field.id).isEmpty && !offeredFields.contains { $0.id == field.id } }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let signature { signedBlock(signature) } else { editor }
            }
            .padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Consultation").navigationBarTitleDisplayMode(.inline)
        .onAppear { if writer.isEmpty { writer = writers.contains { $0.id == writerId } ? writerId : (writers.first?.id ?? "") } }
    }

    @ViewBuilder private var header: some View {
        DemoBadge()
        StatusPill(text: signature == nil ? "Draft — not signed" : "Signed · demo record", tone: signature == nil ? "amber" : "teal")
        Text("\(reference) · \(patient)").font(.system(size: 20, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        Text(Records.consultationWhy).font(.footnote).foregroundStyle(ThusoTheme.body)
        CareCard {
            Text("Writing as").font(.caption).foregroundStyle(ThusoTheme.body)
            Picker("Writing as", selection: $writer) {
                ForEach(writers) { Text("\($0.name) · \($0.reference)").tag($0.id) }
            }
            .labelsHidden()
            .disabled(signature != nil)
            .onChange(of: writer) { _, _ in signature = nil }
            HStack(spacing: 8) {
                SubjectStatusPill(status: summarise(subject).status)
                Text(role?.name ?? subject.roleId).font(.caption2).foregroundStyle(ThusoTheme.body)
            }
            .accessibilityElement(children: .combine)
            if !mayWrite.allowed {
                RefusalCard(title: "This form is read-only", decision: mayWrite)
                Text("The form is read-only rather than merely unsignable: an entry nobody may put their registration against is not a record, it is a note that looks like one.")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            }
        }
    }

    @ViewBuilder private var editor: some View {
        Picker("View", selection: $view) {
            ForEach(RecordView.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        Label("One record, \(offeredFields.filter { !value($0.id).isEmpty }.count) of \(offeredFields.count) fields written. SOAP and the long form are two arrangements of those same fields — switching loses nothing, because there is no second copy of the note to keep in step.",
              systemImage: "square.and.pencil")
            .font(.caption2).foregroundStyle(ThusoTheme.body)
            .accessibilityAddTraits(.updatesFrequently)

        switch view {
        case .record:
            ForEach(offered) { sectionBlock($0) }
        case .soap:
            ForEach(Records.soap) { heading in
                let covered = offered.filter { (soapCovers[heading.id] ?? []).contains($0.id) }
                CareCard {
                    StatusPill(text: "\(heading.id) · \(heading.name)", tone: "quiet")
                    Text(heading.detail).font(.caption).foregroundStyle(ThusoTheme.body)
                    if covered.isEmpty {
                        Label("Nothing under this heading is offered to a \(role?.name.lowercased() ?? "party").",
                              systemImage: "lock").font(.caption2).foregroundStyle(ThusoTheme.body)
                    } else {
                        ForEach(covered) { sectionFields($0) }
                    }
                }
            }
            ForEach(outsideSoap.filter { section in offered.contains { $0.id == section.id } }) { section in
                CareCard {
                    StatusPill(text: "No SOAP heading claims this", tone: "quiet")
                    sectionFields(section)
                }
            }
        case .read:
            ForEach(Records.soap) { heading in
                let lines = offered.filter { (soapCovers[heading.id] ?? []).contains($0.id) }
                    .flatMap(fields).filter { !value($0.id).isEmpty }
                CareCard {
                    StatusPill(text: "\(heading.id) · \(heading.name)", tone: "quiet")
                    if lines.isEmpty {
                        Text("Nothing written under \(heading.name.lowercased()) yet.")
                            .font(.caption).foregroundStyle(ThusoTheme.body)
                    } else {
                        ForEach(lines) { FieldRow(label: $0.label, value: value($0.id)) }
                    }
                }
            }
            CareCard {
                Label("Assembled from the fields above every time this view opens. It is a reading of the record rather than a copy of it, so there is nothing here to save and nothing to fall out of step.",
                      systemImage: "list.clipboard").font(.caption).foregroundStyle(ThusoTheme.body)
            }
        }

        if !carried.isEmpty {
            CareCard {
                StatusPill(text: "Already in this record", tone: "quiet")
                ForEach(carried) { FieldRow(label: $0.label, value: value($0.id)) }
                Label("Written on another clinician’s form and read-only here. The record does not change shape because the reader did.",
                      systemImage: "lock").font(.caption2).foregroundStyle(ThusoTheme.body)
            }
        }
        if !neverGranted.isEmpty {
            CareCard {
                Label(neverGrantedSentence, systemImage: "stethoscope")
                    .font(.caption).foregroundStyle(ThusoTheme.body)
            }
        }
        signatureBlock
    }

    private var neverGrantedSentence: String {
        let names = neverGranted.map { $0.name.lowercased() }.joined(separator: ", ")
        let opening = names.prefix(1).uppercased() + String(names.dropFirst())
        let plural = neverGranted.count > 1
        return "\(opening) \(plural ? "are" : "is") not on this form at all. A \(role?.name.lowercased() ?? "party") is never granted \(plural ? "those capabilities" : "that capability"), so the section is absent rather than offered and refused after it has been written."
    }

    /// A whole section as a card, for the long form.
    @ViewBuilder private func sectionBlock(_ section: ConsultationSection) -> some View {
        if section.id != "clinician" {                          // rendered once, at the signature
            CareCard { sectionFields(section) }
        }
    }
    /// The fields themselves, so SOAP can arrange the same ones without a second set of boxes.
    @ViewBuilder private func sectionFields(_ section: ConsultationSection) -> some View {
        let decision = section.gatedBy.map { can(subject, $0) } ?? mayWrite
        VStack(alignment: .leading, spacing: 10) {
            if decision.allowed {
                ForEach(fields(section)) { field in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(field.label).font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.body)
                        TextEditor(text: Binding(get: { draft[field.id] ?? "" },
                                                 set: { draft[field.id] = String($0.prefix(1200)) }))
                            .frame(minHeight: 76).scrollContentBackground(.hidden)
                            .padding(8)
                            .background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(ThusoTheme.line, lineWidth: 1))
                            .disabled(signature != nil || !mayWrite.allowed)
                            .accessibilityLabel(field.label)
                            .accessibilityHint(field.prompt)
                        if !field.prompt.isEmpty && value(field.id).isEmpty {
                            Text(field.prompt).font(.caption2).foregroundStyle(ThusoTheme.faint)
                        }
                    }
                }
            } else {
                FieldRow(label: section.name, value: "Locked")
                /* The reason is worth repeating only where it is this section's own. A form the
                   writer may not use at all says so once, at the top, rather than twelve times
                   down the page. */
                if section.gatedBy != nil, let reason = decision.reason {
                    Label(reason, systemImage: "hand.raised").font(.caption2).foregroundStyle(ThusoTheme.danger)
                }
            }
            if let note = section.note {
                Text(note).font(.caption2).foregroundStyle(ThusoTheme.faint)
            }
            /* A nurse's assessment and a doctor's diagnosis are different fields, not one field
               with a warning. The row stays on the form, empty and locked, so the record shows
               plainly that no diagnosis has been made rather than looking as though the question
               was never asked. */
            if section.id == "assessment" && !mayDiagnose {
                FieldRow(label: "Diagnosis", value: "Not recorded — a doctor’s")
                Label("A nurse’s assessment is a different field from a diagnosis, not the same field written by somebody else. \(can(subject, "sign-clinical-review").reason ?? "") This record carries no diagnosis until a doctor writes one under their own HPCSA registration.",
                      systemImage: "person.crop.circle.badge.checkmark")
                    .font(.caption2).foregroundStyle(ThusoTheme.body)
            }
        }
    }

    /* Attribution — name, council registration and the moment of signing — is part of the record,
       not a footer. The registration comes from the vetting record dispatch and the clinical queue
       ask before they offer anything, rather than from a number typed into this screen. */
    @ViewBuilder private var signatureBlock: some View {
        CareCard {
            FieldRow(label: "Signature", value: "Draft — \(subject.name) has not signed")
            Text(outstanding.isEmpty
                 ? "Every required section is written. Signing attaches the name, the council registration and the moment of signing."
                 : "Outstanding before this can be signed: \(outstanding.map { $0.name.lowercased() }.joined(separator: ", ")).")
                .font(.caption).foregroundStyle(ThusoTheme.body)
                .accessibilityAddTraits(.updatesFrequently)
            Button("Sign demo consultation") {
                signature = ConsultationSignature(name: subject.name, reference: subject.reference,
                                                  role: role?.name ?? "—", at: Date(),
                                                  diagnosis: mayDiagnose && !value(ConsultationFieldIds.diagnosis).isEmpty)
            }
            .buttonStyle(CareButton())
            .disabled(!mayWrite.allowed || !outstanding.isEmpty)
        }
    }

    @ViewBuilder private func signedBlock(_ signature: ConsultationSignature) -> some View {
        CareCard {
            Label("Demo consultation signed.", systemImage: "checkmark.seal.fill")
                .font(.headline).foregroundStyle(ThusoTheme.teal)
            FieldRow(label: "Clinician", value: signature.name)
            FieldRow(label: "Council registration", value: signature.reference)
            FieldRow(label: "Role", value: signature.role)
            FieldRow(label: "Signed", value: formatEventTime(signature.at))
            FieldRow(label: "Diagnosis", value: signature.diagnosis
                     ? "Recorded by the signing doctor"
                     : "Not recorded — a nurse’s assessment is not a diagnosis")
            Text("Nothing was written to a record, transmitted or acted on. In production this becomes an append-only entry attributed to that registration, and an encounter nobody signs stays a draft rather than quietly counting as a consultation.")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
            Button("Close") { dismiss() }.buttonStyle(QuietButton())
        }
    }
}
