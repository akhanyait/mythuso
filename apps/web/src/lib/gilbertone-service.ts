/* The panel's one door to the GilbertOne service's versioned routes.
 *
 * WHY THIS FILE EXISTS. lib/gilbertone-bridge.ts carries the turn route — the conversation's own
 * second tier — and it stays exactly what it was. This module carries the rest of the plan's
 * versioned family that the patient panel may reach for: capability status, knowledge retrieval,
 * the guided-assessment steps, a vital reading and the two handover steps. Every one of those
 * routes is built in apps/assistant-api and several are deliberately gated — triage behind a
 * ratified protocol, vitals behind a data protection assessment, handover submission behind an
 * identity, roster and destination contract that do not exist. This client's whole job is to ask
 * honestly and to hand back exactly what the service said, including a refusal, so the panel can
 * render the service's own sentence rather than inventing a capability that is not connected.
 *
 * WHAT IT NEVER DOES. It never throws: an unreachable service, a timeout, a non-JSON body and a
 * refusal are all one shape to the caller — a `ServiceRefusal` — because a panel that had to
 * try/catch every call is a panel that will miss one. It keeps nothing: there is no store here and
 * no browser storage, the same promise the rest of apps/web/src keeps. It decides nothing clinical:
 * a refusal's `message` is the contract's own sentence, read off the response and never rewritten,
 * and a pack is rendered as the service assembled it. It sends no identity: the session id names a
 * conversation and nothing else, exactly as the routes' own comments require.
 *
 * THE BASE URL is the same one the bridge reads — the vite define in development (empty, so the
 * request goes to this page's own origin and the /assistant proxy), and the deployment's own value
 * when one is set at build time. Nothing here names a speech API: the microphone and the voice stay
 * in lib/voice.ts, the one file allowed to reach for them. */

import { voice as voicePolicy } from "../../../../packages/catalog/assistant.json";

declare const __ASSISTANT_API_URL__: string;

/* One budget for every call, the same 12 seconds the bridge's turn refinement uses: long enough for
   a cold model or a slow retrieval, short enough that a panel is never left waiting on a service
   that has hung. */
const TIMEOUT_MS = 12_000;

const serviceUrl = (path: string): string => {
  const base =
    typeof __ASSISTANT_API_URL__ === "string" ? __ASSISTANT_API_URL__ : "";
  return `${base}${path}`;
};

/* Every route answers one of two shapes. A refusal carries the HTTP status, the contract's own
   refusalId when the service gave one, and the service's own sentence — or, when nothing answered
   at all, a status of 0 and no id, which is the caller's cue to say "unreachable" in the panel's
   own words rather than the contract's. */
export type ServiceRefusal = {
  readonly ok: false;
  readonly status: number;
  readonly refusalId: string | null;
  readonly message: string | null;
};

export type StatusAnswer = {
  readonly ok: true;
  readonly mode: string;
  readonly azure: boolean;
  readonly ollama: boolean;
  readonly production: boolean;
  readonly activated: boolean;
  /* Whether THIS process read an Azure Speech region and key from its environment — the cloud
     voice's own truth, added 23 September 2026. It is a separate fact from `activated` (the OpenAI
     acknowledgement gate): a service can be activated for the language model and still have no
     speech credential, which is exactly the dark-cloud case that made the panel fall back to the
     browser's robotic voice. Presence only, never a value. */
  readonly speech: boolean;
};

export type KnowledgeSource = {
  readonly id: string;
  readonly title: string;
  readonly source: string;
};
export type KnowledgeAnswer = {
  readonly ok: true;
  readonly sources: readonly KnowledgeSource[];
  readonly withheld: number;
};

/* The guided assessment's first question, exactly as triage/start returns it. The questions are a
   ratified protocol's content; this client only carries them, and today the gate answers before any
   question exists, so a caller meets the refusal below rather than this. */
export type TriageStart = {
  readonly ok: true;
  readonly question: string;
  readonly step: number;
  readonly steps: number;
  readonly sessionId: string;
};
export type TriageStep = {
  readonly ok: true;
  readonly done: boolean;
  readonly question?: string;
  readonly step: number;
};

/* The handover pack the service assembled for review — never a score and never a priority, because
   the urgency a clinician would act on is a ratified protocol's to set and there is none. */
export type HandoverPack = {
  readonly summary: string;
  readonly urgency: string;
  readonly symptoms: readonly string[];
  readonly vitals: readonly string[];
  readonly sources: readonly string[];
};
export type HandoverPrepared = {
  readonly ok: true;
  readonly handoverRef: string;
  readonly preparedAt: string;
  readonly pack: HandoverPack;
};

/* One call, one shape back. `parse` narrows a 200 body to the answer type; anything that is not a
   clean 200 — a refusal, a fault, an unreachable service, a timeout, a body that is not the JSON it
   claimed to be — becomes a ServiceRefusal, and the panel renders the service's own sentence for it
   or, when there is none, its own "unreachable" words. */
async function call<T>(
  path: string,
  init: RequestInit | null,
  parse: (body: unknown) => T | null,
): Promise<T | ServiceRefusal> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(serviceUrl(path), {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    /* Read the body once, whatever the status: a refusal carries the contract's sentence in it, and
       that sentence is the whole point of asking rather than guessing. A body that will not parse is
       not a fault to surface — it is a refusal with no sentence, and the panel says "unreachable". */
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const record = (body ?? {}) as { refusalId?: unknown; message?: unknown };
      return {
        ok: false,
        status: response.status,
        refusalId:
          typeof record.refusalId === "string" ? record.refusalId : null,
        message: typeof record.message === "string" ? record.message : null,
      };
    }
    const parsed = parse(body);
    if (!parsed)
      return {
        ok: false,
        status: response.status,
        refusalId: null,
        message: null,
      };
    return parsed;
  } catch {
    /* Unreachable, blocked, timed out or aborted — one fact to the caller: nothing answered. */
    return { ok: false, status: 0, refusalId: null, message: null };
  } finally {
    clearTimeout(timer);
  }
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

/* The language every request carries. The panel is English and the routes hold the language to
   being present rather than to a value, so this is the one honest name for what the panel speaks. */
const LANGUAGE = "en-ZA";

/** GET /assistant/v1/status — the truthful capability reading: provider presence, production and the
 *  acknowledgement gate's own answer. Booleans only, and never a secret. */
export function fetchStatus(): Promise<StatusAnswer | ServiceRefusal> {
  return call("/assistant/v1/status", { method: "GET" }, (body) => {
    const b = body as Partial<StatusAnswer>;
    if (typeof b?.ok !== "boolean" || typeof b.mode !== "string") return null;
    return {
      ok: true,
      mode: b.mode,
      azure: b.azure === true,
      ollama: b.ollama === true,
      production: b.production === true,
      activated: b.activated === true,
      speech: b.speech === true,
    };
  });
}

/** POST /assistant/v1/knowledge/search — the catalogue's published entries an answer may stand on,
 *  each with its own id, title and source, and a count of what was withheld for want of a source. */
export function searchKnowledge(
  query: string,
): Promise<KnowledgeAnswer | ServiceRefusal> {
  return call(
    "/assistant/v1/knowledge/search",
    post({ query, language: LANGUAGE }),
    (body) => {
      const b = body as { sources?: unknown; withheld?: unknown };
      if (!Array.isArray(b?.sources)) return null;
      const sources = b.sources
        .map((entry) => {
          const s = entry as {
            id?: unknown;
            title?: unknown;
            source?: unknown;
          };
          if (
            typeof s?.id !== "string" ||
            typeof s.title !== "string" ||
            typeof s.source !== "string"
          )
            return null;
          return { id: s.id, title: s.title, source: s.source };
        })
        .filter((entry): entry is KnowledgeSource => entry !== null);
      return {
        ok: true,
        sources,
        withheld: typeof b.withheld === "number" ? b.withheld : 0,
      };
    },
  );
}

/** POST /assistant/v1/triage/start — begin a guided assessment. Gated on a ratified protocol, so
 *  today this answers the contract's triage-not-ratified refusal; the button that presses it is the
 *  person's own consent, which is why `userConsent` is true and never implied. */
export function startTriage(
  sessionId: string,
): Promise<TriageStart | ServiceRefusal> {
  return call(
    "/assistant/v1/triage/start",
    post({ userConsent: true, language: LANGUAGE, sessionId }),
    (body) => {
      const b = body as {
        question?: unknown;
        step?: unknown;
        steps?: unknown;
        sessionId?: unknown;
      };
      if (typeof b?.question !== "string" || typeof b.step !== "number")
        return null;
      return {
        ok: true,
        question: b.question,
        step: b.step,
        steps: typeof b.steps === "number" ? b.steps : 0,
        sessionId: typeof b.sessionId === "string" ? b.sessionId : sessionId,
      };
    },
  );
}

/** POST /assistant/v1/triage/answer — the next deterministic step of a begun assessment. Gated behind
 *  the same register read as the step that begins it. */
export function answerTriage(
  sessionId: string,
  step: number,
  answer: string,
): Promise<TriageStep | ServiceRefusal> {
  return call(
    "/assistant/v1/triage/answer",
    post({ sessionId, step, answer }),
    (body) => {
      const b = body as { done?: unknown; step?: unknown; question?: unknown };
      if (typeof b?.done !== "boolean" || typeof b.step !== "number")
        return null;
      return {
        ok: true,
        done: b.done,
        step: b.step,
        question: typeof b.question === "string" ? b.question : undefined,
      };
    },
  );
}

/** POST /assistant/v1/handover/prepare — assemble the clinician-ready pack for the person to review
 *  before anything is sent. A session with no validated reading on it has nothing to hand over and
 *  is refused with the contract's nothing-to-hand-over sentence rather than prepared empty. */
export function prepareHandover(
  sessionId: string,
): Promise<HandoverPrepared | ServiceRefusal> {
  return call(
    "/assistant/v1/handover/prepare",
    post({ userConsent: true, sessionId }),
    (body) => {
      const b = body as {
        handoverRef?: unknown;
        preparedAt?: unknown;
        pack?: unknown;
      };
      const pack = b?.pack as HandoverPack | undefined;
      if (typeof b?.handoverRef !== "string" || !pack) return null;
      const list = (value: unknown): readonly string[] =>
        Array.isArray(value)
          ? value.filter((v): v is string => typeof v === "string")
          : [];
      return {
        ok: true,
        handoverRef: b.handoverRef,
        preparedAt: typeof b.preparedAt === "string" ? b.preparedAt : "",
        pack: {
          summary: typeof pack.summary === "string" ? pack.summary : "",
          urgency: typeof pack.urgency === "string" ? pack.urgency : "",
          symptoms: list(pack.symptoms),
          vitals: list(pack.vitals),
          sources: list(pack.sources),
        },
      };
    },
  );
}

/** POST /assistant/v1/handover/submit — the governed seam that would route a pack to a clinician.
 *  Built as a refusal and nothing else: it always answers the contract's clinician-routing-not-built
 *  sentence at a 503 until an identity, roster and destination contract exist. */
export function submitHandover(
  handoverRef: string,
): Promise<{ readonly ok: true } | ServiceRefusal> {
  return call(
    "/assistant/v1/handover/submit",
    post({ userConsent: true, handoverRef }),
    (body) => {
      const b = body as { accepted?: unknown };
      /* The route is dark, so a 200 is not expected; accept an explicit acknowledgement if one ever
         arrives rather than treating success as unparseable. */
      return b?.accepted === true || b?.accepted === undefined
        ? { ok: true }
        : null;
    },
  );
}

/* ---- Push-to-talk's two cloud doors, added 22 September 2026 ---------------------------------
 *
 * POST /assistant/v1/speak reads back words that already exist, and POST /assistant/v1/listen hears
 * one capture and answers with its words. Both reach Azure Speech inside the service; neither is a
 * browser speech API. This file still names no synthesiser and no recogniser — the microphone and the
 * browser's own voice stay in lib/voice.ts, the one file allowed to reach for them, and that file
 * calls these two rather than the cloud directly. The requests live here because a fetch to the
 * service is this module's whole job and never throws; the decision of what plays the answer stays in
 * voice.ts, which owns the mouth and the moment it opens and closes.
 *
 * WHICH VOICE. The route validates a voice against the two en-ZA names the founder recorded in
 * packages/catalog/assistant.json's voice.cloud, so a caller's "female" or "male" is mapped to that
 * name here rather than sent as a label the service would refuse. The names live in the contract and
 * are read, never typed, so which voice reads a health answer in South Africa stays a line the
 * accountable people can read rather than a string in code.
 *
 * CONSENT. The button is the consent: `userConsent` is true on both, exactly as it is on the triage
 * and handover calls above, because a person tapped to hear this answer or to be heard. */

/** What the cloud voice read back: the audio itself, base64, the media type to play it as, and the
 *  voice and language that actually answered — so the words on the screen can say what spoke them. */
export type SpeakAnswer = {
  readonly ok: true;
  readonly audioBase64: string;
  readonly format: string;
  readonly voice: string;
  readonly language: string;
};

/** The cloud voice's own "not in this language" answer, added with the multi-language frontend of
 *  23 September 2026. The contract marks each of voice.languages ttsAvailable, and a language it has
 *  no neural voice for — isiZulu, isiXhosa, Sesotho and the further South African languages — is
 *  answered `{ ok: false, voiceUnavailable: true, language }` rather than failed or, worse, read in
 *  an English voice. This client surfaces that flag as its own shape instead of swallowing it into a
 *  ServiceRefusal, so lib/voice.ts can tell "this language has no voice" (say so, keep the words on
 *  the screen, never fall back to the browser's English) apart from "the cloud is down" (fall back to
 *  the browser's own voice exactly as it always has). */
export type SpeakUnavailable = {
  readonly ok: false;
  readonly voiceUnavailable: true;
  readonly language: string;
};

/** What the cloud voice heard: the words, and the language they were heard in. A capture the
 *  recogniser read as silence comes back as an empty `text` rather than a refusal — a tap that caught
 *  nothing is an answer, not a fault. */
export type ListenAnswer = {
  readonly ok: true;
  readonly text: string;
  readonly language: string;
};

/* Whether the cloud voice is worth asking, heard once for the session and remembered: null until the
   first question is answered, then true or false for the rest of the page's life. A reply is never
   held up by a second status call, and a service that answered "not configured" is not asked again. */
let speechConfigured: boolean | null = null;

/* The cloud voice NAME a caller's "female"/"male" label resolves to, for the reply's own language.
   The panel chooses the label (lib/voice.ts, CLOUD_VOICE); this maps it to the contract's own voice
   name for that language — voice.languages[<id>].ttsVoices[<label>] — so an Afrikaans reply is sent
   an Afrikaans voice and never an English one, which is what sending voice.cloud.voices for every
   language did before 24 September 2026. A language the contract carries no neural voice for
   (isiZulu, isiXhosa, Sesotho) falls back to voice.cloud.voices, but the service answers
   voiceUnavailable for it before any voice is used, so the name is moot there. The label→name
   mapping stays a decision on file, never a string in this module. */
function cloudVoiceName(voice: "female" | "male", language: string): string {
  const asked = language.trim().toLowerCase();
  type CatalogLanguage = {
    id: string;
    recognitionLocales?: string[];
    ttsAvailable?: boolean;
    ttsVoices?: { female: string; male: string };
  };
  const languages = voicePolicy.languages as CatalogLanguage[];
  const entry = languages.find(
    (candidate) =>
      candidate.id.toLowerCase() === asked ||
      (candidate.recognitionLocales ?? []).some(
        (locale) => locale.toLowerCase() === asked,
      ),
  );
  const named =
    entry && entry.ttsAvailable ? entry.ttsVoices?.[voice] : undefined;
  return named ?? voicePolicy.cloud.voices[voice];
}

/** POST /assistant/v1/speak — read `text` aloud in one of the contract's two en-ZA voices and hand
 *  back the audio itself rather than a reference to it. An unreachable service, a refusal and a voice
 *  the service does not have are all one shape back — a ServiceRefusal — so the caller falls through
 *  to the browser's own voice without a try/catch of its own. */
export async function speakText(
  text: string,
  voice: "female" | "male",
  language: string = LANGUAGE,
  register: string | null = null,
): Promise<SpeakAnswer | SpeakUnavailable | ServiceRefusal> {
  /* Since 28 September 2026 (version four) the reading names the register the words belong to, so
     the service reads a presentation register through the provider and tuning the administrator's
     settings name for it and never a clinical one; a reading with no register is the platform
     default with no tuning. The register travels as the contract's own class id, decided by the
     caller in one place (lib/voice.ts) and never composed here. */
  const result = await call<SpeakAnswer | SpeakUnavailable>(
    "/assistant/v1/speak",
    post({
      text,
      language,
      voice: cloudVoiceName(voice, language),
      ...(register ? { register } : {}),
      userConsent: true,
    }),
    (body) => {
      const b = body as {
        audioBase64?: unknown;
        format?: unknown;
        voice?: unknown;
        language?: unknown;
        voiceUnavailable?: unknown;
      };
      /* The language-has-no-voice answer, surfaced rather than swallowed: it arrives as a 200 whose
         body says ok:false and voiceUnavailable:true, so it reaches this parse rather than the
         refusal branch in `call`, and it is handed back as its own shape for lib/voice.ts to read. */
      if (b?.voiceUnavailable === true)
        return {
          ok: false,
          voiceUnavailable: true,
          language: typeof b.language === "string" ? b.language : language,
        };
      if (typeof b?.audioBase64 !== "string") return null;
      return {
        ok: true,
        audioBase64: b.audioBase64,
        format: typeof b.format === "string" ? b.format : "audio/mpeg",
        voice: typeof b.voice === "string" ? b.voice : "",
        language: typeof b.language === "string" ? b.language : language,
      };
    },
  );
  /* The route answers speech-not-configured when the cloud voice is not switched on for this process.
     That is a fact about the deployment and it does not change mid-session, so it is remembered: the
     panel stops asking and carries on with the browser's own voice rather than paying a refused round
     trip on every reply. A voiceUnavailable answer is not this fact — it says the cloud is configured
     and simply has no voice for THIS language — so it must not poison the cache and stop the panel
     asking for a language the cloud can voice. */
  if (
    !result.ok &&
    "refusalId" in result &&
    result.refusalId === "speech-not-configured"
  )
    speechConfigured = false;
  return result;
}

/** POST /assistant/v1/listen — hear one push-to-talk capture, base64 in the request, and answer with
 *  its words. The audio is kept nowhere on either side; the words are the caller's to own. Nothing is
 *  heard without the person's agreement, which is why `userConsent` travels and is true. */
export function listenAudio(
  audioBase64: string,
  format: string,
  language: string = LANGUAGE,
): Promise<ListenAnswer | ServiceRefusal> {
  return call(
    "/assistant/v1/listen",
    post({ audioBase64, audioFormat: format, language, userConsent: true }),
    (body) => {
      const b = body as { text?: unknown; language?: unknown };
      if (typeof b?.text !== "string") return null;
      return {
        ok: true,
        text: b.text,
        language: typeof b.language === "string" ? b.language : language,
      };
    },
  );
}

/** Whether the cloud voice is worth asking, cached for the session so a reply is never held up by a
 *  second status call. Since 23 September 2026 this gates on the status route's own `speech` field —
 *  the honest reading of whether THIS process was given an Azure Speech region and key — rather than
 *  on `activated`, which is the OpenAI acknowledgement gate and said nothing about speech. Gating on
 *  `activated` was the bug behind the robotic voice: an activated service with no speech credential
 *  read as "configured", so the panel asked the cloud, met the 501, and fell back to the browser's
 *  voice on every reply. A service that is unreachable answers `speech:false`, the honest floor, and
 *  whether the cloud voice is truly switched on is still settled for certain by the first speak,
 *  whose speech-not-configured refusal is remembered above. */
export async function isSpeechConfigured(): Promise<boolean> {
  if (speechConfigured !== null) return speechConfigured;
  const status = await fetchStatus();
  speechConfigured = status.ok === true && status.speech;
  return speechConfigured;
}
