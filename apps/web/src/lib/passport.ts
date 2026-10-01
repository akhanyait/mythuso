import contract from '../../../../packages/catalog/passport.json';
import { measureSpec as specOf, observations, flagOf, type ObsId } from './observations';
import { isoIn, shortDateOf } from './scheduling';
import { protectedCategories } from './records';
import { devices as kitDevices } from './capture';

/* The account holder's own health record, in one place.
 *
 * The Health Passport drew four charts out of four literal arrays typed into the screen, dated
 * "12 Aug" through "4 Sep" — labels that were right the week they were written and would have been
 * a year wrong by the next winter. The past visit that produced those readings had no screen at
 * all, so nothing connected a visit to what was measured at it, and the two could not have
 * disagreed because they never met.
 *
 * Everything here is dated in day offsets from today, the way every other contract in this
 * repository is, so the preview cannot go stale. The visit list derives the past visit's day from
 * the last reading set below rather than carrying its own number, which is what makes "what the
 * nurse found at this visit" a lookup instead of a coincidence.
 *
 * WHERE THE RECORD COMES FROM. Not one word of it is typed here any more. The holder, the reviewing
 * doctor, the four sets of readings, the three sentences of the last review, the documents and the
 * device sentences are packages/catalog/passport.json's, which was written because this module and
 * the two native ones each declared their own copy with nothing comparing them — and two of the
 * three had already drifted to a different number of charts. scripts/emit-passport.mjs writes the
 * same contract into Swift and Kotlin, so there is one author for all three apps.
 *
 * WHERE THE RANGES COME FROM. Not one range is in that contract either. Every label, unit and
 * reference range is read from `observations` in packages/catalog/records.json, through
 * lib/observations.ts, beside the observation section that says they are indicative. So is the list
 * of categories a device permission would never read. A reading fixture that carried its own range
 * could be corrected on the day the range moved and still disagree with the assessment.
 *
 * Fictional patient, invented readings, nothing stored and nothing sent. */

export const holder = contract.holder;

/* The clinician who reviews what a nurse records for this account. One name, read by the timeline,
   the document list and the past-visit summary, rather than typed once in each of them. */
export const reviewer = { name: contract.reviewer.name, registration: contract.reviewer.registration };
export const reviewedBy = `${reviewer.name} · ${reviewer.registration}`;

export type MeasureId = ObsId;
export const measureSpec = (id: MeasureId) => specOf(id);

/** One set of observations, taken at one visit, on one day. */
export type ReadingSet = {
 /** Days before today. Negative. The ISO date and every label are derived from it. */
 dayOffset: number;
 values: Partial<Record<MeasureId, number>>;
 /** Why a reading sat where it did, when somebody said so at the visit. */
 note?: string;
};

/* Four home visits over three months. The third is the one worth opening: a systolic of 141 against
   an upper reference of 140, with the reason the person gave for it. */
export const readingSets: ReadingSet[] = contract.readingSets as ReadingSet[];

export const dateOf = (dayOffset: number) => isoIn(new Date(Date.now() + dayOffset * 86_400_000));
export const labelOf = (dayOffset: number) => shortDateOf(dateOf(dayOffset));

/** The visit the last set of readings was taken at. The visit list reads its day from here. */
export const latestSet = readingSets[readingSets.length - 1];
export const setOnDay = (dayOffset: number) => readingSets.find(s => s.dayOffset === dayOffset);
/* The line under the home's figures: how many visits they come from, the last one's day, and that they
   are samples. The words are passport.json#onRecord's, which the phones read through the generated
   PassportData, so the marker cannot be dropped on one platform and kept on another. */
export const onRecord = contract.onRecord.sentence
 .replace('{count}', String(readingSets.length)).replace('{date}', labelOf(latestSet.dayOffset));

/** Every measure that has a value in a given set, in the order the assessment collects them. */
export const measuredIn = (set: ReadingSet): MeasureId[] =>
 observations.map(o => o.id as MeasureId).filter(id => set.values[id] !== undefined);

export type Flag = ReturnType<typeof flagOf>;
/** Where a value sits against its own reference range. Asked of the range, never stored beside it. */
export const flagFor = (id: MeasureId, value: number): Flag => flagOf(id, String(value));
export const isInRange = (id: MeasureId, value: number) => flagFor(id, value) === 'normal';
export const rangeText = (id: MeasureId) => {
 const spec = measureSpec(id);
 return `${spec.low}–${spec.high} ${spec.unit}`;
};
export const formatValue = (id: MeasureId, value: number) => (measureSpec(id).step < 1 ? value.toFixed(1) : String(value));

/** A measure's readings over time, oldest first, for a chart. Only the sets that carry it. */
export const seriesFor = (id: MeasureId) =>
 readingSets.filter(set => set.values[id] !== undefined)
  .map(set => ({ label: labelOf(set.dayOffset), value: set.values[id]!, note: set.note }));

/* The four the trends screen leads with. Seven charts on one phone screen is a wall; these are the
   four a person with a blood-pressure diagnosis actually watches, and the rest are one tap below in
   the same shape. The other three are not in the contract: they are whatever the observation list
   holds that these four are not, so a reading added to records.json appears on the second screen
   without anybody editing a passport. */
export const headlineMeasures: MeasureId[] = contract.headline.measures;
export const otherMeasures: MeasureId[] = observations
 .map(o => o.id as MeasureId).filter(id => !headlineMeasures.includes(id));

/* ---- What the doctor said about the last visit ------------------------------------------------
   A nurse records; a doctor reviews. The two are separate acts with separate names on them, and the
   summary screen shows both rather than presenting a nurse's observation as a clinical conclusion. */
export type Review = { assessment: string; plan: string; next: string; reviewedDayOffset: number };
export const lastReview: Review = contract.lastReview;

/* ---- The record's own documents ---------------------------------------------------------------
   Issued dates are derived from the visit they came out of rather than held in the contract, so a
   document can never claim to have been issued on a day no visit happened. */
export type PassportDocument = { name: string; kind: string; dayOffset: number; reviewed: boolean; opens?: string };
export const documents: PassportDocument[] = contract.documents
 .map(document => ({ ...document, dayOffset: latestSet.dayOffset }));

/* ---- What a device would and would not be allowed to hand over --------------------------------
   Both halves are derived. What a reading type *is* comes from the assessment's own observation
   list, because MyThuso does not read a category it has nowhere to file. What is never read comes
   from the record contract's protected categories, which are released by the patient entry by entry
   and are not a thing a permission sheet can grant on somebody's behalf. */
export const readableMeasures: MeasureId[] = observations.map(o => o.id as MeasureId);
export const neverRead = protectedCategories;
/** The instruments the kit itself carries, and what each of them measures. */
export const kitInstruments = kitDevices;

/* ---- What each integration asks, and what the passport refuses ---------------------------------
   The sentences the device screens and the trends screen say word for word, on all three platforms.
   They are exported here so the web has somewhere to read them from that is not a component, and
   the same contract is what scripts/emit-passport.mjs writes into PassportData on both native apps.
   The notice that says nothing is connected is not among them: that one belongs to
   packages/catalog/capabilities.json and is rendered, never written. */
export type DeviceIntegration = { id: string; name: string; offeredOn: string[]; sheet: string; withdraw: string };
export const deviceIntegrations: DeviceIntegration[] = contract.devices;
export type PassportRefusal = { id: string; sentence: string; why: string };
export const refusals: PassportRefusal[] = contract.refusals;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
