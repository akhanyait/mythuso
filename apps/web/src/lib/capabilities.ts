import contract from '../../../../packages/catalog/capabilities.json' with { type: 'json' };
/* What MyThuso can actually do, and what it only draws.
 *
 * Every screen used to carry its own hand-typed "Design preview", "Demonstration record" or
 * "Fictional workspace" — sixty-odd sentences saying roughly the same thing in slightly different
 * words, stacked three deep on the nurse's schedule, and none of them attached to anything that
 * would know when it stopped being true. This module is the one place that knows.
 *
 * A screen names the capability it depends on. If that capability is connected, nothing renders. If
 * it is not, the contract's sentence renders, word for word, on all three platforms. When an
 * integration lands, one boolean changes and the notice disappears everywhere at once — which is
 * the only version of this that survives contact with a deadline. */

export type Capability = typeof contract.capabilities[number];
export const capabilities = contract.capabilities;
export const rules = contract.rules;

/* The rules are the contract's own reasoning, and the public status page renders one of them word
   for word: the one that says a row may not read "Connected" until there is a file to point at.
   Looked up by id and thrown on rather than found-or-undefined, for the same reason `capability`
   is — a rule that quietly renders as nothing is a paragraph of accountability that has silently
   left the page. */
export const rule = (id: string) => {
 const found = rules.find(r => r.id === id);
 if (!found) throw new Error(`No rule "${id}" in packages/catalog/capabilities.json`);
 return found;
};

export const capability = (id: string): Capability => {
 const found = capabilities.find(c => c.id === id);
 /* Throwing rather than returning undefined, because the failure this guards against is a screen
    that names a capability nobody added and therefore silently claims to be connected. Loud is
    correct here: a missing notice is the defect, and a missing notice is invisible. */
 if (!found) throw new Error(`No capability "${id}" in packages/catalog/capabilities.json`);
 return found;
};

export const isConnected = (id: string) => capability(id).connected;

export type CapabilityState = 'absent' | 'on-device' | 'simulated' | 'connected';
/* Three states, not two. `simulated` was added when the founder asked to walk the whole product end
   to end before a single supplier had been signed, and the honest way to give him that was a third
   state rather than the second one — marking these connected would have taken the notice off every
   screen and told the status page a health service was live. See the contract's own
   `simulated-is-not-connected` and `a-simulation-says-so`. */
export const stateOf = (id: string): CapabilityState => capability(id).state as CapabilityState;
export const isSimulated = (id: string) => stateOf(id) === 'simulated';

/** What a simulator produces, and — the half worth reading — what it refuses to produce. */
export const simulationOf = (id: string) => capability(id).simulation ?? null;

/* One refusal sentence, addressed by the slug of its own words rather than by an index or a
   substring somebody typed. It is the same arrangement apps/api/src/simulation/contract.ts uses on
   the other side of the boundary, and for the same reason: reword a refusal in the contract and the
   slug stops resolving, so the screen fails loudly instead of going on refusing something in words
   nobody says any more. The slug is deliberately not stored beside the sentence — a written-down id
   is one more thing that can stay the same while the sentence under it changes. */
export const refusalSlug = (sentence: string) =>
 sentence.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function simulationRefusal(id: string, slug: string): string {
 const refuses = simulationOf(id)?.refuses ?? [];
 const found = refuses.find(sentence => refusalSlug(sentence) === slug);
 if (!found) throw new Error(`Capability "${id}" has no simulation refusal reading "${slug}". It refuses: ${refuses.map(refusalSlug).join(', ')}.`);
 return found;
}

/** The sentence to show, or nothing at all because the thing is real now.
 *
 *  A simulated capability is never quieter than an absent one. The failure this guards against is
 *  not a screen that lies; it is a screen that stops speaking, because something answers now and
 *  nobody notices that what answers is a fixture. So the notice only disappears at `connected`. */
export const noticeFor = (id: string): string | null => {
 const found = capability(id);
 if (found.connected) return null;
 return found.simulation ? found.simulation.notice : found.notice;
};

/* What is standing between a capability and being real. Read by the admin console, which is the one
   surface whose job is to be honest about readiness rather than to get out of the way. */
export const blockedBy = (id: string) => capability(id).blockedBy;
export const connectedCount = capabilities.filter(c => c.connected).length;
export const simulatedCount = capabilities.filter(c => c.state === 'simulated').length;
export const everythingConnected = connectedCount === capabilities.length;
