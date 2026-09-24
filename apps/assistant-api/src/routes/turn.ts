import {
  audiences,
  buildResponse,
  classifyMessage,
  classifyWithConfidence,
  type Audience,
  type EngineResponse,
} from "../../../../packages/gilbertone/src/engine.ts";
import {
  addTurn,
  createConversation,
  getContext,
  type ConversationContext,
  type Turn,
} from "../../../../packages/gilbertone/src/conversation.ts";
import { evaluateRefusals } from "../../../../packages/gilbertone/src/refusals.ts";
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";
import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };
import { orchestrate } from "../lib/orchestrator.ts";
import { detectLanguage } from "../lib/language-detect.ts";
import { createSessionStore } from "../lib/session-store.ts";
import type {
  AssistantTurnRequest,
  AssistantTurnResponse,
} from "../lib/schema.ts";

/* Sessions live behind ../lib/session-store.ts, extracted on 22 September 2026: the store's
   policy — a half hour idle, a thousand sessions, oldest first out — is a decision about storage,
   and this route reads through the SessionStore interface rather than owning the map. The
   behavior is the same map it always was; ./lib/session-store.test.ts holds it. */

const sessions = createSessionStore();

/* A required field of this route's contract that the caller did not send. It travels as a typed
   error rather than as a refusal object because the answer is an HTTP 400 the route's own boundary
   sets, not a 200 the handler shapes: server.ts maps it to the shared required-field-missing refusal
   every route inherits from packages/catalog/apis.json. Coercing an absent field to a value — the
   `=== true` that used to read a missing userConsent as a withheld one — invents part of somebody's
   request, which is exactly what that shared refusal exists to refuse. */
export class RequiredFieldMissingError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`A field this route needs was not sent: ${field}`);
    this.name = "RequiredFieldMissingError";
    this.field = field;
  }
}

/* What a refusal offers next, per policy id. The consent refusal offers the confirmation the
   session is waiting on; the clinical referral offers the nurse door the sentence names; the
   role-spoofing refusal points back at what the assistant is; the sensitive-details refusal
   invites the message again in the person's own words. */
const refusalActions: Record<string, string[]> = {
  "consent-required": ["confirm_message"],
  "clinical-referral": ["speak_to_nurse"],
  "role-spoofing": ["identity"],
  "phi-detected": ["continue"],
};

/* The face the service answer wears, read from the contract's affect section rather than typed
   here — the same key the web panel's own map carries, so the two cannot disagree about a cue id
   neither of them owns. */
const serviceCue: string = assistant.affect.answers.service.cue;

/* The audit line: one line per processed message, saying that it was handled and how, never what
   it said. Until 24 September 2026 the line carried the message itself after redactPHI, which
   removes identity, phone, email and medical-aid numbers and nothing clinical — so "I want to kill
   myself" or a blood pressure reached the process log word for word. The Watchful DPIA
   (docs/scope/02, §8) refuses a raw utterance in a routine log, and a log is read by whoever runs
   the box, not by a clinician. The route and the message's length are enough to count, trace and
   debug a turn; the words stay in the session that needed them. */
const audit = (sessionId: string, route: string, text: string): void => {
  console.log(`[gilbertone] ${sessionId} ${route} | ${text.length} chars`);
};

/* What the model is told about the conversation, when the second tier is asked: where this turn
   sits, how the classifier has read the recent ones, whether a task is still open, and — since
   the conversational-memory upgrade of 21 September 2026 — the actual words of the last few
   exchanges, so a follow-up question ("how long before I should worry") reads as connected to
   what it followed rather than answered cold.

   Every prior turn's text and reply passes through the same redactor a fresh message does before
   it reaches a model — req.text is redacted immediately below this function, and these lines get
   no less. That the session store itself keeps req.text unredacted (so the audit trail and any
   future human review see what was actually typed) is a decision about storage, not about what a
   model is shown; this function is the boundary where that difference is enforced. Orchestrator.ts
   redacts the whole block again before it reaches a model — the same redundancy the module's own
   comment already claims for the current message — so a caller here forgetting this discipline
   would not by itself leak a number, but the discipline belongs here anyway, at the point the
   history is turned into words a model reads. */
const contextLines = (context: ConversationContext): string[] => {
  const lines = [`This is turn ${context.turnCount + 1} of this conversation.`];
  if (context.recentClassifications.length)
    lines.push(
      `The classifier's recent readings, oldest first: ${context.recentClassifications.join(", ")}.`,
    );
  if (context.activeTask)
    lines.push(
      `An earlier turn opened the "${context.activeTask}" task and it is still open.`,
    );
  if (context.recentExchanges.length) {
    lines.push(
      "The recent exchange, oldest first — for following the thread of this conversation only. " +
        "It is not new evidence: do not combine it with this turn to infer a condition, and do not " +
        "say anything like 'given what you told me earlier' to imply a clinical read across turns. " +
        "The same rule against diagnosing or prescribing applies to this turn exactly as it did to " +
        "the first one.",
    );
    for (const exchange of context.recentExchanges) {
      lines.push(`Patient said: ${redactPHI(exchange.text)}`);
      lines.push(`GilbertOne replied: ${redactPHI(exchange.reply)}`);
    }
  }
  return lines;
};

/* One response, shaped by the classifier's own fields. `service` is present only when a model
   tier wrote the reply — the plain tier or the orchestrator, each naming itself in `source` —
   and then turn.reply is that tier's text. The two extra fields stay undefined for every
   classifier reply, and JSON.stringify drops undefined — so a caller that ignores them sees
   exactly the response it saw before they existed. `detectedLanguage` is the one field added since
   that is always present: the language this turn was answered in, resolved once in runTurn and
   carried on every path — a match, a refusal, the empty-message clarify — because it describes the
   turn rather than the tier that wrote the reply. */
const response = (
  turn: EngineResponse,
  sessionId: string,
  detectedLanguage: string,
  refusalId?: string,
  service?: { cue: string; source: "model" | "orchestrator" },
): AssistantTurnResponse => ({
  turnId: crypto.randomUUID(),
  sessionId,
  route: turn.route,
  classification: turn.classification,
  reply: turn.reply,
  style: turn.style,
  confidence: turn.confidence,
  requiresConfirmation: turn.requiresConfirmation,
  suggestedActions: turn.suggestedActions,
  refusalId,
  source: service?.source,
  cue: service?.cue,
  detectedLanguage,
});

/* The classification the streaming path sends ahead of the answer, added with the speed pass of
   23 September 2026. It carries the classifier's own read of the message — the classification and
   the weight beside it — and always names the classifier as its source, because that is the tier
   that decided it: the orchestrator may replace the reply but never the classification, so this
   event is true whether or not a model is consulted afterwards. It is emitted the moment the
   classifier has read the message and before the slow orchestrator call, so a client can show the
   read at once and wait only for the words. */
export type TurnClassificationEvent = {
  classification: AssistantTurnResponse["classification"];
  confidence: number;
  source: "classifier";
};

/* What one turn produces, seen from inside: the response the non-streaming path returns, plus the
   two orchestrator facts the streaming path surfaces on its response event and the JSON contract
   does not — which tools grounded the answer and which sources they carried. Empty for a turn the
   classifier answered alone. */
type TurnOutcome = {
  response: AssistantTurnResponse;
  toolsUsed: string[];
  sources: string[];
};

/* One Server-Sent Event the streaming path writes: a name and a JSON-serializable payload. The
   server serializes these verbatim, so the shaping of every event lives here, in the route that
   owns the turn, rather than in the transport that carries it. */
export type TurnStreamEvent = { event: string; data: unknown };

/* The turn, as one generator: every step of the handler below in the order it has always run, but
   able to yield the classifier's read partway through and return the whole outcome at the end. Both
   public doors are thin readers of this one — handleTurn drains it and keeps the return, ignoring
   the yields; handleTurnStream forwards the yields as SSE events and then the return as its final
   event — so the two can never classify, refuse, orchestrate or audit a message differently. The
   yields are pure: they change nothing, which is why draining them and discarding them leaves the
   non-streaming path byte-for-byte the handler it replaced. */
async function* runTurn(
  req: AssistantTurnRequest,
): AsyncGenerator<TurnClassificationEvent, TurnOutcome> {
  const sessionId =
    typeof req?.sessionId === "string" && req.sessionId.trim()
      ? req.sessionId
      : crypto.randomUUID();

  /* The audience is declared by the caller, never authenticated — the same rule the demo login's
     role parameter follows — and a value the engine does not carry means the patient's, because
     that is what a request without one means. It is resolved first, before anything is demanded or
     refused, so the emergency check below classifies against the audience the caller declared. */
  const asked = req?.audience;
  const audience: Audience =
    typeof asked === "string" &&
    (audiences as readonly string[]).includes(asked)
      ? asked
      : "patient";

  /* The language this turn is answered in, resolved once and carried on every path below — the
     classifier's own reply, a refusal, the empty-message clarify and the orchestrator's answer
     alike — because it describes the turn rather than the tier that wrote the reply. A language the
     caller declared wins, trimmed and lower-cased; with none declared the service reads the language
     out of the words it was sent (../lib/language-detect.ts), which returns the safe English default
     whenever it is not confident. Neither reading is a fact about the person and neither touches the
     safety chain: it only steers the words an answer is composed in, and the orchestrator turns a
     code it does not know back into English. This runs before the emergency and consent gates so
     those paths can carry the field too; it is cheap — a weighted count over a short message — and
     reads no model and no network. */
  const declaredLanguage =
    typeof req?.language === "string" && req.language.trim()
      ? req.language.trim().toLowerCase()
      : undefined;
  const detected = detectLanguage(
    typeof req?.text === "string" ? req.text : "",
  );
  const language = declaredLanguage ?? detected.language;

  /* userConsent is a required field of this route's contract (packages/catalog/apis/assistant.json),
     so an absent one is the caller's omission, answered with the shared required-field-missing 400
     the route inherits — never coerced to false, which would invent a withheld consent the caller
     never expressed and refuse the message on a guess. The one thing that outranks a missing field is
     an emergency: it is classified here, before the field is demanded, so a person in danger is never
     turned away for want of a flag — the same precedence refusals.ts gives the emergency over consent.
     A withheld consent (an explicit false) is not this case; it travels on and meets the consent-required
     refusal below, which is a sentence rather than a 400. */
  const isEmergency =
    typeof req?.text === "string" &&
    req.text.trim().length > 0 &&
    classifyMessage(req.text, audience) === "emergency";
  if (!isEmergency && typeof req?.userConsent !== "boolean")
    throw new RequiredFieldMissingError("userConsent");

  /* The engine's own classification of '' is 'unknown', which is right for a low-level classifier
     with nothing to go on. At this boundary "nothing was said" is not the same fact as "the
     message could not be classified", and a caller who typed or spoke nothing deserves to be asked
     for one, not told the assistant is uncertain about a message it never received. */
  if (!req || typeof req.text !== "string" || !req.text.trim()) {
    const clarify: AssistantTurnResponse = {
      turnId: crypto.randomUUID(),
      sessionId,
      route: "clarify",
      classification: "clarify",
      reply: "Please tell me what you need help with.",
      style: "clarifying",
      /* The boundary's own decision, not the classifier's: there is nothing to weigh about a
         message that was never sent. */
      confidence: 1,
      requiresConfirmation: false,
      suggestedActions: ["clarify_message"],
      detectedLanguage: language,
    };
    yield {
      classification: clarify.classification,
      confidence: clarify.confidence,
      source: "classifier",
    };
    return { response: clarify, toolsUsed: [], sources: [] };
  }

  const now = Date.now();
  const state = sessions.read(sessionId, now) ?? createConversation(sessionId);
  const context = getContext(state);

  /* Refusals are asked before the classifier, and before the turn joins the session: a message a
     policy refuses was not classified, and the transcript should not claim otherwise. An absent
     userConsent never reaches here — it was answered with a 400 above — so the value handed to the
     policy is a real boolean: an explicit false is the withheld consent the caller reads as the
     catalog's consent-required policy, while the route, the confirmation flag and the one action it
     suggests stay exactly what they were. An emergency is refused by none of them: refusals.ts asks
     the emergency first, so a person in danger is answered whatever their consent said. */
  const refusal = evaluateRefusals(
    req.text,
    audience,
    req.userConsent === true,
    context,
  );
  if (refusal.refused) {
    /* refusals.ts either carries a sentence or throws; this guard keeps a missing one from
       becoming an empty reply through a type the interface cannot narrow. */
    if (!refusal.sentence)
      throw new Error(`refusal "${refusal.refusalId}" carries no sentence`);
    sessions.write(sessionId, state, now);
    audit(sessionId, refusal.refusalId ?? "refused", req.text);
    const refused = response(
      {
        classification: "unknown",
        route: "unknown",
        reply: refusal.sentence,
        style: "neutral",
        /* The refusal is a rule, not a guess, so its weight is total. */
        confidence: 1,
        requiresConfirmation: refusal.refusalId === "consent-required",
        suggestedActions: refusal.refusalId
          ? (refusalActions[refusal.refusalId] ?? [])
          : [],
      },
      sessionId,
      language,
      refusal.refusalId,
    );
    yield {
      classification: refused.classification,
      confidence: refused.confidence,
      source: "classifier",
    };
    return { response: refused, toolsUsed: [], sources: [] };
  }

  /* The classifier with the session behind it. buildResponse gives the contract's replies, and
     the context-aware call gives the confidence the context may lift; both read the same message,
     so the classification cannot differ between them — only the weight beside it. */
  const engine = buildResponse(req.text, audience);
  const { confidence } = classifyWithConfidence(req.text, audience, context);
  const answer: EngineResponse = { ...engine, confidence };

  /* The classification goes out here, before the orchestrator is consulted: this is the early data
     the streaming path exists to give, and it is the classifier's own read, which the orchestrator
     may not change. The non-streaming door drains this yield and discards it, so emitting it costs
     that path nothing. */
  yield {
    classification: answer.classification,
    confidence: answer.confidence,
    source: "classifier",
  };

  /* The orchestrator tier, since 21 September 2026, in the seat the plain model tier held: where
     the classifier found nothing it knows, a LangChain agent an operator configured may be asked
     for a sentence — and only then. The gates before the call are the contract's, not a model's:
     the patient audience only, because the staff previews are scoped to the three universal
     questions and the system prompt is written patient-voiced; the keyword classifier's own
     territory — emergency, handover, identity, voice — is answered instantly by its own words and
     nothing may second-guess it; and never a message a refusal policy answered — that check ran
     above and already returned. What the orchestrator adds over the plain tier is tools: before
     it writes a word it can read the catalog's interaction record, medication entry, symptom
     guidance, emergency numbers or knowledge base. Anything that fails in there — no provider, a
     hung model, the 15-second budget — falls back to the classifier's own answer, so a
     deployment with nothing configured returns exactly the replies this route returned before
     the tier existed. */
  const keywordOwned: readonly string[] = [
    "emergency",
    "handover",
    "identity",
    "voice",
  ];
  const mayConsultOrchestrator =
    audience === "patient" &&
    !keywordOwned.includes(answer.classification) &&
    (answer.classification === "unknown" || answer.confidence < 0.5);
  let reply = answer.reply;
  let service: { cue: string; source: "model" | "orchestrator" } | undefined;
  let toolsUsed: string[] = [];
  let sources: string[] = [];
  if (mayConsultOrchestrator) {
    const orchestrated = await orchestrate(redactPHI(req.text), {
      lines: contextLines(context),
      language,
    });
    if (!orchestrated.degraded && orchestrated.answer) {
      /* The model's words pass the same redactor the audit line does. The refusal policies are
         deliberately not re-applied to the output: their patterns are question-shaped ("do I
         have", "should I take"), and an answer that correctly says "this is not a diagnosis"
         trips one — the input side already gated the model, and the answers.service heading the
         panel draws around these words carries the disclosure on the output side. */
      reply = redactPHI(orchestrated.answer);
      service = { cue: serviceCue, source: "orchestrator" };
      /* Carried for the streaming path's response event, which surfaces what grounded the answer;
         the non-streaming JSON has never carried these and still does not. */
      toolsUsed = orchestrated.toolsUsed;
      sources = orchestrated.sources;
      console.log(
        `[gilbertone:orchestrator] ${sessionId} ${orchestrated.provider} ${orchestrated.toolsUsed.join(",") || "-"} ${orchestrated.ms}ms`,
      );
    }
  }

  const previous = state.turns[state.turns.length - 1];
  const nextTurn: Turn = {
    turnId: crypto.randomUUID(),
    parentTurnId:
      typeof req.parentTurnId === "string" && req.parentTurnId.length
        ? req.parentTurnId
        : (previous?.turnId ?? null),
    text: req.text,
    /* The reply this turn actually got — the classifier's fixed sentence, or the orchestrator's
       answer when that tier wrote it, already redacted above. This is what makes a later turn's
       context carry a real exchange rather than a label. */
    reply,
    classification: answer.classification,
    route: answer.route,
    timestamp: now,
    audience,
    slots: {},
  };
  sessions.write(sessionId, addTurn(state, nextTurn), now);

  audit(sessionId, answer.route, req.text);
  return {
    response: response(
      { ...answer, reply },
      sessionId,
      language,
      undefined,
      service,
    ),
    toolsUsed,
    sources,
  };
}

/* The non-streaming door, and the one every caller has always used: it runs the generator to
   completion, discards the classification yields it was never interested in, and returns the
   response — exactly the value the pre-streaming handler returned, from exactly the steps it ran,
   because those steps are the generator's body unchanged. */
export async function handleTurn(
  req: AssistantTurnRequest,
): Promise<AssistantTurnResponse> {
  const gen = runTurn(req);
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  return next.value.response;
}

/* The streaming door, added with the speed pass of 23 September 2026: the same generator, read as
   Server-Sent Events. The classifier's read goes out first, as it is yielded and before the
   orchestrator has finished, so a client sees the classification while the answer is still being
   composed; the full response follows as one event, carrying the two orchestrator facts — the tools
   used and the sources they stood on — that the JSON contract does not; then a `done` event closes
   the stream. This is response-level streaming, not token streaming: the orchestrator's compose
   node produces the final text as one piece, and true token streaming would mean hooking the
   model's own streaming interface inside the LangGraph, which this pass deliberately does not
   touch. A caller that does not ask to stream never reaches this door, and the web bridge does not. */
export async function* handleTurnStream(
  req: AssistantTurnRequest,
): AsyncGenerator<TurnStreamEvent> {
  const gen = runTurn(req);
  let next = await gen.next();
  while (!next.done) {
    yield { event: "classification", data: next.value };
    next = await gen.next();
  }
  const outcome = next.value;
  yield {
    event: "response",
    data: {
      ...outcome.response,
      toolsUsed: outcome.toolsUsed,
      sources: outcome.sources,
    },
  };
  yield { event: "done", data: {} };
}
