/* Offers: expiry, accept and decline, the cascade, and the same key twice. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { careContract } from './contract.ts';
import { addMinutes } from './clock.ts';
import { OfferDesk } from './offers.ts';
import { HEARD, TrustCache } from './trust.ts';
import type { Candidate } from './matching.ts';

const at = (id: string) => geography.zones.find(z => z.id === id)!.at;
const NOW = new Date('2026-09-14T09:00:00+02:00');

function desk(people: Candidate[], withBadges = people.map(p => p.clinicianRef)) {
 const trust = new TrustCache(careContract.badgeTiers);
 for (const ref of withBadges) trust.learn({ ...HEARD, subjectRef: ref, occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } });
 const offers = new OfferDesk({ contract: careContract, trust, candidates: () => people });
 offers.register({ appointmentRef: 'TH-9', subjectRef: 'sub-9', serviceId: 'wound', zone: at('parktown'), scheduledFor: '2026-09-14T16:00:00+02:00', previousClinicianRefs: [] });
 return offers;
}
const nurse = (clinicianRef: string, zone: string): Candidate => ({ clinicianRef, roleId: 'nurse', scope: ['Wound care'], base: at(zone) });

test('an offer goes to the first eligible nurse, expires when the contract says, and emits appointment.offered without the patient’s place', () => {
 const offers = desk([nurse('far', 'soweto'), nurse('near', 'parktown')]);
 const made = offers.offer({ idempotencyKey: 'k1', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 assert.equal(made.value.offerExpiresAt, addMinutes(NOW, careContract.offerExpiresAfterMinutes).toISOString());
 assert.deepEqual(made.events.map(e => [e.type, e.version]), [['appointment.offered', 1]]);
 assert.deepEqual(Object.keys(made.events[0]!.payload).sort(), ['appointmentRef', 'clinicianRef', 'offerExpiresAt']);
 assert.equal(made.events[0]!.payload.clinicianRef, 'near');
});

test('the same idempotency key twice is one offer and no second event', () => {
 const offers = desk([nurse('near', 'parktown')]);
 const first = offers.offer({ idempotencyKey: 'same', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 const again = offers.offer({ idempotencyKey: 'same', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(first.ok && again.ok);
 if (!first.ok || !again.ok) return;
 assert.equal(again.value.offerRef, first.value.offerRef);
 assert.equal(again.events.length, 0);
 assert.equal(offers.offersFor('TH-9').length, 1);
});

test('a decline cascades to the next eligible nurse; a nurse is never asked twice', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank'), nurse('last', 'soweto')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const declined = offers.decline({ idempotencyKey: 'd1', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, NOW);
 assert.ok(declined.ok);
 if (!declined.ok) return;
 assert.equal(declined.events.length, 0, 'decline emits nothing of its own');
 assert.ok(declined.value.next.ok);
 if (!declined.value.next.ok) return;
 assert.equal(declined.value.next.events[0]!.payload.clinicianRef, 'next');
 const second = declined.value.next.value.offerRef;
 const third = offers.decline({ idempotencyKey: 'd2', offerRef: second }, { clinicianRef: 'next' }, NOW);
 assert.ok(third.ok && third.value.next.ok);
 if (!third.ok || !third.value.next.ok) return;
 assert.equal(third.value.next.events[0]!.payload.clinicianRef, 'last');
 const out = offers.decline({ idempotencyKey: 'd3', offerRef: third.value.next.value.offerRef }, { clinicianRef: 'last' }, NOW);
 assert.ok(out.ok);
 if (out.ok) assert.deepEqual(out.value.next.ok ? null : out.value.next.id, 'no-eligible-clinician');
});

test('an unanswered offer lapses at its expiry, cannot then be accepted, and passes on', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const justBefore = addMinutes(NOW, careContract.offerExpiresAfterMinutes - 1);
 assert.equal(offers.lapse(justBefore).length, 0);
 const atExpiry = addMinutes(NOW, careContract.offerExpiresAfterMinutes);
 const late = offers.accept({ idempotencyKey: 'a1', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, atExpiry);
 assert.equal(late.ok ? null : late.id, 'offer-expired');
 assert.equal(late.ok ? null : late.status, 410);
 const lapsed = offers.lapse(atExpiry);
 assert.equal(lapsed.length, 1);
 assert.ok(lapsed[0]!.next.ok);
 if (lapsed[0]!.next.ok) assert.equal(lapsed[0]!.next.events[0]!.payload.clinicianRef, 'next');
 assert.equal(offers.offerRef(made.value.offerRef)!.state, 'lapsed');
});

test('an offer is personal: somebody else cannot accept or decline it, and an unknown one says the same', () => {
 const offers = desk([nurse('near', 'parktown')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const stranger = offers.accept({ idempotencyKey: 'x', offerRef: made.value.offerRef }, { clinicianRef: 'someone' }, NOW);
 const unknown = offers.accept({ idempotencyKey: 'y', offerRef: 'ofr-nope' }, { clinicianRef: 'near' }, NOW);
 assert.deepEqual([stranger.ok ? null : stranger.id, unknown.ok ? null : unknown.id], ['not-your-offer', 'not-your-offer']);
 const declineStranger = offers.decline({ idempotencyKey: 'z', offerRef: made.value.offerRef }, { clinicianRef: 'someone' }, NOW);
 assert.equal(declineStranger.ok ? null : declineStranger.id, 'not-your-offer');
});

test('accepting books the visit, emits appointment.booked, and holds it against a second offer', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const accepted = offers.accept({ idempotencyKey: 'a', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, NOW);
 assert.ok(accepted.ok);
 if (!accepted.ok) return;
 assert.deepEqual(accepted.events.map(e => e.type), ['appointment.booked']);
 assert.equal(offers.booking('TH-9')!.clinicianRef, 'near');
 const again = offers.offer({ idempotencyKey: 'k2', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.equal(again.ok ? null : again.id, 'no-eligible-clinician');
});

test('when every otherwise eligible nurse lacks a badge, the refusal is the Trust Score one', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')], []);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.equal(made.ok ? null : made.id, 'no-current-trust-score');
 assert.equal(made.ok ? null : made.status, 409);
 assert.equal(offers.withheldFor('TH-9').length, 2);
});
