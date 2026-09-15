/* Handing a Gilbert conversation to the nurse queue.

   ── What goes, and what never does ───────────────────────────────────────────────────────────────

   A structured summary: how the person asked, which of Gilbert's approved questions it matched, and
   an urgency code. Not the words. conversation.handover@1 refuses the transcript and the symptoms, and
   so does the summary behind it: what a patient typed stays in the conversation, for the conversation,
   and a nurse needs to know why she is calling rather than to read somebody's messages. Not which
   emergency words fired either. A group id can be crisis, and a crisis mention joined to a person is a
   record of it — the reason pulse.utterance.finalised@1 was withdrawn. The urgency says that an
   emergency was raised, never which.

   ── Why the urgency only ever rises ──────────────────────────────────────────────────────────────

   Gilbert assesses nothing, so there are two codes and neither is calm. An emergency word anywhere in
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
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import type { Window } from '../../settings/shape.ts';
import { ROUTES, accept, isoIn, nowInstant, routeRefusal, simulatedRef, type AccessEvent, type Outcome } from './contract.ts';

export type UrgencyCode = 'emergency' | 'not-assessed';
export type ChannelCode = 'typed' | 'spoken' | 'chosen' | 'none';

/* The order the codes rise in is the order the contract lists them, most urgent first. */
const urgencies = assistant.answers.handover.urgency.map(u => u.id) as UrgencyCode[];
const rank = (code: UrgencyCode) => urgencies.length - urgencies.indexOf(code);

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
 readonly summary: HandoverSummary;
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

/** The result says whether this call sent anything, so a screen can say "already handed over" truthfully. */
export function handOver(queue: Queue, request: HandoverRequest): Outcome<{ queue: Queue; handover: Handover; sentNow: boolean }> {
 if (!request.conversationRef || !request.summary) return routeRefusal(ROUTES.handover, 'no-summary');
 const held = queue.handovers.find(h => h.conversationRef === request.conversationRef);
 /* Never lowered: an equal or calmer summary for a conversation already handed over sends nothing, and
    what the queue holds keeps the higher code. */
 if (held && rank(request.summary.urgencyCode) <= rank(held.urgencyCode)) return accept({ queue, handover: held, sentNow: false });
 const at = nowInstant(request.now);
 const seed = `${request.conversationRef}|${request.summary.urgencyCode}|${at}`;
 const handover: Handover = {
  handoverRef: simulatedRef('HO', seed),
  conversationRef: request.conversationRef,
  summaryEntryRef: simulatedRef('ENTRY', seed),
  urgencyCode: request.summary.urgencyCode,
  summary: request.summary,
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

/* ── When the handover desk answers ───────────────────────────────────────────────────────────────

   The hours are Access's setting handover-hours, handed in as they stand when Gilbert is asked. This
   answers two questions about a moment in Johannesburg — not in whatever zone the device is set to — and
   nothing else: whether a window of the rota is open, and when the next one opens. What Gilbert says out
   of hours is the screen's, from packages/catalog/booking.json, and it always starts with nobody being
   there and the emergency numbers; this function has no way to leave either out, because it returns no
   words at all. A rota with no window is refused as a setting, so an opening is always found within a
   week; null is returned only for a rota that could never be in force. */
export type DeskOpening = {
 /** 0 for later today, 1 for tomorrow, and so on. */
 readonly daysAhead: number;
 /** The ISO date it opens on, in Johannesburg. */
 readonly date: string;
 readonly from: string;
};
export type Desk = { readonly open: boolean; readonly opens: DeskOpening | null };

const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: scheduling.timezone, weekday: 'short' });
const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: scheduling.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const minuteOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function deskAt(windows: readonly Window[], at: Date): Desk {
 const nowMinute = minuteOf(CLOCK.format(at));
 const today = WEEKDAY.format(at).slice(0, 3).toLowerCase();
 const open = windows.some(w => w.days.includes(today) && minuteOf(w.from) <= nowMinute && nowMinute < minuteOf(w.to));
 for (let ahead = 0; ahead <= 7; ahead++) {
  const day = new Date(at.getTime() + ahead * DAY_MS);
  const id = WEEKDAY.format(day).slice(0, 3).toLowerCase();
  const starts = windows.filter(w => w.days.includes(id) && (ahead > 0 || minuteOf(w.from) > nowMinute)).map(w => w.from).sort();
  if (starts.length) return { open, opens: { daysAhead: ahead, date: isoIn(day), from: starts[0]! } };
 }
 return { open, opens: null };
}
