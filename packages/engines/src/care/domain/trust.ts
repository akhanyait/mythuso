/* What Care knows about a person's Trust Score: a badge, and whether every hard gate passed, as the
 * last event Verify sent about her said.
 *
 * Care never asks Verify. It hears person.trust_updated at version 2 on the bus and keeps the latest
 * one per person in its own store, which is the only arrangement in which a Trust Score cannot be
 * read by a roster: the event does not carry the number (packages/catalog/events.json gives it a
 * never-list entry for exactly that), and this cache copies the two fields the event may carry and
 * nothing else, so a publisher that one day sends more finds nowhere here to put it.
 *
 * WHAT COUNTS AS CURRENT. The latest event says every hard gate passes and names a tier that
 * packages/catalog/trust.json declares. Nothing else. A person Care has never heard about has no
 * badge — not a default one — because "no score, no dispatch" is about the absence of an answer as
 * much as about a failing one. A later event that says the gates failed replaces an earlier one that
 * said they passed; an event older than the one already held is ignored, so a bus that redelivers
 * yesterday's badge cannot restore a nurse who was withdrawn this morning. */

export const HEARD = { type: 'person.trust_updated', version: 2 } as const;

export type TrustUpdated = {
 readonly type: string;
 readonly version: number;
 readonly subjectRef: string;
 readonly occurredAt: string;
 readonly payload: { readonly badgeTier: string; readonly hardGatesPassed: boolean };
};

export type Standing =
 | { readonly current: true; readonly badgeTier: string }
 | { readonly current: false; readonly why: 'never-heard' | 'hard-gates-failed' | 'tier-not-declared' };

export interface TrustReader { standing(subjectRef: string): Standing }

type Held = { badgeTier: string; hardGatesPassed: boolean; occurredAt: number };

export class TrustCache implements TrustReader {
 #held = new Map<string, Held>();
 #tiers: ReadonlySet<string>;

 constructor(badgeTiers: readonly string[]) {
  this.#tiers = new Set(badgeTiers);
 }

 /** True when the event was taken; false when it was not an event Care is built against, or older than what is held. */
 learn(event: TrustUpdated): boolean {
  if (event.type !== HEARD.type || event.version !== HEARD.version) return false;
  const at = Date.parse(event.occurredAt);
  if (!Number.isFinite(at) || typeof event.payload?.hardGatesPassed !== 'boolean' || typeof event.payload.badgeTier !== 'string') return false;
  const before = this.#held.get(event.subjectRef);
  if (before && before.occurredAt > at) return false;
  this.#held.set(event.subjectRef, { badgeTier: event.payload.badgeTier, hardGatesPassed: event.payload.hardGatesPassed, occurredAt: at });
  return true;
 }

 standing(subjectRef: string): Standing {
  const held = this.#held.get(subjectRef);
  if (!held) return { current: false, why: 'never-heard' };
  if (!held.hardGatesPassed) return { current: false, why: 'hard-gates-failed' };
  if (!this.#tiers.has(held.badgeTier)) return { current: false, why: 'tier-not-declared' };
  return { current: true, badgeTier: held.badgeTier };
 }
}
