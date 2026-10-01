import contract from '../../../../packages/catalog/dispensing.json';
import { inDays, type Decision } from './vetting';
/* Substitution, and how long a repeat is allowed to live.
 *
 * A pharmacist hands over something other than what was written; a repeat runs out. Both are
 * routine, and both are where harm hides — which is why almost nothing on the screen this module
 * feeds is a yes-or-no. The interesting values are the three substitution classes, and the reason
 * there are three rather than two is South African law: section 22F of the Medicines and Related
 * Substances Act does not permit generic substitution, it requires the pharmacist to tell the
 * patient about an interchangeable medicine and dispense it unless one of four exceptions applies.
 * So the lowest class here is "may be substituted, and the patient is told". A silent swap is not
 * the mild end of this feature; it is outside it, and there is nowhere in this module to express it.
 *
 * The arithmetic below is the other half. A chronic authorisation is boxed twice — by a date and by
 * a number of repeats — and it ends on whichever arrives first. Neither of those is written down as
 * a conclusion: the contract carries the day it was authorised and the months it runs for, and the
 * expiry is computed here, in Dispensing.swift and in Dispensing.kt from the same two numbers, so
 * three platforms cannot disagree about the day a repeat stops.
 *
 * Nothing here dispenses anything. No pharmacy is contacted, no medicine exists, and every patient,
 * pharmacist and product below is fictional. */

export type SubstitutionClassId = 'interchangeable' | 'pharmacist-judgement' | 'must-not';
export type ItemOutcome = 'substituted' | 'as-written' | 'refused-by-patient';

export type SubstitutionClass = { id: string; name: string; shortName: string; detail: string; whoDecides: string; needsWrittenReason: boolean; tellsThePrescriber: boolean; tone: string };
/* Four of the ten grounds carry a section number, and six do not. Written as one optional field
   rather than two lists: a ground is a ground, and which of them the Act happens to name is a
   property of it rather than a separate kind of thing. */
export type SubstitutionGround = { id: string; name: string; section?: string; class: string; detail: string };
export const substitutionClasses: SubstitutionClass[] = contract.substitutionClasses;
export const grounds: SubstitutionGround[] = contract.grounds;
export const neverChanges = contract.neverChanges;
export const mayChange = contract.mayChange;
export const rules = contract.rules;
export const refusals = contract.refusals;
export const handover = contract.handover;
export const pharmacist = contract.prescription.pharmacist;
export const recordTypes: string[] = contract.recordTypes;
/* The one sentence the prescription detail on all three platforms needs, so that changing it is one
   edit rather than three that have to agree. */
export const crossReference = contract.crossReference;

export const classById = (id: string) => substitutionClasses.find(c => c.id === id)!;
export const groundById = (id: string) => grounds.find(g => g.id === id)!;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
/* The four exceptions in section 22F, in the Act's own order. Held as a derived list rather than a
   second copy: a ground that stops carrying a section number drops out of here by itself. */
export const statutoryGrounds = grounds.filter(g => !!g.section);

export type PrescribedItem = {
 id: string; prescribed: string; molecule: string; strength: string; form: string; dose: string;
 quantity: string; classId: SubstitutionClassId; ground: string; secondGround?: string;
 outcome: ItemOutcome; dispensed: string; sameness: string[]; differences: string[];
 patientWords: string; writtenReason?: string; accepted: boolean; note: string;
};
type RawItem = Omit<PrescribedItem, 'classId' | 'ground' | 'outcome' | 'secondGround' | 'writtenReason'>
 & { class: string; ground: string; secondGround?: string; outcome: string; writtenReason?: string };

export const prescription = {
 ...contract.prescription,
 issued: inDays(contract.prescription.issuedInDays),
 items: (contract.prescription.items as RawItem[]).map(raw => ({
  ...raw, classId: raw.class as SubstitutionClassId, outcome: raw.outcome as ItemOutcome
 })) as PrescribedItem[]
};
/* A substitution is only a substitution if something actually changed. An item the patient refused
   was offered and not swapped, so it is not counted here — counting it would let a screen say
   "two items substituted" about a patient who accepted one. */
export const substituted = prescription.items.filter(i => i.outcome === 'substituted');

/* ---- What the patient is owed, in words ------------------------------------------------------
   Not a label on a box. Three sentences a person can repeat to somebody else: this is a
   substitution, this is what it replaces, this is what will look different. Assembled here so all
   three platforms say the same thing rather than each writing their own summary of it. */
export type Telling = { headline: string; replaces?: string; same: string[]; different: string[]; words: string };
export function tellingFor(item: PrescribedItem): Telling {
 const headline = item.outcome === 'substituted' ? 'This is not what was written on your prescription'
  : item.outcome === 'refused-by-patient' ? 'You were offered a swap and said no'
   : 'This is exactly what was written on your prescription';
 return {
  headline,
  replaces: item.outcome === 'substituted' ? item.prescribed : undefined,
  same: item.sameness, different: item.differences, words: item.patientWords
 };
}

/* ---- The chronic authorisation ---------------------------------------------------------------
   Boxed twice. It expires on a date and it allows a number of repeats, and it ends on whichever
   arrives first — which is the whole point, because a repeat that never expires is a prescription
   nobody is reviewing.

   The month here is the same 30.44 days the vetting module renews checks on, so an authorisation
   and a credential that both run for six months run out on the same day. */
const DAYS_PER_MONTH = 30.44;
export const authorisation = contract.authorisation;
export const expiresInDays = authorisation.authorisedByDays + Math.round(authorisation.validMonths * DAYS_PER_MONTH);
export const expiresOn = inDays(expiresInDays);
export const authorisedOn = inDays(authorisation.authorisedByDays);
export const repeatsRemaining = authorisation.repeatsAuthorised - authorisation.repeatsUsed;
/* How many days of medicine the remaining repeats are, against how many days of authorisation are
   left to collect them in. Where the second is smaller, some of what was authorised cannot be
   collected — and the screen says so rather than letting a patient plan on it. */
export const daysOfMedicineLeft = repeatsRemaining * authorisation.daysPerRepeat;
export const binds: 'date' | 'repeats' = expiresInDays < daysOfMedicineLeft ? 'date' : 'repeats';
export const repeatsCollectableBeforeExpiry = Math.min(repeatsRemaining, Math.floor(expiresInDays / authorisation.daysPerRepeat));
export const strandedRepeats = repeatsRemaining - repeatsCollectableBeforeExpiry;

/* An early collection is refused with a date, not with a shrug. The days between collections are
   the authorisation's, not the collector's: somebody accumulating a chronic medicine at home is the
   first thing anybody would want to notice. */
export const nextCollectionInDays = authorisation.lastCollectedDays + authorisation.minimumDaysBetween;
export const nextCollectionOn = inDays(nextCollectionInDays);
export const lastCollectedOn = inDays(authorisation.lastCollectedDays);
export const mayCollectToday = nextCollectionInDays <= 0 && expiresInDays >= 0 && repeatsRemaining > 0;
export type CollectionAnswer = { allowed: boolean; reason: string };
export function collectionAnswer(): CollectionAnswer {
 if (repeatsRemaining <= 0) return { allowed: false, reason: `Every repeat on ${authorisation.reference} has been used. It ends here, in a review — nothing renews on its own.` };
 if (expiresInDays < 0) return { allowed: false, reason: `${authorisation.reference} expired ${-expiresInDays} days ago. A repeat cannot be collected against it, and extending it is a doctor's decision rather than this screen's.` };
 if (nextCollectionInDays > 0) return { allowed: false, reason: `The last thirty days were collected ${-authorisation.lastCollectedDays} days ago and this authorisation allows one collection every ${authorisation.minimumDaysBetween} days. The next is due in ${nextCollectionInDays} days — and the question worth asking first is how the last month went.` };
 return { allowed: true, reason: `One repeat of ${authorisation.daysPerRepeat} days may be collected today. ${repeatsRemaining} of ${authorisation.repeatsAuthorised} remain.` };
}
/* The last one is said before it is handed over, not after. Somebody who finds out at the counter
   that there is nothing behind this month's pack has already run out. */
export const isFinalRepeat = repeatsRemaining === 1;

export const formatDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

/* The prescriber as a pharmacy is allowed to know them: the vetting register's answer, and not who they
   are. packages/catalog/medicines.json#partnerQueue.neverCarries lists prescriberRef, so the partner's
   substitution screen and the prescription a partner opens draw this in place of a name and an HPCSA
   number. The check's name comes from vetting.json, so a refusal reads in the register's own words. */
export const prescriberStanding = (decision: Decision) => decision.allowed
 ? 'May prescribe · every check current on the vetting register'
 : `May not prescribe · ${decision.blockedBy.map(check => check.name).join(' and ') || 'held by the vetting register'}`;
