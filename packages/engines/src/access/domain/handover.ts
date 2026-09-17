/* Handing a GilbertOne conversation to the nurse queue.

   ── What goes, and what never does ───────────────────────────────────────────────────────────────

   A structured summary: how the person asked, which of GilbertOne's approved questions it matched, and
   an urgency code. Not the words. conversation.handover@1 refuses the transcript and the symptoms, and
   so does the summary behind it: what a patient typed stays in the conversation, for the conversation,
   and a nurse needs to know why she is calling rather than to read somebody's messages. Not which
   emergency words fired either. A group id can be crisis, and a crisis mention joined to a person is a
   record of it — the reason the first version of pulse.utterance.finalised was withdrawn. The urgency says that an
   emergency was raised, never which.

   ── Why the urgency only ever rises ──────────────────────────────────────────────────────────────

   GilbertOne assesses nothing, so there are two codes and neither is calm. An emergency word anywhere in
   the conversation is `emergency`; everything else is `not-assessed`, because no emergency word is not
   a finding that something is not urgent. A later handover in the same conversation may raise the
   urgency and never lowers it: an emergency at the first message and a calm "can I talk to a nurse" at
   the tenth is still an emergency. That is the Access engine's refusal answer-lowers-an-emergency,
   enforced by arithmetic on a rank rather than by a sentence.

   ── Where it goes ────────────────────────────────────────────────────────────────────────────────

   To a simulated nurse queue. No nurse is on the other end, the summary entry is not written to any
   record, and the references say SIM- so a screenshot cannot be mistaken for a real handover. A
   handover without a summary does not go at all — the route's own no-summary refusal. */
import assistant from '../../../../catalog/assistant.json' with { type: 'json' };
import { ROUTES, accept, nowInstant, routeRefusal, simulatedRef, type AccessEvent, type Outcome } from './contract.ts';

export type UrgencyCode = 'emergency' | 'not-assessed';
export type ChannelCode = 'typed' | 'spoken' | 'chosen' | 'none';

/* The order the codes rise in is the order the contract lists them, most urgent first. */
const urgencies = assistant.answers.handover.urgency.map(u => u.id) as UrgencyCode[];
const rank = (code: UrgencyCode) => urgencies.length - urgencies.indexOf(code);
/** Whether a code is one the assistant contract lists. One it does not is an urgency nobody can rank, and so one nobody can keep from being lowered. */
export const isUrgency = (code: string): code is UrgencyCode => (urgencies as string[]).includes(code);

/** One turn of a conversation, as the summary is allowed to see it: never what was said. */
export type ConversationTurn = {
 readonly channel: 'typed' | 'spoken' | 'chosen' | null;
 /** An approved question's id from packages/catalog/assistant.json, or null when nothing matched. */
 readonly matchedQuestionId: string | null;
 /** The turn asked for a nurse, so it is not itself what a nurse needs to read. */
 readonly askedForNurse: boolean;
 /** The emergency answer was shown for this turn. Whether, never which. */
 readonly emergency: boolean;
};

export type HandoverSummary = { readonly channelCode: ChannelCode; readonly matchedQuestionId: string | null; readonly emergencyLast: boolean; readonly urgencyCode: UrgencyCode };

export function summarise(turns: readonly ConversationTurn[]): HandoverSummary {
 const last = [...turns].reverse().find(t => t.channel !== null && !t.askedForNurse);
 return {
  channelCode: last?.channel ?? 'none',
  matchedQuestionId: last?.matchedQuestionId ?? null,
  emergencyLast: last?.emergency ?? false,
  urgencyCode: turns.some(t => t.emergency) ? 'emergency' : 'not-assessed'
 };
}

export type Handover = {
 readonly handoverRef: string;
 readonly conversationRef: string;
 readonly summaryEntryRef: string;
 readonly urgencyCode: UrgencyCode;
 /** The summary as the device made it, or null on the engine, which is handed the urgency and the entry and never the conversation. */
 readonly summary: HandoverSummary | null;
 readonly at: string;
};
export type Queue = { readonly handovers: readonly Handover[] };
export const emptyQueue: Queue = { handovers: [] };

export type HandoverRequest = {
 readonly conversationRef: string;
 readonly summary: HandoverSummary | null;
 readonly actorRole: string;
 readonly subjectRef: string;
 readonly now: Date;
};

type Handed = Outcome<{ queue: Queue; handover: Handover; sentNow: boolean }>;

/** The result says whether this call sent anything, so a screen can say "already handed over" truthfully. */
export function handOver(queue: Queue, request: HandoverRequest): Handed {
 if (!request.conversationRef || !request.summary) return routeRefusal(ROUTES.handover, 'no-summary');
 return queueHandover(queue, { ...request, summaryEntryRef: null, urgencyCode: request.summary.urgencyCode });
}

/* What POST /v1/access/conversations/{conversationRef}/handover@2 is handed: the urgency as a code the rules set
   on the device, and the summary entry the device wrote, because the engine holds no conversation to summarise.
   The code is refused unless the assistant contract lists it; the rank is the same one the device's handOver
   keeps, so the engine and the screen agree that nothing sent afterwards lowers an emergency. */
export type QueuedHandover = {
 readonly conversationRef: string;
 /** The summary entry the device wrote to the record, or null for the preview, which writes none and names a simulated one. */
 readonly summaryEntryRef: string | null;
 readonly urgencyCode: string;
 readonly summary?: HandoverSummary | null;
 readonly actorRole: string;
 readonly subjectRef: string;
 readonly now: Date;
};

export function queueHandover(queue: Queue, request: QueuedHandover): Handed {
 if (!request.conversationRef || request.summaryEntryRef === '') return routeRefusal(ROUTES.handover, 'no-summary');
 if (!isUrgency(request.urgencyCode)) return routeRefusal(ROUTES.handover, 'urgency-not-listed');
 const urgencyCode = request.urgencyCode;
 const held = queue.handovers.find(h => h.conversationRef === request.conversationRef);
 /* Never lowered: an equal or calmer urgency for a conversation already handed over sends nothing, and
    what the queue holds keeps the higher code. */
 if (held && rank(urgencyCode) <= rank(held.urgencyCode)) return accept({ queue, handover: held, sentNow: false });
 const at = nowInstant(request.now);
 const seed = `${request.conversationRef}|${urgencyCode}|${at}`;
 const handover: Handover = {
  handoverRef: simulatedRef('HO', seed),
  conversationRef: request.conversationRef,
  summaryEntryRef: request.summaryEntryRef ?? simulatedRef('ENTRY', seed),
  urgencyCode,
  summary: request.summary ?? null,
  at
 };
 const event: AccessEvent = {
  type: 'conversation.handover', version: 1, actorRole: request.actorRole, subjectRef: request.subjectRef, occurredAt: at,
  payload: { conversationRef: handover.conversationRef, summaryEntryRef: handover.summaryEntryRef, urgencyCode: handover.urgencyCode }
 };
 const rest = queue.handovers.filter(h => h.conversationRef !== request.conversationRef);
 return accept({ queue: { handovers: [...rest, handover] }, handover, sentNow: true }, [event]);
}

export const urgencyWords = (code: UrgencyCode) => assistant.answers.handover.urgency.find(u => u.id === code)!;
