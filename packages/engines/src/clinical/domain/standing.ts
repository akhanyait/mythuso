/* Whether a clinician may confirm a review today: what Trust last said about them, heard on the bus.
 *
 * Clinical never asks Verify. It hears person.verified, person.suspended, person.reinstated and
 * person.deactivated, which list it as a subscriber, and keeps the latest per person and role: the day the
 * verification runs to, whether it is stopped and whether it has ended. Nothing else from those events is kept —
 * not the badge, not a reason code — because none of it decides whether somebody may sign. A person Clinical has
 * never heard verified is not cleared: the absence of an answer is not a yes. An event older than the one held is
 * ignored, so a redelivered verification cannot restore somebody suspended this morning, and a deactivation is not
 * undone by a reinstatement.
 *
 * Medicines keeps the same arithmetic over the same events for prescribing. It is written again here rather than
 * imported because an engine never reaches into another engine's directory: the day Medicines changes what it
 * keeps for a pharmacy, a signature must not change with it.
 */
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };

export type Heard = {
 readonly type: string; readonly version: number; readonly subjectRef: string; readonly occurredAt: string;
 readonly payload: Readonly<Record<string, unknown>>;
};
export type Standing = {
 readonly subjectRef: string; readonly role: string; readonly verifiedUntil: string | null;
 readonly stopped: boolean; readonly ended: boolean; readonly heardAt: string;
};

/** The Trust events Clinical hears for standing, each a subscription in packages/catalog/events.json. */
export const STANDING_EVENTS = ['person.verified@1', 'person.suspended@1', 'person.reinstated@1', 'person.deactivated@1'] as const;

/** What is held after an event, or null when the event changes nothing. */
export function learn(held: Standing | undefined, event: Heard): Standing | null {
 const role = typeof event.payload['role'] === 'string' ? event.payload['role'] : null;
 if (!role || !Number.isFinite(Date.parse(event.occurredAt))) return null;
 if (held && Date.parse(held.heardAt) > Date.parse(event.occurredAt)) return null;
 const base: Standing = held ?? { subjectRef: event.subjectRef, role, verifiedUntil: null, stopped: false, ended: false, heardAt: event.occurredAt };
 switch (`${event.type}@${event.version}`) {
  case 'person.verified@1':
   return typeof event.payload['verifiedUntil'] === 'string' ? { ...base, verifiedUntil: event.payload['verifiedUntil'], stopped: false, ended: false, heardAt: event.occurredAt } : null;
  case 'person.reinstated@1': return base.ended ? null : { ...base, stopped: false, heardAt: event.occurredAt };
  case 'person.suspended@1': return { ...base, stopped: true, heardAt: event.occurredAt };
  case 'person.deactivated@1': return { ...base, stopped: true, ended: true, heardAt: event.occurredAt };
  default: return null;
 }
}

const DAY_OF = new Intl.DateTimeFormat('en-CA', { timeZone: scheduling.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
/** The calendar day in the timezone packages/catalog/scheduling.json names, as yyyy-mm-dd. */
export const dayOf = (at: number): string => DAY_OF.format(new Date(at));

/** Verified, in date and not stopped, on the day given as yyyy-mm-dd. */
export const clearedOn = (standing: Standing | undefined, today: string): boolean =>
 !!standing && !standing.stopped && !standing.ended && standing.verifiedUntil !== null && standing.verifiedUntil >= today;

/* Credential standing: the HPCSA registration a clinical role's authority rests on, beside what Trust
 * last said. An HPCSA verification is made on a day and is current for twelve months from it; the
 * practice number and speciality travel with it. Nothing here decides anything on its own — a lapsed
 * verification is a fact for whoever asks, and who may act on it is the confirmer setting's business.
 */
export type CredentialStanding = Standing & {
 readonly hpcsaVerifiedAt?: string;
 readonly practiceNumber?: string;
 readonly speciality?: string;
};

/** An HPCSA verification is current for this many months from the day it was made. */
const CREDENTIAL_VALIDITY_MONTHS = 12;

/** Whether the clinician's HPCSA verification is within its validity window on the day given. */
export function isCredentialCurrent(standing: CredentialStanding, asOf: string): boolean {
 if (!standing.hpcsaVerifiedAt) return false;
 const verified = new Date(standing.hpcsaVerifiedAt);
 const cutoff = new Date(asOf);
 cutoff.setMonth(cutoff.getMonth() - CREDENTIAL_VALIDITY_MONTHS);
 return verified >= cutoff;
}
