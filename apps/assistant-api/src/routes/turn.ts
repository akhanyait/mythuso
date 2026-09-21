import {
  audiences,
  buildResponse,
  classifyWithConfidence,
  type Audience,
  type EngineResponse,
} from "../../../../packages/gilbertone/src/engine.ts";
import {
  addTurn,
  createConversation,
  getContext,
  type ConversationContext,
  type ConversationState,
  type Turn,
} from "../../../../packages/gilbertone/src/conversation.ts";
import { evaluateRefusals } from "../../../../packages/gilbertone/src/refusals.ts";
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";
import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };
import { orchestrate } from "../lib/orchestrator.ts";
import type {
  AssistantTurnRequest,
  AssistantTurnResponse,
} from "../lib/schema.ts";

/* The session store, since the Phase A upgrade of 19 September 2026.

   Turns arrive one request at a time, so continuity has to live somewhere between them. It lives
   here, in memory, and nowhere else: nothing is written to disk and nothing survives a restart,
   which is the same promise the web's panel keeps — a conversation, not a record. The two numbers
   are the store's whole policy: a session nobody has asked about for half an hour is evicted,
   and the map can never hold more than a thousand sessions, oldest first out. The request's own
   sessionId names a conversation and never a person; a request without one gets a fresh session
   and its id back, so a caller can keep the thread without ever having been given an identity. */

const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_LIMIT = 1000;

type SessionEntry = { state: ConversationState; lastActive: number };

const sessions = new Map<string, SessionEntry>();

/* Evict what nobody is asking about — first anything idle, then the oldest entries — and leave
   room for the one session this request may create or refresh after it runs. */
function pruneSessions(now: number): void {
  for (const [id, entry] of sessions)
    if (now - entry.lastActive > SESSION_IDLE_MS) sessions.delete(id);
  if (sessions.size < SESSION_LIMIT) return;
  const oldestFirst = [...sessions.entries()].sort(
    (a, b) => a[1].lastActive - b[1].lastActive,
  );
  for (const [id] of oldestFirst) {
    if (sessions.size < SESSION_LIMIT) return;
    sessions.delete(id);
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

/* The audit line: one line per processed message, the message redacted first. This is the only
   place a turn's words leave the session, and no line ever carries an identity number, a phone
   number, an email address or a medical aid number — the redactor runs before the writer. */
const audit = (sessionId: string, route: string, text: string): void => {
  console.log(`[gilbertone] ${sessionId} ${route} | ${redactPHI(text)}`);
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
   exactly the response it saw before they existed. */
const response = (
  turn: EngineResponse,
  sessionId: string,
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
});

export async function handleTurn(
  req: AssistantTurnRequest,
): Promise<AssistantTurnResponse> {
  const sessionId =
    typeof req?.sessionId === "string" && req.sessionId.trim()
      ? req.sessionId
      : crypto.randomUUID();

  /* The engine's own classification of '' is 'unknown', which is right for a low-level classifier
     with nothing to go on. At this boundary "nothing was said" is not the same fact as "the
     message could not be classified", and a caller who typed or spoke nothing deserves to be asked
     for one, not told the assistant is uncertain about a message it never received. */
  if (!req || typeof req.text !== "string" || !req.text.trim()) {
    return {
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
    };
  }

  /* The audience is declared by the caller, never authenticated — the same rule the demo login's
     role parameter follows — and a value the engine does not carry means the patient's, because
     that is what a request without one means. */
  const asked = req.audience;
  const audience: Audience =
    typeof asked === "string" &&
    (audiences as readonly string[]).includes(asked)
      ? asked
      : "patient";

  const now = Date.now();
  pruneSessions(now);
  const held = sessions.get(sessionId);
  const state = held ? held.state : createConversation(sessionId);
  const context = getContext(state);

  /* Refusals are asked before the classifier, and before the turn joins the session: a message a
     policy refuses was not classified, and the transcript should not claim otherwise. Consent is
     among them now — the sentence the withheld-consent caller reads is the catalog's
     consent-required policy, while the route, the confirmation flag and the one action it
     suggests stay exactly what they were. */
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
    sessions.set(sessionId, { state, lastActive: now });
    audit(sessionId, refusal.refusalId ?? "refused", req.text);
    return response(
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
      refusal.refusalId,
    );
  }

  /* The classifier with the session behind it. buildResponse gives the contract's replies, and
     the context-aware call gives the confidence the context may lift; both read the same message,
     so the classification cannot differ between them — only the weight beside it. */
  const engine = buildResponse(req.text, audience);
  const { confidence } = classifyWithConfidence(req.text, audience, context);
  const answer: EngineResponse = { ...engine, confidence };

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
  if (mayConsultOrchestrator) {
    const orchestrated = await orchestrate(redactPHI(req.text), {
      lines: contextLines(context),
    });
    if (!orchestrated.degraded && orchestrated.answer) {
      /* The model's words pass the same redactor the audit line does. The refusal policies are
         deliberately not re-applied to the output: their patterns are question-shaped ("do I
         have", "should I take"), and an answer that correctly says "this is not a diagnosis"
         trips one — the input side already gated the model, and the answers.service heading the
         panel draws around these words carries the disclosure on the output side. */
      reply = redactPHI(orchestrated.answer);
      service = { cue: serviceCue, source: "orchestrator" };
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
       answer when that tier wrote it, already redacted at line ~244 above. This is what makes a
       later turn's context carry a real exchange rather than a label. */
    reply,
    classification: answer.classification,
    route: answer.route,
    timestamp: now,
    audience,
    slots: {},
  };
  sessions.set(sessionId, { state: addTurn(state, nextTurn), lastActive: now });

  audit(sessionId, answer.route, req.text);
  return response({ ...answer, reply }, sessionId, undefined, service);
}
