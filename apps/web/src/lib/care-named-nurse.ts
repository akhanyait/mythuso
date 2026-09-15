import care from '../../../../packages/catalog/care.json' with { type: 'json' };
import trustContract from '../../../../packages/catalog/trust.json' with { type: 'json' };
import { careContract, HEARD, OfferDesk, TrustCache, type Candidate, type NamedFallback } from '../../../../packages/engines/src/care/domain/index.ts';
import { mayTakeAVisit, rosterNurses } from './roster';
import { careSettingsNow } from './settings';

/* What Care would do with a visit a patient asked of one nurse by name, and what the patient is told.
 *
 * Access's booking step offers every nurse whose badge is current in a suburb dispatch reaches, and does not ask
 * whether her scope of practice covers the service — that is Care's gate, and Care is where it is applied. So a
 * patient can name a nurse who is cleared and nearby and still cannot be offered a wound dressing. What happens
 * then is the patient's own answer: wait, and the visit is held for her and nobody else is sent; or soonest, and
 * the next eligible nurse is offered it. This runs the same OfferDesk the Care engine binds, against the preview's
 * roster and the Care settings in force, and returns the sentence packages/catalog/care.json gives for what the
 * patient is owed — with the nurses' names filled in and nothing typed here.
 *
 * Nothing is offered to anybody and nothing is published. The desk lives for one call. It is imported only by the
 * booking flow, which arrives on a dynamic import, so a patient who never books never downloads the Care domain. */

export type NamedOutcome = {
 /** Whether the visit waits for her with nobody else asked, so a simulated acceptance would be a lie. */
 readonly waiting: boolean;
 /** The sentence the patient is told, or null when she is offered it and there is nothing to tell. */
 readonly told: string | null;
};

const verifiedTier = trustContract.tiers.find(tier => tier.needs === 'hard-gates')!.id;
const nameOf = (ref: string | null) => rosterNurses.find(n => n.id === ref)?.name ?? ref ?? '';
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);

export function namedNurseOutcome(input: {
 bookingRef: string; subjectRef: string; serviceId: string; zoneAt: { lat: number; lng: number } | null;
 scheduledFor: string; namedClinicianRef: string; namedNurseFallback: NamedFallback; now: Date;
}): NamedOutcome {
 const trust = new TrustCache(careContract.badgeTiers);
 for (const nurse of rosterNurses) trust.learn({ ...HEARD, subjectRef: nurse.id, occurredAt: input.now.toISOString(), payload: { badgeTier: verifiedTier, hardGatesPassed: mayTakeAVisit(nurse).allowed } });
 const candidates: Candidate[] = rosterNurses.map(n => ({ clinicianRef: n.id, roleId: 'nurse', scope: n.scope, base: n.zone?.at ?? null }));
 const offers = new OfferDesk({ contract: careContract, trust, candidates: () => candidates, settings: careSettingsNow });
 const appointmentRef = `preview-${input.bookingRef}`;
 offers.register({
  appointmentRef, subjectRef: input.subjectRef, serviceId: input.serviceId, zone: input.zoneAt, scheduledFor: input.scheduledFor,
  namedClinicianRef: input.namedClinicianRef, namedNurseFallback: input.namedNurseFallback, bookingRef: input.bookingRef
 });
 const made = offers.offer({ idempotencyKey: `preview-${input.bookingRef}`, appointmentRef, serviceId: input.serviceId }, input.now);
 const told = offers.toldFor(appointmentRef);
 const sentence = told ? care.offers.namedFallback.told.find(t => t.id === told.toldId)?.sentence ?? null : null;
 return {
  waiting: !made.ok && made.id === 'waiting-for-named-nurse',
  told: sentence && told ? fill(sentence, { nurse: nameOf(told.namedClinicianRef), soonest: nameOf(told.offeredToRef) }) : null
 };
}
