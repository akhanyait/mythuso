import { useSyncExternalStore } from 'react';
import {
 confirmReview, proposeChange, reviewStateOf, snapshotOf,
 type Change, type ChangeRequest, type Refusal, type Review, type ReviewState, type Setting, type SettingValue, type SettingsEngine, type Snapshot
} from '../../../../packages/engines/src/settings/shape.ts';
import { settingsEngines } from '../../../../packages/engines/src/settings/registry.ts';
import { inForce, panicWindowOf, type PanicWindow, type SettingsInForce } from '../../../../packages/engines/src/safety/domain/settings.ts';
import { careInForceOf, type CareInForce } from '../../../../packages/engines/src/care/domain/settings.ts';
import { doctorFeeOf, nurseShareSentenceOf, planTermsOf, type DoctorFeeInForce, type PlanTerms } from '../../../../packages/engines/src/money/domain/settings.ts';
import { rotaOf } from '../../../../packages/engines/src/core/domain/settings.ts';
import type { KeptRota } from '../../../../packages/engines/src/core/domain/loops.ts';
import { accessInForce, accessInForceAt, type AccessSettingsInForce } from '../../../../packages/engines/src/access/domain/settings.ts';
import { roleOf, whoIs } from './roles';
import { can } from './vetting';
/* Whether a rota's post is on duty, and when a shut one opens: the shared settings code's one rule, which the
   escalation rota and the Access engine's handover route ask too. Handed on from here because a screen's lib
   reaches the settings code through this file alone. */
export { rotaAt } from '../../../../packages/engines/src/settings/shape.ts';

/* Every setting in the web preview: one history per engine, in memory, shared by the back office that
 * changes them and by every screen that reads one — and beside it, the clinical reviews a doctor confirms.
 *
 * Every rule is the engines'. This file keeps each engine's list of accepted changes and confirmed reviews
 * and hands each new one to packages/engines/src/settings/shape.ts — with the engine's own rule between
 * settings, from packages/engines/src/settings/registry.ts — which says whether it is allowed and in which
 * words it is not. What is in force is always that list replayed over the contract's defaults. It is held
 * in memory and nowhere else: this app may not persist anything, so a reload puts the defaults back, and
 * the Configuration screen says so in the contract's sentence.
 *
 * THE ONE PLACE A SCREEN READS A SETTING. The nurse's strip and the desk ask safetySettingsNow() and
 * panicWindowNow(); Care's offer and visit desks ask careSettingsNow(). A screen that typed a minute or a
 * role, or read a default out of a contract, would be a screen an admin's change never reaches, and the
 * build fails on both. Each reader is asked once, when a timer starts, a panic is pressed, an offer is made
 * or a visit starts, and what it answered is kept by the thing that asked; nothing already running asks
 * again, so a change made in the back office and then seen from the nurse's workspace in the same tab
 * reaches the next visit, panic and offer and never the one already under way.
 *
 * Money's readers are asked the same way. The MyThuso for Mom panel asks momPlanNow() when it is drawn,
 * and is handed the plan already read into its words, so it types no name, no call-out and no wording.
 * The doctor's fee screen hands doctorFeeNow() to the ledger, which writes the fee in force onto each case
 * it hears. The nurse's earnings ask nurseShareSentenceNow(). None of these screens is on the patient's
 * first load: the plans panel is a dynamic import, and the fee and earnings screens are in the clinical
 * workspace.
 *
 * WHO. The admin a change is recorded against is the party the back office opens as, and the reviewer a
 * confirmation is recorded against is the party the doctor's workspace opens as — each read from the role
 * list, acting in the vetting role that party holds rather than a role typed here.
 */
type Histories = Readonly<Record<string, readonly Change[]>>;
type Reviews = Readonly<Record<string, readonly Review[]>>;
const empty = () => Object.freeze(Object.fromEntries(Object.keys(settingsEngines).map(engine => [engine, Object.freeze([])])));
let histories: Histories = empty();
let reviews: Reviews = empty();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => histories;
const currentReviews = () => reviews;
const told = () => { for (const listener of listeners) listener(); };

const engineOf = (engine: string): SettingsEngine => {
 const found = settingsEngines[engine];
 if (!found) throw new Error(`No engine "${engine}" has settings in packages/catalog/settings.json.`);
 return found;
};
const settingOf = (engine: string, key: string): Setting => {
 const found = engineOf(engine).block.items.find(setting => setting.key === key);
 if (!found) throw new Error(`The ${engine} engine has no setting "${key}".`);
 return found;
};

/* The shared screen words, for the doctor's review panel, which reads settings through this file alone. */
export { settingsScreen } from '../../../../packages/engines/src/settings/shape.ts';
export type { Review } from '../../../../packages/engines/src/settings/shape.ts';
export const engineIds = Object.keys(settingsEngines);
export const settingsEngineOf = engineOf;
export const useSettingsHistories = () => useSyncExternalStore(subscribe, current, current);
export const useSettingsReviews = () => useSyncExternalStore(subscribe, currentReviews, currentReviews);
export const historyOf = (engine: string): readonly Change[] => histories[engine] ?? [];
export const reviewsOf = (engine: string): readonly Review[] => reviews[engine] ?? [];
export const snapshotNow = (engine: string): Snapshot => snapshotOf(engineOf(engine).block, historyOf(engine));

/* The readers. */
export const safetySettingsNow = (): SettingsInForce => inForce(historyOf('safety'));
export const panicWindowNow = (): PanicWindow => panicWindowOf(historyOf('safety'));
export const careSettingsNow = (): CareInForce => careInForceOf(snapshotNow('care'));
export const momPlanNow = (): PlanTerms => planTermsOf(snapshotNow('money'));
export const doctorFeeNow = (): DoctorFeeInForce => doctorFeeOf(snapshotNow('money'));
export const nurseShareSentenceNow = (): string => nurseShareSentenceOf(snapshotNow('money'));
/* The escalation rota and its minutes in force, for the Control Tower's concerns: asked once when a concern
   is opened, and kept by the concern. */
export const escalationRotaNow = (): KeptRota => rotaOf(snapshotNow('core'));
/* Access's six, read the same way: the booking flow asks accessSettingsNow() once when it opens, the thread
   composer when a message is written, and Gilbert when a handover is asked for. A completed visit's thread
   asks accessSettingsAt() the moment it was completed, so a change afterwards never moves when it closes. */
export const accessSettingsNow = (): AccessSettingsInForce => accessInForce(historyOf('access'));
export const accessSettingsAt = (at: number): AccessSettingsInForce => accessInForceAt(historyOf('access'), at);

/* Whether the value a setting held at a settings version has been clinically reviewed. Something that started
   under an older version — an offer on a nurse's screen — is described by the value it started under, not
   by whatever an admin has put in force since. The history is read up to that version, never edited. */
const upTo = (history: readonly Change[], settingsVersion: number) => history.filter(change => change.settingsVersion <= settingsVersion);
export function reviewStateAt(engine: string, key: string, settingsVersion?: number): ReviewState {
 const history = historyOf(engine);
 const snapshot = snapshotOf(engineOf(engine).block, settingsVersion === undefined ? history : upTo(history, settingsVersion));
 return reviewStateOf(settingOf(engine, key), snapshot, reviewsOf(engine));
}

export const adminOnDuty = (): string | null => roleOf('back-office').subjectId;
export const doctorOnDuty = (): string | null => roleOf('doctor').subjectId;
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
 told();
 return { ok: true, change: result.value.change };
}

/* ---- Clinical reviews ------------------------------------------------------------------------------ */

/** A value in force that waits on a clinical review: the change that set it, or null for the contract's default. */
export type PendingReview = {
 readonly engine: string;
 readonly setting: Setting;
 readonly settingsVersion: number;
 readonly value: SettingValue;
 readonly change: Change | null;
 readonly required: string;
};
export function pendingReviewsNow(): PendingReview[] {
 return engineIds.flatMap(engine => {
  const snapshot = snapshotNow(engine);
  const history = historyOf(engine);
  return engineOf(engine).block.items.flatMap(setting => {
   const state = reviewStateOf(setting, snapshot, reviewsOf(engine));
   if (!state.required || state.reviewed) return [];
   const settingsVersion = snapshot.setAt[setting.key]!;
   return [{ engine, setting, settingsVersion, value: snapshot.values[setting.key]!, change: history.find(change => change.settingsVersion === settingsVersion) ?? null, required: state.required }];
  });
 });
}

export type ReviewRequest = { readonly setting: string; readonly settingsVersion: number; readonly reason: string };
export type Confirmed = { readonly ok: true; readonly review: Review } | { readonly ok: false; readonly refusal: Refusal };

/* The reviewer is the doctor the workspace opens as, in the vetting role the register holds for her — and
   only while the register lets her do what the setting names today. A doctor whose registration has lapsed
   holds the role and not the capability, so no role is handed to the rules and they refuse her in the
   contract's sentence rather than this file deciding what to say. Who made the change, the version and the
   reason are the shared rules' to ask, in their order. */
export function confirmSettingReview(engine: string, request: ReviewRequest, now = Date.now()): Confirmed {
 const ref = doctorOnDuty();
 const setting = engineOf(engine).block.items.find(s => s.key === request.setting);
 const subject = ref ? whoIs(ref, '').subject : null;
 const byRole = subject && setting?.reviewRequired && can(subject, setting.reviewRequired).allowed ? subject.roleId : '';
 const result = confirmReview(engineOf(engine), historyOf(engine), reviewsOf(engine), { ...request, byRole, byRef: ref }, now);
 if (!result.ok) return result;
 reviews = Object.freeze({ ...reviews, [engine]: Object.freeze([...reviewsOf(engine), result.value]) });
 told();
 return { ok: true, review: result.value };
}
