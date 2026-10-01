import schema from '../../../../packages/catalog/records.json';
import { conditionById } from './sos';
import { measureSpec, type MeasureId } from './passport';

/* What a reading means — written down, by a person, in English, and reviewed by nobody yet.
 *
 * The Health Passport has always rendered seven reference ranges and never said what any of them
 * measures. A number beside a range answers "is this inside the lines" and not the question a
 * person actually opened the screen with, which is "should I be worried". Left unanswered, that
 * question gets asked of a search engine, and a search engine will diagnose them.
 *
 * WHERE THE WORDS ARE NOW. In packages/catalog/records.json, under `explanations`, beside the
 * observation section whose note already calls those ranges indicative. They were not always: this
 * file declared all seven, Models/Explain.swift declared them again and model/Explain.kt a third
 * time, with nothing comparing the three — and every agent that typed the second or third copy
 * wrote a comment saying they belonged in the catalogue. They are there now, generated into
 * RecordsData.swift and RecordsData.kt by scripts/emit-records.mjs, and a boundary check refuses
 * any of these sentences as a literal in hand-written source on any of the three platforms. What
 * is left in this file is the reasoning, which is what a lib module is for.
 *
 * WHY THIS IS PROSE AND NOT A MODEL. `screening` is one of the declared capabilities and it is
 * blocked on a model, a vendor and a licence. It is also the easiest thing in this product to
 * overstate. A written explanation cannot be any of the things an unlicensed model would be: it
 * cannot see your record, it cannot personalise itself, it cannot be confidently wrong in a new way
 * for each reader, and it can be read in full by a clinician before it ships. When screening does
 * arrive it will have to be better than this, and this is what "better" will be measured against.
 *
 * THE LINE IT MUST NOT CROSS. Nothing here diagnoses. Each entry says what the measurement is, what
 * a number outside the range *may* follow from — including the ordinary, boring reasons, which are
 * usually the right ones and are therefore said first — and what to do, which is nearly always
 * "have it taken again" and never "start, stop or change a medicine". Every entry ends at the same
 * place: a registered doctor decides what a reading means for a particular person, and this screen
 * does not.
 *
 * WHAT IS DERIVED AND WHAT IS WRITTEN. Every label, unit and range comes from the assessment's own
 * observation table by way of lib/passport.ts, so the ranges a patient reads here and the ranges a
 * nurse is held to at a visit cannot become two different numbers — and none of the three is
 * written down in the explanations section. The urgent conditions are pointers into
 * packages/catalog/sos.json by id — the red flags that end the questions and show the ambulance
 * number — so this screen can never invent one or soften one, and a boundary check fails the build
 * if an id here stops being a red flag there. What is written is the explanation itself, and
 * generating it into two more languages has not made it reviewed: `provenance.unreviewed` still
 * says on the screen that no clinician has read the wording. */

export type Explanation = {
 id: MeasureId;
 /** What the instrument is actually measuring, in one sentence. */
 measures: string;
 /** What a reading above the range may follow from. Never what it is. */
 above: string;
 /** And below. For several of these the honest answer is "often nothing at all". */
 below: string;
 /** What a person can do about it today. Never a change to a medicine. */
 whatToDo: string;
 /** Ids in packages/catalog/sos.json's red flags. Rendered from the contract, never retyped. */
 urgent: string[];
};

/* The contract's order, not a sorted one. It is the order the observations are listed in one
   section above, which is the order the passport charts them in, so the explanations and the charts
   agree without either of them saying so. */
export const explanations: Explanation[] = schema.explanations.entries.map(e => ({ ...e, id: e.id as MeasureId }));

export const explanationFor = (id: MeasureId) => explanations.find(e => e.id === id);
/** The order the passport already reads them in, so the explanations and the charts agree. */
export const explainedMeasures = explanations.map(e => e.id);
/** The red flags an explanation points at, resolved through the emergency contract. */
export const urgentConditions = (explanation: Explanation) =>
 explanation.urgent.map(conditionById).filter((c): c is NonNullable<typeof c> => Boolean(c));
export const labelFor = (id: MeasureId) => measureSpec(id).label;

/* Where this text comes from and what it is not. Five sentences that have to be on the screen
   rather than in a policy: a reader deciding how much weight to give a paragraph about their own
   blood pressure is owed the provenance of it before the paragraph, not after. Read from the
   catalogue rather than restated, which is the point of the move — but `written` and `unreviewed`
   are the two a generator must never quietly retire. The text is still written rather than produced
   by software, and no clinician has read it. The day one does, somebody edits that sentence; a
   build does not get to edit it for them. */
export const provenance = schema.explanations.provenance;
