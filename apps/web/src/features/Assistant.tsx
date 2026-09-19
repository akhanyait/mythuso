import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Ambulance,
  ArrowRight,
  RotateCcw,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { NotConnected } from "../components/NotConnected";
import { MotionPause } from "../components/MotionPause";
import { AssistantVoiceButton } from "../components/AssistantVoiceButton";
import { GilbertAvatar, GilbertStill, useGilbertRig } from "./GilbertAvatar";
import {
  affect,
  answers,
  audienceOf,
  choose,
  conversation,
  cueOf,
  emergencyAnswer,
  emergencyIn,
  handOver,
  identity,
  lines,
  opening,
  outcomeOf,
  postureOf,
  pulseOf,
  questionGroups,
  questionsFor,
  refusalFor,
  refusals,
  say,
  silenceIsNotSafety,
  spokenOf,
  stateSpec,
  unmatchedDetail,
  voice,
  type AudienceId,
  type Question,
  type Reply,
  type Turn,
} from "../lib/assistant";
import {
  handoverDeskWords as bookingHandover,
  refusal,
} from "../lib/assistant";
import { sendWithGilbertEngine } from "../lib/gilbertone-bridge";
import {
  emptyQueue,
  handOver as handToQueue,
  type Handover,
  type Queue,
} from "../../../../packages/engines/src/access/domain/handover.ts";
import { useDecor, useReducedMotion } from "../lib/motion";
import type { Visit } from "../lib/scheduling";
import { useVoiceAdapter } from "../lib/voice";
import "./assistant.css";

/* GilbertOne's panel on the web.

   It opens from the floating orb (components/AssistantLauncher.tsx) and arrives on a dynamic import.
   Nothing in the patient entry may import this file statically, nor lib/assistant.ts or the contract
   behind it.

    ...
*/
export type PanelProps = {
  open: boolean;
  dismiss: () => void;
  /* The patient entry always provides this; a staff workspace has no Emergency & urgent care
     modal to open, and its audience's entry scopes the button that would have opened it away. */
  openModal?: (modal: string) => void;
  visit: Visit | null;
  /* Who this panel serves, since the audience decision of 19 September 2026. The patient entry
     omits it and the patient is what it gets; the shells pass the audience the door chose. */
  audience?: AudienceId;
};

const SESSION_SUBJECT = "subject-this-session";
type Sent = { handover: Handover; sentNow: boolean };

/* The same containment the demonstrator's widget gives its rig: a rig that throws must not take the
   words with it, and on this panel the words are the product. The still character and one sentence
   stand in, in the same box the moving one occupied. */
class RigBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="as-rig-failed">
        <GilbertStill size={100} />
        <p>
          The character stopped drawing. Everything else in this panel still
          works.
        </p>
      </div>
    );
  }
  componentDidUpdate(previous: { children: ReactNode }) {
    /* Recover when the children change rather than staying broken until the page is reloaded. */
    if (previous.children !== this.props.children && this.state.failed)
      this.setState({ failed: false });
  }
}

export default function Assistant({
  open,
  dismiss,
  openModal,
  visit,
  audience: audienceId = "patient",
}: PanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const latest = useRef<HTMLLIElement>(null);
  const field = useRef<HTMLInputElement>(null);
  /* The audience's own entry: its simulated label, its voice flag, its two action buttons and
     what it opens with are the contract's, never this component's defaults. */
  const audience = audienceOf(audienceId);
  const [turns, setTurns] = useState<Turn[]>(() => opening(audienceId));
  const [draft, setDraft] = useState("");
  const [gatheredAt, setGatheredAt] = useState<number | null>(null);
  const [raised, setRaised] = useState(false);
  const [queue, setQueue] = useState<Queue>(emptyQueue);
  const [sent, setSent] = useState<Record<number, Sent>>({});
  const conversationRef = useRef(crypto.randomUUID());
  const reduced = useReducedMotion();
  /* The panel's own Pause motion control (MotionPause, in the bar) and this hook read the same
     module-level store in lib/motion.ts, so the one press that stills the page stills the character
     too — and a cue that holds keeps its face through the pause, which is the reducer's settle. */
  const decor = useDecor();
  const rig = useGilbertRig({ reduced, paused: !decor.playing });
  /* The panel's one voice adapter, since the speech decision of 19 September 2026. The
     composer's microphone and the reply's reading are the two halves of one conversation, and
     one adapter means one microphone rule, one everSpoke and one close-on-unmount rather than
     two controls each holding half of it. The reply half is behind voice.webSpeech and the flag
     is off — lib/voice.ts reads the flag before anything is reached for, so the wiring below is
     built and inert until the founder switches it on — and the microphone half is the
     18 September decision, unchanged. */
  const voiceAdapter = useVoiceAdapter("assistant");
  const reply = turns[turns.length - 1].reply;
  const asked = turns.length > 1;
  const pulse = asked ? pulseOf(reply) : "idle";
  const stage = useMemo(() => stageOf(reply, asked), [reply, asked]);
  const everRaised = raised || emergencyIn(turns);
  useEffect(() => {
    if (emergencyIn(turns)) setRaised(true);
  }, [turns]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      close.current?.focus();
      setGatheredAt(performance.now());
    }
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);
  /* Opening is A01's trigger, and it greets once per open: this panel stays mounted after its first
     open, so a re-open onto a conversation already in progress reads its last message instead — the
     widget's own rule. Two refs, because "once" has to survive two different things. `greeted`
     spans the panel's life and picks A01 against A05; `greetedThisOpen` spans one open and is what
     keeps StrictMode's double-invoked mount honest — its second run sees `greeted` already set and,
     unguarded, plays A05 on a first open, where its activity rank then refuses the first reply's
     nod for a full second. It resets on close, so every genuine re-open still gets its A05, once. */
  const greeted = useRef(false);
  const greetedThisOpen = useRef(false);
  const play = rig.play;
  useEffect(() => {
    if (!open) {
      greetedThisOpen.current = false;
      return;
    }
    if (greetedThisOpen.current) return;
    greetedThisOpen.current = true;
    /* The greeting cues are the contract's too, since the affect section of 19 September 2026 —
       the open is conversation state, and which cue it buys is a decision on file rather than a
       string in this component. */
    play(
      greeted.current
        ? affect.conversation.openAgain
        : affect.conversation.openFirst,
    );
    greeted.current = true;
  }, [open, play]);
  /* Closed is closed for the voice too. Every path that shuts this panel — the X, the backdrop,
     Escape — funnels through `open` going false, so the reply's reading stops with the panel
     rather than outliving it behind a dialog nobody can see. With the flag off the adapter has
     never spoken and this cancels nothing at all, which is the point of writing it here rather
     than at the close button: the one that gets missed is never the one somebody wired. */
  useEffect(() => {
    if (!open) voiceAdapter.cancel();
  }, [open, voiceAdapter.cancel]);
  /* The seam itself: the panel speaks pulse, the rig speaks cues, and this is the whole translation.
     Since the affect section of 19 September 2026 the cue is the contract's: each answer kind's face
     is written in assistant.json — deterministic from the kind, no model, the founder's decision —
     and `cueOf` reads it the way `pulseOf` reads the state. A turn with unread words wears the
     refusal's face whatever it matched, because the unread block in the same turn refused. The
     reducer arbitrates from here, not this file: once A16 holds, a later nod, smile or supportive
     pose is refused rather than allowed to relax an urgent face, and only Start again — the
     patient's own reset — rests it. */
  useEffect(() => {
    if (gatheredAt === null || !asked) return;
    play(cueOf(reply, turns[turns.length - 1].unread));
    /* And the reply's own words to the adapter, which reads the flag first: while
       voice.webSpeech is false this refuses before anything is reached for, and when the founder
       switches it on the words are already written on the screen beside the voice — the caption
       is the reply itself. Only the audience the founder gave a microphone is read aloud, the
       same entry that scopes the composer's button: the voice decisions have been about the
       patient's assistant, and a staff preview's words are on its screen already. */
    if (audience.voice)
      voiceAdapter.speak(spokenOf(turns[turns.length - 1], audienceId));
  }, [
    gatheredAt,
    asked,
    reply,
    turns,
    play,
    audience.voice,
    audienceId,
    voiceAdapter.speak,
  ]);
  useEffect(() => {
    if (!asked) return;
    latest.current?.scrollIntoView({
      block: "start",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [turns, asked, reduced]);

  const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const stops = [
      ...dialog.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = stops[0],
      last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const moved = (next: Turn[]) => {
    setTurns(next);
    setGatheredAt(performance.now());
  };
  const put = (question: Question) =>
    moved(choose(turns, question, visit, everRaised));
  const onVoiceTranscript = (text: string) => {
    setDraft((current) => (current ? `${current} ${text}`.trim() : text));
    field.current?.focus();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      field.current?.focus();
      return;
    }
    moved(sendWithGilbertEngine(turns, draft, visit, everRaised, audienceId));
    setDraft("");
  };
  /* Start again is the one action that rests the face: it is the patient saying the conversation is
     over, and it is the only thing that releases a cue A16 is holding. */
  const again = () => {
    moved(opening(audienceId));
    setRaised(false);
    setSent({});
    conversationRef.current = crypto.randomUUID();
    /* The face rests and the voice stops: Start again is the patient saying the conversation is
       over, and neither half of it may keep going after she has said so. */
    rig.rest();
    voiceAdapter.cancel();
  };
  const nurse = () => moved(handOver(turns, everRaised));
  const handTo = (turn: Turn) => {
    if (turn.reply.kind !== "handover") return;
    const result = handToQueue(queue, {
      conversationRef: conversationRef.current,
      summary: turn.reply.summary,
      actorRole: audienceId,
      subjectRef: SESSION_SUBJECT,
      now: new Date(),
    });
    if (result.refused) return;
    setQueue(result.value.queue);
    setSent({
      ...sent,
      [turn.id]: {
        handover: result.value.handover,
        sentNow: result.value.sentNow,
      },
    });
  };
  const chip = (question: Question) => (
    <button
      type="button"
      key={question.id}
      className={`as-ask${question.answer === "emergency" ? " urgent" : ""}`}
      onClick={() => put(question)}
    >
      {question.answer === "emergency" && (
        <Ambulance size={17} aria-hidden="true" />
      )}
      {question.asks}
    </button>
  );
  const sos = () => openModal?.("Emergency & urgent care");

  return (
    <dialog
      ref={dialog}
      id="assistant-panel"
      className="as-panel patient-surface"
      aria-labelledby="as-title"
      data-audience={audienceId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={() => {
        if (open && !dialog.current?.open) dismiss();
      }}
      onKeyDown={keepFocus}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="as-frame">
        <header className="as-head" data-asked={asked || undefined}>
          <div className="as-bar">
            <div className="as-titles">
              <h2 id="as-title">{identity.name}</h2>
              <p className="as-descriptor">{identity.descriptorLine}</p>
              {/* The simulated label is the contract's sentence for this audience, not a string
                  typed onto the layout: what it says and whether it is here at all are decisions
                  in the audiences section. */}
              {audience.simulated && (
                <p className="as-simulated">{audience.simulated}</p>
              )}
            </div>
            <div className="as-controls">
              <MotionPause className="as-pause" />
              <button
                ref={close}
                type="button"
                className="as-close"
                aria-label="Close GilbertOne"
                onClick={dismiss}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          {/* The character, and the readable state surface the tests key on: data-pulse is the reply's
         state, data-cue the cue that owns the face — absent when none does, because a cue that
         finishes holds nothing — data-affect what that face means, reversed from the contract's
         affect mapping so the attribute can never say warm while a held safety cue keeps the face
         flat, and data-motion whether it may move at all. The svg's size prop is nominal;
         assistant.css sizes the drawing at every width, as it sized the sphere. */}
          <div
            className="as-rig"
            data-pulse={pulse}
            data-cue={rig.running?.id}
            data-affect={postureOf(rig.running?.id)}
            data-motion={
              reduced ? "still" : decor.playing ? "running" : "paused"
            }
            aria-hidden="true"
          >
            <RigBoundary>
              <GilbertAvatar pose={rig.pose} size={172} blend={rig.blend} />
            </RigBoundary>
          </div>
          <div className="as-caption" data-pulse={pulse}>
            <p className="as-state" data-pulse={pulse}>
              {stateSpec(pulse).cue}
            </p>
            {stage.name && <p className="as-name">{stage.name}</p>}
            {stage.figure && (
              <p className="as-figure">
                {stage.figure}
                {stage.figureLabel && <span>{stage.figureLabel}</span>}
              </p>
            )}
          </div>
        </header>

        <div className="as-scroll">
          <NotConnected of="voice" />
          <div className="as-log" role="log" aria-label={conversation.logLabel}>
            <ol>
              {turns.map((turn, index) => (
                <li
                  key={turn.id}
                  className="as-turn"
                  ref={index === turns.length - 1 ? latest : undefined}
                >
                  {turn.asked && (
                    <p className="as-said">
                      <span className="as-sr">{conversation.youAsked}: </span>
                      {turn.asked}
                    </p>
                  )}
                  <div
                    className={`as-reply as-reply-${turn.reply.kind}`}
                    data-outcome={outcomeOf(turn)}
                    data-question={turn.matched?.id}
                    data-groups={
                      turn.groups.map((g) => g.id).join(" ") || undefined
                    }
                  >
                    <span className="as-who">{identity.name}</span>
                    <ReplyBody
                      reply={turn.reply}
                      audience={audienceId}
                      sos={sos}
                      handOver={nurse}
                      sent={sent[turn.id]}
                      onSend={() => handTo(turn)}
                    />
                    {turn.unread && (
                      <Unread
                        sos={sos}
                        handOver={nurse}
                        audience={audienceId}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="as-asks">
            {questionGroups.map((group) => {
              const offered = questionsFor(audienceId).filter(
                (q) => q.group === group.id,
              );
              /* A group with nothing to offer this audience is not drawn at all: an empty
                 heading over no chips says the assistant has a section it refuses to show. */
              if (!offered.length) return null;
              return (
                <section key={group.id} aria-labelledby={`as-${group.id}`}>
                  <h3 id={`as-${group.id}`}>{group.heading}</h3>
                  {group.lead && <p>{group.lead}</p>}
                  <div className="as-chips">{offered.map(chip)}</div>
                </section>
              );
            })}
            {asked && (
              <button type="button" className="as-again" onClick={again}>
                <RotateCcw size={16} aria-hidden="true" />
                {conversation.startAgainLabel}
              </button>
            )}
          </div>

          <section className="as-rule" aria-labelledby="as-refusals">
            <h3 id="as-refusals">{conversation.refusalsHeading}</h3>
            <ul>
              {refusals.map((r) => (
                <li key={r.id}>{refusalFor(r, audienceId).statement}</li>
              ))}
            </ul>
            <p className="as-powered">
              {identity.poweredBy}. {identity.poweredByMeans}
            </p>
          </section>
        </div>

        <form className="as-compose" onSubmit={submit}>
          <label htmlFor="as-input">{conversation.inputLabel}</label>
          <div className="as-field">
            <input
              ref={field}
              id="as-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={conversation.inputHint}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
              maxLength={500}
              aria-describedby="as-keyboard"
            />
            {/* The voice control exists only where the founder put it — the live patient
                assistant — and an audience's entry says whether that is this one. */}
            {audience.voice && (
              <AssistantVoiceButton
                voice={voiceAdapter}
                onTranscript={onVoiceTranscript}
                typingNote={conversation.webKeyboardNote}
              />
            )}
            <button type="submit" className="as-send">
              <Send size={17} aria-hidden="true" />
              {conversation.sendLabel}
            </button>
          </div>
          <p className="as-silence">{silenceIsNotSafety}</p>
        </form>
      </div>
    </dialog>
  );
}

function stageOf(
  reply: Reply,
  asked: boolean,
): { name: string; figure: string | null; figureLabel: string | null } {
  if (reply.kind === "situation") return reply.situation;
  if (reply.kind === "emergency") {
    const [ambulance] = lines(emergencyAnswer.numbers);
    return {
      name: ambulance.name,
      figure: ambulance.number,
      figureLabel: null,
    };
  }
  return {
    name: asked ? "" : identity.callToAction,
    figure: null,
    figureLabel: null,
  };
}

function Unread({
  sos,
  handOver,
  audience,
}: {
  sos: () => void;
  handOver: () => void;
  audience: AudienceId;
}) {
  /* The two buttons are the patient's doors out of a conversation, and an audience's entry says
     whether they exist here: the numbers always stay, the buttons only where they open something. */
  const { sos: allowSos, handover: allowHandover } =
    audienceOf(audience).actions;
  return (
    <div className="as-unread">
      <p className="as-headline">{answers.unread.sentence}</p>
      <p>{answers.unread.detail}</p>
      <p>{say(answers.unread.ifUrgent)}</p>
      <Lines ids={answers.unread.numbers} />
      {(allowHandover || allowSos) && (
        <div className="as-actions">
          {allowHandover && (
            <button type="button" className="as-go" onClick={handOver}>
              <UserRound size={17} aria-hidden="true" />
              {answers.unread.handoverLabel}
            </button>
          )}
          {allowSos && (
            <button type="button" className="as-ask urgent" onClick={sos}>
              <Ambulance size={17} aria-hidden="true" />
              {answers.unread.sosLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Lines({ ids }: { ids: string[] }) {
  return (
    <ul className="as-numbers">
      {lines(ids).map((n) => (
        <li key={n.number}>
          <strong>{n.number}</strong>
          <span>{n.name}</span>
        </li>
      ))}
    </ul>
  );
}

type ReplyProps = {
  reply: Reply;
  audience: AudienceId;
  sos: () => void;
  handOver: () => void;
  sent?: Sent;
  onSend: () => void;
};

function ReplyBody({
  reply,
  audience,
  sos,
  handOver,
  sent,
  onSend,
}: ReplyProps) {
  const { sos: allowSos, handover: allowHandover } =
    audienceOf(audience).actions;
  switch (reply.kind) {
    case "situation":
      return <p>{reply.situation.sentence}</p>;
    case "identity":
      return (
        <>
          <p>{identity.whatItIs}</p>
          <p>{identity.whatItIsNot}</p>
        </>
      );
    case "voice":
      return (
        <>
          <p>{voice.sentences.web}</p>
          <p>{refusal("no-audio-kept").statement}</p>
        </>
      );
    case "emergency":
      return (
        <>
          {reply.groups.length > 0 && (
            <div className="as-noticed">
              <p>{emergencyAnswer.noticed}</p>
              <ul>
                {reply.groups.map((g) => (
                  <li key={g.id}>{g.name}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="as-headline">{emergencyAnswer.headline}</p>
          <p>{emergencyAnswer.lead}</p>
          <Lines ids={emergencyAnswer.numbers} />
          <p className="as-quiet">{emergencyAnswer.notAnAmbulance}</p>
          {allowSos && (
            <button type="button" className="as-go" onClick={sos}>
              <Ambulance size={17} aria-hidden="true" />
              {emergencyAnswer.sosLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </>
      );
    case "unmatched":
      return (
        <>
          <p className="as-headline">{answers.unmatched.sentence}</p>
          <p>{unmatchedDetail(audience)}</p>
          <p>{say(answers.unmatched.ifUrgent)}</p>
          <Lines ids={answers.unmatched.numbers} />
          {(allowHandover || allowSos) && (
            <div className="as-actions">
              {allowHandover && (
                <button type="button" className="as-go" onClick={handOver}>
                  <UserRound size={17} aria-hidden="true" />
                  {answers.unmatched.handoverLabel}
                </button>
              )}
              {allowSos && (
                <button type="button" className="as-ask urgent" onClick={sos}>
                  <Ambulance size={17} aria-hidden="true" />
                  {answers.unmatched.sosLabel}
                </button>
              )}
            </div>
          )}
        </>
      );
    case "handover": {
      const h = answers.handover;
      const desk = reply.desk;
      return (
        <>
          <p className="as-headline">{h.title}</p>
          {desk.outOfHours && (
            <div className="as-desk" role="status">
              <p className="as-desk-nobody">{desk.outOfHours.nobody}</p>
              <p className="as-desk-numbers">{desk.outOfHours.numbers}</p>
              {desk.outOfHours.callback && (
                <p className="as-desk-callback">{desk.outOfHours.callback}</p>
              )}
            </div>
          )}
          <p>{h.lead}</p>
          <dl className="as-summary">
            {reply.rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="as-answered-by">
            <strong>{bookingHandover.answeredByLabel}</strong> {desk.answeredBy}
          </p>
          {reply.summary.urgencyCode === "emergency" && (
            <p className="as-lowered">{h.neverLowered}</p>
          )}
          <div className="as-notcarried">
            <p className="as-subhead">{h.notCarriedHeading}</p>
            <ul>
              {h.notCarried.map((item) => (
                <li key={item.id}>{item.sentence}</li>
              ))}
            </ul>
          </div>
          {sent ? (
            <div className="as-sent" role="status">
              <p className="as-headline">
                {sent.sentNow ? h.sentTitle : h.alreadySent}
              </p>
              {sent.sentNow && <p>{h.sent}</p>}
              <dl className="as-summary">
                <div>
                  <dt>{h.sentReference}</dt>
                  <dd className="as-ref">{sent.handover.handoverRef}</dd>
                </div>
              </dl>
              <p>{h.stillUrgent}</p>
              <Lines ids={h.numbers} />
            </div>
          ) : (
            <>
              <p className="as-notsent">{h.notSent}</p>
              <button
                type="button"
                className="as-go as-handto"
                onClick={onSend}
              >
                <Send size={17} aria-hidden="true" />
                {h.sendLabel}
              </button>
            </>
          )}
        </>
      );
    }
  }
}
