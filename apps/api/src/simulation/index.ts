/**
 * The simulated suppliers, and the wall between them and the network.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 *
 * Every capability is declared and none is connected, because most of them are blocked on
 * something no engineer can produce: an SMS provider, a payment provider, a nurse roster, live
 * positions, agreements with thirteen credentialing authorities, a pharmacy network, an ambulance
 * partner. The founder asked to walk the whole product end to end anyway, which is a reasonable
 * thing to want before spending money on any of those contracts.
 *
 * There were two ways to give him that. One was to mark the capabilities connected, which takes a
 * single edit and removes the not-connected notice from every screen in three applications and from
 * the public status page. The other is this. `packages/catalog/capabilities.json` grew a third
 * state, `simulated`, and these are the things standing behind it.
 *
 * ── The wall ─────────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here is reachable over HTTP, and that is the load-bearing property rather than a detail
 * of packaging. `apps/api/src/feeds/index.ts` spends a page arguing that a route which could accept
 * under some condition is a route somebody eventually finds the condition for, usually late at
 * night with a vendor on the phone — and it made `decide` return a type with no acceptance variant
 * so that the condition cannot be written. A simulation flag on those routes would have been
 * precisely that condition, so every door goes on refusing every payload, exactly as before,
 * and a simulated event enters through `emit` below: a different function, with a different
 * signature, reviewed as the change it is.
 *
 * `scripts/check-boundaries.mjs` holds the wall up from the other side. It fails the build if
 * `server.ts` imports anything from this directory.
 *
 * ── What a simulator owes ────────────────────────────────────────────────────────────────────
 *
 * Three things, and the third is the one that matters.
 *
 *  1. **The feed it stands in for**, by id, so what it produces can be checked against the shape
 *     that feed declares in `packages/catalog/feeds.json`. A simulator producing a field its own
 *     seam would refuse is a simulator teaching the product a shape no supplier will ever send.
 *  2. **Determinism from a seed.** A simulated nurse who is somewhere different on every run makes
 *     a test that cannot fail twice the same way, and a demonstration that cannot be repeated in
 *     front of somebody. `seeded()` is the only randomness here.
 *  3. **Its refusals, enforced rather than described.** The capability contract lists what each
 *     simulation will not do; `refuse()` is how a simulator says no to itself, and a refusal is
 *     recorded with a reason rather than thrown away. The build fails on a simulation that lists no
 *     refusals at all, because one that refuses nothing is a fixture with a label on it.
 *
 * ── What is deliberately not simulated ───────────────────────────────────────────────────────
 *
 * `voice`. Not an omission — the contract's `voice-stays-absent` rule says why. Simulating speech
 * means declaring a microphone permission that capability forbids anywhere in either app, or
 * rendering a transcript of something nobody said, and the blocker on voice was never the vendor.
 */
import { FEEDS, feedById, type Feed } from '../feeds/index.ts';

/** One thing a simulated supplier produced, or refused to produce. */
export type SimulatedEvent = {
 /** The feed in `packages/catalog/feeds.json` whose shape this answers. */
 feed: string;
 /** The capability whose simulation notice a screen renders while this is the source. */
 capability: string;
 /** Ours, never a vendor's: a reference this process chose, so a refusal can name it safely. */
 reference: string;
 at: string;
 payload: Record<string, unknown>;
};

/** A simulator saying no to itself, in the words its own contract used. */
export type SimulatedRefusal = {
 feed: string;
 capability: string;
 reference: string;
 at: string;
 /** One of the sentences in this capability's `simulation.refuses`, word for word. */
 refused: string;
};

export type SimulatorAnswer = SimulatedEvent | SimulatedRefusal;
export const isRefusal = (answer: SimulatorAnswer): answer is SimulatedRefusal =>
 Object.prototype.hasOwnProperty.call(answer, 'refused');

/**
 * A deterministic source of numbers.
 *
 * Not `Math.random`. A simulated nurse who stands somewhere different on every run produces a test
 * that cannot fail twice the same way and a demonstration nobody can repeat in front of an
 * investor. Every simulator takes its seed from the thing it is simulating — a visit reference, a
 * nurse id — so the same visit produces the same journey on every machine, for ever.
 *
 * mulberry32: thirty-two bits of state, uniform enough for a fixture and short enough to read.
 */
export function seeded(seed: string): () => number {
 let state = 0;
 for (let i = 0; i < seed.length; i += 1) state = (Math.imul(state ^ seed.charCodeAt(i), 2654435761) >>> 0);
 return () => {
  state = (state + 0x6D2B79F5) >>> 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}

/** Pick one, deterministically. */
export const pick = <T,>(rand: () => number, options: readonly T[]): T => options[Math.floor(rand() * options.length)]!;

/**
 * A simulated supplier.
 *
 * `produce` may return a refusal instead of an event, and is expected to: the refusals are the
 * interesting half. A simulator that can only succeed teaches the product that suppliers always do.
 */
export type Simulator = {
 id: string;
 feed: string;
 capability: string;
 /** What this stands in for, in the same words the capability contract uses. */
 supplier: string;
 produce: (request: SimulationRequest) => SimulatorAnswer;
};

export type SimulationRequest = {
 /** What this event is about: a visit reference, a nurse id, an order number. Seeds the run. */
 subject: string;
 /** The moment the caller wants simulated, so a journey can be walked without waiting for a clock. */
 at?: Date;
 /** Anything the particular simulator needs. Never a value from outside this process. */
 detail?: Record<string, unknown>;
};

const registry = new Map<string, Simulator>();

/**
 * Register a simulator, and refuse one that does not answer a declared feed.
 *
 * The check is not ceremony. A simulator naming a feed nobody declared is a simulator producing a
 * shape no supplier will ever send, and the product would then be built against it — which is worse
 * than having no simulator, because it looks like integration work that has already been done.
 */
export function register(simulator: Simulator): void {
 const feed = feedById(simulator.feed);
 if (!feed) {
  throw new Error(
   `Simulator "${simulator.id}" answers a feed "${simulator.feed}" that packages/catalog/feeds.json does not declare. ` +
   `A simulator standing in front of no seam produces a shape no supplier will send, and the product gets built against it.`
  );
 }
 if (!feed.capabilities.includes(simulator.capability)) {
  throw new Error(
   `Simulator "${simulator.id}" claims capability "${simulator.capability}", which feed "${simulator.feed}" does not answer for. ` +
   `The notice a screen renders comes off the capability, so a simulator attached to the wrong one makes the wrong screen speak.`
  );
 }
 if (registry.has(simulator.id)) throw new Error(`Simulator "${simulator.id}" is registered twice.`);
 registry.set(simulator.id, simulator);
}

export const simulators = (): Simulator[] => [...registry.values()];
export const simulatorFor = (feedId: string): Simulator | undefined =>
 [...registry.values()].find(s => s.feed === feedId);

/**
 * Ask a simulated supplier for what it would have sent.
 *
 * This is the whole in-process entrance, and it is the reason the eleven routes did not need to
 * grow a condition. Nothing calls it from a request handler; `scripts/check-boundaries.mjs` fails
 * the build if `server.ts` reaches this directory at all.
 */
export function emit(feedId: string, request: SimulationRequest): SimulatorAnswer {
 const simulator = simulatorFor(feedId);
 if (!simulator) throw new Error(`No simulator stands in for feed "${feedId}". The seam is still a locked door, which is the honest state and not an error unless somebody expected otherwise.`);
 return simulator.produce(request);
}

/** Build a refusal in the capability's own words. The sentence is looked up rather than typed. */
export function refuse(simulator: Simulator, request: SimulationRequest, sentence: string): SimulatedRefusal {
 return {
  feed: simulator.feed,
  capability: simulator.capability,
  reference: reference(simulator, request),
  at: (request.at ?? new Date()).toISOString(),
  refused: sentence
 };
}

export function produced(simulator: Simulator, request: SimulationRequest, payload: Record<string, unknown>): SimulatedEvent {
 return {
  feed: simulator.feed,
  capability: simulator.capability,
  reference: reference(simulator, request),
  at: (request.at ?? new Date()).toISOString(),
  payload
 };
}

/* A reference this process chose. Deliberately not a vendor's: feeds/index.ts refuses to write down
   any string a stranger typed, and a simulator is a stranger the day it becomes an adapter. */
const reference = (simulator: Simulator, request: SimulationRequest): string => {
 const rand = seeded(`${simulator.id}:${request.subject}`);
 return `SIM-${simulator.id.toUpperCase().slice(0, 4)}-${Math.floor(rand() * 900000 + 100000)}`;
};

/** Every feed, and whether a simulator stands behind it. Rendered by the readiness surfaces. */
export const coverage = (): { feed: Feed; simulated: boolean }[] =>
 FEEDS.map(feed => ({ feed, simulated: Boolean(simulatorFor(feed.id)) }));
