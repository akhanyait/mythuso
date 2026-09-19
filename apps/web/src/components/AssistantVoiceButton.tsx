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
   *  the patient has tapped; before that the slot carries the disclosure, which says the same thing
   *  about typing and more about the microphone. */
  typingNote: string;
};

/* GilbertOne's push-to-talk on the live assistant.

   Every word here is read from `voice.webSentences` in packages/catalog/assistant.json, which carries
   the founder's decision of 18 September 2026: the demonstrator's own sentences say "this
   demonstration" and a patient must never be shown them. The control opens nothing until it is
   tapped, and the disclosure naming the browser's own recognition is on the screen before that first
   tap — a page that opens a microphone and then explains has already taken the voice it was about to
   explain.

   It is one footnote slot, not two, and one row rather than two. The control is a child of the
   composer's input row, beside the field and Send, and its words are a second child underneath the
   whole row: at 390x844 every line the composer fixes to the bottom of the sheet is taken out of the
   conversation above it, and the disclosure the founder's decision bought has to be paid for
   somewhere. Before the first tap the slot holds the disclosure and the state line is absent — the
   disclosure already says the microphone stays shut until she taps — and afterwards it holds the
   screen's typing note and the state line says which of the four states the microphone is actually
   in. Nothing is said by the icon alone: a control that looks open and is not, or looks closed while
   it is recording, is the failure this whole surface is built to avoid.

   What the browser caught goes into the composer as a draft. It is not sent, not queued and not
   reviewed by anything: the person reads it, edits it or throws it away, and presses Send herself. */
export function AssistantVoiceButton({
  voice,
  onTranscript,
  typingNote,
}: Props) {
  const [tapped, setTapped] = useState(false);
  /* Whether a capture has just finished. The recogniser reports the same way whether it was asked to
     stop or was taken away, so the difference has to be remembered on the way out. */
  const wasCapturing = useRef(false);

  useEffect(() => {
    const capturing = voice.state === "starting" || voice.state === "open";
    if (capturing) {
      wasCapturing.current = true;
      return;
    }
    /* Whenever a capture ends with words in them, the words go to the composer — including an ending
       nobody asked for. The `interrupted` sentence tells the patient that whatever was caught is in
       the field below, and that path lands in error rather than off, so handing over only on `off`
       would empty the field on the one sentence that promises it is there. */
    if (wasCapturing.current && voice.transcript.trim())
      onTranscript(voice.transcript.trim());
    wasCapturing.current = false;
  }, [voice.state, voice.transcript, onTranscript]);

  /* A browser with no speech recognition gets no control. Drawing one that cannot hear is the
     decorative affordance the capability's own rule refuses, and the sentence says what is true
     instead: nothing was asked for and nothing was opened. There is no disclosure to show before a
     tap that cannot open anything, but the slot still carries the screen's note, because the field's
     description points at it. */
  if (!voice.supported) {
    return (
      <div className="as-voice-lines">
        <p className="as-voice-state">{voice.unavailable}</p>
        <p id="as-keyboard" className="as-keyboard">
          {typingNote}
        </p>
      </div>
    );
  }

  const capturing = voice.state === "starting" || voice.state === "open";
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

  return (
    <>
      {/* The icon is never the whole answer. Its name is the contract's own label, worn as the
          accessible name, and the words are on the screen under the row wherever the row is: the
          disclosure before the first tap, the state line after it. Printed beside the icon they would
          cost 200px of a field row that is a 400px card on a laptop and 350px on a phone, and the thing
          that row must never be squeezed for is the text field a person types in. */}
      <button
        type="button"
        className="as-voice"
        aria-label={label}
        aria-pressed={capturing}
        onClick={() => {
          setTapped(true);
          if (capturing) voice.stop();
          else voice.start();
        }}
      >
        {capturing ? (
          <MicOff size={16} aria-hidden="true" />
        ) : (
          <Mic size={16} aria-hidden="true" />
        )}
      </button>
      <div className="as-voice-lines">
        {/* Before the first tap the disclosure below already says the microphone stays shut until she
            taps, and a phone has no line to spare saying it twice. */}
        {tapped ? (
          <p className="as-voice-state" role="status">
            {words}
          </p>
        ) : null}
        {heard ? (
          <p className="as-voice-heard">
            <span>{voicePolicy.sentences.captionsLabel}</span> {heard}
          </p>
        ) : null}
        {/* One footnote slot, not two. Before the first tap it carries the disclosure, which already says
            the microphone stays shut until she taps and that typing works; after it the typing note comes
            back and the state line above carries the microphone. The id the input is described by stays
            on whichever of the two is showing, so the field's own description never breaks. */}
        <p id="as-keyboard" className="as-keyboard">
          {tapped ? typingNote : disclosureFor("assistant")}
        </p>
      </div>
    </>
  );
}
