import {
  patientQuestions,
  patientQuestionFor,
  choosePatientHelp,
} from "../lib/assistant-help";
import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import records from "../../../../packages/catalog/records.json";
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
  Activity,
  Ambulance,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Camera,
  ClipboardList,
  Pill,
  FileText,
  MessageCircle,
  NotebookPen,
  Phone,
  Users,
  ShieldCheck,
  ArrowRight,
  Minus,
  Lock,
  RotateCcw,
  Send,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { NotConnected } from "../components/NotConnected";
import { MotionPause } from "../components/MotionPause";
import {
  GilbertAvatar,
  GilbertStill,
  growFrom,
  useGilbertRig,
} from "./GilbertAvatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { IconButton } from "../ui/IconButton";
import { crisisLines, showsCrisisLines } from "../lib/crisis-lines";
import { referencesUsedFor } from "../lib/gilbertone-reference-scout";
import { latestCaseFor, useCases } from "../lib/case";
import { sendOnEnter, useGrowingField } from "../lib/composer";
import {
  affect,
  answers,
  audienceOf,
  choose,
  consent,
  caseScreens,
  caseView,
  continueIntake,
  conversation,
  cueOf,
  hasPathway,
  intakeReview,
  intakeWords,
  notesText,
  patientReadingSources,
  readingLine,
  readingMarks,
  SESSION_SUBJECT,
  whoHas,
  emergencyAnswer,
  emergencyIn,
  handOver,
  identity,
  lines,
  isOpeningStatus,
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
  spokenLanguageOf,
  spokenOf,
  stateSpec,
  unmatchedDetail,
  voiceClassOf,
  voice,
  type AudienceId,
  type Question,
  type Reply,
  type Turn,
} from "../lib/assistant";
import {
  emergencyTurn,
  handoverDeskWords as bookingHandover,
  refusal,
} from "../lib/assistant";
import { skinCheckChip } from "../lib/skin-check.generated";
import {
  refineWithAssistantService,
  sendWithGilbertEngine,
} from "../lib/gilbertone-bridge";
import { acknowledgePatient, patientAcknowledged } from "../lib/gilbertone-acknowledgement";
import { guidanceFromRecord, prefersLocalConversation, signedInPatientContext } from "../lib/patient-context";
import {
  emptyQueue,
  handOver as handToQueue,
  type Handover,
  type Queue,
} from "../../../../packages/engines/src/access/domain/handover.ts";
import { useDecor, useReducedMotion } from "../lib/motion";
import type { Visit } from "../lib/scheduling";
import { disclosureFor, useVoiceAdapter } from "../lib/voice";
import "./assistant.css";
import "./gilbertone-theme.css";
import "./assistant-motion.css";
import "./gilbertone-experience.css";
import {
  BeforeWeStart,
  DESIGN_CHIPS,
  GilbertMark,
  Opening,
  PrivacyNote,
  QuietChips,
  QuietMenu,
} from "./gilbert-quiet";
import { CallScreen, useGilbertCall } from "../components/AssistantVoiceButton";

/* The connected-capability region arrives on its own dynamic import, so the status, retrieval,
   triage and handover routes it consumes — and the code that renders them — are a separate chunk of
   the already-lazy panel and never part of the patient entry. It is fetched the first time the
   panel renders it (once consented and asked), and a failure to download it degrades to nothing
   rather than to the panel around it: the transcript, the emergency numbers and the refusals are
   the product, and they do not depend on a service region that may not arrive. */
const GilbertOneServices = lazy(() => import("./GilbertOneServices"));

/* The first tab's capability list shares the region's chunk: it names the same six capabilities the
   conversation region acts on, so it arrives on the same dynamic import and adds nothing further to
   the patient entry. It is drawn on the welcome surface only, before a conversation has begun, and a
   failure to download it degrades to nothing rather than to the welcome around it. */
const GilbertOneCapabilities = lazy(() =>
  import("./GilbertOneServices").then((m) => ({
    default: m.GilbertOneCapabilities,
  })),
);

/* Show GilbertOne a rash (1 October 2026) arrives on its own dynamic import too: the screen, its
   contract and the knowledge entries it shows are fetched the first time a patient presses its chip,
   and never by a panel that is only asked questions. The chip's label is the one thing the panel
   carries, from a file generated out of the contract. */
const SkinCheck = lazy(() => import("./SkinCheck"));

/* The consent gate's emergency sentence with its numbers as tap-to-call links — the founder-approved
   improvement of 23 September 2026. The numbers are the contract's, read from sos.json by id through
   lines() and never typed here, and the sentence stays consent.emergencyNotice: it is split on its own
   {ambulance} and {mobile} placeholders so the words around the links are the catalog's, and only the
   two numbers become tel: anchors a thumb can press. */
function EmergencyLinks() {
  const [ambulance] = lines(["ambulance"]);
  const [mobile] = lines(["mobile"]);
  return (
    <>
      {consent.emergencyNotice
        .split(/(\{ambulance\}|\{mobile\})/)
        .map((part, index) => {
          if (part === "{ambulance}")
            return (
              <a
                key={index}
                className="as-tel"
                href={`tel:${ambulance.number}`}
              >
                {ambulance.number}
              </a>
            );
          if (part === "{mobile}")
            return (
              <a key={index} className="as-tel" href={`tel:${mobile.number}`}>
                {mobile.number}
              </a>
            );
          return part;
        })}
    </>
  );
}

/* The launcher becomes the panel — the founder's brief of 28 September 2026: the sheet grows out of
   the robot that was pressed (growFrom, in GilbertAvatar.tsx) and the CSS close in assistant-motion.css shrinks it
   back into him. */
const growFromLauncher = (sheet: HTMLElement, still: boolean) =>
  growFrom(
    document.querySelector('[aria-controls="assistant-panel"]'),
    sheet,
    still,
  );

/* A measure's unit, from records.json's observations — the reading card sets it small beside her own
   number. The measure names the entries it explains; the first one's unit is the measure's (blood
   pressure's two are both mmHg). */
const unitOf = (entryId: string | undefined) =>
  records.observations.measures.find((m) => m.id === entryId)?.unit ?? null;

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
  /* Patient pages that already exist. Absent on a staff preview, so a chip sends its words. */
  navigate?: (page: string) => void;
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
  reading: Activity,
  preparation: ClipboardList,
  medicines: Pill,
  intake: NotebookPen,
  "case-plan": FileText,
};

type Sent = { handover: Handover; sentNow: boolean };

/* The panel's own view of a turn: a Turn plus the two facts the bridge attaches to a model answer —
   the language the service answered in and whether this reply wears the session's one answers.service
   disclosure. Both optional, so every plain Turn the contract's own answers produce is one of these
   too, and the panel reads them back only where a model reply can carry them. */
type PanelTurn = Turn & {
  readonly detectedLanguage?: string;
  readonly disclosure?: boolean;
};

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
  navigate,
}: PanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const latest = useRef<HTMLLIElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  /* The transcript's own scroller, and whether the latest answer is out of view in it — above, while
     she reads an older answer, or below, among the chips (30 September 2026, the handoff's scroll
     button). The way back is drawn only then: a control that takes you where you already are does
     nothing. */
  const scroller = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState<"up" | "down" | null>(null);
  const measure = () => {
    const box = scroller.current?.getBoundingClientRect();
    const last = latest.current?.getBoundingClientRect();
    setAway(
      !box || !last
        ? null
        : last.bottom < box.top + 24
          ? "up"
          : last.top > box.bottom - 24
            ? "down"
            : null,
    );
  };
  /* The audience's own entry: its simulated label, its voice flag, its two action buttons and
     what it opens with are the contract's, never this component's defaults. */
  const audience = audienceOf(audienceId);
  const [turns, setTurns] = useState<PanelTurn[]>(() => opening(audienceId));
  /* The case card and the plan chip follow the store: a nurse taking the case or a doctor signing it,
     in another role in this same tab, changes what the patient's card says. */
  useCases();
  const [draft, setDraft] = useState("");
  const [pendingReplies, setPendingReplies] = useState<Set<number>>(
    () => new Set(),
  );
  const [gatheredAt, setGatheredAt] = useState<number | null>(null);
  /* The one turn that has just landed, and the only one that rises — so a re-render, a re-open or
     an earlier turn never replays an arrival somebody has already read. */
  const [arrived, setArrived] = useState<number | null>(null);
  const [raised, setRaised] = useState(false);
  /* Whether the skin check is drawn in place of the conversation. Its photo and answers are its own
     state, so closing it lets them go. */
  const [skin, setSkin] = useState(false);
  /* Closing the panel ends the check: a photo is not kept in a panel nobody is looking at. */
  useEffect(() => {
    if (!open) {
      setSkin(false);
      setPrivacyOpen(false);
    }
  }, [open]);
  const [queue, setQueue] = useState<Queue>(emptyQueue);
  const [sent, setSent] = useState<Record<number, Sent>>({});
  /* The one notes card whose lines were just copied, so its button can say so; the clipboard is the
     person's own and nothing here keeps the notes anywhere else. */
  const [copied, setCopied] = useState<number | null>(null);
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
  const [consented, setConsented] = useState(() => !gated || patientAcknowledged());
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [callTurn, setCallTurn] = useState<number | null>(null);
  const wordsRef = useRef<(text: string) => void>(() => {});
  const callLive = useRef(false);
  /* The composer's field is drawn only once the gate is passed and only has a layout while the panel is
     open, so both are what it is measured again on, beside the words themselves. */
  useGrowingField(field, draft, open && consented);
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
  /* The audience travels with the surface since 27 September 2026: it is what decides which
     presentation register a routine reply is read in — the patient's or the administrator's — and
     the adapter reads that register's setting at the moment of speaking, never here. */
  const voiceAdapter = useVoiceAdapter("assistant", audienceId);
  const callHead = turns[turns.length - 1];
  const callPending = callTurn !== null && pendingReplies.has(callTurn);
  const callReady = callTurn !== null && callHead?.id === callTurn && !callPending;
  const call = useGilbertCall({
    supported: voiceAdapter.supported,
    canSpeak: voiceAdapter.canSpeak,
    state: voiceAdapter.state,
    transcript: voiceAdapter.transcript,
    pending: callPending,
    reply: callReady ? spokenOf(callHead, audienceId) : "",
    replyEpoch: callTurn ?? 0,
    start: voiceAdapter.start,
    cancelListen: voiceAdapter.cancelCapture,
    cancelSpeech: voiceAdapter.cancel,
    speak: voiceAdapter.speak,
    voiceClass: callReady ? voiceClassOf(callHead.reply, callHead.unread) : "routine",
    onWords: wordsRef,
  });
  callLive.current = call.mode === "on";
  const lastTurn = turns[turns.length - 1];
  const reply = lastTurn.reply;
  const waitingForReply = pendingReplies.has(lastTurn.id);
  const asked = turns.length > 1;
  const pulse = asked ? pulseOf(reply) : "idle";
  const stage = useMemo(() => stageOf(reply, asked), [reply, asked]);
  const everRaised = raised || emergencyIn(turns);
  /* Read by the reading effect without being one of its dependencies: a change to it alone must
     never read a reply aloud a second time. */
  const heldRef = useRef(everRaised);
  heldRef.current = everRaised;
  useEffect(() => {
    if (emergencyIn(turns)) setRaised(true);
  }, [turns]);

  /* The entrance in flight, so a close that lands before it finishes cancels it rather than letting
     it fight the CSS close for the same transform. */
  const entrance = useRef<Animation | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      close.current?.focus();
      setGatheredAt(performance.now());
      entrance.current = growFromLauncher(element, reducedRef.current);
    }
    if (!open && element.open) {
      entrance.current?.cancel();
      entrance.current = null;
      element.close();
      /* A re-open is a new arrival: the last reply does not rise a second time under the panel's
         own entrance. */
      setArrived(null);
    }
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
    if (!open) {
      voiceAdapter.cancel();
      /* And a hands-free conversation ends with the panel: a microphone left open by a panel that
         has gone is a microphone nobody on the screen can turn off. */
      voiceAdapter.conversation.stop();
      call.end();
    }
  }, [open, voiceAdapter.cancel, voiceAdapter.conversation.stop, call.end]);
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
    if (audience.voice && !callLive.current) {
      const caption = spokenOf(last, audienceId).split(" ");
      /* A mouth closes only where one opened. The adapter reports the reading over on end, on
         cancel and on failure alike — §07's own rule, and the sentence the demo's caption needs —
         so this reading's close is the mouth closing against the start event that opened it. A
         reading replaced, barged over or shut down before its first word never showed a mouth,
         and one must not be conjured only to be closed: the empty caption track would take the
         face for its step and hold it over whatever the reply — a handover, a greeting on the way
         back in — was owed instead. */
      let opened = false;
      /* Where the voice has got to, drawn as a rail down the reply it is reading. Every word is
         already written — the caption is the reply itself, and the contract's own session sentence
         promises the words stay on the screen — so nothing is hidden to be revealed: the rail only
         grows alongside the lines as they are read, from the utterance's own word boundaries and
         never from a timer, so a browser that reports no boundaries draws no rail rather than a
         guessed one. It is written straight onto the turn's element because it changes on every
         word, and a word is not a reason to re-render the conversation. It is refused while the
         safety face holds, exactly as the mouth is: nothing moves beside the ambulance numbers. */
      const track = heldRef.current ? null : latest.current;
      let read = 0;
      const mark = (progress: number | null) => {
        if (!track) return;
        if (progress === null) delete track.dataset.reading;
        else {
          track.dataset.reading = "";
          track.style.setProperty("--as-read", progress.toFixed(3));
        }
      };
      voiceAdapter.speak(
        spokenOf(last, audienceId),
        {
          /* The reply's own language, when its words are one of voice.spokenLanguages — decided
             from the reply alone, so the browser's voice is asked for in that language first. */
          language: spokenLanguageOf(last.reply)?.localeOrder,
          /* The register the reply is read in, from the reply alone — the contract's spokenRegister
             map, read the way `cueOf` reads the face. An emergency, a refusal or an escalation is
             read in the platform's own voice whatever an administrator has set; only a routine
             reply reads in the surface's presentation register. The adapter decides which is which
             from voice.json's zones; this call only says what kind of reply it is. */
          voiceClass: voiceClassOf(last.reply, last.unread),
          onStart: () => {
            opened = true;
            mark(0);
            play(affect.voiceMoments.speaking.cue, { caption });
          },
          onWord: (word) => {
            read += 1;
            mark(Math.min(1, read / Math.max(1, caption.length)));
            play(affect.voiceMoments.speaking.cue, { caption: [word] });
          },
          onEnd: () => {
            mark(null);
            if (opened) play(affect.voiceMoments.speaking.cue, { caption: [] });
          },
        },
        /* The reply's own language, from the turn response's detectedLanguage and English when it
           carries none. lib/voice.ts hands it to the cloud speak path, so a isiZulu answer is asked
           for in isiZulu and — where the cloud has no voice for it — is left on the screen as text
           rather than read aloud in an English voice. */
        last.detectedLanguage ?? "en",
      );
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
    if (!open || !consented) return;
    /* Latest message in view: the transcript scrolls to its foot on open and
       after each turn. scrollIntoView can also move the dialog, so only this
       scroller moves. */
    const viewport = scroller.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: reduced ? "auto" : "smooth",
    });
    requestAnimationFrame(measure);
  }, [open, consented, turns, reduced]);
  /* The conversation's room changes without a scroll — the composer growing with what is written, the
     voice's controls standing in it — and the way back is measured again when it does, or a field grown
     over the latest answer would hide it with no button to say so. */
  useEffect(() => {
    const box = scroller.current;
    if (!box || typeof ResizeObserver !== "function") return;
    const watch = new ResizeObserver(() => measure());
    watch.observe(box);
    return () => watch.disconnect();
  }, [consented]);
  /* The same scroll the effect above makes, on request: only the transcript moves, never the dialog. */
  const toLatest = () => {
    const entry = latest.current;
    const viewport = scroller.current;
    if (entry && viewport)
      viewport.scrollTo({
        top:
          viewport.scrollTop +
          entry.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top,
        behavior: reduced ? "auto" : "smooth",
      });
  };

  const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    /* The stops are what a Tab can actually reach: a disabled control is not a stop, and a list
       that counts one puts its last entry somewhere focus can never stand — the wrap below then
       never fires and Tab walks out of the modal into the browser's own chrome. The consent gate's
       Accept is disabled until both boxes are ticked, and on 20 September 2026 that was exactly
       the escape: focus left the panel on the fifth Tab. The composer's field is a textarea since it
       learned to grow on 30 September 2026, and a list that names only inputs would lose it as a stop. */
    const stops = [
      ...dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    setArrived(next.length > 1 ? next[next.length - 1].id : null);
  };
  const put = (question: Question) =>
    moved(choose(turns, question, visit, everRaised));
  /* The composer's Send and a captured call, above the path they share. */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      field.current?.focus();
      return;
    }
    sendText(draft);
    setDraft("");
  };
  /* One send path for every way words arrive — Send, Enter, and since 28 September 2026 a hands-free
     turn the recogniser ended on a pause. The composer's submit hands its draft here and clears it;
     the conversation hands each utterance here and never touches the draft. Everything below is the
     same for both: the intake first, the patient's own questions, then the engine, and only an
     unmatched fallback waits for the service. */
  const sendText = (message: string): number | null => {
    /* An intake under way reads the message first, since 28 September 2026: the answer to the
       question on the screen, or yes or no to the offer. continueIntake asks the emergency words
       before anything else and hands back null for a message that is neither an answer nor a
       decision, which then goes the ordinary way below. Nothing here is ever the unmatched reply,
       so no intake turn waits on the service. */
    const viaIntake = continueIntake(
      turns,
      message,
      visit,
      everRaised,
      audienceId,
      "typed",
    );
    if (viaIntake) {
      moved(viaIntake);
      return viaIntake[viaIntake.length - 1]?.id ?? null;
    }
    const help =
      audienceId === "patient" ? patientQuestionFor(message) : undefined;
    if (help) {
      const next = choosePatientHelp(turns, help, message);
      moved(next);
      return next[next.length - 1]?.id ?? null;
    }
    /* Only an unmatched fallback waits for the service. Emergencies, refusals attached to
       matched answers and approved answers remain immediate. Each request replaces only its
       own turn, so a slow answer cannot overwrite a newer question or a reset conversation. */
    const local = sendWithGilbertEngine(
      turns,
      message,
      visit,
      everRaised,
      audienceId,
    );
    const candidate = local[local.length - 1];
    const text = message;
    /* A health question the approved list cannot place still answers from the
       signed-in record. Staff previews and the public page never take this path. */
    if (prefersLocalConversation(text, candidate.reply.kind)) {
      const earlier = turns.flatMap((turn) => (turn.asked ? [turn.asked] : []));
      const recorded = {
        ...candidate,
        reply: { kind: "record" as const, ...guidanceFromRecord(text, earlier) },
      };
      moved([...local.slice(0, -1), recorded]);
      return recorded.id;
    }
    moved(local);
    if (candidate.reply.kind !== "unmatched") return candidate.id;
    voiceAdapter.cancel();
    setPendingReplies((current) => new Set(current).add(candidate.id));
    const generation = refine.current;
    void refineWithAssistantService(
      local,
      text,
      audienceId,
      conversationRef.current,
      audienceId === "patient" ? { patient: signedInPatientContext() } : undefined,
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
      /* The answer that replaces the waiting line arrives like any other: it rises into the place
         the waiting line held. */
      setArrived(candidate.id);
    });
    return candidate.id;
  };
  wordsRef.current = (text: string) => {
    const id = sendText(text);
    if (id !== null) setCallTurn(id);
  };
  /* Start again is the one action that rests the face: it is the patient saying the conversation is
     over, and it is the only thing that releases a cue A16 is holding. */
  const again = () => {
    ++refine.current;
    setPendingReplies(new Set());
    moved(opening(audienceId));
    setRaised(false);
    setSent({});
    setCopied(null);
    conversationRef.current = crypto.randomUUID();
    /* The face rests and the voice stops: Start again is the patient saying the conversation is
       over, and neither half of it may keep going after she has said so. */
    rig.rest();
    voiceAdapter.cancel();
    voiceAdapter.conversation.stop();
    call.end();
    setCallTurn(null);
  };
  const nurse = () => moved(handOver(turns, everRaised));
  /* The skin check hands an emergency here — the words of the sign that raised it, or a sentence the
     emergency matcher caught — and closes: the conversation's own emergency answer is the one she
     reads, and nothing from the check outlives it. */
  const skinEmergency = (words: string) => {
    setSkin(false);
    moved(emergencyTurn(turns, words));
  };
  /* A pressed intake chip — yes, no, or one of a question's options — is the same turn a typed
     word would be, through the same continueIntake, marked chosen. */
  const pick = (text: string) => {
    const next = continueIntake(turns, text, visit, everRaised, audienceId, "chosen");
    if (next) moved(next);
  };
  const copyNotes = (turn: Turn) => {
    if (turn.reply.kind !== "intake") return;
    const text = notesText(turn.reply);
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(turn.id),
      () => undefined,
    );
  };
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
      className="as-panel patient-surface go-experience"
      aria-labelledby={consented ? "as-title" : "go-before-title"}
      data-audience={audienceId}
      data-gate={!consented || undefined}
      /* The safety face holds (affect.answers.emergency's cue, until Start again), and the panel's
         own decorative motion — the float, the listening pulse, the reading rail — stands still
         for as long as it does. The contract says which cue that is; this only reads it. */
      data-safety={
        rig.running?.id === affect.answers.emergency.cue ? "held" : undefined
      }
      onCancel={(event) => {
        event.preventDefault();
        if (privacyOpen) {
          setPrivacyOpen(false);
          return;
        }
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
      {!consented ? (
        <BeforeWeStart
          closeRef={close}
          onClose={dismiss}
          onContinue={() => {
            acknowledgePatient();
            setConsented(true);
            requestAnimationFrame(() => field.current?.focus());
          }}
        />
      ) : (
      <div className="as-frame">
        <header
          className="as-head"
          data-asked={asked || undefined}
          data-gate={!consented || undefined}
        >
          <div className="as-bar">
            <div className="as-titles go-lockup">
              <GilbertMark size={44} />
              <div className="go-lockup-words">
                <h2 id="as-title">{identity.name}</h2>
                <p className="go-not">Not a person, and not a doctor.</p>
              </div>
            </div>
            <div className="as-controls">
              <QuietMenu
                onNew={() => {
                  again();
                  setPrivacyOpen(false);
                }}
                onPrivacy={() => setPrivacyOpen(true)}
              />
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
          {/* The rig lives in the head in every state since 28 September 2026: it is the in-product
              form of GilbertOne, and the official logo — the brand form — is what the gate and the
              welcome introduce the name with. One character in the chrome, one mark in the body. */}
          {portrait}
          {/* The state caption belongs to an open conversation. Over the gate it is left out: there is
              nothing yet for "Ready" to be about, and the gate's own words are the consent section's.
              The state is a Badge, and its word is the state — the colour only repeats it. */}
          {consented && (
            <div className="as-caption" data-pulse={pulse}>
              <Badge
                className="as-state"
                data-pulse={pulse}
                variant={pulse === "escalate" ? "danger" : "accent"}
                dot
              >
                {stateSpec(pulse).cue}
              </Badge>
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
        {privacyOpen && (
          <PrivacyNote
            paragraphs={[
              consent.privacyBody,
              "What you type may be sent to the GilbertOne assistant for this site when an answer is not already on the page. GilbertOne does not decide what you are allowed to see.",
              "New conversation clears this active conversation and ignores a late answer from the previous one. It does not delete stored history. No deletion route is defined here.",
            ]}
            onClose={() => setPrivacyOpen(false)}
          />
        )}

        {call.mode !== "closed" ? (
          <CallScreen
            phase={call.phase}
            disclosure={disclosureFor("assistant")}
            muted={call.muted}
            note={
              voiceAdapter.transcript.trim() ||
              !voiceAdapter.failureSentence ||
              /not open/i.test(voiceAdapter.failureSentence)
                ? null
                : voiceAdapter.failureSentence
            }
            onStart={() => call.begin()}
            onMute={() => call.mute()}
            onEnd={() => {
              call.end();
              setCallTurn(null);
            }}
            onText={() => {
              call.end();
              setCallTurn(null);
              requestAnimationFrame(() => field.current?.focus());
            }}
            emergency={
              <p className="as-silence">
                <TriangleAlert size={15} aria-hidden="true" />
                <EmergencyLinks />
              </p>
            }
          />
        ) : (
          <>
        {consented ? (
          <div
            className="as-scroll"
            data-welcome={!asked || undefined}
            data-skin={skin || undefined}
            ref={scroller}
            onScroll={measure}
          >
            {!asked && (
              <>
                <Opening prompt="What can I help you with?" title="" />
                <QuietChips
                  chips={DESIGN_CHIPS}
                  onPick={(label) => {
                    const chip = DESIGN_CHIPS.find((item) => item.label === label);
                    if (chip && "page" in chip && navigate) {
                      dismiss();
                      navigate(chip.page);
                      return;
                    }
                    sendText(label);
                  }}
                />
              </>
            )}
            {/* The skin check, drawn first in the scroll while it is open; skin-check.css stands the
                conversation and the composer aside under data-skin rather than unmounting them, so the
                transcript is exactly where she left it when she comes back. */}
            {skin && (
              <div className="sk-host">
                <Suspense fallback={<p className="as-quiet" role="status">{skinCheckChip}</p>}>
                  <SkinCheck onBack={() => setSkin(false)} onEmergency={skinEmergency} />
                </Suspense>
              </div>
            )}
            {/* The welcome introduces GilbertOne by its official logo, with the descriptor that must
                stand beside the name. A lockup, so it is centred on the logo's own clear space. */}
            <div
              className="as-log"
              data-welcome={!asked || undefined}
              role="log"
              aria-label={conversation.logLabel}
            >
              <ol>
                {turns.map((turn, index) => {
                  /* "Nothing needs you…" is the settled situation, a status
                     sentence. Before anyone has typed, the welcome line covers
                     this turn. Once a real message exists, rendering it would
                     leak that caption in as the first chat bubble. */
                  if (isOpeningStatus(turn)) return null;
                  return (
                  <li
                    key={turn.id}
                    className="as-turn"
                    data-arrived={turn.id === arrived || undefined}
                    ref={index === turns.length - 1 ? latest : undefined}
                  >
                    {turn.asked && (
                      <p className="as-said">
                        <span className="as-sr">{conversation.youAsked}: </span>
                        {turn.asked}
                      </p>
                    )}
                    {/* Keyed on whether it is still waiting, so the answer that replaces "Getting your
                        answer" is a new arrival with its own rise rather than words swapped in place. */}
                    <div
                      key={pendingReplies.has(turn.id) ? "waiting" : "answered"}
                      className={`as-reply as-reply-${pendingReplies.has(turn.id) ? "pending" : turn.reply.kind}`}
                      aria-busy={pendingReplies.has(turn.id)}
                      data-waiting={pendingReplies.has(turn.id) || undefined}
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
                      {/* Three dots while the service is working, and only then: pendingReplies holds a turn
                          only after the deterministic first tier has answered "unmatched" (submit, above),
                          so an emergency, a refusal or an offline answer is never behind a bubble. The dots
                          are drawing; what a screen reader hears is the contract's sentence. */}
                      {pendingReplies.has(turn.id) ? (
                        <p className="as-pending" role="status">
                          <span className="as-dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          <span className="as-sr">{conversation.thinkingLabel}</span>
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
                          disclosure={turn.disclosure}
                          navigate={navigate}
                          /* Only the latest turn's intake chips can be pressed: an earlier offer or
                             question has been answered, and its answer is the next turn's own words. */
                          onIntake={
                            index === turns.length - 1 ? pick : undefined
                          }
                          copied={copied === turn.id}
                          onCopy={() => copyNotes(turn)}
                        />
                      )}
                      {turn.unread && (
                        <Unread
                          sos={sos}
                          handOver={nurse}
                          audience={audienceId}
                        />
                      )}
                      {/* A reply the cloud has no voice for stays on the screen as text, and the
                          contract says so in its own words rather than in a sentence typed here.
                          Only the reply just spoken can carry it: the adapter's flag describes the
                          reading on the screen now, and it is a language other than English that has
                          no voice — an English reply is never noted. */}
                      {index === turns.length - 1 &&
                        voiceAdapter.voiceUnavailable &&
                        turn.detectedLanguage &&
                        turn.detectedLanguage !== "en" && (
                          <p className="as-quiet as-voice-note">
                            {voice.voiceUnavailableNotice}
                          </p>
                        )}
                    </div>
                    {/* What produced this answer, beneath it and outside it — the reply's words stay the
                        contract's alone — never on the welcome or while waiting. */}
                    {asked && turn.asked && !pendingReplies.has(turn.id) && (
                      <Sources
                        replyKind={turn.reply.kind}
                        references={
                          turn.reply.kind === "record"
                            ? referencesUsedFor(turn.asked ?? "").map((source) => ({
                                name: source.name,
                                url: source.url,
                              }))
                            : undefined
                        }
                        used={undefined}
                      />
                    )}
                  </li>
                  );
                })}
              </ol>
            </div>

            <div className="as-asks">
              {questionGroups.map((group) => {
                if (audienceId === "patient") {
                  const help = patientQuestions.filter(
                    (q) => q.group === group.id,
                  );
                  /* The contract's own patient questions of 27 September 2026, offered beside the
                     help chips in the situations group: the reading and the medicine list always,
                     and what to have ready only while a visit is booked — a chip for preparing a
                     visit that does not exist would answer with the nothing-booked sentence, which is
                     a chip nobody should have to press to learn. They go through choose(), like every
                     contract question. */
                  const offered =
                    group.id === "situations"
                      ? questionsFor(audienceId)
                          .filter(
                            (q) =>
                              (q.answer === "preparation" && visit !== null) ||
                              q.answer === "reading" ||
                              q.answer === "medicines" ||
                              q.answer === "intake" ||
                              (q.answer === "case" && latestCaseFor(SESSION_SUBJECT) !== null),
                          )
                          .sort(
                            (a, b) =>
                              ui.questionOrder.indexOf(a.id) -
                              ui.questionOrder.indexOf(b.id),
                          )
                      : [];
                  return (
                    <section key={group.id} aria-labelledby={`as-${group.id}`}>
                      <h3 id={`as-${group.id}`}>
                        {group.id === "situations"
                          ? ui.topicsHeading
                          : ui.moreHeading}
                      </h3>
                      {group.id === "situations" && <p>{ui.topicsLead}</p>}
                      {/* Keyed on the set it offers, the landing's service settle: when a visit is
                          booked and the preparation chip joins, the row is a new row and settles
                          in once, rather than a chip appearing in the middle of one. */}
                      <div
                        className="as-chips"
                        key={[...offered, ...help].map((q) => q.id).join(" ")}
                      >
                        {offered.map(chip)}
                        {/* Show GilbertOne a rash, for the patient only: it opens the skin check on its
                            own dynamic import, in place of the conversation. */}
                        {group.id === "situations" && (
                          <button
                            type="button"
                            className="as-ask"
                            onClick={() => setSkin(true)}
                          >
                            <span className="as-question-icon">
                              <Camera size={23} aria-hidden="true" />
                            </span>
                            <span>{skinCheckChip}</span>
                          </button>
                        )}
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
                    <div
                      className="as-chips"
                      key={offered.map((q) => q.id).join(" ")}
                    >
                      {offered.map(chip)}
                    </div>
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

            {/* The first tab's consolidated capability list, for the patient on the welcome surface
                before a conversation has begun. It names the six capabilities the conversation
                region below acts on — what is connected, the gated assessment, the clinician
                summary, the device gate, where an answer may stand, and voice and privacy — in the
                catalogue's own sentences, so a person is oriented up front rather than finding them
                folded into collapsed blocks that only appear once they have asked something. The
                credit that used to sit inside the voice disclosure moves out here beside it. */}
            {!asked && gated && (
              <>
                <Suspense fallback={null}>
                  <GilbertOneCapabilities />
                </Suspense>
                <p className="as-foot-powered">{identity.poweredBy}</p>
              </>
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

            {/* Voice and privacy. On the patient's welcome the capability list above already carries
                this in its own row, so the disclosure is drawn only once a conversation has begun
                (the patient's) or for an audience that never sees the capability list (a nurse's
                preview) — one telling of it per surface, never two. */}
            {(asked || !gated) && (
              <details className="as-voice-details">
                <summary>{ui.voiceDetails}</summary>
                <NotConnected of="voice" />
                {!asked && (
                  <p className="as-foot-powered">{identity.poweredBy}</p>
                )}
              </details>
            )}

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
        ) : null}
        {/* The way back to the latest answer: a real button in the panel's own order, after the
            conversation and before the composer, so the focus trap counts it like any other stop. It
            stands over the foot of the transcript from a dock that takes no room. Only once something
            has been asked: the welcome has no latest answer to go back to. */}
        {consented && asked && away && (
          <div className="as-latest-dock">
            <IconButton
              label={ui.latestLabel}
              variant="secondary"
              className="as-latest"
              onClick={toLatest}
            >
              {away === "up" ? (
                <ArrowUp aria-hidden="true" />
              ) : (
                <ArrowDown aria-hidden="true" />
              )}
            </IconButton>
          </div>
        )}

        {consented ? (
          <form className="as-compose" onSubmit={submit}>
            <label htmlFor="as-input">{conversation.inputLabel}</label>
            <div className="as-field">
              {/* Multi-line since 30 September 2026, the handoff's prompt input: it grows with what is
                  written, a speech transcript included, to the cap in gilbertone-theme.css, and Enter
                  still sends (lib/composer.ts). Everything a keyboard may carry away stays off. */}
              <textarea
                ref={field}
                id="as-input"
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={sendOnEnter}
                placeholder="Type in your own words."
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
              <button
                type="submit"
                className="as-send"
                aria-label={conversation.sendLabel}
                title={conversation.sendLabel}
              >
                <Send size={16} aria-hidden="true" />
                <span>{conversation.sendLabel}</span>
              </button>
            </div>
            {/* The mockup's warning strip, in the contract's own words. It carries what the
                loose silence line carried — nobody is safe because nobody answered — in the
                shape the mockup gives it, and both numbers still arrive through the same
                token resolver every other sentence uses. */}
            <div className="go-compose-actions">
              {audience.voice && (
                <button type="button" className="go-talk" onClick={() => call.show()}>
                  <Phone size={16} aria-hidden="true" />
                  Talk to GilbertOne
                </button>
              )}
              {audience.actions.handover && (
                <button type="button" className="go-nurse" onClick={nurse}>
                  <UserRound size={16} aria-hidden="true" />
                  {answers.unread.handoverLabel}
                </button>
              )}
            </div>
            <p className="as-silence">
              <TriangleAlert size={15} aria-hidden="true" />
              <EmergencyLinks />
            </p>
          </form>
        ) : null}
          </>
        )}

      </div>
      )}
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

/* One quiet link under the bubble, only when a signed-in reply matched an approved public card.
   The name is the link text and the card's own URL is the href. Nothing is drawn when nothing matched,
   and the name is not written into the reply sentence. */
function Sources({
  references,
}: {
  replyKind: string;
  used?: readonly string[];
  references?: readonly { name: string; url: string }[];
}) {
  const links = (references ?? []).filter(
    (source) => source.name && source.url.startsWith("https://"),
  );
  const link = links[0];
  if (!link) return null;
  return (
    <div className="as-sources">
      {[link].map((source) => (
        <a
          key={source.url}
          className="as-source-link"
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {source.name}
        </a>
      ))}
    </div>
  );
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

/* A reading answer below its heading: the paragraphs, the urgent block for a far-outside number, what
   follows it and the provenance. One component, because since 2 October 2026 the intake's reading step
   draws the reading question's own far-outside answer too, and an urgent block written twice is two
   blocks that can drift apart. */
type ReadingAnswer = NonNullable<Extract<Reply, { kind: "reading" }>["answer"]>;
function ReadingBody({ answer, allowSos, sos }: { answer: ReadingAnswer; allowSos: boolean; sos: () => void }) {
  const { paragraphs, urgent, after } = answer;
  return (
    <>
      <div className="as-read-body">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className={
              !after.length && index === paragraphs.length - 1 ? "as-limit" : undefined
            }
          >
            {paragraph}
          </p>
        ))}
      </div>
      {urgent && (
        <div className="as-noticed as-reading-urgent" data-urgent="far-outside">
          <p>{urgent.ifUnwell}</p>
          {urgent.signs.length > 0 && (
            <ul>
              {urgent.signs.map((sign) => (
                <li key={sign}>{sign}</li>
              ))}
            </ul>
          )}
          <Lines ids={urgent.numbers} />
          {allowSos && (
            <button type="button" className="as-go" onClick={sos}>
              <Ambulance size={17} aria-hidden="true" />
              {emergencyAnswer.sosLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {after.length > 0 && (
        <div className="as-read-body">
          {after.map((paragraph, index) => (
            <p key={`after-${index}`} className={index === after.length - 1 ? "as-limit" : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {answer.smallPrint.map((line, index) => (
        <p key={`small-${index}`} className="as-quiet as-provenance">
          {line}
        </p>
      ))}
    </>
  );
}

/* The crisis lines, after the ambulance numbers and in the same list style, printed rather than
   dialled — packages/catalog/crisis-lines.json, shown only when the crisis words raised the answer. */
function CrisisLines() {
  return (
    <div className="as-crisis">
      <p>{crisisLines.heading}</p>
      <ul className="as-numbers">
        {crisisLines.lines.map((line) => (
          <li key={line.id}>
            <strong>{line.number}</strong>
            <span>{line.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ReplyProps = {
  reply: Reply;
  audience: AudienceId;
  sos: () => void;
  handOver: () => void;
  sent?: Sent;
  onSend: () => void;
  /* Whether this model reply wears the answers.service disclosure — the heading that says a language
     model wrote it and the line that says it is not a diagnosis. The bridge sets it true for the
     session's first model answer and false for every one after it, so the notice is read once rather
     than repeated into blindness. The disclosure's own text stays the catalogue's. */
  disclosure?: boolean;
  /* The intake's chips press into this — yes, no, or an option — and it is set only on the latest
     turn, so an answered offer or question draws no buttons. copied and onCopy are the notes card's. */
  onIntake?: (text: string) => void;
  copied?: boolean;
  onCopy?: () => void;
  /* Opens Book a nurse from the notes ending. Absent on a preview that has no page to open. */
  navigate?: (page: string) => void;
};

function ReplyBody({
  reply,
  audience,
  sos,
  handOver,
  sent,
  onSend,
  disclosure,
  onIntake,
  copied,
  onCopy,
  navigate,
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
          {showsCrisisLines(reply.groups) && <CrisisLines />}
          {allowSos && (
            <button type="button" className="as-go" onClick={sos}>
              <Ambulance size={17} aria-hidden="true" />
              {emergencyAnswer.sosLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </>
      );
    case "refusal":
      /* The policy's own sentence, and the one door it names — MyThuso can arrange a nurse. The
         emergency numbers are not drawn here: a refusal is not the unmatched answer, nothing failed
         to understand, and the emergency words were asked before this reply existed. */
      return (
        <>
          <p className="as-headline">{reply.sentence}</p>
          {allowHandover && (
            <div className="as-actions">
              <button type="button" className="as-go" onClick={handOver}>
                <UserRound size={17} aria-hidden="true" />
                {answers.refusal.handoverLabel}
              </button>
            </div>
          )}
        </>
      );
    case "record":
      /* The composer already offers Talk to a nurse. A record bubble does not repeat it.
         Refusal, unmatched and a real emergency keep their own handover button. */
      return (
        <>
          {reply.text.split("\n\n").map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
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
    case "reading": {
      /* The spoken reading explanation: the measure's name as the heading, records.json's own
         paragraphs in the order the voice reads them, and the provenance as small print — the
         written-by-a-person and read-by-no-clinician sentences, which a screen that explains a
         blood pressure is not allowed to leave off. Nothing here is typed: heading, paragraphs and
         small print all arrive from packages/gilbertone/src/readings.ts as the contracts' words.

         Since 28 September 2026 the heading stands on a lilac stat tile with her own number set
         large and light beside records.json's unit — what she opened the panel to ask about, so it
         is the largest thing in the answer. The number is hers, as she typed it; the tile carries no
         chip, no colour for a side of a range and no word that grades, because the answer's own first
         sentence says where a number sits is not what it means for her. The last paragraph is the
         limit — a doctor decides what the number means — and it is set apart by a rule rather than
         left as one more line.

         Since 1 October 2026 a number past the far-outside bounds in reading-questions.json gets no
         everyday paragraph: its opening sentence, then the urgent block — the sentence that sends her
         to an ambulance if she feels unwell, the red flags, the emergency answer's own numbers and its
         Thuso SOS door, drawn as the emergency answer draws them — then the rest, closing last. */
      if (!reply.answer) return <p>{reply.ask}</p>;
      const said = reply.match?.values ? reply.match.said : null;
      const unit = said ? unitOf(reply.match?.measure.explains[0]) : null;
      return (
        <>
          <div className="as-tile as-stat" data-tone="lilac">
            <p className="as-headline">{reply.answer.heading}</p>
            {said && (
              <p className="as-stat-figure">
                {said}
                {unit && <span>{unit}</span>}
              </p>
            )}
          </div>
          <ReadingBody answer={reply.answer} allowSos={allowSos} sos={sos} />
        </>
      );
    }
    /* The preparation list and the medicine list, as the pastel system's list cards: the heading, the
       lead and the lines on one tinted tile, in the order the voice reads them, and every sentence
       that limits the list — unreviewed, never instructs, protected entries never read, nothing
       changed — beneath it in the quiet register, where the contract puts them. Lime for the list a
       nurse's visit asks for, which is the warm answer; peach for the medicine list, which is read
       back beside a refusal and so is not given the accent colour. */
    case "preparation": {
      const p = reply.answer;
      if (p.kind === "none") return <p>{p.sentence}</p>;
      return (
        <>
          <div className="as-tile as-listcard" data-tone="lime">
            <p className="as-headline">{p.serviceName}</p>
            <p>{p.lead}</p>
            <ul className="as-list">
              {p.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="as-quiet as-provenance">{p.review}</p>
          <p className="as-quiet">{p.neverInstructs}</p>
        </>
      );
    }
    case "medicines": {
      const m = reply.answer;
      return (
        <>
          <div className="as-tile as-listcard" data-tone="peach">
            <p className="as-headline">{m.heading}</p>
            <p>{m.lead}</p>
            {m.noMedicines ? (
              <p>{m.noMedicines}</p>
            ) : (
              <ul className="as-list">
                {m.lines.map((line, index) => (
                  <li key={index}>
                    <Pill size={16} aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="as-quiet">{m.protectedNotRead}</p>
          <p className="as-quiet">{m.neverChanges}</p>
          <p className="as-quiet as-provenance">{m.preview}</p>
        </>
      );
    }
    case "service":
      /* A sentence a language model wrote, drawn under the heading that says so — the same
         order spokenOf reads aloud, so the voice and the screen cannot tell two stories. The
         model's own words are painted pre-wrap (`.as-service`): a model writes paragraphs, and
         this panel does not join them into one. The disclosure and the urgency line are read
         from the contract like every other sentence here, and the two doors are the ones the
         unmatched answer already offers, scoped by the audience's own entry. */
      return (
        <>
          {disclosure && (
            <p className="as-headline">{answers.service.heading}</p>
          )}
          <p className="as-service">{reply.text}</p>
          {disclosure && (
            <p className="as-quiet">{answers.service.disclosure}</p>
          )}
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
    /* The symptom intake, in the contract's own words and no others. The offer: what was recognised,
       the opening, what this is not, the stop rule, and the two chips. A question: the ask as the
       headline and, for chips, its options as 44-pixel buttons; a text question points at the
       composer. The notes: the card a nurse reads — question beside answer — then the closing or the
       stopped sentence, the review disclosure, and the two doors: copy, and the existing way to a
       nurse. Chips are drawn only while the turn is the latest one (onIntake); on an earlier turn the
       answer already stands in the next turn's own words. */
    case "intake": {
      const w = intakeWords;
      if (reply.phase === "declined") return <p>{w.answer.consent.declined}</p>;
      /* The three steps after the notes on a group with a pathway (29 September 2026), every word
         packages/catalog/case.json's: the pair a home cuff shows, where it came from (devices.json's
         own source labels, as 44-pixel chips), and the case card once she asked for a nurse. The card
         draws from caseView(), which is the case with its findings and its suggestion removed. */
      if (reply.phase === "case-declined") return <p>{caseScreens.notNowSaid}</p>;
      /* A far-outside number typed on either reading step is answered first, with the reading
         question's own answer and its urgent block (2 October 2026); the step's ask follows it. */
      const far = reply.far && <ReadingBody answer={reply.far} allowSos={allowSos} sos={sos} />;
      if (reply.phase === "reading")
        return (
          <>
            {far}
            <p className="as-headline">{caseScreens.readingAsk}</p>
            {reply.note && <p className="as-quiet">{reply.note}</p>}
            {onIntake && (
              <>
                <p className="as-quiet">{w.answer.typeHint}</p>
                <div className="as-intake-chips">
                  <Button variant="secondary" className="as-option" onClick={() => onIntake(caseScreens.skipWord)}>
                    {caseScreens.skipLabel}
                  </Button>
                </div>
              </>
            )}
          </>
        );
      if (reply.phase === "reading-source")
        return (
          <>
            {far}
            <p className="as-headline">{caseScreens.readingSourceAsk}</p>
            {onIntake && (
              <div className="as-intake-chips" role="group" aria-label={caseScreens.readingSourceAsk}>
                {patientReadingSources().map((source) => (
                  <Button variant="secondary" className="as-option" key={source.id} onClick={() => onIntake(source.label)}>
                    {source.label}
                  </Button>
                ))}
              </div>
            )}
          </>
        );
      if (reply.phase === "case") {
        const view = caseView(reply.caseRef);
        return (
          <>
            <Card className="as-notes as-case" padding="sm">
              <p className="as-headline">{caseScreens.heading}</p>
              <p className="as-quiet">{caseScreens.answersHeading}</p>
              <dl className="as-summary">
                {reply.rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {reply.reading && (
                <>
                  <p className="as-quiet">{caseScreens.readingHeading}</p>
                  <p className="as-case-reading">{readingLine(reply.reading)}</p>
                  {readingMarks(reply.reading).map((mark) => (
                    <p className="as-quiet" key={mark}>{mark}</p>
                  ))}
                </>
              )}
            </Card>
            <p>{caseScreens.opened}</p>
            {view && (
              <p className="as-case-who" role="status">
                {whoHas(view)}
              </p>
            )}
            <p className="as-quiet as-case-preview">{caseScreens.preview}</p>
            {view?.plan && (
              <div className="as-case-plan" role="status">
                <p className="as-headline">{caseScreens.planHeading}</p>
                <p className="as-quiet">{caseScreens.planLead}</p>
                <p className="as-case-plan-words">{view.plan}</p>
                <p className="as-quiet">{caseScreens.planClose}</p>
              </div>
            )}
            <p className="as-quiet as-provenance">{caseScreens.neverShown}</p>
          </>
        );
      }
      if (reply.phase === "offer")
        return (
          <>
            <p className="as-headline">{reply.group.name}</p>
            <p>{w.answer.opening}</p>
            <details className="as-intake-not">
              <summary>What this does not do</summary>
              <ul className="as-quiet">
                {w.whatItIsNot.map((sentence) => (
                  <li key={sentence}>{sentence}</li>
                ))}
              </ul>
              <p className="as-quiet">{w.answer.stop.sentence}</p>
            </details>
            {onIntake && (
              <div className="as-intake-chips">
                <Button
                  variant="primary"
                  className="as-option"
                  onClick={() => onIntake(w.answer.consent.yesLabel)}
                >
                  {w.answer.consent.yesLabel}
                </Button>
                <Button
                  variant="secondary"
                  className="as-option"
                  onClick={() => onIntake(w.answer.consent.noLabel)}
                >
                  {w.answer.consent.noLabel}
                </Button>
              </div>
            )}
          </>
        );
      if (reply.phase === "question" && reply.question) {
        const q = reply.question;
        return (
          <>
            <p className="as-headline">{q.ask}</p>
            {q.kind === "chips" && q.options && onIntake ? (
              <div className="as-intake-chips" role="group" aria-label={q.ask}>
                {q.options.map((option) => (
                  <Button
                    variant="secondary"
                    className="as-option"
                    key={option}
                    onClick={() => onIntake(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : (
              onIntake && <p className="as-quiet">{w.answer.typeHint}</p>
            )}
          </>
        );
      }
      return (
        <>
          <Card className="as-notes" padding="sm">
            <p className="as-headline">{w.summary.title}</p>
            <p className="as-quiet">{reply.group.name}</p>
            <dl className="as-summary">
              {reply.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="as-quiet as-provenance">{intakeReview()}</p>
          </Card>
          {reply.reading && (
            <p className="as-case-reading">{readingLine(reply.reading)}</p>
          )}
          {reply.reading &&
            readingMarks(reply.reading).map((mark) => (
              <p className="as-quiet" key={mark}>{mark}</p>
            ))}
          <p>{reply.state?.stopped ? w.answer.stop.stopped : w.answer.closing}</p>
          {navigate && (
            <div className="as-actions">
              <Button variant="primary" className="as-go" onClick={() => navigate("Book a nurse")}>
                Book a nurse
              </Button>
            </div>
          )}
          {/* A group with a pathway offers a reading and a nurse; the chips press into onIntake by
              their contract labels, and only on the latest turn. */}
          {hasPathway(reply.group) && !reply.state?.stopped && onIntake && (
            <>
              <div className="as-intake-chips" role="group" aria-label={caseScreens.askNurseLead}>
                {!reply.reading && (
                  <Button variant="secondary" className="as-option" onClick={() => onIntake(caseScreens.readingOffer)}>
                    {caseScreens.readingOffer}
                  </Button>
                )}
                <Button variant="primary" className="as-option" onClick={() => onIntake(caseScreens.askNurse)}>
                  {caseScreens.askNurse}
                </Button>
                <Button variant="secondary" className="as-option" onClick={() => onIntake(caseScreens.notNow)}>
                  {caseScreens.notNow}
                </Button>
              </div>
            </>
          )}
          <div className="as-actions">
            {typeof navigator !== "undefined" && navigator.clipboard && (
              <Button
                variant="secondary"
                className="as-go"
                onClick={onCopy}
                leadingIcon={<ClipboardList size={17} aria-hidden="true" />}
              >
                {copied ? w.summary.copiedLabel : w.summary.copyLabel}
              </Button>
            )}
            {allowHandover && (
              <button type="button" className="as-go" onClick={handOver}>
                <UserRound size={17} aria-hidden="true" />
                {answers.unmatched.handoverLabel}
              </button>
            )}
          </div>
        </>
      );
    }
    /* "What did the doctor say?": the plan in the doctor's own words, or the contract's sentence for
       no case and for no plan yet. Nothing is added to it. */
    case "case": {
      const view = reply.view;
      return (
        <>
          <p className="as-headline">{caseScreens.planHeading}</p>
          {!view ? (
            <p>{caseScreens.planNoCase}</p>
          ) : !view.plan ? (
            <p>{caseScreens.planNone}</p>
          ) : (
            <div className="as-case-plan" role="status">
              <p className="as-quiet">{caseScreens.planLead}</p>
              <p className="as-case-plan-words">{view.plan}</p>
              <p className="as-quiet">{caseScreens.planClose}</p>
            </div>
          )}
        </>
      );
    }
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
