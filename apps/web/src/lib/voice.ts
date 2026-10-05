import { useCallback, useEffect, useRef, useState } from "react";
import {
  spokenRegister,
  voice as voicePolicy,
} from "../../../../packages/catalog/assistant.json";
import voiceMap from "../../../../packages/catalog/voice.json";
import conversationMode from "../../../../packages/catalog/conversation-mode.json";
import {
  initialSpeechState,
  isConversationActive,
  transition,
  VAD_SILENCE_THRESHOLD_MS,
  type SleepReason,
  type SpeakingKind,
  type SpeechEffect,
  type SpeechEvent,
  type SpeechPhase,
  type SpeechState,
} from "../../../../packages/gilbertone/src/speech-state.ts";
import { isSpeechConfigured, speakText } from "./gilbertone-service";
import { presentationVoiceNow, type PresentationVoiceInForce } from "./settings";

/* The browser's own microphone and the browser's own voice, for the two web surfaces allowed one.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS THE ONLY ONE OF ITS KIND. Until 17 September 2026 no
 * file under apps/web/src was allowed to name a speech API: the founder's decision of 14 September
 * was that MyThuso on the web is typed to, because a browser's recognition may hand what somebody
 * said to the company that makes the browser. That reason has not been overturned, only answered
 * with a disclosure: on 17 September the founder asked for §07 of the GilbertOne scope document to
 * be built for real on the page labelled a demonstrator, and on 18 September widened the same browser
 * route to the live assistant so a patient who cannot type can speak. Both decisions are on file —
 * `voice.webPoc` and `voice.webDecision` in packages/catalog/assistant.json — and this file reads
 * both rather than holding a sentence of its own. On 19 September the founder took the third
 * decision this file carries: the live assistant speaking back is built behind `voice.webSpeech`,
 * switched on the next day for the demonstrator — so `speak` for the assistant surface reads the
 * reply aloud, and the flag is still read here, before anything is reached for, so the day it is
 * switched off again the refusal returns without a line of code being edited. The same day's
 * decision chose the voice it reads with: `voice.voicePreference` — South African English first,
 * then British, then Australian, then any English voice, and the browser's own default when it has
 * none of the four — asked for quietly and promised to nobody, which is §07's own rule.
 *
 * SO THE BOUNDARY IS THIS FILE. scripts/check-boundaries.mjs allows the speech APIs here and refuses
 * them in every other file under apps/web/src, the same way the microphone lives in exactly one file
 * on each phone. One file to read is the whole point: anybody asking "when can this app hear me" gets
 * an answer by opening one module rather than by trusting a sentence.
 *
 * TWO READERS, TWO SETS OF WORDS. The demonstrator's sentences say "this demonstration"; the live
 * assistant's say what a patient is agreeing to. Which set a caller gets is chosen out loud, at the
 * call site, and defaults to the demonstrator's so that adding the assistant could never silently
 * reword the page that was here first.
 *
 * WHAT IT WILL NOT DO. It opens nothing on its own — `start` is only ever called from a tap, and the
 * disclosure is the caller's to show before that tap. It keeps nothing: there is no recorder here, no
 * audio buffer, no storage of any kind, and the transcript is React state that dies with the page. It
 * answers nothing: there is no model behind the words it catches, and the only thing it can say out
 * loud is a string its caller hands it.
 *
 * ON LIP SYNC, HONESTLY. §07 warns that `onboundary` is not a portable viseme stream and must not be
 * sold as production lip-sync. It is not sold as one. Boundary events are forwarded when the browser
 * fires them — Chrome does, reasonably — and the caller shapes one word at a time from them; when
 * they do not fire, the caller keeps the timed caption track it already had. Either way the shapes
 * are approximate articulation, which is exactly what §07's POC column asks for and no more.
 *
 * THE SESSION, SINCE 22 SEPTEMBER 2026. Push-to-talk has five moments — idle, listening,
 * understanding, responding, speaking — and `voice.session` in packages/catalog/assistant.json is
 * where their sentences, their consent and their control labels live. The panel shows those; what
 * lives here are the two moments only a synthesiser can enter: `responding`, for the answer that
 * has landed while the voice is about to read it, and `speaking`, for the reading itself. The
 * session's third promise is the barge-in, and it is kept in one place: tapping the microphone
 * while the voice is reading cancels the reading and opens the microphone in the same tap. Every
 * ending of a reading — the utterance finishing, a browser failing it, a barge-in, a replacement,
 * the panel shutting — runs through one close that happens exactly once, so the mouth and the
 * caller are told the voice went quiet once. And nothing new is kept: a cancelled capture drops
 * what it caught on both sides of the microphone.
 *
 * HANDS-FREE CONVERSATION, SINCE 28 SEPTEMBER 2026. The founder's brief — "when you have spoken to
 * it and you pause, it must respond automatically, just like Siri — not answering on top of you" —
 * is packages/catalog/conversation-mode.json, and this file is its host on the web. The reasoning is
 * not here: packages/gilbertone/src/speech-state.ts is the pure machine, driven in conversation mode,
 * and this file only executes the effects it returns against the browser's recogniser and voice. One
 * tap starts it (`conversation.start`), and from there: the recogniser runs with interim results, the
 * contract's pause after the last word is the endpoint, the words go to the caller's `onUtterance`
 * with no button pressed, the reply is spoken, and when the voice finishes the microphone reopens by
 * itself with the contract's "your turn". While the voice reads, the same recogniser stays open as
 * the barge-in detector: words arriving that are not an echo of the sentence being read cut the
 * reading and become the start of the next turn. An energy detector on a microphone stream is not
 * built, because nothing under apps/web/src may open one — the contract records why. Nothing here
 * changes push-to-talk: `start`, `stop`, `speak` and `cancel` behave exactly as they did, and a
 * conversation that is not running leaves every one of them alone. */

export type VoiceStateId = "off" | "starting" | "open" | "error";

/** Which of the contract's four failure sentences a reader is shown. The ids are the sentence keys
 *  in both web sets, so the words a person reads cannot drift from the decision. */
export type VoiceFailureId =
  | "unavailable"
  | "refused"
  | "failed"
  | "interrupted";

/** Which surface is asking, and so whose words a person reads. `demonstrator` is the default so that
 *  wiring the live assistant could not silently reword the page that was here first. */
export type VoiceSurface = "demonstrator" | "assistant";

export const MAX_LISTENING_SECONDS = voicePolicy.webPoc.maxListeningSeconds;

/* The conversation's own numbers and words, every one read from the contract that decided them. The
   endpoint pause is the machine's threshold — the same constant, so the host can never hand the
   machine a pause it will refuse — and the barge-in thresholds are the contract's proposal for what
   separates somebody talking from a cough. */
const ENDPOINT_MS = VAD_SILENCE_THRESHOLD_MS;
const BARGE_IN_MIN_WORDS = conversationMode.bargeIn.minWords;
const BARGE_IN_MIN_SPEECH_MS = conversationMode.bargeIn.minSpeechMs;
const CONVERSATION_SENTENCES = conversationMode.sentences;

/** The role the conversation's recogniser is playing: hearing the person's turn, or watching for a
 *  barge-in while the voice reads. The same recogniser plays both, and a barge-in flips it. */
type ListenerRole = "listen" | "watch";

/** What the panel shows about a conversation beyond its phase: the turn handed back, or the reason
 *  the microphone closed on its own — each a sentence in the contract. */
export type ConversationNote = "your-turn" | SleepReason | null;

/** Words lower-cased with punctuation gone, for comparing what was heard with what was read. */
const plainWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** The contract's own-voice filter: every word heard is a word of the sentence being read, in
 *  order. The browser's own voice does not always pass through the browser's echo cancellation, so
 *  the machine's echo rule is kept by arithmetic on the words rather than by trusting the audio path. */
function isEchoOf(heard: string, reading: string | null): boolean {
  if (!reading) return false;
  const spoken = plainWords(reading);
  const words = plainWords(heard);
  if (words.length === 0) return false;
  let at = 0;
  for (const word of words) {
    const index = spoken.indexOf(word, at);
    if (index < 0) return false;
    at = index + 1;
  }
  return true;
}

/** Which kind of answer a reading is, for the machine: the emergency register and the handover's
 *  escalation register close the microphone when they finish; everything else hands the turn back.
 *  Both ids are the contract's spokenRegister map, never typed here. */
const speakingKindOf = (voiceClass: string | undefined): SpeakingKind => {
  if (voiceClass === spokenRegister.answers.emergency) return "emergency";
  if (voiceClass === spokenRegister.answers.handover) return "escalation";
  return "answer";
};

/** Whether the contract lets a surface speak out loud. The demonstrator's §07 decision
 *  (`voice.webPoc`, 17 September 2026) says yes; the live assistant's speech decision
 *  (`voice.webSpeech`, switched on 20 September 2026) says yes too, and the flag is read here —
 *  in the one file that names a synthesiser — so that no caller can speak past it and no caller
 *  has to hold the rule itself. */
const SPEAKS: Record<VoiceSurface, boolean> = {
  demonstrator: voicePolicy.webPoc.enabled,
  assistant: voicePolicy.webSpeech.enabled,
};

/** The two web sentence sets, both read from the contract. A cap or a sentence written here instead
 *  would be a second copy able to disagree with the decision it comes from. */
const SENTENCES: Record<
  VoiceSurface,
  Record<VoiceFailureId | "beforePermission", string>
> = {
  demonstrator: voicePolicy.webPoc.sentences,
  assistant: voicePolicy.webSentences,
};

const withSeconds = (sentence: string) =>
  sentence.replace("{seconds}", String(MAX_LISTENING_SECONDS));

/** The disclosure shown before the first tap, for whichever surface is asking. */
export const disclosureFor = (surface: VoiceSurface) =>
  withSeconds(SENTENCES[surface].beforePermission);

/** The disclosure that is shown before the first tap, with the cap written into it from the contract
 *  rather than typed beside it. The demonstrator's own, which is the page that reads it in words. */
export const BEFORE_PERMISSION = disclosureFor("demonstrator");

const FAILURE_SENTENCES: Record<
  VoiceSurface,
  Record<VoiceFailureId, string>
> = {
  demonstrator: {
    unavailable: SENTENCES.demonstrator.unavailable,
    refused: SENTENCES.demonstrator.refused,
    failed: SENTENCES.demonstrator.failed,
    interrupted: SENTENCES.demonstrator.interrupted,
  },
  assistant: {
    unavailable: SENTENCES.assistant.unavailable,
    refused: SENTENCES.assistant.refused,
    failed: SENTENCES.assistant.failed,
    interrupted: SENTENCES.assistant.interrupted,
  },
};

/* The recogniser's own error codes, and which sentence each one earns. A code nobody has written a
   sentence for becomes "did not catch that" rather than a raw string on the screen: a person reading
   `service-not-allowed` learns nothing they can act on. */
const FAILURE_FOR_ERROR: Record<string, VoiceFailureId> = {
  "not-allowed": "refused",
  "service-not-allowed": "refused",
  "no-speech": "failed",
  network: "failed",
  "bad-grammar": "failed",
  "language-not-supported": "failed",
  "audio-capture": "interrupted",
};

/* The recogniser is not in TypeScript's DOM library, so the shape this file uses is declared here
   rather than reached for with `any`. Only the members below are touched. */
type RecognitionAlternative = { readonly transcript: string };
type RecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
};
type RecognitionResultList = {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
};
type RecognitionEvent = {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
};
type RecognitionErrorEvent = { readonly error: string };
type Recogniser = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecogniserConstructor = new () => Recogniser;
type SpeechWindow = Window & {
  SpeechRecognition?: RecogniserConstructor;
  webkitSpeechRecognition?: RecogniserConstructor;
};

/** The constructor, prefixed or not, or nothing at all. Read each time rather than once at module
 *  load: a test that installs a stand-in before the page navigates and a browser that has the real
 *  thing are then the same case, and neither depends on when this module happened to be evaluated. */
function recogniserConstructor(): RecogniserConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as SpeechWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** §07's "final transcript shown for review" needs the finished words and the unfinished ones in one
 *  string, because a person watching a field fill up is watching the interim half. */
function readTranscript(event: RecognitionEvent): string {
  let words = "";
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (result.length > 0) words += result[0].transcript;
  }
  return words.trim();
}

/** The order the contract asks the browser's voices in, lowercased once for comparison: South
 *  African English first, then British, then Australian, then the bare "en" that stands for any
 *  English voice. The order is the founder's decision of 20 September 2026, recorded as
 *  voice.voicePreference, and it is read rather than typed here: a preference that lived in this
 *  file would be one a reviewer had to read code to find, and this is the only module allowed to
 *  reach for the browser's voice list at all. */
const VOICE_ORDER: readonly string[] = voicePolicy.voicePreference.order.map(
  (tag) => tag.toLowerCase(),
);

/** The first voice in the contract's order that this browser actually has, or null when it has none
 *  of the four — in which case the utterance keeps its lang and the browser's own default speaks.
 *  That fallback is the contract's rule rather than a shortcoming: no South African voice is
 *  promised or implied to the person listening, and a preference is never a promise. */
/* Apple ships joke voices (Albert, Eddy, Flo, Grandma) ahead of the real ones. The contract's
 * order still decides the language. Inside a language, a joke voice is skipped so a South African
 * voice such as Tessa is taken before a cartoon voice, and a plain English voice before that. */
const NOVELTY_VOICES = new Set([
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos",
  "wobble", "good news", "eddy", "flo", "grandma", "grandpa", "rocko",
  "zarvox", "trinoids", "organ", "superstar", "jester", "whisper",
]);
const NATURAL_NAMES = ["tessa", "karen", "samantha", "moira", "serena", "daniel", "kate", "fiona"];

function voiceLang(voice: SpeechSynthesisVoice): string {
  return voice.lang.toLowerCase().replace(/_/g, "-");
}

function matchesTag(voice: SpeechSynthesisVoice, tag: string): boolean {
  const lang = voiceLang(voice);
  return lang === tag || lang.startsWith(`${tag}-`);
}

function pickNatural(found: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!found.length) return null;
  const spoken = found.filter(
    (voice) => !NOVELTY_VOICES.has(voice.name.toLowerCase().split(" (")[0] ?? ""),
  );
  const pool = spoken.length ? spoken : found;
  for (const name of NATURAL_NAMES) {
    const hit = pool.find((voice) => voice.name.toLowerCase().startsWith(name));
    if (hit) return hit;
  }
  return pool.find((voice) => voice.default) ?? pool[0];
}

function preferredVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  for (const tag of VOICE_ORDER) {
    const chosen = pickNatural(voices.filter((voice) => matchesTag(voice, tag)));
    if (chosen) return chosen;
  }
  return null;
}

/* WHICH CLOUD VOICE, since the founder's decision of 27 September 2026.
 *
 * Until that day one label, "female", was typed here for every reply — the founder's en-ZA voice of
 * 22 September, the one an absent preference defaulted to. Now the label is looked up at the moment
 * a sentence is spoken, and the lookup is built out of two contracts and one setting:
 *
 *   The ANSWER'S REGISTER — emergency, refusal, escalation, routine — is the contract's spokenRegister
 *   map, read by the panel through lib/assistant.ts's voiceClassOf and handed in as `voiceClass`. It
 *   names a class in packages/catalog/voice.json, and that file's zones say whether the class's voice
 *   may be set by anybody. Only a class in a zone a tenant may configure reads in a chosen voice.
 *   An emergency, a refusal or an escalation is in the locked clinical-delivery zone, and so reads in
 *   PLATFORM_VOICE — voice.cloud.defaultVoice, the contract's own default — whatever any setting says.
 *   That is the whole of voice.json's clinical-delivery-voice-is-not-configurable refusal, kept here
 *   in three lines, and scripts/check-boundaries.mjs holds the three lines to this shape.
 *
 *   The SURFACE'S PRESENTATION CLASS — routine for the patient's panel and the demonstrator, admin
 *   for the Control Tower's — is spokenRegister's map from a surface or an audience to a conversation
 *   type, matched to the presentation class voice.json gives that type. A surface with no
 *   presentation class (a nurse's, a doctor's, a partner's panel) reads in PLATFORM_VOICE.
 *
 *   The SETTING — presentationVoiceNow(), the assistant engine's four settings in lib/settings.ts —
 *   is asked at the moment of speaking and never cached, so an administrator's change on the Voice
 *   screen reaches the next spoken answer in this tab and never the one already being read.
 *
 * The label is still a label: lib/gilbertone-service.ts maps it to the contract's own voice name for
 * the reply's language, so no neural voice is typed here. The cloud reading stays an upgrade of the
 * browser's own voice and never a dependency of it: where the cloud is not configured the browser
 * carries the same words exactly as it did before this door existed, and the browser's voice is not
 * chosen by any setting — voice.voicePreference's order, quietly, and never a promise. */
type CloudVoice = keyof typeof voicePolicy.cloud.voices;
type PresentationClass = keyof PresentationVoiceInForce["byClass"];
const PLATFORM_VOICE = voicePolicy.cloud.defaultVoice as CloudVoice;
/* The zones whose voice a tenant may set, read from voice.json's own configurable word rather than
   named here, so a zone locked there is locked here the day it is. */
const TENANT_ZONES = new Set(
  voiceMap.zones.filter((z) => z.configurable === "tenant").map((z) => z.id),
);
/* A class nobody declared is no class at all, and an empty zone is in no tenant zone: the unknown
   falls to the platform's voice, never to a setting. */
const zoneOfClass = (id: string | null): string =>
  voiceMap.queryClasses.find((c) => c.id === id)?.zone ?? "";
const presentationClassFor = (
  conversationType: string | null,
): PresentationClass | null => {
  if (conversationType === null) return null;
  const found = voiceMap.queryClasses.find(
    (c) =>
      TENANT_ZONES.has(c.zone) &&
      "conversationType" in c &&
      c.conversationType === conversationType,
  );
  return found ? (found.id as PresentationClass) : null;
};
/** The conversation type a surface speaks for: the demonstrator's own, or the audience's for the
 *  live assistant, both from the contract's spokenRegister map. An audience the map gives null — or
 *  none at all — speaks for no presentation register. */
const conversationTypeOf = (
  surface: VoiceSurface,
  audience: string | undefined,
): string | null => {
  if (surface === "demonstrator") return spokenRegister.surfaces.demonstrator;
  const types = spokenRegister.audiences as Record<string, string | null>;
  return audience !== undefined ? (types[audience] ?? null) : null;
};

/** The first voice in a spoken language's own order — voice.spokenLanguages, since 23 September
 *  2026 — with the contract's English order standing behind it. A reply written in isiZulu is asked
 *  for in isiZulu first, because a voice reading English pronunciation over isiZulu words is the
 *  reading the founder heard and asked to fix; a browser with no isiZulu voice keeps everything
 *  exactly as it was, the same quiet preference and never a promise, and the words stay on the
 *  screen in full beside whatever voice takes them. */
function preferredVoiceFor(
  voices: readonly SpeechSynthesisVoice[],
  language: readonly string[],
): SpeechSynthesisVoice | null {
  for (const tag of language.map((item) => item.toLowerCase().replace(/_/g, "-"))) {
    const chosen = pickNatural(voices.filter((voice) => matchesTag(voice, tag)));
    if (chosen) return chosen;
  }
  return preferredVoice(voices);
}

export type SpeakOptions = {
  /** Fired per word when the browser supports boundary events. `index` counts words, not characters,
     so a caller can shape the nth word without counting back through the string itself. */
  readonly onWord?: (word: string, index: number) => void;
  readonly onStart?: () => void;
  /** Called on end, on cancel and on failure alike, because §07 asks the mouth to close on all three
     and a caller should not have to wire the same close three times. */
  readonly onEnd?: () => void;
  /** A reply's own language, from voice.spokenLanguages — the locale order its words are asked for
     in first, with the contract's English order standing behind it. Absent means English, which is
     every approved sentence the contract carries. */
  readonly language?: readonly string[];
  /** The register the words are read in — a class id of packages/catalog/voice.json, from
     lib/assistant.ts's voiceClassOf for a reply. Absent means the surface's own presentation
     register, which is what a sentence with no kind is: the demonstrator's fixed sentence, never
     an emergency. The panel passes it for every reply, and the build holds that it does. */
  readonly voiceClass?: string;
};

export function useVoiceAdapter(
  surface: VoiceSurface = "demonstrator",
  audience?: string,
) {
  /* Which presentation register this surface reads routine words in, decided once from the surface
     and the audience it was opened for. The setting itself is not read here: it is asked at the
     moment of speaking, below, so a change reaches the next reading. */
  const presentationClass = presentationClassFor(
    conversationTypeOf(surface, audience),
  );
  const [state, setState] = useState<VoiceStateId>("off");
  const [transcript, setTranscript] = useState("");
  const [failure, setFailure] = useState<VoiceFailureId | null>(null);
  /* Whether the browser has ever fired a boundary event for us. It cannot be asked in advance — it is
    not a feature flag anywhere — so it is learnt from the first utterance and the caller is told, and
    until then the caller's own timed fallback is what is running. */
  const [boundariesSeen, setBoundariesSeen] = useState(false);
  const [supported] = useState(() => recogniserConstructor() !== null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const recogniser = useRef<Recogniser | null>(null);
  /* The state as the recogniser's own callbacks see it. They fire outside React's rendering, and
    deciding what a close meant inside a state updater would run that decision twice in development,
    where React calls updaters more than once on purpose. */
  const stateRef = useRef<VoiceStateId>("off");
  stateRef.current = state;
  const cap = useRef(0);
  /* Whether this closing was asked for. The recogniser ends the same way whether somebody tapped Stop
    or the microphone was taken away, so the difference has to be remembered on the way in — and a
    close nobody asked for is `interrupted`, which is what the contract's sentence describes. */
  const asked = useRef(false);
  /* Whether the component this adapter belongs to is still on the screen. Set on the way in as well as
    cleared on the way out: React mounts, unmounts and remounts in development, and a flag that is
    only ever cleared leaves every callback below silently dead from the second mount onwards. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* Whether this page has ever asked the synthesiser for anything. Nothing is reached for until
    somebody presses something — a page that calls `cancel()` on an empty queue while it is drawing
    itself has still reached for the API before anybody asked it to, and the journeys assert that it
    has not. */
  const everSpoke = useRef(false);
  /* The first speak often runs before the browser has listed its voices. Waiting once, and only
     after someone has asked to hear a reply, keeps that reply off the default cartoon voice. */
  const waitedForVoices = useRef(false);
  /* The browser's voices, kept from the moment it first has any. Some browsers fill the list in only
    after firing `voiceschanged`, so an empty reading is not "this browser has none": the listener is
    armed on the first utterance, guarded because a stand-in synthesiser may have no listener at
    all, and the next utterance prefers from whatever has settled by then. Every part of this
    happens inside `speak` — a page that asked for the voice list while it drew itself would have
    reached for the synthesiser before anybody pressed anything. */
  const voices = useRef<readonly SpeechSynthesisVoice[]>([]);
  const hearingVoices = useRef(false);
  /* The two moments of a session only the synthesiser enters, since the session work of 22 September
    2026: `responding` is the answer that has landed while the voice is about to read it — a moment
    the panel has a sentence for and must not have to guess at — and `speaking` is the reading
    itself. Both are set by this file and by nothing else, so the panel's session line reads the
    truth rather than inferring it from words arriving. */
  const [responding, setResponding] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  /* Whether the cloud voice has just said it has no voice for the reply's own language — an isiZulu,
     isiXhosa or Sesotho answer the contract marks ttsAvailable:false. Since the multi-language
     frontend of 23 September 2026 this is a fact the panel reads rather than infers: when it is true
     the reply's words stay on the screen in full and the browser's own voice is NOT reached for,
     because it would read a isiZulu answer in an English voice — the one softening this branch
     exists to refuse. It is reset at the start of every reading, so it describes the reply on the
     screen now and never a stale one, and it is a plain React state that dies with the page: no
     browser storage, the same promise the rest of apps/web/src keeps. */
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  /* The close of the reading in flight, so that every way a reading can end runs through one
    function that stands the states down and tells the caller once. The synthesiser's own cancel
    fires no event this file can hear, which is why the close has to be callable rather than only a
    handler. */
  const closeReading = useRef<(() => void) | null>(null);
  /* The cloud reading in flight, since the cloud voice became the preferred one: its audio element,
     so the session's stop and a barge-in can silence it the way `speechSynthesis.cancel()` silences
     the browser's, and its object URL, so the close that happens exactly once revokes it rather than
     leaving a blob the page cannot reclaim. Both are cleared by that close and by the panel's own
     shutdown. */
  const cloudAudio = useRef<HTMLAudioElement | null>(null);
  const cloudUrl = useRef<string | null>(null);
  /* The cloud reading's own word cursor, for the caption a `timeupdate` approximates: advanced only
     when the estimated word changes, so a clock that fires several times a second does not redraw one
     word several times. Reset at the start of each cloud reading. */
  const cloudWord = useRef(-1);
  /* Whether the cloud voice is worth asking, mirrored from the service's session cache so `speak` can
     decide without awaiting: null until the first status answer, then true or false. A reply is never
     held up by the check — the browser's own voice starts synchronously until the cloud is known to be
     there, and the check warms this in the background for the next reply. */
  const cloudReady = useRef<boolean | null>(null);
  /* Which reading is the current one. A cloud fetch that resolves after a barge-in, a replacement or
     the panel shutting has bumped this is abandoned: it plays nothing and, crucially, does not fall
     back to the browser's voice for a reply the person has already moved past. */
  const speakGen = useRef(0);

  /* Stop the voice, wherever it is stopped from: the session's own stop control, a barge-in from
    the microphone, and the panel's resets all land here, and a close that has already happened is
    told it has. Nothing is reached for before something was spoken — the everSpoke guard is the
    same wall that has always stood between this page and an API nobody asked for. */
  const cancel = useCallback(() => {
    /* Abandon a cloud fetch in flight before closing whatever is playing, so a reading that has not
       started yet does not start after the person asked for silence — the same tap that stops the
       browser's voice stops the cloud's, and a cloud answer still on the wire is dropped rather than
       played into the quiet. */
    speakGen.current += 1;
    closeReading.current?.();
    if (
      !everSpoke.current ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    )
      return;
    window.speechSynthesis.cancel();
  }, []);

  const clearCap = () => {
    window.clearTimeout(cap.current);
    cap.current = 0;
  };

  const stop = useCallback(() => {
    asked.current = true;
    clearCap();
    recogniser.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Constructor = recogniserConstructor();
    if (!Constructor) {
      stateRef.current = "error";
      setState("error");
      setFailure("unavailable");
      return;
    }
    /* A second tap while one is already open is the Stop the same control offers, not a second
     microphone. Two recognisers open at once is a state no sentence on the page describes. */
    if (recogniser.current) {
      stop();
      return;
    }
    /* Barge-in, and the session's `speaking` sentence kept as a promise rather than a hope: tapping
       the microphone while the voice is reading stops the voice and opens the microphone in the
       same tap. The branch above must never reach here — that tap is the Stop for a microphone
       that is already open — and the everSpoke guard inside `cancel` keeps a page that has never
       spoken from reaching for the synthesiser at all. */
    cancel();
    /* A tap is the user gesture the cloud voice needs. Playing a silent clip here lets the
       later server recording start; without it the browser blocks that audio and the cartoon
       voice speaks instead. */
    try {
      const primer = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
      );
      primer.volume = 0.01;
      void primer.play().then(() => primer.pause()).catch(() => {});
    } catch {
      /* The cloud attempt still happens. This only covers browsers that block it. */
    }

    setFailure(null);
    setTranscript("");
    stateRef.current = "starting";
    setState("starting");
    asked.current = false;

    const listener = new Constructor();
    /* en-ZA first, from the contract's own locale list, because that is the English the people this is
     built for speak. A browser that does not have it falls back to its own default rather than
     failing, which is the recogniser's behaviour and not something this file can improve on. */
    listener.lang = voicePolicy.languages[0].recognitionLocales[0];
    listener.continuous = false;
    listener.interimResults = true;
    listener.maxAlternatives = 1;

    listener.onstart = () => {
      if (!alive.current) return;
      /* The open state is entered here and nowhere else — when the recogniser says the microphone is
      open, not when somebody tapped. AT03 asks for exactly that, and it is the reason the tap sets
      "starting" rather than the state a person reads as being heard. */
      stateRef.current = "open";
      setState("open");
      clearCap();
      cap.current = window.setTimeout(() => {
        /* The cap closes the microphone on its own, and the person is told which of the two closings
       this was: the contract's sentence covers a browser taking the microphone back and a time
       limit running out, and both are closings nobody asked for. */
        recogniser.current?.stop();
      }, MAX_LISTENING_SECONDS * 1000);
    };

    listener.onresult = (event) => {
      if (alive.current) setTranscript(readTranscript(event));
    };

    listener.onerror = (event) => {
      if (!alive.current) return;
      /* An abort we asked for is not a failure. Every other code earns one of the contract's four
      sentences, and the state goes to error rather than back to off, because a control that looks
      untouched after a refusal is a control that invites the same refusal again. */
      if (event.error === "aborted" && asked.current) return;
      clearCap();
      /* Let go of the recogniser here rather than waiting for `end`. Browsers do fire one afterwards,
      but a failure that left this holding a dead listener would make the next tap a Stop for
      something that had already stopped — which is a control that has to be pressed twice, and
      nothing on the screen would say why. */
      recogniser.current = null;
      stateRef.current = "error";
      setFailure(FAILURE_FOR_ERROR[event.error] ?? "failed");
      setState("error");
    };

    listener.onend = () => {
      if (!alive.current) return;
      recogniser.current = null;
      clearCap();
      /* A failure has already said what happened; a close nobody asked for is the contract's
      `interrupted`, which covers both the browser taking the microphone back and the cap running
      out. A close somebody asked for is just the microphone shutting. */
      if (stateRef.current === "error") return;
      if (!asked.current) {
        setFailure("interrupted");
        stateRef.current = "error";
        setState("error");
        return;
      }
      stateRef.current = "off";
      setState("off");
    };

    recogniser.current = listener;
    try {
      listener.start();
    } catch {
      /* `start` throws when the recogniser is already running or the page is not allowed one. Neither
      leaves anything open, so the adapter goes back to a state the page can describe. */
      recogniser.current = null;
      clearCap();
      stateRef.current = "error";
      setFailure("failed");
      setState("error");
    }
  }, [stop, cancel]);

  /* The browser's own voice, exactly as it was before the cloud door existed: the reading the cloud
     path hands back to when it cannot voice, and the only voice a panel uses until the cloud is known
     to be there. The dispatcher has already closed the reading in flight and emptied the browser's
     queue, so this only chooses a voice, builds the utterance and hands it over. */
  const speakViaBrowser = useCallback(
    (text: string, options: SpeakOptions) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      ) {
        /* A cloud reading that fell back here has already entered the responding moment, so it is
           stood back down rather than left hanging over a browser that has no voice at all. */
        setResponding(false);
        options.onEnd?.();
        return;
      }
      const synthesis = window.speechSynthesis;

      /* The voice list, read at the moment of speaking and never at load. A non-empty reading is kept
       and re-read on every utterance, so a voice installed while the page is open is still seen; the
       `voiceschanged` listen is armed once, for browsers that announce their voices only after an
       event, and a browser with no listener at all — a stand-in synthesiser, or an old engine —
       simply reads whatever `getVoices` answers with. */
      const listing = synthesis.getVoices();
      if (listing.length > 0) voices.current = listing;
      if (
        !hearingVoices.current &&
        typeof synthesis.addEventListener === "function"
      ) {
        hearingVoices.current = true;
        synthesis.addEventListener("voiceschanged", () => {
          const settled = synthesis.getVoices();
          if (settled.length > 0) voices.current = settled;
        });
      }
      /* Chrome often answers getVoices with an empty list until voiceschanged. Speaking then
         uses the browser's default, which on this Mac is not the South African voice. Wait once. */
      if (voices.current.length === 0 && !waitedForVoices.current) {
        waitedForVoices.current = true;
        let ran = false;
        const go = () => {
          if (ran) return;
          ran = true;
          window.clearTimeout(timer);
          if (typeof synthesis.removeEventListener === "function") {
            synthesis.removeEventListener("voiceschanged", go);
          }
          const settled = synthesis.getVoices();
          if (settled.length > 0) voices.current = settled;
          speakViaBrowser(text, options);
        };
        const timer = window.setTimeout(go, 400);
        if (typeof synthesis.addEventListener === "function") {
          synthesis.addEventListener("voiceschanged", go);
        }
        return;
      }
      waitedForVoices.current = false;

      const utterance = new SpeechSynthesisUtterance(text);
      /* The contract's order, then the browser's own default when it has none of the four. The
       preference is applied quietly and promises nothing, which is why the words written on the
       screen never depend on which voice takes them. */
      /* A reply's own language first when its words are that language's — voice.spokenLanguages,
         since 23 September 2026 — then the contract's English order, then the browser's own default. */
      const chosen = options.language
        ? preferredVoiceFor(voices.current, options.language)
        : preferredVoice(voices.current);
      utterance.lang =
        chosen?.lang ??
        options.language?.[0] ??
        voicePolicy.languages[0].recognitionLocales[0];
      if (chosen) utterance.voice = chosen;
      let spokenWords = 0;
      /* The reading's own close, shared by every ending it can have and idempotent because several of
         them can arrive together: a cancel through the session's stop closes the reading and empties
         the queue, and a browser may then fire nothing, an end, or an error of its own. Whatever
         arrives first is the close; the rest are told it has happened. The states it stands down are
         set by this file alone, and the caller's callback is guarded by aliveness the way every
         callback here is. */
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (closeReading.current === close) closeReading.current = null;
        setResponding(false);
        setSpeaking(false);
        if (!alive.current) return;
        options.onEnd?.();
      };
      closeReading.current = close;
      /* The answer has landed and the voice is about to read it: the session's `responding` moment is
         entered before the request to speak rather than at the first word, because the moment between
         the words arriving and the voice starting is one the panel has a sentence for. */
      setResponding(true);

      utterance.onstart = () => {
        if (!alive.current) return;
        setResponding(false);
        setSpeaking(true);
        options.onStart?.();
      };
      utterance.onboundary = (event) => {
        if (!alive.current || event.name !== "word") return;
        setBoundariesSeen(true);
        /* The browser gives a character index and, where it can, a length. Where it cannot, the word is
        read off the text to the next space — which is the same answer for everything this page says
        out loud, and wrong only for text nobody here writes. */
        const length =
          event.charLength && event.charLength > 0
            ? event.charLength
            : (text.slice(event.charIndex).match(/^\S+/)?.[0].length ?? 0);
        const word = text.slice(event.charIndex, event.charIndex + length);
        if (word) options.onWord?.(word, spokenWords++);
      };
      utterance.onend = close;
      utterance.onerror = close;

      synthesis.speak(utterance);
    },
    [],
  );

  /* Read the reply through the cloud voice rather than the browser's: hand the words to the service,
     which answers with the audio itself, decode that to a blob the page can play, and play it — firing
     the same start, word and end callbacks the browser's utterance fires, so the mouth and the caption
     track cannot tell which voice carried the words and do not need to. Answers true when the cloud
     voice has the reading (playing, or abandoned after a barge-in) and false when it could not, which
     is the caller's cue to fall through to the browser's own voice.

     ON WORD BOUNDARIES, HONESTLY. A cloud reading carries no `onboundary` stream — the audio is one
     blob, not a synthesiser's event timeline — so the caption is advanced from the element's own
     `timeupdate`, a coarse clock that estimates the word being spoken from how far through the audio it
     is. That is an approximation of the same kind §07 warns `onboundary` is: a shape for the mouth,
     never a viseme stream and never sold as lip-sync. */
  const speakViaCloud = useCallback(
    async (
      text: string,
      options: SpeakOptions,
      gen: number,
      language: string,
    ): Promise<boolean> => {
      /* The answer has landed and the cloud voice is about to fetch the reading of it: the responding
         moment covers the request as well as the first sound, because the gap between the words
         arriving and the voice starting is one the panel has a sentence for. */
      setResponding(true);
      /* The label the reading is asked for in, decided now and not earlier. The answer's class only
         says which zone it is in; a locked zone reads in the platform's voice and asks no setting,
         and a tenant zone reads in whatever the surface's presentation register is set to at this
         moment. scripts/check-boundaries.mjs holds this function to exactly this shape. */
      const cloudVoiceFor = (answerClass: string | null): CloudVoice => {
        if (!TENANT_ZONES.has(zoneOfClass(answerClass))) return PLATFORM_VOICE;
        if (presentationClass === null) return PLATFORM_VOICE;
        return presentationVoiceNow().byClass[presentationClass];
      };
      /* The reply's own language travels, so an Afrikaans answer is asked for in an Afrikaans voice
         and a language the cloud has no voice for is told apart from a cloud that is down. */
      const result = await speakText(
        text,
        cloudVoiceFor(options.voiceClass ?? presentationClass),
        language,
        options.voiceClass ?? presentationClass,
      );
      /* Abandoned while the service was being asked — a barge-in, a replacement, the panel shutting.
         Play nothing, stand the responding moment back down, and answer true so the caller does not
         fall through to the browser's voice for a reply the person has already moved past. */
      if (gen !== speakGen.current) {
        setResponding(false);
        setSpeaking(false);
        return true;
      }
      if (!result.ok) {
        /* The cloud names a language it has no voice for. This is not a failure to fall back from:
           the browser's own voice would read the same words in English, over a isiZulu answer, which
           is the exact softening this branch refuses. Say so on the published state, stand the
           responding moment down, and answer true so the caller does not fall through — the words
           stay written on the screen, only the reading aloud is missing. */
        if ("voiceUnavailable" in result && result.voiceUnavailable) {
          setVoiceUnavailable(true);
          setResponding(false);
          setSpeaking(false);
          return true;
        }
        /* Refused, unreachable, or not configured: the browser's own voice carries the same words,
           which is the whole fallback this door exists to allow. */
        return false;
      }

      let url: string;
      try {
        const binary = atob(result.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1)
          bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: result.format || "audio/mpeg",
        });
        url = URL.createObjectURL(blob);
      } catch {
        /* An answer that will not decode is not a fault to surface: the browser's voice carries the
           same words rather than the person meeting silence. */
        return false;
      }
      /* A cancel that landed while the bytes were being decoded: drop the blob, play nothing. */
      if (gen !== speakGen.current) {
        URL.revokeObjectURL(url);
        setResponding(false);
        setSpeaking(false);
        return true;
      }

      const audio = new Audio(url);
      cloudAudio.current = audio;
      cloudUrl.current = url;
      cloudWord.current = -1;

      /* Let go of the element and its blob without telling the caller the reading ended: the close
         below does that, and a start that failed hands back to the browser's voice instead, which
         would fire a second end for one reply if this fired the first. */
      const detach = () => {
        audio.onplay = null;
        audio.ontimeupdate = null;
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        if (cloudAudio.current === audio) cloudAudio.current = null;
        if (cloudUrl.current === url) {
          URL.revokeObjectURL(url);
          cloudUrl.current = null;
        }
      };
      /* The reading's own close, shared by every ending it can have — the audio finishing, an error, a
         barge-in through `cancel`, a replacement, the panel shutting — and idempotent, because several
         of those can arrive together. It is the same shape as the browser reading's close: it stands
         the two moments down and tells the caller once. */
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (closeReading.current === close) closeReading.current = null;
        detach();
        setResponding(false);
        setSpeaking(false);
        if (!alive.current) return;
        options.onEnd?.();
      };
      closeReading.current = close;

      audio.onplay = () => {
        if (!alive.current) return;
        setResponding(false);
        setSpeaking(true);
        options.onStart?.();
      };
      audio.ontimeupdate = () => {
        if (!alive.current || !audio.duration) return;
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length === 0) return;
        const index = Math.min(
          words.length - 1,
          Math.floor((audio.currentTime / audio.duration) * words.length),
        );
        if (index === cloudWord.current) return;
        cloudWord.current = index;
        options.onWord?.(words[index], index);
      };
      audio.onended = close;
      audio.onerror = close;

      try {
        await audio.play();
      } catch {
        /* The browser refused to start the audio — an autoplay policy, a stalled decode. Let go of the
           element without telling the caller it ended and hand back to the browser's own voice, which
           is the fallback that has always carried the words. */
        if (closeReading.current === close) closeReading.current = null;
        detach();
        return false;
      }
      return true;
    },
    [presentationClass],
  );

  /* Ask the service whether the cloud voice is there, in the background, and remember the answer for
     the rest of the session so no reply is ever held up by the question. It is a status read and
     nothing else — no microphone, no synthesiser, no speech API — and it never throws. */
  const warmCloud = useCallback(() => {
    void isSpeechConfigured().then((ready) => {
      if (alive.current) cloudReady.current = ready;
    });
  }, []);

  /* The reading itself, once the flag has let it through: one voice at a time, the cloud voice when
     it is known to be there and the browser's own otherwise. `speak` below is the only caller, and it
     is the one that reads the flag; the conversation's own path calls this through `speak` too. */
  const read = useCallback(
    (text: string, options: SpeakOptions, language: string) => {
      everSpoke.current = true;
      /* A new reading clears the last one's "no voice in this language" note: the flag describes the
         reply about to be spoken, not a fact about the whole session. */
      setVoiceUnavailable(false);
      /* One voice at a time, whichever voice it is. §04's stop event and §07's "close the mouth
       immediately on cancel" are the same rule read from two directions, and both start with the
       previous reading ending — and "ending" is this file's own close, called here rather than waited
       for, because neither the synthesiser's cancel nor a paused cloud element fires an event this file
       can hear. The generation is bumped beside it, so a cloud fetch still in flight for the reading
       just replaced is abandoned rather than played over the new one. */
      const gen = (speakGen.current += 1);
      closeReading.current?.();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();

      /* The server voice first. Wait for the status check when it has not answered yet, so the
         browser's cartoon voice does not start the sentence and then get replaced. When the server
         voice is configured, a refusal or failure stays silent and says so, rather than switching to
         the browser's robotic voice mid-conversation. The browser voice is only for a service with
         no speech configured at all. */
      void (async () => {
        if (cloudReady.current === null)
          cloudReady.current = await isSpeechConfigured();
        if (gen !== speakGen.current) return;
        if (cloudReady.current === true) {
          const voiced = await speakViaCloud(text, options, gen, language);
          if (!voiced && gen === speakGen.current) setVoiceUnavailable(true);
          return;
        }
        speakViaBrowser(text, options);
      })();
    },
    [speakViaBrowser, speakViaCloud, warmCloud],
  );

  /* ---- Hands-free conversation: the machine's host --------------------------------------------- */

  /* The machine, and what the panel reads of it. The machine is a ref because the recogniser's
     callbacks drive it from outside React's rendering; the phase and the two flags are state so
     the panel redraws when a turn changes hands. Everything below is plain memory that dies with
     the page: no storage of any kind, the same promise the rest of this file keeps. */
  const machine = useRef<SpeechState>(initialSpeechState(0));
  const [conversationPhase, setConversationPhase] = useState<SpeechPhase>("idle");
  const [conversationActive, setConversationActive] = useState(false);
  const [conversationNote, setConversationNote] = useState<ConversationNote>(null);
  /* Whether a conversation is running, as the callbacks see it. */
  const conversationOn = useRef(false);
  /* Where a finished utterance goes: the panel's own submit, handed in at start. */
  const onUtterance = useRef<((text: string) => void) | null>(null);
  /* The recogniser's role, the words of the window in hand, when the window first heard a word,
     whether this window's words have been handed over, and whether the listener ever opened —
     the last so a browser that refuses the microphone is not asked again in a tight loop. */
  const role = useRef<ListenerRole>("listen");
  const windowWords = useRef("");
  const heardAt = useRef(0);
  const handed = useRef(false);
  const opened = useRef(false);
  /* The endpoint clock: restarted on every interim result, it fires the contract's pause after the
     last word and hands the window over. */
  const endpointTimer = useRef(0);
  /* The sentence being read, while it is read, for the own-voice filter. */
  const readingText = useRef<string | null>(null);

  const clearEndpoint = () => {
    window.clearTimeout(endpointTimer.current);
    endpointTimer.current = 0;
  };

  /* The effects the machine hands back, executed against the browser. Transcription, thinking and
     the wake word have nothing for this host to do: the recogniser transcribes as it hears, the
     panel thinks, and there is no wake word on the web. Speaking is started by `speak`, which is
     where the words and their register arrive. */
  const runEffects = (effects: readonly SpeechEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "start_listening":
          openListener("listen");
          break;
        case "stop_listening":
          closeListener();
          break;
        case "cancel_speech":
          cancel();
          break;
        case "start_thinking":
          onUtterance.current?.(effect.text);
          break;
        case "your_turn":
          /* Only while the conversation still runs: a listener that failed to open on the effect
             before this one has already closed it. */
          if (alive.current && conversationOn.current) setConversationNote("your-turn");
          break;
        case "sleep":
          closeListener();
          if (alive.current) setConversationNote(effect.reason);
          break;
        case "signal_error":
          if (alive.current && effect.source === "recogniser")
            setFailure(FAILURE_FOR_ERROR[effect.reason] ?? "failed");
          break;
        default:
          break;
      }
    }
  };

  /* One door into the machine. A held event changes nothing and runs nothing; a transition stamps
     the host's clock, publishes the phase, and — when the machine has come to rest — closes the
     conversation, so a sleep, an emergency close and a stop all end it the same way. */
  const dispatch = (event: SpeechEvent) => {
    const result = transition(machine.current, event, Date.now());
    if (result.state === machine.current) return;
    machine.current = result.state;
    const active = isConversationActive(result.state);
    if (!active) {
      conversationOn.current = false;
      onUtterance.current = null;
      windowWords.current = "";
      readingText.current = null;
    }
    if (alive.current) {
      setConversationPhase(result.state.phase);
      setConversationActive(active);
    }
    runEffects(result.effects);
  };

  /* Hand this window's words over: the contract's pause has passed since the last word, or the
     recogniser delivered a final result, or the founder's cap closed a window with words in it.
     Exactly once per window. The machine moves through transcribing — which closes the listener —
     to thinking, and the thinking effect is what carries the words to the panel. */
  const handOver = () => {
    if (handed.current) return;
    handed.current = true;
    clearEndpoint();
    clearCap();
    const text = windowWords.current.trim();
    windowWords.current = "";
    if (alive.current) setTranscript("");
    dispatch({ type: "vad_endpoint", silenceMs: ENDPOINT_MS });
    dispatch({ type: "transcript_ready", text });
  };

  /* The founder's listening cap still closes every window. With words in it the cap is a forced
     endpoint and the words are handed over; with none it is a quiet window, closed for the machine
     to count. The watcher is simply closed and reopens if the voice is still reading. The cap is
     the web's thirty seconds (voice.maxListeningSeconds, which conversation-mode.json names as
     web.listeningCapFrom), standing in front of the amendment's forty-five-second utterance cap. */
  const armCap = () => {
    clearCap();
    cap.current = window.setTimeout(() => {
      if (role.current === "listen" && windowWords.current) handOver();
      else closeListener();
    }, MAX_LISTENING_SECONDS * 1000);
  };

  /* A fresh listening window on a recogniser that is already open — the watcher becoming the
     listener when the voice finishes or on a barge-in. What it has heard so far is the person's,
     and stays. The window gets a whole cap of its own: the watcher's cap started when the reading
     began, so carrying it over would leave the person a few seconds after a long reading and spend
     an idle round towards sleep on a window she never had. */
  const armWindow = () => {
    role.current = "listen";
    handed.current = false;
    clearEndpoint();
    armCap();
    if (windowWords.current)
      endpointTimer.current = window.setTimeout(handOver, ENDPOINT_MS);
  };

  /* The words of a result list with GilbertOne's own voice taken out, segment by segment: while
     the voice reads, a segment that is only its own words in order is an echo and is dropped, so
     the person's words arriving over the reading are all that count. */
  const heardWords = (event: RecognitionEvent): { words: string; final: boolean } => {
    let words = "";
    let final = false;
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.length === 0) continue;
      const segment = result[0].transcript;
      if (isEchoOf(segment, readingText.current)) continue;
      words += segment;
      if (result.isFinal) final = true;
    }
    return { words: words.trim(), final };
  };

  const closeListener = () => {
    const listener = recogniser.current;
    clearEndpoint();
    if (!listener) return;
    asked.current = true;
    clearCap();
    listener.stop();
  };

  /* Open the conversation's recogniser in a role, or flip the one already open. It is the same
     recogniser push-to-talk uses — held in the same ref, so the shutdown on unmount, the "second
     tap is Stop" rule and the session's cancel all still reach it — with the conversation's own
     handlers: interim results feed the endpoint clock or the barge-in test, a window that hears
     nothing is a listening_timeout for the machine to count, and a refusal is an error the machine
     closes on. */
  const openListener = (as: ListenerRole) => {
    if (!conversationOn.current) return;
    if (recogniser.current) {
      if (as === "listen") armWindow();
      else role.current = "watch";
      return;
    }
    const Constructor = recogniserConstructor();
    if (!Constructor) {
      if (alive.current) setFailure("unavailable");
      dispatch({ type: "error", source: "recogniser", reason: "unavailable" });
      return;
    }
    if (alive.current) setFailure(null);
    role.current = as;
    windowWords.current = "";
    heardAt.current = 0;
    handed.current = false;
    opened.current = false;
    asked.current = false;
    stateRef.current = "starting";
    if (alive.current) setState("starting");

    const listener = new Constructor();
    listener.lang = voicePolicy.languages[0].recognitionLocales[0];
    listener.continuous = conversationMode.web.continuous;
    listener.interimResults = conversationMode.web.interimResults;
    listener.maxAlternatives = 1;

    listener.onstart = () => {
      if (!alive.current) return;
      opened.current = true;
      stateRef.current = "open";
      setState("open");
      armCap();
    };

    listener.onresult = (event) => {
      if (!alive.current || recogniser.current !== listener) return;
      const { words, final } = heardWords(event);
      if (!words) return;
      if (heardAt.current === 0) heardAt.current = Date.now();
      windowWords.current = words;
      setTranscript(words);
      if (role.current === "watch") {
        /* The barge-in test: enough words over enough time to be somebody talking rather than a
           cough. The machine cuts the voice and reopens the microphone, and the effect flips this
           recogniser into the listener with these words as the start of the turn. */
        if (
          plainWords(words).length >= BARGE_IN_MIN_WORDS &&
          Date.now() - heardAt.current >= BARGE_IN_MIN_SPEECH_MS
        )
          dispatch({ type: "barge_in" });
        return;
      }
      clearEndpoint();
      if (final) {
        handOver();
        return;
      }
      endpointTimer.current = window.setTimeout(handOver, ENDPOINT_MS);
    };

    listener.onerror = (event) => {
      if (!alive.current || recogniser.current !== listener) return;
      if (event.error === "aborted" && asked.current) return;
      /* Nothing said is not a failure in a conversation: the end that follows counts the window. */
      if (event.error === "no-speech") return;
      recogniser.current = null;
      clearCap();
      clearEndpoint();
      stateRef.current = "error";
      setState("error");
      dispatch({ type: "error", source: "recogniser", reason: event.error });
    };

    listener.onend = () => {
      if (!alive.current || recogniser.current !== listener) return;
      recogniser.current = null;
      clearCap();
      clearEndpoint();
      stateRef.current = "off";
      setState("off");
      if (!conversationOn.current) return;
      const phase = machine.current.phase;
      if (role.current === "watch") {
        /* The browser closed the watcher while the voice still reads: reopen it, but only if it
           genuinely opened — a browser refusing the microphone is not asked again and again. */
        if (phase === "speaking" && opened.current) openListener("watch");
        return;
      }
      if (phase !== "listening") return;
      if (windowWords.current && !handed.current) handOver();
      else dispatch({ type: "listening_timeout" });
    };

    recogniser.current = listener;
    try {
      listener.start();
    } catch {
      recogniser.current = null;
      clearCap();
      stateRef.current = "error";
      setState("error");
      setFailure("failed");
      dispatch({ type: "error", source: "recogniser", reason: "failed" });
    }
  };

  /* A reply arriving while a conversation is running. The machine is told what kind of answer it
     is — an emergency or an escalation closes the microphone when it ends, anything else hands the
     turn back — and the reading is wrapped so that its close is the machine's tts_finished. The
     watcher opens before the reading, so a reading that ends at once still hands the turn back to a
     recogniser in the right role. A reading the machine did not ask for — the panel speaking while
     the microphone is open — is read as it always was, and the own-voice filter keeps its words out
     of the person's turn. */
  const conversationSpeak = (
    text: string,
    options: SpeakOptions,
    language: string,
  ) => {
    if (machine.current.phase !== "thinking") {
      readingText.current = text;
      read(
        text,
        {
          ...options,
          onEnd: () => {
            if (readingText.current === text) readingText.current = null;
            options.onEnd?.();
          },
        },
        language,
      );
      return;
    }
    dispatch({
      type: "response_ready",
      text,
      kind: speakingKindOf(options.voiceClass),
    });
    /* Read afresh: the dispatch above moved the machine, which a narrowing on the ref cannot see. */
    const after: SpeechState = machine.current;
    if (after.phase !== "speaking") return;
    readingText.current = text;
    openListener("watch");
    read(
      text,
      {
        ...options,
        onEnd: () => {
          if (readingText.current === text) readingText.current = null;
          options.onEnd?.();
          dispatch({ type: "tts_finished" });
        },
      },
      language,
    );
  };

  /* The tap that starts a conversation. It meets the same walls as everything else here: the
     recogniser is reached for only now, a reading in flight is cut rather than talked over, and the
     panel's own submit is the only place the words go. */
  const startConversation = useCallback((submit: (text: string) => void) => {
    if (conversationOn.current) return;
    conversationOn.current = true;
    onUtterance.current = submit;
    windowWords.current = "";
    readingText.current = null;
    if (alive.current) {
      setConversationNote(null);
      setFailure(null);
      setTranscript("");
    }
    machine.current = initialSpeechState(Date.now(), "conversation");
    cancel();
    /* A push-to-talk capture already open is replaced, not inherited: its handlers are the session's,
       not the conversation's, and what it caught is dropped the way the session's own cancel drops it. */
    const capture = recogniser.current;
    if (capture) {
      recogniser.current = null;
      clearCap();
      capture.onend = null;
      capture.onerror = null;
      capture.onresult = null;
      capture.abort();
    }
    dispatch({ type: "session_start", mode: "conversation" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Stop, pressed — or the panel closing, which is the same cancel. Whatever the microphone was
     hearing is dropped, not sent; a reading in flight is cut; the machine rests. */
  const stopConversation = useCallback(() => {
    if (!conversationOn.current) return;
    windowWords.current = "";
    if (alive.current) setTranscript("");
    dispatch({ type: "cancel" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback(
    (text: string, options: SpeakOptions = {}, language = "en") => {
      /* The contract's flag, before anything is reached for. While voice.webSpeech is false this
       surface does not speak at all: no cloud request is sent, no utterance is constructed, nothing is
       cancelled, nothing is asked of the browser's voice — and the order is the wall, because a check
       that reached for either voice first would be a reach the flag exists to refuse. The conversation
       stands behind the same flag: a surface that may not speak may not converse either. */
      if (!SPEAKS[surface]) {
        options.onEnd?.();
        return;
      }
      if (typeof window === "undefined") {
        options.onEnd?.();
        return;
      }
      if (conversationOn.current) {
        conversationSpeak(text, options, language);
        return;
      }
      read(text, options, language);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read, surface],
  );

  /* Warm the cloud-voice check as soon as a surface that may speak is on the screen, so the first
     reply can prefer the cloud voice rather than spending itself discovering whether one is there. It
     is a status read and nothing else — no microphone opens, no synthesiser is reached for, no speech
     API is named — and it is the same question the capability block asks, answered once for the
     session. A surface the contract does not let speak does not ask it at all. */
  useEffect(() => {
    if (SPEAKS[surface]) warmCloud();
  }, [warmCloud, surface]);

  /* Everything the page opened, closed on the way out. A recogniser left running by a component that
    has gone is a microphone nobody on the screen can turn off. */
  useEffect(
    () => () => {
      clearCap();
      /* A conversation dies with the panel: its clock is stopped and its flag dropped before the
         recogniser below is let go, so no callback that fires on the way out reopens anything. */
      window.clearTimeout(endpointTimer.current);
      conversationOn.current = false;
      onUtterance.current = null;
      /* A reading in flight dies with the panel, and its close — which would tell a component that
         is going away about a mouth — is released without being called: the panel's own close
         effect has already cancelled the voice it wanted stopped. */
      closeReading.current = null;
      /* A cloud reading in flight dies with the panel too: the element is silenced and let go, its blob
         revoked, and the generation bumped so a fetch still on the wire is abandoned rather than
         played into a panel that has gone. The close above was released without being called, so this
         is what actually stops the sound and reclaims the memory. */
      speakGen.current += 1;
      const cloud = cloudAudio.current;
      cloudAudio.current = null;
      if (cloud) {
        cloud.onplay = null;
        cloud.ontimeupdate = null;
        cloud.onended = null;
        cloud.onerror = null;
        cloud.pause();
      }
      if (cloudUrl.current) {
        URL.revokeObjectURL(cloudUrl.current);
        cloudUrl.current = null;
      }
      const listener = recogniser.current;
      recogniser.current = null;
      if (listener) {
        listener.onend = null;
        listener.onerror = null;
        listener.onresult = null;
        listener.abort();
      }
      if (
        everSpoke.current &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      )
        window.speechSynthesis.cancel();
    },
    [],
  );

  const clearFailure = useCallback(() => setFailure(null), []);

  /* The session's asked-for cancel, drop and all: whatever a capture has caught goes with it, on
     both sides of the microphone — the transcript state and the recogniser — and nothing is handed
     to the composer. Without the transcript step this would be `stop` (the words are handed over
     when a capture ends with any, reviewed rather than kept), which is exactly the difference
     between Stop and Cancel: one keeps what was heard for review, the other discards it. A
     recogniser that has already closed makes this a plain wipe. */
  const cancelCapture = useCallback(() => {
    setTranscript("");
    setFailure(null);
    const listener = recogniser.current;
    if (!listener) return;
    asked.current = true;
    clearCap();
    listener.stop();
  }, []);

  /* Only what the two web surfaces read. An exported member nothing calls is a promise about behaviour
    that no journey exercises, and on this module that is the wrong kind of unused. */
  return {
    supported,
    canSpeak,
    state,
    transcript,
    /* The session's own two moments, beside the microphone's states: the panel reads which of the
       five moments the voice is in from these and from the microphone's state, and from nothing
       else. */
    responding,
    speaking,
    /* Whether the cloud voice has no voice for the reply's own language. The panel reads this to show
       the contract's voiceUnavailableNotice beside a reply that stays on the screen as text, and it
       is the reason the browser's own voice was not reached for as a fallback. */
    voiceUnavailable,
    boundariesSeen,
    failureSentence: failure ? FAILURE_SENTENCES[surface][failure] : null,
    unavailable: SENTENCES[surface].unavailable,
    disclosure: disclosureFor(surface),
    maxListeningSeconds: MAX_LISTENING_SECONDS,
    start,
    stop,
    speak,
    cancel,
    cancelCapture,
    clearFailure,
    /* Hands-free conversation, since 28 September 2026: whether one is running, the machine's phase,
       the note beside it (the turn handed back, or why the microphone closed on its own), the
       contract's sentences for the panel to show, and the tap that starts it and the Stop that ends
       it. The words a turn catches go to the submit handed to `start`, and nowhere else. */
    conversation: {
      active: conversationActive,
      phase: conversationPhase,
      note: conversationNote,
      sentences: CONVERSATION_SENTENCES,
      start: startConversation,
      stop: stopConversation,
    },
  } as const;
}

export type VoiceAdapter = ReturnType<typeof useVoiceAdapter>;
