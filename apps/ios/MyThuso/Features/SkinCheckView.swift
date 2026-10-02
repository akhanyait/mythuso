import AVKit
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/* Show GilbertOne a rash, on iPhone — ported from apps/web/src/features/SkinCheck.tsx and opened from
   GilbertOne's suggestions (AssistantView.swift) as a sheet.

   THE PHOTO is chosen with PhotosPicker, which runs outside the app and asks for no permission; the
   target declares no camera usage, because the consultation screens tell a patient none is declared,
   so the contract's own sentence tells her to take the photo with the Camera app first. The picked
   photo is loaded into memory as an image and held in this view's state only: nothing writes it to the
   photo library, to a file or to anywhere else, nothing sends it, and nothing reads it. Removing it,
   ending the check, closing the sheet or an emergency all let it go.

   A CLIP (the founder's decision of 2 October 2026) comes from the same picker. PhotosPicker hands a
   video over as a file that lasts only while it is being received, so SkinClipFile copies it once into
   the app's own temporary folder — the one file this feature writes, protected until the phone is
   unlocked — and deletes it on every way out: removed, replaced, refused, the check ended, the sheet
   closed, an emergency. A copy a killed app left behind is swept when the check next opens or closes.
   Its length is read and one over the contract's cap, or of no length, is deleted with the contract's
   sentence. What plays is a composition of the clip's picture track alone, so its sound track is never
   decoded, in a muted player drawn by a bare AVPlayerLayer — no system controls, which carry a volume;
   play and pause are this screen's own buttons. AVKit is imported for the picture; AVFoundation is not
   imported by name, because the build keeps that import to GilbertVoice.swift, where the microphone
   lives, and still reads this file for any audio session, recorder or recogniser. No camera or
   microphone usage description is declared.

   THE ANSWERS reach an outcome only through SkinCheck.outcome, the arithmetic every platform shares by
   fixture. A pressed sign that raises an emergency rule, or typed words the emergency terms raise, hand
   the words to the conversation at once (onEmergency): the conversation's own emergency answer is the
   one she reads, and the sheet closes. Every sentence here is SkinCheckData's or a knowledge entry's,
   generated from the contract and the knowledge base. */

struct SkinCheckView: View {
    /// The words that raised an emergency, for the conversation to answer with its own emergency turn.
    let onEmergency: (String) -> Void
    let onBack: () -> Void

    @State private var answers: SkinCheck.Answers = [:]
    @State private var typed = ""
    @State private var picked: PhotosPickerItem?
    @State private var photo: UIImage?
    @State private var clip: HeldClip?
    @State private var playing = false
    @State private var problem = ""
    @State private var outcome: SkinCheck.Outcome?
    @State private var ended = false
    @State private var copied = false

    private var shown: Bool {
        switch outcome {
        case .sisterToday, .information: return true
        default: return false
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                intro
                if ended {
                    note(SkinCheckData.Screen.ended)
                } else {
                    photoCard
                    if !shown { ForEach(SkinCheckData.questions) { question in questionCard(question) } }
                    if case .incomplete = outcome {
                        Text(SkinCheckData.Screen.missing).font(.thuso(.body, weight: .semibold))
                            .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    }
                    if case .sisterToday(let raised) = outcome { sisterToday(raised) }
                    if case .information(let conditions, let checkFirst, let selfCare) = outcome {
                        information(conditions, checkFirst: checkFirst, selfCare: selfCare)
                    }
                    if shown { notes }
                    actions
                    note(SkinCheckData.photoReading)
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(SkinCheckData.Screen.title).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(SkinCheckData.Screen.backLabel) { photo = nil; letGoOfClip(); onBack() }
            }
        }
        .onChange(of: picked) { _, item in load(item) }
        .onReceive(NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification)) { note in
            guard let clip, (note.object as? AVPlayerItem) === clip.player.currentItem else { return }
            clip.player.seek(to: .zero)
            playing = false
        }
        .onAppear { SkinClipFile.sweep() }
        .onDisappear { photo = nil; picked = nil; letGoOfClip(); SkinClipFile.sweep() }
    }

    // MARK: - Pieces

    private var intro: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(SkinCheckData.Screen.title).thusoFont(ThusoType.heading, weight: .semibold)
                .foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            para(SkinCheckData.Screen.lead)
            ForEach(SkinCheckData.whatItIsNot, id: \.self) { sentence in bullet(sentence) }
            note(SkinCheck.reviewSentence)
        }
    }

    private var photoCard: some View {
        ThusoCard(padding: .sm, spacing: ThusoSpacing.space8) {
            PhotosPicker(selection: $picked, matching: .any(of: [.images, .videos]), photoLibrary: .shared()) {
                Label(photo == nil && clip == nil ? SkinCheckData.Photo.chooseLabel : SkinCheckData.Photo.replaceLabel, systemImage: "photo")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(ThusoButtonStyle(.secondary, size: .md, fullWidth: true))
            if !problem.isEmpty { para(problem) }
            if let photo {
                Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 240)
                    .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    .accessibilityLabel(SkinCheckData.Photo.alt)
                Button(SkinCheckData.Photo.removeLabel) { self.photo = nil; picked = nil }
                    .buttonStyle(ThusoButtonStyle(.ghost, size: .md))
            }
            if let clip {
                MutedClipView(player: clip.player).frame(maxWidth: .infinity).frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    .accessibilityElement().accessibilityLabel(SkinCheckData.Clip.label)
                HStack(spacing: ThusoSpacing.space8) {
                    Button(playing ? SkinCheckData.Clip.pauseLabel : SkinCheckData.Clip.playLabel) { toggle(clip.player) }
                        .buttonStyle(ThusoButtonStyle(.secondary, size: .md))
                    Button(SkinCheckData.Clip.removeLabel) { letGoOfClip() }
                        .buttonStyle(ThusoButtonStyle(.ghost, size: .md))
                }
            }
            note(SkinCheckData.Photo.howOnThisPhone)
            note(SkinCheckData.Photo.held)
            note(SkinCheckData.Clip.howOnThisPhone)
            note(SkinCheckData.Photo.noReader)
            note(SkinCheckData.Clip.sound)
        }
    }

    private func questionCard(_ question: SkinQuestion) -> some View {
        ThusoCard(padding: .sm, spacing: ThusoSpacing.space8) {
            Text(question.ask).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
            if question.kind == "multi" { note(SkinCheckData.Screen.multiHint) }
            if question.kind == "text" {
                note(SkinCheckData.Screen.textHint)
                TextField(question.ask, text: $typed, axis: .vertical)
                    .lineLimit(3...6).textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled().textInputAutocapitalization(.sentences)
            } else {
                ForEach(question.options, id: \.id) { option in
                    let on = (answers[question.id] ?? []).contains(option.id)
                    Button { press(question.id, option.id) } label: {
                        Text(option.label).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .multilineTextAlignment(.leading)
                    }
                    .buttonStyle(ThusoButtonStyle(on ? .primary : .secondary, size: .md, fullWidth: true))
                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous)
                        .stroke(question.id == "signs" && option.id != question.exclusive ? ThusoRole.coral : .clear, lineWidth: 2))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func sisterToday(_ raised: [SkinCheck.Raised]) -> some View {
        ThusoCard(padding: .sm, spacing: ThusoSpacing.space8) {
            Text(SkinCheckData.SisterToday.headline).font(.thuso(.title3, weight: .semibold))
                .foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            para(SkinCheckData.SisterToday.lead)
            ForEach(raised) { rule in
                label(SkinCheckData.SisterToday.becauseLabel)
                para(rule.says, weight: .semibold)
                if !rule.guidance.isEmpty { label(SkinCheckData.SisterToday.guidanceLabel) }
                ForEach(rule.guidance) { g in
                    Text(g.title).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    para(g.line)
                    note(SkinCheck.entryNote(source: g.source, reviewedBy: g.reviewedBy))
                }
            }
            para(SkinCheckData.SisterToday.arrange)
            para(SkinCheckData.SisterToday.worse, weight: .semibold)
        }
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(ThusoRole.coral, lineWidth: 2))
    }

    private func information(_ conditions: [SkinConditionEntry], checkFirst: [SkinFirstAidEntry], selfCare: [SkinFirstAidEntry]) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(SkinCheckData.Information.headline).font(.thuso(.title3, weight: .semibold))
                .foregroundStyle(ThusoRole.foreground).accessibilityAddTraits(.isHeader)
            if !checkFirst.isEmpty {
                label(SkinCheckData.Information.checkFirstHeading)
                ForEach(checkFirst) { aid in firstAidCard(aid) }
            }
            if conditions.isEmpty {
                para("\(SkinCheckData.Information.noneMatched) \(SkinCheckData.Information.onlyAClinician)")
            } else {
                para(SkinCheckData.Information.lead)
                para(SkinCheckData.Information.onlyAClinician, weight: .semibold)
                ForEach(conditions) { entry in
                    ThusoCard(padding: .sm, spacing: ThusoSpacing.space8) {
                        Text(entry.title).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                        label(SkinCheckData.Information.looksLabel)
                        ForEach(entry.looks, id: \.self) { line in bullet(line) }
                        label(SkinCheckData.Information.whenLabel)
                        para(entry.when)
                        note(SkinCheck.entryNote(source: entry.source, reviewedBy: entry.reviewedBy))
                    }
                }
            }
            label(SkinCheckData.Information.selfCareHeading)
            note(SkinCheckData.Information.selfCareLead)
            ForEach(selfCare) { aid in firstAidCard(aid) }
        }
    }

    private func firstAidCard(_ aid: SkinFirstAidEntry) -> some View {
        ThusoCard(padding: .sm, spacing: ThusoSpacing.space8) {
            Text(aid.title).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
            ForEach(Array(aid.steps.enumerated()), id: \.offset) { index, step in
                para("\(index + 1). \(step)")
            }
            label(SkinCheckData.Information.warningsLabel)
            ForEach(aid.warnings, id: \.self) { warning in bullet(warning) }
            label(SkinCheckData.Information.whenToCallLabel)
            para(aid.whenToCall)
            note(SkinCheck.entryNote(source: aid.source, reviewedBy: aid.reviewedBy))
        }
    }

    private var notes: some View {
        let lines = SkinCheck.summary(answers, typed: typed, photoHeld: photo != nil, clipHeld: clip != nil)
        return ThusoCard(padding: .sm, spacing: ThusoSpacing.space8) {
            Text(SkinCheckData.Summary.title).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                .accessibilityAddTraits(.isHeader)
            ForEach(lines, id: \.self) { line in bullet(line) }
            Button(copied ? SkinCheckData.Summary.copiedLabel : SkinCheckData.Summary.copyLabel) {
                /* The pasteboard is the person's own; the app keeps nothing and sends nothing. */
                UIPasteboard.general.string = ([SkinCheckData.Summary.title] + lines).joined(separator: "\n")
                copied = true
            }
            .buttonStyle(ThusoButtonStyle(.secondary, size: .md))
            note("\(SkinCheckData.Summary.sendLead) \(SkinCheckData.Summary.sendRefusal)")
        }
    }

    private var actions: some View {
        VStack(spacing: ThusoSpacing.space8) {
            if shown {
                Button(SkinCheckData.Screen.changeLabel) { outcome = nil }
                    .buttonStyle(ThusoButtonStyle(.secondary, size: .md, fullWidth: true))
            } else {
                Button(SkinCheckData.Screen.seeLabel) { see() }
                    .buttonStyle(ThusoButtonStyle(.primary, size: .md, fullWidth: true))
            }
            Button(SkinCheckData.Screen.endLabel) { end() }
                .buttonStyle(ThusoButtonStyle(.ghost, size: .md, fullWidth: true))
        }
    }

    // MARK: - Text

    private func para(_ text: String, weight: Font.Weight = .regular) -> some View {
        Text(text).font(.thuso(.body, weight: weight)).foregroundStyle(ThusoRole.foreground)
            .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
    }
    private func note(_ text: String) -> some View {
        Text(text).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
    }
    private func label(_ text: String) -> some View {
        Text(text).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
    }
    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Text(verbatim: "•").accessibilityHidden(true)
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
        .font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
    }

    // MARK: - Actions

    /* The picked photo is loaded into memory as data, checked against the panel's attachment limit and
       made an image; nothing is written. The selection is cleared once read, so the picker holds no
       reference to it either. */
    private func load(_ item: PhotosPickerItem?) {
        guard let item else { return }
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            Task { @MainActor in
                let received = try? await item.loadTransferable(type: PickedClip.self)
                picked = nil
                guard let received else { problem = SkinCheckData.Clip.cannotPlay; return }
                await hold(received.url)
            }
            return
        }
        Task {
            let data = try? await item.loadTransferable(type: Data.self)
            await MainActor.run {
                picked = nil
                guard let data, let image = UIImage(data: data) else { problem = SkinCheckData.Photo.notImage; return }
                guard data.count <= SkinCheckData.Photo.limitBytes else { problem = SkinCheckData.Photo.tooLarge; return }
                problem = ""
                photo = image
            }
        }
    }

    /* The clip's length first, and then a player for its picture track alone. A clip refused for either
       is deleted at once; a clip taken replaces, and deletes, the one before it. */
    @MainActor private func hold(_ url: URL) async {
        let asset = AVURLAsset(url: url)
        let seconds = (try? await asset.load(.duration)).map(CMTimeGetSeconds) ?? .nan
        if let why = SkinCheck.clipProblem(seconds: seconds) { SkinClipFile.delete(url); problem = why; return }
        guard let player = await SkinClipFile.pictureOnly(asset) else {
            SkinClipFile.delete(url)
            problem = SkinCheckData.Clip.cannotPlay
            return
        }
        letGoOfClip()
        problem = ""
        clip = HeldClip(url: url, player: player)
    }

    private func toggle(_ player: AVPlayer) {
        player.isMuted = true
        if playing { player.pause() } else { player.play() }
        playing.toggle()
    }

    private func letGoOfClip() {
        clip?.player.pause()
        SkinClipFile.delete(clip?.url)
        clip = nil
        playing = false
    }

    private func press(_ questionId: String, _ optionId: String) {
        let next = SkinCheck.press(answers, question: questionId, option: optionId)
        if case .emergency(let says, _) = SkinCheck.outcome(next) {
            photo = nil
            letGoOfClip()
            onEmergency(says)
            return
        }
        answers = next
        outcome = nil
        copied = false
    }

    private func see() {
        let now = SkinCheck.outcome(answers, typed: typed)
        if case .emergency(let says, _) = now {
            photo = nil
            letGoOfClip()
            onEmergency(says)
            return
        }
        outcome = now
    }

    private func end() {
        photo = nil
        picked = nil
        letGoOfClip()
        answers = [:]
        typed = ""
        outcome = nil
        problem = ""
        ended = true
    }
}

/// A clip on the screen: its temporary copy, and the muted player for its picture.
private struct HeldClip {
    let url: URL
    let player: AVPlayer
}

/// A clip as PhotosPicker hands it over, already copied by SkinClipFile out of the file that lasts only
/// while it is received.
private struct PickedClip: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { received in
            PickedClip(url: try SkinClipFile.copy(received.file))
        }
    }
}

/* The only place this feature writes or deletes a file, and the only file it writes: one copy of a picked
   clip in the app's temporary folder, named with the check's prefix so a sweep finds every one. */
private enum SkinClipFile {
    static let prefix = "skin-check-clip-"

    static func copy(_ received: URL) throws -> URL {
        let copy = FileManager.default.temporaryDirectory
            .appendingPathComponent(prefix + UUID().uuidString).appendingPathExtension(received.pathExtension)
        try FileManager.default.copyItem(at: received, to: copy)
        try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: copy.path)
        return copy
    }

    static func delete(_ url: URL?) {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// Every copy the check left behind, if a killed app or a sheet closed mid-pick left one.
    static func sweep() {
        let folder = FileManager.default.temporaryDirectory
        for name in (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? [] where name.hasPrefix(prefix) {
            delete(folder.appendingPathComponent(name))
        }
    }

    /// A muted player for a composition of the clip's picture track and nothing else, so its sound is never
    /// decoded; nil when the clip has no picture this phone can play.
    @MainActor static func pictureOnly(_ asset: AVURLAsset) async -> AVPlayer? {
        guard let track = try? await asset.loadTracks(withMediaType: .video).first,
              let range = try? await track.load(.timeRange),
              let turn = try? await track.load(.preferredTransform) else { return nil }
        let picture = AVMutableComposition()
        guard let only = picture.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              (try? only.insertTimeRange(range, of: track, at: .zero)) != nil else { return nil }
        only.preferredTransform = turn
        let player = AVPlayer(playerItem: AVPlayerItem(asset: picture))
        player.isMuted = true
        player.volume = 0
        return player
    }
}

/// The picture alone, on a bare AVPlayerLayer: no system playback controls, which carry a volume.
private struct MutedClipView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ view: PlayerLayerView, context: Context) {
        view.playerLayer.player = player
    }

    static func dismantleUIView(_ view: PlayerLayerView, coordinator: ()) {
        view.playerLayer.player = nil
    }

    final class PlayerLayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
