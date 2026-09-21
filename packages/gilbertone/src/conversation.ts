import type { Audience, MessageClassification } from "./engine.ts";

/* Conversation state for GilbertOne, as plain data and pure functions.

   The web keeps its conversation in memory and mints no session id; the assistant API is the
   first caller that needs one, because its turns arrive one request at a time and nothing else
   carries what was said before. This module is the smallest thing that can carry it: a session
   holds its turns, the latest actionable request, the slots something still has to fill, and the
   escalation state, and every function here returns a new state rather than writing to the one
   it was given — so a caller may keep its own copy, replay a session, or compare two.

   The escalation state follows the contract's own rule that an emergency is never lowered: a
   turn with an emergency classification raises it to 'active' and nothing here ever brings it
   back down; a handover request raises a quiet session to 'pending', because the nurse queue a
   handover offers has been asked for but not yet built. */

/** One exchange, as it was classified and routed when it happened. */
export interface Turn {
  turnId: string;
  parentTurnId: string | null;
  text: string;
  /* The reply this turn was given — the classifier's own sentence, or the orchestrator's answer
     when that tier wrote it. Added so a later turn's context can carry what was actually said,
     not only how it was classified; stored exactly as it was returned to the caller, which for an
     orchestrator answer is already redacted (turn.ts redacts the model's words before this turn is
     built), and for a classifier answer is one of the contract's own fixed sentences. */
  reply: string;
  classification: MessageClassification;
  route: string;
  timestamp: number;
  audience: Audience;
  slots: Record<string, string>;
}

/** Everything a session carries between requests. */
export interface ConversationState {
  sessionId: string;
  turns: Turn[];
  activeTask: string | null;
  unresolvedSlots: string[];
  escalationState: "none" | "pending" | "active";
  consentScope: string[];
}

/** One prior turn's words, as the context view carries them: what the patient said and what
 *  GilbertOne replied. */
export interface ConversationExchange {
  text: string;
  reply: string;
}

/** The small view of a session the classifier is given — never the whole history. */
export interface ConversationContext {
  recentClassifications: MessageClassification[];
  /* The last CONTEXT_TURNS turns' actual words, oldest first, the same window
     recentClassifications reads — added so a caller building a prompt for a model (never the
     keyword classifier, which only ever reads recentClassifications) can give it the conversation
     itself rather than a label. Callers still owe this the same redaction discipline a fresh
     message gets before it reaches a model; this view carries the words exactly as the turn
     stored them. */
  recentExchanges: ConversationExchange[];
  activeTask: string | null;
  turnCount: number;
}

/* Twenty turns is the cap the API's session store keeps per session: enough for the shape of a
   conversation, and bounded so a single session can never grow without a ceiling. */
export const TURN_LIMIT = 20;

/* The classifier reads the last five classifications when it weighs confidence, and the
   context view carries exactly that many, derived from the turns rather than stored twice. */
export const CONTEXT_TURNS = 5;

export function createConversation(sessionId: string): ConversationState {
  return {
    sessionId,
    turns: [],
    activeTask: null,
    unresolvedSlots: [],
    escalationState: "none",
    consentScope: [],
  };
}

/* Append one turn, newest last, dropping the oldest past TURN_LIMIT. Immutable: the state that
   was passed in is untouched, and the returned state is a new object down to the turn array. */
export function addTurn(
  state: ConversationState,
  turn: Turn,
): ConversationState {
  const turns = [...state.turns, turn].slice(-TURN_LIMIT);
  const escalationState =
    turn.classification === "emergency"
      ? "active"
      : turn.classification === "handover" && state.escalationState === "none"
        ? "pending"
        : state.escalationState;
  /* Care and handover are the two classifications that name something to do; a later question
     does not forget the task, and neither does a clarification. */
  const activeTask =
    turn.classification === "care" || turn.classification === "handover"
      ? turn.classification
      : state.activeTask;
  return { ...state, turns, activeTask, escalationState };
}

/* The derived view: the last five classifications in order, the active task, and the count. */
export function getContext(state: ConversationState): ConversationContext {
  const recent = state.turns.slice(-CONTEXT_TURNS);
  return {
    recentClassifications: recent.map((turn) => turn.classification),
    recentExchanges: recent.map((turn) => ({ text: turn.text, reply: turn.reply })),
    activeTask: state.activeTask,
    turnCount: state.turns.length,
  };
}

/* True while human help has been raised for this session — either because a turn carried an
   emergency word or because the escalation state was set to active directly. A turn history
   that contains an emergency is never read as anything else. */
export function hasActiveEscalation(state: ConversationState): boolean {
  return (
    state.escalationState === "active" ||
    state.turns.some((turn) => turn.classification === "emergency")
  );
}

/* Record a value for a slot and strike the slot off the waiting list. The value goes on the
   newest turn — the one that asked for it — and the unresolved list loses the name. Both are
   parts of one returned state; the state passed in is untouched. */
export function resolveSlot(
  state: ConversationState,
  slotName: string,
  value: string,
): ConversationState {
  const newest = state.turns[state.turns.length - 1];
  const turns = newest
    ? [
        ...state.turns.slice(0, -1),
        { ...newest, slots: { ...newest.slots, [slotName]: value } },
      ]
    : state.turns;
  return {
    ...state,
    turns,
    unresolvedSlots: state.unresolvedSlots.filter((slot) => slot !== slotName),
  };
}
