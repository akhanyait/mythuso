import contract from '../../../../packages/catalog/capabilities.json';
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

export const capability = (id: string): Capability => {
 const found = capabilities.find(c => c.id === id);
 /* Throwing rather than returning undefined, because the failure this guards against is a screen
    that names a capability nobody added and therefore silently claims to be connected. Loud is
    correct here: a missing notice is the defect, and a missing notice is invisible. */
 if (!found) throw new Error(`No capability "${id}" in packages/catalog/capabilities.json`);
 return found;
};

export const isConnected = (id: string) => capability(id).connected;

/** The sentence to show, or nothing at all because the thing is real now. */
export const noticeFor = (id: string): string | null => {
 const found = capability(id);
 return found.connected ? null : found.notice;
};

/* What is standing between a capability and being real. Read by the admin console, which is the one
   surface whose job is to be honest about readiness rather than to get out of the way. */
export const blockedBy = (id: string) => capability(id).blockedBy;
export const connectedCount = capabilities.filter(c => c.connected).length;
export const everythingConnected = connectedCount === capabilities.length;
