/**
 * A simulated pharmacy network: a prescription is sent, classed, said out loud and handed over.
 *
 * ── What is being stood in for ───────────────────────────────────────────────────────────────
 *
 * `dispensing` is blocked on two things and only the first is procurement: a contracted pharmacy
 * network, and a pharmacist's review of the substitution classes. This stands in for the first. It
 * does not stand in for the second, and nothing here should be read as though a pharmacist had seen
 * it — the capability's notice says exactly that on every screen while this is the source.
 *
 * ── Section 22F is the whole shape, and it is not this file's to restate ─────────────────────
 *
 * `packages/catalog/dispensing.json` holds three substitution classes, ten grounds each attached to
 * one of them, four of those carrying the subsection of the Act they come from, and the list of what
 * a substitution may never change. Not one of those is written down again here. What this file adds
 * is the arithmetic that turns them into a refusal:
 *
 *  · A ground whose class is `must-not` cannot produce a substitution. The Act's four exceptions are
 *    exceptions to the *duty* to substitute, so a simulator that let one through would have turned
 *    an exception into a permission — which is the sentence the register's own check already uses.
 *  · A dispensed item that does not carry the prescribed molecule at the prescribed strength is not
 *    a substitution at all. It is a prescription, written by somebody who is not a prescriber.
 *  · Nothing is handed over without a registration on it. `anonymous-substitution` in the contract
 *    is blunt about this: not an initial, not a branch, not "the pharmacy".
 *
 * ── What the payload cannot carry ────────────────────────────────────────────────────────────
 *
 * The seam this answers refuses a diagnosis, an indication, a patient's name and an identity number
 * at any depth and under any spelling. Every payload here goes through that door before it is
 * returned, so a field slipped into one of these objects fails a test rather than being caught by a
 * reviewer reading a JSON literal. Note what is *not* in the schema and therefore has nowhere to go:
 * the medicine itself. A pharmacy's message about a handover step names the step, the prescription
 * and the pharmacist, and what was written stays where it already is.
 *
 * Nothing here is reachable over HTTP. See the header of ./index.ts.
 */
import dispensing from '../../../../packages/catalog/dispensing.json' with { type: 'json' };
import { instant, mustPassTheSeam, refusalSaying, supplierOf } from './contract.ts';
import { produced, refuse, register, seeded, type SimulationRequest, type Simulator, type SimulatorAnswer } from './index.ts';

const CAPABILITY = 'dispensing';
const FEED = 'pharmacy-order';

type Ground = { id: string; name: string; class: string; detail: string };
type Item = {
 id: string; prescribed: string; molecule: string; strength: string; form: string; dose: string;
 quantity: string; class: string; ground: string; outcome: string; dispensed: string; patientWords: string;
 accepted: boolean; note: string;
};
type Step = { id: string; label: string; detail: string };

const GROUNDS = dispensing.grounds as readonly Ground[];
const ITEMS = dispensing.prescription.items as readonly Item[];
const HANDOVER = dispensing.handover as readonly Step[];
const PHARMACIST = dispensing.prescription.pharmacist;

/** The steps a handover passes through, in the contract's order. There is no sixth and no shortcut. */
export const STEPS: readonly string[] = HANDOVER.map(step => step.id);

const groundById = (id: string): Ground | undefined => GROUNDS.find(ground => ground.id === id);
const itemById = (id: string): Item | undefined => ITEMS.find(item => item.id === id);

/** A ground that classes an item as `must-not` is a ground nothing on this pathway may substitute on. */
const permitsSubstitution = (ground: Ground): boolean => ground.class !== 'must-not';

/**
 * Is this handover a substitution at all?
 *
 * The contract already answers it per item, in `outcome`: an item is `substituted`, `as-written` or
 * `refused-by-patient`, and only the first is a substitution. That is the authority when nobody
 * proposes anything. When a caller does propose something, anything that is not the prescribed item
 * verbatim is a substitution and is asked the two questions below.
 */
const isSubstitution = (item: Item, proposed: string | undefined): boolean =>
 proposed === undefined ? item.outcome === 'substituted' : proposed.trim() !== item.prescribed;

/**
 * Does this dispensed product still carry the prescribed molecule at the prescribed strength?
 *
 * Read off the item rather than off a list of medicines, because there is no list of medicines here
 * and there must not be one: the prescription is the authority on what was written, and a second
 * table of molecules would be a second thing to get wrong. The route, the dosing interval and the
 * quantity authorised are on `neverChanges` too and are not checked here for a better reason than
 * laziness — the seam declares no field for any of them, so a simulated pharmacy has nowhere to
 * change one and a payload that tried would be refused for its shape at the door below.
 */
const keepsTheMedicine = (item: Item, dispensedAs: string): boolean => {
 const said = dispensedAs.toLowerCase();
 return said.includes(item.molecule.toLowerCase()) && said.includes(item.strength.toLowerCase());
};

export type PharmacyDetail = {
 /** Which step of the handover chain this message is about. Defaults to the first. */
 state?: string;
 /** The item being decided about, where the step is the decision. */
 itemId?: string;
 /** The ground the substitution stands on. Defaults to the one the contract already records. */
 ground?: string;
 /** What the pharmacy proposes to hand over. Defaults to what the contract already records. */
 dispensedAs?: string;
 /** The pharmacist's SAPC registration. Null or empty is the refusal, not an omission. */
 pharmacistRegistration?: string | null;
};

const detailOf = (request: SimulationRequest): PharmacyDetail => (request.detail ?? {}) as PharmacyDetail;

function produce(request: SimulationRequest): SimulatorAnswer {
 const detail = detailOf(request);
 const at = request.at ?? new Date();

 /* Asked of every step and not only of a substitution, because every step is somebody doing
    something to a prescription. A handover step with nobody's registration on it is a step nobody
    can be asked about afterwards, which is what `anonymous-substitution` is about. */
 const registration = detail.pharmacistRegistration === undefined ? PHARMACIST.registration : detail.pharmacistRegistration;
 if (!registration) return refuse(PHARMACY, request, refusalSaying(CAPABILITY, /registration/i));

 const state = detail.state ?? STEPS[0]!;
 if (!STEPS.includes(state)) {
  throw new Error(
   `"${state}" is not one of the handover steps packages/catalog/dispensing.json names (${STEPS.join(', ')}). ` +
   `The chain of custody is the contract's, not the caller's.`
  );
 }

 /* Only the decision step can be a substitution, so only the decision step can be the wrong one.
    The other four are about who did what and when, and there is nothing in them to get wrong that
    the door below does not already catch. */
 let substitutionGround: string | undefined;
 if (state === 'decided') {
  const item = itemById(detail.itemId ?? ITEMS[0]!.id);
  if (!item) throw new Error(`No item "${detail.itemId}" on prescription ${dispensing.prescription.reference}.`);
  const ground = groundById(detail.ground ?? item.ground);
  if (!ground) throw new Error(`No ground "${detail.ground}" in packages/catalog/dispensing.json.`);
  const dispensedAs = detail.dispensedAs ?? item.dispensed;
  /* Both refusals are asked of a proposal rather than of the ground on its own. An item that must
     not be substituted and was not is not a refusal — it is the ordinary case, and four of the five
     items on this prescription are it. */
  const proposing = isSubstitution(item, detail.dispensedAs);
  if (proposing && !permitsSubstitution(ground)) return refuse(PHARMACY, request, refusalSaying(CAPABILITY, /outside the classes/i));
  if (proposing && !keepsTheMedicine(item, dispensedAs)) return refuse(PHARMACY, request, refusalSaying(CAPABILITY, /molecule or a strength/i));
  substitutionGround = proposing ? ground.id : undefined;
 }

 const payload: Record<string, unknown> = {
  prescriptionReference: request.subject,
  pharmacyPartyId: dispensing.prescription.pharmacy,
  state,
  at: instant(at),
  pharmacistRegistration: registration,
  ...(substitutionGround ? { substitutionGround } : {}),
  /* The step's own description, not the pharmacist's clinical prose. The contract holds both — a
     written reason for a judgement substitution and the words said to the patient — and neither
     travels here. Both are about a person and a medicine, and this seam refuses to be the place a
     sentence about what somebody is taking arrives in a service that holds no clinical record. */
  note: HANDOVER.find(step => step.id === state)!.detail
 };
 mustPassTheSeam(FEED, payload);
 return produced(PHARMACY, request, payload);
}

export const PHARMACY: Simulator = {
 id: 'pharmacy',
 feed: FEED,
 capability: CAPABILITY,
 supplier: supplierOf(CAPABILITY),
 produce
};
register(PHARMACY);

/**
 * The whole chain of custody for one prescription, in the contract's order.
 *
 * This is what makes the seam walkable: five messages from a pharmacy that took a prescription,
 * ending in what was actually handed over. Which item the simulated pharmacist is deciding about is
 * chosen off the seed rather than off a clock, so the same prescription produces the same handover
 * on every machine, for ever.
 */
export function handover(reference: string, at: Date = new Date()): SimulatorAnswer[] {
 const rand = seeded(`pharmacy:${reference}`);
 const item = ITEMS[Math.floor(rand() * ITEMS.length)]!;
 return STEPS.map((state, index) => produce({
  subject: reference,
  /* A minute a step, so the chain has an order a reader can follow rather than five identical times. */
  at: new Date(at.getTime() + index * 60_000),
  detail: { state, itemId: item.id }
 }));
}

/** The prescription the contract already holds, so a caller has something true to walk. */
export const SAMPLE_PRESCRIPTION = dispensing.prescription.reference;
