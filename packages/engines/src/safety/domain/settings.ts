/* The field-safety timings, read the way a timer and a panic need them, over the shared settings shape.
 *
 * The founder decided on 15 September 2026 that Operations sets the grace and the panic window on the
 * admin rather than in code — the words are in the contract's defaults changelog, beside the values — and
 * the extension steps and ceiling are set in the same place. A number still lives in one place: the four
 * timings are settings in packages/catalog/field-safety.json, in the shape packages/catalog/settings.json
 * gives every setting, and every rule a change obeys — who, a reason, the version, nought before the
 * bounds, the bounds, whether anything changed — is packages/engines/src/settings/shape.ts's. This file
 * adds the two things only Safety knows: which setting is which field of the timings a timer and a panic
 * are handed, and the rule between two of them, that the steps rise and none is larger than the ceiling.
 *
 * Two settings are not timings. settings-changed-by names the roles that change every other field-safety
 * setting, and only the admin changes it. stale-panic-window-uses-window-in-force says which window a phone
 * that read an older one is given; a panic is opened either way.
 *
 * A CHANGE NEVER REACHES BACK. A timer takes a copy of the timings in force when it starts and a panic
 * takes its window, and nothing already running reads this file again. So a grace made shorter cannot
 * make a running visit overdue, and a window made shorter cannot end a share a nurse is relying on. It
 * is enforced where a timer and a panic are made — checkins.ts and panics.ts take the settings as an
 * argument and keep what they were given — and the timing constants are deliberately not exported from
 * rules.ts, so there is no default for a running timer to fall back on.
 */
import contract from '../../../../catalog/field-safety.json' with { type: 'json' };
import api from '../../../../catalog/apis/safety.json' with { type: 'json' };
import {
 FIRST_SETTINGS_VERSION, proposeChange, snapshotOf, valuesHeld,
 type Change, type ChangeRequest, type Check, type Refusal, type Result, type SettingsBlock, type SettingsEngine, type Snapshot
} from '../../settings/shape.ts';

export type TimingId = 'grace' | 'panic-window' | 'extension-steps' | 'extension-ceiling';
export type Timings = {
 readonly graceMinutes: number;
 readonly panicWindowMinutes: number;
 readonly extensionSteps: readonly number[];
 readonly maxExtensionMinutes: number;
};
export type SettingsChange = Change;
export type SettingsInForce = { readonly settingsVersion: number; readonly timings: Timings };
/** The window a panic opens now, and every window a version has held — which a phone may still send. */
export type PanicWindow = { readonly settingsVersion: number; readonly minutes: number; readonly accepts: readonly number[]; readonly useWindowInForce: boolean };

export const safetyBlock = { engine: 'safety', ...contract.settings } as unknown as SettingsBlock;

/* Which field of Timings each setting is. Written once, and the node test holds it to the contract, so a
   timing cannot be read from one place and changed in another. */
const KEY: Readonly<Record<TimingId, keyof Timings>> = {
 grace: 'graceMinutes', 'panic-window': 'panicWindowMinutes', 'extension-steps': 'extensionSteps', 'extension-ceiling': 'maxExtensionMinutes'
};
export const keyOf = (id: TimingId): keyof Timings => KEY[id];
const timingsOf = (values: Snapshot['values']): Timings => Object.freeze({
 graceMinutes: values.grace as number,
 panicWindowMinutes: values['panic-window'] as number,
 extensionSteps: values['extension-steps'] as readonly number[],
 maxExtensionMinutes: values['extension-ceiling'] as number
});

/* Safety's own rule between two settings, asked of what a change would put in force. Steps are the
   buttons a nurse presses at a door: two the same, or an order that jumps about, is a choice she has to
   stop and read, and a step the ceiling never lets her take is a button that is always refused. */
const check: Check = next => {
 const steps = next['extension-steps'] as readonly number[];
 if (steps.some((step, i) => i > 0 && step <= steps[i - 1]!)) return 'extension-steps-not-rising';
 if (Math.max(...steps) > (next['extension-ceiling'] as number)) return 'extension-step-above-the-ceiling';
 return null;
};
const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/safety/setting-changes' && route.version === 2);
if (!changeRoute) throw new Error('packages/catalog/apis/safety.json has lost POST /v1/safety/setting-changes@2, whose refusals Safety\'s own settings rule answers with.');

export const safetySettings: SettingsEngine = Object.freeze({ block: safetyBlock, refusals: changeRoute.refusals as readonly Refusal[], check });

export const defaultTimings: Timings = timingsOf(snapshotOf(safetyBlock, []).values);
export const defaultsInForce: SettingsInForce = Object.freeze({ settingsVersion: FIRST_SETTINGS_VERSION, timings: defaultTimings });

/** The timings in force after a history of accepted changes. */
export function inForce(history: readonly Change[]): SettingsInForce {
 const snapshot = snapshotOf(safetyBlock, history);
 return { settingsVersion: snapshot.settingsVersion, timings: timingsOf(snapshot.values) };
}

export function panicWindowOf(history: readonly Change[]): PanicWindow {
 const snapshot = snapshotOf(safetyBlock, history);
 return {
  settingsVersion: snapshot.settingsVersion,
  minutes: snapshot.values['panic-window'] as number,
  accepts: [...new Set(valuesHeld(safetyBlock, history, 'panic-window') as number[])],
  useWindowInForce: snapshot.values['stale-panic-window-uses-window-in-force'] === true
 };
}

export function changeSetting(history: readonly Change[], request: ChangeRequest, now: number): Result<{ readonly change: Change; readonly inForce: SettingsInForce }> {
 const result = proposeChange(safetySettings, history, request, now);
 if (!result.ok) return result;
 return { ok: true, value: { change: result.value.change, inForce: { settingsVersion: result.value.snapshot.settingsVersion, timings: timingsOf(result.value.snapshot.values) } } };
}
