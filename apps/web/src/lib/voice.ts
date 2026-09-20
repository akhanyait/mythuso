import { useCallback, useEffect, useRef, useState } from "react";
import { voice as voicePolicy } from "../../../../packages/catalog/assistant.json";

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
 * are approximate articulation, which is exactly what §07's POC column asks for and no more. */

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
const VOICE_ORDER: readonly string[] = voicePolicy.voicePreference.order.map((tag) =>
  tag.toLowerCase(),
);

/** The first voice in the contract's order that this browser actually has, or null when it has none
 *  of the four — in which case the utterance keeps its lang and the browser's own default speaks.
 *  That fallback is the contract's rule rather than a shortcoming: no South African voice is
 *  promised or implied to the person listening, and a preference is never a promise. */
function preferredVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  for (const tag of VOICE_ORDER) {
    const found = voices.find((voice) => {
      const lang = voice.lang.toLowerCase();
      return lang === tag || lang.startsWith(`${tag}-`);
    });
    if (found) return found;
  }
  return null;
}

export type SpeakOptions = {
  /** Fired per word when the browser supports boundary events. `index` counts words, not characters,
     so a caller can shape the nth word without counting back through the string itself. */
  readonly onWord?: (word: string, index: number) => void;
  readonly onStart?: () => void;
  /** Called on end, on cancel and on failure alike, because §07 asks the mouth to close on all three
     and a caller should not have to wire the same close three times. */
  readonly onEnd?: () => void;
};

export function useVoiceAdapter(surface: VoiceSurface = "demonstrator") {
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
  }, [stop]);

  /* Whether this page has ever asked the synthesiser for anything. Nothing is reached for until
    somebody presses something — a page that calls `cancel()` on an empty queue while it is drawing
    itself has still reached for the API before anybody asked it to, and the journeys assert that it
    has not. */
  const everSpoke = useRef(false);
  /* The browser's voices, kept from the moment it first has any. Some browsers fill the list in only
    after firing `voiceschanged`, so an empty reading is not "this browser has none": the listener is
    armed on the first utterance, guarded because a stand-in synthesiser may have no listener at
    all, and the next utterance prefers from whatever has settled by then. Every part of this
    happens inside `speak` — a page that asked for the voice list while it drew itself would have
    reached for the synthesiser before anybody pressed anything. */
  const voices = useRef<readonly SpeechSynthesisVoice[]>([]);
  const hearingVoices = useRef(false);

  const cancel = useCallback(() => {
    if (
      !everSpoke.current ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    )
      return;
    window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    /* The contract's flag, before anything is reached for. While voice.webSpeech is false this surface
     does not speak at all: no utterance is constructed, nothing is cancelled, nothing is asked of the
     browser's voice — and the order is the wall, because a check that reached for the API first would
     be a reach the flag exists to refuse. */
    if (!SPEAKS[surface]) {
      options.onEnd?.();
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      options.onEnd?.();
      return;
    }
    everSpoke.current = true;
    /* One voice at a time. §04's stop event and §07's "close the mouth immediately on cancel" are the
     same rule read from two directions, and both start with the previous utterance ending. */
    const synthesis = window.speechSynthesis;
    synthesis.cancel();

    /* The voice list, read at the moment of speaking and never at load. A non-empty reading is kept
     and re-read on every utterance, so a voice installed while the page is open is still seen; the
     `voiceschanged` listen is armed once, for browsers that announce their voices only after an
     event, and a browser with no listener at all — a stand-in synthesiser, or an old engine —
     simply reads whatever `getVoices` answers with. */
    const listing = synthesis.getVoices();
    if (listing.length > 0) voices.current = listing;
    if (!hearingVoices.current && typeof synthesis.addEventListener === "function") {
      hearingVoices.current = true;
      synthesis.addEventListener("voiceschanged", () => {
        const settled = synthesis.getVoices();
        if (settled.length > 0) voices.current = settled;
      });
    }

    const utterance = new SpeechSynthesisUtterance(text);
    /* The contract's order, then the browser's own default when it has none of the four. The
     preference is applied quietly and promises nothing, which is why the words written on the
     screen never depend on which voice takes them. */
    const chosen = preferredVoice(voices.current);
    utterance.lang = chosen?.lang ?? voicePolicy.languages[0].recognitionLocales[0];
    if (chosen) utterance.voice = chosen;
    let spokenWords = 0;

    utterance.onstart = () => {
      if (!alive.current) return;
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
    utterance.onend = () => {
      if (!alive.current) return;
      options.onEnd?.();
    };
    utterance.onerror = () => {
      if (!alive.current) return;
      options.onEnd?.();
    };

    synthesis.speak(utterance);
  }, []);

  /* Everything the page opened, closed on the way out. A recogniser left running by a component that
    has gone is a microphone nobody on the screen can turn off. */
  useEffect(
    () => () => {
      clearCap();
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

  /* Only what the two web surfaces read. An exported member nothing calls is a promise about behaviour
    that no journey exercises, and on this module that is the wrong kind of unused. */
  return {
    supported,
    canSpeak,
    state,
    transcript,
    boundariesSeen,
    failureSentence: failure ? FAILURE_SENTENCES[surface][failure] : null,
    unavailable: SENTENCES[surface].unavailable,
    disclosure: disclosureFor(surface),
    maxListeningSeconds: MAX_LISTENING_SECONDS,
    start,
    stop,
    speak,
    cancel,
    clearFailure,
  } as const;
}

export type VoiceAdapter = ReturnType<typeof useVoiceAdapter>;
