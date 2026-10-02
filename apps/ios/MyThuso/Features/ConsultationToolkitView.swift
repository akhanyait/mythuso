import SwiftUI

/* The consultation toolkit on iOS — the founder's ask of 2 October 2026: the live devices in front of the
   nurse and the doctor while they consult, and every tool they need linked on the consultation screen itself.

   WHAT IT IS. A card on the call, the record and the visit, headed by the surface's own heading, with one row
   per tool in the contract's order. A row pushes the tool. Every tool is the screen that already existed —
   the live board, the consultation record, the patient file, the visit assessment — so each keeps its own
   refusals and its own capability notice; a tool this phone has no screen for says what it is, who may use
   it and what it will not do, and opens nothing. The order, the names and every sentence are
   ConsultationToolkitData.swift's; what each tool says right now is ConsultationToolkit.state(of:).

   WHY A LIST THAT PUSHES, NOT THE WEB'S PANEL IN PLACE. On a phone the call already scrolls, and a second
   pane inside it would be a scroll inside a scroll. A push keeps the call's state where it is — the screen
   underneath is not torn down — and the system's back gesture is the one-tap way home the contract asks for.

   WHAT IS REFUSED, AND WHERE. A tool the register does not let this clinician use is listed, with a lock and
   the state in a word, and opens to the register's sentence and nothing else — a row that vanished would teach
   nobody why. A nurse's surface lists no prescription and no sick note at all: the contract says, under its
   own heading, that they are a doctor's on MyThuso. Nothing here sends, books, prescribes or certifies.

   ACCESSIBILITY. Each row is one element read "name, state" with a button trait, so VoiceOver never says the
   lock without the word beside it. At the accessibility sizes the symbol is dropped rather than shrunk, as
   MenuRow does, and every line of text wraps rather than truncates. Nothing moves. */

private typealias Toolkit = ConsultationToolkit

/* One glyph per tool, so the eye can find a tool on the second visit without reading. Never the only
   difference between two rows: the name is always beside it. */
private func toolSymbol(_ id: String) -> String {
    switch id {
    case "devices": return "waveform.path.ecg"
    case "notes", "nurse-notes": return "square.and.pencil"
    case "prescribe": return "pills"
    case "tests": return "testtube.2"
    case "refer": return "arrow.triangle.turn.up.right.diamond"
    case "sick-note": return "signature"
    case "context": return "folder"
    case "protocols": return "book"
    case "assessment": return "list.clipboard"
    case "case": return "stethoscope"
    case "call-doctor": return "video"
    case "refer-to-doctor": return "paperplane"
    default: return "doc.text"
    }
}

struct ConsultationToolkitSection: View {
    let surfaceId: String
    /// The clinician on the screen, by vetting register id. Every tool's answer is asked of the register for them.
    let subjectId: String
    let reference: String
    let patient: String
    /// The call, for the tools that decide something. Nil on a record or a visit.
    var call: ToolkitCall? = nil
    @ObservedObject private var vetting = VettingStore.shared

    var body: some View {
        if let surface = Toolkit.surface(surfaceId), let subject = vetting.subject(subjectId) {
            let tools = Toolkit.tools(of: surface)
            CareCard(weight: .lead) {
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(surface.heading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text(Toolkit.fill(Toolkit.Words.forPatient, ["patient": patient, "reference": reference]))
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                VStack(spacing: 0) {
                    ForEach(tools) { tool in
                        let state = Toolkit.state(of: tool, subject: subject, call: call)
                        NavigationLink {
                            ToolkitToolScreen(tool: tool, state: state, surface: surface, subjectId: subjectId,
                                              reference: reference, patient: patient, call: call)
                        } label: {
                            ToolkitRow(tool: tool, state: state)
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(state.word.map { "\(tool.name), \($0)" } ?? tool.name)
                        .accessibilityAddTraits(.isButton)
                        if tool.id != tools.last?.id { Hairline() }
                    }
                }
            }
            ToolkitRules(surface: surface)
        }
    }
}

/* A row: the glyph, the name, and — only when the tool is not open — a lock and the state in a word. The
   name stays in the text ink whatever the state, because a shut tool is still a tool the clinician needs
   to know exists; the lock is the mark, the word is the meaning. */
private struct ToolkitRow: View {
    let tool: ToolkitToolSpec
    let state: ToolkitToolState
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: ThusoSpacing.space12) {
            if !typeSize.isAccessibilitySize {
                Image(systemName: toolSymbol(tool.id)).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                    .frame(width: 28).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(tool.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let word = state.word {
                    Label(word, systemImage: "lock")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: ThusoSpacing.space8)
            Image(systemName: "chevron.right").font(.thuso(.footnote, weight: .semibold))
                .foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
        }
        .padding(.vertical, ThusoSpacing.space8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}

/* What the surface's role is never granted, and what the toolkit itself will not do. One quiet card under
   the tools rather than a card per sentence: these are standing rules, read once, and the screens they sit
   on already carry refusals of their own. */
private struct ToolkitRules: View {
    let surface: ToolkitSurfaceSpec

    var body: some View {
        CareCard(weight: .quiet) {
            if !surface.refused.isEmpty {
                Text(Toolkit.Words.refusedHeading).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .accessibilityAddTraits(.isHeader)
                ForEach(surface.refused, id: \.tool) { item in
                    ruleLine("lock", name: Toolkit.tool(item.tool)?.name, item.sentence)
                }
            }
            Text(Toolkit.Words.rulesHeading).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .accessibilityAddTraits(.isHeader)
            ForEach(Toolkit.refusals(on: surface)) { refusal in
                ruleLine("nosign", name: nil, refusal.sentence)
            }
        }
    }

    private func ruleLine(_ symbol: String, name: String?, _ sentence: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Image(systemName: symbol).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
            Group {
                if let name {
                    Text("\(Text(verbatim: "\(name).").fontWeight(.semibold)) \(sentence)")
                } else {
                    Text(sentence)
                }
            }
            .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - A tool, opened

/* Where a row goes. A shut tool opens to its sentence and nothing else; an open one opens the screen that
   already does the work, or — where this phone has none — the tool described, with its notice. */
private struct ToolkitToolScreen: View {
    let tool: ToolkitToolSpec
    let state: ToolkitToolState
    let surface: ToolkitSurfaceSpec
    let subjectId: String
    let reference: String
    let patient: String
    let call: ToolkitCall?

    var body: some View {
        if let sentence = state.sentence {
            ToolkitPage(tool: tool) {
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                    Image(systemName: "lock").foregroundStyle(ThusoRole.dangerInk).accessibilityHidden(true)
                    Text(sentence).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        } else {
            switch tool.id {
            case "devices":
                ToolkitPage(tool: tool, head: head) { LiveVitalsPanel(subject: patient) }
            case "notes", "nurse-notes":
                /* Written during the call, signed only once the call has ended as a consultation: an
                   interrupted encounter has no assessment, no plan and no signature. */
                ConsultationRecordView(reference: reference, patient: patient, writerId: subjectId,
                                       signingHeld: (call.map { !$0.ended } ?? false) ? Toolkit.Gates.notesDuringCall : nil)
            case "assessment":
                VisitAssessmentView(reference: reference, patient: patient, nurseId: subjectId)
            case "sick-note":
                /* sick-note.json's own composer and refusals; its notice is drawn here, because the composer draws none. */
                described { SickNoteComposer(reference: reference, patient: patient, writer: subjectId) }
            case "context":
                /* The file opens on this consultation's patient, by the id the fixtures hold for her, or
                   it is said to be missing. It is never opened on whoever the fixtures list first: that
                   would be another patient's file in this one's place. */
                if let file = Toolkit.fileOf(patient) {
                    PatientFileView(viewerId: subjectId, patientId: file.id)
                } else {
                    described { note(Toolkit.fill(Toolkit.Gates.notOnFile, ["patient": patient])) }
                }
            case "call-doctor":
                described { CallADoctorIn() }
            case "refer-to-doctor":
                described { HandToADoctor() }
            default:
                described { note(Toolkit.fill(Toolkit.Gates.notOnThisPhone, ["tool": tool.name])) }
            }
        }
    }

    private var head: ToolkitHead {
        ToolkitHead(eyebrow: surface.homeName, tool: tool, forPatient: Toolkit.fill(Toolkit.Words.forPatient, ["patient": patient, "reference": reference]))
    }

    /* A tool this phone has no screen for: what it is, for whom, whose register was asked, and its notice —
       the toolkit draws the notice here because no screen of the tool's own is there to draw it. */
    private func described<Detail: View>(@ViewBuilder _ detail: () -> Detail) -> some View {
        let subject = VettingStore.shared.subject(subjectId)
        return ToolkitPage(tool: tool, head: head) {
            Text(tool.summary).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if tool.capability != nil, let subject {
                Text(Toolkit.fill(Toolkit.Words.askedOf, ["name": subject.name, "reference": subject.reference]))
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            CapabilityNotice(of: tool.honesty)
            detail()
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct ToolkitHead {
    let eyebrow: String
    let tool: ToolkitToolSpec
    let forPatient: String
}

/// The page every tool without a scroll view of its own is drawn on.
private struct ToolkitPage<Content: View>: View {
    let tool: ToolkitToolSpec
    var head: ToolkitHead? = nil
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                if let head {
                    CareHeading(eyebrow: head.eyebrow, title: tool.name, subtitle: head.forPatient)
                } else {
                    Text(tool.name).font(.thuso(.title3, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                }
                content
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(tool.name).navigationBarTitleDisplayMode(.inline)
    }
}

/* Calling a doctor into the room, from the nurse's side: where she stands, what she sees and hears, and what
   a doctor may do with her there — the teleconsultation's own words. Nothing here calls anybody, and the
   capability notice above says so. */
private struct CallADoctorIn: View {
    var body: some View {
        let nurse = Teleconsult.participant("nurse")
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            CareCard {
                StatedFact(term: Toolkit.Words.callDoctorWhere, statement: nurse.place)
                StatedFact(term: Toolkit.Words.callDoctorSees, statement: nurse.sees)
                StatedFact(term: Toolkit.Words.callDoctorHears, statement: nurse.hears)
            }
            Text(Toolkit.Words.callDoctorLimits).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            CareCard(spacing: ThusoSpacing.space12) {
                ForEach(Teleconsult.clinicalLimits) { limit in
                    VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                        Text(limit.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(limit.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Text(Teleconsult.rule("the-nurse-is-the-examination").sentence)
                .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/* The visit, handed to the doctors' review queue — the Care engine's own act and refusal, the same one the
   visit's handover stage presses. It opens only at that stage: pressed earlier it would skip the readings the
   handover is made against, so before then it says where the visit is. */
private struct HandToADoctor: View {
    @ObservedObject private var store = CareVisitStore.shared

    var body: some View {
        if store.handedOver {
            Label(CareData.handoverQueued, systemImage: "paperplane")
                .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        } else if store.stage != .handover {
            Text(Toolkit.fill(Toolkit.Gates.notYetAtHandover, ["stage": store.stage.name]))
                .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            if let refusal = store.refusal, refusal.stage == .handover {
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                    Image(systemName: "hand.raised").foregroundStyle(ThusoRole.dangerInk).accessibilityHidden(true)
                    Text(refusal.statement).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
            Button(CareVisitStore.Stage.handover.name) { store.handOver() }.buttonStyle(CareButton())
        }
    }
}
