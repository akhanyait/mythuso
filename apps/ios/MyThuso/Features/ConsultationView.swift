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
    @ObservedObject private var kit = CaptureStore.shared
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
    /* The readings this encounter is being written about, read out of the same store the nurse
       captured them into. They are not retyped into the note and they are not summarised into it:
       the observations section carries them whole, with their origins, their instruments and their
       caveats, and the free-text box beside them is for what those readings do not say. A record
       that let a clinician retype “BP 128/82” into prose would have quietly turned a device reading
       and a typed one into the same fact. */
    private var visitReadings: [CapturedEntry] {
        kit.forVisit(reference).filter { !$0.superseded }.sorted { $0.writtenToPhoneAt < $1.writtenToPhoneAt }
    }
    private var caveated: [CapturedEntry] { visitReadings.filter { $0.reading.hasCaveats } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                header
                if let signature { signedBlock(signature) } else { editor }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Consultation").navigationBarTitleDisplayMode(.inline)
        .onAppear { if writer.isEmpty { writer = writers.contains { $0.id == writerId } ? writerId : (writers.first?.id ?? "") } }
        /* A signature belongs to the writer who put it there, so changing the writer takes it off. */
        .onChange(of: writer) { _, _ in signature = nil }
    }

    /* THE RECORD OPENS ON A DECK: who is writing, how much of the standard is written, and what the
       visit already carried in. The standing is on the canvas where the eye lands, filled while the
       record is a draft, because a draft is the state that must not be mistaken for a consultation. The
       ring is this writer's own fields with the written ones lit — the same `offeredFields` the form
       below is built from, so it fills as the form is typed into — and the panel's ring is the readings
       carried from the capture store, lit where one carries a caveat. The choice of arrangement is the
       sheet on the canvas's edge, because it rearranges everything under it and changes no value. */
    @ViewBuilder private var header: some View {
        let filled = offeredFields.filter { !value($0.id).isEmpty }.count
        let standing = summarise(subject)
        DeckHero {
            DeckPreviewMark()
            DeckHeadline(eyebrow: "Consultation record",
                         words: [.text(reference), .glyph("square.and.pencil"), .text(patient)],
                         tail: Records.consultationWhy)
            DeckTag(text: signature == nil ? "Draft — not signed" : "Signed · demo record", flagged: signature == nil, ground: .night)
            DeckPills(label: "Writing as", selection: $writer,
                      options: writers.map { ($0.id, "\($0.name) · \($0.reference)") })
                .disabled(signature != nil)
            HStack(spacing: ThusoSpacing.space8) {
                DeckTag(text: standing.status.label, flagged: !standing.cleared)
                Text(role?.name ?? subject.roleId).font(.thuso(.footnote)).foregroundStyle(DeckInk.quiet)
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            if !mayWrite.allowed {
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    Text("This form is read-only").font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.ink)
                    DeckRefusal(decision: mayWrite)
                    if !mayWrite.blockedBy.isEmpty {
                        Text("Outstanding: \(mayWrite.blockedBy.map(\.name).joined(separator: " · "))")
                            .font(.thuso(.footnote)).foregroundStyle(DeckInk.quiet)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text("The form is read-only rather than merely unsignable: an entry nobody may put their registration against is not a record, it is a note that looks like one.")
                        .font(.thuso(.footnote)).foregroundStyle(DeckInk.quiet)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            DeckGlass {
                DeckFigure(value: "\(filled)", label: "of \(offeredFields.count) fields written",
                           chip: outstanding.isEmpty ? "Every required section written" : "\(outstanding.count) required still to write",
                           flagged: !outstanding.isEmpty,
                           shape: .ring(offeredFields.map { !value($0.id).isEmpty }))
            }
            DeckPanel {
                DeckFigure(value: "\(visitReadings.count)", label: "readings carried from the visit, not retyped",
                           chip: caveated.isEmpty ? "None carrying a caveat" : "\(caveated.count) carrying a caveat",
                           flagged: !caveated.isEmpty,
                           shape: .ring(visitReadings.map { $0.reading.hasCaveats }), ground: .panel)
            }
        } sheet: {
            DeckPills(label: "View", selection: $view, options: RecordView.allCases.map { ($0, $0.rawValue) }, onNight: false)
            Label("One record, \(filled) of \(offeredFields.count) fields written. SOAP and the long form are two arrangements of those same fields — switching loses nothing, because there is no second copy of the note to keep in step.",
                  systemImage: "square.and.pencil")
                .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }

    @ViewBuilder private var editor: some View {
        DeckSectionHead(title: "The record", count: "\(offeredFields.filter { !value($0.id).isEmpty }.count)/\(offeredFields.count)")

        switch view {
        case .record:
            ForEach(offered) { sectionBlock($0) }
        case .soap:
            ForEach(Records.soap) { heading in
                let covered = offered.filter { (soapCovers[heading.id] ?? []).contains($0.id) }
                CareCard {
                    StatusPill(text: "\(heading.id) · \(heading.name)", tone: "quiet")
                    Text(heading.detail).font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                    if covered.isEmpty {
                        Label("Nothing under this heading is offered to a \(role?.name.lowercased() ?? "party").",
                              systemImage: "lock").font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
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
                            .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                    } else {
                        ForEach(lines) { FieldRow(label: $0.label, value: value($0.id)) }
                    }
                }
            }
            CareCard {
                Label("Assembled from the fields above every time this view opens. It is a reading of the record rather than a copy of it, so there is nothing here to save and nothing to fall out of step.",
                      systemImage: "list.clipboard").font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
            }
        }

        if !carried.isEmpty {
            CareCard {
                StatusPill(text: "Already in this record", tone: "quiet")
                ForEach(carried) { FieldRow(label: $0.label, value: value($0.id)) }
                Label("Written on another clinician’s form and read-only here. The record does not change shape because the reader did.",
                      systemImage: "lock").font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            }
        }
        if !neverGranted.isEmpty {
            CareCard {
                Label(neverGrantedSentence, systemImage: "stethoscope")
                    .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
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
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if section.id == "observations" { capturedReadings }
            if decision.allowed {
                ForEach(fields(section)) { field in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(field.label).font(.thuso(.caption, weight: .semibold)).foregroundStyle(DeckInk.sheetQuiet)
                        TextEditor(text: Binding(get: { draft[field.id] ?? "" },
                                                 set: { draft[field.id] = String($0.prefix(1200)) }))
                            .frame(minHeight: 76).scrollContentBackground(.hidden)
                            .padding(ThusoSpacing.space8)
                            .background(DeckInk.panel, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoRole.inputEdge, lineWidth: 1))
                            .disabled(signature != nil || !mayWrite.allowed)
                            .accessibilityLabel(field.label)
                            .accessibilityHint(field.prompt)
                        if !field.prompt.isEmpty && value(field.id).isEmpty {
                            Text(field.prompt).font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
                        }
                    }
                }
            } else {
                FieldRow(label: section.name, value: "Locked")
                /* The reason is worth repeating only where it is this section's own. A form the
                   writer may not use at all says so once, at the top, rather than twelve times
                   down the page. */
                if section.gatedBy != nil, let reason = decision.reason {
                    Label(reason, systemImage: "hand.raised").font(.thuso(.caption2)).foregroundStyle(ThusoRole.dangerInk)
                }
            }
            if let note = section.note {
                Text(note).font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            }
            /* A nurse's assessment and a doctor's diagnosis are different fields, not one field
               with a warning. The row stays on the form, empty and locked, so the record shows
               plainly that no diagnosis has been made rather than looking as though the question
               was never asked. */
            if section.id == "assessment" && !mayDiagnose {
                FieldRow(label: "Diagnosis", value: "Not recorded — a doctor’s")
                Label("A nurse’s assessment is a different field from a diagnosis, not the same field written by somebody else. \(can(subject, "sign-clinical-review").reason ?? "") This record carries no diagnosis until a doctor writes one under their own HPCSA registration.",
                      systemImage: "person.crop.circle.badge.checkmark")
                    .font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            }
        }
    }

    /// Carried into the record rather than retyped into it, so a device reading and a typed one
    /// stay two different facts all the way from the front room to the signature.
    @ViewBuilder private var capturedReadings: some View {
        if visitReadings.isEmpty {
            Label("Nothing has been captured for \(reference) on this phone yet. The assessment writes here.",
                  systemImage: "tray").font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
        } else {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                StatusPill(text: "Carried from the visit · \(visitReadings.count)", tone: "quiet")
                ForEach(visitReadings) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        ReadingRow(reading: entry.reading)
                        HStack(spacing: ThusoSpacing.space8) {
                            CaptureStatePill(state: entry.state)
                            Text(entry.capturedByName).font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
                            Spacer(minLength: 0)
                        }
                        Text(entry.whenItHappened).font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
                        WrittenAgoNote(at: entry.writtenToPhoneAt, what: "This reading")
                    }
                    if entry.id != visitReadings.last?.id { Divider().overlay(DeckInk.sheetLine) }
                }
                Text("Read-only here. These are the readings as they were taken, with the origin, the instrument and the calibration each was taken under. The box below is for what they do not carry.")
                    .font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            }
            .padding(ThusoSpacing.space12)
            .background(DeckInk.panel, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
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
                .font(.thuso(.caption)).foregroundStyle(DeckInk.sheetQuiet)
                .accessibilityAddTraits(.updatesFrequently)
            /* Signed over, not signed away. A caveat is shown at the signature because the
               signature is the moment somebody takes responsibility for what the record says, and
               “that oximeter reading was taken on a cold finger” is exactly the sort of thing that
               gets read three screens earlier and forgotten one screen later. */
            if !caveated.isEmpty {
                CaveatNote(caveats: caveated.flatMap { entry in entry.reading.caveats.map { "\(entry.reading.label): \($0)" } })
                Text("None of these refuses a reading. Each of them marks one, and you are about to put your registration to the record that holds them.")
                    .font(.thuso(.caption2)).foregroundStyle(DeckInk.sheetQuiet)
            }
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
                .font(.thuso(.headline)).foregroundStyle(DeckInk.sheetInk)
            FieldRow(label: "Clinician", value: signature.name)
            FieldRow(label: "Council registration", value: signature.reference)
            FieldRow(label: "Role", value: signature.role)
            FieldRow(label: "Signed", value: formatEventTime(signature.at))
            FieldRow(label: "Diagnosis", value: signature.diagnosis
                     ? "Recorded by the signing doctor"
                     : "Not recorded — a nurse’s assessment is not a diagnosis")
            Text("Nothing was written to a record, transmitted or acted on. In production this becomes an append-only entry attributed to that registration, and an encounter nobody signs stays a draft rather than quietly counting as a consultation.")
                .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
            Button("Close") { dismiss() }.buttonStyle(QuietButton())
        }
    }
}
