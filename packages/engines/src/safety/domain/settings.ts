/* The field-safety timings an admin changes, and the rule that makes changing them safe.
 *
 * The founder decided on 15 September 2026 that Operations sets the grace and the panic window on the
 * admin rather than in code ("Safety: 30min, grace 60min - but configure this on the admin"), and the
 * extension steps and ceiling are set in the same place. A number still lives in one place:
 * packages/catalog/field-safety.json holds each default, the range an admin may set it within, the unit
 * and who may change it. What is in force is those defaults with every accepted change replayed in
 * version order. The engine keeps the changes in its own store and the web preview keeps them in memory;
 * both hand them to this file, so the arithmetic and the refusals are one piece of code.
 *
 * A CHANGE NEVER REACHES BACK. A timer takes a copy of the timings in force when it starts and a panic
 * takes its window, and nothing already running reads this file again. So a grace made shorter cannot
 * make a running visit overdue, and a window made shorter cannot end a share a nurse is relying on. It
 * is enforced where a timer and a panic are made — checkins.ts and panics.ts take the settings as an
 * argument and keep what they were given — and the timing constants are deliberately not exported from
 * rules.ts, so there is no default for a running timer to fall back on.
 *
 * WHAT A CHANGE IS REFUSED FOR, in the order it is asked: somebody other than an admin; a setting that
 * does not exist; no reason; a version that is no longer in force; zero or less, asked before the range
 * so that a range set wrongly cannot let it through; outside the range; steps out of order; a step the
 * ceiling would never allow; and a value already in force. Every sentence is the route's, in
 * packages/catalog/apis/safety.json.
 */
import { done, fieldSafety, refuse, type Result } from './rules.ts';

export type TimingId = 'grace' | 'panic-window' | 'extension-steps' | 'extension-ceiling';
export type Timings = {
 readonly graceMinutes: number;
 readonly panicWindowMinutes: number;
 readonly extensionSteps: readonly number[];
 readonly maxExtensionMinutes: number;
};
export type TimingValue = number | readonly number[];
export type Bound = { readonly value: number; readonly decidedBy: string | null; readonly proposedBecause: string };
export type TimingRow = {
 readonly id: TimingId; readonly label: string; readonly defaultFrom: string; readonly shape: 'minutes' | 'steps';
 readonly unit: string; readonly changeableBy: string; readonly lowest: Bound; readonly highest: Bound;
};
/** One accepted change. Added to a history, and never edited or removed. */
export type SettingsChange = {
 readonly settingsVersion: number;
 readonly timing: TimingId;
 readonly from: TimingValue;
 readonly to: TimingValue;
 readonly reason: string;
 readonly byRole: string;
 readonly byRef: string;
 readonly at: number;
};
export type SettingsInForce = { readonly settingsVersion: number; readonly timings: Timings };
/** The window a panic opens now, and every window a version has held — which a phone may still send. */
export type PanicWindow = { readonly settingsVersion: number; readonly minutes: number; readonly accepts: readonly number[] };
export type ChangeRequest = {
 readonly timing: unknown;
 readonly minutes?: unknown;
 readonly stepMinutes?: unknown;
 readonly reason?: unknown;
 readonly expectedVersion: unknown;
 readonly byRole: string;
 readonly byRef: string | null;
};

const settings = fieldSafety.settings;
export const timingRows = settings.timings as readonly TimingRow[];
export const settingsScreen = settings.screen;
export const changeableBy: string = settings.changeableBy;
/** The version of a history nobody has added to: the contract's defaults. */
export const FIRST_SETTINGS_VERSION = 1;

/* Which field of Timings each contract id is. Written once, and the node test holds it to defaultFrom in
   the contract, so a timing cannot be read from one place and changed in another. */
const KEY: Readonly<Record<TimingId, keyof Timings>> = {
 grace: 'graceMinutes', 'panic-window': 'panicWindowMinutes', 'extension-steps': 'extensionSteps', 'extension-ceiling': 'maxExtensionMinutes'
};
export const keyOf = (id: TimingId): keyof Timings => KEY[id];

export const defaultTimings: Timings = Object.freeze({
 graceMinutes: fieldSafety.timer.graceMinutes.value,
 panicWindowMinutes: fieldSafety.panic.windowMinutes.value,
 extensionSteps: Object.freeze([...fieldSafety.timer.extensionMinutes.value]),
 maxExtensionMinutes: fieldSafety.timer.maxExtensionMinutes.value
});
export const defaultsInForce: SettingsInForce = Object.freeze({ settingsVersion: FIRST_SETTINGS_VERSION, timings: defaultTimings });

const same = (a: TimingValue, b: TimingValue) => JSON.stringify(a) === JSON.stringify(b);

/** The timings in force after a history of accepted changes. */
export function inForce(history: readonly SettingsChange[]): SettingsInForce {
 let timings = defaultTimings;
 let settingsVersion = FIRST_SETTINGS_VERSION;
 for (const change of [...history].sort((a, b) => a.settingsVersion - b.settingsVersion)) {
  /* A history with a gap or a repeat is a history somebody edited. It is a fault rather than something
     to read around, because the version a running timer kept would no longer mean one thing. */
  if (change.settingsVersion !== settingsVersion + 1) throw new Error(`The field-safety settings history goes from version ${settingsVersion} to ${change.settingsVersion}. It is added to and never edited.`);
  timings = { ...timings, [KEY[change.timing]]: change.to };
  settingsVersion = change.settingsVersion;
 }
 return { settingsVersion, timings };
}

export function panicWindowOf(history: readonly SettingsChange[]): PanicWindow {
 const current = inForce(history);
 const held = [defaultTimings.panicWindowMinutes, ...history.flatMap(change => change.timing === 'panic-window' ? [change.to as number] : [])];
 return { settingsVersion: current.settingsVersion, minutes: current.timings.panicWindowMinutes, accepts: [...new Set(held)] };
}

export function changeSetting(history: readonly SettingsChange[], request: ChangeRequest, now: number): Result<{ readonly change: SettingsChange; readonly inForce: SettingsInForce }> {
 /* Who, before anything about what. The history records a named person, so a caller with no reference
    is refused as not permitted rather than written down as nobody. */
 if (request.byRole !== changeableBy || !request.byRef) return refuse('setting-change-not-permitted');
 const timing = timingRows.find(row => row.id === request.timing);
 if (!timing) return refuse('setting-not-known');
 if (timing.changeableBy !== request.byRole) return refuse('setting-change-not-permitted');
 const reason = typeof request.reason === 'string' ? request.reason.trim() : '';
 if (!reason) return refuse('setting-change-without-reason');
 const current = inForce(history);
 if (request.expectedVersion !== current.settingsVersion) return refuse('settings-version-stale');

 const sent = timing.shape === 'steps' ? request.stepMinutes : request.minutes;
 const values: unknown[] = timing.shape === 'steps' ? (Array.isArray(sent) ? sent : []) : sent === undefined || sent === null ? [] : [sent];
 if (!values.length || !values.every((v): v is number => typeof v === 'number' && Number.isFinite(v))) return refuse('setting-out-of-range');
 const minutes = values as number[];
 /* Before the range, and not derived from it. The range is a proposal and could be set wrongly; a grace
    or a window of nothing is refused whatever it says. */
 if (minutes.some(v => v <= 0)) return refuse('setting-not-above-zero');
 if (!minutes.every(v => Number.isInteger(v) && v >= timing.lowest.value && v <= timing.highest.value)) return refuse('setting-out-of-range');
 if (timing.shape === 'steps' && minutes.some((v, i) => i > 0 && v <= minutes[i - 1]!)) return refuse('extension-steps-not-rising');

 const to: TimingValue = timing.shape === 'steps' ? Object.freeze([...minutes]) : minutes[0]!;
 const next: Timings = { ...current.timings, [KEY[timing.id]]: to };
 if (Math.max(...next.extensionSteps) > next.maxExtensionMinutes) return refuse('extension-step-above-the-ceiling');
 const from = current.timings[KEY[timing.id]];
 if (same(from, to)) return refuse('setting-unchanged');

 const change: SettingsChange = { settingsVersion: current.settingsVersion + 1, timing: timing.id, from, to, reason, byRole: request.byRole, byRef: request.byRef, at: now };
 /* Nothing is published. No engine acts on a settings change — Core does not read Safety's timings,
    because Safety sends the deadline on what it raises — and the event contract refuses an event nobody
    subscribes to. So a change is the history row the engine appends, and nothing else. */
 return done({ change, inForce: { settingsVersion: change.settingsVersion, timings: next } });
}
