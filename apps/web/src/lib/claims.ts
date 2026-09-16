import { useSyncExternalStore } from 'react';
import { createMoney, type Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { isRefusal, money as moneyContract, refusal, serviceById } from '../../../../packages/engines/src/money/domain/contract.ts';
import { claimStateOf, claimsContract, type ClaimView } from '../../../../packages/engines/src/money/domain/claims.ts';
import { money } from './catalog';
import { claimConsentDaysNow } from './settings';

/* A claim to a medical scheme in the web preview: the doctor's draft, which says there is no adopted code set, and the
 * claim on the patient's record, with its state in plain words — both driven by Money's own ledger in the browser.
 *
 * ── What the preview does, and where it stops ───────────────────────────────────────────────
 *
 * packages/catalog/claims.json preview: one visit is booked, completed and reviewed, heard by the ledger as
 * appointment.booked@2, visit.billable@1 and review.billable@1 — the review is the first of packages/catalog/money.json's
 * signed sample cases — and the doctor who signed it drafts its claim. The patient may agree to send it. Asking to send
 * it is refused, in the route's own sentence, because no switching partner is connected; nothing is ever shown as sent,
 * because nothing in the ledger can mark a claim sent. The agreement lasts the days Money's setting in force gives, read
 * from lib/settings.ts when she agrees.
 *
 * ── Module-level and in memory ────────────────────────────────────────────────────────────────
 *
 * One claim shared by the doctor's workspace and the patient's record in the same tab, so the patient's agreement is
 * what the doctor's draft then says. Nothing is kept past a reload and nothing is sent anywhere. */

export const claimWords = claimsContract.screen;
export const codeSets = claimsContract.codeSets;
export const claimConsent = claimsContract.consent;
export const preauthorisation = claimsContract.preauthorisation;
const preview = claimsContract.preview;
const DOCTOR = { role: 'doctor', subjectRef: preview.doctorRef };
const PATIENT = { role: 'patient', subjectRef: preview.subjectRef };
let keys = 0;
const key = () => `preview-claim-${++keys}`;

type World = { ledger: Money; claimRef: string; said: string | null; version: number };

function open(): World {
 const ledger = createMoney({ simulation: true, claimConsentDays: claimConsentDaysNow });
 const at = new Date().toISOString();
 const signed = moneyContract.sampleCases[0]!;
 ledger.hear({ type: 'appointment.booked', version: 2, occurredAt: at, subjectRef: preview.subjectRef, payload: { appointmentRef: preview.appointmentRef, clinicianRef: preview.clinicianRef, scheduledFor: at, serviceId: preview.serviceId } });
 ledger.hear({ type: 'visit.billable', version: 1, occurredAt: at, subjectRef: preview.subjectRef, payload: { appointmentRef: preview.appointmentRef, serviceId: preview.serviceId, clinicianRef: preview.clinicianRef } });
 ledger.hear({ type: 'review.billable', version: 1, occurredAt: at, subjectRef: preview.subjectRef, payload: { reviewRef: signed.reviewRef, reviewedByRef: preview.doctorRef, feeCode: moneyContract.doctorFees[0]!.feeCode } });
 const drafted = ledger.draftClaim(DOCTOR, { idempotencyKey: key(), payableRef: `PB-${preview.appointmentRef}` });
 if (isRefusal(drafted)) throw new Error(drafted.statement);
 return { ledger, claimRef: drafted.claimRef, said: null, version: 0 };
}

let world: World | null = null;
const current = () => (world ??= open());
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const told = () => { const w = current(); world = { ...w, version: w.version + 1 }; for (const listener of listeners) listener(); };
const snapshot = () => current().version;

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00+02:00`));

export type ClaimScreen = {
 claimRef: string; stateName: string; words: string;
 service: string; amount: string; drafted: string;
 agreed: string | null; notSentBecause: string;
 codeSetAdopted: boolean; said: string | null; canAgree: boolean;
};

function screenFor(reader: 'patient' | 'doctor'): ClaimScreen {
 const w = current();
 const listed = w.ledger.claimsFor(reader === 'patient' ? PATIENT : DOCTOR);
 if (isRefusal(listed)) throw new Error(listed.statement);
 const claim = (listed as ClaimView[]).find(c => c.claimRef === w.claimRef)!;
 const state = claimStateOf(claim.stateCode);
 const stored = w.ledger.payable(claim.payableRef)!;
 return {
  claimRef: claim.claimRef, stateName: state.name, words: reader === 'patient' ? state.patientWords : state.doctorWords,
  service: serviceById(stored.serviceId!).name, amount: money(claim.amountCents / 100), drafted: dayOf(claim.draftedOn),
  agreed: claim.consentExpiresOn ? fill(claimWords.patient.agreed, { day: dayOf(w.ledger.payable(claim.payableRef) ? claim.draftedOn : claim.draftedOn), until: dayOf(claim.consentExpiresOn) }) : null,
  notSentBecause: refusal(claim.notSubmittedBecause).statement,
  codeSetAdopted: claim.codeSetAdopted, said: w.said, canAgree: claim.stateCode === 'drafted'
 };
}

export const usePatientClaim = (): ClaimScreen => { useSyncExternalStore(subscribe, snapshot, snapshot); return screenFor('patient'); };
export const useDoctorClaim = (): ClaimScreen => { useSyncExternalStore(subscribe, snapshot, snapshot); return screenFor('doctor'); };

/** The patient agrees, as herself, to send the claim. */
export function agreeToSend() {
 const w = current();
 const answer = w.ledger.consentToClaim(PATIENT, { idempotencyKey: key(), claimRef: w.claimRef });
 world = { ...w, said: isRefusal(answer) ? answer.statement : null };
 told();
}

/** The doctor asks for it to be sent, and is shown the refusal in the route's own words. */
export function askToSend() {
 const w = current();
 world = { ...w, said: w.ledger.submitClaim(DOCTOR, { idempotencyKey: key(), claimRef: w.claimRef }).statement };
 told();
}
