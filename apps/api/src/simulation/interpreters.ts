/**
 * A simulated interpreter roster: one interpreter's availability for one shift, and what happens
 * when there is nobody.
 *
 * ── The half that is worth simulating ────────────────────────────────────────────────────────
 *
 * A roster with four people on it is a fixture. What is worth building is the arithmetic around the
 * empty case, because that is the case the product gets wrong: a visit that needs a South African
 * Sign Language interpreter and has none is *held*, not sent, and a screen that cannot work out when
 * one will be free says so rather than printing a number somebody would plan a day off work around.
 * `packages/catalog/interpreting.json` holds all of that as sentences. This turns three of them into
 * refusals a caller cannot talk its way past.
 *
 * ── Why there is no age here ─────────────────────────────────────────────────────────────────
 *
 * The obvious way to refuse a child is a threshold, and the contract deliberately does not give one:
 * `child-as-interpreter` reads "Under no circumstance, at no age, for no relative, in no emergency."
 * A threshold is a number somebody eventually argues has been met — the seventeen-year-old who is
 * nearly eighteen, at eleven at night, with a Deaf patient waiting. So what is checked instead is
 * membership of the vetted roster, and nobody reaches that roster without six vetting checks, an
 * accreditation and a personal undertaking of confidentiality. No child is on it and no relative is
 * on it, and neither can be added by this file, because this file only reads it.
 *
 * ── Three modes, and they are not interchangeable ────────────────────────────────────────────
 *
 * In the room, on video, and hand over hand. The contract says why a remote interpreter and one in
 * the room are different things, and why tactile has no remote version at all. So availability is
 * asked per mode, and the tactile interpreter on this roster has nothing free — which is the state
 * the honest-wait rule exists for and would be a shame to simulate away.
 *
 * Nothing here contacts anybody. See the header of ./index.ts.
 */
import interpreting from '../../../../packages/catalog/interpreting.json' with { type: 'json' };
import { atDayOffset, instant, mustPassTheSeam, refusalSaying, supplierOf } from './contract.ts';
import {
 isRefusal, produced, refuse, register, seeded,
 type SimulatedRefusal, type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';

const CAPABILITY = 'interpreting';
const FEED = 'interpreter-roster';

type Free = { dayOffset: number; slots: string[] };
type Interpreter = { id: string; name: string; reference: string; mode: string; area: string; settings: string[]; free: Free[] };
type Mode = { id: string; name: string; detail: string; note: string };

const ROSTER = interpreting.roster as readonly Interpreter[];
const MODES = interpreting.modes as readonly Mode[];
/** The only interpreters that exist. A candidate not in here is not an interpreter, whatever it says it is. */
const VETTED = new Set(ROSTER.map(person => person.id));

/** A shift is an hour long: the roster records free hours, and an hour is what a caller books. */
const SHIFT_MINUTES = 60;

export const MODE_IDS: readonly string[] = MODES.map(mode => mode.id);
export const interpreterById = (id: string): Interpreter | undefined => ROSTER.find(person => person.id === id);

/** Every free hour on the roster for one mode, earliest first. Empty is a real answer here. */
export function freeHours(mode: string, from: Date = new Date()): { interpreter: Interpreter; at: Date }[] {
 return ROSTER
  .filter(person => person.mode === mode)
  .flatMap(person => person.free.flatMap(day => day.slots.map(slot => ({ interpreter: person, at: atDayOffset(from, day.dayOffset, slot) }))))
  .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type InterpreterDetail = {
 /** Which of the three modes. Defaults to the one the contract makes the default for a home visit. */
 mode?: string;
 /**
  * Somebody a caller wants offered. Present only when a caller is asking for a particular person —
  * which is the request the first refusal exists to turn down.
  */
 offer?: { partyId: string; relationshipToPatient?: string; ageYears?: number };
};

const detailOf = (request: SimulationRequest): InterpreterDetail => (request.detail ?? {}) as InterpreterDetail;

/* The default is the contract's, not this file's: "the default for a home visit" is written into the
   in-person mode's own note, and a home visit is what MyThuso does. */
const DEFAULT_MODE = MODES.find(mode => /default for a home visit/i.test(mode.note))?.id ?? MODES[0]!.id;

function produce(request: SimulationRequest): SimulatorAnswer {
 const detail = detailOf(request);
 const at = request.at ?? new Date();
 const mode = detail.mode ?? DEFAULT_MODE;
 if (!MODE_IDS.includes(mode)) {
  throw new Error(`"${mode}" is not one of the modes packages/catalog/interpreting.json declares (${MODE_IDS.join(', ')}). A remote interpreter and one in the room are not interchangeable.`);
 }

 /* Asked before anything is looked up, because the harm is in the offer rather than in the booking.
    A relative named as the interpreter has already changed what the patient will say, whether or not
    anybody goes on to confirm the hour. */
 if (detail.offer) {
  const named = detail.offer;
  const relationship = named.relationshipToPatient?.trim().toLowerCase();
  const isKin = relationship !== undefined && relationship !== '' && relationship !== 'none';
  if (isKin || named.ageYears !== undefined || !VETTED.has(named.partyId)) {
   return refuse(INTERPRETERS, request, refusalSaying(CAPABILITY, /family member or a child/i));
  }
 }

 const candidates = freeHours(mode, at);
 if (candidates.length === 0) {
  /* Nothing free in the days this app can see. The contract is emphatic that this is not a
     dispatch: the visit is held, and holding it is the second refusal below rather than an error. */
  return refuse(INTERPRETERS, request, refusalSaying(CAPABILITY, /needs an interpreter and has none/i));
 }

 /* Which of the free hours this run offers is chosen off the visit rather than off a clock, so the
    same visit is offered the same interpreter at the same hour on every machine, for ever. */
 const rand = seeded(`interpreters:${request.subject}`);
 const chosen = candidates[Math.floor(rand() * candidates.length)]!;
 const ends = new Date(chosen.at.getTime() + SHIFT_MINUTES * 60_000);

 const payload: Record<string, unknown> = {
  partyId: chosen.interpreter.id,
  mode: chosen.interpreter.mode,
  /* Stated even for a remote interpreter, because "anywhere" is a claim. The contract's words. */
  area: chosen.interpreter.area,
  settings: chosen.interpreter.settings,
  shiftStartsAt: instant(chosen.at),
  shiftEndsAt: instant(ends),
  accreditationReference: chosen.interpreter.reference
 };
 mustPassTheSeam(FEED, payload);
 return produced(INTERPRETERS, request, payload);
}

export const INTERPRETERS: Simulator = {
 id: 'interpreters',
 feed: FEED,
 capability: CAPABILITY,
 supplier: supplierOf(CAPABILITY),
 produce
};
register(INTERPRETERS);

/* ---- The two things that are not feed events ---------------------------------------------------

   A roster feed carries availability. It does not carry what a visit does about it, and it must not:
   the seam refuses a patient id, a presenting complaint and anything about the person who needs the
   interpreter, so a decision *about a visit* has nowhere to live in that payload and should not be
   given one. The two below are in-process answers to the product's own questions, and they are here
   rather than in a screen because two of the capability's three refusals are about them. */

/** What happens to a visit that needs an interpreter. Two doors, and the contract says there is not a third. */
export type VisitDecision =
 | { dispatched: true; partyId: string; mode: string; at: string }
 | { dispatched: false; status: string; title: string; sentence: string; whyNotDispatched: string; refused: string };

/**
 * Held or dispatched — and never dispatched with nobody.
 *
 * `dispatch-without-an-interpreter` says there is no override on the screen, for the patient, the
 * nurse or the Control Tower. So there is no argument this function takes that produces a dispatch
 * with an empty roster: the refusal is what comes back, in the capability's own words, beside the
 * hold the interpreting contract already writes.
 */
export function holdOrDispatch(visitReference: string, mode: string = DEFAULT_MODE, at: Date = new Date()): VisitDecision {
 const answer = produce({ subject: visitReference, at, detail: { mode } });
 if (isRefusal(answer)) {
  return {
   dispatched: false,
   status: interpreting.hold.status,
   title: interpreting.hold.title,
   sentence: interpreting.hold.sentence,
   whyNotDispatched: interpreting.hold.whyNotDispatched,
   refused: refusalSaying(CAPABILITY, /needs an interpreter and has none/i)
  };
 }
 return {
  dispatched: true,
  partyId: String(answer.payload.partyId),
  mode: String(answer.payload.mode),
  at: String(answer.payload.shiftStartsAt)
 };
}

export type Cancellation = { fee: number; attributedTo: string; label: string; sentence: string; keepsTheRequirement: string };

/**
 * Cancelling a held visit, which costs nothing and is ours.
 *
 * Two ways this is held, because there are two ways it goes wrong. A caller that asks for a charge
 * is refused in the capability's own words — there is no notice period and no window in which the
 * wait becomes chargeable, so there is no argument to pass in. And the fee is read from the contract
 * rather than written here as a zero, so that the day somebody puts a number in the contract this
 * stops rather than quietly passing it on.
 *
 * The attribution is checked beside the fee for a reason worth saying out loud: a cancellation that
 * costs nothing and is filed under the patient's name is still the failure this refusal is about. A
 * service that files its own failure under the patient's name will keep failing, and will look, in
 * its own figures, like a service nobody wanted.
 */
export function cancelHold(visitReference: string, asked: { charge?: number } = {}, at: Date = new Date()): Cancellation | SimulatedRefusal {
 const request: SimulationRequest = { subject: visitReference, at };
 if (asked.charge !== undefined && asked.charge !== 0) return refuse(INTERPRETERS, request, refusalSaying(CAPABILITY, /Charge a patient/i));
 const { fee, attributedTo, label, sentence, keepsTheRequirement } = interpreting.cancellation;
 if (fee !== 0 || attributedTo !== 'MyThuso') {
  throw new Error(
   `packages/catalog/interpreting.json now cancels a held visit for R${fee}, attributed to ${attributedTo}. ` +
   `"${refusalSaying(CAPABILITY, /Charge a patient/i)}" — so the simulator stops here rather than producing it.`
  );
 }
 return { fee, attributedTo, label, sentence, keepsTheRequirement };
}
