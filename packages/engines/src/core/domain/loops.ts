/* The closed loop's arithmetic, with no store and no bus: when a concern moves to its fallback, when it
 * has run out of people to move to, and the order the Control Tower reads concerns in.
 *
 * ── Why escalation stops at the fallback ─────────────────────────────────────────────────────────────
 *
 * The documents say an unacknowledged concern goes "to the next person on the rota". No rota exists, so
 * a concern has an owner and one fallback and nothing after them. When the fallback's deadline passes as
 * well, the concern is exhausted: it keeps its owner, stays open, and records when. Nothing here closes
 * it, snoozes it or moves it down a rung — a concern with nobody left is the one that most needs a
 * person, and every way of making it quieter is a way of that person never being found.
 *
 * ── Why an acknowledged concern does not escalate ────────────────────────────────────────────────────
 *
 * "Unacknowledged items escalate automatically." A concern somebody has taken on is waiting for its
 * outcome, and the clock that moves it is the acknowledgement's. The desk can still move it by hand. */

export type Loop = {
 loopRef: string;
 sourceEngine: string;
 /** The purpose it was opened under, which every later event about it carries. */
 purpose: string;
 ownerRole: string;
 fallbackRole: string;
 /** Whether it has already moved to its fallback. There is nobody after the fallback. */
 escalated: boolean;
 openedAt: number;
 dueBy: number;
 /** The time its first owner was given, which is the time its fallback is given. */
 spanMs: number;
 acknowledgedAt: number | null;
 acknowledgedByRole: string | null;
 exhaustedAt: number | null;
 /** When the announcement that it is exhausted was accepted by the bus; null while it has not been. */
 announcedAt: number | null;
 closedAt: number | null;
 outcomeRef: string | null;
 closedByRole: string | null;
 /** Present when the concern is an alert: its reference, rung, key and record entry. */
 alertRef: string | null;
 rung: number | null;
 dedupeKey: string | null;
 recordEntryRef: string | null;
};

export type StateCode = 'open' | 'acknowledged' | 'exhausted' | 'closed';

export const isOpen = (loop: Loop): boolean => loop.closedAt === null;

export const stateCodeOf = (loop: Loop): StateCode =>
 loop.closedAt !== null ? 'closed' : loop.exhaustedAt !== null ? 'exhausted' : loop.acknowledgedAt !== null ? 'acknowledged' : 'open';

/** Whether there is anybody left to move this concern to. */
export const canMove = (loop: Loop): boolean => !loop.escalated && loop.exhaustedAt === null;

/** What the clock does to a concern now: move it to its fallback, mark it exhausted, or nothing. */
export function dueAction(loop: Loop, now: number): 'escalate' | 'exhaust' | null {
 if (loop.closedAt !== null || loop.acknowledgedAt !== null || loop.exhaustedAt !== null || now < loop.dueBy) return null;
 return canMove(loop) ? 'escalate' : 'exhaust';
}

/** The concern with its fallback: a new owner who has not acknowledged it, given the first owner's time. */
export const escalated = (loop: Loop, now: number): Loop => ({
 ...loop, ownerRole: loop.fallbackRole, escalated: true, acknowledgedAt: null, acknowledgedByRole: null, dueBy: now + loop.spanMs
});

/* Exhausted first, longest exhausted at the top; then what nobody has acknowledged, nearest deadline
   first; then what somebody has. Closed concerns are not read. */
const groups: readonly ((loop: Loop) => boolean)[] = [loop => loop.exhaustedAt !== null, loop => loop.acknowledgedAt === null, () => true];
const groupOf = (loop: Loop) => groups.findIndex(inGroup => inGroup(loop));

export function towerOrder(loops: readonly Loop[]): Loop[] {
 return loops.filter(isOpen).sort((a, b) => {
  const byGroup = groupOf(a) - groupOf(b);
  if (byGroup) return byGroup;
  const byTime = groupOf(a) === 0 ? a.exhaustedAt! - b.exhaustedAt! : a.dueBy - b.dueBy;
  return byTime || a.openedAt - b.openedAt;
 });
}
