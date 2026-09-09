/**
 * Who the gate is told is asking, and where that comes from.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────
 *
 * The gate, the evidence vault and the hash chain were written, tested and unreachable for weeks,
 * and `server.ts` said why in a comment beside the intake ledger: a route that took an actor id off
 * a request body and handed it to the gate is *precisely* the hole the gate exists to close.
 * Anybody who can POST would then be anybody. A library with a test suite is not a running control,
 * and neither is a running control that anyone can lie to.
 *
 * So the actor is resolved here, and it is resolved from two things only:
 *
 *   · **the id is the signed-in person's id**, out of the session cookie, never out of a body;
 *   · **the role is read out of `vetting_parties`**, so a caller cannot name their own role — the
 *     gate already refuses a request whose claimed role is not the vetted one, and this makes that
 *     refusal unreachable rather than merely correct.
 *
 * The purpose is derived rather than declared, from the one fact that decides it: whether the party
 * being acted on is the caller themselves. `subject-access` is the right to read and add to your own
 * file — which is what lets a nurse whose clearance lapsed last night upload the new certificate —
 * and `vetting` is somebody deciding about somebody else. A caller cannot choose between them,
 * because the choice is not theirs to make.
 *
 * ── The answer for almost everybody ──────────────────────────────────────────────────────────
 *
 * A signed-in person who is not on the vetting register resolves to nothing at all. That is not an
 * edge case to be worked around: it is every patient, which is nearly every account. The correct
 * answer for them is that the vault has no route they can reach, said in a sentence rather than as a
 * 404 that reads like a bug.
 *
 * ── What this deliberately does not do ───────────────────────────────────────────────────────
 *
 * It does not invent a party for a person who has none, and it does not accept a party id that
 * differs from the person id. Those are the same identifier by construction: a party is enrolled
 * under the account that will act as it, so there is no mapping table to get wrong and no route
 * through which one person's session can act as another party. When MyThuso has more than one
 * account per party — an agency, a practice, a laboratory with staff — that will need a real care
 * relationship, and it will need to be built rather than assumed here.
 *
 * Pure: reads, decides and explains. It writes nothing and holds no clock.
 */
import { roleGrants, type Actor, type Party, type VettingStore } from './vetting/index.ts';
import { capabilitiesNeedingSecondFactor } from './stepUp.ts';

/** Said to a signed-in person the vetting register holds nothing about. Which is most people. */
export const NOT_A_PARTY =
 'MyThuso vets nurses, doctors, pharmacies, laboratories, couriers, interpreters and its own staff, and this account is not one of them. Nothing here is refused because of anything you have done: the vetting register simply holds no record of you, so there is nothing for it to decide about.';

/** Said where the party exists but the register has no such role. A catalogue change, not a caller. */
export const ROLE_NOT_IN_CATALOGUE = (roleId: string): string =>
 `This account is on the vetting register as "${roleId}", and packages/catalog/vetting.json no longer has a role by that name. Nothing is decided against a role nobody can look up — a missing rule must never read as permission.`;

export type ResolvedActor = {
 party: Party;
 /** What the gate is handed. The role is the stored one; the purpose is derived below. */
 actorFor(subjectPartyId: string): Actor;
 /** The capabilities this role holds that must carry a second factor. Empty for most roles. */
 secondFactorCapabilities: string[];
 grants: readonly string[];
};

/**
 * The signed-in person, as a vetted party — or null, which is the ordinary answer.
 *
 * `subjectPartyId` decides the purpose and nothing else. Acting on your own record is subject
 * access; acting on somebody else's is vetting, and the gate holds a role to what the catalogue
 * grants it either way.
 */
export function resolveActor(store: VettingStore, personId: string): ResolvedActor | null {
 const party = store.findParty(personId);
 if (!party) return null;
 const grants = roleGrants(party.roleId);
 return {
  party,
  actorFor: (subjectPartyId: string): Actor => ({
   id: party.id,
   role: party.roleId,
   purpose: subjectPartyId === party.id ? 'subject-access' : 'vetting'
  }),
  secondFactorCapabilities: capabilitiesNeedingSecondFactor(grants),
  grants
 };
}
