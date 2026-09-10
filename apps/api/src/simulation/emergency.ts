/**
 * A simulated acknowledgement channel — and the one simulator in this directory where working well
 * is the hazard rather than the goal.
 *
 * ── Read this before changing anything below ─────────────────────────────────────────────────
 *
 * 10177, 112 and 10111 are real numbers that reach real people. Every other simulator here is
 * dangerous only in the way the whole idea is dangerous: somebody watches it work and comes away
 * believing a supplier exists. This one is dangerous in a second, worse way. A person on the
 * emergency screen may be about to need an ambulance, and a convincing acknowledgement — a partner
 * id, a timestamp, the word "accepted" — is exactly the thing that would keep them looking at a
 * phone instead of dialling. The capability's own words: *the ambulance number on this screen is
 * real and always shown first, connected or not.*
 *
 * So this simulator is written against its own output. Its three refusals are the whole file:
 *
 *  1. **It may not replace or delay the emergency numbers on any screen.** Enforced twice. The
 *     payload is scanned for anything that could be printed where a number belongs — any run of
 *     three or more digits — and refused if it carries one, because the way a real number gets
 *     replaced is not somebody deleting it, it is a plausible-looking number appearing next to it.
 *     And the acknowledgement's own instant may not precede the moment the numbers were shown, so
 *     "first" is arithmetic rather than a claim about how a component happens to be laid out today.
 *  2. **It may not claim an ambulance is coming.** `en-route` and `arrived` are the two states in
 *     the seam's own vocabulary that assert a vehicle is moving toward a house or standing outside
 *     one. Neither is true, neither can be made true by a simulator, and neither is producible here.
 *     No free text is carried at all — see `reason` below.
 *  3. **It may not answer at all until the real numbers have been shown first.** The caller has to
 *     say which numbers a person has already been shown, and all three of the numbers
 *     packages/catalog/sos.json holds must be among them. Anything short of that is not an answer,
 *     it is a refusal, and the refusal is the first thing in the function.
 *
 * If a future change makes any of those three inconvenient, the change is wrong. There is no
 * version of this seam that is worth a person reading a simulated acknowledgement instead of a
 * number.
 *
 * ── What this does not do ────────────────────────────────────────────────────────────────────
 *
 * It does not dial, it does not raise an alert, it does not contact an ambulance partner, and there
 * is no ambulance partner to contact — `blockedBy` still lists all three of the things blocking this
 * capability and a simulator unblocks none of them. What it produces is what a partner's message
 * back would look like, so that the shape of one can be argued with before anybody signs anything.
 */
import sos from '../../../../packages/catalog/sos.json' with { type: 'json' };
import { instant, mustPassTheSeam, noticeOf, refusalSaying, supplierOf, timeFieldsOf } from './contract.ts';
import { produced, refuse, register, seeded, type SimulationRequest, type Simulator, type SimulatorAnswer } from './index.ts';

const CAPABILITY = 'emergency';
const FEED = 'emergency-acknowledgement';

type EmergencyNumber = { id: string; number: string; name: string; detail: string; whenToUse: string };
type StandDownReason = { id: string; label: string; nurseIsTold: string; recorded: string };

/** The three real numbers, in the order the screen shows them. Read, never typed. */
export const REAL_NUMBERS: readonly string[] = (sos.emergency.numbers as readonly EmergencyNumber[]).map(entry => entry.number);
const STAND_DOWN = sos.standDown.reasons as readonly StandDownReason[];

/**
 * The two states this channel will not produce, and why they are named rather than inferred.
 *
 * The seam declares five: accepted, declined, en-route, arrived and stood-down. Two of them are
 * assertions about a vehicle in the world. A simulated partner can honestly say it recorded an
 * alert and it can honestly say it declined one; it cannot say something is on its way, because
 * nothing is, and a screen showing that word next to a house is the failure this pathway is
 * arranged against.
 */
export const CLAIMS_AN_AMBULANCE: readonly string[] = ['en-route', 'arrived'];
export const PRODUCIBLE_STATES: readonly string[] = ['accepted', 'declined', 'stood-down'];

/* A run of three or more digits. The same shape the boundary check uses on sos.json itself, and for
   the same reason: on this pathway the only numbers allowed anywhere near a screen are the three
   real ones, and a number that is not one of them is a number somebody might dial instead. */
const DIGIT_RUN = /\d{3,}/;
/* Which of this feed's fields hold a moment rather than words, asked of the contract. */
const TIME_FIELDS = timeFieldsOf(FEED);

export type EmergencyDetail = {
 /**
  * The emergency numbers the person has already been shown, as they were rendered. All three, or
  * this simulator does not answer.
  */
 numbersShown?: string[];
 /** When they were shown. The acknowledgement may not be timed before it. */
 numbersShownAt?: Date;
 /** accepted, declined or stood-down. Never en-route and never arrived. */
 state?: string;
 /** Which of the contract's stand-down reasons, where the state is a stand-down. */
 standDownReason?: string;
 /** A partner that answered. Ours to name, because the seam refuses to write down a string a stranger typed. */
 partnerId?: string;
};

const detailOf = (request: SimulationRequest): EmergencyDetail => (request.detail ?? {}) as EmergencyDetail;

/** Have all three been shown? Compared on the digits, so a number wrapped in a link still counts. */
const numbersWereShown = (shown: string[] | undefined): boolean =>
 Array.isArray(shown) && REAL_NUMBERS.every(number => shown.some(seen => typeof seen === 'string' && seen.includes(number)));

function produce(request: SimulationRequest): SimulatorAnswer {
 const detail = detailOf(request);

 /* First, before the state, before the partner, before the clock. A simulator that worked out what
    it would have said and then decided whether to say it would be one refactor away from saying it. */
 if (!numbersWereShown(detail.numbersShown)) {
  return refuse(EMERGENCY, request, refusalSaying(CAPABILITY, /until the real numbers have been shown/i));
 }

 const state = detail.state ?? PRODUCIBLE_STATES[0]!;
 if (CLAIMS_AN_AMBULANCE.includes(state)) return refuse(EMERGENCY, request, refusalSaying(CAPABILITY, /ambulance is coming/i));
 if (!PRODUCIBLE_STATES.includes(state)) {
  throw new Error(`"${state}" is not a state a simulated acknowledgement can be in. It answers with one of ${PRODUCIBLE_STATES.join(', ')}, and refuses ${CLAIMS_AN_AMBULANCE.join(' and ')}.`);
 }

 /* Arithmetic rather than layout. "Shown first" is a fact about time here, so an acknowledgement
    produced before the numbers reached the screen is refused whatever a component does with it. */
 const at = request.at ?? new Date();
 if (detail.numbersShownAt && at.getTime() < detail.numbersShownAt.getTime()) {
  return refuse(EMERGENCY, request, refusalSaying(CAPABILITY, /Replace or delay the emergency numbers/i));
 }

 /* Ours, never a partner's, and deterministic off the alert. The seam refuses to write down any
    string a stranger typed, and a simulator is a stranger the day it becomes an adapter. */
 const rand = seeded(`emergency:${request.subject}`);
 const partnerId = detail.partnerId ?? `SIM-PARTNER-${String(Math.floor(rand() * 9) + 1)}`;

 /* Words only where the contract already wrote them. `reason` is free text in the schema and free
    text is where a claim about an ambulance would arrive, so nothing composed reaches it — a
    stand-down carries the stand-down's own label out of sos.json and everything else carries
    nothing at all. */
 const reason = state === 'stood-down'
  ? (STAND_DOWN.find(entry => entry.id === detail.standDownReason) ?? STAND_DOWN[0]!).label
  : undefined;

 const payload: Record<string, unknown> = {
  alertReference: request.subject,
  partnerId,
  state,
  at: instant(at),
  ...(reason ? { reason } : {})
 };

 /* The last guard, and the one that is about the screen rather than about the seam. Two rules, and
    they are different questions.

    Nothing at all may carry one of the three real numbers. A payload echoing 10177 is a stale copy
    of a number that must only ever come from packages/catalog/sos.json, and a stale copy is how a
    wrong one reaches a screen the day the contract is corrected.

    And nothing *this file composed* may carry any run of digits, because the way a real number gets
    replaced is not somebody deleting it — it is a plausible-looking number appearing beside it. The
    alert reference is exempt from the second rule and not from the first: it is MyThuso's own
    reference for the alert, chosen by the product rather than made up here.

    Which fields hold a moment rather than words is read off the contract, so the field somebody adds
    next is scanned rather than missed. */
 const composed: Record<string, unknown> = { partnerId, state, ...(reason ? { reason } : {}) };
 const carriesANumber = (value: unknown): boolean => typeof value === 'string' && REAL_NUMBERS.some(number => value.includes(number));
 for (const [field, value] of Object.entries(payload)) {
  if (TIME_FIELDS.has(field)) continue;
  const madeUpHere = Object.prototype.hasOwnProperty.call(composed, field);
  if (carriesANumber(value) || (madeUpHere && typeof value === 'string' && DIGIT_RUN.test(value))) {
   return refuse(EMERGENCY, request, refusalSaying(CAPABILITY, /Replace or delay the emergency numbers/i));
  }
 }

 mustPassTheSeam(FEED, payload);
 return produced(EMERGENCY, request, payload);
}

export const EMERGENCY: Simulator = {
 id: 'emergency',
 feed: FEED,
 capability: CAPABILITY,
 supplier: supplierOf(CAPABILITY),
 produce
};
register(EMERGENCY);

/**
 * What a surface is handed, if a surface is ever handed this at all.
 *
 * The numbers come back in the same object as the acknowledgement, above it, ordered as sos.json
 * orders them — so a template that renders this thing in the order its fields arrive renders the
 * ambulance number first. It is a small thing and it is the only structural help this file can give
 * a screen it cannot see.
 */
export type Acknowledgement = { numbers: readonly EmergencyNumber[]; notice: string; answer: SimulatorAnswer };

export function acknowledge(alertReference: string, detail: EmergencyDetail, at: Date = new Date()): Acknowledgement {
 return {
  numbers: sos.emergency.numbers as readonly EmergencyNumber[],
  /* The capability's simulation notice, word for word, and it names 10177 and 112 itself. A screen
     that renders the answer and drops this has taken the disclosure off the one page where it is
     load-bearing, so it travels with the answer rather than beside it. */
  notice: NOTICE,
  answer: produce({ subject: alertReference, at, detail })
 };
}

/**
 * The notice that travels with the answer, checked once at module load.
 *
 * The simulation notice names 10177 and 112 itself, and that is not decoration: this is the one
 * capability whose notice is the only useful thing on the screen if the simulation is believed. So
 * the module refuses to load if the contract has stopped naming them, rather than the sentence going
 * quiet at the moment somebody is reading it.
 *
 * The police number is real and is on the screen; it is not asked for in this sentence because the
 * sentence is about reaching an ambulance, which is what the two below are for.
 */
const AMBULANCE_ROUTES = ['ambulance', 'mobile'];
export const NOTICE: string = (() => {
 const notice = noticeOf(CAPABILITY);
 for (const id of AMBULANCE_ROUTES) {
  const entry = (sos.emergency.numbers as readonly EmergencyNumber[]).find(number => number.id === id);
  if (!entry) throw new Error(`packages/catalog/sos.json no longer holds the "${id}" emergency number, and the emergency simulator is written around it.`);
  if (!notice.includes(entry.number)) {
   throw new Error(
    `The emergency simulation notice in packages/catalog/capabilities.json no longer names ${entry.number}. In a real ` +
    `emergency that number is the only useful thing on the screen, and a simulated acknowledgement that travels without ` +
    `it is the failure this whole file is written against.`
   );
  }
 }
 return notice;
})();
