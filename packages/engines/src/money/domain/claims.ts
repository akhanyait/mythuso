/**
 * Claims to a medical scheme as Money holds them: the billing half of a claim, the patient's agreement to send it, and
 * the gates that stop it — every one of them, in this build, before anything leaves.
 *
 * ── What a claim is built from ───────────────────────────────────────────────────────────────
 *
 * A visit Money heard was billable (visit.billable@1) and a review Money heard a doctor sign (review.billable@1), about
 * the same person, by the doctor who asks. Money does not hear review.signed@1: it carries the encounter reference, and
 * the engine facing payers holds no reference into the record (packages/catalog/claims.json builtFrom). And no claim
 * route carries the review's reference, because Clinical declares the reviews resource; the ledger finds the review
 * from what it heard.
 *
 * ── What a claim never carries ───────────────────────────────────────────────────────────────
 *
 * A code. No licensed tariff code set and no adopted ICD-10 code set exist, so a Claim has no field for one, nothing
 * here lists one, and nothing works one out from a service's name. A request carrying a field named for a code, a
 * coding, a diagnosis or a reason is refused by the words of its name. A diagnosis would never be Money's anyway: it is
 * chosen inside the record and sent to the switch from there.
 *
 * ── Where every claim stops ──────────────────────────────────────────────────────────────────
 *
 * At the switching partner, which is the claim-response door in packages/catalog/feeds.json, locked until every
 * switch-on condition is evidenced. The partner is asked before the code because a code set is adopted with the
 * partner. Nothing past the last gate writes anything: there is no adapter, so no code here can mark a claim sent,
 * answered, paid or rejected, and the build holds it to that.
 */
import contract from '../../../../catalog/claims.json' with { type: 'json' };
import consent from '../../../../catalog/consent.json' with { type: 'json' };
import events from '../../../../catalog/events.json' with { type: 'json' };
import apiContract from '../../../../catalog/apis.json' with { type: 'json' };

export const claimsContract = contract;
export type ClaimStateId = 'drafted' | 'consented' | 'submitted' | 'responded' | 'paid' | 'rejected';
/** The two states this build reaches. The other four are the frame's, and nothing writes them. */
export type ReachedState = 'drafted' | 'consented';

/** The billing half of a claim. No code, no diagnosis and no scheme membership number: none is Money's to hold. */
export type Claim = {
 claimRef: string; payableRef: string;
 /** The review Money heard signed, kept to make one claim a review. Never on a route. */
 reviewRef: string;
 doctorRef: string; subjectRef: string;
 /** The payable's catalogue amount when the claim was drafted. */
 amountCents: number;
 draftedOn: string;
 stateCode: ReachedState;
 consentedOn: string | null;
 /** Kept from the setting in force on the day she agreed, so a later change never moves it. */
 consentDays: number | null;
 consentExpiresOn: string | null;
};

/** A review Money heard signed: who signed it, about whom, and the day. Nothing it found. */
export type HeardReview = { reviewRef: string; doctorRef: string; subjectRef: string; on: string };

export type ClaimView = {
 claimRef: string; stateCode: ReachedState; payableRef: string; amountCents: number; draftedOn: string;
 consentExpiresOn: string | null; codeSetAdopted: boolean;
 /** The refusal a request to send it is answered with today. */
 notSubmittedBecause: string;
};

type State = { id: ClaimStateId; name: string; reachable: boolean; patientWords: string; doctorWords: string };
export const claimStates = contract.states as State[];
export function claimStateOf(id: string): State {
 const found = claimStates.find(s => s.id === id);
 if (!found) throw new Error(`No claim state "${id}" in packages/catalog/claims.json.`);
 return found;
}

/** The code sets adopted in this build: none. A claim is sent only with a code from one of these. */
export const adoptedCodeSets: readonly string[] = contract.codeSets.adopted;
export const codeSetAdopted = (): boolean => adoptedCodeSets.length > 0;
/** The longest an agreement to send a claim may last: the founder's ceiling on every consent grant. */
export const CONSENT_CEILING_DAYS: number = consent.grants.maximumExpiryDays;

/* ---- Words in what a request sends ------------------------------------------------------------------ */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const names = (sent: readonly string[], list: readonly string[]) => sent.some(name => wordsOf(name).some(word => list.includes(word)));
const canonical = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const CLINICAL_WORDS = apiContract.clinicalContent.words.map(canonical);
/** Whether a request carries clinical content by the name of a field: a diagnosis, findings, an assessment. */
export const carriesClinicalContent = (sent: readonly string[]) => sent.some(name => CLINICAL_WORDS.includes(canonical(name)) || wordsOf(name).some(w => CLINICAL_WORDS.includes(w)));
/** Whether a request carries a code, a coding or a reason by the name of a field. */
export const typesACode = (sent: readonly string[]) => names(sent, contract.codeSets.fieldWords);
const GRANT_FIELDS = (events.grantFields as string[]).map(canonical);
/** Whether a request carries anything about a person's consent grants: a recipient, a scope, a sealed flag. */
export const carriesAGrant = (sent: readonly string[]) => sent.some(name => GRANT_FIELDS.includes(canonical(name)) || wordsOf(name).some(w => ['grant', 'grants', 'recipient', 'scope', 'sealed'].includes(w)));

/** A Johannesburg date `days` after another. */
export function addDays(isoDate: string, days: number): string {
 const at = new Date(`${isoDate}T12:00:00+02:00`);
 at.setUTCDate(at.getUTCDate() + days);
 return at.toISOString().slice(0, 10);
}

/** A claim as the patient it is about, or the doctor who drafted it, reads it. */
export const claimViewOf = (claim: Claim): ClaimView => ({
 claimRef: claim.claimRef, stateCode: claim.stateCode, payableRef: claim.payableRef, amountCents: claim.amountCents, draftedOn: claim.draftedOn,
 consentExpiresOn: claim.consentExpiresOn, codeSetAdopted: codeSetAdopted(),
 notSubmittedBecause: claim.stateCode === 'drafted' ? 'claim-without-consent' : contract.stop.refusal
});
