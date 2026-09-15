import { useSyncExternalStore } from 'react';
import closedLoop from '../../../../packages/catalog/closed-loop.json' with { type: 'json' };
import { MINUTE_MS, closeRefusal, settle, type CloseRefusal, type Loop, type Skip } from '../../../../packages/engines/src/core/domain/loops.ts';
import { escalationRotaNow } from './settings';

/* The Control Tower's concerns in the web preview: one store, in memory, for the board that reads it.
 *
 * Every rule is the engine's. This file holds the concerns, moves the clock and hands each concern to
 * packages/engines/src/core/domain/loops.ts, which says who it goes to, what it skips and when it runs out
 * of people. It holds them in memory and nowhere else: this app may not persist anything, so a reload
 * forgets every concern, which is true of the preview and would be a defect in the product.
 *
 * THE ROTA IS THE ONE IN FORCE, READ ONCE PER CONCERN. A concern is opened with escalationRotaNow(), from
 * lib/settings.ts, which the back office's Configuration tab changes, and keeps what it was handed. So a
 * rota or a minute changed in the back office reaches the next concern this preview opens, and never one
 * already on the board; and nothing here types a post, a role or a minute.
 *
 * THE BOARD IS SEEDED BY RUNNING THE ARITHMETIC AT EARLIER TIMES. packages/catalog/closed-loop.json's preview
 * names each concern and how long before the board is first read it was opened. Each is opened then, under
 * the rota in force when the board is first read, and settled forward to now, so where it is, what it
 * skipped and when it moves up are arithmetic and cannot disagree with the rules.
 *
 * Nothing crosses tabs or devices, nobody is paged, and the board says so in the contract's sentence.
 */
export type Skipped = Skip & { readonly at: number };
export type ConcernState = { readonly loops: readonly Loop[]; readonly skipped: Readonly<Record<string, readonly Skipped[]>>; readonly now: number };

const TICK_MS = closedLoop.preview.tickEverySeconds * 1000;
let state: ConcernState | undefined;
const listeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;

/* Every deadline that has passed, acted on at its own moment, with every post passed over kept beside the
   concern for the board to say so. */
function advance(from: ConcernState, now: number): ConcernState {
 const skipped: Record<string, readonly Skipped[]> = { ...from.skipped };
 const loops = from.loops.map(loop => {
  const steps = settle(loop, now);
  for (const step of steps) if (step.skipped.length) skipped[loop.loopRef] = [...(skipped[loop.loopRef] ?? []), ...step.skipped.map(skip => ({ ...skip, at: step.at }))];
  return steps.at(-1)?.loop ?? loop;
 });
 return { loops, skipped, now };
}

function seed(now: number): ConcernState {
 const rota = escalationRotaNow();
 const loops = closedLoop.preview.concerns.map((concern): Loop => {
  const openedAt = now - concern.openedMinutesAgo * MINUTE_MS;
  const spanMs = concern.spanMinutes * MINUTE_MS;
  return {
   loopRef: concern.loopRef, sourceEngine: concern.sourceEngine, purpose: concern.purpose, ownerRole: concern.ownerRole, fallbackRole: concern.fallbackRole,
   holder: { kind: 'owner' }, rota, alerted: null, severity: null, openedAt, dueBy: openedAt + spanMs, spanMs,
   acknowledgedAt: null, acknowledgedByRole: null, exhaustedAt: null, announcedAt: null, closedAt: null, outcomeRef: null, outcomeCode: null, closedByRole: null,
   alertRef: null, rung: null, dedupeKey: null, recordEntryRef: null
  };
 });
 return advance({ loops, skipped: {}, now }, now);
}

/* Closing a concern in the preview, by the rule the engine's close route refuses by: loops.ts's closeRefusal,
   with the outcomes closed-loop.json lists. The caller's role is handed in by the board, which reads it from
   the workspace rather than typing one here. A refusal changes nothing and is handed back by id, for the board
   to say in the route's own sentence. The outcome is recorded on the concern itself, as the engine records
   one nobody keeps anywhere else. */
const OUTCOMES = new Set(closedLoop.outcomes.value.map(outcome => outcome.id));
export function closeConcern(loopRef: string, outcomeCode: string, byRole: string): CloseRefusal | null {
 const from = advance(current(), Date.now());
 const loop = from.loops.find(candidate => candidate.loopRef === loopRef);
 if (!loop) return 'loop-closed';
 const refused = closeRefusal(loop, outcomeCode, OUTCOMES);
 if (refused) return refused;
 const closed: Loop = { ...loop, closedAt: from.now, outcomeRef: loop.loopRef, outcomeCode: outcomeCode.trim(), closedByRole: byRole };
 commit({ ...from, loops: from.loops.map(candidate => candidate.loopRef === loopRef ? closed : candidate) });
 return null;
}

/* A concern another engine's preview hands the board, opened the way Core opens one from an event it hears: under the
   rota in force now, which the concern keeps, with the owner, fallback, time and alert fields the caller read from
   packages/engines/src/core/domain/contract.ts. Sentinel's tier three and a safeguarding report arrive this way. One key
   from one engine is one concern while it is open, however often it is handed in. Added by the Safety lead, Wave 5. */
export type Opening = {
 readonly loopRef: string; readonly sourceEngine: string; readonly purpose: string; readonly ownerRole: string; readonly fallbackRole: string;
 readonly spanMs: number; readonly dedupeKey: string; readonly alert?: { readonly alertRef: string; readonly rung: number; readonly recordEntryRef: string | null };
};
export function openConcern(opening: Opening): Loop {
 const from = advance(current(), Date.now());
 const open = from.loops.find(loop => loop.closedAt === null && loop.sourceEngine === opening.sourceEngine && loop.dedupeKey === opening.dedupeKey);
 if (open) return open;
 const loop: Loop = {
  loopRef: opening.loopRef, sourceEngine: opening.sourceEngine, purpose: opening.purpose, ownerRole: opening.ownerRole, fallbackRole: opening.fallbackRole,
  holder: { kind: 'owner' }, rota: escalationRotaNow(), alerted: null, severity: null, openedAt: from.now, dueBy: from.now + opening.spanMs, spanMs: opening.spanMs,
  acknowledgedAt: null, acknowledgedByRole: null, exhaustedAt: null, announcedAt: null, closedAt: null, outcomeRef: null, outcomeCode: null, closedByRole: null,
  alertRef: opening.alert?.alertRef ?? null, rung: opening.alert?.rung ?? null, dedupeKey: opening.dedupeKey, recordEntryRef: opening.alert?.recordEntryRef ?? null
 };
 commit({ ...from, loops: [...from.loops, loop] });
 return loop;
}

const current = () => (state ??= seed(Date.now()));
function commit(next: ConcernState) {
 state = next;
 for (const listener of listeners) listener();
}
export function subscribe(listener: () => void) {
 current();
 listeners.add(listener);
 if (!clock) clock = setInterval(() => commit(advance(current(), Date.now())), TICK_MS);
 /* Catch up at once rather than on the next beat, so a board opened a while after the last one closed
    shows where each concern is now. */
 queueMicrotask(() => commit(advance(current(), Date.now())));
 return () => {
  listeners.delete(listener);
  if (!listeners.size && clock) { clearInterval(clock); clock = undefined; }
 };
}
export const concernsNow = () => current();
export const useConcerns = () => useSyncExternalStore(subscribe, concernsNow, concernsNow);
