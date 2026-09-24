import Foundation
import Speech
import AVFAudio

/* GilbertOne's ears, and — since 21 September 2026 — its mouth too: the only file in this app allowed
   to have either. GilbertListener is the ears; GilbertSpeaker, at the foot of this file, is the mouth.
   One file for both is the same rule as one file for the microphone: anybody asking when this app can
   hear or speak gets an answer by opening a single module rather than trusting a sentence, and the
   build refuses AVSpeechSynthesizer everywhere else the way it already refuses SFSpeechRecognizer.

   The founder decided on 14 September 2026 what listening may be in Release 1, and this file is that
   decision as code: push-to-talk, English, recognised on the phone itself, nothing kept. The build
   refuses the microphone and speech APIs in every other Swift file, refuses the recording and
   audio-file APIs in all of them including this one, and fails if the request below stops asking for
   on-device recognition.

   ON-DEVICE OR NOT AT ALL. SFSpeechRecognizer will happily send audio to Apple's servers when it
   thinks that would be better, and on some locales it has no choice. So the recogniser is chosen
   only from the contract's English locales and only if it reports supportsOnDeviceRecognition, and
   every request sets requiresOnDeviceRecognition. A phone that cannot do that gets the contract's
   `unavailable` sentence, and typing still works. Nothing falls back to a server.

   THE INDICATOR IS THE MICROPHONE. `phase` is `.listening` from the moment the engine starts to the
   moment its tap is removed, and at no other time; the screen draws Listening from `phase` and
   nothing else. There is no timer standing in for the microphone, so the two cannot come apart. A
   tap starts it; Stop, the contract's limit, the recogniser finishing, the app leaving the
   foreground or the screen closing all end it.

   NO AUDIO IS KEPT. Each buffer from the input tap is handed to the on-device recognition request
   and read once for its loudness, and nothing holds a reference to it afterwards. The loudness is
   a single number that drives the sphere while Listening; it is not stored, not sent and reset to
   zero when the microphone closes. The transcript is a string on this object for the length of one
   turn and is handed to the screen to be corrected and sent, or discarded.

   LISTENING ENDS WHEN THE PHONE TAKES THE MICROPHONE. A call arriving, Siri, another app, a headset
   plugged in or pulled out, or the engine reconfiguring itself can each leave the engine stopped while
   this object still says Listening. So all three notifications are observed for as long as the
   microphone is open, and any of them closes it, clears Listening and says why in the contract's
   `interrupted` sentence. The route changes our own start causes — the category being set, an override
   — are the only ones ignored, because they arrive as a consequence of opening the microphone.

   EVERY RECOGNITION REQUEST IS MADE BY ONE FUNCTION. onDeviceRequest() is the only place a request is
   constructed, and it sets requiresOnDeviceRecognition before returning it; the build refuses any
   other construction, so a second request cannot be added that forgets.

   PERMISSION ON FIRST USE, AFTER THE CONTRACT HAS SPOKEN. Nothing is asked when this object is made.
   The first tap moves to `.explaining`, where the screen shows voice.sentences.beforePermission;
   only `consent()` asks the system, and a refusal is said in the contract's `refused` sentence. */

@MainActor
final class GilbertListener: ObservableObject {
    enum Phase: Equatable {
        case idle
        case explaining
        case listening
        /// The microphone is closed and the recogniser is finishing — the only honest Thinking.
        case finishing
        case heard(String)
        case unavailable
        case refused
        case failed
        /// The phone took the microphone for something else, or the microphone changed, while listening.
        case interrupted
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var captions = ""
    /// 0 to 1, and only ever non-zero while `phase` is `.listening`.
    @Published private(set) var level: Double = 0

    private let engine = AVAudioEngine()
    private let recogniser: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var limit: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []

    init() {
        recogniser = Self.onDeviceEnglish()
        phase = recogniser == nil ? .unavailable : .idle
    }

    var available: Bool { recogniser != nil }

    /// The first of the contract's English locales this phone can recognise without a network.
    /// Asking this needs no permission, which is why it can be asked before anybody has tapped.
    private static func onDeviceEnglish() -> SFSpeechRecognizer? {
        for identifier in Gilbert.voice.recognitionLocales {
            if let candidate = SFSpeechRecognizer(locale: Locale(identifier: identifier)), candidate.supportsOnDeviceRecognition {
                return candidate
            }
        }
        return nil
    }

    // MARK: - What the screen can ask for

    func talk() {
        guard recogniser != nil else { phase = .unavailable; return }
        switch (SFSpeechRecognizer.authorizationStatus(), AVAudioApplication.shared.recordPermission) {
        case (.authorized, .granted): start()
        case (.denied, _), (.restricted, _), (_, .denied): phase = .refused
        default: phase = .explaining
        }
    }

    /// Called only after the screen has shown the contract's explanation and the person chose to go on.
    func consent() {
        SFSpeechRecognizer.requestAuthorization { status in
            Task { @MainActor in
                guard status == .authorized else { self.phase = .refused; return }
                AVAudioApplication.requestRecordPermission { granted in
                    Task { @MainActor in
                        if granted { self.start() } else { self.phase = .refused }
                    }
                }
            }
        }
    }

    func notNow() { phase = .idle }

    /// Stop, pressed. The microphone closes now; the recogniser finishes what it heard.
    func stop() {
        guard phase == .listening else { return }
        closeMicrophone()
        request?.endAudio()
        phase = .finishing
    }

    /// The person sent the corrected words, or threw them away.
    func sent() { reset() }
    func discard() { reset() }

    /// The app left the foreground, or the screen closed. Everything ends and nothing is kept.
    func cancel() {
        task?.cancel()
        if phase == .listening { closeMicrophone() }
        reset()
    }

    // MARK: - The microphone

    private func start() {
        guard let recogniser, recogniser.supportsOnDeviceRecognition else { phase = .unavailable; return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch { fail(); return }

        let request = Self.onDeviceRequest()
        self.request = request
        captions = ""

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        /* A simulator or a phone with no usable input reports a zero sample rate, and installing a tap
           on it throws from inside AVFoundation rather than returning an error. */
        guard format.sampleRate > 0, format.channelCount > 0 else { fail(); return }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            request.append(buffer)
            let loudness = Self.loudness(of: buffer)
            Task { @MainActor in self?.hear(loudness) }
        }
        engine.prepare()
        do { try engine.start() } catch { input.removeTap(onBus: 0); fail(); return }
        phase = .listening
        observeInterruptions()

        task = recogniser.recognitionTask(with: request) { [weak self] result, error in
            let words = result?.bestTranscription.formattedString
            let final = result?.isFinal ?? false
            Task { @MainActor in self?.recognised(words, final: final, failed: error != nil) }
        }
        let seconds = Gilbert.voice.maxListeningSeconds
        limit = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            self?.stop()
        }
    }

    /// The only construction of a recognition request in this app, and it is on-device or nothing.
    private static func onDeviceRequest() -> SFSpeechAudioBufferRecognitionRequest {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        return request
    }

    private func observeInterruptions() {
        let centre = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        observers = [
            centre.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.interrupt() }
            },
            centre.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
                let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
                let reason = raw.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
                guard reason != .categoryChange, reason != .override else { return }
                Task { @MainActor in self?.interrupt() }
            },
            centre.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.interrupt() }
            }
        ]
    }

    private func stopObserving() {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
    }

    /// Something else took the microphone, or it changed. Listening ends now, and the screen says why.
    private func interrupt() {
        guard phase == .listening else { return }
        task?.cancel()
        closeMicrophone()
        task = nil
        request = nil
        captions = ""
        phase = .interrupted
    }

    private func closeMicrophone() {
        stopObserving()
        limit?.cancel()
        limit = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func hear(_ loudness: Double) {
        guard phase == .listening else { return }
        /* Quick to rise, slower to fall, so a syllable lands and a silence settles. */
        level = loudness > level ? level + (loudness - level) * 0.6 : level + (loudness - level) * 0.18
    }

    private func recognised(_ words: String?, final: Bool, failed: Bool) {
        guard phase == .listening || phase == .finishing else { return }
        if let words { captions = words }
        if final || failed { finish() }
    }

    private func finish() {
        if phase == .listening { closeMicrophone() }
        task = nil
        request = nil
        let words = captions.trimmingCharacters(in: .whitespacesAndNewlines)
        captions = ""
        phase = words.isEmpty ? .failed : .heard(words)
    }

    private func fail() {
        if engine.isRunning { closeMicrophone() }
        task?.cancel()
        task = nil
        request = nil
        captions = ""
        phase = .failed
    }

    private func reset() {
        limit?.cancel()
        limit = nil
        task = nil
        request = nil
        captions = ""
        level = 0
        phase = recogniser == nil ? .unavailable : .idle
    }

    /* Root mean square of the first channel, mapped from about -50 dB to -10 dB onto 0 to 1. A number
       computed from the buffer and returned; the buffer itself is not kept. */
    nonisolated private static func loudness(of buffer: AVAudioPCMBuffer) -> Double {
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for index in 0..<count { sum += channel[index] * channel[index] }
        let rms = sqrt(sum / Float(count))
        guard rms > 0 else { return 0 }
        let decibels = 20 * log10(Double(rms))
        return min(1, max(0, (decibels + 50) / 40))
    }
}

/* GilbertOne's mouth, added 21 September 2026 under voice.nativeSpeech. AVSpeechSynthesizer is entirely
   on-device — the voices ship with the OS — so unlike GilbertListener there is no server path to refuse
   and no requiresOnDeviceRecognition equivalent to set; the on-device rule is upheld simply by there
   being no other kind of synthesiser to reach for.

   THE FLAG IS READ BEFORE ANYTHING ELSE. `speak` returns before constructing an utterance, cancelling
   anything or touching the synthesiser at all while voice.nativeSpeech.enabled is false — the same order
   lib/voice.ts keeps for the web, so switching the contract's flag off again leaves this class inert
   rather than merely unused.

   MUTE IS THE PHONE'S OWN CONTROL, WHICH THE WEB DOES NOT HAVE. A phone is far more often overheard than
   a desktop browser at a settled address, so `muted` — false by default, matching voice.webSpeech's own
   default of speaking — stops the current sentence immediately and every reply after it until somebody
   taps it back on. It is `@Published` state on this object alone: nothing about the choice is written to
   disk, iCloud or UserDefaults, so it resets the way the composer's own microphone state does when the
   screen is asked for again.

   THE CAPTION NEVER DEPENDS ON THE VOICE. AssistantView writes every reply to the screen whether or not
   this class ever speaks a word of it; speaking is a second reading of words already there, never the
   only place they appear — the same rule voice.webSpeech states for the web. */
@MainActor
final class GilbertSpeaker: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var speaking = false
    /// Off is one tap away on the composer's speaker button; on is the default, matching voice.webSpeech.
    @Published var muted = false

    private let synthesiser = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesiser.delegate = self
    }

    /// The reply's own words, already on the screen before this is ever called — never a substitute for
    /// them. A held safety face or a muted screen answers with silence rather than an utterance nobody
    /// asked to hear.
    ///
    /// The language, since 23 September 2026: a reply detected as one of voice.spokenLanguages is asked
    /// for in its own locale order first, because an English voice reading isiZulu words is the reading
    /// the founder heard and asked to fix. Detection is decided by Gilbert.spokenLanguage(in:) — a fact
    /// about the words — and this method only chooses the voice, exactly as the web keeps the seam.
    func speak(_ text: String, language: GilbertSpokenLanguage? = nil) {
        guard Gilbert.voice.nativeSpeechEnabled, !muted else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        synthesiser.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = Self.preferredVoice(for: language)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesiser.speak(utterance)
    }

    /// Stop, whether the composer's mute button, the screen closing or the app leaving the foreground.
    func stop() {
        synthesiser.stopSpeaking(at: .immediate)
    }

    /// voice.voicePreference's own order — South African English first, then British, then Australian,
    /// then any English voice — applied to whatever this phone actually has installed; a phone with none
    /// of the four keeps the system's own default voice, and none is promised. The same rule lib/voice.ts
    /// applies to the browser's voice list. Since 23 September 2026 a reply in one of
    /// voice.spokenLanguages is asked for in its own order first, with this order standing behind it —
    /// the same two-step the web's adapter keeps.
    private static func preferredVoice(for language: GilbertSpokenLanguage? = nil) -> AVSpeechSynthesisVoice? {
        let installed = AVSpeechSynthesisVoice.speechVoices()
        if let language {
            for tag in language.localeOrder {
                if let found = installed.first(where: {
                    $0.language.lowercased() == tag.lowercased() || $0.language.lowercased().hasPrefix("\(tag.lowercased())-")
                }) {
                    return found
                }
            }
        }
        for tag in Gilbert.voice.speechVoiceOrder {
            if let found = installed.first(where: {
                $0.language.lowercased() == tag.lowercased() || $0.language.lowercased().hasPrefix("\(tag.lowercased())-")
            }) {
                return found
            }
        }
        return AVSpeechSynthesisVoice(language: Gilbert.voice.recognitionLocales.first)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = true }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
}
