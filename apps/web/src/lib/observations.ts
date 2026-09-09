import schema from '../../../../packages/catalog/records.json';

/* The seven readings, and the indicative adult range each is flagged against.
 *
 * WHY THIS FILE EXISTS. These ranges used to be an array in features/Clinical.tsx, and
 * scripts/check-boundaries.mjs compared the iOS and Android assessments against *that TSX file*.
 * So the one place a reference range lived was a React component, two native apps were held to a
 * screen, and lib/passport.ts imported a feature to avoid making a second copy. A reference range
 * decides whether a reading is flagged for a doctor. That is contract, not presentation, and it
 * now lives in packages/catalog/records.json with everything else the three apps share.
 *
 * The qualification is deliberately not restated here. "Reference ranges are indicative and are
 * not a validated early-warning score" is the note on the observations section of the standard
 * consultation, one level up in the same file, and `observationsNote` below reads it from there —
 * so the sentence a patient or a nurse is shown has exactly one author.
 *
 * `flagOf` is the whole of the reasoning: below the range is low, above it is high, and neither is
 * a diagnosis. Nothing here escalates, notifies or decides; it colours a field and says what it is
 * doing. Fictional patients, invented readings, no record reached from anywhere. */

export type Measure = {
 id: string;
 label: string;
 unit: string;
 /** Inclusive. A value equal to either end is in range. */
 low: number;
 high: number;
 /** The input's granularity, and — where it is below 1 — the sign that a reading is written to one decimal. */
 step: number;
 placeholder: string;
 /** `[low, high]`, derived — the shape the charts and the assessment form were written against. */
 range: readonly [number, number];
};

/* Widened to `string` rather than a union of the seven ids, because deriving a union would mean
   writing the ids down a second time and a second list of ids is the thing this file removed. */
export type ObsId = string;

export const observations: Measure[] = schema.observations.measures.map(m => ({ ...m, range: [m.low, m.high] as const }));
export const observationsWhy: string = schema.observations.why;

/* The qualifying sentence, read off the consultation section it belongs to. Every screen that
   shows a range shows this, and it is not typed on any of them. */
export const observationsNote: string =
 schema.consultation.sections.find(s => s.id === 'observations')!.note!;

export const measureSpec = (id: ObsId) => observations.find(o => o.id === id)!;

export type ObservationFlag = 'empty' | 'invalid' | 'low' | 'high' | 'normal';

/** Where a typed value sits against its own range. An empty field is not abnormal; it is empty. */
export function flagOf(id: ObsId, raw: string): ObservationFlag {
 const spec = measureSpec(id);
 if (!raw.trim()) return 'empty';
 const value = Number(raw);
 if (Number.isNaN(value)) return 'invalid';
 if (value < spec.low) return 'low';
 if (value > spec.high) return 'high';
 return 'normal';
}
