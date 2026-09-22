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
      /* Only an explicit accepted:true is a sent handover. The route is dark — it answers the contract's
         clinician-routing-not-built 503 until an identity, a roster and a destination contract exist — so
         a 200 is not expected; but should one ever arrive, every other shape (no accepted field at all,
         accepted:false, a non-boolean) returns null, which call() turns into a visible ServiceRefusal
         rather than a silent "sent". Treating an unrecognised 200 as an acknowledgement would tell a
         person their handover reached a clinician when nothing says it did — the one false answer this
         seam must never give, so the burden of proof is on an explicit true and nothing less. */
      return b?.accepted === true ? { ok: true } : null;
    },
  );
}
