import { useSyncExternalStore } from 'react';
import type { Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { changeSetting, changeableBy, inForce, panicWindowOf, type ChangeRequest, type PanicWindow, type SettingsChange, type SettingsInForce } from '../../../../packages/engines/src/safety/domain/settings.ts';
import { roleOf } from './roles';

/* The field-safety settings in the web preview: one history, in memory, shared by the back office that
 * changes them and by the nurse's strip and the desk that read them.
 *
 * Every rule is the engine's. This file keeps the list of accepted changes and hands each new one to
 * packages/engines/src/safety/domain/settings.ts, which says whether it is allowed and in which words it
 * is not; what is in force is always that list replayed over the contract's defaults. It is held in
 * memory and nowhere else — this app may not persist anything, so a reload puts the defaults back, and
 * the admin screen says so in the contract's sentence.
 *
 * WHAT IS READ, AND WHEN. A timer asks settingsNow() once, when the visit code matches, and a panic asks
 * panicWindowNow() once, when it is pressed; each keeps what it was given. Nothing already running asks
 * again, so a change made in the back office and then seen from the nurse's workspace in the same tab
 * reaches the next visit and not the one she is in.
 *
 * The admin a change is recorded against is the party the back office opens as, read from the role list
 * rather than typed here, acting as the role the contract says may change a setting.
 */
let history: readonly SettingsChange[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => history;

export const useSettingsHistory = () => useSyncExternalStore(subscribe, snapshot, snapshot);
export const settingsNow = (): SettingsInForce => inForce(history);
export const panicWindowNow = (): PanicWindow => panicWindowOf(history);
export const adminOnDuty = (): string | null => roleOf('back-office').subjectId;

export type Proposal = Omit<ChangeRequest, 'byRole' | 'byRef'>;
export type Proposed = { readonly ok: true; readonly change: SettingsChange } | { readonly ok: false; readonly refusal: Refusal };

const ask = (request: Proposal, now: number) => changeSetting(history, { ...request, byRole: changeableBy, byRef: adminOnDuty() }, now);

/* The review step. The same question the change asks, so a refusal is shown before the admin is asked to
   confirm anything — and nothing is recorded, because reviewing a change is not making it. */
export function previewChange(request: Proposal, now = Date.now()): Proposed {
 const result = ask(request, now);
 return result.ok ? { ok: true, change: result.value.change } : result;
}

export function proposeChange(request: Proposal, now = Date.now()): Proposed {
 const result = ask(request, now);
 if (!result.ok) return result;
 history = [...history, result.value.change];
 for (const listener of listeners) listener();
 return { ok: true, change: result.value.change };
}
