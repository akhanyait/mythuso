import type { Audience } from "../../../../packages/gilbertone/src/engine.ts";

export type AssistantTurnRequest = {
  sessionId?: string;
  /* The turn this one follows, when the caller keeps its own chain. Left out, the server links
     the turn to the previous one in the session it holds. */
  parentTurnId?: string;
  text: string;
  visitId?: string;
  /* Declared by the caller, never authenticated — the audience decision of 19 September 2026. */
  audience?: Audience;
  userConsent: boolean;
  /* Opt-in Server-Sent Events, added with the speed pass of 23 September 2026 and declared at
     POST /v1/turn@2. Absent or false — the default, and what every caller that predates it sends,
     the web bridge included — the turn is answered with the one JSON response it has always been;
     true asks the /v1/turn route to stream the classifier's read early and the answer when it is
     ready, as text/event-stream instead. handleTurn ignores it; only the streaming door reads it. */
  stream?: boolean;
};

export type AssistantTurnResponse = {
  turnId: string;
  /* Minted by the server when the request carried none, so every response names the conversation
     it belongs to and a caller can continue it. */
  sessionId: string;
  route: "emergency" | "handover" | "standard" | "clarify" | "unknown";
  classification:
    | "emergency"
    | "handover"
    | "identity"
    | "voice"
    | "care"
    /* Added with the engine's greeting classification: a message that is only a hello is answered
       warmly rather than matched, and its route stays 'standard'. */
    | "greeting"
    | "clarify"
    | "unknown";
  reply: string;
  style: "supportive" | "neutral" | "clarifying" | "concise";
  /* The classifier's own weight behind the classification, 0 to 1. */
  confidence: number;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  /* Present only when a refusal policy answered instead of the classifier — the id of the
     policy in packages/catalog/assistant.json's refusalPolicies. */
  refusalId?: string;
  /* Which tier wrote the reply, since the two-tier upgrade of 20 September 2026: the keyword
     classifier, the language model consulted when the classifier found nothing it knows, or —
     since the orchestrator upgrade of 21 September 2026 — the LangChain agent tier with its
     catalog tools, in the same seat. Absent means the classifier's — every reply that existed
     before this field did, the refusals and the clarify ask included, so a caller that ignores
     the field sees exactly what it saw before it existed. */
  source?: "classifier" | "model" | "orchestrator";
  /* With a model-written reply, the face the contract's affect section gives the service
     answer, read from packages/catalog/assistant.json — so a client can wear the same face
     the web panel does without typing a cue id of its own. */
  cue?: string;
};
