import { useSyncExternalStore } from 'react';
import {
 confirmReview, confirmerRoles, proposeChange, refusalFor, reviewStateOf, snapshotOf,
 type Change, type ChangeRequest, type Refusal, type Review, type ReviewState, type Setting, type SettingValue, type SettingsEngine, type Snapshot
} from '../../../../packages/engines/src/settings/shape.ts';
import { settingsEngines } from '../../../../packages/engines/src/settings/registry.ts';
import { inForce, panicWindowOf, sentinelSettingsOf, sosSettingsOf, zoneOverlaySettingsOf, type PanicWindow, type SentinelSettings, type SettingsInForce, type SosSettings, type ZoneOverlaySettings } from '../../../../packages/engines/src/safety/domain/settings.ts';
import { careInForceOf, type CareInForce } from '../../../../packages/engines/src/care/domain/settings.ts';
import { claimConsentDaysOf, doctorFeeOf, groupMemberCapOf, groupMemberMonthlyLimitCentsOf, nurseShareSentenceOf, planTermsOf, voucherExpiryYearsOf, type DoctorFeeInForce, type PlanTerms } from '../../../../packages/engines/src/money/domain/settings.ts';
import { auditExportMaxDaysOf, rotaOf } from '../../../../packages/engines/src/core/domain/settings.ts';
import type { KeptRota } from '../../../../packages/engines/src/core/domain/loops.ts';
import { accessInForce, accessInForceAt, type AccessSettingsInForce } from '../../../../packages/engines/src/access/domain/settings.ts';
import { resultRungOf, termsOf } from '../../../../packages/engines/src/medicines/domain/settings.ts';
import type { Terms as CollectionTerms } from '../../../../packages/engines/src/medicines/domain/collections.ts';
import { trustInForce, type TrustInForce } from '../../../../packages/engines/src/trust/domain/settings.ts';
import { sharingSettingsOf, type SharingInForce } from '../../../../packages/engines/src/record/domain/settings.ts';
import { devicesInForce, type DevicesInForce } from '../../../../packages/engines/src/devices/domain/settings.ts';
import { clinicalInForce, type ClinicalInForce } from '../../../../packages/engines/src/clinical/domain/settings.ts';
import { clinicalRoleHolds, refusal as clinicalRefusal } from '../../../../packages/engines/src/clinical/domain/contract.ts';
import type { Decision, VettingSubject } from './vetting';
import { movementInForce, type MovementInForce } from '../../../../packages/engines/src/movement/domain/settings.ts';
import { presentationVoiceInForce, presentationVoiceOf as presentationVoiceOfSnapshot, speechSettingsInForce, speechSettingsOf as speechSettingsOfSnapshot, SPEECH_KEYS, type PresentationVoiceInForce, type SpeechSettingsInForce } from '../../../../packages/engines/src/assistant/domain/settings.ts';
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
 * The assistant's four are read by presentationVoiceNow(): the patient panel's cloud voice (lib/voice.ts) asks
 * it once when a spoken answer of a presentation register is read, and the Speech settings screen shows what it
 * answers; an emergency, refusal or escalation answer never asks.
 *
 * ONE HISTORY IS NOT THIS TAB'S. Since the founder's instruction of 28 September 2026 the assistant service keeps
 * a settings history of its own, and inside the founder's signed-in session the Speech settings screen and the
 * voice preview read and write that one (lib/founder-settings.ts) rather than this tab's. The readers that turn a
 * snapshot into the voices and speech settings in force are handed on from here — assistantDefaults(),
 * presentationVoiceOf() and speechSettingsOf() below — so a screen still reaches the settings code through this
 * file alone, whichever history the snapshot came from, and the arithmetic over it is the engine's in both.
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
/* A shared settings refusal by id — its status and its sentence from packages/catalog/settings.json — for a
   screen that refuses a change before the rules see it, such as the founder's gate, in the contract's shape. */
export const settingsRefusal = (kind: 'read' | 'change' | 'review', id: string): Refusal => refusalFor(kind, id);
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
/* What an SOS is pressed under, and what the next-of-kin screen says the desk may do: asked once, when a press is made. */
export const sosSettingsNow = (): SosSettings => sosSettingsOf(historyOf('safety'));
export const careSettingsNow = (): CareInForce => careInForceOf(snapshotNow('care'));
export const momPlanNow = (): PlanTerms => planTermsOf(snapshotNow('money'));
export const doctorFeeNow = (): DoctorFeeInForce => doctorFeeOf(snapshotNow('money'));
export const nurseShareSentenceNow = (): string => nurseShareSentenceOf(snapshotNow('money'));
/* How many years a voucher issued now lasts. Handed to a ledger when a voucher is issued, and kept on the voucher. */
export const voucherExpiryYearsNow = (): number => voucherExpiryYearsOf(snapshotNow('money'));
/* Money's three for groups and claims, read the same way: the limit when a member asks her group to pay, the cap when a
   group invites, and how long an agreement to send a claim lasts, asked when she gives it and kept by the claim. */
export const groupMemberMonthlyLimitCentsNow = (): number => groupMemberMonthlyLimitCentsOf(snapshotNow('money'));
export const groupMemberCapNow = (): number => groupMemberCapOf(snapshotNow('money'));
export const claimConsentDaysNow = (): number => claimConsentDaysOf(snapshotNow('money'));
/* The escalation rota and its minutes in force, for the Control Tower's concerns: asked once when a concern
   is opened, and kept by the concern. */
export const escalationRotaNow = (): KeptRota => rotaOf(snapshotNow('core'));
/* The longest period, in days, an audit export may cover: asked once, when the Audit exports desk
   checks a range, from the same setting GET /v1/core/audit-exports@1 refuses range-too-wide against. */
export const auditExportMaxDaysNow = (): number => auditExportMaxDaysOf(snapshotNow('core'));
/* Access's six, read the same way: the booking flow asks accessSettingsNow() once when it opens, the thread
   composer when a message is written, and GilbertOne when a handover is asked for. A completed visit's thread
   asks accessSettingsAt() the moment it was completed, so a change afterwards never moves when it closes. */
export const accessSettingsNow = (): AccessSettingsInForce => accessInForce(historyOf('access'));
export const accessSettingsAt = (at: number): AccessSettingsInForce => accessInForceAt(historyOf('access'), at);
/* Medicines' two, read the same way: a patient's authorisation asks collectionTermsNow() once and keeps the PIN
   expiry, the window and the attempt limit it was given; a result asks resultRungNow() once when it arrives. */
export const collectionTermsNow = (): CollectionTerms => termsOf(snapshotNow('medicines'));
export const resultRungNow = (): { readonly rung: number; readonly settingsVersion: number } => resultRungOf(snapshotNow('medicines'));
/* Verify's four, asked once when a shift starts, a door code is shown or a complaint arrives, and kept by that
   shift, code or complaint: a change in the back office reaches the next one and never one already under way. */
export const trustSettingsNow = (): TrustInForce => trustInForce(historyOf('trust'));
/* The Record engine's five, for the Health Passport's share links and emergency card: asked once when a link or a
   card is made, and kept by it, so a change on the Configuration screen reaches the next link and never one already
   made. The Passport P0 is handed the same arithmetic in apps/passport. */
export const recordSettingsNow = (): SharingInForce => sharingSettingsOf(snapshotNow('record'));
/* Devices' three, read the same way: the kit's health and the registry ask devicesSettingsNow() whenever they
   work a device's health out, and a kit is issued with the deposit it answers, which the kit keeps. */
export const devicesSettingsNow = (): DevicesInForce => devicesInForce(historyOf('devices'));
/* Clinical's two, read the same way: the inbox asks clinicalSettingsNow() whenever it is drawn or a review is signed,
   for who may confirm; a signature asks it once for the days outcome questions are asked on, and the episode keeps them. */
export const clinicalSettingsNow = (): ClinicalInForce => clinicalInForce(historyOf('clinical'));
/* Sentinel's two, read the same way: a baseline asks sentinelSettingsNow() once, when the first reading of a patient's
   measure opens it, and keeps the window, the minimum and the version it was handed. */
export const sentinelSettingsNow = (): SentinelSettings => sentinelSettingsOf(historyOf('safety'));
/* The dispatch map's field-safety overlay asks this on every draw rather than once, and keeps nothing:
   the overlay stores no figure between renders, so there is no live proportion a change could move
   under a reader, and the next draw simply reads the floor now in force. */
export const zoneOverlaySettingsNow = (): ZoneOverlaySettings => zoneOverlaySettingsOf(historyOf('safety'));
/* The words the dispatch map's overlay draws beside its floor — the setting's label and help — read here
   rather than out of the contract's items list on the screen that wants them, so the number and its
   explanation cannot become two documents. Deliberately the words and no value: what is in force is
   zoneOverlaySettingsNow()'s answer, and a default handed out beside the label is a default a screen
   could draw instead of it. */
export const zoneFloorWords = () => {
 const setting = settingOf('safety', 'zone-share-minimum-nurses');
 return { label: setting.label, help: setting.help };
};
/* Movement's five, read the same way: a trip asks movementSettingsNow() once when it is requested and keeps the
   offers, the window and the retention it answered; the responder's phone asks it for the interval when it beats. */
export const movementSettingsNow = (): MovementInForce => movementInForce(historyOf('movement'));
/* The assistant's four, read the same way: which of a language's two voices reads each presentation register — a label
   resolved per language by whoever speaks, never a voice name — asked once when the next spoken answer of that register
   is read. The clinical-delivery classes have no setting, so nothing here can be asked for them. */
export type { PresentationVoiceInForce } from '../../../../packages/engines/src/assistant/domain/settings.ts';
export const presentationVoiceNow = (): PresentationVoiceInForce => presentationVoiceInForce(historyOf('assistant'));
/* The assistant's speech settings of 28 September 2026, read the same way: the provider each presentation register
   reads through and how, the two ceilings, and the administrator's own voice. The Speech settings screen shows what
   they answer; the preview panel asks the session ceiling once per Play and the provider in force for its register;
   the service reads the same rules from the contract's defaults until it keeps a history of its own. */
export type { SpeechSettingsInForce } from '../../../../packages/engines/src/assistant/domain/settings.ts';
export const speechSettingsNow = (): SpeechSettingsInForce => speechSettingsInForce(historyOf('assistant'));
/* The same two readers over a snapshot somebody else holds — the assistant service's, answered to the founder —
   and the contract's defaults as a snapshot to lay it over, so a setting the service does not describe reads as
   the contract says. The keys the speech settings live under are the engine's, handed on for the screen that
   groups its knobs by them. */
export const assistantDefaults = (): Snapshot => snapshotOf(engineOf('assistant').block, []);
export const presentationVoiceOf = (snapshot: Snapshot): PresentationVoiceInForce => presentationVoiceOfSnapshot(snapshot);
export const speechSettingsOf = (snapshot: Snapshot): SpeechSettingsInForce => speechSettingsOfSnapshot(snapshot);
export const speechKeys = SPEECH_KEYS;
export type { Change, Setting, SettingValue, Snapshot } from '../../../../packages/engines/src/settings/shape.ts';

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

/* Who may confirm a clinical review — a setting's here, and a nurse's visit on the doctor's review screen — asked in one
   place: a role Clinical's review-confirmer setting names in force, and a person the vetting register lets act today on
   every capability a clinical role holds. The register's grant of sign-clinical-review decides none of it. */
export function mayConfirmClinicalReview(subject: VettingSubject): Decision {
 if (!confirmerRoles.includes(subject.roleId) || !clinicalSettingsNow().confirmers.includes(subject.roleId)) return { allowed: false, reason: clinicalRefusal('not-a-confirmer').statement, blockedBy: [] };
 for (const capability of clinicalRoleHolds) {
  const decision = can(subject, capability);
  if (!decision.allowed) return decision;
 }
 return { allowed: true, blockedBy: [] };
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
 const subject = ref ? whoIs(ref, '').subject : null;
 const byRole = subject && mayConfirmClinicalReview(subject).allowed ? subject.roleId : '';
 const result = confirmReview(engineOf(engine), historyOf(engine), reviewsOf(engine), { ...request, byRole, byRef: ref, confirmers: clinicalSettingsNow().confirmers }, now);
 if (!result.ok) return result;
 reviews = Object.freeze({ ...reviews, [engine]: Object.freeze([...reviewsOf(engine), result.value]) });
 told();
 return { ok: true, review: result.value };
}
