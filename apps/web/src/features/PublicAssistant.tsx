import { useEffect, useRef, useState, type FormEvent } from "react";
import { Phone, Send, X } from "lucide-react";
import { emergencyAnswer, lines, silenceIsNotSafety } from "../lib/assistant";
import { crisisLines, showsCrisisLines } from "../lib/crisis-lines";
import { publicAnswer, publicAssistant as copy, type PublicAnswer } from "../lib/public-assistant";
import { sendOnEnter } from "../lib/composer";
import { acknowledgePublic, publicAcknowledged } from "../lib/gilbertone-acknowledgement";
import { disclosureFor, useVoiceAdapter } from "../lib/voice";
import {
  BeforeWeStart,
  CallScreen,
  DESIGN_CHIPS,
  GilbertMark,
  Opening,
  PrivacyNote,
  QuietChips,
  QuietMenu,
  ShowDetails,
  leadAndRest,
  useGilbertCall,
} from "./gilbert-quiet";
import "./public-assistant.css";
import "./gilbertone-experience.css";

function EmergencyFooter() {
  const numbers = lines(["ambulance", "mobile"]);
  const pattern = new RegExp(`(${numbers.map((entry) => entry.number).join("|")})`, "g");
  return (
    <p className="public-assistant-emergency">
      {silenceIsNotSafety.split(pattern).map((part, index) => {
        const match = numbers.find((entry) => entry.number === part);
        return match ? (
          <a key={index} href={`tel:${match.number}`}>
            {match.number}
          </a>
        ) : (
          part
        );
      })}
    </p>
  );
}

const telOf = (number: string) => `tel:${number.replace(/\s+/g, "")}`;

type Turn = { asked: string; answer: PublicAnswer };

function speechOf(answer: PublicAnswer) {
  if (answer.kind === "emergency") return emergencyAnswer.headline;
  if (answer.kind === "refusal") return copy.refusal;
  return leadAndRest(answer.question.answer).lead;
}

function PublicVoice({
  ask,
  onClose,
}: {
  ask: (text: string) => void;
  onClose: () => void;
}) {
  const voice = useVoiceAdapter("assistant");
  const askRef = useRef(ask);
  askRef.current = ask;
  const words = useRef<(text: string) => void>(() => {});
  const [epoch, setEpoch] = useState(0);
  const [spoken, setSpoken] = useState("");
  words.current = (text: string) => {
    askRef.current(text);
    setSpoken(speechOf(publicAnswer(text)));
    setEpoch((value) => value + 1);
  };
  const call = useGilbertCall({
    initial: "disclose",
    supported: voice.supported,
    canSpeak: voice.canSpeak,
    state: voice.state,
    transcript: voice.transcript,
    pending: false,
    reply: spoken,
    replyEpoch: epoch,
    start: voice.start,
    cancelListen: voice.cancelCapture,
    cancelSpeech: voice.cancel,
    speak: voice.speak,
    voiceClass: "routine",
    onWords: words,
  });
  const leave = () => {
    call.end();
    onClose();
  };
  return (
    <CallScreen
      phase={call.phase}
      disclosure={disclosureFor("assistant")}
      muted={call.muted}
      note={
        voice.transcript.trim() ||
        !voice.failureSentence ||
        /not open/i.test(voice.failureSentence)
          ? null
          : voice.failureSentence
      }
      onStart={() => call.begin()}
      onMute={() => call.mute()}
      onEnd={leave}
      onText={leave}
      emergency={<EmergencyFooter />}
    />
  );
}

/* Signed-out website guide. Answers stay on the approved public questions.
   Nothing here is given the private patient record. */
export default function PublicAssistant({ request = null }: { request?: { question?: string; n: number } | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [accepted, setAccepted] = useState(publicAcknowledged);
  const [calling, setCalling] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const started = turns.length > 0;

  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open && !sheet.open) {
      sheet.showModal();
      close.current?.focus();
    } else if (!open && sheet.open) {
      sheet.close();
      const back = opener.current?.isConnected ? opener.current : launcher.current;
      opener.current = null;
      back?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!request) return;
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
    setOpen(true);
    if (request.question) ask(request.question);
  }, [request?.n]);

  useEffect(() => {
    if (!open || !accepted || calling) return;
    const viewport = body.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight });
  }, [open, accepted, calling, turns]);

  const ask = (asked: string) => {
    const text = asked.trim();
    if (!text) return;
    setTurns((previous) => [...previous, { asked: text, answer: publicAnswer(text) }]);
    setDraft("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };
  const reset = () => {
    setTurns([]);
    setDraft("");
    setPrivacyOpen(false);
    setCalling(false);
  };
  const pick = (label: string) => {
    if (label === "How MyThuso works") {
      const about = copy.questions.find((question) => question.id === "about");
      if (about?.href) {
        window.location.assign(about.href);
        setOpen(false);
        return;
      }
    }
    ask(label);
  };

  return (
    <>
      <button
        ref={launcher}
        className="public-assistant-launcher"
        aria-label="Open GilbertOne"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="al-orb" aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        className="public-assistant go-experience"
        aria-labelledby={accepted ? "public-assistant-title" : "go-before-title"}
        onCancel={(event) => {
          event.preventDefault();
          if (privacyOpen) {
            setPrivacyOpen(false);
            return;
          }
          setCalling(false);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        {!accepted ? (
          <BeforeWeStart
            closeRef={close}
            onClose={() => setOpen(false)}
            onContinue={() => {
              acknowledgePublic();
              setAccepted(true);
            }}
          />
        ) : (
        <div className="go-frame">
          <header className="go-head">
            <div className="go-lockup">
              <GilbertMark size={44} />
              <div className="go-lockup-words">
                <h2 id="public-assistant-title" className="go-title">GilbertOne</h2>
                <p className="go-not">Not a person, and not a doctor.</p>
              </div>
            </div>
            <div className="go-head-actions">
              <QuietMenu onNew={reset} onPrivacy={() => setPrivacyOpen(true)} />
              <button
                ref={close}
                type="button"
                className="go-icon"
                aria-label="Close GilbertOne"
                onClick={() => setOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </header>
          {privacyOpen && (
            <PrivacyNote
              paragraphs={[
                copy.privacy,
                "GilbertOne on this page answers approved questions about the public website. It does not decide access to an account, a tender or a record.",
                "New conversation clears this page’s chat. It does not delete stored history, because this page does not keep one.",
              ]}
              onClose={() => setPrivacyOpen(false)}
            />
          )}
          {calling ? (
            <PublicVoice ask={ask} onClose={() => setCalling(false)} />
          ) : (
          <>
              <div className="go-body" ref={body}>
                {!started && <Opening prompt="What can I help you with?" title="" />}
                {!started && <QuietChips chips={DESIGN_CHIPS} onPick={pick} />}
                <div role="log" aria-label="MyThuso website conversation" aria-live="polite">
                  <ol className="go-log">
                    {turns.map((turn, index) => (
                      <li key={index} className="go-turn">
                        <p className="go-said">
                          <span className="go-sr">You: </span>
                          {turn.asked}
                        </p>
                        <div className="go-answer">
                          <PublicReply answer={turn.answer} onNavigate={() => setOpen(false)} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <form className="go-compose" onSubmit={submit}>
                <label className="go-sr" htmlFor="public-assistant-input">{copy.inputLabel}</label>
                <div className="go-compose-row">
                  <textarea
                    ref={field}
                    id="public-assistant-input"
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={sendOnEnter}
                    placeholder="Type in your own words."
                    maxLength={500}
                    autoComplete="off"
                  />
                  <button type="submit" className="go-primary" aria-label="Send">
                    <Send size={16} aria-hidden="true" />
                    <span>Send</span>
                  </button>
                </div>
                <div className="go-compose-actions">
                  <button type="button" className="go-talk" onClick={() => setCalling(true)}>
                    <Phone size={16} aria-hidden="true" />
                    Talk to GilbertOne.
                  </button>
                </div>
                <EmergencyFooter />
              </form>
          </>
          )}
        </div>
        )}
      </dialog>
    </>
  );
}

function PublicReply({ answer, onNavigate }: { answer: PublicAnswer; onNavigate: () => void }) {
  if (answer.kind === "refusal") return <p>{copy.refusal}</p>;
  if (answer.kind === "emergency") {
    return (
      <>
        <p>{emergencyAnswer.headline}</p>
        <p>{emergencyAnswer.lead}</p>
        <ul>
          {lines(emergencyAnswer.numbers).map((n) => (
            <li key={n.number}>
              <a href={telOf(n.number)}><strong>{n.number}</strong></a> — {n.name}
            </li>
          ))}
        </ul>
        <p>{emergencyAnswer.notAnAmbulance}</p>
        {showsCrisisLines(answer.groups) && (
          <div>
            <p>{crisisLines.heading}</p>
            <ul>
              {crisisLines.lines.map((line) => (
                <li key={line.id}>
                  <a href={telOf(line.number)}><strong>{line.number}</strong></a> — {line.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }
  const { lead, rest } = leadAndRest(answer.question.answer);
  return (
    <>
      <p>
        {lead}
        <a className="go-source" href={answer.question.href} onClick={onNavigate}>
          {answer.question.linkLabel}
        </a>
      </p>
      {rest && (
        <ShowDetails>
          <p>{rest}</p>
        </ShowDetails>
      )}
    </>
  );
}
