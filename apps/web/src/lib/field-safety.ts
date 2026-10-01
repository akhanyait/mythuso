import { useSyncExternalStore } from 'react';
import { MINUTE, deskRoles, fieldSafety, refusal, serviceMinutes, type Refusal, type Result } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { acknowledgeOverdue, checkIn, close, completeVisit, extend, silenceOverdue, startTimer, tick, type Timer } from '../../../../packages/engines/src/safety/domain/checkins.ts';
import { acknowledge, isSharing, openPanicFor, positionFor, raisePanic, receivePosition, resolve, sweep, type DeskActor, type Panic, type Position } from '../../../../packages/engines/src/safety/domain/panics.ts';
import { deskQueue, type DeskItem } from '../../../../packages/engines/src/safety/domain/desk.ts';
import { zoneOverlay, proportionOf, countsSentence, kindsSentence, nothingOpenSentence, overlayCounts, totalsSentence, type ZoneOpen } from '../../../../packages/engines/src/safety/domain/zone-overlay.ts';
import { nurseById, rosterNurses, rosteredIn } from './roster';
import { panicWindowNow, safetySettingsNow, zoneOverlaySettingsNow } from './settings';

/* The nurse safety suite's one store in the web preview.
 *
 * Every rule is the engine's: this file only holds the timers and panics, moves the clock and hands
 * each action to packages/engines/src/safety/domain. It holds them in memory and nowhere else — this
 * app may not persist anything about a patient or a nurse, so a reload forgets every timer, which is
 * true of the preview and would be a defect in the product.
 *
 * THE TIMINGS ARE THE ONES IN FORCE, READ ONCE. A timer is started with safetySettingsNow() and a panic is
 * pressed with panicWindowNow(), from lib/settings.ts, which the back office's Configuration tab changes; each keeps
 * what it was handed. So a grace changed in the back office reaches the next visit this nurse starts,
 * never the one she is in, and no minute is typed here.
 *
 * THE DESK IS SEEDED BY RUNNING THE ENGINE AT EARLIER TIMES. A late nurse, an open panic and one
 * resolved this morning are not rows typed into a table: each is a timer started or a panic pressed
 * minutes or hours before this page opened and ticked forward to now, so the ages, the deadlines and
 * the sharing windows on the board are arithmetic and cannot disagree with the rules.
 *
 * THE POSITION FEED IS SIMULATED, and on this machine. The nurse-position door in
 * packages/catalog/feeds.json stays shut; while a window is open this produces the centre of the
 * suburb the nurse works in, every positionEverySeconds, and hands it to receivePosition — which
 * refuses it once sharing has stopped. There is never a patient address to leak because the preview
 * has none.
 *
 * The desk and the nurse share this module, so a panic pressed as the nurse is on the board when the
 * same tab switches to the Control Tower. Nothing crosses tabs or devices.
 */
export type SafetyState = { readonly timers: readonly Timer[]; readonly panics: readonly Panic[]; readonly now: number };
/** The nurse whose day the schedule draws, and the operator the Control Tower signs in as. */
export const NURSE_ON_SHIFT = 'N-205';
/* The desk acts in the role the desk's routes admit, read from the contract rather than named here. */
const DESK: DeskActor = { kind: 'person', role: deskRoles[0]!, ref: 'O-801' };
const FEED_MS = fieldSafety.simulation.positionEverySeconds * 1000;

let state: SafetyState | undefined;
let serial = 413;
const listeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;

const seeded = <T>(result: Result<T>): T => {
 if (!result.ok) throw new Error(`The seeded desk was refused by the engine: ${result.refusal.statement}`);
 return result.value;
};
const zoneOf = (nurseRef: string) => nurseById(nurseRef)?.zone?.at;

function seed(now: number): SafetyState {
 const others = rosterNurses.filter(nurse => nurse.zone && nurse.id !== NURSE_ON_SHIFT);
 const [late, pressed, earlier] = [others[0], others[1] ?? others[0], others[2] ?? others[0]];
 const settings = safetySettingsNow();
 const window = panicWindowNow();
 /* Twelve minutes past the deadline of an elderly-care visit: the service's own duration plus the
    grace in force, both read rather than typed. */
 const lateService = 'senior';
 const startedAt = now - ((serviceMinutes(lateService) ?? 0) + settings.timings.graceMinutes + 12) * MINUTE;
 const lateTimer = seeded(tick(seeded(startTimer({ checkinRef: 'CHK-0412', event: { appointmentRef: 'TH-2044', visitCodeMatched: true }, serviceId: lateService, nurseRef: late.id }, startedAt, settings)), now));
 let open = seeded(raisePanic({ panicRef: 'PNC-0088', raisedByRole: 'nurse', nurseRef: pressed.id, appointmentRef: 'TH-2046', locationShareMinutes: window.minutes }, now - 4 * MINUTE, window));
 const at = zoneOf(pressed.id);
 if (at) open = seeded(receivePosition(open, at, now - FEED_MS));
 /* Three hours ago. */
 const morning = now - 180 * MINUTE;
 let resolved = seeded(raisePanic({ panicRef: 'PNC-0081', raisedByRole: 'nurse', nurseRef: earlier.id, appointmentRef: 'TH-2031', locationShareMinutes: window.minutes }, morning, window));
 resolved = seeded(acknowledge(resolved, DESK, morning + MINUTE));
 resolved = seeded(resolve(resolved, { outcomeId: 'pressed-by-mistake', actor: DESK }, morning + 6 * MINUTE));
 return { timers: [lateTimer], panics: [open, resolved], now };
}

/* The clock moving: every open timer ticked, every sharing panic fed its next simulated position, and
   every panic swept so that nothing is kept once its window has closed. */
function advance(now: number): SafetyState {
 const current = state ?? seed(now);
 const timers = current.timers.map(timer => { const ticked = tick(timer, now); return ticked.ok ? ticked.value : timer; });
 const panics = current.panics.map(panic => {
  const at = zoneOf(panic.nurseRef);
  const due = isSharing(panic, now) && at && (!panic.position || now - panic.position.at >= FEED_MS);
  const fed = due && at ? receivePosition(panic, at, now) : null;
  return sweep(fed?.ok ? fed.value : panic, now);
 });
 return { timers, panics, now };
}

const current = () => (state ??= seed(Date.now()));
function commit(next: SafetyState) {
 state = next;
 for (const listener of listeners) listener();
}
export function subscribe(listener: () => void) {
 current();
 listeners.add(listener);
 if (!clock) clock = setInterval(() => commit(advance(Date.now())), FEED_MS);
 /* Catch up at once rather than on the next beat: a board opened fourteen seconds after the last
    one closed would otherwise show a fourteen-second-old world. */
 queueMicrotask(() => commit(advance(Date.now())));
 return () => {
  listeners.delete(listener);
  if (!listeners.size && clock) { clearInterval(clock); clock = undefined; }
 };
}
export const snapshot = () => current();
export const useFieldSafety = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/* One shape for every action: bring the clock up to now, ask the engine, and either keep what it
   returned or hand its refusal back to the screen to render word for word. */
function act<T>(run: (s: SafetyState, now: number) => Result<T>, keep: (s: SafetyState, value: T) => SafetyState): Refusal | null {
 const now = Date.now();
 const s = advance(now);
 const result = run(s, now);
 commit(result.ok ? keep(s, result.value) : s);
 return result.ok ? null : result.refusal;
}
const withTimer = (s: SafetyState, timer: Timer): SafetyState => ({ ...s, timers: s.timers.map(t => t.checkinRef === timer.checkinRef ? timer : t) });
const withPanic = (s: SafetyState, panic: Panic): SafetyState => ({ ...s, panics: s.panics.map(p => p.panicRef === panic.panicRef ? panic : p) });

export const timerFor = (s: SafetyState, appointmentRef: string) => [...s.timers].reverse().find(t => t.appointmentRef === appointmentRef);
export const panicFor = (s: SafetyState, appointmentRef: string) => [...s.panics].reverse().find(p => p.appointmentRef === appointmentRef);

const onTimer = (find: (s: SafetyState) => Timer | undefined, change: (timer: Timer, now: number) => Result<Timer>) =>
 act((s, now) => { const timer = find(s); return timer ? change(timer, now) : { ok: false, refusal: refusal('checkin-after-close') }; }, withTimer);
const onPanic = (reference: string, change: (panic: Panic, now: number) => Result<Panic>) =>
 act((s, now) => { const panic = s.panics.find(p => p.panicRef === reference); return panic ? change(panic, now) : { ok: false, refusal: refusal('panic-already-resolved') }; }, withPanic);

/* ---- The nurse ------------------------------------------------------------------------------- */

/** appointment.in_progress, as the preview has it: the visit code matched at the door. */
export function startVisit(appointmentRef: string, serviceId: string, visitCodeMatched: boolean): Refusal | null {
 const running = timerFor(current(), appointmentRef);
 if (running && running.closedAt === null) return null;
 return act((_, now) => startTimer({ checkinRef: `CHK-0${serial++}`, event: { appointmentRef, visitCodeMatched }, serviceId, nurseRef: NURSE_ON_SHIFT }, now, safetySettingsNow()),
  (s, timer) => ({ ...s, timers: [...s.timers, timer] }));
}
export const checkInSafe = (appointmentRef: string) => onTimer(s => timerFor(s, appointmentRef), checkIn);
export const extendVisit = (appointmentRef: string, minutes: number, reasonId: string) => onTimer(s => timerFor(s, appointmentRef), (t, now) => extend(t, { minutes, reasonId }, now));
export const checkOut = (appointmentRef: string) => onTimer(s => timerFor(s, appointmentRef), (t, now) => close(t, 'nurse', now));
/** appointment.completed, as the preview has it: the assessment signed. Closes a timer if there is one. */
export const visitSigned = (appointmentRef: string) => timerFor(current(), appointmentRef) ? onTimer(s => timerFor(s, appointmentRef), completeVisit) : null;
/* The engine's rule on this phone too: pressing again for the same visit while the panic is open is the
   panic she already has, answered without a refusal and without a second row on the desk. */
export function pressPanic(appointmentRef: string | null): Refusal | null {
 const now = Date.now();
 if (openPanicFor(advance(now).panics, NURSE_ON_SHIFT, appointmentRef, now)) return null;
 const window = panicWindowNow();
 return act((_, at) => raisePanic({ panicRef: `PNC-0${serial++}`, raisedByRole: 'nurse', nurseRef: NURSE_ON_SHIFT, appointmentRef, locationShareMinutes: window.minutes }, at, window),
  (s, panic) => {
   const at = zoneOf(panic.nurseRef);
   const fed = at ? receivePosition(panic, at, s.now) : null;
   return { ...s, panics: [...s.panics, fed?.ok ? fed.value : panic] };
  });
}

/* ---- The desk -------------------------------------------------------------------------------- */

export const deskRows = (s: SafetyState): DeskItem[] => deskQueue(s.timers, s.panics, s.now, ref => {
 const nurse = ref === null ? undefined : nurseById(ref);
 return { nurse: nurse?.name ?? ref, suburb: nurse?.zoneName ?? '' };
});

/* ---- The dispatch map's field-safety overlay ---------------------------------------------------
 *
 * The same queue, grouped by suburb so the zones the dispatch board already draws can carry the
 * counts that belong to them. Nothing here is stored and nothing is remembered between draws: each
 * call recomputes from the state handed in, which is what field-safety.json#zoneOverlay's
 * nothing-is-kept means, and what stops the map ever disagreeing with the desk — both are arithmetic
 * on the same timers and panics.
 *
 * The floor is read on the draw rather than kept on a figure, for the same reason: there is no live
 * proportion to move under a reader, so a change on the Configuration tab reaches the next draw and
 * nothing else. It governs the proportion alone. The counts are drawn whole whatever it is set to,
 * because an open panic in a suburb with one nurse on the roster is the incident the operator most
 * needs to see, and a suppression rule that hid it would be protecting a suburb's reputation instead
 * of a person. */
export type ZoneRow = ZoneOpen & { readonly counts: string; readonly kinds: string; readonly proportion: string; readonly proportionDrawn: boolean };

/** One suburb's overlay row: the counts, the contract's own sentences, and the proportion or why there is none. */
export function zoneRows(s: SafetyState): ZoneRow[] {
 const floor = zoneOverlaySettingsNow().minimumNurses;
 return zoneOverlay(deskRows(s), rosteredIn).map(zone => {
  const proportion = proportionOf(zone, floor);
  return {
   ...zone,
   counts: countsSentence(zone),
   kinds: kindsSentence(zone),
   proportion: proportion.sentence,
   proportionDrawn: proportion.drawn
  };
 });
}

/** The two figures the overlay's heading carries, counted off the rows. */
export const zoneTotals = (rows: readonly ZoneOpen[]) => overlayCounts(rows);

/** The heading's own line, in the contract's words: how many open across how many suburbs. */
export const zoneTotalsSentence = (rows: readonly ZoneOpen[]) => totalsSentence(rows);

/** What the overlay says when nothing anywhere is open. */
export const nothingOpen = () => nothingOpenSentence();

/* The overlay's own words, read from the contract rather than typed on the screen: its heading, what
   it counts, and the sentence for a board drawn for an audience the desk queue does not admit. The
   floor's label and help are asked of lib/settings.ts rather than reached for in the contract's items
   list here, because that file is the one place a screen reads a setting from — the number in force and
   the explanation beside it come from the same reader, so they cannot be two documents. */
export const zoneOverlayWords = fieldSafety.zoneOverlay;
export { zoneFloorWords } from './settings';
export const pickUp = (row: DeskItem) => row.kind === 'panic'
 ? onPanic(row.reference, (p, now) => acknowledge(p, DESK, now))
 : onTimer(s => s.timers.find(t => t.checkinRef === row.reference), (t, now) => acknowledgeOverdue(t, DESK.ref, now));
export const closeOverdue = (reference: string, reasonId: string) =>
 onTimer(s => s.timers.find(t => t.checkinRef === reference), (t, now) => silenceOverdue(t, { reasonId, by: DESK.ref }, now));
export const resolvePanic = (reference: string, outcomeId: string) => onPanic(reference, (p, now) => resolve(p, { outcomeId, actor: DESK }, now));
export function positionOf(s: SafetyState, reference: string): Result<Position | null> {
 const panic = s.panics.find(p => p.panicRef === reference);
 return panic ? positionFor(panic, s.now) : { ok: false, refusal: refusal('panic-already-resolved') };
}
