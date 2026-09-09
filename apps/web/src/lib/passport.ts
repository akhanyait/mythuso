import { observations, flagOf, type ObsId } from '../features/Clinical';
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
 * WHERE THE RANGES COME FROM, AND WHERE THEY SHOULD. Not one range is typed here. Every label,
 * unit and reference range is read from `observations` in features/Clinical.tsx, which is the one
 * place the web declares them and the one place scripts/check-boundaries.mjs compares against the
 * iOS and Android assessments. That is a feature importing into a library, which is the wrong way
 * round — and it is still better than a second copy. The right home for these seven ranges is
 * packages/catalog/records.json, beside the observation section that already says they are
 * indicative; until they are there, this module reads the single copy rather than making a second.
 *
 * Fictional patient, invented readings, nothing stored and nothing sent. */

export const holder = { name: 'Lerato Molefe', passportId: 'TH-2048-3920', issuedBy: 'Akhanya IT Innovations' };

/* The clinician who reviews what a nurse records for this account. One name, read by the timeline,
   the document list and the past-visit summary, rather than typed once in each of them. */
export const reviewer = { name: 'Dr N. Khumalo', registration: 'MP 0741225' };
export const reviewedBy = `${reviewer.name} · ${reviewer.registration}`;

export type MeasureId = ObsId;
export const measureSpec = (id: MeasureId) => observations.find(o => o.id === id)!;

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
export const readingSets: ReadingSet[] = [
 { dayOffset: -87, values: { systolic: 128, diastolic: 82, pulse: 76, respiratory: 16, temperature: 36.7, oxygen: 98, glucose: 5.6 } },
 { dayOffset: -59, values: { systolic: 134, diastolic: 86, pulse: 74, respiratory: 16, temperature: 36.6, oxygen: 98, glucose: 6.1 } },
 { dayOffset: -31, values: { systolic: 141, diastolic: 90, pulse: 80, respiratory: 18, temperature: 37.0, oxygen: 97, glucose: 5.4 }, note: 'Missed medication' },
 { dayOffset: -3, values: { systolic: 136, diastolic: 85, pulse: 72, respiratory: 16, temperature: 36.8, oxygen: 98, glucose: 5.2 } }
];

export const dateOf = (dayOffset: number) => isoIn(new Date(Date.now() + dayOffset * 86_400_000));
export const labelOf = (dayOffset: number) => shortDateOf(dateOf(dayOffset));

/** The visit the last set of readings was taken at. The visit list reads its day from here. */
export const latestSet = readingSets[readingSets.length - 1];
export const setOnDay = (dayOffset: number) => readingSets.find(s => s.dayOffset === dayOffset);

/** Every measure that has a value in a given set, in the order the assessment collects them. */
export const measuredIn = (set: ReadingSet): MeasureId[] =>
 observations.map(o => o.id as MeasureId).filter(id => set.values[id] !== undefined);

export type Flag = ReturnType<typeof flagOf>;
/** Where a value sits against its own reference range. Asked of the range, never stored beside it. */
export const flagFor = (id: MeasureId, value: number): Flag => flagOf(id, String(value));
export const isInRange = (id: MeasureId, value: number) => flagFor(id, value) === 'normal';
export const rangeText = (id: MeasureId) => {
 const spec = measureSpec(id);
 return `${spec.range[0]}–${spec.range[1]} ${spec.unit}`;
};
export const formatValue = (id: MeasureId, value: number) => (measureSpec(id).step < 1 ? value.toFixed(1) : String(value));

/** A measure's readings over time, oldest first, for a chart. Only the sets that carry it. */
export const seriesFor = (id: MeasureId) =>
 readingSets.filter(set => set.values[id] !== undefined)
  .map(set => ({ label: labelOf(set.dayOffset), value: set.values[id]!, note: set.note }));

/* The four the trends screen leads with. Seven charts on one phone screen is a wall; these are the
   four a person with a blood-pressure diagnosis actually watches, and the rest are one tap below in
   the same shape. */
export const headlineMeasures: MeasureId[] = ['systolic', 'diastolic', 'pulse', 'glucose'];
export const otherMeasures: MeasureId[] = observations
 .map(o => o.id as MeasureId).filter(id => !headlineMeasures.includes(id));

/* ---- What the doctor said about the last visit ------------------------------------------------
   A nurse records; a doctor reviews. The two are separate acts with separate names on them, and the
   summary screen shows both rather than presenting a nurse's observation as a clinical conclusion. */
export type Review = { assessment: string; plan: string; next: string; reviewedDayOffset: number };
export const lastReview: Review = {
 assessment: 'Blood pressure is coming down again. The reading a month ago was above the reference range on the day a dose was missed; this one is inside it. Nothing here needs an urgent appointment.',
 plan: 'Keep taking the medicine at the same time each morning. Bring the boxes to the next visit so the nurse can check what is left.',
 next: 'A nurse visit in about four weeks, or sooner if you feel unwell.',
 reviewedDayOffset: -2
};

/* ---- The record's own documents ---------------------------------------------------------------
   Issued dates are derived from the visit they came out of, so a document can never claim to have
   been issued on a day no visit happened. */
export type PassportDocument = { name: string; kind: string; dayOffset: number; reviewed: boolean; opens?: string };
export const documents: PassportDocument[] = [
 { name: 'Visit summary', kind: 'Clinical summary', dayOffset: latestSet.dayOffset, reviewed: true },
 { name: 'Laboratory results', kind: 'Pathology report', dayOffset: latestSet.dayOffset, reviewed: true, opens: 'Laboratory order LAB-0023' },
 { name: 'Medical certificate', kind: 'Certificate', dayOffset: latestSet.dayOffset, reviewed: true }
];

/* ---- What a device would and would not be allowed to hand over --------------------------------
   Both halves are derived. What a reading type *is* comes from the assessment's own observation
   list, because MyThuso does not read a category it has nowhere to file. What is never read comes
   from the record contract's protected categories, which are released by the patient entry by
   entry and are not a thing a permission sheet can grant on somebody's behalf. */
export const readableMeasures: MeasureId[] = observations.map(o => o.id as MeasureId);
export const neverRead = protectedCategories;
/** The instruments the kit itself carries, and what each of them measures. */
export const kitInstruments = kitDevices;
