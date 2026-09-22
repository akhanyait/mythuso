import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { voice as voicePolicy } from "../../../../packages/catalog/assistant.json";
import { disclosureFor, type VoiceAdapter } from "../lib/voice";

type Props = {
  /** The panel's own adapter, passed in rather than created here. Since the speech decision of
   *  19 September 2026 the panel reads its replies through the same adapter this control hears
   *  through, and one adapter means one microphone rule, one everSpoke and one close-on-unmount
   *  for both halves of the conversation rather than two controls each holding half of it. */
  voice: VoiceAdapter;
  onTranscript: (text: string) => void;
  /** The composer's own note that typing always works. This component's footnote slot carries it once
   *  the patient has met the microphone's consent; before that the slot carries the disclosure, which
   *  says the same thing about typing and more about the microphone. */
  typingNote: string;
  /** Whether the panel is waiting on an answer for the last turn — the session's `understanding`
   *  moment. The question belongs to the panel; this control only says, in the session's own
   *  sentence, that the working out is happening. */
  pending: boolean;
  /** The session's "Type instead": the step between the voice and plain typing. The panel hands
   *  focus to its field, because that is where typing happens. */
  onTypeInstead: () => void;
};

/* The founder requested a compact composer on 22 September 2026, and the same day's session work
   gave push-to-talk its five moments — idle, listening, understanding, responding, speaking. The
   pre-tap disclosure still opens in a collapsed section, because a microphone that opens and then
   explains has already taken the voice it was about to explain. The session's own consent — the
   microphone, and where the hearing and the reading happen — is asked once on the first tap, in the
   contract's words, and declining is a real answer: nothing opens, typing stays, and the next tap
   asks again. Nothing starts before an explicit tap; recognised words remain an editable draft until
   Send, and the session's Cancel drops them without a trace. Browser permission is controlled by
   the browser and may already have been granted on a previous visit. */
export function AssistantVoiceButton({
  voice,
  onTranscript,
  typingNote,
  pending,
  onTypeInstead,
}: Props) {
  /* The microphone consent, asked once and remembered for as long as this panel is open. The two
     agreements are two different agreements — the microphone opening, and where the hearing and the
     reading happen — and one button implies neither, so both are said before either is true. */
  const [asking, setAsking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  /* Whether a capture has just finished. The recogniser reports the same way whether it was asked to
     stop or was taken away, so the difference has to be remembered on the way out. */
  const wasCapturing = useRef(false);
  /* Whether what a capture caught was discarded on purpose. The adapter's own cancel wipes the
     transcript, but a recogniser may report one last result between the wipe and the close, and the
     sentence the Cancel button keeps has to stay true: nothing is handed to the composer. Every
     other way into a capture clears it. */
  const dropped = useRef(false);

  useEffect(() => {
    const capturing = voice.state === "starting" || voice.state === "open";
    if (capturing) {
      wasCapturing.current = true;
      return;
    }
    /* Whenever a capture ends with words in them, the words go to the composer — including an ending
       nobody asked for. The `interrupted` sentence tells the patient that whatever was caught is in
       the field below, and that path lands in error rather than off, so handing over only on `off`
       would empty the field on the one sentence that promises it is there. Cancel is the exception,
       and it is the one this ref exists for. */
    if (!dropped.current && wasCapturing.current && voice.transcript.trim())
      onTranscript(voice.transcript.trim());
    wasCapturing.current = false;
  }, [voice.state, voice.transcript, onTranscript]);

  /* A browser with no speech recognition gets no control. Drawing one that cannot hear is the
     decorative affordance the capability's own rule refuses, and the sentence says what is true
     instead: nothing was asked for and nothing was opened. Beside it sits the contract's own
     browser notice — the state line says what this browser lacks, and the notice names the
     browsers that would work, because a patient on a browser that cannot hear has no way to guess
     which ones can. There is no disclosure to show before a tap that cannot open anything, but the
     slot still carries the screen's note, because the field's description points at it. */
  if (!voice.supported) {
    return (
      <div className="as-voice-lines">
        <p className="as-voice-state">{voice.unavailable}</p>
        <details className="as-mic-details">
          <summary>{ui.microphoneDetails}</summary>
          <p className="as-voice-browser">{voicePolicy.browserNotice}</p>
          <p id="as-keyboard" className="as-keyboard">
            {typingNote}
          </p>
        </details>
      </div>
    );
  }

  const consent = voicePolicy.session.consent;
  const labels = voicePolicy.session.labels;
  const capturing = voice.state === "starting" || voice.state === "open";
  const reading = voice.responding || voice.speaking;
  /* The session's moment, one of the contract's five and never two at once: what the microphone is
     doing first, then the answer being worked out, then the voice. The words are found in
     voice.session.states, so the line below and the decision it describes cannot drift apart. */
  const sessionId = capturing
    ? "listening"
    : pending
      ? "understanding"
      : voice.speaking
        ? "speaking"
        : voice.responding
          ? "responding"
          : "idle";
  const session = voicePolicy.session.states.find(
    (entry) => entry.id === sessionId,
  );
  const label = capturing
    ? voicePolicy.sentences.stopLabel
    : voicePolicy.sentences.talkLabel;
  /* A failure has already earned its own sentence, and it outranks the state: a control that says
     "the microphone is open" beside a refusal is two answers to one question. */
  const words = (
    voice.failureSentence ?? voicePolicy.webSentences.states[voice.state]
  ).replace("{seconds}", String(voice.maxListeningSeconds));
  /* What the browser is catching, while it catches it. A patient who can see a word mis-heard as it
     appears can tap Stop and try again, rather than reading it afterwards and having to start the
     whole capture over. */
  const heard = capturing ? voice.transcript.trim() : "";
  /* Whether the patient has met the microphone's own consent — is meeting it now, or has agreed.
     The footnote hands the disclosure's slot back to the typing note at the same moment the state
     line appears, so the two words for the microphone are never both on the screen. */
  const met = asking || agreed;

  return (
    <>
      {/* The written action accompanies the icon; the full accessible label still names GilbertOne. */}
      <button
        type="button"
        className="as-voice"
        aria-label={label}
        aria-pressed={capturing}
        aria-describedby="as-keyboard"
        onClick={() => {
          if (capturing) {
            voice.stop();
            return;
          }
          /* The microphone opens only after the patient has met the session's own consent; the first
             tap asks for it rather than opening anything. */
          if (!agreed) {
            setAsking(true);
            return;
          }
          /* Every way into a capture is a new capture: whatever an earlier Cancel dropped is not
             this one's business. */
          dropped.current = false;
          voice.start();
        }}
      >
        <span className="as-mic-disc" aria-hidden="true">
          {capturing ? (
            <MicOff size={20} aria-hidden="true" />
          ) : (
            <Mic size={22} aria-hidden="true" />
          )}
        </span>
        {/* The written action. The mockup's sentence that was its second line stands below the bar
            as the first line of the control's own footnote zone — inside this button it wrapped to
            four cramped lines at 320px, which the composer could not pay for, and here it reads on
            one line at every width. */}
        <span className="as-voice-words">
          {capturing ? label : ui.talkLabel}
        </span>
      </button>
      <div className="as-voice-lines">
        {/* The sequence is explicit: capture never sends the draft on the person's behalf. */}

        {/* Before the first tap the disclosure below already says the microphone stays shut until she
            taps, and a phone has no line to spare saying it twice. */}
        {met ? (
          <p className="as-voice-state" role="status">
            {words}
          </p>
        ) : null}
        {/* The session's own moment, in the contract's words: what the voice is doing right now.
            The idle sentence is in the contract's list but never on the screen — a resting voice
            is the state no sentence needs to narrate. */}
        {session && sessionId !== "idle" ? (
          <p className="as-voice-session" data-session={sessionId}>
            {session.sentence}
          </p>
        ) : null}
        {heard ? (
          <p className="as-voice-heard">
            <span>{voicePolicy.sentences.captionsLabel}</span> {heard}
          </p>
        ) : null}
        {/* The session's consent, put on the screen on the first tap and remembered once it is
            given. Both agreements in the contract's words, with the cap read into the sentence
            rather than typed beside it. */}
        {asking && !agreed ? (
          <div
            className="as-voice-consent"
            role="group"
            aria-label={ui.microphoneDetails}
          >
            <p className="as-voice-consent-line">
              {consent.microphone.replace(
                "{seconds}",
                String(voice.maxListeningSeconds),
              )}
            </p>
            <p className="as-voice-consent-line">
              {consent.externalSpeechProcessing}
            </p>
            <div className="as-voice-actions">
              <button
                type="button"
                className="as-voice-agree"
                onClick={() => {
                  dropped.current = false;
                  setAgreed(true);
                  setAsking(false);
                  voice.start();
                }}
              >
                {consent.confirmLabel}
              </button>
              <button type="button" onClick={() => setAsking(false)}>
                {consent.notNowLabel}
              </button>
            </div>
          </div>
        ) : null}
        {/* The session's own controls, while there is something to cancel or to stop: Cancel drops
            what a capture caught without keeping it, Stop the voice closes the reading and leaves
            the reply's words on the screen, and Type instead is the step between the voice and
            plain typing. */}
        {capturing || reading ? (
          <div className="as-voice-actions">
            {capturing ? (
              <button
                type="button"
                onClick={() => {
                  dropped.current = true;
                  voice.cancelCapture();
                }}
              >
                {labels.cancelCapture}
              </button>
            ) : (
              <button type="button" onClick={() => voice.cancel()}>
                {labels.stopVoice}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (capturing) voice.stop();
                voice.cancel();
                onTypeInstead();
              }}
            >
              {labels.typeInstead}
            </button>
          </div>
        ) : null}
        {/* One footnote slot, not two. Before the first tap it carries the disclosure, which already says
            the microphone stays shut until she taps and that typing works; after it the typing note comes
            back and the state line above carries the microphone. The id the input is described by stays
            on whichever of the two is showing, so the field's own description never breaks. */}
        <details className="as-mic-details">
          <summary>{ui.microphoneDetails}</summary>
          <p className="as-voice-note">{ui.voiceSteps}</p>
          <p id="as-keyboard" className="as-keyboard">
            {met ? typingNote : disclosureFor("assistant")}
          </p>
        </details>
      </div>
    </>
  );
}
