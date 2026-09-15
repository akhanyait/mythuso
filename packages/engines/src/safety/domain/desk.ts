/* The desk's queue: overdue check-ins and panics, in the order a person should pick them up.
 *
 * Worked out from the timers and panics rather than kept, so the queue cannot disagree with them.
 * A panic nobody has picked up comes first, then an overdue nobody has picked up, then everything
 * the desk already has, then what is closed. Oldest first inside each, because the one that has been
 * waiting longest is the one most likely to have gone wrong.
 *
 * WHAT IT CARRIES IS THE CONTRACT'S LIST, EXACTLY. packages/catalog/field-safety.json names the keys
 * (desk.carries) and the three it never carries: the service, the patient and the address. The
 * service is the dangerous one — a row reading "Family planning" or "Mental-health check-in" is a
 * disclosure to everybody standing behind the desk — and a Timer holds a serviceId, so this function
 * is the one place it could leak. The node test compares the keys of every row with the contract.
 *
 * Who the nurse is and which suburb she works in are handed in by the caller from the roster: the
 * engine holds references, and the desk needs a name.
 */
import { MINUTE, outcomes, silenceReasons } from './rules.ts';
import type { DeskHand, Timer } from './checkins.ts';
import { isSharing, sharingEndsAt, type Panic } from './panics.ts';

export type DeskItem = {
 readonly kind: 'panic' | 'overdue';
 readonly reference: string;
 readonly nurse: string;
 readonly suburb: string;
 readonly raisedAt: number;
 readonly ageMinutes: number;
 readonly acknowledgement: DeskHand | null;
 readonly answeredAt: number | null;
 readonly outcome: string | null;
 readonly sharingEndsAt: number | null;
 readonly sharing: boolean;
 readonly open: boolean;
};
export type Who = (nurseRef: string) => { readonly nurse: string; readonly suburb: string };

const rank = (item: DeskItem) => !item.open ? 3 : item.acknowledgement ? 2 : item.kind === 'panic' ? 0 : 1;

export function deskQueue(timers: readonly Timer[], panics: readonly Panic[], now: number, who: Who): DeskItem[] {
 const fromPanics = panics.map((panic): DeskItem => {
  const { nurse, suburb } = who(panic.nurseRef);
  return {
   kind: 'panic', reference: panic.panicRef, nurse, suburb, raisedAt: panic.raisedAt,
   ageMinutes: Math.max(0, Math.floor((now - panic.raisedAt) / MINUTE)),
   acknowledgement: panic.acknowledged, answeredAt: null,
   outcome: panic.resolved ? outcomes.find(entry => entry.id === panic.resolved!.outcomeId)?.label ?? null : null,
   sharingEndsAt: sharingEndsAt(panic), sharing: isSharing(panic, now), open: !panic.resolved
  };
 });
 const fromTimers = timers.flatMap((timer): DeskItem[] => {
  const episode = timer.overdue;
  if (!episode) return [];
  const { nurse, suburb } = who(timer.nurseRef);
  return [{
   kind: 'overdue', reference: timer.checkinRef, nurse, suburb, raisedAt: episode.since,
   ageMinutes: Math.max(0, Math.floor((now - episode.since) / MINUTE)),
   acknowledgement: episode.acknowledged, answeredAt: episode.answeredAt,
   outcome: episode.silenced ? silenceReasons.find(entry => entry.id === episode.silenced!.reasonId)?.label ?? null : null,
   sharingEndsAt: null, sharing: false, open: !episode.silenced
  }];
 });
 return [...fromPanics, ...fromTimers].sort((a, b) => rank(a) - rank(b) || a.raisedAt - b.raisedAt);
}

/** The two figures a desk strip may show, counted off the queue. */
export const deskCounts = (queue: readonly DeskItem[]) => ({
 waiting: queue.filter(item => item.open && !item.acknowledgement).length,
 open: queue.filter(item => item.open).length,
 panics: queue.filter(item => item.open && item.kind === 'panic').length
});
