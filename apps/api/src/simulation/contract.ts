/**
 * The capability contract, read by the simulators rather than restated by them.
 *
 * Every simulator owes three things and the third is its refusals — enforced rather than described.
 * The sentences those refusals are made of already exist: `packages/catalog/capabilities.json` gives
 * each simulated capability a `simulation.refuses` list, and those are the words three platforms
 * render. So a simulator must not type one. It names which refusal it means and the sentence is
 * looked up, which is the same arrangement every other contract in this repository is under: one
 * writer of a sentence, and a build that fails when a copy disagrees.
 *
 * `refusesTo` is the lookup, and it is deliberately fussy. A selector that matches two sentences, or
 * none, throws at module load rather than at the moment somebody is being refused — because the
 * failure it guards against is a refusal that silently stops being said when the contract is
 * reworded, and a refusal nobody says is a refusal that is not enforced.
 *
 * `scripts/check-boundaries.mjs` reads the other direction: every sentence in the simulated money
 * and identity capabilities' `refuses` lists must be selected by exactly one `refusesTo` call in
 * this directory. A refusal added to the contract and enforced nowhere is a promise kept nowhere.
 *
 * Pure: no clock, no store, no HTTP.
 */
import { feedById, type Feed } from '../feeds/index.ts';
import capabilities from '../../../../packages/catalog/capabilities.json' with { type: 'json' };
import type { Simulator } from './index.ts';

/** The `simulation` block a capability carries once its state is `simulated`. */
export type Simulation = { supplier: string; notice: string; refuses: string[]; reachableFromTheNetwork: boolean };

/* capabilities.json is a mixed list — most capabilities have no simulation block at all — so the
   inferred union carries no `simulation`. Narrowed here, once, rather than at every reader. */
const declared = capabilities.capabilities as ReadonlyArray<{ id: string; state: string; simulation?: Simulation }>;

/**
 * What a capability's simulator stands in for, and what it will not do.
 *
 * Throws on a capability that is not marked simulated, which is the same refusal the wall check
 * makes from the outside: something answering behind a screen that still says nothing is connected
 * is worse than nothing answering, because the screen goes on denying it.
 */
export function simulationOf(id: string): Simulation {
 const found = declared.find(capability => capability.id === id);
 if (!found) throw new Error(`No capability "${id}" in packages/catalog/capabilities.json. A simulator standing in front of nothing is a fixture with a label on it.`);
 if (found.state !== 'simulated' || !found.simulation) {
  throw new Error(`Capability "${id}" is "${found.state}" in packages/catalog/capabilities.json and carries no simulation block, so there is nothing to hold a simulator to. Mark it simulated with its supplier, its notice and what it refuses, or do not simulate it.`);
 }
 /* The one field in the block that is a claim about this code rather than about the product. If it
    were ever true the wall would be gone, and it would have gone quietly. */
 if (found.simulation.reachableFromTheNetwork) {
  throw new Error(`Capability "${id}" declares its simulation reachable from the network. Nothing here is: the eleven feed routes accept nothing and a simulated event enters in process. Correct the contract rather than the wall.`);
 }
 return found.simulation;
}

/**
 * One of a capability's own refusal sentences, chosen by a fragment of itself.
 *
 * The fragment is a selector, not a second copy: what comes back is the contract's sentence, word
 * for word, and the day somebody rewords it past the selector this throws instead of quietly
 * refusing nobody.
 */
export function refusesTo(capability: string, matching: RegExp): string {
 const refuses = simulationOf(capability).refuses;
 const found = refuses.filter(sentence => matching.test(sentence));
 if (found.length !== 1) {
  throw new Error(
   `${matching} matches ${found.length} of the ${refuses.length} things capability "${capability}" refuses to do. ` +
   `A selector matching none is a refusal that has quietly stopped being enforced; one matching two is a refusal nobody can tell from another.`
  );
 }
 return found[0]!;
}

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
