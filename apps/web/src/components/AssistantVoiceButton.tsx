import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "../ui/Button";
import { voice as voicePolicy } from "../../../../packages/catalog/assistant.json";
import { disclosureFor, type VoiceAdapter } from "../lib/voice";
import conversationMode from "../../../../packages/catalog/conversation-mode.json";

type Props = {
  /** The panel's own adapter, passed in rather than created here. Since the speech decision of
   *  19 September 2026 the panel reads its replies through the same adapter this control hears
   *  through, and one adapter means one microphone rule, one everSpoke and one close-on-unmount
   *  for both halves of the conversation rather than two controls each holding half of it. */
  voice: VoiceAdapter;
  onTranscript: (text: string) => void;
  /** Where a hands-free turn goes, since 28 September 2026: the panel's own send path — the same one
   *  Send, a chip and a typed answer to an intake question use — so a spoken "I have a headache"
   *  opens the intake offer and a spoken "yes" answers it. It is the only place the conversation's
   *  words go; `onTranscript` above is push-to-talk's, and is never called while a conversation runs. */
  onUtterance: (text: string) => void;
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
/* Hands-free conversation, since 28 September 2026 — the founder's "speak, pause, and it answers,
   like Siri". The control beside the microphone starts one; while it runs, this component shows the
   contract's own sentence for where the conversation is (packages/catalog/conversation-mode.json), the
   microphone's ring and the words "Microphone on" whenever the recogniser is open — including while
   GilbertOne reads and the recogniser is only watching for the person to start talking — and every
   tap of the microphone is Stop. What it refuses: it never hands the recogniser's transcript to the
   composer while a conversation runs (the words went to the panel's send path already), it never
   shows push-to-talk's "nothing is sent until you press Send" while things are being sent, and it
   opens nothing before the same consent push-to-talk asks for. */
export function AssistantVoiceButton({
  voice,
  onTranscript,
  onUtterance,
  typingNote,
  pending,
  onTypeInstead,
}: Props) {
  const convo = voice.conversation;
  const chat = conversationMode.sentences;
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
  /* Which of the two the consent was asked for: the microphone for one capture, or a hands-free
     conversation. Agreeing does the thing that was tapped, and nothing else. */
  const intent = useRef<"capture" | "conversation">("capture");
  /* Whether the recogniser now open, or just closed, was the conversation's. Its words went to the
     panel's send path as each turn ended, so the hand-over below must not also give the composer
     whatever the last window caught — set while a conversation runs, cleared once it has ended and
     the recogniser has closed. */
  const inConversation = useRef(false);
  /* The panel's send path as it is on this render, not as it was when the conversation started: the
     path closes over the conversation's turns, and a turn sent through a stale one would not see the
     intake the turn before opened — a spoken "yes" would miss the question it answers. */
  const latestUtterance = useRef(onUtterance);
  latestUtterance.current = onUtterance;

  useEffect(() => {
    const capturing = voice.state === "starting" || voice.state === "open";
    if (convo.active) inConversation.current = true;
    if (inConversation.current) {
      wasCapturing.current = false;
      if (!convo.active && !capturing) inConversation.current = false;
      return;
    }
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
  }, [voice.state, voice.transcript, onTranscript, convo.active]);

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
  const label = convo.active
    ? chat.stopLabel
    : capturing
      ? voicePolicy.sentences.stopLabel
      : voicePolicy.sentences.talkLabel;
  /* Where the conversation is, in the contract's sentence: the pause is over and the turn is being
     answered, the microphone is open again for the next turn, the voice is reading and will stop the
     moment she speaks, or the microphone closed on its own and why. Null when no conversation runs
     and none has just closed, so push-to-talk's own lines stand. */
  const conversationWords = convo.active
    ? convo.phase === "transcribing" || convo.phase === "thinking"
      ? chat.heardYou
      : convo.phase === "speaking"
        ? chat.bargeInNote
        : convo.note === "your-turn"
          ? chat.yourTurn
          : chat.listening
    : convo.note === "idle-rounds-exhausted"
      ? chat.sleeping
      : convo.note === "emergency-answer"
        ? chat.emergencyClosed
        : null;
  /* A failure has already earned its own sentence, and it outranks the state: a control that says
     "the microphone is open" beside a refusal is two answers to one question. */
  const words = (
    voice.failureSentence ??
    conversationWords ??
    voicePolicy.webSentences.states[voice.state]
  ).replace("{seconds}", String(voice.maxListeningSeconds));
  /* What the browser is catching, while it catches it. A patient who can see a word mis-heard as it
     appears can tap Stop and try again, rather than reading it afterwards and having to start the
     whole capture over. */
  const heard = capturing ? voice.transcript.trim() : "";
  /* Whether the patient has met the microphone's own consent — is meeting it now, or has agreed.
     The footnote hands the disclosure's slot back to the typing note at the same moment the state
     line appears, so the two words for the microphone are never both on the screen. */
  const met = asking || agreed;
  /* The conversation's own start, once consent is met: the words go to the panel's send path. */
  const startConversation = () => {
    dropped.current = false;
    convo.start((text) => latestUtterance.current(text));
  };

  return (
    <>
      {/* The written action accompanies the icon; the full accessible label still names GilbertOne.
          data-hot is the amendment's indicator: on whenever the recogniser is open, whichever of the
          two controls opened it and whether it is hearing a turn or watching for a barge-in. */}
      <button
        type="button"
        className="as-voice"
        aria-label={label}
        aria-pressed={capturing}
        aria-describedby="as-keyboard"
        data-hot={capturing || undefined}
        onClick={() => {
          /* While a conversation runs every tap of the microphone is its Stop: what the microphone
             was hearing is dropped, not sent, and the voice goes quiet. */
          if (convo.active) {
            convo.stop();
            return;
          }
          if (capturing) {
            voice.stop();
            return;
          }
          /* The microphone opens only after the patient has met the session's own consent; the first
             tap asks for it rather than opening anything. */
          if (!agreed) {
            intent.current = "capture";
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
        <span
          className="as-voice-words"
          data-mic-hot={(convo.active && capturing) || undefined}
        >
          {convo.active
            ? capturing
              ? chat.micHot
              : chat.stopLabel
            : capturing
              ? label
              : ui.talkLabel}
        </span>
      </button>
      <div className="as-voice-lines">
        {/* Hands-free: one tap starts a conversation and the same control ends it. It meets the same
            consent as the microphone, so nothing opens on the first tap of either. It sits at the head
            of the footnote lines rather than on a row of the composer's grid, so neither of the
            composer's two layouts has to make room for it. */}
        <Button
          variant={convo.active ? "primary" : "secondary"}
          className="as-convo"
          aria-pressed={convo.active}
          leadingIcon={<span className="as-convo-dot" aria-hidden="true" />}
          onClick={() => {
            if (convo.active) {
              convo.stop();
              return;
            }
            if (!agreed) {
              intent.current = "conversation";
              setAsking(true);
              return;
            }
            startConversation();
          }}
        >
          {convo.active ? chat.stopLabel : chat.startLabel}
        </Button>
        {/* The sequence is explicit: capture never sends the draft on the person's behalf. */}

        {/* Before the first tap the disclosure below already says the microphone stays shut until she
            taps, and a phone has no line to spare saying it twice. */}
        {met ? (
          <p className="as-voice-state" role="status">
            {words}
          </p>
        ) : null}
        {/* The amendment's rule in words: whenever the recogniser is open the microphone says so,
            beside the ring on the disc — and for a reader who asked for stillness, instead of it.
            During a conversation the microphone's own words carry it (above); here it is push-to-
            talk's, whose button says Stop instead. */}
        {capturing && !convo.active ? (
          <p className="as-mic-hot" data-mic-hot>
            <span className="as-mic-hot-dot" aria-hidden="true" />
            {chat.micHot}
          </p>
        ) : null}
        {/* The session's own moment, in the contract's words: what the voice is doing right now.
            The idle sentence is in the contract's list but never on the screen — a resting voice
            is the state no sentence needs to narrate. Not while a conversation runs: its sentences
            promise that nothing is sent until Send is pressed, and the conversation sends. */}
        {session && sessionId !== "idle" && !convo.active ? (
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
              <Button
                variant="primary"
                className="as-voice-agree"
                onClick={() => {
                  dropped.current = false;
                  setAgreed(true);
                  setAsking(false);
                  if (intent.current === "conversation") startConversation();
                  else voice.start();
                }}
              >
                {consent.confirmLabel}
              </Button>
              <Button variant="secondary" onClick={() => setAsking(false)}>
                {consent.notNowLabel}
              </Button>
            </div>
          </div>
        ) : null}
        {/* The session's own controls, while there is something to cancel or to stop: Cancel drops
            what a capture caught without keeping it, Stop the voice closes the reading and leaves
            the reply's words on the screen, and Type instead is the step between the voice and
            plain typing. */}
        {(capturing || reading) && !convo.active ? (
          <div className="as-voice-actions">
            {capturing ? (
              <Button
                variant="secondary"
                onClick={() => {
                  dropped.current = true;
                  voice.cancelCapture();
                }}
              >
                {labels.cancelCapture}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => voice.cancel()}>
                {labels.stopVoice}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                if (capturing) voice.stop();
                voice.cancel();
                onTypeInstead();
              }}
            >
              {labels.typeInstead}
            </Button>
          </div>
        ) : null}
        {/* While a conversation runs its only controls are Stop — the control above and every tap of
            the microphone — and the step down to typing, which is the same Stop and then the field. */}
        {convo.active ? (
          <div className="as-voice-actions">
            <Button
              variant="secondary"
              onClick={() => {
                convo.stop();
                onTypeInstead();
              }}
            >
              {labels.typeInstead}
            </Button>
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
