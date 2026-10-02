import SwiftUI

/* The doctor's medical certificate on iOS (2 October 2026) — the sick note the founder asked for, beside
 * the consultation record and the referral. The web's SickNote.tsx is the same screen; both read
 * packages/catalog/sick-note.json, generated here as SickNoteData.swift, and the rules are SickNote.swift's.
 *
 * SickNoteView is the doctor's page: the consultation a certificate comes out of, and the composer for it.
 * SickNoteComposer is the form on its own, handed a consultation's reference, the patient and who is
 * writing, for a consultation screen to embed.
 *
 * What it refuses is the point of it: a nurse (the sentence she already reads on her assessment), a doctor
 * whose registration lapsed (the vetting register's refusal), a call with nobody in the room (the
 * teleconsultation contract's own words), a consultation that has not happened, a period reaching further
 * back or running longer than the contract allows, and an illness described without the patient's
 * agreement. No identity number is carried. And nothing is issued: a signature shows the certificate as
 * the patient would read it, marked not issued, held in this screen's state and gone when it closes.
 * Every word is SickNoteData's; none is typed here.
 */
struct SickNoteView: View {
    @State private var reference = SickNoteData.consultations[0].reference

    private var chosen: SickNoteConsultation { SickNote.consultation(reference) ?? SickNoteData.consultations[0] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                CareHeading(eyebrow: "Doctor", title: SickNoteData.Screen.deskTitle, subtitle: SickNoteData.Screen.lead)
                CapabilityNotice(of: "clinical-records")
                muted(SickNoteData.Screen.deskLead)
                Picker(SickNoteData.Screen.consultationLabel, selection: $reference) {
                    ForEach(SickNoteData.consultations) { k in
                        Text("\(k.reference) · \(k.patient) · \(SickNote.day(k.dayOffset))").tag(k.reference)
                    }
                }
                .pickerStyle(.menu)
                SickNoteComposer(reference: chosen.reference, patient: chosen.patient).id(chosen.reference)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(SickNoteData.Screen.title)
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
    }
}

struct SickNoteComposer: View {
    let reference: String
    let patient: String
    @State private var writerId: String
    @State private var draft: SickNoteDraft
    @State private var signed: [SickNoteLine]?

    init(reference: String, patient: String, writer: String = "D-401") {
        self.reference = reference
        self.patient = patient
        _writerId = State(initialValue: writer)
        _draft = State(initialValue: SickNote.draft(for: reference, patient: patient))
    }

    private var issuer: SickNoteIssuer { SickNote.issuer(writerId) }
    private var refusals: [SickNoteRefusal] { SickNote.refusals(draft, issuer: issuer) }
    private var seen: SickNoteConsultation? { SickNote.consultation(reference) }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareCard(padding: ThusoSpacing.space16) {
                Text(SickNoteData.notIssued).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("sick-note-not-issued")
            }
            if let signed { certificate(signed) } else { form }
        }
    }

    private var form: some View {
        CareCard(padding: ThusoSpacing.space16) {
            LabeledContent(SickNoteData.Screen.consultationLabel, value: seen.map { "\($0.reference) · \(SickNote.day($0.dayOffset)) at \($0.time)" } ?? reference)
            LabeledContent(SickNoteData.labels["patient"] ?? "", value: patient)
            Picker(SickNoteData.Screen.writingAs, selection: $writerId) {
                ForEach(SickNoteData.writers, id: \.self) { id in
                    Text(VettingStore.shared.subject(id).map { "\($0.name) · \($0.reference)" } ?? id).tag(id)
                }
            }
            if seen?.kind == "home-visit" { muted("\(SickNoteData.Basis.homeVisit) \(SickNoteData.Basis.byVideo)") }
            muted(SickNoteData.protocolLine)
            Picker(SickNoteData.Screen.fitnessLabel, selection: $draft.fitness) {
                ForEach(SickNoteData.fitness) { Text($0.label).tag($0.id) }
            }
            .pickerStyle(.inline)
            Stepper("\(SickNoteData.Screen.fromLabel): \(SickNote.day(draft.fromOffset))", value: $draft.fromOffset)
            Stepper("\(SickNoteData.Screen.toLabel): \(SickNote.day(draft.toOffset))", value: $draft.toOffset)
            muted("\(max(draft.daysCovered, 0)) \(SickNoteData.Screen.daysLabel)")
            /* Rule 16(1)(f): the proviso is the default, and turning the agreement off clears the words, so
               nothing written before the patient changed their mind reaches the certificate. */
            Toggle(SickNoteData.Diagnosis.consentLabel, isOn: Binding(get: { draft.consent }, set: { on in
                draft.consent = on
                if !on { draft.description = "" }
            }))
            if draft.consent {
                TextField(SickNoteData.Diagnosis.descriptionLabel, text: Binding(get: { draft.description }, set: {
                    draft.description = String($0.prefix(SickNoteData.Diagnosis.descriptionMaxLength))
                }), prompt: Text(SickNoteData.Diagnosis.descriptionHint), axis: .vertical)
            } else {
                muted(SickNoteData.Diagnosis.withheld)
            }
            ForEach(SickNoteData.notCarried, id: \.self) { muted($0) }
            if refusals.isEmpty {
                muted(SickNoteData.Screen.readyLine)
            } else {
                Text(SickNoteData.Screen.refusedHeading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
                ForEach(refusals) { refusal in
                    Label(refusal.sentence, systemImage: "xmark.shield").font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button(SickNoteData.Screen.sign) {
                guard refusals.isEmpty else { return }
                signed = SickNote.certificate(draft, issuer: issuer)
            }
            .buttonStyle(CareButton())
            .disabled(!refusals.isEmpty)
        }
    }

    /* As the patient would read it: marked not issued above and below, so no crop of it loses both. */
    private func certificate(_ lines: [SickNoteLine]) -> some View {
        CareCard(padding: ThusoSpacing.space16) {
            Text(SickNoteData.notIssuedShort.uppercased()).font(.thuso(.caption)).bold().foregroundStyle(ThusoRole.foreground)
            Text(SickNoteData.Screen.asSeenHeading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            ForEach(lines) { line in
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(line.label).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    Text(line.value).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                }
            }
            muted(SickNoteData.notIssued)
            muted(SickNoteData.memoryOnly)
            Button(SickNoteData.Screen.again) {
                signed = nil
                draft = SickNote.draft(for: reference, patient: patient)
            }
            .buttonStyle(QuietButton())
        }
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
    }
}
