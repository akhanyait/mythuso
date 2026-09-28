import SwiftUI

/* GilbertOne, on iOS.

   Everything on this screen that a person reads comes from packages/catalog/assistant.json, through
   the generated AssistantData.swift and the reasoning in Models/Assistant.swift. The microphone is
   GilbertVoice.swift's alone. This file arranges them.

   WHAT A PERSON OPENED IT FOR decides the order. The sphere, the state it is in said in words, and
   the way to speak. Then the voice notice, rendered by CapabilityNotice from capabilities.json rather
   than typed. Then the conversation, then the suggested questions and the refusals. The composer is
   pinned to the bottom edge, where a thumb is, and carries the sentence that must not scroll away:
   GilbertOne not recognising an emergency does not mean there is not one. At accessibility text sizes a
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
    @StateObject private var speaker = GilbertSpeaker()
    /// The store the home reads its next visit from, so GilbertOne names the same one.
    @EnvironmentObject private var store: PreviewStore
    @State private var turns = Gilbert.opening()
    @State private var draft = ""
    @State private var correction = ""
    @State private var gatheredAt: Date?
    @State private var showingSos = false
    /* The simulated nurse queue this screen hands to, this conversation’s reference in it, what each
       handover turn’s button did, and the first turn that got the emergency answer. The last is kept
       apart from the turns because the conversation is capped, and a dropped turn must not be what lowers
       an urgency. All of it goes when the screen does, with the conversation. */
    @State private var queue: [GilbertHandoverRecord] = []
    @State private var conversationRef = UUID().uuidString
    @State private var handedOver: [Int: HandoverOutcome] = [:]
    @State private var firstEmergency: Int?
    /* Guards the screen's one asynchronous refinement the way the web panel's counter does: it moves
       only when the conversation it was written for ends — Start again — so an answer that arrives
       after that is discarded rather than painted over a conversation nobody is in anymore. */
    @State private var refineGeneration = 0
    @FocusState private var correcting: Bool
    /// Whether the composer has the keyboard, and so whether the keyboard's own microphone key is on screen.
    @FocusState private var typing: Bool
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
                    identityHead
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
        .navigationDestination(isPresented: $showingSos) { SosView() }
        .onAppear { gather() }
        .onChange(of: turns.last?.id) { _, _ in
            gather()
            /* A second answer in the same state changes nothing VoiceOver is told about, so the reply
               itself is announced. The scroll above already brings its top into view. */
            if let last = turns.last, turns.count > 1 {
                AccessibilityNotification.Announcement(spoken(last)).post()
                /* And the same words to GilbertSpeaker, which reads voice.nativeSpeech's flag and the
                   mute switch before it reaches for the synthesiser at all. The reply is already on the
                   screen above; this is a second reading of it, never the only place the words appear.
                   A reply written in one of voice.spokenLanguages is asked for in its own voice. */
                speaker.speak(spokenAloud(last), language: Gilbert.spokenLanguage(in: last.reply))
            }
        }
        .onChange(of: pulse) { _, now in
            AccessibilityNotification.Announcement(Gilbert.spec(now).announcement).post()
        }
        .onChange(of: listener.phase) { _, phase in
            if case .heard(let words) = phase { correction = words; correcting = true }
            /* Listening ending because something else took the microphone is news, and a VoiceOver user
               would otherwise hear only that the state went back to Ready. */
            if phase == .interrupted { AccessibilityNotification.Announcement(Gilbert.voice.interrupted).post() }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { listener.cancel(); speaker.stop() } }
        .onDisappear { listener.cancel(); speaker.stop() }
    }

    /// The words behind every reply kind, shared between what VoiceOver is told and what GilbertSpeaker
    /// reads aloud — one switch rather than two that could answer the same turn differently.
    private func coreWords(_ turn: Gilbert.Turn) -> String {
        switch turn.reply {
        case .situation(let situation): return situation.sentence
        case .identity: return Gilbert.whatItIs
        case .voice: return Gilbert.voice.howItWorks
        case .emergency(let groups):
            /* A crisis answer is read with its numbers — the ambulance first, then the crisis lines —
               because the lines are the reason it differs, and a reading that left them out would be a
               different answer. Any other emergency is read as it always was. */
            guard Gilbert.showsCrisisLines(groups) else { return Gilbert.emergency.headline }
            return ([Gilbert.emergency.headline] + Gilbert.emergency.lines.map { "\($0.number), \($0.name)." }
                + [Gilbert.Crisis.heading] + Gilbert.Crisis.lines.map { "\($0.number), \($0.name)." }).joined(separator: " ")
        case .unmatched: return Gilbert.unmatched.sentence
        case .service(let words):
            /* The heading, the words, the disclosure and the numbers, in that order: the one spoken
               reading of a model answer may never soften the disclosure by omission, exactly as
               spokenOf reads it on the web. The numbers are spoken as digits — sos.json's spoken
               form, since 23 September 2026 — because "10111" read as a quantity is a number nobody
               can dial in a hurry. */
            return ([Gilbert.service.heading, words, Gilbert.service.disclosure, Gilbert.service.ifUrgent]
                + Gilbert.service.lines.map { "\($0.spoken), \($0.name)." }).joined(separator: " ")
        case .handover: return Gilbert.handover.title
        }
    }

    private func spoken(_ turn: Gilbert.Turn) -> String {
        let first = coreWords(turn)
        return turn.unread ? "\(Gilbert.name): \(first) \(Gilbert.unread.sentence)" : "\(Gilbert.name): \(first)"
    }

    /// The same words, without the name spoken first: the sphere already says who is answering, and a
    /// voice does not need to introduce itself before every sentence the way VoiceOver announcing a new
    /// element does. Matches spokenOf's own shape on the web.
    private func spokenAloud(_ turn: Gilbert.Turn) -> String {
        let first = coreWords(turn)
        return turn.unread ? "\(first) \(Gilbert.unread.sentence)" : first
    }

    /// Reduce Motion is answered by never starting the reaction, not by shortening it.
    private func gather() { gatheredAt = reduceMotion ? nil : Date() }

    private func sendDraft() {
        let words = draft
        draft = ""
        turns = Gilbert.send(words, channel: .typed, to: turns, visit: store.visits.first)
        refineIfUnmatched()
    }

    private func sendCorrection() {
        let words = correction
        correction = ""
        listener.sent()
        turns = Gilbert.send(words, channel: .spoken, to: turns, visit: store.visits.first)
        refineIfUnmatched()
    }

    /* The service refinement, for the one case where it may speak: a message GilbertOne could not
       place. The matcher's answer is on the screen before this runs — nothing here waits, and the
       screen never withholds a reply it already has. An unreachable, refused, slow or unusable
       service changes nothing at all, because AssistantClient.refine returns nil for every one of
       them, and nil simply leaves the local answer standing.

       The capability flag is read before anything is asked of the network. It ships false, which is
       the rollback state: the whole conversation runs on the phone until the contract says
       otherwise. A replacement is looked up by the turn it was asked about — never drawn over a
       newer one — and only when it is still the last turn is it read out, because the words are new
       and the announcement that fires on a new turn's id does not fire for a replacement. */
    private func refineIfUnmatched() {
        guard Capabilities.unifiedApi else { return }
        guard let candidate = turns.last, case .unmatched = candidate.reply, let asked = candidate.asked else { return }
        let generation = refineGeneration
        let session = conversationRef
        Task { @MainActor in
            let refined = await AssistantClient.refine(text: asked, sessionId: session, audience: "patient", base: Self.serviceBase)
            guard generation == refineGeneration, let words = refined else { return }
            guard let index = turns.firstIndex(where: { $0 == candidate }) else { return }
            let refinedTurn = serviceTurn(candidate, words: words)
            let stillLast = index == turns.index(before: turns.endIndex)
            turns[index] = refinedTurn
            if stillLast {
                AccessibilityNotification.Announcement(spoken(refinedTurn)).post()
                speaker.speak(spokenAloud(refinedTurn), language: Gilbert.spokenLanguage(in: refinedTurn.reply))
            }
        }
    }

    /// The unmatched turn, with the service's words where its answer was. Everything else — which
    /// message, how it came, what was unread about it — is the conversation's and stays.
    private func serviceTurn(_ turn: Gilbert.Turn, words: String) -> Gilbert.Turn {
        Gilbert.Turn(id: turn.id, asked: turn.asked, channel: turn.channel, reply: .service(words),
                     matched: turn.matched, groups: turn.groups, unread: turn.unread)
    }

    /// Where the assistant API is reached from this build: the service binds on the machine's own
    /// loopback and a simulator shares it. A real phone cannot reach it, which is the truth — the
    /// service is not deployed — and the local answer is what such a phone keeps.
    private static let serviceBase = URL(string: "http://localhost:8791")!

    /* The identity's ground since 28 September 2026. The sphere's own night panel is the stage's, so the
       words measured against the brand ink stay on the brand ink and the rest of the screen reads like
       every other. */
    private var ground: some View { ThusoRole.background }

    // MARK: - The sphere and the state, in words

    private var stage: some View {
        VStack(spacing: ThusoSpacing.space16) {
            #if DEBUG
            /* The contract's shared fixtures, run against this platform's matcher when the UI tests ask for
               it. "agrees" or the disagreements, read off the screen by AssistantTests. Not in a release
               build, and never drawn unless the launch argument is present. */
            if ProcessInfo.processInfo.arguments.contains("-GilbertSelfTest") {
                let disagreements = Gilbert.selfTest()
                Text(disagreements.isEmpty ? "agrees" : disagreements.joined(separator: " | "))
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.onNight)
                    .accessibilityIdentifier("gilbert-self-test")
                Text(Gilbert.falsePositiveReport().joined(separator: " | "))
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.onNight)
                    .accessibilityIdentifier("gilbert-false-positives")
            }
            #endif
            sphere
            VStack(spacing: ThusoSpacing.space8) {
                Text(Gilbert.spec(pulse).cue)
                    .thusoFont(ThusoType.caption, weight: .semibold)
                    .foregroundStyle(ThusoRole.onNight)
                    .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space4)
                    .overlay(Capsule().stroke(pulse == .escalate ? ThusoRole.coral : ThusoRole.nightAccent.opacity(0.62),
                                              lineWidth: pulse == .escalate ? 2 : 1))
                if let stageName {
                    Text(stageName)
                        .thusoFont(ThusoType.caption, weight: .semibold)
                        .tracking(1.4)
                        .foregroundStyle(ThusoRole.nightAccent)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let figure = stageFigure {
                    Text(figure).font(ThusoFont.metricLarge)
                        .foregroundStyle(ThusoRole.onNight)
                }
                Text(Gilbert.descriptorLine)
                    .thusoFont(ThusoType.caption)
                    .foregroundStyle(ThusoRole.nightAccent)
            }
            .accessibilityElement(children: .combine)
            .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity)
        /* The one night panel on the screen since 28 September 2026: the sphere is lit against it, and
           every word on it keeps the ink measured for that ground. Everything else on the screen is on
           the identity's light ground. */
        .padding(.vertical, ThusoSpacing.space24).padding(.horizontal, ThusoSpacing.space16)
        .background(ThusoRole.night, in: RoundedRectangle(cornerRadius: ThusoRadius.lg, style: .continuous))
    }

    /* The official GilbertOne logo — the Lovable handoff's master, the seated character above the name —
       as the asset in Assets.xcassets, resized whole and never redrawn, recoloured or cropped, with the
       descriptor line beside it so the name and its correction are read together. It sits on a light
       card because the lettering is the brand ink. */
    private var identityHead: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space8) {
            HStack {
                Spacer(minLength: 0)
                Image("GilbertOneLogo").resizable().scaledToFit().frame(maxWidth: 200)
                    .accessibilityLabel(Gilbert.name)
                Spacer(minLength: 0)
            }
            Text(Gilbert.descriptorLine).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .center).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
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
        case .idle, .failed, .interrupted: return true
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
        case .idle, .failed, .interrupted:
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                if listener.phase == .failed { SceneNote(text: Gilbert.voice.failed) }
                if listener.phase == .interrupted { SceneNote(text: Gilbert.voice.interrupted) }
                Button { listener.talk() } label: {
                    Label(Gilbert.voice.talkLabel, systemImage: "mic.fill")
                        .font(.thuso(.body, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(SceneButtonStyle(filled: true))
                .accessibilityHint(Gilbert.voice.howItWorks)
                Text(Gilbert.voice.howItWorks)
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
            }
        case .explaining:
            SceneCard {
                Text(Gilbert.voice.beforePermission).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { permissionButtons }
                    VStack(spacing: ThusoSpacing.space8) { permissionButtons }
                }
            }
        case .listening:
            SceneCard {
                Text(Gilbert.voice.captionsLabel).thusoFont(ThusoType.caption, weight: .semibold)
                    .foregroundStyle(ThusoRole.mutedForeground)
                Text(listener.captions.isEmpty ? "…" : listener.captions)
                    .font(.thuso(.title3)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(Gilbert.voice.captionsLabel)
                    .accessibilityValue(listener.captions)
                    .accessibilityAddTraits(.updatesFrequently)
                Button { listener.stop() } label: {
                    Label(Gilbert.voice.stopLabel, systemImage: "stop.fill")
                        .font(.thuso(.title3, weight: .semibold))
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
                    .foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                TextField(Gilbert.conversation.inputHint, text: $correction, axis: .vertical)
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)
                    .lineLimit(1...6)
                    .focused($correcting)
                    .foregroundStyle(ThusoRole.foreground)
                    .padding(ThusoSpacing.space12)
                    .frame(minHeight: 44)
                    .background(ThusoRole.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
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
                            .font(.thuso(.body, weight: .semibold))
                            .foregroundStyle(ThusoRole.foreground)
                            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space8)
                            .background(ThusoRole.primaryTint, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityLabel("\(turn.channel == .spoken ? Gilbert.conversation.youSaid : Gilbert.conversation.youAsked): \(asked)")
                    }
                    SceneCard {
                        Text(Gilbert.name.uppercased())
                            .thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                            .foregroundStyle(ThusoRole.mutedForeground)
                            .accessibilityHidden(true)
                        replyBody(turn)
                        /* Words GilbertOne did not read are said to be unread, with the numbers beside them,
                           rather than answered around. See readEverything in the contract. */
                        if turn.unread { unreadBlock }
                    }
                    .accessibilityElement(children: .contain)
                }
                .id(turn.id)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Gilbert.conversation.logLabel)
        .onChange(of: turns) { _, now in track(now) }
    }

    @ViewBuilder private func replyBody(_ turn: Gilbert.Turn) -> some View {
        switch turn.reply {
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
                    Text(group.name).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        .padding(.leading, ThusoSpacing.space12)
                        .overlay(alignment: .leading) { Rectangle().fill(ThusoRole.coral).frame(width: 2) }
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            SceneText(Gilbert.emergency.headline, weight: .semibold)
            SceneText(Gilbert.emergency.lead)
            lines(Gilbert.emergency.lines)
            SceneText(Gilbert.emergency.notAnAmbulance, quiet: true)
            /* The crisis lines, after the ambulance numbers and in the same column, only when the crisis
               words raised this answer — packages/catalog/crisis-lines.json, generated into CrisisLinesData. */
            if Gilbert.showsCrisisLines(groups) {
                SceneText(Gilbert.Crisis.heading)
                lines(Gilbert.Crisis.lines)
            }
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
        case .service(let words):
            SceneText(Gilbert.service.heading, weight: .semibold)
            SceneText(words)
            SceneText(Gilbert.service.disclosure, quiet: true)
            SceneText(Gilbert.service.ifUrgent)
            lines(Gilbert.service.lines)
            Button { turns = Gilbert.handOver(turns: turns) } label: {
                Label(Gilbert.service.handoverLabel, systemImage: "person.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: true))
            Button { showingSos = true } label: {
                Label(Gilbert.service.sosLabel, systemImage: "cross.case.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: false, urgent: true))
        case .handover:
            handoverBody(turn)
        }
    }

    /* The summary, what does not go with it, and the one button that sends it. After the button: what
       happened, the reference, and the ambulance numbers — a handover to a queue nobody reads must never
       be the last thing an urgent person is shown. A second handover that would send nothing new says so
       rather than pretending to send it again. */
    @ViewBuilder private func handoverBody(_ turn: Gilbert.Turn) -> some View {
        let earlier = turns.filter { $0.id < turn.id }
        let raised = (firstEmergency.map { $0 < turn.id } ?? false) || Gilbert.emergencyRaised(in: earlier)
        SceneText(Gilbert.handover.title, weight: .semibold)
        /* Out of hours, before anything else about the handover: nobody is there, then the emergency numbers,
           then a call back when the desk opens — from Access’s generated handover hours. Neither of the first
           two is a setting, so no hours can take them out. */
        let desk = HandoverQueue.desk()
        if !desk.open {
            SceneText(BookingData.Handover.outOfHours, weight: .semibold)
            SceneText(BookingData.Handover.outOfHoursNumbers, weight: .semibold)
            if let when = HandoverQueue.opensWords(desk) { SceneText(Booking.fill(BookingData.Handover.callback, ["when": when])) }
        }
        SceneText(Gilbert.handover.lead)
        ForEach(Gilbert.summary(of: earlier, emergencyEarlier: raised), id: \.label) { row in
            VStack(alignment: .leading, spacing: 2) {
                Text(row.label).thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoRole.mutedForeground)
                Text(row.value).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
        VStack(alignment: .leading, spacing: 2) {
            Text(BookingData.Handover.answeredByLabel).thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoRole.mutedForeground)
            Text(BookingData.Handover.answeredBy.joined(separator: ", ")).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        if raised { SceneText(Gilbert.handover.neverLowered, weight: .semibold) }
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            SceneHeading(Gilbert.handover.notCarriedHeading)
            ForEach(Gilbert.handover.notCarried) { item in
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                    Image(systemName: "minus").font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
                        .accessibilityHidden(true)
                    Text(item.sentence).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        if let outcome = handedOver[turn.id] {
            SceneText(outcome.sentNow ? Gilbert.handover.sentTitle : Gilbert.handover.alreadySent, weight: .semibold)
            if outcome.sentNow { SceneText(Gilbert.handover.sent) }
            VStack(alignment: .leading, spacing: 2) {
                Text(Gilbert.handover.sentReference).thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoRole.mutedForeground)
                Text(outcome.record.reference).font(.thuso(.title3, weight: .semibold).monospaced()).foregroundStyle(ThusoRole.foreground)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("gilbert-handover-reference")
            SceneText(Gilbert.handover.stillUrgent)
            lines(Gilbert.handover.lines)
        } else {
            SceneText(Gilbert.handover.notSent, weight: .semibold)
            Button { handOver(turn, emergency: raised) } label: {
                Label(Gilbert.handover.sendLabel, systemImage: "paperplane.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: true))
            .accessibilityIdentifier("gilbert-handover-send")
        }
    }

    private func handOver(_ turn: Gilbert.Turn, emergency: Bool) {
        guard let urgency = HandoverQueue.urgency(emergencyRaised: emergency) else { return }
        let result = HandoverQueue.handOver(queue, conversation: conversationRef, urgency: urgency.id)
        queue = result.queue
        handedOver[turn.id] = HandoverOutcome(record: result.record, sentNow: result.sentNow)
    }

    /* The first turn that got the emergency answer, and a fresh conversation when GilbertOne starts again. */
    private func track(_ now: [Gilbert.Turn]) {
        if now.count <= 1 {
            firstEmergency = nil
            handedOver = [:]
            conversationRef = UUID().uuidString
        } else if firstEmergency == nil, let turn = now.first(where: { Gilbert.emergencyRaised(in: [$0]) }) {
            firstEmergency = turn.id
        }
    }

    /// The unread answer. Guiding, never a calm Idle: the words GilbertOne could not read may be the ones that mattered.
    private var unreadBlock: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Rectangle().fill(ThusoRole.coral).frame(height: 2).accessibilityHidden(true)
            SceneText(Gilbert.unread.sentence, weight: .semibold)
            SceneText(Gilbert.unread.detail)
            SceneText(Gilbert.unread.ifUrgent)
            lines(Gilbert.unread.lines)
            Button { turns = Gilbert.handOver(turns: turns) } label: {
                Label(Gilbert.unread.handoverLabel, systemImage: "person.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: true))
            Button { showingSos = true } label: {
                Label(Gilbert.unread.sosLabel, systemImage: "cross.case.fill").frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: false, urgent: true))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("gilbert-unread")
    }

    /* The numbers in a real column: one width for the digits, so the names start at the same edge.
       Printed, never dialled — the SOS screen says nothing here dials. */
    private func lines(_ lines: [GilbertLine]) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            ForEach(lines, id: \.number) { line in
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    Text(line.number).font(.thuso(.title2, weight: .semibold).monospacedDigit()).foregroundStyle(ThusoRole.foreground)
                        .frame(minWidth: 72, alignment: .leading)
                    Text(line.name).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: - What to ask, and what GilbertOne will not do

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
            ForEach(Gilbert.questionGroups, id: \.id) { group in
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    SceneHeading(group.heading)
                    if let lead = group.lead {
                        Text(lead).thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(Gilbert.questions.filter { $0.group == group.id }) { question in
                        Button { turns = Gilbert.choose(question, turns: turns, visit: store.visits.first) } label: {
                            Text(question.asks).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .multilineTextAlignment(.leading)
                        }
                        .buttonStyle(SceneButtonStyle(filled: false, urgent: question.answer == "emergency"))
                    }
                }
            }
            if asked {
                Button {
                    /* Start again is the patient saying the conversation is over: a refinement still
                       in flight was written for the conversation being left, so it is discarded
                       rather than shown in the new one. */
                    refineGeneration += 1
                    turns = Gilbert.opening()
                } label: {
                    Label(Gilbert.conversation.startAgainLabel, systemImage: "arrow.counterclockwise")
                        .frame(minHeight: 44)
                }
                .foregroundStyle(ThusoRole.foreground)
            }
        }
    }

    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            SceneHeading(Gilbert.conversation.refusalsHeading)
            SceneCard(spacing: ThusoSpacing.space8) {
                ForEach(Gilbert.refusals) { refusal in
                    Text(refusal.statement).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text("\(Gilbert.poweredBy). \(Gilbert.poweredByMeans)")
                .thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var silence: some View {
        Text(Gilbert.silenceIsNotSafety)
            .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Typing

    /* Side by side at ordinary sizes; stacked, with a full-width Send, at the accessibility sizes. Side by
       side at AccessibilityXXXL the button broke its own label into "Sen" and "d" — a word cut in half is
       not a label, and the reader who asked for the largest type is the one who cannot guess it. */
    private var composer: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            /* The keyboard note is shown while the field has the keyboard, which is exactly when the
               keyboard's microphone key is on the screen. Pinned all the time it took half of the screen
               from the conversation, and the accessibility audit found questions that could no longer be
               scrolled to a place a finger could reach. VoiceOver hears it as the field's hint either way. */
            if typeSize.isAccessibilitySize {
                VStack(spacing: ThusoSpacing.space8) {
                    HStack(spacing: ThusoSpacing.space8) { composerField; speechToggle }
                    composerSend(fill: true)
                }
                if typing { keyboardNote }
            } else {
                HStack(spacing: ThusoSpacing.space8) { composerField; speechToggle; composerSend(fill: false) }
                if typing { keyboardNote }
                silence
            }
        }
        .padding(.horizontal, ThusoSpacing.space20)
        .padding(.vertical, ThusoSpacing.space12)
        .background(ThusoRole.surface)
        .overlay(alignment: .top) { ThusoDivider() }
    }
}

extension AssistantView {
    /* Autocorrection and capitalisation off, which is what the app controls. The dictation key on the
       system keyboard is not something any app may remove, so keyboardNote says whose it is instead of
       the screen pretending it is not there. */
    fileprivate var composerField: some View {
        TextField(Gilbert.conversation.inputHint, text: $draft)
            .font(.thuso(.subheadline))
            .autocorrectionDisabled(true)
            .textInputAutocapitalization(.never)
            .submitLabel(.send)
            .onSubmit(sendDraft)
            .foregroundStyle(ThusoRole.foreground)
            .padding(.horizontal, ThusoSpacing.space12)
            .frame(minHeight: 44)
            .background(ThusoRole.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous).stroke(typing ? ThusoRole.ring : ThusoRole.inputEdge, lineWidth: typing ? 1.5 : 1))
            .focused($typing)
            .accessibilityLabel(Gilbert.conversation.inputLabel)
            .accessibilityHint(Gilbert.conversation.keyboardNote)
            .accessibilityIdentifier("gilbert-input")
    }

    fileprivate var keyboardNote: some View {
        Text(Gilbert.conversation.keyboardNote)
            .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("gilbert-keyboard-note")
    }

    /* The speaker button beside the field: the composer's own control for GilbertSpeaker, drawn only
       while voice.nativeSpeech is on. A tap mutes or unmutes; muting stops the sentence GilbertOne is
       part-way through as well as every reply after it, because a control that only changes future
       replies while the room can still hear the current one is not a mute. */
    @ViewBuilder fileprivate var speechToggle: some View {
        if Gilbert.voice.nativeSpeechEnabled {
            Button {
                speaker.muted.toggle()
                if speaker.muted { speaker.stop() }
            } label: {
                Image(systemName: speaker.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.thuso(.body, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(SceneButtonStyle(filled: false))
            .accessibilityLabel(speaker.muted ? Gilbert.voice.unmuteLabel : Gilbert.voice.muteLabel)
            .accessibilityIdentifier("gilbert-speech-toggle")
        }
    }

    fileprivate func composerSend(fill: Bool) -> some View {
        Button(action: sendDraft) {
            Text(Gilbert.conversation.sendLabel).font(.thuso(.body, weight: .semibold))
                .padding(.horizontal, ThusoSpacing.space16)
                .frame(maxWidth: fill ? .infinity : nil, minHeight: 44)
                .frame(minWidth: 44)
        }
        .buttonStyle(SceneButtonStyle(filled: true))
        .accessibilityIdentifier("gilbert-send")
    }
}

/// What a handover turn’s button did: the queue’s record, and whether that press sent anything.
private struct HandoverOutcome {
    let record: GilbertHandoverRecord
    let sentNow: Bool
}

// MARK: - Small pieces this screen is the only user of

/// A section title, in the foreground.
private struct SceneHeading: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The handoff's Card, since 28 September 2026: the name stays so the screen did not have to move.
private struct SceneCard<Content: View>: View {
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    var body: some View {
        ThusoCard(padding: .sm, spacing: spacing) { content }
    }
}

private struct SceneNote: View {
    let text: String
    var body: some View {
        Text(text).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoRole.muted, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct SceneText: View {
    let text: String
    var weight: Font.Weight = .regular
    var quiet = false
    init(_ text: String, weight: Font.Weight = .regular, quiet: Bool = false) { self.text = text; self.weight = weight; self.quiet = quiet }
    var body: some View {
        Text(text).font(.thuso(.body, weight: weight)).foregroundStyle(quiet ? ThusoRole.mutedForeground : ThusoRole.foreground)
            .lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The handoff's primary when filled and its secondary when not; an orange edge for the one question
/// that leads to an ambulance, drawn over the button so the coral is a mark and never the words.
private struct SceneButtonStyle: ButtonStyle {
    let filled: Bool
    var urgent = false
    func makeBody(configuration: Configuration) -> some View {
        ThusoButtonStyle(filled ? .primary : .secondary, size: .md).makeBody(configuration: configuration)
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous)
                .stroke(urgent ? ThusoRole.coral : .clear, lineWidth: 2))
    }
}
