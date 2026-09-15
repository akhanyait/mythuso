/* Whether a responder may be online and whether a clinician may set a P2, as Verify last said.
 *
 * Movement never asks Verify. It hears person.verified, person.suspended, person.reinstated and
 * person.deactivated, which list it as a subscriber, and keeps the latest per person and role: the day the
 * verification runs to, whether it is stopped and whether it has ended. Nothing else from those events is kept —
 * not the badge, not a reason code — because none of it decides anything here, and a badge a transport engine
 * holds is a leaderboard waiting to be drawn.
 *
 * THE ABSENCE OF AN ANSWER IS NOT A YES. A person Movement has never heard verified in a role is not cleared in
 * it. packages/catalog/vetting.json holds no responder role yet, so Verify cannot verify one and, on a fresh
 * runtime, every responder is refused as not verified. That is the rule working: nobody drives a patient on the
 * strength of a role nobody has vetted.
 *
 * ORDER. An event older than the one held is ignored, so a bus that redelivers last week's verification cannot
 * restore a responder suspended this morning; and a deactivation is not undone by a reinstatement, because a
 * person no longer part of the network in a role is verified again, not reinstated.
 */
export type Heard = {
 readonly type: string; readonly version: number; readonly subjectRef: string; readonly occurredAt: string;
 readonly payload: Readonly<Record<string, unknown>>;
};
export type Standing = {
 readonly subjectRef: string; readonly role: string; readonly verifiedUntil: string | null;
 readonly stopped: boolean; readonly ended: boolean; readonly heardAt: string;
};

/** The Trust events Movement hears for standing, each a subscription in packages/catalog/events.json. */
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

/** Verified, in date and not stopped, on the day given as yyyy-mm-dd. */
export const clearedOn = (standing: Standing | undefined, today: string): boolean =>
 !!standing && !standing.stopped && !standing.ended && standing.verifiedUntil !== null && standing.verifiedUntil >= today;
