/* Whether a person or a pharmacy may prescribe, verify or dispense today, asked of the vetting contract
 * first and of what Trust last said second.
 *
 * THE CONTRACT DECIDES THE ROLE. packages/catalog/vetting.json grants prescribe and dispense to roles, and
 * packages/catalog/medicines.json says which capability each act asks for. A role the register does not grant
 * it is refused however the person stands. A pharmacist is the one caller who is not a role on the register:
 * the register vets a pharmacist as the pharmacy's responsible pharmacist, so a pharmacist acts under the
 * pharmacy the prescription was routed to, and only while that pharmacy is verified (medicines.json actsFor).
 *
 * TRUST DECIDES TODAY. Medicines never asks Verify. It hears person.verified, person.suspended,
 * person.reinstated, person.deactivated, partner.verified and partner.suspended, which list it as a subscriber,
 * and keeps the latest per party and role: a role, the day the verification runs to, whether it is stopped and
 * whether it has ended. Nothing else from those events is kept — not the badge, not a reason code — because
 * none of it decides anything here. A party Medicines has never heard verified is not cleared: the absence of
 * an answer is not a yes. An event older than the one held is ignored, so a bus that redelivers last week's
 * verification cannot restore a pharmacy suspended this morning. A deactivation is not undone by a
 * reinstatement, because a person no longer part of the network in a role is verified again, not reinstated.
 */
import { actsUnder, rolesGrantedFor } from './contract.ts';

export type Heard = {
 readonly type: string; readonly version: number; readonly subjectRef: string; readonly occurredAt: string;
 readonly payload: Readonly<Record<string, unknown>>;
};
export type Standing = {
 readonly subjectRef: string; readonly role: string; readonly verifiedUntil: string | null;
 readonly stopped: boolean; readonly ended: boolean; readonly heardAt: string;
};

/** The Trust events Medicines hears for standing, each a subscription in packages/catalog/events.json. */
export const STANDING_EVENTS = ['person.verified@1', 'person.suspended@1', 'person.reinstated@1', 'person.deactivated@1', 'partner.verified@1', 'partner.suspended@1'] as const;

/** The role an event is about: a person's role, or a partner's kind, which for a pharmacy is the register's pharmacy role. */
export const roleIn = (event: Heard): string | null =>
 typeof event.payload['role'] === 'string' ? event.payload['role'] : typeof event.payload['partnerKind'] === 'string' ? event.payload['partnerKind'] : null;

/** What is held after an event, or null when the event changes nothing. */
export function learn(held: Standing | undefined, event: Heard): Standing | null {
 const role = roleIn(event);
 if (!role || !Number.isFinite(Date.parse(event.occurredAt))) return null;
 if (held && Date.parse(held.heardAt) > Date.parse(event.occurredAt)) return null;
 const base: Standing = held ?? { subjectRef: event.subjectRef, role, verifiedUntil: null, stopped: false, ended: false, heardAt: event.occurredAt };
 switch (`${event.type}@${event.version}`) {
  case 'person.verified@1': case 'partner.verified@1':
   return typeof event.payload['verifiedUntil'] === 'string' ? { ...base, verifiedUntil: event.payload['verifiedUntil'], stopped: false, ended: false, heardAt: event.occurredAt } : null;
  case 'person.reinstated@1': return { ...base, stopped: false, heardAt: event.occurredAt };
  case 'person.suspended@1': case 'partner.suspended@1': return { ...base, stopped: true, heardAt: event.occurredAt };
  case 'person.deactivated@1': return { ...base, stopped: true, ended: true, heardAt: event.occurredAt };
  default: return null;
 }
}

/** Verified, in date and not stopped, on the day given as yyyy-mm-dd. */
export const clearedOn = (standing: Standing | undefined, today: string): boolean =>
 !!standing && !standing.stopped && !standing.ended && standing.verifiedUntil !== null && standing.verifiedUntil >= today;

export type StandingReader = { of(subjectRef: string, role: string): Standing | undefined; all(subjectRef: string): readonly Standing[] };
export type Actor = { readonly role: string; readonly ref: string };

/** Whether this actor may do this act for a prescription routed to this pharmacy, today. */
export function mayAct(act: 'prescribe' | 'verify' | 'dispense', actor: Actor, pharmacyRef: string | null, standing: StandingReader, today: string): boolean {
 const granted = rolesGrantedFor(act);
 if (granted.includes(actor.role)) return clearedOn(standing.of(actor.ref, actor.role), today);
 const under = actsUnder(actor.role);
 if (!under || !granted.includes(under) || pharmacyRef === null) return false;
 /* Not a role on the register in their own right, so nothing verifies them as themselves; but a person Trust has
    suspended or ended in any role is never let act under a partner's grant instead. */
 if (standing.all(actor.ref).some(s => s.stopped || s.ended)) return false;
 return clearedOn(standing.of(pharmacyRef, under), today);
}
