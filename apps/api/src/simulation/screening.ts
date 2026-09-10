/**
 * A simulated screening model: one reading of one capture, carried as decision support and never as
 * an opinion.
 *
 * ── What is missing here is not a vendor ─────────────────────────────────────────────────────
 *
 * `screening` is the only capability on the list whose `blockedBy` is one line and says all of it:
 * no model, no vendor and no licence — and that the frame around a result is built while the
 * screening is not. This stands in for the model. It does not stand in for the licence, and it is
 * not a model: nothing here learnt anything from anything.
 *
 * ── The three refusals, and where each one bites ─────────────────────────────────────────────
 *
 *  1. **It may not issue a diagnosis.** The seam already refuses a field called `diagnosis` under
 *     five spellings, and that is the easy half — a diagnosis arrives as *prose*, inside the one
 *     field this feed has for words. So a finding here is composed rather than written: a measure's
 *     own label out of packages/catalog/records.json, the number, and the indicative range it sits
 *     outside. Where a caller supplies its own words they are read for the language of a diagnosis
 *     and refused, because the field a model fills in is the field a model would put one in.
 *  2. **It may not be signed off by anybody but a named clinician.** A result is decision support
 *     until somebody with a registration takes responsibility for it. `signOff` refuses a signature
 *     that carries no registration, and refuses one from a party that is not a clinician — there is
 *     no queue setting and no urgency that produces a countersigned result with nobody's name on it.
 *  3. **It may not produce an urgent result without naming a red flag the emergency contract
 *     holds.** Not a red flag *like* one of them: one of the eight in packages/catalog/sos.json, by
 *     name, in the finding. Urgency on a screening result is a claim that somebody should stop and
 *     act, and the only list this product has of things worth stopping for is that one.
 *
 * ── The number and the range come from one place ─────────────────────────────────────────────
 *
 * `records.json` holds the seven reference ranges a reading is flagged against, and the consultation
 * section above them holds the sentence that makes stating them honest. Neither is restated here.
 * A finding out of this file names the measure's own label and its own low and high, so a range
 * corrected in the contract is corrected in the simulated screening on the same deployment.
 *
 * Nothing here is reachable over HTTP. See the header of ./index.ts.
 */
import records from '../../../../packages/catalog/records.json' with { type: 'json' };
import sos from '../../../../packages/catalog/sos.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { instant, mustPassTheSeam, refusalSaying, supplierOf } from './contract.ts';
import {
 isRefusal, produced, refuse, register, seeded,
 type SimulatedRefusal, type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';

const CAPABILITY = 'screening';
const FEED = 'screening-result';

type Measure = { id: string; label: string; unit: string; low: number; high: number; step: number; placeholder: string };
type RedFlag = { id: string; name: string; detail: string };

const MEASURES = records.observations.measures as readonly Measure[];
const RED_FLAGS = sos.redFlags.conditions as readonly RedFlag[];

/**
 * Who may sign a clinical review, asked of the vetting register rather than decided here.
 *
 * A simulator does not get to say which roles carry a clinical responsibility. The register already
 * grants `sign-clinical-review` to exactly the roles that hold one, and the review queue asks it the
 * same question — so this asks it too, and gains a role the day the register does.
 */
type Role = { id: string; grants: { capability: string; refusal: string }[] };
const MAY_SIGN = new Set(
 (vetting.roles as readonly Role[])
  .filter(role => role.grants.some(grant => grant.capability === 'sign-clinical-review'))
  .map(role => role.id)
);

/**
 * The model this stands in for, and the version that makes a withdrawal possible.
 *
 * Both are ours and both say what they are. The feed's own note observes that there is no `modelId`
 * anywhere in this codebase and that the absence is the gap the seam names; this fills the gap with
 * something that cannot be mistaken for a product, because the day a real model id appears it must
 * not be the one a fixture was already using.
 */
export const MODEL_ID = 'simulated-observation-reader';
export const MODEL_VERSION = '0.0.0-simulated';

/**
 * The language of a diagnosis, as opposed to the language of a finding.
 *
 * A finding says what was measured and what it sits outside. A diagnosis names a condition and
 * asserts it. The difference is grammatical and it is catchable: a definite verb about a person, an
 * ICD-10 code, or the word itself. This is a guard on words a caller supplies rather than on words
 * this file composes — nothing composed below could trip it — and a guard on prose is never
 * complete, which is why the composition is the actual control and this is the second lock.
 */
const DIAGNOSTIC_LANGUAGE = /\b(diagnos\w*|confirms?|confirmed|consistent with|the patient (has|is)|rule[sd]? out|impression)\b|\b[A-TV-Z]\d{2}(\.\d+)?\b/i;

export type ScreeningDetail = {
 /** Which measure was screened. Defaults to one chosen off the capture reference. */
 measureId?: string;
 /** The value read. Defaults to one chosen off the capture reference, inside or outside the range. */
 value?: number;
 /** The model's own words, where a caller supplies them instead of letting this compose one. */
 finding?: string;
 /** Whether the result claims urgency. An urgent one must name a red flag sos.json holds. */
 urgent?: boolean;
 /** The red flag an urgent result names, by id. */
 redFlag?: string;
 /** Where a model states a confidence. Absent is a real answer and is not invented. */
 confidence?: number;
};

const detailOf = (request: SimulationRequest): ScreeningDetail => (request.detail ?? {}) as ScreeningDetail;

/** The measure's own words, its own number and its own range. Nothing about a person. */
function compose(measure: Measure, value: number): string {
 const rounded = Number(value.toFixed(measure.step < 1 ? 1 : 0));
 if (rounded < measure.low || rounded > measure.high) {
  return `${measure.label} ${rounded} ${measure.unit}, outside the indicative range ${measure.low}–${measure.high} ${measure.unit}.`;
 }
 return `${measure.label} ${rounded} ${measure.unit}, inside the indicative range ${measure.low}–${measure.high} ${measure.unit}.`;
}

function produce(request: SimulationRequest): SimulatorAnswer {
 const detail = detailOf(request);
 const at = request.at ?? new Date();
 const rand = seeded(`screening:${request.subject}`);

 const measure = MEASURES.find(entry => entry.id === detail.measureId) ?? MEASURES[Math.floor(rand() * MEASURES.length)]!;
 /* A quarter of the range either side, so a simulated capture is sometimes outside it. A reader who
    only ever sees a normal result learns nothing about what the screen does with an abnormal one. */
 const spread = (measure.high - measure.low) / 2;
 const value = detail.value ?? measure.low - spread / 2 + rand() * (measure.high - measure.low + spread);

 let finding = detail.finding ?? compose(measure, value);
 if (DIAGNOSTIC_LANGUAGE.test(finding)) return refuse(SCREENING, request, refusalSaying(CAPABILITY, /diagnosis/i));

 if (detail.urgent) {
  /* An urgent result is a claim that somebody should stop and act. The only list this product has
     of things worth stopping for is the eight conditions that end the questions on the emergency
     pathway, and an urgency that names something outside it is an urgency this product invented. */
  const flag = RED_FLAGS.find(condition => condition.id === detail.redFlag);
  if (!flag) return refuse(SCREENING, request, refusalSaying(CAPABILITY, /red flag/i));
  finding = `${finding} Urgent: ${flag.name.toLowerCase()} — one of the conditions that ends the questions on the emergency pathway.`;
 }

 const payload: Record<string, unknown> = {
  captureReference: request.subject,
  modelId: MODEL_ID,
  modelVersion: MODEL_VERSION,
  finding,
  at: instant(at),
  /* Absent unless a caller states one. A screening layer that required a number would get a number,
     and a model that states no confidence must not be made to invent one. */
  ...(detail.confidence === undefined ? {} : { confidence: detail.confidence })
 };
 mustPassTheSeam(FEED, payload);
 return produced(SCREENING, request, payload);
}

export const SCREENING: Simulator = {
 id: 'screening',
 feed: FEED,
 capability: CAPABILITY,
 supplier: supplierOf(CAPABILITY),
 produce
};
register(SCREENING);

/* ---- Signing one off ---------------------------------------------------------------------------

   A screening result is decision support and stays decision support until a person with a
   registration puts their name on it. That is not a feed event and has no field in this seam, so it
   lives here: the capability refuses to be signed off by anybody but a named clinician, and this is
   where that refusal is more than a sentence. */

export type Signature = { by: string; name: string; registration: string; at: string; finding: string };

/**
 * Countersign a simulated screening result, or refuse to.
 *
 * Three things are asked and none of them is negotiable: a name, a registration, and a clinician
 * rather than a queue, a workspace or an operator. A signature with a party id and no registration
 * is the shape a system produces when it signs on somebody's behalf, which is precisely the thing
 * a countersignature exists to prevent.
 */
export function signOff(
 captureReference: string,
 result: SimulatorAnswer,
 clinician: { partyId?: string; name?: string; registration?: string; role?: string },
 at: Date = new Date()
): Signature | SimulatedRefusal {
 const request: SimulationRequest = { subject: captureReference, at };
 const named = Boolean(clinician.partyId && clinician.name?.trim() && clinician.registration?.trim());
 const clinical = Boolean(clinician.role && MAY_SIGN.has(clinician.role));
 if (!named || !clinical) return refuse(SCREENING, request, refusalSaying(CAPABILITY, /signed off/i));
 /* A refusal has no finding to sign. Signing one would be a countersignature on the fact that
    nothing was produced, which is the shape of a queue that clears itself. */
 if (isRefusal(result)) return refuse(SCREENING, request, refusalSaying(CAPABILITY, /signed off/i));
 return {
  by: clinician.partyId!,
  name: clinician.name!,
  registration: clinician.registration!,
  at: instant(at),
  finding: String(result.payload.finding)
 };
}
