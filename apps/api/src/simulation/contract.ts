/**
 * What a simulated supplier is allowed to say, and the door it has to get past to say it.
 *
 * ── Why a simulator does not check its own shape ─────────────────────────────────────────────
 *
 * `simulation/index.ts` says a simulator owes the feed it stands in for "so what it produces can be
 * checked against the shape that feed declares". The tempting way to do that is a second reader of
 * `packages/catalog/feeds.json` living here, and it would be wrong for the reason every second copy
 * in this repository is wrong: the day the door's idea of a forbidden field and the simulator's idea
 * of one drift apart, the simulator goes on producing a payload the real seam would turn away, and
 * the product gets built against it.
 *
 * So the check is the door itself. `mustPassTheSeam` hands the payload to `feeds/decide` — the same
 * function a vendor's first POST reaches — and insists the *only* thing wrong with it is that
 * nothing is connected. A forbidden field or an undeclared one is a defect in the simulator and
 * stops it dead, rather than being noticed by a reviewer eyeballing a JSON literal.
 *
 * The wall is one-directional and this is the permitted direction: simulation reads the feeds
 * modules, and `scripts/check-boundaries.mjs` fails the build if the feeds modules or the server
 * ever read simulation.
 *
 * ── Why a refusal sentence is looked up rather than typed ────────────────────────────────────
 *
 * `refuse()` records "one of the sentences in this capability's `simulation.refuses`, word for
 * word", and a sentence typed into a TypeScript file is word for word only until somebody edits the
 * contract. `refusalSaying` finds it by what it is about and throws when the contract no longer has
 * one — so re-wording a refusal in `capabilities.json` fails the tests that assert it rather than
 * silently leaving a simulator refusing in words no screen renders any more.
 *
 * Pure: no clock of its own, no store, no HTTP.
 */
import capabilities from '../../../../packages/catalog/capabilities.json' with { type: 'json' };
import { decide, feedById, type Feed } from '../feeds/index.ts';
import { type Simulator } from './index.ts';

export type Simulation = {
 supplier: string;
 notice: string;
 refuses: string[];
 reachableFromTheNetwork: boolean;
};

type CapabilityRow = { id: string; state?: string; connected: boolean; notice: string; simulation?: Simulation };
const rows = capabilities.capabilities as readonly CapabilityRow[];

/**
 * The simulation block for a capability, or a loud failure.
 *
 * Thrown on rather than returned as null for the same reason the web's `capability()` throws: a
 * simulator standing behind a capability the contract has not marked simulated is something
 * answering behind a screen that is still telling a nurse nothing is connected, and the failure
 * mode of returning null there is silence.
 */
export function simulationOf(capabilityId: string): Simulation {
 const found = rows.find(row => row.id === capabilityId);
 if (!found) throw new Error(`packages/catalog/capabilities.json has no capability "${capabilityId}".`);
 if (found.state !== 'simulated' || !found.simulation) {
  throw new Error(
   `Capability "${capabilityId}" is not marked simulated in packages/catalog/capabilities.json, so it has no simulator's ` +
   `supplier, notice or refusals to read. Something answering behind a screen that still says nothing is connected is ` +
   `worse than nothing answering.`
  );
 }
 if (found.connected) throw new Error(`Capability "${capabilityId}" is marked connected and simulated at once. A simulator does not connect anything.`);
 return found.simulation;
}

/** The sentence a screen renders while a simulator is the source. Word for word, from the contract. */
export const noticeOf = (capabilityId: string): string => simulationOf(capabilityId).notice;

/** What this simulator stands in for, in the same words the capability contract uses. */
export const supplierOf = (capabilityId: string): string => simulationOf(capabilityId).supplier;

/**
 * One of a capability's own refusal sentences, found by what it is about.
 *
 * The regular expression is the least of it: what matters is that exactly one sentence answers, so
 * that a contract which grows a second refusal about the same subject fails here rather than
 * letting a simulator pick whichever came first.
 */
export function refusalSaying(capabilityId: string, matching: RegExp): string {
 const found = simulationOf(capabilityId).refuses.filter(sentence => matching.test(sentence));
 if (found.length === 0) {
  throw new Error(
   `Capability "${capabilityId}" no longer refuses anything matching ${matching}. A simulator refusing in words its own ` +
   `contract has stopped using is a refusal no screen renders. Fix the contract or fix the simulator, not this line.`
  );
 }
 if (found.length > 1) throw new Error(`Capability "${capabilityId}" has ${found.length} refusals matching ${matching}, so a simulator would be choosing between them.`);
 return found[0]!;
}

/**
 * The payload, through the real door.
 *
 * A refusal of `not-connected` is the pass mark, because that is what every one of the eleven routes
 * answers a well-formed payload with and will go on answering until an adapter exists. Anything else
 * — a forbidden field at any depth, an undeclared field, a missing or mistyped one — is the
 * simulator teaching the product a shape no supplier will ever send.
 */
export function mustPassTheSeam(feedId: string, payload: Record<string, unknown>): void {
 const feed = feedById(feedId);
 if (!feed) throw new Error(`No feed "${feedId}" in packages/catalog/feeds.json.`);
 const refusal = decide(feed, payload);
 if (refusal.kind === 'forbidden-field') {
  throw new Error(
   `A simulated ${feedId} payload carries "${refusal.forbidden!.field}", which that seam never accepts: ${refusal.forbidden!.refusal} ` +
   `A simulator may not produce what the door it stands in front of would turn away.`
  );
 }
 if (refusal.kind === 'wrong-shape') {
  throw new Error(
   `A simulated ${feedId} payload does not satisfy the shape packages/catalog/feeds.json declares — ` +
   `${refusal.unknownFields} undeclared field(s), missing [${refusal.missing.join(', ')}], wrong type [${refusal.wrongType.join(', ')}].`
  );
 }
}

/**
 * The fields a feed declares as a moment rather than as words.
 *
 * Asked of the contract rather than listed, because a simulator that wants to scan its own payload
 * for something a person could read has to know which strings are prose and which are a timestamp,
 * and the answer is already written down once.
 */
export function timeFieldsOf(feedId: string): Set<string> {
 const feed = feedById(feedId);
 if (!feed) throw new Error(`No feed "${feedId}" in packages/catalog/feeds.json.`);
 return new Set(feed.accepts.filter(accepted => accepted.type === 'instant' || accepted.type === 'iso-date').map(accepted => accepted.field));
}

/**
 * An instant in the one offset South Africa has.
 *
 * The feed contract requires an offset rather than defaulting one, and says why: a supplier running
 * on UTC ends every shift two hours early and nobody notices until it happens. `toISOString()` would
 * satisfy the regular expression with a `Z` and be exactly that mistake written by us instead of by
 * a vendor. South Africa does not observe daylight saving — packages/catalog/scheduling.json says so
 * in its own words — so +02:00 is true in June as well as in December.
 */
export const SOUTH_AFRICAN_OFFSET_MINUTES = 120;
export const instant = (at: Date): string =>
 `${new Date(at.getTime() + SOUTH_AFRICAN_OFFSET_MINUTES * 60_000).toISOString().slice(0, 19)}+02:00`;

/** Midnight-relative day offsets are how every contract here writes a date. This turns one into a moment. */
export function atDayOffset(from: Date, dayOffset: number, hhmm: string): Date {
 const [hours, minutes] = hhmm.split(':').map(Number) as [number, number];
 /* Worked out on the South African calendar rather than the host's, so a machine set to UTC and a
    machine in Johannesburg agree about which day "the day after tomorrow at 09:00" is. At 23:30 in
    Johannesburg those two machines are on different dates, and the roster would slip by a day. */
 const local = new Date(from.getTime() + SOUTH_AFRICAN_OFFSET_MINUTES * 60_000);
 const midday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hours, minutes);
 return new Date(midday - SOUTH_AFRICAN_OFFSET_MINUTES * 60_000);
}

/* ---- Two helpers the money and identity seams brought with them ----------------------------- */

/**
 * A simulator answering a seam the registry already has an answer for.
 *
 * `register()` indexes by feed and `emit()` takes the first match, so two registered simulators on
 * one door would leave `emit` choosing between them silently. message-delivery is the one feed that
 * answers for two capabilities — the channel a message travels on, and the sign-in that depends on
 * it — and they are different suppliers of the same receipt. So the second is held to exactly what
 * `register` would have held it to and then kept out of the registry, and it is reached by its own
 * name rather than through `emit`.
 */
export function standIn(simulator: Simulator): Simulator {
 const feed: Feed | null = feedById(simulator.feed);
 if (!feed) throw new Error(`Simulator "${simulator.id}" answers a feed "${simulator.feed}" that packages/catalog/feeds.json does not declare.`);
 if (!feed.capabilities.includes(simulator.capability)) {
  throw new Error(`Simulator "${simulator.id}" claims capability "${simulator.capability}", which feed "${simulator.feed}" does not answer for. The notice a screen renders comes off the capability, so a simulator attached to the wrong one makes the wrong screen speak.`);
 }
 simulationOf(simulator.capability);
 return simulator;
}


/**
 * Everything a caller handed in, flattened to the strings a refusal has to look at.
 *
 * A simulator's first job is to refuse what it should never have been given — a mobile number, a
 * card number, a bank account — and the shape that arrives is a caller's object rather than a
 * payload at a door, so it is walked here rather than by `feeds/index.ts`. Keys and values both:
 * `{ to: '0821234567' }` and `{ note: '0821234567' }` are the same disclosure, and only one of them
 * is caught by looking at names.
 */
export function flatten(value: unknown, depth = 0): { keys: string[]; values: string[] } {
 const keys: string[] = [];
 const values: string[] = [];
 if (depth > 8 || value === null || value === undefined) return { keys, values };
 if (typeof value === 'string') return { keys, values: [value] };
 if (typeof value === 'number') return { keys, values: [String(value)] };
 if (Array.isArray(value)) {
  for (const item of value) {
   const inner = flatten(item, depth + 1);
   keys.push(...inner.keys);
   values.push(...inner.values);
  }
  return { keys, values };
 }
 if (typeof value !== 'object') return { keys, values };
 for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
  keys.push(key);
  const inner = flatten(item, depth + 1);
  keys.push(...inner.keys);
  values.push(...inner.values);
 }
 return { keys, values };
}

