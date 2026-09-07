import contract from '../../../../packages/catalog/teleconsult.json';
import schema from '../../../../packages/catalog/records.json';
import { can, roleById, type VettingSubject } from './vetting';

/* The teleconsultation call: the reasoning, not the screen.
 *
 * Four things in here are the feature, and everything the components do is a rendering of one of
 * them.
 *
 * Who is in the room. A MyThuso consultation is frequently three people — a patient, a doctor on
 * video and a nurse standing in the patient's kitchen — and sometimes four. That is not a private
 * doctor's appointment, and pretending it is would mean nobody ever tells the patient who can hear
 * them. So presence is a roster of named parties resolved from the vetting register, each one
 * consented to separately and each one revocable in the middle of the call.
 *
 * What a bad line takes away. The connection states are ordered by fidelity and what each permits
 * is a subset of the one above it, so "what may this doctor conclude right now" is a set
 * intersection rather than a judgement call taken under pressure. Sound only is a designed path,
 * not an error: it is how most of South Africa would actually hold this call.
 *
 * What an unfinished encounter is called. This is the one that matters. An outcome that did not
 * reach a decision cannot write the assessment or the plan and cannot be called a consultation —
 * held here as arithmetic and checked in scripts/check-boundaries.mjs, because the failure mode is
 * not that somebody writes the wrong sentence, it is that a half-finished encounter sits in a
 * record looking exactly like a finished one until somebody relies on it.
 *
 * Who may consult at all. Nothing in this module writes a refusal sentence for a clinician: the
 * call asks can(subject, 'sign-clinical-review') and shows what the clinical queue would show, in
 * the same words, because a doctor refused differently by two screens is a doctor who believes
 * neither.
 *
 * Nothing connects. No WebRTC, no camera, no microphone, no permission is requested, and the app
 * declares none. Every party is fictional. */

export const media = contract.media;
export const identity = contract.identity;
export const participants = contract.participants;
export const consentItems = contract.consent;
export const recording = contract.recording;
export const clinicalLimits = contract.clinicalLimits;
export const connectionStates = contract.connection;
export const reconnect = contract.reconnect;
export const outcomes = contract.outcomes;
export const rules = contract.rules;
export const refusals = contract.refusals;
export const routes = contract.routes.items;
export const refusedRoute = contract.routes.refusedRoute;
export const waitingRoom = contract.waitingRoom.states;
export const maximumWaitMinutes = contract.waitingRoom.maximumWaitMinutes;
export const issued = contract.issued.items;

export type Participant = typeof participants[number];
export type ConsentItem = typeof consentItems[number];
export type ClinicalLimit = typeof clinicalLimits[number];
export type ConnectionState = typeof connectionStates[number];
export type EncounterOutcome = typeof outcomes[number];

export const participantById = (id: string) => participants.find(p => p.id === id)!;
export const consentById = (id: string) => consentItems.find(c => c.id === id)!;
export const connectionById = (id: string) => connectionStates.find(c => c.id === id)!;
export const outcomeById = (id: string) => outcomes.find(o => o.id === id)!;
export const limitById = (id: string) => clinicalLimits.find(l => l.id === id)!;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
export const routeById = (id: string) => routes.find(r => r.id === id)!;
export const waitingById = (id: string) => waitingRoom.find(w => w.id === id)!;
export const documentById = (id: string) => issued.find(d => d.id === id)!;

/* The two documents a call may not produce. Listed from the contract rather than from somebody
   remembering which two they were, because "which of these can a doctor actually give me" is the
   question a patient asks at the end of the call and the answer must not depend on a screen having
   been kept up to date by hand. */
export const refusedDocuments = issued.filter(d => !d.mayIssue);

/* A route's price is the catalogue's, or there is no price. The doctor joining a nurse's visit
   carries no service id on purpose: the visit was already paid for, and a nurse who has to justify
   the cost of a second opinion will sometimes not ask for one. That is a clinical safety decision
   before it is a commercial one, and it is why this returns undefined rather than a zero. */
export const priceOfRoute = (routeId: string, priceOf: (serviceId: string) => number | undefined) => {
 const serviceId = routeById(routeId).serviceId;
 return serviceId ? priceOf(serviceId) : undefined;
};

/* Ordered worst-first, which is the order the ladder is read in when something is going wrong. */
export const degradations = [...connectionStates].sort((a, b) => a.fidelity - b.fidelity);

/* A person in the room, as the roster shows them: the contract's role, the vetting register's name
 * and registration. The two are deliberately kept apart — the contract says a nurse may be asked to
 * leave, the register says which nurse and whether her clearance is current — because a roster that
 * carried its own names would be a second copy of the vetting record, and the copy is what a patient
 * would be reading. */
export type RosterEntry = {
 participant: Participant;
 subject?: VettingSubject;
 /* The display name. A patient is "you"; everybody else is the party the register holds. */
 name: string;
 registration?: string;
 present: boolean;
 /* Whether this person has been consented to. The patient and the doctor are the two ends of the
    call, so the patient's own presence is not a question put to them. */
 consented: boolean;
};

export function nameOf(participant: Participant, subject?: VettingSubject, patientName = 'You') {
 if (participant.id === 'patient') return patientName;
 return subject?.name ?? participant.name;
}

/* What the doctor may conclude, given the line and who is standing in the room.
 *
 * Two gates, not one. The connection decides what the doctor can perceive; the roster decides
 * whether there is anybody there to examine on their behalf. A limit that needs a nurse is withdrawn
 * the moment the nurse is asked to step out, which is exactly the consequence a patient is told
 * about before they ask her to. */
export function permitted(connectionId: string, nursePresent: boolean): ClinicalLimit[] {
 const state = connectionById(connectionId);
 return clinicalLimits.filter(limit =>
  state.permits.includes(limit.id) && (limit.needs !== 'nurse' || nursePresent));
}
export function withdrawn(connectionId: string, nursePresent: boolean): ClinicalLimit[] {
 const allowed = new Set(permitted(connectionId, nursePresent).map(l => l.id));
 return clinicalLimits.filter(l => !allowed.has(l.id));
}
/* A decision needs the line to still permit concluding. On a dropped call it does not, which is why
   the doctor's screen has no way to close the encounter while it is down. */
export const mayConclude = (connectionId: string, nursePresent: boolean) =>
 permitted(connectionId, nursePresent).some(l => l.id === 'conclude');

/* Which outcome an encounter has, worked out from what actually happened rather than chosen from a
 * menu. This is the heart of it: a clinician under time pressure, offered a list, picks the one
 * nearest the top, and "completed" is nearly always nearest the top. So it is not offered.
 *
 * The order is the order the refusals bite in: a clinician who may not consult never opened the
 * call, an identity check that failed stopped it at the door, consent refused ended it there, a
 * line that never came back leaves an interrupted encounter, and only an encounter that reached a
 * signed decision is a consultation. */
export type Attempt = {
 clinicianAllowed: boolean;
 identityConfirmed: boolean;
 consented: boolean;
 everConnected: boolean;
 lineDropped: boolean;
 resumed: boolean;
 decisionReached: boolean;
};
export function outcomeOf(attempt: Attempt): EncounterOutcome {
 if (!attempt.clinicianAllowed) return outcomeById('clinician-refused');
 if (!attempt.identityConfirmed) return outcomeById('identity-failed');
 if (!attempt.consented) return outcomeById('consent-declined');
 if (!attempt.everConnected) return outcomeById('never-connected');
 if (!attempt.decisionReached) return outcomeById('interrupted');
 return attempt.lineDropped && attempt.resumed ? outcomeById('resumed') : outcomeById('completed');
}

/* The sections of the consultation record an outcome writes, resolved against records.json itself
 * rather than restated here. An interrupted encounter writes a reason, a history and a note; it
 * does not write an assessment and it does not write a plan, so those sections come back as
 * withheld with the outcome's own sentence attached rather than as empty boxes somebody could fill
 * in later and sign. */
type SectionSpec = { id: string; name: string; required: boolean; note?: string; gatedBy?: string };
export const consultationSections = schema.consultation.sections as SectionSpec[];
export type WrittenSection = { section: SectionSpec; written: boolean };
export function sectionsFor(outcome: EncounterOutcome): WrittenSection[] {
 const writes = new Set<string>(outcome.writes);
 return consultationSections.map(section => ({ section, written: writes.has(section.id) }));
}

/* Whether the call may open at all, in the clinical queue's own words. Not a sentence of this
   feature's own: the same capability, the same refusal, the same doctor. */
export const mayConsult = (doctor: VettingSubject) => can(doctor, 'sign-clinical-review');
export const roleNameOf = (subject?: VettingSubject) => subject && roleById(subject.roleId)?.name;
