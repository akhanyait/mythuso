import { useSyncExternalStore } from 'react';
import { proposeChange, snapshotOf, type Change, type ChangeRequest, type Refusal, type SettingsEngine, type Snapshot } from '../../../../packages/engines/src/settings/shape.ts';
import { settingsEngines } from '../../../../packages/engines/src/settings/registry.ts';
import { inForce, panicWindowOf, type PanicWindow, type SettingsInForce } from '../../../../packages/engines/src/safety/domain/settings.ts';
import { offerExpiryOf, type OfferExpiry } from '../../../../packages/engines/src/care/domain/settings.ts';
import { roleOf, whoIs } from './roles';

/* Every setting in the web preview: one history per engine, in memory, shared by the back office that
 * changes them and by every screen that reads one.
 *
 * Every rule is the engines'. This file keeps each engine's list of accepted changes and hands each new
 * one to packages/engines/src/settings/shape.ts — with the engine's own rule between settings, from
 * packages/engines/src/settings/registry.ts — which says whether it is allowed and in which words it is
 * not. What is in force is always that list replayed over the contract's defaults. It is held in memory
 * and nowhere else: this app may not persist anything, so a reload puts the defaults back, and the
 * Configuration screen says so in the contract's sentence.
 *
 * THE ONE PLACE A SCREEN READS A SETTING. The nurse's strip and the desk ask safetySettingsNow() and
 * panicWindowNow(); Care's offer desk asks offerExpiryNow(). A screen that typed a minute, or read a
 * default out of a contract, would be a screen an admin's change never reaches, and the build fails on
 * both. Each reader is asked once, when a timer starts, a panic is pressed or an offer is made, and what
 * it answered is kept by the thing that asked; nothing already running asks again, so a change made in
 * the back office and then seen from the nurse's workspace in the same tab reaches the next visit, panic
 * and offer and never the one already under way.
 *
 * The admin a change is recorded against is the party the back office opens as, read from the role
 * list, acting in the vetting role that party holds rather than a role typed here.
 */
type Histories = Readonly<Record<string, readonly Change[]>>;
let histories: Histories = Object.freeze(Object.fromEntries(Object.keys(settingsEngines).map(engine => [engine, Object.freeze([])])));
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => histories;

const engineOf = (engine: string): SettingsEngine => {
 const found = settingsEngines[engine];
 if (!found) throw new Error(`No engine "${engine}" has settings in packages/catalog/settings.json.`);
 return found;
};

export const engineIds = Object.keys(settingsEngines);
export const settingsEngineOf = engineOf;
export const useSettingsHistories = () => useSyncExternalStore(subscribe, current, current);
export const historyOf = (engine: string): readonly Change[] => histories[engine] ?? [];
export const snapshotNow = (engine: string): Snapshot => snapshotOf(engineOf(engine).block, historyOf(engine));

/* The readers. */
export const safetySettingsNow = (): SettingsInForce => inForce(historyOf('safety'));
export const panicWindowNow = (): PanicWindow => panicWindowOf(historyOf('safety'));
export const offerExpiryNow = (): OfferExpiry => offerExpiryOf(snapshotNow('care'));

export const adminOnDuty = (): string | null => roleOf('back-office').subjectId;
const adminRole = (): string => {
 const ref = adminOnDuty();
 return ref ? whoIs(ref, '').subject.roleId : '';
};

export type Proposal = Omit<ChangeRequest, 'byRole' | 'byRef'>;
export type Proposed = { readonly ok: true; readonly change: Change } | { readonly ok: false; readonly refusal: Refusal };

const ask = (engine: string, request: Proposal, now: number) =>
 proposeChange(engineOf(engine), historyOf(engine), { ...request, byRole: adminRole(), byRef: adminOnDuty() }, now);

/* The review step. The same question the change asks, so a refusal is shown before the admin is asked to
   confirm anything — and nothing is recorded, because reviewing a change is not making it. */
export function previewChange(engine: string, request: Proposal, now = Date.now()): Proposed {
 const result = ask(engine, request, now);
 return result.ok ? { ok: true, change: result.value.change } : result;
}

export function applyChange(engine: string, request: Proposal, now = Date.now()): Proposed {
 const result = ask(engine, request, now);
 if (!result.ok) return result;
 histories = Object.freeze({ ...histories, [engine]: Object.freeze([...historyOf(engine), result.value.change]) });
 for (const listener of listeners) listener();
 return { ok: true, change: result.value.change };
}
