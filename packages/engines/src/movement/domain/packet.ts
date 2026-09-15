/* The pre-arrival packet: an emergency card link the Health Passport made, bounded by Record's own ceiling and
 * ended at the hand-over. Movement holds its reference and when it ends, and nothing it opens.
 *
 * ONLY AN EMERGENCY SUMMARY LINK. packages/catalog/movement.json names the grant role the packet rides on and the
 * link kind it is. packetPolicyOf() refuses to answer unless that role's gateway reads the emergency summary and
 * nothing else, and that kind opens the category the gateway opens the summary with; the Passport's own rule
 * (packages/engines/src/record/domain/links.ts, emergency-only) makes every link on such a grant an emergency card.
 * Movement cannot see a link's scope — passport.share.link_created@1 never carries it, on purpose — so what it
 * refuses is what it can see: a link it never heard the Passport make, a link for a purpose that grant does not
 * serve, a link already ended, and a link that lasts longer than Record allows an emergency card on that grant.
 *
 * THE BOUND IS DERIVED, NEVER RESTATED. Record says where a link's ceiling comes from: passport-sharing.json
 * links.lifetimeCeilingFrom names the founder's grant ceiling in consent.json, the emergency card's highest lifetime
 * is held equal to it by the build, and the Passport's gateway applies it on top of whatever a setting says. So the
 * longest an emergency card on a trip's grant can ever last is the shorter of that ceiling and the trip grant's own
 * ceiling, both read from consent.json through Record's pointer. No number of days is typed here, no setting's value
 * is read from a contract, and the build holds this file to both.
 *
 * THE CONTRACTS ARE HANDED IN. consent.json is on the web's first load for the consent screen, and a static import
 * here would keep its grant roles in that chunk for a patient who never opens a packet; the engine hands in its own
 * import and the web hands in the text it reads in the lazy chunk.
 *
 * ENDS AT THE HAND-OVER. A packet ends when the admission is handed over or when its link does, whichever is first.
 */
import { DAY, accept, movementContract, refuse, type Result } from './contract.ts';
import type { Admission } from './admissions.ts';

type ConsentLike = {
 readonly grants: {
  readonly maximumExpiryDays: number;
  readonly recipientRoles: readonly { readonly id: string; readonly maxExpiryDays: number; readonly allowedPurposes: readonly string[]; readonly gateway: { readonly reads: string } }[];
 };
};
type SharingLike = {
 readonly links: { readonly kinds: readonly { readonly id: string; readonly scopeFrom?: string }[]; readonly lifetimeCeilingFrom: string };
};
const GRANT_CEILING = 'packages/catalog/consent.json#grants.maximumExpiryDays';

export type PacketPolicy = { readonly boundDays: number; readonly purposes: readonly string[]; readonly grantRole: string; readonly kind: string };

export function packetPolicyOf(consent: ConsentLike, sharing: SharingLike): PacketPolicy {
 const packet = movementContract.packet;
 const role = consent.grants.recipientRoles.find(r => r.id === packet.grantRole);
 if (!role || role.gateway.reads !== 'emergency-summary') throw new Error(`packages/catalog/movement.json rides the packet on "${packet.grantRole}", whose gateway does not read the emergency summary alone. The packet is an emergency summary link or nothing.`);
 const kind = sharing.links.kinds.find(k => k.id === packet.kind);
 if (!kind?.scopeFrom?.endsWith('#emergencySummary.openedBy')) throw new Error(`packages/catalog/movement.json makes the packet a "${packet.kind}" link, which packages/catalog/passport-sharing.json does not scope to the emergency summary.`);
 if (sharing.links.lifetimeCeilingFrom !== GRANT_CEILING) throw new Error(`packages/catalog/passport-sharing.json no longer takes a link's ceiling from ${GRANT_CEILING}, so the packet's bound would be derived from something Record does not apply.`);
 return Object.freeze({
  boundDays: Math.min(consent.grants.maximumExpiryDays, role.maxExpiryDays),
  purposes: Object.freeze([...role.allowedPurposes]),
  grantRole: role.id,
  kind: kind.id
 });
}

/** What Movement keeps of a link it heard the Passport make: a reference, a purpose and two times. */
export type HeardLink = { readonly linkRef: string; readonly purpose: string; readonly expiresAt: number; readonly heardAt: number };
export type Packet = {
 readonly admissionRef: string; readonly linkRef: string; readonly sentAt: number; readonly linkEndsAt: number;
 readonly openedAt: number | null; readonly openedByRole: string | null; readonly openedAfterEnd: boolean;
};
export type PacketState = 'none' | 'sent' | 'opened' | 'ended';

/** A heard link is kept no longer than it could ever be sent: its own end, or the bound from when it was heard. */
export const heardLinkKeptUntil = (link: HeardLink, policy: PacketPolicy): number => Math.min(link.expiresAt, link.heardAt + policy.boundDays * DAY);

export function sendPacket(admission: Admission | undefined, link: HeardLink | undefined, policy: PacketPolicy, now: number): Result<Packet> {
 if (!admission) return refuse('not-found');
 if (admission.stateCode === 'handed-over') return refuse('packet-after-handover');
 if (!link) return refuse('packet-link-not-heard');
 if (!policy.purposes.includes(link.purpose)) return refuse('unrestricted-access');
 if (link.expiresAt <= now) return refuse('packet-link-ended');
 if (link.expiresAt > link.heardAt + policy.boundDays * DAY) return refuse('packet-link-outlives-its-bound');
 return accept(Object.freeze({ admissionRef: admission.admissionRef, linkRef: link.linkRef, sentAt: now, linkEndsAt: link.expiresAt, openedAt: null, openedByRole: null, openedAfterEnd: false }));
}

export const packetEndsAt = (packet: Packet, admission: Admission): number => Math.min(packet.linkEndsAt, admission.handedOverAt ?? Number.POSITIVE_INFINITY);

export function packetStateOf(packet: Packet | undefined, admission: Admission, now: number): PacketState {
 if (!packet) return 'none';
 if (now >= packetEndsAt(packet, admission)) return 'ended';
 return packet.openedAt === null ? 'sent' : 'opened';
}

/* The Passport says a link was opened. Movement records the first open of a packet it sent, and marks an open
   after the packet ended — which the Passport should have refused — rather than letting it pass unremarked. */
export function heardOpen(packet: Packet, admission: Admission, openedByRole: string, now: number): Packet {
 const afterEnd = now >= packetEndsAt(packet, admission);
 if (packet.openedAt !== null && !afterEnd) return packet;
 return Object.freeze({ ...packet, openedAt: packet.openedAt ?? now, openedByRole: packet.openedByRole ?? openedByRole, openedAfterEnd: packet.openedAfterEnd || afterEnd });
}
