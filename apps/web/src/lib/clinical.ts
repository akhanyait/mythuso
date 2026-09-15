import { useSyncExternalStore } from 'react';
import {
 DAY, OUTSIDE_PROTOCOL, UNDER_PROTOCOL, clinicalRoleHolds, contract, frame, guidanceOutcomes, isRatified, notTriaged, protocolName, refusal, signedAsSentence,
 signingModes, triage, type Refusal
} from '../../../../packages/engines/src/clinical/domain/contract.ts';
import { mayConfirm, openReview, sign, type Review } from '../../../../packages/engines/src/clinical/domain/reviews.ts';
import { missingOf, record, recordComplete, type Consultation } from '../../../../packages/engines/src/clinical/domain/consultations.ts';
import { noRulesInThisBuild, triageOn } from '../../../../packages/engines/src/clinical/domain/triage.ts';
import { deliver, noScriptWordsInThisBuild } from '../../../../packages/engines/src/clinical/domain/guidance.ts';
import { dueDates, startEpisode, type Episode } from '../../../../packages/engines/src/clinical/domain/proms.ts';
import { clinicalSettingsNow } from './settings';
import { roleOf } from './roles';
import { can, roleById } from './vetting';
import { subjectById } from './vetting-fixtures';

/* Clinical Intelligence in the web preview: one store for the tab, and every rule the engine's.
 *
 * This file holds the inbox's reviews, the consultations behind them, the consultation a doctor writes in the frame
 * and the episodes a signature starts, in memory and nowhere else, and hands every act to
 * packages/engines/src/clinical/domain — the same functions the Clinical engine binds to its routes. A reload forgets
 * all of it, which is right for a preview that may not persist anything about a patient.
 *
 * WHO ACTS. The doctor's workspace acts as the party lib/roles.ts opens it as. Whether she may confirm a review is
 * asked of the review-confirmer setting in force, through lib/settings.ts, and of the vetting register's fixtures for
 * every capability clinical.json calls clinical: a doctor the register lets act today is cleared, as Trust's events
 * clear her on the engine. The preview's nurse wrote every seeded record, so nothing seeded is the doctor's own.
 *
 * NOTHING IS SIGNED FOR ANYBODY. signReview() and signOffConsultation() are called from a person's press on a
 * button and from nowhere else, and scripts/check-boundaries.mjs holds this file and its screens to that. Triage and
 * guidance are asked of the domain exactly as the routes ask it, so the answer is the refusal, in its sentence.
 */

type Store = {
 readonly reviews: readonly Review[];
 readonly consultations: readonly Consultation[];
 readonly episodes: readonly Episode[];
};
const loadedAt = Date.now();
const WRITER = contract.preview.writtenBy;

/* The preview's reviews and the consultations behind them, through the domain: a consultation whose headings are
   not all written is recorded unsigned, as the route would leave it. */
function seed(): Store {
 const reviews: Review[] = [];
 const consultations: Consultation[] = [];
 for (const r of contract.preview.reviews) {
  reviews.push(openReview({ reviewRef: `review-preview-${r.appointmentRef}`, appointmentRef: r.appointmentRef, encounterRef: r.encounterRef, subjectRef: r.subjectRef, protocolVersionId: r.protocolVersionId }, loadedAt));
  const input = { consultationRef: `consultation-preview-${r.appointmentRef}`, subjectRef: r.subjectRef, encounterRef: r.encounterRef, consultationEntryRef: `consultation-entry-preview-${r.appointmentRef}`, sectionsWritten: r.sectionsWritten, signOff: r.signedOff };
  const written = record(undefined, input, { ref: WRITER }, loadedAt);
  const kept = written.ok ? written : record(undefined, { ...input, signOff: false }, { ref: WRITER }, loadedAt);
  if (kept.ok) consultations.push(kept.value);
 }
 return { reviews, consultations, episodes: [] };
}

let store: Store = seed();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => store;
const set = (next: Store) => { store = next; for (const listener of listeners) listener(); };
export const useClinical = () => useSyncExternalStore(subscribe, current, current);

export const words = {
 inbox: contract.reviews.screen, consultation: contract.consultation.screen, triage: contract.triage.screen,
 guidance: contract.guidance.screen, proms: contract.proms.screen
};
export { frame, guidanceOutcomes, notTriaged, protocolName, signingModes, UNDER_PROTOCOL, OUTSIDE_PROTOCOL };
export const triageStages = triage.stages;
export const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const roleNames = (ids: readonly string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(ids.map(id => roleById(id)?.name ?? id));
export const listOf = (items: readonly string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(items);
const ZONE = 'Africa/Johannesburg';
export const dayOf = (at: number) => new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: ZONE });
export const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });

/* ---- Who is signing -------------------------------------------------------------------------------- */

export const DOCTOR = roleOf('doctor').subjectId ?? '';
const signer = () => {
 const subject = subjectById(DOCTOR);
 return { ref: subject ? DOCTOR : null, role: subject?.roleId ?? '', cleared: !!subject && clinicalRoleHolds.every(capability => can(subject, capability).allowed) };
};

/* ---- The inbox ------------------------------------------------------------------------------------- */

export type InboxRow = Review & {
 readonly protocolRatified: boolean; readonly recordComplete: boolean;
 /** The sentence the signature carries, or null while it waits. */
 readonly signedAs: string | null;
};
/** The inbox as the doctor may read it, or the refusal a reader who is not a confirmer is given. */
export function inboxNow(): { readonly ok: true; readonly rows: readonly InboxRow[]; readonly confirmers: readonly string[] } | { readonly ok: false; readonly refusal: Refusal } {
 const inForce = clinicalSettingsNow();
 const who = signer();
 if (!who.ref || !who.cleared || !mayConfirm(who.role, inForce.confirmers)) return { ok: false, refusal: refusal('not-a-confirmer') };
 return {
  ok: true, confirmers: inForce.confirmers,
  rows: store.reviews.map(r => ({
   ...r, protocolRatified: isRatified(r.protocolVersionId), recordComplete: recordComplete(store.consultations, r.encounterRef),
   signedAs: r.signingModeCode ? signedAsSentence(r.signingModeCode, r.protocolVersionId) : null
  }))
 };
}

const authorsOf = (encounterRef: string) => store.consultations.filter(c => c.encounterRef === encounterRef && c.writtenByRef).map(c => c.writtenByRef as string);

/** A review signed by the doctor's own press. The settings in force are read now; the episode keeps the days it read. */
export function signReview(reviewRef: string, signingModeCode: string, now = Date.now()): { readonly ok: true } | { readonly ok: false; readonly refusal: Refusal } {
 const review = store.reviews.find(r => r.reviewRef === reviewRef);
 const inForce = clinicalSettingsNow();
 const episodeRef = `episode-preview-${store.episodes.length + 1}`;
 const signed = sign(review, {
  encounterRef: review?.encounterRef, signingModeCode, protocolVersionId: signingModeCode === UNDER_PROTOCOL ? review?.protocolVersionId ?? undefined : undefined
 }, signer(), { confirmers: inForce.confirmers, recordComplete: review ? recordComplete(store.consultations, review.encounterRef) : false, authors: review ? authorsOf(review.encounterRef) : [], episodeRef }, now);
 if (!signed.ok) return signed;
 const episode = startEpisode({ episodeRef, subjectRef: signed.value.subjectRef, reviewRef }, inForce, now);
 set({ ...store, reviews: store.reviews.map(r => r.reviewRef === reviewRef ? signed.value : r), episodes: [...store.episodes, episode] });
 return { ok: true };
}

/* ---- The consultation frame ------------------------------------------------------------------------ */

const FRAME_ENTRY = 'consultation-entry-preview-frame';
export const frameConsultation = () => store.consultations.find(c => c.consultationEntryRef === FRAME_ENTRY);
/** The headings a draft leaves required and empty. */
export const missingIn = (draft: Readonly<Record<string, string>>) => missingOf(frame.map(h => h.code).filter(code => (draft[code] ?? '').trim()));

/** The doctor's own sign-off of the consultation she wrote in the frame. Its words stay in this component's state. */
export function signOffConsultation(draft: Readonly<Record<string, string>>, now = Date.now()): { readonly ok: true; readonly consultation: Consultation } | { readonly ok: false; readonly refusal: Refusal } {
 const written = frame.map(h => h.code).filter(code => (draft[code] ?? '').trim());
 const recorded = record(frameConsultation(), {
  consultationRef: 'consultation-preview-frame', subjectRef: 'subject-preview-frame', encounterRef: 'encounter-preview-frame', consultationEntryRef: FRAME_ENTRY,
  sectionsWritten: written, signOff: true
 }, { ref: DOCTOR || null }, now);
 if (!recorded.ok) return recorded;
 set({ ...store, consultations: [...store.consultations.filter(c => c.consultationEntryRef !== FRAME_ENTRY), recorded.value] });
 return { ok: true, consultation: recorded.value };
}

/* ---- Triage and guidance --------------------------------------------------------------------------- */

/** Starting triage, asked of the domain as the route asks it. No triage protocol is ratified, so it is refused. */
export function startTriage(): Refusal {
 const answered = triageOn({ intakeEntryRef: 'intake-preview' }, { triageRef: 'triage-preview', load: noRulesInThisBuild });
 if (answered.ok) throw new Error('Triage answered a priority in the preview, which has no ratified triage protocol and no rules.');
 return answered.refusal;
}

/** Giving one outcome's guidance, asked of the domain as the route asks it. No script is ratified, so it is refused. */
export function giveGuidance(outcomeCode: string): Refusal {
 const outcome = guidanceOutcomes.find(o => o.code === outcomeCode);
 const answered = deliver({ triageRef: 'triage-preview', scriptRef: outcome?.scriptRef ?? null }, { guidanceRef: 'guidance-preview', read: noScriptWordsInThisBuild });
 if (answered.ok) throw new Error('Guidance was given in the preview, which has no ratified script and no script words.');
 return answered.refusal;
}

/* ---- Outcome questions ------------------------------------------------------------------------------ */

export const promRefusal = () => refusal('no-prom-instrument');
export const episodesNow = () => store.episodes.map(e => ({ ...e, due: dueDates(e) }));
export const promDaysNow = () => clinicalSettingsNow().promDays;
export { DAY };
