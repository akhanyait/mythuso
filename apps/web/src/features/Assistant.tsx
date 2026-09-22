import {
  patientQuestions,
  patientQuestionFor,
  choosePatientHelp,
} from "../lib/assistant-help";
import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import {
  Component,
  lazy,
  Suspense,
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
  CalendarDays,
  FileText,
  MessageCircle,
  Users,
  ShieldCheck,
  Minus,
  ArrowRight,
  Ban,
  Cog,
  Lock,
  RotateCcw,
  Send,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { NotConnected } from "../components/NotConnected";
import { MotionPause } from "../components/MotionPause";
import { AssistantAttachments } from "../components/AssistantAttachments";
import { AssistantVoiceButton } from "../components/AssistantVoiceButton";
import { GilbertAvatar, GilbertStill, useGilbertRig } from "./GilbertAvatar";
import {
  affect,
  answers,
  audienceOf,
  choose,
  consent,
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
import {
  refineWithAssistantService,
  sendWithGilbertEngine,
} from "../lib/gilbertone-bridge";
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

/* The connected-capability region arrives on its own dynamic import, so the status, retrieval,
   triage and handover routes it consumes — and the code that renders them — are a separate chunk of
   the already-lazy panel and never part of the patient entry. It is fetched the first time the
   panel renders it (once consented and asked), and a failure to download it degrades to nothing
   rather than to the panel around it: the transcript, the emergency numbers and the refusals are
   the product, and they do not depend on a service region that may not arrive. */
const GilbertOneServices = lazy(() => import("./GilbertOneServices"));

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

const QUESTION_ICONS: Record<string, typeof Ambulance> = {
  book: CalendarDays,
  results: FileText,
  records: FileText,
  contact: Users,
  help: MessageCircle,
  privacy: Lock,
  visit: MessageCircle,
  result: FileText,
  settled: CalendarDays,
  credential: Users,
  identity: ShieldCheck,
  voice: Lock,
  nurse: UserRound,
  emergency: Ambulance,
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
  const [pendingReplies, setPendingReplies] = useState<Set<number>>(
    () => new Set(),
  );
  const [gatheredAt, setGatheredAt] = useState<number | null>(null);
  const [raised, setRaised] = useState(false);
  const [queue, setQueue] = useState<Queue>(emptyQueue);
  const [sent, setSent] = useState<Record<number, Sent>>({});
  /* The consent gate, since 20 September 2026. The patient meets it before her first interaction;
     a staff preview opens straight onto its own conversation, because its scope is the contract's
     audiences section rather than a welcome. The answer lives in this component's own state and
     nowhere else — apps/web/src may not reach for browser storage, the build refuses those APIs
     here — and the panel stays mounted once opened, so consenting survives closing and re-opening
     within a page's life and resets on reload. That is the honest equivalent of the per-session
     browser storage the mockup asked for, and the deviation is reported rather than hidden. The
     two boxes are separate state so that Accept's disabled state is a truth about what was ticked.

     `gated` is the same decision named once rather than twice, because since 21 September 2026 a
     second thing depends on it: the conversation repeats the gate's prohibitions only for an
     audience that never saw the gate. Whether this audience is shown the gate and whether it has
     read the prohibitions are the same fact, and writing it twice is how they come apart. */
  const gated = audienceId === "patient";
  const [consented, setConsented] = useState(!gated);
  const [doctorBox, setDoctorBox] = useState(false);
  const [emergencyBox, setEmergencyBox] = useState(false);
  const conversationRef = useRef(crypto.randomUUID());
  /* Guards the panel's one asynchronous refinement: a counter, bumped on every submit, so a
     service answer that arrives after the conversation has moved on — a second message, a chosen
     question, a Start again — is discarded rather than painted over the newer turn. */
  const refine = useRef(0);
  const reduced = useReducedMotion();
  /* The panel's own Pause motion control (MotionPause, in the bar) and this hook read the same
     module-level store in lib/motion.ts, so the one press that stills the page stills the character
     too — and a cue that holds keeps its face through the pause, which is the reducer's settle. */
  const decor = useDecor();
  const rig = useGilbertRig({ reduced, paused: !decor.playing });
  /* The panel's one voice adapter, since the speech decision of 19 September 2026 and speaking for
     real since the founder switched voice.webSpeech on the next day. The composer's microphone and
     the reply's reading are the two halves of one conversation, and one adapter means one
     microphone rule, one everSpoke and one close-on-unmount rather than two controls each holding
     half of it. lib/voice.ts still reads the flag before anything is reached for, so switching it
     off again leaves this wiring inert; the microphone half is the 18 September decision, unchanged. */
  const voiceAdapter = useVoiceAdapter("assistant");
  const lastTurn = turns[turns.length - 1];
  const reply = lastTurn.reply;
  const waitingForReply = pendingReplies.has(lastTurn.id);
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
     rather than outliving it behind a dialog nobody can see. Spoken replies are live now, so this
     is the guard that actually has something to cancel, and it is written here rather than at the
     close button because the one that gets missed is never the one somebody wired. */
  useEffect(() => {
    if (!open) voiceAdapter.cancel();
  }, [open, voiceAdapter.cancel]);
  /* The microphone half's pose, from the adapter's own state rather than from the button or the
     recogniser callbacks, so the face attends to a microphone that is genuinely open and to no
     other moment: A07's trigger is capture actually beginning. Nothing is dispatched on the way
     back down — the cue is a one-shot that releases itself — and nothing here may call rest()
     while a conversation is up, because a rest would drop a safety face the reducer is holding. */
  useEffect(() => {
    if (voiceAdapter.state === "open") play(affect.voiceMoments.capture.cue);
  }, [voiceAdapter.state, play]);
  /* The seam itself: the panel speaks pulse, the rig speaks cues, and this is the whole translation.
     Since the affect section of 19 September 2026 the cue is the contract's: each answer kind's face
     is written in assistant.json — deterministic from the kind, no model, the founder's decision —
     and `cueOf` reads it the way `pulseOf` reads the state. A turn with unread words wears the
     refusal's face whatever it matched, because the unread block in the same turn refused. The
     reducer arbitrates from here, not this file: once A16 holds, a later nod, smile or supportive
     pose is refused rather than allowed to relax an urgent face, and only Start again — the
     patient's own reset — rests it. */
  useEffect(() => {
    if (gatheredAt === null || !asked || !open || waitingForReply) return;
    const last = lastTurn;
    play(cueOf(reply, last.unread));
    /* And the reply's own words to the adapter, which reads the flag before anything is reached
       for. The words are already written on the screen beside the voice — the caption is the reply
       itself — and the mouth is the contract's A10, fired from the utterance's own events rather
       than from this call: its start event, each word boundary against that word, and its end
       closing the mouth. A timer never moves it here, and a held safety face refuses it outright.
       Only the audience the founder gave a microphone is read aloud, the same entry that scopes
       the composer's button: the voice decisions have been about the patient's assistant, and a
       staff preview's words are on its screen already. */
    if (audience.voice) {
      const caption = spokenOf(last, audienceId).split(" ");
      /* A mouth closes only where one opened. The adapter reports the reading over on end, on
         cancel and on failure alike — §07's own rule, and the sentence the demo's caption needs —
         so this reading's close is the mouth closing against the start event that opened it. A
         reading replaced, barged over or shut down before its first word never showed a mouth,
         and one must not be conjured only to be closed: the empty caption track would take the
         face for its step and hold it over whatever the reply — a handover, a greeting on the way
         back in — was owed instead. */
      let opened = false;
      voiceAdapter.speak(spokenOf(last, audienceId), {
        onStart: () => {
          opened = true;
          play(affect.voiceMoments.speaking.cue, { caption });
        },
        onWord: (word) =>
          play(affect.voiceMoments.speaking.cue, { caption: [word] }),
        onEnd: () => {
          if (opened) play(affect.voiceMoments.speaking.cue, { caption: [] });
        },
      });
    }
  }, [
    gatheredAt,
    asked,
    reply,
    lastTurn,
    waitingForReply,
    open,
    play,
    audience.voice,
    audienceId,
    voiceAdapter.speak,
  ]);
  useEffect(() => {
    if (!asked) return;
    /* Scroll only the transcript. scrollIntoView can also move the dialog itself, taking
       the close control and emergency number out of view when an answer is taller than it. */
    const entry = latest.current;
    const viewport = entry?.closest<HTMLElement>(".as-scroll");
    if (entry && viewport)
      viewport.scrollTo({
        top:
          viewport.scrollTop +
          entry.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top,
        behavior: reduced ? "auto" : "smooth",
      });
  }, [turns, asked, reduced]);

  const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    /* The stops are what a Tab can actually reach: a disabled control is not a stop, and a list
       that counts one puts its last entry somewhere focus can never stand — the wrap below then
       never fires and Tab walks out of the modal into the browser's own chrome. The consent gate's
       Accept is disabled until both boxes are ticked, and on 20 September 2026 that was exactly
       the escape: focus left the panel on the fifth Tab. */
    const stops = [
      ...dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.getClientRects().length > 0);
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
    const help =
      audienceId === "patient" ? patientQuestionFor(draft) : undefined;
    if (help) {
      moved(choosePatientHelp(turns, help, draft));
      setDraft("");
      return;
    }
    /* Only an unmatched fallback waits for the service. Emergencies, refusals attached to
       matched answers and approved answers remain immediate. Each request replaces only its
       own turn, so a slow answer cannot overwrite a newer question or a reset conversation. */
    const local = sendWithGilbertEngine(
      turns,
      draft,
      visit,
      everRaised,
      audienceId,
    );
    const candidate = local[local.length - 1];
    const text = draft;
    moved(local);
    setDraft("");
    if (candidate.reply.kind !== "unmatched") return;
    voiceAdapter.cancel();
    setPendingReplies((current) => new Set(current).add(candidate.id));
    const generation = refine.current;
    void refineWithAssistantService(
      local,
      text,
      audienceId,
      conversationRef.current,
    ).then((refined) => {
      if (refine.current !== generation) return;
      const answer = refined?.[refined.length - 1] ?? candidate;
      setTurns((current) =>
        current.includes(candidate)
          ? current.map((turn) => (turn === candidate ? answer : turn))
          : current,
      );
      setPendingReplies((current) => {
        const next = new Set(current);
        next.delete(candidate.id);
        return next;
      });
    });
  };
  /* Start again is the one action that rests the face: it is the patient saying the conversation is
     over, and it is the only thing that releases a cue A16 is holding. */
  const again = () => {
    ++refine.current;
    setPendingReplies(new Set());
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
  const chip = (question: Question) => {
    const Icon = QUESTION_ICONS[question.id] ?? MessageCircle;
    return (
      <button
        type="button"
        key={question.id}
        className={`as-ask${question.answer === "emergency" ? " urgent" : ""}`}
        onClick={() => put(question)}
      >
        <span className="as-question-icon">
          <Icon size={23} aria-hidden="true" />
        </span>
        <span>{question.asks}</span>
      </button>
    );
  };
  const sos = () => openModal?.("Emergency & urgent care");

  const portrait = (
    <div
      className="as-rig"
      data-pulse={pulse}
      data-cue={rig.running?.id}
      data-affect={postureOf(rig.running?.id)}
      data-motion={reduced ? "still" : decor.playing ? "running" : "paused"}
      aria-hidden="true"
    >
      <RigBoundary>
        <GilbertAvatar
          pose={rig.pose}
          size={172}
          blend={rig.blend}
          friendly={!asked}
        />
      </RigBoundary>
    </div>
  );

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
        <header
          className="as-head"
          data-asked={asked || undefined}
          data-gate={!consented || undefined}
        >
          <div className="as-bar">
            <div className="as-titles">
              <img
                className="as-logo as-brand"
                src="/brand/mythuso-logo.svg"
                alt="MyThuso"
              />
              <h2 id="as-title" className="as-sr">
                {identity.name}
              </h2>
              {(!consented || asked) && (
                <p className="as-descriptor">{identity.descriptorLine}</p>
              )}
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
                type="button"
                className="as-close as-minimise"
                aria-label={ui.minimiseLabel}
                onClick={dismiss}
              >
                <Minus size={20} aria-hidden="true" />
              </button>
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
          {(!consented || asked) && portrait}
          {/* The state caption belongs to a conversation. Over the gate it is left out: there is
              nothing yet for "Ready" to be about, and the gate's own words are the consent section's. */}
          {consented && asked && (
            <div className="as-caption" data-pulse={pulse}>
              <p className="as-state" data-pulse={pulse}>
                {stateSpec(pulse).cue}
              </p>
              {asked && stage.name && <p className="as-name">{stage.name}</p>}
              {stage.figure && (
                <p className="as-figure">
                  {stage.figure}
                  {stage.figureLabel && <span>{stage.figureLabel}</span>}
                </p>
              )}
            </div>
          )}
        </header>

        {consented ? (
          <div className="as-scroll" data-welcome={!asked || undefined}>
            {!asked && (
              <section className="as-welcome-hero" aria-label={identity.name}>
                {portrait}
                <div className="as-hero-copy">
                  <p className="as-hello">{ui.hello}</p>
                  <p className="as-wordmark">
                    {identity.name.split(/(i)/).map((part, index) =>
                      part === "i" ? (
                        <span className="as-wordmark-i" key={index}>
                          {part}
                        </span>
                      ) : (
                        part
                      ),
                    )}
                  </p>
                  <p className="as-hero-descriptor">
                    {identity.descriptorLine}
                  </p>
                  <p className="as-state" data-pulse={pulse}>
                    {stateSpec(pulse).cue}
                  </p>
                </div>
              </section>
            )}
            <div
              className="as-log"
              data-welcome={(!asked && gated) || undefined}
              role="log"
              aria-label={conversation.logLabel}
            >
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
                      className={`as-reply as-reply-${pendingReplies.has(turn.id) ? "pending" : turn.reply.kind}`}
                      aria-busy={pendingReplies.has(turn.id)}
                      data-outcome={
                        pendingReplies.has(turn.id)
                          ? undefined
                          : outcomeOf(turn)
                      }
                      data-question={turn.matched?.id}
                      data-groups={
                        turn.groups.map((g) => g.id).join(" ") || undefined
                      }
                    >
                      <span className="as-who">{identity.name}</span>
                      {pendingReplies.has(turn.id) ? (
                        <p className="as-pending" role="status">
                          {ui.replyPending}
                        </p>
                      ) : !asked && audienceId === "patient" ? (
                        <p>{ui.welcome}</p>
                      ) : (
                        <ReplyBody
                          reply={turn.reply}
                          audience={audienceId}
                          sos={sos}
                          handOver={nurse}
                          sent={sent[turn.id]}
                          onSend={() => handTo(turn)}
                        />
                      )}
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
                if (audienceId === "patient") {
                  const help = patientQuestions.filter(
                    (q) => q.group === group.id,
                  );
                  return (
                    <section key={group.id} aria-labelledby={`as-${group.id}`}>
                      <h3 id={`as-${group.id}`}>
                        {group.id === "situations"
                          ? ui.topicsHeading
                          : ui.moreHeading}
                      </h3>
                      {group.id === "situations" && <p>{ui.topicsLead}</p>}
                      <div className="as-chips">
                        {help.map((q) => {
                          const Icon = QUESTION_ICONS[q.id];
                          return (
                            <button
                              type="button"
                              className="as-ask"
                              key={q.id}
                              onClick={() => {
                                moved(choosePatientHelp(turns, q));
                              }}
                            >
                              <span className="as-question-icon">
                                <Icon size={23} aria-hidden="true" />
                              </span>
                              <span>{q.asks}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                }
                const offered = questionsFor(audienceId)
                  .filter((q) => q.group === group.id)
                  .sort(
                    (a, b) =>
                      ui.questionOrder.indexOf(a.id) -
                      ui.questionOrder.indexOf(b.id),
                  );
                /* A group with nothing to offer this audience is not drawn at all: an empty
                   heading over no chips says the assistant has a section it refuses to show. */
                if (!offered.length) return null;
                return (
                  <section key={group.id} aria-labelledby={`as-${group.id}`}>
                    <h3 id={`as-${group.id}`}>
                      {group.id === "situations"
                        ? ui.topicsHeading
                        : ui.moreHeading}
                    </h3>
                    {group.lead && (
                      <p>
                        {group.id === "situations" ? ui.topicsLead : group.lead}
                      </p>
                    )}
                    <div className="as-chips">{offered.map(chip)}</div>
                  </section>
                );
              })}
            </div>
            {asked && (
              <button type="button" className="as-again" onClick={again}>
                <RotateCcw size={16} aria-hidden="true" />
                {conversation.startAgainLabel}
              </button>
            )}

            {/* The connected-capability region, only once there is a conversation to be about and the
                person has consented. It carries the service's own status, the sources an answer may
                stand on, the guided-assessment offer and the clinician-handover preparation — each
                connected or saying why it is not, in the contract's own words. The session id is this
                conversation's, so the region and the bridge's turn refinement speak of one session. */}
            {asked && (
              <Suspense fallback={null}>
                <GilbertOneServices
                  sessionId={conversationRef.current}
                  audience={audienceId}
                  consented={consented}
                  lastAsked={lastTurn.asked}
                  lastReplyKind={reply.kind}
                />
              </Suspense>
            )}

            <details className="as-voice-details">
              <summary>{ui.voiceDetails}</summary>
              <NotConnected of="voice" />
              {!asked && (
                <p className="as-foot-powered">{identity.poweredBy}</p>
              )}
            </details>

            {/* Said once to whoever is reading — the decision of 21 September 2026. This block used
                to be drawn for every audience, including the patient, who had just read the same nine
                prohibitions on the gate, the same silence sentence its last prohibition makes and
                the same ThusoIQ paragraph in longer words, and had ticked two boxes to get past
                all of it. She then met most of it again, sitting between her answers and the box
                she types in. So the patient reads it on the gate and nowhere else; the half of the
                silence sentence that carries the numbers is the composer's own strip below, which
                stays on the screen the whole conversation.

                An audience with no gate still reads it here, and that is the whole reason this
                block survives: `consented` opens true for every audience but the patient, so a
                nurse's preview never meets the consent screen, and these are the only words on her
                screen that say what GilbertOne will not do. They are also her own — refusalFor
                answers in the audience's words, and a nurse asking whether a rash is meningitis is
                refused differently from a patient asking what she has. */}
            {!gated && (
              <section className="as-rule" aria-labelledby="as-refusals">
                <h3 id="as-refusals">{conversation.refusalsHeading}</h3>
                <ul>
                  {refusals.map((r) => (
                    <li key={r.id}>{refusalFor(r, audienceId).statement}</li>
                  ))}
                </ul>
                <p className="as-safety">{silenceIsNotSafety}</p>
                <p className="as-powered">
                  {identity.poweredBy}. {identity.poweredByMeans}
                </p>
              </section>
            )}

            {/* Keep the credit quiet; the acknowledgment explains what powers the answers. */}
            {asked && (
              <footer className="as-foot">
                <p className="as-foot-powered">{identity.poweredBy}</p>
              </footer>
            )}
          </div>
        ) : (
          <div className="as-scroll as-gate">
            <div className="as-gate-intro">
              <h3>{consent.heading}</h3>
              <p>{ui.disclaimerIntro}</p>
              <p className="as-gate-emergency">
                {say(consent.emergencyNotice)}
              </p>
            </div>
            <section className="as-gate-card">
              <div className="as-gate-card-head">
                <span className="as-gate-icon">
                  <Lock size={18} aria-hidden="true" />
                </span>
                <h3>{consent.privacyHeading}</h3>
              </div>
              <p>{consent.privacyBody}</p>
            </section>
            <section className="as-gate-card">
              <div className="as-gate-card-head">
                <span className="as-gate-icon">
                  <Ban size={18} aria-hidden="true" />
                </span>
                <h3>{consent.willNotDoHeading}</h3>
              </div>
              <ul className="as-gate-list">
                {consent.willNotDo.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            <section className="as-gate-card">
              <div className="as-gate-card-head">
                <span className="as-gate-icon">
                  <Cog size={18} aria-hidden="true" />
                </span>
                <h3>{consent.poweredByHeading}</h3>
              </div>
              <p>{consent.poweredByBody}</p>
            </section>
            {/* The service disclosures, since the integration of 22 September 2026: where the voice is
                processed, where answers come from, and what an assessment and a handover will and will
                not do. They are the web catalogue's own words — web-only copy, not the frozen
                three-platform consent contract — because the microphone, the knowledge federation and
                the gated triage and handover routes are this panel's, and the native apps do not carry
                them. Each is a disclosure, not a tick-box: the moment-of-use consent for the microphone
                and for a handover is asked again by the control that uses it, and the guided assessment
                is refused outright until a ratified protocol exists. */}
            {ui.service.consent.map((entry) => (
              <section className="as-gate-card" key={entry.id}>
                <div className="as-gate-card-head">
                  <span className="as-gate-icon">
                    <ShieldCheck size={18} aria-hidden="true" />
                  </span>
                  <h3>{entry.heading}</h3>
                </div>
                <p>{entry.body}</p>
              </section>
            ))}
          </div>
        )}

        {consented ? (
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
                  assistant — and an audience's entry says whether that is this one. Its second
                  line, "Speech becomes text before sending.", rides inside the control under
                  the written action: the sentence is about the button it sits on. */}
              {audience.voice && (
                <AssistantVoiceButton
                  voice={voiceAdapter}
                  onTranscript={onVoiceTranscript}
                  typingNote={conversation.webKeyboardNote}
                  pending={waitingForReply}
                  onTypeInstead={() => field.current?.focus()}
                />
              )}
              <AssistantAttachments />
              <button
                type="submit"
                className="as-send"
                aria-label={conversation.sendLabel}
                title={conversation.sendLabel}
              >
                <Send size={17} aria-hidden="true" />
              </button>
            </div>
            {/* The mockup's warning strip, in the contract's own words. It carries what the
                loose silence line carried — nobody is safe because nobody answered — in the
                shape the mockup gives it, and both numbers still arrive through the same
                token resolver every other sentence uses. */}
            <p className="as-silence">
              <TriangleAlert size={15} aria-hidden="true" />
              {say(consent.emergencyNotice)}
            </p>
          </form>
        ) : (
          <div className="as-gate-foot">
            <div className="as-gate-boxes">
              <label className="as-gate-check">
                <input
                  type="checkbox"
                  checked={doctorBox}
                  onChange={(event) => setDoctorBox(event.target.checked)}
                />
                <span>{consent.checkboxDoctor}</span>
              </label>
              <label className="as-gate-check">
                <input
                  type="checkbox"
                  checked={emergencyBox}
                  onChange={(event) => setEmergencyBox(event.target.checked)}
                />
                <span>{consent.checkboxEmergency}</span>
              </label>
            </div>
            {/* Accept opens only when both boxes are ticked, and Cancel is the same dismiss the
                cross, the backdrop and Escape use — the gate has no fourth way out. */}
            <div className="as-gate-actions">
              <button
                type="button"
                className="as-gate-cancel"
                onClick={dismiss}
              >
                {consent.cancel}
              </button>
              <button
                type="button"
                className="as-gate-accept"
                disabled={!doctorBox || !emergencyBox}
                onClick={() => {
                  setConsented(true);
                  requestAnimationFrame(() => field.current?.focus());
                }}
              >
                {consent.accept}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
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
    /* A hello is an answer now rather than a shrug: the classifier in the engine names it, the
       bridge answers it, and this is the contract's sentence it wears. */
    case "greeting":
      return <p>{answers.greeting.sentence}</p>;
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
    case "service":
      /* A sentence a language model wrote, drawn under the heading that says so — the same
         order spokenOf reads aloud, so the voice and the screen cannot tell two stories. The
         model's own words are painted pre-wrap (`.as-service`): a model writes paragraphs, and
         this panel does not join them into one. The disclosure and the urgency line are read
         from the contract like every other sentence here, and the two doors are the ones the
         unmatched answer already offers, scoped by the audience's own entry. */
      return (
        <>
          <p className="as-headline">{answers.service.heading}</p>
          <p className="as-service">{reply.text}</p>
          <p className="as-quiet">{answers.service.disclosure}</p>
          <p>{say(answers.service.ifUrgent)}</p>
          <Lines ids={answers.service.numbers} />
          {(allowHandover || allowSos) && (
            <div className="as-actions">
              {allowHandover && (
                <button type="button" className="as-go" onClick={handOver}>
                  <UserRound size={17} aria-hidden="true" />
                  {answers.service.handoverLabel}
                </button>
              )}
              {allowSos && (
                <button type="button" className="as-ask urgent" onClick={sos}>
                  <Ambulance size={17} aria-hidden="true" />
                  {answers.service.sosLabel}
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
