import SwiftUI

/* Gilbert, on iOS.

   Everything on this screen that a person reads comes from packages/catalog/assistant.json, through
   the generated AssistantData.swift and the reasoning in Models/Assistant.swift. The microphone is
   GilbertVoice.swift's alone. This file arranges them.

   WHAT A PERSON OPENED IT FOR decides the order. The sphere, the state it is in said in words, and
   the way to speak. Then the voice notice, rendered by CapabilityNotice from capabilities.json rather
   than typed. Then the conversation, then the suggested questions and the refusals. The composer is
   pinned to the bottom edge, where a thumb is, and carries the sentence that must not scroll away:
   Gilbert not recognising an emergency does not mean there is not one. At accessibility text sizes a
   pinned sentence that long would take the screen, so it moves to the head of the conversation there
   instead — still beside it, and still before anything is asked.

   TAP TO TALK, AND A LARGE STOP, rather than holding. Holding a control for as long as you speak
   shuts out VoiceOver, which turns a hold into a separate gesture, Switch Control, and anybody with
   a tremor. So a tap on the sphere, or on the Tap to talk button under it, opens the microphone; a
   full-width Stop closes it; and the contract's listening limit closes it anyway, so a tap is never
   a microphone left open. The button is drawn only when this phone can recognise English on its own.
   Where it cannot, the contract's unavailable sentence is drawn instead — never a disabled
   microphone, because a person reads the shape rather than the state.

   LISTENING IS THE MICROPHONE. The Pulse state shown is Listening exactly while GilbertListener's
   phase is .listening, Thinking exactly while it is .finishing — the recogniser completing a
   transcript after the microphone closed — and otherwise the state of the latest answer. The sphere's
   `level` is the live loudness only while Listening, and under Reduce Motion it is ignored and the
   sphere is a still frame. Every change of state is announced to VoiceOver in the contract's words.

   THE TRANSCRIPT IS CORRECTED BEFORE IT IS SENT. What was heard is put into an editable field with
   Send and Discard. Nothing goes to the matcher until the person presses Send, and nothing is kept
   when they press Discard.

   Colour. Every word is white (12.04:1 on brandInk) or brandMint (8.09), and ink on the white field
   and buttons (12.04). Orange marks the emergency question and the escalated sphere as an edge and a
   fill, never as text. */

struct AssistantView: View {
    @StateObject private var listener = GilbertListener()
    @State private var turns = Gilbert.opening()
    @State private var draft = ""
    @State private var correction = ""
    @State private var gatheredAt: Date?
    @State private var showingSos = false
    @FocusState private var correcting: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.scenePhase) private var scenePhase
    /// The capability this screen depends on, named once so the notice and the rule come from one row.
    private let capability = "voice"

    private var asked: Bool { turns.count > 1 }
    private var latest: Gilbert.Reply { turns.last?.reply ?? .unmatched }
    private var pulse: Gilbert.Pulse {
        switch listener.phase {
        case .listening: return .listening
        case .finishing: return .thinking
        default: return asked ? Gilbert.pulse(of: latest) : .idle
        }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: ThusoSpacing.space24) {
                    stage
                    voiceArea
                    CapabilityNotice(of: capability)
                    if typeSize.isAccessibilitySize { silence }
                    conversation
                    suggestions
                    refusals
                }
                .padding(.top, ThusoSpacing.space16)
                .padding(.bottom, ThusoSpacing.space24)
            }
            .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: turns.last?.id) { _, id in
                guard let id else { return }
                if reduceMotion { proxy.scrollTo(id, anchor: .top) } else { withAnimation { proxy.scrollTo(id, anchor: .top) } }
            }
        }
        .background(ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .navigationTitle(Gilbert.name).navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .navigationDestination(isPresented: $showingSos) { SosView() }
        .onAppear { gather() }
        .onChange(of: turns.last?.id) { _, _ in gather() }
        .onChange(of: pulse) { _, now in
            AccessibilityNotification.Announcement(Gilbert.spec(now).announcement).post()
        }
        .onChange(of: listener.phase) { _, phase in
            if case .heard(let words) = phase { correction = words; correcting = true }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { listener.cancel() } }
        .onDisappear { listener.cancel() }
    }

    /// Reduce Motion is answered by never starting the reaction, not by shortening it.
    private func gather() { gatheredAt = reduceMotion ? nil : Date() }

    private func sendDraft() {
        let words = draft
        draft = ""
        turns = Gilbert.send(words, channel: .typed, to: turns)
    }

    private func sendCorrection() {
        turns = Gilbert.send(correction, channel: .spoken, to: turns)
        correction = ""
        listener.sent()
    }

    /* The ground the sphere is lit against: brandInk, recessed at the ends by the design system's ink at
       45%. Every word was measured against brandInk itself, the lighter of the two. */
    private var ground: some View {
        ZStack {
            ThusoTheme.brandInk
            LinearGradient(colors: [ThusoTheme.ink.opacity(0.45), .clear, ThusoTheme.ink.opacity(0.45)],
                           startPoint: .top, endPoint: .bottom)
        }
    }

    // MARK: - The sphere and the state, in words

    private var stage: some View {
        VStack(spacing: ThusoSpacing.space16) {
            sphere
            VStack(spacing: ThusoSpacing.space8) {
                Text(Gilbert.spec(pulse).cue)
                    .thusoFont(ThusoType.caption, weight: .semibold)
                    .foregroundStyle(ThusoTheme.surface)
                    .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space4)
                    .overlay(Capsule().stroke(pulse == .escalate ? ThusoTheme.brandOrange : ThusoTheme.brandMint.opacity(0.62),
                                              lineWidth: pulse == .escalate ? 2 : 1))
                if let stageName {
                    Text(stageName)
                        .thusoFont(ThusoType.caption, weight: .semibold)
                        .tracking(1.4)
                        .foregroundStyle(ThusoTheme.brandMint)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let figure = stageFigure {
                    Text(figure).font(.system(.largeTitle, design: .default, weight: .ultraLight))
                        .foregroundStyle(ThusoTheme.surface)
                }
                Text(Gilbert.descriptor)
                    .thusoFont(ThusoType.caption)
                    .foregroundStyle(ThusoTheme.brandMint)
            }
            .accessibilityElement(children: .combine)
            .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity)
    }

    /// Only what has a name of its own; every other answer is named by the state pill above it.
    private var stageName: String? {
        switch latest {
        case .situation(let situation): return situation.name
        case .emergency: return Gilbert.emergency.lines.first?.name
        default: return asked ? nil : Gilbert.callToAction
        }
    }

    private var stageFigure: String? {
        switch latest {
        case .situation(let situation): return situation.figure
        case .emergency: return Gilbert.emergency.lines.first?.number
        default: return nil
        }
    }

    private var canTalk: Bool {
        switch listener.phase {
        case .idle, .failed: return true
        default: return false
        }
    }

    @ViewBuilder private var sphere: some View {
        let drawing = AssistantSphere(size: typeSize.isAccessibilitySize ? 176 : 232,
                                      depth: asked ? Gilbert.depth(of: latest) : 0,
                                      gatheredAt: gatheredAt,
                                      level: listener.phase == .listening && !reduceMotion ? listener.level : 0,
                                      pulse: pulse)
        if listener.phase == .listening {
            Button { listener.stop() } label: { drawing }
                .buttonStyle(.plain)
                .accessibilityLabel(Gilbert.voice.stopLabel)
        } else if listener.available && canTalk {
            Button { listener.talk() } label: { drawing }
                .buttonStyle(.plain)
                .accessibilityLabel(Gilbert.voice.talkLabel)
                .accessibilityHint(Gilbert.voice.howItWorks)
        } else {
            drawing
        }
    }

    // MARK: - Speaking

    @ViewBuilder private var voiceArea: some View {
        switch listener.phase {
        case .unavailable:
            SceneNote(text: Gilbert.voice.unavailable)
        case .refused:
            SceneNote(text: Gilbert.voice.refused)
        case .idle, .failed:
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                if listener.phase == .failed { SceneNote(text: Gilbert.voice.failed) }
                Button { listener.talk() } label: {
                    Label(Gilbert.voice.talkLabel, systemImage: "mic.fill")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(SceneButtonStyle(filled: true))
                .accessibilityHint(Gilbert.voice.howItWorks)
                Text(Gilbert.voice.howItWorks)
                    .font(.footnote).foregroundStyle(ThusoTheme.brandMint)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
            }
        case .explaining:
            SceneCard {
                Text(Gilbert.voice.beforePermission).font(.body).foregroundStyle(ThusoTheme.surface)
                    .fixedSize(horizontal: false, vertical: true)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { permissionButtons }
                    VStack(spacing: ThusoSpacing.space8) { permissionButtons }
                }
            }
        case .listening:
            SceneCard {
                Text(Gilbert.voice.captionsLabel).thusoFont(ThusoType.caption, weight: .semibold)
                    .foregroundStyle(ThusoTheme.brandMint)
                Text(listener.captions.isEmpty ? "…" : listener.captions)
                    .font(.title3).foregroundStyle(ThusoTheme.surface)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(Gilbert.voice.captionsLabel)
                    .accessibilityValue(listener.captions)
                    .accessibilityAddTraits(.updatesFrequently)
                Button { listener.stop() } label: {
                    Label(Gilbert.voice.stopLabel, systemImage: "stop.fill")
                        .font(.title3.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 60)
                }
                .buttonStyle(SceneButtonStyle(filled: true))
                .accessibilityIdentifier("gilbert-stop")
            }
        case .finishing:
            SceneNote(text: Gilbert.spec(.thinking).announcement)
        case .heard:
            SceneCard {
                Text(Gilbert.voice.correctLabel).thusoFont(ThusoType.caption, weight: .semibold)
                    .foregroundStyle(ThusoTheme.brandMint)
                    .fixedSize(horizontal: false, vertical: true)
                TextField(Gilbert.conversation.inputHint, text: $correction, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($correcting)
                    .foregroundStyle(ThusoTheme.brandInk)
                    .padding(ThusoSpacing.space12)
                    .frame(minHeight: 44)
                    .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    .accessibilityLabel(Gilbert.voice.correctLabel)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { correctionButtons }
                    VStack(spacing: ThusoSpacing.space8) { correctionButtons }
                }
            }
        }
    }

    @ViewBuilder private var permissionButtons: some View {
        Button { listener.consent() } label: { Text(Gilbert.voice.askPermissionLabel).frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(SceneButtonStyle(filled: true))
        Button { listener.notNow() } label: { Text(Gilbert.voice.notNowLabel).frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(SceneButtonStyle(filled: false))
    }

    @ViewBuilder private var correctionButtons: some View {
        Button(action: sendCorrection) { Text(Gilbert.conversation.sendLabel).frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(SceneButtonStyle(filled: true))
            .disabled(correction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        Button { correction = ""; listener.discard() } label: { Text(Gilbert.voice.discardLabel).frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(SceneButtonStyle(filled: false))
    }

    // MARK: - The conversation

    private var conversation: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            ForEach(turns) { turn in
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    if let asked = turn.asked {
                        Text(asked)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(ThusoTheme.brandInk)
                            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space8)
                            .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityLabel("\(turn.channel == .spoken ? Gilbert.conversation.youSaid : Gilbert.conversation.youAsked): \(asked)")
                    }
                    SceneCard {
                        Text(Gilbert.name.uppercased())
                            .thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                            .foregroundStyle(ThusoTheme.brandMint)
                            .accessibilityHidden(true)
                        replyBody(turn.reply)
                    }
                    .accessibilityElement(children: .contain)
                }
                .id(turn.id)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Gilbert.conversation.logLabel)
    }

    @ViewBuilder private func replyBody(_ reply: Gilbert.Reply) -> some View {
        switch reply {
        case .situation(let situation):
            SceneText(situation.sentence)
        case .identity:
            SceneText(Gilbert.whatItIs)
            SceneText(Gilbert.whatItIsNot)
        case .voice:
            SceneText(Gilbert.voice.howItWorks)
            if let kept = Gilbert.refusals.first(where: { $0.id == "no-audio-kept" }) { SceneText(kept.statement) }
            if !listener.available { SceneText(Gilbert.voice.unavailable) }
        case .emergency(let groups):
            if !groups.isEmpty {
                SceneText(Gilbert.emergency.noticed)
                ForEach(groups) { group in
                    Text(group.name).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.surface)
                        .padding(.leading, ThusoSpacing.space12)
                        .overlay(alignment: .leading) { Rectangle().fill(ThusoTheme.brandOrange).frame(width: 2) }
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            SceneText(Gilbert.emergency.headline, weight: .semibold)
            SceneText(Gilbert.emergency.lead)
            lines(Gilbert.emergency.lines)
            SceneText(Gilbert.emergency.notAnAmbulance, quiet: true)
            Button { showingSos = true } label: {
                Label(Gilbert.emergency.sosLabel, systemImage: "cross.case.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: true))
        case .unmatched:
            SceneText(Gilbert.unmatched.sentence, weight: .semibold)
            SceneText(Gilbert.unmatched.detail)
            SceneText(Gilbert.unmatched.ifUrgent)
            lines(Gilbert.unmatched.lines)
            Button { turns = Gilbert.handOver(turns: turns) } label: {
                Label(Gilbert.unmatched.handoverLabel, systemImage: "person.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: true))
            Button { showingSos = true } label: {
                Label(Gilbert.unmatched.sosLabel, systemImage: "cross.case.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: false, urgent: true))
        case .handover(let rows):
            SceneText(Gilbert.handover.title, weight: .semibold)
            SceneText(Gilbert.handover.lead)
            ForEach(rows, id: \.label) { row in
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.label).thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoTheme.brandMint)
                    Text(row.value).font(.body).foregroundStyle(ThusoTheme.surface).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
            SceneText(Gilbert.handover.notSent, weight: .semibold)
        }
    }

    /* The numbers in a real column: one width for the digits, so the names start at the same edge.
       Printed, never dialled — the SOS screen says nothing here dials. */
    private func lines(_ lines: [GilbertLine]) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            ForEach(lines, id: \.number) { line in
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    Text(line.number).font(.title2.weight(.semibold).monospacedDigit()).foregroundStyle(ThusoTheme.surface)
                        .frame(minWidth: 72, alignment: .leading)
                    Text(line.name).font(.body).foregroundStyle(ThusoTheme.surface).fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: - What to ask, and what Gilbert will not do

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
            ForEach(Gilbert.questionGroups, id: \.id) { group in
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    SceneHeading(group.heading)
                    if let lead = group.lead {
                        Text(lead).thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.brandMint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(Gilbert.questions.filter { $0.group == group.id }) { question in
                        Button { turns = Gilbert.choose(question, turns: turns) } label: {
                            Text(question.asks).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .multilineTextAlignment(.leading)
                        }
                        .buttonStyle(SceneButtonStyle(filled: false, urgent: question.answer == "emergency"))
                    }
                }
            }
            if asked {
                Button { turns = Gilbert.opening() } label: {
                    Label(Gilbert.conversation.startAgainLabel, systemImage: "arrow.counterclockwise")
                        .frame(minHeight: 44)
                }
                .foregroundStyle(ThusoTheme.surface)
            }
        }
    }

    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            SceneHeading(Gilbert.conversation.refusalsHeading)
            SceneCard(spacing: ThusoSpacing.space8) {
                ForEach(Gilbert.refusals) { refusal in
                    Text(refusal.statement).font(.footnote).foregroundStyle(ThusoTheme.surface)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text("\(Gilbert.poweredBy). \(Gilbert.poweredByMeans)")
                .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.brandMint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var silence: some View {
        Text(Gilbert.silenceIsNotSafety)
            .font(.footnote).foregroundStyle(ThusoTheme.brandMint)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Typing

    /* Side by side at ordinary sizes; stacked, with a full-width Send, at the accessibility sizes. Side by
       side at AccessibilityXXXL the button broke its own label into "Sen" and "d" — a word cut in half is
       not a label, and the reader who asked for the largest type is the one who cannot guess it. */
    private var composer: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if typeSize.isAccessibilitySize {
                VStack(spacing: ThusoSpacing.space8) { composerField; composerSend(fill: true) }
            } else {
                HStack(spacing: ThusoSpacing.space8) { composerField; composerSend(fill: false) }
                silence
            }
        }
        .padding(.horizontal, ThusoSpacing.space20)
        .padding(.vertical, ThusoSpacing.space12)
        .background(ThusoTheme.brandInk)
        .overlay(alignment: .top) { Rectangle().fill(ThusoTheme.brandMint.opacity(0.22)).frame(height: 1) }
    }
}

extension AssistantView {
    fileprivate var composerField: some View {
        TextField(Gilbert.conversation.inputHint, text: $draft)
            .submitLabel(.send)
            .onSubmit(sendDraft)
            .foregroundStyle(ThusoTheme.brandInk)
            .padding(.horizontal, ThusoSpacing.space12)
            .frame(minHeight: 44)
            .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .accessibilityLabel(Gilbert.conversation.inputLabel)
            .accessibilityIdentifier("gilbert-input")
    }

    fileprivate func composerSend(fill: Bool) -> some View {
        Button(action: sendDraft) {
            Text(Gilbert.conversation.sendLabel).font(.body.weight(.semibold))
                .padding(.horizontal, ThusoSpacing.space16)
                .frame(maxWidth: fill ? .infinity : nil, minHeight: 44)
                .frame(minWidth: 44)
        }
        .buttonStyle(SceneButtonStyle(filled: true))
        .accessibilityIdentifier("gilbert-send")
    }
}

// MARK: - Small pieces this screen is the only user of

/// A section title on the night ground. The shared header sets charcoal, which is unreadable here.
private struct SceneHeading: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.headline).foregroundStyle(ThusoTheme.surface)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A panel that belongs to the dark ground: a lift rather than a fill, and a hairline rather than a
/// shadow.
private struct SceneCard<Content: View>: View {
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous) }
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(ThusoSpacing.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.06), in: shape)
            .overlay(shape.stroke(ThusoTheme.surface.opacity(0.16), lineWidth: 1))
    }
}

private struct SceneNote: View {
    let text: String
    var body: some View {
        Text(text).font(.footnote).foregroundStyle(ThusoTheme.surface)
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.surface.opacity(0.08), in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct SceneText: View {
    let text: String
    var weight: Font.Weight = .regular
    var quiet = false
    init(_ text: String, weight: Font.Weight = .regular, quiet: Bool = false) { self.text = text; self.weight = weight; self.quiet = quiet }
    var body: some View {
        Text(text).font(.body.weight(weight)).foregroundStyle(quiet ? ThusoTheme.brandMint : ThusoTheme.surface)
            .lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// White and ink when filled; a mint hairline (4.14:1 against the ground) when not; an orange edge for
/// the one question that leads to an ambulance.
private struct SceneButtonStyle: ButtonStyle {
    let filled: Bool
    var urgent = false
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(filled ? ThusoTheme.brandInk : ThusoTheme.surface)
            .padding(.horizontal, ThusoSpacing.space12)
            .background(filled ? AnyShapeStyle(ThusoTheme.surface.opacity(configuration.isPressed ? 0.85 : 1))
                               : AnyShapeStyle(Color.white.opacity(configuration.isPressed ? 0.14 : 0.07)), in: shape)
            .overlay(shape.stroke(urgent ? ThusoTheme.brandOrange : (filled ? Color.clear : ThusoTheme.brandMint.opacity(0.62)), lineWidth: urgent ? 2 : 1))
            .contentShape(shape)
    }
}
