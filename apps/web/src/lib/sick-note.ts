import contract from '../../../../packages/catalog/sick-note.json' with { type: 'json' };
import { callOnlyRefusal, protocolLine } from './sick-note.generated.ts';

/* The doctor's medical certificate (2 October 2026): the rules and the arithmetic, and nothing a screen
   draws. Every sentence, limit and consultation is packages/catalog/sick-note.json's; this file decides
   which of them apply to a draft. It is pure on purpose — no vetting lookup, no React, and no clock in
   a rule — so scripts/check-sick-note.mjs can import it under Node and replay the contract's rules
   against it, and so the screen and the boundary check cannot disagree about what is refused.

   Who is writing is decided by the caller from the vetting register (`can()` in lib/vetting.ts) and
   handed in as an Issuer, because whether a capability is granted and whether this party may use it
   today are two different refusals with two different sentences: a nurse is never granted it, and a
   doctor whose registration lapsed holds it and may not use it.

   Days are offsets from today, never dates, so the preview's consultations stay where they are
   whatever day it is opened, and the date a screen shows is worked out from the offset once, by the
   helpers under Days below — the only place here that reads the clock. */

export const sickNote = contract;
export { protocolLine };
export type FitnessId = 'unfit' | 'light';
export type Consultation = typeof contract.consultations[number];
export type Issuer = { granted: boolean; allowed: boolean; reason: string; name: string; registration: string };
export type SickNoteDraft = {
 reference: string;
 patient: string;
 fromOffset: number;          // first day of the period, days from today
 toOffset: number;            // last day, inclusive
 fitness: FitnessId;
 consent: boolean;            // the patient agreed to the illness being described
 description: string;
};
export type Refusal = { id: string; sentence: string };

const sentenceOf = (id: string) => {
 const refusal = contract.refusals.find(r => r.id === id) as { id: string; sentence?: string } | undefined;
 if (!refusal?.sentence) throw new Error(`packages/catalog/sick-note.json has no sentence for the refusal "${id}".`);
 return refusal.sentence;
};
const withDays = (id: string, days: number) => sentenceOf(id).replace('{days}', String(days));

export const consultationFor = (reference: string): Consultation | undefined =>
 contract.consultations.find(c => c.reference === reference.trim());

/* The draft a composer opens on: the consultation day and the days after it, unfit for duty, and no
   description — the rule 16(1)(f) proviso is the default, never something the doctor has to choose. */
export function draftFor(reference: string, patient: string): SickNoteDraft {
 const day = consultationFor(reference)?.dayOffset ?? 0;
 const from = Math.min(day, 0);
 return { reference, patient, fromOffset: from, toOffset: from + contract.period.defaultDays - 1, fitness: 'unfit', consent: false, description: '' };
}

export const daysCovered = (draft: SickNoteDraft) => draft.toOffset - draft.fromOffset + 1;

/* Every rule the contract writes, in the order a doctor would want to hear them: whether there is a
   consultation to certify at all, whether this person may sign, and then what the draft says. All of
   them are returned rather than the first, because a doctor told one reason at a time fixes the form
   three times. */
export function refusalsFor(draft: SickNoteDraft, issuer: Issuer): Refusal[] {
 const out: Refusal[] = [];
 const refuse = (id: string, sentence = sentenceOf(id)) => out.push({ id, sentence });
 const seen = consultationFor(draft.reference);
 if (!seen) refuse('no-consultation');
 else {
  /* A call with nobody in the room examines nobody. The sentence is the consultation contract's own. */
  if (seen.kind !== 'home-visit') refuse('from-a-call', callOnlyRefusal);
  if (seen.dayOffset > 0) refuse('not-yet-seen');
  if (seen.patient !== draft.patient.trim()) refuse('not-this-patient');
 }
 if (!issuer.granted) refuse('not-a-doctor', contract.issuer.notADoctor);
 else if (!issuer.allowed) refuse('registration', issuer.reason);
 if (draft.toOffset < draft.fromOffset) refuse('period-backwards');
 if (draft.fromOffset > 0) refuse('starts-after-issue');
 if (seen && seen.dayOffset - draft.fromOffset > contract.period.backdateDays) refuse('backdated-too-far', withDays('backdated-too-far', contract.period.backdateDays));
 if (daysCovered(draft) > contract.period.maxDays) refuse('period-too-long', withDays('period-too-long', contract.period.maxDays));
 const described = draft.description.trim().length > 0;
 if (described && !draft.consent) refuse('diagnosis-without-consent');
 if (draft.consent && !described) refuse('consent-without-description');
 return out;
}

/* ---- The certificate, as the patient would read it ------------------------------------------------
   Rule 16's items in rule 16's order. What the register does not hold is printed as not held rather
   than invented; the identity number and the employment number are never carried at all. */
export type CertificateLine = { id: string; label: string; value: string };
export type SickNoteCertificate = { reference: string; patient: string; issuedOffset: number; lines: CertificateLine[]; blockName: string };

/* Rule 16(1)(j): initials and surname in block letters. "Dr Ayanda Dlamini" is "A. DLAMINI". */
export function blockLettersOf(name: string) {
 const words = name.replace(/^(Dr|Sister|Sr|Prof)\.?\s+/i, '').trim().split(/\s+/);
 const surname = words.pop() ?? '';
 return [...words.map(w => `${w.charAt(0).toUpperCase()}.`), surname.toUpperCase()].join(' ');
}

const label = (id: string) => contract.fields.find(f => f.id === id)?.label ?? id;

export function certificateFrom(draft: SickNoteDraft, issuer: Issuer, dayOf: (offset: number) => string): SickNoteCertificate {
 const seen = consultationFor(draft.reference);
 const fitness = contract.fitness.find(f => f.id === draft.fitness) ?? contract.fitness[0];
 const basis = [contract.basis.homeVisit, ...(seen && draft.fromOffset < seen.dayOffset ? [contract.basis.backdated] : [])].join(' ');
 const period = `${dayOf(draft.fromOffset)} to ${dayOf(draft.toOffset)} · ${daysCovered(draft)} ${contract.screen.daysLabel}`;
 const description = draft.consent && draft.description.trim() ? draft.description.trim() : contract.diagnosis.withheld;
 const lines: CertificateLine[] = [
  { id: 'practitioner', label: label('practitioner'), value: issuer.name },
  { id: 'registration', label: label('registration'), value: issuer.registration },
  { id: 'qualification', label: label('qualification'), value: contract.notHeld },
  { id: 'practiceNumber', label: label('practiceNumber'), value: contract.notHeld },
  { id: 'practiceAddress', label: label('practiceAddress'), value: contract.notHeld },
  { id: 'patient', label: label('patient'), value: draft.patient },
  { id: 'consultation', label: label('consultation'), value: seen ? `${seen.reference} · ${dayOf(seen.dayOffset)} at ${seen.time}` : draft.reference },
  { id: 'basis', label: label('basis'), value: basis },
  { id: 'statement', label: label('statement'), value: fitness.statement },
  { id: 'description', label: contract.diagnosis.descriptionLabel, value: description },
  { id: 'period', label: label('period'), value: period },
  { id: 'issued', label: label('issued'), value: dayOf(0) },
  { id: 'signature', label: label('signature'), value: `${blockLettersOf(issuer.name)} · ${contract.screen.unsigned}` }
 ];
 return { reference: draft.reference, patient: draft.patient, issuedOffset: 0, lines, blockName: blockLettersOf(issuer.name) };
}

/* ---- Days ---------------------------------------------------------------------------------------
   An offset becomes a date once, at the edge, against the reader's own calendar day. The rules above
   never see a date, so a certificate opened just before midnight cannot change its answer at midnight. */
const DAY = 86_400_000;
const todayUtc = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
export const isoOfOffset = (offset: number) => new Date(todayUtc() + offset * DAY).toISOString().slice(0, 10);
export const offsetOfIso = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - todayUtc()) / DAY);
export const longDayOf = (offset: number) =>
 new Date(todayUtc() + offset * DAY).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ---- What this session wrote -----------------------------------------------------------------------
   A certificate signed in the preview is held in this module's memory and nowhere else, so the
   patient's Passport can show what the doctor just wrote when the role is switched in the same tab. It
   is not persistence: no storage API, no request, and a reload ends it — which the Passport says, in
   the contract's words. Listeners follow the useSyncExternalStore shape. */
let written: readonly SickNoteCertificate[] = [];
const listeners = new Set<() => void>();
export const writtenThisSession = () => written;
export function subscribeWritten(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function keepForThisSession(certificate: SickNoteCertificate) {
 written = [certificate, ...written];
 listeners.forEach(l => l());
}
